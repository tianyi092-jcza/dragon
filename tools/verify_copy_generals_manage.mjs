// 游戏级武将库（父表）copy 页：库行投影 + generalCopySave 走 generals 模块。
// UI-controller checks only；传输/后端鉴权另测。
// 用法：node --test tools/verify_copy_generals_manage.mjs（cwd=web-port）
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { GameCopyStore } from '../server/gamecopy.js';
import { KAO_MANIFEST } from '../web/kao/manifest.js';
import { applyGeneralDefinitionEdit, applyChapterPersonEdit } from '../web/src/content/authoring/generaldefinitions.js';
import { assignGeneralToChapterState } from '../web/src/content/authoring/gamesource.js';
import { emptyGeneralSlot } from '../web/src/content/authoring/chaptermaterialize.js';
import { openStorage } from '../vps/sqlite-port.mjs';

const { installDraftEditor } = await import(`data:text/javascript;base64,${Buffer.from(await readFile(new URL('../server/public/draft.txt', import.meta.url))).toString('base64')}`);
const gameId = '11111111-1111-4111-8111-111111111111';
const DIGEST_A = 'a'.repeat(64);
const G1 = `${gameId}#general-${'c'.repeat(64)}`, G2 = `${gameId}#general-${'d'.repeat(64)}`;
const SHA = 'e'.repeat(64);
const abilityFull = () => ({ siege: 8, field: 9, naval: 10, force: 11, lead: 12, politics: 13 });
const generals = () => ({
  [G1]: { name: '丁', zi: '孔明', hao: '卧龍', portraitRef: { assetId: 'p7', sha256: SHA }, suicideOnCapture: true, ability: abilityFull() },
  [G2]: { name: '丙', zi: '', hao: '', portraitRef: null, suicideOnCapture: false, ability: null },
});
const copyData = (over = {}) => ({
  metadata: { name: '測名', introduction: '介' },
  chapterOrder: ['ch1'],
  chapters: { ch1: { chapterId: 'ch1', state: {
    name: '第一章', start: { year: 184, month: 1, day: 1 },
    factions: [{ idx: 0, money: 100, reserve_cav: 1, reserve_arc: 2, reserve_inf: 3, monarch_idx: 0, advisor_idx: null, diplomat_idx: 1, capital: 0 }],
    generals: [{ idx: 0, name: '丁', hao: '字', faction: 0 }],
    cities: [{ idx: 0, name: '城甲', faction: 0, governor: 1, troops: 10, prod: 20, troops_cap: 100, max_prod: 50, growth: 3, defence: 4 }],
  } } },
  cities: {},
  generals: generals(),
  ...over,
});

function harness() {
  let identity = { user: { id: 'author', mustChangePassword: false }, csrf: 'token' }, busy = false, model;
  const calls = [], errors = [], workOptions = [], progress = [];
  let response = null;
  const h = { calls, errors, workOptions, progress, response: handler => { response = handler; }, model: () => model };
  const controller = installDraftEditor({
    api: async (path, body, options) => { calls.push({ path, body, options }); if (response) return response(path, body); if (path === '/api/games') return { games: [{ gameId, draftRevision: '1', metadata: { name: '舊', introduction: '稿' } }] }; throw new Error('unexpected api: ' + path); },
    authority: () => identity, isBusy: () => busy,
    publish: value => { model = value; if (value.copy?.page?.import) progress.push(structuredClone(value.copy.page.import)); },
    work: async (fn, options) => { if (busy) return; workOptions.push(options); busy = true; try { return await fn(); } catch (error) { errors.push(error); } finally { busy = false; controller.render(); } },
    storage: { getItem: () => undefined, setItem: () => {}, removeItem: () => {} },
    confirm: () => true, prompt: () => null,
  });
  controller.setIdentity(identity);
  return { ...h, controller, actions: controller.actions };
}
const selectGame = async h => { await h.actions.refresh(); h.actions.chooseGame(gameId); };
const loadOk = h => { h.response(path => { if (path === `/api/games/${gameId}/copy`) return { gameId, copyDigest: DIGEST_A, updatedAt: null, data: copyData() }; throw new Error('unexpected api: ' + path); }); };
const posts = h => h.calls.filter(c => [ `/api/games/${gameId}/copy`, `/api/games/${gameId}/copy/import-generals` ].includes(c.path) && c.body !== undefined).map(c => c.body);

