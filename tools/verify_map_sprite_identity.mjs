// Read-only registered source + pure synthetic identity controls; no saves/templates/network.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mapSpriteIdentity } from './map_sprite_identity.mjs';
import { readInstalledEditorSource } from './editor_builtin_source.mjs';
import { planSystemBaseMapPieces } from './system_base_map_pieces.mjs';

const base = {
  id: 'one', name: 'display', evidenceRef: 'original-proof',
  footprint: [[0, 0], [2, 0]], anchor: [0, 0],
  ruleRecipeRef: 'ki-byte-stamp-1', visualRef: 'atlas', revision: '1',
  variants: { original: { tiles: [[0, 0, 72], [2, 0, 6]] }, winter: { tiles: [[0, 0, 4], [2, 0, 5]] } },
};

test('normalizes local origin, cell order and object keys, not source data', () => {
  const before = JSON.stringify(base);
  const shifted = structuredClone(base);
  shifted.id = 'another'; shifted.name = 'other label'; shifted.evidenceRef = 'another-proof';
  shifted.footprint = [[9, -3], [7, -3]]; shifted.anchor = [7, -3];
  shifted.variants = Object.fromEntries(Object.entries(shifted.variants).reverse().map(([key, variant]) =>
    [key, { tiles: variant.tiles.map(([x, y, byte]) => [x + 7, y - 3, byte]).reverse() }]));
  assert.equal(mapSpriteIdentity(shifted), mapSpriteIdentity(base));
  assert.equal(JSON.stringify(base), before);
});

test('byte identity, anchors, holes, all variants and semantic constraints remain distinct', () => {
  const changes = [
    value => { value.variants.original.tiles[0][2] = 190; }, // visually equal to 72 is not identical
    value => { value.anchor = [1, 0]; },
    value => { value.footprint.push([1, 0]); },
    value => { value.variants.winter.tiles[0][2] = 9; },
    value => { value.ruleRecipeRef = 'different'; },
    value => { value.visualRef = 'different'; },
    value => { value.waterClass = 'river'; },
    value => { value.geographyMask = [0, 1]; },
    value => { value.category = 'roads'; },
    value => { value.constraints = { placement: 'reference-only' }; },
    value => { value.variants.original.constraints = { locked: true }; },
  ];
  changes.forEach(change => {
    const value = structuredClone(base); change(value);
    assert.notEqual(mapSpriteIdentity(value), mapSpriteIdentity(base));
  });
});

