// Built editor + fresh browser context + real registered template/atlas.
// API transport is an isolated in-memory fixture, NOT production or auth evidence.
import assert from 'node:assert/strict';
import { selectMapLibraryTab } from './map_workspace_browser_helpers.mjs';
import spriteCatalog from '../editor-ui/src/mapspritecatalog.json' with { type: 'json' };
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
const deviceScaleFactor = Number(process.env.PLAYWRIGHT_DPR || 2);
assert.ok([1, 2].includes(deviceScaleFactor), 'PLAYWRIGHT_DPR must be 1 or 2');
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
const errors = [], unexpected = [], failures = [], apiRequests = [], templateWrites = [];
const gameIds = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
const { editorAssets, ...gameContent } = template.content;
const gameCopies = new Map(gameIds.map(gameId => [gameId, { ...structuredClone(gameContent), gameId, mapEditorAssets: structuredClone(editorAssets) }]));
let gameSaves = 0, acceptDialogs = true, dialogs = 0;
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  // Keep pixel comparisons on one raster backend: repeated getImageData can
  // otherwise make Chromium switch from GPU to CPU between season draws.
  browser = await chromium.launch({ headless: true, args: ['--disable-accelerated-2d-canvas'], executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor }), page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('requestfailed', request => failures.push(request.url()));
  page.on('request', request => { if (new URL(request.url()).pathname === '/mapview.js') errors.push('retired map viewer was bootstrapped'); });
  page.on('dialog', dialog => { dialogs++; return acceptDialogs ? dialog.accept() : dialog.dismiss(); });
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    apiRequests.push({ method: request.method(), path });
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
    if (path === '/api/admin/accounts') return route.fulfill({ json: { accounts: [] } });
    if (path === '/api/admin/copy/submissions') return route.fulfill({ json: { queue: [] } });
    if (/^\/api\/games\/[a-f0-9-]+\/copy\/submission$/.test(path)) return route.fulfill({ json: { gameId: path.split('/')[3], state: 'draft', copyDigest: null, validation: null, slot: null, version: null, nextVersion: '1.0', publishEnabled: false, blockedReason: '尚未檢驗' } });
    if (path === '/api/users') return route.fulfill({ json: { users: [] } });
    if (path === '/api/admin/base-map') { reads++; return route.fulfill({ json: { snapshot } }); }
    if (path === '/api/admin/base-map/initialize') {
      snapshot ??= { version: 1, digest: validateSystemBaseMap(template, sha).digest, template };
      return route.fulfill({ json: { snapshot } });
    }
    if (path === '/api/admin/base-map/save') {
      const next = structuredClone(snapshot.template), { edits } = request.postDataJSON();
      templateWrites.push(structuredClone(edits));
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
  const navigation = [
    ['copy', '新建遊戲'], ['draft-editor', '遊戲管理'], ['admin', '用戶管理'],
    ['catalog-editor', '系統資源'], ['stronghold-editor', '城池據點'],
    ['mapview-editor', '地圖管理'], ['generals-editor', '武將管理'],
    ['chapters-editor', '遊戲章節'], ['publish-editor', '上架管理'],
    ['management-editor', '上架審核'], ['copy-game-editor', '複製遊戲'], ['base-map-editor', '基礎地圖'],
  ];
  const adminViews = new Set(['admin', 'management-editor', 'copy-game-editor', 'base-map-editor']);
  async function verifyNavigation(isAdmin) {
    const allowed = navigation.filter(([id]) => isAdmin || !adminViews.has(id));
    assert.deepEqual(await page.locator('#menu [data-view]').evaluateAll(items => items.map(item => item.getAttribute('data-view'))), allowed.map(([id]) => id));
    const writesBefore = saves + gameSaves, requestStart = apiRequests.length;
    for (const collapsed of [false, true]) {
      if (collapsed) await page.getByRole('button', { name: '折疊導覽', exact: true }).click();
      for (const [id, label] of allowed) {
        const item = page.locator(`#menu [data-view="${id}"]`);
        await item.click();
        await page.waitForFunction(() => document.querySelector('.workbench').getAttribute('aria-busy') === 'false');
        assert.equal(await item.getAttribute('aria-label'), label);
        assert.equal(await item.getAttribute('aria-current'), 'page');
        assert.equal(await item.locator('svg').count(), 1, `${id} has an icon`);
        assert.equal(await page.locator('#menu .is-active').count(), 1);
        const panelId = { 'mapview-editor': 'game-map-editor', 'management-editor': 'review-editor' }[id] ?? id;
        await page.locator(`#${panelId}`).waitFor({ state: 'visible' });
        assert.equal(await page.locator('.page-heading h1').innerText(), label);
      }
    }
    await page.getByRole('button', { name: '展開導覽', exact: true }).click();
    assert.equal(saves + gameSaves, writesBefore, 'all navigation is non-saving');
    const navigationRequests = apiRequests.slice(requestStart);
    assert.ok(navigationRequests.every(request => request.method === 'GET'), 'navigation sends no mutations');
    if (!isAdmin) assert.ok(navigationRequests.every(request => !request.path.startsWith('/api/admin/')), 'author navigation never requests administrator APIs');
  }
  await verifyNavigation(true);
  const panel = page.locator('#base-map-editor');
  await panel.getByRole('button', { name: '首次建立', exact: true }).click();
  await panel.getByText('基礎地圖已建立。', { exact: true }).waitFor();
  await page.waitForFunction(() => !document.querySelector('#base-map-editor').textContent.includes('圖集載入中'));
  assert.equal(atlasReads, 1);
  const painted = await panel.locator('.base-map-canvas').evaluate(canvas => ({ width: canvas.width, height: canvas.height, nonempty: canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data.some((v, i) => i % 4 === 3 && v > 0) }));
  assert.ok(painted.width > 100 && painted.height > 100 && painted.nonempty, JSON.stringify(painted));
  await panel.getByRole('button', { name: '全圖', exact: true }).click();
  assert.equal(await panel.locator('.base-map-minimap').count(), 0, 'workspace no longer renders a minimap');
  const canvasHash = () => panel.locator('.base-map-canvas').evaluate(async canvas => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data)), byte => byte.toString(16).padStart(2, '0')).join('');
  });
  const toolbarLayout = await panel.locator('header.base-map-toolbar').evaluate(header => {
    const toolbar = header.getBoundingClientRect();
    return [...header.children].every(child => {
      const box = child.getBoundingClientRect();
      return box.top >= toolbar.top && box.bottom <= toolbar.bottom;
    });
  });
  assert.ok(toolbarLayout, 'toolbar controls stay in one row');
  assert.equal(await panel.locator('header .base-map-seasons').count(), 1, 'seasons share the toolbar');
  assert.equal(await panel.locator(':scope > .base-map-message').count(), 0, 'status does not reserve a separate row');
  const springHash = await canvasHash();
  assert.equal(await panel.locator('.base-map-library-tabs').getByRole('tab', { name: '分類樣板', exact: true }).getAttribute('aria-selected'), 'true');
  assert.equal(await panel.locator('.base-map-list').count(), 0, 'default catalog does not mix in historical slice tables');
  const sampleAlbum = panel.getByRole('list', { name: '分類樣板相冊' });
  const sampleTabs = panel.locator('.base-map-catalog-tabs');
  assert.equal(await sampleTabs.getByRole('tab').count(), 7);
  const sampleItems = [...spriteCatalog.items, ...spriteCatalog.components, ...spriteCatalog.recipes];
  const shoreSamples = sampleItems.filter(item => item.itemId.startsWith('shore-'));
  assert.equal(shoreSamples.length, 7);
  assert.ok(shoreSamples.every(item => item.category === 'ground' && item.support === 'reference-only'),
    'design §6.2 coast cards belong to ground, without acquiring placement');
  assert.equal(sampleItems.filter(item => item.category === 'ground').length, 55);
  const orderedSamples = ['ground', 'mountain', 'water', 'field', 'wall', 'road', 'city'].flatMap(category => sampleItems.filter(item => item.category === category));
  assert.equal(orderedSamples.length, 188);
  for (const item of orderedSamples) {
    const { name } = item, label = spriteCatalog.categories.find(category => category.id === item.category).name;
    const canPlace = item.support === 'existing-decoration', classmates = sampleItems.filter(other => other.category === item.category);
    const width = (Math.max(...item.footprint.map(([x]) => x)) + 1) * 16;
    const height = (Math.max(...item.footprint.map(([, y]) => y)) + 1) * 16;
    for (let step = 0; step < 7 && await sampleTabs.getByRole('tab', { name: label, exact: true }).getAttribute('aria-selected') !== 'true'; step++) {
      await sampleTabs.getByRole('tab', { selected: true }).press('ArrowRight');
    }
    assert.equal(await sampleTabs.getByRole('tab', { name: label, exact: true }).getAttribute('aria-selected'), 'true');
    const samplePage = Math.floor(classmates.findIndex(other => other.itemId === item.itemId) / 25) + 1;
    const sampleJump = panel.locator('.el-pagination__jump input');
    if (await sampleJump.inputValue() !== String(samplePage)) {
      await sampleJump.fill(String(samplePage)); await sampleJump.press('Enter');
    }
    const pageItems = classmates.slice((samplePage - 1) * 25, samplePage * 25);
    assert.deepEqual(await sampleAlbum.locator('canvas').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label'))),
      pageItems.map(row => row.name), 'only the current classification page mounts previews; no omissions or appended old page');
    const pixels = await sampleAlbum.getByLabel(name, { exact: true }).evaluate(canvas => ({ width: canvas.clientWidth, height: canvas.clientHeight, backing: canvas.width, backingHeight: canvas.height, ratio: devicePixelRatio }));
    assert.deepEqual(pixels, { width, height, backing: width * pixels.ratio, backingHeight: height * pixels.ratio, ratio: pixels.ratio });
    const alphas = await sampleAlbum.getByLabel(name, { exact: true }).evaluate(canvas => {
      const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height), cellSize = 16 * devicePixelRatio;
      return Array.from({ length: canvas.height / cellSize }, (_, y) => Array.from({ length: canvas.width / cellSize }, (_, x) => {
        let min = 255, max = 0;
        for (let py = y * cellSize; py < (y + 1) * cellSize; py++) for (let px = x * cellSize; px < (x + 1) * cellSize; px++) {
          const alpha = data[(py * canvas.width + px) * 4 + 3]; min = Math.min(min, alpha); max = Math.max(max, alpha);
        }
        return [min, max];
      }));
    });
    assert.deepEqual(alphas, Array.from({ length: height / 16 }, (_, y) => Array.from({ length: width / 16 }, (_, x) =>
      item.footprint.some(([dx, dy]) => dx === x && dy === y) ? [255, 255] : [0, 0])), 'whole missing cells stay transparent, not a black RGB hash carrier');
    assert.equal(await sampleAlbum.getByRole('button').count(), pageItems.filter(other => other.support === 'existing-decoration').length);
    const card = sampleAlbum.locator(canPlace ? '.base-map-material-preview' : '.base-map-atom-preview').filter({ has: page.getByLabel(name, { exact: true }) });
    await card.focus(); await card.press('Enter');
    if (['field-corner-nw-v1', 'ground-texture-0-v1', 'wall-end-2-v1', 'wall-turn-2-v1', 'mountain-step-up-3-v1', 'mountain-step-down-3-v1', 'field-grid-181-v1', 'ground-cluster-182-v1', 'ground-cluster-183-v1'].includes(item.itemId) || item.itemId.startsWith('mountain-slope-')) {
      await page.keyboard.press('Enter');
      assert.equal(await panel.getByRole('button', { name: '保存', exact: true }).isEnabled(), true);
      await panel.getByRole('button', { name: '撤銷上一步', exact: true }).click();
      assert.equal(saves, 0, 'hollow-anchor, byte-zero, wall-end/turn, mountain-step/slope and G07 samples stage once and never save implicitly');
    } else if (canPlace) await page.keyboard.press('Escape');
    else {
      await card.press('Space'); await card.click();
      const bounds = await card.boundingBox(), mapBounds = await panel.locator('.base-map-canvas').boundingBox();
      await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      await page.mouse.down(); await page.mouse.move(mapBounds.x + 40, mapBounds.y + 40); await page.mouse.up();
      await panel.locator('.base-map-canvas').focus(); await page.keyboard.press('Enter');
      if (['road', 'city'].includes(item.category)) assert.ok((await card.getAttribute('aria-label')).includes('不可新建'));
      if (item.itemId === 'ground-mottle-29-v1' || item.itemId.startsWith('ground-crown-')) assert.ok((await card.getAttribute('aria-label')).includes('地表外觀參考；地理作用域未確認'));
    }
    assert.equal(await panel.getByRole('button', { name: '保存', exact: true }).isEnabled(), false);
    assert.equal(await canvasHash(), springHash);
  }
  await sampleTabs.getByRole('tab', { selected: true }).press('ArrowRight');
  // City and ground now both span two pages; switching categories may retain
  // page 2. Select the target's actual page rather than assuming a page reset.
  const groundJump = panel.locator('.el-pagination__jump input');
  await groundJump.fill('1'); await groundJump.press('Enter');
  await sampleAlbum.getByRole('button').filter({ has: page.getByLabel('地表碎點單格樣板', { exact: true }) }).focus();
  await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
  assert.equal(await panel.getByRole('button', { name: '保存', exact: true }).isEnabled(), true);
  assert.equal(saves, 0, 'ground texture is an explicit staged decoration, not an implicit base rewrite');
  await panel.getByRole('button', { name: '撤銷上一步', exact: true }).click();
  assert.equal(await canvasHash(), springHash, 'one undo restores the ground decoration placement');
  assert.equal(await panel.getByRole('button', { name: '保存', exact: true }).isEnabled(), false);
  await sampleTabs.getByRole('tab', { selected: true }).press('ArrowRight');
  const stripPage = Math.floor(sampleItems.filter(item => item.category === 'mountain')
    .findIndex(item => item.itemId === 'mountain-strip-4-v1') / 25) + 1;
  await groundJump.fill(String(stripPage)); await groundJump.press('Enter');
  await sampleAlbum.getByRole('button').filter({ has: page.getByLabel('山紋橫向四格樣板', { exact: true }) }).focus(); await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
  assert.equal(await panel.getByRole('button', { name: '保存', exact: true }).isEnabled(), true);
  assert.equal(saves, 0, 'catalog stages the existing command without saving');
  await panel.getByRole('button', { name: '撤銷上一步', exact: true }).click();
  assert.equal(await panel.getByRole('button', { name: '保存', exact: true }).isEnabled(), false);
  assert.equal(await canvasHash(), springHash, 'one undo reverses the complete multi-cell sample placement');
  const atomDefinitions = Object.values(template.content.componentDefinitions).filter(definition => /^tile-\d+$/.test(definition.id));
  assert.deepEqual(atomDefinitions.map(definition => definition.id), Array.from({ length: 256 }, (_, byte) => `tile-${byte}`));
  assert.ok(template.content.componentDefinitions['deco-grass'], 'legacy atomic-category alias remains in the compatibility library, not the canonical byte album');
  await selectMapLibraryTab(panel, '原始圖塊（高級）');
  const atomAlbum = panel.getByRole('list', { name: '原始圖塊參考相冊' });
  assert.equal(await atomAlbum.getByRole('button').count(), 0, 'raw references do not advertise placement');
  assert.equal(await panel.locator('[aria-label="原始圖塊辨識摘要"]').innerText(),
    '全部256槽 · 分類樣板引用79 · 只讀樣板引用162 · 基底預設1 · 高級保留14 · 待辨識0');
  const seenAtoms = [];
  for (let atomPage = 1; atomPage <= Math.ceil(atomDefinitions.length / 25); atomPage++) {
    const atomJump = panel.locator('.el-pagination__jump input');
    await atomJump.fill(String(atomPage));
    await atomJump.press('Enter');
    const atoms = await atomAlbum.locator('canvas').evaluateAll(canvases => canvases.map(canvas => ({
      name: canvas.getAttribute('aria-label'), status: canvas.parentElement.getAttribute('aria-label'), width: canvas.clientWidth, height: canvas.clientHeight,
      backingWidth: canvas.width, backingHeight: canvas.height, ratio: devicePixelRatio,
    })));
    assert.equal(atoms.length, Math.min(25, atomDefinitions.length - (atomPage - 1) * 25));
    atoms.forEach(atom => {
      assert.equal(atom.width, 16); assert.equal(atom.height, 16);
      assert.equal(atom.backingWidth, 16 * atom.ratio); assert.equal(atom.backingHeight, 16 * atom.ratio);
      const byte = seenAtoms.length;
      let expectedStatus = '待辨識';
      if (byte === 95) expectedStatus = '基底預設';
      else if ([72, 190, 222, 230, 232, 233, 234, 235, 236, 237, 238, 239, 240, 241].includes(byte)) expectedStatus = '高級保留';
      else if ([...Array.from({ length: 109 }, (_, i) => i + 3).filter(byte => ![16, 17, 18, 20, 72, 95].includes(byte)), 168, 176, 177, 178, 179, 184, 185, 186, 187, 188, 189, 191, 192, 193, 194, 195, 196, 197, 198, 199, 200, 201, 202, 203, 204, 205, 206, 207, 208, 209, 210, 211, 212, 213, 214, 215, 216, 217, 218, 219, 220, 221, 224, 225, 226, 227, 228, 229, 242, 243, 244, 245, 246, 247, 251, 252, 253, 254, 255].includes(byte)) expectedStatus = '只讀樣板引用';
      else if ([0, 1, 2, 16, 17, 18, 20, ...Array.from({ length: 64 }, (_, i) => 112 + i).filter(tile => tile !== 168), 180, 181, 182, 183, 223, 231, 248, 249, 250].includes(byte)) expectedStatus = '分類樣板引用';
      assert.ok(atom.status.includes(expectedStatus), `byte ${byte} exposes its actual inventory disposition`);
      seenAtoms.push(atom.name);
    });
    for (const tile of [72, 190, 222, 230, 232, 233, 234, 235, 236, 237, 238, 239, 240, 241].filter(tile => tile >= (atomPage - 1) * 25 && tile < seenAtoms.length)) {
      const retained = atomAlbum.locator('.base-map-atom-preview').nth(tile - (atomPage - 1) * 25);
      assert.ok((await retained.getAttribute('aria-label')).includes(tile < 222 ? '原機制用途仍未知' : '原8AD1城角兩色族'));
      await retained.focus(); await retained.press('Enter'); await retained.press('Space'); await retained.click();
      const box = await retained.boundingBox(), mapBox = await panel.locator('.base-map-canvas').boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down(); await page.mouse.move(mapBox.x + 40, mapBox.y + 40); await page.mouse.up();
      await panel.locator('.base-map-canvas').focus(); await page.keyboard.press('Enter');
      assert.equal(await canvasHash(), springHash, 'advanced retention cannot start placement, including a drag onto the map');
      assert.equal(await panel.getByRole('button', { name: '保存', exact: true }).isEnabled(), false);
      assert.equal(saves, 0);
    }
  }
  assert.deepEqual(seenAtoms, atomDefinitions.map(definition => definition.name || definition.id), 'all raw identities remain separately browsable, including visual duplicates and unused bytes');
  const atomReference = atomAlbum.locator('.base-map-atom-preview').first();
  await atomReference.focus();
  await atomReference.press('Enter');
  await atomReference.press('Space');
  await atomReference.click();
  await panel.locator('.base-map-canvas').focus();
  await panel.locator('.base-map-canvas').press('Enter');
  assert.equal(await canvasHash(), springHash, 'reference activation does not stage or preview placement');
  assert.equal(await panel.getByRole('button', { name: '保存', exact: true }).isEnabled(), false);
  assert.equal(saves, 0);
  await selectMapLibraryTab(panel, '原始／歷史素材');
  const previewSizes = await panel.locator('.base-map-material-preview canvas').evaluateAll(canvases => canvases.map(canvas => ({
    width: canvas.getBoundingClientRect().width, height: canvas.getBoundingClientRect().height,
    backingWidth: canvas.width, backingHeight: canvas.height, ratio: devicePixelRatio,
  })));
  assert.equal(previewSizes.length, 25, 'only the current material page mounts previews');
  Object.values(template.content.componentDefinitions).slice(0, 25).forEach((definition, index) => {
    const tiles = Object.values(definition.variants)[0].tiles;
    const xs = tiles.map(([x]) => x), ys = tiles.map(([, y]) => y);
    const width = (Math.max(...xs) - Math.min(...xs) + 1) * 16;
    const height = (Math.max(...ys) - Math.min(...ys) + 1) * 16;
    const actual = previewSizes[index];
    assert.deepEqual(actual, { width, height, backingWidth: Math.round(width * actual.ratio), backingHeight: Math.round(height * actual.ratio), ratio: actual.ratio });
  });
  const wideIndex = Object.values(template.content.componentDefinitions).findIndex(definition => {
    const xs = Object.values(definition.variants)[0].tiles.map(([x]) => x);
    return Math.max(...xs) - Math.min(...xs) >= 4;
  });
  assert.ok(wideIndex >= 0, 'registered source contains a preview wider than 64 CSS pixels');
  const jumper = panel.locator('.el-pagination__jump input');
  await jumper.fill(String(Math.floor(wideIndex / 25) + 1));
  await jumper.press('Enter');
  const widePreview = panel.locator('.base-map-material-preview').nth(wideIndex % 25);
  await widePreview.scrollIntoViewIfNeeded();
  await widePreview.focus();
  await Promise.all([
    widePreview.evaluate(element => new Promise(resolve => element.addEventListener('scrollend', resolve, { once: true }))),
    widePreview.press('ArrowRight'),
  ]);
  const wideBefore = await widePreview.evaluate(element => ({
    left: element.scrollLeft, width: element.scrollWidth, viewport: element.clientWidth,
    canvasWidth: element.querySelector('canvas').getBoundingClientRect().width,
  }));
  assert.ok(wideBefore.left > 0, 'keyboard scroll reveals the wide preview');
  assert.ok(wideBefore.width > wideBefore.viewport, 'wide original pixels overflow instead of shrinking');
  assert.equal(wideBefore.canvasWidth, wideBefore.width);
  const previewRequests = { reads, saves };
  for (const name of ['夏', '秋', '冬', '春']) {
    await panel.getByRole('tab', { name, exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('#base-map-editor').textContent.includes('圖集載入中'));
    assert.deepEqual(await widePreview.evaluate(element => ({
      left: element.scrollLeft, width: element.scrollWidth, viewport: element.clientWidth,
      canvasWidth: element.querySelector('canvas').getBoundingClientRect().width,
    })), wideBefore, 'season redraw preserves native size and preview scroll');
    if (name === '春') assert.equal(await canvasHash(), springHash);
    else assert.notEqual(await canvasHash(), springHash);
  }
  assert.deepEqual({ reads, saves }, previewRequests, 'preview paging, scrolling and seasons do not reload or save content');
  await jumper.fill('1');
  await jumper.press('Enter');
  assert.equal(await panel.locator('.base-map-material-preview canvas').count(), 25);
  assert.equal(saves, 0, 'season tabs do not save layout');
  assert.equal(await panel.getByRole('button', { name: '保存', exact: true }).isEnabled(), false);
  await page.getByRole('button', { name: '折疊導覽', exact: true }).click();
  assert.equal(await page.locator('#menu').evaluate(el => el.clientWidth), 64);
  await page.getByRole('button', { name: '展開導覽', exact: true }).click();
  await panel.getByRole('button', { name: '全圖', exact: true }).click();
  const dragSource = panel.locator('.base-map-material-preview').first();
  const dragCanvas = panel.locator('.base-map-canvas');
  const dragRequests = { reads, saves };
  const beforeDragPixels = await canvasHash();
  async function startMaterialDrag() {
    await dragSource.scrollIntoViewIfNeeded();
    const sourceBox = await dragSource.boundingBox(), targetBox = await dragCanvas.boundingBox();
    await page.mouse.move(sourceBox.x + 8, sourceBox.y + 8);
    await page.mouse.down();
    await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 8 });
    assert.equal(await panel.getByRole('button', { name: '保存', exact: true }).isEnabled(), false, 'pointer preview alone does not edit');
    assert.notEqual(await canvasHash(), beforeDragPixels, 'captured drag renders a visible preview');
  }
  await startMaterialDrag();
  await page.keyboard.press('Escape');
  await page.mouse.up();
  assert.equal(await panel.getByRole('button', { name: '保存', exact: true }).isEnabled(), false, 'Escape cancels a captured drag');
  assert.equal(await canvasHash(), beforeDragPixels, 'Escape removes all preview pixels');
  await startMaterialDrag();
  await page.mouse.move(1, 1);
  await page.mouse.up();
  assert.equal(await panel.getByRole('button', { name: '保存', exact: true }).isEnabled(), false, 'release outside the canvas cancels');
  assert.equal(await canvasHash(), beforeDragPixels, 'outside release leaves no ghost texture');
  await dragSource.evaluate(element => {
    element.addEventListener('gotpointercapture', event => { element.dataset.testCapturedPointer = String(event.pointerId); }, { once: true });
  });
  await startMaterialDrag();
  assert.equal(await dragSource.evaluate(element => element.hasPointerCapture(Number(element.dataset.testCapturedPointer))), true, 'the source owns native pointer capture during dragging');
  await dragSource.evaluate(element => element.releasePointerCapture(Number(element.dataset.testCapturedPointer)));
  // Native capture changes are dispatched at the next pointer event, not by a synthetic lost event.
  const captureTarget = await dragCanvas.boundingBox();
  await page.mouse.move(captureTarget.x + captureTarget.width / 2 + 1, captureTarget.y + captureTarget.height / 2);
  assert.equal(await dragSource.evaluate(element => element.hasPointerCapture(Number(element.dataset.testCapturedPointer))), false);
  assert.equal(await canvasHash(), beforeDragPixels, 'native capture loss clears the entire preview');
  await page.mouse.up();
  assert.equal(await panel.getByRole('button', { name: '保存', exact: true }).isEnabled(), false, 'release after capture loss cannot replay placement');
  await dragSource.evaluate(element => { delete element.dataset.testCapturedPointer; });
  await startMaterialDrag();
  await page.mouse.up();
  assert.equal(await panel.getByRole('button', { name: '保存', exact: true }).isEnabled(), true, `release on the canvas stages placement: ${await page.locator('#status').textContent()}`);
  await panel.getByRole('button', { name: '撤銷上一步', exact: true }).click();
  assert.equal(await panel.getByRole('button', { name: '保存', exact: true }).isEnabled(), false, 'one undo removes the whole drag operation');
  assert.deepEqual({ reads, saves }, dragRequests, 'drag and undo do not persist or reload');
  const beforeKeyboardPixels = await canvasHash();
  await dragSource.focus();
  await page.keyboard.press('Enter');
  assert.equal(await dragCanvas.evaluate(element => document.activeElement === element), true, 'keyboard selection transfers focus to the map');
  const keyboardCenterPixels = await canvasHash();
  assert.notEqual(keyboardCenterPixels, beforeKeyboardPixels);
  await page.keyboard.press('ArrowRight');
  assert.notEqual(await canvasHash(), keyboardCenterPixels, 'arrow key moves the ghost by one map cell');
  await page.keyboard.press('ArrowLeft');
  assert.equal(await canvasHash(), keyboardCenterPixels, 'opposite keys restore the snapped preview');
  await page.keyboard.press('Escape');
  assert.equal(await canvasHash(), beforeKeyboardPixels);
  assert.equal(await dragSource.evaluate(element => document.activeElement === element), true, 'Escape returns focus to the material');
  await page.keyboard.press('Space');
  await page.keyboard.press('Tab');
  assert.equal(await canvasHash(), beforeKeyboardPixels, 'leaving map focus cancels without editing');
  assert.equal(await panel.getByRole('button', { name: '保存', exact: true }).isEnabled(), false);
  await dragSource.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.down('Enter');
  await page.keyboard.down('Enter');
  await page.keyboard.down('Enter');
  await page.keyboard.up('Enter');
  assert.equal(await panel.getByRole('button', { name: '保存', exact: true }).isEnabled(), true, 'keyboard confirmation stages placement');
  assert.equal(await dragSource.evaluate(element => document.activeElement === element), true, 'held confirmation does not restart placement after returning focus');
  await panel.getByRole('button', { name: '撤銷上一步', exact: true }).click();
  assert.equal(await panel.getByRole('button', { name: '保存', exact: true }).isEnabled(), false, 'keyboard placement is one undo operation');
  assert.deepEqual({ reads, saves }, dragRequests, 'keyboard preview, cancellation and undo do not persist');
  for (const mode of ['pointer', 'keyboard']) {
    if (mode === 'pointer') await startMaterialDrag();
    else { await dragSource.focus(); await page.keyboard.press('Enter'); }
    const oldWidth = await dragCanvas.evaluate(element => element.clientWidth);
    await page.setViewportSize({ width: 1500, height: 1000 });
    await page.waitForFunction(width => document.querySelector('#base-map-editor .base-map-canvas').clientWidth !== width, oldWidth);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    if (mode === 'pointer') await page.mouse.up();
    else await page.keyboard.press('Enter');
    assert.equal(await panel.getByRole('button', { name: '保存', exact: true }).isEnabled(), false, `${mode} preview is cancelled by viewport resize`);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.waitForFunction(width => document.querySelector('#base-map-editor .base-map-canvas').clientWidth === width, oldWidth);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await panel.getByRole('button', { name: '全圖', exact: true }).click();
    assert.equal(await canvasHash(), beforeDragPixels, `${mode} resize cancellation leaves no ghost`);
  }
  assert.deepEqual({ reads, saves }, dragRequests, 'resize cancellation does not persist or reload');
  const touchSession = await context.newCDPSession(page);
  await touchSession.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  for (const cancel of [true, false]) {
    await dragSource.scrollIntoViewIfNeeded();
    const origin = await dragSource.boundingBox(), destination = await dragCanvas.boundingBox();
    assert.ok(origin && destination);
    const start = { x: origin.x + 8, y: origin.y + 8 };
    const end = { x: destination.x + destination.width / 2, y: destination.y + destination.height / 2 };
    await touchSession.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, id: 1 }] });
    for (let step = 1; step <= 8; step++) await touchSession.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start.x + (end.x - start.x) * step / 8, y: start.y + (end.y - start.y) * step / 8, id: 1 }] });
    assert.equal(await panel.getByRole('button', { name: '保存', exact: true }).isEnabled(), false, 'touch preview alone does not edit');
    assert.notEqual(await canvasHash(), beforeDragPixels, 'touch movement preserves captured placement preview');
    await touchSession.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] });
    assert.equal(await panel.getByRole('button', { name: '保存', exact: true }).isEnabled(), !cancel, 'touch release stages once, touch cancellation does not stage');
    if (!cancel) await panel.getByRole('button', { name: '撤銷上一步', exact: true }).click();
    assert.equal(await panel.getByRole('button', { name: '保存', exact: true }).isEnabled(), false);
    assert.equal(await canvasHash(), beforeDragPixels, 'touch cancellation or undo restores pixels');
  }
  await touchSession.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await touchSession.detach();
  assert.deepEqual({ reads, saves }, dragRequests, 'touch preview, cancellation and undo do not persist');
  const originalWater = template.content.map.waterGroups[0].showOnMinimap;
  await selectMapLibraryTab(panel, '水域與小地圖');
  await panel.getByRole('button', { name: /從小地圖隱藏|顯示於小地圖/ }).first().click();
  assert.equal(await panel.getByRole('button', { name: '保存', exact: true }).isEnabled(), true);
  await panel.getByRole('button', { name: '撤銷上一步', exact: true }).click();
  assert.equal(await panel.getByRole('button', { name: '保存', exact: true }).isEnabled(), false);
  await panel.getByRole('button', { name: /從小地圖隱藏|顯示於小地圖/ }).first().click();
  await panel.getByRole('button', { name: '保存', exact: true }).click();
  await panel.getByText('已保存並重新讀取基礎地圖。', { exact: true }).waitFor();
  assert.equal(snapshot.template.content.map.waterGroups[0].showOnMinimap, !originalWater, 'compiler minimap preference persists despite removal of workspace preview');
  assert.equal(saves, 1); assert.equal(snapshot.version, 2); assert.ok(reads >= 3); assert.equal(atlasReads, 5);
  await selectMapLibraryTab(panel, 'Web 編輯組合');
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
    const size = await mainCanvas.evaluate(canvas => ({ width: canvas.clientWidth, height: canvas.clientHeight }));
    const view = fitViewport(size, { width: 384 * 16, height: 256 * 16 });
    const [dx, dy] = definition.footprint[0];
    const [x, y] = worldToScreen(view, (inspectPiece.x + dx - definition.anchor[0] + 0.5) * 16, (inspectPiece.y + dy - definition.anchor[1] + 0.5) * 16);
    await mainCanvas.click({ position: { x, y } });
  }
  await pickPiece();
  await panel.getByText(`${definition.footprint.length} 格 · 可拆編輯片段`, { exact: true }).waitFor();
  assert.equal(await panel.locator('.base-map-inspector > strong').textContent(), '裝飾片段');
  assert.equal(await panel.locator('.base-map-selection-details').count(), 0, 'internal identifiers are hidden by default');
  const beforeDetails = { reads, saves };
  await panel.getByRole('button', { name: '查看識別資料', exact: true }).click();
  assert.ok((await panel.locator('.base-map-selection-details').textContent()).includes(inspectPiece.id));
  await panel.getByRole('button', { name: '放大', exact: true }).click();
  assert.equal(await panel.locator('.base-map-selection-details').count(), 1, 'view changes retain open details');
  assert.deepEqual({ reads, saves }, beforeDetails, 'details and zoom do not read or save content');
  const decorLayer = panel.locator('.base-map-layer').filter({ hasText: '裝飾' });
  await decorLayer.getByRole('button', { name: '鎖定裝飾', exact: true }).click();
  await pickPiece(); await panel.getByText('基底格', { exact: true }).waitFor();
  assert.equal(await panel.locator('.base-map-selection-details').count(), 0, 'changing selection closes identifiers');
  assert.equal(await panel.getByRole('button', { name: '拆分', exact: true }).count(), 0);
  await selectMapLibraryTab(panel, '原始／歷史素材');
  const placementButtons = panel.getByRole('button', { name: '放置', exact: true });
  assert.equal(await placementButtons.count(), 25);
  assert.equal(await placementButtons.first().isEnabled(), false, 'a selected base cell does not bypass the decoration lock');
  assert.equal(await placementButtons.first().getAttribute('title'), '請先解鎖裝飾層');
  const lockedMaterial = panel.locator('.base-map-material-preview').first();
  await lockedMaterial.focus();
  await page.keyboard.press('Enter');
  assert.equal(await lockedMaterial.evaluate(element => document.activeElement === element), true, 'keyboard selection cannot bypass a locked decoration layer');
  assert.equal(await panel.getByRole('button', { name: '保存', exact: true }).isEnabled(), false);
  const beforePlacementUnlock = { reads, saves };
  await decorLayer.getByRole('button', { name: '解鎖裝飾', exact: true }).click();
  assert.equal(await placementButtons.first().isEnabled(), false, 'unlock clears selection; placement still needs a target');
  await pickPiece();
  assert.equal(await placementButtons.first().isEnabled(), true, 'an unlocked layer and a selected target enable the existing placement command');
  assert.deepEqual({ reads, saves }, beforePlacementUnlock, 'lock and target controls do not persist');
  await decorLayer.getByRole('button', { name: '隱藏裝飾', exact: true }).click();
  await pickPiece(); await panel.getByText('基底格', { exact: true }).waitFor();
  await decorLayer.getByRole('button', { name: '顯示裝飾', exact: true }).click();
  await pickPiece(); await panel.getByRole('button', { name: '拆分', exact: true }).click();
  await panel.getByRole('button', { name: '撤銷上一步', exact: true }).click();
  await pickPiece(); await panel.getByRole('button', { name: '刪除', exact: true }).click();
  await selectMapLibraryTab(panel, `問題定位（${definition.footprint.length}）`);
  await panel.getByRole('button', { name: '定位基底格', exact: true }).first().click();
  await panel.getByText('待補基底格', { exact: true }).waitFor();
  await panel.getByRole('button', { name: '填入此基底格', exact: true }).click();
  await panel.getByRole('button', { name: '撤銷上一步', exact: true }).click();
  await panel.getByRole('button', { name: '撤銷上一步', exact: true }).click();
  assert.equal(await panel.getByRole('button', { name: '保存', exact: true }).isEnabled(), false);
  assert.equal(saves, 1, 'hit testing, display controls and undone edits do not persist');
  await selectMapLibraryTab(panel, 'Web 編輯組合');
  const captureIndex = template.content.selectionGroups.slice(0, 25).findIndex(group => group.members.every(member => member.layer === 'decorations') && group.members.reduce((count, member) => {
    const instance = template.content.map.decorations.find(row => row.id === member.id);
    return count + template.content.componentDefinitions[instance.definitionRef].footprint.length;
  }, 0) <= 256);
  assert.ok(captureIndex >= 0, 'registered first page contains a capturable Web fragment group');
  await panel.getByRole('button', { name: '選取組合', exact: true }).nth(captureIndex).click();
  await panel.getByRole('textbox', { name: '新素材名稱', exact: true }).fill('瀏覽器擷取素材');
  const preparedRequests = { reads, saves };
  for (const season of ['冬', '春']) {
    await panel.getByRole('tab', { name: season, exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('#base-map-editor').textContent.includes('圖集載入中'));
    assert.equal(await panel.getByRole('textbox', { name: '新素材名稱', exact: true }).inputValue(), '瀏覽器擷取素材', 'seasons retain capture preparation');
  }
  assert.deepEqual({ reads, saves }, preparedRequests, 'season changes do not submit prepared material');
  await page.setViewportSize({ width: 900, height: 700 });
  await panel.getByRole('tab', { name: '圖層／屬性', exact: true }).click();
  assert.equal(await panel.getByRole('textbox', { name: '新素材名稱', exact: true }).inputValue(), '瀏覽器擷取素材');
  await panel.getByRole('tab', { name: '素材／管理', exact: true }).click();
  await panel.getByRole('tab', { name: '圖層／屬性', exact: true }).click();
  assert.equal(await panel.getByRole('textbox', { name: '新素材名稱', exact: true }).inputValue(), '瀏覽器擷取素材', 'tool switching retains local input');
  await panel.getByRole('tab', { name: '素材／管理', exact: true }).click();
  await page.setViewportSize({ width: 1600, height: 1000 });
  await panel.getByRole('button', { name: '擷取為素材', exact: true }).click();
  await panel.getByRole('button', { name: '保存', exact: true }).click();
  await panel.getByText('已保存並重新讀取基礎地圖。', { exact: true }).waitFor();
  assert.equal(saves, 2);
  assert.ok(Object.values(snapshot.template.content.componentDefinitions).some(def => def.name === '瀏覽器擷取素材'));
  const beforeMyMaterials = { reads, saves, source: JSON.stringify(snapshot.template.content) };
  await selectMapLibraryTab(panel, '我的素材');
  assert.equal(await panel.locator('.base-map-material-preview').count(), 1, 'my materials excludes all registered atoms and historical fragments');
  await panel.getByRole('list', { name: '我的素材相冊', exact: true }).waitFor();
  assert.equal(await panel.locator('.base-map-list').count(), 0, 'album does not mount the management table');
  assert.equal(await panel.getByRole('button', { name: '放置', exact: true }).count(), 0, 'album has no permanent placement buttons');
  assert.equal(await panel.getByText('瀏覽器擷取素材', { exact: true }).count(), 0, 'album names are available through accessible labels and hover, not permanent captions');
  const capturedPreview = panel.getByRole('button', { name: '瀏覽器擷取素材；拖至地圖或按Enter／空白鍵開始放置', exact: true });
  await capturedPreview.focus();
  await page.getByRole('tooltip').filter({ hasText: '瀏覽器擷取素材' }).waitFor({ state: 'visible' });
  await page.keyboard.press('Enter');
  await panel.getByRole('button', { name: '管理素材', exact: true }).click();
  await page.keyboard.press('Enter');
  assert.equal(await panel.getByRole('button', { name: '保存', exact: true }).isEnabled(), false, 'changing album view cancels a pending placement');
  // Enter toggles the focused view button back to the album; reopen management explicitly.
  await panel.getByRole('button', { name: '管理素材', exact: true }).click();
  assert.equal(await panel.getByRole('list', { name: '我的素材相冊', exact: true }).count(), 0);
  await panel.getByText('瀏覽器擷取素材', { exact: true }).waitFor();
  assert.equal(await panel.getByRole('button', { name: '編輯', exact: true }).count(), 1);
  assert.equal(await panel.getByRole('button', { name: '刪除素材', exact: true }).isEnabled(), true, 'unused captured material retains its original removal capability');
  await panel.getByRole('button', { name: '編輯', exact: true }).click();
  await panel.getByRole('textbox', { name: '素材名稱', exact: true }).fill('尚未保存的名稱');
  await panel.getByRole('button', { name: '素材相冊', exact: true }).click();
  await page.setViewportSize({ width: 900, height: 700 });
  await page.waitForFunction(() => document.documentElement.scrollHeight <= innerHeight + 1 && document.documentElement.scrollWidth <= innerWidth + 1);
  await panel.getByRole('list', { name: '我的素材相冊', exact: true }).waitFor();
  await panel.getByRole('button', { name: '管理素材', exact: true }).click();
  assert.equal(await panel.getByRole('textbox', { name: '素材名稱', exact: true }).inputValue(), '尚未保存的名稱', 'album and responsive layout changes retain unfinished management input');
  await page.setViewportSize({ width: 1600, height: 1000 });
  await panel.getByRole('button', { name: '取消', exact: true }).click();
  await panel.getByText('瀏覽器擷取素材', { exact: true }).waitFor();
  assert.deepEqual({ reads, saves, source: JSON.stringify(snapshot.template.content) }, beforeMyMaterials, 'filtering and cancelling rename neither mutate source nor call the API');
  assert.equal(await panel.getByRole('button', { name: '保存', exact: true }).isEnabled(), false);
  await panel.getByRole('button', { name: '素材相冊', exact: true }).click();
  const beforeTabPreview = await canvasHash();
  await capturedPreview.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowRight');
  await selectMapLibraryTab(panel, '水域與小地圖');
  await mainCanvas.focus();
  await page.keyboard.press('Enter');
  assert.equal(await panel.getByRole('button', { name: '保存', exact: true }).isEnabled(), false, 'library tab navigation cancels placement before confirmation');
  assert.equal(await canvasHash(), beforeTabPreview, 'library tab navigation removes the preview without changing map pixels');
  await selectMapLibraryTab(panel, '我的素材');
  const albumPixels = await panel.locator('.base-map-material-preview canvas').evaluate(canvas => ({ width: canvas.clientWidth, height: canvas.clientHeight, backingWidth: canvas.width, backingHeight: canvas.height, ratio: devicePixelRatio }));
  const capturedDefinition = Object.values(snapshot.template.content.componentDefinitions).find(def => def.name === '瀏覽器擷取素材');
  const capturedTiles = Object.values(capturedDefinition.variants)[0].tiles;
  assert.equal(albumPixels.width, (Math.max(...capturedTiles.map(([x]) => x)) - Math.min(...capturedTiles.map(([x]) => x)) + 1) * 16, 'album uses native CSS pixels, not a scaled thumbnail');
  assert.equal(albumPixels.height, (Math.max(...capturedTiles.map(([, y]) => y)) - Math.min(...capturedTiles.map(([, y]) => y)) + 1) * 16);
  assert.equal(albumPixels.backingWidth, Math.round(albumPixels.width * albumPixels.ratio), 'DPR changes only the backing pixels');
  assert.equal(albumPixels.backingHeight, Math.round(albumPixels.height * albumPixels.ratio));
  await panel.locator('.base-map-material-preview').focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Space');
  assert.equal(await panel.getByRole('button', { name: '保存', exact: true }).isEnabled(), true, 'captured multi-cell material can be placed from the filtered view');
  await panel.getByRole('button', { name: '撤銷上一步', exact: true }).click();
  assert.equal(await panel.getByRole('button', { name: '保存', exact: true }).isEnabled(), false);
  assert.equal(await panel.locator('.base-map-material-preview').count(), 1, 'undo removes only the new instance, not the captured material');
  const albumBaseline = await canvasHash();
  const albumOrigin = await panel.locator('.base-map-material-preview').boundingBox(), albumDestination = await mainCanvas.boundingBox();
  await page.mouse.move(albumOrigin.x + 8, albumOrigin.y + 8);
  await page.mouse.down();
  await page.mouse.move(albumDestination.x + albumDestination.width / 2, albumDestination.y + albumDestination.height / 2, { steps: 8 });
  assert.equal(await panel.getByRole('button', { name: '保存', exact: true }).isEnabled(), false, 'album pointer movement is preview-only');
  await page.mouse.up();
  assert.equal(await panel.getByRole('button', { name: '保存', exact: true }).isEnabled(), true, 'album pointer release places the captured material');
  await panel.getByRole('button', { name: '撤銷上一步', exact: true }).click();
  assert.equal(await panel.getByRole('button', { name: '保存', exact: true }).isEnabled(), false);
  assert.equal(await canvasHash(), albumBaseline, 'one undo restores the exact pre-drag pixels');
  assert.deepEqual({ reads, saves, source: JSON.stringify(snapshot.template.content) }, beforeMyMaterials, 'filtered placement and undo do not persist or change the saved source');
  await selectMapLibraryTab(panel, '問題定位（0）');
  await page.setViewportSize({ width: 900, height: 700 });
  await page.waitForFunction(() => document.documentElement.scrollHeight <= innerHeight + 1 && document.documentElement.scrollWidth <= innerWidth + 1);
  assert.equal(await panel.locator('.base-map-inspector').isVisible(), false);
  assert.equal(await panel.locator('.base-map-library').isVisible(), true);
  const narrowCanvas = await panel.locator('.base-map-canvas').boundingBox();
  const readsBeforeTools = reads, savesBeforeTools = saves;
  const libraryTabs = panel.locator('.base-map-library-tabs');
  assert.equal(await libraryTabs.getByRole('tab').count(), 7, 'sample catalog is separate from raw references, compatibility materials and management tools');
  const previousTabs = libraryTabs.locator('.el-tabs__nav-prev');
  for (let step = 0; step < await libraryTabs.getByRole('tab').count(); step++) {
    if ((await previousTabs.getAttribute('class')).includes('is-disabled')) break;
    await previousTabs.click();
  }
  await libraryTabs.getByRole('tab', { name: '原始／歷史素材', exact: true }).click();
  assert.equal(await libraryTabs.getByRole('tab', { name: '原始／歷史素材', exact: true }).getAttribute('aria-selected'), 'true', 'native overflow arrows reveal tabs for pointer navigation on narrow screens');
  await selectMapLibraryTab(panel, '問題定位（0）');
  await panel.getByRole('tab', { name: '圖層／屬性', exact: true }).click();
  assert.equal(await panel.locator('.base-map-inspector').isVisible(), true);
  assert.equal(await panel.locator('.base-map-library').isVisible(), false);
  assert.deepEqual(await panel.locator('.base-map-canvas').boundingBox(), narrowCanvas, 'side tool switch preserves canvas geometry');
  await panel.getByRole('tab', { name: '素材／管理', exact: true }).click();
  assert.equal(await panel.getByRole('tab', { name: '問題定位（0）', exact: true }).getAttribute('aria-selected'), 'true', 'hidden tool retains category');
  assert.equal(reads, readsBeforeTools); assert.equal(saves, savesBeforeTools);
  await page.setViewportSize({ width: 1600, height: 1000 });
  assert.equal(await panel.locator('.base-map-inspector').isVisible(), true);
  assert.equal(await panel.locator('.base-map-library').isVisible(), true);
  assert.equal(await panel.locator('.base-map-tool-tabs').isVisible(), false);
  // Explicit Web sea preset: one base cell only, unchanged covering objects,
  // one local undo, then save/re-read through the existing base-fill protocol.
  const beforeSea = structuredClone(snapshot.template.content), seaSaves = saves;
  await decorLayer.getByRole('button', { name: '鎖定裝飾', exact: true }).click();
  await pickPiece();
  const seaButton = panel.getByRole('button', { name: '此格填入海域基底', exact: true });
  await seaButton.click();
  assert.equal(await panel.getByRole('button', { name: '保存', exact: true }).isEnabled(), true);
  assert.equal(saves, seaSaves, 'sea preset stages locally, not an immediate API write');
  await panel.getByRole('button', { name: '撤銷上一步', exact: true }).click();
  assert.equal(await panel.getByRole('button', { name: '保存', exact: true }).isEnabled(), false);
  assert.deepEqual(snapshot.template.content, beforeSea);
  await pickPiece();
  await seaButton.click();
  await panel.getByRole('button', { name: '保存', exact: true }).click();
  await panel.getByText('已保存並重新讀取基礎地圖。', { exact: true }).waitFor();
  const [seaDx, seaDy] = definition.footprint[0];
  const seaCell = (inspectPiece.y + seaDy - definition.anchor[1]) * 384 + inspectPiece.x + seaDx - definition.anchor[0];
  const expectedSea = applyMapWorkspaceEdits({ ...beforeSea, gameId: 'system-base-map' }, [{ op: 'base-fill', cells: [seaCell], tile: 95, geography: 1 }]);
  delete expectedSea.gameId; // Template persistence excludes the editing-session identity.
  assert.deepEqual(snapshot.template.content, expectedSea, 'preset persists exactly one explicit existing base-fill, no extra definitions or instances');
  assert.deepEqual(snapshot.template.content.map.decorations, beforeSea.map.decorations);
  assert.equal(snapshot.template.content.map.base.terrainRef[seaCell], 95);
  assert.equal(snapshot.template.content.map.base.geography[seaCell], 1);
  assert.equal(saves, seaSaves + 1);
  assert.equal(await panel.getByRole('button', { name: '保存', exact: true }).isEnabled(), false);
  const beforeRectangle = structuredClone(snapshot.template.content);
  assert.ok(seaCell % 384 < 383 && Math.floor(seaCell / 384) < 255);
  await pickPiece();
  await panel.getByRole('spinbutton', { name: '海域範圍寬', exact: true }).fill('2');
  await panel.getByRole('spinbutton', { name: '海域範圍高', exact: true }).fill('2');
  await panel.getByRole('button', { name: '範圍填入海域基底', exact: true }).click();
  assert.equal(saves, seaSaves + 1);
  await panel.getByRole('button', { name: '撤銷上一步', exact: true }).click();
  assert.equal(await panel.getByRole('button', { name: '保存', exact: true }).isEnabled(), false);
  assert.deepEqual(snapshot.template.content, beforeRectangle);
  await pickPiece();
  await panel.getByRole('button', { name: '範圍填入海域基底', exact: true }).click();
  await panel.getByRole('button', { name: '保存', exact: true }).click();
  await panel.getByText('已保存並重新讀取基礎地圖。', { exact: true }).waitFor();
  const expectedRectangle = applyMapWorkspaceEdits({ ...beforeRectangle, gameId: 'system-base-map' }, [{ op: 'base-fill', cells: [seaCell, seaCell + 1, seaCell + 384, seaCell + 385], tile: 95, geography: 1 }]);
  delete expectedRectangle.gameId;
  assert.deepEqual(snapshot.template.content, expectedRectangle);
  assert.equal(saves, seaSaves + 2);
  assert.equal(await panel.getByRole('button', { name: '保存', exact: true }).isEnabled(), false);
  await page.setViewportSize({ width: 900, height: 700 });
  // Actual registered card, pointer preview/commit, grouped undo and JSON save/reread.
  await panel.getByRole('tab', { name: '圖層／屬性', exact: true }).click();
  await decorLayer.getByRole('button', { name: '解鎖裝飾', exact: true }).click();
  await panel.getByRole('tab', { name: '素材／管理', exact: true }).click();
  await selectMapLibraryTab(panel, '分類樣板');
  const pool = spriteCatalog.recipes.find(item => item.itemId === 'water-pool-outline-13-v1');
  while (await sampleTabs.getByRole('tab', { name: '水系', exact: true }).getAttribute('aria-selected') !== 'true') {
    await sampleTabs.getByRole('tab', { selected: true }).press('ArrowRight');
  }
  const poolJump = panel.locator('.el-pagination__jump input');
  const waterItems = sampleItems.filter(item => item.category === 'water');
  assert.equal(waterItems.length, 26);
  const referenceProofs = [...spriteCatalog.items.filter(item => item.itemId.startsWith('water-mouth-') || item.itemId.startsWith('coast-edge-')), pool,
    ...spriteCatalog.recipes.filter(item => item.category === 'ground')];
  const beforePool = JSON.stringify(snapshot.template.content), poolSaves = saves, poolReads = reads;
  for (const [season, name] of [['summer', '夏'], ['autumn', '秋'], ['winter', '冬'], ['spring', '春']]) {
    await panel.getByRole('tab', { name, exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('#base-map-editor').textContent.includes('圖集載入中'));
    for (const item of referenceProofs) {
      const label = spriteCatalog.categories.find(category => category.id === item.category).name;
      while (await sampleTabs.getByRole('tab', { name: label, exact: true }).getAttribute('aria-selected') !== 'true') {
        await sampleTabs.getByRole('tab', { selected: true }).press('ArrowRight');
      }
      const proofItems = sampleItems.filter(row => row.category === item.category);
      const proofPage = Math.floor(proofItems.findIndex(row => row.itemId === item.itemId) / 25) + 1;
      await poolJump.fill(String(proofPage)); await poolJump.press('Enter');
      assert.deepEqual(await sampleAlbum.locator('canvas').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label'))),
        proofItems.slice((proofPage - 1) * 25, proofPage * 25).map(row => row.name), 'water 25 / 1 and ground 25 / 25 / 5 mount only the selected page');
      const width = (Math.max(...item.footprint.map(([x]) => x)) + 1) * 16;
      const height = (Math.max(...item.footprint.map(([, y]) => y)) + 1) * 16;
      const digest = await sampleAlbum.getByLabel(item.name, { exact: true }).evaluate(async (canvas, { width, height }) => {
        const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        const rgb = new Uint8Array(width * height * 3), ratio = devicePixelRatio;
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
          const offset = (y * ratio * canvas.width + x * ratio) * 4;
          rgb.set(pixels.slice(offset, offset + 3), (y * width + x) * 3);
        }
        return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', rgb)), byte => byte.toString(16).padStart(2, '0')).join('');
      }, { width, height });
      assert.equal(digest, item.source.seasonRgbSha256[season], 'read-only mouth / pool / coast preserves native pixels and transparent holes');
    }
    assert.equal(await panel.getByRole('button', { name: '保存', exact: true }).isEnabled(), false);
  }
  assert.equal(JSON.stringify(snapshot.template.content), beforePool);
  assert.equal(saves, poolSaves); assert.equal(reads, poolReads);
  const compact = spriteCatalog.recipes.find(item => item.itemId === 'mountain-slope-compact-4-v1');
  const compactPage = Math.floor(sampleItems.filter(item => item.category === 'mountain').findIndex(item => item.itemId === compact.itemId) / 25) + 1;
  while (await sampleTabs.getByRole('tab', { name: '山地', exact: true }).getAttribute('aria-selected') !== 'true') {
    await sampleTabs.getByRole('tab', { selected: true }).press('ArrowRight');
  }
  const compactJump = panel.locator('.el-pagination__jump input');
  await compactJump.fill(String(compactPage)); await compactJump.press('Enter');
  const compactCard = sampleAlbum.getByRole('button').filter({ has: page.getByLabel(compact.name, { exact: true }) });
  const beforeCompact = JSON.stringify(snapshot.template.content), compactSaves = saves, compactReads = reads;
  for (const [season, name] of [['summer', '夏'], ['autumn', '秋'], ['winter', '冬'], ['spring', '春']]) {
    await panel.getByRole('tab', { name, exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('#base-map-editor').textContent.includes('圖集載入中'));
    for (const item of spriteCatalog.recipes.filter(item => item.support === 'existing-decoration')) {
    assert.equal(Math.floor(sampleItems.filter(row => row.category === 'mountain').findIndex(row => row.itemId === item.itemId) / 25) + 1, compactPage);
    const card = sampleAlbum.getByRole('button').filter({ has: page.getByLabel(item.name, { exact: true }) });
    const digest = await card.locator('canvas').evaluate(async canvas => {
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      const rgb = new Uint8Array(32 * 32 * 3), ratio = devicePixelRatio;
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
        const offset = (y * ratio * canvas.width + x * ratio) * 4;
        rgb.set(pixels.slice(offset, offset + 3), (y * 32 + x) * 3);
      }
      return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', rgb)), byte => byte.toString(16).padStart(2, '0')).join('');
    });
    assert.equal(digest, item.source.seasonRgbSha256[season], `${item.itemId}: actual product card matches original MDL/BRG four-season RGB`);
    }
    assert.equal(await panel.getByRole('button', { name: '保存', exact: true }).isEnabled(), false);
  }
  assert.equal(reads, compactReads); assert.equal(saves, compactSaves);
  for (const cancel of [true, false]) {
    await compactCard.scrollIntoViewIfNeeded();
    const origin = await compactCard.boundingBox(), destination = await panel.locator('.base-map-canvas').boundingBox();
    await page.mouse.move(origin.x + 8, origin.y + 8); await page.mouse.down();
    await page.mouse.move(destination.x + destination.width / 2, destination.y + destination.height / 2, { steps: 8 });
    assert.equal(await panel.getByRole('button', { name: '保存', exact: true }).isEnabled(), false);
    if (cancel) await page.keyboard.press('Escape');
    await page.mouse.up();
    assert.equal(await panel.getByRole('button', { name: '保存', exact: true }).isEnabled(), !cancel);
    if (!cancel) await panel.getByRole('button', { name: '撤銷上一步', exact: true }).click();
    assert.equal(await panel.getByRole('button', { name: '保存', exact: true }).isEnabled(), false);
    assert.equal(JSON.stringify(snapshot.template.content), beforeCompact); assert.equal(saves, compactSaves);
  }
  await compactCard.focus(); await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
  await panel.getByRole('button', { name: '保存', exact: true }).click();
  await panel.getByText('已保存並重新讀取基礎地圖。', { exact: true }).waitFor();
  const firstBatch = templateWrites.at(-1), capturedId = firstBatch.at(-1).materialId;
  assert.deepEqual(firstBatch.map(edit => edit.op), [...Array(4).fill('decoration-place'), 'material-capture', 'decoration-remove', 'decoration-place']);
  assert.deepEqual(snapshot.template.content.componentDefinitions[capturedId].variants.original.tiles, compact.tiles);
  assert.equal(Object.keys(snapshot.template.content.componentDefinitions).length, Object.keys(JSON.parse(beforeCompact).componentDefinitions).length + 1);
  assert.equal(snapshot.template.content.map.decorations.length, JSON.parse(beforeCompact).map.decorations.length + 1);
  await compactCard.focus();
  await page.getByRole('tooltip').filter({ hasText: '復用本圖完整配方；1條命令' }).waitFor({ state: 'visible' });
  const afterCompact = structuredClone(snapshot.template.content);
  await compactCard.focus(); await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
  await panel.getByRole('button', { name: '保存', exact: true }).click();
  await panel.getByText('已保存並重新讀取基礎地圖。', { exact: true }).waitFor();
  assert.equal(templateWrites.at(-1).length, 1); assert.equal(templateWrites.at(-1)[0].materialId, capturedId);
  assert.deepEqual(snapshot.template.content.componentDefinitions, afterCompact.componentDefinitions);
  assert.equal(snapshot.template.content.map.decorations.length, afterCompact.map.decorations.length + 1);
  assert.equal(saves, compactSaves + 2);
  const adminReads = reads;
  role = 'author'; await page.reload();
  await page.locator('#draft-editor').waitFor({ state: 'visible' });
  assert.equal(await panel.count(), 0); assert.equal(await page.getByRole('menuitem', { name: '基礎地圖', exact: true }).count(), 0);
  assert.equal(reads, adminReads, 'author direct hash navigation does not load administrator template');
  await verifyNavigation(false);
  assert.equal(reads, adminReads, 'author module navigation never reads administrator template');
  const templateBefore = JSON.stringify(snapshot), otherBefore = JSON.stringify(gameCopies.get(gameIds[1]));
  await page.locator('.current-game').getByRole('button', { name: '重新整理', exact: true }).click();
  await page.locator('[data-view="mapview-editor"]').click();
  const gamePanel = page.locator('#game-map-editor');
  await gamePanel.getByText('已重新讀取遊戲地圖。', { exact: true }).waitFor();
  await page.waitForFunction(() => !document.querySelector('#game-map-editor').textContent.includes('圖集載入中'));
  assert.equal(await gamePanel.getByRole('button', { name: '首次建立', exact: true }).count(), 0);
  assert.ok(await gamePanel.locator('.base-map-canvas').evaluate(canvas => canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data.some((v, i) => i % 4 === 3 && v > 0)));
  const authorRequests = apiRequests.length;
  await selectMapLibraryTab(gamePanel, '我的素材');
  assert.equal(await gamePanel.locator('.base-map-material-preview').count(), 0, 'author copy does not inherit the administrator template’s newly captured material');
  await gamePanel.getByRole('list', { name: '我的素材相冊', exact: true }).getByText('尚無擷取素材', { exact: true }).waitFor();
  assert.equal(apiRequests.length, authorRequests, 'my-material filtering does not load another source');
  await selectMapLibraryTab(gamePanel, '原始／歷史素材');
  assert.equal(await gamePanel.locator('.base-map-material-preview').count(), 25);
  await gamePanel.locator('.base-map-material-preview').first().focus();
  await page.keyboard.press('Enter');
  assert.equal(await gamePanel.locator('.base-map-canvas').evaluate(element => document.activeElement === element), true);
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Space');
  assert.equal(await gamePanel.getByRole('button', { name: '保存', exact: true }).isEnabled(), true, 'author copy supports keyboard placement');
  await gamePanel.getByRole('button', { name: '撤銷上一步', exact: true }).click();
  assert.equal(await gamePanel.getByRole('button', { name: '保存', exact: true }).isEnabled(), false);
  assert.equal(apiRequests.length, authorRequests, 'author keyboard placement and undo are local');
  const authorMaterial = gamePanel.locator('.base-map-material-preview').first();
  const authorCanvas = gamePanel.locator('.base-map-canvas');
  for (const cancel of [true, false]) {
    await authorMaterial.scrollIntoViewIfNeeded();
    const origin = await authorMaterial.boundingBox(), destination = await authorCanvas.boundingBox();
    assert.ok(origin && destination);
    await page.mouse.move(origin.x + 8, origin.y + 8);
    await page.mouse.down();
    await page.mouse.move(destination.x + destination.width / 2, destination.y + destination.height / 2, { steps: 8 });
    assert.equal(await gamePanel.getByRole('button', { name: '保存', exact: true }).isEnabled(), false, 'author drag preview does not stage');
    if (cancel) await page.keyboard.press('Escape');
    await page.mouse.up();
    assert.equal(await gamePanel.getByRole('button', { name: '保存', exact: true }).isEnabled(), !cancel, 'author pointer release respects cancellation');
    if (!cancel) await gamePanel.getByRole('button', { name: '撤銷上一步', exact: true }).click();
    assert.equal(await gamePanel.getByRole('button', { name: '保存', exact: true }).isEnabled(), false, 'author pointer placement is one undo operation');
    assert.equal(apiRequests.length, authorRequests, 'author pointer preview, cancellation and undo make no API requests');
    assert.equal(JSON.stringify(snapshot), templateBefore);
    assert.equal(JSON.stringify(gameCopies.get(gameIds[1])), otherBefore);
  }
  assert.equal(JSON.stringify(snapshot), templateBefore);
  assert.equal(JSON.stringify(gameCopies.get(gameIds[1])), otherBefore);
  await selectMapLibraryTab(gamePanel, '水域與小地圖');
  await gamePanel.getByRole('button', { name: /從小地圖隱藏|顯示於小地圖/ }).first().click();
  await gamePanel.getByRole('button', { name: '保存', exact: true }).click();
  await gamePanel.getByText('已保存並重新讀取遊戲地圖。', { exact: true }).waitFor();
  assert.equal(gameSaves, 1); assert.equal(JSON.stringify(snapshot), templateBefore); assert.equal(JSON.stringify(gameCopies.get(gameIds[1])), otherBefore);
  await page.locator('.current-game .el-select').click(); await page.getByRole('option', { name: '測試地圖2', exact: true }).click();
  await gamePanel.getByText('已重新讀取遊戲地圖。', { exact: true }).waitFor();
  assert.equal(await page.locator('#mapview-editor').count(), 0, 'legacy map panel is not mounted');
  await page.waitForFunction(() => !document.querySelector('#game-map-editor').textContent.includes('圖集載入中'));
  await selectMapLibraryTab(gamePanel, '水域與小地圖');
  await gamePanel.getByRole('button', { name: /從小地圖隱藏|顯示於小地圖/ }).first().click();
  await gamePanel.getByRole('tab', { name: '圖層／屬性', exact: true }).click();
  assert.equal(await gamePanel.locator('.base-map-library').isVisible(), false);
  assert.equal(await gamePanel.getByRole('button', { name: '保存', exact: true }).isEnabled(), true, 'tool switch retains pending copy edits');
  await gamePanel.getByRole('tab', { name: '素材／管理', exact: true }).click();
  assert.equal(gameSaves, 1, 'tool switch does not save');
  const beforeDialogs = dialogs; acceptDialogs = false;
  await page.locator('[data-view="draft-editor"]').click();
  assert.ok(dialogs > beforeDialogs, 'menu navigation checks dirty map session');
  assert.equal(await page.locator('[data-view="mapview-editor"]').evaluate(el => el.classList.contains('is-active')), true, 'rejected navigation retains active menu');
  assert.equal(await gamePanel.isVisible(), true);
  await page.locator('.current-game .el-select').click(); await page.getByRole('option', { name: '測試地圖1', exact: true }).click();
  assert.ok(dialogs > beforeDialogs, 'game switch checks dirty map session');
  await page.locator('.current-game .el-select').getByText('測試地圖2', { exact: true }).waitFor();
  assert.equal(await gamePanel.getByRole('button', { name: '保存', exact: true }).isEnabled(), true, 'cancelled switch retains pending map edits');
  await gamePanel.getByRole('button', { name: '撤銷上一步', exact: true }).click(); acceptDialogs = true;
  assert.equal(gameSaves, 1); assert.equal(JSON.stringify(gameCopies.get(gameIds[1])), otherBefore);
  assert.deepEqual(unexpected, []); assert.deepEqual(errors, []); assert.deepEqual(failures, []);
  console.log('PASS built BaseMapPanel: initialization, real atlas fixture, season pixel roundtrip, all 12 admin / 8 author modules in expanded and collapsed menu, water preference save/reread without workspace minimap, group capture, registered compact-recipe four-season RGB/drag/cancel/grouped undo/7-command save/reread/1-command reuse, footprint picking, layer buttons, split/delete/base-fill undo, author copy isolation, dirty menu/game-switch rejection, 1600x1000 and 900x700; API mocked, no production/auth claim.');
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
