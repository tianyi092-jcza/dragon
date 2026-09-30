import { format } from "node:util";
const tlog = (...args) => process.stdout.write(`${format(...args)}
`);
// Menu-driven save write + multi-slot isolation in a real browser.
// Production clicks only: 系統選單(book)->資料儲存->slot row for writes;
// 存檔讀取->confirm->title list clicks for restores. Direct app.saveGame /
// app.loadSave are never called (those were covered by
// verify_save_slots_browser.mjs). Also covers the title empty-slot
// hover/hit-test/click triple-disable (AGENTS 2.4).
// Fresh Chromium, isolated profile, self-owned static server, real IndexedDB.
// No SAVE.DAT read/write (mtime stat only), no user profile, no shared server.
// Exit 0: menu write A -> day advance -> menu write B -> isolation ->
// menu overwrite A -> in-game load to title -> empty-slot disabled x3 ->
// title load A restores date -> reload -> title load B restores date.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import { startBrowserTestServer } from "./browser_test_server.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    "C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright",
);

const saveDat = new URL("../../Dragon/SAVE.DAT", import.meta.url);
const { mtimeMs: mtimeBefore } = await fs.stat(saveDat);

const server = await startBrowserTestServer();
let browser;
const errors = [];
const forbidden = [];
try {
  const origin = `http://127.0.0.1:${server.port}`;
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1024, height: 768 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !message.location().url?.endsWith("/favicon.ico")
    )
      errors.push(message.text());
  });
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (/\/api\/|\.dragon-runtime|save\.dat/i.test(url.pathname)) {
      forbidden.push(url.pathname);
      return route.abort();
    }
    return route.continue();
  });
  await page.goto(`${origin}/index.html`);
  await page.locator("#skip-button").click();
  await page.waitForFunction(() => !!window.__app?.startMenu?._onClick);
  async function rebind(x, y) {
    await page.evaluate(() => {
      window.__saveMenuHandler = window.__app.startMenu._onClick;
    });
    await page.mouse.click(x, y);
    await page.waitForFunction(
      () =>
        window.__app.startMenu._onClick &&
        window.__app.startMenu._onClick !== window.__saveMenuHandler,
    );
  }
  await rebind(468, 360);
  await rebind(512, 234);
  await rebind(512, 234);
  await page.mouse.click(584, 455);
  await page.waitForFunction(
    () => window.__app.gameStarted && window.__app.runtimeEnabled,
  );
  const boot = await page.evaluate(() => ({
    playerFaction: window.__app.scenario.player_faction,
    cities: window.__app.scenario.cities.length,
  }));
  tlog(`new game: player faction ${boot.playerFaction}, cities ${boot.cities}`);
  assert.equal(boot.cities, 192);
  await page.evaluate(() => {
    window.__app.clock.strategicSpeed = 4;
  });

  // ---- Production menu save: book -> 資料儲存(row 0) -> slot row. ----
  async function menuSave(slotIdx) {
    const book = await page.evaluate(() => ({
      x: window.__app.gamebar.bx + 447,
      y: 15,
    }));
    await page.mouse.click(book.x, book.y);
    await page.waitForFunction(() => !!window.__app.gamebar.settingsOpen);
    await page.mouse.click(512, 331); // row 0 資料儲存
    await page.waitForFunction(() => !!window.__app.gamebar.systemSaveDialog);
    const rows = await page.evaluate(() =>
      window.__app.gamebar.systemSaveDialog.rows.map((r) => ({
        slot: r.slot,
        played: r.played,
      })),
    );
    const i = rows.findIndex((r) => r.slot === slotIdx);
    assert.ok(i >= 0, `slot ${slotIdx} row must exist`);
    if (i === 0)
      await page.screenshot({ path: ".dragon-analysis/map-migration/round2/menu_save_dialog.png" });
    await page.mouse.click(512, 317 + 50 * i);
    // Repository-level wait (no private-hook dependency).
    await page.waitForFunction(
      async (slot) => {
        const rec = await window.__app.saveRepository.get(slot);
        return !!rec?.played;
      },
      slotIdx,
      { timeout: 30000 },
    );
    // Back at settings after confirm; right-click closes it.
    await page.mouse.click(512, 400, { button: "right" });
    await page.waitForFunction(() => !window.__app.gamebar.settingsOpen);
    return page.evaluate(async (slot) => {
      const rec = await window.__app.saveRepository.get(slot);
      return JSON.stringify(rec);
    }, slotIdx);
  }

  const dayOf = () =>
    page.evaluate(() => ({
      year: window.__app.clock.year,
      month: window.__app.clock.month,
      day: window.__app.clock.day,
    }));

  const stateA = await menuSave(0);
  const dayA = await dayOf();
  tlog(`menu save A: slot 0 at ${JSON.stringify(dayA)}`);

  // Advance real gameplay, then menu-save B.
  await page.waitForFunction(
    (before) =>
      window.__app.clock.year !== before.year ||
      window.__app.clock.month !== before.month ||
      window.__app.clock.day !== before.day,
    dayA,
    { timeout: 120000 },
  );
  const dayB = await dayOf();
  const stateB = await menuSave(1);
  tlog(`menu save B: slot 1 at ${JSON.stringify(dayB)}`);

  const isolation = await page.evaluate(async (before) => {
    const repo = window.__app.saveRepository;
    const a = JSON.stringify(await repo.get(0));
    const b = JSON.stringify(await repo.get(1));
    const rows = await repo.list();
    return {
      aPristine: a === before,
      bDiffers: b !== before,
      labels: rows.map((row) => row.label ?? row.slot),
    };
  }, stateA);
  assert.equal(isolation.aPristine, true, "slot A must be unaffected by later play");
  assert.equal(isolation.bDiffers, true, "slot B must carry the advanced state");
  tlog(`slots isolated: labels ${JSON.stringify(isolation.labels)}`);

  // Menu overwrite of slot A: A advances, B stays.
  await page.waitForFunction(
    (before) =>
      window.__app.clock.year !== before.year ||
      window.__app.clock.month !== before.month ||
      window.__app.clock.day !== before.day,
    dayB,
    { timeout: 120000 },
  );
  const dayA2 = await dayOf();
  await menuSave(0);
  const overwrite = await page.evaluate(async (args) => {
    const repo = window.__app.saveRepository;
    return {
      aChanged: JSON.stringify(await repo.get(0)) !== args.a,
      bSame: JSON.stringify(await repo.get(1)) === args.b,
    };
  }, { a: stateA, b: stateB });
  assert.equal(overwrite.aChanged, true, "menu overwrite must update slot A");
  assert.equal(overwrite.bSame, true, "menu overwrite must not touch slot B");
  tlog(`menu overwrite A at ${JSON.stringify(dayA2)}, B intact`);

  // ---- In-game load: book -> 存檔讀取(row 1) -> 確認 -> title. ----
  const book2 = await page.evaluate(() => ({
    x: window.__app.gamebar.bx + 447,
    y: 15,
  }));
  await page.mouse.click(book2.x, book2.y);
  await page.waitForFunction(() => !!window.__app.gamebar.settingsOpen);
  await page.mouse.click(512, 357); // row 1 存檔讀取
  await page.waitForFunction(
    () => !!window.__app.gamebar.systemLoadConfirmDialog,
  );
  await page.mouse.click(458, 413); // 確認
  await page.waitForFunction(
    () => !window.__app.gameStarted && !!window.__app.startMenu?._onClick,
    null,
    { timeout: 60000 },
  );
  tlog("in-game load confirm returned to title");
  await page.screenshot({ path: ".dragon-analysis/map-migration/round2/menu_title_load.png" });

  // ---- Title list clicks (game 640x400 -> client mapping). ----
  async function titleClick(gx, gy) {
    const pt = await page.evaluate(
      ({ gx, gy }) => {
        const r = window.__app.startMenu.cv.getBoundingClientRect();
        return {
          x: r.left + (gx * r.width) / 640,
          y: r.top + (gy * r.height) / 400,
        };
      },
      { gx, gy },
    );
    await page.mouse.click(pt.x, pt.y);
  }
  async function titleMove(gx, gy) {
    const pt = await page.evaluate(
      ({ gx, gy }) => {
        const r = window.__app.startMenu.cv.getBoundingClientRect();
        return {
          x: r.left + (gx * r.width) / 640,
          y: r.top + (gy * r.height) / 400,
        };
      },
      { gx, gy },
    );
    await page.mouse.move(pt.x, pt.y);
  }
  // rows: py=(400-256)/2=72, rowsTop=72+30=102, rowH=56 -> row i y=102+56i+28.
  const slotRows = await page.evaluate(() =>
    window.__app.saves.slots
      .slice()
      .sort((a, b) => a.slot - b.slot)
      .map((s) => ({ slot: s.slot, played: !!s.played })),
  );
  tlog(`title rows: ${JSON.stringify(slotRows)}`);
  assert.ok(slotRows.find((r) => r.slot === 0)?.played, "slot 0 played");
  assert.ok(slotRows.find((r) => r.slot === 1)?.played, "slot 1 played");
  const emptyIdx = slotRows.findIndex((r) => !r.played);
  assert.ok(emptyIdx >= 0, "an empty slot row must exist for the disable test");

  // Triple-disable: hover (no highlight), hit-test + click (no-op).
  await titleMove(200, 102 + 56 * emptyIdx + 28);
  await page.waitForTimeout(300);
  const hoverState = await page.evaluate(() => window.__app.startMenu._hover);
  assert.equal(hoverState, -1, "hover over an empty slot must not highlight");
  await titleClick(200, 102 + 56 * emptyIdx + 28);
  await page.waitForTimeout(800);
  const stillTitle = await page.evaluate(() => ({
    started: window.__app.gameStarted,
    titleShown: window.__app.startMenu.cv.style.display !== "none",
  }));
  assert.equal(stillTitle.started, false, "clicking an empty slot must not start a game");
  assert.equal(stillTitle.titleShown, true, "title list must stay open after empty click");
  tlog(`empty slot row ${emptyIdx}: hover/hit/click all disabled`);

  // Title load of slot 0 (overwritten date dayA2).
  const row0 = slotRows.findIndex((r) => r.slot === 0);
  await titleClick(200, 102 + 56 * row0 + 28);
  await page.waitForFunction(
    () => window.__app.gameStarted && window.__app.runtimeEnabled,
    null,
    { timeout: 60000 },
  );
  const restoredA = await dayOf();
  assert.deepEqual(restoredA, dayA2, "title load of slot 0 must restore its date");
  tlog(`title load A restores ${JSON.stringify(restoredA)}`);
  await page.screenshot({ path: ".dragon-analysis/map-migration/round2/menu_loaded.png" });

  // Reload in the SAME profile: IndexedDB durability + title load of slot 1.
  await page.reload();
  await page.locator("#skip-button").click();
  await page.waitForFunction(() => !!window.__app?.saveRepository);
  const durable = await page.evaluate(async () => {
    const repo = window.__app.saveRepository;
    const loaded = await repo.load();
    return {
      slots: loaded.slots.filter((s) => s.played).map((s) => s.slot).sort(),
    };
  });
  assert.deepEqual(durable.slots, [0, 1], "both slots must survive reload");
  // Boot title shows YES/NO first: 否 (load list) box x[246,377] y[190,209].
  await page.waitForFunction(() => !!window.__app?.startMenu?._onClick);
  const noPt = await page.evaluate(() => {
    const r = window.__app.startMenu.cv.getBoundingClientRect();
    return {
      x: r.left + (311 * r.width) / 640,
      y: r.top + (199 * r.height) / 400,
    };
  });
  await page.mouse.click(noPt.x, noPt.y);
  await page.waitForTimeout(1000);
  const rows2 = await page.evaluate(() =>
    window.__app.saves.slots
      .slice()
      .sort((a, b) => a.slot - b.slot)
      .map((s) => ({ slot: s.slot, played: !!s.played })),
  );
  const row1 = rows2.findIndex((r) => r.slot === 1);
  assert.ok(row1 >= 0 && rows2[row1].played, "slot 1 must be listed as played");
  const p1 = await page.evaluate(
    ({ i }) => {
      const r = window.__app.startMenu.cv.getBoundingClientRect();
      return {
        x: r.left + (200 * r.width) / 640,
        y: r.top + ((102 + 56 * i + 28) * r.height) / 400,
      };
    },
    { i: row1 },
  );
  await page.mouse.click(p1.x, p1.y);
  await page.waitForFunction(
    () => window.__app.gameStarted && window.__app.runtimeEnabled,
    null,
    { timeout: 60000 },
  );
  const restoredB = await dayOf();
  assert.deepEqual(restoredB, dayB, "post-reload title load of slot 1 must restore its date");
  tlog(`post-reload title load B restores ${JSON.stringify(restoredB)}`);

  assert.deepEqual(forbidden, [], "no save.dat/API route may be touched");
  assert.deepEqual(errors, [], "no page/console errors");
  tlog("menu save slots browser: write + isolation + overwrite + title restore + durability OK");
} catch (error) {
  console.error(`HARD-FAIL: ${error?.message ?? error}`);
  process.exitCode = 1;
} finally {
  tlog(`page errors: ${JSON.stringify(errors.slice(0, 5))}`);
  await browser?.close();
  server.close();
}
const { mtimeMs: mtimeAfter } = await fs.stat(saveDat);
assert.equal(mtimeAfter, mtimeBefore, "SAVE.DAT must be untouched (mtime)");
