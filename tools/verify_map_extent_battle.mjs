// MAP-EXT E8: extended-band contact -> engagement -> battle -> aftermath (isolated only).
// South (+8) band on one world: anchor (player) -> S3 hostile new city (NPC
// capital, single new-city transit) -> JZ player new city. Covers: non-war
// transit refusal, delegated siege gate + return, quick-calc siege capture +
// capital relocation, field loss (attacker fate) + field win (delegated gate),
// corpse-tile release, friendly-occupant refusal, arrival continuity,
// slot pay once-ness, city daily on new rows, monthly proposal + 304E gate,
// origin-domain RNG parity for both battle kinds, extinction on the stub.
// No running service, user copy, editor store, profile, SAVE.DAT or publish.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
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
import { aiTick, performLegionSlotAction, resolveFieldBattle, resolveBattle, hasPendingStrategicEvent, cityDaily, monthlyDiplomacyAI } from '../web/src/game/ai.js';
import { prepareScenario, scenarioGridRoadContext, scenarioNativeRoadContext } from '../web/src/game/scenarioassembly.js';
import { bindLegionSlotCounter, finishLegionSlotTail } from '../web/src/game/legionphase.js';
import { isLegionDelegated } from '../web/src/game/legionmode.js';
import { declareWar } from '../web/src/game/diplomacy.js';
import { legionDailyMaintenanceCost } from '../web/src/game/economy.js';
import { createOriginalBattleRng } from '../web/src/game/battle/originalrng.js';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');

async function extentBattleTransport(game, compiled) {
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
  responses.set(`chapter:${chapterId}`, reply(json(game.chapters[game.chapterOrder[0]].state), 'application/json'));
  const identity = { gameId, releaseId: 'extent-battle', revision, sourceDigest, ordinal: '1.0', chapters: game.chapterOrder, chapterId, manifestDigest: header.sha256 };
  return { session: { identity, state: () => 'active', read: async role => responses.get(role) }, compilerRevision: TRIAL_COMPILER_REVISION, maxTotalBytes: 128 * 1024 * 1024, readStatic: async path => responses.get(path) };
}

