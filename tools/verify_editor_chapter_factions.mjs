// 章節勢力（Web 作者層，非原版初始化規則）驗證：建勢力槽＋選君主、首都必填門、
// 原生 17 欄位一致性、固定副本歷史回放與篡改拒絕。不含 HTTP、存檔或運行准入。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { FixedCopyProfile, FIXED_TEMPLATE_PROFILE } from '../server/copyprofile.js';
import { createPinnedCopyLoader } from './editor_trusted_copy.mjs';
import { addBlankChapter, chapterActiveGaps, createFaction, disbandFaction, setChapterCityFaction, setFactionCapital, setFactionDiplomat, setMonarch, setStrategist } from '../web/src/content/authoring/gamesource.js';
import { factionNativeConsistencyGaps } from '../web/src/content/authoring/factionconsistency.js';

const START = { era: 'ad', year: 208, month: 11, day: 1 };
const context = { gameId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ownerId: 'chapter-faction-author' };
const loader = (kind, extra = {}) => createPinnedCopyLoader({ kind, readWeb: path => readFileSync(new URL(`../web/${path}`, import.meta.url)), ...extra });
const copyProfile = new FixedCopyProfile({ loadCopy: loader('full', { allocateEntityId: (() => { let n = 0; return () => `chapter-faction-${++n}`; })() }) });
const templateProfile = new FixedCopyProfile({ loadCopy: loader('minimal'), profileRevision: FIXED_TEMPLATE_PROFILE });
const captured = await copyProfile.capture(context), baseline = captured.game;
const template = await templateProfile.capture(context);
const readByte = (raw, offset) => Number.parseInt(raw.slice(offset * 2, offset * 2 + 2), 16);
const blank = (name = '勢力測試') => {
  const game = structuredClone(baseline), chapterId = addBlankChapter(game, { name, start: START });
  return { game, chapterId, state: game.chapters[chapterId].state };
};

test('建勢力：君主入列、空內政官／外交官／首都、原生槽位元組與派生計數', () => {
  const { game, chapterId, state } = blank();
  assert.deepEqual(state.factions, []);
  assert.equal(Object.hasOwn(state, 'nativeFactionSlotRaw'), false);
  assert.deepEqual(createFaction(game, chapterId, { monarchIdx: 5 }), { factionIdx: 0 });
  assert.equal(state.factions.length, 1);
  const faction = state.factions[0];
  assert.equal(faction.idx, 0);
  assert.equal(faction.monarch_idx, 5);
  assert.equal(faction.advisor_idx, null);
  assert.equal(faction.diplomat_idx, null);
  assert.equal(faction.capital, null);
  assert.equal(faction.n_cities, 0);
  assert.equal(faction.n_generals, 1);
  assert.equal(state.generals[5].faction, 0);
  // 22 槽固定來源沿用固定源同槽位元組，只改本函式擁有的欄位。
  assert.equal(state.nativeFactionSlotRaw.length, 22);
  const raw = state.nativeFactionSlotRaw[0];
  assert.match(raw, /^[0-9a-f]{128}$/);
  assert.equal(readByte(raw, 1), 5);
  assert.equal(readByte(raw, 2), 0x7f);
  assert.equal(readByte(raw, 3), 0xff);
  assert.equal(readByte(raw, 0x23), 0);
  assert.equal(faction.raw, raw);
  // 宣告欄位與原生位元組逐欄一致（17 欄）。空首都在 FACTION_NUMBER_FIELDS 裡要求整數，
  // 所以同時觸發 entity-field 與 entity-ref 兩條缺口：這就是「没有首都的勢力不能保存」。
  assert.deepEqual(factionNativeConsistencyGaps(state, chapterId), []);
  const gaps = chapterActiveGaps(state, chapterId);
  assert.deepEqual(gaps.map(gap => gap.code), ['entity-field', 'entity-ref']);
  assert.ok(gaps.every(gap => /capital/.test(gap.message)));
});

