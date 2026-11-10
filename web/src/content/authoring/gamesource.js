// GameSource@1 local copy + validation (editor contract §1; no backend).
// Admin full copy carries all chapters/persons/affiliations with fresh game
// identity, sourceRef溯源, slot bindings and an id roster; ordinary minimal
// copy carries map/components/roads/base cities with empty chapters. Local
// ids stay byte-identical (identity is game-scoped per §1.1); chapter ids
// are namespaced and internal chapter refs rewritten. Draft/model fields
// owned by the server (ownerId/dates) are recorded as local placeholders,
// never trusted as authority. Deterministic: no timestamps/randomness.
// Rule profile: ki-1995/web-0.1.1 (shared, never renamed per game).
import { validateMapSource } from "./mapcompile.js";
import { deriveSlots } from "./roadedit.js";
import { captureChapterCities } from "./cityrecords.js";
import { emptyGeneralSlot, materializeChapterState } from "./chaptermaterialize.js";
import { CHAPTER_BASE } from "./chapterbase.generated.js";
import { decodeFactionSlot } from "../../game/nativefactions.js";
import { CITY_BASE_NUMBERS, CITY_SHARED_INVARIANTS } from "./cityrecords.js";
import { factionNativeConsistencyGaps } from "./factionconsistency.js";

export const GAMESOURCE_SCHEMA = 1;
export const GAME_RULE_PROFILE = "ki-1995/web-0.1.1";
export const BUILTIN_GAME_ID = "wolong-builtin";

// (ii) 立法＋修正案 A（用户批准 2026-10-10，非原版机制）：保存门（必填＋连接性）与 active 门
// （全字段＋交叉＋计数）。一般数值不猜规则范围；能力另核已证存储表示，非可玩值域。
// faction/join_faction 经内置章反例证非严格外键，不验；将数暂锁 128 dense、城数 192 锁，章节/势力开放。
const GENERAL_NUMBER_FIELDS = ["idx","attr","portrait","battle_rating","assignment_budget","battle_formation","status","talk_idx","captive_flag","appear_months"];
// KI G+0E..10 high nibble; G+11..13 full byte. See editor-ability-import.md.
// Reject impossible representations without granting high-value author/runtime admission.
export const ABILITY_LIMITS = Object.freeze({ siege: 15, field: 15, naval: 15, force: 255, lead: 255, politics: 255 });
const CITY_NUMBER_FIELDS = ["idx","max_prod","prod","growth","defence","troops","troops_cap","type","view"];
const FACTION_NUMBER_FIELDS = ["idx","attr","monarch_idx","capital","n_generals","money","legion_morale_cap","reserve_cav","reserve_arc","reserve_inf","n_cities","bellicosity","talk_style","march_marker_style"];
const FACTION_NULLABLE_NUMBER_FIELDS = ["advisor_idx","diplomat_idx","target_faction","strategic_city_primary","strategic_city_secondary"];
const isFiniteNumber = (v) => typeof v === "number" && Number.isFinite(v);
function pushNumberFields(record, fields, label, gaps, code) {
  for (const f of fields) if (!isFiniteNumber(record?.[f])) gaps.push({ code, subject: label, message: `${label}.${f} must be a finite number` });
}
// 保存门：必填缺失或已提供的保真字段格式错误均拒存；不验 active。
// 连接性由 map roads 既有校验覆盖。
export function chapterSaveGaps(state, chapterId = "?") {
  const gaps = [];
  for (const [i, g] of (state?.generals ?? []).entries()) {
    const label = `chapter ${chapterId} general[${i}]`;
    // 未登場槽是空位，不是身份（2026-11 用戶裁決）：只有已登場槽必須有姓名／頭像。
    // 登場旗標以原生 attr bit7 為準，作者層 active 由同一寫入器同步。
    if (((g?.attr ?? 0) & 0x80) === 0) continue;
    if (typeof g?.name !== "string" || !g.name.trim()) gaps.push({ code: "entity-save", subject: label, message: `${label}.name is required` });
    if (!Number.isInteger(g?.portrait)) gaps.push({ code: "entity-save", subject: label, message: `${label}.portrait is required` });
    // Optional imported G0E/G0F/G10 low nibbles; never infer zero for old sources.
    if (g != null && Object.hasOwn(g, "specialty_low_bits") &&
        (typeof g.specialty_low_bits !== "string" || !/^[0-9a-f]{3}$/.test(g.specialty_low_bits)))
      gaps.push({ code: "entity-save", subject: label, message: `${label}.specialty_low_bits must be three lowercase hex nibbles` });
  }
  for (const [i, c] of (state?.cities ?? []).entries()) {
    const label = `chapter ${chapterId} city[${i}]`;
    if (typeof c?.name !== "string" || !c.name.trim()) gaps.push({ code: "entity-save", subject: label, message: `${label}.name is required` });
    // 连接性走 map roads（既有校验），安装源 city 记录本无 connections 字段，不在此设保存门。
  }
  return gaps;
}
// active 门：保存门＋全字段＋交叉＋计数。试玩 issue 与发布编译共用（单源）。
export function chapterActiveGaps(state, chapterId = "?") {
  const gaps = [...chapterSaveGaps(state, chapterId)];
  const generals = Array.isArray(state?.generals) ? state.generals : [];
  const cities = Array.isArray(state?.cities) ? state.cities : [];
  const factions = Array.isArray(state?.factions) ? state.factions : [];
  if (generals.length !== 128) gaps.push({ code: "entity-count", subject: `chapter ${chapterId}`, message: `chapter ${chapterId} generals must be 128 dense (locked)` });
  if (cities.length !== 192) gaps.push({ code: "entity-count", subject: `chapter ${chapterId}`, message: `chapter ${chapterId} cities must be 192 (locked)` });
  // Web product Q40 (game-editor-design §4.5), not an original-game formula:
  // incomplete drafts may have no factions, but cannot enter Trial/publication.
  if (!factions.length) gaps.push({ code: "chapter-factions", subject: `chapter ${chapterId}`, message: `chapter ${chapterId} factions must include at least one entry` });
  const gidx = new Set(), cidx = new Set(), fids = new Set();
  for (const g of generals) {
    if (!Number.isInteger(g?.idx) || g.idx < 0 || g.idx > 127 || gidx.has(g.idx)) gaps.push({ code: "entity-count", subject: `chapter ${chapterId}`, message: `general idx must be unique 0..127` });
    else gidx.add(g.idx);
  }
  for (const c of cities) {
    if (!Number.isInteger(c?.idx) || c.idx < 0 || c.idx > 191 || cidx.has(c.idx)) gaps.push({ code: "entity-count", subject: `chapter ${chapterId}`, message: `city idx must be unique 0..191` });
    else cidx.add(c.idx);
  }
  // Fixed-profile public identities: KI 3E4C..3E55 steps 40h to 580h.
  // Physical slots 22/23 stay in native data, not this public faction list.
  // Uniqueness is the authoring identity contract, not a new rule formula.
  for (const fa of factions) {
    if (!Number.isInteger(fa?.idx) || fa.idx < 0 || fa.idx > 21 || fids.has(fa.idx)) gaps.push({ code: "entity-count", subject: `chapter ${chapterId}`, message: "faction idx must be unique 0..21" });
    else fids.add(fa.idx);
  }
  for (const [i, g] of generals.entries()) {
    const label = `chapter ${chapterId} general[${i}]`;
    pushNumberFields(g, GENERAL_NUMBER_FIELDS, label, gaps, "entity-field");
    if (typeof g?.name !== "string" || typeof g?.hao !== "string") gaps.push({ code: "entity-field", subject: label, message: `${label}.name/hao must be strings` });
    if (isPlainObject(g?.ability)) {
      for (const [field, max] of Object.entries(ABILITY_LIMITS)) {
        const value = g.ability[field];
        if (!Number.isInteger(value) || value < 0 || value > max) gaps.push({ code: "entity-field", subject: `${label}.ability`, message: `${label}.ability.${field} must be an integer in 0..${max}` });
      }
    } else gaps.push({ code: "entity-field", subject: label, message: `${label}.ability must be an object` });
    for (const f of ["join_faction","faction"]) if (g?.[f] !== null && g?.[f] !== undefined && !Number.isInteger(g[f])) gaps.push({ code: "entity-field", subject: label, message: `${label}.${f} must be an integer or null` });
  }
  for (const [i, c] of cities.entries()) {
    const label = `chapter ${chapterId} city[${i}]`;
    pushNumberFields(c, CITY_NUMBER_FIELDS, label, gaps, "entity-field");
    if (typeof c?.name !== "string") gaps.push({ code: "entity-field", subject: label, message: `${label}.name must be a string` });
    for (const f of ["faction","governor"]) if (c?.[f] !== null && c?.[f] !== undefined && !Number.isInteger(c[f])) gaps.push({ code: "entity-field", subject: label, message: `${label}.${f} must be an integer or null` });
    if (c?.governor !== null && c?.governor !== undefined && !gidx.has(c.governor)) gaps.push({ code: "entity-ref", subject: label, message: `${label} governor ${c.governor} is unknown` });
    // city.faction 与武将 faction 系同经内置章反例证非严格外键，只验类型；连接性由 map roads 覆盖。
  }
  for (const [i, fa] of factions.entries()) {
    const label = `chapter ${chapterId} faction[${i}]`;
    pushNumberFields(fa, FACTION_NUMBER_FIELDS, label, gaps, "entity-field");
    for (const f of FACTION_NULLABLE_NUMBER_FIELDS) if (fa?.[f] !== null && fa?.[f] !== undefined && !Number.isInteger(fa[f])) gaps.push({ code: "entity-field", subject: label, message: `${label}.${f} must be an integer or null` });
    if (!gidx.has(fa?.monarch_idx)) gaps.push({ code: "entity-ref", subject: label, message: `${label} monarch ${fa?.monarch_idx} is unknown` });
    if (fa?.advisor_idx !== null && fa?.advisor_idx !== undefined && !gidx.has(fa.advisor_idx)) gaps.push({ code: "entity-ref", subject: label, message: `${label} advisor ${fa.advisor_idx} is unknown` });
    if (!cidx.has(fa?.capital)) gaps.push({ code: "entity-ref", subject: label, message: `${label} capital ${fa?.capital} is unknown` });
  }
  // 首都必須屬本勢力，且一個據點只能被一個勢力當首都（Web 作者層，2026-11 用戶裁決：
  // 「不可能把首都設置在別人據點」「一個首都據點只能被一個勢力所有，不共用」）。
  // 內置章不套：原版 8 個內置勢力的首都據點 +01 並不屬於該勢力，且多個勢力共用
  // 同一首都據點，屬原始內容；以 state._src（內置章來源標記，複製章沿用）豁免。
  if (!Object.hasOwn(state ?? {}, "_src")) {
    const owner = new Map(cities.map(c => [c?.idx, c?.faction ?? null]));
    const claimed = new Map();
    for (const [i, fa] of factions.entries()) {
      if (fa?.capital === null || fa?.capital === undefined) continue;
      const label = `chapter ${chapterId} faction[${i}]`;
      if (owner.get(fa.capital) !== fa.idx) gaps.push({ code: "entity-ref", subject: label, message: `${label} capital ${fa.capital} is not owned by this faction` });
      if (claimed.has(fa.capital)) gaps.push({ code: "entity-ref", subject: label, message: `${label} capital ${fa.capital} is already the capital of faction[${claimed.get(fa.capital)}]` });
      else claimed.set(fa.capital, i);
    }
  }
  // 太守與身份必須一致：原版任命（0x6AD8..0x6AEA）同時寫 city[+0x19] 與
  // general[+0x17]=2，所以「據點有太守但該武將身份不是內政官（2）」是作者層的
  // 不一致宣告，必須報出而不是靜默接受。內置 20 章此欄全為空，不衝突。
  for (const [i, c] of cities.entries()) {
    if (c?.governor === null || c?.governor === undefined) continue;
    const holder = generals.find(g => g?.idx === c.governor);
    if (holder && holder.status !== 2) gaps.push({ code: "entity-field", subject: `chapter ${chapterId} city[${i}]`, message: `chapter ${chapterId} city[${i}] governor ${c.governor} has status ${holder.status ?? null}, expected 2` });
  }
  gaps.push(...factionNativeConsistencyGaps(state, chapterId));
  return gaps;
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function assertFiniteJson(value, at) {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new RangeError(`non-finite number at ${at}`);
    return;
  }
  if (value === undefined) throw new TypeError(`undefined hole at ${at}`);
  if (typeof value === "function") throw new TypeError(`function at ${at}`);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      if (!Object.hasOwn(value, i)) throw new TypeError(`array hole at ${at}[${i}]`);
      assertFiniteJson(value[i], `${at}[${i}]`);
    }
    return;
  }
  if (isPlainObject(value)) {
    for (const key of Object.keys(value)) assertFiniteJson(value[key], `${at}.${key}`);
  }
}

