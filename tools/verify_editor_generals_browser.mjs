// Actual built editor shell/controllers with isolated in-memory API responses.
// Uses an existing Playwright installation; never reads production or save data.
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
const user = { id: 'isolated-author', version: 1, account: 'fixture', role: 'author', mustChangePassword: false };
const portraits = Array.from({ length: 621 }, (_, i) => ({ assetId: `p${1000 + i}`, sha256: 'e'.repeat(64) }));
const idFor = i => `${gameId}#general-${i.toString(16).padStart(64, '0')}`;
const ability = { siege: 0, field: 9, naval: 10, force: 11, lead: 12, politics: 13 };
const data = {
  metadata: { name: '隔離武將測試', introduction: '純記憶體夾具' }, chapterOrder: ['ch1'],
  chapters: { ch1: { chapterId: 'ch1', state: { name: '第一章', start: { year: 184, month: 1, day: 1 }, factions: [], cities: [], generals: [
    { idx: 0, name: '待導入甲', hao: '', faction: null, portrait: 0, ability },
    { idx: 1, name: '待導入乙', hao: '', faction: null, portrait: 1, ability },
  ] } } },
  cities: {},
  generals: Object.fromEntries(Array.from({ length: 160 }, (_, i) => [idFor(i), { name: `武將${String(i).padStart(3, '0')}`, zi: `字${i}`, hao: '', portraitRef: portraits[0], suicideOnCapture: false, ability: i === 1 ? null : { ...ability } }])),
};
const copyReply = () => ({ gameId, copyDigest: 'a'.repeat(64), updatedAt: null, data });
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
let browser;
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [], consoleErrors = [], unexpected = [], pending = [], posts = [], imageRequests = new Set();
  let albumRequests = 0;
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('dialog', dialog => dialog.accept());
  await page.route('**/api/**', route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    const method = request.method();
    if (method === 'GET' && path === '/api/session') return route.fulfill({ json: { user, csrf: 'isolated-fixture' } });
    if (method === 'GET' && path === '/api/resources') return route.fulfill({ json: { mode: 'BUILTIN_READONLY', resources: [] } });
    if (method === 'GET' && path === '/api/games') return route.fulfill({ json: { games: [{ gameId, ownerId: user.id, draftRevision: '1', metadata: data.metadata }] } });
    if (path === `/api/games/${gameId}/copy`) {
      if (method === 'POST') posts.push(request.postDataJSON());
      pending.push({ key: `copy-${method}`, route }); return;
    }
    if (method === 'GET' && path === `/api/games/${gameId}/portraits`) {
      albumRequests++; pending.push({ key: 'album', route }); return;
    }
    const match = path.match(/\/portraits\/(p[0-9]+)\/bytes$/);
    if (method === 'GET' && match) { imageRequests.add(match[1]); return route.fulfill({ contentType: 'image/png', body: image }); }
    unexpected.push(`${method} ${path}`);
    return route.fulfill({ status: 500, json: { error: 'UNEXPECTED_FIXTURE_REQUEST' } });
  });
  const release = async (key, json, status = 200) => {
    const entry = pending.find(item => item.key === key);
    assert.ok(entry, `pending fixture request: ${key}`);
    pending.splice(pending.indexOf(entry), 1);
    await entry.route.fulfill({ status, json });
  };
  const idle = async () => {
    await page.waitForFunction(() => document.querySelector('.workbench')?.getAttribute('aria-busy') === 'false');
    await page.waitForFunction(() => [...document.querySelectorAll('.workbench-loading')].every(el => el.getClientRects().length === 0));
  };
  const jump = async (id, number) => {
    const input = page.locator(`#${id} .el-pagination__jump input`);
    await input.fill(String(number));
    await input.press('Enter');
    await input.press('Tab');
    await page.waitForFunction(({ id, number }) => document.querySelector(`#${id} .el-pager .is-active`)?.textContent.trim() === String(number), { id, number });
  };
  const checkSpin = async label => {
    const mask = page.locator('.workbench-loading:not(.el-loading-fade-leave-active):visible');
    await mask.waitFor();
    await page.waitForFunction(el => getComputedStyle(el).opacity === '1', await mask.elementHandle());
    assert.equal(await mask.locator('circle').count(), 4, `${label}: four dots`);
    assert.equal(await mask.textContent(), '', `${label}: no loading text`);
    const svg = mask.locator('svg');
    assert.equal(await svg.evaluate(el => getComputedStyle(el).animationName), 'loading-rotate', `${label}: rotating`);
    assert.equal(await mask.locator('circle').first().evaluate(el => getComputedStyle(el).fill), 'rgb(64, 158, 255)', `${label}: default blue`);
    const box = await svg.boundingBox(), viewport = page.viewportSize();
    assert.ok(Math.abs(box.x + box.width / 2 - viewport.width / 2) < 1 && Math.abs(box.y + box.height / 2 - viewport.height / 2) < 1, `${label}: centered`);
    assert.ok(await page.evaluate(() => Boolean(document.elementFromPoint(innerWidth / 2, innerHeight / 2)?.closest('.workbench-loading'))), `${label}: spinner must be above dialogs`);
    assert.equal(await page.locator('.el-button.is-loading').count(), 0);
  };
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator('#identity').filter({ hasText: 'fixture' }).waitFor();
  await idle();
  await page.getByRole('button', { name: '重新整理', exact: true }).first().click();
  await idle();
  await page.locator('#menu [data-view="generals-editor"]').click();
  await page.locator('#generals-load').click();
  await checkSpin('load generals');
  await page.locator('#generals-load').dispatchEvent('click');
  assert.equal(pending.filter(item => item.key === 'copy-GET').length, 1, 'no duplicate load');
  await release('copy-GET', copyReply());
  await idle();
  assert.equal(await page.locator('#generals-table .el-table__row').count(), 25);
  assert.match(await page.locator('#generals-pagination .el-pagination__total').textContent(), /160/);
  await jump('generals-pagination', 6);
  assert.equal(await page.locator('#generals-table [data-field="seq"]').first().textContent(), '126');
  await page.locator('#generals-pagination .btn-next').click();
  assert.equal(await page.locator('#generals-table .el-table__row').count(), 10, 'last page contains only remaining rows');
  assert.equal(await page.locator('#generals-table [data-field="seq"]').last().textContent(), '160');
  assert.equal(await page.locator('#generals-pagination .btn-next').isDisabled(), true);
  await page.locator('#generals-pagination .btn-prev').click();
  assert.equal(await page.locator('#generals-table [data-field="seq"]').first().textContent(), '126');
  await page.locator('#generals-pagination .el-select').click();
  await page.getByRole('option', { name: /50/ }).click();
  assert.equal(await page.locator('#generals-table .el-table__row').count(), 50, 'page size resets to first page');
  assert.equal(await page.locator('#generals-table [data-field="seq"]').first().textContent(), '1');
  await page.locator('#generals-pagination .el-select').click();
  await page.getByRole('option', { name: /100/ }).click();
  assert.equal(await page.locator('#generals-table .el-table__row').count(), 100);
  await page.locator('#generals-pagination .el-select').click();
  await page.getByRole('option', { name: /25/ }).click();
  await jump('generals-pagination', 7);
  await page.locator('#generals-search').fill('no-matching-general');
  assert.equal(await page.locator('#generals-table .el-table__row').count(), 0);
  assert.match(await page.locator('#generals-pagination .el-pagination__total').textContent(), /0/);
  await page.locator('#generals-search').fill('');
  assert.equal(await page.locator('#generals-table .el-table__row').count(), 25);
  assert.equal(await page.locator('#generals-table [data-field="seq"]').first().textContent(), '1');
  assert.equal(albumRequests, 0, 'album metadata is loaded only when opened');
  const first = field => page.locator(`#generals-table [data-field="${field}"][data-general-id="${idFor(0)}"]`);
  assert.equal(await first('portrait').locator('button').count(), 0, 'read-only portrait cannot open the picker');
  await first('portrait').locator('img').click();
  assert.equal(await page.locator('#generals-portrait-dialog').count(), 0);
  assert.equal(albumRequests, 0);
  await page.locator('#generals-search').fill('武將159');
  assert.equal(await page.locator('#generals-table .el-table__row').count(), 1, 'search still filters the fixed table');
  await page.locator('#generals-search').fill('');
  const nameHeader = page.locator('#generals-table [data-sort="name"]');
  await nameHeader.click();
  await nameHeader.click();
  assert.equal(await page.locator('#generals-table .el-table__row').first().locator('[data-field="name"]').textContent(), '武將159', 'descending sorting');
  await nameHeader.click();
  await first('actions').locator('[data-action="edit"]').click();
  await first('name').locator('input').fill('未保存的跨頁編輯');
  await jump('generals-pagination', 2);
  assert.equal(posts.length, 0, 'page changes do not implicitly save');
  await jump('generals-pagination', 1);
  assert.equal(await first('name').locator('input').inputValue(), '未保存的跨頁編輯', 'returning to the editing row retains its draft');
  await first('name').locator('input').fill('武將000');
  assert.equal(await first('actions').locator('.el-button--primary').count(), 0, 'save/cancel use the same plain default buttons as cities');
  assert.equal(await page.locator('#generals-table .el-table-fixed-column--right').count(), 0, 'no floating operation column');
  await first('portrait').locator('[data-action="portrait"]').click();
  await page.locator('#generals-portrait-dialog').waitFor();
  await checkSpin('load portrait album');
  assert.equal(albumRequests, 1);
  await release('album', { gameId, portraits });
  await idle();
  await page.locator('#generals-album-grid img').first().waitFor();
  assert.equal(await page.locator('#generals-album-grid img[loading="lazy"]').count(), 25);
  assert.ok(imageRequests.size <= 25, 'only current-page thumbnails may be requested');
  assert.equal(imageRequests.has('p1025'), false);
  assert.equal(imageRequests.has('p1620'), false, 'unvisited pages stay unloaded');
  await page.locator('#generals-album-grid').evaluate(el => { el.scrollTop = el.scrollHeight; });
  assert.equal(await page.locator('#generals-album-grid img').count(), 25, 'scrolling never appends another page');
  assert.equal(imageRequests.has('p1025'), false);
  await jump('generals-album-pagination', 25);
  assert.equal(await page.locator('#generals-album-grid img').count(), 21, '621 portraits: last page contains 21');
  await page.locator('[data-portrait-id="p1620"] button').click();
  await page.waitForFunction(() => document.querySelector('[data-portrait-id="p1620"] img')?.naturalWidth > 0);
  assert.ok(imageRequests.has('p1620'), 'visiting the final page loads the final portrait');
  await page.locator('#generals-album-pagination .btn-prev').click();
  assert.equal(await page.locator('#generals-album-grid img').count(), 25);
  await page.locator('#generals-album-pagination .btn-next').click();
  assert.equal(await page.locator('[data-portrait-id="p1620"] .el-button--primary').count(), 1, 'selection persists across pages');
  await page.locator('#generals-album-search').fill('p1620');
  assert.equal(await page.locator('#generals-album-grid img').count(), 1, 'search spans the entire album and returns to page one');
  await page.locator('#generals-album-search').fill('missing-portrait');
  assert.equal(await page.locator('#generals-album-grid img').count(), 0);
  await page.locator('#generals-album-search').fill('');
  assert.equal(await page.locator('#generals-album-grid img').count(), 25);
  assert.equal(await page.locator('#generals-album-grid .generals-album-item').first().getAttribute('data-portrait-id'), 'p1000');
  const dialog = page.locator('#generals-portrait-dialog');
  assert.equal(await dialog.evaluate(el => getComputedStyle(el).resize), 'both');
  const originalDialog = await dialog.boundingBox();
  await page.mouse.move(originalDialog.x + originalDialog.width - 3, originalDialog.y + originalDialog.height - 3);
  await page.mouse.down();
  await page.mouse.move(originalDialog.x + originalDialog.width - 163, originalDialog.y + originalDialog.height - 83, { steps: 10 });
  await page.mouse.up();
  const resizedDialog = await dialog.boundingBox();
  assert.ok(resizedDialog.width < originalDialog.width - 100, 'native dialog resize changes width');
  for (const viewport of [{ width: 1024, height: 600 }, { width: 1600, height: 1000 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    assert.ok(await dialog.evaluate(el => { const box = el.getBoundingClientRect(); return box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight; }), 'dialog fits viewport');
    for (const selector of ['#generals-album-pagination', '[data-action="album-confirm"]', '[data-action="album-cancel"]']) {
      assert.ok(await page.locator(selector).evaluate(el => { const box = el.getBoundingClientRect(); return box.top >= 0 && box.bottom <= innerHeight; }), 'album pagination and actions stay visible');
    }
  }
  if (process.env.GENERALS_ALBUM_SCREENSHOT) await page.screenshot({ path: process.env.GENERALS_ALBUM_SCREENSHOT });
  process.stdout.write('PASS album: 25/page, jump/previous/next/search, selection retained, unvisited-page images not fetched, viewport adaptation and native resizing.\n');
  await page.locator('[data-action="album-confirm"]').click();
  await page.locator('#generals-portrait-dialog').waitFor({ state: 'hidden' });
  assert.equal(posts.length, 0, 'album confirmation changes only the unsaved form');
  await first('name').locator('input').fill('修改武將');
  await first('actions').locator('[data-action="cancel"]').click();
  assert.equal(posts.length, 0, 'cancel sends no save');
  assert.equal(await first('name').textContent(), '武將000');
  await first('actions').locator('[data-action="edit"]').click();
  await first('portrait').locator('[data-action="portrait"]').click();
  assert.equal(albumRequests, 1, 'reopening the picker reuses its metadata');
  await page.locator('[data-portrait-id="p1002"] button').click();
  await page.locator('[data-action="album-cancel"]').click();
  assert.equal(await first('portrait').locator('img').getAttribute('alt'), 'p1000', 'album cancellation leaves form portrait unchanged');
  assert.equal(posts.length, 0);
  await first('portrait').locator('[data-action="portrait"]').click();
  assert.equal(albumRequests, 1);
  await page.locator('[data-portrait-id="p1001"] button').click();
  await page.locator('[data-action="album-confirm"]').click();
  await first('name').locator('input').fill('修改武將');
  await first('actions').locator('[data-action="save"]').click();
  await checkSpin('save generals');
  assert.deepEqual(posts.at(-1), { module: 'generals', patch: { upsert: { [idFor(0)]: { name: '修改武將', portraitRef: portraits[1] } } } });
  data.generals[idFor(0)].name = '修改武將'; data.generals[idFor(0)].portraitRef = portraits[1];
  await release('copy-POST', { gameId, copyDigest: 'b'.repeat(64), updatedAt: null });
  await checkSpin('reread saved generals');
  await release('copy-GET', copyReply());
  await idle();
  assert.equal(await first('name').textContent(), '修改武將');
  assert.equal(await first('portrait').locator('img').getAttribute('alt'), 'p1001');
  assert.equal(await first('name').locator('input').count(), 0);
  const withoutAbility = field => page.locator(`#generals-table [data-field="${field}"][data-general-id="${idFor(1)}"]`);
  await withoutAbility('actions').locator('[data-action="edit"]').click();
  await withoutAbility('hao').locator('input').fill('無能力資料也可編輯');
  await withoutAbility('actions').locator('[data-action="save"]').click();
  await checkSpin('save without rewriting missing abilities');
  assert.deepEqual(posts.at(-1), { module: 'generals', patch: { upsert: { [idFor(1)]: { hao: '無能力資料也可編輯' } } } });
  data.generals[idFor(1)].hao = '無能力資料也可編輯';
  await release('copy-POST', { gameId, copyDigest: 'b'.repeat(64), updatedAt: null });
  await checkSpin('reread without abilities');
  await release('copy-GET', copyReply());
  await idle();
  assert.equal(await withoutAbility('hao').textContent(), '無能力資料也可編輯');
  assert.equal(data.generals[idFor(1)].ability, null);
  await page.locator('#generals-import').click();
  await checkSpin('import native generals');
  const imported = posts.at(-1);
  assert.equal(imported.module, 'generals');
  assert.deepEqual(imported.patch.import.map(row => row.name), ['待導入甲', '待導入乙']);
  for (const [i, row] of imported.patch.import.entries()) data.generals[idFor(160 + i)] = { name: row.name, zi: '', hao: '', portraitRef: null, suicideOnCapture: row.suicideOnCapture, ability: row.ability };
  await release('copy-POST', { gameId, copyDigest: 'b'.repeat(64), updatedAt: null });
  await checkSpin('reread imported generals');
  await release('copy-GET', copyReply());
  await idle();
  assert.equal(await page.locator('#generals-table .el-table__row').count(), 25);
  assert.match(await page.locator('#generals-pagination .el-pagination__total').textContent(), /162/);
  await jump('generals-pagination', 7);
  assert.equal(await page.locator('#generals-table .el-table__row').count(), 12);
  await jump('generals-pagination', 1);
  assert.equal(await page.locator('#generals-import').isEnabled(), false);
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 600 }, { width: 1600, height: 1000 }]) {
    await page.setViewportSize(viewport);
    const table = page.locator('#generals-table'), header = table.locator('.el-table__header-wrapper'), scroll = table.locator('.el-scrollbar__wrap');
    await scroll.evaluate(el => { el.scrollTop = 0; el.scrollLeft = 0; });
    const before = await header.boundingBox();
    const maxScroll = await scroll.evaluate(el => el.scrollHeight - el.clientHeight);
    assert.ok(maxScroll > 0, 'current-page body has its own scroll area');
    await scroll.evaluate(el => { el.scrollTop = 1000; });
    assert.equal(await scroll.evaluate(el => el.scrollTop), Math.min(1000, maxScroll), 'body really scrolls');
    assert.equal(await table.locator('.el-table__row').count(), 25, 'body scroll does not append rows');
    const after = await header.boundingBox();
    assert.equal(after.y, before.y, 'header is fixed');
    assert.ok(await table.evaluate(el => el.getBoundingClientRect().bottom <= innerHeight), 'table fits viewport');
    assert.ok(await page.locator('#generals-pagination').evaluate(el => el.getBoundingClientRect().bottom <= innerHeight), 'pagination stays in the viewport');
    assert.ok(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight), 'whole page does not scroll');
    await jump('generals-pagination', 2);
    assert.equal(await scroll.evaluate(el => el.scrollTop), 0, 'changing page returns body to top');
    await jump('generals-pagination', 1);
    await scroll.evaluate(el => { el.scrollLeft = el.scrollWidth; });
    const edit = table.locator('[data-action="edit"]').nth(20);
    assert.ok(await edit.evaluate(el => { const box = el.getBoundingClientRect(); return box.left >= 0 && box.right <= innerWidth; }), 'normal operation column is reachable by horizontal scrolling');
  }
  await page.locator('#menu [data-view="stronghold-editor"]').click();
  assert.equal(await page.locator('#generals-editor').isVisible(), false);
  await page.locator('#menu [data-view="generals-editor"]').click();
  assert.equal(await page.locator('#stronghold-editor').isVisible(), false);
  assert.equal(await page.locator('#generals-table .el-table__row').count(), 25);
  await first('actions').locator('[data-action="edit"]').click();
  if (process.env.GENERALS_SCREENSHOT) await page.screenshot({ path: process.env.GENERALS_SCREENSHOT });
  await first('actions').locator('[data-action="cancel"]').click();
  // Missing parent library must not disable the action that creates it.
  data.generals = null;
  await page.locator('#generals-load').click();
  await checkSpin('reload missing library');
  await release('copy-GET', copyReply());
  await idle();
  assert.equal(await page.locator('#generals-unsupported').isVisible(), true);
  assert.equal(await page.locator('#generals-import').isEnabled(), true);
  await page.locator('#generals-import').click();
  await checkSpin('import into missing library');
  assert.equal(posts.at(-1).patch.import.length, 2);
  data.generals = Object.fromEntries(posts.at(-1).patch.import.map((row, i) => [idFor(160 + i), { name: row.name, zi: '', hao: '', portraitRef: null, suicideOnCapture: row.suicideOnCapture, ability: row.ability }]));
  await release('copy-POST', { gameId, copyDigest: 'b'.repeat(64), updatedAt: null });
  await checkSpin('reread new library');
  await release('copy-GET', copyReply());
  await idle();
  assert.equal(await page.locator('#generals-table .el-table__row').count(), 2);
  assert.deepEqual(errors, []);
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(unexpected, []);
  assert.deepEqual(pending, []);
  process.stdout.write('PASS generals: shared loading, 25-row jump pagination/page sizes/filter/sort/empty/last page, paged portrait picker, plain shared row actions, edit/cancel/save+reread, fixed header/pagination at three viewport sizes, missing-library import, nullable abilities, module visibility; no browser errors.\n');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
