// MAP-EXT E7: player + NPC march engine on an extended map (isolated only).
// South (+8) and east (+8) bands on one world; two new cities admitted across
// all chapters with explicit troops caps and shared siege battlefields; roads
// built into both bands; player order, NPC autonomous order (0x440F case 6),
// delegated march, mid-route reorder/return, contact refusal, multi-route
// selection, unreachable and occupancy conflict. Every march steps through
// aiTick slot visits; nothing is ever written directly to a destination.
// No running service, user copy, editor store, profile, SAVE.DAT or publish.
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
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
import { searchStructuredRoadGraph } from '../web/src/game/navigation/structuredroadsearch.js';
import { selectStructuredRoad } from '../web/src/game/navigation/structuredroadselection.js';
import { compileMapSource, assertMapConnected } from '../web/src/content/authoring/mapcompile.js';
import { compileTrialSource } from '../web/src/content/authoring/trialcompile.js';
import { createWorldResources } from '../web/src/game/worldresources.js';
import { loadPlayerPack } from '../web/src/player/playerpack.js';
import { createPlayerEnvironment } from '../web/src/player/playerenvironment.js';
import { GameBar } from '../web/src/ui/gamebar.js';
import { aiTick, performLegionSlotAction } from '../web/src/game/ai.js';
import { publishLegacyLegionRecord } from '../web/src/game/nativelegions.js';
import { countLegionActivation } from '../web/src/game/legioncounts.js';
import { isLegionDelegated } from '../web/src/game/legionmode.js';
import { createOriginalBattleRng } from '../web/src/game/battle/originalrng.js';
import { advanceGridMarch } from '../web/src/game/navigation/worldgridroads.js';
import { createScenarioMovementMemory } from '../web/src/game/navigation/scenariomovementmemory.js';
import { prepareScenario, scenarioGridRoadContext } from '../web/src/game/scenarioassembly.js';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');

async function extentMarchTransport(game, compiled) {
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
  const identity = { gameId, releaseId: 'extent-march', revision, sourceDigest, ordinal: '1.0', chapters: game.chapterOrder, chapterId, manifestDigest: header.sha256 };
  return { session: { identity, state: () => 'active', read: async role => responses.get(role) }, compilerRevision: TRIAL_COMPILER_REVISION, maxTotalBytes: 128 * 1024 * 1024, readStatic: async path => responses.get(path) };
}

