// MAP-EXT E9: extended-map save/restore/compatibility (isolated only).
// North (+5, y=-1 band) and west (+4, x=-1 band) on one world; two new cities
// admitted across all chapters with explicit troops caps and shared siege
// battlefields; roads built into both bands. Mid-march snapshots (player
// legion standing on y=-1, then on x=-1) go through the mock store,
// title-load admission (admitSavedScenario + prepare restore on fresh world
// objects), then hot-vs-cold step-sync to arrival: legion fields, waypoint
// direction, occupancy plane, RNG, clock serial. Refusals: wrong bounds /
// graph digest / terrain identity / missing movement / wrong chapter /
// corrupt span / mid-transition snapshot / stale-token overwrite; every
// refusal preserves the stored record. No running service, user copy,
// editor store, profile, SAVE.DAT or publish.
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { MINIMAP_SIZES, renderMinimapPixels } from '../web/src/content/authoring/minimap.js';
import { encodePNG } from '../server/pngio.js';
import { TRIAL_COMPILER_REVISION } from '../web/src/content/authoring/trialcompile.js';
import { ASSET_TYPES } from '../web/src/player/runtimecontract.js';
import { createPinnedCopyLoader } from './editor_trusted_copy.mjs';
import { admitChapterCity } from '../web/src/content/authoring/gamesource.js';
import { syncRoadEndpoints } from '../server/copyprofile.js';
import { expandMapOneStep } from '../web/src/content/authoring/mapextent.js';
import { composeMapLayers } from '../web/src/content/authoring/maplayers.js';
import { compileCityIdentity } from '../web/src/content/authoring/cityidentity.js';
import { buildRoad } from '../web/src/content/authoring/roadedit.js';
import { projectStructuredRoadGraph } from '../web/src/content/authoring/structuredroadgraph.js';
import { compileMapSource, assertMapConnected } from '../web/src/content/authoring/mapcompile.js';
import { compileTrialSource } from '../web/src/content/authoring/trialcompile.js';
import { loadPlayerPack } from '../web/src/player/playerpack.js';
import { createPlayerEnvironment } from '../web/src/player/playerenvironment.js';
import { GameBar } from '../web/src/ui/gamebar.js';
import { aiTick, performLegionSlotAction, tickStrategicCity } from '../web/src/game/ai.js';
import { createOriginalBattleRng } from '../web/src/game/battle/originalrng.js';
import { snapshotScenarioAssembly, prepareScenario, scenarioGridRoadContext } from '../web/src/game/scenarioassembly.js';
import { publishLegacyLegionRecord } from '../web/src/game/nativelegions.js';
import { countLegionActivation } from '../web/src/game/legioncounts.js';
import { snapshotState, admitSavedScenario } from '../web/src/game/savegame.js';
import { Clock } from '../web/src/game/clock.js';
import { saveJSON } from '../web/src/core/gamesavecodec.js';
import { createGameSaveStore, GameSaveConflictError } from '../web/src/core/gamesavestore.js';
import { gameSaveMemoryIDB } from './gamesave_mock.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');

