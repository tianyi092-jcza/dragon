// F3b 章節屬性頁：loadCopy 建 attributes 投影 + 七 op/setStart 走 chapters 模組。
// UI-controller checks only；傳輸/後端鑑權另測。
// 用法：node --test tools/verify_copy_controller_chapters.mjs（cwd=web-port）
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { CHAPTER_BASE } from '../web/src/content/authoring/chapterbase.generated.js';

const { installDraftEditor } = await import(`data:text/javascript;base64,${Buffer.from(await readFile(new URL('../server/public/draft.txt', import.meta.url))).toString('base64')}`);
const gameId = '11111111-1111-4111-8111-111111111111';
const DIGEST_A = 'a'.repeat(64);
const state = () => ({
  name: '第一章', start: { year: 184, month: 1, day: 1 },
  factions: [{ idx: 0, money: 100, reserve_cav: 1, reserve_arc: 2, reserve_inf: 3, monarch_idx: 0, advisor_idx: null, diplomat_idx: 1, capital: 0 }],
  generals: [{ idx: 0, name: '丁', hao: '字', faction: 0 }, { idx: 1, name: '丙', hao: '', faction: 0 }, { idx: 2, name: '戊', hao: '', faction: 0 }, { idx: 127, name: '留', hao: '', faction: null }],
  cities: [{ idx: 0, name: '城甲', faction: 0, governor: 1, troops: 10, prod: 20, troops_cap: 100, max_prod: 50, growth: 3, defence: 4 }, { idx: 1, name: '城乙', faction: 0, governor: null, troops: 5, prod: 6, troops_cap: 60, max_prod: 30, growth: 1, defence: 2 }],
});
const copyData = (over = {}) => ({
  metadata: { name: '測名', introduction: '介' },
  chapterOrder: ['ch1'],
  chapters: { ch1: { chapterId: 'ch1', state: state() } },
  cities: { c1: { name: '洛陽', max_prod: 1, prod: 1, growth: 1, defence: 1, troops: 1, type: 0, view: 0 } },
  ...over,
});

function harness({ confirmReply = true } = {}) {
  let identity = { user: { id: 'author', mustChangePassword: false }, csrf: 'token' }, busy = false, model;
  const calls = [], errors = [], confirmations = [];
  let response = null;
  const h = { calls, errors, confirmations, response: handler => { response = handler; }, model: () => model };
  const controller = installDraftEditor({
    api: async (path, body) => { calls.push({ path, body }); if (response) return response(path, body); if (path === '/api/games') return { games: [{ gameId, draftRevision: '1', metadata: { name: '舊', introduction: '稿' } }] }; throw new Error('unexpected api: ' + path); },
    authority: () => identity, isBusy: () => busy,
    publish: value => { model = value; },
    work: async fn => { if (busy) return; busy = true; try { return await fn(); } catch (error) { errors.push(error); } finally { busy = false; controller.render(); } },
    storage: { getItem: () => undefined, setItem: () => {}, removeItem: () => {} },
    confirm: text => { confirmations.push(text); return confirmReply; }, prompt: () => null,
  });
  controller.setIdentity(identity);
  return { ...h, controller, actions: controller.actions, setIdentity(value) { identity = value; controller.setIdentity(value); } };
}
const selectGame = async h => { await h.actions.refresh(); h.actions.chooseGame(gameId); };
const loadOk = h => { h.response(path => { if (path === `/api/games/${gameId}/copy`) return { gameId, copyDigest: DIGEST_A, updatedAt: null, data: copyData() }; throw new Error('unexpected api: ' + path); }); };
const posts = h => h.calls.filter(c => c.path === `/api/games/${gameId}/copy` && c.body !== undefined).map(c => c.body);

test('native membership outside the declared list resolves its lord without remapping or creating factions', async () => {
  const h = harness(); await selectGame(h);
  const data = copyData(), source = data.chapters.ch1.state;
  source.generals[0].name = '董卓'; source.generals[2].faction = 17;
  source.nativeFactionSlotRaw = CHAPTER_BASE.factionSlots.map((raw, slot) => slot === 17 ? '8000' + raw.slice(4) : raw);
  const original = JSON.stringify(data);
  h.response(() => ({ gameId, copyDigest: DIGEST_A, data }));
  await h.actions.loadCopy();
  const chapter = h.model().copy.page.attributes.chapters[0];
  assert.equal(chapter.generals[2].unlistedFactionName, '董卓');
  assert.equal(chapter.generals[2].factionSlot, 17); assert.equal(chapter.factions.length, 1);
  assert.equal(JSON.stringify(data), original); assert.equal(posts(h).length, 0);
  for (const raw of ['broken', '0000' + source.nativeFactionSlotRaw[17].slice(4), '807f' + source.nativeFactionSlotRaw[17].slice(4)]) {
    source.nativeFactionSlotRaw[17] = raw; await h.actions.loadCopy();
    assert.equal(h.model().copy.page.attributes.chapters[0].generals[2].unlistedFactionName, undefined);
    assert.equal(h.model().copy.page.attributes.chapters[0].generals[2].factionSlot, 17);
  }
  assert.equal(posts(h).length, 0); assert.deepEqual(h.errors, []);
});

