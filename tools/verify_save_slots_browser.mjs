import { format } from "node:util";
const tlog = (...args) => process.stdout.write(`${format(...args)}
`);
// Save write + multi-slot isolation in a real browser (M-05 remainder).
// Fresh Chromium, isolated profile, self-owned static server, real IndexedDB.
// No SAVE.DAT read/write (mtime stat only), no user profile, no shared server.
// Flow: new game -> save A -> advance gameplay clock -> save B ->
// repository isolation (A pristine, B newer) -> loadSave(A) restores live
// state -> page reload -> IndexedDB durability (A and B survive).
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
const mtimeBefore = (await fs.stat(saveDat)).mtimeMs;

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
    date: { ...window.__app.clock },
  }));
  tlog(`new game: player faction ${boot.playerFaction}, cities ${boot.cities}`);
  assert.equal(boot.cities, 192);
  await page.screenshot({ path: "save_slots_newgame.png" });

  // Real product speed setting, then real save entry.
  await page.evaluate(() => {
    window.__app.clock.strategicSpeed = 4;
  });
  const savedA = await page.evaluate(() => window.__app.saveGame(0, "M2A"));
  assert.equal(savedA.saved, "local");
  const stateA = await page.evaluate(async () =>
    JSON.stringify(await window.__app.saveRepository.get(0)),
  );
  const dayA = await page.evaluate(() => ({
    year: window.__app.clock.year,
    month: window.__app.clock.month,
    day: window.__app.clock.day,
  }));

  // Advance real gameplay (strategic clock + AI) at max speed.
  await page.waitForFunction(
    (before) => {
      const clock = window.__app.clock;
      return (
        clock.year !== before.year ||
        clock.month !== before.month ||
        clock.day !== before.day
      );
    },
    dayA,
    { timeout: 120000 },
  );
  const savedB = await page.evaluate(() => window.__app.saveGame(1, "M2B"));
  assert.equal(savedB.saved, "local");

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
  tlog(`slots isolated: A pristine, B advanced, rows ${JSON.stringify(isolation.labels)}`);

  // Real restore path: loadSave(A) must bring the live game back.
  const restored = await page.evaluate(() => window.__app.loadSave(0));
  assert.equal(restored, true);
  const dayRestored = await page.evaluate(() => ({
    year: window.__app.clock.year,
    month: window.__app.clock.month,
    day: window.__app.clock.day,
  }));
  assert.deepEqual(dayRestored, dayA, "live date must match slot A after loadSave");

  // Page reload in the SAME profile: IndexedDB must still hold both slots.
  await page.reload();
  await page.locator("#skip-button").click();
  await page.waitForFunction(() => !!window.__app?.saveRepository);
  const durable = await page.evaluate(async (before) => {
    const repo = window.__app.saveRepository;
    const loaded = await repo.load();
    const a = JSON.stringify(await repo.get(0));
    const b = JSON.stringify(await repo.get(1));
    return {
      slots: loaded.slots.filter((s) => s.played).map((s) => [s.slot, s.label]),
      aIntact: a === before,
      bDiffers: b !== before,
    };
  }, stateA);
  assert.deepEqual(
    durable.slots,
    [[0, "M2A"], [1, "M2B"]],
    "both slots must survive reload",
  );
  assert.equal(durable.aIntact, true);
  assert.equal(durable.bDiffers, true);
  tlog("reload durability: slots [0 M2A] [1 M2B] intact in IndexedDB");

  assert.deepEqual(forbidden, [], "no save.dat/API route may be touched");
  assert.deepEqual(errors, [], "no page/console errors");
} finally {
  await browser?.close();
  server.close();
}
const mtimeAfter = (await fs.stat(saveDat)).mtimeMs;
assert.equal(mtimeAfter, mtimeBefore, "SAVE.DAT must be untouched (mtime)");
tlog("save slots browser: write + isolation + restore + durability OK");
