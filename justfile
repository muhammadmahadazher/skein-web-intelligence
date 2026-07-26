set dotenv-load := true
set shell := ["bash", "-euo", "pipefail", "-c"]

default:
  @just --list

bootstrap:
  npm ci --ignore-scripts --no-audit
  cd services/control-plane && uv sync --locked --extra dev
  cd services/fetcher && cargo fetch --locked

db-up:
  docker compose up -d --wait postgres

test-db:
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f infrastructure/postgres/tests/invariants.sql
  cd services/control-plane && SKEIN_TEST_DATABASE_URL="$DATABASE_URL" uv run --locked --extra dev pytest -W error tests/test_postgres_api.py

test-python:
  cd services/control-plane && uv run --locked --extra dev ruff format --check skein tests
  cd services/control-plane && uv run --locked --extra dev ruff check skein tests
  cd services/control-plane && uv run --locked --extra dev mypy skein
  cd services/control-plane && uv run --locked --extra dev pytest -W error

test-rust:
  cd services/fetcher && cargo fmt --all -- --check
  cd services/fetcher && cargo test --locked --all-targets
  cd services/fetcher && cargo clippy --locked --all-targets -- -D warnings

test-web:
  npm run typecheck
  npm run lint
  npm test
  npm audit

test-live:
  node tests/browser-exhaustive.mjs
  node tests/load-api.mjs

test: test-python test-rust test-db test-web

dev:
  npm run dev

dev-api:
  cd services/control-plane && uv run --locked --extra dev uvicorn skein.main:app --reload --host 127.0.0.1 --port 8000

dev-stack:
  docker compose up --build

format:
  cd services/control-plane && uv run --locked --extra dev ruff format .
  cd services/control-plane && uv run --locked --extra dev ruff check --fix .
  cd services/fetcher && cargo fmt --all
  npm run lint -- --fix