test('CHAPTER-WB diplomacy selection writes immediately, rereads, and preserves old values on failure', async () => {
  const h = harness({ confirmReply: false }); await selectGame(h);
  const data = copyData(), source = data.chapters.ch1.state;
  source.factions.push({ ...source.factions[0], idx: 1, monarch_idx: 2, diplomat_idx: null, capital: 1 });
  source.nativeDiplomacyRaw = CHAPTER_BASE.nativeDiplomacyRaw;
  source.diplomacy = [[255, 183], [183, 255]];
  h.response((path, body) => {
    if (body) {
      assert.deepEqual(body, { module: 'chapters', patch: { edits: [{ op: 'diplomacy', chapterId: 'ch1', actorIdx: 0, targetIdx: 1, relation: 'good' }] } });
      source.nativeDiplomacyRaw = source.nativeDiplomacyRaw.slice(0, 2) + 'cc' + source.nativeDiplomacyRaw.slice(4);
      source.diplomacy[0][1] = 204;
    }
    return { gameId, copyDigest: DIGEST_A, data };
  });
  await h.actions.loadCopy();
  assert.deepEqual(h.model().copy.page.attributes.chapters[0].diplomacy, [[255, 183], [183, 255]]);
  await h.actions.copyDiplomacy('ch1', 0, 1, 'good');
  assert.equal(posts(h).length, 1); assert.deepEqual(h.confirmations, [], 'single-cell selection does not open a confirmation dialog');
  assert.deepEqual(h.model().copy.page.attributes.chapters[0].diplomacy, [[255, 204], [183, 255]]);
  for (const args of [[0, 0, 'good'], [0, 21, 'good'], [0, 1, 'war']]) await assert.rejects(() => h.actions.copyDiplomacy('ch1', ...args));
  assert.equal(posts(h).length, 1);
  h.response(() => { throw new Error('fixture-diplomacy-denied'); });
  await h.actions.copyDiplomacy('ch1', 0, 1, 'worst');
  assert.equal(posts(h).length, 2);
  assert.deepEqual(h.model().copy.page.attributes.chapters[0].diplomacy, [[255, 204], [183, 255]]);
  assert.match(h.model().message, /fixture-diplomacy-denied/);
});

test('CHAPTER-WB create faction submits lord and capital atomically and rejects unavailable candidates', async () => {
  const h = harness(); await selectGame(h);
  const generalId = gameId + '#general-' + 'e'.repeat(64), data = copyData();
  data.generals = { [generalId]: { name: '新君', portraitRef: null, ability: null } };
  Object.assign(data.chapters.ch1.state.generals[2], { generalId, faction: null, attr: 128, appear_months: 0, status: 0, captive_flag: 255 });
  h.response(() => ({ gameId, copyDigest: DIGEST_A, data })); await h.actions.loadCopy();
  assert.equal(h.model().copy.page.attributes.chapters[0].generals[2].monarchEligible, true);
  await assert.rejects(() => h.actions.createCopyFaction('ch1', 0, 1));
  await assert.rejects(() => h.actions.createCopyFaction('ch1', 2, 0));
  assert.equal(posts(h).length, 0);
  await h.actions.createCopyFaction('ch1', 2, 1);
  assert.deepEqual(posts(h), [{ module: 'chapters', patch: { edits: [{ op: 'create-faction', chapterId: 'ch1', monarchIdx: 2, cityIdx: 1 }] } }]);
});

test('CHAPTER-WB visible faction number is independent of its native slot and reading does not migrate legacy data', async () => {
  const h = harness(); await selectGame(h);
  const data = copyData(), before = structuredClone(data);
  h.response(() => ({ gameId, copyDigest: DIGEST_A, data })); await h.actions.loadCopy();
  assert.equal(h.model().copy.page.attributes.chapters[0].factions[0].number, 1);
  assert.deepEqual(data, before); assert.equal(posts(h).length, 0);
  Object.assign(data.chapters.ch1.state.factions[0], { number: 8, factionId: 'ch1#faction-8' });
  data.chapters.ch1.nextFactionNumber = 9;
  await h.actions.loadCopy();
  const faction = h.model().copy.page.attributes.chapters[0].factions[0];
  assert.equal(faction.slot, 0); assert.equal(faction.number, 8); assert.equal(faction.factionId, 'ch1#faction-8');
  assert.equal(posts(h).length, 0);
});