function canonicalize(value) {
  assertFiniteJson(value, "$");
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function canonicalDigest(value, sha256hex) {
  return sha256hex(canonicalize(value));
}

// §1 name rules: trim+NFC, case-sensitive, code-point count, no control
// chars or lone surrogates, author's own script kept (no conversion).
export function checkGameName(name, limit) {
  if (typeof name !== "string") throw new TypeError("name must be a string");
  const norm = name.trim().normalize("NFC");
  if (norm !== name.trim()) throw new RangeError("name must already be NFC-normalized");
  if ([...norm].length > limit) throw new RangeError(`name exceeds ${limit} code points`);
  for (const ch of norm) {
    const code = ch.codePointAt(0);
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f))
      throw new RangeError("name contains control characters");
    if (code >= 0xd800 && code <= 0xdfff) throw new RangeError("name contains surrogates");
  }
  return norm;
}

function deepClone(value) {
  try {
    return structuredClone(value);
  } catch (error) {
    throw new TypeError(`game source value is not cloneable: ${error?.message ?? error}`);
  }
}

function assertGameId(gameId) {
  if (typeof gameId !== "string" || !gameId || gameId.length > 128)
    throw new TypeError("gameId must be a non-empty opaque string");
  if (/\s/.test(gameId)) throw new RangeError("gameId must not contain whitespace");
}

