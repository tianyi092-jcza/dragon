import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../src/mapspritecatalog.json' with { type: 'json' };
import { projectSpriteCatalog } from '../src/mapspritecatalog.js';
import { planSpriteMaterialization } from '../src/mapspriterecipes.js';

const definitions = () => Object.fromEntries([...catalog.components.map(item => [item.definitionRef, {
  id: item.definitionRef, revision: item.definitionRevision, category: item.definitionCategory,
  anchor: structuredClone(item.anchor), footprint: structuredClone(item.footprint), ruleRecipeRef: item.ruleRecipeRef,
  visualRef: 'MMAP.MDL:indexed-footprint',
  variants: { original: { tiles: structuredClone(item.tiles) } },
}]), ...[96, 97, 98, 99, 100, 101, 102, 103, 88, 89, 90, 91, 92, 93, 94, 104, 105, 106, 107, 108, 109, 110, 111, 112, 6, 180, 248, 16, 184, 185, 203, 204, 205, 0, 1, 2, 17, 18, 20, 32, 33, 36, 37, 48, 49, 52, 53, 196, 197, 198, 199, 200, 201, 3, 13, 19, 28, 181, 182, 183, 206, 207, 208, 209, 210, 211, 254, 255, 186, 187, 188, 189, 192, 193, 194, 195, 191, 202, 72, 190, 222, 224, 225, 226, 227, 228, 229, 230, 232, 233, 234, 235, 236, 237, 238, 239, 240, 241, 29, 251, 168, 176, 177, 178, 179, 212, 213, 214, 215, 216, 217, 218, 219, 220, 221, 252, 253, 21, 41, 42, 74, 75, 79].map(tile => [`tile-${tile}`, {
  id: `tile-${tile}`, revision: 'original-byte-1', category: 'atomic-original', visualRef: `MMAP.MDL:tile-${tile}`,
  anchor: [0, 0], footprint: [[0, 0]], ruleRecipeRef: 'ki-byte-stamp-1',
  variants: { original: { tiles: [[0, 0, tile]] } },
}])]);

test('catalog exposes 161 verified Web samples and DTOs, not source recipes', () => {
  const source = definitions(), before = JSON.stringify(source), result = projectSpriteCatalog(source);
  assert.equal(catalog.schema, 'map-sprite-catalog-1');
  assert.equal(new Set([...catalog.items, ...catalog.components].map(item => item.itemId)).size, 161);
  assert.equal(result.catalogCategories.length, 8);
  assert.deepEqual(result.catalogItems.map(row => [row.id, row.available, row.canPlace]), [
    ['tile-112', true, true], ['tile-6', true, false], ['tile-180', true, true], ['tile-248', true, true], ['tile-16', true, true],
    ...[184, 185, 203, 204, 205].map(tile => [`tile-${tile}`, true, false]),
    ...[0, 1, 2, 17, 18, 20].map(tile => [`tile-${tile}`, true, true]),
    ...[32, 33, 36, 37, 48, 49, 52, 53].map(tile => [`tile-${tile}`, true, false]),
    ...[196, 197, 198, 199, 200, 201].map(tile => [`tile-${tile}`, true, false]),
    ...[3, 13, 19, 28].map(tile => [`tile-${tile}`, true, false]),
    ...[181, 182, 183].map(tile => [`tile-${tile}`, true, true]),
    ...[206, 207, 208, 209, 210, 211, 254, 255].map(tile => [`tile-${tile}`, true, false]),
    ...[186, 187, 188, 189, 192, 193, 194, 195, 191, 202].map(tile => [`tile-${tile}`, true, false]),
    ...[29, 251, 168, 176, 177, 178, 179, 212, 213, 214, 215, 216, 217, 218, 219, 220, 221, 252, 253].map(tile => [`tile-${tile}`, true, false]),
    ['tile-21', true, false],
    ...[88, 89, 90, 91, 92, 93, 94, 104, 105, 106, 107, 108, 109, 110, 111].map(tile => [`tile-${tile}`, true, false]),
    ...[96, 97, 98, 99, 100, 101, 102, 103].map(tile => [`tile-${tile}`, true, false]),
    ...[41, 42, 74, 75, 79].map(tile => [`tile-${tile}`, true, false]),
    ...catalog.components.map(item => [item.definitionRef, true, item.support === 'existing-decoration']),
    ['tile-95', false, false],
  ]);
  assert.equal(result.catalogItems.at(-1).layer, 'base');
  assert.ok(result.catalogItems.every(row => !('source' in row) && !('variants' in row) && !('ruleRecipeRef' in row)));
  result.catalogItems[0].name = 'changed DTO'; result.catalogCategories[0].name = 'changed DTO';
  assert.notEqual(projectSpriteCatalog(source).catalogItems[0].name, 'changed DTO');
  assert.notEqual(projectSpriteCatalog(source).catalogCategories[0].name, 'changed DTO');
  assert.equal(JSON.stringify(source), before);
  assert.ok(projectSpriteCatalog().catalogItems.every(row => !row.available && !row.canPlace));
});

