// Local E-03 compiler adapter. Web engineering, not a new KI rule.
// Fixed city slots/coordinates only; native cost/flags/ports are rechecked
// through the existing E717/E81C/E961 adapter, never guessed from a picture.
import { canonicalDigest, validateGameSource } from "./gamesource.js";
import { compileMapSource } from "./mapcompile.js";
import { buildRoad, encodeRoadGraphV2 } from "./roadedit.js";
import { validateOriginalRoadContent } from "../../game/navigation/originalroadcontent.js";

// Fixed-node scan enforcement also changes the supported contract.
// Keep all old build directories intact.
export const TRIAL_COMPILER_REVISION = "editor-local-0.6"; // combination-level display-only projection

/** C5 index summary: dense slot table plus per-chapter state digests.
 * Pure derivation over already-validated dense cities and chapter states;
 * battleMapId bindings are absent from game.cities by schema (C6 authoring
 * model work), so no binding table is emitted here. Both outputs must be
 * JSON-stable for manifest/publish consumers.
 */
export function compileSourceIndex(game, cities, sha256hex) {
  if (typeof sha256hex !== "function")
    throw new RangeError("sha256hex digest function required");
  const cityIndex = cities.map((city, slot) => {
    if (city?.runtimeSlot !== slot || typeof city.cityId !== "string")
      throw new RangeError("city index requires dense 0..N-1 slots");
    return { slot, cityId: city.cityId, x: city.x, y: city.y };
  });
  const chapterDigests = {};
  for (const chapterId of game.chapterOrder ?? []) {
    const state = game.chapters?.[chapterId]?.state;
    if (state === undefined)
      throw new RangeError(`chapter state missing: ${chapterId}`);
    chapterDigests[chapterId] = canonicalDigest(state, sha256hex);
  }
  return { cityIndex, chapterDigests };
}

