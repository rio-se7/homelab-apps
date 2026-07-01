use std::sync::Arc;

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use rusqlite::params;
use serde::{Deserialize, Serialize};

use crate::db::Db;

pub type AppState = Arc<Db>;

// ---- models ----

#[derive(Serialize)]
pub struct Member {
    id: i64,
    name: String,
    active: bool,
    created_at: String,
}

#[derive(Serialize)]
pub struct Match {
    id: i64,
    played_at: String,
    black_id: i64,
    white_id: i64,
    result: String,
    sides_known: bool,
    note: Option<String>,
}

// ---- request bodies ----

#[derive(Deserialize)]
pub struct NewMember {
    name: String,
}

#[derive(Deserialize)]
pub struct UpdateMember {
    name: Option<String>,
    active: Option<bool>,
}

#[derive(Deserialize)]
pub struct NewMatch {
    /// ISO8601; if omitted, the DB default (now) is used.
    played_at: Option<String>,
    black_id: i64,
    white_id: i64,
    result: String, // black_win | white_win | draw
    /// Whether black_id/white_id reflect the real 先手/後手. Defaults to true.
    #[serde(default = "default_true")]
    sides_known: bool,
    note: Option<String>,
}

fn default_true() -> bool {
    true
}

// ---- helpers ----

fn db_err(e: rusqlite::Error) -> (StatusCode, Json<serde_json::Value>) {
    tracing::error!("db error: {e}");
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(serde_json::json!({ "error": e.to_string() })),
    )
}

