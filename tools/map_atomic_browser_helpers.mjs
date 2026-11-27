// Shared fresh-browser checks for fixture and real-HTTPS lanes. No API mocking here.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { decodePNG } from '../server/pngio.js';
import { projectAtomicSpriteCatalog } from '../editor-ui/src/mapatomiccatalog.js';
import { fitViewport, worldToScreen } from '../web/src/editor/viewport.js';
import cityGroupCatalog from '../editor-ui/src/mapcitygroups.json' with { type: 'json' };

export async function selectAtomicTile(panel, definitions, tile) {
  const catalog = projectAtomicSpriteCatalog(definitions), item = catalog.catalogItems.find(row => row.id === `tile-${tile}`);
  assert.ok(item, `byte ${tile} must be a visible library item`);
  const category = catalog.catalogCategories.find(row => row.id === item.category);
  const tabs = panel.locator('.base-map-catalog-tabs');
  await tabs.getByRole('tab', { name: category.name, exact: true }).click();
  assert.equal(await tabs.getByRole('tab', { name: category.name, exact: true }).getAttribute('aria-selected'), 'true');
  const album = panel.locator('.base-map-material-album');
  const target = album.locator(`[data-tile="${item.id}"]`);
  for (let step = 0; !await target.count() && step < 8; step++) {
    const count = await album.locator('[role="listitem"]').count();
    await album.evaluate(node => { node.scrollTop = node.scrollHeight; });
    await album.locator('[role="listitem"]').nth(count).waitFor();
  }
  await target.scrollIntoViewIfNeeded();
  return panel.getByRole('button', { name: `${item.name}；拖至地圖或按Enter／空白鍵開始放置`, exact: true });
}

export async function confirmMapSaved(page) {
  const dialog = page.getByRole('dialog', {name:'保存成功',exact:true});
  await dialog.waitFor();
  assert.equal(await dialog.getByRole('button').count(),1);
  await dialog.getByRole('button',{name:'確認',exact:true}).click();
  await dialog.waitFor({state:'hidden'});
}

export async function dragAtomicTile(page, panel, definitions, tile, x, y) {
  const card = await selectAtomicTile(panel, definitions, tile);
  await panel.getByRole('button', { name: '全圖', exact: true }).click();
  await card.scrollIntoViewIfNeeded();
  const canvas = panel.locator('.base-map-canvas');
  const size = await canvas.evaluate(node => ({ width: node.clientWidth, height: node.clientHeight }));
  const view = fitViewport(size, { width: 384 * 16, height: 256 * 16 });
  const position = worldToScreen(view, (x + 0.5) * 16, (y + 0.5) * 16);
  const from = await card.boundingBox(), to = await canvas.boundingBox();
  assert.equal(await card.evaluate(node => { const r = node.getBoundingClientRect(); return node.contains(document.elementFromPoint(r.x + 8, r.y + 8)); }), true);
  await page.mouse.move(from.x + 8, from.y + 8); await page.mouse.down();
  await page.mouse.move(to.x + position[0], to.y + position[1], { steps: 8 }); await page.mouse.up();
  assert.equal(await panel.getByRole('button', { name: '保存', exact: true }).isEnabled(), true);
}

