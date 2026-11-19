// chapters 模块写：create/copy/delete/rename/setStart/resources，走 gamesource/chapterresources 原函数。
// 用法：node --test tools/verify_copy_chapter_ops.mjs（cwd=web-port）
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { GameCopyStore } from '../server/gamecopy.js';
import { createNewGameScenario } from '../web/src/game/world.js';
import { initializeNativeFactionSlots, rebindNativeFactionViews } from '../web/src/game/nativefactions.js';
import { countNativeAliveFactions } from '../web/src/game/navigation/originalvictorygate.js';
import { initializeNativeMonthlyPolicy } from '../web/src/game/nativemonthlypolicy.js';
import { encodePlayerOpening } from '../web/src/editor/chapteropening.js';
import { CHAPTER_DIPLOMACY_RELATIONS, decodeChapterDiplomacy } from '../web/src/editor/chapterdiplomacy.js';
import { readFactionResources } from '../web/src/editor/chapterresources.js';
import { setChapterLabels, initializeChapterFactionIdentities, validateGameSource, setFactionCapital, setChapterCityFaction, chapterCapitalGaps, disbandFaction, retireChapterFaction } from '../web/src/content/authoring/gamesource.js';
import { factionNativeConsistencyGaps } from '../web/src/content/authoring/factionconsistency.js';
import { FixedCopyProfile } from '../server/copyprofile.js';
import { createPinnedCopyLoader } from './editor_trusted_copy.mjs';
import { openStorage } from '../vps/sqlite-port.mjs';

const storage = openStorage(':memory:');
storage.sql.exec('CREATE TABLE content_games (game_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL)');
const actor = { id: 'owner-1', must_change: 0, epoch: 1 };
const games = { assertNotDeleting: () => {}, listOwn: () => storage.sql.exec('SELECT game_id FROM content_games').toArray().map(r => ({ gameId: r.game_id })) };
const store = new GameCopyStore({ storage, principal: () => actor, games });
const loader = createPinnedCopyLoader({ allocateEntityId: () => 'op-' + randomUUID() });
const profile = new FixedCopyProfile({ loadCopy: loader });
const { game: captured } = await profile.capture({ gameId: 'pinned-src', ownerId: 'owner-1' });
// Positive publication fixtures contain only valid chapters. Original source
// remains frozen; incompatible capitals get explicit rejection tests below,
// not an _src exemption or an arbitrary correction of shared capitals.
const pinned = structuredClone(captured);
const incompatible = pinned.chapterOrder.filter(id => chapterCapitalGaps(pinned.chapters[id].state, id).length);
for (const id of incompatible) delete pinned.chapters[id];
pinned.chapterOrder = pinned.chapterOrder.filter(id => !incompatible.includes(id));
assert.ok(pinned.chapterOrder.length >= 3, 'need independent valid chapters for publication fixtures');
const FIRST = pinned.chapterOrder[0];

function fresh() {
  const gameId = randomUUID();
  storage.sql.exec('INSERT INTO content_games VALUES(?,?)', gameId, actor.id);
  const data = structuredClone(pinned);
  store.ensureFromGame('tok', gameId, data);
  return gameId;
}
const fails = async (fn, code, status) => {
  try { await fn(); } catch (e) { assert.equal(e.code, code, 'code ' + e.code); assert.equal(e.status, status, 'status'); return; }
  assert.fail('should have thrown ' + code);
};
const readData = gameId => store.read('tok', gameId).data;

test('CHAPTER-WB strategist changes refresh the legacy display count without changing native F18', async () => {
  const gameId = fresh(), before = readData(gameId), state = before.chapters[FIRST].state;
  const faction = state.factions[0], advisor = state.generals[faction.advisor_idx];
  assert.equal(advisor.faction, faction.idx); assert.equal(advisor.appear_months, 0);
  const count = Number.parseInt(faction.raw.slice(0x18 * 2, 0x19 * 2), 16);
  await store.writeModule('tok', gameId, 'chapters', { edits: [{ op: 'set-strategist', chapterId: FIRST, factionIdx: faction.idx, generalIdx: null }] });
  const expected = structuredClone(before), changed = expected.chapters[FIRST].state.factions[faction.idx];
  changed.advisor_idx = null; changed.n_generals = count;
  changed.raw = changed.raw.slice(0, 4) + '7f' + changed.raw.slice(6);
  expected.chapters[FIRST].state.nativeFactionSlotRaw[faction.idx] = changed.raw;
  assert.deepEqual(readData(gameId), expected, 'clear only updates the advisor reference and its compatibility display count');
  await store.writeModule('tok', gameId, 'chapters', { edits: [{ op: 'set-strategist', chapterId: FIRST, factionIdx: faction.idx, generalIdx: advisor.idx }] });
  assert.deepEqual(readData(gameId), before, 'restoring the advisor restores the view without decrementing native F18 a second time');
});

test('CHAPTER-WB publication probes real native initializers without patching source or issuing a ticket for missing bytes', () => {
  const gameId = fresh(), valid = readData(gameId);
  assert.equal(store.validateWhole('tok', gameId).state, 'passed');
  for (const field of ['nativeFactionSlotRaw', 'nativeDiplomacyRaw', 'nativeStrategicEventRaw', 'nativeMonthlyPolicyRaw']) {
    const incomplete = structuredClone(valid);
    delete incomplete.chapters[FIRST].state[field];
    store.ensureFromGame('tok', gameId, incomplete);
    const before = store.read('tok', gameId), result = store.validateWhole('tok', gameId);
    assert.equal(result.state, 'failed', field);
    assert.equal(result.ticket, null, field);
    assert.ok(result.problems.some(problem => problem.chapterId === FIRST && problem.code === 'CHAPTER_NATIVE_INITIALIZATION' && problem.detail.startsWith(field + ':')), field);
    assert.deepEqual(readData(gameId), before.data, 'validation never fills absent native inputs');
    assert.equal(store.read('tok', gameId).copyDigest, before.copyDigest);
  }
  store.ensureFromGame('tok', gameId, valid);
  assert.equal(store.validateWhole('tok', gameId).state, 'passed');
  assert.deepEqual(readData(gameId), valid);
});

test('CHAPTER-WB changing lord retains faction identity, estate and old lord membership', async () => {
  const gameId = fresh(), data = readData(gameId), chapter = data.chapters[FIRST], state = chapter.state;
  initializeChapterFactionIdentities(chapter);
  const faction = state.factions[0], occupied = new Set(state.factions.flatMap(f => [f.monarch_idx, f.advisor_idx, f.diplomat_idx]).concat(state.cities.map(c => c.governor)));
  const free = state.generals.find(g => g.idx < 127 && !occupied.has(g.idx) && g.faction === null);
  const member = state.generals.find(g => g.idx < 127 && !occupied.has(g.idx) && g.faction === 0);
  assert.ok(free); assert.ok(member);
  [free, member].forEach((g, i) => {
    // Explicit isolated author configuration; imported availability is not assumed.
    Object.assign(g, { status: 0, captive_flag: 255, appear_months: 0, attr: (g.attr | 128) & 191, active: true });
    g.generalId = `${gameId}#general-${String(i + 3).repeat(64)}`;
    data.generals[g.generalId] = { name: g.name, hao: g.hao, ability: g.ability, portraitRef: null, suicideOnCapture: false };
  });
  faction.playerOpening = { trust: 72, policyRaw: state.nativeMonthlyPolicyRaw };
  store.ensureFromGame('tok', gameId, data);
  for (const candidate of [free, member]) {
    const before = readData(gameId), prior = before.chapters[FIRST].state, oldLord = prior.factions[0].monarch_idx;
    const count = Number.parseInt(prior.nativeFactionSlotRaw[0].slice(48, 50), 16);
    store.writeModule('tok', gameId, 'chapters', { edits: [{ op: 'set-monarch', chapterId: FIRST, factionIdx: 0, generalIdx: candidate.idx }] });
    const after = readData(gameId), st = after.chapters[FIRST].state, next = st.factions[0];
    assert.equal(next.monarch_idx, candidate.idx); assert.equal(next.monarch, candidate.name);
    assert.equal(st.generals[oldLord].faction, 0); assert.equal(st.generals[oldLord].attr & 64, 0); assert.equal(st.generals[oldLord].is_monarch, false);
    assert.equal(st.generals[candidate.idx].faction, 0); assert.equal(st.generals[candidate.idx].attr & 64, 64);
    assert.equal(Number.parseInt(next.raw.slice(2, 4), 16), candidate.idx);
    assert.equal(next.raw, st.nativeFactionSlotRaw[0]);
    assert.equal(Number.parseInt(next.raw.slice(48, 50), 16), (count + (prior.generals[candidate.idx].faction === null ? 1 : 0)) & 255);
    const unchanged = row => Object.fromEntries(Object.entries(row).filter(([key]) => !['monarch_idx', 'monarch', 'raw', 'n_generals', 'nativeGeneralCount'].includes(key)));
    assert.deepEqual(unchanged(next), unchanged(prior.factions[0]), 'identity, capital, money, reserves, opening and remaining native views unchanged');
    assert.deepEqual(st.cities, prior.cities); assert.deepEqual(after.generals, before.generals);
    before.chapterOrder.filter(id => id !== FIRST).forEach(id => assert.deepEqual(after.chapters[id], before.chapters[id]));
  }
  const beforeRefusal = store.read('tok', gameId);
  await fails(() => store.writeModule('tok', gameId, 'chapters', { edits: [{ op: 'set-monarch', chapterId: FIRST, factionIdx: 0, generalIdx: free.idx }, { op: 'set-monarch', chapterId: FIRST, factionIdx: 0, generalIdx: state.factions[1].monarch_idx }] }), 'COPY_CHAPTER', 422);
  assert.deepEqual(store.read('tok', gameId), beforeRefusal, 'another faction lord is not stolen and the earlier switch rolls back');
  for (const values of [{ active: false, appearMonths: 0, joinFaction: null }, { active: true, appearMonths: 1, joinFaction: null }]) {
    await fails(() => store.writeModule('tok', gameId, 'chapters', { edits: [
      { op: 'general-arrival', chapterId: FIRST, generalIdx: free.idx, values },
      { op: 'set-monarch', chapterId: FIRST, factionIdx: 0, generalIdx: free.idx },
    ] }), 'COPY_CHAPTER', 422);
    assert.deepEqual(store.read('tok', gameId), beforeRefusal, 'unavailable successor is rejected without saving the earlier availability edit');
  }
});

