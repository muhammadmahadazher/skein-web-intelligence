# Legacy callable adapter

Older minimatch/eslint consumers call the CommonJS export as a function.
Upstream brace-expansion 5 exports an object containing `expand`. This adapter
preserves the callable interface and exposes the upstream named properties.

The implementation comes from the root registry alias `brace-expansion-core`,
pinned to `npm:brace-expansion@5.0.12` with normal lockfile integrity checks.
No expansion implementation is vendored here. The adapter version uses build
metadata (`5.0.12+skein.compat.1`) to accurately identify its upstream base.

5.0.12 fixes the quadratic rewrite advisory
[GHSA-q2hr-2g5m-vwhr](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr)
and includes bounded nesting, iterative comma parsing, and aggregate output
limits. `tests/brace-expansion-safety.test.mjs` checks normal behavior and runs
adversarial fixtures in timeout-bounded child processes. CI tests all installed
lint/build consumers as well.
