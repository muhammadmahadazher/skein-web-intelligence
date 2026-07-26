import os
from uuid import UUID

import asyncpg
import httpx
import pytest

from skein.main import app

TEST_DATABASE_URL = os.getenv("SKEIN_TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(
    not TEST_DATABASE_URL,
    reason="SKEIN_TEST_DATABASE_URL is required for the PostgreSQL integration test",
)


async def test_create_crawl_commits_frontier_and_outbox_atomically() -> None:
    assert TEST_DATABASE_URL is not None
    previous = os.environ.get("DATABASE_URL")
    os.environ["DATABASE_URL"] = TEST_DATABASE_URL
    run_id: UUID | None = None
    connection: asyncpg.Connection | None = None
    try:
        async with app.router.lifespan_context(app):
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    "/v1/crawls",
                    json={
                        "name": "postgres integration",
                        "seed_url": "https://example.com/catalog?b=2&a=1",
                        "policy": {"max_pages": 25},
                    },
                )

        assert response.status_code == 202
        run_id = UUID(response.json()["id"])
        connection = await asyncpg.connect(TEST_DATABASE_URL)
        row = await connection.fetchrow(
            """
            SELECT
              (SELECT count(*) FROM crawl_run WHERE id = $1) AS runs,
              (SELECT count(*) FROM crawl_frontier WHERE run_id = $1) AS frontier,
              (SELECT count(*) FROM outbox_event WHERE aggregate_id = $1) AS outbox
            """,
            run_id,
        )
        assert row is not None
        assert dict(row) == {"runs": 1, "frontier": 1, "outbox": 1}
    finally:
        if connection is None:
            connection = await asyncpg.connect(TEST_DATABASE_URL)
        if run_id is not None:
            await connection.execute("DELETE FROM outbox_event WHERE aggregate_id = $1", run_id)
            await connection.execute("DELETE FROM crawl_run WHERE id = $1", run_id)
        await connection.close()
        if previous is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = previous
