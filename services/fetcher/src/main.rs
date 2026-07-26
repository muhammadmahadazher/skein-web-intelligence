use anyhow::{Context, Result};
use reqwest::redirect::Policy;
use sqlx::postgres::PgPoolOptions;
use std::{env, time::Duration};
use tracing::{info, warn};

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .json()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "skein_fetcher=info".into()),
        )
        .init();

    let database_url = env::var("DATABASE_URL").context("DATABASE_URL must be set")?;
    let worker_id =
        env::var("WORKER_ID").unwrap_or_else(|_| format!("fetcher-{}", uuid::Uuid::new_v4()));
    let pool = PgPoolOptions::new()
        .min_connections(1)
        .max_connections(4)
        .acquire_timeout(Duration::from_secs(5))
        .connect(&database_url)
        .await
        .context("connect to PostgreSQL")?;
    let _client = reqwest::Client::builder()
        .redirect(Policy::none())
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(20))
        .user_agent("SkeinBot/0.1 (+https://skein.example/bot)")
        .build()
        .context("build HTTP client")?;

    info!(%worker_id, "fetcher ready");
    let mut shutdown = std::pin::pin!(tokio::signal::ctrl_c());
    loop {
        tokio::select! {
            _ = &mut shutdown => {
                info!(%worker_id, "shutdown requested");
                break;
            }
            _ = tokio::time::sleep(Duration::from_millis(250)) => {
                // Claiming, robots/politeness, DNS revalidation, and fetch/commit are
                // split into independently testable adapters in the next milestone.
                if let Err(error) = sqlx::query_scalar::<_, bool>("SELECT TRUE")
                    .fetch_one(&pool)
                    .await
                {
                    warn!(%error, "readiness probe failed");
                }
            }
        }
    }
    pool.close().await;
    Ok(())
}
