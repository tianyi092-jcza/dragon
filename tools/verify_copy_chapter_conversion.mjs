// Read trusted frozen Web assets; mutate detached fixtures only. No SAVE.DAT/DB.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { compileTrialSource } from '../web/src/content/authoring/trialcompile.js';
import { initializeCopyChapters } from '../server/copychapters.js';
import { initializeCopyGenerals, configureCopyGeneral } from '../server/copygenerals.js';
import { FixedCopyProfile } from '../server/copyprofile.js';
import { createPinnedCopyLoader } from './editor_trusted_copy.mjs';
import { setChapterCityFaction, copyChapterInGame, validateGameSource, initializeChapterFactionIdentities, setChapterPlayerOpening, addBlankChapter, createChapterFaction, retireChapterFaction, initializeBlankChapterInputs } from '../web/src/content/authoring/gamesource.js';
import { createNewGameScenario } from '../web/src/game/world.js';
import { createContentCatalog } from '../web/src/content/catalog.js';
import { createWorldResources } from '../web/src/game/worldresources.js';
import { prepareScenario, readSavedAssembly } from '../web/src/game/scenarioassembly.js';
import { snapshotState, restoreSnapshotState } from '../web/src/game/savegame.js';
import { OriginalBattleRng } from '../web/src/game/battle/originalrng.js';
import { countNativeAliveFactions } from '../web/src/game/navigation/originalvictorygate.js';
import { initializeNativeFactionSlots } from '../web/src/game/nativefactions.js';
import { initializeScenarioWeatherInputs } from '../web/src/game/weather.js';
import { nativeMonthlyPolicyWord, writeNativeMonthlyPolicyWord, refreshNativeMonthlyPolicyViews } from '../web/src/game/nativemonthlypolicy.js';
const profile = new FixedCopyProfile({ loadCopy: createPinnedCopyLoader({ allocateEntityId: (() => { let n = 0; return () => `conversion-${++n}`; })() }) });
const { game: original } = await profile.capture({ gameId: 'chapter-conversion', ownerId: 'isolated-owner' });
const originalJSON = JSON.stringify(original);
const safe = structuredClone(original);
const ambiguous = safe.chapterOrder.filter(id => {
  const capitals = safe.chapters[id].state.factions.map(f => f.capital).filter(c => c != null);
  return new Set(capitals).size !== capitals.length;
});
assert.ok(ambiguous.length > 0, 'real source includes shared-capital conversion cases');
safe.chapterOrder = safe.chapterOrder.filter(id => !ambiguous.includes(id));
for (const id of ambiguous) delete safe.chapters[id];

test('the complete original source converts all chapters while retaining the first shared-capital claimant', () => {
  const linked = initializeCopyGenerals(original), before = JSON.stringify(linked);
  const converted = initializeCopyChapters(linked);
  assert.deepEqual(converted.chapterOrder, original.chapterOrder);
  assert.equal(converted.chapterConversion.duplicates.length, 4);
  for (const row of converted.chapterConversion.duplicates) {
    const state = converted.chapters[row.chapterId].state, old = linked.chapters[row.chapterId].state;
    assert.equal(state.factions[row.discardedFactionIdx].retired, true);
    assert.equal(state.factions[row.discardedFactionIdx].playerOpening, undefined);
    const kept = state.factions[row.keptFactionIdx];
    for (const key of ['monarch_idx', 'money', 'reserve_cav', 'reserve_arc', 'reserve_inf']) assert.equal(kept[key], old.factions[row.keptFactionIdx][key]);
    assert.equal(state.cities.find(c => c.idx === kept.capital).faction, kept.idx);
    assert.ok(state.generals.every(g => g.faction !== row.discardedFactionIdx && g.join_faction !== row.discardedFactionIdx));
    assert.ok(state.cities.every(c => c.faction !== row.discardedFactionIdx));
    const runtime = createNewGameScenario(state, kept.idx, null);
    initializeNativeFactionSlots(runtime);
    assert.equal(runtime.nativeFactionSlots.records[row.discardedFactionIdx].active, false);
  }
  assert.deepEqual(converted.generals, linked.generals);
  assert.equal(JSON.stringify(linked), before);
  assert.equal(JSON.stringify(original), originalJSON);
  compileTrialSource(converted, bytes => createHash('sha256').update(bytes).digest('hex'));
});