fn bad(msg: &str) -> (StatusCode, Json<serde_json::Value>) {
    (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": msg })))
}

pub async fn health() -> impl IntoResponse {
    StatusCode::OK
}

// ---- members ----

pub async fn list_members(State(db): State<AppState>) -> impl IntoResponse {
    let conn = db.conn.lock().unwrap();
    let mut stmt = match conn
        .prepare("SELECT id, name, active, created_at FROM members ORDER BY id")
    {
        Ok(s) => s,
        Err(e) => return db_err(e).into_response(),
    };
    let rows = stmt.query_map([], |r| {
        Ok(Member {
            id: r.get(0)?,
            name: r.get(1)?,
            active: r.get::<_, i64>(2)? != 0,
            created_at: r.get(3)?,
        })
    });
    match rows {
        Ok(iter) => {
            let members: Result<Vec<_>, _> = iter.collect();
            match members {
                Ok(m) => Json(m).into_response(),
                Err(e) => db_err(e).into_response(),
            }
        }
        Err(e) => db_err(e).into_response(),
    }
}

pub async fn create_member(
    State(db): State<AppState>,
    Json(body): Json<NewMember>,
) -> impl IntoResponse {
    let name = body.name.trim();
    if name.is_empty() {
        return bad("name is required").into_response();
    }
    let conn = db.conn.lock().unwrap();
    match conn.execute("INSERT INTO members (name) VALUES (?1)", params![name]) {
        Ok(_) => {
            let id = conn.last_insert_rowid();
            (
                StatusCode::CREATED,
                Json(serde_json::json!({ "id": id, "name": name, "active": true })),
            )
                .into_response()
        }
        Err(e) => db_err(e).into_response(),
    }
}

pub async fn update_member(
    State(db): State<AppState>,
    Path(id): Path<i64>,
    Json(body): Json<UpdateMember>,
) -> impl IntoResponse {
    let conn = db.conn.lock().unwrap();
    if let Some(name) = body.name.as_deref() {
        let name = name.trim();
        if name.is_empty() {
            return bad("name cannot be empty").into_response();
        }
        if let Err(e) = conn.execute("UPDATE members SET name = ?1 WHERE id = ?2", params![name, id]) {
            return db_err(e).into_response();
        }
    }
    if let Some(active) = body.active {
        if let Err(e) =
            conn.execute("UPDATE members SET active = ?1 WHERE id = ?2", params![active as i64, id])
        {
            return db_err(e).into_response();
        }
    }
    StatusCode::NO_CONTENT.into_response()
}

#[derive(Deserialize)]
pub struct DeleteMemberParams {
    /// When true, also delete every match this member played.
    #[serde(default)]
    force: bool,
}

pub async fn delete_member(
    State(db): State<AppState>,
    Path(id): Path<i64>,
    Query(params): Query<DeleteMemberParams>,
) -> impl IntoResponse {
    let conn = db.conn.lock().unwrap();
    let used: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM matches WHERE black_id = ?1 OR white_id = ?1",
            params![id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    // Without ?force, refuse to hard-delete a member that appears in any match.
    if used > 0 && !params.force {
        return (
            StatusCode::CONFLICT,
            Json(serde_json::json!({
                "error": "member has matches; pass ?force=true to delete them too, or archive instead",
                "matches": used,
            })),
        )
            .into_response();
    }
    if params.force {
        if let Err(e) = conn.execute(
            "DELETE FROM matches WHERE black_id = ?1 OR white_id = ?1",
            params![id],
        ) {
            return db_err(e).into_response();
        }
    }
    match conn.execute("DELETE FROM members WHERE id = ?1", params![id]) {
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => db_err(e).into_response(),
    }
}

// ---- matches ----

pub async fn list_matches(State(db): State<AppState>) -> impl IntoResponse {
    let conn = db.conn.lock().unwrap();
    let mut stmt = match conn.prepare(
        "SELECT id, played_at, black_id, white_id, result, sides_known, note \
         FROM matches ORDER BY played_at DESC, id DESC",
    ) {
        Ok(s) => s,
        Err(e) => return db_err(e).into_response(),
    };
    let rows = stmt.query_map([], |r| {
        Ok(Match {
            id: r.get(0)?,
            played_at: r.get(1)?,
            black_id: r.get(2)?,
            white_id: r.get(3)?,
            result: r.get(4)?,
            sides_known: r.get::<_, i64>(5)? != 0,
            note: r.get(6)?,
        })
    });
    match rows {
        Ok(iter) => {
            let matches: Result<Vec<_>, _> = iter.collect();
            match matches {
                Ok(m) => Json(m).into_response(),
                Err(e) => db_err(e).into_response(),
            }
        }
        Err(e) => db_err(e).into_response(),
    }
}

fn valid_result(s: &str) -> bool {
    matches!(s, "black_win" | "white_win" | "draw")
}

pub async fn create_match(
    State(db): State<AppState>,
    Json(body): Json<NewMatch>,
) -> impl IntoResponse {
    if !valid_result(&body.result) {
        return bad("result must be black_win, white_win or draw").into_response();
    }
    if body.black_id == body.white_id {
        return bad("black and white must be different members").into_response();
    }
    let conn = db.conn.lock().unwrap();
    let note = body.note.as_deref().map(str::trim).filter(|s| !s.is_empty());
    let sides = body.sides_known as i64;
    let res = match body.played_at.as_deref() {
        Some(at) => conn.execute(
            "INSERT INTO matches (played_at, black_id, white_id, result, sides_known, note) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![at, body.black_id, body.white_id, body.result, sides, note],
        ),
        None => conn.execute(
            "INSERT INTO matches (black_id, white_id, result, sides_known, note) \
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![body.black_id, body.white_id, body.result, sides, note],
        ),
    };
    match res {
        Ok(_) => (
            StatusCode::CREATED,
            Json(serde_json::json!({ "id": conn.last_insert_rowid() })),
        )
            .into_response(),
        Err(e) => db_err(e).into_response(),
    }
}

#[derive(Deserialize)]
pub struct UpdateMatch {
    black_id: Option<i64>,
    white_id: Option<i64>,
    result: Option<String>,
    sides_known: Option<bool>,
    note: Option<String>,
}

pub async fn update_match(
    State(db): State<AppState>,
    Path(id): Path<i64>,
    Json(body): Json<UpdateMatch>,
) -> impl IntoResponse {
    if let Some(r) = body.result.as_deref() {
        if !valid_result(r) {
            return bad("result must be black_win, white_win or draw").into_response();
        }
    }
    if let (Some(b), Some(w)) = (body.black_id, body.white_id) {
        if b == w {
            return bad("black and white must be different members").into_response();
        }
    }

    let conn = db.conn.lock().unwrap();
    let apply = |sql: &str, p: &[&dyn rusqlite::ToSql]| conn.execute(sql, p);
    let mut err = None;
    if let Some(b) = body.black_id {
        err = err.or(apply("UPDATE matches SET black_id = ?1 WHERE id = ?2", &[&b, &id]).err());
    }
    if let Some(w) = body.white_id {
        err = err.or(apply("UPDATE matches SET white_id = ?1 WHERE id = ?2", &[&w, &id]).err());
    }
    if let Some(r) = body.result.as_deref() {
        err = err.or(apply("UPDATE matches SET result = ?1 WHERE id = ?2", &[&r, &id]).err());
    }
    if let Some(s) = body.sides_known {
        err = err.or(apply("UPDATE matches SET sides_known = ?1 WHERE id = ?2", &[&(s as i64), &id]).err());
    }
    if let Some(n) = body.note.as_deref() {
        let n = n.trim();
        let val: Option<&str> = if n.is_empty() { None } else { Some(n) };
        err = err.or(apply("UPDATE matches SET note = ?1 WHERE id = ?2", &[&val, &id]).err());
    }

    match err {
        Some(e) => db_err(e).into_response(),
        None => StatusCode::NO_CONTENT.into_response(),
    }
}

pub async fn delete_match(
    State(db): State<AppState>,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    let conn = db.conn.lock().unwrap();
    match conn.execute("DELETE FROM matches WHERE id = ?1", params![id]) {
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => db_err(e).into_response(),
    }
}
