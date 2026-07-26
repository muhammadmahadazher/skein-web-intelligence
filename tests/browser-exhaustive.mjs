import assert from "node:assert/strict";

const endpoint = process.env.CHROME_DEBUG_URL ?? "http://127.0.0.1:9222";
const pages = await fetch(`${endpoint}/json/list`).then((response) => response.json());
const page = pages.find((candidate) => candidate.type === "page" && candidate.url.includes("localhost"));
assert.ok(page, "An isolated local Skein tab must be open");

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
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  }
  return result.result.value;
}

async function waitFor(expression, message, timeout = 12_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out: ${message}`);
}

async function clickText(text, { exact = false } = {}) {
  const clicked = await evaluate(`(() => {
    const target = [...document.querySelectorAll("button")].find((node) => {
      const label = node.textContent.trim().replace(/\\s+/g, " ");
      return node.offsetParent !== null && !node.disabled &&
        ${exact ? `label === ${JSON.stringify(text)}` : `label.includes(${JSON.stringify(text)})`};
    });
    if (!target) return false;
    target.click();
    return true;
  })()`);
  assert.equal(clicked, true, `Expected a working button containing “${text}”`);
}

async function clickAria(label) {
  const clicked = await evaluate(`(() => {
    const target = [...document.querySelectorAll("button")].find(
      (node) => node.getAttribute("aria-label") === ${JSON.stringify(label)} &&
        node.offsetParent !== null && !node.disabled
    );
    if (!target) return false;
    target.click();
    return true;
  })()`);
  assert.equal(clicked, true, `Expected a working button labelled “${label}”`);
}

async function setInput(selector, value) {
  const changed = await evaluate(`(() => {
    const input = document.querySelector(${JSON.stringify(selector)});
    if (!input) return false;
    const prototype = input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : input instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value").set;
    setter.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  })()`);
  assert.equal(changed, true, `Expected input ${selector}`);
}

async function headingContains(value) {
  await waitFor(
    `document.querySelector(".heading h1")?.textContent.includes(${JSON.stringify(value)})`,
    `heading to contain ${value}`,
  );
}

async function closeDialog() {
  await clickAria("Close dialog");
  await waitFor("!document.querySelector('.action-dialog')", "dialog to close");
}

const audit = [];
function passed(name) {
  audit.push(name);
}

await command("Emulation.setDeviceMetricsOverride", {
  width: 1440,
  height: 1000,
  deviceScaleFactor: 1,
  mobile: false,
  screenWidth: 1440,
  screenHeight: 1000,
});
await command("Page.reload", { ignoreCache: true });
await waitFor("document.readyState === 'complete'", "initial page load");
const authReset = await evaluate(`(async () => {
  sessionStorage.clear();
  return await new Promise((resolve) => {
    const request = indexedDB.deleteDatabase("skein-local-identity");
    request.onsuccess = () => resolve(true);
    request.onerror = () => resolve(false);
    request.onblocked = () => resolve(false);
  });
})()`);
assert.equal(authReset, true, "Local auth database must reset for an isolated browser run");
await command("Page.reload", { ignoreCache: true });
await waitFor("Boolean(document.querySelector('#auth-email'))", "local sign-in gateway");

const authLayout = await evaluate(`({
  client: document.documentElement.clientWidth,
  scroll: document.documentElement.scrollWidth,
  title: document.querySelector("#auth-title")?.textContent ?? "",
  guest: [...document.querySelectorAll("button")].some((node) => node.textContent.includes("Continue as guest")),
})`);
assert.equal(authLayout.scroll, authLayout.client, "Authentication screen must not overflow horizontally");
assert.match(authLayout.title, /Welcome back/);
assert.equal(authLayout.guest, true);

await clickText("Create account", { exact: true });
await waitFor("Boolean(document.querySelector('#auth-name'))", "local account form");
await setInput("#auth-name", "Ada Lovelace");
await setInput("#auth-email", "ADA@example.com");
await setInput("#auth-password", "Password123!");
await setInput("#auth-confirm-password", "Password123!");
assert.equal(
  await evaluate(`document.querySelector(".auth-primary")?.disabled`),
  true,
  "Common weak passwords must keep account creation disabled",
);
await setInput("#auth-password", "Nebula!Vector7#Pulse");
await setInput("#auth-confirm-password", "Nebula!Vector7#Wrong");
assert.equal(
  await evaluate(`document.querySelector(".auth-primary")?.disabled`),
  true,
  "Mismatched passwords must keep account creation disabled",
);
await setInput("#auth-confirm-password", "Nebula!Vector7#Pulse");
await waitFor("document.querySelector('.auth-primary')?.disabled === false", "strong password acceptance");
await clickText("Create local account", { exact: true });
await waitFor("Boolean(document.querySelector('#crawl-url'))", "account-authenticated workspace", 20_000);

const localAccountProof = await evaluate(`new Promise((resolve, reject) => {
  const request = indexedDB.open("skein-local-identity", 1);
  request.onerror = () => reject(request.error);
  request.onsuccess = () => {
    const database = request.result;
    const read = database.transaction("accounts", "readonly").objectStore("accounts").get("ada@example.com");
    read.onerror = () => reject(read.error);
    read.onsuccess = () => {
      const account = read.result;
      database.close();
      resolve({
        email: account?.email,
        iterations: account?.iterations,
        hasPlaintextPassword: account ? Object.hasOwn(account, "password") : true,
        proofLength: account?.passwordProof?.length ?? 0,
        saltLength: account?.salt?.length ?? 0,
        session: JSON.parse(sessionStorage.getItem("skein.auth.session.v1") || "null"),
      });
    };
  };
})`);
assert.equal(localAccountProof.email, "ada@example.com");
assert.equal(localAccountProof.iterations, 600_000);
assert.equal(localAccountProof.hasPlaintextPassword, false);
assert.ok(localAccountProof.proofLength >= 40, "Stored password proof must be a derived 256-bit value");
assert.ok(localAccountProof.saltLength >= 20, "Stored account must have an independent random salt");
assert.equal(localAccountProof.session.email, "ada@example.com");
passed("strong signup + local password proof");

await clickAria("Open profile");
await waitFor("document.querySelector('.account-popover')?.textContent.includes('ada@example.com')", "signed-in account menu");
await clickText("Sign out", { exact: true });
await waitFor("Boolean(document.querySelector('#auth-email'))", "signed-out gateway");
await setInput("#auth-email", "ada@example.com");
await setInput("#auth-password", "Wrong!Vector7#Pulse");
await clickText("Sign in securely", { exact: true });
await waitFor("document.querySelector('[role=alert]')?.textContent.includes('Email or password is incorrect')", "generic wrong-password error", 20_000);
await setInput("#auth-password", "Nebula!Vector7#Pulse");
await clickText("Sign in securely", { exact: true });
await waitFor("Boolean(document.querySelector('#crawl-url'))", "returning local sign-in", 20_000);
assert.match(await evaluate("document.querySelector('.heading h1')?.textContent ?? ''"), /Ada/);
passed("sign out + generic failure + returning sign in");

await clickAria("Open profile");
await clickText("Sign out", { exact: true });
await waitFor("Boolean(document.querySelector('#auth-email'))", "gateway before guest mode");
await clickText("Continue as guest");
await waitFor("Boolean(document.querySelector('#crawl-url'))", "guest workspace");
assert.match(await evaluate("document.querySelector('.heading h1')?.textContent ?? ''"), /Guest/);
passed("ephemeral guest mode");

const desktopLayout = await evaluate(`({
  viewport: innerWidth,
  client: document.documentElement.clientWidth,
  scroll: document.documentElement.scrollWidth,
  glass: getComputedStyle(document.querySelector(".composer")).backdropFilter,
})`);
assert.equal(desktopLayout.scroll, desktopLayout.client, "Desktop must not overflow horizontally");
assert.match(desktopLayout.glass, /blur/);
passed("desktop layout + visible glass");

await clickAria("Help center");
await waitFor("document.querySelector('.action-dialog')?.textContent.includes('A crawl you can understand')", "help dialog");
await closeDialog();
await clickAria("Notifications");
await waitFor("document.querySelector('.action-dialog')?.textContent.includes('No unresolved incidents')", "notifications dialog");
await closeDialog();
await clickAria("Open profile");
await waitFor("document.querySelector('.account-popover')?.textContent.includes('Guest operator')", "profile menu");
await clickAria("Close account menu");
await waitFor("!document.querySelector('.account-popover')", "profile menu to close");
await evaluate("document.querySelector('.workspace').click()");
await waitFor("document.querySelector('.action-dialog')?.textContent.includes('Guest workspace')", "workspace dialog");
await closeDialog();
passed("header + workspace controls");

await clickText("Advanced", { exact: true });
await waitFor("Boolean(document.querySelector('.advanced-panel'))", "advanced controls");
await setInput(".advanced-panel label:nth-child(1) input", "8");
await setInput(".advanced-panel label:nth-child(2) input", "1");
await setInput(".advanced-panel label:nth-child(3) input", "4");
await clickText("JavaScript adaptive");
await waitFor(
  `[...document.querySelectorAll(".options button")].some((node) => node.textContent.includes("JavaScript never"))`,
  "JavaScript strategy cycle",
);
await clickText("JavaScript never");
await clickText("JavaScript always");
await waitFor(
  `[...document.querySelectorAll(".options button")].some((node) => node.textContent.includes("JavaScript adaptive"))`,
  "JavaScript strategy cycle back",
);
await setInput("#crawl-url", "http://127.0.0.1/admin");
await evaluate("document.querySelector('#crawl-url').form.requestSubmit()");
await waitFor("document.querySelector('[role=alert]')?.textContent.includes('Private and link-local')", "private URL block");
passed("advanced options + URL guard");

await setInput("#crawl-url", "https://example.com/");
await evaluate("document.querySelector('#crawl-url').form.requestSubmit()");
await waitFor("Boolean(document.querySelector('.crawl-journey'))", "example.com crawl journey to appear");
await waitFor(
  `document.querySelector(".crawl-journey")?.classList.contains("is-complete")`,
  "live example.com scan to complete",
  30_000,
);
assert.match(
  await evaluate("document.querySelector('.result-reveal')?.textContent ?? ''"),
  /Website scan complete/,
);
assert.equal(
  Number(await evaluate("document.querySelector('.journey-stats > div:nth-child(3) strong')?.textContent ?? '0'")),
  1,
  "example.com must produce one evidence record",
);

await setInput("#crawl-url", "https://www.python.org/");
await evaluate("document.querySelector('#crawl-url').form.requestSubmit()");
await waitFor("Boolean(document.querySelector('.crawl-journey'))", "crawl journey to appear");
await waitFor(
  `document.querySelector(".crawl-journey")?.classList.contains("is-complete")`,
  "live python.org scan to complete",
  30_000,
);
assert.match(
  await evaluate("document.querySelector('.result-reveal')?.textContent ?? ''"),
  /Website scan complete/,
);
assert.ok(
  Number(await evaluate("document.querySelector('.journey-stats > div:nth-child(3) strong')?.textContent ?? '0'")) >= 1,
  "Completed crawl must expose evidence",
);
passed("two real crawls + progress + ETA + results");

await clickText("View run");
await headingContains("Every run");
await setInput(".toolbar input", "Python");
await waitFor("document.querySelectorAll('.run-option').length === 1", "run search filter");
await setInput(".toolbar input", "");
await clickText("All statuses");
await waitFor(`[...document.querySelectorAll(".toolbar button")].some((node) => node.textContent.includes("Running"))`, "status filter cycle");
await clickText("All time");
await waitFor(`[...document.querySelectorAll(".toolbar button")].some((node) => node.textContent.includes("Last 24 hours"))`, "date range cycle");
for (let index = 0; index < 5; index += 1) {
  await evaluate("document.querySelectorAll('.toolbar .soft-btn')[0].click()");
  await new Promise((resolve) => setTimeout(resolve, 30));
}
await waitFor(`[...document.querySelectorAll(".toolbar button")].some((node) => node.textContent.includes("All statuses"))`, "status filter reset");
await clickAria("Refresh runs");
await waitFor("document.querySelector('.toast')?.textContent.includes('Runs refreshed')", "run refresh notification");
await clickText("Open-source radar");
await clickText("Resume", { exact: true });
await waitFor(`[...document.querySelectorAll(".run-detail button")].some((node) => node.textContent.trim() === "Pause")`, "demo run resume");
await clickText("Pause", { exact: true });
await waitFor("document.querySelector('.run-detail')?.textContent.includes('Paused')", "demo run pause");
await clickText("Cancel", { exact: true });
await waitFor("document.querySelector('.run-detail')?.textContent.includes('Cancelled')", "demo run cancel");
await clickText("New run");
await headingContains("Good afternoon");
passed("run search + filters + refresh + lifecycle controls");

await clickText("Sources");
await headingContains("The web");
await clickText("Add source");
await waitFor("Boolean(document.querySelector('.source-wizard'))", "source wizard");
await setInput(".source-wizard input", "example.org");
await clickText("Register source");
await waitFor(`[...document.querySelectorAll(".source-card")].some((node) => node.textContent.includes("example.org"))`, "source registration");
await clickAria("Open settings for example.org");
await waitFor("Boolean(document.querySelector('.inline-policy'))", "source policy");
await clickText("Verify policy");
await waitFor("document.querySelector('.toast')?.textContent.includes('Policy checked')", "source policy verification");
passed("source registration + policy controls");

await clickText("Data explorer");
await headingContains("From pages");
await setInput(".record-search input", "Python");
await clickText("Search", { exact: true });
await waitFor("document.querySelector('.toast')?.textContent.includes('Search complete')", "evidence search");
await clickText("Reset", { exact: true });
await waitFor("document.querySelector('.record-search input').value === ''", "filter reset");
await evaluate(`document.querySelectorAll(".filters fieldset")[1].querySelectorAll("input")[1].click()`);
await waitFor(
  `document.querySelectorAll(".filters fieldset")[1].querySelectorAll("input")[1].checked`,
  "304 status filter to enable",
);
await evaluate(`document.querySelectorAll(".filters fieldset")[1].querySelectorAll("input")[0].click()`);
await waitFor(
  `document.querySelector(".panel-head h3")?.textContent.includes("0 evidence records")`,
  "status filters to constrain evidence results",
);
await clickText("Reset", { exact: true });
await waitFor(
  `document.querySelectorAll(".filters fieldset")[1].querySelectorAll("input")[0].checked &&
   !document.querySelectorAll(".filters fieldset")[1].querySelectorAll("input")[1].checked`,
  "status filters to reset",
);
await clickText("Slowest fetch");
await waitFor(`[...document.querySelectorAll(".panel-actions button")].some((node) => node.textContent.includes("Fastest fetch"))`, "sort toggle");
await evaluate("document.querySelector('.record-table input[type=checkbox]').click()");
await clickText("Export (1)");
await waitFor("document.querySelector('.toast')?.textContent.includes('Export ready')", "evidence export");
await waitFor(
  `([...document.querySelectorAll(".table-foot button")].find((node) => node.textContent.includes("Next"))?.disabled) === false`,
  "live results to make pagination actionable",
);
const canPage = await evaluate(`!([...document.querySelectorAll(".table-foot button")].find((node) => node.textContent.includes("Next"))?.disabled)`);
assert.equal(canPage, true, "Live results must make pagination actionable");
await clickText("Next", { exact: true });
await waitFor(`[...document.querySelectorAll(".table-foot button")].find((node) => node.textContent.includes("Previous"))?.disabled === false`, "next page");
await clickText("Previous", { exact: true });
passed("explorer search + source/status filters + reset + sort + select + export + pagination");

await clickText("Schemas", { exact: true });
await headingContains("Schemas that");
await clickAria("Create schema");
await waitFor("document.querySelector('.schema-editor')?.textContent.includes('custom_schema')", "schema creation");
await clickText("company_profile");
await waitFor("document.querySelector('.schema-editor')?.textContent.includes('company_profile')", "schema selection");
await clickText("Run fixtures");
await waitFor("document.querySelector('.schema-editor')?.textContent.includes('Fixtures passed')", "schema fixtures");
passed("schema creation + selection + fixtures");

await clickText("Network", { exact: true });
await headingContains("See the whole");
await clickText("Pause traffic");
await waitFor("document.querySelector('.topology')?.textContent.includes('Traffic paused')", "topology pause");
await clickText("Resume traffic");
await waitFor("document.querySelector('.topology')?.textContent.includes('Live topology')", "topology resume");
assert.match(await evaluate("document.querySelector('.architecture-verdict')?.textContent ?? ''"), /Architecture verdict/);
passed("network traffic + architecture verdict");

await clickText("Quality lab", { exact: true });
await headingContains("Trust is");
for (let index = 1; index <= 4; index += 1) {
  await clickText("Run drill");
  await waitFor(`document.querySelectorAll(".drills .badge-green").length >= ${index}`, `quality drill ${index}`);
}
passed("all quality drills");

await clickText("Settings", { exact: true });
await headingContains("Quiet defaults");
for (const tab of ["Safety", "API access", "Notifications", "Retention"]) {
  await clickText(tab, { exact: true });
  await waitFor(`document.querySelector(".settings-card h2")?.textContent === ${JSON.stringify(tab)}`, `${tab} settings`);
  await clickText("Run configuration check");
  await waitFor("Boolean(document.querySelector('.toast'))", `${tab} configuration check`);
}
await clickText("General", { exact: true });
const beforeSwitches = await evaluate(`[...document.querySelectorAll("[role=switch]")].map((node) => node.getAttribute("aria-checked"))`);
await evaluate(`[...document.querySelectorAll("[role=switch]")].forEach((node) => node.click())`);
const afterSwitches = await evaluate(`[...document.querySelectorAll("[role=switch]")].map((node) => node.getAttribute("aria-checked"))`);
assert.deepEqual(afterSwitches, beforeSwitches.map((value) => String(value !== "true")), "Every settings switch must toggle");
await clickText("Save changes");
await waitFor("document.querySelector('.settings-card footer')?.textContent.includes('Saved')", "settings save");
passed("all settings tabs + switches + save");

await evaluate(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }))`);
await waitFor("Boolean(document.querySelector('.palette'))", "command palette");
await setInput(".palette input", "Network");
await evaluate("document.querySelector('.palette input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))");
await headingContains("See the whole");
passed("command palette navigation");

