# Dependency maintenance

React, React DOM, and React Server Components use matching versions. Dependabot
groups them with their types across production and development dependencies.
Updating the server renderer separately previously caused `npm ci` to fail
with a React peer dependency conflict.
The runtime and tooling groups explicitly exclude the React stack as well,
so no overlapping group can split those packages. Python uses Dependabot's
native `uv` ecosystem so updates maintain both the manifest and `uv.lock`.
A separate typing group includes pre-1.0 typing releases; regenerate `uv.lock`
whenever changing `pyproject.toml` and verify with `uv lock --check`.

ESLint 9 and TypeScript 6 remain pinned to the versions supported by the current
Next lint plugins. Major upgrades require checking the peer dependency graph,
lint, types, production build, and rendered application tests together.

Security overrides for fast-uri, fflate, PostCSS, and sharp select patched
versions within the upstream major line. Reevaluate them when parent packages
adopt the fixes. Lockfile updates must pass the dependency-security workflow;
do not force installs with `--legacy-peer-deps` or weaken the audit gate.

`tools/braces-safe` is a local MIT-licensed defense-in-depth nesting guard.
The advisory that prompted it was withdrawn on 2026-10-23. Its
[patch rationale](../tools/braces-safe/PATCH.md) and
executable regression tests are part of the maintenance contract. The existing
brace-expansion compatibility override has a separate purpose: it delegates
to the registry alias `brace-expansion-core` pinned to upstream 5.0.12. That
release fixes recursive and quadratic parsing advisories while retaining
the aggregate output-size guard. The obsolete vendored cores are removed;
the registry alias is represented in the audit graph. Local patches are not
assessed by npm audit, so a green audit must be
paired with their tests and review.

Rust lockfile updates must respect Cargo.toml's minimum Rust version. The TLS
and trust-store dependencies must be patched together. The documented RSA
exception applies
only to the unused SQLx MySQL dependency; other advisories stay blocking.

CI, security, CodeQL, and Pages workflows must pass on the merged main commit.
Close superseded dependency PRs only after their updates have landed in a
verified maintenance change.
