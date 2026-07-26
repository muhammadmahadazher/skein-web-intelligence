# Verification matrix

Skein treats each boundary as a testable contract. The local suite validates
closed fixtures, real public websites, browser interactions, PostgreSQL
invariants, and concurrent API traffic.

## Python control plane and crawler

- URL canonicalization, IDNA, tracking removal, credentials, unsafe schemes,
  local names, private/literal IPs, and public DNS answers.
- Redirect revalidation, robots allow/disallow, missing robots policy,
  cross-host scope containment, timeouts, content types, and streaming body
  limits.
- HTML titles, descriptions, charset-only meta tags, headings, links, base URLs,
  JSON-LD, text/word counts, and broken structured data.
- Monotonic progress, ETA, discovered/processed/succeeded/failed counts,
  terminal messages, and retained partial evidence.
- Pause, resume, cancel, list, status, results, missing run, readiness, CORS,
  and unsafe admission.
- PostgreSQL run/frontier/outbox transaction and workspace scoping.

Latest locked run: **20 passed, 1 PostgreSQL-only test skipped when its explicit
test URL is absent**. The PostgreSQL integration test is executed separately
when `SKEIN_TEST_DATABASE_URL` is set.

## Rust fetcher

- HTTP(S)-only URL acceptance and embedded credential rejection.
- Public/private IPv4 and IPv6 classification.
- All-answer DNS validation.
- Retry classification and property coverage.
- Bounded streaming bodies and BLAKE3 content identity.
- Formatting and Clippy with warnings denied.

Latest run: **6 passed**.

## Web product

- Strict TypeScript, ESLint, Vinext production build, server render, metadata,
  source contracts, and npm audit.
- Exhaustive live Chrome journey across:
  - strong-password signup, salted local proof verification, sign-out, generic
    failed sign-in, returning sign-in, and ephemeral Guest mode;
  - visible liquid glass and desktop layout;
  - help, notifications, local account menu, and workspace dialogs;
  - advanced crawl inputs and the URL safety guard;
  - a real python.org progress/ETA/result journey;
  - run search, filters, refresh, pause, resume, and cancel;
  - source registration and policy verification;
  - explorer search, reset, sort, select, export, and pagination;
  - schema creation, selection, and fixtures;
  - topology traffic controls and architecture verdict;
  - all four failure drills;
  - all settings tabs, all six switches, and save;
  - command palette, footer dialogs, sidebar collapse, row actions, and signal
    controls;
  - 390 × 844 mobile auth and drawer/navigation plus 1440 × 1000 desktop layout.

The browser journey passed all **19 interaction groups** with zero horizontal
overflow. The computed glass surface reports `blur(38px) saturate(1.9)`.

## Real-public-site regression

A bounded python.org scan found and fixed a real parser edge case: a `<meta>`
element with `charset` but no `name` or `property`. The regression fixture now
ships in the parser suite.

The repeated live scan completed:

- 8 discovered;
- 8 processed;
- 8 successful;
- 0 failed;
- 8 evidence records;
- clear 100% terminal status.

## Performance gate

`node tests/load-api.mjs` issues 1,750 total requests across three concurrent
scenarios and fails on unexpected errors or p95 above 250 ms.

Latest local results:

| Scenario | RPS | p95 | p99 | Errors |
| --- | ---: | ---: | ---: | ---: |
| Health | 2,252.2 | 30.52 ms | 46.35 ms | 0 |
| Run list | 1,885.6 | 18.71 ms | 20.17 ms | 0 |
| Unsafe URL rejection | 1,577.8 | 19.86 ms | 22.40 ms | 0 |

These are local baselines, not production capacity claims.
