import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const root = new URL("../demo/", import.meta.url);
const requiredFiles = [
  "index.html",
  "styles.css",
  "app.js",
  "manifest.webmanifest",
  "robots.txt",
  "sitemap.xml",
  "llms.txt",
  "404.html",
  "assets/skein-hero.png",
  "assets/skein-workflow.png",
  "assets/skein-console.png"
];

for (const path of requiredFiles) {
  await access(new URL(path, root));
}

const html = await readFile(new URL("index.html", root), "utf8");
const css = await readFile(new URL("styles.css", root), "utf8");
const script = await readFile(new URL("app.js", root), "utf8");
const manifest = JSON.parse(await readFile(new URL("manifest.webmanifest", root), "utf8"));

assert.match(html, /<title>Skein — Open-Source Web Intelligence Crawler<\/title>/);
assert.match(html, /application\/ld\+json/);
assert.match(html, /SoftwareApplication/);
assert.match(html, /id="demoRunForm"/);
assert.match(html, /canonical/);
assert.doesNotMatch(html, /(?:TODO|FIXME|localhost|example\.invalid)/i);
assert.match(css, /prefers-reduced-motion/);
assert.match(css, /:focus-visible/);
assert.match(script, /downloadEvidence/);
assert.match(script, /showModal/);
assert.equal(manifest.start_url, "./");

const localReferences = [...html.matchAll(/(?:src|href)="\.\/([^"#?]+)"/g)].map(
  ([, path]) => path
);
for (const path of localReferences) {
  await access(new URL(path, root));
}

console.log(`Validated ${requiredFiles.length} demo files and ${localReferences.length} local references.`);
