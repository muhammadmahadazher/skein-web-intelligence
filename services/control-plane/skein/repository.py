from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Protocol
from uuid import UUID, uuid4

import asyncpg


@dataclass(frozen=True, slots=True)
class AcceptedRun:
    id: UUID
    canonical_seed_url: str
    created_at: datetime


class RunRepository(Protocol):
    async def create_run(
        self, *, name: str, canonical_seed_url: str, url_hash: bytes, policy: dict[str, Any]
    ) -> AcceptedRun: ...

    async def ready(self) -> bool: ...


class InMemoryRunRepository:
    """Deterministic local adapter. Never used as a production source of truth."""

    def __init__(self) -> None:
        self.runs: dict[UUID, AcceptedRun] = {}

    async def create_run(
        self, *, name: str, canonical_seed_url: str, url_hash: bytes, policy: dict[str, Any]
    ) -> AcceptedRun:
        del name, url_hash, policy
        run = AcceptedRun(uuid4(), canonical_seed_url, datetime.now(UTC))
        self.runs[run.id] = run
        return run

    async def ready(self) -> bool:
        return True


class PostgresRunRepository:
    def __init__(self, pool: asyncpg.Pool) -> None:
        self.pool = pool

    async def create_run(
        self, *, name: str, canonical_seed_url: str, url_hash: bytes, policy: dict[str, Any]
    ) -> AcceptedRun:
        run_id = uuid4()
        created_at = datetime.now(UTC)
        async with self.pool.acquire() as connection, connection.transaction():
            await connection.execute(
                """
                INSERT INTO crawl_run (id, workspace_id, name, seed_url, state, policy, created_at)
                VALUES ($1, current_setting('skein.workspace_id')::uuid, $2, $3, 'queued',
                        $4::jsonb, $5)
                """,
                run_id,
                name,
                canonical_seed_url,
                json.dumps(policy),
                created_at,
            )
            await connection.execute(
                """
                INSERT INTO crawl_frontier
                    (run_id, canonical_url, url_hash, host, depth, priority, state, next_attempt_at)
                VALUES ($1, $2, $3, $4, 0, 1000, 'ready', $5)
                ON CONFLICT (run_id, url_hash) DO NOTHING
                """,
                run_id,
                canonical_seed_url,
                url_hash,
                canonical_seed_url.split("/")[2],
                created_at,
            )
            await connection.execute(
                """
                INSERT INTO outbox_event (aggregate_type, aggregate_id, event_type, payload)
                VALUES ('crawl_run', $1::uuid, 'crawl.queued',
                        jsonb_build_object('run_id', $1::uuid))
                """,
                run_id,
            )
        return AcceptedRun(run_id, canonical_seed_url, created_at)

    async def ready(self) -> bool:
        return bool(await self.pool.fetchval("SELECT TRUE"))


CLAIM_FRONTIER_SQL = """
WITH claimable AS (
    SELECT id
    FROM crawl_frontier
    WHERE state IN ('ready', 'retry')
      AND next_attempt_at <= clock_timestamp()
      AND (leased_until IS NULL OR leased_until < clock_timestamp())
    ORDER BY priority DESC, next_attempt_at ASC, id ASC
    FOR UPDATE SKIP LOCKED
    LIMIT $1
)
UPDATE crawl_frontier AS frontier
SET state = 'leased',
    lease_owner = $2,
    leased_until = clock_timestamp() + $3::interval,
    attempt_count = attempt_count + 1,
    updated_at = clock_timestamp()
FROM claimable
WHERE frontier.id = claimable.id
RETURNING frontier.*;
"""
