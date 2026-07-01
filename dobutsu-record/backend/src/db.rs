use std::path::Path;
use std::sync::Mutex;

use anyhow::Result;
use rusqlite::Connection;

/// Thread-safe handle around a single SQLite connection.
/// Traffic is local single-user, so a Mutex<Connection> is plenty.
pub struct Db {
    pub conn: Mutex<Connection>,
}

impl Db {
    pub fn open(path: &Path) -> Result<Self> {
        let conn = Connection::open(path)?;
        conn.pragma_update(None, "foreign_keys", true)?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        Self::migrate(&conn)?;
        Ok(Self { conn: Mutex::new(conn) })
    }

    fn migrate(conn: &Connection) -> Result<()> {
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS members (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                name       TEXT    NOT NULL,
                active     INTEGER NOT NULL DEFAULT 1,
                created_at TEXT    NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS matches (
                id          INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                played_at   TEXT    NOT NULL DEFAULT (datetime('now')),
                black_id    INTEGER NOT NULL REFERENCES members(id),
                white_id    INTEGER NOT NULL REFERENCES members(id),
                result      TEXT    NOT NULL CHECK(result IN ('black_win','white_win','draw')),
                -- 1 = black_id/white_id are the real 先手/後手; 0 = sides unknown,
                -- the two ids are just the participants (order carries no meaning).
                sides_known INTEGER NOT NULL DEFAULT 1,
                note        TEXT,
                created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
            );

            CREATE INDEX IF NOT EXISTS idx_matches_played_at ON matches(played_at);
            "#,
        )?;

        // Add sides_known to databases created before the column existed.
        add_column_if_missing(conn, "matches", "sides_known", "INTEGER NOT NULL DEFAULT 1")?;
        Ok(())
    }
}

/// Idempotent `ALTER TABLE ADD COLUMN` — SQLite has no `ADD COLUMN IF NOT EXISTS`.
fn add_column_if_missing(
    conn: &Connection,
    table: &str,
    column: &str,
    decl: &str,
) -> Result<()> {
    let exists: bool = conn
        .prepare(&format!("PRAGMA table_info({table})"))?
        .query_map([], |r| r.get::<_, String>(1))?
        .filter_map(|c| c.ok())
        .any(|c| c == column);
    if !exists {
        conn.execute_batch(&format!("ALTER TABLE {table} ADD COLUMN {column} {decl};"))?;
    }
    Ok(())
}
