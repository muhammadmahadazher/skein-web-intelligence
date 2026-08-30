<div align="center">

# Skein Web Intelligence

**A local-first crawler that turns public websites into inspectable, evidence-ready data.**

[![CI](https://github.com/muhammadmahadazher/skein-web-intelligence/actions/workflows/ci.yml/badge.svg)](https://github.com/muhammadmahadazher/skein-web-intelligence/actions/workflows/ci.yml)
[![Security](https://github.com/muhammadmahadazher/skein-web-intelligence/actions/workflows/security.yml/badge.svg)](https://github.com/muhammadmahadazher/skein-web-intelligence/actions/workflows/security.yml)
[![CodeQL](https://github.com/muhammadmahadazher/skein-web-intelligence/actions/workflows/codeql.yml/badge.svg)](https://github.com/muhammadmahadazher/skein-web-intelligence/actions/workflows/codeql.yml)
[![Live demo](https://img.shields.io/badge/live_demo-product_tour-f4a641?logo=githubpages&logoColor=111111)](https://muhammadmahadazher.github.io/skein-web-intelligence/)
[![License: MIT](https://img.shields.io/badge/license-MIT-2dd4bf.svg)](LICENSE)

[Live demo](https://muhammadmahadazher.github.io/skein-web-intelligence/) ·
[Quick start](#quick-start) ·
[Architecture](#architecture) ·
[Documentation](#documentation) ·
[Contributing](CONTRIBUTING.md)

<a href="https://muhammadmahadazher.github.io/skein-web-intelligence/">
  <img src="docs/skein-console.png" alt="The real Skein operator console running locally" width="100%">
</a>

<sub>Real local Skein console—not concept art. The public GitHub Pages site is a safe, browser-only product tour; clone the repository to perform live crawls.</sub>

</div>

## What Skein does

Skein crawls authorized public HTTP(S) sites while making policy decisions,
progress, failures, and evidence visible to the operator.

- **Crawls real sites locally** through a bounded FastAPI control plane.
- **Shows its work** with phases, progress, ETA, current URL, and evidence counts.
- **Protects the network boundary** with URL canonicalization, DNS/IP checks,
  robots handling, redirect revalidation, timeouts, and body limits.
- **Preserves useful partial results** when a run is paused or cancelled.
- **Extracts inspectable evidence** including titles, descriptions, headings,
  links, status codes, timings, word counts, and JSON-LD counts.
- **Provides a complete operator console** for runs, sources, schemas, network
  health, quality checks, filtering, pagination, and JSON export.
- **Has a scale-out path** through Rust fetch workers, PostgreSQL leases,
  lineage, audit events, and a transactional outbox.

Skein does not bypass authentication, CAPTCHAs, paywalls, robots policy, or
access controls.

## Quick start

### Windows

Requirements: Git, Node.js 22+, and
[`uv`](https://docs.astral.sh/uv/). Rust and Docker are optional for the first
run.

```powershell
git clone https://github.com/muhammadmahadazher/skein-web-intelligence.git
cd skein-web-intelligence
.\scripts\start-skein.ps1
```

Open <http://localhost:3000/>. The interactive API documentation is available
at <http://127.0.0.1:8000/api/docs>.

Stop only the processes launched by Skein:

```powershell
.\scripts\stop-skein.ps1
```

### macOS and Linux

Install Node.js 22+, `uv`, and optionally Rust. Then:

```bash
git clone https://github.com/muhammadmahadazher/skein-web-intelligence.git
cd skein-web-intelligence
npm ci --ignore-scripts --no-audit
(cd services/control-plane && uv sync --locked --extra dev)
```

Start the API:

```bash
cd services/control-plane
uv run --locked --extra dev uvicorn skein.main:app \
  --host 127.0.0.1 --port 8000
```

In another terminal, from the repository root:

```bash
npm run dev
```

Linux users can instead enter the reproducible environment with `nix develop`
and use the commands in the [`justfile`](justfile).

### Optional PostgreSQL mode

The default experience uses the real crawler with in-memory run state. Start
PostgreSQL when you want durable repository and lease behavior:

```bash
docker compose up -d --wait postgres
export DATABASE_URL="postgresql://skein:local-only-skein@127.0.0.1:5432/skein"
export SKEIN_WORKSPACE_ID="00000000-0000-4000-8000-000000000099"
```

Use a unique secret and a secret manager outside local development. See the
[`RUNBOOK`](RUNBOOK.md) for PowerShell equivalents and troubleshooting.

## Your first crawl

1. Open the local console and create a device-local account or continue as a
   guest.
2. Enter an authorized, public HTTP(S) URL.
3. Start the crawl and watch validation, policy, discovery, fetch, extraction,
   and finalization progress.
4. Pause, resume, or cancel as needed.
5. Open **Data explorer** to filter, inspect, select, and export evidence.

Health check:

```bash
curl http://127.0.0.1:8000/healthz
```

```json
{"status":"ok","version":"0.2.0"}
```

## Architecture

```mermaid
flowchart LR
    Operator["Operator / Guest"] --> Console["React console"]
    Console --> API["FastAPI control plane"]
    API --> Policy["URL, DNS, robots & redirect policy"]
    Policy --> Local["Bounded local crawler"]
    Policy --> Frontier["PostgreSQL leased frontier"]
    Frontier --> Rust["Rust fetch workers"]
    Local --> Extract["HTML evidence extractor"]
    Rust --> Extract
    Extract --> Evidence["Evidence + lineage"]
    Evidence --> API
    API --> Console
    API --> Audit["Audit events + outbox"]
```

| Layer | Technology | Responsibility |
|---|---|---|
| Console | TypeScript, React, Vinext, Vite | Runs, progress, lifecycle actions, exploration, export |
| Control plane | Python 3.13, FastAPI, Pydantic | Policy, crawling, extraction, orchestration, APIs |
| Fetch boundary | Rust, Tokio, Reqwest | Hostile-network validation and scalable bounded fetches |
| Durable state | PostgreSQL 17 | Runs, frontier leases, records, lineage, audit, outbox |
| Reproducibility | npm, uv, Cargo, Nix | Locked dependencies and consistent toolchains |

The split keeps operator/API iteration fast while isolating high-throughput and
hostile-network work behind a Rust boundary. PostgreSQL is a durable control
plane—not a storage location for unbounded response bodies.

Read the [architecture](docs/architecture.md),
[threat model](docs/threat-model.md), and
[performance notes](docs/performance.md) for the full reasoning.

## Security model

Every seed and redirect passes through the same decision path:

```text
canonicalize URL
  → require HTTP(S) and reject userinfo
  → resolve DNS and require every address to be public
  → apply robots and host policy
  → fetch with timeout, redirect, scope, and body limits
  → extract evidence with source lineage
```

Local accounts are a device convenience boundary. A salted PBKDF2 proof is
stored in IndexedDB, the session is tab-scoped, and credentials are not sent to
the crawler API. This is not a server-side multi-tenant identity service.

Please report vulnerabilities privately according to [`SECURITY.md`](SECURITY.md).

## Verification

### Web console

```bash
npm run typecheck
npm run lint
npm test
npm run test:demo
```

### Python control plane

```bash
cd services/control-plane
uv run --locked --extra dev ruff format --check skein tests
uv run --locked --extra dev ruff check skein tests
uv run --locked --extra dev mypy skein
uv run --locked --extra dev pytest -W error
```

### Rust fetcher

```bash
cd services/fetcher
cargo fmt --all -- --check
cargo test --locked --all-targets
cargo clippy --locked --all-targets -- -D warnings
```

With the local console and API running:

```bash
node tests/browser-exhaustive.mjs
node tests/load-api.mjs
```

The browser suite covers identity, navigation, real crawl results, lifecycle
actions, tables, search, status/signal filters, pagination, export, settings,
keyboard controls, and responsive layouts. The complete matrix is documented
in [docs/testing.md](docs/testing.md).

## Measured local performance

The latest recorded release gate issued **1,750 control-plane requests with
zero errors**.

| Endpoint | Throughput | p95 latency |
|---|---:|---:|
| Health | 2,124.1 req/s | 57.02 ms |
| Run listing | 1,538.2 req/s | 23.33 ms |
| Unsafe URL rejection | 1,074.8 req/s | 26.81 ms |

These are local API measurements, not internet-crawl throughput claims.
Network conditions, target servers, robots delays, extraction work, and storage
mode determine end-to-end crawl performance.

## Repository map

```text
app/                         React operator console and local identity
demo/                        Static GitHub Pages product tour
docs/                        Architecture, threat model, testing, performance
infrastructure/postgres/     Schema and executable database invariants
scripts/                     Start, stop, demo validation
services/control-plane/      FastAPI crawler, policy, repositories, tests
services/fetcher/            Rust safety kernel and worker
tests/                       Browser, SSR, source, and load contracts
tools/                       Audited compatibility packages
```

## Documentation

- [Operations and troubleshooting](RUNBOOK.md)
- [Architecture](docs/architecture.md)
- [Threat model](docs/threat-model.md)
- [Testing strategy](docs/testing.md)
- [Performance methodology](docs/performance.md)
- [Project context](docs/project-context.md)
- [Contribution guide](CONTRIBUTING.md)

## Project status

Skein is active, early-stage software. The local crawler, observable console,
evidence explorer, lifecycle controls, local identity, network protections,
tests, and scale-out boundaries are implemented.

Current roadmap priorities:

- browser rendering for JavaScript-heavy sites;
- pluggable extraction schemas and validation rules;
- crawl diffing and scheduled change intelligence;
- richer evidence lineage and replay;
- signed releases and stable versioned APIs;
- distributed worker observability and backpressure.

Focused contributions are welcome. Please read
[`CONTRIBUTING.md`](CONTRIBUTING.md) and the
[`Code of Conduct`](CODE_OF_CONDUCT.md) before opening a pull request.

## Responsible use

Crawl only content you are authorized to collect. Respect applicable law, site
terms, robots policy, reasonable rates, and data-protection obligations. Do not
use Skein to bypass authentication or access controls.

## License

Skein is available under the [MIT License](LICENSE).

Copyright © 2026 [Muhammad Mahad Azher](https://github.com/muhammadmahadazher)
and Skein contributors.
