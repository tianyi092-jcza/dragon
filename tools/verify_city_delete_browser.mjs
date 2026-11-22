import assert from 'node:assert/strict';
// 城池據點刪除：地圖座標列顯示落子／空城，绑定行禁用刪除；
// 乾淨城一次保存刪除，章節／道路引用逐项拒绝并带原因。
// 用法：node --test tools/verify_city_delete_browser.mjs（cwd=web-port）
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { CHAPTER_BASE } from '../web/src/content/authoring/chapterbase.generated.js';
const { chromium } = createRequire(import.meta.url)('C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright');

const root = new URL('../server/public/', import.meta.url);
const modules = { 'client.js': 'client.txt', 'shell-ui.js': 'shell-ui.txt', 'draft.js': 'draft.txt', 'stage.js': 'stage.txt', 'library.js': 'library.txt', 'catalog.js': 'catalog.txt', 'management.js': 'management.txt', 'publish.js': 'publish.txt', 'review.js': 'review.txt', 'stronghold.js': 'stronghold.txt', 'general.js': 'general.txt', 'mapview.js': 'mapview.txt', 'stage-assets.js': 'stageassets.txt' };

const gameId = '11111111-1111-4111-8111-111111111111';
const user = { id: 'city-delete-fixture', version: 1, account: 'fixture', role: 'admin', mustChangePassword: false };
function city(idx, name) {
  return { cityId: 'city-' + idx, runtimeSlot: idx, x: 10 + idx, y: 20, name, max_prod: 100, prod: 10, growth: 1, defence: 1, troops: 5, troops_cap: 100, type: 2, view: 1, battleMapId: 'ki-1995:siege:7' };
}
const data = { gameId, metadata: { name: '刪城測試', introduction: 'memory only' }, chapterOrder: ['chapter-1'],
  cities: { 'city-0': city(0, '綁定城'), 'city-1': city(1, '道路城'), 'city-2': city(2, '章節城'), 'city-3': city(3, '乾淨城') },
  generals: {},
  map: { placements: [{ id: 'place-0', cityId: 'city-0', x: 10, y: 20 }], roads: [{ id: 'road-1', fromCityId: 'city-1', toCityId: 'city-0' }] },
  chapters: { 'chapter-1': { chapterId: 'chapter-1', number: '1', name: '第一章', start: { era: 'ad', year: 1, month: 1, day: 1 }, state: { name: 'raw', start: { era: 'ad', year: 1, month: 1, day: 1 }, trust: 73,
    nativeDiplomacyRaw: 'b7'.repeat(576), diplomacy: [[183]], nativeMonthlyPolicyRaw: '12000000000000001700000000000000',
    factions: [{ idx: 0, monarch_idx: 0, advisor_idx: null, diplomat_idx: null, capital: null, money: 0, reserve_cav: 0, reserve_arc: 0, reserve_inf: 0 }],
    nativeFactionSlotRaw: CHAPTER_BASE.factionSlots,
    generals: Array.from({ length: 4 }, (_, idx) => ({ idx, name: '將' + idx, hao: '', attr: 0x90, active: true, appear_months: 9, status: 0, captive_flag: 255, join_faction: null, faction: idx === 0 ? 0 : null })),
    cities: Array.from({ length: 4 }, (_, idx) => ({ idx, name: '城' + idx, faction: null, governor: null, troops: 0, prod: 0, max_prod: 100, troops_cap: 100, growth: 0, defence: 0 })) } } },
};
data.chapters['chapter-1'].cities = {
  'city-0': { factionId: null, overrides: {} }, 'city-1': { factionId: null, overrides: {} },
  'city-2': { factionId: 0, overrides: {} }, 'city-3': { factionId: null, overrides: {} },
};
const replies = new Map([
  ['/api/session', { user, csrf: 'fixture' }],
  ['/api/admin/accounts', { accounts: [] }],
  ['/api/admin/base-map', { snapshot: null }],
  ['/api/admin/copy/submissions', { queue: [] }],
  ['/api/resources', { mode: 'BUILTIN_READONLY', resources: [] }],
  ['/api/admin/source', { definition: { registryId: 'isolated-copy-fixture' } }],
  ['/api/games', { games: [{ gameId, ownerId: user.id, draftRevision: '1', metadata: data.metadata }] }],
  [`/api/games/${gameId}/copy/submission`, { gameId, state: 'draft', validation: null, slot: null, version: null, nextVersion: '1.0', publishEnabled: false }],
]);
const posts = [];
let digest = 'a'.repeat(64);
const server = createServer(async (req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html';
  if (/^city-picture\/\d+\.png$/.test(name)) { res.setHeader('Content-Type', 'image/png'); res.end(await readFile(new URL('../../web/grf/kyo_' + name.split('/')[1].padStart(6,'0'), root))); return; }
  if (/^siege-thumb\/\d+\.png$/.test(name)) { res.setHeader('Content-Type', 'image/png'); res.end(await readFile(new URL('../../web/grf/siege/siege-' + name.split('/')[1], root))); return; }
  if (['favicon.ico', 'brand.png', 'auth-logo.png'].includes(name)) { res.setHeader('Content-Type', name.endsWith('.ico') ? 'image/x-icon' : 'image/png'); res.end(await readFile(new URL(name, root))); return; }
  const file = modules[name] ?? (['index.html', 'shell-ui.css', 'style.css'].includes(name) ? name : null);
  if (!file) return res.writeHead(404).end();
  res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html');
  res.end(await readFile(new URL(file, root)));
});