test('首都：指定後缺口清空，且只改首都欄位與 +03 位元組', () => {
  const { game, chapterId, state } = blank();
  createFaction(game, chapterId, { monarchIdx: 3 });
  const before = state.nativeFactionSlotRaw[0];
  setFactionCapital(game, chapterId, 0, 12);
  assert.equal(state.factions[0].capital, 12);
  assert.equal(readByte(state.nativeFactionSlotRaw[0], 3), 12);
  // 只有 +03 變化，其餘位元組仍是固定源原值。
  assert.equal(state.nativeFactionSlotRaw[0].slice(0, 6), before.slice(0, 6));
  assert.equal(state.nativeFactionSlotRaw[0].slice(8), before.slice(8));
  // 首都據點必須屬本勢力（2026-11 用戶裁決），所以先歸屬再要求零缺口。
  setChapterCityFaction(game, chapterId, 12, 0);
  assert.deepEqual(chapterActiveGaps(state, chapterId), []);
  assert.deepEqual(factionNativeConsistencyGaps(state, chapterId), []);
  // 首都引用越界由現有 writer 拒絕，不新增第二套門檻。
  assert.throws(() => setFactionCapital(game, chapterId, 0, 192), /chapter city idx 0\.\.191 required/);
  assert.throws(() => setFactionCapital(game, chapterId, 1, 12), /unknown chapter faction: 1/);
});

test('拒絕面：君主非自由／持職／G127／未知槽、多餘欄位、22 槽上限', () => {
  const { game, chapterId, state } = blank();
  createFaction(game, chapterId, { monarchIdx: 5 });
  assert.throws(() => createFaction(game, chapterId, { monarchIdx: 5 }), /free general/);
  assert.throws(() => createFaction(game, chapterId, { monarchIdx: 127 }), /ordinary general slot 0\.\.126/);
  assert.throws(() => createFaction(game, chapterId, { monarchIdx: 900 }), /ordinary general slot/);
  assert.throws(() => createFaction(game, chapterId, { monarchIdx: 6, capital: 1 }), /monarchIdx only/);
  assert.throws(() => createFaction(game, chapterId, {}), /monarchIdx only/);
  assert.throws(() => createFaction(game, chapterId), TypeError);
  assert.throws(() => createFaction(game, chapterId, { monarchIdx: -1 }), /ordinary general slot/);
  // 君主持職：先讓他成為軍師，再試圖當君主。
  const other = blank();
  assert.throws(() => createFaction(other.game, other.chapterId, { monarchIdx: 2.5 }), /ordinary general slot/);
  // 上限：22 槽（君主逐槽不同，避開 G127）。
  for (let slot = 6; slot < 6 + 21; slot++) createFaction(game, chapterId, { monarchIdx: slot });
  assert.equal(state.factions.length, 22);
  assert.throws(() => createFaction(game, chapterId, { monarchIdx: 100 }), /slots are full/);
  assert.deepEqual(state.factions.map(faction => faction.idx), Array.from({ length: 22 }, (_, slot) => slot));
  assert.deepEqual(factionNativeConsistencyGaps(state, chapterId), []);
});

test('原生一致性：欄位或位元組任一方向改動都被指出，不自動修復', () => {
  const { game, chapterId, state } = blank();
  createFaction(game, chapterId, { monarchIdx: 9 });
  setFactionCapital(game, chapterId, 0, 4);
  const view = structuredClone(state);
  view.factions[0].money += 1;
  const moneyGap = factionNativeConsistencyGaps(view, chapterId);
  assert.equal(moneyGap.length, 1);
  assert.match(moneyGap[0].message, /money/);
  const raw = structuredClone(state);
  raw.nativeFactionSlotRaw[0] = `${raw.nativeFactionSlotRaw[0].slice(0, 0x28 * 2)}ff${raw.nativeFactionSlotRaw[0].slice(0x28 * 2 + 2)}`;
  assert.match(factionNativeConsistencyGaps(raw, chapterId)[0].message, /bellicosity/);
  // 哨兵：清空首都（0xFF）後宣告值必須是 null，否則視為不一致。
  const sentinel = structuredClone(state);
  sentinel.nativeFactionSlotRaw[0] = `${sentinel.nativeFactionSlotRaw[0].slice(0, 6)}ff${sentinel.nativeFactionSlotRaw[0].slice(8)}`;
  assert.match(factionNativeConsistencyGaps(sentinel, chapterId)[0].message, /capital/);
});