test('CHAPTER-WB diplomacy edits one directed cell and rejects invalid or retired targets atomically', async () => {
  const gameId = fresh();
  for (const choice of CHAPTER_DIPLOMACY_RELATIONS) {
    const expected = structuredClone(readData(gameId)), state = expected.chapters[FIRST].state;
    state.nativeDiplomacyRaw = state.nativeDiplomacyRaw.slice(0, 2) + choice.value.toString(16) + state.nativeDiplomacyRaw.slice(4);
    state.diplomacy[0][1] = choice.value;
    store.writeModule('tok', gameId, 'chapters', { edits: [{ op: 'diplomacy', chapterId: FIRST, actorIdx: 0, targetIdx: 1, relation: choice.id }] });
    assert.deepEqual(readData(gameId), expected, 'only the selected direction and its named mirror change; other chapters/master tables stay exact');
    assert.equal(decodeChapterDiplomacy(readData(gameId).chapters[FIRST].state)[0][1], choice.value);
  }
  const command = { op: 'diplomacy', chapterId: FIRST, actorIdx: 0, targetIdx: 1, relation: 'ordinary' };
  for (const edit of [{ ...command, targetIdx: 0 }, { ...command, targetIdx: 22 }, { ...command, relation: 'war' },
    { ...command, relation: 183 }, { ...command, chapterId: 'foreign-chapter' }, { ...command, raw: 183 }]) {
    const before = store.read('tok', gameId);
    await fails(() => store.writeModule('tok', gameId, 'chapters', { edits: [
      { op: 'resources-people', chapterId: FIRST, factionIdx: 1, values: { money: 127 } }, edit,
    ] }), 'COPY_CHAPTER', 422);
    assert.deepEqual(store.read('tok', gameId), before, 'rejection rolls back the prefix, digest, ticket and SQL timestamps');
  }
  store.writeModule('tok', gameId, 'chapters', { edits: [{ op: 'disband-faction', chapterId: FIRST, factionIdx: 0, confirm: true }] });
  for (const edit of [command, { ...command, actorIdx: 1, targetIdx: 0 }]) {
    const before = store.read('tok', gameId);
    await fails(() => store.writeModule('tok', gameId, 'chapters', { edits: [edit] }), 'COPY_CHAPTER', 422);
    assert.deepEqual(store.read('tok', gameId), before, 'retired actor or target cannot be edited');
  }
});

test('CHAPTER-WB faction creation commits lord, owned capital, identity and zero resources together', async () => {
  const gameId = fresh();
  store.writeModule('tok', gameId, 'chapters', { create: { number: '建勢', name: '建勢章', start: { era: 'ad', year: 190, month: 1, day: 1 } } });
  store.writeModule('tok', gameId, 'generals', { import: [{ name: '新君甲' }, { name: '新君乙' }] });
  const seeded = readData(gameId), chapterId = seeded.chapterOrder.at(-1), generalIds = Object.keys(seeded.generals);
  store.writeModule('tok', gameId, 'chapters', { edits: generalIds.map(generalId => ({ op: 'general-settings', chapterId, generalId, values: { active: true, appearMonths: 0, joinFaction: null } })) });
  const create = (monarchIdx, cityIdx) => ({ op: 'create-faction', chapterId, monarchIdx, cityIdx });
  const source = readData(gameId), newState = source.chapters[chapterId].state;
  assert.equal(newState.trust, 255); assert.equal(newState.tax, 18);
  assert.deepEqual(newState.conscription, [0, 0, 0]); assert.deepEqual(newState.next_conscription, [0, 0, 0]);
  const legacyMissing = structuredClone(source); delete legacyMissing.chapters[chapterId].state.nativeMonthlyPolicyRaw;
  store.ensureFromGame('tok', gameId, legacyMissing);
  const missingPolicy = store.read('tok', gameId);
  await fails(() => store.writeModule('tok', gameId, 'chapters', { edits: [create(0, 0)] }), 'COPY_CHAPTER_INITIALIZATION_REQUIRED', 422);
  assert.deepEqual(store.read('tok', gameId), missingPolicy, 'legacy missing policy is not migrated on read or faction creation');
  store.ensureFromGame('tok', gameId, source);
  const before = store.read('tok', gameId);
  await fails(() => store.writeModule('tok', gameId, 'chapters', { edits: [{ op: 'general-arrival', chapterId, generalIdx: 0, values: { appearMonths: 12, joinFaction: null } }, create(0, 0)] }), 'COPY_CHAPTER', 422);
  assert.deepEqual(store.read('tok', gameId), before, 'future appearance cannot be appointed lord and leaves no prefix');
  await fails(() => store.writeModule('tok', gameId, 'chapters', { edits: [create(0, 0), create(1, 0)] }), 'COPY_CHAPTER', 422);
  assert.deepEqual(store.read('tok', gameId), before, 'duplicate capital rolls back both faction allocations');
  store.writeModule('tok', gameId, 'chapters', { edits: [create(0, 0), create(1, 1)] });
  const after = readData(gameId), chapter = after.chapters[chapterId], state = chapter.state;
  assert.equal(chapter.nextFactionNumber, 3);
  for (const faction of state.factions) {
    assert.equal(faction.number, faction.idx + 1); assert.equal(faction.factionId, `${chapterId}#faction-${faction.number}`);
    assert.equal(faction.monarch_idx, faction.idx); assert.equal(faction.capital, faction.idx);
    assert.equal(state.cities[faction.idx].faction, faction.idx);
    const lord = state.generals[faction.monarch_idx];
    assert.equal(faction.monarch, lord.name);
    assert.equal(lord.faction, faction.idx); assert.equal(lord.attr & 0xc0, 0xc0); assert.equal(lord.is_monarch, true);
    assert.equal(faction.nativeGeneralCount, 1); assert.equal(faction.n_cities, 1);
    assert.equal(faction.money, 0); assert.equal(faction.raw.slice(64, 70), '000000');
    assert.equal(faction.raw.slice(8, 20), '000000000000');
    assert.equal(faction.raw, state.nativeFactionSlotRaw[faction.idx]);
    const freshState = createNewGameScenario(state, faction.idx, null);
    assert.equal(freshState.trust, 255); assert.equal(freshState.tax, 18);
    assert.deepEqual(freshState.conscription, [0, 0, 0]); assert.deepEqual(freshState.next_conscription, [0, 0, 0]);
    assert.equal(faction.playerOpening.policyRaw.slice(16, 20), state.nativeMonthlyPolicyRaw.slice(16, 20), 'next tax and unknown byte preserved');
  }
  assert.deepEqual(after.generals, source.generals);
  source.chapterOrder.filter(id => id !== chapterId).forEach(id => assert.deepEqual(after.chapters[id], source.chapters[id]));
});

test('CHAPTER-WB publication refuses sparse or reordered faction slots that the runtime cannot install', async () => {
  for (const mutation of ['remove-middle', 'reorder']) {
    const gameId = fresh(), data = readData(gameId), factions = data.chapters[FIRST].state.factions;
    assert.ok(factions.length > 2);
    if (mutation === 'remove-middle') factions.splice(1, 1);
    else [factions[0], factions[1]] = [factions[1], factions[0]];
    assert.throws(() => initializeNativeFactionSlots(structuredClone(data.chapters[FIRST].state)), /Invalid declared faction slot/);
    store.ensureFromGame('tok', gameId, data);
    const before = readData(gameId), result = await store.validateWhole('tok', gameId);
    assert.equal(result.state, 'failed'); assert.ok(!result.ticket);
    assert.match(JSON.stringify(result.problems), /dense native slot order/);
    assert.deepEqual(readData(gameId), before, 'validation must not renumber identities to hide the defect');
  }
});

