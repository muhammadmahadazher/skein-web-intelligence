import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const parserRequire = createRequire(require.resolve("@typescript-eslint/typescript-estree"));

test("TypeScript parser resolves patched minimatch with working glob semantics", () => {
  const [major, minor, patch] = parserRequire("minimatch/package.json").version.split(".").map(Number);
  assert.ok(major > 11 || (major === 11 && (minor > 0 || patch >= 1)));
  const { minimatch } = parserRequire("minimatch");
  assert.equal(minimatch("app/page.tsx", "app/**/*.tsx"), true);
  assert.equal(minimatch("app/page.js", "app/**/*.tsx"), false);
  assert.equal(minimatch("app/page.tsx", "app/*.{ts,tsx}"), true);
});

test("legacy ESLint consumers retain their callable minimatch interface", () => {
  const eslintRequire = createRequire(require.resolve("eslint"));
  const legacy = eslintRequire("minimatch");
  assert.equal(typeof legacy, "function");
  assert.equal(legacy("app/page.tsx", "app/*.tsx"), true);
  assert.equal(legacy("app/page.js", "app/*.tsx"), false);
});

test("level-two glob preprocessing bounds amplification and skips quadratic deduplication", () => {
  // Contain regressions in a memory- and time-bounded process.
  const child = spawnSync(process.execPath, ["--max-old-space-size=128", "-e", `
    const assert = require('node:assert/strict');
    const { createRequire } = require('node:module');
    const parserRequire = createRequire(require.resolve('@typescript-eslint/typescript-estree'));
    const { Minimatch } = parserRequire('minimatch');
    const matcher = new Minimatch('**/../a/b/'.repeat(20) + '*.ts', {
      optimizationLevel: 2, braceExpandMax: 32,
    });
    assert.ok(matcher.globParts.length <= 32);
    const large = Array.from({ length: 1001 }, (_, index) => ['dir' + index, '*.ts']);
    matcher.partsMatch = () => { throw new Error('Quadratic comparison should be skipped'); };
    assert.equal(matcher.secondPhasePreProcess(large), large);
  `], { timeout: 10_000, maxBuffer: 65_536, encoding: "utf8" });
  assert.equal(child.error, undefined, child.error?.message);
  assert.equal(child.signal, null, `Child terminated with ${child.signal}`);
  assert.equal(child.status, 0, child.stderr);
});
