// D2 topology: create -> city-stamp -> city-bind -> admit -> paint corridor ->
// road-add -> compile. 193-city graph, legacy endpoint rows convert raw->named,
// untouched legacy rows keep raw, validateWhole tickets the copy.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { GameCopyStore } from '../server/gamecopy.js';
import { FixedCopyProfile } from '../server/copyprofile.js';
import { createPinnedCopyLoader } from './editor_trusted_copy.mjs';
import { openStorage } from '../vps/sqlite-port.mjs';
import { compileTrialSource } from '../web/src/content/authoring/trialcompile.js';

const sha = b => createHash('sha256').update(b).digest('hex');
const storage = openStorage(':memory:');
storage.sql.exec('CREATE TABLE content_games (game_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL)');
const actor = { id: 'owner-1', must_change: 0, epoch: 1 };
const games = { assertNotDeleting: () => {}, listOwn: () => storage.sql.exec('SELECT game_id FROM content_games').toArray().map(r => ({ gameId: r.game_id })) };
const store = new GameCopyStore({ storage, principal: () => actor, games });
const loader = createPinnedCopyLoader({ allocateEntityId: () => 'op-' + randomUUID() });
const profile = new FixedCopyProfile({ loadCopy: loader });
const { game: pinned } = await profile.capture({ gameId: 'pinned-src', ownerId: 'owner-1' });
const FIRST = pinned.chapterOrder[0];
const FULL_NUMBERS = { max_prod: 4000, prod: 3000, growth: 100, defence: 100, troops: 50, type: 2, view: 1 };
const SIEGE = 'ki-1995:siege:7';

function fresh() {
  const gameId = randomUUID();
  storage.sql.exec('INSERT INTO content_games VALUES(?,?)', gameId, actor.id);
  store.ensureFromGame('tok', gameId, structuredClone(pinned));
  return gameId;
}
const readData = gameId => store.read('tok', gameId).data;
const hex64 = () => randomBytes(32).toString('hex');
const fails = async (fn, code, status) => {
  try { await fn(); } catch (e) { assert.equal(e.code, code, 'code ' + e.code); assert.equal(e.status, status, 'status ' + e.status); return; }
  assert.fail('should have thrown ' + code);
};
function slotOf(data, cityId) { return data.cities[cityId].runtimeSlot; }

// Straight-south site: new center (x, y+4) scanning after every existing
// center, corridor cells free, from-city south slot (index 3) unused.
function findSite(data) {
  const placements = data.map.placements;
  const maxKey = Math.max(...placements.map(p => p.y * 384 + p.x));
  const roadCells = new Set();
  for (const road of data.map.roads) for (const pt of road.geometry) roadCells.add(`${pt.x},${pt.y}`);
  const centers = new Set(placements.map(p => `${p.x},${p.y}`));
  const takenSlot3 = new Set();
  for (const road of data.map.roads)
    for (const s of road.nativeBinding?.slots ?? []) if (s.slot === 3) takenSlot3.add(s.node);
  for (const p of placements.filter(p => p.cityId).sort((a, b) => (b.y * 384 + b.x) - (a.y * 384 + a.x))) {
    if (takenSlot3.has(p.cityId)) continue;
    const x = p.x, y = p.y + 4;
    if (y > 255 || (y * 384 + x) <= maxKey) continue;
    const cells = [[x, y - 3], [x, y - 2], [x, y - 1], [x, y]];
    if (cells.some(([cx, cy]) => centers.has(`${cx},${cy}`) || roadCells.has(`${cx},${cy}`))) continue;
    return { fromCityId: p.cityId, x, y };
  }
  return null;
}
function freeEarlyCell(data) {
  const taken = new Set();
  for (const p of data.map.placements) taken.add(`${p.x},${p.y}`);
  for (const road of data.map.roads) for (const pt of road.geometry) taken.add(`${pt.x},${pt.y}`);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 384; x++)
    if (!taken.has(`${x},${y}`)) return { x, y };
  return null;
}