test('CHAPTER-WB ordinary affiliation updates F18 mirrors without conflating active or arrival', async () => {
  const gameId = fresh(), initial = readData(gameId), state = initial.chapters[FIRST].state;
  const general = state.generals.find(g => g.idx < 127 && g.status === 0 && g.captive_flag === 255 &&
    !state.factions.some(f => [f.monarch_idx, f.advisor_idx, f.diplomat_idx].includes(g.idx)) && !state.cities.some(c => c.governor === g.idx));
  assert.ok(general);
  for (const factionId of [0, 1, null]) {
    const before = readData(gameId), expected = structuredClone(before), st = expected.chapters[FIRST].state, row = st.generals[general.idx], old = row.faction;
    if (old !== factionId) {
      row.faction = factionId;
      for (const [owner, delta] of [[old, -1], [factionId, 1]]) {
        if (owner === null) continue;
        const f = st.factions.find(f => f.idx === owner), raw = st.nativeFactionSlotRaw[owner];
        const count = (Number.parseInt(raw.slice(48, 50), 16) + delta) & 255, byte = count.toString(16).padStart(2, '0');
        st.nativeFactionSlotRaw[owner] = raw.slice(0, 48) + byte + raw.slice(50);
        f.raw = f.raw.slice(0, 48) + byte + f.raw.slice(50);
        f.n_generals = Math.max(0, count - (st.generals.find(g => g.idx === f.advisor_idx)?.faction === owner ? 1 : 0));
      }
    }
    store.writeModule('tok', gameId, 'chapters', { edits: [{ op: 'general-faction', chapterId: FIRST, generalIdx: general.idx, factionId }] });
    assert.deepEqual(readData(gameId), expected, 'only owner, F18 mirrors and historical count view change');
  }
  store.writeModule('tok', gameId, 'chapters', { edits: [
    { op: 'general-arrival', chapterId: FIRST, generalIdx: general.idx, values: { appearMonths: 2, joinFaction: 1 } },
    { op: 'general-faction', chapterId: FIRST, generalIdx: general.idx, factionId: 0 },
  ] });
  const combined = readData(gameId).chapters[FIRST].state.generals[general.idx];
  assert.equal(combined.appear_months, 2); assert.equal(combined.join_faction, 1); assert.equal(combined.faction, 0);
  store.writeModule('tok', gameId, 'chapters', { edits: [{ op: 'general-faction', chapterId: FIRST, generalIdx: general.idx, factionId: null }] });
  const bound = readData(gameId), generalId = `${gameId}#general-${'b'.repeat(64)}`;
  bound.generals[generalId] = { name: general.name, hao: general.hao, portraitRef: null, ability: general.ability, suicideOnCapture: false };
  bound.chapters[FIRST].state.generals[general.idx].generalId = generalId;
  store.ensureFromGame('tok', gameId, bound);
  const countBefore = Number.parseInt(bound.chapters[FIRST].state.nativeFactionSlotRaw[0].slice(48, 50), 16);
  store.writeModule('tok', gameId, 'chapters', { edits: [{ op: 'general-settings', chapterId: FIRST, generalId, values: { active: false, appearMonths: 4, joinFaction: 1, factionId: 0 } }] });
  const configured = readData(gameId), configuredGeneral = configured.chapters[FIRST].state.generals[general.idx];
  assert.equal(configuredGeneral.faction, 0); assert.equal(configuredGeneral.join_faction, 1); assert.equal(configuredGeneral.appear_months, 4); assert.equal(configuredGeneral.active, false);
  assert.equal(Number.parseInt(configured.chapters[FIRST].state.nativeFactionSlotRaw[0].slice(48, 50), 16), (countBefore + 1) & 255);
  const runtimeState = structuredClone(configured.chapters[FIRST].state);
  initializeNativeFactionSlots(runtimeState);
  assert.equal(runtimeState.nativeFactionSlots.records[0].nativeGeneralCount, (countBefore + 1) & 255, 'runtime consumes the changed native count, not n_generals');
  assert.deepEqual(configured.generals, bound.generals);
  bound.chapterOrder.filter(id => id !== FIRST).forEach(id => assert.deepEqual(configured.chapters[id], bound.chapters[id]));
  const captive = readData(gameId); captive.chapters[FIRST].state.generals[general.idx].captive_flag = 0;
  store.ensureFromGame('tok', gameId, captive);
  const beforeRefusal = store.read('tok', gameId);
  await fails(() => store.writeModule('tok', gameId, 'chapters', { edits: [{ op: 'general-arrival', chapterId: FIRST, generalIdx: general.idx, values: { appearMonths: 12, joinFaction: null } }, { op: 'general-faction', chapterId: FIRST, generalIdx: general.idx, factionId: 1 }] }), 'COPY_CHAPTER', 422);
  assert.deepEqual(store.read('tok', gameId), beforeRefusal, 'unsupported captive transfer rejects the whole batch');
});

test('CHAPTER-WB library configuration allocates one normal slot only in the selected chapter', async () => {
  const gameId = fresh();
  store.writeModule('tok', gameId, 'chapters', { create: { number: '新卷', name: '新章', start: { era: 'ad', year: 190, month: 1, day: 1 } } });
  const seed = readData(gameId), chapterId = seed.chapterOrder.at(-1), generalId = `${gameId}#general-${'a'.repeat(64)}`;
  seed.generals[generalId] = { name: '新增武將', zi: '字', hao: '號', portraitRef: null,
    ability: { force: 1, lead: 2, politics: 3, siege: 4, field: 5, naval: 6 }, suicideOnCapture: true };
  store.ensureFromGame('tok', gameId, seed);
  const before = readData(gameId);
  const command = { op: 'general-settings', chapterId, generalId, values: { active: false, appearMonths: 12, joinFaction: null } };
  await fails(() => store.writeModule('tok', gameId, 'chapters', { edits: [{ ...command, values: { appearMonths: 12, joinFaction: null } }] }), 'COPY_GENERAL_ACTIVE_REQUIRED', 422);
  assert.deepEqual(readData(gameId), before);
  store.writeModule('tok', gameId, 'chapters', { edits: [command] });
  const after = readData(gameId), row = after.chapters[chapterId].state.generals.find(g => g.generalId === generalId);
  assert.equal(row.idx, 0); assert.equal(row.faction, null); assert.equal(row.attr, 0x10);
  assert.equal(row.active, false); assert.equal(row.appear_months, 12); assert.equal(row.name, '新增武將');
  assert.deepEqual(row.ability, seed.generals[generalId].ability);
  const expected = structuredClone(before); expected.chapters[chapterId].state.generals[0] = row;
  assert.deepEqual(after, expected, 'library, reserved slot and every other chapter unchanged');
  store.writeModule('tok', gameId, 'chapters', { edits: [{ ...command, values: { active: true, appearMonths: 0, joinFaction: null } }] });
  assert.equal(readData(gameId).chapters[chapterId].state.generals.filter(g => g.generalId === generalId).length, 1);
  const stable = store.read('tok', gameId);
  await fails(() => store.writeModule('tok', gameId, 'chapters', { edits: [command, { ...command, generalId: 'other-game#missing' }] }), 'COPY_GENERAL_REFERENCE', 422);
  assert.deepEqual(store.read('tok', gameId), stable, 'later failure rolls back the earlier active change');
  const full = readData(gameId);
  full.generals.second = { ...full.generals[generalId], name: '第二人' };
  full.chapters[chapterId].state.generals.forEach(g => { if (g.idx < 127) g.generalId ??= `occupied-${g.idx}`; });
  store.ensureFromGame('tok', gameId, full);
  const fullBefore = store.read('tok', gameId);
  await fails(() => store.writeModule('tok', gameId, 'chapters', { edits: [{ ...command, generalId: 'second' }] }), 'COPY_GENERAL_SLOTS_FULL', 422);
  assert.deepEqual(store.read('tok', gameId), fullBefore, 'reserved slot is never allocated');
});

test('CHAPTER-WB arrival countdown and intended faction stay independent of current affiliation', async () => {
  const gameId = fresh(), before = readData(gameId), state = before.chapters[FIRST].state;
  const general = state.generals.find(row => row.idx < 127 && !state.factions.some(faction => faction.monarch_idx === row.idx));
  const target = state.factions.find(faction => faction.monarch_idx !== null && faction.idx !== general.faction).idx;
  const command = (appearMonths, joinFaction, generalIdx = general.idx) => ({ op: 'general-arrival', chapterId: FIRST, generalIdx, values: { appearMonths, joinFaction } });
  for (const [months, join] of [[255, target], [1, null], [0, target]]) {
    store.writeModule('tok', gameId, 'chapters', { edits: [command(months, join)] });
    const expected = structuredClone(before), changed = expected.chapters[FIRST].state.generals.find(row => row.idx === general.idx);
    changed.appear_months = months; changed.join_faction = join;
    assert.deepEqual(readData(gameId), expected, 'only two fields change, including no active/F18/current faction mutation');
  }
  const beforeActive = readData(gameId);
  for (const active of [false, true, false]) {
    const edit = command(0, target); edit.values.active = active;
    store.writeModule('tok', gameId, 'chapters', { edits: [edit] });
    const expected = structuredClone(beforeActive), changed = expected.chapters[FIRST].state.generals.find(row => row.idx === general.idx);
    changed.attr = active ? changed.attr | 0x80 : changed.attr & 0x7f; changed.active = active;
    assert.deepEqual(readData(gameId), expected, 'active owns bit7 only; no removal, affiliation, countdown, join, counts or other chapter changes');
  }
  for (const active of [null, 0, 1, 'false']) {
    const saved = store.read('tok', gameId), edit = command(8, null); edit.values.active = active;
    assert.throws(() => store.writeModule('tok', gameId, 'chapters', { edits: [command(7, null), edit] }));
    assert.deepEqual(store.read('tok', gameId), saved);
  }
  for (const edit of [command(-1, null), command(256, null), command(0.5, null), command(0, 22), command(0, null, 127), command(0, null, state.factions[0].monarch_idx)]) {
    const saved = store.read('tok', gameId);
    assert.throws(() => store.writeModule('tok', gameId, 'chapters', { edits: [command(7, null), edit] }));
    assert.deepEqual(store.read('tok', gameId), saved, 'invalid second edit cannot save a prefix');
  }
});

