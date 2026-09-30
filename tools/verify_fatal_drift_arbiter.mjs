// Arbiter: does PRODUCTION hold on a fatal-drift chapter (ch6 官渡)?
// Title clicks only (new game -> chapter row 9 -> faction row 0 ->
// advisor ok), then 90s of live clock watch. If the clock holds with a
// strategic failure, the named/raw drift is a data bug affecting
// production equally; if it advances, the harness missed an init step.
// Fresh profile, isolated server, SAVE.DAT mtime-guarded, no push.
import assert from "node:assert/strict";
import { format } from "node:util";
const tlog = (...args) => process.stdout.write(`${format(...args)}\n`);
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
try {
  const origin = `http://127.0.0.1:${server.port}`;
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.location().url?.endsWith("/favicon.ico"))
      errors.push(message.text());
  });
  await page.goto(`${origin}/index.html`);
  await page.locator("#skip-button").click();
  await page.waitForFunction(() => !!window.__app?.startMenu?._onClick);

  // Game-coord (640x400) -> client mapping on the title canvas.
  async function tclick(gx, gy, button = "left") {
    const pt = await page.evaluate(
      ({ gx, gy }) => {
        const r = window.__app.startMenu.cv.getBoundingClientRect();
        return { x: r.left + (gx * r.width) / 640, y: r.top + (gy * r.height) / 400 };
      },
      { gx, gy },
    );
    await page.mouse.click(pt.x, pt.y, { button });
  }
  // YES/NO: 是 (new game) center (311,175).
  await tclick(311, 175);
  await page.waitForTimeout(800);
  // Chapter list: 官渡 data-idx 5 -> sorted row 9 (officials first).
  const sorted = await page.evaluate(() =>
    (window.__app.startMenu._sortedScenarios ?? []).map((s) => s._origIdx),
  );
  tlog(`chapter rows: ${JSON.stringify(sorted.slice(0, 12))}`);
  const row = sorted.indexOf(5);
  assert.ok(row >= 0 && row < 12, "官渡 must be visible without scroll");
  await tclick(200, 46 + 28 * row + 14);
  await page.waitForTimeout(800);
  // Faction row 0.
  await tclick(160, 76);
  await page.waitForTimeout(800);
  // Advisor ok button center (392,271).
  await tclick(392, 271);
  await page.waitForFunction(() => window.__app.gameStarted && window.__app.runtimeEnabled, null, {
    timeout: 60000,
  });
  const boot = await page.evaluate(() => ({
    cities: window.__app.scenario.cities.length,
    factions: window.__app.scenario.factions.length,
  }));
  tlog(`booted: ${JSON.stringify(boot)}`);
  await page.evaluate(() => {
    window.__app.clock.strategicSpeed = 4;
  });
  const day0 = await page.evaluate(() => ({
    year: window.__app.clock.year,
    month: window.__app.clock.month,
    day: window.__app.clock.day,
  }));
  // 90s watch: date must advance, no hold, no failure.
  let verdict = null;
  for (let i = 0; i < 18; i++) {
    await page.waitForTimeout(5000);
    const s = await page.evaluate(() => ({
      year: window.__app.clock.year,
      month: window.__app.clock.month,
      day: window.__app.clock.day,
      hold: !!window.__app.clock.hold,
      fail: !!window.__app._strategicBattleFailure,
      failMsg: String(window.__app._strategicBattleFailure?.error?.message ?? ""),
    }));
    tlog(`t+${(i + 1) * 5}s: ${s.month}/${s.day} hold=${s.hold} fail=${s.fail} ${s.failMsg.slice(0, 80)}`);
    if (s.fail || s.hold) {
      verdict = s;
      break;
    }
  }
  const day1 = await page.evaluate(() => ({
    year: window.__app.clock.year,
    month: window.__app.clock.month,
    day: window.__app.clock.day,
  }));
  if (!verdict) {
    assert.ok(
      day1.year !== day0.year || day1.month !== day0.month || day1.day !== day0.day,
      "date must advance",
    );
    tlog("verdict: PRODUCTION ADVANCES on ch6 (dead-slot/raw fixes hold)");
    assert.deepEqual(errors, [], "no page/console errors");
  } else {
    tlog(`verdict: PRODUCTION HOLDS on ch6: ${JSON.stringify(verdict)} (data bug)`);
    // The engine's own loud hold report is the evidence here, not noise.
    assert.ok(
      errors.some((e) => e.includes("Uncovered faction") && e.includes("3F29")),
      "the hold must be the 3F29 faction stop",
    );
  }
} catch (error) {
  console.error(`HARD-FAIL: ${error?.message ?? error}`);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.close();
}
const mtimeAfter = (await fs.stat(saveDat)).mtimeMs;
assert.equal(mtimeAfter, mtimeBefore, "SAVE.DAT untouched");
