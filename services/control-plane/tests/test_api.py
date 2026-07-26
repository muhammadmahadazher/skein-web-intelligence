import asyncio

import httpx
import pytest

from skein.crawler import CrawlService
from skein.main import app


async def public_resolver(_host: str, _port: int) -> tuple[str, ...]:
    return ("93.184.216.34",)


def handler(request: httpx.Request) -> httpx.Response:
    if request.url.path == "/robots.txt":
        return httpx.Response(200, text="User-agent: *\nAllow: /")
    return httpx.Response(
        200,
        text="<html><head><title>Design research</title></head><body>Evidence</body></html>",
        headers={"content-type": "text/html"},
    )


@pytest.fixture
async def client():
    app.state.crawler_factory = lambda: CrawlService(
        transport=httpx.MockTransport(handler),
        resolver=public_resolver,
    )
    async with app.router.lifespan_context(app):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as session:
            yield session
    del app.state.crawler_factory


async def test_health_and_readiness_contracts(client: httpx.AsyncClient) -> None:
    health = await client.get("/healthz")
    ready = await client.get("/readyz")

    assert health.status_code == 200
    assert health.json()["checks"] == {"process": "ok"}
    assert ready.status_code == 200
    assert ready.json()["checks"]["database"] == "ok"


async def test_rejects_private_seed_before_repository_write(client: httpx.AsyncClient) -> None:
    response = await client.post(
        "/v1/crawls",
        json={
            "name": "unsafe",
            "seed_url": "http://127.0.0.1/admin",
            "policy": {},
        },
    )

    assert response.status_code == 422
    assert "non-public" in response.json()["detail"]


async def test_accepts_canonical_public_seed_and_exposes_lifecycle(
    client: httpx.AsyncClient,
) -> None:
    response = await client.post(
        "/v1/crawls",
        json={
            "name": "design research",
            "seed_url": "HTTPS://Design.Google:443/research/../?utm_source=demo&b=2&a=1#top",
            "policy": {
                "max_depth": 3,
                "max_pages": 5,
                "max_body_bytes": 2_000_000,
                "host_requests_per_second": 100,
                "obey_robots": True,
                "render_javascript": "adaptive",
            },
        },
    )

    assert response.status_code == 202
    payload = response.json()
    assert payload["canonical_seed_url"] == "https://design.google/?a=1&b=2"
    assert payload["state"] == "queued"
    assert payload["status_url"].endswith(payload["id"])

    for _ in range(100):
        status_response = await client.get(payload["status_url"])
        snapshot = status_response.json()
        if snapshot["state"] in {"complete", "failed", "cancelled"}:
            break
        await asyncio.sleep(0.01)

    assert snapshot["state"] == "complete"
    assert snapshot["progress"] == 100
    assert snapshot["records"] == 1
    results = await client.get(payload["results_url"])
    assert results.status_code == 200
    assert results.json()["results"][0]["title"] == "Design research"


async def test_lifecycle_controls_and_missing_run_contract(client: httpx.AsyncClient) -> None:
    missing = "00000000-0000-4000-8000-000000000123"
    for path in (
        f"/v1/crawls/{missing}",
        f"/v1/crawls/{missing}/pause",
        f"/v1/crawls/{missing}/resume",
        f"/v1/crawls/{missing}/cancel",
    ):
        response = await (client.get(path) if path.endswith(missing) else client.post(path))
        assert response.status_code == 404

    listing = await client.get("/v1/crawls")
    assert listing.status_code == 200
    assert isinstance(listing.json(), list)