test('CHAPTER-WB money is unscaled and reserve people quantize once in both raw mirrors', async () => {
  const gameId = fresh(), before = readData(gameId), slot = before.chapters[FIRST].state.factions[0].idx;
  const command = values => ({ op: 'resources-people', chapterId: FIRST, factionIdx: slot, values });
  for (const [people, stored] of [[0, 0], [9, 0], [10, 1], [127, 12], [65000, 6500]]) {
    const values = { money: people, reserve_cav: people, reserve_arc: people, reserve_inf: people };
    store.writeModule('tok', gameId, 'chapters', { edits: [command(values)] });
    const state = readData(gameId).chapters[FIRST].state, row = state.factions.find(f => f.idx === slot);
    const expected = { money: people, reserve_cav: stored, reserve_arc: stored, reserve_inf: stored };
    assert.deepEqual(readFactionResources(row.raw), expected);
    assert.deepEqual(readFactionResources(state.nativeFactionSlotRaw[slot]), expected);
    for (const [key, value] of Object.entries(expected)) assert.equal(row[key], value);
  }
  store.writeModule('tok', gameId, 'chapters', { edits: [command({ money: 650000 })] });
  const stable = store.read('tok', gameId), row = stable.data.chapters[FIRST].state.factions.find(f => f.idx === slot);
  assert.equal(row.money, 650000);
  assert.equal(row.reserve_cav, 6500, 'partial money write does not reconvert reserves');
  for (const values of [{ money: 650001 }, { reserve_cav: 65001 }, { reserve_arc: -1 },
    { reserve_inf: 1.5 }, { money: -0 }, { money: '127' }, { unknown: 1 }]) {
    await fails(() => store.writeModule('tok', gameId, 'chapters', { edits: [command({ money: 1 }), command(values)] }), 'COPY_CHAPTER', 422);
    assert.deepEqual(store.read('tok', gameId), stable);
  }
  for (const id of before.chapterOrder.filter(id => id !== FIRST)) assert.deepEqual(stable.data.chapters[id], before.chapters[id]);
  assert.deepEqual(stable.data.cities, before.cities);
  assert.deepEqual(stable.data.generals, before.generals);
});

test('CHAPTER-WB saved opening plans independently reach fresh engine state', async () => {
  const gameId = fresh(), before = readData(gameId), state = before.chapters[FIRST].state;
  const [a, b] = state.factions;
  const plans = [
    { trust: 23, tax: 18, conscription: [127, 0, 10], nextConscription: [20, 30, 40] },
    { trust: 192, tax: 21, conscription: [50, 60, 70], nextConscription: [80, 90, 100] },
  ];
  const command = (factionIdx, values) => ({ op: 'player-opening', chapterId: FIRST, factionIdx, values });
  store.writeModule('tok', gameId, 'chapters', { edits: [command(a.idx, plans[0]), command(b.idx, plans[1])] });
  const data = readData(gameId), expected = structuredClone(before);
  const base = { trust: state.trust, policyRaw: state.nativeMonthlyPolicyRaw };
  expected.chapters[FIRST].state.factions[0].playerOpening = encodePlayerOpening(base, plans[0]);
  expected.chapters[FIRST].state.factions[1].playerOpening = encodePlayerOpening(base, plans[1]);
  assert.deepEqual(data, expected, 'only two faction plans change; chapter header and all other data stay intact');
  const first = createNewGameScenario(data.chapters[FIRST].state, a.idx);
  const second = createNewGameScenario(data.chapters[FIRST].state, b.idx);
  initializeNativeMonthlyPolicy(first);
  initializeNativeMonthlyPolicy(second);
  assert.equal(first.trust, 23);
  assert.equal(second.trust, 192);
  assert.deepEqual(first.conscription, [120, 0, 10]);
  assert.deepEqual(second.conscription, [50, 60, 70]);
  const stable = store.read('tok', gameId);
  for (const invalid of [{ ...plans[0], trust: -1 }, { ...plans[0], conscription: [10001, 0, 0] },
    { trust: 0, policyRaw: state.nativeMonthlyPolicyRaw }, null]) {
    await fails(() => store.writeModule('tok', gameId, 'chapters', { edits: [command(a.idx, plans[1]), command(b.idx, invalid)] }), 'COPY_CHAPTER', 422);
    assert.deepEqual(store.read('tok', gameId), stable);
  }
  const corrupt = structuredClone(data);
  corrupt.chapters[FIRST].state.factions[0].playerOpening.policyRaw = '00';
  assert.throws(() => validateGameSource(corrupt, { draft: true }), TypeError);
});

test('CHAPTER-WB capital assignment owns only this chapter city and locks competing capitals', async () => {
  const gameId = fresh(), before = readData(gameId), state = before.chapters[FIRST].state;
  const faction = state.factions.find(f => f.monarch_idx !== null && f.capital !== null);
  const other = state.factions.find(f => f.idx !== faction.idx && f.capital !== null);
  const city = state.cities.find(c => c.faction !== faction.idx && !state.factions.some(f => f.capital === c.idx));
  assert.ok(city && other);
  const edit = { op: 'set-capital', chapterId: FIRST, factionIdx: faction.idx, cityIdx: city.idx };
  store.writeModule('tok', gameId, 'chapters', { edits: [edit] });
  const after = readData(gameId), current = after.chapters[FIRST].state;
  const changed = current.cities.find(c => c.idx === city.idx);
  assert.equal(changed.faction, faction.idx);
  assert.equal(Number.parseInt(changed.raw.slice(2, 4), 16), faction.idx);
  assert.equal(changed.raw.slice(0x1a * 2, 0x1b * 2), city.raw.slice(0x1a * 2, 0x1b * 2), 'old owner byte preserved');
  assert.equal(current.cities.find(c => c.idx === faction.capital).faction, state.cities.find(c => c.idx === faction.capital).faction);
  for (const f of current.factions.filter(f => f.idx === faction.idx || f.idx === city.faction)) {
    assert.equal(f.n_cities, current.cities.filter(c => c.faction === f.idx).length);
    assert.equal(Number.parseInt(f.raw.slice(0x23 * 2, 0x24 * 2), 16), f.n_cities);
    assert.equal(current.nativeFactionSlotRaw[f.idx], f.raw);
  }
  for (const id of before.chapterOrder.filter(id => id !== FIRST)) assert.deepEqual(after.chapters[id], before.chapters[id]);
  assert.deepEqual(after.cities, before.cities);
  assert.deepEqual(after.generals, before.generals);
  const stable = store.read('tok', gameId);
  for (const command of [
    { ...edit, cityIdx: other.capital },
    { op: 'city-faction', chapterId: FIRST, cityIdx: city.idx, factionId: null },
    { op: 'city-faction', chapterId: FIRST, cityIdx: city.idx, factionId: other.idx },
  ]) {
    await fails(() => store.writeModule('tok', gameId, 'chapters', { edits: [command] }), 'COPY_CHAPTER', 422);
    assert.deepEqual(store.read('tok', gameId), stable);
  }
});

test('CHAPTER-WB publication rejects inherited capital ownership and uniqueness gaps', async () => {
  for (const mode of ['ownership', 'duplicate']) {
    const gameId = fresh(), data = readData(gameId), state = data.chapters[FIRST].state;
    assert.ok(Object.hasOwn(state, '_src'), 'exercise the historical source exemption');
    const [first, second] = state.factions.filter(f => f.capital !== null);
    if (mode === 'ownership') setChapterCityFaction(data, FIRST, first.capital, null);
    else setFactionCapital(data, FIRST, first.idx, second.capital);
    store.ensureFromGame('tok', gameId, data);
    const before = readData(gameId);
    const result = await store.validateWhole('tok', gameId);
    assert.equal(result.state, 'failed');
    assert.ok(result.problems.some(p => p.code === 'CHAPTER_CAPITAL' && p.chapterId === FIRST));
    assert.ok(!result.ticket);
    assert.deepEqual(readData(gameId), before, 'validation never fixes the source implicitly');
  }
});

test('CHAPTER-WB source validation rejects corrupt explicit labels without migrating legacy sources', () => {
  const legacy = structuredClone(pinned), snapshot = structuredClone(legacy);
  validateGameSource(legacy, { draft: true });
  assert.deepEqual(legacy, snapshot);
  const [first, second] = legacy.chapterOrder;
  setChapterLabels(legacy, first, '甲', '首章');
  setChapterLabels(legacy, second, '乙', '次章');
  validateGameSource(legacy, { draft: true });
  for (const [field, invalid] of [['number', '甲'], ['name', '首章'], ['number', ' 乙 '], ['name', '一二三四五六七八九']]) {
    const broken = structuredClone(legacy);
    broken.chapters[second][field] = invalid;
    assert.throws(() => validateGameSource(broken, { draft: true }), RangeError);
  }
});

