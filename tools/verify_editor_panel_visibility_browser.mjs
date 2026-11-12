// Built editor shell + isolated in-memory API fixtures; never opens real stores.
// PLAYWRIGHT_MODULE may point to an existing Playwright installation.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
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
const gameId = '11111111-1111-4111-8111-111111111111';
const user = { id: 'isolated-admin', version: 1, account: 'fixture', role: 'admin', mustChangePassword: false };
const data = {
  metadata: { name: '隔離測試遊戲', introduction: '純記憶體夾具' }, chapterOrder: ['ch1'],
  chapters: { ch1: { chapterId: 'ch1', state: { name: '第一章', start: { year: 184, month: 1, day: 1 }, factions: [], generals: [], cities: [] } } },
  cities: Object.fromEntries(Array.from({ length: 192 }, (_, i) => ['city-' + i, { name: '據點' + String(i).padStart(3, '0'), max_prod: 100 + i, prod: 50, growth: 2, defence: 3, troops: 4, type: i % 5, view: 1 }])),
};
const replies = new Map([
  ['/api/session', { user, csrf: 'isolated-fixture' }],
  ['/api/admin/accounts', { accounts: [] }],
  ['/api/admin/copy/submissions', { queue: [] }],
  ['/api/resources', { mode: 'BUILTIN_READONLY', resources: [] }],
  ['/api/games', { games: [{ gameId, ownerId: user.id, draftRevision: '1', metadata: data.metadata }] }],
  ['/api/games/' + gameId + '/copy', { gameId, copyDigest: 'a'.repeat(64), updatedAt: null, data }],
  ['/api/games/' + gameId + '/copy/submission', { gameId, state: 'draft', copyDigest: null, validation: null, slot: null, version: null, nextVersion: '1.0', publishEnabled: false, blockedReason: '尚未檢驗' }],
]);
let browser;
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [], consoleErrors = [], unexpected = [], pending = [], posts = [];
  let holdCopy = false;
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === `/api/games/${gameId}/copy` && (holdCopy || route.request().method() === 'POST')) {
      if (route.request().method() === 'POST') posts.push(route.request().postDataJSON());
      pending.push(route); return;
    }
    if (route.request().method() === 'GET' && replies.has(path)) return route.fulfill({ json: replies.get(path) });
    unexpected.push(route.request().method() + ' ' + path);
    return route.fulfill({ status: 500, json: { error: 'UNEXPECTED_FIXTURE_REQUEST' } });
  });
  const idle = async () => {
    await page.waitForFunction(() => document.querySelector('.workbench')?.getAttribute('aria-busy') === 'false');
    await page.waitForFunction(() => [...document.querySelectorAll('.workbench-loading')].every(el => el.getClientRects().length === 0));
  };
  const jump = async number => {
    const input = page.locator('#stronghold-pagination .el-pagination__jump input');
    await input.fill(String(number));
    await input.press('Enter');
    await input.press('Tab');
    await page.waitForFunction(number => document.querySelector('#stronghold-pagination .el-pager .is-active')?.textContent.trim() === String(number), number);
  };
  const checkSpin = async () => {
    await page.locator('.workbench-loading:not(.el-loading-fade-leave-active):visible').waitFor();
    assert.equal(await page.locator('.workbench-loading:not(.el-loading-fade-leave-active):visible circle').count(), 4);
    assert.equal(await page.locator('.el-button.is-loading').count(), 0);
  };
  const releaseCopy = async (json, status = 200) => {
    assert.equal(pending.length, 1);
    await pending.shift().fulfill({ status, json });
  };
  const checkPanels = async (view, phase) => {
    const panels = await page.locator('#session > .module-card').evaluateAll(elements => elements.map(el => ({
      id: el.id, hidden: el.hidden, display: getComputedStyle(el).display, rects: el.getClientRects().length,
    })));
    assert.deepEqual(panels.filter(panel => panel.hidden && (panel.display !== 'none' || panel.rects !== 0)), [], phase + ': hidden panels must have no display or layout space');
    assert.deepEqual(panels.filter(panel => panel.rects > 0).map(panel => panel.id), [view === 'management-editor' ? 'review-editor' : view], phase + ': only the selected module is visible');
    assert.equal(await page.locator('#stronghold-editor').isVisible(), view === 'stronghold-editor', phase + ': stronghold visibility');
  };
  await page.goto('http://127.0.0.1:' + server.address().port);
  await page.locator('#identity').filter({ hasText: 'fixture' }).waitFor();
  await idle();
  await checkPanels('draft-editor', 'initial empty state');
  const views = await page.locator('#menu [data-view]').evaluateAll(elements => elements.map(el => el.dataset.view));
  assert.equal(views.length, 11, 'all author and administrator modules');
  for (const phase of ['empty', '192 cities loaded']) {
    for (const view of views) {
      await page.locator('#menu [data-view="' + view + '"]').click();
      await idle();
      await checkPanels(view, phase);
    }
    process.stdout.write('PASS ' + phase + ': all 11 modules hide inactive panels without occupying space.\n');
    if (phase === 'empty') {
      await page.getByRole('button', { name: '重新整理', exact: true }).first().click();
      await idle();
      await page.locator('#menu [data-view="stronghold-editor"]').click();
      await page.locator('#stronghold-load').click();
      await idle();
      assert.equal(await page.locator('#stronghold-table .el-table__row').count(), 25);
      assert.match(await page.locator('#stronghold-pagination .el-pagination__total').textContent(), /192/);
    }
  }
  await page.locator('#menu [data-view="stronghold-editor"]').click();
  await jump(8);
  assert.equal(await page.locator('#stronghold-table .el-table__row').count(), 17);
  assert.equal(await page.locator('#stronghold-table [data-field="seq"]').first().textContent(), '176');
  assert.equal(await page.locator('#stronghold-table [data-field="seq"]').last().textContent(), '192');
  assert.equal(await page.locator('#stronghold-pagination .btn-next').isDisabled(), true);
  await page.locator('#stronghold-pagination .btn-prev').click();
  assert.equal(await page.locator('#stronghold-table [data-field="seq"]').first().textContent(), '151');
  await page.locator('#stronghold-pagination .btn-next').click();
  assert.equal(await page.locator('#stronghold-table .el-table__row').count(), 17);
  await page.locator('#stronghold-search').fill('據點191');
  assert.equal(await page.locator('#stronghold-table .el-table__row').count(), 1);
  assert.equal(await page.locator('#stronghold-table [data-field="seq"]').first().textContent(), '1');
  await page.locator('#stronghold-search').fill('missing-city');
  assert.equal(await page.locator('#stronghold-table .el-table__row').count(), 0);
  await page.locator('#stronghold-search').fill('');
  assert.equal(await page.locator('#stronghold-table .el-table__row').count(), 25);
  await page.locator('#stronghold-pagination .el-select').click();
  await page.getByRole('option', { name: /50/ }).click();
  assert.equal(await page.locator('#stronghold-table .el-table__row').count(), 50);
  await page.locator('#stronghold-pagination .el-select').click();
  await page.getByRole('option', { name: /100/ }).click();
  assert.equal(await page.locator('#stronghold-table .el-table__row').count(), 100);
  await page.locator('#stronghold-pagination .el-select').click();
  await page.getByRole('option', { name: /25/ }).click();
  const nameHeader = page.locator('#stronghold-table [data-sort="name"]');
  await nameHeader.click();
  await nameHeader.click();
  assert.equal(await page.locator('#stronghold-table [data-field="name"]').first().textContent(), '據點191');
  await jump(8);
  assert.equal(await page.locator('#stronghold-table [data-field="name"]').last().textContent(), '據點000', 'sort covers all pages');
  await nameHeader.click();
  await page.locator('#stronghold-search').fill('據點005');
  const city = field => page.locator(`#stronghold-table [data-field="${field}"][data-city-id="city-5"]`);
  await city('actions').locator('[data-action="edit"]').click();
  assert.equal(await city('actions').locator('.el-button--primary').count(), 0);
  assert.equal(await page.locator('#stronghold-table .el-table-fixed-column--right').count(), 0);
  await city('name').locator('input').fill('不應寫入');
  if (process.env.CITIES_SCREENSHOT) await page.screenshot({ path: process.env.CITIES_SCREENSHOT });
  await city('actions').locator('[data-action="cancel"]').click();
  assert.equal(posts.length, 0);
  assert.equal(await city('name').textContent(), '據點005');
  await city('actions').locator('[data-action="edit"]').click();
  await city('name').locator('input').fill('已保存據點');
  holdCopy = true;
  await city('actions').locator('[data-action="save"]').click();
  await checkSpin();
  assert.deepEqual(posts.at(-1), { module: 'cities', patch: { rename: { 'city-5': '已保存據點' } } });
  data.cities['city-5'].name = '已保存據點';
  const reread = page.waitForRequest(request => new URL(request.url()).pathname.endsWith('/copy') && request.method() === 'GET');
  await releaseCopy({ gameId, copyDigest: 'b'.repeat(64), updatedAt: null });
  await reread;
  await checkSpin();
  await releaseCopy(replies.get(`/api/games/${gameId}/copy`));
  await idle();
  await page.locator('#stronghold-search').fill('已保存據點');
  assert.equal(await city('name').textContent(), '已保存據點');
  assert.equal(await city('name').locator('input').count(), 0, 'save rereads and leaves edit mode');
  assert.equal(posts.length, 1);
  await page.locator('#stronghold-search').fill('');
  holdCopy = false;
  process.stdout.write('PASS cities: 25/page, jump/previous/next/size/filter/empty/global sort, plain actions, cancel no write, save and reread with shared loading.\n');
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 600 }, { width: 1600, height: 1000 }]) {
    await page.setViewportSize(viewport);
    await checkPanels('stronghold-editor', 'reopened at ' + viewport.width);
    const header = page.locator('#stronghold-table .el-table__header-wrapper');
    const before = await header.boundingBox();
    const scroll = page.locator('#stronghold-table .el-scrollbar__wrap');
    const maxScroll = await scroll.evaluate(el => el.scrollHeight - el.clientHeight);
    assert.ok(maxScroll > 0);
    await scroll.evaluate(el => { el.scrollTop = 0; el.scrollTop = 1000; });
    assert.equal(await scroll.evaluate(el => el.scrollTop), Math.min(1000, maxScroll), 'table body actually scrolls');
    assert.equal(await page.locator('#stronghold-table .el-table__row').count(), 25, 'scrolling does not append more rows');
    const after = await header.boundingBox();
    assert.equal(after.y, before.y, 'header stays fixed');
    assert.ok(await page.locator('#stronghold-table').evaluate(el => el.getBoundingClientRect().bottom <= innerHeight), 'table stays inside viewport');
    assert.ok(await page.locator('#stronghold-pagination').evaluate(el => el.getBoundingClientRect().bottom <= innerHeight), 'pagination stays visible');
    assert.ok(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight), 'whole page does not scroll');
    await jump(2);
    assert.equal(await scroll.evaluate(el => el.scrollTop), 0);
    await jump(1);
  }
  await page.locator('#menu [data-view="generals-editor"]').click();
  await idle();
  await checkPanels('generals-editor', 'final generals state');
  if (process.env.PANEL_VISIBILITY_SCREENSHOT) await page.screenshot({ path: process.env.PANEL_VISIBILITY_SCREENSHOT });
  assert.deepEqual(errors, []);
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(unexpected, []);
  assert.deepEqual(pending, []);
  process.stdout.write('PASS reopened table: fixed header/pagination, three viewport sizes, all 192 cities accessible by pagination; pageerror/console errors/unexpected requests = 0.\n');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