test('loadCopy builds generals rows in the page projection', async () => {
  const h = harness(); await selectGame(h); loadOk(h);
  await h.actions.loadCopy();
  const rows = h.model().copy.page.generals;
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { generalId: G1, name: '丁', zi: '孔明', hao: '卧龍', portraitRef: { assetId: 'p7', sha256: SHA }, suicideOnCapture: true, ability: abilityFull() });
  assert.deepEqual(rows[1], { generalId: G2, name: '丙', zi: '', hao: '', portraitRef: null, suicideOnCapture: false, ability: null });
  assert.equal(h.errors.length, 0);
});

test('loadCopy maps a missing library to null and rejects malformed libraries', async () => {
  const h = harness(); await selectGame(h);
  h.response(() => ({ gameId, copyDigest: DIGEST_A, data: copyData({ generals: null }) }));
  await h.actions.loadCopy();
  assert.equal(h.model().copy.page.generals, null);
  assert.equal(h.errors.length, 0);
  for (const bad of [
    { generals: [] },
    { generals: { 'slot-0': { name: '丁' } } },
    { generals: { [G1]: { name: '' } } },
    { generals: { [G1]: { name: '丁', ability: { ...abilityFull(), force: 256 } } } },
    { generals: { [G1]: { name: '丁', ability: { force: 8 } } } },
    { generals: { [G1]: { name: '丁', portraitRef: { assetId: 'p7', sha256: 'zz' } } } },
  ]) {
    const g = harness(); await selectGame(g);
    g.response(() => ({ gameId, copyDigest: DIGEST_A, data: copyData(bad) }));
    await g.actions.loadCopy();
    assert.equal(g.model().copy.page, null, JSON.stringify(bad));
    assert.equal(g.errors.length, 1, JSON.stringify(bad));
  }
});

test('generalCopySave posts changed fields in one upsert body, then re-reads', async () => {
  const h = harness(); await selectGame(h); loadOk(h);
  await h.actions.loadCopy();
  const reply = await h.actions.generalCopySave(G2, { name: '乙', hao: '表', suicideOnCapture: true,
    portraitRef: { assetId: 'p7', sha256: SHA }, ability: { ...abilityFull(), force: 15 } });
  assert.equal(reply, '已保存武將並重讀副本。');
  assert.deepEqual(posts(h), [{ module: 'generals', patch: { upsert: { [G2]: {
    name: '乙', hao: '表', suicideOnCapture: true, portraitRef: { assetId: 'p7', sha256: SHA },
    ability: { ...abilityFull(), force: 15 } } } } }]);
  assert.equal(h.calls.filter(c => c.path === `/api/games/${gameId}/copy` && c.body === undefined).length, 2);
  assert.equal(h.errors.length, 0);
});

test('generalCopySave reports no change and sends nothing', async () => {
  const h = harness(); await selectGame(h); loadOk(h);
  await h.actions.loadCopy();
  const reply = await h.actions.generalCopySave(G1, { name: '丁', zi: '孔明', hao: '卧龍', suicideOnCapture: true,
    portraitRef: { assetId: 'p7', sha256: SHA }, ability: abilityFull() });
  assert.equal(reply, '武將沒有變更。');
  assert.deepEqual(posts(h), []);
  assert.equal(h.errors.length, 0);
});

test('generalCopySave rejects duplicate names and out-of-range abilities client-side', async () => {
  const h = harness(); await selectGame(h); loadOk(h);
  await h.actions.loadCopy();
  await assert.rejects(h.actions.generalCopySave(G2, { name: '丁' }), /已被其他武將使用/);
  await assert.rejects(h.actions.generalCopySave(G2, { ability: { ...abilityFull(), force: 16 } }), /0–15/);
  await assert.rejects(h.actions.generalCopySave(G2, { ability: { ...abilityFull(), politics: -1 } }), /0–15/);
  await assert.rejects(h.actions.generalCopySave(G2, { ability: { ...abilityFull(), lead: 1.5 } }), /0–15/);
  await assert.rejects(h.actions.generalCopySave('no-such', { name: '戊' }), /武將身份/);
  assert.deepEqual(posts(h), []);
});