test('E8 extended-band battle: contact, siege, field, aftermath, scheduling', async () => {
  const { game } = await createPinnedCopyLoader()({ gameId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', ownerId: 'isolated' });
  for (let i = 0; i < 8; i++) game.map = expandMapOneStep(game.map, 'south');
  const map = game.map, bounds = map.bounds;
  assert.deepEqual(bounds, { minX: 0, minY: 0, width: 384, height: 264, tileSize: 16 });
  const ordered = Object.values(game.cities).sort((a, b) => a.runtimeSlot - b.runtimeSlot).map(c => c.cityId);
  const placements = map.placements;
  const chapter0 = game.chapters[game.chapterOrder[0]].state;
  const factionOfPlacement = (p) => chapter0.cities[game.cities[p.cityId]?.runtimeSlot]?.faction;
  const topFaction = (pred) => {
    const counts = new Map();
    for (const p of placements) {
      if (!pred(p)) continue;
      const faction = factionOfPlacement(p);
      if (faction == null) continue;
      counts.set(faction, (counts.get(faction) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  };
  const playerFaction = topFaction(p => p.y > 200) ?? chapter0.cities[0].faction;
  const npcFaction = topFaction(p => p.y <= 200 && factionOfPlacement(p) !== playerFaction);
  assert.ok(npcFaction != null && npcFaction !== playerFaction);
  const roadCells = new Set(map.roads.flatMap(r => (r.geometry ?? []).map(p => `${p.x},${p.y}`)));
  const cityCells = new Set(placements.map(p => `${p.x},${p.y}`));
  const stamp = (geometry) => geometry.map((point) => ({ ...point, id: `e8-road-${point.x}-${point.y}`,
    definitionRef: `tile-${point === geometry[0] || point === geometry.at(-1) ? 212 : 200}`, variantRef: 'original' }));
  const cityMap = new Map(map.placements.map(p => [p.cityId, p]));
  const tilesNow = () => composeMapLayers(game).terrain;
  const tiles = (x, y) => tilesNow()[(y - bounds.minY) * bounds.width + x - bounds.minX];
  const tryLink = (anchor, dest, cells, tag) => {
    if (cells.length < 2) return null;
    if (cells.some(p => roadCells.has(`${p.x},${p.y}`))) return null;
    if (cells.slice(1, -1).some(p => cityCells.has(`${p.x},${p.y}`))) return null;
    const stamps = stamp(cells);
    map.decorations = [...map.decorations, ...stamps];
    let probe;
    try {
      probe = buildRoad({ fromCityId: anchor.cityId, toCityId: dest.cityId, travelKind: 'land',
        geometry: cells, cities: new Map([...cityMap, [anchor.cityId, anchor], [dest.cityId, dest]]), roads: map.roads, tiles }, bounds);
    } catch {
      map.decorations = map.decorations.slice(0, map.decorations.length - stamps.length);
      return null;
    }
    for (const p of cells) roadCells.add(`${p.x},${p.y}`);
    return { ...probe, id: tag };
  };
  // Anchor (player south column) -> S3 hostile new city -> JZ player new city.
  let anchor = null, seg1 = null, s3pos = null;
  const southCandidates = [...placements].sort((a, b) => b.y - a.y)
    .sort((a, b) => (factionOfPlacement(b) === playerFaction) - (factionOfPlacement(a) === playerFaction));
  for (const p of southCandidates) {
    for (const k of [0, 2, -2, 4, -4]) {
      const dx = p.x + k;
      if (dx < 0 || dx > 383 || Math.abs(k) > 2 && k !== 0) continue;
      const cells = [];
      for (let y = p.y + 1; y <= 259; y++) cells.push({ x: p.x, y });
      for (let x = p.x + Math.sign(k); Math.sign(k) !== 0 && (Math.sign(k) > 0 ? x <= dx : x >= dx); x += Math.sign(k)) cells.push({ x, y: 259 });
      const dest = { ...p, id: 'placement-e8-s3', cityId: 'city-south-s3', x: dx, y: 260 };
      delete dest.importRef;
      const probe = tryLink(p, dest, cells, 'e8-seg1');
      if (probe) { anchor = p; seg1 = probe; s3pos = dest; break; }
    }
    if (seg1) break;
  }
  assert.ok(seg1, 'no constructible south corridor seg1');
  const jzpos = { ...s3pos, id: 'placement-e8-jz', cityId: 'city-south-jz', x: s3pos.x, y: 263 };
  delete jzpos.importRef;
  const seg2cells = [{ x: s3pos.x, y: 261 }, { x: s3pos.x, y: 262 }];
  const seg2 = tryLink({ ...s3pos, cityId: 'city-south-s3' }, jzpos, seg2cells, 'e8-seg2');
  assert.ok(seg2, 'no constructible south corridor seg2');
  map.placements = [...placements, s3pos, jzpos];
  const s3CityId = 'city-south-s3', jzCityId = 'city-south-jz';
  game.cities[s3CityId] = { ...game.cities[anchor.cityId], cityId: s3CityId, runtimeSlot: ordered.length, name: '南關', x: s3pos.x, y: s3pos.y };
  game.cities[jzCityId] = { ...game.cities[anchor.cityId], cityId: jzCityId, runtimeSlot: ordered.length + 1, name: '南交', x: jzpos.x, y: jzpos.y };
  const identity = compileCityIdentity({ cities: game.cities, cityOrder: [...ordered, s3CityId, jzCityId], placements: map.placements }, bounds);
  const projection = { identity, placements: map.placements };
  map.roads = [...map.roads, seg1, seg2];
  const graph = projectStructuredRoadGraph(map.roads, projection, bounds);
  assert.equal(admitChapterCity(game, s3CityId, 60, 'ki-1995:siege:7', bounds).admitted, game.chapterOrder.length);
  assert.equal(admitChapterCity(game, jzCityId, 45, 'ki-1995:siege:11', bounds).admitted, game.chapterOrder.length);
  syncRoadEndpoints(game, anchor.cityId, s3CityId);
  syncRoadEndpoints(game, s3CityId, jzCityId);
  for (const id of game.chapterOrder) {
    const rows = game.chapters[id].state.cities;
    assert.equal(rows[ordered.length].battleMapId, 'ki-1995:siege:7');
    assert.equal(rows[ordered.length + 1].battleMapId, 'ki-1995:siege:11');
    assert.ok(rows[ordered.length].neighbourCityIds.includes(anchor.cityId));
    assert.ok(rows[ordered.length + 1].neighbourCityIds.includes(s3CityId));
  }
  assertMapConnected(game);
  const compiled = compileMapSource(game, { mapExtent: true });
  for (const p of [...seg1.geometry, ...seg2.geometry]) assert.equal(compiled.roadMask[(p.y - bounds.minY) * bounds.width + p.x], 1);
  const source = compileTrialSource(game, sha, { mapExtent: true });

  const chapterState = game.chapters[game.chapterOrder[0]].state;
  chapterState.cities[game.cities[anchor.cityId].runtimeSlot].faction = playerFaction;
  chapterState.cities[ordered.length].faction = npcFaction;
  chapterState.cities[ordered.length + 1].faction = playerFaction;

  const transport = await extentBattleTransport(game, source);
  const pack = await loadPlayerPack({ ...transport, mapExtent: true });
  try {
    const env = createPlayerEnvironment(pack, { playerFaction, mapExtent: true });
    await env.world.terrain.loadTerrain();
    const loadedGraph = await env.world.roads.loadRoadGraph();
    assert.deepEqual(loadedGraph, source.roadGraph);
    const input = { raw: env.raw, idx: 0, mode: 'fresh', world: env.world, content: env.content };
    const anchorRow = chapterState.cities[game.cities[anchor.cityId].runtimeSlot];
    input.raw.legions.push(
      { slot: 0, x: anchor.x, y: anchor.y, faction: playerFaction, status: 0x80, troops: 200, commandState: 0, moveDelay: 1, movePeriod: 3 },
      { slot: 1, x: anchor.x, y: anchor.y, faction: playerFaction, status: 0x80, troops: 800, commandState: 0, moveDelay: 1, movePeriod: 3 },
      { slot: 2, x: anchor.x, y: anchor.y, faction: playerFaction, status: 0x80, troops: 800, commandState: 0, moveDelay: 1, movePeriod: 3 },
    );
    const prepared = await prepareScenario({ ...input, mapExtent: true });
    const sc = prepared.scenario;
    assert.equal(scenarioNativeRoadContext(sc), null);
    const grid = scenarioGridRoadContext(sc);
    assert.ok(grid?.graph && grid?.movement);
    const { movement } = grid;
    const P = sc.legions.find(l => l.slot === 0), D2 = sc.legions.find(l => l.slot === 1), P2 = sc.legions.find(l => l.slot === 2);
    for (const l of sc.legions) bindLegionSlotCounter(sc, l);
    // Real commanders: a general-less attacker always scores 8 and loses to
    // any garrison profile. D2/P2 take strong leaders, P a weak one (it must
    // lose to F1), F1/F2 mid leaders (beat P, lose to D2).
    const scored = sc.generals
      .map((g, i) => ({ i, g }))
      .filter(({ g }) => g && g.ability && !g.is_monarch && g.active !== false)
      .sort((a, b) => ((b.g.ability?.force ?? 0) + (b.g.ability?.lead ?? 0)) - ((a.g.ability?.force ?? 0) + (a.g.ability?.lead ?? 0)));
    assert.ok(scored.length >= 5);
    D2.generalIdx = scored[0].i; P2.generalIdx = scored[1].i; P.generalIdx = scored.at(-1).i;
    const F1gen = scored[Math.floor(scored.length / 2)].i, F2gen = scored[Math.floor(scored.length / 2) - 1].i;
    const S3 = sc.cities[ordered.length], JZ = sc.cities[ordered.length + 1], A0 = sc.cities[anchorRow.idx];
    assert.equal(S3.name, '南關');
    assert.equal(JZ.name, '南交');
    // S3 is the NPC capital: capture relocates it without extinction (the
    // last-city extinction path runs on the origin stub below).
    sc.factions.find(f => f.idx === npcFaction).capital = S3.idx;
    const edge2 = loadedGraph.edges.find(e => e.roadId === 'e8-seg2');
    const edge1 = loadedGraph.edges.find(e => e.roadId === 'e8-seg1');
    assert.ok(edge2 && edge1 && edge2.points.length >= 2 && edge1.points.length >= 4);
    // Graph edges hold corridor cells (centers commit via terminating ports).
    // F2 waits on edge2 for D2; F1 is injected later on edge1 for P's return.
    const f2tile = edge2.points[0];
    const injectRoadArmy = (slot, troops, tile, edge, generalIdx) => {
      const army = { slot, x: tile.x, y: tile.y, faction: npcFaction, status: 0x80, troops, morale: 150, generalIdx, commandState: 0, moveDelay: 3, movePeriod: 3,
        roadPosition: { kind: 'road', roadIndex: loadedGraph.edges.indexOf(edge), pointIndex: edge.points.indexOf(tile), direction: 1 } };
      sc.legions.push(army);
      bindLegionSlotCounter(sc, army);
      movement.writeTile(tile.x, tile.y, movement.readTile(tile.x, tile.y) + 1);
      return army;
    };
    const F2 = injectRoadArmy(4, 500, f2tile, edge2, F2gen);
    P.morale = 150; D2.morale = 150; P2.morale = 150;
    assert.equal(movement.readTile(anchor.x, anchor.y), 3);
    const app = { scenario: sc, clock: { strategicTickSerial: 0 }, originalRng: createOriginalBattleRng({ ch: 0, cl: 0, dh: 1 }) };
    const bar = Object.assign(Object.create(GameBar.prototype), { app });
    const both = sc.legions.slice();
    const isolate = (army) => { sc.legions = both.filter(l => l === army); };
    // Production shape: each slot visit runs action + 264A tail. A fresh
    // contact waits 12 -> 1 (native 2831/2880 countdown); the 12th visit
    // resolves. Direct calls bypass the batch, so the test applies the
    // tail explicitly. The loop consumes no RNG (verified by parity below).
    const driveContactBattle = (army, max = 15) => {
      const seen = [];
      for (let i = 0; i < max; i++) {
        const out = performLegionSlotAction(app, army);
        seen.push(out);
        if (out !== 'waiting') return { out, waits: seen.length - 1 };
        finishLegionSlotTail(army);
      }
      throw new Error('contact battle never resolved');
    };
    // Lean marcher: isolated pump, continuity only (co-located starts and
    // corpse tiles make strict count asserts wrong here).
    const marchTo = (army, positions, opts = {}) => {
      const trace = [];
      for (let i = 0; i < positions; i++) {
        if (opts.targetIdx != null && army.roadPosition.kind === 'city' && army.roadPosition.cityIndex === opts.targetIdx) break;
        if (opts.stopAt && army.x === opts.stopAt[0] && army.y === opts.stopAt[1]) break;
        const x = army.x, y = army.y;
        const tickVisits = army.moveDelay;
        for (let visit = 1; visit <= tickVisits; visit++) {
          app.clock.strategicTickSerial++;
          aiTick(app, { legionBatchStart: 0, runCityDaily: false, settleDaily: false });
          if (app._strategicBattleFailure) throw app._strategicBattleFailure;
          assert.ok(!app._strategicBattleFailure, app._strategicBattleFailure?.message);
          if (visit < tickVisits) assert.deepEqual([army.x, army.y], [x, y]);
        }
        const jump = Math.max(Math.abs(army.x - x), Math.abs(army.y - y));
        assert.ok(jump <= 2, `march jump ${jump}`);
        trace.push([army.x, army.y]);
      }
      return trace;
    };

    // 1. Non-war transit refusal: ordered into friendly JZ, first edge ends
    // at hostile S3 while at peace -> the contact throw stands, unmoved.
    assert.ok(bar.assignMarchOrder(P, JZ, false));
    isolate(P);
    const stuck = [P.x, P.y];
    assert.throws(() => performLegionSlotAction(app, P), /Grid march contact unresolved/);
    assert.deepEqual([P.x, P.y], stuck);
    assert.equal(P._engagement, undefined);
    assert.equal(movement.readTile(stuck[0], stuck[1]), 3);
    console.log(JSON.stringify({ order: 'nonwar-transit-refused', stuck }));

    // 2. Delegated siege gate on the new city.
    declareWar(sc, playerFaction, npcFaction);
    assert.ok(bar.assignMarchOrder(D2, JZ, true));
    assert.ok(isLegionDelegated(D2));
    const captured = [];
    app.playDelegatedEngage = (A, resolve) => { captured.push({ A, resolve }); return true; };
    sc.legions = both;
    const d2troops = D2.troops;
    const rng0 = app.originalRng.snapshot();
    const d2clone = structuredClone(D2), s3clone = structuredClone(S3);
    const siegeDrive = driveContactBattle(D2);
    assert.equal(siegeDrive.out, 'suspended');
    assert.equal(siegeDrive.waits, 11);
    assert.deepEqual([D2.x, D2.y], [anchor.x, anchor.y]);
    assert.equal(captured.length, 1);
    assert.equal(captured[0].A, D2);
    assert.equal(D2.troops, d2troops);
    assert.equal(D2._engagement?.kind, 'siege');
    assert.equal(D2._engagement?.target?.cityIdx, S3.idx);
    console.log(JSON.stringify({ order: 'delegated-siege-suspended', at: [D2.x, D2.y] }));

    // 3. Origin-domain parity FIRST on separate clones from the same rng0:
    // identical consumption and settlement; the single-city stub faction
    // dies via 4FCE. The live objects are untouched until the real return.
    const s3row = (c) => [c.troops, c.growth, c.defence, c.faction];
    const anchorClone = { ...structuredClone(A0), x: 5, y: 5 };
    const Aclone = { ...structuredClone(d2clone), x: 6, y: 6, _engagement: { kind: 'siege', target: { cityIdx: 101 } }, status: d2clone.status | 0x20 };
    delete Aclone.roadPosition;
    const cityClone = { ...structuredClone(s3clone), idx: 101, x: 7, y: 6 };
    // Stub cities stay positionally indexed (idx === position), mirroring
    // prepared scenarios: factionIsActive reads cities[capital] by position.
    const stubCities = [];
    stubCities[100] = anchorClone; stubCities[101] = cityClone;
    const stubSc = { legions: [Aclone], cities: stubCities,
      factions: [{ idx: playerFaction, capital: anchorClone.idx ?? 100, active: true, dead: false, n_legions: 5 }, { idx: npcFaction, capital: 101, active: true, dead: false, diplomat_idx: null, monarch_idx: null, n_legions: 3 }],
      generals: structuredClone(sc.generals), diplomacy: structuredClone(sc.diplomacy), player_faction: playerFaction,
      legionSlotCounters: new Array(128).fill(0), delayedLegionReturns: [],
      citiesOf: (idx) => stubCities.filter(c => c.faction === idx) };
    anchorClone.idx = 100; stubSc.factions[0].capital = 100;
    const stubApp = { scenario: stubSc, originalRng: app.originalRng };
    assert.equal(resolveBattle(stubApp, Aclone, cityClone), false);
    const deltaS = app.originalRng.snapshot().calls - rng0.calls;
    app.originalRng.restore(rng0);
    const stubNpc = stubSc.factions.find(f => f.idx === npcFaction);
    assert.ok(stubNpc.dead && stubNpc._extinctionHandled);
    assert.equal(cityClone.faction, playerFaction);
    console.log(JSON.stringify({ order: 'siege-parity-extinction', rngDelta: deltaS, parity: true }));

    // 4. Delegated return resolves the real siege: ownership flips, NPC
    // capital relocates (it keeps origin cities), city damage written,
    // winner holds its pre-siege tile and keeps its JZ target.
    const npcBefore = sc.factions.find(f => f.idx === npcFaction);
    const playerCitiesBefore = sc.cities.filter(c => c.faction === playerFaction).length;
    assert.equal(captured[0].resolve(), false);
    const delta1 = app.originalRng.snapshot().calls - rng0.calls;
    assert.equal(deltaS, delta1);
    assert.deepEqual([D2.troops, D2.morale], [Aclone.troops, Aclone.morale]);
    assert.deepEqual(s3row(S3), s3row(cityClone));
    const s3after = s3row(S3), d2troopsAfter = D2.troops, d2moraleAfter = D2.morale;
    assert.equal(S3.faction, playerFaction);
    assert.ok(S3.troops < s3clone.troops && S3.growth <= s3clone.growth && S3.defence <= s3clone.defence);
    const npcAfter = sc.factions.find(f => f.idx === npcFaction);
    assert.ok(npcAfter.active && !npcAfter.dead && npcAfter.capital !== S3.idx);
    assert.equal(sc.cities.filter(c => c.faction === playerFaction).length, playerCitiesBefore + 1);
    assert.equal(D2.commandState, 8);
    assert.deepEqual([D2.x, D2.y], [anchor.x, anchor.y]);
    assert.equal(D2.targetCity, JZ.idx);
    console.log(JSON.stringify({ order: 'siege-resolved', city: s3after, rngDelta: delta1, npcCapital: npcAfter.capital }));

    // 5. P walks the now-friendly edge to S3; origin-domain field parity
    // 5. P holds at the anchor while D2 works edge1/edge2; P's field loss
    // happens in step 6b from a road tile (no friendly-city survival rule).

    // 6. Delegated field win: D2 marches through flipped S3 to the F2 tile,
    // gate suspends, manual return wins, then D2 arrives at JZ.
    captured.length = 0;
    isolate(D2);
    const toS3center = marchTo(D2, 400, { stopAt: [S3.x, S3.y] });
    sc.legions = both;
    const d2field = driveContactBattle(D2);
    assert.equal(d2field.out, 'suspended');
    // Fresh contact: the march pump cleared the post-siege wait (native 264F).
    assert.equal(captured.length, 1);
    assert.equal(D2._engagement?.kind, 'field');
    const d2pre = D2.troops;
    assert.equal(captured[0].resolve(), false);
    assert.ok(D2.troops <= d2pre);
    assert.equal(D2.commandState, 8);
    assert.equal(F2.dead, true);
    assert.equal(movement.readTile(f2tile.x, f2tile.y), 0);
    console.log(JSON.stringify({ order: 'delegated-field-win', trace: toS3center.length, f2dead: F2.dead }));
    isolate(D2);
    const toJZ = marchTo(D2, 400, { targetIdx: JZ.idx });
    assert.deepEqual(D2.roadPosition, { kind: 'city', cityIndex: JZ.idx });
    assert.deepEqual([D2.x, D2.y], [JZ.x, JZ.y]);
    console.log(JSON.stringify({ order: 'delegated-arrival', steps: toJZ.length, at: [D2.x, D2.y] }));

    // 6b. Attacker loses on a road tile: F1 (900) injected on edge1; P
    // marches from the anchor and meets F1 standing on open road.
    // Parity runs FIRST on separate clones, then the real battle.
    const f1tile = edge1.points[edge1.points.length - 2];
    const F1 = injectRoadArmy(3, 900, f1tile, edge1, F1gen);
    both.push(F1);
    assert.ok(bar.assignMarchOrder(P, S3, false));
    isolate(P);
    const pMeet = edge1.points[edge1.points.length - 3];
    const outLeg = marchTo(P, 400, { stopAt: [pMeet.x, pMeet.y] });
    assert.deepEqual([P.x, P.y], [pMeet.x, pMeet.y]);
    assert.equal(P.roadPosition.kind, 'road');
    console.log(JSON.stringify({ order: 'player-out-leg', steps: outLeg.length, at: [P.x, P.y] }));
    sc.legions = both;
    const frng0 = app.originalRng.snapshot();
    const pclone = structuredClone(P), f1clone = structuredClone(F1);
    const fAclone = { ...structuredClone(pclone), x: 6, y: 6, _engagement: { kind: 'field', target: { x: 7, y: 6, faction: npcFaction } }, status: pclone.status | 0x20 };
    delete fAclone.roadPosition;
    const fDclone = { ...structuredClone(f1clone), x: 7, y: 6 };
    delete fDclone.roadPosition;
    const fAnchor = { ...structuredClone(A0), idx: 100, x: 5, y: 5 };
    const fNcity = { ...structuredClone(s3clone), idx: 102, x: 8, y: 6, faction: npcFaction, troops: 60, growth: 100, defence: 100 };
    const fStubCities = [];
    fStubCities[100] = fAnchor; fStubCities[102] = fNcity;
    const fStub = { legions: [fAclone, fDclone], cities: fStubCities,
      factions: [{ idx: playerFaction, capital: 100, active: true, dead: false, n_legions: 5 }, { idx: npcFaction, capital: 102, active: true, dead: false, diplomat_idx: null, monarch_idx: null, n_legions: 3 }],
      generals: structuredClone(sc.generals), diplomacy: structuredClone(sc.diplomacy), player_faction: playerFaction,
      legionSlotCounters: new Array(128).fill(0), delayedLegionReturns: [],
      citiesOf: (idx) => fStubCities.filter(c => c.faction === idx) };
    const fStubApp = { scenario: fStub, originalRng: app.originalRng };
    assert.equal(resolveFieldBattle(fStubApp, fAclone, fDclone), false);
    const fdeltaS = app.originalRng.snapshot().calls - frng0.calls;
    app.originalRng.restore(frng0);
    console.log(JSON.stringify({ order: 'field-parity-stub', rngDelta: fdeltaS }));
    const fieldDrive = driveContactBattle(P);
    assert.equal(fieldDrive.out, 'complete');
    assert.equal(fieldDrive.waits, 11);
    const fdelta1 = app.originalRng.snapshot().calls - frng0.calls;
    assert.equal(fdeltaS, fdelta1);
    assert.deepEqual([fAclone.troops, fAclone.morale], [P.troops, P.morale]);
    assert.deepEqual([fDclone.troops, fDclone.morale], [F1.troops, F1.morale]);
    const pAfter = [P.troops, P.morale, P.dead], f1After = [F1.troops, F1.morale, F1.commandState];
    assert.ok(P.dead || P.status < 0x80, 'loser leaves the marching set');
    assert.equal(F1.commandState, 8);
    assert.equal(movement.readTile(pclone.x, pclone.y), 0);
    console.log(JSON.stringify({ order: 'field-loss', p: pAfter, f1: f1After, rngDelta: fdelta1, parity: true }));

    // 7. Friendly occupant still refuses: G2 parks ahead of P2 on edge1.
    const g2tile = edge1.points[1];
    const G2 = { slot: 5, x: g2tile.x, y: g2tile.y, faction: playerFaction, status: 0x80, troops: 100, commandState: 0, moveDelay: 1, movePeriod: 3,
      roadPosition: { kind: 'road', roadIndex: loadedGraph.edges.indexOf(edge1), pointIndex: 1, direction: 1 } };
    both.push(G2);
    bindLegionSlotCounter(sc, G2);
    sc.legions = both;
    movement.writeTile(g2tile.x, g2tile.y, movement.readTile(g2tile.x, g2tile.y) + 1);
    assert.ok(bar.assignMarchOrder(P2, S3, false));
    isolate(P2);
    const toG2 = marchTo(P2, 400, { stopAt: [edge1.points[0].x, edge1.points[0].y] });
    assert.deepEqual([P2.x, P2.y], [edge1.points[0].x, edge1.points[0].y]);
    sc.legions = both;
    const p2stuck = [P2.x, P2.y];
    assert.throws(() => performLegionSlotAction(app, P2), /Grid field contact unresolved/);
    assert.deepEqual([P2.x, P2.y], p2stuck);
    console.log(JSON.stringify({ order: 'friendly-occupant-refused', stuck: p2stuck }));
    // Move G2 into S3 (free center) and march P2 back to the anchor: F1
    // (field winner) still holds its tile, so P2 does not pass through it.
    movement.writeTile(G2.x, G2.y, movement.readTile(G2.x, G2.y) - 1);
    G2.x = S3.x; G2.y = S3.y; G2.roadPosition = { kind: 'city', cityIndex: S3.idx };
    movement.writeTile(G2.x, G2.y, movement.readTile(G2.x, G2.y) + 1);
    isolate(P2);
    assert.ok(bar.assignMarchOrder(P2, A0, false));
    const p2rest = marchTo(P2, 400, { targetIdx: A0.idx });
    assert.deepEqual(P2.roadPosition, { kind: 'city', cityIndex: A0.idx });
    console.log(JSON.stringify({ order: 'friendly-arrival', steps: p2rest.length, at: [P2.x, P2.y] }));

    // 8. Slot pay settles exactly once per pass on the extended world.
    // Only ordered armies pump (G2/F1 hold no orders and correctly refuse).
    sc.legions = [D2, P2];
    const fundsOf = (idx) => sc.factions.find(f => f.idx === idx).gold ?? 0;
    const activeArmies = sc.legions.filter(l => !l.dead && l.status >= 0x80);
    assert.deepEqual(activeArmies.map(l => l.slot).sort(), [1, 2]);
    // Clean baseline: the pinned chapter's opening treasury sits below the
    // saturation floor, which would mask the exact per-pass deduction.
    for (const l of activeArmies) { l.faction != null && (sc.factions.find(f => f.idx === l.faction).gold = 100000); }
    console.log(JSON.stringify({ order: 'pay-baseline', gold: fundsOf(playerFaction) }));
    const payByFaction = new Map();
    for (const l of activeArmies) {
      const cost = legionDailyMaintenanceCost(l, false);
      payByFaction.set(l.faction, (payByFaction.get(l.faction) ?? 0) + cost);
    }
    const fundsBefore = new Map([...payByFaction.keys()].map(idx => [idx, fundsOf(idx)]));
    aiTick(app, { legionBatchStart: 0, runCityDaily: false, settleDaily: true });
    assert.ok(!app._strategicBattleFailure, app._strategicBattleFailure?.message);
    for (const [idx, before] of fundsBefore) assert.equal(before - fundsOf(idx), payByFaction.get(idx));
    aiTick(app, { legionBatchStart: 0, runCityDaily: false, settleDaily: true });
    for (const [idx, before] of fundsBefore) assert.equal(before - fundsOf(idx), payByFaction.get(idx) * 2);
    for (const l of activeArmies) assert.ok(l.morale <= 200);
    console.log(JSON.stringify({ order: 'pay-once-per-pass', pay: [...payByFaction.values()] }));

    // 9. City daily covers the new rows deterministically; the monthly pass
    // proposes once and the 304E gate sees it (no re-proposal while pending).
    const citySnap = structuredClone(sc.cities.map(c => [c.troops, c.growth, c.defence]));
    const dailyRng0 = app.originalRng.snapshot();
    cityDaily(sc, app.originalRng);
    const cityAfter = sc.cities.map(c => [c.troops, c.growth, c.defence]);
    for (const [troops, growth, defence] of cityAfter) {
      assert.ok(troops >= 0 && growth >= 0 && growth <= 200 && defence >= 0 && defence <= 200);
    }
    sc.cities.forEach((c, i) => { c.troops = citySnap[i][0]; c.growth = citySnap[i][1]; c.defence = citySnap[i][2]; });
    app.originalRng.restore(dailyRng0);
    cityDaily(sc, app.originalRng);
    assert.deepEqual(sc.cities.map(c => [c.troops, c.growth, c.defence]), cityAfter);
    const diploBefore = JSON.stringify(sc.diplomacy);
    const monthEvents = monthlyDiplomacyAI(app);
    assert.ok(Array.isArray(monthEvents) && monthEvents.length > 0);
    if (monthEvents.length) {
      const first = monthEvents[0];
      assert.ok(hasPendingStrategicEvent(sc, first.type, { arg0: first.arg0, arg1: first.arg1 }));
    }
    console.log(JSON.stringify({ order: 'daily-monthly', monthEvents: monthEvents.length, diploChanged: JSON.stringify(sc.diplomacy) !== diploBefore }));

    // 10. Fixed-address audit: no native context on the grid world.
    assert.equal(scenarioNativeRoadContext(sc), null);
    assert.ok(scenarioGridRoadContext(sc)?.movement);
    console.log(JSON.stringify({ order: 'done', rngCalls: app.originalRng.snapshot().calls }));
  } finally { pack.close(); }
});
