// 地圖保存檢驗：解綁被道路引用的據點後保存，失敗只顯示一句明確原因。
// 真實轉換模板＋內存 SystemBaseMapStore＋真實殼；不碰使用者資料。
// 用法：node --test tools/verify_map_unbind_message_browser.mjs（cwd=web-port）
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { readInstalledEditorSource } from './editor_builtin_source.mjs';
import { convertInstalledSystemBaseMap } from './system_base_map_conversion.mjs';
import { BUILTIN_RESOURCES } from '../web/src/content/builtinresources.generated.js';
import { enableSeaGroundBase } from '../web/src/editor/componenttools.js';
import { SystemBaseMapStore } from '../server/systembasemapstore.js';
import { openStorage } from '../vps/sqlite-port.mjs';
import { fitViewport, worldToScreen } from '../web/src/editor/viewport.js';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const { template: legacy } = convertInstalledSystemBaseMap(readInstalledEditorSource(), BUILTIN_RESOURCES.sourceDigest);
const template = { ...legacy, content: enableSeaGroundBase(legacy.content) };
const root = new URL('../server/public/', import.meta.url);
const modules = { 'client.js': 'client.txt', 'shell-ui.js': 'shell-ui.txt', 'draft.js': 'draft.txt', 'stage.js': 'stage.txt', 'library.js': 'library.txt', 'catalog.js': 'catalog.txt', 'management.js': 'management.txt', 'publish.js': 'publish.txt', 'review.js': 'review.txt', 'stronghold.js': 'stronghold.txt', 'general.js': 'general.txt', 'mapview.js': 'mapview.txt', 'stage-assets.js': 'stageassets.txt' };

// 找一個仍被道路引用的已綁定落子：解綁它再保存必定触发服務端拒絕。
const target = template.content.map.placements.find(place =>
  typeof place?.cityId === 'string' && place.cityId &&
  template.content.map.roads.some(road => road?.fromCityId === place.cityId || road?.toCityId === place.cityId));
assert.ok(target, 'fixture template must contain a road-referenced bound city');
const CLEAR = '解綁失敗：該據點仍被道路引用，請先解除道路關聯。地圖上放置的據點必須綁定城池，否則無法保存。';

const storage = openStorage(':memory:');
const store = new SystemBaseMapStore({ storage, principal: () => ({ id: 'fixture', role: 'admin', must_change: false }), loadInitialTemplate: async () => template });
let browser, snapshot = null;
const errors = [], failures = [];
const server = createServer(async (req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html';
  if (['favicon.ico', 'brand.png', 'auth-logo.png'].includes(name)) { res.setHeader('Content-Type', name.endsWith('.ico') ? 'image/x-icon' : 'image/png'); res.end(await readFile(new URL(name, root))); return; }
  const file = modules[name] ?? (['index.html', 'shell-ui.css', 'style.css'].includes(name) ? name : null);
  if (!file) return res.writeHead(404).end();
  res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html');
  res.end(await readFile(new URL(file, root)));
});
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage(); page.setDefaultTimeout(30000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && !/422/.test(message.text())) errors.push(message.text()); });
  page.on('requestfailed', request => failures.push(request.url()));
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    if (path === '/api/session') return route.fulfill({ json: { user: { id: 'fixture', account: 'fixture', role: 'admin', mustChangePassword: false }, version: 1, csrf: 'fixture' } });
    if (path === '/api/resources') return route.fulfill({ json: { mode: 'BUILTIN_READONLY', resources: [] } });
    if (path === '/api/games') return route.fulfill({ json: { games: [] } });
    if (path === '/api/admin/accounts') return route.fulfill({ json: { accounts: [] } });
    if (path === '/api/admin/copy/submissions') return route.fulfill({ json: { queue: [] } });
    if (path === '/api/users') return route.fulfill({ json: { users: [] } });
    if (path === '/api/admin/base-map') return route.fulfill({ json: { snapshot } });
    if (path === '/api/admin/base-map/initialize') {
      snapshot = await store.initialize('fixture');
      return route.fulfill({ json: { snapshot } });
    }
    if (path === '/api/admin/base-map/save') {
      try {
        snapshot = store.edit('fixture', request.postDataJSON().edits);
        return route.fulfill({ json: { snapshot } });
      } catch (error) {
        // Mirror the real service envelope so client error mapping is exercised.
        const status = error?.status ?? 500, code = error?.code ?? 'INTERNAL_ERROR';
        return route.fulfill({ status, json: error?.detail === undefined ? { error: code } : { error: code, detail: error.detail } });
      }
    }
    if (path === '/api/admin/base-map/atlas') {
      const descriptor = template.content.editorAssets.seasonAtlases[url.searchParams.get('season')];
      const atlasBytes = await readFile(new URL('../web/' + descriptor.url, import.meta.url));
      return route.fulfill({ contentType: 'application/octet-stream', headers: { 'X-Content-SHA256': descriptor.sha256 }, body: atlasBytes });
    }
    return route.fulfill({ status: 500, json: { error: 'UNEXPECTED_FIXTURE_REQUEST' } });
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/#base-map-editor`);
  const panel = page.locator('#base-map-editor');
  await panel.getByRole('button', { name: '建立', exact: true }).click();
  await page.getByText('基礎地圖已建立。', { exact: true }).waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('#base-map-editor .map-status')].every(el => !(el.textContent || '').includes('圖集载入')), null, { timeout: 60000 });
  const canvas = panel.locator('.base-map-canvas');
  const viewOf = async (x, y) => {
    const box = await canvas.boundingBox();
    const size = { width: box.width, height: box.height };
    const view = fitViewport(size, { width: 384 * 16, height: 256 * 16 });
    const [sx, sy] = worldToScreen(view, (x + 0.5) * 16, (y + 0.5) * 16);
    return { x: box.x + sx, y: box.y + sy, rx: sx, ry: sy };
  };
  const menu = () => panel.getByRole('dialog', { name: '物件操作', exact: true });
  await panel.getByRole('button', { name: '鎖圖', exact: true }).click();
  await panel.getByRole('button', { name: '全圖', exact: true }).click();
  const point = await viewOf(target.x, target.y);
  await canvas.click({ position: { x: point.rx, y: point.ry } });
  await canvas.click({ button: 'right', position: { x: point.rx, y: point.ry } });
  await menu().getByRole('button', { name: '解綁', exact: true }).click();
  await panel.getByRole('button', { name: '保存', exact: true }).click();
  await panel.locator('.base-map-problems').first().waitFor();
  const problems = await panel.locator('.base-map-problems').allTextContents();
  assert.equal(problems.length, 1, 'single clear reason, got: ' + JSON.stringify(problems));
  assert.ok(problems[0].includes('地圖上放置的據點必須綁定城池，否則無法保存'), 'reason states the binding rule: ' + problems[0]);
  assert.ok(problems[0].includes('道路'), 'reason names the road blocker: ' + problems[0]);
  const panelText = await panel.textContent();
  assert.ok(!panelText.includes('COPY_MAP_'), 'no raw error code leaks, panel shows: ' + panelText.slice(0, 200));
  assert.ok(!panelText.includes('告訴管理員'), 'no generic retry boilerplate as the reason');
  assert.ok((await panel.locator('.map-status').textContent()).includes('地圖上放置的據點必須綁定城池'), 'panel status line shows the same reason');
  assert.equal(snapshot.version, 1, 'rejected save never writes');
  console.log('PASS unbind-then-save shows one clear reason, no raw code.');
  assert.deepEqual(errors, []);
  assert.deepEqual(failures, []);
} finally {
  await browser?.close();
  server.close();
}