test('loadCopyPortraits requests descriptors without unused draft usage statistics', async () => {
  const h = harness(); await selectGame(h); loadOk(h);
  await h.actions.loadCopy();
  assert.equal(h.model().copy.page.portraits, null);
  h.response(path => {
    if (path === `/api/games/${gameId}/copy`) return { gameId, copyDigest: DIGEST_A, updatedAt: null, data: copyData() };
    if (path === `/api/games/${gameId}/portraits?usage=0`) return { gameId, portraits: [{ assetId: 'p7', sha256: SHA, mime: 'image/png', byteLength: 10 }] };
    throw new Error('unexpected api: ' + path);
  });
  await h.actions.loadCopyPortraits();
  assert.deepEqual(h.model().copy.page.portraits, [{ assetId: 'p7', sha256: SHA }]);
  assert.deepEqual(h.workOptions.at(-1), { feedback: 'local' });
  assert.deepEqual(h.calls.at(-1).options, { feedback: 'local' });
  assert.equal(h.errors.length, 0);
});

// ---- 服务端 generals 模块写（GameCopyStore.writeModule） ----
const storage = openStorage(':memory:');
storage.sql.exec('CREATE TABLE content_games (game_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL)');
const actor = { id: 'owner-1', must_change: 0, epoch: 1 };
const games = { assertNotDeleting: () => {}, listOwn: () => [] };
const store = new GameCopyStore({ storage, principal: () => actor, games });
const portraitSrc = KAO_MANIFEST[0];
const portraitRef = { assetId: portraitSrc.id, sha256: portraitSrc.sha256 };
const SID1 = 'sid-general-1', SID2 = 'sid-general-2';
function freshStore() {
  const id = randomUUID();
  storage.sql.exec('INSERT INTO content_games VALUES(?,?)', id, actor.id);
  store.ensureFromGame('tok', id, { chapters: {}, generals: {
    [SID1]: { name: '甲', hao: '', portraitRef: null, suicideOnCapture: false, ability: abilityFull() },
    [SID2]: { name: '乙', hao: '表', portraitRef, suicideOnCapture: true, ability: null },
  } });
  return id;
}
const readGenerals = id => store.read('tok', id).data.generals;
const failsStore = (fn, code) => {
  try { fn(); } catch (e) { assert.equal(e.code, code, 'code ' + e.code); assert.equal(e.status, 422, 'status'); return; }
  assert.fail('should have thrown ' + code);
};

test('copy generals upsert merges fields and preserves the rest', () => {
  const id = freshStore();
  const w = store.writeModule('tok', id, 'generals', { upsert: { [SID2]: { name: '丙', suicideOnCapture: false, ability: { ...abilityFull(), force: 1 } } } });
  assert.match(w.copyDigest, /^[a-f0-9]{64}$/);
  assert.deepEqual(readGenerals(id)[SID2], { name: '丙', hao: '表', portraitRef, suicideOnCapture: false, ability: { ...abilityFull(), force: 1 } });
  assert.equal(readGenerals(id)[SID1].name, '甲');
});

test('copy generals upsert rejects unknown ids, duplicates and bad values', () => {
  const id = freshStore();
  failsStore(() => store.writeModule('tok', id, 'generals', { upsert: { 'no-such': { name: '戊' } } }), 'COPY_GENERAL');
  failsStore(() => store.writeModule('tok', id, 'generals', { upsert: { [SID2]: { name: '甲' } } }), 'COPY_GENERAL');
});

