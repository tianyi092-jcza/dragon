// 章節 materialize 驗證器：固定源基線一致、空白章填法、試運行編譯、拒絕面。
// 只用固定源與 pinned minimal 模板；不碰 HTTP、正式存檔或原生初始化授權。
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createPinnedCopyLoader } from './editor_trusted_copy.mjs';
import { readInstalledEditorSource } from './editor_builtin_source.mjs';
import { CHAPTER_BASE_OUTPUT, readPinnedChapterBase, renderChapterBaseModule } from './build_chapter_base.mjs';
import { CHAPTER_BASE } from '../web/src/content/authoring/chapterbase.generated.js';
import { materializeChapterState } from '../web/src/content/authoring/chaptermaterialize.js';
import { setChapterCityFaction, setFactionCapital } from '../web/src/content/authoring/gamesource.js';
import { chapterActiveGaps, validateGameSource } from '../web/src/content/authoring/gamesource.js';
import { compileTrialSource } from '../web/src/content/authoring/trialcompile.js';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
let groups = 0;
const readByte = (raw, offset) => Number.parseInt(raw.slice(offset * 2, offset * 2 + 2), 16);
const readWord = (raw, offset) => readByte(raw, offset) + readByte(raw, offset + 1) * 256;

// ① 生成物不得漂移：重新從固定源產生並與入庫模組逐位元組比對。
assert.equal(readFileSync(CHAPTER_BASE_OUTPUT, 'utf8'), renderChapterBaseModule(readPinnedChapterBase()));
assert.equal(CHAPTER_BASE.revision, readPinnedChapterBase().revision);
assert.equal(CHAPTER_BASE.cities.length, 192);
assert.equal(Object.hasOwn(CHAPTER_BASE, 'generals'), false); groups++;

// ② 空白模板：materialize 後形狀與位元組。
const template = async () => (await createPinnedCopyLoader({ kind: 'minimal' })({ gameId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ownerId: 'materialize-probe' })).game;
const game = await template(), chapterId = game.chapterOrder[0];
const state = materializeChapterState(game, chapterId, { era: 'ad', year: 196, month: 4, day: 1 });
assert.deepEqual(state.start, { era: 'ad', year: 196, month: 4, day: 1 });
assert.equal(state.factions.length, 0);
assert.equal(state.cities.length, 192);
assert.equal(state.generals.length, 128);
assert.equal(state.nativeCityRecordRaw.length, 192);
assert.deepEqual(state.nativeCityRecordRaw, state.cities.map(city => city.raw));
for (const [slot, city] of state.cities.entries()) {
  const base = CHAPTER_BASE.cities[slot][1];
  assert.equal(city.idx, slot);
  // 已證實欄位：中立所屬、空內政官。
  assert.equal(readByte(city.raw, 0x01), 0x18);
  assert.equal(readByte(city.raw, 0x19), 0xff);
  assert.equal(city.faction, null);
  assert.equal(city.governor, null);
  // 未證實位元組：border 旗標、名字指標區、災害強度、舊所屬、鄰接表逐位元組沿用原值。
  for (const [from, to] of [[0x00, 0x01], [0x02, 0x08], [0x14, 0x16], [0x17, 0x19], [0x1a, 0x1c], [0x1c, 0x20]])
    assert.equal(city.raw.slice(from * 2, to * 2), base.slice(from * 2, to * 2), `slot ${slot} bytes ${from}-${to}`);
  // 具名值與原生位元組同源。
  assert.equal(city.max_prod, readWord(city.raw, 0x0c));
  assert.equal(city.prod, readWord(city.raw, 0x0e));
  assert.equal(city.growth, readByte(city.raw, 0x10));
  assert.equal(city.defence, readByte(city.raw, 0x11));
  assert.equal(city.troops_cap, readByte(city.raw, 0x12));
  assert.equal(city.troops, readByte(city.raw, 0x13));
  assert.equal(city.view, readByte(city.raw, 0x16) >> 4);
  assert.equal(city.type, readByte(city.raw, 0x16) & 0x0f);
  assert.equal(city.x, readWord(city.raw, 0x08));
  assert.equal(city.y, readWord(city.raw, 0x0a));
  assert.equal(city.name, CHAPTER_BASE.cities[slot][0]);
}
// 128 槽是空位，不是身份：不帶姓名／頭像／能力，也沒有 generalId。
for (const [slot, general] of state.generals.entries()) {
  assert.equal(general.idx, slot);
  assert.equal(general.generalId, null);
  assert.equal(general.attr, 0);
  assert.equal(general.active, false);
  assert.equal(general.is_monarch, false);
  assert.equal(general.status, 0);
  assert.equal(general.captive_flag, 0xff);
  assert.equal(general.appear_months, 0);
  assert.equal(general.join_faction, null);
  assert.equal(general.faction, null);
  assert.equal(general.name, '');
  assert.equal(general.hao, '');
  assert.equal(general.portrait, 0);
  assert.deepEqual(general.ability, { siege: 0, field: 0, naval: 0, force: 0, lead: 0, politics: 0 });
} groups++;

// ③ 保存／active 門：空白章只欠「至少一個勢力」，其餘欄位全部齊備。
assert.deepEqual(chapterActiveGaps(state).map(gap => gap.code), ['chapter-factions']);
assert.deepEqual(validateGameSource(game, { draft: true }).map(gap => gap.code), ['chapter-factions']);
assert.throws(() => compileTrialSource(game, sha), /factions must include at least one entry/); groups++;

