// 章節武將屬性（Web 作者層）：登場旗標（attr bit7）、身份（G+17 0–4）、所屬勢力，
// 以及固定副本／模板兩條歷史回放與篡改拒絕。不含 HTTP、存檔或運行准入。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { FixedCopyProfile, FIXED_TEMPLATE_PROFILE } from '../server/copyprofile.js';
import { createPinnedCopyLoader } from './editor_trusted_copy.mjs';
import { addBlankChapter, chapterActiveGaps, createFaction, setChapterGeneralFaction, setGeneralActive, setGeneralStatus, setMonarch } from '../web/src/content/authoring/gamesource.js';
import { CHAPTER_BASE } from '../web/src/content/authoring/chapterbase.generated.js';

const START = { era: 'ad', year: 208, month: 11, day: 1 };
const context = { gameId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', ownerId: 'chapter-general-author' };
const loader = (kind, extra = {}) => createPinnedCopyLoader({ kind, readWeb: path => readFileSync(new URL(`../web/${path}`, import.meta.url)), ...extra });
const copyProfile = new FixedCopyProfile({ loadCopy: loader('full', { allocateEntityId: (() => { let n = 0; return () => `chapter-general-${++n}`; })() }) });
const templateProfile = new FixedCopyProfile({ loadCopy: loader('minimal'), profileRevision: FIXED_TEMPLATE_PROFILE });
const captured = await copyProfile.capture(context), baseline = captured.game;
const template = await templateProfile.capture(context);
const blank = (name = '武將測試') => {
  const game = structuredClone(baseline), chapterId = addBlankChapter(game, { name, start: START });
  return { game, chapterId, state: game.chapters[chapterId].state };
};

test('登場旗標：bit7 與 active 同步，attr 其餘位元組原樣保留', () => {
  const { game, chapterId, state } = blank();
  // materialize 出來的 128 槽一律未登場，且 attr 只清 bit7。
  for (const [slot, general] of state.generals.entries()) {
    assert.equal(general.attr & 0x80, 0, `slot ${slot} must start undebuted`);
    assert.equal(general.active, false);
    assert.equal(general.attr, CHAPTER_BASE.generals[slot].attr & 0x7f);
  }
  const before = state.generals[3].attr;
  setGeneralActive(game, chapterId, 3, true);
  assert.equal(state.generals[3].attr, before | 0x80);
  assert.equal(state.generals[3].active, true);
  assert.equal(state.generals[3].attr & 0x7f, before, 'other attr bits survive');
  setGeneralActive(game, chapterId, 3, false);
  assert.equal(state.generals[3].attr, before);
  assert.equal(state.generals[3].active, false);
  // 只動目標槽：相鄰槽與其它章節欄位不受影響。
  assert.equal(state.generals[4].attr, CHAPTER_BASE.generals[4].attr & 0x7f);
  assert.throws(() => setGeneralActive(game, chapterId, 3, 1), TypeError);
  assert.throws(() => setGeneralActive(game, chapterId, 3, null), TypeError);
});

test('身份 G+17：0–4 可寫，越界、非整數、保留槽一律拒絕', () => {
  const { game, chapterId, state } = blank();
  for (const status of [0, 1, 2, 3, 4]) {
    setGeneralStatus(game, chapterId, 7, status);
    assert.equal(state.generals[7].status, status);
  }
  for (const status of [-1, 5, 1.5, 0.5, NaN, Infinity, '1', null, undefined, true])
    assert.throws(() => setGeneralStatus(game, chapterId, 7, status), RangeError);
  // G127 是保留槽（generalByIdx 契约），128 越界。
  for (const slot of [127, 128, -1, 1.5, '0'])
    assert.throws(() => setGeneralStatus(game, chapterId, slot, 0), RangeError);
  assert.throws(() => setGeneralActive(game, chapterId, 127, true), RangeError);
  // 身份寫入不碰 attr、所屬或任何計數。
  assert.equal(state.generals[7].attr & 0x80, 0);
  assert.equal(state.generals[7].faction, null);
});

test('所屬勢力：未定義勢力、任職中武將被拒；本章已定義勢力與自由可寫', () => {
  const { game, chapterId, state } = blank();
  assert.throws(() => setChapterGeneralFaction(game, chapterId, 11, 0), RangeError);
  setGeneralActive(game, chapterId, 11, true);
  createFaction(game, chapterId, { monarchIdx: 5 });
  setChapterGeneralFaction(game, chapterId, 11, 0);
  assert.equal(state.generals[11].faction, 0);
  setChapterGeneralFaction(game, chapterId, 11, null);
  assert.equal(state.generals[11].faction, null);
  // 君主已任職：改所屬被拒（必須先清職）。
  setMonarch(game, chapterId, 0, 12);
  assert.throws(() => setChapterGeneralFaction(game, chapterId, 12, null), /holds a chapter post/);
  assert.throws(() => setChapterGeneralFaction(game, chapterId, 12, 0), /holds a chapter post/);
});

test('缺口面：登場與身份不是新門檻，只保留既有 chapter-factions', () => {
  const { game, chapterId, state } = blank();
  setGeneralActive(game, chapterId, 0, true);
  setGeneralStatus(game, chapterId, 0, 4);
  assert.deepEqual(chapterActiveGaps(state, chapterId).map(gap => gap.code), ['chapter-factions']);
  createFaction(game, chapterId, { monarchIdx: 0 });
  // 建勢力後只剩「首都未指定」的兩條（欄位型別＋引用），與登場／身份無關。
  assert.deepEqual(chapterActiveGaps(state, chapterId).map(gap => gap.code).sort(), ['entity-field', 'entity-ref']);
});

test('固定副本與模板歷史：登場／身份可回放，篡改與未知 op 被拒', () => {
  const candidate = structuredClone(baseline);
  const edits = [{ op: 'add-blank', name: '回放武將', start: START }];
  const chapterId = addBlankChapter(candidate, { name: '回放武將', start: START });
  edits.push({ op: 'general-active', chapterId, generalIdx: 4, active: true });
  setGeneralActive(candidate, chapterId, 4, true);
  edits.push({ op: 'general-status', chapterId, generalIdx: 4, status: 2 });
  setGeneralStatus(candidate, chapterId, 4, 2);
  edits.push({ op: 'create-faction', chapterId, monarchIdx: 6 });
  createFaction(candidate, chapterId, { monarchIdx: 6 });
  edits.push({ op: 'general-faction', chapterId, generalIdx: 4, factionId: 0 });
  setChapterGeneralFaction(candidate, chapterId, 4, 0);
  assert.equal(typeof copyProfile.verify(captured.capability, candidate, edits).sourceDigest, 'string');
  const tampers = [
    game => { game.chapters[chapterId].state.generals[4].attr ^= 0x80; },
    game => { game.chapters[chapterId].state.generals[4].active = false; },
    game => { game.chapters[chapterId].state.generals[4].status = 3; },
    game => { game.chapters[chapterId].state.generals[9].attr |= 0x80; },
  ];
  // general-faction 現在走先驗後還原（見下一個 test）：宣告欄位必須整體等於
  // 「操作前快照＋同一 writer」或操作前原值，第三種值一律拒。
  for (const tamper of tampers) {
    const broken = structuredClone(candidate);
    tamper(broken);
    assert.throws(() => copyProfile.verify(captured.capability, broken, edits), error => error.code === 'COPY_PROTECTED_DELTA');
  }
  // 模板 profile：同一批 writer 可回放；未開放的章節原生欄位仍 fail-closed。
  const templateCandidate = structuredClone(template.game);
  const templateId = addBlankChapter(templateCandidate, { name: '模板武將', start: START });
  setGeneralActive(templateCandidate, templateId, 2, true);
  setGeneralStatus(templateCandidate, templateId, 2, 1);
  assert.equal(typeof templateProfile.verify(template.capability, templateCandidate,
    [{ op: 'add-blank', name: '模板武將', start: START },
      { op: 'general-active', chapterId: templateId, generalIdx: 2, active: true },
      { op: 'general-status', chapterId: templateId, generalIdx: 2, status: 1 }]).sourceDigest, 'string');
  // 未知／未開放的章節 op：兩條 profile 都在回退階段 fail-closed。
  // （模板 profile 的歷史回放 replayTemplateHistory 是 capture 階段另一條路徑，
  //   由 verify_editor_template_profile.mjs 覆蓋，不在這裡冒充。）
  const closed = structuredClone(template.game);
  const closedId = addBlankChapter(closed, { name: '模板武將', start: START });
  assert.throws(() => templateProfile.verify(template.capability, closed,
    [{ op: 'add-blank', name: '模板武將', start: START },
      { op: 'city-native', chapterId: closedId, cityIdx: 0, values: { troops: 1 } }]), error => error.code === 'COPY_PROTECTED_DELTA');
});

test('所屬勢力變更的先驗後還原：第三種值與夾帶改動都被拒', () => {
  const id = baseline.chapterOrder[0], state = baseline.chapters[id].state;
  const [from, to] = [state.factions[0].idx, state.factions[1].idx];
  const mover = state.generals.find(g => g.faction === from && g.idx !== state.factions[0].monarch_idx);
  assert.ok(mover);
  const edit = { op: 'general-faction', chapterId: id, generalIdx: mover.idx, factionId: to };
  const applied = structuredClone(baseline);
  setChapterGeneralFaction(applied, id, mover.idx, to);
  // ① 同一 writer 的結果可回放；② 宣告了但未生效（仍是原值）同樣可回放。
  assert.equal(typeof copyProfile.verify(captured.capability, applied, [edit]).sourceDigest, 'string');
  assert.equal(typeof copyProfile.verify(captured.capability, structuredClone(baseline), [edit]).sourceDigest, 'string');
  // ③ 改成第三個勢力（既非期望值也非原值）→ 拒。
  const divergent = structuredClone(applied);
  divergent.chapters[id].state.generals.find(g => g.idx === mover.idx).faction = state.factions[2].idx;
  assert.throws(() => copyProfile.verify(captured.capability, divergent, [edit]), e => e.code === 'COPY_PROTECTED_DELTA');
  // ④ 同一武將的其他欄位被夾帶改動 → 拒。
  const smuggled = structuredClone(applied);
  smuggled.chapters[id].state.generals.find(g => g.idx === mover.idx).status = 3;
  assert.throws(() => copyProfile.verify(captured.capability, smuggled, [edit]), e => e.code === 'COPY_PROTECTED_DELTA');
});