test('copy generals upsert accepts same-name self update but rejects cross-id collision in one patch', () => {
  const id = freshStore();
  store.writeModule('tok', id, 'generals', { upsert: { [SID1]: { name: '甲', hao: '表' } } });
  assert.equal(readGenerals(id)[SID1].hao, '表');
  failsStore(() => store.writeModule('tok', id, 'generals', { upsert: { [SID1]: { name: '同' }, [SID2]: { name: '同' } } }), 'COPY_GENERAL');
  // 能力下限 0（用户 2026-11 裁决）：原版专长 0 合法，0 必须能存能读。
  store.writeModule('tok', id, 'generals', { upsert: { [SID1]: { ability: { naval: 0 } } } });
  assert.equal(readGenerals(id)[SID1].ability.naval, 0);
  assert.equal(readGenerals(id)[SID1].ability.force, abilityFull().force);
  failsStore(() => store.writeModule('tok', id, 'generals', { upsert: { [SID1]: { ability: { ...abilityFull(), force: 16 } } } }), 'COPY_GENERAL');
  failsStore(() => store.writeModule('tok', id, 'generals', { upsert: { [SID1]: { ability: { ...abilityFull(), politics: -1 } } } }), 'COPY_GENERAL');
  failsStore(() => store.writeModule('tok', id, 'generals', { upsert: { [SID1]: { ability: { force: 8, magic: 1 } } } }), 'COPY_GENERAL');
  failsStore(() => store.writeModule('tok', id, 'generals', { upsert: { [SID1]: { suicideOnCapture: 1 } } }), 'COPY_GENERAL');
  failsStore(() => store.writeModule('tok', id, 'generals', { upsert: { [SID1]: { portraitRef: { assetId: portraitSrc.id, sha256: '0'.repeat(64) } } } }), 'COPY_GENERAL');
  failsStore(() => store.writeModule('tok', id, 'generals', { upsert: { [SID1]: { name: '' } } }), 'COPY_GENERAL');
  failsStore(() => store.writeModule('tok', id, 'generals', {}), 'COPY_PATCH');
});

// ---- 库层：能力 0..15、姓名唯一、自杀旗 bit4 ----
const LG = `11111111-1111-4111-8111-111111111111#general-${'e'.repeat(64)}`;
const LG2 = `11111111-1111-4111-8111-111111111111#general-${'f'.repeat(64)}`;
function libraryGame(generals) {
  return { gameId: '11111111-1111-4111-8111-111111111111',
    sourceRef: { kind: 'builtin-copy', sourceId: 'wolong-builtin' },
    generals, chapterOrder: ['ch1'],
    chapters: { ch1: { chapterId: 'ch1',
      state: { generals: Array.from({ length: 128 }, (_, idx) => emptyGeneralSlot(idx)), factions: [], cities: [] } } } };
}

test('library ability is integers 0..15 and names are game-unique', () => {
  const base = libraryGame({});
  const created = applyGeneralDefinitionEdit(base, { op: 'create', generalId: LG,
    values: { name: '丁', hao: '', portraitRef: null, suicideOnCapture: false, ability: abilityFull() } });
  assert.equal(created.generals[LG].suicideOnCapture, false);
  assert.throws(() => applyGeneralDefinitionEdit(created, { op: 'create', generalId: LG2,
    values: { name: '丁', hao: '', portraitRef: null } }), /already used/);
  assert.throws(() => applyGeneralDefinitionEdit(created, { op: 'update', generalId: LG,
    values: { name: '丁', hao: '', portraitRef: null, ability: { ...abilityFull(), force: 16 } } }), /out of range/);
  assert.throws(() => applyGeneralDefinitionEdit(created, { op: 'update', generalId: LG,
    values: { name: '丁', hao: '', portraitRef: null, ability: { ...abilityFull(), lead: 256 } } }), /out of range/);
  assert.throws(() => applyGeneralDefinitionEdit(created, { op: 'update', generalId: LG,
    values: { name: '丁', hao: '', portraitRef: null, ability: { force: 8 } } }), /authoring record fields|out of range/);
  assert.throws(() => applyGeneralDefinitionEdit(created, { op: 'update', generalId: LG,
    values: { name: '丁', hao: '', portraitRef: null, suicideOnCapture: 1 } }), /boolean/);
  const renamed = applyGeneralDefinitionEdit(created, { op: 'update', generalId: LG,
    values: { name: '丁', hao: '表', portraitRef: null, suicideOnCapture: true } });
  assert.equal(renamed.generals[LG].hao, '表');
  assert.equal(renamed.generals[LG].suicideOnCapture, true);
});

