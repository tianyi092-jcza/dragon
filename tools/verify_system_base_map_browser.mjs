// Atomic library plus readonly city groups, real registered atlas/source, isolated in-memory API.
// Fresh profile; not evidence for production authentication or transport.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readInstalledEditorSource } from './editor_builtin_source.mjs';
import { convertInstalledSystemBaseMap } from './system_base_map_conversion.mjs';
import { BUILTIN_RESOURCES } from '../web/src/content/builtinresources.generated.js';
import { enableSeaGroundBase } from '../web/src/editor/componenttools.js';
import { validateSystemBaseMap } from '../server/systembasemap.js';
import { applyMapWorkspaceEdits } from '../server/mapworkspace.js';
import { verifyAtomicLibrary, selectAtomicTile, dragAtomicTile, verifyMapWorkspaceChrome, verifyCompactMapLayout, verifyMapPanLock, verifyCityGroupLibrary } from './map_atomic_browser_helpers.mjs';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const ratio = Number(process.env.PLAYWRIGHT_DPR || 2);
assert.ok([1, 2].includes(ratio));
const { template: legacy } = convertInstalledSystemBaseMap(readInstalledEditorSource(), BUILTIN_RESOURCES.sourceDigest);
const template = { ...legacy, content: enableSeaGroundBase(legacy.content) };
const sha = value => createHash('sha256').update(value).digest('hex');
const root = new URL('../server/public/', import.meta.url);
const modules = { 'client.js': 'client.txt', 'shell-ui.js': 'shell-ui.txt', 'draft.js': 'draft.txt', 'stage.js': 'stage.txt', 'library.js': 'library.txt', 'catalog.js': 'catalog.txt', 'management.js': 'management.txt', 'publish.js': 'publish.txt', 'review.js': 'review.txt', 'stronghold.js': 'stronghold.txt', 'general.js': 'general.txt', 'stage-assets.js': 'stageassets.txt' };
const server = createServer(async (req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html';
  if (name === 'favicon.ico') return res.writeHead(204).end();
  const file = modules[name] ?? (['index.html', 'shell-ui.css', 'style.css'].includes(name) ? name : null);
  if (!file) return res.writeHead(404).end();
  res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html');
  res.end(await readFile(new URL(file, root)));
});
let browser, snapshot = null, saves = 0, gameSaves = 0, role = 'admin', acceptDialogs = true, dialogs = 0;
const errors = [], failures = [], unexpected = [], writes = [], requestedSeasons = [];
const gameId = '11111111-1111-4111-8111-111111111111';
const { editorAssets, ...content } = template.content;
let game = { ...structuredClone(content), gameId, mapEditorAssets: structuredClone(editorAssets) };
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ headless: true, args: ['--disable-accelerated-2d-canvas'], executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: ratio });
  const page = await context.newPage(); page.setDefaultTimeout(30000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('requestfailed', request => failures.push(request.url()));
  page.on('dialog', dialog => { dialogs++; return acceptDialogs ? dialog.accept() : dialog.dismiss(); });
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    if (path === '/api/session') return route.fulfill({ json: { user: { id: 'fixture', account: 'fixture', role, mustChangePassword: false }, version: 1, csrf: 'fixture' } });
    if (path === '/api/resources') return route.fulfill({ json: { mode: 'BUILTIN_READONLY', resources: [] } });
    if (path === '/api/games') return route.fulfill({ json: { games: [{ gameId, draftRevision: '1', metadata: { name: '原子地圖', introduction: '' }, createdAt: '2026-01-01T00:00:00.000Z', modifiedAt: '2026-01-01T00:00:00.000Z' }] } });
    if (path === '/api/admin/accounts') return route.fulfill({ json: { accounts: [] } });
    if (path === '/api/admin/copy/submissions') return route.fulfill({ json: { queue: [] } });
    if (path === '/api/users') return route.fulfill({ json: { users: [] } });
    if (path === `/api/games/${gameId}/copy/submission`) return route.fulfill({ json: { gameId, state: 'draft', copyDigest: null, validation: null, slot: null, version: null, nextVersion: '1.0', publishEnabled: false, blockedReason: '尚未檢驗' } });
    if (path === '/api/admin/base-map') return route.fulfill({ json: { snapshot } });
    if (path === '/api/admin/base-map/initialize') {
      snapshot ??= { version: 1, digest: validateSystemBaseMap(template, sha).digest, template };
      return route.fulfill({ json: { snapshot } });
    }
    if (path === '/api/admin/base-map/save') {
      const edits = request.postDataJSON().edits; writes.push(structuredClone(edits));
      const next = { ...snapshot.template, content: applyMapWorkspaceEdits({ ...snapshot.template.content, gameId: 'system-base-map' }, edits) };
      delete next.content.gameId;
      snapshot = { version: snapshot.version + 1, digest: validateSystemBaseMap(next, sha).digest, template: JSON.parse(JSON.stringify(next)) }; saves++;
      return route.fulfill({ json: { snapshot } });
    }
    if (path === `/api/games/${gameId}/copy`) {
      if (request.method() === 'POST') {
        const body = request.postDataJSON(); assert.equal(body.module, 'map');
        game = JSON.parse(JSON.stringify(applyMapWorkspaceEdits(game, body.patch.edits))); gameSaves++;
      }
      return route.fulfill({ json: { gameId, copyDigest: sha(JSON.stringify(game)), data: game } });
    }
    if (path === '/api/admin/base-map/atlas' || path === `/api/games/${gameId}/copy/map-atlas`) {
      requestedSeasons.push(url.searchParams.get('season'));
      const descriptor = editorAssets.seasonAtlases[url.searchParams.get('season')];
      return route.fulfill({ contentType: 'application/octet-stream', headers: { 'X-Content-SHA256': descriptor.sha256 }, body: await readFile(new URL('../web/' + descriptor.url, import.meta.url)) });
    }
    unexpected.push(`${request.method()} ${path}`); return route.fulfill({ status: 500, json: { error: 'UNEXPECTED_FIXTURE_REQUEST' } });
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/#base-map-editor`);
  const panel = page.locator('#base-map-editor');
  await panel.getByRole('button', { name: '建立', exact: true }).click();
  await page.getByText('基礎地圖已建立。', { exact: true }).waitFor();
  await verifyAtomicLibrary(page, panel, template.content);
  await verifyCityGroupLibrary(page, panel, template.content);
  await verifyMapPanLock(page, panel);
  assert.equal(saves, 0); assert.deepEqual(snapshot.template, template);
  await selectAtomicTile(panel, template.content.componentDefinitions, 205);
  const neutral = panel.getByLabel('據點圖塊 205', { exact: true }).locator('..');
  await neutral.focus(); await page.keyboard.press('Enter'); await page.keyboard.press('Space');
  assert.equal(await panel.getByRole('button', { name: '保存', exact: true }).isEnabled(), true, 'neutral artwork can be placed');
  await panel.getByRole('button', { name: '撤銷', exact: true }).click();
  assert.equal(await panel.getByRole('button', { name: /填入.*基底/ }).count(), 0);
  await panel.getByRole('button', { name: '全圖', exact: true }).click();
  for (const label of ['裝飾', '道路', '據點']) await panel.getByRole('button', { name: '隱藏' + label, exact: true }).click();
  await panel.getByText('網格', { exact: true }).click();
  const pixel = await panel.locator('.base-map-canvas').evaluate(node => Array.from(node.getContext('2d').getImageData(Math.floor(node.width / 2), Math.floor(node.height / 2), 1, 1).data));
  assert.ok(pixel[2] > pixel[0] && pixel[3] === 255);
  for (const label of ['裝飾', '道路', '據點']) await panel.getByRole('button', { name: '顯示' + label, exact: true }).click();
  const atom = await selectAtomicTile(panel, template.content.componentDefinitions, 112);
  await atom.focus(); await page.keyboard.press('Enter'); await page.keyboard.press('Escape');
  assert.equal(await panel.getByRole('button', { name: '保存', exact: true }).isEnabled(), false);
  await atom.focus(); await page.keyboard.press('Enter');
  await selectAtomicTile(panel, template.content.componentDefinitions, 0);
  await panel.locator('.base-map-canvas').focus(); await page.keyboard.press('Enter');
  assert.equal(await panel.getByRole('button', { name: '保存', exact: true }).isEnabled(), false, 'category switch cancels preview');
  await panel.getByRole('button', { name: '鎖定裝飾', exact: true }).click();
  const ground = await selectAtomicTile(panel, template.content.componentDefinitions, 0);
  await ground.focus(); await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
  assert.equal(await panel.getByRole('button', { name: '保存', exact: true }).isEnabled(), false);
  await panel.getByRole('button', { name: '解鎖裝飾', exact: true }).click();
  await ground.focus(); await page.keyboard.press('Enter');
  await page.evaluate(() => {
    const original = Crypto.prototype.getRandomValues;
    Crypto.prototype.getRandomValues = function () {
      Crypto.prototype.getRandomValues = original;
      throw new Error('測試：無法分配新物件ID');
    };
  });
  await page.keyboard.press('Enter');
  await page.locator('.map-status').getByText('測試：無法分配新物件ID', { exact: true }).waitFor();
  assert.equal(await panel.getByRole('button', { name: '保存', exact: true }).isEnabled(), false, 'run() failure is visible in merged status and stages nothing');
  await panel.getByRole('button', { name: '載入', exact: true }).click();
  await page.getByText('已重新讀取基礎地圖。', { exact: true }).waitFor();
  await panel.getByRole('button', { name: '鎖圖', exact: true }).click();
  assert.equal(await panel.getByRole('button', { name: '鎖圖', exact: true }).getAttribute('aria-pressed'), 'true');
  // Toggle twice to prove the lock switch itself works; palette placement works in both modes.
  await panel.getByRole('button', { name: '鎖圖', exact: true }).click();
  assert.equal(await panel.getByRole('button', { name: '鎖圖', exact: true }).getAttribute('aria-pressed'), 'false');
  await dragAtomicTile(page, panel, template.content.componentDefinitions, 112, 208, 135);
  await panel.getByRole('button', { name: '撤銷', exact: true }).click();
  assert.equal(await panel.getByRole('button', { name: '保存', exact: true }).isEnabled(), false);
  await dragAtomicTile(page, panel, template.content.componentDefinitions, 112, 208, 135);
  acceptDialogs = false;
  await page.locator('[data-view="draft-editor"]').click(); assert.ok(dialogs > 0); assert.equal(await panel.isVisible(), true);
  acceptDialogs = true;
  await panel.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByText('已保存並重新讀取基礎地圖。', { exact: true }).waitFor();
  assert.equal(saves, 1); assert.equal(writes[0].length, 1); assert.equal(writes[0][0].op, 'decoration-place');
  assert.equal(snapshot.template.content.map.decorations.at(-1).definitionRef, 'tile-112');
  assert.deepEqual(snapshot.template.content.map.decorations.slice(0, -1), template.content.map.decorations);
  assert.deepEqual(snapshot.template.content.componentDefinitions, template.content.componentDefinitions, 'no combination definition is created');
  assert.deepEqual(snapshot.template.content.selectionGroups, template.content.selectionGroups, 'library changes never split existing map groups');
  const screenshots = await mkdtemp(join(tmpdir(), 'dragon-map-compact-'));
  await panel.getByRole('button', { name: '放大', exact: true }).click();
  await page.screenshot({ path: join(screenshots, 'wide-default.png') });
  await verifyMapWorkspaceChrome(page, panel, snapshot.template.content, snapshot.template.content.map.decorations.at(-1).id);
  await panel.locator('.base-map-canvas').focus(); await page.keyboard.press('Shift+F10');
  await page.screenshot({ path: join(screenshots, 'wide-menu.png') });
  await page.keyboard.press('Escape');
  await verifyCityGroupLibrary(page, panel, snapshot.template.content);
  await page.screenshot({ path: join(screenshots, 'city-groups-wide.png') });
  for (const [width, height] of [[1024, 600], [1440, 900], [1600, 1000], [900, 700]]) {
    await page.setViewportSize({ width, height });
    await page.waitForFunction(() => document.documentElement.scrollHeight <= innerHeight + 1 && document.documentElement.scrollWidth <= innerWidth + 1);
    const expanded = await verifyCompactMapLayout(page, panel);
    const navWidth = await page.locator('#menu').evaluate(node => node.clientWidth);
    await page.getByRole('button', { name: '折疊導覽', exact: true }).click();
    await page.waitForFunction(width => document.querySelector('.base-map-canvas').clientWidth > width, expanded.map.width);
    const collapsed = await verifyCompactMapLayout(page, panel);
    await verifyCityGroupLibrary(page, panel, snapshot.template.content);
    assert.equal(collapsed.map.width - expanded.map.width, navWidth - 64);
    assert.deepEqual(collapsed.library, expanded.library);
    console.log(`Layout ${width}x${height}: expanded map ${expanded.map.width}x${expanded.map.height}, collapsed ${collapsed.map.width}x${collapsed.map.height}, top ${expanded.map.y}, bottom ${expanded.map.bottom}, library ${expanded.library.width}px`);
    await page.screenshot({ path: join(screenshots, `collapsed-${width}.png`) });
    await page.getByRole('button', { name: '展開導覽', exact: true }).click();
    await page.waitForFunction(width => document.querySelector('.base-map-canvas').clientWidth === width, expanded.map.width);
    const mapBounds = await panel.locator('.base-map-canvas').boundingBox(), floatBounds = await panel.locator('.base-map-floating').boundingBox();
    assert.ok(floatBounds.x >= mapBounds.x && floatBounds.y >= mapBounds.y && floatBounds.x + floatBounds.width <= mapBounds.x + mapBounds.width + 1 && floatBounds.y + floatBounds.height <= mapBounds.y + mapBounds.height + 1, 'floating tools remain within resized map');
    const tabRows = await panel.getByRole('tab').evaluateAll(nodes => nodes.map(node => Math.round(node.getBoundingClientRect().y)));
    assert.equal(new Set(tabRows).size, 2);
    await selectAtomicTile(panel, template.content.componentDefinitions, 202);
    assert.equal(await panel.locator('.base-map-catalog-tabs').getByRole('tab', { name: '道路', exact: true }).getAttribute('aria-selected'), 'true');
    const roadCard = panel.getByLabel('道路圖塊 202', { exact: true }).locator('..');
    await roadCard.focus(); await page.keyboard.press('Enter'); await page.keyboard.press('Space');
    assert.equal(await panel.getByRole('button', { name: '保存', exact: true }).isEnabled(), true);
    await panel.getByRole('button', { name: '撤銷', exact: true }).click();
  }
  assert.equal(await panel.getByRole('button', { name: '鎖圖', exact: true }).getAttribute('aria-pressed'), 'false', 'pan-lock helper leaves the workspace unlocked');
  await page.screenshot({ path: join(screenshots, 'narrow.png') });
  console.log('Workspace screenshots: ' + screenshots);
  const savedTemplate = JSON.stringify(snapshot);
  role = 'author'; await page.reload();
  await page.locator('.current-game').getByRole('button', { name: '重新整理', exact: true }).click();
  await page.locator('.current-game .el-select').click();
  await page.getByRole('option', { name: '原子地圖', exact: true }).click();
  await page.locator('[data-view="mapview-editor"]').click();
  const gamePanel = page.locator('#game-map-editor');
  await page.getByText('已重新讀取遊戲地圖。', { exact: true }).waitFor();
  await page.waitForFunction(() => !document.querySelector('.map-status').textContent.includes('圖集載入中'));
  assert.equal(await page.locator('#menu [data-view="base-map-editor"]').count(), 0);
  const gameBeforeLock = JSON.stringify(game);
  await verifyCityGroupLibrary(page, gamePanel, game);
  await page.screenshot({ path: join(screenshots, 'city-groups-game-narrow.png') });
  await verifyMapPanLock(page, gamePanel);
  assert.equal(gameSaves, 0); assert.equal(JSON.stringify(game), gameBeforeLock);
  // Deterministic starting state for game placement (palette works in both modes).
  if (await gamePanel.getByRole('button', { name: '鎖圖', exact: true }).getAttribute('aria-pressed') === 'true') await gamePanel.getByRole('button', { name: '鎖圖', exact: true }).click();
  await dragAtomicTile(page, gamePanel, game.componentDefinitions, 0, 319, 1);
  await gamePanel.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByText('已保存並重新讀取遊戲地圖。', { exact: true }).waitFor();
  assert.equal(gameSaves, 1); assert.equal(game.map.decorations.at(-1).definitionRef, 'tile-0');
  assert.equal(await gamePanel.getByRole('button', { name: '鎖圖', exact: true }).getAttribute('aria-pressed'), 'false', 'game placement ran from the unlocked state');
  assert.deepEqual(game.mapEditorAssets, editorAssets, 'one edit retains all four seasonal atlases');
  assert.equal(await gamePanel.locator('.base-map-seasons').count(), 0);
  assert.ok(requestedSeasons.length >= 2);
  assert.deepEqual([...new Set(requestedSeasons)], ['spring'], 'template and game workspaces only load spring');
  assert.equal(JSON.stringify(snapshot), savedTemplate);
  await verifyCompactMapLayout(page, gamePanel);
  await page.locator('[data-view="draft-editor"]').click();
  assert.equal(await page.locator('.workbench.map-workspace').count(), 0, 'compact shell is map-only');
  assert.equal(await page.locator('.page-line').isVisible(), true);
  assert.deepEqual(await page.locator('.workbench-main').evaluate(node => { const css = getComputedStyle(node); return [css.paddingTop, css.paddingRight, css.paddingBottom]; }), ['16px', '24px', '16px']);
  assert.equal(await page.locator('.workbench-header').evaluate(node => node.getBoundingClientRect().height), 76);
  await page.waitForLoadState('networkidle');
  assert.deepEqual(errors, []); assert.deepEqual(failures, []); assert.deepEqual(unexpected, []);
  console.log(`PASS atomic workspace DPR${ratio}: 240 spring atlas cells plus four native-size readonly city groups, eight categories, no season/legacy-library/layer tabs, lazy scrolling, IDs, native pixels, sea base, pan-lock toggling and gesture cancellation, unlocked selection/zoom/editing, drag/keyboard/cancel/layer-lock/undo, JSON save/reread, old instances/groups unchanged, author isolation, four viewport sizes; in-memory API fixture.`);
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