test('same-chapter duplicate factions keep the first identity without merging resources or shifting slots', () => {
  const id = original.chapterOrder.find(key => key.endsWith('#upper-1'));
  const source = { ...original, chapterOrder: [id], chapters: { [id]: original.chapters[id] } };
  const linked = initializeCopyGenerals(source), before = JSON.stringify(linked);
  const converted = initializeCopyChapters(linked), state = converted.chapters[id].state;
  assert.deepEqual(converted.chapterConversion.duplicates.map(row => [row.keptFactionIdx, row.discardedFactionIdx]), [[2, 11], [10, 15]]);
  assert.equal(JSON.stringify(linked), before, 'creation-only conversion never rewrites its source');
  assert.equal(JSON.stringify(original), originalJSON);
  assert.equal(state.factions.length, linked.chapters[id].state.factions.length);
  for (const [kept, discarded] of [[2, 11], [10, 15]]) {
    assert.equal(state.factions[kept].raw, linked.chapters[id].state.factions[kept].raw, 'first faction keeps its money, pools and native fields');
    assert.equal(state.factions[discarded].retired, true);
    assert.equal(state.factions[discarded].active, false);
    assert.equal(state.factions[discarded].playerOpening, undefined);
    assert.ok(state.generals.every(g => g.faction !== discarded && g.join_faction !== discarded));
    assert.ok(state.cities.every(c => c.faction !== discarded));
    assert.equal(state.cities.find(c => c.idx === state.factions[kept].capital).faction, kept);
  }
  assert.deepEqual(converted.generals, linked.generals, 'shared master library is not deleted or merged');
  compileTrialSource(converted, bytes => createHash('sha256').update(bytes).digest('hex'));
  const runtime = createNewGameScenario(state, 2, null);
  initializeNativeFactionSlots(runtime);
  assert.equal(runtime.nativeFactionSlots.records[11].active, false);
  assert.equal(runtime.nativeFactionSlots.records[15].active, false);
  assert.equal(runtime.nativeFactionSlots.records[2].active, true);
});

test('different monarchs sharing a capital discard the later claimant; missing capitals still fail', () => {
  const converted = initializeCopyChapters(original);
  assert.deepEqual(converted.chapterConversion.duplicates.filter(row => row.reason === 'shared-capital')
    .map(row => [row.keptFactionIdx, row.discardedFactionIdx, row.monarchName, row.cityName]),
  [[1, 10, '劉寧', '建業'], [2, 3, '郭攸之', '成都']]);
  const missing = structuredClone(original), id = missing.chapterOrder[0];
  missing.chapters[id].state.factions[0].capital = 999;
  assert.throws(() => initializeCopyChapters(missing), error => error.code === 'COPY_CHAPTER_CAPITAL');
  assert.equal(JSON.stringify(original), originalJSON);
});

