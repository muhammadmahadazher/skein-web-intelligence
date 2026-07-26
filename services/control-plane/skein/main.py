from __future__ import annotations

import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated, cast
from uuid import UUID

import asyncpg
from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware

from skein import __version__
from skein.crawler import CrawlService
from skein.domain import CrawlPolicy, UrlRejected, canonicalize_url
from skein.models import CrawlAccepted, CrawlCreate, Health
from skein.repository import InMemoryRunRepository, PostgresRunRepository, RunRepository


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    database_url = os.getenv("DATABASE_URL")
    if database_url:
        workspace_id = str(
            UUID(os.getenv("SKEIN_WORKSPACE_ID", "00000000-0000-4000-8000-000000000099"))
        )
        pool = await asyncpg.create_pool(
            database_url,
            min_size=2,
            max_size=20,
            command_timeout=10,
            server_settings={
                "application_name": "skein-control-plane",
                "skein.workspace_id": workspace_id,
            },
        )
        app.state.pool = pool
        app.state.repository = PostgresRunRepository(pool)
    else:
        app.state.pool = None
        app.state.repository = InMemoryRunRepository()
    crawler_factory = getattr(app.state, "crawler_factory", CrawlService)
    app.state.crawler = crawler_factory()
    yield
    await app.state.crawler.close()
    if app.state.pool is not None:
        await app.state.pool.close()


app = FastAPI(
    title="Skein Control Plane",
    version=__version__,
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


def repository(request: Request) -> RunRepository:
    return cast(RunRepository, request.app.state.repository)


Repository = Annotated[RunRepository, Depends(repository)]


def crawler(request: Request) -> CrawlService:
    return cast(CrawlService, request.app.state.crawler)


Crawler = Annotated[CrawlService, Depends(crawler)]


@app.get("/healthz", response_model=Health, tags=["system"])
async def healthz() -> Health:
    return Health(
        status="ok",
        service="control-plane",
        version=__version__,
        checks={"process": "ok"},
    )


@app.get("/readyz", response_model=Health, tags=["system"])
async def readyz(repo: Repository) -> Health:
    if not await repo.ready():
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "database is not ready")
    return Health(
        status="ok",
        service="control-plane",
        version=__version__,
        checks={"database": "ok", "migrations": "current"},
    )


@app.post(
    "/v1/crawls",
    response_model=CrawlAccepted,
    status_code=status.HTTP_202_ACCEPTED,
    tags=["crawls"],
)
async def create_crawl(
    payload: CrawlCreate, repo: Repository, crawler_service: Crawler
) -> CrawlAccepted:
    try:
        canonical = canonicalize_url(str(payload.seed_url))
        policy = CrawlPolicy(
            max_depth=payload.policy.max_depth,
            max_pages=payload.policy.max_pages,
            max_body_bytes=payload.policy.max_body_bytes,
            host_requests_per_second=payload.policy.host_requests_per_second,
            obey_robots=payload.policy.obey_robots,
        )
    except (UrlRejected, ValueError) as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc
    accepted = await repo.create_run(
        name=payload.name,
        canonical_seed_url=canonical.value,
        url_hash=canonical.fingerprint,
        policy={
            "max_depth": policy.max_depth,
            "max_pages": policy.max_pages,
            "max_body_bytes": policy.max_body_bytes,
            "host_requests_per_second": policy.host_requests_per_second,
            "obey_robots": policy.obey_robots,
            "render_javascript": payload.policy.render_javascript,
        },
    )
    crawler_service.start(accepted.id, accepted.canonical_seed_url, policy)
    return CrawlAccepted(
        id=accepted.id,
        canonical_seed_url=accepted.canonical_seed_url,
        state="queued",
        created_at=accepted.created_at,
        status_url=f"/v1/crawls/{accepted.id}",
        results_url=f"/v1/crawls/{accepted.id}/results",
    )


@app.get("/v1/crawls", tags=["crawls"])
async def list_crawls(crawler_service: Crawler) -> list[dict[str, object]]:
    return crawler_service.list()


def crawl_or_404(crawler_service: CrawlService, crawl_id: UUID) -> dict[str, object]:
    snapshot = crawler_service.get(crawl_id)
    if snapshot is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "crawl was not found")
    return snapshot


@app.get("/v1/crawls/{crawl_id}", tags=["crawls"])
async def get_crawl(crawl_id: UUID, crawler_service: Crawler) -> dict[str, object]:
    return crawl_or_404(crawler_service, crawl_id)


@app.get("/v1/crawls/{crawl_id}/results", tags=["crawls"])
async def get_crawl_results(crawl_id: UUID, crawler_service: Crawler) -> dict[str, object]:
    return crawl_or_404(crawler_service, crawl_id)


@app.post("/v1/crawls/{crawl_id}/pause", tags=["crawls"])
async def pause_crawl(crawl_id: UUID, crawler_service: Crawler) -> dict[str, object]:
    snapshot = crawler_service.pause(crawl_id)
    if snapshot is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "crawl was not found")
    return snapshot


@app.post("/v1/crawls/{crawl_id}/resume", tags=["crawls"])
async def resume_crawl(crawl_id: UUID, crawler_service: Crawler) -> dict[str, object]:
    snapshot = crawler_service.resume(crawl_id)
    if snapshot is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "crawl was not found")
    return snapshot


@app.post("/v1/crawls/{crawl_id}/cancel", tags=["crawls"])
async def cancel_crawl(crawl_id: UUID, crawler_service: Crawler) -> dict[str, object]:
    snapshot = crawler_service.cancel(crawl_id)
    if snapshot is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "crawl was not found")
    return snapshot
