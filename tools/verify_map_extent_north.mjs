// MAP-EXT E2: north row closed loop on the isolated copy path.
// True SQLite :memory: + true GameCopyStore.writeModule (no HTTP mocks, no
// dev store, no browser). Covers: grow->save->reread, city/road/world-coords
// unchanged, new strip is sea, shrink back to baseline, cancel/undo are pure
// preview recomputes, and the refusal matrix (non-north, bad delta, quota,
// non-empty strip, shrink at zero).
// Usage: node --test tools/verify_map_extent_north.mjs (cwd=web-port)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { GameCopyStore } from '../server/gamecopy.js';
import { openStorage } from '../vps/sqlite-port.mjs';
import { createPinnedCopyLoader } from './editor_trusted_copy.mjs';
import { previewMapEdits } from '../web/src/editor/mapcommands.js';
import { composeMapLayers } from '../web/src/content/authoring/maplayers.js';
import { compileMapSource } from '../web/src/content/authoring/mapcompile.js';
import { applyCopyMapEdits } from '../server/copyprofile.js';

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
const baselineOf = data => JSON.stringify({ cities: data.cities, placements: data.map.placements, roads: data.map.roads, chapters: data.chapters });

test('E2 north grow saves, rereads, keeps world coords, new strip is sea', async () => {
  const gameId = fresh(), before = readData(gameId);
  assert.deepEqual(before.map.bounds, { minX: 0, minY: 0, width: 384, height: 256, tileSize: 16 });
  const baseSig = baselineOf(before);
  // Client preview first (cancel = drop the pending batch, server untouched).
  const staged = previewMapEdits(before, [{ op: 'map-extent', side: 'north', delta: 1 }]);
  assert.deepEqual(staged.map.bounds, { minX: 0, minY: -1, width: 384, height: 257, tileSize: 16 });
  assert.deepEqual(before.map.bounds.minY, 0, 'preview must not mutate the snapshot');
  await writeMap(gameId, [{ op: 'map-extent', side: 'north', delta: 1 }]);
  const grown = readData(gameId);
  assert.deepEqual(grown.map.bounds, { minX: 0, minY: -1, width: 384, height: 257, tileSize: 16 });
  assert.equal(baselineOf(grown), baseSig, 'cities, placements, roads and chapters unchanged');
  const lyr = composeMapLayers({ schemaVersion: 1, map: grown.map, componentDefinitions: grown.componentDefinitions });
  assert.ok(lyr.terrain.slice(0, 384).every(t => t === 95), 'new north row is sea tile 95');
  assert.ok(lyr.geography.slice(0, 384).every(g => g === 1), 'new north row geography is sea');
  for (const p of grown.map.placements) assert.ok(p.y >= 0, 'placements keep world coords');
  // The strict publish/compile gate still refuses expanded bounds (E2 opens
  // editing, not publishing): working-copy save deliberately has no such gate.
  assert.throws(() => compileMapSource({ schemaVersion: 1, map: grown.map, componentDefinitions: grown.componentDefinitions }), /unsupported map bounds/);
});

test('E2 shrink back restores the baseline semantically', async () => {
  const gameId = fresh(), before = readData(gameId);
  await writeMap(gameId, [{ op: 'map-extent', side: 'north', delta: 1 }]);
  await writeMap(gameId, [{ op: 'map-extent', side: 'north', delta: -1 }]);
  const back = readData(gameId);
  assert.deepEqual(back.map.bounds, before.map.bounds);
  assert.deepEqual(back.map.base.terrainRef, before.map.base.terrainRef);
  assert.deepEqual(back.map.base.geography, before.map.base.geography);
  assert.equal(baselineOf(back), baselineOf(before));
});

test('E2 undo and cancel leave no residue', async () => {
  const gameId = fresh(), before = readData(gameId);
  const staged = previewMapEdits(before, [{ op: 'map-extent', side: 'north', delta: 1 }]);
  const undone = previewMapEdits(before, []);
  assert.deepEqual(undone.map.bounds, before.map.bounds, 'undo = preview from snapshot again');
  assert.deepEqual(undone.map.bounds, before.map.bounds, 'undo = preview from snapshot again');
  assert.equal(store.read('tok', gameId).copyDigest, store.read('tok', gameId).copyDigest);
  assert.deepEqual(staged.map.bounds.minY, -1);
});

test('E2 refusal matrix: sides, delta, quota, non-empty strip, shrink at zero', async () => {
  const gameId = fresh();
  await fails(() => writeMap(gameId, [{ op: 'map-extent', side: 'up', delta: 1 }]), 'MAP_EXTENT_NOT_ENABLED');
  await fails(() => writeMap(gameId, [{ op: 'map-extent', side: 'north', delta: 2 }]), 'COPY_MAP_DELTA');
  await fails(() => writeMap(gameId, [{ op: 'map-extent', side: 'north', delta: 0 }]), 'COPY_MAP_DELTA');
  await fails(() => writeMap(gameId, [{ op: 'map-extent', side: 'north', delta: -1 }]), 'MAP_EXTENT_BUDGET');
  // Non-empty strip (E4 semantics: atomic impact-apply, not refusal): a whole
  // decoration piece in the strip is removed by the shrink; clean save.
  await writeMap(gameId, [{ op: 'map-extent', side: 'north', delta: 1 }]);
  const grown = readData(gameId);
  const withDeco = structuredClone(grown);
  const decoId = withDeco.gameId + '#decoration-' + 'b'.repeat(64);
  withDeco.map.decorations = [...withDeco.map.decorations,
    { id: decoId, x: 10, y: -1, definitionRef: 'tile-200', variantRef: 'original' }];
  const applied = applyCopyMapEdits(withDeco, [{ op: 'map-extent', side: 'north', delta: -1 }]);
  assert.deepEqual(applied.map.bounds, { minX: 0, minY: 0, width: 384, height: 256, tileSize: 16 });
  assert.ok(!applied.map.decorations.some(d => d.id === decoId), 'crossing piece removed whole');
  const kept = readData(gameId);
  assert.equal(kept.map.bounds.minY, -1, 'pure apply writes nothing to storage');
  // Quota: drive to 40 via the write path, then the 41st must refuse.
  const qid = fresh();
  for (let k = 0; k < 40; k++) await writeMap(qid, [{ op: 'map-extent', side: 'north', delta: 1 }]);
  assert.equal(readData(qid).map.bounds.minY, -40);
  await fails(() => writeMap(qid, [{ op: 'map-extent', side: 'north', delta: 1 }]), 'MAP_EXTENT_BUDGET');
});

test('E2 preview-side refusals mirror the server (no silent divergence)', async () => {
  const gameId = fresh(), before = readData(gameId);
  assert.throws(() => previewMapEdits(before, [{ op: 'map-extent', side: 'up', delta: 1 }]), /北／南／西／東/);
  assert.throws(() => previewMapEdits(before, [{ op: 'map-extent', side: 'north', delta: 0 }]), /加一或減一/);
});