test('new copy gets deterministic unique labels, explicit era and faithful per-faction policy', () => {
  const before = JSON.stringify(safe), converted = initializeCopyChapters(safe);
  assert.equal(JSON.stringify(safe), before);
  assert.deepEqual(initializeCopyChapters(safe), converted);
  const names = new Set(), numbers = new Set();
  for (const id of safe.chapterOrder) {
    const old = safe.chapters[id], chapter = converted.chapters[id];
    assert.ok([...chapter.name].length <= 8 && [...chapter.number].length <= 6);
    assert.ok(!names.has(chapter.name) && !numbers.has(chapter.number));
    names.add(chapter.name); numbers.add(chapter.number);
    assert.equal(chapter.chapterId, old.chapterId);
    assert.deepEqual(chapter.state.start, { ...old.state.start, era: old.state.start.era ?? 'ad' });
    assert.equal(chapter.nextFactionNumber, chapter.state.factions.length + 1);
    for (const faction of chapter.state.factions) {
      assert.equal(faction.number, faction.idx + 1);
      assert.equal(faction.factionId, `${id}#faction-${faction.number}`);
      assert.deepEqual(faction.playerOpening, { trust: old.state.trust, policyRaw: old.state.nativeMonthlyPolicyRaw });
      assert.equal(createNewGameScenario(chapter.state, faction.idx, null).trust, old.state.trust);
    }
    const restored = structuredClone(chapter);
    delete restored.number; delete restored.name; delete restored.nextFactionNumber;
    delete restored.state.start.era;
    for (const faction of restored.state.factions) { delete faction.playerOpening; delete faction.number; delete faction.factionId; }
    assert.deepEqual(restored, old, 'other chapter fields and both months unchanged');
  }
  assert.deepEqual(converted.cities, safe.cities);
  assert.deepEqual(converted.generals, safe.generals);
  assert.equal(converted.chapterConversion.labels.length, safe.chapterOrder.length);
  const compiled = compileTrialSource(converted, bytes => createHash('sha256').update(bytes).digest('hex'));
  assert.equal(Object.keys(compiled.chapterDigests).length, safe.chapterOrder.length);
});

test('converted chapters and compiled map really assemble both selected faction openings without synthetic native inputs', async t => {
  const game = initializeCopyChapters(safe);
  const transport = process.env.CHAPTER_WB_IDB === '1'
    ? await (await import('./chapter_idb_transport.mjs')).createChapterIDBTransport() : null;
  if (transport) t.after(() => transport.close());
  const choices = game.chapterOrder.flatMap(id => game.chapters[id].state.factions.slice(0, 2).map((faction, index) => ({
    chapterId: id, slot: faction.idx, trust: index ? 201 : 47, tax: index ? 24 : 12,
    conscription: index ? [70, 80, 90] : [127, 19, 9], nextConscription: index ? [100, 110, 120] : [29, 39, 49],
  })));
  assert.equal(choices.length, game.chapterOrder.length * 2);
  for (const { chapterId, slot, ...values } of choices) setChapterPlayerOpening(game, chapterId, slot, values);
  const compiled = compileTrialSource(game, bytes => createHash('sha256').update(bytes).digest('hex'));
  const before = JSON.stringify(game);
  const content = createContentCatalog({ schemaVersion: 1, rules: 'ki-1995', id: game.gameId,
    revision: compiled.sourceDigest, chapters: game.chapterOrder.map((id, legacyScenarioIndex) => ({ id, legacyScenarioIndex, official: false })) },
  { scenarios: game.chapterOrder.map(id => game.chapters[id].state) });
  const previousFetch = globalThis.fetch;
  try {
    for (const choice of choices) {
      const world = createWorldResources(), urls = world.definition.assets;
      const assets = new Map([[urls.terrain, compiled.terrainBytes], [urls.roadCost, compiled.roadCost],
        [urls.roadOffset, compiled.roadOffsetBytes], [urls.roadGraph, new TextEncoder().encode(JSON.stringify(compiled.roadGraph))]]);
      globalThis.fetch = async url => {
        assert.ok(assets.has(url), `unexpected assembly asset: ${url}`);
        return new Response(assets.get(url));
      };
      const template = game.chapters[choice.chapterId].state;
      const result = await prepareScenario({ raw: createNewGameScenario(template, choice.slot, null),
        idx: game.chapterOrder.indexOf(choice.chapterId), content, world, mode: 'fresh' });
      const scenario = result.scenario;
      assert.equal(scenario.player_faction, choice.slot);
      assert.equal(scenario.trust, choice.trust);
      assert.equal(scenario.tax, choice.tax);
      assert.deepEqual(scenario.conscription, choice.conscription.map(value => Math.floor(value / 10) * 10));
      assert.deepEqual(scenario.next_conscription, choice.nextConscription.map(value => Math.floor(value / 10) * 10));
      assert.equal(nativeMonthlyPolicyWord(scenario, 2, 'converted opening assembly'), Math.floor(choice.conscription[0] / 10));
      assert.equal(scenario.nativeFactionSlots.records.length, 22);
      assert.equal(scenario.strategicEventSlots.length, 256);
      assert.equal(scenario.cities.length, compiled.roadGraph.nodes.length);
      // Runtime changes differ from BOTH opening plans. Restore must consume
      // the complete snapshot, never run the selected-faction fresh installer.
      scenario.trust = choice.slot === choices[0].slot ? 13 : 27;
      writeNativeMonthlyPolicyWord(scenario, 2, 37, 'isolated runtime save fixture');
      refreshNativeMonthlyPolicyViews(scenario);
      const app = { scenario, scenarioIdx: game.chapterOrder.indexOf(choice.chapterId), content, world,
        clock: { era: 'bc', year: 1, month: 12, day: 31 }, originalRng: new OriginalBattleRng({ ch: 0, cl: 0, dh: 1 }) };
      let saved = JSON.parse(JSON.stringify(snapshotState(app, 0, 'CHAPTER-WB isolated converted chapter')));
      if (transport && choice.chapterId === game.chapterOrder[0]) saved = await transport.roundtrip(saved);
      const restored = await prepareScenario({ raw: restoreSnapshotState(saved), idx: app.scenarioIdx,
        content, world, mode: 'restore', ...readSavedAssembly(saved) });
      assert.equal(restored.scenario.trust, scenario.trust);
      assert.equal(restored.scenario.player_faction, choice.slot);
      assert.equal(restored.scenario.conscription[0], 370);
      assert.equal(nativeMonthlyPolicyWord(restored.scenario, 2, 'converted chapter restore'), 37);
      assert.deepEqual(restored.scenario.save_date, { era: 'bc', year: 1, month: 12, day: 31 });
      assert.deepEqual(restored.scenario.factions.map(faction => faction.playerOpening), scenario.factions.map(faction => faction.playerOpening));
      assert.equal(JSON.stringify(game), before, 'fresh assembly leaves source and other faction plans untouched');
    }
  } finally { globalThis.fetch = previousFetch; }
  t.diagnostic(`${game.chapterOrder.length} converted chapters; ${choices.length} real fresh assemblies and complete JSON restore assemblies; ${transport ? 2 : 0} real isolated IDB roundtrips; no synthetic native inputs`);
});

