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

export const GAMESOURCE_SCHEMA = 1;
export const GAME_RULE_PROFILE = "ki-1995/web-0.1.1";
export const BUILTIN_GAME_ID = "wolong-builtin";

// (ii) 立法＋修正案 A（用户批准 2026-10-10，非原版机制）：保存门（必填＋连接性）与 active 门
// （全字段＋交叉＋计数）。类型只断言 typeof 级别（内置 20 章实测值域），不发明数值范围；武将
// faction/join_faction 经内置章反例证非严格外键，不验；将数暂锁 128 dense、城数 192 锁，章节/势力开放。
const GENERAL_NUMBER_FIELDS = ["idx","attr","portrait","battle_rating","assignment_budget","battle_formation","status","talk_idx","captive_flag","appear_months"];
const ABILITY_FIELDS = ["siege","field","naval","force","lead","politics"];
const CITY_NUMBER_FIELDS = ["idx","max_prod","prod","growth","defence","troops","troops_cap","type","view"];
const FACTION_NUMBER_FIELDS = ["idx","attr","monarch_idx","capital","n_generals","money","legion_morale_cap","reserve_cav","reserve_arc","reserve_inf","n_cities","bellicosity","talk_style","march_marker_style"];
const FACTION_NULLABLE_NUMBER_FIELDS = ["advisor_idx","diplomat_idx","target_faction","strategic_city_primary","strategic_city_secondary"];
const isFiniteNumber = (v) => typeof v === "number" && Number.isFinite(v);
function pushNumberFields(record, fields, label, gaps, code) {
  for (const f of fields) if (!isFiniteNumber(record?.[f])) gaps.push({ code, subject: label, message: `${label}.${f} must be a finite number` });
}
// 保存门：缺即拒存（草稿亦不存）。只验必填存在，不验 active；连接性由 map roads 既有校验覆盖。
export function chapterSaveGaps(state, chapterId = "?") {
  const gaps = [];
  for (const [i, g] of (state?.generals ?? []).entries()) {
    const label = `chapter ${chapterId} general[${i}]`;
    if (typeof g?.name !== "string" || !g.name.trim()) gaps.push({ code: "entity-save", subject: label, message: `${label}.name is required` });
    if (!Number.isInteger(g?.portrait)) gaps.push({ code: "entity-save", subject: label, message: `${label}.portrait is required` });
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
  const gidx = new Set(), cidx = new Set(), fids = new Set();
  for (const g of generals) {
    if (!Number.isInteger(g?.idx) || g.idx < 0 || g.idx > 127 || gidx.has(g.idx)) gaps.push({ code: "entity-count", subject: `chapter ${chapterId}`, message: `general idx must be unique 0..127` });
    else gidx.add(g.idx);
  }
  for (const c of cities) {
    if (!Number.isInteger(c?.idx) || c.idx < 0 || c.idx > 191 || cidx.has(c.idx)) gaps.push({ code: "entity-count", subject: `chapter ${chapterId}`, message: `city idx must be unique 0..191` });
    else cidx.add(c.idx);
  }
  for (const fa of factions) { if (Number.isInteger(fa?.idx)) fids.add(fa.idx); }
  for (const [i, g] of generals.entries()) {
    const label = `chapter ${chapterId} general[${i}]`;
    pushNumberFields(g, GENERAL_NUMBER_FIELDS, label, gaps, "entity-field");
    if (typeof g?.name !== "string" || typeof g?.hao !== "string") gaps.push({ code: "entity-field", subject: label, message: `${label}.name/hao must be strings` });
    if (isPlainObject(g?.ability)) pushNumberFields(g.ability, ABILITY_FIELDS, `${label}.ability`, gaps, "entity-field");
    else gaps.push({ code: "entity-field", subject: label, message: `${label}.ability must be an object` });
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
    for (const chapter of chapters) {
      const newId = `${gameId}#${chapter.id}`;
      game.compatibility.idMap.chapters[chapter.id] = newId;
      game.chapters[newId] = { chapterId: newId, sourceChapterId: chapter.id, state: chapter.state };
      game.chapterOrder.push(newId);
      for (const general of chapter.state.generals ?? []) {
        if (game.generals[general.idx] === undefined) {
          game.generals[general.idx] = { slot: general.idx, name: general.name };
          game.compatibility.slotBindings.generals[general.idx] = general.idx;
        }
      }
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
