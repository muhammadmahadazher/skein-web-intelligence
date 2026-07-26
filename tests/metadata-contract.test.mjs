import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

test("ships request-aware social metadata and its project-local image", async () => {
  const [layout, image] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    stat(new URL("../public/og-skein.jpg", import.meta.url)),
  ]);
  assert.match(layout, /x-forwarded-host/);
  assert.match(layout, /og-skein\.jpg/);
  assert.match(layout, /summary_large_image/);
  assert.ok(image.size > 10_000, "Social image must be a substantive raster asset");
});
