import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { startBrowserTestServer } from "./browser_test_server.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright");
const server = await startBrowserTestServer();
let browser;
try {
  browser = await chromium.launch({ headless: true });
  for (const deviceScaleFactor of [1, 1.25, 2]) {
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, deviceScaleFactor });
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
    // All 192 source nodes retain their actual tile center, not +2/+3 road compensation.
    for (const c of sc.cities) {
      const p = view.cityPixel(c);
      if (p[0] !== c.x * 16 + 8 || p[1] !== c.y * 16 + 8)
        throw new Error(`shifted city ${c.idx}`);
    }
    sc.cities = [city];
    const drawMarker = view._drawMarchingIcon.bind(view);
    const draws = [];
    view._drawMarchingIcon = (ctx, x, y, style, frame) => {
      draws.push({ x, y, style, frame });
      drawMarker(ctx, x, y, style, frame);
    };
    // Observe actual raster destinations, including the city tile and all marker frames.
    const images = [];
    const nativeDraw = view.ctx.drawImage.bind(view.ctx);
    view.ctx.drawImage = (image, ...args) => {
      images.push({ src: image.src ?? '', args });
      nativeDraw(image, ...args);
    };
    const army = { faction: city.faction ?? sc.player_faction, prevX: city.x, prevY: city.y,
      x: city.x + 1, y: city.y, movePeriod: 3, _renderMoveSerial: 0,
      _markerFrame: 3, target: { x: city.x + 10, y: city.y } };
    sc.legions = [army];
    const departure = [];
    for (let tick = 0; tick < 24; tick++) {
      view.app.clock.strategicTickSerial = tick;
      draws.length = 0;
      view.draw({ uncached: true });
      departure.push(draws.map(d => ({ frame: d.frame, x: d.x, y: d.y })));
    }
    army.prevX = city.x - 1; army.x = city.x;
    army._renderMoveSerial = 24; army._markerFrame = 4; army.target = null;
    const arrival = [];
    for (let tick = 24; tick <= 48; tick++) {
      view.app.clock.strategicTickSerial = tick;
      draws.length = 0;
      view.draw({ uncached: true });
      arrival.push(draws.map(d => ({ frame: d.frame, x: d.x, y: d.y })));
    }
    const cityDraws = images.filter(i => /icon-.*_city\.png$/.test(i.src));
    const lastMarker = images.filter(i => /style_.*_frame_4\.png$/.test(i.src)).at(-1);
    // Clear prev after arrival, pan, then verify garrison/pick/snap/selection alignment.
    army.prevX = army.x; army.prevY = army.y;
    view.cam.x -= 37; view.cam.y -= 19;
    view.selectedCity = city;
    view.setPointer(271, 189);
    const picked = view.pick(271, 189)?.city === city;
    const snapped = { ...view.pointer };
    draws.length = 0;
    view.draw();
    const parked = draws.map(d => ({ frame: d.frame, x: d.x, y: d.y }));
    return { ready, departure, arrival, cityDraws, lastMarker, picked, snapped, parked };
  });
  await page.waitForLoadState("networkidle");
  assert.equal(result.ready, 120);
  const checkDraw = (draws, frame, x) => {
    assert.equal(draws.length, 1);
    assert.equal(draws[0].frame, frame);
    assert.ok(Math.abs(draws[0].x - x) < 1e-9, "continuous tile-center projection");
    assert.equal(draws[0].y, 208);
  };
  for (const [tick, draws] of result.departure.entries())
    checkDraw(draws, 1, 308 + tick * 16 / 24);
  for (const [tick, draws] of result.arrival.entries())
    checkDraw(draws, tick === 24 ? 4 : 1, 292 + tick * 16 / 24);
  assert.ok(result.cityDraws.length > 0);
  assert.ok(result.cityDraws.every(d => JSON.stringify(d.args) === '[300,200,16,16]'));
  assert.deepEqual(result.lastMarker.args, [300, 200]);
  assert.equal(result.picked, true);
  assert.deepEqual(result.snapped, { x: 271, y: 189 });
  assert.deepEqual(result.parked, [{ frame: 4, x: 271, y: 189 }]);
  assert.deepEqual(errors, []);
  await context.close();
  process.stdout.write(`march markers browser OK DPR=${deviceScaleFactor}: 120 images, 192 city anchors, departure/arrival origins, panned garrison/pick/snap\n`);
  }
} finally {
  await browser?.close();
  await server.close();
}
