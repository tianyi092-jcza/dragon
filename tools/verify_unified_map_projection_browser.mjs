// M-04/M-05: production capture, exact terrain writes and live MapView atlas
// commands, seasons, DPR, retained/direct equivalence and read-only rendering.
// Fresh contexts/owned server only. No DOS/profile/SAVE access or shared output.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { startBrowserTestServer } from "./browser_test_server.mjs";
import { BUILTIN_RESOURCES } from "../web/src/content/builtinresources.generated.js";
const round = process.argv[2];
assert.match(round ?? "", /^[a-zA-Z0-9-]+$/);
const output = fileURLToPath(new URL(`../.dragon-analysis/map-migration-2/${round}/`, import.meta.url));
mkdirSync(output);
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright");
const server = await startBrowserTestServer();
const origin = `http://127.0.0.1:${server.port}`;
const errors = [], forbidden = [], requests = [], fixtures = [];
let browser;
try {
  browser = await chromium.launch({ headless: true });
  for (const dpr of [1, 1.25, 2]) {
    const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: dpr });
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== origin || /save\.dat|\/api\/|\.dragon-runtime/i.test(url.pathname)) {
        forbidden.push(url.href); return route.abort();
      }
      return route.continue();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(60000);
    page.on("pageerror", (error) => errors.push(String(error)));
    page.on("console", (message) => { if (message.type() === "error" && !message.location().url?.endsWith("/favicon.ico")) errors.push(message.text()); });
    page.on("response", (response) => { if (response.status() >= 400 && !response.url().endsWith("/favicon.ico")) errors.push(`${response.status()} ${response.url()}`); });
    page.on("request", (request) => requests.push(new URL(request.url()).pathname));
    await page.goto(`${origin}/index.html`);
    await page.locator("#skip-button").click();
    await page.waitForFunction(() => Boolean(window.__app?.startMenu?._onClick));
    const rebind = async (x, y) => {
      await page.evaluate(() => { window.__projectionMenuHandler = window.__app.startMenu._onClick; });
      await page.mouse.click(x, y);
      await page.waitForFunction(() => window.__app.startMenu._onClick && window.__app.startMenu._onClick !== window.__projectionMenuHandler);
    };
    await rebind(468, 360); await rebind(512, 234); await rebind(512, 234);
    await page.mouse.click(584, 455);
    await page.waitForFunction(() => window.__app.gameStarted && window.__app.runtimeEnabled);
    const capture = await page.evaluate(async () => {
      const app = window.__app, sc = app.scenario;
      // Real UI owner keeps the per-frame aggregate hold, unlike assigning
      // clock.hold directly (syncClock would release that assignment).
      app.gamebar.settingsOpen = true; app.gamebar.syncClock();
      const assembly = await import("/src/game/scenarioassembly.js");
      const { captureOriginalCity } = await import("/src/game/navigation/originalcitycapture.js");
      const city = sc.cities.find((c) => c.faction == null && (c.governor == null || c.governor === 255));
      if (!city) throw new Error("missing neutral governor-less capture fixture");
      const terrain = assembly.scenarioNativeRoadContext(sc).terrain;
      const before = Array.from({ length: 384 * 256 }, (_, i) => terrain.readTile(i % 384, Math.floor(i / 384)));
      // Independent expected write-set: raw KI 8A1E..8AD0, VA+200h,
      // re-notes-legion-fate §12.2 (M0 window). No new formula or threshold.
      const center = city.y * 384 + city.x;
      let address = center;
      let deltas;
      if (city.type === 0) deltas = [-0x302, 4, 0x600, -4];
      else if (city.type === 3) deltas = [-0x180, 0x17f, 2, 0x17f];
      else deltas = [-0x181, 2, 0x300, -2];
      const expected = new Map([[center, (0xcb + Math.floor(((before[center] - 0xcb) & 255) / 3) * 3) & 255]]);
      for (const delta of deltas) {
        address += delta;
        const old = before[address];
        if (old >= 0xde && old < 0xf2) expected.set(address, 0xde + ((old - 0xde) % 10) + 10);
      }
      const rngBefore = JSON.stringify(app.originalRng.snapshot());
      const result = captureOriginalCity(sc, city, sc.player_faction, () => {});
      const rngAfter = JSON.stringify(app.originalRng.snapshot());
      const differences = [];
      for (let i = 0; i < before.length; i++) {
        const value = terrain.readTile(i % 384, Math.floor(i / 384));
        const want = expected.get(i) ?? before[i];
        if (value !== want) throw new Error(`unexpected terrain write ${i}: ${value} != ${want}`);
        if (value !== before[i]) differences.push({ address: i, x: i % 384, y: Math.floor(i / 384), before: before[i], after: value });
      }
      if (rngBefore !== rngAfter) throw new Error("neutral inline capture unexpectedly consumed RNG");
      window.__projectionDirty = differences;
      const [wx, wy] = app.view.cityPixel(city);
      app.view.cam.x = 512 - wx; app.view.cam.y = 384 - wy; app.view.clampCam();
      app.gamebar.submenuOpen = false;
      app.view.draw();
      return { result, idx: city.idx, type: city.type, faction: city.faction, differences, expectedCount: expected.size, rngUnchanged: true };
    });
    assert.equal(capture.result, "captured-4D62");
    assert.equal(capture.faction, 0);
    assert.equal(capture.expectedCount, 5, "fixture must exercise center and all four corners");
    assert.equal(capture.differences.length, 5);
    const seasons = [];
    for (const [month, name, index] of [[6, "summer", 1], [9, "autumn", 2], [12, "winter", 3], [3, "spring", 0]]) {
      await page.evaluate((month) => { window.__app.clock.month = month; window.__app.clock.day = 1; }, month);
      const atlasURL = `${origin}/${BUILTIN_RESOURCES.world.assets.seasonAtlases[name]}`;
      await page.waitForFunction(({ index, atlasURL }) => window.__app.seasonIdx === index && window.__app.view.seasonImg?.atlasImage?.src === atlasURL, { index, atlasURL });
      const probe = await page.evaluate(async () => {
        const app = window.__app, view = app.view, canvas = view.cv;
        const { snapshotScenarioAssembly } = await import("/src/game/scenarioassembly.js");
        const before = JSON.stringify({ assembly: snapshotScenarioAssembly(app), state: app.scenario, rng: app.originalRng.snapshot() });
        view.draw(); view.draw();
        const cached = view.ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const atlas = view.seasonImg.atlasImage, rows = [], nativeDraw = view.ctx.drawImage;
        view.ctx.drawImage = function (image, ...args) {
          if (image === atlas) rows.push(args);
          return nativeDraw.call(this, image, ...args);
        };
        try { view.draw({ uncached: true }); } finally { view.ctx.drawImage = nativeDraw; }
        const direct = view.ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let mismatches = 0, hash = 2166136261;
        for (let i = 0; i < direct.length; i++) {
          if (direct[i] !== cached[i]) mismatches++;
          hash = Math.imul(hash ^ direct[i], 16777619);
        }
        const expectedCommands = window.__projectionDirty.map(({ x, y, after }) => [(after % 16) * 16, Math.floor(after / 16) * 16, 16, 16, view.sx(x * 16), view.sy(y * 16), 16 * view.cam.scale, 16 * view.cam.scale]);
        for (const command of expectedCommands)
          if (!rows.some((row) => JSON.stringify(row) === JSON.stringify(command))) throw new Error(`missing live terrain projection ${JSON.stringify(command)}`);
        const after = JSON.stringify({ assembly: snapshotScenarioAssembly(app), state: app.scenario, rng: app.originalRng.snapshot() });
        if (after !== before) throw new Error("render changed Scenario/RAM/route/RNG");
        return { atlasURL: atlas.src, pixelWidth: canvas.width, pixelHeight: canvas.height, dpr: devicePixelRatio,
          exactProjectionCommands: expectedCommands, cachedDirectPixelMismatches: mismatches, pixelHash: hash >>> 0, readOnly: true };
      });
      assert.equal(probe.dpr, dpr);
      assert.equal(probe.pixelWidth, Math.round(1024 * dpr));
      assert.equal(probe.pixelHeight, Math.round(768 * dpr));
      assert.equal(probe.cachedDirectPixelMismatches, 0);
      assert.equal(probe.atlasURL, atlasURL);
      await page.screenshot({ path: join(output, `dpr-${dpr}-${name}.png`) });
      seasons.push({ name, month, ...probe });
    }
    assert.equal(new Set(seasons.map((s) => s.pixelHash)).size, 4);
    fixtures.push({ dpr, capture, seasons });
    await context.close();
  }
  assert.deepEqual(errors, []); assert.deepEqual(forbidden, []);
  assert.deepEqual(requests.filter((p) => /^\/(?:mmap_map\.bin|road_graph\.json|road_cost\.bin|road_offset\.json|map_atlas_.*\.png|map_tiles_.*\.png)$/.test(p)), []);
  const hashes = {};
  for (const path of ["tools/verify_unified_map_projection_browser.mjs", "tools/browser_test_server.mjs", "web/src/content/builtinresources.generated.js", "web/src/content/authoring/terrainview.js", "web/src/render/mapview.js", "web/src/render/retainedlayers.js", "web/src/game/scenarioassembly.js", "web/src/game/navigation/originalcitycapture.js"])
    hashes[path] = createHash("sha256").update(readFileSync(new URL("../" + path, import.meta.url))).digest("hex");
  writeFileSync(join(output, "receipt.json"), JSON.stringify({ caseId: "M-04-M-05-live-projection-seasons-DPR", contractRevision: "map-migration-2-0.4",
    sourceHashes: hashes, toolHashes: hashes, toolVersion: process.version, fixtureId: "neutral-inline-5writes-DPR-1-1.25-2-four-seasons",
    expectedSource: "KI 8A1E..8AD0 / raw M0 windows / re-notes-legion-fate 12.2; approved Web read-only projection",
    result: "pass", fixtures, errors, forbidden, requests, artifactPaths: fixtures.flatMap((f) => f.seasons.map((s) => `dpr-${f.dpr}-${s.name}.png`)),
    coverageLimits: "neutral inline capture only, not complete combat/retreat/extinction; no visual/classification approval or IDB save check" }, null, 2) + "\n");
  process.stdout.write(JSON.stringify({ result: "pass", DPRs: fixtures.map((f) => f.dpr), seasonsEach: 4, writesEach: 5, errors }) + "\n");
} catch (error) {
  writeFileSync(join(output, "failure.json"), JSON.stringify({ error: String(error), fixtures, errors, forbidden, requests }, null, 2) + "\n");
  throw error;
} finally { await browser?.close(); await server.close(); }