test('CHAPTER-WB retired slots are hidden without renumbering or reopening allocated capacity', async () => {
  const h = harness(); await selectGame(h);
  const data = copyData(), source = data.chapters.ch1.state, live = { ...source.factions[0], idx: 1, number: 89, factionId: 'ch1#faction-89', monarch_idx: 1, diplomat_idx: null, capital: 1 };
  source.factions = Array.from({ length: 22 }, (_, idx) => idx === 1 ? live : {
    idx, number: idx + 1, factionId: `ch1#faction-${idx + 1}`, retired: true, attr: 0, active: false,
    monarch_idx: 255, monarch: '', advisor_idx: null, diplomat_idx: null, capital: null,
    money: 0, reserve_cav: 0, reserve_arc: 0, reserve_inf: 0,
  });
  source.generals.forEach(general => { general.faction = general.idx === 1 ? 1 : null; });
  const generalId = gameId + '#general-' + 'f'.repeat(64);
  data.generals = { [generalId]: { name: '可任用', portraitRef: null, ability: null } };
  Object.assign(source.generals[2], { generalId, attr: 128, appear_months: 0, status: 0, captive_flag: 255 });
  source.cities.forEach(city => { city.faction = city.idx === 1 ? 1 : null; city.governor = null; });
  const before = JSON.stringify(data);
  h.response(() => ({ gameId, copyDigest: DIGEST_A, data })); await h.actions.loadCopy();
  assert.deepEqual(h.errors, []);
  const chapter = h.model().copy.page.attributes.chapters[0];
  assert.equal(chapter.allocatedFactionSlots, 22);
  assert.deepEqual(chapter.factions.map(row => [row.slot, row.number, row.factionId]), [[1, 89, 'ch1#faction-89']]);
  assert.deepEqual(chapter.generals[0].posts, []);
  await assert.rejects(() => h.actions.createCopyFaction('ch1', 2, 0), /22.*已退役槽不復用/);
  assert.equal(posts(h).length, 0); assert.equal(JSON.stringify(data), before);
  for (const patch of [{ retired: false }, { active: true }, { monarch_idx: 0 }, { money: 1 }, { idx: 1 }]) {
    const invalid = JSON.parse(before); Object.assign(invalid.chapters.ch1.state.factions[0], patch);
    h.response(() => ({ gameId, copyDigest: DIGEST_A, data: invalid }));
    const count = h.errors.length; await h.actions.loadCopy();
    assert.equal(h.errors.length, count + 1, JSON.stringify(patch));
    assert.match(h.errors.at(-1).message, /副本勢力/);
    assert.equal(posts(h).length, 0);
  }
});

test('CHAPTER-WB unassigned library member is read-only until explicit chapter settings save', async () => {
  const h = harness(); await selectGame(h);
  const generalId = gameId + '#general-' + 'd'.repeat(64), data = copyData({ generals: {} });
  data.generals[generalId] = { name: '未配置人物', zi: '', hao: '', portraitRef: null, ability: null, suicideOnCapture: false };
  const before = structuredClone(data);
  h.response(() => ({ gameId, copyDigest: DIGEST_A, data })); await h.actions.loadCopy();
  assert.equal(h.model().copy.page.generals[0].generalId, generalId);
  assert.equal(h.model().copy.page.attributes.chapters[0].generals.some(row => row.generalId === generalId), false);
  assert.equal(posts(h).length, 0); assert.deepEqual(data, before);
  const values = { active: false, appearMonths: 8, joinFaction: null };
  await h.actions.saveCopyGeneralSettings('ch1', generalId, values);
  assert.deepEqual(posts(h), [{ module: 'chapters', patch: { edits: [{ op: 'general-settings', chapterId: 'ch1', generalId, values }] } }]);
  await assert.rejects(() => h.actions.saveCopyGeneralSettings('ch1', 'other#missing', values));
  assert.equal(posts(h).length, 1);
});

test('CHAPTER-WB chapter roster inherits displayed master attributes by stable identity without rewriting chapter state', async () => {
  const h = harness(); await selectGame(h);
  const id = gameId + '#general-' + 'c'.repeat(64), data = copyData();
  const definition = { name: '主表名', zi: '主表字', hao: '主表號', portraitRef: { assetId: '620', sha256: 'e'.repeat(64) }, suicideOnCapture: true, ability: { force: 1, lead: 2, politics: 3, siege: 4, field: 5, naval: 6 } };
  data.generals = { [id]: definition };
  Object.assign(data.chapters.ch1.state.generals[2], { generalId: id, attr: 128, ability: { force: 9, lead: 9, politics: 9, siege: 9, field: 9, naval: 9 } });
  const before = structuredClone(data);
  h.response(() => ({ gameId, copyDigest: DIGEST_A, data })); await h.actions.loadCopy();
  const row = h.model().copy.page.attributes.chapters[0].generals[2];
  for (const key of ['name', 'zi', 'hao', 'portraitRef', 'ability', 'suicideOnCapture']) assert.deepEqual(row[key], definition[key]);
  assert.equal(row.active, true); assert.equal(row.factionSlot, 0);
  assert.deepEqual(data, before); assert.equal(posts(h).length, 0);
});

