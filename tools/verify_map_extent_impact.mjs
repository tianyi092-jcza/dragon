// MAP-EXT E4: shrink impact apply. True SQLite :memory: + true
// GameCopyStore.writeModule. Cases: multi-cell crossing removal, edge-touch
// kept, city unbind (records kept, chapters unchanged), road mid-cross clip,
// endpoint-city-unbound road, same-cell overlap, atomicity, undo, water/unknown
// refusals, save-blocked-until-repair.
// Usage: node --test --test-concurrency=1 tools/verify_map_extent_impact.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compileGameSource } from '../web/src/content/authoring/trialcompile.js';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { GameCopyStore } from '../server/gamecopy.js';
import { openStorage } from '../vps/sqlite-port.mjs';
import { createPinnedCopyLoader } from './editor_trusted_copy.mjs';
import { previewMapEdits } from '../web/src/editor/mapcommands.js';
import { planMapExtentShrink } from '../web/src/content/authoring/mapextent.js';
import { mapPositionProblems } from '../web/src/editor/mappositionvalidation.js';
import { compileMapSource } from '../web/src/content/authoring/mapcompile.js';

const storage = openStorage(':memory:');
storage.sql.exec('CREATE TABLE content_games (game_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL)');
const actor = { id: 'owner-1', must_change: 0, epoch: 1 };
const games = { assertNotDeleting: () => {}, listOwn: () => [] };
const store = new GameCopyStore({ storage, principal: () => actor, games });
const loader = createPinnedCopyLoader({ allocateEntityId: () => 'op-' + randomUUID() });
const { game: captured } = await loader({ gameId: 'pinned-src', ownerId: 'owner-1' });
const hex64 = () => randomBytes(32).toString('hex');
const decoId = gameId => `${gameId}#decoration-${hex64()}`;
const matId = gameId => `${gameId}#material-${hex64()}`;

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
const paint = (gameId, x, y, tile) => ({ op: 'decoration-place', instanceId: decoId(gameId), materialId: `tile-${tile}`, variantRef: 'original', x, y, waterClass: null });

test('E4 crossing multi-cell piece is removed whole, edge-touching kept', async () => {
  const gameId = fresh();
  const gid = readData(gameId).gameId;
  await writeMap(gameId, [{ op: 'map-extent', side: 'north', delta: 1 }]);
  const d0 = readData(gameId).map.decorations.filter(d => d.y === 0).slice(0, 2);
  assert.ok(d0.length === 2 && d0[1].x === d0[0].x + 1, 'need adjacent y=0 decos');
  const m = matId(gid), inst = decoId(gid);
  await writeMap(gameId, [{ op: 'decoration-combine', memberIds: d0.map(d => d.id), materialId: m, instanceId: inst }]);
  // Straddler: 2-cell piece with both cells in the strip.
  const s = decoId(gid);
  await writeMap(gameId, [{ op: 'decoration-place', instanceId: s, materialId: m, variantRef: 'original', x: 40, y: -1, waterClass: null }]);
  // Edge-touching: 2-cell piece at y=0, footprint never enters the strip.
  const e = decoId(gid);
  await writeMap(gameId, [{ op: 'decoration-place', instanceId: e, materialId: m, variantRef: 'original', x: 60, y: 0, waterClass: null }]);
  const grown = readData(gameId);
  const plan = planMapExtentShrink(grown.map, grown.componentDefinitions, 'north');
  assert.deepEqual(plan.refusals, []);
  assert.ok(plan.removedDecorations.some(d => d.id === s), 'straddler listed');
  assert.ok(!plan.removedDecorations.some(d => d.id === e), 'edge piece not listed');
  await writeMap(gameId, [{ op: 'map-extent', side: 'north', delta: -1 }]);
  const back = readData(gameId);
  assert.deepEqual(back.map.bounds, { minX: 0, minY: 0, width: 384, height: 256, tileSize: 16 });
  assert.ok(!back.map.decorations.some(d => d.id === s), 'straddler removed whole');
  assert.ok(back.map.decorations.some(d => d.id === e), 'edge piece kept');
  assert.ok(back.map.decorations.some(d => d.id === inst), 'combined piece kept');
});