async function extentSaveTransport(game, compiled) {
  const json = value => Buffer.from(JSON.stringify(value));
  const reply = (bytes, contentType) => ({ bytes, contentType, sha256: sha(bytes) });
  const { gameId } = game, revision = '1', sourceDigest = compiled.sourceDigest;
  const chapterId = game.chapterOrder[0];
  const manifest = { schemaVersion: 3, buildFormat: 'studio-world-grid-1', compilerRevision: TRIAL_COMPILER_REVISION,
    identity: { gameId, draftRevision: revision, sourceDigest }, world: { ...game.map.bounds, id: `${gameId}-world`, revision: sourceDigest },
    chapters: game.chapterOrder, assets: [], minimapAssets: [], portraits: [], visualAssets: { seasonAtlases: {}, seasons: {} } };
  const responses = new Map();
  const assets = { terrain: compiled.terrainBytes, roadCost: compiled.roadCost, roadOffset: compiled.roadOffsetBytes, roadGraph: json(compiled.roadGraph) };
  for (const [name, { w, h }] of Object.entries(MINIMAP_SIZES)) {
    const { pixels } = renderMinimapPixels(compiled.minimapGeography, compiled.roadMask, compiled.width, compiled.height, w, h, 1);
    assets[name === 'base' ? 'minimapBase' : 'minimapLarge'] = encodePNG(pixels, w, h, 3);
  }
  const roles = { terrain: 'rules-initial-terrain', roadGraph: 'world-road-grid', roadCost: 'legacy-grid-visual', roadOffset: 'legacy-grid-visual', minimapBase: 'automatic-minimap', minimapLarge: 'automatic-minimap' };
  for (const [assetId, bytes] of Object.entries(assets)) {
    const result = reply(bytes, ASSET_TYPES[assetId]);
    responses.set(`asset:${assetId}`, result);
    manifest[assetId.startsWith('minimap') ? 'minimapAssets' : 'assets'].push({ assetId, role: roles[assetId], sha256: result.sha256, byteLength: bytes.length, url: `/api/trial-asset?game=${gameId}&revision=${revision}&digest=${sourceDigest}&asset=${assetId}` });
  }
  const pinned = JSON.parse(await readFile(new URL('../server/pinned/world-manifest.txt', import.meta.url)));
  for (const [key, stem] of [['seasons', 'map_tiles_'], ['seasonAtlases', 'map_atlas_']]) for (const season of ['spring', 'summer', 'autumn', 'winter']) {
    const { url, byteLength, sha256: digest } = pinned.assets.find(row => row.path === `${stem}${season}.png`);
    manifest.visualAssets[key][season] = { path: url, url, byteLength, sha256: digest };
    responses.set(url, reply(await readFile(new URL('../web/' + url, import.meta.url)), 'image/png'));
  }
  const header = reply(json(manifest), 'application/json');
  responses.set('manifest', header);
  responses.set(`chapter:${chapterId}`, reply(json(game.chapters[chapterId].state), 'application/json'));
  const identity = { gameId, releaseId: 'extent-save', revision, sourceDigest, ordinal: '1.0', chapters: game.chapterOrder, chapterId, manifestDigest: header.sha256 };
  return { session: { identity, state: () => 'active', read: async role => responses.get(role) }, compilerRevision: TRIAL_COMPILER_REVISION, maxTotalBytes: 128 * 1024 * 1024, readStatic: async path => responses.get(path) };
}

