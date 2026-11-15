// Atomic workspace lane: owned HTTPS/SQLite/FileBucket and fresh browser, no API mocks.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { compileGameSource } from '../web/src/content/authoring/trialcompile.js';
import { applyMapWorkspaceEdits } from '../server/mapworkspace.js';
import { fitViewport, worldToScreen } from '../web/src/editor/viewport.js';
import { verifyAtomicLibrary, selectAtomicTile, dragAtomicTile } from './map_atomic_browser_helpers.mjs';

export async function verifyAtomicHttpBrowser({ origin, admin, call, storage, gameId, newId, mapData, sha, beforeMap, verifyApprovedMap }) {
  const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE);
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1600, height: 1000 } });
    const separator = admin.cookie.indexOf('=');
    await context.addCookies([{ name: admin.cookie.slice(0, separator), value: admin.cookie.slice(separator + 1), url: origin, httpOnly: true, secure: true, sameSite: 'Strict' }]);
    const page = await context.newPage(), errors = [], failures = [];
    page.setDefaultTimeout(60000);
    page.on('dialog', dialog => dialog.accept());
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error' && !(message.location().url === origin + '/favicon.ico' && /404/.test(message.text()))) errors.push({ text: message.text(), location: message.location().url });
    });
    page.on('requestfailed', request => failures.push({ url: request.url(), error: request.failure()?.errorText }));
    const priorGames = [gameId, newId].map(id => storage.sql.exec('SELECT data_json FROM game_copies WHERE game_id=?', id).toArray()[0].data_json);
    await page.goto(origin + '/#base-map-editor');
    const panel = page.locator('#base-map-editor');
    await page.getByText('已重新讀取基礎地圖。', { exact: true }).waitFor();
    await page.waitForFunction(() => !document.querySelector('.map-status').textContent.includes('圖集載入中'));
    const initial = (await call('/api/admin/base-map', undefined, admin)).data.snapshot;
    await verifyAtomicLibrary(page, panel, initial.template.content);
    assert.ok(initial.template.content.map.base.terrainRef.every(tile => tile === 95));
    assert.equal(await panel.getByRole('tab', { name: '水域與小地圖', exact: true }).count(), 0);
    assert.equal(await panel.getByRole('button', { name: /填入.*基底/ }).count(), 0);
    for (const label of ['裝飾', '道路', '據點']) await panel.getByRole('button', { name: '隱藏' + label, exact: true }).click();
    await panel.getByText('網格', { exact: true }).click();
    const pixel = await panel.locator('.base-map-canvas').evaluate(node => Array.from(node.getContext('2d').getImageData(Math.floor(node.width / 2), Math.floor(node.height / 2), 1, 1).data));
    assert.ok(pixel[2] > pixel[0] && pixel[3] === 255, 'empty surface reveals the opaque base image');
    for (const label of ['裝飾', '道路', '據點']) await panel.getByRole('button', { name: '顯示' + label, exact: true }).click();
    let snapshot = initial;
    for (const [tile, x, y] of [[112, 208, 135], [0, 319, 1]]) {
      const card = await selectAtomicTile(panel, snapshot.template.content.componentDefinitions, tile);
      await card.focus(); await page.keyboard.press('Enter'); await page.keyboard.press('Escape');
      assert.equal(await panel.getByRole('button', { name: '保存', exact: true }).isEnabled(), false);
      await dragAtomicTile(page, panel, snapshot.template.content.componentDefinitions, tile, x, y);
      await panel.getByRole('button', { name: '撤銷', exact: true }).click();
      assert.equal(await panel.getByRole('button', { name: '保存', exact: true }).isEnabled(), false);
      await dragAtomicTile(page, panel, snapshot.template.content.componentDefinitions, tile, x, y);
      assert.equal((await call('/api/admin/base-map', undefined, admin)).data.snapshot.digest, snapshot.digest);
      await panel.getByRole('button', { name: '保存', exact: true }).click();
      await page.getByText('已保存並重新讀取基礎地圖。', { exact: true }).waitFor();
      await page.waitForFunction(() => !document.querySelector('.map-status').textContent.includes('圖集載入中'));
      const saved = (await call('/api/admin/base-map', undefined, admin)).data.snapshot;
      const placed = saved.template.content.map.decorations.at(-1);
      assert.equal(placed.definitionRef, `tile-${tile}`);
      assert.deepEqual([placed.x, placed.y], [x, y]);
      const expected = applyMapWorkspaceEdits({ gameId: 'system-base-map', ...snapshot.template.content }, [{
        op: 'decoration-place', instanceId: placed.id, materialId: `tile-${tile}`, variantRef: 'original', x, y, waterClass: null,
      }]);
      delete expected.gameId;
      assert.deepEqual(saved.template.content, expected, 'browser save is exactly one atomic placement command');
      assert.deepEqual(saved.template.content.componentDefinitions, snapshot.template.content.componentDefinitions);
      assert.deepEqual(saved.template.content.selectionGroups, snapshot.template.content.selectionGroups);
      snapshot = saved;
    }
    const selectedId = snapshot.template.content.map.decorations.at(-1).id;
    const canvas = panel.locator('.base-map-canvas');
    await panel.getByRole('button', { name: '全圖', exact: true }).click();
    const size = await canvas.evaluate(node => ({ width: node.clientWidth, height: node.clientHeight }));
    const point = worldToScreen(fitViewport(size, { width: 384 * 16, height: 256 * 16 }), 319.5 * 16, 1.5 * 16);
    await canvas.click({ position: { x: point[0], y: point[1] } });
    for (const [direction, label] of [['bottom', '置底'], ['top', '置頂']]) {
      await canvas.click({ button: 'right', position: { x: point[0], y: point[1] } });
      const menu = panel.getByRole('dialog', { name: '物件操作', exact: true });
      assert.ok((await menu.locator('.base-map-object-info').textContent()).includes(selectedId));
      await menu.getByRole('button', { name: label, exact: true }).click();
      await panel.getByRole('button', { name: '保存', exact: true }).click();
      await page.getByText('已保存並重新讀取基礎地圖。', { exact: true }).waitFor();
      const saved = (await call('/api/admin/base-map', undefined, admin)).data.snapshot;
      const expected = applyMapWorkspaceEdits({ gameId: 'system-base-map', ...snapshot.template.content }, [{ op: 'decoration-reorder', memberIds: [selectedId], direction }]);
      delete expected.gameId;
      assert.deepEqual(saved.template.content, expected, 'context endpoint action is one persisted command, not hundreds of adjacent swaps');
      assert.equal(direction === 'top' ? saved.template.content.map.decorations.at(-1).id : saved.template.content.map.decorations[0].id, selectedId);
      snapshot = saved;
    }
    await panel.getByRole('button', { name: '載入', exact: true }).click();
    await page.getByText('已重新讀取基礎地圖。', { exact: true }).waitFor();
    await page.waitForFunction(() => !document.querySelector('.map-status').textContent.includes('圖集載入中'));
    assert.equal(await panel.getByRole('button', { name: '保存', exact: true }).isEnabled(), false);
    assert.notEqual(snapshot.digest, initial.digest);
    assert.deepEqual([gameId, newId].map(id => storage.sql.exec('SELECT data_json FROM game_copies WHERE game_id=?', id).toArray()[0].data_json), priorGames);
    const created = [];
    for (const full of [true, false]) {
      await page.locator(`[data-view="${full ? 'copy-game-editor' : 'copy'}"]`).click();
      await page.locator(full ? '#full-copy-name' : '#copy input[name="name"]').fill(full ? '原子瀏覽完整' : '原子瀏覽空白');
      const completed = page.waitForResponse(response => {
        const path = new URL(response.url()).pathname;
        return response.request().method() === 'POST' && (full ? /^\/api\/admin\/copies\/[^/]+\/run$/ : /^\/api\/games\/create\/[^/]+\/run$/).test(path);
      }, { timeout: 240000 });
      await page.locator(full ? '#full-copy-create' : '#copy-create button[type="submit"]').click();
      const response = await completed;
      assert.equal(response.status(), 200, await response.text());
      const id = (await response.json()).gameId;
      await page.waitForLoadState('networkidle');
      const record = await call(`/api/games/${id}/copy`, undefined, admin);
      assert.equal(record.status, 200);
      assert.equal(record.data.data.mapOrigin.digest, snapshot.digest);
      assert.deepEqual(record.data.data.map, snapshot.template.content.map);
      assert.deepEqual(record.data.data.componentDefinitions, snapshot.template.content.componentDefinitions);
      assert.deepEqual(record.data.data.selectionGroups, snapshot.template.content.selectionGroups);
      assert.equal(Object.keys(record.data.data.generals).length, full ? 466 : 0);
      created.push(record.data.data);
    }
    assert.deepEqual(mapData(created[0]), mapData(created[1]));
    const id = created[0].gameId;
    const priorTicket = await call(`/api/games/${id}/copy/validate`, {}, admin);
    assert.equal(priorTicket.status, 200); assert.equal(priorTicket.data.state, 'passed');
    await page.locator('.current-game').getByRole('button', { name: '重新整理', exact: true }).click();
    await page.locator('.current-game .el-select').click();
    await page.getByRole('option', { name: '原子瀏覽完整', exact: true }).click();
    await page.locator('[data-view="mapview-editor"]').click();
    const gamePanel = page.locator('#game-map-editor');
    await page.getByText('已重新讀取遊戲地圖。', { exact: true }).waitFor();
    await page.waitForFunction(() => !document.querySelector('.map-status').textContent.includes('圖集載入中'));
    await dragAtomicTile(page, gamePanel, created[0].componentDefinitions, 0, 320, 1);
    await gamePanel.getByRole('button', { name: '保存', exact: true }).click();
    await page.getByText('已保存並重新讀取遊戲地圖。', { exact: true }).waitFor();
    await page.waitForLoadState('networkidle');
    const stale = await call(`/api/games/${id}/copy/submission`, { ticket: priorTicket.data.ticket, description: '原子修改後舊票拒絕' }, admin);
    assert.equal(stale.status, 409); assert.equal(stale.data.error, 'VALIDATION_STALE');
    const edited = (await call(`/api/games/${id}/copy`, undefined, admin)).data.data;
    const placed = edited.map.decorations.at(-1);
    assert.deepEqual(edited, applyMapWorkspaceEdits(created[0], [{ op: 'decoration-place', instanceId: placed.id, materialId: 'tile-0', variantRef: 'original', x: 320, y: 1, waterClass: null }]));
    assert.deepEqual(edited.componentDefinitions, created[0].componentDefinitions);
    const compiled = compileGameSource(edited, sha);
    for (const index of [703, 704]) {
      assert.equal(compiled.terrainBytes[index], 0);
      assert.equal(compiled.minimapGeography[index], 0, 'ground contributes land regardless of library classification');
    }
    const pass = await call(`/api/games/${id}/copy/validate`, {}, admin);
    assert.equal(pass.status, 200); assert.equal(pass.data.state, 'passed');
    const submit = await call(`/api/games/${id}/copy/submission`, { ticket: pass.data.ticket, description: '原子素材真實HTTPS保存複製及發布載入驗證' }, admin);
    assert.equal(submit.status, 200); assert.equal(submit.data.state, 'submitted');
    const approval = await call(`/api/games/${id}/copy/approve`, {}, admin);
    assert.equal(approval.status, 200); assert.equal(approval.data.state, 'approved'); assert.equal(approval.data.ordinal, '1.0');
    const terrain = await verifyApprovedMap(id, approval.data, compiled, beforeMap.terrainBytes);
    assert.equal(terrain[703], 0); assert.equal(terrain[704], 0);
    assert.equal((await call('/api/admin/base-map', undefined, admin)).data.snapshot.digest, snapshot.digest);
    assert.deepEqual(mapData((await call(`/api/games/${created[1].gameId}/copy`, undefined, admin)).data.data), mapData(created[1]));
    assert.deepEqual([gameId, newId].map(key => storage.sql.exec('SELECT data_json FROM game_copies WHERE game_id=?', key).toArray()[0].data_json), priorGames);
    await page.setViewportSize({ width: 900, height: 700 });
    await page.waitForFunction(() => document.documentElement.scrollHeight <= innerHeight + 1 && document.documentElement.scrollWidth <= innerWidth + 1);
    assert.deepEqual(errors, []); assert.deepEqual(failures, []);
    console.log('PASS atomic fresh browser / actual HTTPS / SQLite: 240 spring previews/neutral city library, seven categories/no tooltips or season switch, template drag/cancel/undo/save/reread, context top/bottom saves, both creation entries, game atomic save, stale ticket refusal, validation/submission/approval, exact player pack/environment/scenario terrain and two published minimap PNGs, unchanged definitions/groups and independent games.');
  } finally { await browser.close(); }
}