// source = { revision, world, chapters: [{ id, state }] } (parsed, trusted
// built-in inputs). kind: "full" (admin) | "minimal" (ordinary new game).
export function copyBuiltinGame({ gameId, ownerId, kind, source }, sha256hex) {
  assertGameId(gameId);
  if (gameId === BUILTIN_GAME_ID) throw new RangeError("cannot copy onto the built-in identity");
  if (kind !== "full" && kind !== "minimal") throw new RangeError("kind must be full|minimal");
  if (typeof sha256hex !== "function") throw new TypeError("sha256hex digest function required");
  const world = deepClone(source.world);
  const chapters = deepClone(source.chapters);
  const revision = source.revision;
  if (typeof revision !== "string" || !revision) throw new TypeError("source revision required");

  const digest = sha256hex(
    canonicalize({ gameId: BUILTIN_GAME_ID, revision, world, chapters, map: source.map,
      componentDefinitions: source.componentDefinitions ?? {}, compatibilityAssets: source.compatibilityAssets ?? null }),
  );
  const game = {
    schemaVersion: GAMESOURCE_SCHEMA,
    gameId,
    ruleProfile: GAME_RULE_PROFILE,
    sourceRef: { kind: kind === "full" ? "builtin-copy" : "builtin-template", sourceId: BUILTIN_GAME_ID, revision, digest },
    metadata: { name: "", introduction: "" },
    map: null,
    componentDefinitions: {},
    cities: {},
    generals: {},
    chapters: {},
    chapterOrder: [],
    assets: {},
    compatibility: { slotBindings: { cities: {}, generals: {} }, idMap: { chapters: {} } },
    // Local placeholders for server-owned model fields (never authority).
    localModel: { ownerId: ownerId ?? null, draftRevision: "1" },
  };

  // Map + components + roads + placements + base cities (both kinds).
  game.map = deepClone(source.map);
  // Backfill E717 slot occupancy (certified derivation) so road edits see
  // complete slot data; M2 artifacts predate slot storage.
  {
    const citiesById = new Map((game.map.placements ?? []).map((p) => [p.cityId, p]));
    for (const road of game.map.roads ?? []) {
      road.nativeBinding = road.nativeBinding ?? {};
      if (!Array.isArray(road.nativeBinding.slots)) {
        const [src, tgt] = deriveSlots(road.geometry, citiesById.get(road.fromCityId));
        road.nativeBinding.slots = [
          { node: road.fromCityId, ...src },
          { node: road.toCityId, ...tgt },
        ];
      }
    }
  }
  game.componentDefinitions = deepClone(source.componentDefinitions ?? {});
  if (source.compatibilityAssets !== undefined) game.compatibilityAssets = deepClone(source.compatibilityAssets);
  // Existing studio grass now carries an explicit original-byte recipe;
  // its name/color never computes rule terrain. Other recipes must be
  // supplied and validated, not silently ignored by the compiler.
  game.componentDefinitions["deco-grass"] = { id: "deco-grass", kind: "grass", layer: "decor", tile: 0x10,
    revision: "original-byte-1", category: "atomic-original", footprint: [[0, 0]], anchor: [0, 0],
    ruleRecipeRef: "ki-byte-stamp-1", visualRef: "MMAP.MDL:tile-16",
    variants: { original: { tiles: [[0, 0, 0x10]] } } };
  for (const city of world.cities ?? []) {
    if (!city || typeof city.id !== "string") throw new TypeError("world city needs a stable id");
    game.cities[city.id] = { cityId: city.id, runtimeSlot: city.index, x: city.x, y: city.y };
    game.compatibility.slotBindings.cities[city.id] = city.index;
  }

  if (kind === "full") {
    // 游戏级基础资料（用户 2026-11 定，依原版字段表）：max_prod/type/view 在 20 章
    // 完全一致，是硬共享属性；prod／growth／defence／troops（当前生产力／上升值／
    // 防灾值／城兵）逐章演化，只从原版第一章取一次作为新章默认值，不拉平。
    const base = chapters[0]?.state?.cities ?? [];
    const bySlot = new Map(base.map((city) => [city.idx, city]));
    for (const city of world.cities ?? []) {
      const record = bySlot.get(city.index);
      const definition = game.cities[city.id];
      if (!record) throw new TypeError(`source chapter 1 lacks city slot ${city.index}`);
      if (typeof record.name === "string" && record.name) definition.name = record.name;
      for (const name of CITY_BASE_NUMBERS) {
        if (!Object.hasOwn(record, name)) continue;
        if (!Number.isSafeInteger(record[name]) || record[name] < 0 || record[name] > 65535)
          throw new RangeError(`source city ${city.index} ${name} is out of range`);
        definition[name] = record[name];
      }
    }
    // 硬共享字段必须是章节无关常量：新固定源若在某章另有取值，必须停下核对，
    // 而不是静默取第一章把差异抹平。默认值字段（prod/growth/defence/troops）
    // 逐章不同属正常，不在此列。
    for (const chapter of chapters.slice(1)) {
      for (const record of chapter.state.cities ?? []) {
        const definition = game.cities[world.cities[record.idx].id];
        for (const name of CITY_SHARED_INVARIANTS) {
          if (Object.hasOwn(definition, name) && record[name] !== definition[name])
            throw new RangeError(`source ${name} differs by chapter: ${chapter.id} slot ${record.idx}`);
        }
      }
    }
    for (const chapter of chapters) {
      const newId = `${gameId}#${chapter.id}`;
      game.compatibility.idMap.chapters[chapter.id] = newId;
      game.chapters[newId] = { chapterId: newId, sourceChapterId: chapter.id, state: chapter.state };
      game.chapterOrder.push(newId);
      // 武將庫默認為空（B5）：原章武將只留在 chapter.state，遊戲級庫由
      // 「從底層資源導入」建立。只保留槽位綁定，不寫入舊槽位字典。
      for (const general of chapter.state.generals ?? []) game.compatibility.slotBindings.generals[general.idx] = general.idx;
    }
    game.metadata.name = `测试复制`;
  }
  validateGameSource(game);
  return game;
}

// Named-vs-raw old-owner inventory (E-04 diagnostic): a city's raw
// old-owner byte (+0x1A) is original record content and may name a faction
// record that does not exist (e.g. ch6 city 184 蒼梧 -> 12). Such entries
// boot with reconstruction writes plus the dead-slot skips in
// originalroadarrival/originalcity (DOS reads dead slot memory no modeled
// reader can observe). Non-fatal drift (record exists, or 0x18 neutral
// alias) behaves the same. Diagnostic only: never a silent fix, never a
// trial/publish refusal. Returns { fatal, notes } with exact city lists
// ("fatal" = would-have-held pre-fix, kept as a pin).
export function checkChapterDrift(game) {
  const fatal = [];
  const notes = [];
  for (const [chapterId, chapter] of Object.entries(game.chapters ?? {})) {
    const state = chapter.state ?? chapter;
    const factions = state.factions ?? [];
    const raws = state.nativeCityRecordRaw ?? [];
    for (const city of state.cities ?? []) {
      const raw = raws[city.idx];
      const rawOwner = typeof raw === "string" && /^[0-9a-fA-F]+$/.test(raw)
        ? Number.parseInt(raw.slice(0x1a * 2, 0x1a * 2 + 2), 16)
        : null;
      if (rawOwner == null || rawOwner === city.faction) continue;
      if (rawOwner !== 0x18 && !factions.some((f) => f?.idx === rawOwner)) {
        fatal.push({ chapter: chapterId, city: city.idx, named: city.faction, rawOwner });
      } else {
        notes.push({ chapter: chapterId, city: city.idx, named: city.faction, rawOwner });
      }
    }
  }
  return { fatal, notes };
}

// Structural + ownership + digest validation (compile pipeline entry gate).
export function validateGameSource(game, options = {}) {
  const { draft = false } = options ?? {};
  if (!isPlainObject(game)) throw new TypeError("game source must be an object");
  if (!isPlainObject(game)) throw new TypeError("game source must be an object");
  if (game.schemaVersion !== GAMESOURCE_SCHEMA) throw new RangeError("unsupported GameSource schema");
  assertGameId(game.gameId);
  if (game.ruleProfile !== GAME_RULE_PROFILE) throw new RangeError("unsupported rule profile");
  const ref = game.sourceRef;
  if (!isPlainObject(ref) || typeof ref.sourceId !== "string" || typeof ref.revision !== "string" || typeof ref.digest !== "string")
    throw new RangeError("sourceRef must carry sourceId/revision/digest");
  if (game.map == null) throw new TypeError("game source requires a map");
  const diagnostics = validateMapSource({ schemaVersion: 1, map: game.map, componentDefinitions: game.componentDefinitions ?? {} }, options);
  const cityIds = Object.keys(game.cities ?? {});
  if (cityIds.length !== 192) throw new RangeError("game source requires 192 cities");
  const slots = new Set();
  for (const [id, city] of Object.entries(game.cities)) {
    if (city.cityId !== id) throw new RangeError(`city key/ref mismatch: ${id}`);
    if (!Number.isInteger(city.runtimeSlot) || city.runtimeSlot < 0 || city.runtimeSlot > 191)
      throw new RangeError(`city ${id} needs a fixed runtime slot`);
    if (slots.has(city.runtimeSlot)) throw new RangeError("duplicate city runtime slot");
    slots.add(city.runtimeSlot);
  }
  for (const road of game.map.roads ?? []) {
    if (!(road.fromCityId in (game.cities ?? {})) || !(road.toCityId in (game.cities ?? {})))
      throw new RangeError(`road ${road.id} references an unknown city`);
  }
  for (const place of game.map.placements ?? []) {
    if (!(place.cityId in (game.cities ?? {}))) throw new RangeError("placement references an unknown city");
  }
  for (const chapterId of game.chapterOrder ?? []) {
    if (!game.chapters?.[chapterId]) throw new RangeError(`chapterOrder references missing ${chapterId}`);
  }
  if (!/^\d+$/.test(game.localModel?.draftRevision ?? "")) throw new RangeError("draftRevision must be a decimal string");
  // (ii) 两级门：保存门缺即拒存；active 门在草稿下记诊断、严格下拒发布/编译。
  for (const [chapterId, chapter] of Object.entries(game.chapters ?? {})) {
    const state = chapter?.state ?? chapter;
    // chapterActiveGaps 首段即保存门缺口：任何模式都拒存；其余 active 缺口草稿记诊断、严格拒收。
    for (const gap of chapterActiveGaps(state, chapterId)) {
      if (gap.code === "entity-save" || !draft) throw new RangeError(gap.message);
      diagnostics.push({ code: gap.code, subject: gap.subject, message: gap.message });
    }
  }
  assertFiniteJson(game, "game");
  return diagnostics;
}