test('CHAPTER-WB strategist candidates preserve unknown eligibility and use exact appointment commands', async () => {
  const h = harness(); await selectGame(h);
  const data = copyData(), general = data.chapters.ch1.state.generals[2];
  h.response(() => ({ gameId, copyDigest: DIGEST_A, data }));
  await h.actions.loadCopy();
  assert.equal(h.model().copy.page.attributes.chapters[0].generals[2].strategistEligible, false);
  for (const [months, status, captive, eligible] of [[0, 0, 255, true], [1, 0, 255, false], [0, 4, 255, false], [0, 0, 0, false]]) {
    Object.assign(general, { appear_months: months, status, captive_flag: captive }); await h.actions.loadCopy();
    assert.equal(h.model().copy.page.attributes.chapters[0].generals[2].strategistEligible, eligible);
  }
  Object.assign(general, { appear_months: 0, status: 0, captive_flag: 255 }); await h.actions.loadCopy();
  assert.equal(await h.actions.copyStrategist('ch1', 0, 2), true);
  assert.deepEqual(posts(h).at(-1).patch.edits, [{ op: 'set-strategist', chapterId: 'ch1', factionIdx: 0, generalIdx: 2 }]);
  data.chapters.ch1.state.factions[0].advisor_idx = 2; await h.actions.loadCopy();
  assert.equal(await h.actions.copyClearStrategist('ch1', 0), true);
  assert.deepEqual(posts(h).at(-1).patch.edits, [{ op: 'set-strategist', chapterId: 'ch1', factionIdx: 0, generalIdx: null }]);
});

test('CHAPTER-WB arrival projection preserves absent values and submits independent fields', async () => {
  const h = harness(); await selectGame(h);
  const data = copyData(); Object.assign(data.chapters.ch1.state.generals[2], { appear_months: 9, join_faction: null });
  h.response(() => ({ gameId, copyDigest: DIGEST_A, data })); await h.actions.loadCopy();
  const rows = h.model().copy.page.attributes.chapters[0].generals;
  assert.equal(rows[1].arrival, null, 'missing source fields are not fabricated');
  assert.deepEqual(rows[2].arrival, { appearMonths: 9, joinFaction: null });
  const values = { appearMonths: 3, joinFaction: 0 };
  assert.equal(await h.actions.saveCopyGeneralArrival('ch1', 2, values), true);
  assert.deepEqual(posts(h)[0].patch.edits, [{ op: 'general-arrival', chapterId: 'ch1', generalIdx: 2, values }]);
  for (const idx of [0, 127, 99]) await assert.rejects(() => h.actions.saveCopyGeneralArrival('ch1', idx, values));
  assert.equal(posts(h).length, 1);
  assert.equal(await h.actions.saveCopyGeneralArrival('ch1', 2, { ...values, factionId: null }), true);
  assert.deepEqual(posts(h)[1].patch.edits, [
    { op: 'general-arrival', chapterId: 'ch1', generalIdx: 2, values },
    { op: 'general-faction', chapterId: 'ch1', generalIdx: 2, factionId: null },
  ], 'legacy unlinked general uses one atomic chapter batch');
  assert.equal(await h.actions.saveCopyGeneralArrival('ch1', 2, { ...values, factionId: 0 }), true);
  assert.deepEqual(posts(h)[2].patch.edits, [{ op: 'general-arrival', chapterId: 'ch1', generalIdx: 2, values }], 'unchanged membership is not rewritten');
});

test('CHAPTER-WB local Vue input participates in the shared leave and unload guard', async () => {
  const h = harness({ confirmReply: false }); await selectGame(h); loadOk(h); await h.actions.loadCopy();
  assert.equal(h.controller.canLeave(true), true);
  h.actions.setChapterInputDirty(true);
  assert.equal(h.controller.canLeave(true), false);
  assert.equal(h.confirmations.length, 0, 'unload does not run a custom confirmation');
  assert.equal(h.controller.canLeave(), false);
  assert.equal(h.confirmations.length, 1);
  assert.throws(() => h.actions.setChapterInputDirty('true'));
  h.actions.setChapterInputDirty(false);
  assert.equal(h.controller.canLeave(), true);
});