export function compileGameSource(game, sha256hex) {
  validateGameSource(game);
  const compiled = compileMapSource({ schemaVersion: 1, map: game.map,
    componentDefinitions: game.componentDefinitions ?? {} });
  const placements = new Map(game.map.placements.map((p) => [p.cityId, p]));
  // Placement array order is editor state, NOT native node numbering.
  // CITY-CAPACITY-1 C5: slots are dense scan order 0..N-1; the composed
  // plane scan below (not FIXED_CITY_BINDINGS) is the position authority.
  const cities = Object.values(game.cities).slice().sort((a, b) => a.runtimeSlot - b.runtimeSlot);
  if (cities.some((city, index) => city.runtimeSlot !== index))
    throw new RangeError("city runtime slots must be dense 0..N-1 in scan order");
  const citiesById = new Map(cities.map((city) => {
    const place = placements.get(city.cityId);
    if (!place || place.x !== city.x || place.y !== city.y)
      throw new RangeError(`unsupported city placement: ${city.cityId}`);
    return [city.cityId, place];
  }));
  // KI E4CE..E50B scans 384 columns × 256 rows: each CB..D3 tile
  // calls E57F and increments node count (E4ED/E4F0). The composed-plane
  // scan order is the slot authority: count and coordinates must match the
  // city table exactly. Extra/missing/unmoved scan nodes are rejected here,
  // not encoded. This is a Web fixed-domain rejection, not malformed-DOS emulation.
  const nodeScan = [];
  for (let at = 0; at < compiled.terrainBytes.length; at++) {
    const tile = compiled.terrainBytes[at];
    if (tile >= 0xcb && tile < 0xd4)
      nodeScan.push([at % compiled.width, Math.floor(at / compiled.width)]);
  }
  if (nodeScan.length !== cities.length || nodeScan.some(([x, y], i) =>
    x !== cities[i].x || y !== cities[i].y))
    throw new RangeError("unsupported city node scan: composed plane differs from city slots");
  const checked = [];
  const tiles = (x, y) => compiled.terrainBytes[y * compiled.width + x];
  for (const road of game.map.roads) {
    const derived = buildRoad({ ...road, cities: citiesById, roads: checked, tiles });
    const binding = road.nativeBinding;
    // edgeId is import provenance; addresses are reassigned by the encoder.
    const ruleBinding = { weight: binding?.weight, flags: binding?.flags,
      bounds: binding?.bounds, slots: binding?.slots };
    if (canonicalDigest(ruleBinding, sha256hex) !== canonicalDigest(derived.nativeBinding, sha256hex))
      throw new RangeError(`stale native road binding: ${road.id}`);
    checked.push({ ...derived, id: road.id });
  }
  const roadGraph = encodeRoadGraphV2(checked, citiesById);
  validateOriginalRoadContent(roadGraph);
  const neighbors = roadGraph.nodes.map(() => []);
  for (const edge of roadGraph.edges) {
    neighbors[edge.source].push(edge.target);
    neighbors[edge.target].push(edge.source);
  }
  for (const list of neighbors) list.sort((a, b) => a - b);
  for (const chapterId of game.chapterOrder) {
    const state = game.chapters[chapterId].state;
    for (const node of roadGraph.nodes) {
      const city = state?.cities?.[node.id];
      if (city?.idx !== node.id || city.x !== node.x || city.y !== node.y)
        throw new RangeError(`chapter city/node mismatch: ${chapterId} slot ${node.id}`);
      // Imported fixed-slot chapters carry a compact native adjacency table.
      // No certified edited-chapter initializer is wired here: don't retain
      // stale C1C..1F after an edge deletion/addition or silently rewrite it.
      if (!/^[0-9a-f]{64}$/i.test(city.raw ?? ""))
        throw new RangeError(`unsupported chapter city source: ${chapterId} slot ${node.id}`);
      const rawWord = (offset) => Number.parseInt(city.raw.slice(offset * 2, offset * 2 + 2), 16) +
        Number.parseInt(city.raw.slice(offset * 2 + 2, offset * 2 + 4), 16) * 256;
      if (rawWord(8) !== node.x || rawWord(10) !== node.y)
        throw new RangeError(`chapter native city coordinate mismatch: ${chapterId} slot ${node.id}`);
      const importedNeighbors = city.raw.slice(0x1c * 2).match(/../g)
        .map((hex) => Number.parseInt(hex, 16)).filter((idx) => idx !== 255).sort((a, b) => a - b);
      if (importedNeighbors.join(",") !== neighbors[node.id].join(","))
        throw new RangeError(`unsupported chapter topology change: ${chapterId} slot ${node.id}`);
    }
  }
  // Compatibility is explicit source data, NOT a KI weight formula.
  // M0 found 15,773 differences between the original Web grid and the
  // graph-only mask; no-edit formal migration must preserve actual bytes.
  let roadCost;
  let roadOffsetBytes;
  let compatibilityAssetMode;
  const compat = game.compatibilityAssets;
  if (compat !== undefined) {
    if (typeof compat.roadCostHex !== "string" || !/^[0-9a-f]+$/i.test(compat.roadCostHex) ||
        compat.roadCostHex.length !== compiled.width * compiled.height * 2)
      throw new RangeError("invalid explicit compatibility roadCost bytes");
    roadCost = Uint8Array.from(compat.roadCostHex.match(/../g), (hex) => Number.parseInt(hex, 16));
    if (typeof compat.roadOffsetJson !== "string") throw new RangeError("invalid explicit roadOffset JSON");
    let offsets;
    try { offsets = JSON.parse(compat.roadOffsetJson); }
    catch (cause) { throw new RangeError("invalid explicit roadOffset JSON", { cause }); }
    if (!offsets || typeof offsets !== "object" || Array.isArray(offsets)) throw new RangeError("invalid explicit roadOffset table");
    for (const [tile, offset] of Object.entries(offsets)) {
      if (!/^(?:0|[1-9][0-9]{0,2})$/.test(tile) || Number(tile) > 255 || !Array.isArray(offset) ||
          offset.length !== 2 || !offset.every((v) => typeof v === "number" && Number.isFinite(v)))
        throw new RangeError(`invalid explicit roadOffset entry ${tile}`);
    }
    roadOffsetBytes = new TextEncoder().encode(compat.roadOffsetJson);
    compatibilityAssetMode = "source-explicit";
  } else {
    // Retain the prior local harness mode for old draft sources. It is
    // clearly NOT parity with original auxiliary assets and cannot serve
    // as the formal no-edit migration receipt. Never selected by gameId.
    roadCost = compiled.roadMask.slice();
    for (const node of roadGraph.nodes) roadCost[node.y * compiled.width + node.x] = 1;
    compatibilityAssetMode = "legacy-trial-derived-mask";
  }
  return { ...compiled, roadGraph, roadCost, roadOffsetBytes, compatibilityAssetMode,
    sourceDigest: canonicalDigest(game, sha256hex),
    ...compileSourceIndex(game, cities, sha256hex) };
}

// Existing editor callers keep their API; formal migration calls the
// exact same compiler, with no builtin/copy identity exemption.
export const compileTrialSource = compileGameSource;