let browser;
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/status of 422/.test(m.text())) errors.push('console: ' + m.text()); });
  page.on('requestfailed', r => errors.push('requestfailed: ' + r.url()));
  page.on('dialog', dialog => dialog.accept());
  await page.route('**/api/**', route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    if (path === `/api/games/${gameId}/copy` && req.method() === 'GET') return route.fulfill({ json: { gameId, copyDigest: digest, data } });
    if (path === `/api/games/${gameId}/copy` && req.method() === 'POST') {
      const body = req.postDataJSON(); posts.push(body);
      const fail = (code, blockers) => route.fulfill({ status: 422, json: { error: code, detail: { blockers } } });
      // 真协议：body.patch 即 cities 模块补丁（{remove:[...]} 平铺）。
      for (const cityId of body.patch?.remove ?? []) {
        const place = data.map.placements.find(p => p?.cityId === cityId);
        if (place) return fail('COPY_CITY_PLACED', [{ code: 'COPY_CITY_PLACED', detail: `已放入地圖（${place.x}, ${place.y}），须先解除绑定` }]);
        const road = data.map.roads.find(r => r?.fromCityId === cityId || r?.toCityId === cityId);
        if (road) return fail('COPY_CITY_ROADED', [{ code: 'COPY_CITY_ROADED', detail: `道路引用：${road.id}` }]);
        const hit = Object.values(data.chapters).find(ch => ch.cities?.[cityId]?.factionId != null);
        if (hit) return fail('COPY_CITY_CHAPTER', [{ code: 'COPY_CITY_CHAPTER', detail: `${hit.name ?? hit.chapterId}：所屬勢力` }]);
      }
      for (const cityId of body.patch?.remove ?? []) {
        delete data.cities[cityId];
        for (const ch of Object.values(data.chapters)) {
          const entry = ch.cities?.[cityId];
          if (entry && entry.factionId == null && !Object.keys(entry.overrides ?? {}).length) delete ch.cities[cityId];
        }
      }
      digest = 'b'.repeat(64);
      return route.fulfill({ json: { gameId, copyDigest: digest, data } });
    }
    if (req.method() === 'GET' && replies.has(path)) return route.fulfill({ json: replies.get(path) });
    return route.fulfill({ status: 500, json: { error: 'UNEXPECTED:' + req.method() + path } });
  });
  const idle = () => page.waitForFunction(() => document.querySelector('.workbench')?.getAttribute('aria-busy') === 'false');
  await page.goto('http://127.0.0.1:' + server.address().port);
  await idle();
  // draft-editor 已退役：改走頂欄當前遊戲選擇器（與可見性套件同式）。
  await page.getByRole('button', { name: '重新整理', exact: true }).first().click(); await idle();
  await page.locator('.current-game .el-select').click();
  await page.getByRole('option', { name: data.metadata.name, exact: true }).click(); await idle();
  await page.locator('#menu [data-view="stronghold-editor"]').click(); await idle();
  await page.locator('#stronghold-load').click(); await idle();
  const panel = page.locator('#stronghold-editor');
  await panel.locator('#stronghold-table .el-table__row').first().waitFor();
  assert.equal(await panel.locator('#stronghold-table .el-table__row').count(), 4);
  const cell = (id, field) => panel.locator(`[data-field="${field}"][data-city-id="${id}"]`);
  assert.equal(await cell('city-0','seq').evaluate(el => Math.round(el.closest('td').getBoundingClientRect().width)), 60);
  await panel.locator('#stronghold-create-toggle').click();
  const createDialog = page.getByRole('dialog', {name:'新增據點'});
  await createDialog.waitFor();
  assert.deepEqual(await createDialog.locator('.el-form-item__label').allTextContents(), ['據點名稱','最大生產','當前生產','上升值','防災值','城兵*10','類型','城兵上限*10','攻城戰場','據點圖片']);
  const preview = createDialog.locator('.stronghold-create-battle .siege-pick-button');
  const grid = createDialog.locator('.editor-form-grid');
  assert.deepEqual(await grid.evaluate(el => [getComputedStyle(el).rowGap, getComputedStyle(el).columnGap, getComputedStyle(el).gridTemplateColumns.split(' ').length]), ['24px', '32px', 2]);
  assert.equal(Math.round((await createDialog.locator('.stronghold-create-dialog').boundingBox()).width), 900);
  const previewSize = async () => { const { width, height } = await preview.boundingBox(); return [Math.round(width), Math.round(height)]; };
  assert.deepEqual(await previewSize(), [240,128]);
  await preview.getByRole('button').click();
  await page.locator('.siege-thumb').first().click();
  await page.getByRole('button', {name:'選定這張'}).click();
  await preview.locator('img').waitFor();
  assert.deepEqual(await previewSize(), [240,128]);
  await page.setViewportSize({width:390,height:640});
  assert.equal(await grid.evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length), 1);
  assert.ok(await createDialog.locator('.stronghold-dialog-scroll').evaluate(el => el.scrollHeight > el.clientHeight));
  await createDialog.getByRole('button', {name:'選擇據點圖片'}).click();
  const pictures = page.getByRole('dialog', {name:'據點圖片'});
  assert.equal(await pictures.locator('.city-picture-grid button').count(), 15);
  await pictures.getByRole('img', {name:'據點圖片 0',exact:true}).click();
  await pictures.getByRole('button', {name:'選定這張'}).click();
  assert.equal(await createDialog.locator('.city-picture img').getAttribute('src'), '/city-picture/0.png');
  await createDialog.getByRole('button', {name:'取消', exact:true}).click();
  await page.setViewportSize({width:1440,height:900});
  assert.match(await cell('city-0', 'battleMapId').locator('img').getAttribute('src'), /\/7\.png$/);
  await cell('city-0', 'actions').locator('[data-action="edit"]').click();
  const chooser = cell('city-0', 'battleMapId').getByRole('button', {name:'更換攻城戰場'});
  const image = await cell('city-0', 'battleMapId').locator('img').boundingBox();
  const button = await chooser.boundingBox();
  assert.ok(Math.abs(image.x + image.width / 2 - button.x - button.width / 2) < 1);
  assert.ok(Math.abs(image.y + image.height / 2 - button.y - button.height / 2) < 1);
  await chooser.click();
  const dialog = page.getByRole('dialog').filter({has:page.locator('.siege-thumb-grid')});
  await dialog.waitFor();
  assert.equal(await dialog.locator('.siege-thumb').count(), 86);
  await dialog.evaluate(el => el.getAnimations().forEach(a => a.finish()));
  const scroll = await dialog.locator('.stronghold-dialog-scroll').evaluate(body => {
    body.scrollTop = 120;
    const overlay = body.closest('.el-overlay-dialog');
    return [body.scrollTop, overlay.scrollHeight - overlay.clientHeight, document.documentElement.scrollHeight - innerHeight];
  });
  assert.deepEqual(scroll, [120, 0, 0]);
  await dialog.getByRole('button', {name:'關閉', exact:true}).click();
  await cell('city-0', 'type').locator('.el-select').click();
  await page.getByRole('option', {name:'關卡', exact:true}).click();
  assert.equal(await cell('city-0', 'battleMapId').locator('img').count(), 0);
  await cell('city-0', 'battleMapId').getByRole('button', {name:'選圖'}).click();
  await dialog.waitFor();
  assert.equal(await dialog.locator('.siege-thumb').count(), 9);
  await dialog.locator('.siege-thumb').first().click();
  await page.getByRole('button', {name:'選定這張'}).click();
  assert.match(await cell('city-0', 'battleMapId').locator('img').getAttribute('src'), /\/31\.png$/);
  await cell('city-0', 'actions').locator('[data-action="cancel"]').click();
  assert.match(await cell('city-0', 'battleMapId').locator('img').getAttribute('src'), /\/7\.png$/);
  // 地图坐标列：已绑定显示坐标，未绑定为空。
  assert.equal(await cell('city-0', 'map').textContent(), '10, 20');
  assert.equal(await cell('city-3', 'map').textContent(), '');
  // 操作列两钮同行（不换行）。
  const cleanActions = () => panel.locator('.el-table__row').filter({ has: page.locator('[data-city-id="city-3"]') }).locator('[data-action]');
  const boxes = await cleanActions().evaluateAll(els => els.map(el => { const r = el.getBoundingClientRect(); return { y: r.y, height: r.height }; }));
  assert.ok(boxes.length >= 2 && boxes.every(box => Math.abs(box.y - boxes[0].y) < 2), 'edit and delete share one row: ' + JSON.stringify(boxes));
  // 已绑定：删除禁用。
  const boundDel = panel.locator('.el-table__row').filter({ has: page.locator('[data-city-id="city-0"]') }).locator('[data-action="delete"]');
  assert.equal(await boundDel.isDisabled(), true);
  assert.match(await boundDel.getAttribute('title') ?? '', /地圖/);
  // 干净城：删除成功。
  const cleanRow = () => panel.locator('.el-table__row').filter({ has: page.locator('[data-city-id="city-3"]') });
  await cleanRow().locator('[data-action="delete"]').click();
  await idle();
  assert.ok((await panel.locator('#stronghold-status').textContent()).includes('已刪除'));
  assert.equal(await panel.locator('#stronghold-table .el-table__row').count(), 3);
  assert.equal(await cell('city-3', 'name').count(), 0, 'deleted city is gone after re-read');
  // 章节引用：按钮可用（地图未用），但服务端拒绝并说明章节。
  const ownedRow = () => panel.locator('.el-table__row').filter({ has: page.locator('[data-city-id="city-2"]') });
  assert.equal(await ownedRow().locator('[data-action="delete"]').isDisabled(), false);
  await ownedRow().locator('[data-action="delete"]').click();
  await idle();
  assert.match(await panel.locator('#stronghold-status').textContent(), /章節/);
  assert.equal(await panel.locator('#stronghold-table .el-table__row').count(), 3);
  // 道路引用：同样服务端拒绝。
  const roadRow = () => panel.locator('.el-table__row').filter({ has: page.locator('[data-city-id="city-1"]') });
  await roadRow().locator('[data-action="delete"]').click();
  await idle();
  assert.match(await panel.locator('#stronghold-status').textContent(), /道路/);
  assert.equal(await panel.locator('#stronghold-table .el-table__row').count(), 3);
  assert.deepEqual(errors, [], 'no page/console/network errors');
  console.log('PASS city delete column and guards');
} finally {
  await browser?.close();
  server.close();
}
