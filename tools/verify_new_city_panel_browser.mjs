// NewCity panel smoke: fixture shell + isolated API fixtures, fresh browser.
// Asserts the panel renders in mapview, create posts {module:'cities'} and
// the new archive entry appears; stamp without selection surfaces the
// canvas error instead of throwing. Never touches real stores.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';

const moduleName = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(isAbsolute(moduleName) ? pathToFileURL(moduleName).href : moduleName);
const root = new URL('../server/public/', import.meta.url);
const modules = { 'client.js': 'client.txt', 'shell-ui.js': 'shell-ui.txt', 'draft.js': 'draft.txt', 'stage.js': 'stage.txt', 'library.js': 'library.txt', 'catalog.js': 'catalog.txt', 'management.js': 'management.txt', 'publish.js': 'publish.txt', 'review.js': 'review.txt', 'stronghold.js': 'stronghold.txt', 'general.js': 'general.txt', 'mapview.js': 'mapview.txt', 'stage-assets.js': 'stageassets.txt' };
const server = createServer(async (req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html';
  if (name === 'favicon.ico') { res.writeHead(204).end(); return; }
  const file = modules[name] ?? (['index.html', 'shell-ui.css', 'style.css'].includes(name) ? name : null);
  if (!file) { res.writeHead(404).end(); return; }
  let contentType = 'text/html';
  if (name.endsWith('.js')) contentType = 'text/javascript';
  else if (name.endsWith('.css')) contentType = 'text/css';
  res.setHeader('Content-Type', contentType);
  res.end(await readFile(new URL(file, root)));
});
const gameId = '22222222-2222-4222-8222-222222222222';
const user = { id: 'isolated-admin', version: 1, account: 'fixture', role: 'admin', mustChangePassword: false };
// Real copy payload, generated in-process on an isolated :memory: store.
const { openStorage } = await import('../vps/sqlite-port.mjs');
const { GameCopyStore } = await import('../server/gamecopy.js');
const { FixedCopyProfile } = await import('../server/copyprofile.js');
const { createPinnedCopyLoader } = await import('./editor_trusted_copy.mjs');
const fixtureStorage = openStorage(':memory:');
fixtureStorage.sql.exec('CREATE TABLE content_games (game_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL)');
const fixtureStore = new GameCopyStore({ storage: fixtureStorage,
  principal: () => user, games: { assertNotDeleting: () => {}, listOwn: () => [] } });
