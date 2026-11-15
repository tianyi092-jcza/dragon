// Shared fresh-browser checks for fixture and real-HTTPS lanes. No API mocking here.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { decodePNG } from '../server/pngio.js';
import { projectAtomicSpriteCatalog } from '../editor-ui/src/mapatomiccatalog.js';
import { fitViewport, worldToScreen } from '../web/src/editor/viewport.js';

export async function selectAtomicTile(panel, definitions, tile) {
  const catalog = projectAtomicSpriteCatalog(definitions), item = catalog.catalogItems.find(row => row.id === `tile-${tile}`);
  assert.ok(item, `byte ${tile} must be a visible library item`);
  const category = catalog.catalogCategories.find(row => row.id === item.category);
  const tabs = panel.locator('.base-map-catalog-tabs');
  for (let step = 0; step < catalog.catalogCategories.length && await tabs.getByRole('tab', { name: category.name, exact: true }).getAttribute('aria-selected') !== 'true'; step++)
    await tabs.getByRole('tab', { selected: true }).press('ArrowRight');
  assert.equal(await tabs.getByRole('tab', { name: category.name, exact: true }).getAttribute('aria-selected'), 'true');
  const index = catalog.catalogItems.filter(row => row.category === item.category).findIndex(row => row.id === item.id);
  const jump = panel.locator('.el-pagination__jump input');
  await jump.fill(String(Math.floor(index / 25) + 1)); await jump.press('Enter');
  return panel.getByRole('button', { name: `${item.name}；拖至地圖或按Enter／空白鍵開始放置`, exact: true });
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

export async function verifyAtomicLibrary(page, panel, source) {
  const catalog = projectAtomicSpriteCatalog(source.componentDefinitions);
  const library = panel.locator('.base-map-library'), album = library.getByRole('list', { name: '原子素材相冊' });
  assert.equal(await library.locator('.base-map-library-tabs, .base-map-catalog-layers, .base-map-list').count(), 0);
  assert.deepEqual(await library.getByRole('tab').allTextContents(), ['地面', '山地', '水系', '農田', '牆體', '據點', '道路']);
  for (const name of ['分類樣板', '原始／歷史素材', '我的素材', '基底', '裝飾', '水路', '橋梁', '海域', 'Web 編輯組合', '原始圖塊（高級）'])
    assert.equal(await library.getByRole('tab', { name, exact: true }).count(), 0);
  assert.equal(await album.locator('[title], [aria-describedby]').count(), 0, 'material cards have no hover descriptions');
  const original = JSON.stringify(source);
  assert.equal(await panel.locator('.base-map-seasons').count(), 0);
  for (const label of ['春', '夏', '秋', '冬']) assert.equal(await panel.getByRole('tab', { name: label, exact: true }).count(), 0);
  // Only spring is reachable in the workbench; four-season rendering is tested below the UI.
  const season = 'spring';
    await page.waitForFunction(id => !document.getElementById(id).textContent.includes('圖集載入中'), await panel.getAttribute('id'));
    const atlas = decodePNG(await readFile(new URL('../web/' + source.editorAssets.seasonAtlases[season].url.replace(/^\//, ''), import.meta.url)));
    let count = 0;
    for (const category of catalog.catalogCategories) {
      const items = catalog.catalogItems.filter(row => row.category === category.id);
      for (let first = 0; first < items.length; first += 25) {
        await selectAtomicTile(panel, source.componentDefinitions, Number(items[first].id.slice(5)));
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
        assert.deepEqual(displayed.map(row => row.name), items.slice(first, first + 25).map(row => row.name));
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
        assert.equal(await album.getByRole('button').count(), items.slice(first, first + 25).filter(row => row.canPlace).length);
        count += displayed.length;
      }
    }
    assert.equal(count, 240);
  assert.equal(JSON.stringify(source), original);
  assert.equal(await panel.getByRole('button', { name: '保存', exact: true }).isEnabled(), false, 'browsing never stages content');
}
