import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import test from "node:test";

const require = createRequire(import.meta.url);
const expand = require("brace-expansion");
const core = require("brace-expansion-core");

test("legacy callable adapter delegates to the patched registry release", () => {
  assert.equal(expand, core.expand);
  assert.equal(require("brace-expansion-core/package.json").version, "5.0.12");
  assert.deepEqual(expand("{a,b}{01..03}"), ["a01", "a02", "a03", "b01", "b02", "b03"]);
  assert.deepEqual(expand(""), []);
  assert.deepEqual(expand(String.raw`\{a,b\}`), ["{a,b}"]);
  assert.equal(core.EXPANSION_MAX_LENGTH, 4_000_000);
  assert.equal(core.EXPANSION_MAX_DEPTH, 1000);
  assert.equal(core.EXPANSION_MAX_REWRITES, 1000);
});

for (const scenario of ["nested", "commas", "rewrites", "output-size"]) {
  test(`brace expansion contains ${scenario} adversarial input`, () => {
    // A broken upgrade must fail the test, not hang or crash the test runner.
    const child = spawnSync(process.execPath, ["-e", `
      const assert = require('node:assert/strict');
      const expand = require('brace-expansion');
      const scenario = ${JSON.stringify(scenario)};
      const patterns = {
        nested: '{'.repeat(4000) + 'a,b' + '}'.repeat(4000),
        commas: '{' + 'a,{b},'.repeat(4000) + 'z}',
        rewrites: '{a}' + '}'.repeat(32000) + ',z}',
        'output-size': '{a,b}'.repeat(1500),
      };
      const rows = expand(patterns[scenario], { max: 1000, maxLength: 10000 });
      assert.ok(Array.isArray(rows));
      assert.ok(rows.length <= 1000);
      assert.ok(rows.reduce((size, row) => size + row.length, 0) <= 10000);
    `], { timeout: 10_000, maxBuffer: 100_000, encoding: "utf8" });
    assert.equal(child.error, undefined, child.error?.message);
    assert.equal(child.signal, null, `Child terminated with ${child.signal}`);
    assert.equal(child.status, 0, child.stderr);
  });
}