test('E7 south and east marches: player, NPC autonomous, delegated, reorder, contact', async () => {
  const { game } = await createPinnedCopyLoader()({ gameId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', ownerId: 'isolated' });
  const before = composeMapLayers(game);
  for (let i = 0; i < 8; i++) game.map = expandMapOneStep(game.map, 'south');
  for (let i = 0; i < 8; i++) game.map = expandMapOneStep(game.map, 'east');
  const map = game.map, bounds = map.bounds;
  assert.deepEqual(bounds, { minX: 0, minY: 0, width: 392, height: 264, tileSize: 16 });
  const expanded = composeMapLayers(game);
  for (const plane of ['terrain', 'geography', 'minimapGeography'])
    for (let y = 0; y < 256; y++)
      for (let x = 0; x < 384; x++)
        assert.equal(expanded[plane][y * 392 + x], before[plane][y * 384 + x]);
  for (let y = 0; y < 264; y++)
    for (let x = 0; x < 392; x++)
      if (x >= 384 || y >= 256) assert.equal(expanded.terrain[y * 392 + x], 95);

  const ordered = Object.values(game.cities).sort((a, b) => a.runtimeSlot - b.runtimeSlot).map(c => c.cityId);
  const placements = map.placements;
  const chapter0 = game.chapters[game.chapterOrder[0]].state;
  // Return legs target the anchor, so the under-test player faction must own
  // southern cities (chapter 0's first city owns none down there). Anchors
  // themselves need no faction; the new cities take the marching factions.
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
  const playerFaction = topFaction(p => p.y > 200) ?? chapter0.cities[0].faction;
  const roadCells = new Set(map.roads.flatMap(r => (r.geometry ?? []).map(p => `${p.x},${p.y}`)));
  const cityCells = new Set(placements.map(p => `${p.x},${p.y}`));
  const stamp = (geometry) => geometry.map((point) => ({ ...point, id: `e7-road-${point.x}-${point.y}`,
    definitionRef: `tile-${point === geometry[0] || point === geometry.at(-1) ? 212 : 200}`, variantRef: 'original' }));
  const cityMap = new Map(map.placements.map(p => [p.cityId, p]));
  const tilesNow = () => composeMapLayers(game).terrain;
  const tiles = (x, y) => tilesNow()[(y - bounds.minY) * bounds.width + x - bounds.minX];
  // Straight-or-L corridor search: head must leave the anchor cardinally,
  // tail must enter the new city cardinally; stamp only the winning cells.
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
  let anchorS = null, roadS = null, destS = null;
  const southCandidates = [...placements].sort((a, b) => b.y - a.y)
    .sort((a, b) => (factionOfPlacement(b) === playerFaction) - (factionOfPlacement(a) === playerFaction));
  for (const p of southCandidates) {
    for (const k of [0, 2, -2, 4, -4]) {
      const dx = p.x + k;
      if (dx < 0 || dx > 383 || Math.abs(k) > 2 && k !== 0) continue;
      const cells = [];
      for (let y = p.y + 1; y <= 259; y++) cells.push({ x: p.x, y });
      for (let x = p.x + Math.sign(k); Math.sign(k) !== 0 && (Math.sign(k) > 0 ? x <= dx : x >= dx); x += Math.sign(k)) cells.push({ x, y: 259 });
      const dest = { ...p, id: 'placement-south', cityId: 'city-south-jiao', x: dx, y: 260 };
      delete dest.importRef;
      const probe = tryLink(p, dest, cells);
      if (probe) { anchorS = p; roadS = { ...probe, id: 'south-link' }; destS = dest; break; }
    }
    if (roadS) break;
  }
  assert.ok(roadS, 'no constructible south corridor');
  // The NPC anchor must be owned by the marching faction: arrival settle
  // checks destination ownership, so unowned frontier cities cannot seed it.
  const factionOf = (cityId) => chapter0.cities[game.cities[cityId]?.runtimeSlot]?.faction;
  let npcBase = null, roadE = null, destE = null, npcFaction = null;
  for (const p of [...placements].sort((a, b) => b.x - a.x)) {
    const faction = factionOf(p.cityId);
    if (faction == null || faction === playerFaction) continue;
    for (const k of [0, 2, -2, 4, -4]) {
      const dy = p.y + k;
      if (dy < 0 || dy > 255) continue;
      const cells = [];
      for (let x = p.x + 1; x <= 388; x++) cells.push({ x, y: p.y });
      for (let y = p.y + Math.sign(k); Math.sign(k) !== 0 && (Math.sign(k) > 0 ? y <= dy : y >= dy); y += Math.sign(k)) cells.push({ x: 388, y });
      const dest = { ...p, id: 'placement-east', cityId: 'city-east-cross', x: 389, y: dy };
      delete dest.importRef;
      const probe = tryLink(p, dest, cells);
      if (probe) { npcBase = p; roadE = { ...probe, id: 'east-link' }; destE = dest; npcFaction = faction; break; }
    }
    if (roadE) break;
  }
  assert.ok(roadE, 'no constructible east corridor');
  const southCityId = 'city-south-jiao', eastCityId = 'city-east-cross';
  map.placements = [...placements, destS, destE];
  const geoS = roadS.geometry, geoE = roadE.geometry;
  game.cities[southCityId] = { ...game.cities[anchorS.cityId], cityId: southCityId, runtimeSlot: ordered.length, name: '交州', x: destS.x, y: destS.y };
  game.cities[eastCityId] = { ...game.cities[npcBase.cityId], cityId: eastCityId, runtimeSlot: ordered.length + 1, name: '東跨', x: destE.x, y: destE.y };
  const identity = compileCityIdentity({ cities: game.cities, cityOrder: [...ordered, southCityId, eastCityId], placements: map.placements }, bounds);
  const projection = { identity, placements: map.placements };
  const graph = projectStructuredRoadGraph([...map.roads, roadS, roadE], projection, bounds);
  assert.equal(searchStructuredRoadGraph(projectStructuredRoadGraph(map.roads, projection, bounds),
    { startCityIndex: ordered.length, stopCityIndices: [identity.indexByCityId[anchorS.cityId]], owner: 0, readCityOwner: () => 0 }).status, 'unreachable');
  map.roads = [...map.roads, roadS, roadE];
  assert.equal(admitChapterCity(game, southCityId, 60, 'ki-1995:siege:7', bounds).admitted, game.chapterOrder.length);
  assert.equal(admitChapterCity(game, eastCityId, 45, 'ki-1995:siege:11', bounds).admitted, game.chapterOrder.length);
  syncRoadEndpoints(game, anchorS.cityId, southCityId);
  syncRoadEndpoints(game, npcBase.cityId, eastCityId);
  for (const id of game.chapterOrder) {
    const rows = game.chapters[id].state.cities;
    assert.equal(rows[ordered.length].battleMapId, 'ki-1995:siege:7');
    assert.equal(rows[ordered.length + 1].battleMapId, 'ki-1995:siege:11');
    assert.ok(rows[ordered.length].neighbourCityIds.includes(anchorS.cityId));
    assert.ok(rows[ordered.length + 1].neighbourCityIds.includes(npcBase.cityId));
  }
  assertMapConnected(game);
  const compiled = compileMapSource(game, { mapExtent: true });
  for (const { x, y } of [...geoS, ...geoE]) assert.equal(compiled.roadMask[(y - bounds.minY) * bounds.width + x], 1);
  const source = compileTrialSource(game, sha, { mapExtent: true });
  assert.deepEqual(source.roadGraph, graph);

  // Ownership before hashing: south city to the player, east city to the NPC
  // faction. The chosen south anchor is an unowned frontier city; chapter 0's
  // only owned southern column is blocked by legacy roads, so the anchor row
  // joins the under-test player faction (isolated copy, new-city equivalent).
  const chapterState = game.chapters[game.chapterOrder[0]].state;
  chapterState.cities[ordered.length].faction = playerFaction;
  chapterState.cities[ordered.length + 1].faction = npcFaction;
  chapterState.cities[game.cities[anchorS.cityId].runtimeSlot].faction = playerFaction;

  const transport = await extentMarchTransport(game, source);
  const pack = await loadPlayerPack({ ...transport, mapExtent: true });
  try {
    const env = createPlayerEnvironment(pack, { playerFaction, mapExtent: true });
    await env.world.terrain.loadTerrain();
    const loadedGraph = await env.world.roads.loadRoadGraph();
    assert.deepEqual(loadedGraph, source.roadGraph);
    const input = { raw: env.raw, idx: 0, mode: 'fresh', world: env.world, content: env.content };
    const anchorRow = chapterState.cities[game.cities[anchorS.cityId].runtimeSlot];
    const npcBaseRow = chapterState.cities[game.cities[npcBase.cityId].runtimeSlot];
    // 開局後才編成：不能靠 prepareScenario 為預置軍團裝配路位。
    const prepared = await prepareScenario({ ...input, mapExtent: true });
    const sc = prepared.scenario;
    const formed = [
      { slot: 0, x: anchorS.x, y: anchorS.y, faction: playerFaction, status: 0x80, troops: 800, commandState: 0, moveDelay: 1, movePeriod: 3 },
      { slot: 1, x: npcBase.x, y: npcBase.y, faction: npcFaction, status: 0x80, troops: 800, commandState: 2, moveDelay: 1, movePeriod: 3,
        target: npcBaseRow, targetCity: npcBaseRow.idx, targetNode: npcBaseRow.idx },
    ];
    for (const army of formed) {
      countLegionActivation(sc, army);
      const record = publishLegacyLegionRecord(sc, army, 'test grid formation');
      assert.equal(record.roadPosition.kind, 'city');
      assert.equal(scenarioGridRoadContext(sc).movement.readTile(army.x, army.y), 1);
    }
    const player = sc.legions.find(l => l.slot === 0), npc = sc.legions.find(l => l.slot === 1);
    const southCity = sc.cities[ordered.length], eastCity = sc.cities[ordered.length + 1];
    const anchorCity = sc.cities[anchorRow.idx], npcCity = sc.cities[npcBaseRow.idx];
    assert.equal(southCity.name, '交州');
    sc.factions.find(f => f.idx === npcFaction).strategic_city_primary = eastCity.idx;
    const app = { scenario: sc, clock: { strategicTickSerial: 0 }, originalRng: createOriginalBattleRng({ ch: 0, cl: 0, dh: 1 }) };
    const bar = Object.assign(Object.create(GameBar.prototype), { app });
    const { movement } = scenarioGridRoadContext(sc);
    const rngBefore = app.originalRng.snapshot().calls;
    // One tile-step per outer iteration: first step single tick (fresh order
    // moveDelay 1), later steps full movePeriod ticks. Stops early on arrival
    // (a terminating port commits the city center in the same slot action,
    // so the final road point may never become a position). No teleport:
    // every tick runs the real slot pump, positions are asserted continuous.
    const stepMarch = (army, visits, targetIdx = null) => {
      const trace = [];
      for (let i = 0; i < visits; i++) {
        if (targetIdx != null && army.roadPosition.kind === 'city' && army.roadPosition.cityIndex === targetIdx) break;
        const x = army.x, y = army.y;
        assert.equal(movement.readTile(x, y), 1);
        const tickVisits = army.moveDelay;
        assert.equal(tickVisits, i === 0 ? 1 : army.movePeriod);
        for (let visit = 1; visit <= tickVisits; visit++) {
          // App reads the committed cursor: seven other 16-slot batches
          // must return before this legion can consume another delay unit.
          while (sc._legionBatchCursor) {
            const start = sc._legionBatchCursor;
            app.clock.strategicTickSerial++;
            aiTick(app, { legionBatchStart: start, runCityDaily: false, settleDaily: false });
            assert.equal(sc._legionBatchCursor, (start + 16) % 128);
          }
          app.clock.strategicTickSerial++;
          aiTick(app, { legionBatchStart: 0, runCityDaily: false, settleDaily: false });
          assert.equal(sc._legionBatchCursor, 16);
          assert.ok(!app._strategicBattleFailure, app._strategicBattleFailure?.message);
          if (visit < tickVisits) assert.deepEqual([army.x, army.y], [x, y]);
        }
        assert.equal(movement.readTile(x, y), 0);
        assert.equal(movement.readTile(army.x, army.y), 1);
        trace.push([army.x, army.y, army.moveDelay, { ...army.roadPosition }, movement.snapshot().spans]);
      }
      return trace;
    };
    const assertContinuousTrace = (trace, from, to) => {
      assert.ok(trace.length > 0);
      assert.deepEqual([trace.at(-1)[0], trace.at(-1)[1]], to);
      let prev = from;
      for (const [x, y] of trace) {
        const jump = Math.max(Math.abs(x - prev[0]), Math.abs(y - prev[1]));
        // A terminating port commits the city center in the same slot action,
        // so the final step may cover two cells; all other steps are single.
        assert.ok(jump === 1 || (x === to[0] && y === to[1] && jump === 2));
        prev = [x, y];
      }
    };

    // The shared slot pump would interleave both armies, so each march runs
    // isolated (parked armies keep their occupancy tiles, just unpumped).
    const both = sc.legions.slice();
    const parked = new Map();
    const isolate = (army) => {
      for (const record of both) {
        if (record !== army && !parked.has(record)) { parked.set(record, record.status); record.status = 0; }
        if (record === army && parked.has(record)) { record.status = parked.get(record); parked.delete(record); }
      }
      sc.legions = [army];
    };

    // 2 first (no ticks yet): NPC autonomous order. The 0x440F case-6 machine
    // issues the east target itself on arrival-settle, unconsumed until now.
    assert.equal(npc.targetCity, npcCity.idx);
    performLegionSlotAction(app, npc);
    assert.equal(npc.targetCity, eastCity.idx);
    assert.equal(npc.commandState, 0);
    assert.equal(sc.factions.find(f => f.idx === npcFaction).strategic_city_primary, null);
    isolate(npc);
    const eastTrace = stepMarch(npc, geoE.length + 1, eastCity.idx);
    assertContinuousTrace(eastTrace, [npcBase.x, npcBase.y], [eastCity.x, eastCity.y]);
    assert.ok(eastTrace.length <= geoE.length + 1);
    assert.deepEqual(npc.roadPosition, { kind: 'city', cityIndex: eastCity.idx });
    console.log(JSON.stringify({ order: 'npc-east-autonomous', steps: eastTrace.length, arrived: [npc.x, npc.y], finalCommandState: npc.commandState, rng: app.originalRng.snapshot().calls }));
    sc.legions = both.filter(l => l !== npc);

    // 1. Player order south into the new band, full trace, arrival, garrison.
    isolate(player);
    assert.ok(bar.assignMarchOrder(player, southCity, false));
    assert.equal(player.targetNode, southCity.idx);
    const southFrom = [player.x, player.y];
    const southTrace = stepMarch(player, geoS.length + 1, southCity.idx);
    assertContinuousTrace(southTrace, southFrom, [southCity.x, southCity.y]);
    assert.ok(southTrace.length <= geoS.length + 1);
    assert.deepEqual(player.roadPosition, { kind: 'city', cityIndex: southCity.idx });
    performLegionSlotAction(app, player);
    assert.equal(movement.readTile(southCity.x, southCity.y), 1);
    console.log(JSON.stringify({ order: 'player-south', steps: southTrace.length, arrived: [player.x, player.y], rng: app.originalRng.snapshot().calls }));

    // 2. NPC autonomous order: the 0x440F case-6 machine issues the east target itself.

    // 3. Delegated player march keeps its flag and target to the end.
    assert.ok(bar.assignMarchOrder(player, anchorCity, true));
    assert.ok(isLegionDelegated(player));
    const targetBefore = player.targetCity;
    const backTrace = stepMarch(player, geoS.length + 1, anchorCity.idx);
    assertContinuousTrace(backTrace, [southCity.x, southCity.y], [anchorCity.x, anchorCity.y]);
    assert.equal(player.targetCity, targetBefore);
    assert.ok(isLegionDelegated(player));
    assert.deepEqual([player.x, player.y], [anchorCity.x, anchorCity.y]);
    console.log(JSON.stringify({ order: 'delegated-south-return', steps: backTrace.length, delegated: true, rng: app.originalRng.snapshot().calls }));

    // 4. Mid-route reorder to origin (return) then re-order south; both honored.
    assert.ok(bar.assignMarchOrder(player, southCity, false));
    stepMarch(player, 2);
    const mid = [player.x, player.y];
    assert.ok(bar.assignMarchOrder(player, anchorCity, false));
    const retTrace = stepMarch(player, geoS.length + 1, anchorCity.idx);
    assertContinuousTrace(retTrace, mid, [anchorCity.x, anchorCity.y]);
    assert.deepEqual([player.x, player.y], [anchorCity.x, anchorCity.y]);
    assert.ok(bar.assignMarchOrder(player, southCity, false));
    const reTrace = stepMarch(player, geoS.length + 1, southCity.idx);
    assertContinuousTrace(reTrace, [anchorCity.x, anchorCity.y], [southCity.x, southCity.y]);
    assert.deepEqual([player.x, player.y], [southCity.x, southCity.y]);
    console.log(JSON.stringify({ order: 'reorder-return-reorder', mid, final: [player.x, player.y], rng: app.originalRng.snapshot().calls }));

    // 5. Destination refusal (E8 precursor): player ordered into the NPC east
    // city. The friendly-destination gate fires before any march step; the
    // order stands, the army never moves, occupancy and clock are untouched.
    assert.ok(bar.assignMarchOrder(player, eastCity, false));
    const stuck = [player.x, player.y], serialBefore = app.clock.strategicTickSerial;
    assert.throws(() => performLegionSlotAction(app, player), /friendly destination of the marching faction/);
    assert.deepEqual([player.x, player.y], stuck);
    assert.equal(movement.readTile(stuck[0], stuck[1]), 1);
    assert.equal(app.clock.strategicTickSerial, serialBefore);
    console.log(JSON.stringify({ order: 'destination-refused', stuck, rng: app.originalRng.snapshot().calls }));

    // March actions consume no battle RNG themselves; the per-tick strategic
    // weather does (origin-identical path, fixed seed here). The locked total
    // pins the whole schedule deterministic: NPC 50 steps + south 11 +
    // delegated 11 + reorder/return 11 + re-order 11, all at movePeriod 3.
    assert.equal(app.originalRng.snapshot().calls - rngBefore, 3936);
    const owner = sc.factions.find(f => f.idx === playerFaction);
    owner.capital = anchorCity.idx;
    assert.ok(bar._orderDisbandAtCapital(player, anchorCity));
    performLegionSlotAction(app, player);
    assert.equal(player.roadPosition.kind, 'road');
    player.morale = 30;
    player.moveDelay = 2;
    aiTick(app, { legionBatchStart: 0, runCityDaily: false, settleDaily: true });
    assert.equal(player.morale, 30);
    for (let i = 0; i <= geoS.length && player.roadPosition.kind !== 'city'; i++) performLegionSlotAction(app, player);
    assert.equal(player.roadPosition.cityIndex, owner.capital);
    const before = owner.n_legions;
    player.units = Array.from({ length: 6 }, () => ({ type: 1, troops: 100 }));
    const reserves = owner.reserve_cav;
    performLegionSlotAction(app, player);
    assert.equal(player.status, 0);
    assert.equal(owner.n_legions, before - 1);
    assert.equal(owner.reserve_cav, Math.min(65500, reserves + 60));
    assert.equal(movement.readTile(player.x, player.y), 0);
  } finally { pack.close(); }
});

test('E7 selection and march units: cheapest of two roads, unreachable, occupancy', async () => {
  const bare = [{ x: 0, y: 0, ports: [null, null, null, null] }, { x: 2, y: 0, ports: [null, null, null, null] }];
  const mkPorts = (end) => [{ roadIndex: 0, end }, { roadIndex: 1, end }, null, null];
  const nodes = [{ x: 0, y: 0, ports: mkPorts('from') }, { x: 2, y: 0, ports: mkPorts('to') }];
  const edge = (roadId, cost, points) => ({ roadId, fromCityIndex: 0, toCityIndex: 1, cost, points });
  const line = [{ x: 0, y: 0, flags: 2 }, { x: 1, y: 0, flags: 0 }, { x: 2, y: 0, flags: 3 }];
  const dear = { nodes, edges: [edge('cheap', 5, line), edge('pricey', 9, line)] };
  const dearer = { nodes, edges: [edge('cheap', 15, line), edge('pricey', 9, line)] };
  const readOwner = () => 7;
  assert.equal(selectStructuredRoad(dear, { position: { kind: 'city', cityIndex: 0 }, targetCityIndex: 1, owner: 7, command: 0, readCityOwner: readOwner }).position.roadIndex, 0);
  assert.equal(selectStructuredRoad(dearer, { position: { kind: 'city', cityIndex: 0 }, targetCityIndex: 1, owner: 7, command: 0, readCityOwner: readOwner }).position.roadIndex, 1);
  assert.equal(selectStructuredRoad({ nodes: bare, edges: [] }, { position: { kind: 'city', cityIndex: 0 }, targetCityIndex: 1, owner: 7, command: 0, readCityOwner: readOwner }).status, 'unreachable');

  // March-level unreachable: order stands, army never moves, occupancy unchanged.
  // v1 origin planes are byte-addressed; the v2 tile API needs a supported
  // extent, so the unit plane is a minimal north+1 world (tile API only).
  const bounds = { minX: 0, minY: -1, width: 384, height: 257 };
  const ref = { identity: {}, memory: {} };
  const movement = createScenarioMovementMemory({ version: 2, bounds, zeroFilled: true, spans: [] }, ref, false, bounds);
  const sc = { player_faction: 7, cities: [{ idx: 0, x: 0, y: 0, faction: 7 }, { idx: 1, x: 2, y: 0, faction: 7 }] };
  const army = { slot: 0, x: 0, y: 0, faction: 7, status: 0x82, commandState: 0, moveDelay: 1, targetNode: 1, roadPosition: { kind: 'city', cityIndex: 0 } };
  movement.writeTile(0, 0, 1);
  assert.equal(advanceGridMarch(sc, army, { graph: { nodes: bare, edges: [] }, movement }), 'unreachable');
  assert.deepEqual([army.x, army.y], [0, 0]);
  assert.equal(movement.readTile(0, 0), 1);
  assert.equal(movement.readTile(2, 0), 0);

  // Occupancy conflict: blocked point and occupied destination both refuse.
  const sc2 = { player_faction: 7, cities: [{ idx: 0, x: 0, y: 0, faction: 7 }, { idx: 1, x: 2, y: 0, faction: 7 }] };
  const ports1 = (end) => [{ roadIndex: 0, end }, null, null, null];
  const nodes1 = [{ x: 0, y: 0, ports: ports1('from') }, { x: 2, y: 0, ports: ports1('to') }];
  const g2 = { nodes: nodes1, edges: [edge('only', 5, line)] };
  const a2 = { slot: 0, x: 0, y: 0, faction: 7, status: 0x82, commandState: 0, moveDelay: 1, targetNode: 1, roadPosition: { kind: 'city', cityIndex: 0 } };
  movement.writeTile(1, 0, 1);
  assert.throws(() => advanceGridMarch(sc2, a2, { graph: g2, movement }), /Grid field contact unresolved/);
  assert.deepEqual([a2.x, a2.y], [0, 0]);
  movement.writeTile(1, 0, 0);
  movement.writeTile(2, 0, 0);
  a2.status = 0x80;
  // Marching from an unoccupied tile refuses instead of duplicating presence.
  assert.throws(() => advanceGridMarch(sc2, { ...a2, x: 1, y: 0, roadPosition: { kind: 'road', roadIndex: 0, pointIndex: 1, direction: 1 } }, { graph: g2, movement }), /Grid occupancy conflict/);

  // Mid-route contact: a hostile transit city refuses entry even though the
  // final destination is friendly (E8 resolves the battle; the march engine
  // only records the refusal without moving or duplicating presence).
  const chainNodes = [
    { x: 0, y: 0, ports: [{ roadIndex: 0, end: 'from' }, null, null, null] },
    { x: 2, y: 0, ports: [{ roadIndex: 0, end: 'to' }, { roadIndex: 1, end: 'from' }, null, null] },
    { x: 4, y: 0, ports: [{ roadIndex: 1, end: 'to' }, null, null, null] },
  ];
  const chain = { nodes: chainNodes, edges: [edge('west', 5, line), { ...edge('east', 5, line), fromCityIndex: 1, toCityIndex: 2, points: [{ x: 2, y: 0, flags: 2 }, { x: 3, y: 0, flags: 0 }, { x: 4, y: 0, flags: 3 }] }] };
  const sc3 = { player_faction: 7, cities: [{ idx: 0, x: 0, y: 0, faction: 7 }, { idx: 1, x: 2, y: 0, faction: 9 }, { idx: 2, x: 4, y: 0, faction: 7 }] };
  const a3 = { slot: 0, x: 0, y: 0, faction: 7, status: 0x82, commandState: 0, moveDelay: 1, targetNode: 2, roadPosition: { kind: 'city', cityIndex: 0 } };
  assert.throws(() => advanceGridMarch(sc3, a3, { graph: chain, movement }), /Grid march contact unresolved/);
  assert.deepEqual([a3.x, a3.y], [0, 0]);
  assert.equal(movement.readTile(0, 0), 1);

  sc2.cities[1].faction = null;
  g2.edges[0].points = [{ x: 1, y: 0, flags: 0x44 }, { x: 2, y: 0, flags: 4 }];
  assert.equal(advanceGridMarch(sc2, a2, { graph: g2, movement }), 'moved');
  assert.deepEqual([a2.x, a2.y], [1, 0]);
  assert.throws(() => advanceGridMarch(sc2, a2, { graph: g2, movement }), e => e.endpoint === 1 && e.message === 'Grid march contact unresolved');
  assert.equal(movement.readTile(1, 0), 1);
  assert.equal(movement.readTile(2, 0), 0);
});
