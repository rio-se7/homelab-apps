//! HTTP API: position evaluation and ranked-move endpoints.
//!
//! Stateless by design -- every request reconstructs the `Board` from its
//! `moves` query parameter, so there's no shared app state to wire through
//! axum's `State` extractor.

use axum::extract::Query;
use axum::http::StatusCode;
use axum::response::Json;
use axum::routing::get;
use axum::Router;
use serde::{Deserialize, Serialize};

use crate::board::Board;
use crate::eval::evaluate;
use crate::renju::{evaluate_move, RenjuResult};
use crate::types::{pos_to_str, str_to_pos, Color, Pos};
use crate::vcf::{find_vcf, nearby_empty_cells};

/// Depth budget for the VCF search backing both endpoints. Matches the
/// plan's "8〜10 程度" guidance; accuracy over performance for P0.
const VCF_DEPTH: u32 = 10;

pub fn router() -> Router {
    Router::new()
        .route("/api/eval", get(get_eval))
        .route("/api/moves", get(get_moves))
}

type ApiError = (StatusCode, String);

fn parse_moves(raw: &str) -> Result<Vec<Pos>, String> {
    let raw = raw.trim();
    if raw.is_empty() {
        return Ok(Vec::new());
    }
    raw.split(',')
        .map(|s| str_to_pos(s.trim()).ok_or_else(|| format!("invalid move: {s}")))
        .collect()
}

fn board_from_query(raw: &str) -> Result<Board, ApiError> {
    let moves = parse_moves(raw).map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    Board::from_moves(&moves).map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))
}

#[derive(Debug, Deserialize)]
pub struct EvalQuery {
    #[serde(default)]
    moves: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EvalResponse {
    forced_win: bool,
    winner: Option<Color>,
    dtm: Option<u32>,
    eval_score: i32,
}

async fn get_eval(Query(q): Query<EvalQuery>) -> Result<Json<EvalResponse>, ApiError> {
    let board = board_from_query(&q.moves)?;
    let color = board.side_to_move();

    let vcf = find_vcf(&board, color, VCF_DEPTH);
    let (forced_win, winner, dtm) = match &vcf {
        // dtm = attacker-move-count * 2 - 1: total plies in the forced line
        // (the defender never gets a "last" move after the attacker's
        // final, winning move).
        Some(v) => (true, Some(color), Some(v.depth * 2 - 1)),
        None => (false, None, None),
    };
    let eval_score = evaluate(&board, color);

    Ok(Json(EvalResponse {
        forced_win,
        winner,
        dtm,
        eval_score,
    }))
}

#[derive(Debug, Deserialize)]
pub struct MovesQuery {
    #[serde(default)]
    moves: String,
    #[serde(default = "default_limit")]
    limit: usize,
}

fn default_limit() -> usize {
    10
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RankedMove {
    pos: String,
    forced_win: bool,
    dtm: Option<u32>,
    eval_score: i32,
}

async fn get_moves(Query(q): Query<MovesQuery>) -> Result<Json<Vec<RankedMove>>, ApiError> {
    let board = board_from_query(&q.moves)?;
    let color = board.side_to_move();

    let vcf = find_vcf(&board, color, VCF_DEPTH);
    let forced_first = vcf.as_ref().and_then(|v| v.winning_moves.first().copied());

    let mut candidates = nearby_empty_cells(&board);
    if candidates.is_empty() {
        candidates.push(str_to_pos("h8").expect("h8 is always in range"));
    }
    if let Some(fw) = forced_first {
        if !candidates.contains(&fw) {
            candidates.push(fw);
        }
    }

    let mut ranked: Vec<RankedMove> = candidates
        .into_iter()
        .filter(|&p| {
            color != Color::Black
                || !matches!(
                    evaluate_move(&board, p, Color::Black),
                    RenjuResult::ForbiddenOverline
                        | RenjuResult::ForbiddenThreeThree
                        | RenjuResult::ForbiddenFourFour
                )
        })
        .map(|p| {
            let is_forced = Some(p) == forced_first;
            let dtm = if is_forced {
                vcf.as_ref().map(|v| v.depth * 2 - 1)
            } else {
                None
            };
            let mut after = board.clone();
            after.force_set(p, color);
            let eval_score = if is_forced {
                i32::MAX
            } else {
                evaluate(&after, color)
            };
            RankedMove {
                pos: pos_to_str(p),
                forced_win: is_forced,
                dtm,
                eval_score,
            }
        })
        .collect();

    // Sort: forced win first, then shortest dtm, then highest eval score.
    ranked.sort_by(|a, b| {
        b.forced_win
            .cmp(&a.forced_win)
            .then(a.dtm.unwrap_or(u32::MAX).cmp(&b.dtm.unwrap_or(u32::MAX)))
            .then(b.eval_score.cmp(&a.eval_score))
    });
    ranked.truncate(q.limit.max(1));

    Ok(Json(ranked))
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::{to_bytes, Body};
    use axum::http::Request;
    use tower::ServiceExt;

    #[tokio::test]
    async fn eval_endpoint_returns_valid_json() {
        let app = router();
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/eval?moves=h8")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert!(json.get("forcedWin").is_some());
        assert!(json.get("evalScore").is_some());
        assert!(json.get("winner").is_some()); // present as JSON null, not absent
        assert!(json.get("dtm").is_some());
    }

    #[tokio::test]
    async fn eval_endpoint_rejects_invalid_move() {
        let app = router();
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/eval?moves=zz99")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn moves_endpoint_returns_ranked_list() {
        let app = router();
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/moves?moves=h8&limit=5")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        let arr = json.as_array().expect("expected a JSON array");
        assert!(!arr.is_empty());
        assert!(arr[0].get("pos").is_some());
    }
}