test('CHAPTER-WB labels normalize code points, keep identity and reject atomically', async () => {
  const gameId = fresh(), before = readData(gameId), second = before.chapterOrder[1];
  const labels = (chapterId, number, name) => ({ op: 'chapter-labels', chapterId, number, name });
  store.writeModule('tok', gameId, 'chapters', { edits: [labels(FIRST, '  卷e\u0301  ', '  新e\u0301章  ')] });
  const expected = structuredClone(before);
  expected.chapters[FIRST].number = '卷é';
  expected.chapters[FIRST].name = '新é章';
  assert.deepEqual(readData(gameId), expected, 'only labels change, not identities, order, source or chapter state');
  const stable = store.read('tok', gameId);
  await fails(() => store.writeModule('tok', gameId, 'chapters', { rename: { [second]: '新é章' } }), 'COPY_CHAPTER', 422);
  assert.deepEqual(store.read('tok', gameId), stable, 'legacy rename cannot collide with a labelled chapter');
  for (const edit of [
    labels(second, '卷e\u0301', '别章'), labels(second, '别卷', '新e\u0301章'),
    labels(second, ' ', '别章'), labels(second, '别卷', ' '),
    labels(second, '一二三四五六七', '别章'), labels(second, '别卷', '一二三四五六七八九'),
    labels(second, '\ud800', '别章'), labels(second, '别卷', '坏\u0000名'),
    labels('other-game#chapter', '别卷', '别章'),
    { ...labels(second, '别卷', '别章'), state: {} },
  ]) {
    await fails(() => store.writeModule('tok', gameId, 'chapters', { edits: [edit] }), 'COPY_CHAPTER', 422);
    assert.deepEqual(store.read('tok', gameId), stable, 'failure retains contents, digest and timestamps');
  }
  await fails(() => store.writeModule('tok', gameId, 'chapters', {
    edits: [labels(FIRST, '改卷', '改章'), labels(second, '改卷', '别章')],
  }), 'COPY_CHAPTER', 422);
  assert.deepEqual(store.read('tok', gameId), stable, 'batch failure does not write the first command');
  store.writeModule('tok', gameId, 'chapters', { edits: [labels(second, '😀'.repeat(6), '😀'.repeat(8))] });
  assert.equal(readData(gameId).chapters[second].name, '😀'.repeat(8));
  const otherGame = fresh();
  store.writeModule('tok', otherGame, 'chapters', { edits: [labels(FIRST, '卷é', '新é章')] });
  assert.equal(readData(otherGame).chapters[FIRST].number, '卷é', 'uniqueness is game-local');
});

test('CHAPTER-WB labelled creation and repeated copies keep independent unique labels', async () => {
  const gameId = fresh();
  const original = readData(gameId);
  store.writeModule('tok', gameId, 'chapters', { create: { number: ' 自由卷 ', name: ' 自由章 ' } });
  const created = readData(gameId), id = created.chapterOrder.at(-1);
  assert.equal(created.chapters[id].number, '自由卷');
  assert.equal(created.chapters[id].name, '自由章');
  for (let i = 0; i < 2; i += 1) store.writeModule('tok', gameId, 'chapters', { copy: { chapterId: id } });
  const copied = readData(gameId), copies = copied.chapterOrder.slice(-2).map(key => copied.chapters[key]);
  assert.deepEqual(copies.map(ch => ch.number), ['1', '2']);
  assert.deepEqual(copies.map(ch => ch.name), ['副本1', '副本2']);
  assert.deepEqual(copied.chapters[id], created.chapters[id]);
  for (const key of original.chapterOrder) assert.deepEqual(copied.chapters[key], original.chapters[key]);
  const stable = store.read('tok', gameId);
  await fails(() => store.writeModule('tok', gameId, 'chapters', { create: { number: '自由卷', name: '别章' } }), 'COPY_CHAPTER', 422);
  await fails(() => store.writeModule('tok', gameId, 'chapters', { create: { number: '别卷' } }), 'COPY_CHAPTER', 422);
  await fails(() => store.writeModule('tok', gameId, 'chapters', { rename: { [id]: '副本1' } }), 'COPY_CHAPTER', 422);
  await fails(() => store.writeModule('tok', gameId, 'chapters', { rename: { [id]: '一二三四五六七八九' } }), 'COPY_CHAPTER', 422);
  assert.deepEqual(store.read('tok', gameId), stable);
  store.writeModule('tok', gameId, 'chapters', { delete: { chapterId: copies[0].chapterId } });
  assert.deepEqual(readData(gameId).chapters[copies[1].chapterId], copies[1]);
  store.writeModule('tok', gameId, 'chapters', { copy: { chapterId: id } });
  assert.notEqual(readData(gameId).chapterOrder.at(-1), copies[0].chapterId, 'deleted identity is never reused');
  store.writeModule('tok', gameId, 'chapters', { delete: { chapterId: id } });
  await fails(() => store.writeModule('tok', gameId, 'chapters', { create: { number: '自由卷', name: '自由章', chapterId: id } }), 'COPY_CHAPTER', 422);
  store.writeModule('tok', gameId, 'chapters', { create: { number: '自由卷', name: '自由章' } });
  assert.notEqual(readData(gameId).chapterOrder.at(-1), id, 'identity is service-issued, not a supplied field');
});

test('create blank chapter with name+start, then copy and delete', async () => {
  const gameId = fresh();
  const before = readData(gameId).chapterOrder.length;
  const w = store.writeModule('tok', gameId, 'chapters', { create: { name: '新章', start: { era: 'ad', year: 190, month: 3, day: 5 } } });
  assert.match(w.copyDigest, /^[a-f0-9]{64}$/);
  const data = readData(gameId);
  assert.equal(data.chapterOrder.length, before + 1);
  const id = data.chapterOrder.at(-1);
  assert.equal(data.chapters[id].name, '新章');
  assert.deepEqual(data.chapters[id].state.start, { era: 'ad', year: 190, month: 3, day: 5 });
  const c = store.writeModule('tok', gameId, 'chapters', { copy: { chapterId: FIRST } });
  assert.notEqual(c.copyDigest, w.copyDigest);
  const data2 = readData(gameId);
  assert.equal(data2.chapterOrder.length, before + 2);
  const copyId = data2.chapterOrder.at(-1);
  assert.ok(data2.chapters[copyId].name.endsWith('（副本）'));
  store.writeModule('tok', gameId, 'chapters', { delete: { chapterId: copyId } });
  const data3 = readData(gameId);
  assert.equal(data3.chapterOrder.length, before + 1);
  assert.ok(!data3.chapters[copyId]);
  await fails(() => store.writeModule('tok', gameId, 'chapters', { copy: { chapterId: 'no-such' } }), 'COPY_CHAPTER', 422);
  await fails(() => store.writeModule('tok', gameId, 'chapters', { delete: { chapterId: 'no-such' } }), 'COPY_CHAPTER', 422);
});

test('create validation mirrors draft add-blank limits', async () => {
  const gameId = fresh();
  await fails(() => store.writeModule('tok', gameId, 'chapters', { create: { name: 'x', start: { year: 190, month: 13, day: 1 } } }), 'COPY_CHAPTER', 422);
  await fails(() => store.writeModule('tok', gameId, 'chapters', { create: { name: '一二三四五六七八九十一二三四五六七', start: { year: 190, month: 1, day: 1 } } }), 'COPY_CHAPTER', 422);
  await fails(() => store.writeModule('tok', gameId, 'chapters', {}), 'COPY_PATCH', 422);
  await fails(() => store.writeModule('tok', gameId, 'chapters', { create: { name: 'x', start: { year: 190, month: 1 } } }), 'COPY_CHAPTER', 422);
});

test('rename and setStart follow original helpers (partial merge, year<=9999)', async () => {
  const gameId = fresh();
  store.writeModule('tok', gameId, 'chapters', { rename: { [FIRST]: '改名章' } });
  assert.equal(readData(gameId).chapters[FIRST].name, '改名章');
  await fails(() => store.writeModule('tok', gameId, 'chapters', { rename: { [FIRST]: '一二三四五六七八九十一二三四五六七' } }), 'COPY_CHAPTER', 422);
  store.writeModule('tok', gameId, 'chapters', { setStart: { [FIRST]: { year: 185 } } });
  const start = readData(gameId).chapters[FIRST].state.start;
  assert.equal(start.year, 185);
  assert.equal(start.month, pinned.chapters[FIRST].state.start.month);
  await fails(() => store.writeModule('tok', gameId, 'chapters', { setStart: { [FIRST]: { year: 10000 } } }), 'COPY_CHAPTER', 422);
  await fails(() => store.writeModule('tok', gameId, 'chapters', { setStart: { [FIRST]: { era: 'xx' } } }), 'COPY_CHAPTER', 422);
});