test('complete byte inventory separates known uses, unknown classification and missing map definitions', () => {
  const source = definitions(), before = JSON.stringify(source);
  const atoms = projectSpriteCatalog(source).catalogAtoms;
  assert.deepEqual(atoms.map(row => row.id), Array.from({ length: 256 }, (_, tile) => `tile-${tile}`));
  assert.deepEqual(atoms.filter(row => row.disposition === 'catalog-reference').map(row => row.id),
    [0, 1, 2, 16, 17, 18, 20, ...Array.from({ length: 64 }, (_, i) => 112 + i).filter(byte => byte !== 168), 180, 181, 182, 183, 223, 231, 248, 249, 250].map(tile => `tile-${tile}`));
  assert.deepEqual(atoms.filter(row => row.disposition === 'read-only-reference').map(row => row.id), [...Array.from({ length: 109 }, (_, i) => i + 3).filter(byte => ![16, 17, 18, 20, 72, 95].includes(byte)), 168, 176, 177, 178, 179, 184, 185, 186, 187, 188, 189, 191, 192, 193, 194, 195, 196, 197, 198, 199, 200, 201, 202, 203, 204, 205, 206, 207, 208, 209, 210, 211, 212, 213, 214, 215, 216, 217, 218, 219, 220, 221, 224, 225, 226, 227, 228, 229, 242, 243, 244, 245, 246, 247, 251, 252, 253, 254, 255].map(tile => `tile-${tile}`));
  assert.deepEqual(atoms.filter(row => row.disposition === 'base-preset').map(row => row.id), ['tile-95']);
  assert.equal(atoms.filter(row => row.disposition === 'pending-identification').length, 0);
  assert.deepEqual(atoms.filter(row => row.disposition === 'advanced-retained').map(row => row.id), [72, 190, 222, 230, 232, 233, 234, 235, 236, 237, 238, 239, 240, 241].map(tile => `tile-${tile}`));
  assert.notEqual(atoms[72].id, atoms[190].id, 'visual duplicates retain distinct byte identities');
  assert.equal(atoms[95].available, false, 'a known use never fabricates a missing definition');
  assert.equal(atoms[112].available, true);
  assert.ok(atoms.every(row => !('source' in row) && !('tiles' in row) && !('canPlace' in row)));
  assert.equal(JSON.stringify(source), before);
  source['tile-112'].variants.original.tiles[0][2] = 0;
  assert.equal(projectSpriteCatalog(source).catalogAtoms[112].available, false);
  atoms[112].note = 'mutated DTO';
  assert.notEqual(projectSpriteCatalog().catalogAtoms[112].note, 'mutated DTO');
  assert.equal(projectSpriteCatalog().catalogAtoms.length, 256);
  assert.ok(projectSpriteCatalog().catalogAtoms.every(row => !row.available));
});

test('sixteen reviewed coast outlines stay private read-only ground references without merging shared bytes', () => {
  const expected = [
    ['diagonal-neck', [84, 85, 70, 71], 3, [364, 155]], ['narrow-cape', [66, 67, 58, 59], 1, [364, 57]],
    ['rounded-head', [69, 7, 78, 23], 1, [373, 208]], ['fork-inlet', [40, 69, 56, 85], 1, [356, 59]],
    ['pointed-tip', [39, 47, 86, 63], 1, [333, 75]], ['lower-diagonal', [62, 87, 77, 71], 1, [136, 169]],
    ['rising-diagonal', [51, 46, 68, 61], 1, [173, 218]], ['right-notch', [76, 43, 0, 81], 1, [344, 65]],
    ['narrow-inlet', [0, 73, 86, 57], 1, [355, 234]], ['opposed-corners', [47, 82, 83, 95], 1, [156, 183]],
    ['rounded-bay', [51, 50, 95, 34], 1, [346, 168]], ['vertical-step', [26, 95, 19, 65], 4, [262, 61]],
    ['horizontal-step', [35, 95, 0, 11], 3, [308, 133]], ['right-angle', [27, 0, 95, 22], 2, [180, 205]],
    ['left-bay', [95, 14, 95, 30], 2, [165, 181]], ['right-cape', [0, 15, 0, 31], 1, [353, 242]],
  ];
  for (const [name, bytes, count, first] of expected) {
    const item = catalog.recipes.find(item => item.itemId === `coast-${name}-4-v1`);
    assert.deepEqual(item.tiles, bytes.map((tile, i) => [i % 2, Math.floor(i / 2), tile]));
    assert.deepEqual(item.footprint, [[0, 0], [1, 0], [0, 1], [1, 1]]);
    assert.deepEqual(item.source.firstWitness, first); assert.equal(item.source.occurrences, count);
    assert.equal(item.category, 'ground'); assert.equal(item.support, 'reference-only');
    assert.equal(item.geographyEffect, 'unresolved'); assert.equal('definitionRef' in item, false);
    const atoms = Object.fromEntries(bytes.map(tile => [`tile-${tile}`, {
      ...definitions()['tile-112'], id: `tile-${tile}`, visualRef: `MMAP.MDL:tile-${tile}`,
      variants: { original: { tiles: [[0, 0, tile]] } },
    }]));
    const plan = planSpriteMaterialization(atoms, item);
    assert.ok(plan); assert.equal(plan.canPlace, false);
    assert.deepEqual(plan.definition.variants.original.tiles, item.tiles);
    assert.throws(() => plan.place(...first, () => assert.fail('read-only coast allocates no IDs')), /僅供參考/);
    for (const byte of bytes) {
      let expected = 'read-only-reference';
      if (byte === 0) expected = 'catalog-reference';
      if (byte === 95) expected = 'base-preset';
      assert.equal(projectSpriteCatalog(atoms).catalogAtoms[byte].disposition, expected);
    }
    atoms[`tile-${bytes[0]}`].variants.original.tiles[0][2] = (bytes[0] + 1) % 256;
    assert.equal(planSpriteMaterialization(atoms, item), null);
  }
  assert.equal(catalog.recipes.filter(item => item.category === 'ground').length, 16);
});

