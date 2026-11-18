// Selection toggle-off + single-decor ungroup on a real converted template.
// Real builtin conversion (has web-piece groups), isolated in-memory API, fresh profile.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readInstalledEditorSource } from './editor_builtin_source.mjs';
import { convertInstalledSystemBaseMap } from './system_base_map_conversion.mjs';
import { BUILTIN_RESOURCES } from '../web/src/content/builtinresources.generated.js';
import { enableSeaGroundBase } from '../web/src/editor/componenttools.js';
import { SystemBaseMapStore } from '../server/systembasemapstore.js';
import { openStorage } from '../vps/sqlite-port.mjs';
import { fitViewport, worldToScreen } from '../web/src/editor/viewport.js';
import { composeMapLayers } from '../web/src/content/authoring/maplayers.js';

const moduleName = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(isAbsolute(moduleName) ? pathToFileURL(moduleName).href : moduleName);
const { template: legacy } = convertInstalledSystemBaseMap(readInstalledEditorSource(), BUILTIN_RESOURCES.sourceDigest);
const template = { ...legacy, content: enableSeaGroundBase(legacy.content) };
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

// Pick a real grouped decor cell from the template.
const byId = new Map(template.content.map.decorations.map(d => [d.id, d]));
const nearTop = (d) => Math.abs(d.x - 192) + Math.abs(d.y - 30) * 3;
const large = process.argv.includes('--large');
const grouped = template.content.selectionGroups
  .filter(group => !large || (!group.members.some(member => member.id === 'web-piece-instance-30896') && group.members.reduce((sum, member) => sum + (template.content.componentDefinitions[byId.get(member.id)?.definitionRef]?.footprint.length ?? 0), 0) > 256))
  .filter(g => /^web-piece-group-\d+$/.test(g.id) && (g.members ?? []).length >= 2 && (g.members ?? []).every(m => m?.layer === 'decorations' && byId.has(m.id)) && g.members.some(m => template.content.componentDefinitions[byId.get(m.id).definitionRef].footprint.length > 1))
  .sort((a, b) => nearTop(byId.get(a.members[0].id)) - nearTop(byId.get(b.members[0].id)))[0];
assert.ok(grouped, 'fixture template must contain a web-piece group');
const gx = byId.get(grouped.members.find(m => template.content.componentDefinitions[byId.get(m.id).definitionRef].footprint.length > 1).id);
console.log('Disband fixture:', grouped.id, 'members:', grouped.members.length, 'cells:', grouped.members.reduce((sum, member) => sum + template.content.componentDefinitions[byId.get(member.id).definitionRef].footprint.length, 0));
const originalDefinition = template.content.componentDefinitions[gx.definitionRef];
const originalTiles = originalDefinition.variants[gx.variantRef ?? 'original'].tiles;
// Reproduce the user's second screenshot: the old action already removed the
// outer group but left web-piece-instance-30896 as a multi-cell fragment.
const standalone = byId.get('web-piece-instance-30896');
assert.ok(standalone, 'screenshot instance exists in the converted builtin map');
assert.ok(!grouped.members.some(member => member.id === standalone.id));
assert.ok(template.content.componentDefinitions[standalone.definitionRef].footprint.length > 1);
template.content.selectionGroups = template.content.selectionGroups.filter(group => !group.members.some(member => member.id === standalone.id));
const originalLayers = composeMapLayers(template.content, { draft: true });
assert.ok(gx, 'grouped member must exist');

