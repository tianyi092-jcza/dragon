import test from 'node:test';
import assert from 'node:assert/strict';
import { projectAtomicSpriteCatalog } from '../src/mapatomiccatalog.js';

const definitions = () => Object.fromEntries(Array.from({ length: 256 }, (_, tile) => [`tile-${tile}`, {
  id: `tile-${tile}`, revision: 'original-byte-1', category: 'atomic-original', anchor: [0, 0], footprint: [[0, 0]],
  visualRef: `MMAP.MDL:tile-${tile}`, ruleRecipeRef: 'ki-byte-stamp-1', variants: { original: { tiles: [[0, 0, tile]] } },
}]));
const hidden = [72, 190, 203, 204, 206, 207, 209, 210, ...Array.from({ length: 10 }, (_, i) => i + 232)];
test('single atomic library keeps 256 source identities but exposes 238 cards in seven terminal categories', () => {
  const source = definitions(), before = JSON.stringify(source), result = projectAtomicSpriteCatalog(source);
  const byTile = Object.fromEntries(result.catalogItems.map(row => [Number(row.id.slice(5)), row]));
  assert.deepEqual(result.catalogCategories.map(row => row.name), ['地面', '山地', '水系', '農田', '牆體', '據點', '道路']);
  assert.deepEqual(result.catalogItems.map(row => row.id), Array.from({ length: 256 }, (_, tile) => tile).filter(tile => !hidden.includes(tile)).map(tile => `tile-${tile}`));
  assert.deepEqual(result.catalogAtoms.map(row => row.id), Array.from({ length: 256 }, (_, tile) => `tile-${tile}`));
  assert.ok(result.catalogItems.every(row => row.cells === 1 && row.available && !('tiles' in row) && !('variants' in row)));
  assert.equal(result.catalogItems.filter(row => row.canPlace).length, 238, 'all visible matched atoms can be stamped as decorations');
  for (const [tile, category] of [[0, 'ground'], [112, 'mountain'], [61, 'water'], [95, 'water'], [180, 'field'], [248, 'wall'], [255, 'city'], [196, 'road'], [184, 'road'], [191, 'road'], [202, 'road']])
    assert.equal(byTile[tile].category, category);
  for (const tile of [177, 95, 184, 191, 196, 205, 255]) assert.equal(byTile[tile].canPlace, true);
  assert.equal(byTile[72], undefined);
  assert.equal(byTile[190], undefined);
  for (const tile of Array.from({ length: 19 }, (_, index) => 184 + index).filter(tile => tile !== 190)) {
    assert.equal(byTile[tile].category, 'road', `bridge/road/waterway byte ${tile} shares the road browser category`);
    assert.equal(byTile[tile].canPlace, true, 'road artwork is placeable');
  }
  assert.equal(JSON.stringify(source), before);
});
test('only neutral center variants and common non-player parts remain in the city library, without erasing runtime resources', () => {
  const source = definitions(), before = JSON.stringify(source), result = projectAtomicSpriteCatalog(source);
  // KI 8A3F..8A74 / 8AD1..8AE9: neutral centers +2; non-player corners 222..231.
  // The corner family is shared by neutral/other owners, not exclusively neutral.
  for (const tile of hidden) {
    assert.equal(result.catalogItems.some(row => row.id === `tile-${tile}`), false);
    assert.equal(result.catalogAtoms[tile].id, `tile-${tile}`);
    assert.equal(result.catalogAtoms[tile].available, true);
    assert.ok(source[`tile-${tile}`]);
  }
  for (const tile of [205, 208, 211, ...Array.from({ length: 10 }, (_, i) => i + 222)])
    assert.equal(result.catalogItems.some(row => row.id === `tile-${tile}`), true);
  assert.equal(result.catalogItems.filter(row => row.category === 'city').length, 30);
  assert.ok(result.catalogItems.filter(row => row.category === 'city').every(row => row.canPlace));
  assert.equal(JSON.stringify(source), before);
});
test('visual shore correction keeps all ground and vegetation references on the first page without new capabilities', () => {
  const { catalogItems } = projectAtomicSpriteCatalog(definitions());
  const byTile = Object.fromEntries(catalogItems.map(row => [Number(row.id.slice(5)), row]));
  const ground = [0, 1, 2, 6, 8, 9, 16, 17, 18, 20, 29, 168, 176, 177, 178, 179, 182, 183];
  assert.deepEqual(catalogItems.filter(row => row.category === 'ground').map(row => Number(row.id.slice(5))), ground);
  assert.ok(ground.length <= 25, 'all vegetation references are visible on the default first page');
  for (const tile of Array.from({ length: 112 }, (_, i) => i).filter(tile => !hidden.includes(tile) && !ground.includes(tile)))
    assert.equal(byTile[tile].category, 'water', `reviewed blue-water/shore artwork ${tile}`);
  for (const tile of [7, 14, 15, 21, 22, 23, 24, 25]) assert.equal(byTile[tile].category, 'water', 'user-boxed screenshot cards');
  for (const tile of [6, 29, 168, 176, 177, 178, 179]) {
    assert.equal(byTile[tile].available, true, 'artwork is not missing');
    assert.equal(byTile[tile].canPlace, true, 'available artwork is placeable');
  }
  assert.equal(catalogItems.filter(row => row.category === 'water').length, 100);
  assert.equal(catalogItems.filter(row => row.canPlace).length, 238);
});
test('atom availability requires exact identity, never a matching multi-cell definition or category', () => {
  const source = definitions(); delete source['tile-112'];
  source['tile-113'].variants.original.tiles[0][2] = 114;
  source['tile-114'].minimapLandMask = [[0, 0]];
  const result = projectAtomicSpriteCatalog(source);
  for (const tile of [112, 113, 114]) {
    const row = result.catalogItems.find(row => row.id === `tile-${tile}`);
    assert.equal(row.available || row.canPlace, false);
  }
  assert.ok(projectAtomicSpriteCatalog().catalogItems.every(row => !row.available && !row.canPlace));
  result.catalogCategories[0].name = 'changed';
  assert.equal(projectAtomicSpriteCatalog(source).catalogCategories[0].name, '地面');
});
