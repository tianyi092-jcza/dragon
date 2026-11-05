// Actual index.html/boot/App/StartMenu, new Chromium context and loopback only.
// Local format-3 summaries/bodies below are owned fixtures, not playable saves.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { startBrowserTestServer } from './browser_test_server.mjs';
const round = process.argv[2];
assert.equal(process.argv.length, 3); assert.match(round ?? '', /^[A-Za-z0-9-]{1,64}$/);
const out = '.dragon-analysis/editor-phase/' + round; mkdirSync(out);
const paths = ['web/src/player/playercatalog.js', 'web/src/player/playerpublic.js', 'web/src/core/gamesavecatalogs.js', 'web/src/core/gamesavestore.js', 'web/src/core/gamesavecodec.js', 'web/src/ui/startmenu.js', 'web/src/main.js', 'tools/verify_startmenu_local_catalog_browser.mjs'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const hashes = Object.fromEntries(paths.map(path => [path, sha(readFileSync(path))]));
const { chromium } = createRequire(import.meta.url)('C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright');
const server = await startBrowserTestServer(), origin = `http://127.0.0.1:${server.port}`;
const errors = [], forbidden = [], checks = []; let browser;
try {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(systemroot|windir|path|pathext|temp|tmp|comspec|appdata|localappdata)$/i.test(key)));
  browser = await chromium.launch({ headless: true, env });
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, serviceWorkers: 'block' });
  await context.addInitScript(origin => {
    if (location.origin !== origin) return;
    sessionStorage.setItem('wolong.intro.seen.v1', '1');
    window.__ownedOpens = []; window.__catalogReads = []; window.__inspectOnly = false;
    const open = indexedDB.open.bind(indexedDB);
    indexedDB.open = (name, version) => {
      if (name !== 'wolong-web') throw new Error('non-owned database name');
      window.__ownedOpens.push({ name, version: version ?? null });
      const request = open(name, version);
      request.addEventListener('success', () => {
        const db = request.result, transaction = db.transaction.bind(db);
        db.transaction = (...args) => {
          if (window.__inspectOnly && args[1] !== 'readonly') throw new Error('inspection write forbidden');
          const tx = transaction(...args);
          if (window.__inspectOnly) {
            const store = tx.objectStore('saves'), get = store.get.bind(store);
            store.get = key => {
              if (typeof key !== 'string' || !key.endsWith(':catalog-v3')) throw new Error('inspection body read forbidden');
              window.__catalogReads.push(key); return get(key);
            };
            store.getAll = store.openCursor = () => { throw new Error('inspection body enumeration forbidden'); };
            tx.objectStore = () => store;
          }
          return tx;
        };
      });
      return request;
    };
  }, origin);
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin || /save\.dat|\/api\/|\/play-api\//i.test(url.pathname)) { forbidden.push(url.href); return route.abort(); }
    return route.continue();
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('requestfailed', request => errors.push(`${request.url()} ${request.failure()?.errorText}`));
  await page.goto(origin + '/index.html');
  await page.waitForFunction(() => !!window.__app?.startMenu?._onClick, {}, { timeout: 120000 });
  assert.equal(await page.evaluate(() => window.__app.gameStarted), false);
  // Existing App boot loads its builtin save repository once. The new local
  // inspector instead opens without a version, and must not run on mount.
  assert.deepEqual(await page.evaluate(() => window.__ownedOpens), [{ name: 'wolong-web', version: 1 }]);
  assert.equal(await page.locator('.player-catalog-notice').textContent(), '通知暫不可用');
  checks.push('real public boot reaches initial title with unavailable HTTP-origin remote reader; only existing builtin repository preload, no automatic new catalog inspection');
  await page.evaluate(async () => {
    const { createGameSaveStore } = await import('/src/core/gamesavestore.js');
    const gameId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
    const store = createGameSaveStore({ gameId, databaseName: 'wolong-web', getIndexedDB: () => indexedDB });
    await store.put({ gameId, slot: 2, releaseId: 'owned-release', releaseOrdinal: 9, chapterId: 'owned-chapter', manifestDigest: 'a'.repeat(64), snapshot: { ownedMarker: 'not a playable snapshot' } });
    window.__raw = (mode, action) => new Promise((resolve, reject) => {
      const opening = indexedDB.open('wolong-web'); opening.onerror = () => reject(opening.error);
      opening.onsuccess = () => {
        const db = opening.result, tx = db.transaction('saves', mode); let result;
        tx.oncomplete = () => { db.close(); resolve(result); }; tx.onabort = () => { db.close(); reject(tx.error); };
        action(tx.objectStore('saves'), value => { result = value; });
      };
    });
    await window.__raw('readwrite', (s, done) => {
      s.put({ format: 3, rows: 'broken' }, 'game:broken:catalog-v3');
      s.put({ ownedLegacy: true }, 'catalog-v2'); done(true);
    });
    window.__snapshot = () => window.__raw('readonly', (s, done) => {
      const values = s.getAll(); values.onsuccess = () => { const keys = s.getAllKeys(); keys.onsuccess = () => done(JSON.stringify([keys.result, values.result])); };
    });
    const menu = window.__app.startMenu, choose = menu._chooseChapter.bind(menu);
    window.__chooseChapterCalls = 0;
    menu._chooseChapter = (...args) => { window.__chooseChapterCalls++; return choose(...args); };
  });
  const before = await page.evaluate(() => window.__snapshot());
  await page.evaluate(() => { window.__inspectOnly = true; });
  await page.getByRole('button', { name: '不可用存檔', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '不可用存檔', exact: true });
  await page.waitForFunction(() => document.querySelector('[role=dialog]')?.textContent.includes('槽3　版本序號 9'));
  assert.match(await dialog.textContent(), /目錄損壞/);
  assert.equal(await page.evaluate(() => window.__app.startMenu.publicCatalog.view.selection()), null);
  assert.equal(await dialog.locator('button').count(), 0);
  assert.deepEqual(await page.evaluate(() => window.__catalogReads.toSorted()), ['game:aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa:catalog-v3', 'game:broken:catalog-v3']);
  const clickCanvas = async (x, y) => {
    const box = await page.locator('#startv').boundingBox();
    await page.mouse.click(box.x + x * box.width / 640, box.y + y * box.height / 400);
  };
  await clickCanvas(300, 175); await page.waitForTimeout(3250);
  assert.equal(await dialog.count(), 1);
  assert.equal(await page.evaluate(() => window.__chooseChapterCalls), 0);
  assert.equal(await page.evaluate(() => window.__app.gameStarted), false);
  await page.screenshot({ path: out + '/local-catalog-title.png' });
  checks.push('actual title button reads only native catalog summaries; corrupt data stays unknown, underlying yes-click and auto-close do not advance the game');
  await dialog.click({ button: 'right' });
  assert.equal(await dialog.count(), 0);
  await page.evaluate(() => { window.__inspectOnly = false; });
  assert.equal(await page.evaluate(() => window.__snapshot()), before);
  await clickCanvas(300, 175);
  await page.waitForFunction(() => window.__chooseChapterCalls === 1);
  assert.equal(await page.evaluate(() => window.__app.startMenu.selectedGame.kind), 'builtin');
  assert.equal(await page.locator('.player-public-catalog').isVisible(), false);
  assert.equal(await page.evaluate(() => window.__snapshot()), before);
  checks.push('right-click returns to actual title, all raw fixture bytes remain unchanged, and normal builtin chapter selection still starts');
  assert.deepEqual(errors, []); assert.deepEqual(forbidden, []);
  for (const [path, hash] of Object.entries(hashes)) assert.equal(sha(readFileSync(path)), hash);
  writeFileSync(out + '/receipt.json', JSON.stringify({ checks, hashes, errors, forbidden, screenshotSHA: sha(readFileSync(out + '/local-catalog-title.png')), scope: 'Actual public boot/App/StartMenu and native isolated IDB. HTTP-origin remote reader unavailable. Seeded summaries are not playable snapshots; no restore, Trial, HTTPS/cloud or production claim.' }, null, 2), { flag: 'wx' });
  process.stdout.write(JSON.stringify({ checks: checks.length, out }) + '\n');
} catch (error) {
  writeFileSync(out + '/failure.json', JSON.stringify({ error: String(error.stack ?? error), checks, errors, forbidden }, null, 2), { flag: 'wx' }); throw error;
} finally { await browser?.close(); await server.close(); }