test('retired first, middle and last declared slots survive compilation, real fresh assembly and JSON restore', async () => {
  const game = initializeCopyChapters(safe), parentId = game.chapterOrder[0];
  const untouched = JSON.stringify(game.chapters), master = JSON.stringify(game.generals);
  const parent = game.chapters[parentId].state;
  const choices = [0, Math.floor(parent.factions.length / 2), parent.factions.length - 1].map(slot => {
    const chapterId = copyChapterInGame(game, parentId), state = game.chapters[chapterId].state;
    const expectedAlive = state.nativeFactionSlotRaw.filter(raw => Number.parseInt(raw.slice(0, 2), 16) & 128).length - Number(Boolean(state.factions[slot].attr & 128));
    const playerSlot = state.factions.find(faction => faction.idx !== slot && faction.active).idx;
    const members = state.generals.filter(general => general.faction === slot).map(general => general.idx);
    const cities = state.cities.filter(city => city.faction === slot).map(city => city.idx);
    retireChapterFaction(game, chapterId, slot);
    return { chapterId, slot, playerSlot, expectedAlive, members, cities };
  });
  const compiled = compileTrialSource(game, bytes => createHash('sha256').update(bytes).digest('hex'));
  const beforeAssembly = JSON.stringify(game);
  const content = createContentCatalog({ schemaVersion: 1, rules: 'ki-1995', id: game.gameId,
    revision: compiled.sourceDigest, chapters: game.chapterOrder.map((id, legacyScenarioIndex) => ({ id, legacyScenarioIndex, official: false })) },
  { scenarios: game.chapterOrder.map(id => game.chapters[id].state) });
  const previousFetch = globalThis.fetch;
  try {
    for (const choice of choices) {
      const world = createWorldResources(), urls = world.definition.assets;
      const assets = new Map([[urls.terrain, compiled.terrainBytes], [urls.roadCost, compiled.roadCost],
        [urls.roadOffset, compiled.roadOffsetBytes], [urls.roadGraph, new TextEncoder().encode(JSON.stringify(compiled.roadGraph))]]);
      globalThis.fetch = async url => { assert.ok(assets.has(url), `unexpected retirement asset: ${url}`); return new Response(assets.get(url)); };
      const idx = game.chapterOrder.indexOf(choice.chapterId);
      const fresh = await prepareScenario({ raw: createNewGameScenario(game.chapters[choice.chapterId].state, choice.playerSlot, null), idx, content, world, mode: 'fresh' });
      const saved = JSON.parse(JSON.stringify(snapshotState({ scenario: fresh.scenario, scenarioIdx: idx, content, world,
        clock: { era: 'ad', year: 1, month: 1, day: 1 }, originalRng: new OriginalBattleRng({ ch: 0, cl: 0, dh: 1 }) }, 0, 'retired author slot')));
      const restored = await prepareScenario({ raw: restoreSnapshotState(saved), idx, content, world, mode: 'restore', ...readSavedAssembly(saved) });
      for (const scenario of [fresh.scenario, restored.scenario]) {
        assert.equal(scenario.player_faction, choice.playerSlot);
        assert.equal(scenario.factions.length, parent.factions.length, 'declaration width is not live count');
        assert.equal(scenario.nativeFactionSlots.records.length, 22);
        assert.equal(countNativeAliveFactions(scenario), choice.expectedAlive);
        const retired = scenario.factions[choice.slot];
        assert.equal(retired.retired, true); assert.equal(retired.active, false);
        assert.equal(retired.monarch_idx, 255); assert.equal(retired.monarch, '');
        assert.equal(retired.capital, null); assert.equal(retired.money, 0);
        assert.equal(retired.n_cities, 0); assert.equal(retired.nativeGeneralCount, 0);
        assert.equal(scenario.nativeFactionSlots.records[choice.slot], retired, 'restored native and declared views share identity');
        choice.members.forEach(slot => assert.equal(scenario.generals[slot].faction, null));
        choice.cities.forEach(slot => assert.equal(scenario.cities[slot].faction, null));
        assert.ok(scenario.generals.every(general => general.join_faction !== choice.slot));
      }
    }
  } finally { globalThis.fetch = previousFetch; }
  assert.equal(JSON.stringify(game), beforeAssembly, 'runtime does not rewrite author retirement records');
  assert.equal(JSON.stringify(game.generals), master);
  assert.equal(JSON.stringify(Object.fromEntries(Object.entries(game.chapters).filter(([id]) => !choices.some(choice => choice.chapterId === id)))), untouched, 'all original chapters remain unchanged');
});

