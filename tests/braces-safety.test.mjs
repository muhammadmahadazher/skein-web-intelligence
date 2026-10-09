import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const braces = require("braces");
const depthError = { code: "ERR_BRACES_DEPTH" };

test("installed glob consumers resolve the patched local package", () => {
  assert.equal(require("braces/package.json").version, "3.0.3-skein.1");
  const consumer = createRequire(require.resolve("micromatch"));
  assert.equal(consumer.resolve("braces"), require.resolve("braces"));
  const pattern = "{".repeat(1000) + "a,b" + "}".repeat(1000);
  assert.throws(() => require("micromatch").braces(pattern), depthError);
});

test("patched braces preserves common glob, range, escape, and array behavior", () => {
  assert.deepEqual(braces("src/{app,lib}/*.{ts,tsx}", { expand: true }), [
    "src/app/*.ts", "src/app/*.tsx", "src/lib/*.ts", "src/lib/*.tsx",
  ]);
  assert.deepEqual(braces.expand("item-{01..03}"), ["item-01", "item-02", "item-03"]);
  assert.equal(braces.compile("{a,b}"), "(a|b)");
  assert.deepEqual(braces(["{a,b}", "{b,c}"], { expand: true, nodupes: true }), ["a", "b", "c"]);
  assert.equal(braces.stringify(braces.parse("x/{a,b}")), "x/{a,b}");
  assert.deepEqual(braces.expand(String.raw`\{a,b\}`), ["{a,b}"]);
});

test("deep braces and parentheses fail safely across every string entry point", () => {
  for (const [open, close] of [["{", "}"], ["(", ")"]]) {
    for (const suffix of [close.repeat(4000), ""]) {
      const pattern = open.repeat(4000) + "a,b" + suffix;
      for (const method of ["parse", "compile", "expand", "stringify", "create"]) {
        assert.throws(() => braces[method](pattern, { maxDepth: Infinity }), depthError);
      }
      assert.throws(() => braces(pattern), depthError);
    }
  }
});

test("nesting limit respects escaped, quoted, and bracketed literal text", () => {
  const literal = "{".repeat(200);
  assert.equal(braces.stringify(braces.parse(`"${literal}"`)), literal);
  assert.equal(braces.stringify(braces.parse(`[${literal}]`)), `[${literal}]`);
  assert.equal(braces.stringify(braces.parse(String.raw`\{`.repeat(200))), literal);
  assert.doesNotThrow(() => braces.compile("{".repeat(127) + "a,b" + "}".repeat(127)));
  assert.throws(() => braces.parse("{".repeat(128)), depthError);
});

test("direct and cyclic ASTs cannot bypass recursive walker depth guards", () => {
  for (const method of ["compile", "expand", "stringify"]) {
    let ast = { type: "text", value: "x" };
    for (let index = 0; index < 1000; index += 1) {
      const parent = { type: "root", nodes: [ast] };
      ast.parent = parent;
      ast = parent;
    }
    assert.throws(() => braces[method](ast), depthError);
  }
  const cycle = { type: "root", nodes: [] };
  cycle.nodes.push(cycle);
  for (const method of ["compile", "expand", "stringify"]) {
    assert.throws(() => braces[method](cycle), depthError);
  }
});
