// Isolated rendering fixture; no real saves/profile, no strategic rule stepping.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startBrowserTestServer } from './browser_test_server.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright');
const server = await startBrowserTestServer();
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const results = [];
  for (const dpr of [1, 1.25, 2]) {
    const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: dpr });
    const origin = `http://127.0.0.1:${server.port}`;
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin || /save\.dat|\/api\//i.test(url.pathname)) return route.abort();
      return route.continue();
    });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('requestfailed', r => errors.push(r.url()));
    await page.route('**/render-fixture.html', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><canvas id="map"></canvas>' }));
    await page.goto(`http://127.0.0.1:${server.port}/render-fixture.html`);
    const result = await page.evaluate(async () => {
      const { MapView, preloadMarchMarkerImages, preloadDisasterObjectImages, preloadEngageMarkerImages } = await import('./src/render/mapview.js');
      const { GameBar } = await import('./src/ui/gamebar.js');
      const { WeatherPresentation } = await import('./src/render/weatherpresentation.js');
      const { createChunkedTerrain } = await import('./src/render/chunkedterrain.js');
      const { loadImage } = await import('./src/core/assets.js');
      const { DEFAULT_WORLD } = await import('./src/content/worlddefinition.js');
      const world = DEFAULT_WORLD;
      const sc = { player_faction: 0, cities: [], factions: [{ idx: 0, name: '測試', monarch: '測試', march_marker_style: 0 }], legions: [], disasterMapObjects: [], weatherClouds: [], factionOf(c) { return this.factions[c.faction] ?? null; } };
      for (let i = 0; i < 192; i++) sc.cities.push({ idx: i, name: `城${i}`, faction: i % 2, x: 2 + (i % 16) * 3, y: 6 + Math.floor(i / 16) * 3 });
      const view = new MapView(document.querySelector('#map'), () => sc, () => world);
      const app = { gameStarted: true, scenario: sc, view, world: { definition: world }, clock: { year: 196, month: 1, day: 1, hold: true, dayProgress: () => 0.5 }, engagementFx: { frameOf: () => null }, weatherFx: new WeatherPresentation() };
      view.app = app;
      app.gamebar = new GameBar(app);
      app.gamebar.submenuOpen = true;
      app.gamebar.miniOpen = true;
      let overlayCalls = 0;
      view.overlay = ctx => { overlayCalls++; app.gamebar.draw(ctx); };
      const atlas = await loadImage(world.assets.seasonAtlases.spring);
      view.seasonImg = createChunkedTerrain(atlas, new Uint8Array(384 * 256).fill(1), world);
      await Promise.all([app.gamebar._assets, app.weatherFx.preload(), preloadMarchMarkerImages(), preloadDisasterObjectImages(), preloadEngageMarkerImages()]);
      view.draw();
      await Promise.all(Array.from(document.images, i => i.decode().catch(() => {})));
      // city icons are detached Image objects: load the same three URLs explicitly.
      await Promise.all(['player', 'other', 'empty'].map(k => loadImage(`grf/ui/icon-${k}_city.png`)));
      await document.fonts.ready;
      const snap = () => view.ctx.getImageData(0, 0, view.cv.width, view.cv.height).data;
      const checks = [];
      function compare(name) {
        const before = JSON.stringify(sc);
        if (view.layers) view.layers.bypassFrames = 0;
        view.draw(); view.draw(); const cached = snap();
        view.draw({ uncached: true }); const direct = snap();
        let mismatch = 0;
        for (let i = 0; i < cached.length; i++) if (cached[i] !== direct[i]) mismatch++;
        checks.push({ name, mismatch, readOnly: before === JSON.stringify(sc) });
      }
      compare('initial');
      const timings = [];
      for (const crowded of [false, true]) {
        sc.legions = crowded ? Array.from({ length: 128 }, (_, i) => ({ idx: i, faction: 0, x: 4 + i % 16 * 3, y: 8 + Math.floor(i / 16) * 3, prevX: 3 + i % 16 * 3, prevY: 8 + Math.floor(i / 16) * 3, target: { x: 55, y: 35 }, _markerFrame: 1 })) : [];
        sc.disasterMapObjects = crowded ? Array.from({ length: 16 }, (_, i) => ({ active: true, group: i % 2 + 1, frame: i % 8, x: 8 + i % 8 * 5, y: 15 + Math.floor(i / 8) * 8 })) : [];
        sc.weatherClouds = crowded ? Array.from({ length: 16 }, (_, i) => ({ active: true, group: 0, frame: i % 8, x: 12 + i % 8 * 5, y: 14 + Math.floor(i / 8) * 12 })) : [];
        app.weatherFx.reset(); for (let t = 0; t <= 400; t += 100) app.weatherFx.update(sc, t);
        compare(crowded ? 'crowded' : 'paused');
        for (const mode of ['idle', 'pointer', 'moving']) for (const uncached of [false, true]) {
          app.clock.dayProgress = () => 0.5;
          app.weatherFx.reset(); for (let t = 0; t <= 400; t += 100) app.weatherFx.update(sc, t);
          const samples = [];
          for (let batch = 0; batch < 7; batch++) {
            const start = performance.now();
            for (let frame = 0; frame < 20; frame++) {
              if (mode === 'pointer') view.pointer = { x: 300 + frame, y: 330 };
              if (mode === 'moving') { app.clock.dayProgress = () => frame / 20; app.weatherFx.update(sc, 500 + (batch * 20 + frame) * 16); }
              view.draw({ uncached });
            }
            // Include command execution, not just Canvas enqueue time.
            snap(); samples.push((performance.now() - start) / 20);
          }
          samples.sort((a,b) => a-b);
          timings.push({ crowded, mode, uncached, medianMs: samples[3], p90Ms: samples[6] });
        }
      }
      for (const [name, mutate] of [
        ['pan', () => { view.cam.x = -31.5; view.cam.y = -17.25; }],
        ['owner-and-label', () => { sc.cities[0].name = '改名'; sc.cities[0].faction = 0; }],
        ['selection', () => { view.selectedCity = sc.cities[0]; view.selectedFaction = 0; }],
        ['hide-ui', () => { app.gamebar.submenuOpen = false; app.gamebar.miniOpen = false; }],
        ['remove-objects', () => { sc.legions = []; sc.disasterMapObjects = []; sc.weatherClouds = []; app.weatherFx.reset(); }],
        ['season', () => { view.seasonImg = createChunkedTerrain(atlas, new Uint8Array(384 * 256).fill(2), world); }],
      ]) { mutate(); compare(name); }
      const getScenario = view.getScenario;
      view.getScenario = () => null; compare('no-scenario');
      view.getScenario = getScenario; compare('scenario-restored');
      view.pointer = null; compare('cursor-removed');
      for (let i = 0; i < 40; i++) view.draw();
      const presents = view.layers?.stats.presents, calls = overlayCalls;
      for (let i = 0; i < 5; i++) view.draw();
      const idle = { reused: !view.layers || presents === view.layers.stats.presents, callbacks: overlayCalls - calls };
      const originalOverlay = view.overlay;
      const source = document.createElement('canvas'); source.width = source.height = 16;
      const sourceCtx = source.getContext('2d');
      view.overlay = ctx => { originalOverlay(ctx); ctx.drawImage(source, 80, 90); };
      sourceCtx.fillStyle = 'red'; sourceCtx.fillRect(0, 0, 16, 16); compare('mutable-source-red');
      sourceCtx.fillStyle = 'blue'; sourceCtx.fillRect(0, 0, 16, 16); compare('mutable-source-blue');
      let entered, direct, nestedCalls;
      const beforeNested = JSON.stringify(sc);
      view.overlay = ctx => {
        nestedCalls++;
        if (!entered) {
          entered = true;
          ctx.save(); ctx.beginPath(); ctx.rect(10, 10, 700, 500); ctx.clip();
          view.draw({ uncached: direct });
          ctx.restore();
        }
        originalOverlay(ctx);
      };
      const nestedPixels = [];
      for (direct of [false, true]) {
        entered = false; nestedCalls = 0;
        if (view.layers) view.layers.bypassFrames = 0;
        view.draw({ uncached: direct });
        if (nestedCalls !== 2) throw new Error('nested producer was duplicated or skipped');
        nestedPixels.push(snap());
      }
      let nestedMismatch = 0;
      for (let i = 0; i < nestedPixels[0].length; i++) if (nestedPixels[0][i] !== nestedPixels[1][i]) nestedMismatch++;
      checks.push({ name: 'nested-draw-with-clip', mismatch: nestedMismatch, readOnly: beforeNested === JSON.stringify(sc) });
      view.overlay = originalOverlay;
      compare('after-nested-draw');
      window.__renderFixture = { compare, checks, view };
      const stats = view.layers?.stats ?? null;
      return { checks, timings, stats, idle };
    });
    await page.setViewportSize({ width: 900, height: 700 });
    const resized = await page.evaluate(() => { const f = window.__renderFixture; f.compare('resized'); return f.checks.at(-1); });
    result.checks.push(resized);
    assert.equal(result.idle.reused, true);
    assert.equal(result.idle.callbacks, 5, 'UI message/layout producers must still execute on clean frames');
    assert.deepEqual(errors, []);
    for (const check of result.checks) { assert.equal(check.mismatch, 0, `DPR ${dpr} ${check.name}`); assert.equal(check.readOnly, true); }
    results.push({ dpr, ...result });
    await context.close();
  }
  process.stdout.write(JSON.stringify({ renderLayers: results }, null, 2) + '\n');
} finally { await browser?.close(); await server.close(); }
