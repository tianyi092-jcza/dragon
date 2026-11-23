// Dropped-tile roads: road/gate tiles ARE road data (user-authorized Web product
// decision). A connected chain whose ends satisfy the port rule at two distinct
// bound cities materializes on save; anything else stays decoration with a red
// warning (never a save block). Isolated store + hand-built scenes.
import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { analyzeRoadChains, collectRoadCells, traceRoadChains, isAutoRoadId } from '../web/src/editor/roadchain.js';

const bounds = { minX: 0, minY: 0, width: 16, height: 16 };
const tileDef = n => ({ id: `tile-${n}`, footprint: [[0, 0]], anchor: [0, 0], variants: { original: { tiles: [[0, 0, n]] } } });
const componentDefinitions = { 'tile-200': tileDef(200), 'tile-212': tileDef(212), 'tile-205': tileDef(205), 'tile-1': tileDef(1) };
const deco = (x, y, tile, id) => ({ id: id ?? `d-${x}-${y}`, definitionRef: `tile-${tile}`, variantRef: 'original', x, y });
const cityA = { cityId: 'city-a', runtimeSlot: 0, name: '甲', x: 2, y: 5, max_prod: 1, prod: 1, growth: 1, defence: 1, troops: 1, type: 2, view: 1 };
const cityB = { cityId: 'city-b', runtimeSlot: 1, name: '乙', x: 7, y: 5, max_prod: 1, prod: 1, growth: 1, defence: 1, troops: 1, type: 2, view: 1 };
const CORRIDOR = [[3, 5, 212], [4, 5, 200], [5, 5, 200], [6, 5, 212]];
function scene({ cities = [cityA, cityB], pieces = [{ id: 'pa', cityId: 'city-a', x: 2, y: 5 }, { id: 'pb', cityId: 'city-b', x: 7, y: 5 }], decorations = CORRIDOR.map(([x, y, tile], i) => deco(x, y, tile, `p${i}`)), roads = [] } = {}) {
  const source = {
    gameId: 'road-auto-test',
    map: { bounds: { ...bounds }, placements: pieces, decorations, roads },
    cities: Object.fromEntries(cities.map(c => [c.cityId, c])),
    chapterOrder: [], chapters: {}, componentDefinitions,
  };
  const terrain = new Uint8Array(16 * 16).fill(1);
  for (const d of decorations) {
    const tile = componentDefinitions[d.definitionRef]?.variants?.original?.tiles?.[0]?.[2];
    if (Number.isInteger(tile)) terrain[d.y * 16 + d.x] = tile;
  }
  return { source, terrain };
}

test('collect tiles and trace a straight chain', () => {
  const { source, terrain } = scene();
  const cells = collectRoadCells(source, terrain);
  assert.equal(cells.size, 4);
  const chains = traceRoadChains(cells);
  assert.equal(chains.length, 1);
  assert.equal(chains[0].status, 'ok');
  assert.deepEqual(chains[0].cells.map(c => [c.x, c.y]), [[3, 5], [4, 5], [5, 5], [6, 5]]);
  assert.ok(chains[0].cells[0].tile >= 0xd4);
});

test('two right-angle bends trace one corridor rather than diagonal false junctions', () => {
  const points = [[1,1],[1,2],[1,3],[2,3],[3,3],[4,3],[4,4],[4,5]];
  const chains = traceRoadChains(new Map(points.map(([x,y]) => [`${x},${y}`, { x,y }])));
  assert.equal(chains.length, 1); assert.equal(chains[0].status, 'ok');
  assert.deepEqual(chains[0].cells.map(p => [p.x,p.y]), points);
});

test('a small city can connect east and south without merging the two gate tiles', () => {
  const cities = [cityA, cityB, { ...cityA, cityId:'city-c', runtimeSlot:2, y:10 }];
  const pieces = cities.map(({cityId,x,y}) => ({id:`p-${cityId}`,cityId,x,y}));
  const decorations = [...CORRIDOR,[2,6,212],[2,7,200],[2,8,200],[2,9,212]].map(([x,y,t]) => deco(x,y,t));
  const {source,terrain} = scene({cities,pieces,decorations});
  const {derived,problems} = analyzeRoadChains(source,terrain);
  assert.deepEqual(problems,[]);
  assert.deepEqual(derived.map(r=>[r.fromCityId,r.toCityId].sort().join('/')).sort(),['city-a/city-b','city-a/city-c']);
});