test('D2 full chain compiles a 193-city copy', async () => {
  const gameId = fresh();
  store.writeModule('tok', gameId, 'cities', { create: { name: '拓撲新城', numbers: FULL_NUMBERS } });
  const site = findSite(readData(gameId));
  assert.ok(site, 'a southern expansion site exists');
  const gid = readData(gameId).gameId;
  const pieceId = `${gid}#city-piece-` + hex64();
  store.writeModule('tok', gameId, 'map', { edits: [{ op: 'city-stamp', pieceId, x: site.x, y: site.y, tile: 205 }] });
  // Unbound pieces fail validation until bound.
  assert.equal(store.validateWhole('tok', gameId).state, 'failed');
  store.writeModule('tok', gameId, 'map', { edits: [{ op: 'city-bind', pieceId, cityId: 'city-192' }] });
  store.writeModule('tok', gameId, 'chapters', { admit: { cityId: 'city-192', troops_cap: 60, battleMapId: SIEGE } });
  // Corridor paints on top (decorations compose above base/groups); ports
  // D4..DD at both ends, C8 middle.
  const paints = [[-3, 212], [-2, 200], [-1, 212]];
  for (const [dy, tile] of paints)
    store.writeModule('tok', gameId, 'map', { edits: [{ op: 'decoration-place',
      instanceId: `${gid}#decoration-` + hex64(), materialId: `tile-${tile}`,
      variantRef: 'original', x: site.x, y: site.y + dy, waterClass: null }] });
  const roadId = `${gid}#road-` + hex64();
  store.writeModule('tok', gameId, 'map', { edits: [{ op: 'road-add', roadId,
    fromCityId: site.fromCityId, toCityId: 'city-192', travelKind: 'land',
    geometry: [{ x: site.x, y: site.y - 3 }, { x: site.x, y: site.y - 2 }, { x: site.x, y: site.y - 1 }] }] });
  const data = readData(gameId);
  const road = data.map.roads.find(r => r.id === roadId);
  assert.ok(road?.nativeBinding?.slots, 'road carries a certified binding');
  const row192 = data.chapters[FIRST].state.cities.find(c => c.idx === 192);
  assert.ok(!('raw' in row192) && row192.battleMapId === SIEGE);
  assert.ok(row192.neighbourCityIds.includes(site.fromCityId));
  const legacyRow = data.chapters[FIRST].state.cities.find(c => c.idx === slotOf(data, site.fromCityId));
  assert.ok(!('raw' in legacyRow) && legacyRow.cityId === site.fromCityId, 'endpoint legacy row converted to named');
  assert.ok(legacyRow.neighbourCityIds.includes('city-192'));
  const compiled = compileTrialSource(data, sha);
  assert.equal(compiled.roadGraph.nodes.length, 193);
  assert.equal(compiled.roadGraph.edges.length, data.map.roads.length);
  const ticket = store.validateWhole('tok', gameId);
  assert.equal(ticket.state, 'passed');
  assert.ok(ticket.ticket, 'validation tickets the 193-city copy');
});

test('D2 ops fail closed', async () => {
  const gameId = fresh();
  const gid = readData(gameId).gameId;
  store.writeModule('tok', gameId, 'cities', { create: { name: '閉門新城', numbers: FULL_NUMBERS } });
  const data0 = readData(gameId);
  // Occupied center is refused.
  const taken = data0.map.placements[0];
  await fails(() => store.writeModule('tok', gameId, 'map', { edits: [{ op: 'city-stamp',
    pieceId: `${gid}#city-piece-` + hex64(), x: taken.x, y: taken.y, tile: 205 }] }),
    'COPY_MAP_CITY_CELL_TAKEN', 422);
  // A free cell that does not scan last is refused.
  const early = freeEarlyCell(data0);
  await fails(() => store.writeModule('tok', gameId, 'map', { edits: [{ op: 'city-stamp',
    pieceId: `${gid}#city-piece-` + hex64(), x: early.x, y: early.y, tile: 205 }] }),
    'COPY_MAP_CITY_SCAN_ORDER', 422);
  // Bind unknown city / unknown piece.
  const site = findSite(data0);
  const pieceId = `${gid}#city-piece-` + hex64();
  store.writeModule('tok', gameId, 'map', { edits: [{ op: 'city-stamp', pieceId, x: site.x, y: site.y, tile: 205 }] });
  await fails(() => store.writeModule('tok', gameId, 'map', { edits: [{ op: 'city-bind', pieceId, cityId: 'city-404' }] }), 'COPY_MAP_DELTA', 422);
  await fails(() => store.writeModule('tok', gameId, 'map', { edits: [{ op: 'city-bind', pieceId: 'nope', cityId: 'city-192' }] }), 'COPY_MAP_DELTA', 422);
  store.writeModule('tok', gameId, 'map', { edits: [{ op: 'city-bind', pieceId, cityId: 'city-192' }] });
  store.writeModule('tok', gameId, 'chapters', { admit: { cityId: 'city-192', troops_cap: 60, battleMapId: SIEGE } });
  // Road through the new city center is refused.
  await fails(() => store.writeModule('tok', gameId, 'map', { edits: [{ op: 'road-add',
    roadId: `${gid}#road-` + hex64(), fromCityId: site.fromCityId, toCityId: 'city-192', travelKind: 'land',
    geometry: [{ x: site.x, y: site.y }, { x: site.x, y: site.y - 1 }] }] }), 'COPY_MAP_ROAD_THROUGH_CITY', 422);
  // Unpainted corridor fails the certified construction check.
  await fails(() => store.writeModule('tok', gameId, 'map', { edits: [{ op: 'road-add',
    roadId: `${gid}#road-` + hex64(), fromCityId: site.fromCityId, toCityId: 'city-192', travelKind: 'land',
    geometry: [{ x: site.x, y: site.y - 3 }, { x: site.x, y: site.y - 2 }, { x: site.x, y: site.y - 1 }] }] }), 'COPY_MAP_ROAD_SHAPE', 422);
});