test('setStart on a chapter without start stays rejected', async () => {
  const gameId = fresh();
  store.writeModule('tok', gameId, 'chapters', { create: { name: '無曆章' } });
  const id = readData(gameId).chapterOrder.at(-1);
  await fails(() => store.writeModule('tok', gameId, 'chapters', { setStart: { [id]: { year: 200 } } }), 'COPY_CHAPTER', 422);
});

test('faction resources write through the original hex writer', async () => {
  const gameId = fresh();
  const slot = readData(gameId).chapters[FIRST].state.factions[0].idx;
  store.writeModule('tok', gameId, 'chapters', { resources: { [FIRST]: { [slot]: { money: 74001, reserve_cav: 401 } } } });
  const faction = readData(gameId).chapters[FIRST].state.factions.find(f => f.idx === slot);
  assert.equal(faction.money, 74001);
  assert.equal(faction.reserve_cav, 401);
  await fails(() => store.writeModule('tok', gameId, 'chapters', { resources: { [FIRST]: { [slot]: { reserve_cav: 70000 } } } }), 'COPY_CHAPTER', 422);
  await fails(() => store.writeModule('tok', gameId, 'chapters', { resources: { [FIRST]: { 22: { money: 1 } } } }), 'COPY_CHAPTER', 422);
  await fails(() => store.writeModule('tok', gameId, 'chapters', { resources: { 'no-such': { 0: { money: 1 } } } }), 'COPY_CHAPTER', 422);
});

test('chapter edits: city numbers, faction, capital, governor, diplomat', async () => {
  const gameId = fresh();
  const st = readData(gameId).chapters[FIRST].state;
  const city0 = st.cities.find(c => c.faction === 0 && !st.factions.some(f => f.idx !== 0 && f.capital === c.idx));
  const neutralized = st.cities.find(c => c.idx !== city0.idx && !st.factions.some(f => f.capital === c.idx));
  const occupied = new Set();
  for (const f of st.factions) for (const k of ['monarch_idx', 'advisor_idx', 'diplomat_idx']) if (f[k] !== null && f[k] !== undefined) occupied.add(f[k]);
  for (const c of st.cities) if (c.governor !== null && c.governor !== undefined) occupied.add(c.governor);
  const free = g => g.idx < 127 && !occupied.has(g.idx);
  const gov = st.generals.find(g => g.faction === city0.faction && g.active === true && free(g));
  assert.ok(gov, 'need an active post-free general in the city faction');
  const diplo = st.generals.find(g => g.faction === 0 && free(g) && g.idx !== gov.idx);
  assert.ok(diplo, 'need a post-free general in faction 0');
  const mover = st.generals.find(g => free(g) && g.faction !== 0 && g.faction !== null);
  assert.ok(mover, 'need a post-free general outside faction 0');
  store.writeModule('tok', gameId, 'chapters', { edits: [
    { op: 'city-native', chapterId: FIRST, cityIdx: city0.idx, values: { troops: city0.troops + 1 } },
    { op: 'set-capital', chapterId: FIRST, factionIdx: 0, cityIdx: city0.idx },
    { op: 'general-faction', chapterId: FIRST, generalIdx: mover.idx, factionId: 0 },
    { op: 'set-diplomat', chapterId: FIRST, factionIdx: 0, generalIdx: diplo.idx },
    { op: 'city-governor', chapterId: FIRST, cityIdx: city0.idx, generalIdx: gov.idx },
    { op: 'city-faction', chapterId: FIRST, cityIdx: neutralized.idx, factionId: null },
  ]});
  const after = readData(gameId).chapters[FIRST].state;
  assert.equal(after.cities.find(c => c.idx === city0.idx).troops, city0.troops + 1);
  assert.equal(after.factions.find(f => f.idx === 0).capital, city0.idx);
  assert.equal(after.generals.find(g => g.idx === mover.idx).faction, 0);
  assert.equal(after.factions.find(f => f.idx === 0).diplomat_idx, diplo.idx);
  assert.equal(after.cities.find(c => c.idx === city0.idx).governor, gov.idx);
  assert.equal(after.cities.find(c => c.idx === neutralized.idx).faction, null);
});
test('chapter edits reject malformed ops and apply atomically', async () => {
  const gameId = fresh();
  const before = readData(gameId);
  await fails(() => store.writeModule('tok', gameId, 'chapters', { edits: [{ op: 'bogus', chapterId: FIRST }] }), 'COPY_CHAPTER', 422);
  await fails(() => store.writeModule('tok', gameId, 'chapters', { edits: [] }), 'COPY_CHAPTER', 422);
  await fails(() => store.writeModule('tok', gameId, 'chapters', { edits: [{ op: 'city-native', chapterId: FIRST, cityIdx: -1, values: { troops: 1 } }] }), 'COPY_CHAPTER', 422);
  await fails(() => store.writeModule('tok', gameId, 'chapters', { edits: [{ op: 'city-faction', chapterId: FIRST, cityIdx: 0, factionId: 256 }] }), 'COPY_CHAPTER', 422);
  await fails(() => store.writeModule('tok', gameId, 'chapters', { edits: [{ op: 'set-diplomat', chapterId: FIRST, factionIdx: 0, generalIdx: 128 }] }), 'COPY_CHAPTER', 422);
  await fails(() => store.writeModule('tok', gameId, 'chapters', { edits: [{ op: 'city-governor', chapterId: FIRST, cityIdx: 0, generalIdx: 1, extra: 1 }] }), 'COPY_CHAPTER', 422);
  await fails(() => store.writeModule('tok', gameId, 'chapters', { rename: { [FIRST]: '不应留' }, edits: [{ op: 'bogus', chapterId: FIRST }] }), 'COPY_CHAPTER', 422);
  assert.deepEqual(readData(gameId), before);
});
test('chapter edits: rename-general and portrait write through original helpers', async () => {
  const gameId = fresh();
  const st = readData(gameId).chapters[FIRST].state;
  const target = st.generals.find(g => g.idx < 127);
  assert.ok(target);
  store.writeModule('tok', gameId, 'chapters', { edits: [{ op: 'rename-general', chapterId: FIRST, generalIdx: target.idx, values: { name: '改名測', hao: '字測' } }] });
  const renamed = readData(gameId).chapters[FIRST].state.generals.find(g => g.idx === target.idx);
  assert.equal(renamed.name, '改名測');
  assert.equal(renamed.hao, '字測');
  store.writeModule('tok', gameId, 'chapters', { edits: [{ op: 'portrait', chapterId: FIRST, generalIdx: target.idx, portraitKey: 'p7' }] });
  assert.equal(readData(gameId).chapters[FIRST].state.generals.find(g => g.idx === target.idx).portraitKey, 'p7');
  store.writeModule('tok', gameId, 'chapters', { edits: [{ op: 'portrait', chapterId: FIRST, generalIdx: target.idx, portraitKey: null }] });
  assert.ok(!('portraitKey' in readData(gameId).chapters[FIRST].state.generals.find(g => g.idx === target.idx)));
  await fails(() => store.writeModule('tok', gameId, 'chapters', { edits: [{ op: 'rename-general', chapterId: FIRST, generalIdx: target.idx, values: { name: 'x', ability: 1 } }] }), 'COPY_CHAPTER', 422);
  await fails(() => store.writeModule('tok', gameId, 'chapters', { edits: [{ op: 'rename-general', chapterId: FIRST, generalIdx: 128, values: { name: 'x' } }] }), 'COPY_CHAPTER', 422);
  await fails(() => store.writeModule('tok', gameId, 'chapters', { edits: [{ op: 'portrait', chapterId: FIRST, generalIdx: target.idx, portraitKey: 123 }] }), 'COPY_CHAPTER', 422);
  await fails(() => store.writeModule('tok', gameId, 'chapters', { edits: [{ op: 'portrait', chapterId: FIRST, generalIdx: target.idx, portraitKey: 'bad key!' }] }), 'COPY_CHAPTER', 422);
});
test('chapter edits: strategist/monarch posts and succession', async () => {
  const gameId = fresh();
  const st = readData(gameId).chapters[FIRST].state;
  const occupied = new Set();
  for (const f of st.factions) for (const k of ['monarch_idx', 'advisor_idx', 'diplomat_idx']) if (f[k] !== null && f[k] !== undefined) occupied.add(f[k]);
  for (const c of st.cities) if (c.governor !== null && c.governor !== undefined) occupied.add(c.governor);
  const free = g => g.idx < 127 && !occupied.has(g.idx);
  const incomer = st.generals.find(g => free(g) && g.faction !== 2 && g.faction !== null && g.appear_months === 0 && g.status !== 4 && g.captive_flag !== 0);
  assert.ok(incomer, 'need a post-free active general to move into faction 2');
  const available = g => free(g) && g.faction === null;
  const lord = st.generals.find(available);
  assert.ok(lord, 'need a post-free free general for monarch');
  const heir = st.generals.find(g => available(g) && g.idx !== lord.idx);
  assert.ok(heir, 'need a second post-free free general for succession');
  const linked = readData(gameId);
  [lord, heir].forEach((g, i) => {
    const id = `${gameId}#general-${String(i + 1).repeat(64)}`;
    linked.generals[id] = { name: g.name, hao: g.hao, portraitRef: null, ability: g.ability, suicideOnCapture: false };
    Object.assign(linked.chapters[FIRST].state.generals[g.idx], { generalId: id, status: 0, captive_flag: 255, appear_months: 0, attr: (g.attr | 128) & 191, active: true });
  });
  store.ensureFromGame('tok', gameId, linked);
  store.writeModule('tok', gameId, 'chapters', { edits: [
    { op: 'general-faction', chapterId: FIRST, generalIdx: incomer.idx, factionId: 2 },
    { op: 'set-strategist', chapterId: FIRST, factionIdx: 2, generalIdx: incomer.idx },
    { op: 'set-monarch', chapterId: FIRST, factionIdx: 3, generalIdx: lord.idx },
  ]});
  const mid = readData(gameId).chapters[FIRST].state;
  assert.equal(mid.factions.find(f => f.idx === 2).advisor_idx, incomer.idx);
  assert.equal(mid.factions.find(f => f.idx === 3).monarch_idx, lord.idx);
  assert.equal(mid.generals.find(g => g.idx === lord.idx).faction, 3);
  store.writeModule('tok', gameId, 'chapters', { edits: [
    { op: 'remove-monarch', chapterId: FIRST, factionIdx: 0, resolution: { successor: heir.idx } },
    { op: 'set-strategist', chapterId: FIRST, factionIdx: 2, generalIdx: null },
  ]});
  const after = readData(gameId).chapters[FIRST].state;
  assert.equal(after.factions.find(f => f.idx === 0).monarch_idx, heir.idx);
  assert.equal(after.generals.find(g => g.idx === heir.idx).faction, 0);
  assert.equal(after.factions.find(f => f.idx === 2).advisor_idx, null);
  assert.ok(after.factions.some(f => f.idx === 15), 'succession does not remove another faction');
  await fails(() => store.writeModule('tok', gameId, 'chapters', { edits: [{ op: 'set-monarch', chapterId: FIRST, factionIdx: 22, generalIdx: lord.idx }] }), 'COPY_CHAPTER', 422);
  await fails(() => store.writeModule('tok', gameId, 'chapters', { edits: [{ op: 'set-strategist', chapterId: FIRST, factionIdx: 2, generalIdx: 128 }] }), 'COPY_CHAPTER', 422);
  await fails(() => store.writeModule('tok', gameId, 'chapters', { edits: [{ op: 'remove-monarch', chapterId: FIRST, factionIdx: 0, resolution: 'x' }] }), 'COPY_CHAPTER', 422);
  await fails(() => store.writeModule('tok', gameId, 'chapters', { edits: [{ op: 'disband-faction', chapterId: FIRST, factionIdx: 15, confirm: false }] }), 'COPY_CHAPTER', 422);
  await fails(() => store.writeModule('tok', gameId, 'chapters', { edits: [{ op: 'disband-faction', chapterId: FIRST, factionIdx: 99, confirm: true }] }), 'COPY_CHAPTER', 422);
});
test('CHAPTER-WB author retirement retains fixed slots and clears ordinary relations without changing another chapter', () => {
  const source = pinned.chapters[FIRST].state;
  for (const slot of [0, Math.floor(source.factions.length / 2), source.factions.length - 1]) {
    const game = structuredClone(pinned), state = game.chapters[FIRST].state;
    initializeChapterFactionIdentities(game.chapters[FIRST]);
    const pending = state.generals.find(g => g.idx < 127 && g.faction !== slot);
    pending.join_faction = slot;
    const observer = state.factions.find(row => row.idx !== slot);
    observer.target_faction = slot;
    observer.raw = observer.raw.slice(0, 0x19 * 2) + slot.toString(16).padStart(2, '0') + observer.raw.slice(0x1a * 2);
    state.nativeFactionSlotRaw[observer.idx] = observer.raw;
    const before = structuredClone(game), beforeState = before.chapters[FIRST].state;
    const baseline = structuredClone(beforeState); initializeNativeFactionSlots(baseline);
    const beforeAlive = countNativeAliveFactions(baseline), wasActive = Boolean(beforeState.factions[slot].attr & 0x80);
    retireChapterFaction(game, FIRST, slot);
    assert.throws(() => retireChapterFaction(game, FIRST, slot), /retired faction/);
    assert.equal(state.factions.length, beforeState.factions.length);
    assert.equal(state.n_factions, beforeState.n_factions, 'declaration width is preserved, not repurposed as live count');
    assert.deepEqual(state.factions.map(f => f.idx), beforeState.factions.map(f => f.idx));
    const retired = state.factions[slot];
    assert.equal(retired.retired, true); assert.equal(retired.active, false); assert.equal(retired.monarch, '');
    assert.equal(retired.factionId, beforeState.factions[slot].factionId);
    assert.equal(retired.number, beforeState.factions[slot].number);
    assert.equal(retired.monarch_idx, 255); assert.equal(retired.capital, null); assert.equal(retired.advisor_idx, null);
    assert.equal(retired.money, 0); assert.equal(retired.nativeGeneralCount, 0); assert.equal(retired.n_cities, 0);
    assert.equal(observer.target_faction, null);
    assert.equal(observer.raw.slice(0x19 * 2, 0x1a * 2), 'ff');
    assert.equal(state.nativeFactionSlotRaw[observer.idx], observer.raw);
    assert.ok(state.generals.every(g => g.faction !== slot && g.join_faction !== slot));
    assert.ok(state.cities.every(c => c.faction !== slot));
    beforeState.cities.filter(c => c.faction === slot).forEach(city => {
      assert.equal(state.nativeCityRecordRaw[city.idx].slice(2, 4), '18');
      assert.equal(state.nativeCityRecordRaw[city.idx].slice(0x1a * 2, 0x1b * 2), beforeState.nativeCityRecordRaw[city.idx].slice(0x1a * 2, 0x1b * 2));
    });
    assert.equal(state.nativeDiplomacyRaw, beforeState.nativeDiplomacyRaw, 'inactive cells and physical aliases are not replaced with invented defaults');
    assert.deepEqual(state.diplomacy, beforeState.diplomacy);
    assert.equal(state.nativeStrategicEventRaw, beforeState.nativeStrategicEventRaw);
    assert.deepEqual(factionNativeConsistencyGaps(state, FIRST), []);
    validateGameSource(game);
    const installed = structuredClone(state); initializeNativeFactionSlots(installed);
    assert.equal(countNativeAliveFactions(installed), beforeAlive - Number(wasActive));
    const restored = JSON.parse(JSON.stringify(installed)); rebindNativeFactionViews(restored);
    assert.equal(countNativeAliveFactions(restored), beforeAlive - Number(wasActive));
    assert.equal(restored.factions[slot], restored.nativeFactionSlots.records[slot]);
    assert.deepEqual(game.generals, before.generals); assert.deepEqual(game.cities, before.cities);
    game.chapterOrder.filter(id => id !== FIRST).forEach(id => assert.deepEqual(game.chapters[id], before.chapters[id]));
  }
});