export async function verifyCompactMapLayout(page, panel) {
  const geometry = await panel.evaluate(node => {
    const rect = selector => {
      const box = node.querySelector(selector).getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height, right: box.right, bottom: box.bottom };
    };
    const heading = document.querySelector('.page-heading').getBoundingClientRect();
    return { map: rect('.base-map-canvas'), tools: rect('.base-map-toolbar'), controls: rect('.base-map-controls'), status: rect('.map-status'), library: rect('.base-map-library'), tabs: rect('.base-map-catalog-tabs'), headingBottom: heading.bottom, height: innerHeight, width: innerWidth };
  });
  const { map, tools, controls, status, library, tabs } = geometry;
  assert.equal(library.width, 260, 'compact library has fixed width, independent of navigation and viewport');
  assert.ok(Math.abs(tools.y - tabs.y) <= 1, 'library starts at tool-row height, not below it');
  assert.ok(Math.abs(tools.y - geometry.headingBottom - 4) <= 1, 'no separate status/description row below title');
  assert.ok(Math.abs(map.y - tools.bottom - 4) <= 1, 'map starts immediately after the single toolbar row');
  assert.ok(Math.abs(map.bottom - library.bottom) <= 1, 'map and material library bottoms align');
  assert.ok(Math.abs(map.bottom - (geometry.height - 8)) <= 1, 'only eight pixels below map');
  assert.ok(Math.abs(library.right - (geometry.width - 8)) <= 1, 'compact outer right margin');
  assert.ok(Math.abs(library.x - map.right - 8) <= 1, 'only eight pixels separate map and library');
  assert.ok(Math.abs(status.y + status.height / 2 - controls.y - controls.height / 2) <= 1, 'status follows controls on the same line');
  assert.ok(status.x >= controls.right, 'status is after the buttons, not above them');
  assert.ok(Math.abs(controls.x - map.x) <= 1, 'button group is aligned with the map left edge');
  assert.ok(Math.abs(status.right - map.right) <= 1, 'status is aligned with the map right edge');
  assert.equal(await panel.locator('.map-status').evaluate(node => getComputedStyle(node).textAlign), 'right');
  assert.ok(status.x >= tools.x && status.right <= tools.right + 1, 'status stays visible on narrow screens; only the buttons scroll');
  assert.ok(tools.height <= 50, 'toolbar never wraps into multiple rows; narrow view scrolls locally');
  assert.equal(await page.locator('.page-line').isVisible(), false);
  assert.equal(await panel.getByText('已預覽新底圖與地面輪廓', { exact: false }).count(), 0, 'retired long description is not rendered');
  const buttons = await panel.locator('.base-map-catalog-tabs button').evaluateAll(nodes => nodes.map(node => ({ width: node.clientWidth, scroll: node.scrollWidth, height: node.getBoundingClientRect().height })));
  assert.ok(buttons.every(button => button.scroll <= button.width && button.height === 32), 'compact category layout keeps default-size controls and all text');
  return geometry;
}

