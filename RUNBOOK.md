# Skein local runbook

This is the exact start, use, test, and stop procedure for the local product.

## Fastest start on this Windows workspace

Open PowerShell in the repository root:

```powershell
.\scripts\start-skein.ps1
```

The script:

1. copies the web surface to a fast local runtime outside Google Drive;
2. installs the locked Node dependencies only when the lockfile changes;
3. synchronizes the locked Python environment;
4. starts the web console and crawl API in the background;
5. waits until both health checks pass.

Open:

- Console: <http://localhost:3000/>
- API documentation: <http://127.0.0.1:8000/api/docs>

To stop everything started by that script:

```powershell
.\scripts\stop-skein.ps1
```

The stop script reads the exact saved process IDs and stops only those process
trees. PostgreSQL is not stopped because it is an independent local service.

## Manual start

Use two terminals.

Terminal 1 — crawl API:

```powershell
cd services\control-plane
uv sync --locked --extra dev
uv run --locked --extra dev uvicorn skein.main:app --host 127.0.0.1 --port 8000
```

Terminal 2 — console:

```powershell
npm ci
npm run dev
```

Stop each foreground process with `Ctrl+C`.

## Nix/Linux

```bash
nix develop
just bootstrap
just dev-api
```

In a second shell:

```bash
nix develop
just dev
```

Stop each process with `Ctrl+C`. The Nix flake pins Node, Python, Rust,
PostgreSQL, `uv`, and the test utilities.

## Optional PostgreSQL mode

Without `DATABASE_URL`, Skein uses a deterministic in-memory run repository and
the real local crawler. To exercise durable run/frontier/outbox state:

```powershell
docker compose up -d postgres
$env:DATABASE_URL = "postgresql://skein:skein@127.0.0.1:5432/skein"
$env:SKEIN_WORKSPACE_ID = "00000000-0000-4000-8000-000000000099"
.\scripts\start-skein.ps1
```

Use a secret manager and a unique password outside local development.

## Verification commands

```powershell
# Python domain, crawler, lifecycle API, formatting, and types
cd services\control-plane
uv run --locked --extra dev ruff format --check skein tests
uv run --locked --extra dev ruff check skein tests
uv run --locked --extra dev mypy skein
uv run --locked --extra dev pytest -W error

# Rust hostile-network safety kernel
cd ..\fetcher
cargo fmt --all -- --check
cargo test --locked --all-targets
cargo clippy --locked --all-targets -- -D warnings

# Web console
cd ..\..
npm run typecheck
npm run lint
npm test
npm audit

# With the console, API, and isolated Chrome QA session running
node tests\browser-exhaustive.mjs
node tests\load-api.mjs
```

## If startup fails

- Read `.skein\api.err.log` and `.skein\web.err.log`.
- Confirm ports 3000 and 8000 are not already occupied.
- Run `.\scripts\stop-skein.ps1`, then start again.
- Do not weaken the private-IP, robots, redirect, timeout, or body-size
  protections to make a difficult website pass.
