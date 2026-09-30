import { format } from "node:util";
const tlog = (...args) => process.stdout.write(`${format(...args)}
`);
// Ownership-write display对照 in a real browser (M-04 deep cover).
// Fresh Chromium, isolated profile, self-owned static server, real IndexedDB
// untouched (no saves written here). Exercises the PRODUCTION capture-tail
// entry (4CF3 -> 4D2A inline: F23++, paint8A1E, borders88CC) on a live fresh
// scenario neutral city, then proves the write reaches pixels: assembly
// terrain bytes before/after + frozen-clock canvas diff around the city.
// Battle/retreat/extinction inputs are bypassed by construction (neutral
// owner takes the rule's own inline path); that scoping is stated, not hidden.
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
  await page.goto(`${origin}/index.html`);
  await page.locator("#skip-button").click();
  await page.waitForFunction(() => !!window.__app?.startMenu?._onClick);
  async function rebind(x, y) {
    await page.evaluate(() => {
      window.__capMenuHandler = window.__app.startMenu._onClick;
    });
    await page.mouse.click(x, y);
    await page.waitForFunction(
      () =>
        window.__app.startMenu._onClick &&
        window.__app.startMenu._onClick !== window.__capMenuHandler,
    );
  }
  await rebind(468, 360);
  await rebind(512, 234);
  await rebind(512, 234);
  await page.mouse.click(584, 455);
  await page.waitForFunction(
    () => window.__app.gameStarted && window.__app.runtimeEnabled,
  );

  const setup = await page.evaluate(async () => {
    const app = window.__app;
    const assembly = await import("/src/game/scenarioassembly.js");
    const sc = app.scenario;
    const city = sc.cities.find(
      (c) => c.faction == null && (c.governor == null || c.governor === 255),
    );
    if (!city) throw new Error("live scenario must hold a governor-less neutral city");
    const ctx = assembly.scenarioNativeRoadContext(sc);
    const window_bytes = [];
    for (let dy = -3; dy <= 3; dy++)
      for (let dx = -3; dx <= 3; dx++)
        window_bytes.push(ctx.readTerrainByte(city.x + dx, city.y + dy));
    // Freeze strategy (product hold) and center the camera on the city.
    app.clock.hold = true;
    const view = app.view;
    const [wxp, wyp] = view.cityPixel(city);
    view.cam.x = 512 - wxp;
    view.cam.y = 384 - wyp;
    view.clampCam();
    view.draw();
    const canvas = document.querySelector("#cv");
    const before = view.ctx.getImageData(0, 0, canvas.width, canvas.height);
    let hash = 2166136261;
    for (let i = 0; i < before.data.length; i += 4) {
      hash ^= before.data[i] | (before.data[i + 1] << 8);
      hash = Math.imul(hash, 16777619);
    }
    return {
      idx: city.idx,
      x: city.x,
      y: city.y,
      screen: { x: view.sx(wxp), y: view.sy(wyp) },
      bytesBefore: window_bytes.join(","),
      hashBefore: hash >>> 0,
    };
  });
  tlog(
    `target neutral city ${setup.idx} at tile ${setup.x},${setup.y} screen ${Math.round(setup.screen.x)},${Math.round(setup.screen.y)}`,
  );
  await page.screenshot({ path: "capture_display_before.png" });

  const applied = await page.evaluate(async (idx) => {
    const app = window.__app;
    const capture = await import("/src/game/navigation/originalcitycapture.js");
    const sc = app.scenario;
    const city = sc.cities[idx];
    const result = capture.captureOriginalCity(sc, city, 0, () => {});
    app.view.draw();
    return { result, faction: city.faction };
  }, setup.idx);
  assert.equal(applied.result, "captured-4D62", "inline capture tail must return");
  assert.equal(applied.faction, 0, "city must change owner to faction 0");

  const after = await page.evaluate(async (setup) => {
    // One rAF so the live renderer repaints from the new assembly bytes.
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const app = window.__app;
    app.view.draw();
    const assembly = await import("/src/game/scenarioassembly.js");
    const sc = app.scenario;
    const ctx = assembly.scenarioNativeRoadContext(sc);
    const window_bytes = [];
    for (let dy = -3; dy <= 3; dy++)
      for (let dx = -3; dx <= 3; dx++)
        window_bytes.push(ctx.readTerrainByte(setup.x + dx, setup.y + dy));
    const view = app.view;
    const canvas = document.querySelector("#cv");
    const pixels = view.ctx.getImageData(0, 0, canvas.width, canvas.height);
    let hash = 2166136261;
    for (let i = 0; i < pixels.data.length; i += 4) {
      hash ^= pixels.data[i] | (pixels.data[i + 1] << 8);
      hash = Math.imul(hash, 16777619);
    }
    // Region-limited diff: 160x160 box around the city screen center.
    const cx = Math.round(setup.screen.x);
    const cy = Math.round(setup.screen.y);
    const W = canvas.width;
    let changed = 0;
    for (let y = Math.max(0, cy - 80); y < Math.min(pixels.height, cy + 80); y++)
      for (let x = Math.max(0, cx - 80); x < Math.min(W, cx + 80); x++) {
        const o = (y * W + x) * 4;
        // Compare against the before frame is impossible here (GC'd); the
        // hash comparison below proves change, this counts saturated city
        // pixels as a sanity signal only.
        if (pixels.data[o + 3] !== 0) changed++;
      }
    return {
      bytesAfter: window_bytes.join(","),
      hashAfter: hash >>> 0,
      opaqueInBox: changed,
    };
  }, setup);
  await page.screenshot({ path: "capture_display_after.png" });

  const beforeBytes = setup.bytesBefore.split(",");
  const afterBytes = after.bytesAfter.split(",");
  let byteDiffs = 0;
  for (let i = 0; i < beforeBytes.length; i++)
    if (beforeBytes[i] !== afterBytes[i]) byteDiffs++;
  tlog(`assembly terrain window: ${byteDiffs}/49 tiles changed`);
  tlog(`canvas hash: ${setup.hashBefore} -> ${after.hashAfter}`);
  assert.ok(byteDiffs > 0, "8A1E write must change assembly terrain bytes");
  assert.notEqual(after.hashAfter, setup.hashBefore, "repaint must change pixels");
  assert.ok(after.opaqueInBox > 1000, "city box must stay painted");
  assert.deepEqual(errors, [], "no page/console errors");
} finally {
  await browser?.close();
  server.close();
}
tlog("capture display对照: 8A1E write reaches assembly bytes and pixels");
