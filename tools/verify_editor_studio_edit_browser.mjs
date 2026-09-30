// Studio workbench v1 (E-03 slice 2): decoration move/delete, city move
// with 断路 diagnostics + badges, draft save allowed, compile blocked
// until reconnected, move-back recovery. Fresh profile, editor ephemeral
// server, no SAVE.DAT writes.
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
const tmp = mkdtempSync(join(tmpdir(), "editor-studio-v1-"));
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
  await call("POST", "/api/copy", { gameId: "studio-2", ownerId: "admin-1", kind: "minimal" });

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    // The intentional compile-block refusal (expected 400) is logged by
    // the browser itself; the blocked status below is the real assertion.
    if (message.type() === "error" && message.text().includes("400 (Bad Request)")) return;
    if (message.type() === "error" && !message.location().url?.endsWith("/favicon.ico"))
      errors.push(message.text());
  });
  await page.goto(`${base}/studio?game=studio-2`);
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
  async function setTool(name) {
    await page.evaluate((tool) => {
      window.__studio.tool = tool;
      window.__studio.pendingMove = false;
    }, name);
  }
  async function selectLayer(name) {
    await page.evaluate((layer) => {
      window.__studio.layer = layer;
      window.__studio.pendingMove = false;
    }, name);
  }
  const status = () => page.evaluate(() => document.getElementById("status").textContent);

  // Decoration move: place at (30,30), move to (32,30).
  await setTool("grass");
  await clickTile(30, 30);
  await setTool("move");
  await clickTile(30, 30);
  assert.ok((await status()).includes("move target?"), "move select");
  await clickTile(32, 30);
  let decos = await page.evaluate(() => window.__studio.draft.map.decorations);
  assert.deepEqual(decos.map((d) => [d.x, d.y]), [[32, 30]], "deco relocated");
  // Decoration delete.
  await setTool("del");
  await clickTile(32, 30);
  decos = await page.evaluate(() => window.__studio.draft.map.decorations);
  assert.equal(decos.length, 0, "deco deleted");
  // Locked-layer refusal: lock decor, grass click refused.
  await selectLayer("decor");
  await page.click("#lock");
  await setTool("grass");
  await clickTile(40, 30);
  assert.ok((await status()).includes("locked"), "locked layer refused");
  await page.click("#lock"); // unlock again

  // City move: unlock cities, move city-000 (257,9) -> (260,9).
  await selectLayer("cities");
  await page.click("#lock");
  const locked = await page.evaluate(() => window.__studio.locked.cities);
  assert.equal(locked, false, "cities unlocked");
  await setTool("move");
  await page.evaluate(() => {
    window.__studio.cam.x = 257 * 16 - 480;
    window.__studio.cam.y = 0;
  });
  await clickTile(257, 9);
  assert.ok((await status()).includes("city target?"), "city selected");
  await clickTile(260, 9);
  const moved = await page.evaluate(() =>
    window.__studio.draft.map.placements.find((p) => p.cityId === "city-000"),
  );
  assert.deepEqual([moved.x, moved.y], [260, 9], "city relocated");

  // Save succeeds (draft allowed) with断路 diagnostics; validate lists them.
  await page.click("#save");
  await page.waitForFunction(() => document.getElementById("status").textContent.startsWith("saved rev "), null, {
    timeout: 15000,
  });
  const savedMsg = await status();
  assert.ok(savedMsg.includes("断路"), `save flags断路: ${savedMsg}`);
  await page.click("#validate");
  await page.waitForFunction(() => document.getElementById("report").textContent.includes("disconnected-road"), null, {
    timeout: 15000,
  });
  const report = await page.evaluate(() => JSON.parse(document.getElementById("report").textContent));
  assert.ok(report.diagnostics.some((d) => d.code === "disconnected-road"), "diagnostics name the break");
  tlog(`断路 diagnostics: ${JSON.stringify(report.diagnostics.slice(0, 2))}`);

  // Compile is blocked until reconnected.
  await page.click("#compile");
  await page.waitForFunction(() => document.getElementById("status").textContent.startsWith("compile "), null, {
    timeout: 15000,
  });
  assert.ok((await status()).includes("blocked"), "compile blocked with断路");

  // Move back -> clean -> compile OK.
  await setTool("move");
  await clickTile(260, 9);
  await clickTile(257, 9);
  await page.click("#save");
  await page.waitForFunction(
    () => document.getElementById("status").textContent.startsWith("saved rev ") && !document.getElementById("status").textContent.includes("断路"),
    null,
    { timeout: 15000 },
  );
  await page.click("#validate");
  await page.waitForFunction(() => document.getElementById("status").textContent === "valid", null, {
    timeout: 15000,
  });
  await page.click("#compile");
  await page.waitForFunction(() => document.getElementById("status").textContent.startsWith("compiled rev "), null, {
    timeout: 15000,
  });
  tlog("studio v1 OK: move/delete/断路/badges/save/compile-block/recovery");
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