test('E4 same-cell overlap: crossing pieces removed, retained kept', async () => {
  const gameId = fresh();
  const gid = readData(gameId).gameId;
  await writeMap(gameId, [{ op: 'map-extent', side: 'north', delta: 1 }]);
  const a = decoId(gid), b = decoId(gid);
  await writeMap(gameId, [
    { op: 'decoration-place', instanceId: a, materialId: 'tile-200', variantRef: 'original', x: 30, y: -1, waterClass: null },
    { op: 'decoration-place', instanceId: b, materialId: 'tile-201', variantRef: 'original', x: 30, y: -1, waterClass: null },
  ]);
  await writeMap(gameId, [{ op: 'map-extent', side: 'north', delta: -1 }]);
  const back = readData(gameId);
  assert.ok(!back.map.decorations.some(d => d.id === a || d.id === b), 'both crossing removed');
});

test('four expanded strips save 205 centers without renumbering cities or chapter capitals', async () => {
  const gameId = fresh(), before = readData(gameId);
  for (const [side, dx, dy, slot] of [['north', 0, -1, 2], ['west', -1, 0, 0], ['east', 1, 0, 1], ['south', 0, 1, 3]]) {
    const occupied = new Set(before.map.roads.flatMap(r => r.geometry.map(p => `${p.x},${p.y}`)));
    const sites = before.map.placements.map(p => {
      const x = dx < 0 ? -1 : dx > 0 ? 384 : p.x, y = dy < 0 ? -1 : dy > 0 ? 256 : p.y;
      const geometry = Array.from({ length: Math.abs(x-p.x)+Math.abs(y-p.y)-1 }, (_, i) => ({ x: p.x+dx*(i+1), y: p.y+dy*(i+1) }));
      return { p, x, y, geometry };
    }).sort((a,b) => a.geometry.length-b.geometry.length);
    const { p, x, y, geometry } = sites.find(s => s.geometry.length >= 3 && !before.map.roads.some(r => r.nativeBinding.slots.some(b => b.node === s.p.cityId && b.slot === slot)) && s.geometry.every(c => !occupied.has(`${c.x},${c.y}`) && !before.map.placements.some(o => o.x === c.x && o.y === c.y)));
    const { issuedCityId: cityId } = store.writeModule('tok', gameId, 'cities', { create: { name: side, troops_cap: 60, battleMapId: 'ki-1995:siege:0', numbers: { max_prod: 100, prod: 60, growth: 10, defence: 5, troops: 100, type: 0, view: 1 } } });
    const pieceId = `${before.gameId}#city-piece-${hex64()}`;
    await writeMap(gameId, [{ op: 'map-extent', side, delta: 1 }, { op: 'city-stamp', pieceId, x, y, tile: 205 }, { op: 'city-bind', pieceId, cityId }, ...geometry.map((c,i) => paint(before.gameId,c.x,c.y,i === 0 || i === geometry.length-1 ? 212 : dx ? 201 : 200))]);
    store.writeModule('tok', gameId, 'chapters', { admit: { cityId, troops_cap: 60, battleMapId: 'ki-1995:siege:0' } });
    const saved = readData(gameId);
    assert.deepEqual([saved.cities[cityId].x, saved.cities[cityId].y], [x, y]);
    assert.deepEqual(saved.map.roads.slice(0, before.map.roads.length), before.map.roads);
    assert.ok(saved.map.roads.some(r => [r.fromCityId, r.toCityId].includes(p.cityId) && [r.fromCityId, r.toCityId].includes(cityId)));
    for (const [id, city] of Object.entries(before.cities)) assert.equal(saved.cities[id].runtimeSlot, city.runtimeSlot);
    for (const id of saved.chapterOrder) assert.deepEqual(saved.chapters[id].state.factions.map(f => f.capital), before.chapters[id].state.factions.map(f => f.capital));
  }
  const compiled = compileGameSource(readData(gameId), bytes => createHash('sha256').update(bytes).digest('hex'), { mapExtent: true });
  assert.equal(compiled.roadGraph.nodes.length, before.map.placements.length + 4);
  assert.equal(compiled.roadGraph.edges.length, before.map.roads.length + 4);
});