test('closed pool is one private read-only outline, preserving its holes and sea-base identity', () => {
  const recipe = catalog.recipes.find(item => item.itemId === 'water-pool-outline-13-v1');
  const tiles = [[0, 0, 44], [1, 0, 55], [2, 0, 45], [0, 1, 38], [1, 1, 95], [2, 1, 54],
    [0, 2, 38], [1, 2, 95], [2, 2, 80], [0, 3, 38], [1, 3, 64], [0, 4, 60], [1, 4, 61]];
  assert.deepEqual(recipe.tiles, tiles);
  assert.deepEqual(recipe.footprint, tiles.map(([x, y]) => [x, y]));
  assert.deepEqual(recipe.source.firstWitness, [45, 2]);
  assert.equal(recipe.source.occurrences, 1);
  assert.equal(recipe.category, 'water');
  assert.equal(recipe.support, 'reference-only');
  assert.equal(recipe.geographyEffect, 'unresolved');
  assert.equal('definitionRef' in recipe, false);
  const atoms = Object.fromEntries(tiles.map(([, , tile]) => [`tile-${tile}`, {
    ...definitions()['tile-112'], id: `tile-${tile}`, visualRef: `MMAP.MDL:tile-${tile}`,
    variants: { original: { tiles: [[0, 0, tile]] } },
  }]));
  const plan = planSpriteMaterialization(atoms, recipe);
  assert.ok(plan); assert.equal(plan.canPlace, false);
  assert.deepEqual(plan.definition.footprint, recipe.footprint);
  assert.throws(() => plan.place(45, 2, () => assert.fail('read-only reference cannot allocate identities')), /僅供參考/);
  const projected = projectSpriteCatalog(atoms);
  for (const byte of [38, 44, 45, 54, 55, 60, 61, 64, 80]) assert.equal(projected.catalogAtoms[byte].disposition, 'read-only-reference');
  assert.equal(projected.catalogAtoms[95].disposition, 'base-preset');
  assert.ok(projected.catalogItems.every(item => item.itemId !== recipe.itemId), 'private recipe is not an existing source definition');
  delete atoms['tile-54'];
  assert.equal(planSpriteMaterialization(atoms, recipe), null);
});

test('fifteen native river strokes are distinct read-only primitives, not topology or water masks', () => {
  const tiles = [88, 89, 90, 91, 92, 93, 94, 104, 105, 106, 107, 108, 109, 110, 111];
  const items = catalog.items.filter(item => item.itemId.startsWith('river-stroke-'));
  assert.deepEqual(items.map(item => item.tile), tiles);
  const source = definitions(), rows = projectSpriteCatalog(source).catalogItems;
  for (const item of items) {
    assert.equal(item.category, 'water');
    assert.equal(item.support, 'reference-only');
    assert.equal(item.geographyEffect, 'unresolved');
    assert.deepEqual(item.anchor, [0, 0]);
    assert.deepEqual(item.footprint, [[0, 0]]);
    assert.equal(item.definitionRef, `tile-${item.tile}`);
    assert.ok(rows.find(row => row.itemId === item.itemId).available);
    assert.equal(rows.find(row => row.itemId === item.itemId).canPlace, false);
    const changed = definitions();
    changed[item.definitionRef].variants.original.tiles[0][2] = 95;
    assert.equal(projectSpriteCatalog(changed).catalogItems.find(row => row.itemId === item.itemId).available, false);
  }
  assert.equal(rows.filter(row => row.category === 'water').length, 25);
  assert.ok(rows.filter(row => row.category === 'water').every(row => !row.canPlace));
});

test('eight water mouths keep both four-direction families as exact read-only identities', () => {
  const items = catalog.items.filter(item => item.itemId.startsWith('water-mouth-'));
  assert.deepEqual(items.map(item => item.tile), [96, 97, 98, 99, 100, 101, 102, 103]);
  const rows = projectSpriteCatalog(definitions()).catalogItems;
  for (const item of items) {
    assert.equal(item.category, 'water');
    assert.equal(item.support, 'reference-only');
    assert.equal(item.geographyEffect, 'unresolved');
    assert.deepEqual(item.footprint, [[0, 0]]);
    assert.equal(item.definitionRef, `tile-${item.tile}`);
    assert.ok(rows.find(row => row.itemId === item.itemId).available);
    assert.equal(rows.find(row => row.itemId === item.itemId).canPlace, false);
    const changed = definitions();
    changed[item.definitionRef].variants.original.tiles[0][2] = item.tile < 100 ? item.tile + 4 : item.tile - 4;
    assert.equal(projectSpriteCatalog(changed).catalogItems.find(row => row.itemId === item.itemId).available, false,
      'same apparent direction does not permit substituting the other shore profile');
  }
  assert.equal(catalog.items.filter(item => item.category === 'water').length
    + catalog.components.filter(item => item.category === 'water').length
    + catalog.recipes.filter(item => item.category === 'water').length, 26);
});

test('advanced-retained duplicates remain two exact identities without default cards or placement grants', () => {
  const source = definitions(), result = projectSpriteCatalog(source);
  assert.equal(result.catalogItems.length, 162);
  assert.ok(result.catalogItems.every(row => row.id !== 'tile-72' && row.id !== 'tile-190'));
  for (const tile of [72, 190]) {
    const row = result.catalogAtoms[tile];
    assert.equal(row.available, true);
    assert.equal(row.label, '高級保留');
    assert.ok(row.note.includes('原機制用途仍未知'));
    assert.equal('canPlace' in row, false);
  }
  source['tile-72'].variants.original.tiles[0][2] = 190;
  assert.equal(projectSpriteCatalog(source).catalogAtoms[72].available, false, 'equal pixels never substitute the other original byte');
  assert.equal(projectSpriteCatalog(source).catalogAtoms[190].available, true);
});

test('native city color parts stay advanced references, not extra default objects or recoloring controls', () => {
  const source = definitions(), before = JSON.stringify(source), result = projectSpriteCatalog(source);
  const tiles = [222, 230, 232, 233, 234, 235, 236, 237, 238, 239, 240, 241];
  assert.equal(result.catalogItems.length, 162);
  for (const tile of tiles) {
    const row = result.catalogAtoms[tile];
    assert.equal(row.available, true);
    assert.equal(row.disposition, 'advanced-retained');
    assert.ok(row.note.includes('原8AD1城角兩色族'));
    assert.ok(row.note.includes('224..229由雙格轉角／三格邊緣參考引用'));
    assert.equal(row.note.includes('18個零件'), false, 'retention wording must not preserve the old membership count');
    assert.equal('canPlace' in row, false);
    assert.ok(!result.catalogItems.some(item => item.id === row.id));
  }
  for (const tile of [223, 231]) assert.equal(result.catalogAtoms[tile].disposition, 'catalog-reference');
  assert.equal(JSON.stringify(source), before);
  source['tile-232'].variants.original.tiles[0][2] = 222;
  assert.equal(projectSpriteCatalog(source).catalogAtoms[232].available, false);
});