test('analyze materializes a road between two bound cities', () => {
  const { source, terrain } = scene();
  const { derived, problems } = analyzeRoadChains(source, terrain, {});
  assert.equal(problems.length, 0);
  assert.equal(derived.length, 1);
  const road = derived[0];
  assert.ok(isAutoRoadId(source.gameId, road.id));
  assert.deepEqual([road.fromCityId, road.toCityId], ['city-a', 'city-b']);
  assert.ok(road.nativeBinding);
  assert.deepEqual(road.geometry.map(p => [p.x, p.y]), [[3, 5], [4, 5], [5, 5], [6, 5]]);
  const again = analyzeRoadChains({ ...source, map: { ...source.map, roads: derived } }, terrain, {});
  assert.deepEqual(again.derived, derived);
  assert.equal(again.problems.length, 0);
});

test('unconnected, junction chains warn without throwing; through-city splits at the center', () => {
  const lone = scene({ decorations: [deco(3, 5, 200, 'p0')], cities: [], pieces: [] });
  const loneTerrain = new Uint8Array(16 * 16).fill(1); loneTerrain[5 * 16 + 3] = 200;
  assert.deepEqual(analyzeRoadChains(lone.source, loneTerrain, {}).problems.map(p => p.code), ['ROAD_UNLINKED']);
  const tee = scene({ decorations: [deco(3, 5, 200, 'p0'), deco(4, 5, 200, 'p1'), deco(5, 5, 200, 'p2'), deco(4, 4, 200, 'p3')], cities: [], pieces: [] });
  const teeTerrain = new Uint8Array(16 * 16).fill(1);
  for (const [x, y] of [[3, 5], [4, 5], [5, 5], [4, 4]]) teeTerrain[y * 16 + x] = 200;
  assert.deepEqual(analyzeRoadChains(tee.source, teeTerrain, {}).problems.map(p => p.code), ['ROAD_JUNCTION']);
  const through = scene({
    cities: [cityA, cityB, { ...cityA, cityId: 'city-m', runtimeSlot: 2, name: '中转' }],
    pieces: [{ id: 'pa', cityId: 'city-a', x: 2, y: 5 }, { id: 'pm', cityId: 'city-m', x: 5, y: 5 }, { id: 'pb', cityId: 'city-b', x: 8, y: 5 }],
    decorations: [[3, 5, 212], [4, 5, 200], [5, 5, 200], [6, 5, 200], [7, 5, 212]].map(([x, y, t], i) => deco(x, y, t, `q${i}`)),
  });
  const throughTerrain = new Uint8Array(16 * 16).fill(1);
  for (const [x, y, t] of [[3, 5, 212], [4, 5, 200], [5, 5, 200], [6, 5, 200], [7, 5, 212]]) throughTerrain[y * 16 + x] = t;
  // A paved-through city splits at its center; stumps abutting two cities
  // are genuinely ambiguous, plain dead-ends simply unlinked.
  assert.deepEqual(analyzeRoadChains(through.source, throughTerrain, {}).problems.map(p => p.code), ['ROAD_AMBIGUOUS', 'ROAD_UNLINKED']);
});