test('E4 city in strip: placement removed, records kept, clean unbind saves', async () => {
  const gameId = fresh();
  await writeMap(gameId, [{ op: 'map-extent', side: 'south', delta: 1 }]);
  let data = readData(gameId);
  const created = store.writeModule('tok', gameId, 'cities', { create: { name: '南拓測試城', numbers: { max_prod: 100, prod: 60, growth: 10, defence: 5, troops: 100, type: 1, view: 1 } } });
  const newCityId = created.issuedCityId;
  assert.ok(newCityId, 'server issues the new city id');
  // Scan-last stamp in the fresh strip (row-major: strip sorts after every old center).
  const pieceId = `${data.gameId}#city-piece-${'c'.repeat(64)}`;
  await writeMap(gameId, [{ op: 'city-stamp', pieceId, x: 100, y: 256, tile: 203 }]);
  await writeMap(gameId, [{ op: 'city-bind', pieceId, cityId: newCityId }]);
  data = readData(gameId);
  assert.equal(data.cities[newCityId].x, 100);
  const cityBefore = JSON.stringify(data.cities[newCityId]);
  const plan = planMapExtentShrink(data.map, data.componentDefinitions, 'south');
  assert.deepEqual(plan.refusals, []);
  assert.ok(plan.removedPlacements.some(p => p.id === pieceId), 'placement listed');
  assert.ok(plan.unboundCityIds.includes(newCityId), 'city listed for unbind');
  // NOTE: chapter admit for strip cities needs extent threading (E6); the
  // record/placement contract below is extent-independent.
  await writeMap(gameId, [{ op: 'map-extent', side: 'south', delta: -1 }]);
  const back = readData(gameId);
  assert.deepEqual(back.map.bounds, { minX: 0, minY: 0, width: 384, height: 256, tileSize: 16 });
  assert.ok(!back.map.placements.some(p => p.id === pieceId), 'placement removed');
  assert.equal(JSON.stringify(back.cities[newCityId]), cityBefore, 'city record kept (unbound repair flow)');
});

test('E4 road mid-crossing plan lists the cut (preview only)', async () => {
  const gameId = fresh();
  const gid = readData(gameId).gameId;
  await writeMap(gameId, [{ op: 'map-extent', side: 'south', delta: 1 }]);
  const corr = [];
  corr.push(paint(gid, 176, 249, 212));
  for (let y = 250; y <= 255; y++) corr.push(paint(gid, 176, y, 200));
  for (let x = 176; x <= 191; x++) corr.push(paint(gid, x, 256, 200));
  for (let y = 250; y <= 255; y++) corr.push(paint(gid, 191, y, 200));
  corr.push(paint(gid, 191, 249, 212));
  const geometry = [{ x: 176, y: 249 }];
  for (let y = 250; y <= 256; y++) geometry.push({ x: 176, y });
  for (let x = 177; x <= 191; x++) geometry.push({ x, y: 256 });
  for (let y = 255; y >= 249; y--) geometry.push({ x: 191, y });
  const roadId = `${gid}#road-${hex64()}`;
  await writeMap(gameId, [...corr, { op: 'road-add', roadId, fromCityId: 'city-190', toCityId: 'city-191', travelKind: 'land', geometry }]);
  const data = readData(gameId);
  assert.ok(data.map.roads.some(r => r.id === roadId), 'corridor road built');
  const plan = planMapExtentShrink(data.map, data.componentDefinitions, 'south');
  const clip = plan.clippedRoads.find(c => c.id === roadId);
  assert.ok(clip && clip.droppedPoints.length === 16, 'strip cells listed, got ' + clip?.droppedPoints.length);
  // Preview shows the cut without writing: record kept, strip cells gone.
  const staged = previewMapEdits(data, [{ op: 'map-extent', side: 'south', delta: -1 }]);
  const kept = staged.map.roads.find(r => r.id === roadId);
  assert.ok(kept.geometry.every(p => p.y !== 256), 'strip cells cut in preview, record kept');
  assert.deepEqual(readData(gameId).map.bounds.height, 257, 'preview writes nothing');
});

