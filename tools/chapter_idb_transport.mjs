// Isolated real browser IDB transport for native snapshot tests; never opens the user's database.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

export async function createChapterIDBTransport() {
  const files = new Map(['gamesavestore.js', 'gamesavecodec.js'].map(name => ['/src/core/' + name, readFileSync(new URL('../web/src/core/' + name, import.meta.url))]));
  const server = createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><link rel="icon" href="data:,"><title>CHAPTER-WB isolated IDB</title>'); }
    else if (req.method === 'GET' && files.has(req.url)) { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(files.get(req.url)); }
    else { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`, databaseName = 'chapter-wb-' + randomUUID(), errors = [];
  const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addInitScript(name => {
    const open = indexedDB.open.bind(indexedDB);
    indexedDB.open = (requested, version) => { if (requested !== name) throw new Error('non-owned database forbidden'); return open(requested, version); };
  }, databaseName);
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin || url.search || url.pathname !== '/' && !files.has(url.pathname)) { errors.push('forbidden request: ' + url); return route.abort(); }
    return route.continue();
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('requestfailed', request => errors.push('request failed: ' + request.url()));
  await page.goto(origin);
  let count = 0;
  return {
    async roundtrip(snapshot) {
      const text = JSON.stringify(snapshot);
      const result = await page.evaluate(async ({ text, databaseName }) => {
        const { createGameSaveStore } = await import('/src/core/gamesavestore.js');
        const store = createGameSaveStore({ gameId: 'chapter-fixture', databaseName, getIndexedDB: () => indexedDB });
        const previous = await store.get(0);
        await store.put({ gameId: 'chapter-fixture', slot: 0, releaseId: 'isolated-release', releaseOrdinal: 1, chapterId: 'isolated-chapter', manifestDigest: 'a'.repeat(64), snapshot: JSON.parse(text) }, previous?.token);
        // Reopen through a fresh store instance, not the write result or an in-memory echo.
        const read = await createGameSaveStore({ gameId: 'chapter-fixture', databaseName, getIndexedDB: () => indexedDB }).get(0);
        return { text: JSON.stringify(read.record.snapshot), revision: read.record.writeRevision };
      }, { text, databaseName });
      assert.equal(result.revision, ++count);
      const restored = JSON.parse(result.text); assert.deepEqual(restored, snapshot); assert.deepEqual(errors, []);
      return restored;
    },
    async close() {
      await browser.close(); await new Promise(resolve => server.close(resolve));
      assert.equal(count, 2, 'both expected snapshots passed through isolated IDB'); assert.deepEqual(errors, []);
    },
  };
}