for (const label of ["Docs", "API", "Status"]) {
  await evaluate("document.querySelector('.product-footer').scrollIntoView({ block: 'center' })");
  await clickText(label, { exact: true });
  await waitFor("Boolean(document.querySelector('.action-dialog'))", `${label} dialog`);
  await closeDialog();
}
await clickText("Collapse", { exact: true });
await waitFor("document.querySelector('.sidebar').classList.contains('collapsed')", "sidebar collapse");
await clickText("Expand", { exact: true });
await waitFor("!document.querySelector('.sidebar').classList.contains('collapsed')", "sidebar expand");
passed("footer dialogs + sidebar collapse");

await clickText("Overview");
assert.equal(await evaluate(`(() => { const button = document.querySelector('button[aria-label*="python.org"]'); if (!button) return false; button.click(); return true; })()`), true, "python.org row action");
await waitFor("document.querySelector('.action-dialog')?.textContent.includes('Run actions')", "row action dialog");
await closeDialog();
await clickText("All signals");
await waitFor(`[...document.querySelectorAll(".section-head button")].some((node) => node.textContent.includes("Content changes"))`, "signal filter");
await waitFor("document.querySelectorAll('.signal-card').length === 2", "signal filter updates the visible cards");
await clickAria("Change signal layout");
await waitFor("document.querySelector('.signals').classList.contains('compact-signals')", "signal layout");
await clickText("Explore cluster");
await headingContains("From pages");
passed("table actions + signal controls");

