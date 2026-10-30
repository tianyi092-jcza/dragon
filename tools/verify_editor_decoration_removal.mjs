// Owned authoring fixture; no DOS/save/database/browser access or native defaults.
import assert from 'node:assert/strict';
import test from 'node:test';
import { removeDecorations, materialReferences } from '../web/src/editor/componenttools.js';
import { BYTE_STAMP_RECIPE, composeMapLayers } from '../web/src/content/authoring/maplayers.js';
import { encodeSourceChunks, decodeSourceChunks } from '../web/src/content/authoring/sourcejson.js';
const cell = 10 * 384 + 10;
const definition = (id, tile) => ({ id, revision: '1', category: 'owned-fixture', footprint: [[0, 0]], anchor: [0, 0], visualRef: `MMAP.MDL:tile-${tile}`, ruleRecipeRef: BYTE_STAMP_RECIPE, variants: { original: { tiles: [[0, 0, tile]] } } });
const fixture = () => ({ componentDefinitions: { lower: definition('lower', 32), upper: definition('upper', 48) },
  map: { bounds: { minX: 0, minY: 0, width: 384, height: 256, tileSize: 16 },
    base: { terrainRef: Array(384 * 256).fill(20), geography: Array(384 * 256).fill(0), unknownUnderlays: {} },
    decorations: [{ id: 'a', definitionRef: 'lower', x: 10, y: 10 }, { id: 'b', definitionRef: 'upper', x: 10, y: 10, waterClass: 'river' }], roads: [], placements: [],
    waterGroups: [{ id: 'g', name: '水域', memberIds: ['b'], baseCells: [], showOnMinimap: false }] } });
test('removal exposes current lower layer, never restores an earlier captured picture', () => {
  const source = fixture(); source.componentDefinitions.lower = definition('lower', 16);
  source.map.base.terrainRef[3] = 99;
  const before = structuredClone(source), result = removeDecorations(source, ['b']);
  assert.equal(composeMapLayers(source).terrain[cell], 48);
  assert.equal(composeMapLayers(result).terrain[cell], 16);
  assert.equal(composeMapLayers(result).terrain[3], 99);
  assert.deepEqual(result.map.decorations, [source.map.decorations[0]]);
  assert.deepEqual(result.map.waterGroups, []); assert.deepEqual(result.map.base, source.map.base);
  assert.deepEqual(result.componentDefinitions, source.componentDefinitions);
  assert.deepEqual(materialReferences(result, 'upper'), []); assert.deepEqual(source, before);
  assert.deepEqual(decodeSourceChunks(encodeSourceChunks(result)), result);
});
test('exposed unknown is retained and strict compile refuses; other covers can still cover it', () => {
  const source = fixture(); source.map.base.terrainRef[cell] = null;
  source.map.base.unknownUnderlays[cell] = { sourceRef: 'owned explicit unknown', coveringInstanceId: 'a' };
  const before = structuredClone(source), hidden = removeDecorations(source, ['a']);
  assert.equal(composeMapLayers(hidden).terrain[cell], 48);
  const exposed = removeDecorations(source, ['a', 'b']);
  assert.deepEqual(exposed.map.base, before.map.base);
  assert.ok(composeMapLayers(exposed, { draft: true }).diagnostics.some(row => row.code === 'UNKNOWN_UNDERLAY'));
  assert.throws(() => composeMapLayers(exposed), /UNKNOWN_UNDERLAY/); assert.deepEqual(source, before);
});
test('partial water membership and explicit base water keep group identity and hidden flag', () => {
  const source = fixture(); source.map.decorations.push({ id: 'c', definitionRef: 'upper', x: 11, y: 10, waterClass: 'river' });
  source.map.waterGroups[0].memberIds.push('c'); source.map.base.geography[0] = 3; source.map.waterGroups[0].baseCells.push(0);
  const before = structuredClone(source), partial = removeDecorations(source, ['b']);
  assert.deepEqual(partial.map.waterGroups[0], { ...before.map.waterGroups[0], memberIds: ['c'] });
  const baseOnly = removeDecorations(source, ['b', 'c']);
  assert.deepEqual(baseOnly.map.waterGroups[0], { ...before.map.waterGroups[0], memberIds: [] });
  assert.equal(composeMapLayers(baseOnly).minimapGeography[0], 0);
  partial.map.waterGroups[0].baseCells.push(1); assert.deepEqual(source, before);
});
test('invalid or mixed selections refuse atomically; roads and cities are not selectable decorations', () => {
  const source = fixture(), before = structuredClone(source);
  for (const ids of [[], null, 'a', ['a', 'a'], ['missing'], ['a', 'missing'], [0], Array(1), ['road'], ['city']]) {
    assert.throws(() => removeDecorations(source, ids)); assert.deepEqual(source, before);
  }
});
test('whole multi-cell instance removal leaves unrelated road and placement records intact', () => {
  const source = fixture(); source.componentDefinitions.upper.footprint.push([1, 0]); source.componentDefinitions.upper.variants.original.tiles.push([1, 0, 48]);
  source.map.roads.push({ id: 'road', components: [{ id: 'road-piece', definitionRef: 'lower', x: 12, y: 10 }] });
  const before = structuredClone(source), result = removeDecorations(source, ['b']);
  assert.deepEqual(result.map.roads, before.map.roads); assert.deepEqual(result.map.placements, before.map.placements);
  assert.equal(composeMapLayers(result).terrain[cell + 1], 20); assert.equal(composeMapLayers(result).terrain[cell + 2], 32);
  assert.deepEqual(source, before);
});
