# Why this project fits MixRank

This is a public-work-based interpretation, not private information about the hiring team.

## Signals from the role

MixRank's current software-engineering description emphasizes petabyte-scale crawling, two owned data centers, a custom distributed file system, static application analysis, rapid deployments, and generalists working across Python, Rust, SQL, JavaScript/TypeScript, Nix, PostgreSQL, and Linux. It also asks applicants about early programming, learning, and personally owned projects.

The public team page names Scott Milliken as founder/CEO and describes a product, design, data, and engineering team. Recent public hiring posts are authored by Kiran Latha, who appears to be the operational screening lead. The safest inference is that a strong work sample should demonstrate systems judgment, curiosity, ownership, and the ability to make a difficult data product usable—not merely a polished landing page.

## How Skein answers those signals

- It uses the advertised languages for jobs they suit instead of forcing a polyglot checklist.
- It treats crawling as a hostile distributed-systems problem: SSRF, DNS rebinding, byte caps, leases, idempotency, politeness, and lineage are explicit.
- PostgreSQL is an executable state machine with transactional outbox semantics, not just storage behind an ORM.
- The product exposes the engineering truth—quality gates, budgets, and failures—in an approachable operator workflow.
- The repository is reproducible with Nix and designed for fast, small releases.
- The implementation includes adversarial tests and a clear boundary between what runs today and the next distributed-worker milestone.

## Interview demo path

1. Create a crawl and show URL/policy validation.
2. Open Crawl runs and explain the seven quality gates.
3. Open Data explorer and trace a record to source, digest, and extractor version.
4. Open Quality lab and run the adversarial fixture suite.
5. Move to `repository.py` and the SQL migration to explain leases, idempotency, and outbox correctness.
6. Finish in the Rust safety kernel with DNS and streaming-body invariants.

## Public references

- [MixRank software engineer role](https://app.dover.com/apply/mixrank/44a71d20-7286-44cc-b188-2d2420e37f0b)
- [MixRank careers](https://mixrank.com/careers)
- [MixRank about](https://mixrank.com/about)