test('new blank chapter with two forces compiles and prepares from the approved diplomacy template', async () => {
  let game = initializeCopyGenerals(initializeCopyChapters(safe));
  const id = addBlankChapter(game, { number: '新章', name: '原生准入', start: { era: 'bc', year: 1, month: 12, day: 31 } });
  const blank = structuredClone(game.chapters[id].state);
  const { CHAPTER_BASE } = await import('../web/src/content/authoring/chapterbase.generated.js');
  assert.equal(blank.nativeDiplomacyRaw, CHAPTER_BASE.nativeDiplomacyRaw);
  assert.equal(blank.nativeStrategicEventRaw, safe.chapters[safe.chapterOrder[0]].state.nativeStrategicEventRaw, 'complete empty event input is copied, not padded from the short chapter');
  assert.throws(() => initializeBlankChapterInputs(blank), /empty, uninitialized/, 'never reset an already initialized source');
  initializeNativeFactionSlots(blank);
  assert.equal(countNativeAliveFactions(blank, 'CHAPTER-WB empty'), 0);
  assert.equal(blank.factions.length, 0, 'fixed records are not public force declarations');
  initializeScenarioWeatherInputs(blank);
  assert.ok(blank.weatherClouds.every(cloud => cloud.status === 0x80), 'proven shared weather input is available without fabricating diplomacy');
  blank.nativeFactionSlots.records.forEach(faction => {
    for (const key of ['money', 'reserve_cav', 'reserve_arc', 'reserve_inf', 'n_legions', 'nativeGeneralCount', 'n_cities', 'monthly_reserve_upkeep']) assert.equal(faction[key], 0, key);
    for (const key of ['advisor_idx', 'capital', 'diplomat_idx', 'target_faction', 'strategic_city_primary', 'strategic_city_secondary']) assert.equal(faction[key], null, key);
    assert.equal(faction.monarch_idx, 255);
  });
  const generals = Object.keys(game.generals).slice(0, 2);
  for (const [slot, generalId] of generals.entries()) {
    game = configureCopyGeneral(game, id, generalId, { active: true, appearMonths: 0, joinFaction: null, factionId: null });
    createChapterFaction(game, id, slot, slot);
  }
  assert.equal(game.chapters[id].state.factions.length, 2);
  const fixedTable = structuredClone(game.chapters[id].state);
  initializeNativeFactionSlots(fixedTable);
  assert.equal(countNativeAliveFactions(fixedTable, 'CHAPTER-WB blank'), 2, 'only the two explicitly created forces may be alive');
  const compiled = compileTrialSource(game, bytes => createHash('sha256').update(bytes).digest('hex'));
  const template = game.chapters[id].state, before = JSON.stringify(game);
  const content = createContentCatalog({ schemaVersion: 1, rules: 'ki-1995', id: game.gameId,
    revision: compiled.sourceDigest, chapters: [{ id, legacyScenarioIndex: 0, official: false }] }, { scenarios: [template] });
  const world = createWorldResources(), urls = world.definition.assets;
  const assets = new Map([[urls.terrain, compiled.terrainBytes], [urls.roadCost, compiled.roadCost],
    [urls.roadOffset, compiled.roadOffsetBytes], [urls.roadGraph, new TextEncoder().encode(JSON.stringify(compiled.roadGraph))]]);
  const previousFetch = globalThis.fetch;
  try {
    globalThis.fetch = async url => { assert.ok(assets.has(url), `unexpected assembly asset: ${url}`); return new Response(assets.get(url)); };
    const fresh = await prepareScenario({ raw: createNewGameScenario(template, 0, null), idx: 0, content, world, mode: 'fresh' });
    assert.equal(countNativeAliveFactions(fresh.scenario), 2);
    assert.equal(fresh.scenario.nativeDiplomacyMatrix.rows[0][1], 183);
    assert.equal(fresh.scenario.nativeDiplomacyMatrix.rows[1][0], 183);
    const saved = JSON.parse(JSON.stringify(snapshotState({ scenario: fresh.scenario, scenarioIdx: 0, content, world,
      clock: { era: 'bc', year: 1, month: 12, day: 31 }, originalRng: new OriginalBattleRng({ ch: 0, cl: 0, dh: 1 }) }, 0, 'blank author chapter')));
    const restored = await prepareScenario({ raw: restoreSnapshotState(saved), idx: 0, content, world, mode: 'restore', ...readSavedAssembly(saved) });
    assert.deepEqual(restored.scenario.nativeDiplomacyMatrix.rows, fresh.scenario.nativeDiplomacyMatrix.rows);
    assert.equal(countNativeAliveFactions(restored.scenario), 2);
    assert.equal(JSON.stringify(game), before, 'detached preparation never mutates author source');
  } finally { globalThis.fetch = previousFetch; }
  // Author-edited directional pair survives automatic growth of the matrix.
  let grown = structuredClone(game);
  grown.chapters[id].state.nativeDiplomacyRaw = template.nativeDiplomacyRaw.slice(0, 2) + '81' + template.nativeDiplomacyRaw.slice(4);
  grown.chapters[id].state.diplomacy[0][1] = 129;
  const priorRaw = grown.chapters[id].state.nativeDiplomacyRaw;
  const thirdId = Object.keys(grown.generals)[2];
  grown = configureCopyGeneral(grown, id, thirdId, { active: true, appearMonths: 0, joinFaction: null, factionId: null });
  const divergent = structuredClone(grown);
  divergent.chapters[id].state.diplomacy[0][1] = 130;
  const badBefore = JSON.stringify(divergent);
  assert.throws(() => createChapterFaction(divergent, id, 2, 2), /declared diplomacy must match/);
  assert.equal(JSON.stringify(divergent), badBefore, 'creating a faction does not repair unrelated divergent old cells');
  createChapterFaction(grown, id, 2, 2);
  const expanded = grown.chapters[id].state;
  for (let actor = 0; actor < 24; actor++) for (let target = 0; target < 24; target++) {
    const offset = (actor * 24 + target) * 2;
    const newPair = actor === 2 && target < 2 || target === 2 && actor < 2;
    const expected = newPair ? 'b7' : priorRaw.slice(offset, offset + 2);
    assert.equal(expanded.nativeDiplomacyRaw.slice(offset, offset + 2), expected, `cell ${actor}->${target}`);
    if (actor < 3 && target < 3) assert.equal(expanded.diplomacy[actor][target], Number.parseInt(expected, 16));
  }
  assert.equal(JSON.stringify(game), before, 'growing the detached chapter never edits the source game');
});

