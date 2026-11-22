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
import { ORIGINAL_EXTENT, containsTile } from './mapextent.js';
import { deriveSlots } from "./roadedit.js";
import { captureChapterCities } from "./cityrecords.js";
import { emptyGeneralSlot, materializeChapterState } from "./chaptermaterialize.js";
import { CHAPTER_BASE } from "./chapterbase.generated.js";
import { decodeFactionSlot } from "../../game/nativefactions.js";
import { decodePlayerOpening } from "../../game/nativemonthlypolicy.js";
import { encodePlayerOpening } from "../../editor/chapteropening.js";
import { CHAPTER_DIPLOMACY_RELATIONS, decodeChapterDiplomacy } from "../../editor/chapterdiplomacy.js";
import { CITY_BASE_NUMBERS, CITY_SHARED_INVARIANTS, CITY_NUMBER_LIMITS } from "./cityrecords.js";
import { factionNativeConsistencyGaps } from "./factionconsistency.js";

export const GAMESOURCE_SCHEMA = 1;
export const GAME_RULE_PROFILE = "ki-1995/web-0.1.1";
export const BUILTIN_GAME_ID = "wolong-builtin";

// (ii) 立法＋修正案 A（用户批准 2026-10-10，非原版机制）：保存门（必填＋连接性）与 active 门
// （全字段＋交叉＋计数）。一般数值不猜规则范围；能力另核已证存储表示，非可玩值域。
// faction/join_faction 经内置章反例证非严格外键，不验；将数暂锁 128 dense。
// 城数原为 192 锁；CITY-CAPACITY-1 C5（目标必需，用户已授权解除保留）改 live 1..512
// 槽位，dense 0..N-1 身份；章节／势力开放。
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
// CHAPTER-WB capital relationship shared by copy publication and legacy checks.
export function chapterCapitalGaps(state, chapterId = "?") {
  const gaps = [], claimed = new Map();
  const owner = new Map((state?.cities ?? []).map(c => [c?.idx, c?.faction ?? null]));
  for (const [i, faction] of (state?.factions ?? []).entries()) {
    if (faction?.capital === null || faction?.capital === undefined) continue;
    const label = `chapter ${chapterId} faction[${i}]`;
    if (owner.get(faction.capital) !== faction.idx)
      gaps.push({ code: "entity-ref", subject: label, message: `${label} capital ${faction.capital} is not owned by this faction` });
    if (claimed.has(faction.capital))
      gaps.push({ code: "entity-ref", subject: label, message: `${label} capital ${faction.capital} is already the capital of faction[${claimed.get(faction.capital)}]` });
    else claimed.set(faction.capital, i);
  }
  return gaps;
}

// Legacy compilation active gate; copy publication additionally checks capital
// relationships even when a chapter retains its original _src marker.
export function chapterActiveGaps(state, chapterId = "?") {
  const gaps = [...chapterSaveGaps(state, chapterId)];
  const generals = Array.isArray(state?.generals) ? state.generals : [];
  const cities = Array.isArray(state?.cities) ? state.cities : [];
  const factions = Array.isArray(state?.factions) ? state.factions : [];
  if (generals.length !== 128) gaps.push({ code: "entity-count", subject: `chapter ${chapterId}`, message: `chapter ${chapterId} generals must be 128 dense (locked)` });
  if (cities.length < 1 || cities.length > 512) gaps.push({ code: "entity-count", subject: `chapter ${chapterId}`, message: `chapter ${chapterId} cities must be 1..512 live slots` });
  // Web product Q40 (game-editor-design §4.5), not an original-game formula:
  // incomplete drafts may have no factions, but cannot enter Trial/publication.
  if (!factions.some(faction => faction?.retired !== true)) gaps.push({ code: "chapter-factions", subject: `chapter ${chapterId}`, message: `chapter ${chapterId} factions must include at least one entry` });
  const gidx = new Set(), cidx = new Set(), fids = new Set();
  for (const g of generals) {
    if (!Number.isInteger(g?.idx) || g.idx < 0 || g.idx > 127 || gidx.has(g.idx)) gaps.push({ code: "entity-count", subject: `chapter ${chapterId}`, message: `general idx must be unique 0..127` });
    else gidx.add(g.idx);
  }
  for (const c of cities) {
    if (!Number.isInteger(c?.idx) || c.idx < 0 || c.idx > cities.length - 1 || cidx.has(c.idx)) gaps.push({ code: "entity-count", subject: `chapter ${chapterId}`, message: `city idx must be unique dense 0..${cities.length - 1}` });
    else cidx.add(c.idx);
  }
  // Fixed-profile public identities: KI 3E4C..3E55 steps 40h to 580h.
  // Physical slots 22/23 stay in native data, not this public faction list.
  // Uniqueness is the authoring identity contract, not a new rule formula.
  // initializeNativeFactionSlots overlays the declared rows by physical slot.
  // Unique IDs alone cannot certify a sparse/reordered array left by legacy deletion.
  if (factions.some((faction, index) => faction?.idx !== index)) gaps.push({ code: "faction-slot-order", subject: `chapter ${chapterId}`, message: "declared faction rows must preserve dense native slot order; faction retirement requires explicit conversion" });
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
    if (Object.hasOwn(fa, 'retired') && fa.retired !== true) gaps.push({ code: 'entity-save', subject: label, message: `${label} invalid retirement marker` });
    if (fa.retired === true) {
      const empty = Number.isInteger(fa.attr) && fa.attr >= 0 && fa.attr < 0x80 && fa.active === false && fa.monarch_idx === 255 && fa.monarch === '' &&
        ['advisor_idx', 'capital', 'diplomat_idx', 'target_faction', 'strategic_city_primary', 'strategic_city_secondary'].every(key => fa[key] === null) &&
        ['money', 'money_hi', 'reserve_cav', 'reserve_arc', 'reserve_inf', 'n_generals', 'nativeGeneralCount', 'n_cities', 'n_legions', 'monthly_reserve_upkeep'].every(key => fa[key] === 0) &&
        fa.playerOpening === undefined && !generals.some(g => g.faction === fa.idx || g.join_faction === fa.idx || g.captive_flag === fa.idx || g.origFaction === fa.idx) && !cities.some(city => city.faction === fa.idx) && !factions.some(other => other.target_faction === fa.idx);
      if (!empty) gaps.push({ code: 'entity-save', subject: label, message: `${label} retired slot retains active state or references` });
      continue;
    }
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
  if (!Object.hasOwn(state ?? {}, "_src")) gaps.push(...chapterCapitalGaps(state, chapterId));
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
    // 游戏级共享数据投影：名称以父表为准，父表缺的四项默认值从第一章回填。
    applySharedCityData(game);
  }
  // A minimal game is an editable zero-chapter draft, not a publish candidate.
  validateGameSource(game, { draft: kind === 'minimal' });
  return game;
}