// ④ 試運行編譯：補上固定源第 1 章的勢力槽（第 4 步的寫入器尚未存在，這裡只借
// 原始勢力資料讓編譯器走到城市／原生位元組校驗），編譯必須成功。
const baseState = readInstalledEditorSource().chapters[0].state;
const completed = structuredClone(game), done = completed.chapters[chapterId].state;
done.factions = structuredClone(baseState.factions);
done.nativeFactionSlotRaw = structuredClone(baseState.nativeFactionSlotRaw);
done.n_factions = baseState.n_factions;
// 借用的內置勢力仍帶原版「首都據點 +01 不屬本勢力」的 8 個反例；作者章沒有 state._src
// 豁免，所以必須先把首都據點歸給該勢力，才可能零缺口（2026-11 用戶裁決）。
assert.ok(chapterActiveGaps(done).some(gap => /not owned by this faction/.test(gap.message)));
for (const [i, faction] of done.factions.entries()) {
  // 原版多個勢力共用同一首都據點，逐一改到互斥據點才能同時滿足「屬本勢力」。
  setFactionCapital(completed, chapterId, faction.idx, i);
  setChapterCityFaction(completed, chapterId, i, faction.idx);
}
assert.deepEqual(chapterActiveGaps(done), []);
const compiled = compileTrialSource(completed, sha);
assert.equal(compiled.roadGraph.nodes.length, 192);
assert.match(compiled.sourceDigest, /^[0-9a-f]{64}$/);
for (const node of compiled.roadGraph.nodes) assert.deepEqual([done.cities[node.id].x, done.cities[node.id].y], [node.x, node.y]); groups++;

// ⑤ 遊戲級常數（模型 C）：基礎資料持有 max_prod/type/view 時以它為準。
const overridden = await template(), slot0 = Object.values(overridden.cities).find(city => city.runtimeSlot === 0);
Object.assign(slot0, { max_prod: 21001, type: 3, view: 2, name: '測試據點' });
const overrideState = materializeChapterState(overridden, overridden.chapterOrder[0], { year: 200, month: 1, day: 1 });
assert.equal(overrideState.cities[0].max_prod, 21001);
assert.equal(overrideState.cities[0].type, 3);
assert.equal(overrideState.cities[0].view, 2);
assert.equal(overrideState.cities[0].name, '測試據點');
assert.equal(readWord(overrideState.cities[0].raw, 0x0c), 21001);
assert.equal(readByte(overrideState.cities[0].raw, 0x16), 2 * 16 + 3);
assert.equal(overrideState.cities[1].max_prod, readWord(CHAPTER_BASE.cities[1][1], 0x0c));
// 無 era 時不寫入紀年標籤（作者層標籤，不是原生欄位）。
assert.deepEqual(overrideState.start, { year: 200, month: 1, day: 1 }); groups++;

// ⑥ 拒絕面：重複 materialize、未知章、日期越界、固定源不符。
const twice = structuredClone(game);
assert.throws(() => materializeChapterState(twice, chapterId, { year: 196, month: 4, day: 1 }), /already materialized/);
const unknown = await template();
assert.throws(() => materializeChapterState(unknown, 'missing', { year: 196, month: 4, day: 1 }), /unknown chapter/);
for (const start of [{ year: 196, month: 13, day: 1 }, { year: 196, month: 4, day: 32 }, { year: 0, month: 4, day: 1 }, { year: 10000, month: 4, day: 1 },
  { year: 196, month: 4, day: 1, era: 'ce' }, { year: 196.5, month: 4, day: 1 }, { month: 4, day: 1 }]) {
  const candidate = await template();
  assert.throws(() => materializeChapterState(candidate, chapterId, start), RangeError);
}
const wrongSource = await template();
wrongSource.sourceRef.revision = 'map-2-deadbeef';
assert.throws(() => materializeChapterState(wrongSource, chapterId, { year: 196, month: 4, day: 1 }), /revision/);
const noSlot = await template();
delete noSlot.cities[Object.keys(noSlot.cities)[0]];
assert.throws(() => materializeChapterState(noSlot, chapterId, { year: 196, month: 4, day: 1 }), /fixed slot/);
const badConstant = await template();
Object.values(badConstant.cities).find(city => city.runtimeSlot === 0).view = 16;
assert.throws(() => materializeChapterState(badConstant, badConstant.chapterOrder[0], { year: 196, month: 4, day: 1 }), /out of range/); groups++;

// ⑦ 決定性：兩份獨立模板得到逐位元組相同的章節態。
const [left, right] = [await template(), await template()];
assert.equal(JSON.stringify(materializeChapterState(left, chapterId, { era: 'bc', year: 100, month: 2, day: 3 })),
  JSON.stringify(materializeChapterState(right, chapterId, { era: 'bc', year: 100, month: 2, day: 3 }))); groups++;

process.stdout.write(`${JSON.stringify({ groups, baseBytes: readFileSync(CHAPTER_BASE_OUTPUT).length,
  scope: 'pinned fixed source + minimal template only; no HTTP, save, native initialization or runtime grant' })}\n`);