await command("Emulation.setDeviceMetricsOverride", {
  width: 390,
  height: 844,
  deviceScaleFactor: 1,
  mobile: true,
  screenWidth: 390,
  screenHeight: 844,
});
await command("Page.reload", { ignoreCache: true });
await new Promise((resolve) => setTimeout(resolve, 700));
await waitFor("Boolean(document.querySelector('.heading'))", "mobile app");
const mobileLayout = await evaluate(`({
  client: document.documentElement.clientWidth,
  scroll: document.documentElement.scrollWidth,
  composerRight: document.querySelector(".composer")?.getBoundingClientRect().right,
})`);
assert.equal(mobileLayout.scroll, mobileLayout.client, "Mobile must not overflow horizontally");
assert.ok(mobileLayout.composerRight <= 390.5, "Mobile composer must fit the viewport");
await clickAria("Open navigation");
await waitFor("document.querySelector('.sidebar').classList.contains('open')", "mobile drawer open");
await clickText("Quality lab", { exact: true });
await headingContains("Trust is");
await waitFor("!document.querySelector('.sidebar').classList.contains('open')", "mobile drawer close after navigation");
passed("mobile drawer + responsive layout");

await clickAria("Open profile");
await waitFor("Boolean(document.querySelector('.account-popover'))", "mobile guest account menu");
await clickText("Exit guest mode", { exact: true });
await waitFor("Boolean(document.querySelector('#auth-email'))", "mobile authentication gateway");
const mobileAuthLayout = await evaluate(`({
  client: document.documentElement.clientWidth,
  scroll: document.documentElement.scrollWidth,
  panelRight: document.querySelector(".auth-panel")?.getBoundingClientRect().right,
  primaryRight: document.querySelector(".auth-primary")?.getBoundingClientRect().right,
  mobileBrandVisible: document.querySelector(".auth-mobile-brand")?.getBoundingClientRect().height > 0,
})`);
assert.equal(mobileAuthLayout.scroll, mobileAuthLayout.client, "Mobile auth must not overflow horizontally");
assert.ok(mobileAuthLayout.panelRight <= 390.5, "Mobile auth panel must fit the viewport");
assert.ok(mobileAuthLayout.primaryRight <= 370.5, "Mobile auth action must fit the content column");
assert.equal(mobileAuthLayout.mobileBrandVisible, true, "Mobile auth must retain visible Skein branding");
passed("mobile authentication layout");

console.log(JSON.stringify({ ok: true, checks: audit.length, audit, desktopLayout, mobileLayout, mobileAuthLayout }, null, 2));
await new Promise((resolve) => {
  const timer = setTimeout(resolve, 250);
  socket.addEventListener("close", () => {
    clearTimeout(timer);
    resolve();
  }, { once: true });
  socket.close();
});