// View-only lock: exercise actual pointer gestures and rendered pixels, not just the icon.
export async function verifyMapPanLock(page, panel) {
  const canvas = panel.locator('.base-map-canvas'), lock = panel.getByRole('button', { name: '鎖圖', exact: true });
  const pixels = () => canvas.evaluate(async node => {
    const rgba = node.getContext('2d').getImageData(0, 0, node.width, node.height).data;
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', rgba))).join(',');
  });
  const drag = async () => dragFrom(null, null);
  const dragFrom = async (offsetX, offsetY) => {
    const box = await canvas.boundingBox();
    const x = box.x + (offsetX ?? box.width / 2), y = box.y + (offsetY ?? box.height / 2);
    await page.mouse.move(x, y); await page.mouse.down();
    await page.mouse.move(x + 48, y + 32, { steps: 8 }); await page.mouse.up();
  };
  const saveButton = () => panel.getByRole('button', { name: '保存', exact: true });
  assert.equal(await lock.isEnabled(), true);
  assert.equal(await lock.getAttribute('aria-pressed'), 'false', 'new workspace starts unlocked');
  const unlockedIcon = await lock.locator('path').getAttribute('d');
  await panel.getByRole('button', { name: '100%', exact: true }).click();
  await canvas.click();
  for (let cycle = 0; cycle < 2; cycle++) {
    // 未锁定：点击照常选中切换；拖动一律平移地图，绝不暂存对象移动。
    await canvas.click({ position: { x: 80, y: 100 } });
    await page.keyboard.press('Escape');
    const before = await pixels(); await drag();
    assert.notEqual(await pixels(), before, 'unlocked drag must pan the viewport at 100%');
    assert.equal(await saveButton().isEnabled(), false, 'unlocked drag must never stage object moves');
    await lock.click();
    assert.equal(await lock.getAttribute('aria-pressed'), 'true');
    assert.notEqual(await lock.locator('path').getAttribute('d'), unlockedIcon);
    // 无已选对象时，锁定拖拽（含 Shift）不得退化为平移。
    // Layer visibility toggles clear object selection without changing persisted data.
    await panel.getByRole('button', { name: '隱藏裝飾', exact: true }).click();
    await panel.getByRole('button', { name: '顯示裝飾', exact: true }).click();
    const lockedPixels = await pixels(); await drag();
    assert.equal(await pixels(), lockedPixels, 'locked drag without a movable selection cannot pan');
    await page.keyboard.down('Shift'); await drag(); await page.keyboard.up('Shift');
    assert.equal(await pixels(), lockedPixels, 'Shift does not bypass pan lock');
    assert.equal(await saveButton().isEnabled(), false, 'locked empty drag stages nothing');
    await page.keyboard.press('Escape');
    const beforeZoom = await pixels();
    await panel.getByRole('button', { name: '放大', exact: true }).click();
    assert.notEqual(await pixels(), beforeZoom, 'pan lock does not lock toolbar zoom');
    await panel.getByRole('button', { name: '100%', exact: true }).click();
    const beforeWheel = await pixels();
    await canvas.dispatchEvent('wheel', { deltaY: -100 });
    assert.notEqual(await pixels(), beforeWheel, 'pan lock does not lock wheel zoom');
    await panel.getByRole('button', { name: '100%', exact: true }).click();
    await lock.focus(); await lock.press(cycle ? 'Space' : 'Enter');
    assert.equal(await lock.getAttribute('aria-pressed'), 'false', 'keyboard activation also unlocks');
    assert.equal(await lock.locator('path').getAttribute('d'), unlockedIcon);
  }
  // Lock during a captured drag using the keyboard: the toggle clears the
  // in-progress gesture, then the release lands cleanly with nothing staged.
  const box = await canvas.boundingBox(), x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 12, y + 12);
  await lock.focus(); await lock.press('Enter');
  assert.equal(await lock.getAttribute('aria-pressed'), 'true');
  const interrupted = await pixels();
  await page.mouse.move(x + 40, y + 40); await page.mouse.up();
  const released = await pixels();
  assert.equal(released, interrupted, 'locking mid-drag cancels the gesture via the toggle');
  assert.equal(await saveButton().isEnabled(), false, 'cancelled gesture stages nothing');
  await lock.press('Enter');
  assert.equal(await lock.getAttribute('aria-pressed'), 'false');
  await page.mouse.move(x + 60, y + 60);
  assert.equal(await pixels(), released, 'unlocking cannot resume the old gesture without a new press');
  await drag(); assert.notEqual(await pixels(), released, 'fresh drag works again after unlock');
  assert.equal(await saveButton().isEnabled(), false, 'view and pan gestures leave nothing staged');
}

