BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE schema_migration (
    version text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    checksum text NOT NULL
);

CREATE TABLE crawl_run (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL,
    name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
    seed_url text NOT NULL CHECK (octet_length(seed_url) <= 8192),
    state text NOT NULL CHECK (state IN ('queued', 'running', 'paused', 'complete', 'failed', 'cancelled')),
    policy jsonb NOT NULL CHECK (jsonb_typeof(policy) = 'object'),
    pages_discovered bigint NOT NULL DEFAULT 0 CHECK (pages_discovered >= 0),
    pages_fetched bigint NOT NULL DEFAULT 0 CHECK (pages_fetched >= 0),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    started_at timestamptz,
    completed_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CHECK (completed_at IS NULL OR started_at IS NOT NULL),
    CHECK (started_at IS NULL OR started_at >= created_at),
    CHECK (completed_at IS NULL OR completed_at >= started_at)
);

CREATE INDEX crawl_run_workspace_created_idx
    ON crawl_run (workspace_id, created_at DESC, id DESC);

CREATE TABLE crawl_host (
    run_id uuid NOT NULL REFERENCES crawl_run(id) ON DELETE CASCADE,
    host text NOT NULL,
    crawl_delay_ms integer NOT NULL DEFAULT 1000 CHECK (crawl_delay_ms BETWEEN 10 AND 3600000),
    max_concurrency smallint NOT NULL DEFAULT 1 CHECK (max_concurrency BETWEEN 1 AND 100),
    next_request_at timestamptz NOT NULL DEFAULT '-infinity',
    robots_state text NOT NULL DEFAULT 'unknown'
        CHECK (robots_state IN ('unknown', 'allowed', 'disallowed', 'unavailable')),
    robots_body bytea,
    robots_expires_at timestamptz,
    consecutive_failures integer NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
    circuit_open_until timestamptz,
    PRIMARY KEY (run_id, host)
);

CREATE TABLE crawl_frontier (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    run_id uuid NOT NULL REFERENCES crawl_run(id) ON DELETE CASCADE,
    canonical_url text NOT NULL CHECK (octet_length(canonical_url) <= 8192),
    url_hash bytea NOT NULL CHECK (octet_length(url_hash) = 32),
    host text NOT NULL,
    depth smallint NOT NULL CHECK (depth BETWEEN 0 AND 32),
    priority integer NOT NULL DEFAULT 0,
    state text NOT NULL
        CHECK (state IN ('ready', 'leased', 'retry', 'complete', 'failed', 'blocked')),
    attempt_count smallint NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 100),
    next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    lease_owner text,
    leased_until timestamptz,
    parent_id bigint REFERENCES crawl_frontier(id) ON DELETE SET NULL,
    last_error_code text,
    last_error_detail text,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (run_id, url_hash),
    CHECK (
        (state = 'leased' AND lease_owner IS NOT NULL AND leased_until IS NOT NULL)
        OR
        (state <> 'leased' AND lease_owner IS NULL AND leased_until IS NULL)
    )
);

CREATE INDEX crawl_frontier_claim_idx
    ON crawl_frontier (priority DESC, next_attempt_at ASC, id ASC)
    WHERE state IN ('ready', 'retry');

CREATE INDEX crawl_frontier_host_state_idx
    ON crawl_frontier (run_id, host, state, next_attempt_at);

CREATE INDEX crawl_frontier_stale_lease_idx
    ON crawl_frontier (leased_until)
    WHERE state = 'leased';

CREATE TABLE fetch_document (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    run_id uuid NOT NULL REFERENCES crawl_run(id) ON DELETE CASCADE,
    frontier_id bigint NOT NULL REFERENCES crawl_frontier(id) ON DELETE RESTRICT,
    final_url text NOT NULL,
    status_code smallint NOT NULL CHECK (status_code BETWEEN 100 AND 599),
    content_type text,
    charset text,
    content_length bigint NOT NULL CHECK (content_length >= 0),
    body_hash bytea NOT NULL CHECK (octet_length(body_hash) = 32),
    response_headers jsonb NOT NULL CHECK (jsonb_typeof(response_headers) = 'object'),
    storage_key text,
    fetched_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    elapsed_ms integer NOT NULL CHECK (elapsed_ms >= 0),
    UNIQUE (run_id, frontier_id, body_hash)
);

CREATE INDEX fetch_document_hash_idx ON fetch_document (body_hash);
CREATE INDEX fetch_document_run_fetched_idx ON fetch_document (run_id, fetched_at DESC);

CREATE TABLE extracted_record (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL,
    run_id uuid NOT NULL REFERENCES crawl_run(id) ON DELETE CASCADE,
    document_id bigint NOT NULL REFERENCES fetch_document(id) ON DELETE CASCADE,
    schema_name text NOT NULL,
    schema_version integer NOT NULL CHECK (schema_version > 0),
    natural_key text,
    payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
    lineage jsonb NOT NULL CHECK (jsonb_typeof(lineage) = 'object'),
    confidence numeric(5,4) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
    quarantine_reason text,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE NULLS NOT DISTINCT (workspace_id, schema_name, natural_key, document_id)
);

CREATE INDEX extracted_record_workspace_schema_idx
    ON extracted_record (workspace_id, schema_name, schema_version, created_at DESC);

CREATE INDEX extracted_record_payload_gin_idx ON extracted_record USING gin (payload jsonb_path_ops);

CREATE TABLE crawl_event (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    run_id uuid NOT NULL REFERENCES crawl_run(id) ON DELETE CASCADE,
    frontier_id bigint REFERENCES crawl_frontier(id) ON DELETE SET NULL,
    event_type text NOT NULL,
    stage text NOT NULL CHECK (stage IN ('ingest', 'frontier', 'resolve', 'fetch', 'parse', 'normalize', 'persist', 'export')),
    outcome text NOT NULL CHECK (outcome IN ('started', 'passed', 'failed', 'recovered', 'skipped')),
    duration_ms integer CHECK (duration_ms >= 0),
    payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
    occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX crawl_event_run_time_idx ON crawl_event (run_id, occurred_at DESC, id DESC);

CREATE TABLE outbox_event (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    aggregate_type text NOT NULL,
    aggregate_id uuid NOT NULL,
    event_type text NOT NULL,
    payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    published_at timestamptz,
    publish_attempts integer NOT NULL DEFAULT 0 CHECK (publish_attempts >= 0),
    last_error text
);

CREATE INDEX outbox_unpublished_idx
    ON outbox_event (created_at, id)
    WHERE published_at IS NULL;

INSERT INTO schema_migration (version, checksum)
VALUES ('001_initial', encode(digest('001_initial', 'sha256'), 'hex'));

COMMIT;
