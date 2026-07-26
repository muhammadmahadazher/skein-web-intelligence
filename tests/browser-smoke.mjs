import assert from "node:assert/strict";

const endpoint = process.env.CHROME_DEBUG_URL ?? "http://127.0.0.1:9222";
const width = Number(process.env.QA_WIDTH ?? 390);
const height = Number(process.env.QA_HEIGHT ?? 844);
const pages = await fetch(`${endpoint}/json/list`).then((response) => response.json());
const page = pages.find((candidate) => candidate.type === "page" && candidate.url.includes("localhost"));
assert.ok(page, "A local Skein tab must be open in Chrome debugging mode");

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

let sequence = 0;
const pending = new Map();
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(message.error.message));
  else resolve(message.result);
});

function command(method, params = {}) {
  const id = ++sequence;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression) {
  const result = await command("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

await command("Emulation.setDeviceMetricsOverride", {
  width,
  height,
  deviceScaleFactor: 1,
  mobile: width <= 680,
  screenWidth: width,
  screenHeight: height,
});
await evaluate("new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
for (let attempt = 0; attempt < 80; attempt += 1) {
  const surface = await evaluate(`({
    auth: Boolean(document.querySelector("#auth-email")),
    workspace: Boolean(document.querySelector("#crawl-url")),
  })`);
  if (surface.workspace) break;
  if (surface.auth) {
    const entered = await evaluate(`(() => {
      const button = [...document.querySelectorAll("button")].find(
        (node) => node.textContent.includes("Continue as guest")
      );
      if (!button) return false;
      button.click();
      return true;
    })()`);
    assert.equal(entered, true, "Guest entry must be available for isolated smoke tests");
  }
  await new Promise((resolve) => setTimeout(resolve, 50));
}
assert.equal(
  await evaluate("Boolean(document.querySelector('#crawl-url'))"),
  true,
  "Skein workspace must load after local or guest authentication",
);

const layout = await evaluate(`(() => {
  const rect = (selector) => {
    const node = document.querySelector(selector);
    if (!node) return null;
    const box = node.getBoundingClientRect();
    return { left: box.left, right: box.right, top: box.top, width: box.width };
  };
  return {
    viewport: { width: innerWidth, height: innerHeight },
    document: {
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    },
    composer: rect(".composer"),
    headline: rect(".composer h2"),
    action: rect(".url-box button"),
  };
})()`);

assert.equal(layout.viewport.width, width);
assert.equal(
  layout.document.scrollWidth,
  layout.document.clientWidth,
  `No horizontal overflow: ${JSON.stringify(layout)}`,
);
for (const [name, box] of Object.entries({
  composer: layout.composer,
  headline: layout.headline,
  action: layout.action,
})) {
  assert.ok(box, `${name} must exist`);
  assert.ok(box.left >= 0, `${name} must begin inside the viewport`);
  assert.ok(box.right <= layout.viewport.width + 0.5, `${name} must end inside the viewport`);
}

async function clickByText(text) {
  return evaluate(`(() => {
    const target = [...document.querySelectorAll("button")].find(
      (node) => node.textContent.trim().includes(${JSON.stringify(text)})
    );
    if (!target) return false;
    target.click();
    return true;
  })()`);
}

assert.equal(await clickByText("Crawl runs"), true);
assert.match(await evaluate("document.querySelector('.heading h1')?.textContent ?? ''"), /Every run/);

assert.equal(await clickByText("Quality lab"), true);
assert.match(await evaluate("document.querySelector('.heading h1')?.textContent ?? ''"), /Trust/);

await evaluate(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))`);
assert.equal(await evaluate("Boolean(document.querySelector('[role=dialog]'))"), true);
await evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))");
assert.equal(await evaluate("Boolean(document.querySelector('[role=dialog]'))"), false);

assert.equal(await clickByText("Overview"), true);
await evaluate(`(() => {
  const input = document.querySelector("#crawl-url");
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
  setter.call(input, "http://127.0.0.1/admin");
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.form.requestSubmit();
})()`);
assert.match(
  await evaluate("document.querySelector('[role=alert]')?.textContent ?? ''"),
  /Private and link-local/,
);

console.log(JSON.stringify({ ok: true, layout }));
await new Promise((resolve) => {
  const timer = setTimeout(resolve, 250);
  socket.addEventListener(
    "close",
    () => {
      clearTimeout(timer);
      resolve();
    },
    { once: true },
  );
  socket.close();
});
