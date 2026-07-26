import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const require = createRequire(import.meta.url);

test("ships every promised operator surface", async () => {
  const source = await read("app/skein-app.tsx");
  for (const label of [
    "Overview",
    "Crawl runs",
    "Sources",
    "Data explorer",
    "Schemas",
    "Network",
    "Quality lab",
    "Settings",
  ]) {
    assert.match(source, new RegExp(label));
  }
  assert.match(source, /aria-label="Primary"/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /application\/json/);
});

test("keeps URL safety at both service boundaries", async () => {
  const [python, rust] = await Promise.all([
    read("services/control-plane/skein/domain.py"),
    read("services/fetcher/src/lib.rs"),
  ]);
  for (const source of [python, rust]) {
    assert.match(source, /localhost/);
    assert.match(source, /private/i);
    assert.match(source, /credentials/i);
  }
  assert.match(python, /validate_resolution/);
  assert.match(rust, /validate_resolution/);
});

test("database frontier encodes lease and idempotency invariants", async () => {
  const [migration, repository] = await Promise.all([
    read("infrastructure/postgres/migrations/001_initial.sql"),
    read("services/control-plane/skein/repository.py"),
  ]);
  assert.match(migration, /UNIQUE \(run_id, url_hash\)/);
  assert.match(migration, /lease_owner IS NOT NULL/);
  assert.match(migration, /outbox_event/);
  assert.match(repository, /FOR UPDATE SKIP LOCKED/);
});

test("data explorer HTTP status filters are interactive and query-backed", async () => {
  const source = await read("app/skein-app.tsx");
  assert.match(source, /const \[statuses, setStatuses\]/);
  assert.match(source, /statuses\.has\(record\.status_code\)/);
  assert.match(source, /checked=\{statuses\.has\(status\)\}/);
  assert.match(source, /setStatuses\(\(current\) =>/);
  assert.doesNotMatch(
    source,
    /type="checkbox" checked=\{status === 200\} readOnly/,
  );
});

test("collapsed sidebar controls keep accessible names", async () => {
  const source = await read("app/skein-app.tsx");
  assert.match(source, /className="brand"[\s\S]{0,120}aria-label="Skein overview"/);
  assert.match(source, /className="workspace"[\s\S]{0,120}aria-label="Open workspace details"/);
  assert.match(source, /className="health-mini"[\s\S]{0,120}aria-label="Open network telemetry"/);
  assert.match(source, /className=\{cx\("nav-item", view === "settings"[\s\S]{0,180}aria-label="Settings"/);
  assert.match(source, /className="collapse"[\s\S]{0,160}aria-label=\{collapsed \? "Expand sidebar" : "Collapse sidebar"\}/);
});

test("overview signal filter changes the visible result set", async () => {
  const source = await read("app/skein-app.tsx");
  assert.match(source, /const showContentSignals = signalFilter !== "Data quality"/);
  assert.match(source, /const showQualitySignals = signalFilter !== "Content changes"/);
  assert.match(source, /\{showContentSignals && \(/);
  assert.match(source, /\{showQualitySignals && \(/);
});

test("patched brace expansion remains compatible with legacy lint consumers", async () => {
  const manifest = JSON.parse(await read("package.json"));
  assert.equal(manifest.dependencies.react, "19.2.8");
  assert.equal(manifest.dependencies["react-dom"], "19.2.8");
  assert.equal(manifest.devDependencies["react-server-dom-webpack"], "19.2.8");
  assert.equal(
    manifest.overrides["brace-expansion"],
    "file:tools/brace-expansion-compat",
  );

  const expand = require("brace-expansion");
  assert.deepEqual(expand("{a,b}{1,2}"), ["a1", "a2", "b1", "b2"]);

  const patchedCore = await read(
    "tools/brace-expansion-core/dist/commonjs/index.js",
  );
  assert.match(patchedCore, /EXPANSION_MAX_LENGTH = 4_000_000/);
});

test("device-local authentication stores only salted password proofs", async () => {
  const source = await read("app/local-auth.ts");
  assert.match(source, /indexedDB\.open\(DATABASE_NAME, DATABASE_VERSION\)/);
  assert.match(source, /name: "PBKDF2"/);
  assert.match(source, /hash: "SHA-256"/);
  assert.match(source, /PBKDF2_ITERATIONS = 600_000/);
  assert.match(source, /window\.crypto\.getRandomValues/);
  assert.match(source, /passwordProof: bytesToBase64\(passwordProof\)/);
  assert.match(source, /window\.sessionStorage\.setItem\(SESSION_KEY/);
  assert.doesNotMatch(source, /localStorage/);
  assert.doesNotMatch(source, /password:\s*input\.password/);
});

test("authentication surface exposes strong-password and guest controls", async () => {
  const [gate, dashboard] = await Promise.all([
    read("app/auth-gate.tsx"),
    read("app/skein-app.tsx"),
  ]);
  for (const label of [
    "Sign in",
    "Create account",
    "Password strength",
    "Continue as guest",
    "Sign out",
  ]) {
    assert.match(`${gate}\n${dashboard}`, new RegExp(label));
  }
  assert.match(gate, /assessment\.requirements\.map/);
  assert.match(gate, /Session clears when this tab closes/);
  assert.match(dashboard, /identity\.kind === "guest"/);
  assert.match(dashboard, /aria-label="Local account menu"/);
});
