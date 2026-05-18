mod api;
mod board;
mod table;
mod types;

use std::path::PathBuf;
use std::sync::Arc;

use axum::{routing::get, Router};
use clap::Parser;
use tower_http::cors::CorsLayer;
use tracing::info;

#[derive(Parser)]
#[command(name = "dobutsu-analyzer", about = "どうぶつしょうぎ解析APIサーバー")]
struct Args {
    /// 解析テーブルファイルのディレクトリ (allstates.dat, winLoss.dat, winLossCount.dat)
    #[arg(long, default_value = "./data")]
    data_dir: PathBuf,

    #[arg(long, default_value_t = 8080)]
    port: u16,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "dobutsu_analyzer=info".into()),
        )
        .init();

    let args = Args::parse();

    let tb = match table::TableBase::open(&args.data_dir) {
        Ok(tb) => {
            info!("table loaded from {}", args.data_dir.display());
            Some(tb)
        }
        Err(e) => {
            tracing::warn!("table not available ({}): /api/* will return 503", e);
            None
        }
    };

    let state: api::AppState = Arc::new(tb);

    let app = Router::new()
        .route("/health", get(api::health))
        .route("/api/eval", get(api::eval))
        .route("/api/moves", get(api::moves))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let addr = format!("0.0.0.0:{}", args.port);
    info!("listening on {}", addr);
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