test('E9 north-band and west-band mid-march save, title-load, step-sync to arrival', async t => {
  const tmp = await mkdtemp(join(tmpdir(), 'extent-save-'));
  try {
  const { game } = await createPinnedCopyLoader()({ gameId: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', ownerId: 'isolated' });
  const before = composeMapLayers(game);
  for (let i = 0; i < 5; i++) game.map = expandMapOneStep(game.map, 'north');
  for (let i = 0; i < 4; i++) game.map = expandMapOneStep(game.map, 'west');
  const map = game.map, bounds = map.bounds;
  assert.deepEqual(bounds, { minX: -4, minY: -5, width: 388, height: 261, tileSize: 16 });
  const expanded = composeMapLayers(game);
  for (const plane of ['terrain', 'geography', 'minimapGeography'])
    for (let y = 0; y < 256; y++)
      for (let x = 0; x < 384; x++)
        assert.equal(expanded[plane][(y - bounds.minY) * bounds.width + x - bounds.minX], before[plane][y * 384 + x]);
  for (let y = bounds.minY; y < bounds.minY + bounds.height; y++)
    for (let x = bounds.minX; x < bounds.minX + bounds.width; x++)
      if (x < 0 || y < 0) assert.equal(expanded.terrain[(y - bounds.minY) * bounds.width + x - bounds.minX], 95);

  const ordered = Object.values(game.cities).sort((a, b) => a.runtimeSlot - b.runtimeSlot).map(c => c.cityId);
  const placements = map.placements;
  const chapter0 = game.chapters[game.chapterOrder[0]].state;
  const factionOfPlacement = (p) => chapter0.cities[game.cities[p.cityId]?.runtimeSlot]?.faction;
  const topFaction = (pred, exclude = null) => {
    const counts = new Map();
    for (const p of placements) {
      if (!pred(p)) continue;
      const faction = factionOfPlacement(p);
      if (faction == null || faction === exclude) continue;
      counts.set(faction, (counts.get(faction) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  };
  const playerFaction = topFaction(p => p.y < 40) ?? chapter0.cities[0].faction;
  const roadCells = new Set(map.roads.flatMap(r => (r.geometry ?? []).map(p => `${p.x},${p.y}`)));
  const cityCells = new Set(placements.map(p => `${p.x},${p.y}`));
  const stamp = (geometry) => geometry.map((point) => ({ ...point, id: `e9-road-${point.x}-${point.y}`,
    definitionRef: `tile-${point === geometry[0] || point === geometry.at(-1) ? 212 : 200}`, variantRef: 'original' }));
  const cityMap = new Map(map.placements.map(p => [p.cityId, p]));
  const tilesNow = () => composeMapLayers(game).terrain;
  const tiles = (x, y) => tilesNow()[(y - bounds.minY) * bounds.width + x - bounds.minX];
  const tryLink = (anchor, dest, cells) => {
    if (cells.length < 2) return null;
    if (cells.some(p => roadCells.has(`${p.x},${p.y}`))) return null;
    if (cells.slice(1, -1).some(p => cityCells.has(`${p.x},${p.y}`))) return null;
    const stamps = stamp(cells);
    map.decorations = [...map.decorations, ...stamps];
    let probe;
    try {
      probe = buildRoad({ fromCityId: anchor.cityId, toCityId: dest.cityId, travelKind: 'land',
        geometry: cells, cities: new Map([...cityMap, [dest.cityId, dest]]), roads: map.roads, tiles }, bounds);
    } catch {
      map.decorations = map.decorations.slice(0, map.decorations.length - stamps.length);
      return null;
    }
    for (const p of cells) roadCells.add(`${p.x},${p.y}`);
    return { ...probe };
  };
  // North corridor: anchor low-y, straight up to y=-4, new city at y=-5.
  let anchorN = null, roadN = null, destN = null;
  const northCandidates = [...placements].sort((a, b) => a.y - b.y)
    .sort((a, b) => (factionOfPlacement(b) === playerFaction) - (factionOfPlacement(a) === playerFaction));
  for (const p of northCandidates) {
    for (const k of [0, 2, -2, 4, -4]) {
      const dx = p.x + k;
      if (dx < 0 || dx > 383 || Math.abs(k) > 2 && k !== 0) continue;
      const cells = [];
      for (let y = p.y - 1; y >= -4; y--) cells.push({ x: p.x, y });
      for (let x = p.x + Math.sign(k); Math.sign(k) !== 0 && (Math.sign(k) > 0 ? x <= dx : x >= dx); x += Math.sign(k)) cells.push({ x, y: -4 });
      const dest = { ...p, id: 'placement-north', cityId: 'city-north-guan', x: dx, y: -5 };
      delete dest.importRef;
      const probe = tryLink(p, dest, cells);
      if (probe) { anchorN = p; roadN = { ...probe, id: 'north-link' }; destN = dest; break; }
    }
    if (roadN) break;
  }
  assert.ok(roadN, 'no constructible north corridor');
  // West corridor: anchor low-x, straight left to x=-2, new city at x=-3.
  let anchorW = null, roadW = null, destW = null;
  const westCandidates = [...placements].sort((a, b) => a.x - b.x)
    .sort((a, b) => (factionOfPlacement(b) === playerFaction) - (factionOfPlacement(a) === playerFaction));
  for (const p of westCandidates) {
    for (const k of [0, 2, -2, 4, -4]) {
      const dy = p.y + k;
      if (dy < 0 || dy > 255) continue;
      const cells = [];
      for (let x = p.x - 1; x >= -2; x--) cells.push({ x, y: p.y });
      for (let y = p.y + Math.sign(k); Math.sign(k) !== 0 && (Math.sign(k) > 0 ? y <= dy : y >= dy); y += Math.sign(k)) cells.push({ x: -2, y });
      const dest = { ...p, id: 'placement-west', cityId: 'city-west-guan', x: -3, y: dy };
      delete dest.importRef;
      const probe = tryLink(p, dest, cells);
      if (probe) { anchorW = p; roadW = { ...probe, id: 'west-link' }; destW = dest; break; }
    }
    if (roadW) break;
  }
  assert.ok(roadW, 'no constructible west corridor');
  const northCityId = 'city-north-guan', westCityId = 'city-west-guan';
  map.placements = [...placements, destN, destW];
  const geoN = roadN.geometry, geoW = roadW.geometry;
  assert.ok(geoN.some(p => p.y === -1), 'north corridor must cross y=-1');
  assert.ok(geoW.some(p => p.x === -1), 'west corridor must cross x=-1');
  game.cities[northCityId] = { ...game.cities[anchorN.cityId], cityId: northCityId, runtimeSlot: ordered.length, name: '北關', x: destN.x, y: destN.y };
  game.cities[westCityId] = { ...game.cities[anchorW.cityId], cityId: westCityId, runtimeSlot: ordered.length + 1, name: '西關', x: destW.x, y: destW.y };
  const identity = compileCityIdentity({ cities: game.cities, cityOrder: [...ordered, northCityId, westCityId], placements: map.placements }, bounds);
  const projection = { identity, placements: map.placements };
  map.roads = [...map.roads, roadN, roadW];
  assert.equal(admitChapterCity(game, northCityId, 60, 'ki-1995:siege:7', bounds).admitted, game.chapterOrder.length);
  assert.equal(admitChapterCity(game, westCityId, 45, 'ki-1995:siege:11', bounds).admitted, game.chapterOrder.length);
  syncRoadEndpoints(game, anchorN.cityId, northCityId);
  syncRoadEndpoints(game, anchorW.cityId, westCityId);
  for (const id of game.chapterOrder) {
    const rows = game.chapters[id].state.cities;
    assert.equal(rows[ordered.length].battleMapId, 'ki-1995:siege:7');
    assert.equal(rows[ordered.length + 1].battleMapId, 'ki-1995:siege:11');
  }
  assertMapConnected(game);
  const compiled = compileMapSource(game, { mapExtent: true });
  for (const { x, y } of [...geoN, ...geoW]) assert.equal(compiled.roadMask[(y - bounds.minY) * bounds.width + x - bounds.minX], 1);
  const source = compileTrialSource(game, sha, { mapExtent: true });

  const chapterState = game.chapters[game.chapterOrder[0]].state;
  chapterState.cities[ordered.length].faction = playerFaction;
  chapterState.cities[ordered.length + 1].faction = playerFaction;
  chapterState.cities[game.cities[anchorN.cityId].runtimeSlot].faction = playerFaction;
  chapterState.cities[game.cities[anchorW.cityId].runtimeSlot].faction = playerFaction;

  const transport = await extentSaveTransport(game, source);
  const manifestDigest = (await transport.session.read('manifest')).sha256;
  const chapterId = transport.session.identity.chapterId;
  const pack = await loadPlayerPack({ ...transport, mapExtent: true });
  try {
    const env = createPlayerEnvironment(pack, { playerFaction, mapExtent: true });
    await env.world.terrain.loadTerrain();
    assert.deepEqual(await env.world.roads.loadRoadGraph(), source.roadGraph);
    const input = { raw: env.raw, idx: 0, mode: 'fresh', world: env.world, content: env.content };
    const anchorNRow = chapterState.cities[game.cities[anchorN.cityId].runtimeSlot];
    const anchorWRow = chapterState.cities[game.cities[anchorW.cityId].runtimeSlot];
    await t.test('fresh grid native slots survive JSON save and cold restore', async () => {
      const { scenario } = await prepareScenario({ ...input, mapExtent: true });
      const app = { scenario, scenarioIdx: 0, content: env.content, world: env.world, clock: new Clock({ startYear: 184, startMonth: 1, startDay: 1 }), originalRng: createOriginalBattleRng({ ch: 0, cl: 0, dh: 1 }) };
      const neutral = scenario.cities.find(city => city.faction === null);
      assert.ok(neutral);
      tickStrategicCity(app, neutral.idx);
      assert.equal(neutral._strategicLastFaction, 0x18);
      const saved = JSON.parse(JSON.stringify(snapshotState(app, 0, 'grid')));
      assert.equal(saved.state.nativeLegionSlots.records.length, 128);
      const admitted = admitSavedScenario(saved, { data: { scenarios: Array(game.chapterOrder.length).fill({}) }, content: env.content, world: env.world });
      const restored = await prepareScenario({ ...admitted, mode: 'restore', content: env.content, world: env.world });
      assert.equal(restored.scenario.cities[neutral.idx]._strategicLastFaction, 0x18);
      assert.deepEqual(snapshotState({ ...app, scenario: restored.scenario }, 0, 'grid').state.nativeLegionSlots, saved.state.nativeLegionSlots);
    });

    const prepared = await prepareScenario({ ...input, mapExtent: true });
    const sc = prepared.scenario;
    assert.deepEqual(prepared.metadata.bounds, { minX: -4, minY: -5, width: 388, height: 261 });
    assert.equal(prepared.metadata.roadVersion, 'grid');
    assert.ok(prepared.metadata.roadGraphDigest?.length >= 32);
    const form = (slot, anchor) => {
      const army = {slot,x:anchor.x,y:anchor.y,faction:playerFaction,status:0x80,troops:800,commandState:0,moveDelay:1,movePeriod:3};
      countLegionActivation(sc, army);
      return publishLegacyLegionRecord(sc, army, 'extent save formation');
    };
    const legionN = form(0, anchorN);
    const northCity = sc.cities[ordered.length], westCity = sc.cities[ordered.length + 1];
    assert.equal(northCity.name, '北關');
    assert.equal(westCity.name, '西關');
    assert.deepEqual([northCity.x, northCity.y], [destN.x, destN.y]);
    const start = sc.start;
    const clock = new Clock({ startYear: start.year, startMonth: start.month, startDay: start.day });
    const app = { scenario: sc, scenarioIdx: 0, content: env.content, world: env.world, clock, originalRng: createOriginalBattleRng({ ch: 0, cl: 0, dh: 1 }) };
    const bar = Object.assign(Object.create(GameBar.prototype), { app });
    const { movement } = scenarioGridRoadContext(sc);
    // One tile-step per outer iteration; stops early on arrival (a
    // terminating port commits the city center in the same slot action).
    const stepMarch = (army, visits, stop = null) => {
      const trace = [];
      for (let i = 0; i < visits; i++) {
        if (stop && stop()) break;
        const x = army.x, y = army.y;
        assert.equal(movement.readTile(x, y), 1);
        const tickVisits = army.moveDelay;
        for (let visit = 1; visit <= tickVisits; visit++) {
          app.clock.strategicTickSerial++;
          aiTick(app, { legionBatchStart: 0, runCityDaily: false, settleDaily: false });
          assert.ok(!app._strategicBattleFailure, app._strategicBattleFailure?.message);
          if (visit < tickVisits) assert.deepEqual([army.x, army.y], [x, y]);
        }
        assert.equal(movement.readTile(x, y), 0);
        assert.equal(movement.readTile(army.x, army.y), 1);
        trace.push([army.x, army.y, { ...army.roadPosition }]);
      }
      return trace;
    };
    const data = { scenarios: Array.from({ length: game.chapterOrder.length }) };
    const memory = gameSaveMemoryIDB();
    let writes = 0;
    const store = createGameSaveStore({ gameId: 'extent-save-fixture', databaseName: 'owned-extent-save-memory',
      getIndexedDB: () => memory.indexedDB, createRecordId: () => `extent-save-fixture-write-${writes++}` });
    const storeInput = (slot, snapshot) => ({ gameId: 'extent-save-fixture', releaseId: 'fixture-not-published',
      releaseOrdinal: 0, chapterId, manifestDigest, slot, snapshot });

    // Title-load helper: fresh world objects, detached admission, restore
    // preparation, cold clock/RNG from the saved record. Mirrors the
    // title-screen load path (no live App installation, no hot mutation).
    const titleLoad = async (record) => {
      const coldPack = await loadPlayerPack({ ...transport, mapExtent: true });
      try {
        const coldEnv = createPlayerEnvironment(coldPack, { playerFaction, mapExtent: true });
        const admitted = admitSavedScenario(record.snapshot, { data, content: coldEnv.content, world: coldEnv.world });
        const ready = await prepareScenario({ ...admitted, mode: 'restore', content: coldEnv.content, world: coldEnv.world });
        assert.equal(ready.metadata.roadVersion, 'grid');
        assert.deepEqual(ready.metadata.bounds, { minX: -4, minY: -5, width: 388, height: 261 });
        const date = record.snapshot.state.save_date;
        const coldClock = new Clock({ startYear: date.year, startMonth: date.month, startDay: date.day });
        coldClock.sub = record.snapshot.state.save_sub;
        coldClock.hour = record.snapshot.state.save_hour;
        coldClock.strategicTickSerial = app.clock.strategicTickSerial;
        const cold = { scenario: ready.scenario, scenarioIdx: 0, content: coldEnv.content, world: coldEnv.world,
          clock: coldClock, originalRng: createOriginalBattleRng({ ch: 9, cl: 8, dh: 7 }).restore(record.snapshot.webMeta.originalRng) };
        Object.assign(Object.create(GameBar.prototype), { app: cold });
        return { cold, coldPack };
      } catch (cause) { await coldPack.close(); throw cause; }
    };
    const legionKey = (army) => [army.x, army.y, army.roadPosition, army.targetNode, army.status, army.commandState, army.moveDelay];
    // Tick-until-move arrival driver for cold scenarios: syncTicks runs
    // raw ticks, so the countdown may stop mid-period; each tile step
    // consumes ticks until the army leaves the tile (or arrives via a
    // terminating port).
    const coldMarch = (cold, army, destIdx, cap) => {
      const coldMove = scenarioGridRoadContext(cold.scenario).movement;
      for (let i = 0; i < cap; i++) {
        if (army.roadPosition.kind === 'city' && army.roadPosition.cityIndex === destIdx) break;
        const x = army.x, y = army.y;
        assert.equal(coldMove.readTile(x, y), 1);
        for (let v = 0; v < army.movePeriod + 1; v++) {
          cold.clock.strategicTickSerial++;
          aiTick(cold, { legionBatchStart: 0, runCityDaily: false, settleDaily: false });
          assert.ok(!cold._strategicBattleFailure, cold._strategicBattleFailure?.message);
          if (army.roadPosition.kind === 'city' && army.roadPosition.cityIndex === destIdx) break;
          if (army.x !== x || army.y !== y) break;
        }
        if (army.roadPosition.kind === 'city' && army.roadPosition.cityIndex === destIdx) break;
        if (army.x === x && army.y === y) assert.fail('cold march stalled');
        assert.equal(coldMove.readTile(x, y), 0);
        assert.equal(coldMove.readTile(army.x, army.y), 1);
      }
      assert.deepEqual(army.roadPosition, { kind: 'city', cityIndex: destIdx });
    };
    const syncTicks = (hotArmy, cold, coldArmy, count) => {
      for (let i = 0; i < count; i++) {
        app.clock.strategicTickSerial++;
        aiTick(app, { legionBatchStart: 0, runCityDaily: false, settleDaily: false });
        cold.clock.strategicTickSerial++;
        aiTick(cold, { legionBatchStart: 0, runCityDaily: false, settleDaily: false });
      }
      assert.deepEqual(legionKey(coldArmy), legionKey(hotArmy));
      assert.deepEqual(scenarioGridRoadContext(cold.scenario).movement.snapshot(), movement.snapshot());
      assert.deepEqual(cold.originalRng.snapshot(), app.originalRng.snapshot());
      assert.equal(cold.clock.strategicTickSerial, app.clock.strategicTickSerial);
    };

    // Leg A: north march, snapshot standing on y=-1.
    sc.factions.find(f => f.idx === playerFaction).capital = northCity.idx;
    assert.ok(bar.assignMarchOrder(legionN, northCity, false));
    assert.equal(legionN.targetNode, northCity.idx);
    stepMarch(legionN, geoN.length + 1, () => legionN.y === -1);
    assert.equal(legionN.y, -1);
    assert.equal(legionN.roadPosition.kind, 'road');
    assert.ok(legionN.roadPosition.direction === 1 || legionN.roadPosition.direction === -1);
    const rngAtSaveA = app.originalRng.snapshot().calls;
    const savedA = snapshotState(app, 0, '北關行軍中');
    assert.equal(savedA.webMeta.scenarioAssembly.roadVersion, 'grid');
    assert.deepEqual(savedA.webMeta.scenarioAssembly.bounds, { minX: -4, minY: -5, width: 388, height: 261 });
    assert.deepEqual(savedA.webMeta.movementMemory.bounds, { minX: -4, minY: -5, width: 388, height: 261 });
    await store.put(storeInput(0, savedA));
    const gotA = await store.get(0);
    assert.deepEqual(gotA.record.snapshot, savedA);
    assert.equal(saveJSON(gotA.record.snapshot), saveJSON(savedA));
    const { cold: coldA, coldPack: coldPackA } = await titleLoad(gotA.record);
    try {
      assert.equal(coldA.scenario.factions.find(f => f.idx === playerFaction).capital, northCity.idx);
      const coldN = coldA.scenario.legions.find(l => l.slot === 0);
      assert.deepEqual(legionKey(coldN), legionKey(legionN));
      assert.deepEqual(scenarioGridRoadContext(coldA.scenario).movement.snapshot(), movement.snapshot());
      syncTicks(legionN, coldA, coldN, 6);
      // Cold continues alone to arrival and garrisons; the hot legion is
      // parked below for the west leg (occupancy tiles stay owned).
      coldA.scenario.legions = coldA.scenario.legions.filter(l => l === coldN);
      coldMarch(coldA, coldN, northCity.idx, (geoN.length + 2) * 3);
      const coldMovement = scenarioGridRoadContext(coldA.scenario).movement;
      assert.deepEqual([coldN.x, coldN.y], [northCity.x, northCity.y]);
      assert.equal(coldMovement.readTile(northCity.x, northCity.y), 1);
      performLegionSlotAction(coldA, coldN);
      assert.equal(coldMovement.readTile(northCity.x, northCity.y), 1);
      console.log(JSON.stringify({ leg: 'north', savedAt: [legionN.x, -1], rngAtSave: rngAtSaveA, coldArrived: [coldN.x, coldN.y] }));
    } finally { await coldPackA.close(); }

    // Leg B: west march, snapshot standing on x=-1.
    const legionW = form(1, anchorW);
    assert.ok(bar.assignMarchOrder(legionW, westCity, false));
    assert.equal(legionW.targetNode, westCity.idx);
    stepMarch(legionW, geoW.length + 1, () => legionW.x === -1);
    assert.equal(legionW.x, -1);
    const savedB = snapshotState(app, 1, '西關行軍中');
    assert.deepEqual(snapshotState(app, 1, '西關行軍中').state.nativeLegionSlots, savedB.state.nativeLegionSlots);
    await store.put(storeInput(1, savedB));
    const gotB = await store.get(1);
    assert.deepEqual(gotB.record.snapshot, savedB);
    const { cold: coldB, coldPack: coldPackB } = await titleLoad(gotB.record);
    try {
      const coldW = coldB.scenario.legions.find(l => l.slot === 1);
      assert.deepEqual(legionKey(coldW), legionKey(legionW));
      syncTicks(legionW, coldB, coldW, 6);
      coldB.scenario.legions = coldB.scenario.legions.filter(l => l === coldW);
      coldMarch(coldB, coldW, westCity.idx, (geoW.length + 2) * 3);
      assert.deepEqual([coldW.x, coldW.y], [westCity.x, westCity.y]);
      console.log(JSON.stringify({ leg: 'west', savedAt: [-1, legionW.y], coldArrived: [coldW.x, coldW.y] }));
    } finally { await coldPackB.close(); }

    // Refusals: every mutated copy is refused at title admission and the
    // stored record is preserved byte-for-byte.
    assert.ok((savedA.webMeta.movementMemory.spans?.length ?? 0) > 0, 'mid-march occupancy must be non-empty');
    let negativeControls = 0;
    const refuse = async (slot, mutate, label) => {
      const bad = structuredClone(savedA);
      bad.slot = slot;
      mutate(bad);
      await store.put(storeInput(slot, bad));
      const stored = await store.get(slot), before = structuredClone(stored.record.snapshot);
      // Full title-load path (admission + restore preparation on fresh
      // world objects): identity, bounds, digest and terrain refusals fire
      // at their respective gates; the stored record must survive intact.
      let loaded = null;
      await assert.rejects(async () => { loaded = await titleLoad(stored.record); }, label);
      if (loaded) await loaded.coldPack.close();
      negativeControls++;
      assert.deepEqual((await store.get(slot)).record.snapshot, before);
      assert.deepEqual((await store.get(slot)).token, stored.token);
    };
    await refuse(2, bad => { bad.webMeta.scenarioAssembly.bounds = { minX: -4, minY: -4, width: 388, height: 260 }; }, /bounds/i);
    await refuse(3, bad => { bad.webMeta.scenarioAssembly.roadGraphDigest = '0'.repeat(42); }, /digest/i);
    await refuse(4, bad => { bad.webMeta.scenarioAssembly.terrainIdentity = 'ff'; }, /terrain/i);
    await refuse(5, bad => { delete bad.webMeta.movementMemory; }, /movement/i);
    await refuse(6, bad => { bad.scenario_idx = (bad.scenario_idx + 1) % game.chapterOrder.length; }, /index|identity/i);
    await refuse(7, bad => { bad.webMeta.movementMemory.spans[0].address = -1; }, /movement|address/i);

    // Mid-transition snapshot refusal: nothing is written.
    const recordsBefore = (await store.get(0)).record;
    app.engageTransition = { active: true };
    assert.throws(() => snapshotState(app, 9, '戰事中禁存'), /cannot save during battle/);
    app.engageTransition = null;
    app.battleView = { active: true };
    assert.throws(() => snapshotState(app, 9, '戰事中禁存'), /cannot save during battle/);
    app.battleView = null;
    negativeControls += 2;
    assert.deepEqual((await store.get(0)).record, recordsBefore);

    // Cross-window conflict: a stale token cannot overwrite a newer write.
    const first = await store.get(1);
    const evolved = structuredClone(savedB);
    evolved.label = '西關行軍中 rev2';
    const second = await store.put(storeInput(1, evolved), first.token);
    await assert.rejects(store.put(storeInput(1, savedB), first.token), GameSaveConflictError);
    negativeControls++;
    assert.equal((await store.get(1)).record.snapshot.label, '西關行軍中 rev2');
    assert.deepEqual((await store.get(1)).token, second.token);

    console.log(JSON.stringify({ result: 'E9-OK', negativeControls, rngAtSaveA, worldDigest: savedA.webMeta.scenarioAssembly.roadGraphDigest.slice(0, 16) }));
  } finally { pack.close(); }
  } finally { await rm(tmp, { recursive: true, force: true }); }
});