test('CHAPTER-WB author retirement reports unresolved references before writing and validates retired declarations', () => {
  const mutations = [
    [state => { state.legions = [{ faction: 0, generalIdx: state.factions[0].monarch_idx }]; }, /legion records/],
    [state => { state.nativeStrategicEventRaw = '01000000' + state.nativeStrategicEventRaw.slice(8); }, /event 0 type 1/],
    [state => { state.generals.find(g => g.faction === 0).status = 2; }, /status 2/],
    [state => { state.generals.find(g => g.faction !== 0).captive_flag = 0; }, /captive faction 0/],
    [state => { state.factions[0].diplomat_idx = 1; }, /has diplomat 1/],
    [state => { state.generals[127].join_faction = 0; }, /reserved general 127/],
  ];
  for (const [mutate, message] of mutations) {
    const game = structuredClone(pinned); mutate(game.chapters[FIRST].state);
    const before = JSON.stringify(game);
    assert.throws(() => retireChapterFaction(game, FIRST, 0), message);
    assert.equal(JSON.stringify(game), before, 'conflict preflight changes no source data');
  }
  for (const mutate of [
    state => { state.factions[0].active = true; },
    state => { state.factions[0].attr = '0'; },
    state => { state.factions[0].attr = -1; },
    state => { state.factions[0].capital = 0; },
    state => { state.factions[1].target_faction = 0; },
    state => { state.generals[0].origFaction = 0; },
    state => { state.generals[0].join_faction = 0; },
    state => { state.cities[0].faction = 0; },
  ]) {
    const game = structuredClone(pinned); retireChapterFaction(game, FIRST, 0); mutate(game.chapters[FIRST].state);
    assert.throws(() => validateGameSource(game, { mode: 'draft' }), /retired slot retains/);
  }
});