// 全章匯總校驗（上架前；Web 產品決定 2026-11，工作台結構合同 §8／批次 B8）。
// 一次遍歷 chapterOrder 全部章，列出「哪些章因基礎資料缺失而引用不到」：
// ① chapterOrder 指向不存在的章；② chapter.people 指向武將庫已刪除的定義；
// ③ chapter.cities（作者層中立據點配置）指向不存在的據點定義；
// ④ 章節原生據點記錄的固定槽在底層據點定義中已無對應。
// 保存期的引用守衛（generaldefinitions.js 拒絕刪除被引用定義、據點 192 鎖）仍是
// 第一道門；本函式不改寫資料、不推定成因，也不替代單章的章節屬性缺口清單。
export function chapterBaseReferenceGaps(game) {
  if (!isPlainObject(game)) throw new TypeError("game source required");
  const gaps = [];
  const definitions = isPlainObject(game.cities) ? game.cities : {};
  const library = isPlainObject(game.generals) ? game.generals : {};
  const chapters = isPlainObject(game.chapters) ? game.chapters : {};
  const slots = new Set(Object.values(definitions).map(city => city?.runtimeSlot).filter(slot => Number.isInteger(slot)));
  for (const chapterId of game.chapterOrder ?? []) {
    const chapter = chapters[chapterId];
    if (!isPlainObject(chapter)) {
      gaps.push({ chapterId, chapterName: null, code: "CHAPTER_MISSING", detail: "章節索引指向不存在的章節" });
      continue;
    }
    // 章名只作顯示：沒有作者命名時留 null，由呼叫端退回章節 id（不偽造名稱）。
    const name = typeof chapter.name === "string" && chapter.name.trim() ? chapter.name : null;
    const add = (code, detail) => gaps.push({ chapterId, chapterName: name, code, detail });
    if (isPlainObject(chapter.people))
      for (const generalId of Object.keys(chapter.people))
        if (!Object.hasOwn(library, generalId)) add("CHAPTER_GENERAL_MISSING", `武將庫已無本章引用的武將：${generalId}`);
    if (isPlainObject(chapter.cities))
      for (const cityId of Object.keys(chapter.cities))
        if (!Object.hasOwn(definitions, cityId)) add("CHAPTER_CITY_MISSING", `據點定義已無本章引用的據點：${cityId}`);
    for (const city of Array.isArray(chapter.state?.cities) ? chapter.state.cities : [])
      if (Number.isInteger(city?.idx) && !slots.has(city.idx)) add("CHAPTER_CITY_SLOT_MISSING", `底層據點已無固定槽 ${city.idx}`);
  }
  return gaps;
}
// 依章分組的同源視圖：上架門與「校驗整個遊戲」入口共用同一份判定。
export function chapterReferenceReport(game) {
  const byChapter = new Map();
  for (const gap of chapterBaseReferenceGaps(game)) {
    const bucket = byChapter.get(gap.chapterId) ?? { chapterId: gap.chapterId, chapterName: gap.chapterName, problems: [] };
    bucket.problems.push({ code: gap.code, detail: gap.detail });
    byChapter.set(gap.chapterId, bucket);
  }
  return [...byChapter.values()];
}