test('suicide flag merges into slot attr bit4 on assign and person set, other bits kept', () => {
  const state = { generals: Array.from({ length: 128 }, (_, idx) => emptyGeneralSlot(idx)) };
  const a = assignGeneralToChapterState(state, { generalId: 'x1', name: '甲', hao: '', portrait: 3, suicideOnCapture: true });
  assert.equal(state.generals[a.slot].attr, 0x90);
  const b = assignGeneralToChapterState(state, { generalId: 'x2', name: '乙', hao: '', portrait: 3 });
  assert.equal(state.generals[b.slot].attr, 0x80);
  assert.throws(() => assignGeneralToChapterState(state, { generalId: 'x3', name: '丙', hao: '', portrait: 3, suicideOnCapture: 1 }), /boolean/);
  const game = libraryGame({ [LG]: { name: '丁', hao: '', portraitRef: null, suicideOnCapture: false } });
  const set = { op: 'set', chapterId: 'ch1', generalId: LG, values: { included: true, factionId: null, overrides: {} } };
  const s1 = applyChapterPersonEdit(game, set);
  const slot = s1.chapters.ch1.state.generals.find(g => g?.generalId === LG);
  assert.equal(slot.attr, 0x80);
  assert.equal(slot.active, true);
  const s2game = applyGeneralDefinitionEdit(s1, { op: 'update', generalId: LG,
    values: { name: '丁', hao: '', portraitRef: null, suicideOnCapture: true } });
  const s2 = applyChapterPersonEdit(s2game, set);
  const slot2 = s2.chapters.ch1.state.generals.find(g => g?.generalId === LG);
  assert.equal(slot2.attr, 0x90);
  assert.equal(slot2.active, true);
  const s3game = applyGeneralDefinitionEdit(s2, { op: 'update', generalId: LG,
    values: { name: '丁', hao: '', portraitRef: null, suicideOnCapture: false } });
  const s3 = applyChapterPersonEdit(s3game, set);
  assert.equal(s3.chapters.ch1.state.generals.find(g => g?.generalId === LG).attr, 0x80);
});

test('generalCopyImport ignores target native slots and posts one builtin replacement request', async () => {
  const h = harness(); await selectGame(h);
  const chapter = (id, slots) => ({ chapterId: id, state: { name: id, start: { year: 184, month: 1, day: 1 },
    factions: [{ idx: 0, money: 100, reserve_cav: 1, reserve_arc: 2, reserve_inf: 3, monarch_idx: 0, advisor_idx: null, diplomat_idx: 1, capital: 0 }],
    generals: slots, cities: [{ idx: 0, name: '城甲', faction: 0, governor: 1, troops: 10, prod: 20, troops_cap: 100, max_prod: 50, growth: 3, defence: 4 }] } });
  const native = (idx, name, over = {}) => ({ idx, name, hao: '字', faction: 0, portrait: 5, attr: 0x90, ability: { siege: 0, field: 2, naval: 0, force: 8, lead: 7, politics: 8 }, ...over });
  const data = { ...copyData({ generals: {} }),
    chapterOrder: ['ch1', 'ch2'],
    chapters: { ch1: chapter('ch1', [native(0, '張梁'), native(1, '何進'), { idx: 127, name: '留', hao: '', faction: null }]),
      ch2: chapter('ch2', [native(0, '張梁'), native(1, '張寶', { attr: 0x80, portrait: 0 })]) } };
  h.response(() => ({ gameId, copyDigest: DIGEST_A, updatedAt: null, data }));
  await h.actions.loadCopy();
  const reply = await h.actions.generalCopyImport();
  assert.equal(reply, '已從內置遊戲導入 0 名武將並重讀副本。');
  assert.deepEqual(posts(h), [{}]);
  assert.equal(h.calls.find(call => call.body).path, '/api/games/' + gameId + '/copy/import-generals');
  assert.equal(h.errors.length, 0);
});

