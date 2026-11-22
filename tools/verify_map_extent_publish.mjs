// MAP-EXT E10: isolated publish chain + formal-pack admission (no network,
// service, browser, user DB, DOS data or profile). Three cases in one
// :memory: SQLite: (1) north+3 extended game with a new band city —
// copy→validate→submit→approve→formal pack→player catalog→new game→
// cross-border march→save→title-load; (2) unextended origin game — same
// chain, byte-identical v2 triplet path; (3) unsupported bounds — verify
// fails, prepare refuses, unvalidated submit refused. Records preserved.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
register('../vps/text-loader.mjs', import.meta.url);
const { openStorage } = await import('../vps/sqlite-port.mjs');
const { GameCopyStore } = await import('../server/gamecopy.js');
const { PublishedPacks } = await import('../server/playpacks.js');
const { mapExtentOptionFor } = await import('../server/copyprofile.js');
const { createPinnedCopyLoader } = await import('./editor_trusted_copy.mjs');
const { admitChapterCity } = await import('../web/src/content/authoring/gamesource.js');
const { syncRoadEndpoints } = await import('../server/copyprofile.js');
const { expandMapOneStep } = await import('../web/src/content/authoring/mapextent.js');
const { composeMapLayers } = await import('../web/src/content/authoring/maplayers.js');
const { compileCityIdentity } = await import('../web/src/content/authoring/cityidentity.js');
const { buildRoad } = await import('../web/src/content/authoring/roadedit.js');
const { compileMapSource, assertMapConnected } = await import('../web/src/content/authoring/mapcompile.js');
const { compileTrialSource } = await import('../web/src/content/authoring/trialcompile.js');
const { TRIAL_COMPILER_REVISION } = await import('../web/src/content/authoring/trialcompile.js');
const { ASSET_TYPES } = await import('../web/src/player/runtimecontract.js');
const { loadPlayerPack } = await import('../web/src/player/playerpack.js');
const { createPlayerEnvironment } = await import('../web/src/player/playerenvironment.js');
const { GameBar } = await import('../web/src/ui/gamebar.js');
const { aiTick } = await import('../web/src/game/ai.js');
const { createOriginalBattleRng } = await import('../web/src/game/battle/originalrng.js');
const { prepareScenario, scenarioGridRoadContext } = await import('../web/src/game/scenarioassembly.js');
const { snapshotState, admitSavedScenario } = await import('../web/src/game/savegame.js');
const { Clock } = await import('../web/src/game/clock.js');
const { saveJSON } = await import('../web/src/core/gamesavecodec.js');
const { createGameSaveStore } = await import('../web/src/core/gamesavestore.js');
const { gameSaveMemoryIDB } = await import('./gamesave_mock.mjs');
const { chapterCapitalGaps } = await import('../web/src/content/authoring/gamesource.js');

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const root = new URL('../', import.meta.url);
const readWeb = path => readFileSync(new URL(`../web/${path}`, import.meta.url));