// §4.5 chapter CRUD (draft-level; publish gates live in the route layer).
// Blank/copy/delete/rename touch only { chapters, chapterOrder }; the shared
// map is never cloned (Q28: copy is config-only).
function chapterEntry(game, chapterId) {
  if (typeof chapterId !== "string" || !chapterId) throw new RangeError("chapter id required");
  const chapter = game.chapters?.[chapterId];
  if (!chapter || !(game.chapterOrder ?? []).includes(chapterId)) throw new RangeError(`unknown chapter ${chapterId}`);
  return chapter;
}
function freshChapterId(game, stem) {
  let n = (game.chapterOrder ?? []).length + 1, id = `${game.gameId}#${stem}-${n}`;
  while (game.chapters?.[id]) { n += 1; id = `${game.gameId}#${stem}-${n}`; }
  return id;
}
// options { name, start }: 章節創作（Web 作者層）——帶 start 時一併產生章節態
// （chaptermaterialize：固定源第 1 章同槽值），使新章立即可寫入據點／人物；
// 不帶 options 時保持原「空殼」形狀，供固定副本結構回放等內部投影使用。
export function addBlankChapter(game, options = {}) {
  if (!isPlainObject(game) || !isPlainObject(game.chapters) || !Array.isArray(game.chapterOrder)) throw new TypeError("game source required");
  const chapterId = freshChapterId(game, "custom");
  game.chapters[chapterId] = { chapterId, name: "新章节", state: { factions: [], generals: [], cities: [] } };
  // D1 materialize: a new chapter references every game-level 据点 definition
  // neutrally. Fixed attributes stay game-level; only ownership is per chapter.
  if (isPlainObject(game.cities)) {
    const cities = {};
    for (const cityId of Object.keys(game.cities)) cities[cityId] = { factionId: null, overrides: {} };
    if (Object.keys(cities).length) game.chapters[chapterId].cities = cities;
  }
  game.chapterOrder.push(chapterId);
  if (options.start !== undefined) materializeChapterState(game, chapterId, options.start);
  if (options.name !== undefined) renameChapter(game, chapterId, options.name);
  return chapterId;
}
export function copyChapterInGame(game, chapterId) {
  if (!isPlainObject(game)) throw new TypeError("game source required");
  const source = chapterEntry(game, chapterId);
  const id = freshChapterId(game, "copy");
  game.chapters[id] = { ...deepClone(source), chapterId: id, sourceChapterId: source.sourceChapterId ?? chapterId, name: `${source.name ?? chapterId}（副本）` };
  game.chapterOrder.push(id);
  return id;
}
// 章节序号＝chapterOrder 里的位置（2026-11 用户裁决：允许重排，不新增 ordinal 字段）。
// 只改顺序，不动章节内容；toIndex 是重排后的位置。
export function moveChapter(game, chapterId, toIndex) {
  if (!isPlainObject(game) || !Array.isArray(game.chapterOrder)) throw new TypeError("game source required");
  chapterEntry(game, chapterId);
  const order = game.chapterOrder, from = order.indexOf(chapterId);
  if (!Number.isInteger(toIndex) || Object.is(toIndex, -0) || toIndex < 0 || toIndex >= order.length)
    throw new RangeError(`chapter position 0..${order.length - 1} required`);
  if (from < 0 || from === toIndex) return { from, toIndex: from };
  const next = order.filter(id => id !== chapterId);
  next.splice(toIndex, 0, chapterId);
  game.chapterOrder = next;
  return { from, toIndex };
}
export function deleteChapter(game, chapterId) {
  if (!isPlainObject(game)) throw new TypeError("game source required");
  chapterEntry(game, chapterId);
  delete game.chapters[chapterId];
  game.chapterOrder = game.chapterOrder.filter(id => id !== chapterId);
}
export function renameChapter(game, chapterId, name) {
  if (!isPlainObject(game)) throw new TypeError("game source required");
  chapterEntry(game, chapterId);
  // Normalize before applying the existing display-name budget and text
  // checks. 16 碼點是 2026-11 用戶裁決的章節標題上限（游戲名仍用各自上限），
  // 不是原版引擎欄位限制。
  if (typeof name !== "string" || !name.trim()) throw new RangeError("chapter name required");
  const normalized = name.trim().normalize("NFC");
  checkGameName(normalized, 16);
  game.chapters[chapterId].name = normalized;
}
// Stronghold references (§4.2): placement status and reference lists are
// derived, never stored. Base cities are 192-locked with frozen slots/coords
// (certified model), so deletion is check-only: the blocker list is the
// deliverable, including the count lock itself.
export function cityReferences(game, cityId) {
  if (!isPlainObject(game)) throw new TypeError("game source required");
  const city = game.cities?.[cityId];
  if (!isPlainObject(city) || city.cityId !== cityId) throw new RangeError(`unknown city: ${cityId}`);
  const placed = (game.map?.placements ?? []).some(place => place?.cityId === cityId);
  const roads = (game.map?.roads ?? []).filter(road => road?.fromCityId === cityId || road?.toCityId === cityId).map(road => road.id);
  const slot = city.runtimeSlot, chapters = [], references = [];
  for (const chapterId of game.chapterOrder ?? []) {
    const chapter = game.chapters?.[chapterId], state = chapter?.state;
    // Explicit authoring references are separate from native slot records.
    // Validate the whole present configuration; unknown shapes are not empty.
    const configured = chapter && Object.hasOwn(chapter, 'cities') ? captureChapterCities(game, chapter) : null;
    const authoringReference = configured !== null && Object.hasOwn(configured, cityId);
    const record = state?.cities?.find(row => row?.idx === slot);
    if (record || authoringReference) chapters.push(chapterId);
    if (authoringReference) references.push({ chapterId, code: "CITY_AUTHORING_REF", detail: "本章中立據點配置" });
    if (record) {
      if (record.faction !== null && record.faction !== undefined) references.push({ chapterId, code: "CITY_FACTION_REF", detail: `所屬勢力：#${record.faction}` });
      if (record.governor !== null && record.governor !== undefined) references.push({ chapterId, code: "CITY_GOVERNOR_REF", detail: `太守武將：#${record.governor}` });
    }
    for (const faction of state?.factions ?? []) {
      if (faction?.capital === slot) references.push({ chapterId, code: "CITY_CAPITAL_REF", detail: `勢力 #${faction.idx} 首都` });
    }
  }
  return { cityId, runtimeSlot: slot, x: city.x, y: city.y, placed, roads, chapters, references };
}
export function checkCityDeletable(game, cityId) {
  const refs = cityReferences(game, cityId);
  const blockers = [];
  if (refs.placed) blockers.push({ code: "CITY_PLACED", detail: "据点已放入地图，须先从地图移除" });
  for (const roadId of refs.roads) blockers.push({ code: "CITY_ROAD_REF", detail: `道路引用：${roadId}` });
  for (const chapterId of refs.chapters) blockers.push({ code: "CITY_CHAPTER_REF", detail: `章节引用：${chapterId}` });
  for (const reference of refs.references) blockers.push({ code: reference.code, detail: `${reference.chapterId}：${reference.detail}` });
  // Certified model lock: base cities are exactly 192 with frozen bindings.
  blockers.push({ code: "CITY_COUNT_LOCKED", detail: "基础据点锁定 192 座，不开放增删" });
  return { cityId, deletable: false, blockers };
}
// Chapter city numeric edits (N3-1): troops (+13 byte) and prod (+0E word),
// gated by the record's own caps (troops_cap/max_prod, re-notes §8 rule 3).
// owner/governor/name/coords/adjacency stay closed (need attr rebuild,
// identity sync, Big5 limits, tile evidence). Raw bytes are patched in step
// with the decoded fields, mirroring editChapterResources.
const CITY_EDIT_FIELDS = Object.freeze({ troops: [0x13, 1], prod: [0x0E, 2] });
function chapterCity(game, chapterId, cityIdx) {
  if (!isPlainObject(game)) throw new TypeError("game source required");
  if (game.gameId === BUILTIN_GAME_ID || game.sourceRef?.kind !== "builtin-copy" || game.sourceRef.sourceId !== BUILTIN_GAME_ID) throw new RangeError("僅可編輯獨立完整副本的既有章節據點");
  const chapter = game.chapters?.[chapterId];
  if (!isPlainObject(chapter) || chapter.chapterId !== chapterId || !(game.chapterOrder ?? []).includes(chapterId)) throw new RangeError(`unknown chapter: ${chapterId}`);
  const cities = chapter.state?.cities;
  if (!Array.isArray(cities)) throw new TypeError("chapter cities required");
  const record = cities.find(c => c?.idx === cityIdx);
  if (!isPlainObject(record)) throw new RangeError(`unknown city: ${cityIdx}`);
  return record;
}
function cityRawByte(raw, offset) {
  return Number.parseInt(raw.slice(offset * 2, offset * 2 + 2), 16);
}
function cityRawWord(raw, offset) {
  return Number.parseInt(raw.slice(offset * 2, offset * 2 + 2), 16) + Number.parseInt(raw.slice(offset * 2 + 2, offset * 2 + 4), 16) * 256;
}
export function editChapterCity(game, chapterId, cityIdx, values) {
  if (!isPlainObject(values)) throw new TypeError("city values required");
  const keys = Object.keys(values);
  if (!keys.length || keys.some(k => !Object.hasOwn(CITY_EDIT_FIELDS, k))) throw new RangeError("city edit allows troops/prod only");
  const record = chapterCity(game, chapterId, cityIdx);
  if (typeof record.raw !== "string" || !/^[a-f0-9]{64}$/i.test(record.raw)) throw new RangeError("chapter city raw record required");
  if (!Number.isSafeInteger(record.troops_cap) || record.troops_cap < 0 || !Number.isSafeInteger(record.max_prod) || record.max_prod < 0) throw new RangeError("chapter city caps required");
  if (cityRawByte(record.raw, 0x13) !== record.troops || cityRawWord(record.raw, 0x0E) !== record.prod) throw new RangeError("章節據點數值／原生來源分歧");
  const captured = {};
  for (const key of keys) {
    const value = values[key], cap = key === "troops" ? record.troops_cap : record.max_prod;
    if (typeof value !== "number" || !Number.isInteger(value) || Object.is(value, -0) || value < 0 || value > cap) throw new RangeError(`章節據點數值範圍不符：${key}`);
    captured[key] = value;
  }
  if (keys.every(key => record[key] === captured[key])) return game;
  const next = deepClone(game), state = next.chapters[chapterId].state, target = state.cities.find(c => c?.idx === cityIdx);
  for (const key of keys) {
    const value = captured[key]; if (value === target[key]) continue;
    const [offset, size] = CITY_EDIT_FIELDS[key];
    const hex = Array.from({ length: size }, (_, i) => ((value >>> (i * 8)) & 255).toString(16).padStart(2, "0")).join("");
    target[key] = value;
    target.raw = target.raw.slice(0, offset * 2) + hex + target.raw.slice((offset + size) * 2);
  }
  return next;
}
// Separate from legacy `city` history: only explicitly requested fields update
// the static initial-city source used by native alias reads (e.g. C0F at 084F).
// No implicit repair of other legacy fields; HTTP/history admission is separate.
export function editChapterCityNative(game, chapterId, cityIdx, values) {
  const next = editChapterCity(game, chapterId, cityIdx, values);
  const state = game.chapters[chapterId].state, records = state.nativeCityRecordRaw;
  if (!Number.isSafeInteger(cityIdx) || cityIdx < 0 || cityIdx >= 192 || !Array.isArray(records) || records.length !== 192 ||
      Array.from(records).some(raw => typeof raw !== "string" || !/^[a-f0-9]{64}$/i.test(raw)))
    throw new RangeError("完整靜態城市來源必須為192筆32B記錄");
  const record = state.cities.find(city => city.idx === cityIdx);
  const original = records[cityIdx];
  // Old city operations may leave only C0E/C0F/C13 different. Other divergence
  // is not an initialization recipe and must not be hidden by this operation.
  for (let offset = 0; offset < 32; offset++) {
    if (offset === 0x0E || offset === 0x0F || offset === 0x13) continue;
    if (original.slice(offset * 2, offset * 2 + 2).toLowerCase() !== record.raw.slice(offset * 2, offset * 2 + 2).toLowerCase())
      throw new RangeError("靜態城市來源的受保護位元組分歧");
  }
  const target = next.chapters[chapterId].state.cities.find(city => city.idx === cityIdx);
  let encoded = original;
  for (const key of Object.keys(values)) {
    const [offset, size] = CITY_EDIT_FIELDS[key], start = offset * 2, end = (offset + size) * 2;
    const bytes = target.raw.slice(start, end);
    if (encoded.slice(start, end).toLowerCase() !== bytes.toLowerCase()) encoded = encoded.slice(0, start) + bytes + encoded.slice(end);
  }
  if (encoded === original) return next;
  const result = next === game ? deepClone(game) : next;
  result.chapters[chapterId].state.nativeCityRecordRaw[cityIdx] = encoded;
  return result;
}

