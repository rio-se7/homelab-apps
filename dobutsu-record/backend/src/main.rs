mod api;
mod db;

use std::path::PathBuf;
use std::sync::Arc;

use axum::{routing::get, Router};
use clap::Parser;
use tower_http::cors::CorsLayer;
use tracing::info;

#[derive(Parser)]
#[command(name = "dobutsu-record", about = "どうぶつしょうぎ戦績トラッカー API サーバー")]
struct Args {
    /// SQLite データベースファイルのパス
    #[arg(long, default_value = "data/record.db")]
    db: PathBuf,

    #[arg(long, default_value_t = 8090)]
    port: u16,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "dobutsu_record=info".into()),
        )
        .init();

    let args = Args::parse();

    if let Some(parent) = args.db.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let database = db::Db::open(&args.db)?;
    info!("database ready at {}", args.db.display());

    let state: api::AppState = Arc::new(database);

    let app = Router::new()
        .route("/health", get(api::health))
        .route("/api/members", get(api::list_members).post(api::create_member))
        .route(
            "/api/members/{id}",
            axum::routing::patch(api::update_member).delete(api::delete_member),
        )
        .route("/api/matches", get(api::list_matches).post(api::create_match))
        .route(
            "/api/matches/{id}",
            axum::routing::patch(api::update_match).delete(api::delete_match),
        )
        .layer(CorsLayer::permissive())
        .with_state(state);

    let addr = format!("0.0.0.0:{}", args.port);
    info!("listening on {}", addr);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}
