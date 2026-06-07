use std::sync::Arc;

use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};

use crate::board::Board;
use crate::table::TableBase;
use crate::types::{MoveEval, WdlResult};

pub type AppState = Arc<Option<TableBase>>;

#[derive(Deserialize)]
pub struct PosQuery {
    pos: String,
}

#[derive(Serialize)]
pub struct EvalResponse {
    result: WdlResult,
    dtm: u32,
}

#[derive(Serialize)]
pub struct MovesResponse {
    moves: Vec<MoveEval>,
}

fn parse_board(pos: &str) -> Result<Board, StatusCode> {
    let n = u64::from_str_radix(pos.trim_start_matches("0x"), 16)
        .map_err(|_| StatusCode::BAD_REQUEST)?;
    Ok(Board(n))
}

pub async fn health() -> impl IntoResponse {
    StatusCode::OK
}

pub async fn eval(
    State(state): State<AppState>,
    Query(q): Query<PosQuery>,
) -> impl IntoResponse {
    let tb = match state.as_ref() {
        Some(tb) => tb,
        None => return (StatusCode::SERVICE_UNAVAILABLE, Json(serde_json::json!({"error": "table not loaded"}))).into_response(),
    };

    let board = match parse_board(&q.pos) {
        Ok(b) => b,
        Err(s) => return (s, Json(serde_json::json!({"error": "invalid pos"}))).into_response(),
    };

    match tb.lookup(board) {
        Ok(entry) => Json(EvalResponse { result: entry.result, dtm: entry.dtm }).into_response(),
        Err(e) => (StatusCode::NOT_FOUND, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn moves(
    State(state): State<AppState>,
    Query(q): Query<PosQuery>,
) -> impl IntoResponse {
    let tb = match state.as_ref() {
        Some(tb) => tb,
        None => return (StatusCode::SERVICE_UNAVAILABLE, Json(serde_json::json!({"error": "table not loaded"}))).into_response(),
    };

    let board = match parse_board(&q.pos) {
        Ok(b) => b,
        Err(s) => return (s, Json(serde_json::json!({"error": "invalid pos"}))).into_response(),
    };

    let legal = board.legal_moves();
    let mut move_evals = Vec::with_capacity(legal.len());

    for (next_board, mv) in legal {
        match tb.lookup(next_board) {
            Ok(entry) => {
                // 相手の視点の評価を反転して返す
                let result = match entry.result {
                    WdlResult::Win => WdlResult::Lose,
                    WdlResult::Lose => WdlResult::Win,
                    WdlResult::Draw => WdlResult::Draw,
                };
                move_evals.push(MoveEval { mv, result, dtm: entry.dtm });
            }
            Err(_) => {
                // テーブルに見つからない局面はスキップ
            }
        }
    }

    // 最善手が先頭になるようにソート: 勝ち(dtm小) > 引き分け > 負け(dtm大)
    move_evals.sort_by(|a, b| {
        use std::cmp::Ordering;
        match (a.result, b.result) {
            (WdlResult::Win, WdlResult::Win) => a.dtm.cmp(&b.dtm),
            (WdlResult::Win, _) => Ordering::Less,
            (_, WdlResult::Win) => Ordering::Greater,
            (WdlResult::Draw, WdlResult::Draw) => Ordering::Equal,
            (WdlResult::Draw, _) => Ordering::Less,
            (_, WdlResult::Draw) => Ordering::Greater,
            (WdlResult::Lose, WdlResult::Lose) => b.dtm.cmp(&a.dtm),
        }
    });

    Json(MovesResponse { moves: move_evals }).into_response()
}
