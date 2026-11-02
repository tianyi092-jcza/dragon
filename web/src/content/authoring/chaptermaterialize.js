// 章節 materialize（Web 作者層約定，非原版機制）：把「空白章」從空殼變成
// 可寫入、可試運行的章節態。填法只有一個原證來源——固定源第 1 章同槽記錄
// （CHAPTER_BASE，即 copyBuiltinGame 取遊戲級常數的那一章）：
//   · 已證實欄位按作者層語義重寫（所屬勢力中立、內政官空、遊戲級常數）；
//   · 未證實的位元組（+0x00 border 旗標、+0x02..0x07、+0x14/+0x15、+0x17/
//     +0x18、+0x1A 舊所屬、+0x1C..+0x1F 鄰接表）一律沿用固定源原值，
//     不發明預設值；鄰接表同時被 compileTrialSource 拿去對道路圖，不得改寫。
// 章節態由建章動作產生，基礎資料歸遊戲：本函式只寫章節，不動 game.cities。
import { CHAPTER_BASE } from './chapterbase.generated.js';

const ERA_LABELS = Object.freeze(['bc', 'ad']);
// 與 gamesource.js 的章節屬性寫入器同一組位元組：+0x01 當前所屬（0x18＝中立）、
// +0x19 內政官（0xFF＝空）。+0x1A 是原版舊所屬，屬原始內容，永不改寫。
const OWNER_BYTE = 0x01, NEUTRAL_OWNER = 0x18, GOVERNOR_BYTE = 0x19, NO_GOVERNOR = 0xff;
// 城記錄欄位位置與寬度沿用 tools/content_pipeline.py 的編碼表（產生內置章
// 編譯產物的同一張表）：+0x08 x、+0x0A y、+0x0C 最大生產力、+0x0E 生產力、
// +0x10 上升值、+0x11 防災值、+0x12 城兵上限、+0x13 城兵、+0x16 觀感×16＋類型。
const FIELD_BYTES = Object.freeze({ x: [0x08, 2], y: [0x0a, 2], max_prod: [0x0c, 2], prod: [0x0e, 2],
  growth: [0x10, 1], defence: [0x11, 1], troops_cap: [0x12, 1], troops: [0x13, 1] });
