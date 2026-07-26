# Performance and scale verdict

## Verdict

The split is correct:

- Python/FastAPI owns validation, policy, orchestration, and operator-facing APIs.
- Rust owns hostile-network I/O and the horizontally scalable fetch loop.
- PostgreSQL owns transactional control state, leases, lineage, and the outbox.
- Raw page bodies belong in object storage, not PostgreSQL.

This is not inherently slow. The local Python crawler is intentionally bounded
and polite, while the production path scales fetch work independently in Rust.

The important qualification is that a single unpartitioned PostgreSQL frontier
must not be treated as infinite. Before sustained frontier claim throughput
exceeds roughly tens of thousands of rows per second, partition by workspace/run
and measure `SKIP LOCKED` contention. Add a dedicated event log only after the
transactional outbox becomes the measured bottleneck.

## Local measurements

Measured on 2026-07-26 against the running local FastAPI service:

| Scenario | Requests | Concurrency | RPS | p50 | p95 | p99 | Errors |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Health | 1,000 | 50 | 2,407.1 | 16.96 ms | 36.82 ms | 60.28 ms | 0 |
| Run list | 500 | 30 | 2,393.9 | 11.93 ms | 18.02 ms | 18.61 ms | 0 |
| Unsafe URL rejection | 250 | 25 | 1,297.9 | 17.23 ms | 29.78 ms | 32.83 ms | 0 |

A bounded live crawl of python.org completed eight pages with eight evidence
records and zero failures. With the host budget set to four requests per second,
the observed end-to-end rate was 3.55 pages per second.

These measurements are development-machine baselines, not production capacity
claims. Production SLOs require a staging environment, representative page
sizes, PostgreSQL data volume, object storage, and multiple Rust workers.

## Scale gates

1. Keep request admission cheap and reject unsafe targets before repository work.
2. Partition frontier tables and keep claim indexes hot.
3. Batch lease claims and result commits.
4. Autoscale Rust workers from ready-frontier depth and host-budget headroom.
5. Store response bodies by content hash in object storage.
6. Bound every API list and result payload.
7. Track p50/p95/p99, queue age, fetch success, retry rate, lease recovery,
   PostgreSQL lock time, and outbox lag.
8. Promote to Kafka/Redpanda/NATS only when measured outbox throughput or fan-out
   requirements justify the operational cost.

The executable local latency gate is `node tests/load-api.mjs`; it fails when
any scenario returns unexpected errors or p95 exceeds 250 ms.
