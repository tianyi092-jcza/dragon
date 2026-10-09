// Web authoring writer only. Existing imported chapter/slots, no role/initialization edits.
// KI signed24 F20..22 and u16 F04/06/08: editor-money-import / editor-reserve-compile.
import { BUILTIN_GAME_ID } from "../content/authoring/gamesource.js";
const fields = Object.freeze({ money: [0x20, 3, -0x800000, 0x7fffff], reserve_cav: [4, 2, 0, 65535], reserve_arc: [6, 2, 0, 65535], reserve_inf: [8, 2, 0, 65535] });
function rawRecord(value) { if (typeof value !== "string" || !/^[a-f0-9]{128}$/i.test(value)) throw new TypeError("章節勢力原始記錄不完整"); return value; }
function decoded(raw, offset, size, signed) {
  let value = 0; for (let i = 0; i < size; i++) value += Number.parseInt(raw.slice((offset + i) * 2, (offset + i + 1) * 2), 16) * 256 ** i;
  return signed && value >= 0x800000 ? value - 0x1000000 : value;
}
function locate(game, chapterId, slot) {
  if (game?.gameId === BUILTIN_GAME_ID || game?.sourceRef?.kind !== "builtin-copy" || game.sourceRef.sourceId !== BUILTIN_GAME_ID) throw new RangeError("僅可編輯獨立完整副本的既有章節資源");
  if (typeof chapterId !== "string" || !game.chapterOrder?.includes(chapterId) || !Object.hasOwn(game.chapters ?? {}, chapterId) || game.chapters[chapterId].chapterId !== chapterId) throw new RangeError("章節身份不符");
  const state = game.chapters[chapterId].state;
  if (!Array.isArray(state?.factions) || state.factions.length > 22 || !Number.isInteger(slot) || slot < 0 || slot >= state.factions.length || state.factions[slot]?.idx !== slot) throw new RangeError("公開勢力槽不符");
  if (!Array.isArray(state.nativeFactionSlotRaw) || state.nativeFactionSlotRaw.length !== 22) throw new TypeError("缺少固定勢力來源");
  for (let i = 0; i < 22; i++) rawRecord(state.nativeFactionSlotRaw[i]);
  const faction = state.factions[slot], raw = rawRecord(faction.raw), native = state.nativeFactionSlotRaw[slot];
  for (const [name, [offset, size]] of Object.entries(fields)) {
    const value = decoded(raw, offset, size, name === "money");
    if (faction[name] !== value || decoded(native, offset, size, name === "money") !== value) throw new RangeError("章節資源具名／原生來源分歧：" + name);
  }
  if (faction.money_hi !== decoded(raw, 0x22, 1, false)) throw new RangeError("章節資金高位來源分歧");
  return { state, faction };
}
export function editChapterResources(game, chapterId, slot, values) {
  const { faction } = locate(game, chapterId, slot);
  if (!values || typeof values !== "object" || ![Object.prototype, null].includes(Object.getPrototypeOf(values))) throw new TypeError("資源修改格式不符");
  const descriptors = Object.getOwnPropertyDescriptors(values), names = Reflect.ownKeys(descriptors);
  if (!names.length || names.some(name => typeof name !== "string" || !Object.hasOwn(fields, name) || !descriptors[name].enumerable || !Object.hasOwn(descriptors[name], "value"))) throw new TypeError("僅支援資金與三種預備兵池");
  const captured = {};
  for (const name of names) {
    const value = descriptors[name].value, [, , min, max] = fields[name];
    if (typeof value !== "number" || !Number.isInteger(value) || Object.is(value, -0) || value < min || value > max) throw new RangeError("章節資源表示範圍不符：" + name);
    captured[name] = value;
  }
  if (names.every(name => faction[name] === captured[name])) return game;
  const next = structuredClone(game), state = next.chapters[chapterId].state, record = state.factions[slot];
  for (const name of names) {
    const value = captured[name]; if (value === record[name]) continue;
    const [offset, size] = fields[name], unsigned = value < 0 ? value + 0x1000000 : value;
    const hex = Array.from({ length: size }, (_, i) => ((unsigned >>> (i * 8)) & 255).toString(16).padStart(2, "0")).join("");
    const replace = raw => raw.slice(0, offset * 2) + hex + raw.slice((offset + size) * 2);
    record[name] = value; record.raw = replace(record.raw); state.nativeFactionSlotRaw[slot] = replace(state.nativeFactionSlotRaw[slot]);
  }
  record.money_hi = decoded(record.raw, 0x22, 1, false); return next;
}