const VIEW_TYPE_BYTE = 0x16;
const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const readByte = (raw, offset) => Number.parseInt(raw.slice(offset * 2, offset * 2 + 2), 16);
const readWord = (raw, offset) => readByte(raw, offset) + readByte(raw, offset + 1) * 256;
function writeField(raw, offset, width, value) {
  const at = offset * 2;
  const hex = Array.from({ length: width }, (_, i) => ((value >>> (i * 8)) & 255).toString(16).padStart(2, '0')).join('');
  return raw.slice(0, at) + hex + raw.slice(at + width * 2);
}
function captureStart(start) {
  if (!isPlainObject(start)) { throw new TypeError('chapter start values required'); }
  const captured = {};
  if (Object.hasOwn(start, 'era')) {
    if (!ERA_LABELS.includes(start.era)) { throw new RangeError('chapter era must be bc|ad'); }
    captured.era = start.era;
  }
  for (const [key, max] of [['year', 9999], ['month', 12], ['day', 31]]) {
    const value = start[key];
    if (!Number.isInteger(value) || Object.is(value, -0) || value < 1 || value > max) {
      throw new RangeError(`chapter ${key} must be an integer in 1..${max}`);
    }
    captured[key] = value;
  }
  return captured;
}
// 遊戲級據點常數（模型 C：max_prod/type/view 由基礎資料持有）。空白模板還沒有
// 這些欄位時退回固定源同槽原值，不另立預設；有值時範圍沿用編碼表可表達域。
function cityConstant(definition, name, max) {
  const value = definition[name];
  if (value === undefined) { return null; }
  if (!Number.isInteger(value) || value < 0 || value > max) { throw new RangeError(`city ${name} is out of range`); }
  return value;
}
// 空槽（Web 作者層）：槽位只是原生 128 條表的編碼位，不是身份。未登場槽不帶
// 姓名／頭像／能力，避免偽造身份；數值取 0 以滿足既有欄位域校驗。
const EMPTY_ABILITY = Object.freeze({ siege: 0, field: 0, naval: 0, force: 0, lead: 0, politics: 0 });
export function emptyGeneralSlot(idx) {
  if (!Number.isInteger(idx) || Object.is(idx, -0) || idx < 0 || idx > 127) throw new RangeError("general slot 0..127 required");
  return { idx, generalId: null, attr: 0, portrait: 0, name: "", hao: "", ability: { ...EMPTY_ABILITY },
    battle_rating: 0, assignment_budget: 0, battle_formation: 0, status: 0, talk_idx: 0,
    captive_flag: 0xff, appear_months: 0, join_faction: null, faction: null, active: false,
    is_monarch: false, specialty_low_bits: "000" };
}
export function materializeChapterState(game, chapterId, start) {
  if (!isPlainObject(game) || !isPlainObject(game.chapters)) { throw new TypeError('game source required'); }
  const chapter = game.chapters[chapterId];
  if (!isPlainObject(chapter) || !(game.chapterOrder ?? []).includes(chapterId)) { throw new RangeError(`unknown chapter: ${chapterId}`); }
  // 固定源身分必須一致：換了固定源就必須重新產生基線，不得拿舊位元組冒充。
  if (game.sourceRef?.revision !== CHAPTER_BASE.revision) { throw new RangeError('fixed source revision does not match the chapter base'); }
  const state = chapter.state;
  if (!isPlainObject(state)) { throw new TypeError('chapter state required'); }
  if ((state.cities ?? []).length || (state.generals ?? []).length) { throw new RangeError('chapter state is already materialized'); }
  const captured = captureStart(start);
  const bySlot = new Map();
  for (const definition of Object.values(game.cities ?? {})) { bySlot.set(definition.runtimeSlot, definition); }
  const cities = CHAPTER_BASE.cities.map(([name, base], slot) => {
    const definition = bySlot.get(slot);
    if (!definition) { throw new RangeError(`game has no 據點 at fixed slot ${slot}`); }
    const maxProd = cityConstant(definition, 'max_prod', 0xffff) ?? readWord(base, FIELD_BYTES.max_prod[0]);
    const view = cityConstant(definition, 'view', 15) ?? readByte(base, VIEW_TYPE_BYTE) >> 4;
    const type = cityConstant(definition, 'type', 5) ?? readByte(base, VIEW_TYPE_BYTE) & 0x0f;
    let raw = writeField(base, ...FIELD_BYTES.max_prod, maxProd);
    raw = writeField(raw, VIEW_TYPE_BYTE, 1, view * 16 + type);
    raw = writeField(raw, OWNER_BYTE, 1, NEUTRAL_OWNER);
    raw = writeField(raw, GOVERNOR_BYTE, 1, NO_GOVERNOR);
    return { idx: slot, name: definition.name ?? name, faction: null,
      max_prod: maxProd, prod: readWord(raw, FIELD_BYTES.prod[0]),
      growth: readByte(raw, FIELD_BYTES.growth[0]), defence: readByte(raw, FIELD_BYTES.defence[0]),
      troops: readByte(raw, FIELD_BYTES.troops[0]), troops_cap: readByte(raw, FIELD_BYTES.troops_cap[0]),
      type, view, governor: null,
      x: readWord(raw, FIELD_BYTES.x[0]), y: readWord(raw, FIELD_BYTES.y[0]), raw };
  });
  state.start = captured;
  // 128 槽是空位（不是身份）：空白章不伪造 128 个武將，身份由 generalId 承载。
  state.generals = Array.from({ length: 128 }, (_, slot) => emptyGeneralSlot(slot));
  state.factions = [];
  state.cities = cities;
  // fresh 的城記錄輸入（P37）就是同一批位元組，兩者必須逐槽一致。
  state.nativeCityRecordRaw = cities.map(city => city.raw);
  return state;
}
