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
    canonicalize({ gameId: BUILTIN_GAME_ID, revision, world, chapters }),
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
  // Studio v0 decoration vocabulary (E-03 slice): grass only. Shape follows
  // the tile-N precedent (existence is what mapcompile gates); further
  // kinds arrive with their recipes, not by free invention here.
  game.componentDefinitions["deco-grass"] = { id: "deco-grass", kind: "grass", layer: "decor", tile: 0x10 };
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
  assertFiniteJson(game, "game");
  return diagnostics;
}