test('twenty-one slope recipes retain distinct tails, missing corners and exact complete bytes', () => {
  const slopes = catalog.components.filter(item => item.itemId.startsWith('mountain-slope-'));
  assert.equal(slopes.length, 21);
  assert.deepEqual([...new Set(slopes.flatMap(item => item.tiles.map(([, , tile]) => tile)))].sort((a, b) => a - b),
    [112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127, 128, 129, 130, 131, 132, 133, 134, 135, 136, 138, 139, 140, 141, 143, 144, 145, 146, 147, 148, 149, 150, 152, 155, 156, 159, 162, 163, 171, 173, 175]);
  for (const item of slopes) {
    const source = definitions();
    assert.equal(projectSpriteCatalog(source).catalogItems.find(row => row.itemId === item.itemId).canPlace, true);
    source[item.definitionRef].variants.original.tiles.at(-1)[2] = 95;
    assert.equal(projectSpriteCatalog(source).catalogItems.find(row => row.itemId === item.itemId).available, false);
    const width = Math.max(...item.footprint.map(([x]) => x)) + 1;
    const height = Math.max(...item.footprint.map(([, y]) => y)) + 1;
    const hole = Array.from({ length: width * height }, (_, n) => [n % width, Math.floor(n / width)])
      .find(([x, y]) => !item.footprint.some(([dx, dy]) => dx === x && dy === y));
    if (hole) {
      const filled = definitions();
      filled[item.definitionRef].footprint.push(hole);
      filled[item.definitionRef].variants.original.tiles.push([...hole, 0]);
      assert.equal(projectSpriteCatalog(filled).catalogItems.find(row => row.itemId === item.itemId).available, false);
    }
  }
  const a = slopes.find(item => item.itemId === 'mountain-slope-west-open-5a-v1');
  const b = slopes.find(item => item.itemId === 'mountain-slope-west-open-5b-v1');
  assert.deepEqual(a.footprint, b.footprint);
  assert.notDeepEqual(a.tiles, b.tiles, 'same outline does not merge byte125 and byte118 endings');
});

test('small G05 candidates preserve four complete outlines without promoting the crown-containing alternative', () => {
  const items = ['east-tall-8', 'lower-7', 'west-tail-7', 'west-open-7']
    .map(name => catalog.components.find(item => item.itemId === `mountain-slope-${name}-v1`));
  assert.deepEqual(items.map(item => [item.itemId, item.tiles.length,
    Math.max(...item.footprint.map(([x]) => x)) + 1, Math.max(...item.footprint.map(([, y]) => y)) + 1]), [
    ['mountain-slope-east-tall-8-v1', 8, 2, 5], ['mountain-slope-lower-7-v1', 7, 4, 2],
    ['mountain-slope-west-tail-7-v1', 7, 2, 4], ['mountain-slope-west-open-7-v1', 7, 2, 4],
  ]);
  assert.ok(items.every(item => item.support === 'existing-decoration' && item.geographyEffect === 'preserve-underlay'));
  assert.ok(!catalog.components.some(item => item.definitionRef === 'web-piece-afd49b95b7d3681e13ff836d86a7d50c773ddc6766c1f597a313aac7ec1d4053'));
  const atoms = projectSpriteCatalog(definitions()).catalogAtoms;
  for (const byte of [117, 128, 134]) assert.equal(atoms[byte].disposition, 'catalog-reference');
  assert.equal(atoms[179].disposition, 'read-only-reference');
});

test('reviewed medium G05 outlines keep full shapes without promoting mixed crowns or every minimum candidate', () => {
  const expected = [['face-12', 12, 4, 3, 1, [124, 32]], ['east-hook-9', 9, 3, 4, 5, [288, 192]],
    ['lower-steps-14', 14, 6, 3, 1, [90, 48]], ['upper-steps-14', 14, 7, 3, 1, [180, 237]],
    ['narrow-tail-10', 10, 2, 6, 1, [192, 48]]];
  for (const [name, cells, width, height, occurrences, firstWitness] of expected) {
    const item = catalog.components.find(item => item.itemId === `mountain-slope-${name}-v1`);
    assert.equal(item.tiles.length, cells);
    assert.equal(Math.max(...item.footprint.map(([x]) => x)) + 1, width);
    assert.equal(Math.max(...item.footprint.map(([, y]) => y)) + 1, height);
    assert.deepEqual(item.anchor, [0, 0]);
    assert.deepEqual(item.footprint, item.tiles.map(([x, y]) => [x, y]));
    assert.equal(item.source.occurrences, occurrences);
    assert.deepEqual(item.source.firstWitness, firstWitness);
    assert.equal(item.support, 'existing-decoration');
    assert.equal(item.geographyEffect, 'preserve-underlay');
    assert.ok(item.tiles.every(([, , byte]) => ![168, 177, 179].includes(byte)));
  }
  const atoms = projectSpriteCatalog(definitions()).catalogAtoms;
  for (const byte of [121, 123, 127, 143, 144, 147, 150, 152, 163, 171]) assert.equal(atoms[byte].disposition, 'catalog-reference');
  for (const byte of [168, 177, 179]) assert.equal(atoms[byte].disposition, 'read-only-reference');
});

test('nonminimum complete slope alternatives do not crop crowns out of existing identities', () => {
  const expected = [['stepped-face-13', 13, 3, 5, [96, 155]], ['shoulder-10', 10, 4, 3, [140, 48]]];
  for (const [name, cells, width, height, firstWitness] of expected) {
    const item = catalog.components.find(item => item.itemId === `mountain-slope-${name}-v1`);
    assert.equal(item.tiles.length, cells);
    assert.equal(Math.max(...item.footprint.map(([x]) => x)) + 1, width);
    assert.equal(Math.max(...item.footprint.map(([, y]) => y)) + 1, height);
    assert.deepEqual(item.footprint, item.tiles.map(([x, y]) => [x, y]));
    assert.deepEqual(item.anchor, [0, 0]);
    assert.deepEqual(item.source.firstWitness, firstWitness);
    assert.equal(item.source.occurrences, 1);
    assert.equal(item.support, 'existing-decoration');
    assert.equal(item.geographyEffect, 'preserve-underlay');
  }
  for (const id of ['da5e043cb108818463f90fc4fc75f972a09f0328c6879418943a69976b6fc459', '1aea13b5da0fd60dc3d59dbe679dded0da9916969545fa6cab01c828a0d78fea']) {
    assert.ok(!catalog.components.some(item => item.definitionRef === `web-piece-${id}`));
  }
  const atoms = projectSpriteCatalog(definitions()).catalogAtoms;
  for (const byte of [135, 139, 156]) assert.equal(atoms[byte].disposition, 'catalog-reference');
});