test('固定副本歷史：add-blank→create-faction→set-capital 可回放，篡改與模板 profile 被拒', () => {
  const candidate = structuredClone(baseline);
  const edits = [{ op: 'add-blank', name: '回放勢力', start: START }];
  const chapterId = addBlankChapter(candidate, { name: '回放勢力', start: START });
  edits.push({ op: 'create-faction', chapterId, monarchIdx: 7 });
  createFaction(candidate, chapterId, { monarchIdx: 7 });
  edits.push({ op: 'set-capital', chapterId, factionIdx: 0, cityIdx: 12 });
  setFactionCapital(candidate, chapterId, 0, 12);
  assert.equal(typeof copyProfile.verify(captured.capability, candidate, edits).sourceDigest, 'string');
  // 反向回放必須還原成 pristine 空白章：位元組表與勢力記錄都不得殘留。
  const noEdit = structuredClone(baseline);
  const bareId = addBlankChapter(noEdit, { name: '回放勢力', start: START });
  assert.equal(typeof copyProfile.verify(captured.capability, noEdit, [{ op: 'add-blank', name: '回放勢力', start: START }]).sourceDigest, 'string');
  assert.equal(bareId, chapterId);
  const tampers = [
    game => { game.chapters[chapterId].state.factions[0].monarch_idx = 8; },
    game => { game.chapters[chapterId].state.factions[0].capital = 13; },
    game => { game.chapters[chapterId].state.nativeFactionSlotRaw[0] = '00'.repeat(64); },
    game => { game.chapters[chapterId].state.factions.push({ ...game.chapters[chapterId].state.factions[0], idx: 1 }); },
    game => { game.chapters[chapterId].state.generals[8].faction = 0; },
  ];
  for (const tamper of tampers) {
    const broken = structuredClone(candidate);
    tamper(broken);
    assert.throws(() => copyProfile.verify(captured.capability, broken, edits), error => error.code === 'COPY_PROTECTED_DELTA');
  }
  // 模板 profile 的章節原生寫入：建势力／設君主／設首都属于已批准的章節屬性范围，
  // 两个 profile 走同一套 writer；未知 op 仍 fail-closed。
  const templateCandidate = structuredClone(template.game);
  const templateId = addBlankChapter(templateCandidate, { name: '模板勢力', start: START });
  createFaction(templateCandidate, templateId, { monarchIdx: 7 });
  setFactionCapital(templateCandidate, templateId, 0, 3);
  assert.equal(typeof templateProfile.verify(template.capability, templateCandidate,
    [{ op: 'add-blank', name: '模板勢力', start: START }, { op: 'create-faction', chapterId: templateId, monarchIdx: 7 },
      { op: 'set-capital', chapterId: templateId, factionIdx: 0, cityIdx: 3 }]).sourceDigest, 'string');
  const unopened = structuredClone(template.game);
  const unopenedId = addBlankChapter(unopened, { name: '模板勢力', start: START });
  createFaction(unopened, unopenedId, { monarchIdx: 7 });
  disbandFaction(unopened, unopenedId, 0);
  assert.throws(() => templateProfile.verify(template.capability, unopened,
    [{ op: 'add-blank', name: '模板勢力', start: START }, { op: 'create-faction', chapterId: unopenedId, monarchIdx: 7 },
      { op: 'disband-faction', chapterId: unopenedId, factionIdx: 0, confirm: true }]),
  error => error.code === 'COPY_PROTECTED_DELTA');
});

test('首都必須屬本勢力（2026-11 用戶裁決）：作者章強制、內置章以 _src 豁免', () => {
  const { game, chapterId, state } = blank();
  createFaction(game, chapterId, { monarchIdx: 5 });
  setFactionCapital(game, chapterId, 0, 12);
  // 據點 #12 仍中立：首都引用可解析，但不屬於本勢力 → 缺口。
  const foreign = chapterActiveGaps(state, chapterId).filter(gap => /not owned by this faction/.test(gap.message));
  assert.equal(foreign.length, 1);
  assert.match(foreign[0].message, /capital 12 is not owned/);
  // 把該據點歸給本勢力後缺口消失。
  setChapterCityFaction(game, chapterId, 12, 0);
  assert.deepEqual(chapterActiveGaps(state, chapterId), []);
  // 一個據點只能被一個勢力當首都（同批用戶裁決，不共用）：兩個作者勢力宣告同一首都 → 缺口。
  const shared = blank();
  createFaction(shared.game, shared.chapterId, { monarchIdx: 5 });
  createFaction(shared.game, shared.chapterId, { monarchIdx: 6 });
  setChapterCityFaction(shared.game, shared.chapterId, 12, 1);
  setFactionCapital(shared.game, shared.chapterId, 0, 12);
  setFactionCapital(shared.game, shared.chapterId, 1, 12);
  const duplicated = chapterActiveGaps(shared.state, shared.chapterId).filter(gap => /already the capital/.test(gap.message));
  assert.equal(duplicated.length, 1);
  assert.match(duplicated[0].message, /capital 12 is already the capital of faction\[0\]/);
  // 內置章（state._src）不套此規則：原版 8 個內置勢力首都據點 +01 不屬於本勢力，且多個勢力共用同一首都。
  const builtin = structuredClone(baseline), builtinId = builtin.chapterOrder[0];
  assert.equal(Object.hasOwn(builtin.chapters[builtinId].state, '_src'), true);
  const tampered = structuredClone(builtin);
  tampered.chapters[builtinId].state.factions[0].capital = 191;
  assert.deepEqual(chapterActiveGaps(tampered.chapters[builtinId].state, builtinId).filter(gap => /not owned/.test(gap.message)), []);
});


