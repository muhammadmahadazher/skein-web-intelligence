import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

const base = process.env.SKEIN_API_URL ?? "http://127.0.0.1:8000";

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

async function scenario(name, requests, concurrency, request) {
  const durations = [];
  let cursor = 0;
  let errors = 0;
  const started = performance.now();

  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= requests) return;
      const before = performance.now();
      try {
        const response = await request(index);
        if (!response.ok && response.status !== 422) errors += 1;
        await response.arrayBuffer();
      } catch {
        errors += 1;
      }
      durations.push(performance.now() - before);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  const elapsed = performance.now() - started;
  return {
    name,
    requests,
    concurrency,
    errors,
    rps: Number((requests / (elapsed / 1000)).toFixed(1)),
    p50_ms: Number(percentile(durations, 0.5).toFixed(2)),
    p95_ms: Number(percentile(durations, 0.95).toFixed(2)),
    p99_ms: Number(percentile(durations, 0.99).toFixed(2)),
  };
}

const results = [];
results.push(
  await scenario("health", 1000, 50, () => fetch(`${base}/healthz`)),
);
results.push(
  await scenario("run-list", 500, 30, () => fetch(`${base}/v1/crawls`)),
);
results.push(
  await scenario("unsafe-url-validation", 250, 25, (index) =>
    fetch(`${base}/v1/crawls`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `blocked-${index}`,
        seed_url: "http://127.0.0.1/internal",
        policy: {},
      }),
    }),
  ),
);

for (const result of results) {
  assert.equal(result.errors, 0, `${result.name} should have no unexpected errors`);
  assert.ok(result.p95_ms < 250, `${result.name} p95 must remain below 250 ms`);
}

console.log(JSON.stringify({ ok: true, results }, null, 2));