const storage = openStorage(':memory:');
const store = new SystemBaseMapStore({ storage, principal: () => ({ id: 'fixture', role: 'admin', must_change: false }), loadInitialTemplate: async () => template });
let browser, snapshot = null;
const errors = [], failures = [];
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ headless: true, args: ['--disable-accelerated-2d-canvas'], executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage(); page.setDefaultTimeout(30000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
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
      const edits = request.postDataJSON().edits;
      if (large && snapshot.version === 1) {
        assert.ok(Buffer.byteLength(request.postData()) > 16384, 'large disband exceeds old request budget');
        console.log('Large save bytes:', Buffer.byteLength(request.postData()), 'commands:', edits.length);
      }
      snapshot = store.edit('fixture', edits);
      return route.fulfill({ json: { snapshot } });
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
  try {
    await panel.getByRole('button', { name: '建立', exact: true }).click({ timeout: 15000 });
  } catch (e) {
    console.log('BOOT-STATE url=' + page.url());
    console.log('BOOT-STATE identity=' + ((await page.locator('#identity').textContent().catch(() => '(none)')) || '(empty)').slice(0, 120));
    console.log('BOOT-STATE status=' + ((await page.locator('.map-status').first().textContent().catch(() => '(none)')) || '(empty)').slice(0, 200));
    console.log('BOOT-STATE errors=' + errors.join(' | ').slice(0, 500));
    console.log('BOOT-STATE panels=' + (await page.locator('#session > section').evaluateAll(els => els.map(el => el.id + ':' + (el.hidden ? 'h' : 'v'))).catch(() => '(?)')));
    throw e;
  }
  await page.getByText('基礎地圖已建立。', { exact: true }).waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('#base-map-editor .map-status')].every(el => !(el.textContent || '').includes('圖集载入')), undefined, { timeout: 60000 });
  console.log('Workspace initialized; checking road/city position feedback.');
  const canvas = panel.locator('.base-map-canvas');
  const viewOf = async (x, y) => {
    const box = await canvas.boundingBox();
    const size = { width: box.width, height: box.height };
    const view = fitViewport(size, { width: 384 * 16, height: 256 * 16 });
    const [sx, sy] = worldToScreen(view, (x + 0.5) * 16, (y + 0.5) * 16);
    return { x: box.x + sx, y: box.y + sy, rx: sx, ry: sy };
  };
  const menu = () => panel.getByRole('dialog', { name: '物件操作', exact: true });
  const lclick = p => canvas.click({ position: { x: p.rx, y: p.ry } });
  const rclick = p => canvas.click({ button: 'right', position: { x: p.rx, y: p.ry } });
  // Background coordinates remain available for new cities, but never open
  // an object context menu. Hidden foreground layers expose only the base.
  for (const layer of ['裝飾', '道路', '據點']) await panel.getByRole('button', { name: '隱藏' + layer, exact: true }).click();
  const base = await viewOf(100, 100);
  await lclick(base); await rclick(base);
  assert.equal(await menu().count(), 0, 'base placement coordinate has no object menu');
  await canvas.focus(); await canvas.press('Shift+F10');
  assert.equal(await menu().count(), 0, 'keyboard cannot open a base object menu');
  for (const layer of ['裝飾', '道路', '據點']) await panel.getByRole('button', { name: '顯示' + layer, exact: true }).click();
  assert.equal(await panel.getByRole('button', { name: '保存', exact: true }).isEnabled(), false);
  // Real UI: road/city drops show only a translucent red overlay. Details
  // appear on Save, no request/write occurs, and Undo removes the overlay.
  await canvas.evaluate(node => {
    const context = node.getContext('2d'), fill = context.fillRect.bind(context), clear = context.clearRect.bind(context);
    context.clearRect = (...args) => { node.dataset.redCells = '0'; return clear(...args); };
    context.fillRect = (...args) => {
      if (context.fillStyle === 'rgba(255, 0, 0, 0.35)') node.dataset.redCells = String(Number(node.dataset.redCells || 0) + 1);
      return fill(...args);
    };
  });
  const nearCenter = point => Math.abs(point.x - 192) + Math.abs(point.y - 128);
  const road = template.content.map.roads.filter(row => row.geometry.every(point => point.y < 252))
    .map(row => ({ row, point: row.geometry[Math.floor(row.geometry.length / 2)] }))
    .sort((a, b) => nearCenter(a.point) - nearCenter(b.point))[0];
  const city = template.content.map.placements.slice().sort((a, b) => nearCenter(a) - nearCenter(b))[0];
  await panel.getByRole('button', { name: '鎖圖', exact: true }).click();
  for (const target of [{ id: road.row.id, point: road.point, cityId: road.row.fromCityId }, { id: city.id, point: city, cityId: city.cityId }]) {
    await panel.getByRole('button', { name: '全圖', exact: true }).click();
    const start = await viewOf(target.point.x, target.point.y), end = await viewOf(target.point.x, target.point.y + 2);
    await lclick(start);
    await page.mouse.move(start.x, start.y); await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 4 }); await page.mouse.up();
    await page.waitForFunction(() => Number(document.querySelector('#base-map-editor .base-map-canvas').dataset.redCells) > 0);
    assert.equal(await panel.locator('.base-map-problems').count(), 0, 'drop must not show position details');
    await panel.getByRole('button', { name: '保存', exact: true }).click();
    await panel.locator('.base-map-problems').first().waitFor();
    const details = await panel.locator('.base-map-problems').allTextContents();
    assert.ok(details.join('').includes(target.id));
    assert.ok(details.join('').includes(template.content.cities[target.cityId].name));
    assert.ok(details.join('').includes('請檢查'));
    assert.equal(snapshot.version, 1, 'invalid drop never reaches persistent write');
    await panel.getByRole('button', { name: '撤銷', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#base-map-editor .base-map-canvas').dataset.redCells === '0');
    assert.equal(await panel.locator('.base-map-problems').count(), 0);
    console.log('Position feedback/save refusal/undo:', target.id);
  }
  await panel.getByRole('button', { name: '鎖圖', exact: true }).click();
  await panel.getByRole('button', { name: '全圖', exact: true }).click();
  let gp = await viewOf(gx.x, gx.y);

  // 1. plain click selects, clicking the same cell again deselects.
  await lclick(gp);
  await rclick(gp);
  await menu().waitFor();
  assert.match(await menu().locator('.base-map-object-info').textContent(), /裝飾片段/);
  await page.keyboard.press('Escape');
  await lclick(gp);
  await rclick(gp);
  await page.waitForTimeout(500);
  assert.equal(await menu().count(), 0, 'clicking the selected decor again must deselect it');

  // 2. historical group data remains compatible but is no longer displayed.
  await lclick(gp);
  await rclick(gp);
  await menu().waitFor();
  assert.equal((await menu().locator('.base-map-object-info').textContent()).includes('所属组合'), false);

  assert.equal(await menu().getByRole('button', { name: '拆散', exact: true }).isDisabled(), false);
  assert.equal(await menu().getByRole('button', { name: '组合', exact: true }).isDisabled(), true);
  // 3. disband it: notice + dirty + group gone afterwards.
  await menu().getByRole('button', { name: '拆散', exact: true }).click();
  await page.getByText(/已拆散1个组合/, { exact: true }).waitFor();
  assert.equal(await panel.getByRole('button', { name: '保存', exact: true }).isEnabled(), true);
  // Right-click must preserve the notice: removing it resizes the canvas host
  // and its ResizeObserver closes the newly opened menu.
  await rclick(gp);
  await menu().waitFor();
  await page.getByText(/已拆散1个组合/, { exact: true }).waitFor();
  assert.match(await menu().locator('.base-map-object-info').textContent(), new RegExp(gx.x + ', ' + gx.y));
  assert.equal(await menu().getByRole('button', { name: '拆散', exact: true }).isDisabled(), false, 'single cells accept a harmless disband');
  assert.equal((await menu().locator('.base-map-object-info').textContent()).includes('所属组合'), false);
  await page.keyboard.press('Escape');
  // One undo restores BOTH the group and its multi-cell instances.
  await panel.getByRole('button', { name: '撤銷', exact: true }).click();
  assert.equal(await panel.getByRole('button', { name: '保存', exact: true }).isEnabled(), false);
  await panel.getByRole('button', { name: '全圖', exact: true }).click();
  gp = await viewOf(gx.x, gx.y);
  await lclick(gp); await rclick(gp); await menu().waitFor();
  assert.equal((await menu().locator('.base-map-object-info').textContent()).includes('所属组合'), false);
  await menu().getByRole('button', { name: '拆散', exact: true }).click();
  await page.getByText(/已拆散1个组合/, { exact: true }).waitFor();
  // 4. save + reload: the disband persists server-side.
  await panel.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByText('已保存並重新讀取基礎地圖。', { exact: true }).waitFor();
  const saved = snapshot.template.content;
  assert.equal(saved.selectionGroups.some(group => group.id === grouped.id), false);
  for (const member of grouped.members) {
    const original = byId.get(member.id), def = template.content.componentDefinitions[original.definitionRef];
    if (def.footprint.length < 2) continue;
    assert.equal(saved.map.decorations.some(item => item.id === original.id), false);
    const children = saved.map.decorations.filter(item => item.splitProvenance?.instanceId === original.id);
    assert.equal(children.length, def.footprint.length);
    assert.ok(children.every(item => saved.componentDefinitions[item.definitionRef].footprint.length === 1));
    assert.ok(children.every(item => !saved.selectionGroups.some(group => group.members.some(member => member.id === item.id))));
  }
  const savedLayers = composeMapLayers(saved, { draft: true });
  for (const key of ['terrain', 'geography', 'minimapGeography']) assert.deepEqual(savedLayers[key], originalLayers[key], key + ' must not change');
  await page.reload();
  await panel.locator('.base-map-canvas').waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('#base-map-editor .map-status')].every(el => !(el.textContent || '').includes('圖集载入')), undefined, { timeout: 60000 });
  const gp2 = await viewOf(gx.x, gx.y);
  await lclick(gp2);
  await rclick(gp2);
  await menu().waitFor();
  assert.match(await menu().locator('.base-map-object-info').textContent(), new RegExp(gx.x + ', ' + gx.y));
  assert.equal(await panel.getByRole('dialog', { name: '物件操作', exact: true }).getByRole('button', { name: '拆散', exact: true }).isDisabled(), false);
  await page.keyboard.press('Escape');
  const pickedIds = new Set();
  // Re-select several cells from the SAME old instance, not merely different
  // members of its former selection group. Each must now have its own ID.
  for (const [dx, dy] of originalTiles.slice(1, 5)) {
    const point = await viewOf(gx.x + dx - originalDefinition.anchor[0], gx.y + dy - originalDefinition.anchor[1]);
    await lclick(point); await rclick(point); await menu().waitFor();
    const text = await menu().locator('.base-map-object-info').textContent();
    const child = saved.map.decorations.find(item => item.splitProvenance?.instanceId === gx.id && item.x === gx.x + dx - originalDefinition.anchor[0] && item.y === gx.y + dy - originalDefinition.anchor[1]);
    assert.ok(child && text.includes(child.id), 'click selects the individual child at its own cell');
    assert.equal(pickedIds.has(child.id), false); pickedIds.add(child.id);
    assert.equal(await menu().getByRole('button', { name: '拆散', exact: true }).isDisabled(), false);
    await page.keyboard.press('Escape');
  }
  assert.ok(pickedIds.size >= 1);
  await panel.getByRole('button', { name: '全圖', exact: true }).click();
  const standalonePoint = await viewOf(standalone.x, standalone.y);
  await lclick(standalonePoint); await rclick(standalonePoint); await menu().waitFor();
  const standaloneInfo = await menu().locator('.base-map-object-info').textContent();
  assert.ok(standaloneInfo.includes(standalone.id));
  assert.equal(standaloneInfo.includes('所属组合'), false);
  assert.equal(await menu().getByRole('button', { name: '拆散', exact: true }).isEnabled(), true);
  await menu().getByRole('button', { name: '拆散', exact: true }).click();
  await page.getByText(/1个装饰片段已拆为独立单格/, { exact: true }).waitFor();
  await panel.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByText('已保存並重新讀取基礎地圖。', { exact: true }).waitFor();
  const standaloneChildren = snapshot.template.content.map.decorations.filter(item => item.splitProvenance?.instanceId === standalone.id);
  assert.equal(standaloneChildren.length, template.content.componentDefinitions[standalone.definitionRef].footprint.length);
  assert.ok(standaloneChildren.every(item => snapshot.template.content.componentDefinitions[item.definitionRef].footprint.length === 1));
  // Current product: two selected single cells become ONE persisted object,
  // with no new selection-group. Then batch-delete two cells and undo once.
  await panel.getByRole('button', { name: '隱藏裝飾', exact: true }).click();
  await panel.getByRole('button', { name: '顯示裝飾', exact: true }).click();
  const selectedChildren = [...pickedIds].slice(0, 2).map(id => saved.map.decorations.find(item => item.id === id));
  if (selectedChildren.length < 2) selectedChildren.push(saved.map.decorations.find(item => item.splitProvenance?.instanceId === gx.id && !pickedIds.has(item.id)));
  for (const child of selectedChildren) {
    const point = await viewOf(child.x, child.y);
    await canvas.click({ position: { x: point.rx, y: point.ry }, modifiers: ['Shift'] });
  }
  await rclick(await viewOf(selectedChildren[0].x, selectedChildren[0].y)); await menu().waitFor();
  assert.equal(await menu().getByRole('button', { name: '刪除', exact: true }).isEnabled(), true);
  assert.equal(await menu().getByRole('button', { name: '拆散', exact: true }).isEnabled(), true);
  await menu().getByRole('button', { name: '组合', exact: true }).click();
  await panel.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByText('已保存並重新讀取基礎地圖。', { exact: true }).waitFor();
  const current = snapshot.template.content;
  const combined = current.map.decorations.find(item => !saved.map.decorations.some(old => old.id === item.id) && current.componentDefinitions[item.definitionRef].footprint.length === 2);
  assert.ok(combined, 'two selected cells saved as one real object');
  assert.ok(selectedChildren.every(child => !current.map.decorations.some(item => item.id === child.id)));
  assert.equal(current.selectionGroups.some(group => group.members.some(member => member.id === combined.id)), false);
  // Real pointer gesture: the composite itself renders at half opacity before
  // pointer-up; undo restores the original placement in one step.
  const grip = await viewOf(combined.x, combined.y);
  await panel.getByRole('button', { name: '鎖圖', exact: true }).click();
  await canvas.evaluate(node => {
    const ctx = node.getContext('2d'), original = ctx.drawImage;
    window.__movingDraws = [];
    window.__restoreDraw = () => { ctx.drawImage = original; delete window.__restoreDraw; delete window.__movingDraws; };
    ctx.drawImage = function (...args) { if (this.globalAlpha === 0.5) window.__movingDraws.push({ x: args[5], y: args[6] }); return original.apply(this, args); };
  });
  await page.mouse.move(grip.x, grip.y); await page.mouse.down();
  await page.mouse.move(grip.x + 12, grip.y + 12, { steps: 5 });
  assert.ok(await page.evaluate(() => window.__movingDraws.length >= 2), 'both cells render translucently during the gesture');
  await page.mouse.up();
  await page.evaluate(() => window.__restoreDraw());
  await panel.getByRole('button', { name: '撤銷', exact: true }).click();
  assert.equal(await panel.getByRole('button', { name: '保存', exact: true }).isEnabled(), false);
  await panel.getByRole('button', { name: '鎖圖', exact: true }).click();
  await rclick(await viewOf(combined.x, combined.y)); await menu().waitFor();
  assert.ok((await menu().locator('.base-map-object-info').textContent()).includes(combined.id));
  await menu().getByRole('button', { name: '拆散', exact: true }).click();
  await panel.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByText('已保存並重新讀取基礎地圖。', { exact: true }).waitFor();
  const splitAgain = snapshot.template.content.map.decorations.filter(item => item.splitProvenance?.instanceId === combined.id);
  assert.equal(splitAgain.length, 2);
  await panel.getByRole('button', { name: '隱藏裝飾', exact: true }).click();
  await panel.getByRole('button', { name: '顯示裝飾', exact: true }).click();
  for (const child of splitAgain) {
    const point = await viewOf(child.x, child.y);
    await canvas.click({ position: { x: point.rx, y: point.ry }, modifiers: ['Shift'] });
  }
  await rclick(await viewOf(splitAgain[0].x, splitAgain[0].y)); await menu().waitFor();
  await menu().getByRole('button', { name: '刪除', exact: true }).click();
  await panel.getByRole('button', { name: '撤銷', exact: true }).click();
  assert.equal(await panel.getByRole('button', { name: '保存', exact: true }).isEnabled(), false, 'batch delete is one undo unit');
  for (const child of splitAgain) {
    const point = await viewOf(child.x, child.y);
    await canvas.click({ position: { x: point.rx, y: point.ry }, modifiers: ['Shift'] });
  }
  await rclick(await viewOf(splitAgain[0].x, splitAgain[0].y)); await menu().waitFor();
  await menu().getByRole('button', { name: '刪除', exact: true }).click();
  await panel.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByText('已保存並重新讀取基礎地圖。', { exact: true }).waitFor();
  assert.ok(splitAgain.every(child => !snapshot.template.content.map.decorations.some(item => item.id === child.id)), 'both selected objects really deleted in SQLite');
  assert.equal(errors.join('\n'), '');
  assert.equal(failures.join('\n'), '');
  console.log('PASS grouped and screenshot ungrouped fragments split to independent cells; one undo, unchanged terrain/geography/minimap, save+reload and per-cell picking');
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); storage.close(); }