test('CHAPTER-WB labels use chapter identity fields, normalize and re-read without touching state name', async () => {
  const h = harness(); await selectGame(h);
  const data = copyData(); data.chapters.ch1.number = '甲'; data.chapters.ch1.name = '新章';
  h.response((_path, body) => {
    if (body) Object.assign(data.chapters.ch1, { number: body.patch.edits[0].number, name: body.patch.edits[0].name });
    return { gameId, copyDigest: DIGEST_A, data };
  });
  await h.actions.loadCopy();
  assert.equal(h.model().copy.page.attributes.chapters[0].name, '新章');
  assert.equal(h.model().copy.page.attributes.chapters[0].number, '甲');
  assert.equal(await h.actions.saveCopyChapterLabels('ch1', ' 乙 ', ' e\u0301 '), true);
  assert.deepEqual(posts(h), [{ module: 'chapters', patch: { edits: [{ op: 'chapter-labels', chapterId: 'ch1', number: '乙', name: 'é' }] } }]);
  assert.equal(h.model().copy.page.attributes.chapters[0].name, 'é');
  assert.equal(data.chapters.ch1.state.name, '第一章');
  for (const [number, name] of [['', '章'], ['一二三四五六七', '章'], ['甲', '一二三四五六七八九']])
    await assert.rejects(() => h.actions.saveCopyChapterLabels('ch1', number, name));
  assert.equal(posts(h).length, 1);
  const cancelled = harness({ confirmReply: false }); await selectGame(cancelled); loadOk(cancelled); await cancelled.actions.loadCopy();
  assert.equal(await cancelled.actions.saveCopyChapterLabels('ch1', '甲', '章'), false);
  assert.deepEqual(posts(cancelled), []);
  await cancelled.actions.copyChapter('delete', 'ch1');
  assert.match(cancelled.confirmations.at(-1), /1 個勢力、4 筆武將槽設定、2 筆據點設定/);
  assert.deepEqual(posts(cancelled), []);
});

test('CHAPTER-WB creates from zero chapters, selects the re-read identity and rejects invalid inputs', async () => {
  const h = harness(); await selectGame(h);
  const data = copyData({ chapterOrder: [], chapters: {} });
  let rejectWrite = false;
  h.response((_path, body) => {
    if (body) {
      if (rejectWrite) throw new Error('duplicate chapter number');
      data.chapterOrder.push('new-id');
      data.chapters['new-id'] = { ...body.patch.create, chapterId: 'new-id', state: state() };
    }
    return { gameId, copyDigest: DIGEST_A, data };
  });
  await h.actions.loadCopy();
  const inputs = { number: ' 甲 ', name: ' 新章 ', era: 'bc', year: '1', month: '12', day: '31' };
  for (const bad of [{ number: '' }, { year: '0' }, { era: 'invalid' }, { month: '13' }])
    await assert.rejects(() => h.actions.createNumberedCopyChapter({ ...inputs, ...bad }));
  assert.equal(posts(h).length, 0);
  assert.equal(await h.actions.createNumberedCopyChapter(inputs), true);
  assert.equal(h.model().fields.chapterId, 'new-id');
  assert.deepEqual(posts(h)[0], { module: 'chapters', patch: { create: { number: '甲', name: '新章', start: { era: 'bc', year: 1, month: 12, day: 31 } } } });
  assert.equal(h.model().copy.page.attributes.chapters[0].number, '甲');
  rejectWrite = true;
  const before = JSON.stringify(data);
  await h.actions.createNumberedCopyChapter(inputs);
  assert.equal(JSON.stringify(data), before);
  assert.equal(h.errors.length, 1);
});

test('CHAPTER-WB opening projection displays people while command preserves the exact input', async () => {
  const h = harness(); await selectGame(h);
  const data = copyData();
  data.chapters.ch1.state.trust = 73;
  data.chapters.ch1.state.nativeMonthlyPolicyRaw = '12000c00000000001700010002000300';
  h.response(() => ({ gameId, copyDigest: DIGEST_A, data }));
  await h.actions.loadCopy();
  assert.deepEqual(h.model().copy.page.attributes.chapters[0].factions[0].opening, { trust: 255, tax: 18, conscription: [120, 0, 0], nextConscription: [10, 20, 30] });
  assert.equal(data.chapters.ch1.state.trust, 73, 'preview does not migrate the legacy header');
  assert.equal(data.chapters.ch1.state.factions[0].playerOpening, undefined);
  assert.equal(posts(h).length, 0);
  data.chapters.ch1.state.factions[0].playerOpening = { trust: 73, policyRaw: data.chapters.ch1.state.nativeMonthlyPolicyRaw };
  await h.actions.loadCopy();
  assert.equal(h.model().copy.page.attributes.chapters[0].factions[0].opening.trust, 73, 'explicit plans, including converted native headers, retain their own trust');
  const values = { trust: 12, tax: 20, conscription: [127, 9, 10], nextConscription: [0, 10000, 127] };
  assert.equal(await h.actions.saveCopyPlayerOpening('ch1', 0, values), true);
  assert.deepEqual(posts(h)[0], { module: 'chapters', patch: { edits: [{ op: 'player-opening', chapterId: 'ch1', factionIdx: 0, values }] } });
  await assert.rejects(() => h.actions.saveCopyPlayerOpening('ch1', 2, values));
  assert.equal(posts(h).length, 1);
});

