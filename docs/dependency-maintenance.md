# Dependency maintenance

React, React DOM, and React Server Components use matching versions. Dependabot
groups them with their types across production and development dependencies.
Updating the server renderer separately previously caused `npm ci` to fail
with a React peer dependency conflict.

ESLint 9 and TypeScript 6 remain pinned to the versions supported by the current
Next lint plugins. Major upgrades require checking the peer dependency graph,
lint, types, production build, and rendered application tests together.

Security overrides for fast-uri, fflate, PostCSS, and sharp select patched
versions within the upstream major line. Reevaluate them when parent packages
adopt the fixes. Lockfile updates must pass the dependency-security workflow;
do not force installs with `--legacy-peer-deps` or weaken the audit gate.

`tools/braces-safe` is a local MIT-licensed patch for the unpatched upstream
nesting advisory. Its [patch rationale](../tools/braces-safe/PATCH.md) and
executable regression tests are part of the maintenance contract. The existing
brace-expansion compatibility override has a separate purpose and remains in
place. Local patches are not assessed by npm audit, so a green audit must be
paired with their tests and review.

Rust lockfile updates must respect Cargo.toml's minimum Rust version. The TLS
dependency is patched to rustls 0.23.45. The documented RSA exception applies
only to the unused SQLx MySQL dependency; other advisories stay blocking.

CI, security, CodeQL, and Pages workflows must pass on the merged main commit.
Close superseded dependency PRs only after their updates have landed in a
verified maintenance change.