test('generalCopyImport sends no target records or artificial batch progress', async () => {
  const h = harness(); await selectGame(h);
  // 130 个不重名原生记录（两章各 65 槽，idx 保持 0..127）→ 64 + 64 + 2 三批。
  const slotAt = (offset, i) => ({ idx: i, name: '將' + String(offset + i).padStart(3, '0'), hao: '', faction: 0, portrait: 0, attr: 0x80,
    ability: { siege: 1, field: 1, naval: 0, force: 2, lead: 2, politics: 2 } });
  const chapter = (id, offset) => ({ chapterId: id, state: { name: id, start: { year: 184, month: 1, day: 1 },
    factions: [{ idx: 0, money: 100, reserve_cav: 1, reserve_arc: 2, reserve_inf: 3, monarch_idx: 0, advisor_idx: null, diplomat_idx: 1, capital: 0 }],
    generals: Array.from({ length: 65 }, (_, i) => slotAt(offset, i)),
    cities: [{ idx: 0, name: '城甲', faction: 0, governor: 1, troops: 10, prod: 20, troops_cap: 100, max_prod: 50, growth: 3, defence: 4 }] } });
  h.response(() => ({ gameId, copyDigest: DIGEST_A, updatedAt: null, data: { ...copyData({ generals: {} }), chapterOrder: ['ch1', 'ch2'], chapters: { ch1: chapter('ch1', 0), ch2: chapter('ch2', 65) } } }));
  await h.actions.loadCopy();
  const beforeImport = h.calls.length;
  const original = h.actions.generalCopySave;
  assert.equal(typeof original, 'function');
  const reply = await h.actions.generalCopyImport();
  assert.equal(reply, '已從內置遊戲導入 0 名武將並重讀副本。');
  assert.deepEqual(posts(h), [{}]);
  assert.equal(h.errors.length, 0);
  assert.ok(h.calls.slice(beforeImport).every(call => call.options?.feedback !== 'progress'));
  assert.deepEqual(h.progress, []);
});

test('failed builtin replacement does not clear the displayed library or claim partial success', async () => {
  const h = harness(); await selectGame(h);
  const data = copyData({ generals: {} });
  data.chapters.ch1.state.generals = Array.from({ length: 65 }, (_, idx) => ({ idx, name: `新將${idx}`, hao: '', faction: null }));
  h.response(() => ({ gameId, copyDigest: DIGEST_A, data }));
  await h.actions.loadCopy();
  const beforeImport = h.calls.length;
  h.response(() => { throw new Error('fixture replacement failed'); });
  await h.actions.generalCopyImport();
  assert.equal(h.calls.slice(beforeImport).length, 1);
  assert.deepEqual(h.model().copy.page.generals, []);
  assert.equal(h.errors.length, 1);
  assert.match(h.errors[0].message, /replacement failed/);
});

test('generalCopyImport can overwrite an existing library', async () => {
  const h = harness(); await selectGame(h);
  h.response(() => ({ gameId, copyDigest: DIGEST_A, updatedAt: null, data: copyData() }));
  await h.actions.loadCopy();
  await h.actions.generalCopyImport();
  assert.deepEqual(posts(h), [{}]);
});

test('copy generals import creates hashed ids, resolves portraits and leaves 字/号 empty', () => {
  const id = freshStore();
  store.writeModule('tok', id, 'generals', { import: [
    { name: '許褚', portrait: Number(portraitSrc.id.replace(/^p/, '')) || 0, suicideOnCapture: true, ability: { siege: 0, field: 2, naval: 0, force: 8, lead: 7, politics: 8 } },
    { name: '典韋', portrait: 0, suicideOnCapture: false },
  ] });
  const lib = readGenerals(id);
  const xu = lib[`${id}#general-${createHash('sha256').update('許褚', 'utf8').digest('hex')}`];
  assert.equal(xu.name, '許褚');
  // 原版 6 字节“字号/称呼”多数等于姓名，不当号；导入一律留空。
  assert.equal(xu.zi, '');
  assert.equal(xu.hao, '');
  assert.equal(xu.suicideOnCapture, true);
  assert.equal(xu.ability.naval, 0);
  // 原图只在共用头像库命中时带 SHA；0 留空。
  assert.equal(xu.portraitRef === null || /^[a-f0-9]{64}$/.test(xu.portraitRef.sha256), true);
  const dian = lib[`${id}#general-${createHash('sha256').update('典韋', 'utf8').digest('hex')}`];
  assert.equal(dian.portraitRef, null);
  assert.deepEqual(dian.ability, undefined);
  assert.equal(dian.suicideOnCapture, false);
  // 导入载荷不接受字/号（只人工填），混入即拒。
  failsStore(() => store.writeModule('tok', id, 'generals', { import: [{ name: '新將', hao: '仲康' }] }), 'COPY_GENERAL');
  failsStore(() => store.writeModule('tok', id, 'generals', { import: [{ name: '新將', zi: '仲康' }] }), 'COPY_GENERAL');
  // 幂等性：同名再导一次被拒（库里已有），不改库。
  failsStore(() => store.writeModule('tok', id, 'generals', { import: [{ name: '許褚' }] }), 'COPY_GENERAL');
  assert.equal(Object.keys(readGenerals(id)).length, 4);
});