// General field edits (§4.3 B4c1): chapter-scoped name/hao only. Person
// add/delete is 128-locked (certified), so deletion is check-only.
function chapterGeneral(game, chapterId, generalIdx) {
  if (!isPlainObject(game)) throw new TypeError("game source required");
  const chapter = game.chapters?.[chapterId];
  if (!isPlainObject(chapter) || chapter.chapterId !== chapterId) throw new RangeError(`unknown chapter: ${chapterId}`);
  const generals = chapter.state?.generals;
  if (!Array.isArray(generals)) throw new TypeError("chapter generals required");
  const record = generals.find(g => g?.idx === generalIdx);
  if (!isPlainObject(record)) throw new RangeError(`unknown general: ${generalIdx}`);
  return record;
}
const GENERAL_TEXT_FIELDS = ["name", "hao"];
export function renameGeneral(game, chapterId, generalIdx, values) {
  if (!isPlainObject(values)) throw new TypeError("general values required");
  const keys = Object.keys(values);
  if (!keys.length || keys.some(k => !GENERAL_TEXT_FIELDS.includes(k))) throw new RangeError("general edit allows name/hao only");
  const record = chapterGeneral(game, chapterId, generalIdx);
  const normalized = {};
  for (const key of keys) {
    const text = values[key];
    // No invented length limit. Reject controls and unpaired surrogates;
    // valid supplementary characters remain intact. Hao may be empty.
    if (typeof text !== "string" || [...text].some(c => { const n = c.codePointAt(0); return n < 32 || n >= 127 && n <= 159 || n >= 0xd800 && n <= 0xdfff; })) throw new RangeError(`general ${key} has invalid characters`);
    if (key === "name" && !text.trim()) throw new RangeError("general name required");
    normalized[key] = key === "name" ? text.trim().normalize("NFC") : text.normalize("NFC");
  }
  // Rejected edits must not leave an earlier field changed in the source.
  Object.assign(record, normalized);
}
// Source diagnostics only: a chapter/slot pair is not a cross-chapter person ID.
// These references do not certify native initialization or authorize deletion.
export function generalChapterReferences(game, chapterId, generalIdx) {
  const general = chapterGeneral(game, chapterId, generalIdx);
  const state = game.chapters[chapterId].state, references = [];
  const add = (code, detail) => references.push({ code, detail });
  add("GENERAL_CHAPTER_REF", `章節 ${chapterId}／武將槽 #${generalIdx}`);
  for (const faction of state.factions ?? []) {
    if (faction?.monarch_idx === generalIdx) add("GENERAL_MONARCH_REF", `勢力 #${faction.idx} 的君主`);
    if (faction?.advisor_idx === generalIdx) add("GENERAL_ADVISOR_REF", `勢力 #${faction.idx} 的軍師`);
  }
  for (const city of state.cities ?? []) {
    if (city?.governor === generalIdx) add("GENERAL_GOVERNOR_REF", `據點 #${city.idx} 的太守`);
  }
  if (general.faction != null) add("GENERAL_FACTION_REF", `所屬勢力 #${general.faction}`);
  if (general.join_faction != null) add("GENERAL_JOIN_REF", `登場加入勢力欄位 #${general.join_faction}`);
  if (Object.hasOwn(general, "appear_months")) add("GENERAL_APPEARANCE_STATE", `登場等待欄位 ${general.appear_months}`);
  return references;
}
export function checkGeneralDeletable(game, generalIdx) {
  if (!isPlainObject(game)) throw new TypeError("game source required");
  if (!Number.isInteger(generalIdx) || generalIdx < 0 || generalIdx > 127) throw new RangeError(`unknown general: ${generalIdx}`);
  const chapters = [];
  for (const chapterId of game.chapterOrder ?? []) {
    if ((game.chapters?.[chapterId]?.state?.generals ?? []).some(g => g?.idx === generalIdx)) chapters.push(chapterId);
  }
  const blockers = chapters.flatMap(chapterId => generalChapterReferences(game, chapterId, generalIdx).map(reference => ({
    ...reference, chapterId, detail: `${chapterId}：${reference.detail}`,
  })));
  blockers.push({ code: "GENERAL_COUNT_LOCKED", detail: "武將鎖定 128 密排，不開放增刪" });
  return { generalIdx, deletable: false, blockers };
}
// Faction posts (§4.3 B4c2): lord/strategist/disband are chapter-scoped.
// A faction is a chapter entity (Q13): changing lord keeps the faction;
// removing the lord needs a successor or explicit disband. Disband frees
// members (faction → null), neutralizes cities (faction → null) and drops
// the faction record; join_faction (appear-time history) is untouched.
function chapterFactions(game, chapterId) {
  if (!isPlainObject(game)) throw new TypeError("game source required");
  const chapter = game.chapters?.[chapterId];
  if (!isPlainObject(chapter) || chapter.chapterId !== chapterId) throw new RangeError(`unknown chapter: ${chapterId}`);
  const factions = chapter.state?.factions;
  if (!Array.isArray(factions)) throw new TypeError("chapter factions required");
  return { chapter, factions, state: chapter.state };
}
function factionEntry(game, chapterId, factionIdx) {
  const { factions } = chapterFactions(game, chapterId);
  const record = factions.find(f => f?.idx === factionIdx);
  if (!isPlainObject(record)) throw new RangeError(`unknown faction: ${factionIdx}`);
  return record;
}
function generalByIdx(game, chapterId, generalIdx) {
  // Authoring slot contract (§3.2): G127 is reserved, not an ordinary post candidate.
  if (!Number.isInteger(generalIdx) || Object.is(generalIdx, -0) || generalIdx < 0 || generalIdx >= 127) throw new RangeError("ordinary general slot 0..126 required");
  return chapterGeneral(game, chapterId, generalIdx);
}
function postsHeld(game, chapterId, generalIdx) {
  const { factions, state } = chapterFactions(game, chapterId);
  const posts = [];
  for (const f of factions) {
    if (f?.monarch_idx === generalIdx) posts.push({ faction: f.idx, post: "monarch" });
    if (f?.advisor_idx === generalIdx) posts.push({ faction: f.idx, post: "strategist" });
    if (f?.diplomat_idx === generalIdx) posts.push({ faction: f.idx, post: "diplomat" });
  }
  // 太守（內政官）也是原版 `general[+0x17]` 的同一个单一身份字段，因此与
  // 君主／軍師／外交官互斥；不将据点职务排除会在界面制造两个职务共存。
  for (const c of state?.cities ?? []) if (c?.governor === generalIdx) posts.push({ faction: c.faction ?? null, post: "governor" });
  return posts;
}
// §7 chapter attributes (docs/editor-workbench-structure.md): start date, city
// affiliation, capital, general affiliation and the diplomat post. The named
// fields are the authoring view, while fresh reads the fixed native slots, so
// both are written together (nativefactions.decodeSlot for a faction slot, city
// record +01 for the current owner; +1A is the old owner and stays original
// content). The era is an authoring label beside the native day/month byte and
// year u16 header, never folded into the year, so switching it cannot renumber
// a chapter. Ranges are editor input limits, not KI rules.
const CHAPTER_ERAS = Object.freeze(["bc", "ad"]);
// [byte offset, null sentinel] per faction slot; the same table as
// nativefactions.decodeSlot and verify_editor_faction_consistency.mjs.
const FACTION_SLOT_BYTES = Object.freeze({ monarch_idx: [1, 0xff], advisor_idx: [2, 0x7f], capital: [3, 0xff], diplomat_idx: [0x2a, 0xff] });
const CITY_OWNER_BYTE = 1, CITY_NEUTRAL_BYTE = 0x18;
// 城記錄 +0x19＝太守槽（0xFF＝空），與 materialize／content_pipeline 同一組位元組。
const GOVERNOR_BYTE = 0x19, NO_GOVERNOR = 0xff;
function chapterState(game, chapterId) {
  const state = chapterEntry(game, chapterId).state;
  if (!isPlainObject(state)) throw new RangeError(`state required for chapter ${chapterId}`);
  return state;
}
function chapterCityRow(state, cityIdx) {
  if (!Number.isSafeInteger(cityIdx) || Object.is(cityIdx, -0) || cityIdx < 0 || cityIdx > 191) throw new RangeError("chapter city idx 0..191 required");
  const record = (state.cities ?? []).find(c => c?.idx === cityIdx);
  if (!isPlainObject(record)) throw new RangeError(`unknown chapter city: ${cityIdx}`);
  return record;
}
function chapterFactionRow(state, factionIdx) {
  const record = (state.factions ?? []).find(f => f?.idx === factionIdx);
  if (!isPlainObject(record)) throw new RangeError(`unknown chapter faction: ${factionIdx}`);
  return record;
}
function factionValue(state, factionId) {
  if (factionId === null) return null;
  if (!Number.isSafeInteger(factionId) || Object.is(factionId, -0) || factionId < 0) throw new RangeError("chapter faction idx or null required");
  if (!(state.factions ?? []).some(f => f?.idx === factionId)) throw new RangeError(`chapter faction ${factionId} is not declared`);
  return factionId;
}
function patchByte(raw, offset, value) {
  const at = offset * 2, hex = value.toString(16).padStart(2, "0");
  if (!/^[0-9a-f]+$/i.test(raw) || raw.length <= at + 2) throw new RangeError("fixed native slot must be hex bytes");
  return raw.slice(0, at) + hex + raw.slice(at + 2);
}
// Patch the same byte in the declared record and in the fixed slot table. A
// present but malformed source is refused rather than left silently stale.
function writeSlotByte(table, index, record, offset, value) {
  if (typeof record.raw === "string") record.raw = patchByte(record.raw, offset, value);
  if (!Array.isArray(table)) return;
  const raw = table[index];
  if (raw === undefined) return;
  if (typeof raw !== "string") throw new RangeError("fixed native slot must be a hex string");
  table[index] = patchByte(raw, offset, value);
}
function writeFactionField(state, faction, field, value) {
  const [offset, sentinel] = FACTION_SLOT_BYTES[field];
  faction[field] = value;
  writeSlotByte(state.nativeFactionSlotRaw, faction.idx, faction, offset, value === null ? sentinel : value);
}
export function setChapterStart(game, chapterId, values) {
  if (!isPlainObject(values)) throw new TypeError("chapter start values required");
  const keys = Object.keys(values);
  if (!keys.length || keys.some(key => key !== "era" && key !== "year" && key !== "month" && key !== "day")) throw new RangeError("chapter start allows era/year/month/day only");
  const captured = {};
  for (const key of keys) {
    const value = values[key];
    if (key === "era") {
      if (!CHAPTER_ERAS.includes(value)) throw new RangeError("chapter era must be bc|ad");
      captured.era = value;
      continue;
    }
    const max = { year: 9999, month: 12, day: 31 }[key];
    if (!Number.isInteger(value) || Object.is(value, -0) || value < 1 || value > max) throw new RangeError(`chapter ${key} must be an integer in 1..${max}`);
    captured[key] = value;
  }
  const state = chapterState(game, chapterId);
  if (!isPlainObject(state.start)) throw new RangeError("chapter start date required");
  Object.assign(state.start, captured);
}
export function setChapterCityFaction(game, chapterId, cityIdx, factionId) {
  const state = chapterState(game, chapterId), city = chapterCityRow(state, cityIdx);
  city.faction = factionValue(state, factionId);
  writeSlotByte(state.nativeCityRecordRaw, cityIdx, city, CITY_OWNER_BYTE, city.faction === null ? CITY_NEUTRAL_BYTE : city.faction);
}
// A faction keeps exactly one capital (chapterActiveGaps requires it to resolve),
// so "not the capital" is expressed by marking another city, never by clearing.
// Ownership is not required: 8 official factions start with a capital city their
// own faction byte does not name, and that original data is not an error.
export function setFactionCapital(game, chapterId, factionIdx, cityIdx) {
  const state = chapterState(game, chapterId);
  chapterCityRow(state, cityIdx);
  writeFactionField(state, chapterFactionRow(state, factionIdx), "capital", cityIdx);
}
// 登場旗標是原版 G+00 attr 的 bit7（chapter-and-base-resources §2，实锤）；
// `active` 只是同一事實的作者層視圖。兩者必須同步，否則會出現「宣告登場但原生
// 位元組沒登場」的雙來源；attr 其餘位元保留原值（含 bit6 君主），不重算。
// 指派一名武将到本章：身份由 generalId（游戏级武将库）承载，槽位取本章最小空槽。
// 128 是原生表上限；G127 保留（generalByIdx 同样拒绝），故可用槽为 0..126。
// 取消出场只清空该槽并留洞，不重排其它武将（2026-11 用戶裁決）。
export function assignChapterGeneral(game, chapterId, values) {
  return assignGeneralToChapterState(chapterState(game, chapterId), values);
}
// 同一個寫入器的狀態層版本：人物層（people）勾選出場時直接同步原生槽位。
export function assignGeneralToChapterState(state, values) {
  if (!isPlainObject(values)) throw new TypeError("general values required");
  const keys = Object.keys(values);
  if (!keys.length || keys.some(key => !["generalId", "name", "hao", "portrait", "ability"].includes(key))) throw new RangeError("chapter general allows generalId/name/hao/portrait/ability only");
  if (typeof values.generalId !== "string" || !values.generalId) throw new RangeError("general identity required");
  if (typeof values.name !== "string" || !values.name.trim()) throw new RangeError("general name required");
  if (!Number.isInteger(values.portrait) || Object.is(values.portrait, -0) || values.portrait < 0 || values.portrait > 255) throw new RangeError("general portrait 0..255 required");
  const generals = state.generals ?? [];
  if (generals.some(g => g?.generalId === values.generalId)) throw new RangeError("general is already assigned to this chapter");
  const slot = generals.find(g => g?.generalId === null || g?.generalId === undefined);
  if (!slot) throw new RangeError("chapter general slots are full (128)");
  if (slot.idx > 126) throw new RangeError("reserved general slot 127 is not assignable");
  const record = { ...emptyGeneralSlot(slot.idx), generalId: values.generalId, name: values.name.trim(), hao: values.hao ?? "", portrait: values.portrait };
  if (values.ability !== undefined) {
    if (!isPlainObject(values.ability)) throw new TypeError("general ability required");
    for (const [field, max] of Object.entries(ABILITY_LIMITS)) {
      const value = values.ability[field];
      if (!Number.isInteger(value) || value < 0 || value > max) throw new RangeError(`general ability.${field} must be an integer in 0..${max}`);
    }
    record.ability = { ...values.ability };
  }
  record.attr = 0x80;
  record.active = true;
  generals[slot.idx] = record;
  return { slot: slot.idx };
}
// 取消本章出场：只清空该槽（留洞），不动其它武将，也不改游戏级武将库。
export function clearChapterGeneral(game, chapterId, generalId) {
  const state = chapterState(game, chapterId), slot = (state.generals ?? []).find(g => g?.generalId === generalId);
  if (!slot) throw new RangeError(`unknown chapter general: ${generalId}`);
  if (postsHeld(game, chapterId, slot.idx).length) throw new RangeError("general holds a chapter post; clear it first");
  return clearGeneralFromChapterState(state, generalId);
}
export function clearGeneralFromChapterState(state, generalId) {
  const generals = state.generals ?? [];
  const slot = generals.find(g => g?.generalId === generalId);
  if (!slot) throw new RangeError(`unknown chapter general: ${generalId}`);
  generals[slot.idx] = emptyGeneralSlot(slot.idx);
  return { slot: slot.idx };
}
export function setGeneralActive(game, chapterId, generalIdx, active) {
  if (typeof active !== "boolean") throw new TypeError("general active flag must be boolean");
  const general = generalByIdx(game, chapterId, generalIdx);
  general.attr = active ? general.attr | 0x80 : general.attr & 0x7f;
  general.active = active;
}
// G+17 身份：0 待命／1 軍團長／2 內政官／3 外交官／4 被俘。0–4 是作者輸入限制，
// 不是 KI 值域推導；本寫入器不動所屬、任職、計數或任何原生位元組。
export function setGeneralStatus(game, chapterId, generalIdx, status) {
  if (!Number.isInteger(status) || Object.is(status, -0) || status < 0 || status > 4) throw new RangeError("general status must be an integer in 0..4");
  generalByIdx(game, chapterId, generalIdx).status = status;
}
export function setChapterGeneralFaction(game, chapterId, generalIdx, factionId) {
  // generalByIdx keeps the reserved G127 slot out of ordinary affiliation, as
  // for the post writers; the reserved slot carries no chapter identity.
  const state = chapterState(game, chapterId), general = generalByIdx(game, chapterId, generalIdx);
  const posts = postsHeld(game, chapterId, generalIdx);
  if (posts.length) throw new RangeError(`general holds a chapter post (${posts.map(p => p.post).join(",")}); clear it first`);
  general.faction = factionValue(state, factionId);
}
export function setFactionDiplomat(game, chapterId, factionIdx, generalIdx) {
  const state = chapterState(game, chapterId), faction = chapterFactionRow(state, factionIdx);
  if (generalIdx === null) { writeFactionField(state, faction, "diplomat_idx", null); return { replaced: null }; }
  const general = generalByIdx(game, chapterId, generalIdx);
  // Authoring contract §3.3 analog for the second post; not a native rule.
  if (generalIdx !== faction.diplomat_idx && general.faction !== faction.idx) throw new RangeError("diplomat must belong to chapter faction");
  const other = postsHeld(game, chapterId, generalIdx).filter(p => !(p.faction === factionIdx && p.post === "diplomat"));
  if (other.length) throw new RangeError("diplomat holds another post");
  const replaced = faction.diplomat_idx ?? null;
  writeFactionField(state, faction, "diplomat_idx", general.idx);
  return { replaced: replaced === generalIdx ? null : replaced };
}
// 太守（內政官）：原版任命 `0x6AD8..0x6AEA` 只寫 `general[+0x17]=2` 與
// `city[+0x19]`，**不改 `general[+0x1A]` 舊預算**；手動解任 `0x6B08→0x6B4F` 另
// 清 `general[+0x1A]`。候選篩選 `0x7663/0x76A0` 要求活動、同屬本勢力、
// `general[+0x17]==0`、非君主。本寫入器照這個順序寫，不新增規則；預算數值本身
// 不在本寫入器範圍（月結 type4 才產生）。
export function setCityGovernor(game, chapterId, cityIdx, generalIdx) {
  const state = chapterState(game, chapterId), city = chapterCityRow(state, cityIdx);
  if (generalIdx === null) {
    const replaced = city.governor ?? null;
    city.governor = null;
    writeSlotByte(state.nativeCityRecordRaw, cityIdx, city, GOVERNOR_BYTE, NO_GOVERNOR);
    if (replaced !== null) {
      const prior = chapterGeneral(game, chapterId, replaced);
      // 手動解任會一併清身份與舊預算（0x6B08→0x6B4F）；城破返回（0x4D63）不清
      // 預算，那條路徑不在作者層編輯範圍。
      prior.status = 0;
      prior.assignment_budget = 0;
    }
    return { replaced };
  }
  const general = generalByIdx(game, chapterId, generalIdx);
  if (city.faction === null || city.faction === undefined) throw new RangeError("neutral city cannot have a governor");
  if (generalIdx !== city.governor) {
    if (general.faction !== city.faction) throw new RangeError("governor must belong to the city faction");
    if (general.active !== true) throw new RangeError("governor must be active");
    if (general.is_monarch === true) throw new RangeError("monarch cannot be governor");
    // 已持有任何職務（含其他城的太守）的武將不能再兼任；general[+0x17] 是
    // 單一身份欄位，同一武將不得同時是兩城太守。
    if (postsHeld(game, chapterId, generalIdx).length) throw new RangeError("governor holds another post");
  }
  const replaced = city.governor ?? null;
  city.governor = general.idx;
  // 編譯管線由命名欄位重算 +0x19，但 nativeCityRecordRaw 必須與命名值一致，
  // 否則 content_pipeline 以「native city record raw diverges」拒絕。
  writeSlotByte(state.nativeCityRecordRaw, cityIdx, city, GOVERNOR_BYTE, general.idx);
  // 任命只寫身份；不清、也不寫入舊預算（原版實錘）。
  general.status = 2;
  return { replaced: replaced === generalIdx ? null : replaced };
}
export function setMonarch(game, chapterId, factionIdx, generalIdx) {
  const state = chapterState(game, chapterId), faction = factionEntry(game, chapterId, factionIdx);
  const general = generalByIdx(game, chapterId, generalIdx);
  // A new lord must be free: no membership and no post anywhere.
  if (general.faction !== null) throw new RangeError("lord must be a free general");
  if (postsHeld(game, chapterId, generalIdx).length) throw new RangeError("lord must hold no post");
  general.faction = factionIdx;
  writeFactionField(state, faction, "monarch_idx", generalIdx);
}
export function setStrategist(game, chapterId, factionIdx, generalIdx) {
  const state = chapterState(game, chapterId), faction = factionEntry(game, chapterId, factionIdx);
  if (generalIdx === null) { writeFactionField(state, faction, "advisor_idx", null); return { replaced: null }; }
  const general = generalByIdx(game, chapterId, generalIdx);
  // Authoring contract §3.3, not a native initialization rule. An unchanged
  // imported exception remains intact; a new appointment cannot migrate a general.
  if (generalIdx !== faction.advisor_idx && general.faction !== faction.idx) throw new RangeError("strategist must belong to chapter faction");
  // 章节设置里的军师（2026-11 用户裁决）：必须是本章开局即到场的本势力武将，
  // 登场时间 +0x18 是倒计时月数，0 表示开局就在；被俘（+0x17=4）不能受任。
  if (generalIdx !== faction.advisor_idx && general.appear_months !== 0) throw new RangeError("strategist must appear at chapter start");
  if (generalIdx !== faction.advisor_idx && (general.status === 4 || general.captive_flag === 0)) throw new RangeError("captive general cannot be strategist");
  const other = postsHeld(game, chapterId, generalIdx).filter(p => !(p.faction === factionIdx && p.post === "strategist"));
  if (other.length) throw new RangeError("strategist holds another post");
  const replaced = faction.advisor_idx ?? null;
  writeFactionField(state, faction, "advisor_idx", general.idx);
  return { replaced: replaced === generalIdx ? null : replaced };
}
export function removeMonarch(game, chapterId, factionIdx, resolution) {
  factionEntry(game, chapterId, factionIdx);
  if (!isPlainObject(resolution)) throw new TypeError("successor or disband required");
  if (resolution.disband === true) { disbandFaction(game, chapterId, factionIdx); return; }
  if (!Number.isInteger(resolution.successor)) throw new RangeError("successor or disband required");
  setMonarch(game, chapterId, factionIdx, resolution.successor);
}
const FACTION_SLOT_LIMIT = 22;
// 新建势力槽（Web 作者层，非原版初始化规则）：作者选一名自由武將作君主，首都留空
// 由 setFactionCapital 指定——「没有首都的势力不能保存」由 chapterActiveGaps 的
// capital 引用检查承担，不另立第二套门槛。宣告顺序＝原生槽序（
// initializeNativeFactionSlots 要求 factions[slot].idx === slot），所以新势力只能
// 接在末尾；原生位元组沿用固定源同槽，只改本函数拥有的栏位（君主／空内政官／
// 空外交官／空首都／派生计数），其余未证实位元组保持原值。
export function createFaction(game, chapterId, options) {
  if (!isPlainObject(options)) throw new TypeError("create faction options required");
  const keys = Object.keys(options);
  if (keys.length !== 1 || keys[0] !== "monarchIdx") throw new RangeError("create faction allows monarchIdx only");
  const state = chapterState(game, chapterId), { factions } = chapterFactions(game, chapterId);
  if (factions.length >= FACTION_SLOT_LIMIT) throw new RangeError("chapter faction slots are full");
  const monarch = generalByIdx(game, chapterId, options.monarchIdx);
  // 君主必须是本章已指派的武将：槽位本身不是身份（2026-11 用戶裁決）。
  if (!monarch.generalId) throw new RangeError("lord must be an assigned chapter general");
  // 与 setMonarch 同一资格口径：君主必须自由且无任何任职。
  if (monarch.faction !== null) throw new RangeError("lord must be a free general");
  if (postsHeld(game, chapterId, options.monarchIdx).length) throw new RangeError("lord must hold no post");
  const slot = factions.length;
  if (!Array.isArray(state.nativeFactionSlotRaw)) state.nativeFactionSlotRaw = [...CHAPTER_BASE.factionSlots];
  const table = state.nativeFactionSlotRaw;
  if (typeof table[slot] !== "string") throw new RangeError("fixed native faction slot missing");
  let raw = table[slot];
  for (const [offset, value] of [[1, monarch.idx], [2, 0x7f], [3, 0xff], [0x23, 0]]) raw = patchByte(raw, offset, value);
  table[slot] = raw;
  // n_cities／n_generals 是原版存储字段（运行期由占城／编成维护），建势力时按本章
  // 现况取值：新势力 0 个据点、1 名武將（内政官不计入 n_generals）。
  factions.push({ ...decodeFactionSlot(raw, slot), n_generals: 1 });
  monarch.faction = slot;
  if (Object.hasOwn(state, "n_factions")) state.n_factions = factions.length;
  return { factionIdx: slot };
}
export function disbandFaction(game, chapterId, factionIdx) {
  const { chapter, factions } = chapterFactions(game, chapterId, factionIdx);
  const at = factions.findIndex(f => f?.idx === factionIdx);
  if (at < 0) throw new RangeError(`unknown faction: ${factionIdx}`);
  const state = chapterState(game, chapterId);
  for (const g of chapter.state.generals ?? []) { if (g?.faction === factionIdx) g.faction = null; }
  for (const c of chapter.state.cities ?? []) {
    if (c?.faction !== factionIdx) continue;
    c.faction = null;
    // Same native owner byte as setChapterCityFaction; members stay neutral.
    writeSlotByte(state.nativeCityRecordRaw, c.idx, c, CITY_OWNER_BYTE, CITY_NEUTRAL_BYTE);
  }
  factions.splice(at, 1);
  // The dropped faction keeps its fixed slot bytes; only the declared view and
  // the explicit neutral ownership above move.
}
// Completion display (§4.5): save-gate gaps block draft save, the rest block
// publish/compile only. Counts keep the read receipt small.
export function chapterGapCounts(state, chapterId = "?") {
  const save = chapterSaveGaps(state, chapterId).length;
  const active = chapterActiveGaps(state, chapterId).length;
  return { saveGaps: save, activeGaps: active - save };
}
