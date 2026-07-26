# Contributing to Skein

Thank you for helping make observable, policy-aware web intelligence better.
Contributions of code, tests, documentation, examples, accessibility fixes, and
carefully scoped design improvements are welcome.

## Before you start

1. Search [existing issues](https://github.com/muhammadmahadazher/skein-web-intelligence/issues).
2. Open a proposal before large architectural work so we can agree on scope.
3. Use Skein only against sites you are authorized to crawl.
4. Never weaken SSRF, DNS, redirect, robots, timeout, or body-size controls to
   make a test target pass.

## Development setup

Follow the platform instructions in the [README](README.md#installation) or the
detailed [runbook](RUNBOOK.md). The shortest cross-platform setup is:

```bash
npm ci
cd services/control-plane
uv sync --locked --extra dev
cd ../fetcher
cargo fetch --locked
```

Run the web console and API in separate terminals:

```bash
npm run dev
```

```bash
cd services/control-plane
uv run --locked --extra dev uvicorn skein.main:app --reload --host 127.0.0.1 --port 8000
```

## Quality gates

Run the checks relevant to your change, and preferably the full matrix:

```bash
npm run typecheck
npm run lint
npm test
npm run test:demo

cd services/control-plane
uv run --locked --extra dev ruff format --check skein tests
uv run --locked --extra dev ruff check skein tests
uv run --locked --extra dev mypy skein
uv run --locked --extra dev pytest -W error

cd ../fetcher
cargo fmt --all -- --check
cargo test --locked --all-targets
cargo clippy --locked --all-targets -- -D warnings
```

## Pull requests

- Keep one coherent change per pull request.
- Explain the user problem, the chosen behavior, and any security trade-offs.
- Add regression coverage for bugs.
- Update documentation when behavior, commands, APIs, or architecture changes.
- Include screenshots or a short recording for visual changes.
- Use clear commit messages in the imperative mood.

By contributing, you agree that your contribution is licensed under the
[MIT License](LICENSE).