test('chapter copies rekey faction identities while preserving author numbers, slots and allocation counter', () => {
  const game = initializeCopyChapters(safe), id = game.chapterOrder[0], chapter = game.chapters[id];
  chapter.state.factions[0].number = 100; chapter.nextFactionNumber = 101;
  initializeChapterFactionIdentities(chapter);
  const before = structuredClone(chapter), newId = copyChapterInGame(game, id), copy = game.chapters[newId];
  assert.deepEqual(game.chapters[id], before);
  assert.equal(copy.nextFactionNumber, 101);
  copy.state.factions.forEach((faction, index) => {
    const prior = before.state.factions[index];
    assert.deepEqual(faction, { ...prior, factionId: `${newId}#faction-${prior.number}` });
    assert.notEqual(faction.factionId, prior.factionId);
  });
  validateGameSource(game, { draft: true });
  for (const corrupt of ['identity', 'number', 'counter']) {
    const bad = structuredClone(game), row = bad.chapters[newId];
    if (corrupt === 'identity') row.state.factions[0].factionId = before.state.factions[0].factionId;
    if (corrupt === 'number') row.state.factions[1].number = row.state.factions[0].number;
    if (corrupt === 'counter') row.nextFactionNumber = 100;
    assert.throws(() => validateGameSource(bad, { draft: true }), /faction identity|faction number/);
  }
});