test('CHAPTER-WB resource view uses people and money is not scaled; partial writes retain input units', async () => {
  const h = harness(); await selectGame(h); loadOk(h); await h.actions.loadCopy();
  assert.deepEqual(h.model().copy.page.attributes.chapters[0].factions[0].resourcePeople, { money: 100, reserve_cav: 10, reserve_arc: 20, reserve_inf: 30 });
  const values = { money: 650000, reserve_cav: 127 };
  assert.equal(await h.actions.saveCopyResourcePeople('ch1', 0, values), true);
  assert.deepEqual(posts(h)[0], { module: 'chapters', patch: { edits: [{ op: 'resources-people', chapterId: 'ch1', factionIdx: 0, values }] } });
  await assert.rejects(() => h.actions.saveCopyResourcePeople('ch1', 2, values));
  assert.equal(posts(h).length, 1);
});

test('CHAPTER-WB chapter cities expose shared read-only attributes and retain slot 192 without changing chapter values', async () => {
  const data = copyData(), st = data.chapters.ch1.state, baseCity = st.cities[1];
  st.cities = Array.from({ length: 193 }, (_, idx) => ({ ...baseCity, idx, name: '章城' + idx }));
  st.factions[0].capital = 192;
  data.cities.extended = { name: '主表新城', runtimeSlot: 192, x: 383, y: 255, type: 3, view: 217, max_prod: 4321, prod: 999, growth: 99, defence: 99, troops: 99 };
  data.cities.unbound = { name: '未綁定', runtimeSlot: null, x: null, y: null };
  const before = JSON.stringify(data), h = harness(); await selectGame(h);
  h.response(() => ({ gameId, copyDigest: DIGEST_A, data })); await h.actions.loadCopy();
  assert.deepEqual(h.errors, []);
  const rows = h.model().copy.page.attributes.chapters[0].cities;
  assert.equal(rows.length, 193);
  assert.equal(h.model().copy.page.attributes.chapters[0].factions[0].capital, 192);
  assert.deepEqual(rows[192], { idx: 192, name: '主表新城', x: 383, y: 255, type: 3, view: 217, maxProd: 4321,
    prod: baseCity.prod, troops: baseCity.troops, troopsCap: baseCity.troops_cap, growth: baseCity.growth, defence: baseCity.defence, faction: baseCity.faction, governor: baseCity.governor });
  assert.equal(JSON.stringify(data), before); assert.deepEqual(posts(h), []);
  const full = structuredClone(data), fullHarness = harness();
  full.chapters.ch1.state.cities = Array.from({ length: 512 }, (_, idx) => ({ ...baseCity, idx, name: '章城' + idx }));
  full.cities.extended.runtimeSlot = 511;
  full.chapters.ch1.state.factions[0].capital = 511;
  await selectGame(fullHarness); fullHarness.response(() => ({ gameId, copyDigest: DIGEST_A, data: full })); await fullHarness.actions.loadCopy();
  assert.deepEqual(fullHarness.errors, []);
  const fullRows = fullHarness.model().copy.page.attributes.chapters[0].cities;
  assert.equal(fullRows.length, 512); assert.equal(fullRows[511].name, '主表新城');
  assert.equal(fullHarness.model().copy.page.attributes.chapters[0].factions[0].capital, 511);
  assert.deepEqual(posts(fullHarness), []);
  for (const mutate of [value => { value.chapters.ch1.state.cities[192].idx = 512; },
    value => { value.cities.extended.runtimeSlot = 512; },
    value => { value.chapters.ch1.state.factions[0].capital = 512; },
    value => { value.cities.extended.x = 384; }, value => { value.cities.extended.y = 256; },
    value => { value.cities.duplicate = { ...value.cities.extended }; }]) {
    const bad = structuredClone(data); mutate(bad);
    const rejected = harness(); await selectGame(rejected);
    rejected.response(() => ({ gameId, copyDigest: DIGEST_A, data: bad })); await rejected.actions.loadCopy();
    assert.equal(rejected.errors.length, 1); assert.deepEqual(posts(rejected), []);
  }
});

test('CHAPTER-WB save and post-save read failures replace stale success without claiming rollback', async () => {
  for (const phase of ['save', 'reload']) {
    const h = harness(); await selectGame(h); loadOk(h); await h.actions.loadCopy();
    const before = structuredClone(h.model().copy.page.attributes);
    h.response((path, body) => {
      assert.equal(path, `/api/games/${gameId}/copy`);
      if (body && phase === 'reload') return { gameId, copyDigest: 'b'.repeat(64) };
      throw new Error('fixture-' + phase + '-failure');
    });
    await h.actions.copyCityFaction('ch1', 1, null);
    assert.equal(posts(h).length, 1, 'no automatic retry');
    assert.equal(h.errors.length, 1);
    assert.match(h.model().message, new RegExp('fixture-' + phase + '-failure'));
    assert.match(h.model().message, /目前顯示上次已讀資料/);
    assert.doesNotMatch(h.model().message, /已保存並重讀/);
    if (phase === 'reload') assert.match(h.model().message, /保存可能已生效/);
    assert.deepEqual(h.model().copy.page.attributes, before, 'failed response does not invent confirmed chapter values');
  }
});

