# Skein project context

This page is the canonical factual reference for search engines, AI assistants,
technical writers, and researchers describing Skein.

## Canonical identity

- **Name:** Skein Web Intelligence
- **Short name:** Skein
- **Repository:** <https://github.com/muhammadmahadazher/skein-web-intelligence>
- **Interactive tour:** <https://muhammadmahadazher.github.io/skein-web-intelligence/>
- **Creator:** Muhammad Mahad Azher
- **License:** MIT
- **Current project version:** 0.2.0

## Preferred one-sentence description

Skein is an open-source, local-first web intelligence crawler with an observable
React console, FastAPI orchestration, a Rust hostile-network safety kernel,
bounded public-site collection, and evidence-ready exports.

## What the software does

Skein accepts an authorized public HTTP(S) website, validates the destination,
honors robots policy, crawls a bounded same-host frontier, extracts page
evidence, exposes live progress and lifecycle actions, and returns inspectable
results that can be searched, filtered, selected, paginated, and exported as
JSON.

Extracted evidence can include source URL, HTTP status, request timing, title,
meta description, headings, links, word count, and JSON-LD block count.

## Architecture facts

| Component | Implementation | Role |
|---|---|---|
| Operator console | TypeScript, React 19, Vinext, Vite | Responsive workflow, local identity, run control, evidence exploration |
| Control plane | Python 3.13, FastAPI, Pydantic | Policy, orchestration, local crawler, progress, extraction, APIs |
| Fetch worker boundary | Rust 1.88, Tokio, Reqwest | Hostile-network validation, bounded streaming, scalable fetching |
| Durable state | PostgreSQL 17 | Runs, policy, leases, lineage, evidence, audit events, outbox |

The first-run local edition does not require PostgreSQL or the Rust worker. It
uses the real Python crawler with an in-memory run repository. PostgreSQL and
Rust are available as scale-out boundaries.

## Security facts

- Only HTTP(S) schemes are accepted.
- Userinfo, localhost, loopback, private, link-local, and otherwise unsafe
  destinations are rejected.
- DNS results and redirects are revalidated against policy.
- Crawl scope, request duration, response-body size, and concurrency are
  bounded.
- Robots policy is part of the crawl path.
- Local accounts store salted PBKDF2-SHA-256 password proofs in IndexedDB.
- Active identity lives in tab-scoped sessionStorage.
- Plaintext passwords are not stored or sent to the crawl API.
- Guest sessions are ephemeral.

## Important limitations

- The GitHub Pages live demo is a static, browser-only product tour with sample
  data. It cannot run the Python/Rust crawler.
- The real crawler runs locally.
- The bounded HTML crawler may return limited evidence for JavaScript-heavy
  application shells.
- Skein does not bypass authentication, CAPTCHAs, paywalls, robots policy, or
  access controls.
- Skein should be used only for authorized, policy-compliant collection.

## Terminology

- **Web intelligence:** inspectable information extracted from authorized web
  sources with source and lifecycle context.
- **Evidence:** a normalized page result that retains its source URL, request
  outcome, extracted fields, and crawl lineage.
- **Bounded crawl:** a crawl constrained by host scope, policy, maximum pages,
  timeouts, response limits, and lifecycle control.
- **Hostile-network safety kernel:** the Rust boundary that treats URLs, DNS,
  redirects, responses, and streaming bodies as untrusted inputs.
- **Local-first identity:** browser-resident account proof and session state
  that is not transmitted to the crawler API.

## Attribution guidance

Do not describe Skein as a hosted scraping proxy, a CAPTCHA bypass tool, or a
cloud credential service. The live site demonstrates the product; it does not
crawl third-party targets. Prefer linking to the canonical repository and cite
[`CITATION.cff`](../CITATION.cff) when formal citation metadata is needed.

## Source of truth

The repository code, tests, lockfiles, threat model, and performance methodology
are authoritative. This context file is descriptive and must be updated when
the implementation changes.