test('CHAPTER-WB retirement conflicts are specific and atomic at first, middle and last slots', async () => {
  const gameId = fresh(), original = readData(gameId), state = original.chapters[FIRST].state;
  const pendingEvent = structuredClone(original);
  pendingEvent.chapters[FIRST].state.nativeStrategicEventRaw = '01000000' + state.nativeStrategicEventRaw.slice(8);
  store.ensureFromGame('tok', gameId, pendingEvent);
  assert.equal(store.validateWhole('tok', gameId).state, 'passed');
  const before = store.read('tok', gameId);
  const sqlBefore = storage.sql.exec('SELECT * FROM game_copies WHERE game_id=?', gameId).toArray();
  for (const factionIdx of [0, Math.floor(state.factions.length / 2), state.factions.length - 1]) {
    const legacy = structuredClone(original);
    disbandFaction(legacy, FIRST, factionIdx);
    const damaged = legacy.chapters[FIRST].state;
    assert.equal(damaged.nativeFactionSlotRaw[factionIdx], state.nativeFactionSlotRaw[factionIdx], 'legacy deletion leaves the retired native slot unchanged');
    assert.ok(factionNativeConsistencyGaps(damaged, FIRST).length > 0, 'even tail deletion leaves a stale declared count');
    if (factionIdx < state.factions.length - 1) assert.throws(() => initializeNativeFactionSlots(damaged), /Invalid declared faction slot/);
    for (const edit of [
      { op: 'disband-faction', chapterId: FIRST, factionIdx, confirm: true },
      { op: 'remove-monarch', chapterId: FIRST, factionIdx, resolution: { disband: true } },
    ]) {
      assert.throws(() => store.writeModule('tok', gameId, 'chapters', { edits: [
        { op: 'resources-people', chapterId: FIRST, factionIdx: 0, values: { money: 73 } }, edit,
      ] }), error => error.status === 422 && error.code === 'COPY_CHAPTER_RETIREMENT_CONFLICT' && /event 0 type 1/.test(error.detail));
      assert.deepEqual(store.read('tok', gameId), before, 'all chapters/master data and the validation ticket remain intact');
      assert.deepEqual(storage.sql.exec('SELECT * FROM game_copies WHERE game_id=?', gameId).toArray(), sqlBefore, 'no earlier resource write, timestamp, digest or ticket invalidation is persisted');
    }
  }
});

test('CHAPTER-WB current copy retires first, middle and last slots through both commands and rejects new references', async () => {
  const gameId = fresh(), original = readData(gameId), state = original.chapters[FIRST].state;
  for (const factionIdx of [0, Math.floor(state.factions.length / 2), state.factions.length - 1]) {
    for (const edit of [
      { op: 'disband-faction', chapterId: FIRST, factionIdx, confirm: true },
      { op: 'remove-monarch', chapterId: FIRST, factionIdx, resolution: { disband: true } },
    ]) {
      store.ensureFromGame('tok', gameId, original);
      const expected = structuredClone(original); retireChapterFaction(expected, FIRST, factionIdx);
      store.writeModule('tok', gameId, 'chapters', { edits: [edit] });
      assert.deepEqual(readData(gameId), expected, 'command uses fixed-slot author retirement, without changing master data or other chapters');
      const validation = store.validateWhole('tok', gameId);
      assert.equal(validation.state, 'passed', JSON.stringify(validation));
      if (factionIdx !== 0 || edit.op !== 'disband-faction') continue;
      const generalIdx = state.factions[0].monarch_idx, cityIdx = state.factions[0].capital;
      const before = store.read('tok', gameId), sqlBefore = storage.sql.exec('SELECT * FROM game_copies WHERE game_id=?', gameId).toArray();
      const rejected = [
        { op: 'resources-people', chapterId: FIRST, factionIdx: 0, values: { money: 1 } },
        { op: 'player-opening', chapterId: FIRST, factionIdx: 0, values: { trust: 255, tax: 18, conscription: [0, 0, 0], nextConscription: [0, 0, 0] } },
        { op: 'set-capital', chapterId: FIRST, factionIdx: 0, cityIdx },
        { op: 'set-strategist', chapterId: FIRST, factionIdx: 0, generalIdx: null },
        { op: 'set-diplomat', chapterId: FIRST, factionIdx: 0, generalIdx: null },
        { op: 'city-faction', chapterId: FIRST, cityIdx, factionId: 0 },
        { op: 'general-faction', chapterId: FIRST, generalIdx, factionId: 0 },
        { op: 'general-arrival', chapterId: FIRST, generalIdx, values: { appearMonths: 0, joinFaction: 0 } },
      ].map(command => ({ edits: [command] }));
      rejected.push({ resources: { [FIRST]: { 0: { money: 1 } } } });
      for (const patch of rejected) {
        await assert.rejects(async () => store.writeModule('tok', gameId, 'chapters', {
          ...patch, edits: [{ op: 'resources-people', chapterId: FIRST, factionIdx: 1, values: { money: 73 } }, ...(patch.edits ?? [])],
        }), { code: 'COPY_CHAPTER', status: 422 }, JSON.stringify(patch));
        assert.deepEqual(store.read('tok', gameId), before, 'failed reference does not save the earlier resource edit');
        assert.deepEqual(storage.sql.exec('SELECT * FROM game_copies WHERE game_id=?', gameId).toArray(), sqlBefore, 'digest, timestamp and validation ticket remain unchanged');
      }
    }
  }
});

test('chapter capture and writes share one transaction; late SQL failure rolls back', () => {
  const gameId = fresh();
  let depth = 0;
  const captures = [];
  const observed = {
    sql: { exec(query, ...args) {
      if (query === 'SELECT * FROM game_copies WHERE game_id=?') captures.push(depth);
      return storage.sql.exec(query, ...args);
    } },
    transactionSync(fn) {
      return storage.transactionSync(() => {
        depth++;
        try { return fn(); } finally { depth--; }
      });
    },
  };
  const transactional = new GameCopyStore({ storage: observed, principal: () => actor, games });
  transactional.writeModule('tok', gameId, 'chapters', { rename: { [FIRST]: '事务章' } });
  assert.ok(captures.length > 0);
  assert.ok(captures.every(value => value > 0), 'capture must occur inside the write transaction');
  const before = store.read('tok', gameId);
  const slots = storage.sql.exec('SELECT * FROM publish_slots WHERE game_id=?', gameId).toArray();
  // Force the final ticket invalidation to execute after the copy UPDATE.
  storage.sql.exec("UPDATE publish_slots SET state='ready' WHERE game_id=?", gameId);
  storage.sql.exec(`CREATE TEMP TRIGGER chapter_write_failure BEFORE UPDATE ON publish_slots
    BEGIN SELECT RAISE(ABORT, 'chapter write rollback probe'); END`);
  try {
    assert.throws(() => transactional.writeModule('tok', gameId, 'chapters', { rename: { [FIRST]: '不应保存' } }), /chapter write rollback probe/);
    assert.deepEqual(store.read('tok', gameId), before);
    assert.equal(storage.sql.exec('SELECT state FROM publish_slots WHERE game_id=?', gameId).toArray()[0].state, 'ready');
  } finally {
    storage.sql.exec('DROP TRIGGER chapter_write_failure');
    storage.sql.exec('UPDATE publish_slots SET state=? WHERE game_id=?', slots[0].state, gameId);
  }
});
test('deleting first, middle or last chapter preserves other chapters, shared tables and publication', () => {
  for (const position of [0, Math.floor(pinned.chapterOrder.length / 2), pinned.chapterOrder.length - 1]) {
    const gameId = fresh();
    const before = readData(gameId);
    const chapterId = before.chapterOrder[position];
    store.writeModule('tok', gameId, 'chapters', { delete: { chapterId } });
    const expected = structuredClone(before);
    delete expected.chapters[chapterId];
    expected.chapterOrder.splice(position, 1);
    assert.deepEqual(readData(gameId), expected, 'only the requested chapter and its order entry may change');
    assert.equal(store.validateWhole('tok', gameId).state, 'passed');
  }
});
test('last chapter can be deleted and saved, but the empty game cannot get a publication ticket', () => {
  const gameId = fresh();
  // Isolated one-chapter fixture; no mutation of the loaded source or another game.
  const single = readData(gameId);
  single.chapters = { [FIRST]: single.chapters[FIRST] };
  single.chapterOrder = [FIRST];
  store.ensureFromGame('tok', gameId, single);
  store.writeModule('tok', gameId, 'chapters', { delete: { chapterId: FIRST } });
  assert.deepEqual(readData(gameId).chapterOrder, []);
  assert.deepEqual(readData(gameId).chapters, {});
  const validation = store.validateWhole('tok', gameId);
  assert.equal(validation.state, 'failed');
  assert.equal(validation.ticket, null);
  assert.ok(validation.problems.some(problem => /at least one chapter/.test(problem.detail)));
  assert.deepEqual(pinned.chapterOrder.includes(FIRST), true);
});
test('publication consumes chapter reference report problems rather than obsolete DTO fields', () => {
  const gameId = fresh();
  const data = readData(gameId);
  const chapterId = data.chapterOrder.at(-1);
  data.chapters[chapterId].people ??= {};
  data.chapters[chapterId].people['missing-general'] = { included: true, factionId: null, overrides: {} };
  store.ensureFromGame('tok', gameId, data);
  const result = store.validateWhole('tok', gameId);
  assert.equal(result.state, 'failed');
  assert.equal(result.ticket, null);
  const problem = result.problems.find(row => row.chapterId === chapterId && row.code === 'CHAPTER_REFERENCE');
  assert.ok(problem);
  assert.match(problem.detail, /CHAPTER_GENERAL_MISSING/);
});
test('rename-only change keeps the publish gate green', async () => {
  const gameId = fresh();
  store.writeModule('tok', gameId, 'chapters', { rename: { [FIRST]: '門禁章' } });
  const v = store.validateWhole('tok', gameId);
  assert.equal(v.state, 'passed');
});