const storage = openStorage(':memory:');
const author = { id: 'owner', role: 'author', epoch: 1, must_change: 0 };
const admin = { id: 'admin', role: 'admin', epoch: 1, must_change: 0 };
const principal = token => {
  if (token === 'author-tok') return author;
  if (token === 'admin-tok') return admin;
  throw new Error('bad token');
};
storage.sql.exec('CREATE TABLE users (id TEXT PRIMARY KEY, account TEXT UNIQUE NOT NULL, role TEXT NOT NULL, password_hash TEXT NOT NULL, disabled INTEGER NOT NULL, must_change INTEGER NOT NULL, epoch INTEGER NOT NULL, version INTEGER NOT NULL)');
storage.sql.exec('INSERT INTO users VALUES(?,?,?,?,?,?,?,?)', 'owner', 'owned', 'author', '{}', 0, 0, 1, 1);
storage.sql.exec('INSERT INTO users VALUES(?,?,?,?,?,?,?,?)', 'admin', 'root', 'admin', '{}', 0, 0, 1, 1);
storage.sql.exec('CREATE TABLE content_games (game_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), draft_name TEXT NOT NULL, draft_introduction TEXT NOT NULL, formal_name TEXT, formal_introduction TEXT, draft_revision TEXT NOT NULL, row_revision TEXT NOT NULL, current_release_id TEXT, next_ordinal TEXT NOT NULL, listed INTEGER NOT NULL CHECK(listed IN(0,1)), restricted INTEGER NOT NULL CHECK(restricted IN(0,1)), created_at TEXT NOT NULL, modified_at TEXT NOT NULL)');
storage.sql.exec('CREATE TABLE content_releases (game_id TEXT NOT NULL, release_id TEXT NOT NULL, ordinal TEXT NOT NULL, draft_revision TEXT NOT NULL, source_digest TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(game_id,ordinal))');
storage.sql.exec('CREATE TABLE published_games (game_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, pin_json TEXT NOT NULL, updated_at TEXT NOT NULL)');
storage.sql.exec('CREATE TABLE content_names (owner_id TEXT NOT NULL, name TEXT COLLATE BINARY NOT NULL, game_id TEXT NOT NULL, PRIMARY KEY(owner_id,name))');
const games = { assertNotDeleting: () => {}, listOwn: () => [{ gameId: 'x' }] };
const store = new GameCopyStore({ storage, principal, games });
const visualBytes = new Map();
const runtimeAssets = {
  definition: () => ({ definitionDigest: 'd'.repeat(64) }),
  async readShared(token, paths) {
    assert.equal(paths.length, 8);
    return { readWeb(path) { assert.ok(visualBytes.has(path)); return visualBytes.get(path); } };
  },
};
const packs = new PublishedPacks({ storage, principal, runtimeAssets, portraits: null });
for (const role of packs.policy.roles) {
  if (/\/map_(atlas_|tiles_)(spring|summer|autumn|winter)\.png$/.test(role.path)) visualBytes.set(role.path, readWeb(role.path));
}
assert.equal(visualBytes.size, 8);
storage.sql.exec('CREATE TABLE copy_origins (game_id TEXT PRIMARY KEY, registry_id TEXT NOT NULL, profile_revision TEXT NOT NULL, definition_digest TEXT NOT NULL)');

const GAME_EXT = 'c1111111-1111-4111-8111-111111111111';
const GAME_ORG = 'c2222222-2222-4222-8222-222222222222';
const GAME_BAD = 'c3333333-3333-4333-8333-333333333333';
const now = new Date().toISOString();
const addGame = (gameId, draftName) => {
  storage.sql.exec('INSERT INTO content_games VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)', gameId, 'owner', draftName, '', null, null, '1', '1', null, '0', 0, 0, now, now);
  storage.sql.exec('INSERT INTO copy_origins VALUES(?,?,?,?)', gameId, packs.policy.registryId, packs.policy.profileRevision, runtimeAssets.definition().definitionDigest);
};

// The pinned test loader scopes chapter ids to its fixture game; real
// chapters are plain ids. Strip the fixture prefix so the formal pack
// chapter ids satisfy the player transport contract for this game.
function plainChapterIds(game) {
  const map = new Map(game.chapterOrder.map(id => [id, id.includes('#') ? id.slice(id.indexOf('#') + 1) : id]));
  const chapters = {};
  for (const [oldId, chapter] of Object.entries(game.chapters)) chapters[map.get(oldId) ?? oldId] = chapter;
  game.chapters = chapters;
  game.chapterOrder = game.chapterOrder.map(id => map.get(id));
}
function dropIncompatible(game) {
  const bad = game.chapterOrder.filter(id => chapterCapitalGaps(game.chapters[id].state, id).length);
  for (const id of bad) { delete game.chapters[id]; }
  game.chapterOrder = game.chapterOrder.filter(id => !bad.includes(id));
  return bad;
}

