// MAP-EXT E3: four sides share one op. True SQLite :memory: + true
// GameCopyStore.writeModule. Per-side grow/shrink roundtrips, quota
// independence, order independence, unknown-side refusal.
// Usage: node --test --test-concurrency=1 tools/verify_map_extent_sides_ops.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { GameCopyStore } from '../server/gamecopy.js';
import { openStorage } from '../vps/sqlite-port.mjs';
import { createPinnedCopyLoader } from './editor_trusted_copy.mjs';
import { previewMapEdits } from '../web/src/editor/mapcommands.js';
import { composeMapLayers } from '../web/src/content/authoring/maplayers.js';

const storage = openStorage(':memory:');
storage.sql.exec('CREATE TABLE content_games (game_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL)');
const actor = { id: 'owner-1', must_change: 0, epoch: 1 };
const games = { assertNotDeleting: () => {}, listOwn: () => [] };
const store = new GameCopyStore({ storage, principal: () => actor, games });
const loader = createPinnedCopyLoader({ allocateEntityId: () => 'op-' + randomUUID() });
const { game: captured } = await loader({ gameId: 'pinned-src', ownerId: 'owner-1' });

function fresh() {
  const gameId = randomUUID();
  storage.sql.exec('INSERT INTO content_games VALUES(?,?)', gameId, actor.id);
  store.ensureFromGame('tok', gameId, structuredClone(captured));
  return gameId;
}
const readData = gameId => store.read('tok', gameId).data;
const writeMap = (gameId, edits) => store.writeModule('tok', gameId, 'map', { edits });
const fails = async (fn, code) => {
  try { await fn(); } catch (e) { assert.equal(e.code, code, 'code ' + e.code + ' ' + e.message); assert.equal(e.status, 422); return e; }
  assert.fail('should have thrown ' + code);
};
const sig = data => JSON.stringify({ cities: data.cities, placements: data.map.placements, roads: data.map.roads });
const SIDES = ['north', 'south', 'west', 'east'];

for (const side of SIDES) {
  test(`E3 ${side}: grow saves and rereads, shrink restores baseline`, async () => {
    const gameId = fresh(), before = readData(gameId), baseSig = sig(before);
    const staged = previewMapEdits(before, [{ op: 'map-extent', side, delta: 1 }]);
    const after = staged.map.bounds;
    assert.equal(after.width, side === 'north' || side === 'south' ? 384 : 385);
    assert.equal(after.height, side === 'north' || side === 'south' ? 257 : 256);
    await writeMap(gameId, [{ op: 'map-extent', side, delta: 1 }]);
    const grown = readData(gameId);
    assert.deepEqual(grown.map.bounds, after);
    assert.equal(sig(grown), baseSig, 'world objects and chapters unchanged');
    const lyr = composeMapLayers({ schemaVersion: 1, map: grown.map, componentDefinitions: grown.componentDefinitions });
    const stripIdx = side === 'north' ? [...Array(lyr.terrain.length).keys()].slice(0, grown.map.bounds.width)
      : side === 'south' ? [...Array(lyr.terrain.length).keys()].slice(-grown.map.bounds.width)
      : [...Array(lyr.terrain.length).keys()].filter(i => (side === 'west' ? i % grown.map.bounds.width === 0 : i % grown.map.bounds.width === grown.map.bounds.width - 1));
    assert.ok(stripIdx.every(i => lyr.terrain[i] === 95 && lyr.geography[i] === 1), side + ' new strip is sea');
    await writeMap(gameId, [{ op: 'map-extent', side, delta: -1 }]);
    const back = readData(gameId);
    assert.deepEqual(back.map.bounds, before.map.bounds);
    assert.deepEqual(back.map.base.terrainRef, before.map.base.terrainRef);
    assert.deepEqual(back.map.base.geography, before.map.base.geography);
  });
}

test('E3 quota is per-side and independent', async () => {
  const gameId = fresh();
  for (let k = 0; k < 20; k++) await writeMap(gameId, [{ op: 'map-extent', side: 'north', delta: 1 }]);
  assert.equal(readData(gameId).map.bounds.minY, -20);
  await fails(() => writeMap(gameId, [{ op: 'map-extent', side: 'north', delta: 1 }]), 'MAP_EXTENT_BUDGET');
  await writeMap(gameId, [{ op: 'map-extent', side: 'east', delta: 1 }]);
  assert.equal(readData(gameId).map.bounds.width, 385, 'north quota does not block east');
  await writeMap(gameId, [{ op: 'map-extent', side: 'east', delta: -1 }]);
  await fails(() => writeMap(gameId, [{ op: 'map-extent', side: 'east', delta: -1 }]), 'MAP_EXTENT_BUDGET');
});

test('E3 operation order does not change the result', async () => {
  const run = async order => {
    const gameId = fresh();
    for (const side of order) await writeMap(gameId, [{ op: 'map-extent', side, delta: 1 }]);
    const data = readData(gameId);
    return { bounds: data.map.bounds, terrain: data.map.base.terrainRef, geo: data.map.base.geography };
  };
  const a = await run(['north', 'south', 'west', 'east']);
  const b = await run(['east', 'west', 'south', 'north']);
  assert.deepEqual(a.bounds, b.bounds);
  assert.deepEqual(a.terrain, b.terrain);
  assert.deepEqual(a.geo, b.geo);
  assert.deepEqual(a.bounds, { minX: -1, minY: -1, width: 386, height: 258, tileSize: 16 });
});

test('E3 unknown side refused on both layers', async () => {
  const gameId = fresh(), before = readData(gameId);
  assert.throws(() => previewMapEdits(before, [{ op: 'map-extent', side: 'up', delta: 1 }]), /北／南／西／東/);
  await fails(() => writeMap(gameId, [{ op: 'map-extent', side: 'up', delta: 1 }]), 'MAP_EXTENT_NOT_ENABLED');
  assert.deepEqual(readData(gameId).map.bounds, before.map.bounds);
});
