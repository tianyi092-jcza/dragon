// Studio workbench v0 (E-03 slice) in a real browser: layers select +
// visibility + lock, grid-snap grass placement, same-layer reorder,
// inspect readout, save draft + validate report, persistence re-read.
// Fresh profile, editor ephemeral server, no SAVE.DAT writes.
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
const tmp = mkdtempSync(join(tmpdir(), "editor-studio-"));
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
  await call("POST", "/api/copy", { gameId: "studio-1", ownerId: "admin-1", kind: "minimal" });

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.location().url?.endsWith("/favicon.ico"))
      errors.push(message.text());
  });
  await page.goto(`${base}/studio?game=studio-1`);
  await page.waitForFunction(() => window.__studio?.draft != null, null, { timeout: 30000 });
  const ready = await page.evaluate(() => document.getElementById("status").textContent);
  assert.equal(ready, "ready");

  // Layer model: decor selected by default; base/roads/cities locked.
  const layers0 = await page.evaluate(() => ({
    layer: window.__studio.layer,
    locked: window.__studio.locked,
  }));
  assert.equal(layers0.layer, "decor");
  assert.equal(layers0.locked.base, true);

  // Inspect readout on a city cell (world city-0 at 257,9).
  await page.evaluate(() => {
    window.__studio.tool = "inspect";
  });
  // City (257,9): pan it into view, then click the tile center through
  // the canvas rect (1px border compensated).
  await page.evaluate(() => {
    window.__studio.cam.x = 257 * 16 - 480;
    window.__studio.cam.y = 0;
  });
  const clickCity = await page.evaluate(() => {
    const r = document.getElementById("cv").getBoundingClientRect();
    return {
      x: r.left + 1 + (257 * 16 + 8 - window.__studio.cam.x),
      y: r.top + 1 + (9 * 16 + 8 - window.__studio.cam.y),
    };
  });
  await page.mouse.click(clickCity.x, clickCity.y);
  await page.waitForTimeout(300);
  const sel = await page.evaluate(() => document.getElementById("sel").textContent);
  assert.ok(sel.includes("(257,9)"), `inspect shows the city cell: ${sel}`);
  tlog(`inspect: ${sel}`);

  // Grass placement x2 with grid snap (decor layer, unlocked).
  await page.evaluate(() => {
    window.__studio.tool = "grass";
    window.__studio.cam.x = 0;
    window.__studio.cam.y = 0;
  });
  // Grass placement x2 with grid snap (decor layer, unlocked): click
  // tile centers through the canvas rect.
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
  await clickTile(6, 6);
  await clickTile(12, 6);
  await page.waitForTimeout(300);
  let decos = await page.evaluate(() => window.__studio.draft.map.decorations);
  assert.equal(decos.length, 2);
  assert.deepEqual(
    decos.map((d) => [d.x, d.y, d.order]),
    [[6, 6, 0], [12, 6, 1]],
    "grid snap + order",
  );

  // Same-layer reorder: move selected (index 1) up.
  await page.evaluate(() => window.moveSelected(-1));
  decos = await page.evaluate(() => window.__studio.draft.map.decorations);
  assert.deepEqual(
    decos.map((d) => [d.x, d.y, d.order]),
    [[12, 6, 0], [6, 6, 1]],
    "reorder swaps + renumbers",
  );

  // Save draft + validate report.
  await page.click("#save");
  await page.waitForFunction(() => document.getElementById("status").textContent.startsWith("saved rev "), null, {
    timeout: 15000,
  });
  const rev = await page.evaluate(() => document.getElementById("status").textContent);
  assert.ok(rev.includes("rev 2"), `revision bumped: ${rev}`);
  await page.click("#validate");
  await page.waitForFunction(() => document.getElementById("status").textContent === "valid", null, {
    timeout: 15000,
  });
  const report = await page.evaluate(() => document.getElementById("report").textContent);
  assert.ok(report.includes('"valid":true'), `validate report: ${report.slice(0, 120)}`);

  // Persistence: re-read the draft from the service.
  const stored = await call("GET", "/api/draft?game=studio-1");
  assert.equal(stored.map.decorations.length, 2);
  assert.deepEqual(
    stored.map.decorations.map((d) => [d.x, d.y, d.order, d.definitionRef]),
    [[12, 6, 0, "deco-grass"], [6, 6, 1, "deco-grass"]],
  );

  // Locked-layer refusal: grass on locked roads layer is refused in-page.
  await page.evaluate(() => {
    window.__studio.layer = "roads";
    window.__studio.tool = "grass";
  });
  await page.mouse.click(300, 100);
  await page.waitForTimeout(300);
  const refused = await page.evaluate(() => document.getElementById("status").textContent);
  assert.ok(refused.includes("needs the decor layer"), `wrong-layer refused: ${refused}`);
  decos = await page.evaluate(() => window.__studio.draft.map.decorations);
  assert.equal(decos.length, 2, "refused placement adds nothing");
  tlog("studio v0 OK: layers, snap, reorder, save, validate, persistence, refusals");
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
