// Built editor + fresh browser context + real registered template/atlas.
// API transport is an isolated in-memory fixture, NOT production or auth evidence.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readInstalledEditorSource } from './editor_builtin_source.mjs';
import { convertInstalledSystemBaseMap } from './system_base_map_conversion.mjs';
import { BUILTIN_RESOURCES } from '../web/src/content/builtinresources.generated.js';
import { validateSystemBaseMap } from '../server/systembasemap.js';
import { applyMapWorkspaceEdits } from '../server/mapworkspace.js';
import { fitViewport, worldToScreen } from '../web/src/editor/viewport.js';
const moduleName = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(isAbsolute(moduleName) ? pathToFileURL(moduleName).href : moduleName);
const { template } = convertInstalledSystemBaseMap(readInstalledEditorSource(), BUILTIN_RESOURCES.sourceDigest);
const sha = value => createHash('sha256').update(value).digest('hex');
const root = new URL('../server/public/', import.meta.url);
const modules = { 'client.js': 'client.txt', 'shell-ui.js': 'shell-ui.txt', 'draft.js': 'draft.txt', 'stage.js': 'stage.txt', 'library.js': 'library.txt', 'catalog.js': 'catalog.txt', 'management.js': 'management.txt', 'publish.js': 'publish.txt', 'review.js': 'review.txt', 'stronghold.js': 'stronghold.txt', 'general.js': 'general.txt', 'mapview.js': 'mapview.txt', 'stage-assets.js': 'stageassets.txt' };
const server = createServer(async (req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html';
  if (name === 'favicon.ico') return res.writeHead(204).end();
  const file = modules[name] ?? (['index.html', 'shell-ui.css', 'style.css'].includes(name) ? name : null);
  if (!file) return res.writeHead(404).end();
  res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html');
  res.end(await readFile(new URL(file, root)));
});
let browser, snapshot = null, saves = 0, reads = 0, atlasReads = 0, role = 'admin';
const errors = [], unexpected = [], failures = [];
const gameIds = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
const { editorAssets, ...gameContent } = template.content;
const gameCopies = new Map(gameIds.map(gameId => [gameId, { ...structuredClone(gameContent), gameId, mapEditorAssets: structuredClone(editorAssets) }]));
let gameSaves = 0, acceptDialogs = true, dialogs = 0;
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } }), page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('requestfailed', request => failures.push(request.url()));
  page.on('request', request => { if (new URL(request.url()).pathname === '/mapview.js') errors.push('retired map viewer was bootstrapped'); });
  page.on('dialog', dialog => { dialogs++; return acceptDialogs ? dialog.accept() : dialog.dismiss(); });
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    if (path === '/api/session') return route.fulfill({ json: { user: { id: 'isolated-admin', account: 'fixture', role, mustChangePassword: false }, version: 1, csrf: 'fixture' } });
    if (path === '/api/resources') return route.fulfill({ json: { mode: 'BUILTIN_READONLY', resources: [] } });
    if (path === '/api/games') return route.fulfill({ json: { games: role === 'admin' ? [] : gameIds.map((gameId, index) => ({ gameId, draftRevision: '1', metadata: { name: `測試地圖${index + 1}`, introduction: '' }, createdAt: '2026-01-01T00:00:00.000Z', modifiedAt: '2026-01-01T00:00:00.000Z' })) } });
    const gameMatch = /^\/api\/games\/([a-f0-9-]+)\/copy(\/map-atlas)?$/.exec(path);
    if (gameMatch && gameCopies.has(gameMatch[1])) {
      const gameId = gameMatch[1];
      if (gameMatch[2]) {
        const descriptor = gameCopies.get(gameId).mapEditorAssets.seasonAtlases[url.searchParams.get('season')];
        return route.fulfill({ contentType: 'application/octet-stream', headers: { 'X-Content-SHA256': descriptor.sha256 }, body: await readFile(new URL('../web/' + descriptor.url, import.meta.url)) });
      }
      if (request.method() === 'POST') {
        const body = request.postDataJSON(); assert.equal(body.module, 'map');
        const next = applyMapWorkspaceEdits(gameCopies.get(gameId), body.patch.edits);
        validateSystemBaseMap({ ...template, content: { ...template.content, map: next.map, componentDefinitions: next.componentDefinitions, selectionGroups: next.selectionGroups } }, sha);
        gameCopies.set(gameId, next); gameSaves++;
      }
      const data = gameCopies.get(gameId);
      return route.fulfill({ json: { gameId, copyDigest: sha(JSON.stringify(data)), data } });
    }
    if (path === '/api/users') return route.fulfill({ json: { users: [] } });
    if (path === '/api/admin/base-map') { reads++; return route.fulfill({ json: { snapshot } }); }
    if (path === '/api/admin/base-map/initialize') {
      snapshot ??= { version: 1, digest: validateSystemBaseMap(template, sha).digest, template };
      return route.fulfill({ json: { snapshot } });
    }
    if (path === '/api/admin/base-map/save') {
      const next = structuredClone(snapshot.template), { edits } = request.postDataJSON();
      next.content = applyMapWorkspaceEdits({ ...next.content, gameId: 'system-base-map' }, edits);
      delete next.content.gameId;
      snapshot = { version: snapshot.version + 1, digest: validateSystemBaseMap(next, sha).digest, template: next }; saves++;
      return route.fulfill({ json: { snapshot } });
    }
    if (path === '/api/admin/base-map/atlas') {
      atlasReads++;
      const descriptor = template.content.editorAssets.seasonAtlases[url.searchParams.get('season')];
      const bytes = await readFile(new URL('../web/' + descriptor.url.replace(/^\//, ''), import.meta.url));
      return route.fulfill({ contentType: 'application/octet-stream', headers: { 'X-Content-SHA256': descriptor.sha256 }, body: bytes });
    }
    unexpected.push(`${request.method()} ${path}`); return route.fulfill({ status: 500, json: { error: 'UNEXPECTED_FIXTURE_REQUEST' } });
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/#base-map-editor`);
  const panel = page.locator('#base-map-editor');
  await panel.getByRole('button', { name: '首次建立', exact: true }).click();
  await panel.getByText('基礎地圖已建立。', { exact: true }).waitFor();
  await page.waitForFunction(() => !document.querySelector('#base-map-editor').textContent.includes('圖集載入中'));
  assert.equal(atlasReads, 1);
  const painted = await panel.locator('.base-map-canvas').evaluate(canvas => ({ width: canvas.width, height: canvas.height, nonempty: canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data.some((v, i) => i % 4 === 3 && v > 0) }));
  assert.ok(painted.width > 100 && painted.height > 100 && painted.nonempty, JSON.stringify(painted));
  await panel.getByRole('button', { name: '全圖', exact: true }).click();
  // Fit places the viewport indicator at/outside the image edge. Exclude its
  // 2px border: header/table layout may change the indicator, not map texture.
  const miniHash = async () => {
    await panel.getByRole('button', { name: '全圖', exact: true }).click();
    return panel.locator('.base-map-minimap').evaluate(async canvas => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', canvas.getContext('2d').getImageData(2, 2, canvas.width - 4, canvas.height - 4).data)), byte => byte.toString(16).padStart(2, '0')).join(''));
  };
  const originalMini = await miniHash();
  await panel.locator('.base-map-library > .el-select').click();
  await page.getByRole('option', { name: '水域與小地圖', exact: true }).click();
  await panel.getByRole('button', { name: /從小地圖隱藏|顯示於小地圖/ }).first().click();
  const editedMini = await miniHash(); assert.notEqual(editedMini, originalMini);
  await panel.getByRole('button', { name: '撤銷上一步', exact: true }).click();
  assert.equal(await miniHash(), originalMini, 'actual Canvas pixels restore deterministically');
  await panel.getByRole('button', { name: /從小地圖隱藏|顯示於小地圖/ }).first().click();
  assert.equal(await miniHash(), editedMini);
  await panel.getByRole('button', { name: '保存', exact: true }).click();
  await panel.getByText('已保存並重新讀取基礎地圖。', { exact: true }).waitFor();
  assert.equal(await miniHash(), editedMini, 'saved and reread Canvas remains byte-identical');
  assert.equal(saves, 1); assert.equal(snapshot.version, 2); assert.ok(reads >= 3); assert.equal(atlasReads, 1);
  await panel.locator('.base-map-library > .el-select').click();
  await page.getByRole('option', { name: 'Web 編輯組合', exact: true }).click();
  await panel.getByRole('button', { name: '選取組合', exact: true }).first().click();
  await panel.locator('.base-map-inspector').getByText('Web 編輯組合', { exact: true }).waitFor();
  assert.equal(await panel.getByRole('button', { name: '移動片段', exact: true }).count(), 0, 'group inspection must not expose topology movement');
  assert.equal(saves, 1, 'group navigation is display-only');
  const inspectPiece = template.content.map.decorations.find(piece => {
    const count = template.content.componentDefinitions[piece.definitionRef].footprint.length;
    return count > 1 && count <= 8 && piece.x > 100 && piece.x < 280 && piece.y > 80 && piece.y < 180;
  });
  assert.ok(inspectPiece);
  const definition = template.content.componentDefinitions[inspectPiece.definitionRef];
  const mainCanvas = panel.locator('.base-map-canvas');
  async function pickPiece() {
    await panel.getByRole('button', { name: '全圖', exact: true }).click();
    const size = await mainCanvas.evaluate(canvas => ({ width: canvas.width, height: canvas.height }));
    const view = fitViewport(size, { width: 384 * 16, height: 256 * 16 });
    const [dx, dy] = definition.footprint[0];
    const [x, y] = worldToScreen(view, (inspectPiece.x + dx - definition.anchor[0] + 0.5) * 16, (inspectPiece.y + dy - definition.anchor[1] + 0.5) * 16);
    await mainCanvas.click({ position: { x, y } });
  }
  await pickPiece();
  await panel.getByText(`${definition.footprint.length} 格 · 可拆編輯片段`, { exact: true }).waitFor();
  const decorLayer = panel.locator('.base-map-inspector .base-map-toolbar').filter({ hasText: '裝飾' });
  await decorLayer.locator('label').filter({ hasText: '鎖定' }).click();
  await pickPiece(); await panel.getByText('基底格', { exact: true }).waitFor();
  assert.equal(await panel.getByRole('button', { name: '拆分', exact: true }).count(), 0);
  await decorLayer.locator('label').filter({ hasText: '鎖定' }).click();
  await decorLayer.locator('label').filter({ hasText: '顯示' }).click();
  await pickPiece(); await panel.getByText('基底格', { exact: true }).waitFor();
  await decorLayer.locator('label').filter({ hasText: '顯示' }).click();
  await pickPiece(); await panel.getByRole('button', { name: '拆分', exact: true }).click();
  await panel.getByRole('button', { name: '撤銷上一步', exact: true }).click();
  await pickPiece(); await panel.getByRole('button', { name: '刪除', exact: true }).click();
  await panel.locator('.base-map-library > .el-select').click();
  await page.getByRole('option', { name: `問題定位（${definition.footprint.length}）`, exact: true }).click();
  await panel.getByRole('button', { name: '定位基底格', exact: true }).first().click();
  await panel.getByText('待補基底格', { exact: true }).waitFor();
  await panel.getByRole('button', { name: '填入此基底格', exact: true }).click();
  await panel.getByRole('button', { name: '撤銷上一步', exact: true }).click();
  await panel.getByRole('button', { name: '撤銷上一步', exact: true }).click();
  assert.equal(await panel.getByRole('button', { name: '保存', exact: true }).isEnabled(), false);
  assert.equal(saves, 1, 'hit testing, display controls and undone edits do not persist');
  await panel.locator('.base-map-library > .el-select').click();
  await page.getByRole('option', { name: 'Web 編輯組合', exact: true }).click();
  const captureIndex = template.content.selectionGroups.slice(0, 25).findIndex(group => group.members.every(member => member.layer === 'decorations') && group.members.reduce((count, member) => {
    const instance = template.content.map.decorations.find(row => row.id === member.id);
    return count + template.content.componentDefinitions[instance.definitionRef].footprint.length;
  }, 0) <= 256);
  assert.ok(captureIndex >= 0, 'registered first page contains a capturable Web fragment group');
  await panel.getByRole('button', { name: '選取組合', exact: true }).nth(captureIndex).click();
  await panel.getByRole('textbox', { name: '新素材名稱', exact: true }).fill('瀏覽器擷取素材');
  await panel.getByRole('button', { name: '擷取為素材', exact: true }).click();
  await panel.getByRole('button', { name: '保存', exact: true }).click();
  await panel.getByText('已保存並重新讀取基礎地圖。', { exact: true }).waitFor();
  assert.equal(saves, 2);
  assert.ok(Object.values(snapshot.template.content.componentDefinitions).some(def => def.name === '瀏覽器擷取素材'));
  await panel.locator('.base-map-library > .el-select').click();
  await page.getByRole('option', { name: '問題定位（0）', exact: true }).click();
  await page.setViewportSize({ width: 900, height: 700 });
  await page.waitForFunction(() => document.documentElement.scrollHeight <= innerHeight + 1 && document.documentElement.scrollWidth <= innerWidth + 1);
  const adminReads = reads;
  role = 'author'; await page.reload();
  await page.locator('#draft-editor').waitFor({ state: 'visible' });
  assert.equal(await panel.count(), 0); assert.equal(await page.getByRole('button', { name: '基礎地圖', exact: true }).count(), 0);
  assert.equal(reads, adminReads, 'author direct hash navigation does not load administrator template');
  const templateBefore = JSON.stringify(snapshot), otherBefore = JSON.stringify(gameCopies.get(gameIds[1]));
  await page.locator('.current-game').getByRole('button', { name: '重新整理', exact: true }).click();
  await page.locator('[data-view="mapview-editor"]').click();
  const gamePanel = page.locator('#game-map-editor');
  await gamePanel.getByText('已重新讀取遊戲地圖。', { exact: true }).waitFor();
  await page.waitForFunction(() => !document.querySelector('#game-map-editor').textContent.includes('圖集載入中'));
  assert.equal(await gamePanel.getByRole('button', { name: '首次建立', exact: true }).count(), 0);
  assert.ok(await gamePanel.locator('.base-map-canvas').evaluate(canvas => canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data.some((v, i) => i % 4 === 3 && v > 0)));
  await gamePanel.locator('.base-map-library > .el-select').click();
  await page.getByRole('option', { name: '水域與小地圖', exact: true }).click();
  await gamePanel.getByRole('button', { name: /從小地圖隱藏|顯示於小地圖/ }).first().click();
  await gamePanel.getByRole('button', { name: '保存', exact: true }).click();
  await gamePanel.getByText('已保存並重新讀取遊戲地圖。', { exact: true }).waitFor();
  assert.equal(gameSaves, 1); assert.equal(JSON.stringify(snapshot), templateBefore); assert.equal(JSON.stringify(gameCopies.get(gameIds[1])), otherBefore);
  await page.locator('.current-game .el-select').click(); await page.getByRole('option', { name: '測試地圖2', exact: true }).click();
  await gamePanel.getByText('已重新讀取遊戲地圖。', { exact: true }).waitFor();
  assert.equal(await page.locator('#mapview-editor').count(), 0, 'legacy map panel is not mounted');
  await page.waitForFunction(() => !document.querySelector('#game-map-editor').textContent.includes('圖集載入中'));
  await gamePanel.locator('.base-map-library > .el-select').click(); await page.getByRole('option', { name: '水域與小地圖', exact: true }).click();
  await gamePanel.getByRole('button', { name: /從小地圖隱藏|顯示於小地圖/ }).first().click();
  const beforeDialogs = dialogs; acceptDialogs = false;
  await page.locator('.current-game .el-select').click(); await page.getByRole('option', { name: '測試地圖1', exact: true }).click();
  assert.ok(dialogs > beforeDialogs, 'game switch checks dirty map session');
  await page.locator('.current-game .el-select').getByText('測試地圖2', { exact: true }).waitFor();
  assert.equal(await gamePanel.getByRole('button', { name: '保存', exact: true }).isEnabled(), true, 'cancelled switch retains pending map edits');
  await gamePanel.getByRole('button', { name: '撤銷上一步', exact: true }).click(); acceptDialogs = true;
  assert.equal(gameSaves, 1); assert.equal(JSON.stringify(gameCopies.get(gameIds[1])), otherBefore);
  assert.deepEqual(unexpected, []); assert.deepEqual(errors, []); assert.deepEqual(failures, []);
  console.log('PASS built BaseMapPanel: initialization, authenticated atlas fixture, actual Canvas pixels, water toggle/save/reread, group selection/capture/save, footprint picking and layer locks/visibility, split/delete/base-fill undo and diagnostic location, author copy map edit/save/reread/switch isolation, narrow viewport; API mocked, no production/auth claim.');
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