test('reviewed larger slope faces preserve empty anchors and do not promote unreviewed large fragments', () => {
  const expected = [['double-face-18', 18, 5, 4, [42, 44], true],
    ['tall-face-20', 20, 5, 6, [7, 122], false], ['upper-face-22', 22, 5, 5, [27, 224], false]];
  for (const [name, cells, width, height, witness, occupiedAnchor] of expected) {
    const item = catalog.components.find(item => item.itemId === `mountain-slope-${name}-v1`);
    assert.equal(item.tiles.length, cells);
    assert.equal(Math.max(...item.footprint.map(([x]) => x)) + 1, width);
    assert.equal(Math.max(...item.footprint.map(([, y]) => y)) + 1, height);
    assert.deepEqual(item.anchor, [0, 0]);
    assert.deepEqual(item.footprint, item.tiles.map(([x, y]) => [x, y]));
    assert.equal(item.footprint.some(([x, y]) => x === 0 && y === 0), occupiedAnchor);
    assert.deepEqual(item.source.firstWitness, witness);
    assert.equal(item.source.occurrences, 1);
    assert.equal(item.support, 'existing-decoration');
    assert.equal(item.geographyEffect, 'preserve-underlay');
  }
  const atoms = projectSpriteCatalog(definitions()).catalogAtoms;
  for (const byte of [119, 141, 145, 146, 155, 159, 173]) assert.equal(atoms[byte].disposition, 'catalog-reference');
});

test('compact recipe has a separate program identity, original witness and four newly referenced bytes', () => {
  const recipe = catalog.recipes.find(item => item.itemId === 'mountain-slope-compact-4-v1');
  assert.equal(catalog.recipes.length, 27);
  assert.equal(recipe.itemId, 'mountain-slope-compact-4-v1');
  assert.equal('definitionRef' in recipe, false, 'never borrow a legacy cropped-piece identity');
  assert.deepEqual(recipe.tiles, [[0, 0, 166], [1, 0, 160], [0, 1, 161], [1, 1, 174]]);
  assert.deepEqual(recipe.source.firstWitness, [209, 7]); assert.equal(recipe.source.occurrences, 12);
  const result = projectSpriteCatalog(definitions());
  assert.ok(!result.catalogItems.some(row => row.itemId === recipe.itemId), 'private canvas owns availability and materialization');
  for (const byte of [160, 161, 166, 174]) assert.equal(result.catalogAtoms[byte].disposition, 'catalog-reference');
});

test('nine reviewed slope windows preserve explicit orientation and cover the remaining thirteen mountain bytes', () => {
  const cases = [
    ['diagonal', [166, 170, 154, 167], 2, [38, 85]], ['fold', [143, 172, 169, 143], 4, [46, 63]],
    ['lower-turn', [129, 122, 164, 165], 2, [232, 192]], ['upper-turn', [128, 137, 128, 128], 27, [2, 102]],
    ['horizontal', [131, 131, 151, 151], 12, [89, 43]], ['double-step', [130, 142, 120, 130], 8, [14, 53]],
    ['narrow-face', [144, 153, 120, 169], 1, [135, 108]], ['notched-face', [145, 122, 158, 172], 1, [2, 156]],
    ['lower-face', [157, 129, 167, 126], 1, [9, 128]],
  ];
  for (const [suffix, bytes, count, first] of cases) {
    const item = catalog.recipes.find(item => item.itemId === `mountain-slope-${suffix}-4-v1`);
    assert.deepEqual(item.tiles, bytes.map((tile, i) => [i % 2, Math.floor(i / 2), tile]));
    assert.deepEqual(item.footprint, [[0, 0], [1, 0], [0, 1], [1, 1]]);
    assert.deepEqual(item.anchor, [0, 0]); assert.equal(item.ruleRecipeRef, 'ki-byte-stamp-1');
    assert.deepEqual(item.source.firstWitness, first); assert.equal(item.source.occurrences, count);
    assert.equal(item.support, 'existing-decoration'); assert.equal(item.geographyEffect, 'preserve-underlay');
    assert.equal('definitionRef' in item, false);
  }
  const atoms = projectSpriteCatalog(definitions()).catalogAtoms;
  for (const byte of [137, 142, 151, 153, 154, 157, 158, 164, 165, 167, 169, 170, 172]) assert.equal(atoms[byte].disposition, 'catalog-reference');
  assert.equal(atoms[168].disposition, 'read-only-reference', 'fixed crown is not promoted by nearby slope recipes');
});

