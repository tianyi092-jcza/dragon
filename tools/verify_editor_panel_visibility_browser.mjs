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
  const managed = Array.from({ length: 30 }, (_, i) => ({
    gameId: `22222222-2222-4222-8222-${String(i).padStart(12, '0')}`, name: `管理${i}`, author: '另一作者',
    description: '已提交過的申請', submittedAt: '2026-01-02T00:00:00.000Z', validatedAt: null, validation: null,
    state: ['submitted', 'approved', 'ready', 'empty'][i % 4], listed: i % 4 === 1,
    version: i % 4 === 1 ? '1.0' : null, nextVersion: i % 4 === 1 ? '1.1' : '1.0', rowRevision: '1', createdAt: '2026-01-01T00:00:00.000Z',
  }));
  replies.set('/api/admin/copy/submissions', { queue: managed });
  await page.locator('#menu [data-view="management-editor"]').click();
  await idle();
  assert.equal(await page.locator('#review-table .el-table__row').count(), 25);
  assert.equal(await page.locator('#workspace-context').isVisible(), false);
  const reviewRow = i => page.locator('#review-table .el-table__row').filter({ has: page.locator(`[data-game-id="${managed[i].gameId}"]`) });
  assert.equal(await reviewRow(0).locator('[data-action="approve"]').isEnabled(), true);
  for (const i of [1, 2, 3]) {
    assert.equal(await reviewRow(i).locator('[data-action="approve"]').isDisabled(), true);
    assert.equal(await reviewRow(i).locator('[data-action="reject"]').isDisabled(), true);
    assert.equal(await reviewRow(i).locator('[data-action="delete"]').isEnabled(), true);
  }
  await reviewRow(1).locator('[data-action="delete"]').click();
  await page.locator('#review-overlay').waitFor();
  assert.match(await page.locator('#review-overlay-title').textContent(), /管理1/);
  await page.locator('#review-overlay-cancel').click();
  const reviewJump = page.locator('#review-pagination .el-pagination__jump input');
  await reviewJump.fill('2'); await reviewJump.press('Enter'); await reviewJump.press('Tab');
  await page.waitForFunction(() => document.querySelectorAll('#review-table .el-table__row').length === 5);
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 600 }, { width: 1600, height: 1000 }]) {
    await page.setViewportSize(viewport);
    assert.ok(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight));
    assert.ok(await page.locator('#review-pagination').evaluate(el => el.getBoundingClientRect().bottom <= innerHeight));
  }
  process.stdout.write('PASS global management: other games visible, submitted-only review, retained delete entry, 25/page+jump, viewport containment.\n');
  await reviewJump.fill('1'); await reviewJump.press('Enter'); await reviewJump.press('Tab');
  const deletion = [], requestReady = Array.from({ length: 3 }, () => Promise.withResolvers()), target = managed[1];
  let deleting = false;
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === `/api/games/${target.gameId}/deletion` || path === `/api/admin/games/${target.gameId}/purge` || deleting && path === '/api/admin/copy/submissions') {
      deleting = true; deletion.push(route); requestReady[deletion.length - 1].resolve(); return;
    }
    return route.fallback();
  });
  await reviewRow(1).locator('[data-action="delete"]').click();
  await page.locator('#review-overlay-confirm').click();
  const localProgress = async (count, text) => {
    await requestReady[count - 1].promise;
    await page.waitForFunction(() => document.querySelector('#review-overlay')?.getAttribute('aria-busy') === 'true');
    await page.locator('#review-overlay-line').filter({ hasText: text }).waitFor();
    assert.equal(deletion.length, count);
    assert.equal(await page.locator('.workbench-loading').isVisible(), false, 'delete uses dialog progress, never global loading');
  };
  await localProgress(1, '正在建立刪除柵欄');
  await deletion[0].fulfill({ json: { gameId: target.gameId, state: 'fenced', rowRevision: '2', createdAt: '2026-01-02T03:04:07.000Z' } });
  await localProgress(2, '正在清理遊戲檔案');
  await deletion[1].fulfill({ json: { gameId: target.gameId, state: 'purged', version: 1, tables: 2, purgedAt: '2026-01-02T03:04:08.000Z', removed: { content_games: 1, content_deletion_fences: 1 }, reclamation: { state: 'completed', pointer: 'removed', objects: 2, privateObjects: 49 } } });
  await localProgress(3, '正在更新管理清單');
  await deletion[2].fulfill({ json: { queue: managed.filter(row => row.gameId !== target.gameId) } });
  await idle();
  assert.equal(await page.locator('#review-overlay-title').textContent(), '刪除完成');
  assert.equal(await page.locator('#review-overlay-scopes .el-text--success').count(), 4);
  assert.equal(await reviewRow(1).count(), 0);
  await page.locator('#review-overlay-close').click();
  process.stdout.write('PASS deletion: fence → file cleanup → queue refresh in one dialog, no global loading, four completed scopes and row removed.\n');
  const copyId = '33333333-3333-4333-8333-333333333333', runReady = Promise.withResolvers();
  await page.route('**/api/admin/source', route => route.fulfill({ json: { definition: { registryId: 'fixture-source' } } }));
  await page.route('**/api/admin/copies**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/run')) { runReady.resolve(route); return; }
    return route.fulfill({ json: { gameId: copyId, state: path === '/api/admin/copies' ? 'pending' : 'running', rowRevision: '1', objects: 49, leaseUntil: Date.now() + 60000 } });
  });
  await page.locator('#menu [data-view="copy-game-editor"]').click(); await idle();
  await page.locator('#full-copy-name').fill('複製測試');
  await page.locator('#full-copy-create').click();
  const runRoute = await runReady.promise;
  await page.locator('#full-copy-loading .el-loading-mask').waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('.workbench-loading')].every(el => el.getClientRects().length === 0));
  assert.equal(await page.locator('#full-copy-overlay small').count(), 0);
  assert.equal(await page.locator('#full-copy-overlay .el-dialog__headerbtn').count(), 0);
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 600 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    const dialog = await page.locator('#full-copy-overlay').boundingBox();
    const spinner = await page.locator('#full-copy-loading').boundingBox();
    const text = await page.locator('#full-copy-overlay-text').boundingBox();
    assert.ok(dialog.width <= 440 && dialog.width <= viewport.width - 32);
    assert.ok(dialog.height >= 240 && dialog.y >= 0 && dialog.y + dialog.height <= viewport.height);
    assert.ok(spinner.y >= dialog.y && spinner.y + spinner.height <= text.y, 'spinner is inside the dialog above progress text');
    assert.equal(await page.locator('.workbench-loading').isVisible(), false);
  }
  await page.keyboard.press('Escape');
  await page.mouse.click(4, 4);
  assert.equal(await page.locator('#full-copy-overlay').isVisible(), true, 'Escape and backdrop cannot dismiss active copy');
  assert.equal(await page.locator('#full-copy-create').isDisabled(), true);
  await runRoute.fulfill({ json: { gameId: copyId, state: 'failed', rowRevision: '2', objects: 0, failedCode: 'COPY_FAILED' } });
  await idle();
  await page.locator('#full-copy-dismiss').waitFor();
  assert.equal(await page.locator('#full-copy-loading').count(), 0);
  assert.equal(await page.locator('#full-copy-overlay small').count(), 0);
  await page.locator('#full-copy-dismiss').click();
  await page.setViewportSize({ width: 1440, height: 900 });
  process.stdout.write('PASS full-copy dialog: compact/taller, spinner above text, no background Loading or footer explanation, blocking Escape/backdrop, failure dismissal.\n');
  const validations = [], validationReady = [Promise.withResolvers(), Promise.withResolvers()];
  await page.route(`**/api/games/${gameId}/draft/chapter-references`, route => route.fulfill({ json: { gameId, chapters: [] } }));
  await page.route(`**/api/games/${gameId}/copy/validate`, route => { validations.push(route); validationReady[validations.length - 1].resolve(); });
  await page.locator('#menu [data-view="publish-editor"]').click(); await idle();
  await page.locator('#publish-table [data-action="check"]').click();
  await validationReady[0].promise;
  await page.locator('#publish-loading .el-loading-mask').waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('.workbench-loading')].every(el => el.getClientRects().length === 0));
  assert.equal(await page.locator('#publish-overlay-elapsed').count(), 0);
  assert.equal(await page.locator('#publish-overlay-close').count(), 0);
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 600 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    const dialog = await page.locator('#publish-overlay').boundingBox();
    const spinner = await page.locator('#publish-loading').boundingBox();
    const title = await page.locator('#publish-overlay-text').boundingBox();
    assert.ok(dialog.width <= 440 && dialog.width <= viewport.width - 32);
    assert.ok(dialog.height >= 280 && dialog.y >= 0 && dialog.y + dialog.height <= viewport.height);
    assert.ok(spinner.y >= dialog.y && spinner.y + spinner.height <= title.y);
    assert.equal(await page.locator('.workbench-loading').isVisible(), false);
  }
  await page.keyboard.press('Escape'); await page.mouse.click(4, 4);
  assert.equal(await page.locator('#publish-overlay').isVisible(), true);
  await validations[0].fulfill({ json: { gameId, state: 'failed', copyDigest: 'a'.repeat(64), ticket: null, problems: Array.from({ length: 20 }, (_, i) => ({ code: 'CHAPTER_REFERENCE', chapterId: 'ch' + i, detail: '隔離夾具引用缺口' + i })) } });
  await idle();
  await page.locator('#publish-overlay-close').waitFor();
  assert.equal(await page.locator('#publish-loading').count(), 0);
  assert.equal(await page.locator('#publish-validation-layers [data-layer="CHAPTER_REFERENCE"] p').count(), 20);
  assert.ok(await page.locator('.publish-progress').evaluate(el => el.scrollHeight > el.clientHeight), 'long validation errors scroll inside the dialog');
  await page.locator('#publish-overlay-close').click();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('#publish-table [data-action="check"]').click(); await validationReady[1].promise;
  await validations[1].fulfill({ json: { gameId, state: 'passed', copyDigest: 'a'.repeat(64), ticket: 'fixture-ticket', problems: [] } });
  await page.locator('#publish-overlay').waitFor({ state: 'detached' }); await idle();
  const refreshReady = Promise.withResolvers();
  const holdRefresh = route => refreshReady.resolve(route);
  await page.route('**/api/games', holdRefresh);
  await page.locator('#publish-refresh').click();
  const refreshRoute = await refreshReady.promise;
  await page.locator('.workbench-loading').waitFor({ state: 'visible' });
  await refreshRoute.fulfill({ json: replies.get('/api/games') }); await idle();
  await page.unroute('**/api/games', holdRefresh);
  process.stdout.write('PASS validation dialog: compact/taller, local top spinner, blocking, scrollable failure details, passed auto-close and normal global Loading restored.\n');
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