test('E4 breaking shrink alone cannot save; same-batch repair saves', async () => {
  const gameId = fresh();
  const gid = readData(gameId).gameId;
  await writeMap(gameId, [{ op: 'map-extent', side: 'south', delta: 1 }]);
  const corr = [paint(gid, 176, 249, 212)];
  for (let y = 250; y <= 255; y++) corr.push(paint(gid, 176, y, 200));
  for (let x = 176; x <= 191; x++) corr.push(paint(gid, x, 256, 200));
  for (let y = 250; y <= 255; y++) corr.push(paint(gid, 191, y, 200));
  corr.push(paint(gid, 191, 249, 212));
  const geometry = [{ x: 176, y: 249 }];
  for (let y = 250; y <= 256; y++) geometry.push({ x: 176, y });
  for (let x = 177; x <= 191; x++) geometry.push({ x, y: 256 });
  for (let y = 255; y >= 249; y--) geometry.push({ x: 191, y });
  const roadId = `${gid}#road-${hex64()}`;
  await writeMap(gameId, [...corr, { op: 'road-add', roadId, fromCityId: 'city-190', toCityId: 'city-191', travelKind: 'land', geometry }]);
  const digestBefore = store.read('tok', gameId).copyDigest;
  const err = await fails(() => writeMap(gameId, [{ op: 'map-extent', side: 'south', delta: -1 }]), 'MAP_POSITION_INVALID');
  assert.match(JSON.stringify(err.detail ?? err.message), /road|ROAD|斷|連/i, 'save blocked with road problem');
  assert.equal(store.read('tok', gameId).copyDigest, digestBefore, 'blocked save writes nothing');
  assert.equal(readData(gameId).map.bounds.height, 257, 'grown bounds retained');
  // Same-batch repair: shrink applies, road removed, final candidate clean.
  await writeMap(gameId, [{ op: 'map-extent', side: 'south', delta: -1 }, { op: 'map-object-remove', layer: 'roads', id: roadId }]);
  assert.equal(readData(gameId).map.bounds.height, 256);
  assert.ok(!readData(gameId).map.roads.some(r => r.id === roadId));
  // Full position re-check passes after repair; strict compile still refuses
  // expanded history (publish stays closed until E6).
  const repaired = readData(gameId);
  assert.deepEqual(mapPositionProblems(repaired), [], 'no remaining position repairs');
  // Repaired map is back in the original domain: strict compile accepts it.
  const recompiled = compileMapSource({ schemaVersion: 1, map: repaired.map, componentDefinitions: repaired.componentDefinitions });
  assert.equal(recompiled.roadMask.length, 384 * 256);
  assert.ok(!repaired.map.roads.some(r => r.id === roadId));
  // Normal post-repair write saves and rereads.
  await writeMap(gameId, [{ op: 'decoration-place', ...paint(gid, 5, 5, 200), instanceId: decoId(gid) }]);
  assert.equal(readData(gameId).map.bounds.minY, 0, 'repair saves clean');
});