test('shore fragments retain complete original pairs without granting geography or placement', () => {
  const cases = [
    ['shallow-arc', [[0, 0, 5], [1, 0, 4]], 3, [189, 96]],
    ['left-line', [[0, 0, 8], [0, 1, 10]], 13, [142, 85]],
    ['upper-line', [[0, 0, 9], [1, 0, 9]], 39, [33, 20]],
    ['lower-bend', [[0, 0, 12], [1, 0, 25]], 12, [285, 44]],
    ['right-line', [[0, 0, 24], [0, 1, 24]], 27, [277, 24]],
    ['lower-line', [[0, 0, 25], [1, 0, 25]], 30, [266, 56]],
  ];
  for (const [name, tiles, count, first] of cases) {
    const item = catalog.components.find(item => item.itemId === `shore-${name}-2-v1`);
    assert.deepEqual(item.tiles, tiles);
    assert.deepEqual(item.footprint, tiles.map(([x, y]) => [x, y]));
    assert.equal(item.source.occurrences, count);
    assert.deepEqual(item.source.firstWitness, first);
    assert.equal(item.definitionCategory, 'ground-shore-pattern');
    assert.equal(item.support, 'reference-only');
    assert.equal(item.geographyEffect, 'unresolved');
    const source = definitions();
    const row = projectSpriteCatalog(source).catalogItems.find(row => row.itemId === item.itemId);
    assert.equal(row.available, true); assert.equal(row.canPlace, false);
    source[item.definitionRef].variants.original.tiles[1][2] = 95;
    assert.equal(projectSpriteCatalog(source).catalogItems.find(row => row.itemId === item.itemId).available, false);
  }
  const result = projectSpriteCatalog(definitions());
  const shores = result.catalogItems.filter(row => row.itemId.startsWith('shore-'));
  assert.equal(shores.length, 7);
  assert.ok(shores.every(row => row.category === 'ground' && row.available && !row.canPlace),
    'design §6.2 puts coasts under ground; display category never grants placement');
  assert.equal(result.catalogItems.find(row => row.id === 'tile-21').canPlace, false);
  for (const byte of [4, 5, 8, 9, 10, 12, 21, 24, 25]) assert.equal(result.catalogAtoms[byte].disposition, 'read-only-reference');
  for (const byte of [11, 14, 15, 22, 26, 27]) assert.equal(result.catalogAtoms[byte].disposition, 'read-only-reference');
  for (const byte of [7, 23]) assert.equal(result.catalogAtoms[byte].disposition, 'read-only-reference', 'v40 reviewed rounded head is a reference, not a new water brush');
});

test('complete city edge recipes remain read-only and relocate referenced corners without merging identities', () => {
  const source = definitions(), rows = projectSpriteCatalog(source).catalogItems.filter(row => row.itemId.startsWith('city-edge-'));
  assert.equal(rows.length, 4);
  assert.ok(rows.every(row => row.available && !row.canPlace && row.cells === 3 && row.category === 'city'));
  for (const item of catalog.components.filter(item => item.itemId.startsWith('city-edge-'))) {
    const changed = definitions();
    changed[item.definitionRef].variants.original.tiles[1][2]++;
    assert.equal(projectSpriteCatalog(changed).catalogItems.find(row => row.itemId === item.itemId).available, false);
  }
  const atoms = projectSpriteCatalog(source).catalogAtoms;
  for (const tile of [226, 227, 228, 229, 242, 243, 244, 245]) assert.equal(atoms[tile].disposition, 'read-only-reference');
  for (const tile of [236, 237, 238, 239]) assert.equal(atoms[tile].disposition, 'advanced-retained');
});

test('G11 corner pairs and wall references preserve exact identities without placement grants', () => {
  const source = definitions(), before = JSON.stringify(source), result = projectSpriteCatalog(source);
  const pairs = catalog.components.filter(item => item.itemId.startsWith('city-corner-'));
  assert.equal(pairs.length, 4);
  for (const item of pairs) {
    const row = result.catalogItems.find(row => row.itemId === item.itemId);
    assert.ok(row.available && !row.canPlace && row.cells === 2);
    const changed = definitions(); changed[item.definitionRef].variants.original.tiles.reverse();
    assert.equal(projectSpriteCatalog(changed).catalogItems.find(row => row.itemId === item.itemId).available, false);
  }
  for (const tile of [252, 253]) {
    const row = result.catalogItems.find(row => row.id === `tile-${tile}`);
    assert.ok(row.available && !row.canPlace && row.category === 'wall');
    assert.ok(row.note.includes('地理作用域未確認') && !row.note.includes('水域'));
    const changed = definitions(); changed[`tile-${tile}`].variants.original.tiles[0][2] = tile === 252 ? 253 : 252;
    assert.equal(projectSpriteCatalog(changed).catalogItems.find(row => row.id === `tile-${tile}`).available, false);
  }
  for (const tile of [224, 225, 246, 247, 252, 253]) assert.equal(result.catalogAtoms[tile].disposition, 'read-only-reference');
  for (const tile of [234, 235]) assert.equal(result.catalogAtoms[tile].disposition, 'advanced-retained');
  assert.equal(JSON.stringify(source), before);
});

test('native node-boundary atoms grant no placement and keep each direction identity across pagination', () => {
  const source = definitions(), before = JSON.stringify(source);
  const rows = projectSpriteCatalog(source).catalogItems.filter(row => row.category === 'city');
  assert.equal(rows.length, 30);
  assert.equal(rows.slice(25).length, 5);
  for (const tile of [212, 213, 214, 215, 216, 217, 218, 219, 220, 221]) {
    const row = rows.find(item => item.itemId === `city-boundary-${tile}-v1`);
    assert.equal(row.available, true); assert.equal(row.canPlace, false); assert.equal(row.cells, 1);
    const changed = definitions();
    changed[`tile-${tile}`].variants.original.tiles[0][2] = tile === 221 ? 220 : tile + 1;
    assert.equal(projectSpriteCatalog(changed).catalogItems.find(item => item.id === `tile-${tile}`).available, false);
  }
  assert.equal(JSON.stringify(source), before);
});

test('G06 crown textures remain exact references across the ground album page boundary', () => {
  const source = definitions(), before = JSON.stringify(source), rows = projectSpriteCatalog(source).catalogItems;
  const ground = rows.filter(row => row.category === 'ground');
  assert.equal(ground.length, 39);
  assert.equal(ground.slice(25).length, 14);
  assert.deepEqual(ground.slice(25, 27).map(row => row.id), ['tile-178', 'tile-179']);
  assert.deepEqual(ground.slice(27).map(row => row.itemId), ['shore-fine-corner-21-v1',
    ...[41, 42, 74, 75, 79].map(tile => `coast-edge-${tile}-v1`),
    ...['shallow-arc', 'left-line', 'upper-line', 'lower-bend', 'right-line', 'lower-line'].map(name => `shore-${name}-2-v1`)]);
  for (const tile of [168, 176, 177, 178, 179]) {
    const row = ground.find(item => item.id === `tile-${tile}`);
    assert.equal(row.available, true);
    assert.equal(row.canPlace, false);
    assert.ok(row.note.includes('地表外觀參考；地理作用域未確認'));
  }
  assert.equal(JSON.stringify(source), before);
  source['tile-177'].variants.original.tiles[0][2] = 178;
  assert.equal(projectSpriteCatalog(source).catalogItems.find(row => row.id === 'tile-177').available, false);
});

