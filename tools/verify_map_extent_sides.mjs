// MAP-EXT E1: common extent/index pure verification. No service, store, browser.
import assert from 'node:assert/strict';
import { createPinnedCopyLoader } from './editor_trusted_copy.mjs';
import { composeMapLayers } from '../web/src/content/authoring/maplayers.js';
import { parseMapSides, isSupportedMapExtent, isOriginalBounds, worldToDense, denseToWorld, expandMapOneStep, extendNorthOneRow, MAP_EXT_SIDES } from '../web/src/content/authoring/mapextent.js';

const { game } = await createPinnedCopyLoader()({ gameId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', ownerId: 'isolated' });
const before = composeMapLayers(game);
const ob = game.map.bounds;
assert.deepEqual(parseMapSides(ob), { W: 0, E: 0, N: 0, S: 0 });
assert.equal(isOriginalBounds(ob), true);
assert.equal(isSupportedMapExtent({ ...ob, tileSize: 16 }), true);
// Dense roundtrip on original corners.
for (const [x, y] of [[0, 0], [383, 0], [0, 255], [383, 255], [257, 9]]) {
  const i = worldToDense(ob, x, y);
  assert.deepEqual(denseToWorld(ob, i), { x, y });
}
assert.throws(() => worldToDense(ob, 384, 0), /out of bounds/);
assert.throws(() => worldToDense(ob, 1.5, 0), /out of bounds/);
assert.throws(() => denseToWorld(ob, 384 * 256), /out of bounds/);
// North wrapper equals generic north.
assert.deepEqual(extendNorthOneRow(structuredClone(game.map)).bounds, expandMapOneStep(structuredClone(game.map), 'north').bounds);
// Each side: 0->1->20->refuse 21; old world cells preserved; new strip is sea.
for (const side of MAP_EXT_SIDES) {
  let m = structuredClone(game.map);
  m = expandMapOneStep(m, side);
  const s1 = parseMapSides(m.bounds);
  assert.equal(s1[side === 'north' ? 'N' : side === 'south' ? 'S' : side === 'west' ? 'W' : 'E'], 1);
  assert.equal(isSupportedMapExtent({ ...m.bounds, tileSize: 16 }), true);
  // Old domain bytes identical at world coords.
  const oldW = ob.width, oldH = ob.height;
  for (let y = 0; y < oldH; y += 37) for (let x = 0; x < oldW; x += 53) {
    const from = y * oldW + x;
    const to = (y - m.bounds.minY) * m.bounds.width + x - m.bounds.minX;
    assert.equal(m.base.terrainRef[to], game.map.base.terrainRef[from], `${side} preserve ${x},${y}`);
    assert.equal(m.base.geography[to], game.map.base.geography[from]);
  }
  // New strip cells are sea.
  const strip = side === 'north' ? Array.from({ length: m.bounds.width }, (_, x) => [m.bounds.minX + x, m.bounds.minY])
    : side === 'south' ? Array.from({ length: m.bounds.width }, (_, x) => [m.bounds.minX + x, m.bounds.minY + m.bounds.height - 1])
    : side === 'west' ? Array.from({ length: m.bounds.height }, (_, y) => [m.bounds.minX, m.bounds.minY + y])
    : Array.from({ length: m.bounds.height }, (_, y) => [m.bounds.minX + m.bounds.width - 1, m.bounds.minY + y]);
  for (const [x, y] of strip.slice(0, 50)) {
    const i = (y - m.bounds.minY) * m.bounds.width + x - m.bounds.minX;
    assert.equal(m.base.terrainRef[i], 95, `${side} sea tile`);
    assert.equal(m.base.geography[i], 1, `${side} sea geo`);
  }
  for (let k = 1; k < 20; k++) m = expandMapOneStep(m, side);
  assert.deepEqual(parseMapSides(m.bounds)[side === 'north' ? 'N' : side === 'south' ? 'S' : side === 'west' ? 'W' : 'E'], 20);
  assert.throws(() => expandMapOneStep(m, side), /20/);
  // composed layers agree with base on old domain
  const lyr = composeMapLayers({ ...game, map: m });
  for (let y = 0; y < oldH; y += 51) for (let x = 0; x < oldW; x += 61) {
    const from = y * oldW + x;
    const to = (y - m.bounds.minY) * m.bounds.width + x - m.bounds.minX;
    assert.equal(lyr.terrain[to], before.terrain[from], `${side} layer preserve`);
  }
}
// Interleaved W+N then E: independent quotas.
let m = expandMapOneStep(expandMapOneStep(structuredClone(game.map), 'west'), 'north');
m = expandMapOneStep(m, 'east');
assert.deepEqual(parseMapSides(m.bounds), { W: 1, E: 1, N: 1, S: 0 });
assert.equal(m.bounds.width, 386); assert.equal(m.bounds.height, 257);
// Max four corners + dense roundtrip.
let full = structuredClone(game.map);
for (const side of MAP_EXT_SIDES) for (let k = 0; k < 20; k++) full = expandMapOneStep(full, side);
assert.deepEqual(full.bounds, { minX: -20, minY: -20, width: 424, height: 296, tileSize: 16 });
assert.deepEqual(parseMapSides(full.bounds), { W: 20, E: 20, N: 20, S: 20 });
for (const [x, y] of [[-20, -20], [403, -20], [-20, 275], [403, 275], [0, 0], [383, 255]]) {
  assert.deepEqual(denseToWorld(full.bounds, worldToDense(full.bounds, x, y)), { x, y });
}
// Reject matrix: non-integers, shifted original domain, wrong size.
for (const bad of [{ minX: 0.5, minY: 0, width: 384, height: 256 }, { minX: 1, minY: 0, width: 384, height: 256 },
  { minX: 0, minY: 0, width: 425, height: 256 }, { minX: -21, minY: 0, width: 405, height: 256 },
  { minX: 0, minY: 0, width: 384, height: 277 }, { minX: -20, minY: -20, width: 424, height: 297 }]) {
  assert.equal(isSupportedMapExtent({ ...bad, tileSize: 16 }), false, JSON.stringify(bad));
}
assert.throws(() => expandMapOneStep(structuredClone(game.map), 'up'), /unknown map side/);
console.log(JSON.stringify({ e1: 'passed', sides: MAP_EXT_SIDES, max: full.bounds }));