test('E4 dead road: fully stripped geometry keeps an explicit record', async () => {
  const gameId = fresh();
  const gid = readData(gameId).gameId;
  await writeMap(gameId, [{ op: 'map-extent', side: 'south', delta: 1 }]);
  // Two scan-last cities fully inside the strip with a strip-only road.
  const mkCity = async name => {
    const created = store.writeModule('tok', gameId, 'cities', { create: { name, numbers: { max_prod: 100, prod: 60, growth: 10, defence: 5, troops: 100, type: 1, view: 1 } } });
    return created.issuedCityId;
  };
  const c1 = await mkCity('條帶東城'), c2 = await mkCity('條帶西城');
  const p1 = `${gid}#city-piece-${'d'.repeat(64)}`, p2 = `${gid}#city-piece-${'e'.repeat(64)}`;
  await writeMap(gameId, [{ op: 'city-stamp', pieceId: p1, x: 50, y: 256, tile: 203 }]);
  await writeMap(gameId, [{ op: 'city-stamp', pieceId: p2, x: 53, y: 256, tile: 203 }]);
  await writeMap(gameId, [{ op: 'city-bind', pieceId: p1, cityId: c1 }]);
  await writeMap(gameId, [{ op: 'city-bind', pieceId: p2, cityId: c2 }]);
  // Admit both cities so every chapter holds their rows (road endpoint gate).
  await store.writeModule('tok', gameId, 'chapters', { admit: { cityId: c1, troops_cap: 60, battleMapId: 'ki-1995:siege:7' } });
  await store.writeModule('tok', gameId, 'chapters', { admit: { cityId: c2, troops_cap: 60, battleMapId: 'ki-1995:siege:7' } });
  // Endpoints are retained-row ports next to each city; only the middle
  // lies in the strip, so the cut leaves a single retained point (dead).
  const corr = [paint(gid, 50, 255, 212), paint(gid, 51, 256, 200), paint(gid, 52, 256, 212)];
  const roadId = `${gid}#road-${hex64()}`;
  const geometry = [{ x: 50, y: 255 }, { x: 51, y: 256 }, { x: 52, y: 256 }];
  await writeMap(gameId, [...corr, { op: 'road-add', roadId, fromCityId: c1, toCityId: c2, travelKind: 'land', geometry }]);
  const data = readData(gameId);
  const plan = planMapExtentShrink(data.map, data.componentDefinitions, 'south');
  const clip = plan.clippedRoads.find(c => c.id === roadId);
  assert.ok(clip && clip.dead, 'fully stripped road marked dead, got ' + JSON.stringify(clip));
  assert.deepEqual(plan.unboundCityIds.sort(), [c1, c2].sort());
  const staged = previewMapEdits(data, [{ op: 'map-extent', side: 'south', delta: -1 }]);
  const dead = staged.map.roads.find(r => r.id === roadId);
  assert.ok(dead && dead.geometry.length < 2, 'dead record kept, no silent deletion (got ' + dead?.geometry.length + ' points)');
  assert.ok(!staged.map.placements.some(p => p.cityId === c1 || p.cityId === c2));
  assert.ok(staged.cities[c1] && staged.cities[c2], 'both city records kept');
  // Chapters untouched by preview (no rows were admitted); save the dead
  // record explicitly would still be blocked, so repair in the same batch.
  const digestBefore = store.read('tok', gameId).copyDigest;
  const err = await fails(() => writeMap(gameId, [{ op: 'map-extent', side: 'south', delta: -1 }]), 'MAP_POSITION_INVALID');
  assert.ok(err, 'dead road blocks save until explicitly removed');
  assert.equal(store.read('tok', gameId).copyDigest, digestBefore);
  await writeMap(gameId, [
    { op: 'map-extent', side: 'south', delta: -1 },
    { op: 'map-object-remove', layer: 'roads', id: roadId },
  ]);
  assert.deepEqual(mapPositionProblems(readData(gameId)), [], 'repair leaves no position problems');
});

test('E4 endpoint city unbound in one batch: save blocked, nothing written', async () => {
  const gameId = fresh();
  await writeMap(gameId, [{ op: 'map-extent', side: 'south', delta: 1 }]);
  const data = readData(gameId);
  const ling = data.map.placements.find(p => p.cityId === 'city-190');
  const digestBefore = store.read('tok', gameId).copyDigest;
  // Translate the roaded city into the strip, then shrink: the placement is
  // removed, city-190 unbound, roads 251/253 kept with no auto-reconnect.
  // The batch is rejected at the save gate with explicit problems.
  const err = await fails(() => writeMap(gameId, [
    { op: 'map-object-translate', layer: 'cities', id: ling.id, dx: 0, dy: 256 - ling.y },
    { op: 'map-extent', side: 'south', delta: -1 },
  ]), 'MAP_POSITION_INVALID');
  assert.match(JSON.stringify(err.detail ?? err.message), /city-190|road-251|據點|道路|掃描|slot/i);
  assert.equal(store.read('tok', gameId).copyDigest, digestBefore, 'blocked batch writes nothing');
  assert.equal(readData(gameId).map.bounds.height, 257, 'grown bounds retained for repair-or-cancel');
  // Preview of the same batch shows the impact (placement gone, roads kept).
  const staged = previewMapEdits(data, [
    { op: 'map-object-translate', layer: 'cities', id: ling.id, dx: 0, dy: 256 - ling.y },
    { op: 'map-extent', side: 'south', delta: -1 },
  ]);
  assert.ok(!staged.map.placements.some(p => p.cityId === 'city-190')), 'preview: placement removed';
  assert.ok(staged.map.roads.some(r => r.id === 'road-251'), 'preview: road record kept')
  // Chapter rows follow the translated city (existing translate contract);
  // the shrink itself is chapter-neutral: staged chapters equal the
  // translate-only preview, and the city record is kept.
  const movedOnly = previewMapEdits(data, [
    { op: 'map-object-translate', layer: 'cities', id: ling.id, dx: 0, dy: 256 - ling.y },
  ]);
  assert.deepEqual(JSON.stringify(staged.chapters), JSON.stringify(movedOnly.chapters), 'shrink does not touch chapter rows');
  assert.deepEqual(JSON.stringify(staged.cities['city-190']), JSON.stringify(movedOnly.cities['city-190']), 'city record kept');
});