test('warm mottle and variable-offset gate cap remain exact read-only references', () => {
  const source = definitions(), before = JSON.stringify(source), result = projectSpriteCatalog(source);
  for (const [tile, category] of [[29, 'ground'], [251, 'city']]) {
    const row = result.catalogItems.find(item => item.id === `tile-${tile}`);
    assert.equal(row.category, category);
    assert.equal(row.available, true);
    assert.equal(row.canPlace, false);
    assert.equal(result.catalogAtoms[tile].disposition, 'read-only-reference');
  }
  assert.equal(JSON.stringify(source), before);
  assert.ok(result.catalogItems.find(row => row.id === 'tile-29').note.includes('地表外觀參考'));
  source['tile-29'].variants.original.tiles[0][2] = 6;
  source['tile-251'].variants.original.tiles[0][2] = 230;
  assert.ok(projectSpriteCatalog(source).catalogItems.filter(row => ['tile-29', 'tile-251'].includes(row.id)).every(row => !row.available));
});

test('bridge-bank and blue road references never become sea presets or interchangeable bytes', () => {
  const source = definitions(), before = JSON.stringify(source), result = projectSpriteCatalog(source);
  for (const tile of [186, 187, 188, 189, 192, 193, 194, 195, 191, 202]) {
    const row = result.catalogItems.find(item => item.id === `tile-${tile}`);
    assert.equal(row.category, 'road');
    assert.equal(row.available, true);
    assert.equal(row.canPlace, false);
    assert.ok(row.note.includes('不可新建道路／橋梁'));
  }
  assert.equal(JSON.stringify(source), before);
  for (const tile of [191, 202]) {
    source[`tile-${tile}`].variants.original.tiles[0][2] = 95;
    assert.equal(projectSpriteCatalog(source).catalogItems.find(row => row.id === `tile-${tile}`).available, false);
  }
});

test('road and city references never advertise placement or claim water-only restrictions', () => {
  const rows = projectSpriteCatalog(definitions()).catalogItems;
  for (const [category, count, reason] of [['road', 18, '不可新建道路／橋梁'], ['city', 30, '不可新建／搬移據點']]) {
    const references = rows.filter(row => row.category === category);
    assert.equal(references.length, count);
    assert.ok(references.every(row => row.available && !row.canPlace && row.note.includes(reason)));
  }
});

test('city interior references preserve byte 255 as a literal asset, not an empty or signed sentinel', () => {
  const source = definitions();
  const rows = projectSpriteCatalog(source).catalogItems.filter(row => row.itemId.startsWith('city-interior-'));
  assert.deepEqual(rows.map(row => [row.id, row.available, row.canPlace]), [['tile-254', true, false], ['tile-255', true, false]]);
  assert.ok(rows.every(row => row.category === 'city'));
  assert.equal(projectSpriteCatalog(source).catalogAtoms[255].available, true);
  for (const replacement of [-1, 254]) {
    source['tile-255'].variants.original.tiles[0][2] = replacement;
    assert.equal(projectSpriteCatalog(source).catalogItems.find(row => row.id === 'tile-255').available, false);
    assert.equal(projectSpriteCatalog(source).catalogAtoms[255].available, false);
  }
});

test('two gate color families stay six literal read-only identities without recoloring or rotation', () => {
  const source = definitions();
  const rows = projectSpriteCatalog(source).catalogItems.filter(row => row.itemId.startsWith('gate-'));
  assert.deepEqual(rows.map(row => row.id), [206, 207, 208, 209, 210, 211].map(tile => `tile-${tile}`));
  assert.ok(rows.every(row => row.available && !row.canPlace && row.category === 'city'));
  for (const tile of [207, 208, 209]) {
    source['tile-206'].variants.original.tiles[0][2] = tile;
    assert.equal(projectSpriteCatalog(source).catalogItems.find(row => row.id === 'tile-206').available, false);
  }
});

test('four road turns and two straights preserve six independent read-only byte identities', () => {
  const rows = projectSpriteCatalog(definitions()).catalogItems.filter(row => /^road-(ne|nw|se|sw|horizontal|vertical)-/.test(row.itemId));
  assert.deepEqual(rows.map(row => row.id), [196, 197, 198, 199, 200, 201].map(tile => `tile-${tile}`));
  assert.ok(rows.every(row => row.available && !row.canPlace && row.category === 'road'));
  const source = definitions();
  source['tile-200'].variants.original.tiles[0][2] = 201;
  assert.equal(projectSpriteCatalog(source).catalogItems.find(row => row.id === 'tile-200').available, false);
});

test('four field corners retain distinct holes, including an unoccupied anchor', () => {
  const corners = catalog.components.filter(item => item.itemId.startsWith('field-corner-'));
  assert.deepEqual(corners.map(item => item.tiles), [
    [[0, 0, 180], [1, 0, 180], [0, 1, 180]], [[0, 0, 180], [1, 0, 180], [1, 1, 180]],
    [[0, 0, 180], [0, 1, 180], [1, 1, 180]], [[1, 0, 180], [0, 1, 180], [1, 1, 180]],
  ]);
  assert.equal(new Set(corners.map(item => item.definitionRef)).size, 4);
  for (const item of corners) {
    const source = definitions(), hole = [[0, 0], [1, 0], [0, 1], [1, 1]]
      .find(([x, y]) => !item.footprint.some(([dx, dy]) => dx === x && dy === y));
    source[item.definitionRef].footprint.push(hole);
    source[item.definitionRef].variants.original.tiles.push([...hole, 180]);
    assert.equal(projectSpriteCatalog(source).catalogItems.find(row => row.itemId === item.itemId).available, false);
  }
});

