// Fresh ephemeral Chromium context + owned loopback server; no user profile.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startBrowserTestServer } from './browser_test_server.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ||
  'C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright');
const server = await startBrowserTestServer();
const origin = `http://127.0.0.1:${server.port}`;
const errors = [];
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addInitScript(() => sessionStorage.setItem('wolong.intro.seen.v1', '1'));
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin || /save\.dat|\/api\/|\.dragon-runtime/i.test(url.pathname)) {
      errors.push(`forbidden request: ${url.pathname}`);
      return route.abort();
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('requestfailed', (request) => errors.push(request.failure()?.errorText));
  await page.goto(`${origin}/index.html`);
  await page.waitForFunction(() => !!window.__app?.startMenu?._onClick);
  const result = await page.evaluate(async () => {
    const app = window.__app;
    const original = app.world;
    const previousImage = app.view.seasonImg;
    const previousSeason = app.seasonIdx;
    let resolve;
    app.world = { ...original, loadSeason: () => new Promise((done) => { resolve = done; }) };
    const loading = app.setSeason(0);
    app.world = original;
    resolve({ stale: true });
    await loading;
    const staleRejected = app.view.seasonImg === previousImage;
    app.seasonIdx = previousSeason;
    const { createSaveRepository, emptySaveSlots } = await import('/src/core/saverepository.js');
    const { createIndexedDbSaveBackend } = await import('/src/core/indexeddbsavebackend.js');
    const repo = createSaveRepository(createIndexedDbSaveBackend({ databaseName: 'phase1-isolated' }));
    const slots = emptySaveSlots();
    slots.slots[0] = { ...slots.slots[0], played: true, state: { value: 7 } };
    await repo.save(slots);
    const transaction = IDBDatabase.prototype.transaction;
    let rejected = false;
    try {
      IDBDatabase.prototype.transaction = function (...args) {
        const tx = transaction.apply(this, args);
        if (args[1] === 'readwrite') queueMicrotask(() => tx.abort());
        return tx;
      };
      slots.slots[0].state.value = 99;
      try { await repo.save(slots); } catch { rejected = true; }
    } finally { IDBDatabase.prototype.transaction = transaction; }
    return { staleRejected, worldBound: app.view.getWorldDefinition() === original.definition,
      rejected, retained: (await repo.load()).slots[0].state.value,
      slots: (await repo.load()).slots.length };
  });
  assert.deepEqual(result, { staleRejected: true, worldBound: true, rejected: true, retained: 7, slots: 4 });
  await context.close();
  assert.deepEqual(errors, []);
  console.log('refactor browser OK: stale world image rejected, real IDB abort retains previous record, zero errors');
} finally { await browser?.close(); await server.close(); }