// 遊戲級共享據點投影（用戶 2026-11 決定，Web 產品行為）： `game.cities` 是名稱與
// 基礎數值的唯一來源，章節 `state.cities[].name` 只是導入時留下的原版副本，讀取、
// 保存、編譯、發布前一律投影成父表名稱；父表缺 prod/growth/defence/troops 時，
// 按決定「從當前遊戲第一章同槽記錄回填一次」補齊，已存在的值永不覆蓋（作者可先
// 自填）。冪等：投影後的 source 再投影不會改變任何位元組。章節 `raw`／
// `nativeCityRecordRaw` 是原始記錄內容，不由本函式改寫。
export function applySharedCityData(game) {
  const definitions = Object.values(game.cities ?? {});
  // C5: definitions follow the same live 1..512 dense-slot contract as
  // validateGameSource; per-record lookup below still fails closed on gaps.
  if (definitions.length < 1 || definitions.length > 512)
    throw new RangeError("game source requires 1..512 cities");
  const seen = new Set();
  for (const definition of definitions) {
    if (!Number.isInteger(definition?.runtimeSlot) || definition.runtimeSlot < 0 || definition.runtimeSlot > definitions.length - 1 || seen.has(definition.runtimeSlot))
      throw new RangeError("game source city runtime slots must be dense 0..N-1");
    seen.add(definition.runtimeSlot);
  }
  const bySlot = new Map(definitions.map(city => [city.runtimeSlot, city]));
  const first = game.chapters?.[game.chapterOrder?.[0]]?.state?.cities ?? [];
  const firstByIdx = new Map(first.map(city => [city.idx, city]));
  for (const definition of definitions) {
    const record = firstByIdx.get(definition.runtimeSlot);
    for (const name of CITY_BASE_NUMBERS) {
      if (Object.hasOwn(definition, name) || !record || !Object.hasOwn(record, name)) continue;
      const value = record[name];
      if (!Number.isSafeInteger(value) || value < 0 || value > CITY_NUMBER_LIMITS[name])
        throw new RangeError(`source city ${definition.runtimeSlot} ${name} is out of range`);
      definition[name] = value;
    }
  }
  for (const chapterId of game.chapterOrder ?? []) {
    const cities = game.chapters?.[chapterId]?.state?.cities;
    if (!Array.isArray(cities)) continue;
    for (const record of cities) {
      const definition = bySlot.get(record.idx);
      if (!definition) throw new RangeError(`chapter ${chapterId} city slot ${record.idx} has no definition`);
      if (typeof definition.name === "string" && definition.name) record.name = definition.name;
    }
  }
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
  if (cityIds.length < 1 || cityIds.length > 512) throw new RangeError("game source requires 1..512 cities");
  const slots = new Set();
  for (const [id, city] of Object.entries(game.cities)) {
    if (city.cityId !== id) throw new RangeError(`city key/ref mismatch: ${id}`);
    if (!Number.isInteger(city.runtimeSlot) || city.runtimeSlot < 0 || city.runtimeSlot > cityIds.length - 1)
      throw new RangeError(`city ${id} needs a dense runtime slot`);
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
    const chapter = game.chapters[chapterId];
    if (chapter.number !== undefined) {
      const labels = checkedChapterLabels(game, chapterId, chapter.number, chapter.name);
      if (labels[0] !== chapter.number || labels[1] !== chapter.name)
        throw new RangeError("chapter labels must be canonical");
    }
  }
  // Empty authoring games also serve the independent map-template compiler.
  // The copy publication boundary owns the at-least-one-chapter requirement.
  if (!/^\d+$/.test(game.localModel?.draftRevision ?? "")) throw new RangeError("draftRevision must be a decimal string");
  // (ii) 两级门：保存门缺即拒存；active 门在草稿下记诊断、严格下拒发布/编译。
  for (const [chapterId, chapter] of Object.entries(game.chapters ?? {})) {
    const state = chapter?.state ?? chapter;
    const numbers = new Set();
    for (const faction of state.factions ?? []) {
      if (chapter.nextFactionNumber !== undefined) {
        if (!Number.isSafeInteger(faction.number) || faction.number < 1 || numbers.has(faction.number) || faction.factionId !== `${chapterId}#faction-${faction.number}`)
          throw new RangeError('invalid chapter faction identity or number');
        numbers.add(faction.number);
      } else if (faction.number !== undefined || faction.factionId !== undefined) throw new RangeError('chapter faction identity requires an allocation counter');
      if (faction.playerOpening !== undefined) decodePlayerOpening(faction.playerOpening);
    }
    if (chapter.nextFactionNumber !== undefined && (!Number.isSafeInteger(chapter.nextFactionNumber) || chapter.nextFactionNumber <= Math.max(0, ...numbers))) throw new RangeError('invalid next faction number');
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
  const chapterId = options.chapterId ?? freshChapterId(game, "custom");
  if (typeof chapterId !== "string" || !chapterId.startsWith(`${game.gameId}#`) || Object.hasOwn(game.chapters, chapterId))
    throw new RangeError("new chapter identity required");
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
  if (options.number !== undefined) {
    setChapterLabels(game, chapterId, options.number, options.name);
    initializeChapterFactionIdentities(game.chapters[chapterId]);
    initializeBlankChapterInputs(game.chapters[chapterId].state);
  }
  else if (options.name !== undefined) renameChapter(game, chapterId, options.name);
  return chapterId;
}
// New blank authoring chapters only, never a repair of an existing source.
// No original forces/resources/appointments may leak into the fixed 22 slots.
// Opaque bytes keep their fixed-source provenance. New blank chapters copy the
// fixed diplomacy template; creating a force initializes only its live pairs.
export function initializeBlankChapterInputs(state) {
  if (state.factions.length !== 0 || state.nativeFactionSlotRaw !== undefined)
    throw new RangeError('blank chapter initializer requires empty, uninitialized faction slots');
  state.nativeFactionSlotRaw = CHAPTER_BASE.factionSlots.map((encoded, slot) => {
    const native = decodeFactionSlot(encoded, slot);
    let raw = patchByte(encoded, 0, native.attr & 0x7f);
    [[1, 255], [2, 127], [3, 255], [0x16, 255], [0x17, 255], [0x19, 255], [0x2a, 255],
      ...[4, 5, 6, 7, 8, 9, 0x14, 0x18, 0x1a, 0x1b, 0x1c, 0x20, 0x21, 0x22, 0x23].map(offset => [offset, 0])]
      .forEach(([offset, value]) => { raw = patchByte(raw, offset, value); });
    return raw;
  });
  const opening = encodePlayerOpening({ trust: 255, policyRaw: CHAPTER_BASE.monthlyPolicyRaw },
    { trust: 255, tax: 18, conscription: [0, 0, 0], nextConscription: [0, 0, 0] });
  const { trust, policy } = decodePlayerOpening(opening);
  Object.assign(state, { trust, nativeMonthlyPolicyRaw: opening.policyRaw, tax: policy.tax,
    next_tax: policy.nextTax, conscription: policy.conscription, next_conscription: policy.nextConscription,
    // The complete 16-record weather window and bounds match in all five
    // original SINARIO files (verify_chapter_blank_weather.mjs); no new RNG.
    weatherClouds: deepClone(CHAPTER_BASE.weatherClouds), weatherCloudBounds: deepClone(CHAPTER_BASE.weatherCloudBounds),
    nativeStrategicEventRaw: CHAPTER_BASE.nativeStrategicEventRaw,
    nativeDiplomacyRaw: CHAPTER_BASE.nativeDiplomacyRaw, diplomacy: [] });
}

// Creation/conversion only: never invoked by a read. Native slots remain fixed;
// the author-visible monotonically allocated number is not an array position.
export function initializeChapterFactionIdentities(chapter) {
  const numbers = chapter.state.factions.map(faction => faction.number ?? faction.idx + 1);
  if (numbers.some(number => !Number.isSafeInteger(number) || number < 1) || new Set(numbers).size !== numbers.length)
    throw new RangeError('chapter faction numbers must be unique positive integers');
  const next = chapter.nextFactionNumber ?? Math.max(0, ...numbers) + 1;
  if (!Number.isSafeInteger(next) || next <= Math.max(0, ...numbers)) throw new RangeError('next faction number must exceed every allocated number');
  chapter.state.factions.forEach((faction, index) => {
    faction.number = numbers[index];
    faction.factionId = `${chapter.chapterId}#faction-${faction.number}`;
  });
  chapter.nextFactionNumber = next;
}

export function copyChapterInGame(game, chapterId, options = {}) {
  if (!isPlainObject(game)) throw new TypeError("game source required");
  const source = chapterEntry(game, chapterId);
  const id = options.chapterId ?? freshChapterId(game, "copy");
  if (typeof id !== "string" || !id.startsWith(`${game.gameId}#`) || Object.hasOwn(game.chapters, id))
    throw new RangeError("new chapter identity required");
  game.chapters[id] = { ...deepClone(source), chapterId: id, sourceChapterId: source.sourceChapterId ?? chapterId, name: `${source.name ?? chapterId}（副本）` };
  game.chapterOrder.push(id);
  if (source.nextFactionNumber !== undefined) initializeChapterFactionIdentities(game.chapters[id]);
  // Explicitly labelled CHAPTER-WB chapters receive new, unique author labels.
  // Unlabelled legacy copies keep their historical replay shape until conversion.
  if (source.number !== undefined) {
    const numbers = new Set(game.chapterOrder.map(key => game.chapters[key].number));
    const names = new Set(game.chapterOrder.map(key => game.chapters[key].name?.trim().normalize("NFC")));
    let n = 1;
    while (numbers.has(String(n)) || names.has(`副本${n}`)) n += 1;
    setChapterLabels(game, id, String(n), `副本${n}`);
  }
  return id;
}
// List position is independent of the CHAPTER-WB author number and stable ID.
// Only order changes; toIndex is the resulting position.
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
// CHAPTER-WB explicit authoring command. Legacy sources without `number`
// remain readable; reading never migrates them or derives identity from order.
// Both labels are captured together, so a failed uniqueness check writes neither.
function checkedChapterLabels(game, chapterId, number, name) {
  chapterEntry(game, chapterId);
  const labels = [number, name].map((value, index) => {
    if (typeof value !== "string") throw new RangeError("chapter label required");
    const normalized = value.trim().normalize("NFC");
    if (!normalized) throw new RangeError("chapter label required");
    checkGameName(normalized, index === 0 ? 6 : 8);
    return normalized;
  });
  for (const id of game.chapterOrder) {
    if (id === chapterId) continue;
    const other = game.chapters[id];
    if (other.number?.trim().normalize("NFC") === labels[0]) throw new RangeError("duplicate chapter number");
    if (other.name?.trim().normalize("NFC") === labels[1]) throw new RangeError("duplicate chapter name");
  }
  return labels;
}
export function setChapterLabels(game, chapterId, number, name) {
  const labels = checkedChapterLabels(game, chapterId, number, name);
  game.chapters[chapterId].number = labels[0];
  game.chapters[chapterId].name = labels[1];
}

export function renameChapter(game, chapterId, name) {
  if (!isPlainObject(game)) throw new TypeError("game source required");
  const chapter = chapterEntry(game, chapterId);
  if (chapter.number !== undefined) {
    setChapterLabels(game, chapterId, chapter.number, name);
    return;
  }
  // Legacy history replay only: unconverted chapters retain their old budget.
  // Normalize before applying the existing display-name budget and text
  // checks. 16 碼點是 2026-11 用戶裁決的章節標題上限（游戲名仍用各自上限），
  // 不是原版引擎欄位限制。
  if (typeof name !== "string" || !name.trim()) throw new RangeError("chapter name required");
  const normalized = name.trim().normalize("NFC");
  checkGameName(normalized, 16);
  if (game.chapterOrder.some(id => id !== chapterId && game.chapters[id].number !== undefined &&
      game.chapters[id].name === normalized)) throw new RangeError("duplicate chapter name");
  game.chapters[chapterId].name = normalized;
}
// Stronghold references (§4.2): placement status and reference lists are
// derived, never stored. Base cities are 192-locked with frozen slots/coords
// (certified model), so deletion is check-only: the blocker list is the
// deliverable, including the count lock itself.
// B3片3(b)：显式 admit——已放置新城在全部章节建 D6 默认条目（raw-less，不造 32B）。
// attr 0 取自固定源中立城实测（city-027）；_strategicLastFaction 0x18 为 Web 新城中立标记
// （非原版机制，治理时按 F17 刷新）；neighbourCityIds 全空（无路时与道路图一致，通路后须刷新）。
// D2 可玩门：battleMapId 必填且必须是 192 攻城资源目录身份（ki-1995:siege:0..191，
// 与现有战场共享是 Web 产品决定、非原版机制）；写定义＋全部章节行，缺之攻城投影拒收。
export function admitChapterCity(game, cityId, troopsCap, battleMapId, extent = ORIGINAL_EXTENT) {
  if (!isPlainObject(game)) throw new TypeError("game source required");
  const definition = game.cities?.[cityId];
  if (!isPlainObject(definition) || definition.cityId !== cityId) throw new RangeError(`unknown city: ${cityId}`);
  if (!Number.isInteger(troopsCap) || troopsCap < 0 || troopsCap > 255) throw new RangeError(`city ${cityId} needs an explicit troops_cap 0..255 at admission`);
  const siege = /^ki-1995:siege:(\d{1,3})$/.exec(battleMapId ?? "");
  if (!siege || Number(siege[1]) > 191) throw new RangeError(`city ${cityId} needs an explicit shared siege battleMapId ki-1995:siege:0..191 at admission`);
  const slot = definition.runtimeSlot;
  if (!Number.isInteger(slot) || slot < 0 || slot > 511) throw new RangeError(`city ${cityId} needs a live runtime slot`);
  const place = (game.map?.placements ?? []).find(p => p?.cityId === cityId);
  if (!place || !containsTile(extent, place.x, place.y))
    throw new RangeError(`city ${cityId} must be placed on the map before chapter admission`);
  if (typeof definition.name !== "string" || !definition.name.trim()) throw new RangeError(`city ${cityId} needs a name before chapter admission`);
  const numbers = {};
  for (const [name, max] of Object.entries({ max_prod: 0xffff, prod: 0xffff, growth: 0xff, defence: 0xff, troops: 0xff, type: 0xff, view: 0xff })) {
    const value = definition[name];
    if (!Number.isInteger(value) || value < 0 || value > max) throw new RangeError(`city ${cityId} needs ${name} 0..${max} before chapter admission`);
    numbers[name] = value;
  }
  numbers.troops_cap = troopsCap;
  definition.x = place.x; definition.y = place.y;
  definition.battleMapId = battleMapId;
  const entry = { idx: slot, cityId, name: definition.name, faction: null, governor: null, ...numbers, x: place.x, y: place.y,
    battleMapId, attr: 0, _aiCooldown: 0, _strategicLastFaction: 0x18, strategicBorderCount: 0, disaster_event: 0, cityCacheByte: 0,
    neighbourCityIds: [null, null, null, null] };
  let admitted = 0;
  for (const chapterId of game.chapterOrder ?? []) {
    const chapter = game.chapters?.[chapterId], state = chapter?.state;
    if (!isPlainObject(chapter) || !Array.isArray(state?.cities)) throw new RangeError(`chapter ${chapterId} has no city table`);
    if (state.cities.some(c => c?.idx === slot)) continue;
    if (state.cities.length !== slot) throw new RangeError(`chapter ${chapterId} city table is not dense at slot ${slot}`);
    state.cities.push({ ...entry });
    if (!isPlainObject(chapter.cities)) chapter.cities = {};
    if (!Object.hasOwn(chapter.cities, cityId)) chapter.cities[cityId] = { factionId: null, overrides: {} };
    admitted++;
  }
  return { cityId, slot, admitted };
}
// 复制落子时定义缺城兵上限：取首章同城行做默认值（只补缺失，不覆盖已有；无首章行则留空，
// 后续 admit／发布校验照常 fail-closed）。方向与发布自动补行一致：定义→章节为正式流向，
// 这里是反向一次性回填（老档补齐），不拉平各章既有差异。
export function backfillDefinitionTroopCaps(game) {
  if (!isPlainObject(game)) throw new TypeError("game source required");
  const firstId = game.chapterOrder?.[0];
  const first = game.chapters?.[firstId]?.state;
  if (!firstId || !Array.isArray(first?.cities)) return 0;
  let filled = 0;
  for (const [cityId, definition] of Object.entries(game.cities ?? {})) {
    if (!isPlainObject(definition) || definition.cityId !== cityId) continue;
    const current = definition.troops_cap;
    if (Number.isInteger(current) && current >= 0 && current <= 255) continue;
    const row = first.cities.find(c => c?.idx === definition.runtimeSlot);
    const value = row?.troops_cap;
    if (!Number.isInteger(value) || value < 0 || value > 255) continue;
    definition.troops_cap = value;
    filled++;
  }
  return filled;
}
// 定义→章节正式流向：章行缺攻城战场地而同槽定义有效时补齐（只补缺失，不覆盖
// 已有值）。老档补齐；面板改定义后由 applyModule 直接同步全章行。
// 上限不走这里：troops_cap 按章各异，老章互不拉平（定义只供新建 admit 取初值）。
export function backfillRowBattlefields(game) {
  if (!isPlainObject(game)) throw new TypeError('game source required');
  const bySlot = new Map();
  for (const definition of Object.values(game.cities ?? {})) {
    if (!isPlainObject(definition) || definition.cityId === undefined) continue;
    if (!Number.isInteger(definition.runtimeSlot)) continue;
    const siege = /^ki-1995:siege:(\d{1,3})$/.exec(definition.battleMapId ?? '');
    if (siege && Number(siege[1]) <= 191 && !bySlot.has(definition.runtimeSlot)) bySlot.set(definition.runtimeSlot, definition.battleMapId);
  }
  if (!bySlot.size) return 0;
  let filled = 0;
  for (const chapterId of game.chapterOrder ?? []) {
    const rows = game.chapters?.[chapterId]?.state?.cities;
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      if (!isPlainObject(row) || !Number.isInteger(row.idx)) continue;
      if (/^ki-1995:siege:(\d{1,3})$/.test(row.battleMapId ?? '')) continue;
      const value = bySlot.get(row.idx);
      if (value === undefined) continue;
      row.battleMapId = value;
      filled++;
    }
  }
  return filled;
}
// 複製裝配：系統基從源遊戲提取據點身份字段（用戶產品決定）。城兵上限取源遊戲
// 首章同槽行 troops_cap；攻城戰場取源遊戲據點定義 battleMapId。只覆蓋源遊戲確
// 有的有效值（戰場地須 ki-1995:siege:0..191、上限須 0..255 整數）。源無值時：
// base 已有手工值保留（更換持久化）；否則按引擎回退按槽位取 BATTLE.MAP 目錄
//（createSiegeProjection 與 battlemapcatalog 編號一致，siege:N 即目錄 N；
// 0..191 落數，192+ 留空等 admit 指名）。copyData.cities 同時餵遊戲副本與
// 系統基，寫進去即兩邊完全一致。
export function overlayBaseCityIdentity(copyData, source) {
  if (!isPlainObject(copyData) || !isPlainObject(source)) throw new TypeError('game source required');
  const definitions = copyData.cities ?? {};
  const sources = Object.values(source.cities ?? {}).filter(city => isPlainObject(city) && typeof city.cityId === 'string');
  const sourceById = new Map(sources.map(city => [city.cityId, city]));
  const sourceBySlot = new Map(sources.filter(city => Number.isInteger(city.runtimeSlot)).map(city => [city.runtimeSlot, city]));
  const firstId = source.chapterOrder?.[0];
  const firstRows = source.chapters?.[firstId]?.state?.cities;
  const rowBySlot = new Map(Array.isArray(firstRows) ? firstRows.filter(row => Number.isInteger(row?.idx)).map(row => [row.idx, row]) : []);
  let battlefields = 0, troopCaps = 0;
  for (const city of Object.values(definitions)) {
    if (!isPlainObject(city) || typeof city.cityId !== 'string') continue;
    const origin = sourceById.get(city.cityId) ?? sourceBySlot.get(city.runtimeSlot);
    const siege = /^ki-1995:siege:(\d{1,3})$/.exec(origin?.battleMapId ?? '');
    if (origin && siege && Number(siege[1]) <= 191) { city.battleMapId = origin.battleMapId; battlefields++; }
    else if (!/^ki-1995:siege:(\d{1,3})$/.test(city.battleMapId ?? '')) {
      // 無顯式指定即引擎回退：按槽位取 BATTLE.MAP 目錄。0..191 落數，192+ 留空等 admit 指名。
      // base 已有手工值的不洗（更換持久化）。
      if (Number.isInteger(city.runtimeSlot) && city.runtimeSlot >= 0 && city.runtimeSlot <= 191) {
        city.battleMapId = `ki-1995:siege:${city.runtimeSlot}`; battlefields++;
      }
    }
    const cap = rowBySlot.get(city.runtimeSlot)?.troops_cap;
    if (Number.isInteger(cap) && cap >= 0 && cap <= 255) { city.troops_cap = cap; troopCaps++; }
  }
  return { battlefields, troopCaps };
}
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
// 用户 2026-11 决定的章節五屬性：所属势力（setChapterCityFaction）＋当前生产力
// +0x0E 字／上升值 +0x10／防灾值 +0x11／城兵 +0x13。growth／defence 是 u8，
// 0–255 只由编码宽度决定（原版样本 0–179／0–100 不缩小域，也不另设平衡上限）。
// owner/governor/name/coords/type/view/adjacency stay closed (need attr rebuild,
// identity sync, Big5 limits, tile evidence). Raw bytes are patched in step
// with the decoded fields, mirroring editChapterResources.
const CITY_EDIT_FIELDS = Object.freeze({ troops: [0x13, 1], prod: [0x0E, 2], growth: [0x10, 1], defence: [0x11, 1], troops_cap: [0x12, 1] });
const CITY_EDIT_CAPS = Object.freeze({ troops: "troops_cap", prod: "max_prod", growth: 255, defence: 255, troops_cap: 255 });
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
  if (!keys.length || keys.some(k => !Object.hasOwn(CITY_EDIT_FIELDS, k))) throw new RangeError("city edit allows troops/prod/growth/defence/troops_cap only");
  const record = chapterCity(game, chapterId, cityIdx);
  // raw-less（admit新城）：只改具名，跳过原生同步；cap 仍需在位。不造 32B 记录。
  const hasRaw = typeof record.raw === "string" && /^[a-f0-9]{64}$/i.test(record.raw);
  if (hasRaw) {
    if (!Number.isSafeInteger(record.troops_cap) || record.troops_cap < 0 || !Number.isSafeInteger(record.max_prod) || record.max_prod < 0) throw new RangeError("chapter city caps required");
    if (cityRawByte(record.raw, 0x13) !== record.troops || cityRawWord(record.raw, 0x0E) !== record.prod ||
        cityRawByte(record.raw, 0x10) !== record.growth || cityRawByte(record.raw, 0x11) !== record.defence) throw new RangeError("章節據點數值／原生來源分歧");
  } else {
    for (const cap of ["troops_cap", "max_prod"]) if (!Number.isSafeInteger(record[cap]) || record[cap] < 0) throw new RangeError("chapter city caps required");
  }
  const captured = {};
  for (const key of keys) {
    const value = values[key], spec = CITY_EDIT_CAPS[key], cap = typeof spec === "string" ? record[spec] : spec;
    if (typeof value !== "number" || !Number.isInteger(value) || Object.is(value, -0) || value < 0 || value > cap) throw new RangeError(`章節據點數值範圍不符：${key}`);
    captured[key] = value;
  }
  if (keys.every(key => record[key] === captured[key])) return game;
  const next = deepClone(game), state = next.chapters[chapterId].state, target = state.cities.find(c => c?.idx === cityIdx);
  for (const key of keys) {
    const value = captured[key]; if (value === target[key]) continue;
    target[key] = value;
    if (!hasRaw) continue;
    const [offset, size] = CITY_EDIT_FIELDS[key];
    const hex = Array.from({ length: size }, (_, i) => ((value >>> (i * 8)) & 255).toString(16).padStart(2, "")).join("");
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
  // Old city operations may leave only C0E/C0F/C13 different; growth/defence
  // divergence is tolerated only for the fields this call writes, because the
  // sync below overwrites exactly those bytes from the named record.
  const written = new Set(Object.keys(values).flatMap(key => {
    const [offset, size] = CITY_EDIT_FIELDS[key];
    return Array.from({ length: size }, (_, index) => offset + index);
  }));
  for (let offset = 0; offset < 32; offset++) {
    if (offset === 0x0E || offset === 0x0F || offset === 0x13 || written.has(offset)) continue;
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
  if (record.retired === true) throw new RangeError(`retired faction: ${factionIdx}`);
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
  if (!Number.isSafeInteger(cityIdx) || Object.is(cityIdx, -0) || cityIdx < 0 || cityIdx > 511) throw new RangeError("chapter city idx 0..511 required");
  const record = (state.cities ?? []).find(c => c?.idx === cityIdx);
  if (!isPlainObject(record)) throw new RangeError(`unknown chapter city: ${cityIdx}`);
  return record;
}
function chapterFactionRow(state, factionIdx) {
  const record = (state.factions ?? []).find(f => f?.idx === factionIdx);
  if (!isPlainObject(record)) throw new RangeError(`unknown chapter faction: ${factionIdx}`);
  if (record.retired === true) throw new RangeError(`retired chapter faction: ${factionIdx}`);
  return record;
}
function factionValue(state, factionId) {
  if (factionId === null) return null;
  if (!Number.isSafeInteger(factionId) || Object.is(factionId, -0) || factionId < 0) throw new RangeError("chapter faction idx or null required");
  if (!(state.factions ?? []).some(f => f?.idx === factionId && f.retired !== true)) throw new RangeError(`chapter faction ${factionId} is not declared or is retired`);
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
export function setChapterPlayerOpening(game, chapterId, factionIdx, values) {
  const state = chapterState(game, chapterId), faction = chapterFactionRow(state, factionIdx);
  const base = faction.playerOpening ?? { trust: state.trust, policyRaw: state.nativeMonthlyPolicyRaw };
  faction.playerOpening = encodePlayerOpening(base, values);
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
// CHAPTER-WB Web authoring relationship, not a change to DOS capture rules.
// Historical replay keeps setChapterCityFaction/setFactionCapital below.
export function setChapterCityOwner(game, chapterId, cityIdx, factionId) {
  const state = chapterState(game, chapterId), city = chapterCityRow(state, cityIdx);
  const owner = factionValue(state, factionId);
  if (state.factions.some(f => f.capital === cityIdx && f.idx !== owner))
    throw new RangeError("capital ownership is locked; change the capital first");
  const affected = state.factions.filter(f => f.idx === city.faction || f.idx === owner);
  const counts = affected.map(f => ({ faction: f,
    count: state.cities.filter(c => (c.idx === cityIdx ? owner : c.faction) === f.idx).length }));
  // Raw-backed native content has a one-byte F23. Expanded named content does
  // not: refuse an unrepresentable native mirror rather than wrap or truncate.
  for (const { faction, count } of counts) {
    if (count > 255 && (typeof faction.raw === "string" || state.nativeFactionSlotRaw?.[faction.idx] !== undefined))
      throw new RangeError("city count requires expanded named faction representation");
  }
  setChapterCityFaction(game, chapterId, cityIdx, owner);
  for (const { faction, count } of counts) {
    faction.n_cities = count;
    writeSlotByte(state.nativeFactionSlotRaw, faction.idx, faction, 0x23, count);
  }
}
export function setChapterCapital(game, chapterId, factionIdx, cityIdx) {
  const state = chapterState(game, chapterId), faction = chapterFactionRow(state, factionIdx);
  chapterCityRow(state, cityIdx);
  if (state.factions.some(f => f.idx !== factionIdx && f.capital === cityIdx))
    throw new RangeError("capital is already assigned to another faction");
  if (cityIdx > 255 && (typeof faction.raw === "string" || state.nativeFactionSlotRaw?.[factionIdx] !== undefined))
    throw new RangeError("capital requires expanded named faction representation");
  setChapterCityOwner(game, chapterId, cityIdx, factionIdx);
  setFactionCapital(game, chapterId, factionIdx, cityIdx);
}

// A faction keeps exactly one capital (chapterActiveGaps requires it to resolve),
// so "not the capital" is expressed by marking another city, never by clearing.
// Legacy replay preserves original capital bytes, including mismatched owners.
// Current copy commands use setChapterCapital; publication does not exempt _src.
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
  if (!keys.length || keys.some(key => !["generalId", "name", "hao", "portrait", "ability", "suicideOnCapture"].includes(key))) throw new RangeError("chapter general allows generalId/name/hao/portrait/ability/suicideOnCapture only");
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
  // 库自杀旗（attr bit4）随指派写入新槽；其余位保持新槽初值。
  if (values.suicideOnCapture !== undefined) {
    if (typeof values.suicideOnCapture !== 'boolean') throw new RangeError('general suicide flag must be boolean');
    if (values.suicideOnCapture) record.attr |= 0x10;
  }
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
// CHAPTER-WB author inputs, not a new recruitment rule. KI 586F/5875 reads
// G18 as a byte countdown; 589A reads independent G19 (FF = no preference).
// Neither field changes current affiliation, posts or F18 counts. Optional active
// owns G00 bit7 only (KI 586A); other attr bits and the countdown remain independent.
export function setChapterGeneralArrival(game, chapterId, generalIdx, values) {
  if (!isPlainObject(values) || !['appearMonths,joinFaction', 'active,appearMonths,joinFaction'].includes(Object.keys(values).sort().join(','))) throw new TypeError('arrival requires appearMonths and joinFaction, with optional active');
  if (Object.hasOwn(values, 'active') && typeof values.active !== 'boolean') throw new TypeError('active must be boolean');
  if (!Number.isInteger(values.appearMonths) || Object.is(values.appearMonths, -0) || values.appearMonths < 0 || values.appearMonths > 255) throw new RangeError('arrival countdown must fit byte months');
  const state = chapterState(game, chapterId), general = generalByIdx(game, chapterId, generalIdx);
  if (state.factions.some(faction => faction.monarch_idx === generalIdx)) throw new RangeError('monarch is not an ordinary general');
  const join = factionValue(state, values.joinFaction);
  if (join !== null && join >= FACTION_SLOT_LIMIT) throw new RangeError('join target must be a normal faction slot');
  if (join !== null && !state.factions.some(faction => faction.idx === join && Number.isInteger(faction.monarch_idx))) throw new RangeError('join target must have a monarch');
  if (Object.hasOwn(values, 'active')) {
    if (!Number.isInteger(general.attr) || general.attr < 0 || general.attr > 255) throw new RangeError('general attr byte required');
    setGeneralActive(game, chapterId, generalIdx, values.active);
  }
  general.appear_months = values.appearMonths;
  general.join_faction = join;
}

// Current authoring transfer, not a replay of a runtime recruitment/captive flow.
// F18 byte DEC/INC: KI 2AD2..2AF3; n_generals is only the historical parser view.
export function setChapterGeneralOwner(game, chapterId, generalIdx, factionId) {
  const state = chapterState(game, chapterId), general = generalByIdx(game, chapterId, generalIdx);
  const nextOwner = factionValue(state, factionId);
  if (general.faction === nextOwner) return;
  if (general.status !== 0 || general.captive_flag !== 0xff)
    throw new RangeError('special or captive general requires explicit resolution before affiliation editing');
  const updates = [[general.faction, -1], [nextOwner, 1]].filter(([owner]) => owner !== null).map(([owner, delta]) => {
    if (!Number.isInteger(owner) || owner < 0 || owner >= FACTION_SLOT_LIMIT) throw new RangeError('normal faction required');
    const faction = factionEntry(game, chapterId, owner), raw = state.nativeFactionSlotRaw?.[owner];
    if (typeof raw !== 'string' || !/^[0-9a-f]{128}$/i.test(raw) || typeof faction.raw !== 'string' || !/^[0-9a-f]{128}$/i.test(faction.raw)) throw new RangeError('native faction count source required');
    const count = Number.parseInt(raw.slice(0x30, 0x32), 16);
    if (Number.parseInt(faction.raw.slice(0x30, 0x32), 16) !== count ||
        (Object.hasOwn(faction, 'nativeGeneralCount') && faction.nativeGeneralCount !== count)) throw new RangeError('native faction count mirrors disagree');
    return { faction, count: (count + delta) & 0xff };
  });
  setChapterGeneralFaction(game, chapterId, generalIdx, nextOwner);
  updates.forEach(({ faction, count }) => {
    writeSlotByte(state.nativeFactionSlotRaw, faction.idx, faction, 0x18, count);
    if (Object.hasOwn(faction, 'nativeGeneralCount')) faction.nativeGeneralCount = count;
    if (Object.hasOwn(faction, 'n_generals')) {
      const advisor = state.generals.find(row => row.idx === faction.advisor_idx);
      faction.n_generals = Math.max(0, count - (advisor?.faction === faction.idx ? 1 : 0));
    }
  });
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
// Web author succession only, not capture/death processing. Preserve the old
// lord as an ordinary member; G00 bit6 is the lord marker (KI 2A12/2A17).
export function changeChapterMonarch(game, chapterId, factionIdx, generalIdx) {
  const state = chapterState(game, chapterId), faction = factionEntry(game, chapterId, factionIdx);
  const next = generalByIdx(game, chapterId, generalIdx);
  if (faction.monarch_idx === generalIdx) return;
  const prior = generalByIdx(game, chapterId, faction.monarch_idx);
  if (!Object.hasOwn(game.generals ?? {}, next.generalId)) throw new RangeError('new lord must reference this game library');
  if (next.status !== 0 || next.captive_flag !== 255 || next.appear_months !== 0 || !(next.attr & 0x80)) throw new RangeError('new lord must be available');
  if (next.faction !== null && next.faction !== factionIdx) throw new RangeError('new lord must be free or belong to this faction');
  if (postsHeld(game, chapterId, generalIdx).length) throw new RangeError('new lord holds another post');
  if (prior.faction !== factionIdx || prior.status !== 0 || prior.captive_flag !== 255 || postsHeld(game, chapterId, prior.idx).some(post => post.post !== 'monarch' || post.faction !== factionIdx)) throw new RangeError('current lord requires explicit relationship resolution');
  if (next.faction === null) setChapterGeneralOwner(game, chapterId, generalIdx, factionIdx);
  writeFactionField(state, faction, 'monarch_idx', generalIdx);
  faction.monarch = next.name;
  prior.attr &= 0xbf; prior.is_monarch = false;
  next.attr |= 0x40; next.is_monarch = true;
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
// Current authoring also refreshes the legacy display view (parse_sinario.py).
// This is not the KI player-advisor initializer: native F18 stays untouched.
// Keep setStrategist below unchanged for frozen profile replay.
export function setChapterStrategist(game, chapterId, factionIdx, generalIdx) {
  const state = chapterState(game, chapterId), faction = factionEntry(game, chapterId, factionIdx);
  const count = decodeFactionSlot(state.nativeFactionSlotRaw?.[factionIdx], factionIdx).nativeGeneralCount;
  const result = setStrategist(game, chapterId, factionIdx, generalIdx);
  const advisor = state.generals.find(general => general.idx === faction.advisor_idx);
  faction.n_generals = Math.max(0, count - (advisor?.faction === factionIdx ? 1 : 0));
  return result;
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
// Current copy directional diplomacy setting: Web authoring, not a DOS turn action.
export function setChapterDiplomacy(game, chapterId, actorIdx, targetIdx, relation) {
  const state = chapterState(game, chapterId);
  factionEntry(game, chapterId, actorIdx);
  factionEntry(game, chapterId, targetIdx);
  if (actorIdx === targetIdx) throw new RangeError('diplomacy diagonal is not editable');
  const choice = CHAPTER_DIPLOMACY_RELATIONS.find(option => option.id === relation);
  if (!choice) throw new RangeError('unknown diplomacy relationship');
  decodeChapterDiplomacy(state);
  state.nativeDiplomacyRaw = patchByte(state.nativeDiplomacyRaw, actorIdx * 24 + targetIdx, choice.value);
  state.diplomacy[actorIdx][targetIdx] = choice.value;
}

// Current copy command: mandatory lord/capital and product-defined opening values.
// Retains the legacy initializer's remaining fixed-slot fields; not a DOS new-faction claim.
export function createChapterFaction(game, chapterId, monarchIdx, cityIdx) {
  const chapter = chapterEntry(game, chapterId), state = chapterState(game, chapterId);
  const monarch = generalByIdx(game, chapterId, monarchIdx);
  if (monarch.status !== 0 || monarch.captive_flag !== 255 || monarch.appear_months !== 0 || !(monarch.attr & 0x80)) throw new RangeError('lord must be an available ordinary general');
  if (!Object.hasOwn(game.generals ?? {}, monarch.generalId)) throw new RangeError('lord must reference this game library');
  if (!Number.isInteger(cityIdx) || cityIdx < 0 || cityIdx > 255 || !state.cities.some(city => city.idx === cityIdx)) throw new RangeError('native capital city required');
  if (state.factions.some(faction => faction.capital === cityIdx)) throw new RangeError('capital already belongs to another faction');
  if (state.factions.some((faction, index) => faction.idx !== index)) throw new RangeError('native faction slots must remain dense');
  const opening = encodePlayerOpening({ trust: 255, policyRaw: state.nativeMonthlyPolicyRaw },
    { trust: 255, tax: 18, conscription: [0, 0, 0], nextConscription: [0, 0, 0] });
  if (state.nativeDiplomacyRaw !== undefined) decodeChapterDiplomacy(state);
  if (chapter.nextFactionNumber === undefined) initializeChapterFactionIdentities(chapter);
  if (!Number.isSafeInteger(chapter.nextFactionNumber) || chapter.nextFactionNumber >= Number.MAX_SAFE_INTEGER || chapter.nextFactionNumber < 1 || state.factions.some(faction => faction.number >= chapter.nextFactionNumber)) throw new RangeError('faction number allocation exhausted or inconsistent');
  const { factionIdx } = createFaction(game, chapterId, { monarchIdx });
  const faction = state.factions[factionIdx], number = chapter.nextFactionNumber++;
  Object.assign(faction, { number, factionId: `${chapterId}#faction-${number}`, monarch: monarch.name, playerOpening: opening,
    money: 0, money_hi: 0, reserve_cav: 0, reserve_arc: 0, reserve_inf: 0, nativeGeneralCount: 1, n_generals: 1,
    attr: Number.parseInt(faction.raw.slice(0, 2), 16) | 0x80, active: true });
  [[0, faction.attr], [0x18, 1], [0x20, 0], [0x21, 0], [0x22, 0],
    ...[4, 5, 6, 7, 8, 9].map(offset => [offset, 0])].forEach(([offset, value]) => writeSlotByte(state.nativeFactionSlotRaw, factionIdx, faction, offset, value));
  writeFactionField(state, faction, 'diplomat_idx', null);
  monarch.attr |= 0x40; monarch.is_monarch = true; monarch.active = true;
  setChapterCapital(game, chapterId, factionIdx, cityIdx);
  if (state.nativeDiplomacyRaw !== undefined) {
    // User-approved Web default, not a DOS diplomacy rule. Never reset an
    // existing pair, a diagonal, or a retired/reserved/undeclared slot pair.
    state.factions.filter(other => other.idx !== factionIdx && other.retired !== true).forEach(other => {
      state.nativeDiplomacyRaw = patchByte(state.nativeDiplomacyRaw, factionIdx * 24 + other.idx, CHAPTER_BASE.ordinaryDiplomacyRaw);
      state.nativeDiplomacyRaw = patchByte(state.nativeDiplomacyRaw, other.idx * 24 + factionIdx, CHAPTER_BASE.ordinaryDiplomacyRaw);
    });
    const width = state.factions.length;
    state.diplomacy = Array.from({ length: width }, (_, actor) => Array.from({ length: width }, (_, target) => {
      const offset = (actor * 24 + target) * 2;
      return Number.parseInt(state.nativeDiplomacyRaw.slice(offset, offset + 2), 16);
    }));
  }
  return { factionIdx, factionId: faction.factionId, number };
}

// Legacy replay initializer: append one declared fixed slot, with no capital yet.
// Current authoring wraps this in createChapterFaction; do not change replay bytes.
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
  // Frozen legacy replay: n_cities mirrors F23; n_generals is the old Web
  // display view, not native F18. Current createChapterFaction sets both views.
  factions.push({ ...decodeFactionSlot(raw, slot), n_generals: 1 });
  monarch.faction = slot;
  if (Object.hasOwn(state, "n_factions")) state.n_factions = factions.length;
  return { factionIdx: slot };
}
// Web author retirement, not the DOS defeat/capture sequence. The declaration
// retains its physical slot; retired slots are not reused for another identity.
export function retireChapterFaction(game, chapterId, factionIdx) {
  const state = chapterState(game, chapterId), faction = factionEntry(game, chapterId, factionIdx);
  if (state.factions.some((row, index) => row.idx !== index)) throw new RangeError('retirement requires dense native faction slots');
  const members = state.generals.filter(general => general.faction === factionIdx);
  const conflicts = [];
  if (state.legions?.length) conflicts.push(`chapter has ${state.legions.length} legion records; legion retirement is unsupported`);
  if (faction.diplomat_idx !== null && faction.diplomat_idx !== undefined) conflicts.push(`faction ${factionIdx} has diplomat ${faction.diplomat_idx}`);
  state.generals.forEach(general => {
    if (general.captive_flag === factionIdx || general.origFaction === factionIdx) conflicts.push(`general ${general.idx} retains captive faction ${factionIdx}`);
    if (general.idx === 127 && (general.faction === factionIdx || general.join_faction === factionIdx)) conflicts.push('reserved general 127 references the retiring faction');
  });
  members.forEach(general => {
    if (general.status !== 0 || general.captive_flag !== 255) conflicts.push(`general ${general.idx} has status ${general.status} / captive flag ${general.captive_flag}`);
    const posts = postsHeld(game, chapterId, general.idx).filter(post =>
      !(post.post === 'monarch' && post.faction === factionIdx) && !(post.post === 'strategist' && post.faction === factionIdx));
    if (posts.length) conflicts.push(`general ${general.idx} holds another appointment`);
  });
  state.cities.forEach(city => {
    if (city.faction === factionIdx && city.governor !== null && city.governor !== undefined) conflicts.push(`city ${city.idx} has governor ${city.governor}`);
  });
  if (state.nativeStrategicEventRaw !== undefined) {
    if (typeof state.nativeStrategicEventRaw !== 'string' || !/^[0-9a-f]{2048}$/i.test(state.nativeStrategicEventRaw)) conflicts.push('native strategic event source is incomplete');
    else Array.from({ length: 256 }, (_, slot) => slot).forEach(slot => {
      const type = Number.parseInt(state.nativeStrategicEventRaw.slice(slot * 8, slot * 8 + 2), 16);
      if (type !== 0) conflicts.push(`pending native event ${slot} type ${type}; event reference cleanup is unsupported`);
    });
  }
  if (conflicts.length) throw new RangeError('faction retirement conflicts: ' + conflicts.join('; '));
  const encoded = state.nativeFactionSlotRaw?.[factionIdx];
  const native = decodeFactionSlot(encoded, factionIdx);
  let raw = patchByte(encoded, 0, native.attr & 0x7f);
  [[1, 255], [2, 127], [3, 255], [0x16, 255], [0x17, 255], [0x19, 255], [0x2a, 255],
    ...[4, 5, 6, 7, 8, 9, 0x14, 0x18, 0x1a, 0x1b, 0x1c, 0x20, 0x21, 0x22, 0x23].map(offset => [offset, 0])]
    .forEach(([offset, value]) => { raw = patchByte(raw, offset, value); });
  // Keep inactive diplomacy cells, including physical aliases, unchanged.
  // No new faction can acquire this retired slot and inherit its old relations.
  state.nativeFactionSlotRaw[factionIdx] = raw;
  Object.assign(faction, decodeFactionSlot(raw, factionIdx), { retired: true, monarch: '', money_hi: 0, n_generals: 0 });
  delete faction.playerOpening;
  members.forEach(general => { general.faction = null; general.attr &= 0xbf; general.is_monarch = false; });
  state.generals.forEach(general => { if (general.join_faction === factionIdx) general.join_faction = null; });
  state.cities.forEach(city => {
    if (city.faction !== factionIdx) return;
    city.faction = null;
    writeSlotByte(state.nativeCityRecordRaw, city.idx, city, CITY_OWNER_BYTE, CITY_NEUTRAL_BYTE);
  });
  state.factions.forEach(other => {
    if (other.target_faction !== factionIdx) return;
    other.target_faction = null;
    writeSlotByte(state.nativeFactionSlotRaw, other.idx, other, 0x19, 255);
  });
  if (state.player_faction === factionIdx) state.player_faction = null;
  return { factionIdx, members: members.length };
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
