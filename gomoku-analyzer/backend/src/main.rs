//! gomoku-analyzer HTTP server entry point.

use std::net::SocketAddr;

use clap::Parser;
use gomoku_analyzer::api;
use tower_http::cors::CorsLayer;
use tracing_subscriber::EnvFilter;

/// Renju (gomoku) position analyzer API.
#[derive(Debug, Parser)]
#[command(name = "gomoku-analyzer")]
struct Args {
    /// Port to listen on. Overridden by the `PORT` env var if set.
    // Default 8091: dobutsu-record uses 8090, dobutsu-analyzer's backend
    // uses its own distinct port -- see the batch report for the checked
    // values.
    #[arg(long, default_value_t = 8091)]
    port: u16,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")))
        .init();

    let args = Args::parse();
    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(args.port);

    let app = api::router().layer(CorsLayer::permissive());

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!("gomoku-analyzer listening on {addr}");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}
