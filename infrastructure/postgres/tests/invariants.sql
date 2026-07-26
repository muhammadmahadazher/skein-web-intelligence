\set ON_ERROR_STOP on

BEGIN;

INSERT INTO crawl_run (id, workspace_id, name, seed_url, state, policy)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000099',
  'database invariant test',
  'https://example.com/',
  'queued',
  '{}'::jsonb
);

INSERT INTO crawl_frontier (
  run_id, canonical_url, url_hash, host, depth, state, next_attempt_at
)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  'https://example.com/',
  digest('https://example.com/', 'sha256'),
  'example.com',
  0,
  'ready',
  clock_timestamp()
);

DO $$
BEGIN
  BEGIN
    INSERT INTO crawl_frontier (
      run_id, canonical_url, url_hash, host, depth, state, next_attempt_at
    )
    VALUES (
      '00000000-0000-4000-8000-000000000001',
      'https://example.com/',
      digest('https://example.com/', 'sha256'),
      'example.com',
      0,
      'ready',
      clock_timestamp()
    );
    RAISE EXCEPTION 'duplicate URL invariant did not fire';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  BEGIN
    UPDATE crawl_frontier
       SET state = 'leased'
     WHERE run_id = '00000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'lease ownership invariant did not fire';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END $$;

ROLLBACK;