test('warnings do not block saves; valid chains auto-materialize on save', async () => {
  const { GameCopyStore } = await import('../server/gamecopy.js');
  const { DatabaseSync } = await import('node:sqlite');
  const { createPinnedCopyLoader } = await import('./editor_trusted_copy.mjs');
  const { FixedCopyProfile } = await import('../server/copyprofile.js');
  const loader = createPinnedCopyLoader({ allocateEntityId: () => 'road-auto-' + randomUUID() });
  const profile = new FixedCopyProfile({ loadCopy: loader });
  const { game: frozenSeed } = await profile.capture({ gameId: 'road-auto-src', ownerId: 'owner-1' });
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE content_games (game_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL)');
  const gameId = randomUUID();
  db.prepare('INSERT INTO content_games VALUES(?,?)').run(gameId, 'owner-1');
  const sql = { exec: (q, ...p) => {
    const stmt = db.prepare(String(q));
    if (/^\s*(SELECT|WITH|PRAGMA)\b/i.test(q)) { const rows = stmt.all(...p); return { toArray: () => rows }; }
    stmt.run(...p); return { toArray: () => [] };
  } };
  const storage = { sql, transactionSync: fn => fn() };
  const store = new GameCopyStore({ storage, principal: () => ({ id: 'owner-1', must_change: 0, epoch: 1 }), games: { assertNotDeleting: () => {}, listOwn: () => [] } });
  const game = { ...structuredClone(frozenSeed), gameId };
  store.ensureFromGame('tok', gameId, game);
  const data0 = store.read('tok', gameId).data;
  const taken = new Set([...data0.map.placements.map(p => `${p.x},${p.y}`), ...data0.map.roads.flatMap(r => (r.geometry ?? []).map(p => `${p.x},${p.y}`))]);
  let spot = null;
  for (let y = 255; y >= 0 && !spot; y--) for (let x = 383; x >= 5 && !spot; x--) {
    let clear = true;
    for (let dx = -5; dx <= 0 && clear; dx++) if (taken.has(`${x + dx},${y}`)) clear = false;
    if (clear) spot = [x, y];
  }
  assert.ok(spot, 'need a free 6-cell row run');
  const [ex, ey] = spot;
  const hex = c => c.repeat(64);
  const stamp = (suffix, tile, x, y) => store.writeModule('tok', gameId, 'map', { edits: [{ op: 'decoration-place', instanceId: `${gameId}#decoration-` + hex(suffix), materialId: `tile-${tile}`, variantRef: 'original', x, y, waterClass: null }] });
  const createCity = name => store.writeModule('tok', gameId, 'cities', { create: { name, numbers: { max_prod: 4000, prod: 3000, growth: 100, defence: 100, troops: 50, type: 2, view: 1 }, battleMapId: 'ki-1995:siege:7', troops_cap: 60 } });
  const placeCity = (letter, x, y) => store.writeModule('tok', gameId, 'map', { edits: [{ op: 'city-stamp', pieceId: `${gameId}#city-piece-` + hex(letter), x, y, tile: 205 }] });
  const bindCity = (letter, cityId) => store.writeModule('tok', gameId, 'map', { edits: [{ op: 'city-bind', pieceId: `${gameId}#city-piece-` + hex(letter), cityId }] });
  // Unconnected tiles: save succeeds, no road (red warning only).
  stamp('a', 200, ex - 2, ey); stamp('b', 200, ex - 1, ey);
  let got = store.read('tok', gameId).data;
  assert.equal(got.map.roads.filter(r => isAutoRoadId(gameId, r.id)).length, 0);
  // Two new cities + gate corridor between them: road materializes with auto id.
  createCity('路甲'); createCity('路乙');
  const citiesNow = Object.values(store.read('tok', gameId).data.cities);
  const cA = citiesNow.find(c => c.name === '路甲'), cB = citiesNow.find(c => c.name === '路乙');
  placeCity('c', ex - 5, ey); bindCity('c', cA.cityId);
  placeCity('d', ex, ey); bindCity('d', cB.cityId);
  stamp('e', 212, ex - 4, ey); stamp('f', 200, ex - 3, ey); stamp('0', 200, ex - 2, ey); stamp('1', 212, ex - 1, ey);
  got = store.read('tok', gameId).data;
  const auto = got.map.roads.filter(r => isAutoRoadId(gameId, r.id));
  assert.equal(auto.length, 1);
  assert.deepEqual([auto[0].fromCityId, auto[0].toCityId].sort(), [cA.cityId, cB.cityId].sort());
  assert.ok(auto[0].nativeBinding);
  // Removing tiles drops the auto road again.
  store.writeModule('tok', gameId, 'map', { edits: [{ op: 'decoration-remove', memberIds: [`${gameId}#decoration-` + hex('f')] }] });
  got = store.read('tok', gameId).data;
  assert.equal(got.map.roads.filter(r => isAutoRoadId(gameId, r.id)).length, 0);
});
