import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const serverUrl = new URL("../dist/server/index.js", import.meta.url);
  serverUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: handler } = await import(serverUrl.href);

  return handler(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Skein local identity gateway", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Skein/);
  assert.match(html, /Web intelligence, without blind spots/);
  assert.match(html, /Your web intelligence/);
  assert.match(html, /Create account/);
  assert.match(html, /Continue as guest/);
  assert.match(html, /Device secured/);
  assert.match(html, /Skein never sends account credentials/);
  assert.doesNotMatch(html, /Your site is taking shape|react-loading-skeleton|codex-preview/i);
});
