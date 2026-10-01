// Browser trial boot (E-02 visible step): copy -> edit one cell -> compile
// -> /trial page boots the edited copy in-browser (same-origin engine,
// direct prepare, no title, no App) -> 10 ticked days. Asserts: done,
// date advanced to 1/11, 192 cities, IDB never opened, edited cell live,
// no page errors. Fresh profile, editor ephemeral server, no SAVE.DAT.
import assert from "node:assert/strict";
import { format } from "node:util";
const tlog = (...args) => process.stdout.write(`${format(...args)}\n`);
import fs from "node:fs/promises";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { startEditorServer } from "./editor_server.mjs";
import { composeMapLayers } from "../web/src/content/authoring/maplayers.js";
const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    "C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright",
);

const tmp = mkdtempSync(join(tmpdir(), "editor-trial-"));
const server = await startEditorServer(0, tmp);
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
const errors = [];
try {
  const call = async (method, path, body) => {
    const r = await fetch(`${base}${path}`, {
      method,
      headers: { "content-type": "application/json", connection: "close" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await r.json();
    assert.equal(r.status, 200, `${method} ${path}: ${JSON.stringify(data).slice(0, 200)}`);
    return data;
  };
  await call("POST", "/api/copy", { gameId: "brow-1", ownerId: "admin-1", kind: "full" });
  const draft = await call("GET", "/api/draft?game=brow-1");
  // Isolated edit cell: current 0x20, clear of roads/cities.
  const W = draft.map.bounds.width;
  const ref = composeMapLayers(draft).terrain;
  const graph = JSON.parse(
    await fs.readFile(new URL("../web/road_graph.json", import.meta.url), "utf-8"),
  );
  const blocked = new Set();
  for (const e of graph.edges) {
    for (const p of e.points) {
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) blocked.add(`${p.x + dx},${p.y + dy}`);
      }
    }
  }
  for (const n of graph.nodes) {
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) blocked.add(`${n.x + dx},${n.y + dy}`);
    }
  }
  let cell = null;
  for (let y = 0; y < 256 && !cell; y++) {
    for (let x = 0; x < 384 && !cell; x++) {
      if (ref[y * W + x] === 0x20 && !blocked.has(`${x},${y}`)) cell = [x, y];
    }
  }
  assert.ok(cell, "need an isolated cell");
  const [ex, ey] = cell;
  const atom = draft.map.decorations.find((d) => d.x === ex && d.y === ey);
  assert.ok(atom); atom.definitionRef = "tile-16";
  assert.equal((await call("POST", "/api/save", { gameId: "brow-1", map: draft.map })).draftRevision, "2");
  assert.ok((await call("POST", "/api/validate", { gameId: "brow-1" })).valid);
  const manifest = await call("POST", "/api/compile", { gameId: "brow-1" });
  const chapter = draft.chapterOrder[1];

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  const page = await context.newPage();
  page.setDefaultTimeout(120000);
  const assetRequests = [], unexpectedRequests = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/trial-asset?")) assetRequests.push(request.url());
    if (/\/(road_graph\.json|mmap_map\.bin)(?:\?|$)/.test(request.url())) unexpectedRequests.push(request.url());
  });
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.location().url?.endsWith("/favicon.ico"))
      errors.push(message.text());
  });
  await page.goto(`${base}/trial?game=brow-1&chapter=${encodeURIComponent(chapter)}&sample=${ex},${ey}`);
  await page.waitForFunction(() => window.__trial?.done === true, null, { timeout: 110000 });
  const trial = await page.evaluate(() => window.__trial);
  tlog(`trial: ${JSON.stringify(trial)}`);
  assert.deepEqual(trial.date, [196, 1, 11], "10 days ticked");
  assert.equal(trial.cities, 192);
  assert.equal(trial.idbOpens, 0, "trial never opens IndexedDB");
  assert.equal(trial.sample, 0x10, "edited cell live in the browser trial");
  assert.equal(trial.snapshot, manifest.identity.trialSnapshotId);
  assert.equal(trial.roadAsset, manifest.assets.find((a) => a.assetId === "roadGraph").url);
  assert.deepEqual(assetRequests.sort(), manifest.assets.map((a) => base + a.url).sort(), "all compiled assets use this snapshot");
  assert.deepEqual(unexpectedRequests, [], "no built-in terrain/road fallback");
  // Formal save surface absent by construction (no App, no repository).
  const surface = await page.evaluate(() => ({
    hasSave: typeof window.__app?.saveGame === "function",
    idbOpens: window.__idbOpens,
  }));
  assert.equal(surface.hasSave, false, "no formal save entry in trial");
  assert.deepEqual(errors, [], "no page/console errors");
  tlog("browser trial OK: edited copy boots, ticks, zero IDB");
} catch (error) {
  console.error(`HARD-FAIL: ${error?.message ?? error}`);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.close();
}