test('先驗後還原：職務命令只認「操作前快照＋同一 writer」或操作前原值', () => {
  const id = baseline.chapterOrder[0], state = baseline.chapters[id].state;
  const factionIdx = state.factions[0].idx;
  const freeGeneral = state.generals.find(g => g.faction === null && g.idx !== 127);
  assert.ok(freeGeneral);
  const member = state.generals.find(g => g.faction === factionIdx && g.idx !== state.factions[0].monarch_idx);
  assert.ok(member);
  const flip = (raw, offset) => raw.slice(0, offset * 2) + (readByte(raw, offset) ^ 1).toString(16).padStart(2, '0') + raw.slice(offset * 2 + 2);
  const verify = candidate => copyProfile.verify(captured.capability, candidate, ops);
  const cases = [
    { op: 'set-capital', keys: ['chapterId', 'factionIdx', 'cityIdx'], apply: g => setFactionCapital(g, id, factionIdx, 100),
      tamper: g => { g.chapters[id].state.factions[0].capital = 101; }, byte: 3 },
    { op: 'set-monarch', keys: ['chapterId', 'factionIdx', 'generalIdx'], apply: g => setMonarch(g, id, factionIdx, freeGeneral.idx),
      tamper: g => { g.chapters[id].state.generals.find(x => x.idx === freeGeneral.idx).faction = state.factions[1].idx; }, byte: 1 },
    { op: 'set-strategist', keys: ['chapterId', 'factionIdx', 'generalIdx'], apply: g => setStrategist(g, id, factionIdx, member.idx),
      tamper: g => { g.chapters[id].state.factions[0].advisor_idx = null; }, byte: 2 },
    { op: 'set-diplomat', keys: ['chapterId', 'factionIdx', 'generalIdx'], apply: g => setFactionDiplomat(g, id, factionIdx, member.idx),
      tamper: g => { g.chapters[id].state.factions[0].diplomat_idx = state.factions[0].monarch_idx; }, byte: 0x2a },
  ];
  for (const item of cases) {
    const edit = { op: item.op, chapterId: id, factionIdx, [item.keys[2]]: item.op === 'set-capital' ? 100 : (item.op === 'set-monarch' ? freeGeneral.idx : member.idx) };
    const applied = structuredClone(baseline);
    item.apply(applied);
    // ① 同一 writer 的結果可回放
    assert.equal(typeof copyProfile.verify(captured.capability, applied, [edit]).sourceDigest, 'string', item.op);
    // ② 宣告了但未生效（仍是操作前原值）同樣可回放
    assert.equal(typeof copyProfile.verify(captured.capability, structuredClone(baseline), [edit]).sourceDigest, 'string', `${item.op} no-op`);
    // ③ 宣告欄位被改成第三種值 → 拒
    const divergent = structuredClone(applied);
    item.tamper(divergent);
    assert.throws(() => copyProfile.verify(captured.capability, divergent, [edit]), e => e.code === 'COPY_PROTECTED_DELTA', `${item.op} field`);
    // ④ 同一勢力的其他原生位元組被夾帶改動 → 拒（盲還原會吸收這種改動）
    const smuggled = structuredClone(applied);
    const table = smuggled.chapters[id].state.nativeFactionSlotRaw;
    table[factionIdx] = flip(table[factionIdx], 0x20);
    assert.throws(() => copyProfile.verify(captured.capability, smuggled, [edit]), e => e.code === 'COPY_PROTECTED_DELTA', `${item.op} byte`);
    // ⑤ 記錄自身的位元組被夾帶改動 → 拒
    const recordRaw = structuredClone(applied);
    const record = recordRaw.chapters[id].state.factions.find(f => f.idx === factionIdx);
    record.raw = flip(record.raw, 0x28);
    assert.throws(() => copyProfile.verify(captured.capability, recordRaw, [edit]), e => e.code === 'COPY_PROTECTED_DELTA', `${item.op} record byte`);
  }
});

process.stdout.write(`${JSON.stringify({ tests: 7, scope: 'pinned full copy + minimal template only; no HTTP, save, native initialization or runtime grant' })}\n`);