const fixtureProfile = new FixedCopyProfile({ loadCopy: createPinnedCopyLoader({ allocateEntityId: () => 'op-' + randomUUID() }) });
const { game: pinnedGame } = await fixtureProfile.capture({ gameId: 'pinned-src', ownerId: user.id });
fixtureStorage.sql.exec('INSERT INTO content_games VALUES(?,?)', gameId, user.id);
fixtureStore.ensureFromGame('tok', gameId, structuredClone(pinnedGame));
const data = fixtureStore.read('tok', gameId).data;
data.metadata = { ...data.metadata, name: '新城冒烟' };
const replies = new Map([
  ['/api/session', { user, csrf: 'isolated-fixture' }],
  ['/api/admin/accounts', { accounts: [] }],
  ['/api/admin/copy/submissions', { queue: [] }],
  ['/api/resources', { mode: 'BUILTIN_READONLY', resources: [] }],
  ['/api/games', { games: [{ gameId, ownerId: user.id, draftRevision: '1', metadata: { name: data.metadata.name, introduction: '夾具' },
    createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString() }] }],
  ['/api/games/' + gameId + '/copy/submission', { gameId, state: 'draft', copyDigest: null, validation: null, slot: null, version: null, nextVersion: '1.0', publishEnabled: false, blockedReason: '尚未檢驗' }],
]);
let browser;
test('new city panel renders, creates and surfaces canvas errors', async () => {
  const posts = [];
  let copyData = structuredClone(data);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const errors = [], consoleErrors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    await page.route('**/api/**', route => {
      const url = new URL(route.request().url()), path = url.pathname;
      if (path === `/api/games/${gameId}/copy`) {
        if (route.request().method() === 'POST') {
          posts.push(route.request().postDataJSON());
          const body = route.request().postDataJSON();
          if (body?.module === 'cities' && body?.patch?.create) {
            copyData = structuredClone(copyData);
            copyData.cities['city-000'] = { cityId: 'city-000', runtimeSlot: 0, name: body.patch.create.name, ...body.patch.create.numbers };
          }
          return route.fulfill({ json: { gameId, copyDigest: 'b'.repeat(64), updatedAt: null, data: copyData } });
        }
        return route.fulfill({ json: { gameId, copyDigest: 'b'.repeat(64), updatedAt: null, data: copyData } });
      }
      if (route.request().method() === 'GET' && replies.has(path)) return route.fulfill({ json: replies.get(path) });
      return route.fulfill({ status: 500, json: { error: 'UNEXPECTED_FIXTURE_REQUEST' } });
    });
    const idle = async () => {
      await page.waitForFunction(() => document.querySelector('.workbench')?.getAttribute('aria-busy') === 'false');
      await page.waitForFunction(() => [...document.querySelectorAll('.workbench-loading')].every(el => el.getClientRects().length === 0));
    };
    await page.goto('http://127.0.0.1:' + server.address().port);
    await page.locator('#identity').filter({ hasText: 'fixture' }).waitFor();
    await idle();
    // Production flow: refresh the game list, then select the game up top.
    await page.getByRole('button', { name: '重新整理', exact: true }).first().click();
    await idle();
    await page.locator('#current-game').press('Enter');
    await page.getByRole('option', { name: '新城冒烟' }).click();
    await idle();
    await page.locator('#menu [data-view="mapview-editor"]').click();
    await idle();
    await page.locator('#new-city-panel').waitFor();
    await page.locator('#new-city-panel h3').waitFor();
    const mapStatus = await page.locator('#game-map-editor .map-status').first().textContent();
    assert.ok(!/Cannot read|undefined/.test(mapStatus ?? ''), 'map workbench loads: ' + mapStatus);
    // Stamp with no map selection surfaces an in-panel hint, no throw.
    const stampButton = page.locator('#new-city-panel').getByRole('button', { name: '在選位放置圖塊' });
    try {
      await stampButton.click({ timeout: 10000 });
      await page.waitForFunction(() => document.querySelector('#new-city-status')?.textContent.includes('點選一個空格'));
    } catch (error) {
      console.log('DIAG disabled:', await stampButton.isDisabled().catch(() => 'n/a'));
      console.log('DIAG status:', await page.locator('#new-city-status').textContent().catch(() => 'n/a'));
      console.log('DIAG mapmsg:', await page.locator('#game-map-editor .map-status').first().textContent().catch(() => 'n/a'));
      console.log('DIAG selected:', await page.evaluate(() => window.__diagSelected ?? 'n/a').catch(() => 'n/a'));
      throw error;
    }
    // Create posts the exact module shape the server verified.
    await page.locator('#new-city-panel').getByLabel('名稱').fill('冒烟新城');
    await page.locator('#new-city-panel').getByRole('button', { name: '建檔', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#new-city-status')?.textContent.includes('建檔完成'));
    assert.equal(posts.length, 1);
    assert.deepEqual(posts[0], { module: 'cities', patch: { create: { name: '冒烟新城',
      numbers: { max_prod: 4000, prod: 3000, growth: 100, defence: 100, troops: 50, type: 2, view: 1 } } } });
    assert.deepEqual(errors, []);
    assert.deepEqual(consoleErrors, []);
    process.stdout.write('PASS new-city panel smoke: renders, creates, surfaces canvas errors.\n');
  } finally { await browser?.close(); server.close(); }
});