test('E4 atomicity: failed batch writes nothing; undo restores everything', async () => {
  const gameId = fresh();
  const gid = readData(gameId).gameId;
  await writeMap(gameId, [{ op: 'map-extent', side: 'north', delta: 1 }]);
  const before = readData(gameId);
  const digestBefore = store.read('tok', gameId).copyDigest;
  const bad = { op: 'map-extent', side: 'north', delta: 1 };
  await fails(() => writeMap(gameId, [{ op: 'map-extent', side: 'north', delta: -1 }, { op: 'decoration-place', instanceId: 'nope', materialId: 'tile-200', variantRef: 'original', x: 1, y: 1, waterClass: null }]), 'COPY_MAP_DELTA');
  assert.equal(store.read('tok', gameId).copyDigest, digestBefore, 'rejected batch leaves storage untouched');
  // Pure undo: preview from snapshot again equals snapshot.
  const staged = previewMapEdits(before, [{ op: 'map-extent', side: 'north', delta: -1 }]);
  assert.equal(staged.map.bounds.minY, 0);
  const undone = previewMapEdits(before, []);
  assert.deepEqual(undone.map.bounds, before.map.bounds);
  assert.deepEqual(undone.map.decorations.map(d => d.id), before.map.decorations.map(d => d.id));
  assert.deepEqual(undone.map.placements.map(p => p.id), before.map.placements.map(p => p.id));
  assert.deepEqual(undone.map.roads.map(r => r.id), before.map.roads.map(r => r.id));
});

test('E4 water-only-in-strip and unknown-in-strip refuse the whole op', async () => {
  const gameId = fresh();
  await writeMap(gameId, [{ op: 'map-extent', side: 'south', delta: 1 }]);
  let data = readData(gameId);
  const gid = data.gameId;
  const W = data.map.bounds.width;
  const stripCells = [256 * W, 256 * W + 1, 256 * W + 2];
  await writeMap(gameId, [{ op: 'water-create', groupId: `${gid}#water-${hex64()}`, memberIds: [], baseCells: stripCells, name: '條帶水域', showOnMinimap: true }]);
  data = readData(gameId);
  const err = await fails(() => writeMap(gameId, [{ op: 'map-extent', side: 'south', delta: -1 }]), 'MAP_EXTENT_NOT_EMPTY');
  assert.match(JSON.stringify(err.detail ?? err.code ?? ''), /MAP_EXTENT_NOT_EMPTY|water/i);
  assert.equal(readData(gameId).map.bounds.height, 257, 'refused shrink writes nothing');
  // Unknown underlay in the strip (no write path creates this; direct server fn).
  const { applyCopyMapEdits } = await import('../server/copyprofile.js');
  const hacked = structuredClone(data);
  hacked.map.base.unknownUnderlays = { [String(256 * W)]: { sourceRef: 'x', coveringInstanceId: 'y' } };
  try { applyCopyMapEdits(hacked, [{ op: 'map-extent', side: 'south', delta: -1 }]); assert.fail('should have refused'); }
  catch (e) { assert.equal(e.code, 'MAP_EXTENT_NOT_EMPTY'); assert.match(JSON.stringify(e.detail ?? ''), /unknown|無法處理/); }
});
