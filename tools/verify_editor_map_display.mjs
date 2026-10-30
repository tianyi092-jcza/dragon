// Pure display fixtures and pinned Web source. No rule admission or browser storage.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { composeMapDisplayLayers } from '../web/src/editor/mapdisplay.js';
import { composeMapLayers, BYTE_STAMP_RECIPE } from '../web/src/content/authoring/maplayers.js';
import { createPinnedCopyLoader } from './editor_trusted_copy.mjs';
const flags = { base: true, decor: true, roads: true, cities: true };
const definition = (id, tiles) => ({ id, revision: '1', category: 'owned-display-fixture', ruleRecipeRef: BYTE_STAMP_RECIPE, visualRef: 'MMAP.MDL:indexed-footprint', anchor: [0,0], footprint: tiles.map(([x,y]) => [x,y]), variants: { original: { tiles } } });
const fixture = () => ({ componentDefinitions: { decor: definition('decor', [[0,0,32],[1,0,33]]), road: definition('road', [[0,0,64],[1,0,65]]), city: definition('city', [[0,0,80]]) },
  map: { bounds: { width: 384, height: 256, minX: 0, minY: 0, tileSize: 16 },
    base: { terrainRef: Array(98304).fill(20), geography: Array(98304).fill(0), unknownUnderlays: {} },
    decorations: [{ id: 'd', definitionRef: 'decor', x: 0, y: 0, waterClass: 'river' }],
    roads: [{ id: 'r', travelKind: 'water', components: [{ id: 'rd', definitionRef: 'road', x: 1, y: 0 }] }],
    placements: [{ id: 'c', cityId: 'city-id', componentRef: 'city', x: 1, y: 0 }],
    waterGroups: [{ id: 'g', name: 'owned hidden minimap group', memberIds: ['d'], baseCells: [], showOnMinimap: false }] } });
test('all sixteen visibility combinations preserve four-layer order, independent of minimap visibility', () => {
  const source = fixture(), before = structuredClone(source), compiled = composeMapLayers(source);
  for (let mask = 0; mask < 16; mask++) {
    const visible = Object.fromEntries(Object.keys(flags).map((key, index) => [key, Boolean(mask & (1 << index))]));
    const expected = Array(98304).fill(visible.base ? 20 : null);
    if (visible.decor) { expected[0] = 32; expected[1] = 33; }
    if (visible.roads) { expected[1] = 64; expected[2] = 65; }
    if (visible.cities) expected[1] = 80;
    assert.deepEqual(composeMapDisplayLayers(source, visible), { admission: 'display-only', width: 384, height: 256, tiles: expected });
  }
  assert.deepEqual(source, before); assert.deepEqual(composeMapLayers(source), compiled);
});
test('hidden layers reveal current lower edits or unknown, not original artwork or tile zero', () => {
  const source = fixture(); source.map.base.terrainRef[0] = null;
  source.map.base.unknownUnderlays[0] = { sourceRef: 'owned unknown fixture', coveringInstanceId: 'd' };
  source.map.base.terrainRef[1] = 17;
  assert.equal(composeMapDisplayLayers(source, flags).tiles[0], 32);
  const lower = composeMapDisplayLayers(source, { base: true, decor: false, roads: false, cities: false });
  assert.equal(lower.tiles[0], null); assert.equal(lower.tiles[1], 17);
  assert.equal(source.map.base.unknownUnderlays[0].coveringInstanceId, 'd');
  assert.equal(composeMapLayers(source).terrain[0], 32);
  source.map.base.terrainRef[0] = 0;
  assert.equal(composeMapDisplayLayers(source, { ...flags, decor: false }).tiles[0], 0);
});
test('hidden malformed recipes or water references still reject; visibility does not grant validation bypass', () => {
  const hidden = { base: false, decor: false, roads: false, cities: false };
  for (const mutate of [s => { s.componentDefinitions.decor.visualRef = 'unknown'; }, s => { s.componentDefinitions.road.ruleRecipeRef = 'unknown'; }, s => { s.map.waterGroups[0].memberIds = ['missing']; }, s => { s.map.placements[0].x = 384; }]) {
    const source = fixture(); mutate(source); const before = structuredClone(source);
    assert.throws(() => composeMapDisplayLayers(source, hidden)); assert.deepEqual(source, before);
  }
});
test('projection owns its tile plane and contains no compiled geography or editable map', () => {
  const source = fixture();
  for (const visible of [flags, { ...flags, cities: false }]) {
    const result = composeMapDisplayLayers(source, visible), expected = [...result.tiles];
    result.tiles[0] = 255;
    assert.deepEqual(composeMapDisplayLayers(source, visible).tiles, expected);
    assert.deepEqual(Object.keys(result).sort(), ['admission','height','tiles','width']);
  }
});
test('visibility boundary requires four explicit data booleans, no getters or extra flags', () => {
  const source = fixture(); let getters = 0;
  const getter = { ...flags }; Object.defineProperty(getter, 'base', { enumerable: true, get() { getters++; return true; } });
  for (const value of [undefined, null, [], {}, { ...flags, base: 1 }, { ...flags, extra: true }, getter, Object.create(flags)]) assert.throws(() => composeMapDisplayLayers(source, value));
  assert.equal(getters, 0);
  assert.deepEqual(composeMapDisplayLayers(source, Object.assign(Object.create(null), flags)), composeMapDisplayLayers(source, flags));
});
test('actual pinned Web map all-visible matches normal composition; hidden views never modify source', async () => {
  const { game, provenance } = await createPinnedCopyLoader({ kind: 'minimal' })({ gameId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ownerId: 'owned-display-map' });
  assert.equal(Object.keys(provenance.inputHashes).length, 41);
  const before = structuredClone(game), complete = composeMapLayers(game, { draft: true });
  assert.deepEqual(composeMapDisplayLayers(game, flags).tiles, complete.terrain);
  assert.deepEqual(composeMapDisplayLayers(game, { base: true, decor: false, roads: false, cities: false }).tiles, game.map.base.terrainRef);
  assert.ok(composeMapDisplayLayers(game, { base: false, decor: false, roads: false, cities: false }).tiles.every(tile => tile === null));
  composeMapDisplayLayers(game, { ...flags, decor: false });
  assert.deepEqual(game, before); assert.deepEqual(composeMapLayers(game, { draft: true }), complete);
});