export async function verifyMapWorkspaceChrome(page, panel, source, selectedId) {
  const canvas = panel.locator('.base-map-canvas'), floating = panel.locator('.base-map-floating');
  const tabs = panel.locator('.base-map-catalog-tabs');
  const tabRows = await tabs.getByRole('tab').evaluateAll(nodes => nodes.map(node => Math.round(node.getBoundingClientRect().y)));
  assert.equal(new Set(tabRows).size, 2);
  assert.equal(new Set(tabRows.slice(0, 4)).size, 1); assert.equal(new Set(tabRows.slice(4)).size, 1);
  assert.equal(await panel.locator('.base-map-inspector, .base-map-tool-tabs').count(), 0);
  assert.equal(await panel.getByRole('button', { name: '鎖圖', exact: true }).isEnabled(), true);
  for (const text of await panel.locator('.base-map-toolbar button').allTextContents()) if (text.trim() && text.trim() !== '100%') assert.equal([...text.trim()].length, 2);
  assert.deepEqual((await panel.locator('.base-map-controls button').allTextContents()).slice(-7, -3).map(text => text.trim()), ['全圖', '放大', '100%', '縮小']);
  await tabs.getByRole('tab', { name: '水系', exact: true }).click();
  const album = panel.locator('.base-map-material-album');
  assert.ok(await album.locator('canvas').count() < 100, 'offscreen water materials are not all mounted at once');
  await selectAtomicTile(panel, source.componentDefinitions, 111);
  assert.equal(await album.locator('canvas').count(), 100);
  await tabs.getByRole('tab', { name: '地面', exact: true }).click();
  assert.equal(await album.evaluate(node => node.scrollTop), 0, 'category change resets local scrolling');
  await tabs.getByRole('tab', { name: '地面', exact: true }).press('ArrowRight');
  assert.equal(await tabs.getByRole('tab', { selected: true }).textContent(), '山地');
  await panel.getByRole('button', { name: '全圖', exact: true }).click();
  for (let i = 0; i < 3; i++) await panel.getByRole('button', { name: '放大', exact: true }).click();
  const expandedLayout = await verifyCompactMapLayout(page, panel);
  const originalWidth = await canvas.evaluate(node => node.clientWidth);
  await canvas.click(); await canvas.click({ button: 'right' });
  const selectedBefore = await panel.locator('.base-map-object-info').textContent();
  await page.keyboard.press('Escape');
  await canvas.evaluate(node => {
    const context = node.getContext('2d'), original = context.strokeRect;
    node.zoomProbe = { original, sizes: [] };
    context.strokeRect = function (...values) { node.zoomProbe.sizes.push(values.slice(2)); return original.apply(this, values); };
  });
  for (const startZoom of ['放大', '縮小', '放大']) {
    await panel.getByRole('button', { name: startZoom, exact: true }).click();
    await canvas.evaluate(node => { node.zoomProbe.sizes.length = 0; });
    await panel.getByRole('button', { name: '100%', exact: true }).click();
    const sizes = await canvas.evaluate(node => node.zoomProbe.sizes);
    assert.ok(sizes.length > 0 && sizes.every(([w, h]) => Math.abs(w - 16) < 1e-10 && Math.abs(h - 16) < 1e-10), '100% renders each selected world cell at 16 CSS pixels, independently of DPR');
    await canvas.click(); await canvas.click({ button: 'right' });
    assert.equal(await panel.locator('.base-map-object-info').textContent(), selectedBefore, '100% preserves view center');
    await page.keyboard.press('Escape');
  }
  await canvas.evaluate(node => { node.getContext('2d').strokeRect = node.zoomProbe.original; delete node.zoomProbe; });
  await page.getByRole('button', { name: '折疊導覽', exact: true }).click();
  await page.waitForFunction(width => document.querySelector('.base-map-canvas').clientWidth > width, originalWidth);
  assert.equal(await canvas.evaluate(node => node.clientWidth), originalWidth + 152, 'all released navigation width goes to the map');
  const collapsedLayout = await verifyCompactMapLayout(page, panel);
  assert.deepEqual(collapsedLayout.library, expandedLayout.library, 'navigation changes only map width, never the fixed library');
  await canvas.click(); await canvas.click({ button: 'right' });
  assert.equal(await panel.locator('.base-map-object-info').textContent(), selectedBefore, 'resize keeps world center and zoom, no auto fit');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '展開導覽', exact: true }).click();
  await page.waitForFunction(width => document.querySelector('.base-map-canvas').clientWidth === width, originalWidth);
  const handle = panel.getByRole('button', { name: '移動圖層工具', exact: true });
  await canvas.focus(); await page.mouse.move(0, 0);
  const iconButtons = await floating.locator('button').evaluateAll(nodes => nodes.map(node => ({ width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height, border: getComputedStyle(node).borderTopColor, text: node.classList.contains('is-text') })));
  assert.ok(iconButtons.every(button => button.width === 32 && button.height === 32 && button.text && button.border === 'rgba(0, 0, 0, 0)'), 'floating icons are square default-height text buttons, with no resting border');
  await handle.hover();
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.base-map-drag-handle')).borderTopColor !== 'rgba(0, 0, 0, 0)');
  const start = await handle.boundingBox(), map = await canvas.boundingBox(), before = await floating.boundingBox();
  assert.ok(before.width <= 460, 'floating toolbar is compact instead of a six-hundred-pixel strip');
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2); await page.mouse.down();
  await page.mouse.move(map.x + 40, map.y + 50, { steps: 8 }); await page.mouse.up();
  const moved = await floating.boundingBox();
  assert.ok(moved.y < before.y); assert.ok(moved.x >= map.x && moved.y >= map.y && moved.x + moved.width <= map.x + map.width + 1 && moved.y + moved.height <= map.y + map.height + 1);
  await handle.focus(); await handle.press('ArrowDown');
  const keyed = await floating.boundingBox();
  assert.equal(Math.round(keyed.y - moved.y), 8, JSON.stringify({ before, moved, keyed, map, scroll: await canvas.evaluate(node => ({ hostTop: node.parentElement.scrollTop, hostLeft: node.parentElement.scrollLeft })) }));
  assert.equal(await panel.getByRole('button', { name: '保存', exact: true }).isEnabled(), false, 'layout, navigation and lazy browsing do not edit source');
  await panel.getByRole('button', { name: '全圖', exact: true }).click();
  const size = await canvas.evaluate(node => ({ width: node.clientWidth, height: node.clientHeight }));
  const point = worldToScreen(fitViewport(size, { width: 384 * 16, height: 256 * 16 }), 208.5 * 16, 135.5 * 16);
  await canvas.click({ position: { x: point[0], y: point[1] } });
  const menu = () => panel.getByRole('dialog', { name: '物件操作', exact: true });
  const openMenu = async () => {
    // 单击是切换语义：先右键试探，无菜单则说明点灭了，再点一次选中后重开。
    await canvas.click({ button: 'right', position: { x: point[0], y: point[1] } });
    if (await menu().count() === 0) {
      await canvas.click({ position: { x: point[0], y: point[1] } });
      await canvas.click({ button: 'right', position: { x: point[0], y: point[1] } });
    }
    await menu().waitFor();
  };
  for (const action of ['置底', '置頂', '下移一層', '上移一層', '刪除']) {
    await openMenu();
    assert.ok((await menu().locator('.base-map-object-info').textContent()).includes(selectedId));
    assert.equal(await menu().locator('strong').textContent(), '山地');
    assert.equal(await menu().locator('button:disabled').count(), 2, 'single-object combine and object lock stay disabled');
    assert.equal(await menu().getByRole('button', { name: '複製', exact: true }).count(), 0);
    assert.equal(await menu().getByRole('button', { name: '填充', exact: true }).count(), 0);
    assert.deepEqual(await menu().locator('.base-map-context-actions').last().locator('button').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label'))), ['组合', '拆散', '鎖定物件', '刪除']);
    assert.equal(await panel.locator('.base-map-controls').getByRole('button', { name: '鎖圖', exact: true }).count(), 1);
    await menu().getByRole('button', { name: action, exact: true }).click();
    assert.equal(await menu().count(), 0);
    assert.equal(await panel.getByRole('button', { name: '保存', exact: true }).isEnabled(), true);
    await panel.getByRole('button', { name: '撤銷', exact: true }).click();
    assert.equal(await panel.getByRole('button', { name: '保存', exact: true }).isEnabled(), false);
    // 删除会清空选中；其它操作后选中仍在——下一轮 openMenu 的二次点击能纠正开关状态。
    await canvas.click({ position: { x: point[0], y: point[1] } });
  }
  await canvas.focus(); await canvas.press('Shift+F10');
  await panel.getByRole('dialog', { name: '物件操作', exact: true }).waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await panel.getByRole('dialog', { name: '物件操作', exact: true }).count(), 0);
}

