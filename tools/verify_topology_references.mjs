// C7-A reference list (read-only): roads touching a city, its pending move
// intent, and rebuilds recorded for those roads. No HTTP route yet; the
// delete-gate consumes this method before any removal work. Usage:
// node tools/verify_topology_references.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { openStorage } from '../vps/sqlite-port.mjs';
import { DraftTopology } from '../server/topology.js';
import { HttpError } from '../server/security.js';
import { createPinnedCopyLoader } from './editor_trusted_copy.mjs';

const GAME = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaab01';
const TOKEN = 'token-hash';
const storage = openStorage(':memory:');
const topo = new DraftTopology({
  storage,
  principal: () => ({ must_change: false }),
  games: {
    listOwn: () => [{ gameId: GAME }],
    assertNotDeleting: () => {},
  },
});

const loader = createPinnedCopyLoader();
const { game: probe } = await loader({ gameId: 'topo-probe', ownerId: 'o' });
const cityId = 'city-000';
const touched = probe.map.roads
  .filter(r => r.fromCityId === cityId || r.toCityId === cityId)
  .map(r => r.id);
assert.ok(touched.includes('road-0'), 'pinned probe shape carries road-0');

test('empty reference list names touching roads, null intent, no rebuilds', () => {
  const ref = topo.references(TOKEN, { ...probe, gameId: GAME }, cityId);
  assert.equal(ref.cityId, cityId);
  assert.deepEqual([...ref.roads].sort(), [...touched].sort());
  assert.equal(ref.moveIntent, null);
  assert.deepEqual(ref.rebuilds, []);
});

test('recorded move and rebuild appear; unknown city is empty, not an error', () => {
  const game = { ...probe, gameId: GAME };
  topo.record(TOKEN, game, { cityId, x: 250, y: 9 });
  const road = probe.map.roads.find(r => r.id === 'road-0');
  const gx = Math.max(0, Math.min(383, road.points?.[0]?.x ?? 250));
  const gy = Math.max(0, Math.min(255, road.points?.[0]?.y ?? 9));
  const geometry = [{ x: gx, y: gy }, { x: Math.min(383, gx + 1), y: gy }];
  topo.rebuild(TOKEN, game, { roadId: 'road-0', geometry, travelKind: 'land' });
  const ref = topo.references(TOKEN, game, cityId);
  assert.deepEqual(ref.moveIntent, { x: 250, y: 9, updatedAt: ref.moveIntent.updatedAt });
  assert.ok(typeof ref.moveIntent.updatedAt === 'string');
  assert.deepEqual(ref.rebuilds, [{ roadId: 'road-0', travelKind: 'land' }]);
  const empty = topo.references(TOKEN, game, 'city-999');
  assert.deepEqual(empty, { cityId: 'city-999', roads: [], moveIntent: null, rebuilds: [] });
});

test('references never mutates tables; bad identity fails closed', () => {
  const game = { ...probe, gameId: GAME };
  const count = (table) => storage.sql.exec(`SELECT COUNT(*) c FROM ${table}`).toArray()[0].c;
  const before = [count('draft_topology_moves'), count('draft_topology_rebuilds')];
  topo.references(TOKEN, game, cityId);
  topo.references(TOKEN, game, 'city-999');
  assert.deepEqual([count('draft_topology_moves'), count('draft_topology_rebuilds')], before);
  assert.throws(() => topo.references(TOKEN, game, ''), (e) => e instanceof HttpError && e.status === 422);
  assert.throws(() => topo.references(TOKEN, game, null), (e) => e instanceof HttpError && e.status === 422);
  assert.throws(() => topo.references(TOKEN, { ...probe, gameId: 'wolong-builtin' }, cityId), (e) => e instanceof HttpError && e.status === 403);
});