test('mountain step pieces keep their original holes and cannot become solid rectangles', () => {
  for (const [itemId, hole] of [['mountain-step-up-3-v1', [0, 0]], ['mountain-step-down-3-v1', [1, 1]]]) {
    const item = catalog.components.find(item => item.itemId === itemId), source = definitions();
    assert.deepEqual(item.anchor, [0, 0]);
    assert.equal(item.tiles.length, 3);
    assert.ok(!item.footprint.some(([x, y]) => x === hole[0] && y === hole[1]));
    assert.equal(projectSpriteCatalog(source).catalogItems.find(row => row.itemId === itemId).canPlace, true);
    source[item.definitionRef].footprint.push(hole);
    source[item.definitionRef].variants.original.tiles.push([...hole, 0]);
    assert.equal(projectSpriteCatalog(source).catalogItems.find(row => row.itemId === itemId).available, false);
  }
});

test('G07 textures retain their separate bytes instead of inheriting the adjacent farm label', () => {
  const source = definitions(), rows = projectSpriteCatalog(source).catalogItems.filter(row => ['tile-181', 'tile-182', 'tile-183'].includes(row.id));
  assert.deepEqual(rows.map(row => [row.id, row.category, row.available, row.canPlace]), [
    ['tile-181', 'field', true, true], ['tile-182', 'ground', true, true], ['tile-183', 'ground', true, true],
  ]);
  source['tile-182'].variants.original.tiles[0][2] = 183;
  assert.equal(projectSpriteCatalog(source).catalogItems.find(row => row.id === 'tile-182').available, false);
});

test('ground variants retain byte zero and do not absorb ambiguous edges', () => {
  const rows = projectSpriteCatalog(definitions()).catalogItems.filter(row => row.category === 'ground' && row.canPlace);
  assert.deepEqual(rows.map(row => row.id), [16, 0, 1, 2, 17, 18, 20, 182, 183].map(tile => `tile-${tile}`));
  assert.ok(rows.every(row => row.available && row.canPlace));
  for (const tile of [3, 13, 19, 28]) {
    const source = definitions(), result = projectSpriteCatalog(source);
    assert.equal(result.catalogAtoms[tile].disposition, 'read-only-reference');
    assert.equal(result.catalogItems.find(row => row.id === `tile-${tile}`).canPlace, false);
    source[`tile-${tile}`].variants.original.tiles[0][2] = 0;
    assert.equal(projectSpriteCatalog(source).catalogItems.find(row => row.id === `tile-${tile}`).available, false,
      'a tiny corner cannot be replaced by a nearly identical plain ground texture');
  }
});

test('coast directions, fine corners and final curved edges remain independent references, never implicit brushes', () => {
  const source = definitions(), rows = projectSpriteCatalog(source).catalogItems.filter(row => row.itemId.startsWith('coast-'));
  assert.deepEqual(rows.map(row => row.id), [32, 33, 36, 37, 48, 49, 52, 53, 3, 13, 19, 28, 41, 42, 74, 75, 79].map(tile => `tile-${tile}`));
  assert.ok(rows.every(row => row.available && !row.canPlace && row.category === 'ground' && row.note.includes('不據像素補地理遮罩')));
  source['tile-32'].variants.original.tiles[0][2] = 33;
  const changed = projectSpriteCatalog(source).catalogItems.find(row => row.id === 'tile-32');
  assert.equal(changed.available, false, 'another direction cannot masquerade as the same identity');
  assert.equal(changed.canPlace, false);
});

test('same ID alone never admits a changed recipe, anchor, mask or variant', () => {
  const patches = [
    { id: 'other' }, { revision: 'author-byte-stamp-1' }, { category: 'author-multicell' },
    { ruleRecipeRef: 'unknown' }, { visualRef: 'unknown' }, { anchor: [1, 0] }, { footprint: [[0, 0], [1, 0]] },
    { variants: { original: { tiles: [[0, 0, 113]] } } },
    { variants: { alternate: { tiles: [[0, 0, 112]] } } },
    { variants: { original: { tiles: [[0, 0, 112]] }, alternate: { tiles: [[0, 0, 112]] } } },
    { geographyMask: [[0, 0]] }, { authorWaterClass: 'river' },
  ];
  for (const patch of patches) {
    const source = definitions(); Object.assign(source['tile-112'], patch);
    const row = projectSpriteCatalog(source).catalogItems[0];
    assert.equal(row.available, false, JSON.stringify(patch)); assert.equal(row.canPlace, false);
  }
  const source = definitions(); delete source['tile-112'];
  assert.equal(projectSpriteCatalog(source).catalogItems[0].available, false);
});

test('each multi-cell entry requires its full exact recipe and preserves original geometry', () => {
  for (const item of catalog.components) {
    const source = definitions(), row = () => projectSpriteCatalog(source).catalogItems.find(row => row.itemId === item.itemId);
    assert.equal(row().cells, item.tiles.length);
    assert.equal(row().canPlace, item.support === 'existing-decoration');
    source[item.definitionRef].variants.original.tiles.at(-1)[2] = 0;
    assert.equal(row().available, false, 'checking only first tile would admit the wrong endpoint');
    source[item.definitionRef] = definitions()[item.definitionRef];
    source[item.definitionRef].footprint.pop();
    assert.equal(row().available, false, 'full footprint, not bounding box');
    source[item.definitionRef] = definitions()[item.definitionRef];
    if (item.itemId === 'wall-corner-3-v1') {
      source[item.definitionRef].footprint.push([0, 1]);
      source[item.definitionRef].variants.original.tiles.push([0, 1, 0]);
      assert.equal(row().available, false, 'same bounds cannot substitute a solid rectangle for the hole');
    }
    delete source[item.definitionRef];
    assert.equal(row().available, false, 'no client-side implicit materialization');
  }
});