export async function verifyCityGroupLibrary(page, panel, source) {
  await panel.getByRole('tab', { name: '據點組', exact: true }).click();
  const album = panel.getByRole('list', { name: '據點組素材相冊' });
  await album.locator('canvas').nth(3).waitFor();
  assert.equal(await album.getByRole('listitem').count(), 4);
  assert.equal(await album.getByRole('button').count(), 4, 'each city group supports placement');
  assert.equal(await album.locator('[title], [aria-describedby]').count(), 0);
  const asset = (source.editorAssets ?? source.mapEditorAssets).seasonAtlases.spring;
  const atlas = decodePNG(await readFile(new URL('../web/' + asset.url.replace(/^\//, ''), import.meta.url)));
  for (const item of cityGroupCatalog.items) {
    const card = album.locator(`[data-tile="catalog:${item.itemId}"]`);
    await card.scrollIntoViewIfNeeded();
    assert.equal(await card.getByText(item.name, { exact: true }).count(), 1);
    assert.equal(await card.getByText(`ID：catalog:${item.itemId}`, { exact: true }).count(), 1);
    const displayed = await card.locator('canvas').evaluate(node => {
      const ratio = devicePixelRatio, rgba = node.getContext('2d').getImageData(0, 0, node.width, node.height).data;
      const pixels = []; let crisp = true;
      for (let y = 0; y < node.clientHeight; y++) for (let x = 0; x < node.clientWidth; x++) {
        const offset = (y * ratio * node.width + x * ratio) * 4;
        pixels.push(...rgba.slice(offset, offset + 4));
        for (let dy = 0; dy < ratio; dy++) for (let dx = 0; dx < ratio; dx++) {
          const expanded = ((y * ratio + dy) * node.width + x * ratio + dx) * 4;
          for (let c = 0; c < 4; c++) if (rgba[expanded + c] !== rgba[offset + c]) crisp = false;
        }
      }
      const image = node.getBoundingClientRect(), card = node.closest('[role="listitem"]').getBoundingClientRect();
      return { width: node.clientWidth, height: node.clientHeight, backing: [node.width, node.height], ratio, pixels, crisp,
        fits: image.left >= card.left && image.right <= card.right && image.top >= card.top && image.bottom <= card.bottom };
    });
    const width = item.rows[0].length * 16, height = item.rows.length * 16, pixels = [];
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const tile = item.rows[Math.floor(y / 16)][Math.floor(x / 16)];
      const offset = ((Math.floor(tile / 16) * 16 + y % 16) * atlas.width + tile % 16 * 16 + x % 16) * 4;
      pixels.push(...atlas.pixels.slice(offset, offset + 4));
    }
    assert.deepEqual([displayed.width, displayed.height], [width, height]);
    assert.deepEqual(displayed.backing, [width * displayed.ratio, height * displayed.ratio]);
    assert.equal(displayed.crisp, true); assert.equal(displayed.fits, true);
    assert.deepEqual(displayed.pixels, pixels, `${item.itemId}: every pixel matches the complete spring recipe at native scale`);
    const preview = card.locator('.base-map-city-group-preview');
    await preview.focus(); await page.keyboard.press('Enter'); await page.keyboard.press('Escape');
    const from = await preview.boundingBox(), to = await panel.locator('.base-map-canvas').boundingBox();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2); await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 4 }); await page.mouse.up();
    assert.equal(await panel.getByRole('button', { name: '保存', exact: true }).isEnabled(), true, 'group drag stages decoration');
    await panel.getByRole('button', { name: '撤銷', exact: true }).click();
  }
  assert.equal(await album.evaluate(node => node.scrollWidth <= node.clientWidth), true, 'full IDs and native-size previews do not create horizontal overflow');
  const cards = await album.getByRole('listitem').evaluateAll(nodes => nodes.map(node => ({ x: node.offsetLeft, y: node.offsetTop })));
  assert.equal(new Set(cards.map(row => row.x)).size, 2, 'only city groups use two columns');
  assert.equal(cards[0].y, cards[1].y); assert.equal(cards[2].y, cards[3].y);
}