test('only detached capital ownership is corrected, old owner byte is untouched and receipt is explicit', t => {
  const source = structuredClone(safe), id = source.chapterOrder[0], state = source.chapters[id].state;
  const faction = state.factions.find(f => f.capital != null), city = state.cities.find(c => c.idx === faction.capital);
  setChapterCityFaction(source, id, city.idx, null);
  const before = JSON.stringify(source), converted = initializeCopyChapters(source);
  assert.equal(JSON.stringify(source), before);
  const nextCity = converted.chapters[id].state.cities.find(c => c.idx === city.idx);
  assert.equal(nextCity.faction, faction.idx);
  assert.equal(nextCity.raw.slice(0x1a * 2, 0x1b * 2), city.raw.slice(0x1a * 2, 0x1b * 2));
  assert.deepEqual(converted.chapterConversion.capitals, [{ chapterId: id, factionIdx: faction.idx,
    cityIdx: city.idx, cityName: city.name, before: null, after: faction.idx }]);
  t.diagnostic('CHAPTER-WB isolated ownership correction receipt: ' + JSON.stringify(converted.chapterConversion.capitals));
  const control = initializeCopyChapters(safe);
  for (const other of safe.chapterOrder.filter(ch => ch !== id))
    assert.deepEqual(converted.chapters[other], control.chapters[other]);
});
