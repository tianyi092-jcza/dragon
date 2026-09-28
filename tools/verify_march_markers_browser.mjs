import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { startBrowserTestServer } from "./browser_test_server.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright");
const server = await startBrowserTestServer();
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const origin = `http://127.0.0.1:${server.port}`;
  await context.addInitScript((origin) => {
    if (location.origin === origin) sessionStorage.setItem("wolong.intro.seen.v1", "1");
  }, origin);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("requestfailed", r => errors.push(r.url()));
  await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await page.goto(origin);
  await page.waitForFunction(() => !!window.__app?.startMenu?._onClick);
  const result = await page.evaluate(async () => {
    const app = window.__app;
    await app.ensureGameAssets();
    app.setRuntimeEnabled(false);
    const { MapView } = await import("./src/render/mapview.js");
    const canvas = document.createElement("canvas");
    const sc = structuredClone(app.content.chapter(16).template);
    const city = sc.cities.find(c => /[許许]昌/.test(c.name));
    if (!city) throw new Error("missing Xuchang fixture");
    city.faction = 0;
    sc.factionOf = c => sc.factions.find(f => f.idx === c.faction);
    sc.legions = [];
    sc.disasterMapObjects = [];
    const view = new MapView(canvas, () => sc);
    view.app = { gameStarted: true, clock: { strategicTickSerial: 0, dayProgress: () => 0 } };
    view.cam.x = 300 - city.x * 16;
    view.cam.y = 200 - city.y * 16;
    let ready = 0;
    for (let style = 0; style < 24; style++) for (let frame = 0; frame < 5; frame++) {
      view._drawMarchingIcon({ drawImage(image) {
        if (image.complete && image.naturalWidth === 16 && image.naturalHeight === 16) ready++;
      } }, 100, 100, style, frame);
    }
    const draws = [];
    view._drawMarchingIcon = (_ctx, x, y, style, frame) => draws.push({ x, y, style, frame });
    const army = { faction: city.faction ?? sc.player_faction, prevX: city.x, prevY: city.y,
      x: city.x + 1, y: city.y, movePeriod: 3, _renderMoveSerial: 0,
      _markerFrame: 3, target: { x: city.x + 10, y: city.y } };
    sc.legions = [army];
    const departure = [];
    for (let tick = 0; tick < 24; tick++) {
      view.app.clock.strategicTickSerial = tick;
      draws.length = 0;
      view.draw();
      departure.push(draws.map(d => d.frame));
    }
    army.prevX = city.x - 1; army.x = city.x;
    army._renderMoveSerial = 24; army._markerFrame = 4; army.target = null;
    const arrival = [];
    for (let tick = 24; tick <= 48; tick++) {
      view.app.clock.strategicTickSerial = tick;
      draws.length = 0;
      view.draw();
      arrival.push(draws.map(d => d.frame));
    }
    return { ready, departure, arrival };
  });
  await page.waitForLoadState("networkidle");
  assert.equal(result.ready, 120);
  assert.ok(result.departure.every(frames => frames.length === 1 && frames[0] === 1));
  assert.ok(result.arrival.slice(0, -1).every(frames => frames.length === 1 && frames[0] === 1));
  assert.deepEqual(result.arrival.at(-1), [4]);
  assert.deepEqual(errors, []);
  await context.close();
  process.stdout.write("march markers browser OK: 120 ready images, Xuchang departure visible, turn/arrival frame boundaries\n");
} finally {
  await browser?.close();
  await server.close();
}
