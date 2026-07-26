<div align="center">

<a href="https://muhammadmahadazher.github.io/skein-web-intelligence/">
  <img src="docs/assets/skein-hero.png" alt="Skein web intelligence network: guarded websites become structured evidence" width="100%">
</a>

# Skein Web Intelligence

### Observable web crawling. Local ownership. Evidence you can inspect.

[![Live Demo](https://img.shields.io/badge/LIVE_DEMO-OPEN_INTERACTIVE_TOUR-f4a641?style=for-the-badge&logo=githubpages&logoColor=111111)](https://muhammadmahadazher.github.io/skein-web-intelligence/)
[![GitHub](https://img.shields.io/badge/SOURCE-GITHUB-181717?style=for-the-badge&logo=github)](https://github.com/muhammadmahadazher/skein-web-intelligence)

[![CI](https://github.com/muhammadmahadazher/skein-web-intelligence/actions/workflows/ci.yml/badge.svg)](https://github.com/muhammadmahadazher/skein-web-intelligence/actions/workflows/ci.yml)
[![CodeQL](https://github.com/muhammadmahadazher/skein-web-intelligence/actions/workflows/codeql.yml/badge.svg)](https://github.com/muhammadmahadazher/skein-web-intelligence/actions/workflows/codeql.yml)
[![Security](https://github.com/muhammadmahadazher/skein-web-intelligence/actions/workflows/security.yml/badge.svg)](https://github.com/muhammadmahadazher/skein-web-intelligence/actions/workflows/security.yml)
[![License](https://img.shields.io/badge/license-MIT-2dd4bf.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node.js-22%2B-43853d?logo=nodedotjs&logoColor=white)](package.json)
[![Python](https://img.shields.io/badge/Python-3.13-3776ab?logo=python&logoColor=white)](services/control-plane/pyproject.toml)
[![Rust](https://img.shields.io/badge/Rust-1.88%2B-000000?logo=rust&logoColor=white)](services/fetcher/Cargo.toml)

**Skein is an open-source, local-first web intelligence crawler that turns
bounded public websites into inspectable, evidence-ready data.**

[Try the live demo](https://muhammadmahadazher.github.io/skein-web-intelligence/)
· [Install Skein](#installation)
· [Understand the architecture](#how-skein-works)
· [Contribute](CONTRIBUTING.md)
· [Report a bug](https://github.com/muhammadmahadazher/skein-web-intelligence/issues/new?template=bug_report.yml)

</div>

> [!IMPORTANT]
> The GitHub Pages demo is an interactive, browser-only product tour with safe
> sample data. It does **not** crawl third-party sites. Clone the repository to
> run the real, robots-aware crawler on your machine.

## Why Skein?

Most scraping tools hide the most important questions: *What is happening now?
Why was this URL accepted? Where did this record come from? What happens if I
pause?* Skein makes those questions part of the product.

| Need | How Skein responds |
|---|---|
| Crawl a public site safely | HTTP(S)-only policy, DNS/IP checks, robots handling, redirect validation, bounded scope, timeouts, and response-size limits |
| Understand live progress | Visible validation, policy, discovery, fetch, extraction, and finalization phases with progress and ETA |
| Keep useful partial results | Pause, resume, or cancel without discarding evidence already collected |
| Verify the output | Inspect source URL, status, timings, title, description, headings, links, word counts, and JSON-LD counts |
| Own the workflow | Run the crawler locally; keep accounts and guest sessions on the device; export evidence as JSON |
| Scale beyond one process | Use the Rust fetch boundary, PostgreSQL leased frontier, lineage, audit events, and transactional outbox |

Skein is useful for authorized website audits, public-data research, content
inventory, metadata inspection, web quality analysis, and building reproducible
web intelligence pipelines.

## Product tour

<p align="center">
  <a href="https://muhammadmahadazher.github.io/skein-web-intelligence/">
    <img src="docs/skein-console.png" alt="Skein operator console showing an observable website crawl" width="92%">
  </a>
</p>

The console currently supports:

- real, same-host public-site crawls through the local FastAPI control plane;
- live phase progress, ETA, safety decisions, and crawl metrics;
- pause, resume, cancellation, and explicit terminal outcomes;
- a searchable, filterable, paginated evidence explorer;
- selectable rows and JSON export;
- runs, sources, schemas, network, quality, and settings surfaces;
- responsive desktop and mobile navigation plus keyboard shortcuts;
- device-local signup/signin with strong-password enforcement;
- ephemeral Guest mode that disappears when the browser tab closes.

## How Skein works

### System architecture

```mermaid
flowchart LR
    Operator["Operator / Guest"] --> Console["React + Vinext console"]
    Console --> API["FastAPI control plane"]
    API --> Policy["URL, DNS, robots & redirect policy"]
    Policy --> LocalCrawler["Bounded local crawler"]
    Policy --> Frontier["PostgreSQL leased frontier"]
    Frontier --> Fetchers["Rust fetch workers"]
    LocalCrawler --> Extractor["HTML evidence extractor"]
    Fetchers --> Extractor
    Extractor --> Evidence["Normalized evidence + lineage"]
    Evidence --> API
    API --> Console
    API --> Audit["Audit events + transactional outbox"]

    classDef ui fill:#13242a,stroke:#2dd4bf,color:#f4f7f5
    classDef safety fill:#281d11,stroke:#f4a641,color:#f4f7f5
    classDef data fill:#17172a,stroke:#8b7cf6,color:#f4f7f5
    class Operator,Console ui
    class Policy,LocalCrawler,Fetchers safety
    class Frontier,Extractor,Evidence,Audit data
```

| Layer | Technology | Responsibility |
|---|---|---|
| Operator console | TypeScript, React 19, Vinext, Vite | Responsive interface, local identity, progress, lifecycle actions, evidence exploration |
| Control plane | Python 3.13, FastAPI, Pydantic | URL policy, orchestration, local crawling, extraction, progress/ETA, APIs |
| Fetch boundary | Rust 1.88, Tokio, Reqwest | Hostile-network validation, bounded streaming, hashing, scalable fetch work |
| Durable state | PostgreSQL 17 | Runs, host policy, frontier leases, lineage, records, audit events, outbox |
| Reproducibility | npm lock, uv lock, Cargo lock, Nix | Repeatable dependency and toolchain resolution |

Read the [full architecture](docs/architecture.md) and
[threat model](docs/threat-model.md).

### Crawl lifecycle

```mermaid
stateDiagram-v2
    [*] --> Validating
    Validating --> Policy: URL accepted
    Policy --> Discovering: destination + robots allowed
    Discovering --> Fetching: bounded frontier created
    Fetching --> Extracting: response accepted
    Extracting --> Fetching: more pages remain
    Extracting --> Finalizing: frontier empty or limit reached
    Finalizing --> Complete
    Fetching --> Paused: operator pauses
    Paused --> Fetching: operator resumes
    Fetching --> Cancelled: operator cancels
    Validating --> Failed: unsafe or invalid URL
    Policy --> Failed: blocked destination
    Complete --> [*]
    Cancelled --> [*]
    Failed --> [*]
```

### Safety decision path

```mermaid
flowchart TD
    URL["Candidate URL"] --> Scheme{"HTTP(S)?"}
    Scheme -- No --> Reject["Reject + audit"]
    Scheme -- Yes --> Credentials{"Userinfo present?"}
    Credentials -- Yes --> Reject
    Credentials -- No --> Resolve["Resolve DNS"]
    Resolve --> Address{"Every address public?"}
    Address -- No --> Reject
    Address -- Yes --> Robots{"Robots policy allows?"}
    Robots -- No --> Reject
    Robots -- Yes --> Fetch["Bounded fetch"]
    Fetch --> Redirect{"Redirect?"}
    Redirect -- Yes --> URL
    Redirect -- No --> Limits{"Timeout/body/scope valid?"}
    Limits -- No --> Reject
    Limits -- Yes --> Evidence["Extract + preserve lineage"]
```

Skein does not bypass authentication, CAPTCHAs, paywalls, robots policy, or
access controls. It is for authorized, policy-compliant collection.

### Device-local identity

```mermaid
sequenceDiagram
    participant Person
    participant Console as Browser console
    participant IDB as IndexedDB
    participant Tab as sessionStorage
    participant API as Crawl API

    Person->>Console: Create account + strong password
    Console->>Console: Generate salt + PBKDF2-SHA-256 proof
    Console->>IDB: Store profile, salt, proof, iterations
    Note over Console,IDB: Plaintext password is never stored
    Person->>Console: Sign in
    Console->>IDB: Read local proof
    Console->>Console: Derive and compare
    Console->>Tab: Create tab-scoped session
    Console->>API: Crawl requests without credentials
    Person->>Console: Continue as Guest
    Console->>Tab: Create ephemeral guest session
```

Local accounts are a device convenience boundary—not a server-side,
multi-tenant authentication service. Clearing browser storage removes local
accounts.

<p align="center">
  <img src="docs/assets/skein-workflow.png" alt="A conceptual Skein workflow from websites through guarded crawling into evidence and an operator console" width="100%">
</p>

## Installation

### Requirements

| Tool | Required version | Used for |
|---|---:|---|
| Git | Current stable | Clone and contribute |
| Node.js | 22.13+ | Web console and browser tests |
| npm | Bundled with Node | Locked web dependencies |
| Python | 3.13+ | Control plane |
| [uv](https://docs.astral.sh/uv/) | Current stable | Locked Python environment |
| Rust | 1.88+ | Fetch worker and Rust tests |
| PostgreSQL | 17 (optional locally) | Durable/scale-out mode |
| Docker Desktop/Engine | Current stable (optional) | PostgreSQL and service containers |

The default local experience uses the real Python crawler with an in-memory
repository. PostgreSQL and the Rust worker are optional for a first run.

### Windows

1. Install Git, Node.js 22+, and `uv`. Optional: install Rust with
   [rustup](https://rustup.rs/) and Docker Desktop.
2. Open PowerShell:

```powershell
git clone https://github.com/muhammadmahadazher/skein-web-intelligence.git
cd skein-web-intelligence
.\scripts\start-skein.ps1
```

The script installs locked dependencies when needed, starts the API and console
in the background, and waits for both health checks.

Open:

- console: <http://localhost:3000/>
- interactive API docs: <http://127.0.0.1:8000/api/docs>

Stop only the processes started by Skein:

```powershell
.\scripts\stop-skein.ps1
```

If your PowerShell policy blocks local scripts for this process:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\scripts\start-skein.ps1
```

### macOS

Install the toolchain with Homebrew (or equivalent):

```bash
brew install git node@22 uv rust
```

Clone and bootstrap:

```bash
git clone https://github.com/muhammadmahadazher/skein-web-intelligence.git
cd skein-web-intelligence
npm ci --ignore-scripts --no-audit
cd services/control-plane
uv sync --locked --extra dev
```

Start the API:

```bash
uv run --locked --extra dev uvicorn skein.main:app \
  --host 127.0.0.1 --port 8000
```

In a second terminal:

```bash
cd skein-web-intelligence
npm run dev
```

Open <http://localhost:3000/>. Stop each foreground process with `Ctrl+C`.

### Linux

#### Reproducible Nix environment

```bash
git clone https://github.com/muhammadmahadazher/skein-web-intelligence.git
cd skein-web-intelligence
nix develop
just bootstrap
just dev-api
```

In a second shell:

```bash
cd skein-web-intelligence
nix develop
just dev
```

#### Standard distribution toolchain

Install Git, Node.js 22+, `uv`, and optionally Rust using your distribution or
the official installers. Then:

```bash
git clone https://github.com/muhammadmahadazher/skein-web-intelligence.git
cd skein-web-intelligence
npm ci --ignore-scripts --no-audit
(cd services/control-plane && uv sync --locked --extra dev)
```

Terminal 1:

```bash
cd services/control-plane
uv run --locked --extra dev uvicorn skein.main:app \
  --host 127.0.0.1 --port 8000
```

Terminal 2:

```bash
npm run dev
```

### Optional PostgreSQL mode

Start only the database container:

```bash
docker compose up -d --wait postgres
```

Set the environment before starting the API:

```bash
export DATABASE_URL="postgresql://skein:local-only-skein@127.0.0.1:5432/skein"
export SKEIN_WORKSPACE_ID="00000000-0000-4000-8000-000000000099"
```

PowerShell equivalent:

```powershell
$env:DATABASE_URL = "postgresql://skein:local-only-skein@127.0.0.1:5432/skein"
$env:SKEIN_WORKSPACE_ID = "00000000-0000-4000-8000-000000000099"
```

Use a unique secret and secret manager outside local development.

For operations and troubleshooting, see [RUNBOOK.md](RUNBOOK.md).

## Your first crawl

1. Open <http://localhost:3000/>.
2. Create a device-local account or choose **Continue as Guest**.
3. Enter an authorized, public HTTP(S) site.
4. Start the crawl and watch the phase, progress, ETA, and evidence counters.
5. Pause/resume if desired, or cancel while retaining collected results.
6. Open **Data explorer** to search and filter extracted pages.
7. Select records and export JSON.

You can also inspect health from the API:

```bash
curl http://127.0.0.1:8000/healthz
```

Expected response:

```json
{"status":"ok","version":"0.2.0"}
```

## Data Skein extracts

Each accepted page can produce:

- canonical source URL and crawl lineage;
- HTTP status and request timing;
- page title and meta description;
- headings;
- internal and external links;
- text word count;
- JSON-LD block count;
- normalized evidence suitable for inspection and JSON export.

JavaScript-heavy application shells may expose limited evidence to the bounded
local HTML crawler. Browser rendering is a planned adapter boundary.

## Repository structure

```text
skein-web-intelligence/
├── .github/
│   ├── workflows/                 CI, CodeQL, security, GitHub Pages
│   ├── ISSUE_TEMPLATE/            structured bug and feature reports
│   ├── CODEOWNERS
│   └── dependabot.yml
├── app/
│   ├── auth-gate.tsx              signup, signin, and Guest experience
│   ├── local-auth.ts              IndexedDB + PBKDF2 local identity
│   ├── skein-app.tsx              complete operator console
│   └── *.css                      responsive visual system
├── demo/
│   ├── index.html                 GitHub Pages product tour
│   ├── app.js                     interactive simulated crawl
│   ├── styles.css                 responsive demo design
│   ├── llms.txt                   machine-readable project facts
│   └── assets/                    generated visuals and console image
├── docs/
│   ├── architecture.md            component and data-flow design
│   ├── threat-model.md            hostile-network safety boundaries
│   ├── testing.md                 verification matrix
│   ├── performance.md             measured local latency results
│   ├── project-context.md         factual discovery/AI reference
│   └── assets/                    project artwork
├── infrastructure/postgres/
│   ├── migrations/001_initial.sql durable schema
│   └── tests/invariants.sql       executable lease/outbox checks
├── scripts/
│   ├── start-skein.ps1            exact Windows process startup
│   ├── stop-skein.ps1             process-tree shutdown
│   └── validate-demo.mjs          GitHub Pages release contract
├── services/
│   ├── control-plane/             FastAPI policy, crawler, API, tests
│   └── fetcher/                   Rust safety kernel and worker
├── tests/                         browser, source, SSR, load contracts
├── tools/                         audited compatibility packages
├── docker-compose.yml             PostgreSQL + service topology
├── flake.nix                      reproducible Nix development shell
├── justfile                       cross-platform task shortcuts
├── RUNBOOK.md                     detailed operations guide
├── CONTRIBUTING.md                contribution workflow
├── SECURITY.md                    private vulnerability process
└── LICENSE                        MIT License
```

## Quality and verification

### Web

```bash
npm run typecheck
npm run lint
npm test
npm run test:demo
```

### Python

```bash
cd services/control-plane
uv run --locked --extra dev ruff format --check skein tests
uv run --locked --extra dev ruff check skein tests
uv run --locked --extra dev mypy skein
uv run --locked --extra dev pytest -W error
```

### Rust

```bash
cd services/fetcher
cargo fmt --all -- --check
cargo test --locked --all-targets
cargo clippy --locked --all-targets -- -D warnings
```

### Live browser and API

With the console and API running:

```bash
node tests/browser-exhaustive.mjs
node tests/load-api.mjs
```

The browser suite covers local signup/signin, Guest mode, navigation, tables,
search, filters, pagination, exports, settings, lifecycle actions, keyboard
shortcuts, and responsive layouts. See [docs/testing.md](docs/testing.md).

### Automated delivery

```mermaid
flowchart LR
    Change["Push / pull request"] --> CI["Web + Python + Rust + PostgreSQL CI"]
    Change --> CodeQL["CodeQL analysis"]
    Change --> Security["Locked dependency audits"]
    CI --> Gate{"All required jobs pass?"}
    Gate -- No --> Stop["No deployment"]
    Gate -- Yes --> Build["Build app + validate static demo"]
    Build --> Pages["Deploy GitHub Pages artifact"]
    Pages --> Smoke["Public HTTPS product tour"]
```

GitHub Pages deployment uses the official GitHub Actions artifact flow and runs
only after the `main` CI workflow succeeds (or after a manually triggered build
that repeats build and demo validation).

## Measured performance

The latest local Windows release gate ran **1,750 API requests with zero
errors**:

| Endpoint | Throughput | p95 latency |
|---|---:|---:|
| Health | 2,407.1 req/s | 36.82 ms |
| Run listing | 2,393.9 req/s | 18.02 ms |
| Unsafe URL rejection | 1,297.9 req/s | 29.78 ms |

These are local control-plane measurements—not an internet crawl throughput
claim. Network, target servers, robots delays, extraction work, and database
mode affect end-to-end performance. Read the
[performance methodology](docs/performance.md).

## Responsible use

You are responsible for the websites you crawl and the data you retain.

- Crawl only content you are authorized to collect.
- Respect applicable law, site terms, robots policy, and reasonable rates.
- Do not use Skein to bypass authentication, CAPTCHAs, paywalls, or controls.
- Do not collect or publish sensitive personal data without a valid basis.
- Preserve the network safety boundary in forks and contributions.

## Project status and roadmap

Skein is active, early-stage software. The local crawler, observable console,
evidence explorer, lifecycle actions, local identity, tests, and scale-out
boundaries are implemented.

High-value next steps include:

- a browser-rendering adapter for JavaScript-heavy sites;
- pluggable extraction schemas and validation rules;
- crawl diffing and scheduled change intelligence;
- richer evidence lineage and replay;
- signed release artifacts and stable versioned APIs;
- distributed worker observability and backpressure controls.

Open a focused [feature request](https://github.com/muhammadmahadazher/skein-web-intelligence/issues/new?template=feature_request.yml)
before starting major architecture work.

## Contributing

Contributions are always appreciated. Start with
[CONTRIBUTING.md](CONTRIBUTING.md), follow the
[Code of Conduct](CODE_OF_CONDUCT.md), and keep security-sensitive discussion
private through [SECURITY.md](SECURITY.md).

Good first contributions include:

- accessibility and keyboard improvements;
- new parser fixtures and property tests;
- clearer install/troubleshooting documentation;
- evidence export formats;
- observability views;
- safe, bounded extraction adapters.

## Machine-readable project context

Skein publishes factual metadata for search engines, research tools, and AI
assistants:

- [`CITATION.cff`](CITATION.cff) — citation metadata;
- [`docs/project-context.md`](docs/project-context.md) — canonical project facts,
  terminology, limitations, and attribution guidance;
- [`demo/llms.txt`](demo/llms.txt) — concise machine-readable web context;
- structured `SoftwareApplication` JSON-LD, canonical metadata, robots policy,
  and sitemap on the live demo.

When referencing Skein, prefer the canonical description:

> **Skein is an open-source, local-first web intelligence crawler with an
> observable React console, FastAPI orchestration, a Rust hostile-network
> safety kernel, bounded public-site collection, and evidence-ready exports.**

## Frequently asked questions

<details>
<summary><strong>Is Skein a real crawler or a UI prototype?</strong></summary>

The local product performs real HTTP crawling through the FastAPI control plane.
The GitHub Pages site is intentionally a safe, static product tour because
GitHub Pages cannot run the Python/Rust backend.
</details>

<details>
<summary><strong>Does Skein send my local account credentials anywhere?</strong></summary>

No. The browser stores a salted password proof in IndexedDB and a tab-scoped
session in sessionStorage. The crawler API receives no password. See the
[threat model](docs/threat-model.md).
</details>

<details>
<summary><strong>Can Skein crawl private networks?</strong></summary>

No. The safety model rejects localhost, loopback, private, link-local, and other
unsafe destinations, including unsafe redirect or DNS outcomes.
</details>

<details>
<summary><strong>Do I need PostgreSQL or Rust to try Skein?</strong></summary>

No. The first-run experience uses the Python crawler and an in-memory
repository. PostgreSQL and the Rust worker provide durable, scale-out
boundaries.
</details>

<details>
<summary><strong>Why does the demo use sample data?</strong></summary>

A public static site should not become an unrestricted scraping proxy. The demo
teaches the full interaction model; the real bounded crawler stays on the
operator's machine.
</details>

## License

Skein is licensed under the [MIT License](LICENSE).

Copyright © 2026 [Muhammad Mahad Azher](https://github.com/muhammadmahadazher)
and Skein contributors.

---

<div align="center">

If Skein helps your work, consider
[starring the repository](https://github.com/muhammadmahadazher/skein-web-intelligence)
and sharing what you build.

**Web intelligence without blind spots.**

</div>