test('CHAPTER-WB late load/save/reload success or rejection cannot overwrite a replacement session', async () => {
  for (const phase of ['load', 'missing', 'ensure', 'save', 'reload']) for (const outcome of ['success', 'rejection']) {
    const h = harness(); await selectGame(h); loadOk(h); await h.actions.loadCopy();
    const entered = Promise.withResolvers(), pending = Promise.withResolvers();
    h.response((path, body) => {
      if (phase === 'ensure') {
        if (path === `/api/games/${gameId}/copy`) throw Object.assign(new Error('missing copy'), { code: 'COPY_NOT_FOUND' });
        assert.equal(path, `/api/games/${gameId}/copy/ensure`); assert.deepEqual(body, {});
      } else assert.equal(path, `/api/games/${gameId}/copy`);
      if (body && phase === 'reload') return { gameId, copyDigest: 'b'.repeat(64) };
      entered.resolve(); return pending.promise;
    });
    const loading = ['load', 'missing', 'ensure'].includes(phase);
    const saving = loading ? h.actions.loadCopy() : h.actions.copyCityFaction('ch1', 1, null);
    await entered.promise;
    h.setIdentity({ user: { id: 'replacement', mustChangePassword: false }, csrf: 'replacement-token' });
    const message = h.model().message, page = structuredClone(h.model().copy.page);
    const callCount = h.calls.length;
    if (outcome === 'rejection') pending.reject(Object.assign(new Error('old-session-' + phase), phase === 'missing' ? { code: 'COPY_NOT_FOUND' } : {}));
    else {
      const data = copyData(); data.metadata.name = '過期回應'; data.chapters.ch1.state.cities[1].faction = null;
      pending.resolve(phase === 'save' ? { gameId, copyDigest: 'b'.repeat(64) } : { gameId, copyDigest: 'b'.repeat(64), data });
    }
    await saving;
    assert.equal(h.model().message, message);
    assert.deepEqual(h.model().copy.page, page);
    assert.deepEqual(h.errors, [], 'obsolete response is not surfaced in the replacement session');
    assert.equal(posts(h).length, loading ? 0 : 1);
    assert.equal(h.calls.filter(call => call.body !== undefined).length, phase === 'ensure' || !loading ? 1 : 0);
    assert.equal(h.calls.length, callCount, 'obsolete success must not launch another read or write');
  }
});

test('loadCopy builds the chapter attributes projection with posts', async () => {
  const h = harness(); await selectGame(h); loadOk(h);
  await h.actions.loadCopy();
  const attrs = h.model().copy.page.attributes;
  assert.ok(attrs);
  assert.equal(attrs.known, true);
  assert.equal(attrs.chapters.length, 1);
  const ch = attrs.chapters[0];
  assert.equal(ch.startMissing, false);
  assert.equal(ch.startDirty, false);
  assert.deepEqual(ch.start, { era: 'ad', year: '184', month: '1', day: '1' });
  assert.deepEqual(ch.factions, [{ slot: 0, number: 1, factionId: null, monarchSlot: 0, advisorSlot: null, diplomatSlot: 1, capital: 0, opening: null, resourcePeople: { money: 100, reserve_cav: 10, reserve_arc: 20, reserve_inf: 30 } }]);
  assert.deepEqual(ch.generals.map(g => [g.slot, g.name, g.factionSlot, g.reserved, g.posts]), [[0, '丁', 0, false, ['君主']], [1, '丙', 0, false, ['外交官']], [2, '戊', 0, false, []], [127, '留', null, true, []]]);
  assert.deepEqual(ch.cities[0], { idx: 0, name: '城甲', x: null, y: null, type: null, view: null, faction: 0, governor: 1, troops: 10, prod: 20, troopsCap: 100, maxProd: 50, growth: 3, defence: 4 });
  assert.equal(h.errors.length, 0);
});

test('loadCopy rejects malformed chapter attributes without claiming success', async () => {
  const bads = [
    () => { const s = state(); delete s.generals; return s; },
    () => { const s = state(); s.generals = [{ idx: 128, name: 'x', hao: '', faction: null }]; return s; },
    () => { const s = state(); s.cities = [{ idx: 0, name: 'x', faction: 256 }]; return s; },
    () => { const s = state(); s.factions = [{ idx: 0, money: 0, reserve_cav: 0, reserve_arc: 0, reserve_inf: 0, monarch_idx: 128 }]; return s; },
  ];
  for (const make of bads) {
    const h = harness(); await selectGame(h);
    h.response(() => ({ gameId, copyDigest: DIGEST_A, data: copyData({ chapters: { ch1: { chapterId: 'ch1', state: make() } } }) }));
    await h.actions.loadCopy();
    assert.equal(h.model().copy.page, null);
    assert.equal(h.errors.length, 1);
  }
});

