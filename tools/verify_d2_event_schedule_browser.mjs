// D2-EVENT-64: a NON-EMPTY absolute-position schedule must survive the real
// product save path (menu-less app.saveGame -> real IndexedDB -> page reload ->
// app.loadSave). Engine-level round trip already lives in
// verify_d2_event_save_roundtrip.mjs; this fixture only closes the browser/IDB
// seam. Fresh Chromium, isolated profile, self-owned static server. No SAVE.DAT
// access, no user profile, no shared server.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { startBrowserTestServer } from "./browser_test_server.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    "C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright",
);

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
    if (message.type() === "error" && !message.location().url?.endsWith("/favicon.ico"))
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
  const rebind = async (x, y) => {
    await page.evaluate(() => {
      window.__saveMenuHandler = window.__app.startMenu._onClick;
    });
    await page.mouse.click(x, y);
    await page.waitForFunction(
      () =>
        window.__app.startMenu._onClick &&
        window.__app.startMenu._onClick !== window.__saveMenuHandler,
    );
  };
  await rebind(468, 360);
  await rebind(512, 234);
  await rebind(512, 234);
  await page.mouse.click(584, 455);
  await page.waitForFunction(
    () => window.__app.gameStarted && window.__app.runtimeEnabled,
  );

  const injected = await page.evaluate(() => {
    const sc = window.__app.scenario;
    const base = 5 * 64;
    sc.strategicEventSchedule = {
      version: 1,
      epoch: 5,
      entries: [
        {
          position: base + 40,
          rank: 1,
          order: 11,
          type: 12,
          arg0: 7,
          arg1: 1,
          arg2: 0,
          region: null,
          generation: 3,
        },
        {
          position: base + 41,
          rank: 0,
          order: 12,
          type: 11,
          arg0: 9,
          arg1: 0,
          arg2: 0,
          region: { minX: 10, maxX: 20, minY: 30, maxY: 40 },
        },
      ],
      meta: [],
    };
    return JSON.parse(JSON.stringify(sc.strategicEventSchedule));
  });

  const saved = await page.evaluate(() => window.__app.saveGame(0, "D2-SCHED"));
  assert.equal(saved.saved, "local", "real save path must accept the schedule");
  const persisted = await page.evaluate(async () =>
    JSON.parse(JSON.stringify(await window.__app.saveRepository.get(0))),
  );
  const findSchedule = (node, depth = 0) => {
    if (node == null || typeof node !== "object" || depth > 6) return null;
    if (Array.isArray(node.entries) && Array.isArray(node.meta) && "epoch" in node)
      return node;
    for (const value of Object.values(node)) {
      const hit = findSchedule(value, depth + 1);
      if (hit) return hit;
    }
    return null;
  };
  const canon = (entries) =>
    entries.map((entry) => ({
      position: entry.position,
      rank: entry.rank,
      order: entry.order,
      type: entry.type,
      arg0: entry.arg0,
      arg1: entry.arg1,
      arg2: entry.arg2,
      region: entry.region ?? null,
      generation: entry.generation ?? null,
    }));
  const stored = findSchedule(persisted);
  assert.ok(stored, "snapshot must carry strategicEventSchedule");
  assert.deepEqual(canon(stored.entries), canon(injected.entries), "entries persist");
  assert.equal(stored.epoch, injected.epoch);

  await page.reload();
  await page.waitForFunction(() => !!window.__app);
  const skip = page.locator("#skip-button");
  if (await skip.count()) await skip.click().catch(() => {});
  const loaded = await page.evaluate(() => window.__app.loadSave(0));
  assert.notEqual(loaded?.loaded, false, "real load path must accept the save");
  const restored = await page.evaluate(() =>
    JSON.parse(JSON.stringify(window.__app.scenario.strategicEventSchedule)),
  );
  assert.deepEqual(canon(restored.entries), canon(injected.entries), "entries survive reload");
  assert.equal(restored.epoch, injected.epoch, "epoch survives reload");
  const cities = await page.evaluate(() => window.__app.scenario.cities.length);
  assert.equal(cities, 192);
  process.stdout.write(
    `D2 schedule browser round trip: ${restored.entries.length} entries, epoch ${restored.epoch}, forbidden ${forbidden.length}, page errors ${errors.length}\n`,
  );
  assert.deepEqual(errors, [], "no page/console errors");
  assert.deepEqual(forbidden, [], "no backend/save.dat access");
} finally {
  await browser?.close();
  server.close?.();
}
