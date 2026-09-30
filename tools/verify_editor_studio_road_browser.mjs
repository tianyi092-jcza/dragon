// Studio workbench v2 (E-03 slice 3): road delete + rebuild roundtrip
// through production clicks, locked-layer refusal, in-page refusal
// diagnosis, save/validate/compile clean after rebuild. Fresh profile,
// editor ephemeral server, no SAVE.DAT writes.
import assert from "node:assert/strict";
import { format } from "node:util";
const tlog = (...args) => process.stdout.write(`${format(...args)}\n`);
import fs from "node:fs/promises";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { startEditorServer } from "./editor_server.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    "C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright",
);

const saveDat = new URL("../../Dragon/SAVE.DAT", import.meta.url);
const mtimeBefore = (await fs.stat(saveDat)).mtimeMs;
const tmp = mkdtempSync(join(tmpdir(), "editor-studio-v2-"));
const server = await startEditorServer(0, tmp);
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
const errors = [];
try {
  const call = async (method, path, body) => {
    const init = { method, headers: { "content-type": "application/json" } };
    if (body !== undefined) init.body = JSON.stringify(body);
    const r = await fetch(`${base}${path}`, init);
    const data = await r.json();
    assert.equal(r.status, 200, `${method} ${path}: ${JSON.stringify(data).slice(0, 200)}`);
    return data;
  };
  await call("POST", "/api/copy", { gameId: "studio-3", ownerId: "admin-1", kind: "minimal" });
  const draft0 = await call("GET", "/api/draft?game=studio-3");
  const road0 = draft0.map.roads.find((r) => r.id === "road-0");
  assert.ok(road0 && road0.geometry.length >= 3, "road-0 exists to roundtrip");

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error" && message.text().includes("400 (Bad Request)")) return;
    if (message.type() === "error" && !message.location().url?.endsWith("/favicon.ico"))
      errors.push(message.text());
  });
  await page.goto(`${base}/studio?game=studio-3`);
  await page.waitForFunction(() => window.__studio?.draft != null, null, { timeout: 30000 });

  async function clickTile(tx, ty) {
    const pt = await page.evaluate(
      ({ tx, ty }) => {
        const r = document.getElementById("cv").getBoundingClientRect();
        const ui = window.__studio;
        return {
          x: r.left + 1 + (tx * 16 + 8 - ui.cam.x),
          y: r.top + 1 + (ty * 16 + 8 - ui.cam.y),
        };
      },
      { tx, ty },
    );
    await page.mouse.click(pt.x, pt.y);
  }
  async function setToolLayer(tool, layer) {
    await page.evaluate(
      ({ tool, layer }) => {
        const ui = window.__studio;
        ui.tool = tool;
        ui.layer = layer;
        ui.pendingMove = false;
        ui.roadDraft = [];
        document.getElementById("roadbar").style.display = "none";
      },
      { tool, layer },
    );
  }
  const status = () => page.evaluate(() => document.getElementById("status").textContent);

  // Locked-layer refusal first (roads locked by default). Pan to road-0.
  await setToolLayer("road", "roads");
  await page.evaluate((pt) => {
    window.__studio.cam.x = pt.x * 16 - 480;
    window.__studio.cam.y = 0;
  }, road0.geometry[0]);
  await clickTile(road0.geometry[0].x, road0.geometry[0].y);
  assert.ok((await status()).includes("locked"), "locked roads refused");

  // Unlock via the lock button, then delete road-0 by clicking its middle.
  await page.click("#lock");
  await setToolLayer("del", "roads");
  const mid = road0.geometry[Math.floor(road0.geometry.length / 2)];
  await clickTile(mid.x, mid.y);
  await page.waitForTimeout(300);
  let ids = await page.evaluate(() => window.__studio.draft.map.roads.map((r) => r.id));
  assert.ok(!ids.includes("road-0"), "road-0 deleted");
  tlog("delete road-0 via clicks");

  // Rebuild the same geometry via clicks, finish, choose land.
  await setToolLayer("road", "roads");
  for (const p of road0.geometry) await clickTile(p.x, p.y);
  const last = road0.geometry[road0.geometry.length - 1];
  await clickTile(last.x, last.y); // click last again to finish
  await page.waitForFunction(() => document.getElementById("roadbar").style.display !== "none", null, {
    timeout: 15000,
  });
  await page.evaluate(() => {
    [...document.querySelectorAll('#roadbar button[data-kind="land"]')].at(0)?.click();
  });
  await page.waitForFunction(() => document.getElementById("status").textContent.startsWith("built road-"), null, {
    timeout: 15000,
  });
  tlog(await status());

  // Save + validate clean + compile passes with the rebuilt road.
  await page.click("#save");
  await page.waitForFunction(() => document.getElementById("status").textContent.startsWith("saved rev "), null, {
    timeout: 15000,
  });
  await page.click("#validate");
  await page.waitForFunction(() => document.getElementById("status").textContent === "valid", null, {
    timeout: 15000,
  });
  await page.click("#compile");
  await page.waitForFunction(() => document.getElementById("status").textContent.startsWith("compiled rev "), null, {
    timeout: 15000,
  });
  const stored = await call("GET", "/api/draft?game=studio-3");
  const rebuilt = stored.map.roads.find((r) => /-new$/.test(r.id));
  assert.ok(rebuilt, "rebuilt road persisted");
  assert.equal(rebuilt.nativeBinding.weight, road0.nativeBinding?.weight ?? rebuilt.nativeBinding.weight);
  tlog(`rebuild persisted as ${rebuilt.id}, cost ${rebuilt.nativeBinding.weight}`);
  tlog("studio v2 OK: road delete + rebuild roundtrip through clicks");
  assert.deepEqual(errors, [], "no page/console errors");
} catch (error) {
  console.error(`HARD-FAIL: ${error?.message ?? error}`);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.close();
}
const mtimeAfter = (await fs.stat(saveDat)).mtimeMs;
assert.equal(mtimeAfter, mtimeBefore, "SAVE.DAT untouched");