export async function verifyAtomicLibrary(page, panel, source) {
  const catalog = projectAtomicSpriteCatalog(source.componentDefinitions);
  const library = panel.locator('.base-map-library'), album = library.getByRole('list', { name: '原子素材相冊' });
  assert.equal(await library.locator('.base-map-library-tabs, .base-map-catalog-layers, .base-map-list').count(), 0);
  assert.deepEqual(await library.getByRole('tab').allTextContents(), ['地面', '山地', '水系', '農田', '牆體', '據點', '據點組', '道路']);
  for (const name of ['分類樣板', '原始／歷史素材', '我的素材', '基底', '裝飾', '水路', '橋梁', '海域', 'Web 編輯組合', '原始圖塊（高級）'])
    assert.equal(await library.getByRole('tab', { name, exact: true }).count(), 0);
  assert.equal(await album.locator('[title], [aria-describedby]').count(), 0, 'material cards have no hover descriptions');
  const original = JSON.stringify(source);
  assert.equal(await panel.locator('.base-map-seasons').count(), 0);
  for (const label of ['春', '夏', '秋', '冬']) assert.equal(await panel.getByRole('tab', { name: label, exact: true }).count(), 0);
  // Only spring is reachable in the workbench; four-season rendering is tested below the UI.
  const season = 'spring';
    await page.waitForFunction(() => !document.querySelector('.map-status')?.textContent.includes('圖集載入中'));
    assert.equal(await library.locator('.el-pagination').count(), 0, 'map-only lazy library has no pagination');
    const atlas = decodePNG(await readFile(new URL('../web/' + source.editorAssets.seasonAtlases[season].url.replace(/^\//, ''), import.meta.url)));
    let count = 0;
    for (const category of catalog.catalogCategories) {
      const items = catalog.catalogItems.filter(row => row.category === category.id);
      await selectAtomicTile(panel, source.componentDefinitions, Number(items.at(-1).id.slice(5)));
      {
        const first = 0;
        const displayed = await album.locator('canvas').evaluateAll(nodes => nodes.map(node => {
          const ratio = devicePixelRatio, rgba = node.getContext('2d').getImageData(0, 0, node.width, node.height).data;
          const pixels = [], scale = 2 * ratio;
          let crisp = true;
          for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
            const offset = (y * scale * node.width + x * scale) * 4;
            pixels.push(...rgba.slice(offset, offset + 4));
            for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
              const expanded = ((y * scale + dy) * node.width + x * scale + dx) * 4;
              for (let channel = 0; channel < 4; channel++) if (rgba[expanded + channel] !== rgba[offset + channel]) crisp = false;
            }
          }
          return { name: node.getAttribute('aria-label'), width: node.clientWidth, height: node.clientHeight, backing: node.width, backingHeight: node.height, ratio, pixels, crisp };
        }));
        assert.deepEqual(displayed.map(row => row.name), items.map(row => row.name));
        assert.deepEqual(await album.locator('[role="listitem"] > span').allTextContents(), items.map(row => `ID：${row.id.slice(5)}`));
        for (let i = 0; i < displayed.length; i++) {
          const item = displayed[i], tile = Number(items[first + i].id.slice(5));
          assert.deepEqual([item.width, item.height, item.backing, item.backingHeight], [32, 32, 32 * item.ratio, 32 * item.ratio]);
          assert.equal(item.crisp, true, 'each original pixel is a solid 2x2 CSS block, never smoothed');
          const pixels = [];
          for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
            const offset = ((Math.floor(tile / 16) * 16 + y) * atlas.width + tile % 16 * 16 + x) * 4;
            pixels.push(...atlas.pixels.slice(offset, offset + 4));
          }
          assert.deepEqual(item.pixels, pixels, `${season} byte${tile}: exact original atlas cell, not a crop of a multi-cell sample`);
        }
        assert.equal(await album.getByRole('button').count(), items.filter(row => row.canPlace).length);
        count += displayed.length;
      }
    }
    assert.equal(count, 238);
  assert.equal(JSON.stringify(source), original);
  assert.equal(await panel.getByRole('button', { name: '保存', exact: true }).isEnabled(), false, 'browsing never stages content');
}