test('registered atoms and legacy pieces are inventoried without merging or mutating them', () => {
  const source = readInstalledEditorSource();
  const definitions = { ...source.componentDefinitions, ...planSystemBaseMapPieces(source).definitions };
  const before = JSON.stringify(definitions);
  const groups = new Map();
  Object.values(definitions).forEach(definition => {
    const identity = mapSpriteIdentity(definition);
    const members = groups.get(identity) ?? [];
    members.push(definition.id); groups.set(identity, members);
  });
  assert.equal(Object.keys(source.componentDefinitions).length, 256);
  assert.equal(groups.size, new Set(Object.values(definitions).reverse().map(mapSpriteIdentity)).size);
  assert.equal([...groups.values()].flat().length, Object.keys(definitions).length);
  // Fixed v28 G05 review set, NOT an inferred terrain class or a placement gate.
  // Include ALL converted mountain-pattern sizes: the earlier 2..6-cell query
  // cannot prove that a byte lacks an existing definition.
  const expectedMembership = [
    [117, 127, 8], [119, 11, 22], [121, 201, 9], [123, 94, 12], [127, 169, 9],
    [128, 255, 7], [134, 64, 7], [135, 60, 12], [137, 28, 15], [139, 71, 8],
    [141, 4, 20], [142, 14, 41], [143, 8, 12], [144, 20, 14], [145, 28, 18],
    [146, 16, 18], [147, 28, 14], [150, 5, 14], [151, 7, 18], [152, 7, 14],
    [153, 2, 75], [154, 20, 38], [155, 5, 20], [156, 67, 8], [157, 2, 97],
    [158, 2, 70], [159, 2, 18], [160, 11, 31], [161, 11, 31], [163, 16, 14],
    [164, 3, 30], [165, 5, 15], [166, 35, 22], [167, 26, 25], [169, 3, 75],
    [170, 18, 25], [171, 19, 10], [172, 5, 70], [173, 21, 18], [174, 11, 31],
  ];
  const mountainDefinitions = Object.values(definitions).filter(definition => definition.category === 'mountain-pattern');
  const membership = expectedMembership.map(([byte]) => {
    const matches = mountainDefinitions.filter(definition => Object.values(definition.variants)
      .some(variant => variant.tiles.some(([, , tile]) => tile === byte)));
    return [byte, matches.length, Math.min(...matches.map(definition => definition.footprint.length))];
  });
  assert.deepEqual(membership, expectedMembership, 'exact registered definition count/minimum full footprint, without a short-piece cutoff');
  assert.equal(membership.filter(([, , cells]) => cells <= 16).length, 18);
  assert.equal(membership.filter(([, , cells]) => cells > 16).length, 22);
  // Fixed v31 remaining G05 set. Excluding these five byte identities is a
  // review filter only, not proof that the other variants may be placed.
  const crownBytes = new Set([168, 176, 177, 178, 179]);
  const variants = mountainDefinitions.flatMap(definition => Object.values(definition.variants)
    .map(variant => ({ cells: definition.footprint.length, tiles: variant.tiles })));
  const expectedWithoutCrowns = [
    [119, 11, 3, 22], [137, 28, 3, 15], [141, 4, 1, 20], [142, 14, 1, 134],
    [145, 28, 3, 18], [146, 16, 2, 18], [151, 7, 0, null], [153, 2, 0, null],
    [154, 20, 2, 50], [155, 5, 1, 20], [157, 2, 0, null], [158, 2, 0, null],
    [159, 2, 1, 18], [160, 11, 1, 50], [161, 11, 1, 50], [164, 3, 0, null],
    [165, 5, 0, null], [166, 35, 3, 28], [167, 26, 1, 64], [169, 3, 0, null],
    [170, 18, 3, 28], [172, 5, 0, null], [173, 21, 2, 18], [174, 11, 2, 50],
  ];
  const withoutCrowns = expectedWithoutCrowns.map(([byte]) => {
    const matches = variants.filter(variant => variant.tiles.some(([, , tile]) => tile === byte));
    const retained = matches.filter(variant => variant.tiles.every(([, , tile]) => !crownBytes.has(tile)));
    return [byte, matches.length, retained.length, retained.length ? Math.min(...retained.map(variant => variant.cells)) : null];
  });
  assert.deepEqual(withoutCrowns, expectedWithoutCrowns, 'all complete variants, no size cutoff or removal of crown cells');
  assert.equal(withoutCrowns.filter(([, , count]) => count === 0).length, 8);
  // Fixed v32 G02 queue. The conversion intentionally excludes source water
  // instances; absence of a Web fragment is not absence of an original byte.
  const shoreReviewBytes = [4, 5, 7, 8, 9, 10, 11, 12, 14, 15, 21, 22, 23, 24, 25, 26, 27, 30, 31,
    34, 35, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 50, 51, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63,
    64, 65, 66, 67, 68, 69, 70, 71, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88,
    89, 90, 91, 92, 93, 94, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111];
  assert.equal(shoreReviewBytes.length, 89);
  const shoreDefinitions = Object.values(definitions).filter(definition => definition.category === 'ground-shore-pattern');
  const sourceShoreInstances = new Map(shoreReviewBytes.map(byte => [byte, []]));
  source.map.decorations.forEach(instance => {
    const definition = source.componentDefinitions[instance.definitionRef];
    const byte = definition.variants[instance.variantRef ?? 'original'].tiles[0][2];
    sourceShoreInstances.get(byte)?.push(instance);
  });
  const shoreMembership = shoreReviewBytes.map(byte => {
    const matches = shoreDefinitions.filter(definition => Object.values(definition.variants)
      .some(variant => variant.tiles.some(([, , tile]) => tile === byte)));
    const multicell = matches.filter(definition => definition.footprint.length > 1);
    return [byte, matches.length, multicell.length, multicell.length ? Math.min(...multicell.map(definition => definition.footprint.length)) : null,
      sourceShoreInstances.get(byte).length];
  });
  const expectedShoreMembers = [[4, 68, 67, 2, 131], [5, 16, 15, 2, 18], [8, 42, 41, 2, 71],
    [9, 65, 64, 2, 141], [10, 27, 26, 2, 43], [12, 33, 32, 2, 48], [21, 24, 23, 5, 36],
    [24, 42, 41, 2, 84], [25, 57, 56, 2, 122]];
  assert.deepEqual(shoreMembership.filter(([, count]) => count > 0), expectedShoreMembers);
  const noShoreFragments = shoreMembership.filter(([, count]) => count === 0);
  assert.equal(noShoreFragments.length, 80);
  noShoreFragments.forEach(([byte, , multicell, minimum, instances]) => {
    assert.deepEqual([multicell, minimum], [0, null]);
    assert.ok(instances > 0, `byte ${byte} still has registered source instances`);
    assert.ok(sourceShoreInstances.get(byte).every(instance => ['sea', 'river', 'lake'].includes(instance.waterClass)));
  });
  expectedShoreMembers.forEach(([byte]) => assert.ok(sourceShoreInstances.get(byte).every(instance => !instance.waterClass)));
  assert.equal(JSON.stringify(definitions), before);
  console.log(JSON.stringify({ sourceRevision: source.revision,
    mountainMembershipBoundary: 'v28 fixed review set; byte/definition-count/minimum footprint, not DOS semantics or new catalog admission',
    mountainMembership: membership,
    withoutCrownsBoundary: 'fixed v31 remaining set; byte/all variants/variants without 168,176..179/minimum complete footprint; not placement admission',
    withoutCrowns,
    shoreMembershipBoundary: 'fixed v32 G02; byte/all fragment definitions/multicell definitions/minimum multicell footprint/source instances; no geography certification',
    shoreMembership }));
  console.log(JSON.stringify({ definitions: Object.keys(definitions).length, strictGroups: groups.size,
    duplicateGroups: [...groups.values()].filter(ids => ids.length > 1) }));
});
