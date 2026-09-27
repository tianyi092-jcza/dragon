// New ephemeral browser/profile, owned loopback listener; no user save/profile.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startBrowserTestServer } from './browser_test_server.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright');
const server = await startBrowserTestServer();
const origin = `http://127.0.0.1:${server.port}`;
let browser;
const errors = [];
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addInitScript(() => sessionStorage.setItem('wolong.intro.seen.v1', '1'));
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin || /save\.dat|\/api\/|\.dragon-runtime/i.test(url.pathname)) {
      errors.push(`forbidden ${url.pathname}`); return route.abort();
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('requestfailed', (request) => errors.push(request.failure()?.errorText));
  await page.goto(origin);
  await page.waitForFunction(() => !!window.__app?.startMenu?._onClick);
  const storage = await page.evaluate(async () => {
    const app = window.__app;
    const { createNewGameScenario } = await import('/src/game/world.js');
    const { prepareScenario } = await import('/src/game/scenarioassembly.js');
    const { snapshotState } = await import('/src/game/savegame.js');
    const { OriginalBattleRng } = await import('/src/game/battle/originalrng.js');
    const { createSaveRepository } = await import('/src/core/saverepository.js');
    const { createIndexedDbSaveBackend } = await import('/src/core/indexeddbsavebackend.js');
    const { encodeSaveFile, decodeSaveFile } = await import('/src/core/saveexchange.js');
    const prepared = await prepareScenario({ raw: createNewGameScenario(app.data.scenarios[0], 0, null),
      idx: 0, content: app.content, world: app.world, mode: 'fresh' });
    const fixture = { scenario: prepared.scenario, scenarioIdx: 0, content: app.content, world: app.world,
      clock: { year: 190, month: 1, day: 1, hour: 0, sub: 0 }, originalRng: new OriginalBattleRng() };
    const saved = snapshotState(fixture, 0, 'roundtrip');
    const before = JSON.stringify(saved);
    const text = await encodeSaveFile(saved, app);
    const decoded = await decodeSaveFile(text, app);
    if (JSON.stringify(decoded) !== before) throw new Error('JSON exchange drift');
    const repo = createSaveRepository(createIndexedDbSaveBackend({ databaseName: 'phase2-isolated' }));
    const ids = await Promise.all(Array.from({ length: 8 }, () => repo.add(decoded).then((entry) => entry.slot)));
    if (new Set(ids).size !== 8) throw new Error('concurrent ID collision');
    const snapshot = JSON.stringify(await repo.load());
    const bad = JSON.parse(text); bad.saved.webMeta.originalRng.table[0] = -1;
    let rejected = false;
    try { await decodeSaveFile(JSON.stringify(bad), app); } catch { rejected = true; }
    if (!rejected || JSON.stringify(await repo.load()) !== snapshot) throw new Error('invalid import side effect');
    app.saves = await repo.load();
    const rows = app.startMenu._saveRows();
    if (rows.length !== 12 || rows.slice(0, 4).some((row) => !row.disabled) || rows.slice(4).some((row) => row.disabled))
      throw new Error('multi-save admission rows');
    app.ensureGameShell();
    await app.gamebar._assets;
    app.gamebar.openSystemSaveDialog();
    const rect = app.gamebar._systemSaveDialogRect();
    app.gamebar.wheel(rect.x + 30, rect.y + 50, 1);
    if (app.gamebar.systemSaveDialog.scroll !== 1) throw new Error('save scrolling');
    const hit = app.gamebar._hitSystemSaveOrLoadDialog(app.gamebar.systemSaveDialog, rect.x + 30, rect.y + 40);
    if (hit !== 1) throw new Error('scrolled hit identity');
    app.gamebar.closeSystemSaveDialog();
    // Exercise the actual queued App path, including its pre-snapshot guards.
    const previous = { scenario: app.scenario, scenarioIdx: app.scenarioIdx,
      clock: app.clock, originalRng: app.originalRng, runtimeEnabled: app.runtimeEnabled,
      saveRepository: app.saveRepository, saves: app.saves, loadedSaveSlot: app.loadedSaveSlot };
    try {
      Object.assign(app, fixture, { saveRepository: repo, runtimeEnabled: false });
      if ((await app.saveGame(12, 'blocked')).saved !== 'blocked') throw new Error('runtime guard');
      app.runtimeEnabled = true;
      app._legionSlotBatch = {};
      if ((await app.saveGame(12, 'blocked')).saved !== 'blocked') throw new Error('snapshot guard');
      app._legionSlotBatch = null;
      if ((await app.saveGame(12, 'actual App save')).saved !== 'local') throw new Error('App save failed');
      const actual = await repo.get(app.loadedSaveSlot);
      if (actual.label !== 'actual App save' || JSON.stringify(actual.webMeta.originalRng) !== JSON.stringify(saved.webMeta.originalRng))
        throw new Error('App single-record/RNG drift');
    } finally { Object.assign(app, previous); app._legionSlotBatch = null; }
    // Seed only this ephemeral origin for the actual manager UI.
    await app.saveRepository.add(decoded);
    return { ids, rejected, rows: rows.length };
  });
  assert.equal(storage.rows, 12);
  const pixels = await page.evaluate(async () => {
    const { defaultWorldResources: world } = await import('/src/game/worldresources.js');
    const { loadImage } = await import('/src/core/assets.js');
    let cases = 0;
    for (const season of ['spring', 'summer', 'autumn', 'winter']) {
      const chunks = await world.loadSeason(season);
      const image = await loadImage(`map_tiles_${season}.png`);
      for (const dpr of [1, 1.25, 2]) for (const [x, y, scale] of [[0, 0, 1], [-499, -507, 1], [-913.25, -711.5, 1], [-2000.5, -1550.25, 1]]) {
        const canvases = [document.createElement('canvas'), document.createElement('canvas')];
        const contexts = canvases.map((canvas) => {
          canvas.width = Math.ceil(641 * dpr); canvas.height = Math.ceil(399 * dpr);
          const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr); ctx.imageSmoothingEnabled = false; return ctx;
        });
        contexts[0].drawImage(image, x, y, 6144 * scale, 4096 * scale);
        chunks.draw(contexts[1], x, y, scale, 641, 399);
        const a = contexts[0].getImageData(0, 0, canvases[0].width, canvases[0].height).data;
        const b = contexts[1].getImageData(0, 0, canvases[1].width, canvases[1].height).data;
        for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) throw new Error(`pixel drift ${season} ${x}/${scale}/DPR${dpr} at ${i}`);
        cases++;
      }
      const ctx = document.createElement('canvas').getContext('2d');
      for (let y = 0; y < 4096; y += 512) for (let x = 0; x < 6144; x += 512)
        chunks.draw(ctx, -x, -y, 1, 512, 512);
      if (chunks.cacheSize() > 32) throw new Error('unbounded chunk cache');
    }
    return cases;
  });
  assert.equal(pixels, 48);
  await page.goto(`${origin}/saves.html`);
  await page.waitForFunction(() => document.querySelector('#rows button')?.disabled === false);
  const download = page.waitForEvent('download');
  await page.locator('#rows button').first().click();
  const exported = await download;
  const stream = await exported.createReadStream();
  const buffers = []; for await (const chunk of stream) buffers.push(chunk);
  await page.locator('#file').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.concat(buffers) });
  await page.locator('#import').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('匯入完成'));
  assert.equal(await page.locator('#rows tr').count(), 2);
  await page.goto(`${origin}/editor.html`);
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('已載入編輯副本'));
  await page.locator('[data-field="prod"]').fill('12345');
  await page.locator('#apply').click();
  const patchDownload = page.waitForEvent('download');
  await page.locator('#export').click();
  const patchStream = await (await patchDownload).createReadStream();
  const patchBuffers = []; for await (const chunk of patchStream) patchBuffers.push(chunk);
  let patch; try { patch = JSON.parse(Buffer.concat(patchBuffers).toString()); }
  catch (cause) { throw new Error('Invalid exported patch', { cause }); }
  assert.equal(patch.changes[0].document.state.cities[0].prod, 12345);
  await page.locator('#undo').click();
  assert.notEqual(await page.locator('[data-field="prod"]').inputValue(), '12345');
  await context.close();
  assert.deepEqual(errors, []);
  process.stdout.write('expansion browser OK: atomic multi-save IDs, JSON exchange, admission/scroll, 48 pixel comparisons, bounded cache, manager/editor UI\n');
} finally { await browser?.close(); await server.close(); }