// North+3 band, one straight corridor, one new city, all chapters admitted.
async function buildNorthGame() {
  const { game } = await createPinnedCopyLoader()({ gameId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', ownerId: 'isolated' });
  for (let i = 0; i < 3; i++) game.map = expandMapOneStep(game.map, 'north');
  assert.deepEqual(game.map.bounds, { minX: 0, minY: -3, width: 384, height: 259, tileSize: 16 });
  const ordered = Object.values(game.cities).sort((a, b) => a.runtimeSlot - b.runtimeSlot).map(c => c.cityId);
  const placements = game.map.placements;
  const chapter0 = game.chapters[game.chapterOrder[0]].state;
  const factionOf = p => chapter0.cities[game.cities[p.cityId]?.runtimeSlot]?.faction;
  const counts = new Map();
  for (const p of placements) {
    if (p.y >= 40) continue;
    const f = factionOf(p);
    if (f == null) continue;
    counts.set(f, (counts.get(f) ?? 0) + 1);
  }
  const playerFaction = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const roadCells = new Set(game.map.roads.flatMap(r => (r.geometry ?? []).map(p => `${p.x},${p.y}`)));
  const cityCells = new Set(placements.map(p => `${p.x},${p.y}`));
  const tilesNow = () => composeMapLayers(game).terrain;
  const tiles = (x, y) => tilesNow()[(y - game.map.bounds.minY) * game.map.bounds.width + x - game.map.bounds.minX];
  const cityMap = new Map(placements.map(p => [p.cityId, p]));
  let anchor = null, road = null, dest = null;
  const cands = [...placements].sort((a, b) => a.y - b.y).sort((a, b) => (factionOf(b) === playerFaction) - (factionOf(a) === playerFaction));
  for (const p of cands) {
    for (const k of [0, 2, -2]) {
      const dx = p.x + k;
      if (dx < 0 || dx > 383) continue;
      const cells = [];
      for (let y = p.y - 1; y >= -2; y--) cells.push({ x: p.x, y });
      for (let x = p.x + Math.sign(k); Math.sign(k) !== 0 && (Math.sign(k) > 0 ? x <= dx : x >= dx); x += Math.sign(k)) cells.push({ x, y: -2 });
      if (cells.length < 2 || cells.some(c => roadCells.has(`${c.x},${c.y}`)) || cells.slice(1, -1).some(c => cityCells.has(`${c.x},${c.y}`))) continue;
      const probeDest = { ...p, id: 'placement-north', cityId: 'city-north-guan', x: dx, y: -3 };
      delete probeDest.importRef;
      const stamps = cells.map(point => ({ ...point, id: `e10-road-${point.x}-${point.y}`, definitionRef: `tile-${point === cells[0] || point === cells.at(-1) ? 212 : 200}`, variantRef: 'original' }));
      game.map.decorations = [...game.map.decorations, ...stamps];
      try {
        road = { ...buildRoad({ fromCityId: p.cityId, toCityId: probeDest.cityId, travelKind: 'land', geometry: cells, cities: new Map([...cityMap, [probeDest.cityId, probeDest]]), roads: game.map.roads, tiles }, game.map.bounds), id: 'north-link' };
      } catch {
        game.map.decorations = game.map.decorations.slice(0, game.map.decorations.length - stamps.length);
        continue;
      }
      anchor = p; dest = probeDest; break;
    }
    if (road) break;
  }
  assert.ok(road, 'no constructible north corridor');
  game.map.placements = [...placements, dest];
  const geo = road.geometry;
  assert.ok(geo.some(p => p.y === -1), 'corridor must cross y=-1');
  game.cities['city-north-guan'] = { ...game.cities[anchor.cityId], cityId: 'city-north-guan', runtimeSlot: ordered.length, name: '北關', x: dest.x, y: dest.y };
  const identity = compileCityIdentity({ cities: game.cities, cityOrder: [...ordered, 'city-north-guan'], placements: game.map.placements }, game.map.bounds);
  game.map.roads = [...game.map.roads, road];
  assert.equal(admitChapterCity(game, 'city-north-guan', 60, 'ki-1995:siege:7', game.map.bounds).admitted, game.chapterOrder.length);
  syncRoadEndpoints(game, anchor.cityId, 'city-north-guan');
  assertMapConnected(game);
  return { game, geo, anchor, dest, cityIdx: ordered.length };
}

function playerSessionFor(gameId) {
  const { manifest, chapter } = packs.pack(gameId);
  const chapterId = manifest.chapters[0];
  const row = storage.sql.exec('SELECT pin_json FROM published_games WHERE game_id=?', gameId).toArray()[0];
  const pin = JSON.parse(row.pin_json);
  const rel = storage.sql.exec('SELECT release_id, ordinal FROM content_releases WHERE game_id=?', gameId).toArray()[0];
  const manifestBytes = Buffer.from(JSON.stringify(manifest));
  const manifestDigest = sha(manifestBytes);
  const identity = { gameId, releaseId: rel.release_id, revision: pin.revision, sourceDigest: pin.sourceDigest, ordinal: rel.ordinal, chapters: manifest.chapters, chapterId, manifestDigest, name: pin.name, publishedAt: pin.publishedAt };
  let readCount = 0;
  const read = async role => {
    if (role === 'manifest') return { bytes: manifestBytes, sha256: manifestDigest, contentType: 'application/json' };
    if (role === `chapter:${chapterId}`) {
      const bytes = Buffer.from(JSON.stringify(packs.pack(gameId, undefined, chapterId).chapter));
      return { bytes, sha256: sha(bytes), contentType: 'application/json' };
    }
    if (role.startsWith('asset:')) {
      const assetId = role.slice('asset:'.length);
      const row = packs.asset(gameId, pin.revision, pin.sourceDigest, assetId);
      const bytes = Buffer.from(row.bytes);
      return { bytes, sha256: row.sha256, contentType: ASSET_TYPES[assetId] };
    }
    throw new Error('unknown role ' + role);
  };
  const readStatic = async path => {
    const bytes = readWeb(path);
    return { bytes, sha256: sha(bytes), contentType: 'image/png' };
  };
  return { session: { identity, state: () => 'active', read }, read, readStatic, manifest, chapter, manifestDigest };
}

test('E10 isolated publish chain: extended formal pack, origin pack, refusals', async () => {
  addGame(GAME_EXT, '測試複製北拓');
  addGame(GAME_ORG, '測試複製');
  addGame(GAME_BAD, '測試複製壞界');
  const { game, geo, anchor, dest, cityIdx } = await buildNorthGame();
  game.metadata.name = '測試複製北拓';
  game.gameId = GAME_EXT;
  plainChapterIds(game);
  const dropped = dropIncompatible(game);
  assert.ok(dropped.length >= 1 && game.chapterOrder.length >= 3);
  // Ownership on the surviving play chapter (the pre-drop chapterOrder[0]
  // may itself be incompatible and dropped).
  const playState = game.chapters[game.chapterOrder[0]].state;
  const anchorSlot = game.cities[anchor.cityId].runtimeSlot;
  let playerFaction = playState.cities[anchorSlot]?.faction;
  if (playerFaction == null) {
    const counts = new Map();
    for (const p of game.map.placements) {
      if (p.y >= 40) continue;
      const f = playState.cities[game.cities[p.cityId]?.runtimeSlot]?.faction;
      if (f == null) continue;
      counts.set(f, (counts.get(f) ?? 0) + 1);
    }
    playerFaction = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? playState.cities[0].faction;
    playState.cities[anchorSlot].faction = playerFaction;
  }
  playState.cities[cityIdx].faction = playerFaction;
  const playChapterId = game.chapterOrder[0];
  const stored = store.ensureFromGame('author-tok', GAME_EXT, game);
  const validation = store.validateWhole('author-tok', GAME_EXT);
  assert.equal(validation.state, 'passed', JSON.stringify(validation.problems).slice(0, 2000));
  assert.match(validation.ticket, /^[0-9a-f-]{36}$/);
  const submitted = store.submit('author-tok', GAME_EXT, { ticket: validation.ticket, description: 'E10 隔離全鏈：北拓' });
  assert.equal(submitted.state, 'submitted');
  const preview = store.approvePreview('admin-tok', GAME_EXT);
  const compiled = compileTrialSource(preview.data, bytes => sha(bytes), mapExtentOptionFor(preview.data.map));
  assert.equal(compiled.roadGraph.version, 'world-grid-experiment');
  const ticket = await packs.prepare('admin-tok', { game: preview.data, reference: { gameId: GAME_EXT, draftRevision: preview.nextVersion, sourceDigest: preview.copyDigest }, compiled });
  const beforeBytes = JSON.stringify(preview.data);
  store.approveSlot('admin-tok', GAME_EXT, () => packs.installPreparedInTxn('admin-tok', ticket));
  assert.equal(JSON.stringify(preview.data), beforeBytes, 'prepare must not mutate author source');
  const { session, readStatic, manifest, manifestDigest } = playerSessionFor(GAME_EXT);
  assert.equal(manifest.schemaVersion, 3);
  assert.equal(manifest.buildFormat, 'studio-world-grid-1');
  assert.deepEqual([manifest.world.minX, manifest.world.minY, manifest.world.width, manifest.world.height], [0, -3, 384, 259]);
  assert.equal(manifest.assets.find(e => e.assetId === 'roadGraph').role, 'world-road-grid');
  const pack = await loadPlayerPack({ session, compilerRevision: TRIAL_COMPILER_REVISION, maxTotalBytes: 128 * 1024 * 1024, readStatic, mapExtent: true });
  try {
    const env = createPlayerEnvironment(pack, { playerFaction, mapExtent: true });
    const raw = env.raw;
    raw.legions.push({ slot: 0, x: anchor.x, y: anchor.y, faction: playerFaction, status: 0x80, troops: 800, commandState: 0, moveDelay: 1, movePeriod: 3 });
    const prepared = await prepareScenario({ raw, idx: 0, mode: 'fresh', world: env.world, content: env.content, mapExtent: true });
    const sc = prepared.scenario;
    assert.equal(prepared.metadata.roadVersion, 'grid');
    const army = sc.legions.find(l => l.slot === 0);
    const city = sc.cities[cityIdx];
    assert.equal(city.name, '北關');
    const clock = new Clock({ startYear: sc.start.year, startMonth: sc.start.month, startDay: sc.start.day });
    const app = { scenario: sc, scenarioIdx: 0, content: env.content, world: env.world, clock, originalRng: createOriginalBattleRng({ ch: 0, cl: 0, dh: 1 }) };
    const bar = Object.assign(Object.create(GameBar.prototype), { app });
    const { movement } = scenarioGridRoadContext(sc);
    assert.ok(bar.assignMarchOrder(army, city, false));
    for (let i = 0; i < geo.length + 1; i++) {
      if (army.roadPosition.kind === 'city' && army.roadPosition.cityIndex === city.idx) break;
      const x = army.x, y = army.y;
      assert.equal(movement.readTile(x, y), 1);
      // Snapshot the countdown: the pump decrements moveDelay per visit,
      // so the bound must not be re-read live (that strands mid-period).
      const tickVisits = army.moveDelay;
      for (let visit = 1; visit <= tickVisits; visit++) {
        app.clock.strategicTickSerial++;
        aiTick(app, { legionBatchStart: 0, runCityDaily: false, settleDaily: false });
        if (visit < tickVisits) assert.deepEqual([army.x, army.y], [x, y]);
      }
      assert.equal(movement.readTile(x, y), 0);
      assert.equal(movement.readTile(army.x, army.y), 1);
    }
    assert.deepEqual(army.roadPosition, { kind: 'city', cityIndex: city.idx });
    assert.deepEqual([army.x, army.y], [city.x, city.y]);
    assert.ok(city.y < 0, 'arrival must stand on the extended band');
    console.log(JSON.stringify({ leg: 'publish-cross-border', arrived: [army.x, army.y] }));
    const saved = snapshotState(app, 0, '北拓正式包讀檔');
    const memory = gameSaveMemoryIDB();
    const saves = createGameSaveStore({ gameId: GAME_EXT, databaseName: 'owned-e10-memory', getIndexedDB: () => memory.indexedDB, createRecordId: () => GAME_EXT });
    await saves.put({ gameId: GAME_EXT, releaseId: 'formal-1.0', releaseOrdinal: 0, chapterId: playChapterId, manifestDigest, slot: 0, snapshot: saved });
    const got = await saves.get(0);
    assert.deepEqual(got.record.snapshot, saved);
    assert.equal(saveJSON(got.record.snapshot), saveJSON(saved));
    // Title-load on fresh world objects: detached admission + restore.
    const pack2 = await loadPlayerPack({ session, compilerRevision: TRIAL_COMPILER_REVISION, maxTotalBytes: 128 * 1024 * 1024, readStatic, mapExtent: true });
    try {
      const env2 = createPlayerEnvironment(pack2, { playerFaction, mapExtent: true });
      const data = { scenarios: Array.from({ length: preview.data.chapterOrder.length }) };
      const admitted = admitSavedScenario(got.record.snapshot, { data, content: env2.content, world: env2.world });
      const ready = await prepareScenario({ ...admitted, mode: 'restore', content: env2.content, world: env2.world });
      assert.equal(ready.metadata.roadVersion, 'grid');
      assert.deepEqual(ready.metadata.bounds, { minX: 0, minY: -3, width: 384, height: 259 });
      const date = saved.state.save_date;
      const coldClock = new Clock({ startYear: date.year, startMonth: date.month, startDay: date.day });
      coldClock.sub = saved.state.save_sub; coldClock.hour = saved.state.save_hour;
      coldClock.strategicTickSerial = app.clock.strategicTickSerial;
      const cold = { scenario: ready.scenario, scenarioIdx: 0, content: env2.content, world: env2.world, clock: coldClock, originalRng: createOriginalBattleRng({ ch: 9, cl: 8, dh: 7 }).restore(saved.webMeta.originalRng) };
      const coldArmy = cold.scenario.legions.find(l => l.slot === 0);
      assert.deepEqual([coldArmy.x, coldArmy.y], [army.x, army.y]);
      assert.deepEqual(coldArmy.roadPosition, army.roadPosition);
      for (let i = 0; i < 3; i++) {
        app.clock.strategicTickSerial++; coldClock.strategicTickSerial++;
        aiTick(app, { legionBatchStart: 0, runCityDaily: false, settleDaily: false });
        aiTick(cold, { legionBatchStart: 0, runCityDaily: false, settleDaily: false });
      }
      assert.deepEqual([coldArmy.x, coldArmy.y], [army.x, army.y]);
      assert.deepEqual(scenarioGridRoadContext(cold.scenario).movement.snapshot(), movement.snapshot());
      assert.deepEqual(cold.originalRng.snapshot(), app.originalRng.snapshot());
      console.log(JSON.stringify({ leg: 'publish-read', synced: true, ticks: 3 }));
    } finally { await pack2.close(); }
  } finally { await pack.close(); }

  // Origin game: same chain, v2 triplet byte-stable (no minX key).
  const { game: orgGame } = await createPinnedCopyLoader()({ gameId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', ownerId: 'isolated' });
  orgGame.metadata.name = '測試複製';
  orgGame.gameId = GAME_ORG;
  plainChapterIds(orgGame);
  dropIncompatible(orgGame);
  store.ensureFromGame('author-tok', GAME_ORG, orgGame);
  const orgValidation = store.validateWhole('author-tok', GAME_ORG);
  assert.equal(orgValidation.state, 'passed', JSON.stringify(orgValidation.problems).slice(0, 1000));
  store.submit('author-tok', GAME_ORG, { ticket: orgValidation.ticket, description: 'E10 隔離全鏈：原域' });
  const orgPreview = store.approvePreview('admin-tok', GAME_ORG);
  const orgCompiled = compileTrialSource(orgPreview.data, bytes => sha(bytes), mapExtentOptionFor(orgPreview.data.map));
  assert.equal(orgCompiled.roadGraph.version, 2);
  const orgTicket = await packs.prepare('admin-tok', { game: orgPreview.data, reference: { gameId: GAME_ORG, draftRevision: orgPreview.nextVersion, sourceDigest: orgPreview.copyDigest }, compiled: orgCompiled });
  store.approveSlot('admin-tok', GAME_ORG, () => packs.installPreparedInTxn('admin-tok', orgTicket));
  const { manifest: orgManifest } = playerSessionFor(GAME_ORG);
  assert.equal(orgManifest.schemaVersion, 1);
  assert.equal(orgManifest.buildFormat, 'studio-app-2');
  assert.ok(!Object.hasOwn(orgManifest.world, 'minX'));
  assert.deepEqual([orgManifest.world.width, orgManifest.world.height], [384, 256]);
  assert.equal(orgManifest.assets.find(e => e.assetId === 'roadGraph').role, 'native-road-v2');

  // Refusals: unsupported bounds fail verify, refuse prepare, unvalidated submit refused.
  const { game: badGame } = await createPinnedCopyLoader()({ gameId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', ownerId: 'isolated' });
  badGame.metadata.name = '測試複製壞界';
  badGame.gameId = GAME_BAD;
  plainChapterIds(badGame);
  dropIncompatible(badGame);
  badGame.map.bounds = { minX: 0, minY: 0, width: 500, height: 256, tileSize: 16 };
  store.ensureFromGame('author-tok', GAME_BAD, badGame);
  const badValidation = store.validateWhole('author-tok', GAME_BAD);
  assert.equal(badValidation.state, 'failed');
  assert.ok(badValidation.problems.length > 0);
  assert.ok(badValidation.problems.some(p => p.code === 'CHAPTER_COMPILE' || p.code === 'VALIDATION_FAILED'));
  assert.equal(badValidation.ticket, null);
  await assert.rejects(packs.prepare('admin-tok', { game: badGame, reference: { gameId: GAME_BAD, draftRevision: '1', sourceDigest: 'x'.repeat(64) }, compiled: { roadGraph: { version: 2 } } }), error => error.code === 'PLAY_MAP_BOUNDS');
  await assert.rejects(async () => store.submit('author-tok', GAME_BAD, { ticket: randomUUID(), description: '未驗即交' }), error => error.code === 'VALIDATION_STALE');
  const { game: freshGame } = await createPinnedCopyLoader()({ gameId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', ownerId: 'isolated' });
  const GAME_FRESH = 'c4444444-4444-4444-8444-444444444444';
  addGame(GAME_FRESH, '測試複製未驗');
  freshGame.metadata.name = '測試複製未驗';
  freshGame.gameId = GAME_FRESH;
  plainChapterIds(freshGame);
  store.ensureFromGame('author-tok', GAME_FRESH, freshGame);
  await assert.rejects(async () => store.submit('author-tok', GAME_FRESH, { ticket: randomUUID(), description: '未驗即交' }), error => error.code === 'VALIDATION_STALE');
  console.log(JSON.stringify({ result: 'E10-CHAIN-OK', droppedChapters: dropped.length, extended: { schema: manifest.schemaVersion, format: manifest.buildFormat }, origin: { schema: orgManifest.schemaVersion, format: orgManifest.buildFormat } }));
});