test('staged start input posts setStart, clears, and re-reads', async () => {
  const h = harness(); await selectGame(h); loadOk(h);
  await h.actions.loadCopy();
  h.actions.setCopyStartInput('ch1', 'year', '185');
  assert.equal(h.model().copy.page.attributes.chapters[0].startDirty, true);
  assert.equal(h.model().copy.page.attributes.chapters[0].start.year, '185');
  assert.equal(h.model().copy.page.dirty, true);
  const sent = await h.actions.saveCopyChapterStart('ch1');
  assert.equal(sent, true);
  assert.deepEqual(posts(h), [{ module: 'chapters', patch: { setStart: { ch1: { year: 185 } } } }]);
  assert.equal(h.model().copy.page.attributes.chapters[0].startDirty, false);
  assert.equal(h.errors.length, 0);
});

test('cancelCopyStartInput and cancelCopyEdits drop staged start text', async () => {
  const h = harness(); await selectGame(h); loadOk(h);
  await h.actions.loadCopy();
  h.actions.setCopyStartInput('ch1', 'year', 'nope');
  h.actions.cancelCopyStartInput('ch1');
  assert.equal(h.model().copy.page.attributes.chapters[0].startDirty, false);
  h.actions.setCopyStartInput('ch1', 'year', '186');
  assert.equal(h.controller.actions.cancelCopyEdits(), true);
  assert.equal(h.model().copy.page.attributes.chapters[0].startDirty, false);
  assert.equal(h.errors.length, 0);
});

test('chapter edits post exact single-op bodies and re-read', async () => {
  const h = harness(); await selectGame(h); loadOk(h);
  await h.actions.loadCopy();
  await h.actions.copyCityFaction('ch1', 0, null);
  await h.actions.copyCapital('ch1', 0, 1);
  await h.actions.copyDiplomat('ch1', 0, null);
  await h.actions.copyGeneralFaction('ch1', 2, null);
  await h.actions.copyGovernor('ch1', 0, null);
  await h.actions.copyCityNumbers('ch1', 0, { troops: 11, prod: 21 });
  assert.deepEqual(posts(h), [
    { module: 'chapters', patch: { edits: [{ op: 'city-faction', chapterId: 'ch1', cityIdx: 0, factionId: null }] } },
    { module: 'chapters', patch: { edits: [{ op: 'set-capital', chapterId: 'ch1', factionIdx: 0, cityIdx: 1 }] } },
    { module: 'chapters', patch: { edits: [{ op: 'set-diplomat', chapterId: 'ch1', factionIdx: 0, generalIdx: null }] } },
    { module: 'chapters', patch: { edits: [{ op: 'general-faction', chapterId: 'ch1', generalIdx: 2, factionId: null }] } },
    { module: 'chapters', patch: { edits: [{ op: 'city-governor', chapterId: 'ch1', cityIdx: 0, generalIdx: null }] } },
    { module: 'chapters', patch: { edits: [{ op: 'city-native', chapterId: 'ch1', cityIdx: 0, values: { troops: 11, prod: 21 } }] } },
  ]);
  assert.equal(h.calls.filter(c => c.path === `/api/games/${gameId}/copy` && c.body === undefined).length, 7);
  assert.equal(h.errors.length, 0);
});

test('local guards reject without sending: posts, membership, caps of prompt', async () => {
  const h = harness(); await selectGame(h); loadOk(h);
  await h.actions.loadCopy();
  const base = h.calls.length;
  for (const call of [
    () => h.actions.copyGeneralFaction('ch1', 0, 1), // 君主未清空职务
    () => h.actions.copyGovernor('ch1', 0, 127), // 保留槽不能任太守
    () => h.actions.copyDiplomat('ch1', 0, 0), // 君主兼任外交官被拦
    () => h.actions.copyCityFaction('ch1', 0, 9), // 未宣告势力槽
    () => h.actions.copyCityNumbers('ch1', 0, { troops: -1 }),
    () => h.actions.copyCityNumbers('ch1', 0, { bogus: 1 }),
  ]) await assert.rejects(call(), /.*/);
  assert.equal(h.calls.length, base);
  assert.equal(h.model().copy.page.attributes.chapters[0].cities[0].faction, 0);
  // 无变更短路：同值不送。
  assert.equal(await h.actions.copyCityFaction('ch1', 0, 0), false);
  assert.equal(await h.actions.copyGovernor('ch1', 0, 1), false);
  assert.equal(h.calls.length, base);
});
