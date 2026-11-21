// Local E-03 compiler adapter. Web engineering, not a new KI rule.
// Fixed city slots/coordinates only; native cost/flags/ports are rechecked
// through the existing E717/E81C/E961 adapter, never guessed from a picture.
import { canonicalDigest, validateGameSource } from "./gamesource.js";
import { compileCityIdentity } from './cityidentity.js';
import { projectStructuredRoadGraph } from './structuredroadgraph.js';
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

export function compileGameSource(game, sha256hex, { northExperiment = false } = {}) {
  validateGameSource(game, { northExperiment });
  const extent = northExperiment ? game.map.bounds : undefined;
  const compiled = compileMapSource({ schemaVersion: 1, map: game.map,
    componentDefinitions: game.componentDefinitions ?? {} }, { northExperiment });
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
  const scanCities = extent ? cities.slice().sort((a,b) => a.y-b.y || a.x-b.x) : cities;
  if (nodeScan.length !== cities.length || nodeScan.some(([x, y], i) =>
    x + (extent?.minX ?? 0) !== scanCities[i].x || y + (extent?.minY ?? 0) !== scanCities[i].y))
    throw new RangeError("unsupported city node scan: composed plane differs from city slots");
  const checked = [];
  const tiles = (x, y) => compiled.terrainBytes[(y - (extent?.minY ?? 0)) * compiled.width + x - (extent?.minX ?? 0)];
  for (const road of game.map.roads) {
    const derived = buildRoad({ ...road, cities: citiesById, roads: checked, tiles }, extent);
    const binding = road.nativeBinding;
    // edgeId is import provenance; addresses are reassigned by the encoder.
    const ruleBinding = { weight: binding?.weight, flags: binding?.flags,
      bounds: binding?.bounds, slots: binding?.slots };
    if (canonicalDigest(ruleBinding, sha256hex) !== canonicalDigest(derived.nativeBinding, sha256hex))
      throw new RangeError(`stale native road binding: ${road.id}`);
    checked.push({ ...derived, id: road.id });
  }
  const roadGraph = extent ? projectStructuredRoadGraph(checked, { placements: game.map.placements,
    identity: compileCityIdentity({ cities: game.cities, cityOrder: cities.map(city => city.cityId), placements: game.map.placements }, extent) }, extent) : encodeRoadGraphV2(checked, citiesById);
  if (!extent) validateOriginalRoadContent(roadGraph);
  const neighbors = roadGraph.nodes.map(() => []);
  for (const edge of roadGraph.edges) {
    const source = extent ? edge.fromCityIndex : edge.source, target = extent ? edge.toCityIndex : edge.target;
    neighbors[source].push(target);
    neighbors[target].push(source);
  }
  for (const list of neighbors) list.sort((a, b) => a - b);
  for (const chapterId of game.chapterOrder) {
    const state = game.chapters[chapterId].state;
    for (const node of roadGraph.nodes) {
      const nodeSlot = extent ? node.cityIndex : node.id;
      const city = state?.cities?.[nodeSlot];
      if (city?.idx !== nodeSlot || city.x !== node.x || city.y !== node.y)
        throw new RangeError(`chapter city/node mismatch: ${chapterId} slot ${node.id}`);
      // Imported fixed-slot chapters carry a compact native adjacency table.
      // No certified edited-chapter initializer is wired here: don't retain
      // stale C1C..1F after an edge deletion/addition or silently rewrite it.
      if (/^[0-9a-f]{64}$/i.test(city.raw ?? "")) {
        const rawWord = (offset) => Number.parseInt(city.raw.slice(offset * 2, offset * 2 + 2), 16) +
          Number.parseInt(city.raw.slice(offset * 2 + 2, offset * 2 + 4), 16) * 256;
        if (rawWord(8) !== node.x || rawWord(10) !== node.y)
          throw new RangeError(`chapter native city coordinate mismatch: ${chapterId} slot ${node.id}`);
        const importedNeighbors = city.raw.slice(0x1c * 2).match(/../g)
          .map((hex) => Number.parseInt(hex, 16)).filter((idx) => idx !== 255).sort((a, b) => a - b);
        if (importedNeighbors.join(",") !== neighbors[nodeSlot].join(","))
          throw new RangeError(`unsupported chapter topology change: ${chapterId} slot ${node.id}`);
        continue;
      }
      // D1(b) named branch: editor-admitted cities carry no native raw.
      // Corrupt raw is rejected above by falling through; only a missing raw
      // selects this branch. Coordinate agreement is already established by
      // the idx/x/y check plus the tile node-scan; here the named neighbour
      // table must exactly cover the compiled road adjacency, same strictness
      // as the raw branch (no stated neighbour without a road and vice versa).
      if (city.raw !== undefined && city.raw !== null)
        throw new RangeError(`unsupported chapter city source: ${chapterId} slot ${node.id}`);
      if (typeof city.cityId !== "string" || !Object.hasOwn(game.cities ?? {}, city.cityId))
        throw new RangeError(`chapter city without archive coverage: ${chapterId} slot ${node.id}`);
      const placements = game.map?.placements ?? [];
      const placement = placements.find((p) => p?.cityId === city.cityId);
      if (!placement || placement.x !== city.x || placement.y !== city.y)
        throw new RangeError(`chapter city/placement mismatch: ${chapterId} slot ${node.id}`);
      if (!Array.isArray(city.neighbourCityIds) || city.neighbourCityIds.length !== 4 ||
          city.neighbourCityIds.some((id) => id !== null && (typeof id !== "string" || !Object.hasOwn(game.cities, id))))
        throw new RangeError(`chapter city neighbours must be four named slots: ${chapterId} slot ${node.id}`);
      // Neighbour rows may be legacy raw rows without a cityId (mixed
      // chapter); resolve through the placement binding, the same authority
      // that ties the archive identity to chapter coordinates.
      const namedNeighbors = [];
      for (const id of city.neighbourCityIds) {
        if (id === null) continue;
        const neighbourPlacement = placements.find((p) => p?.cityId === id);
        const slot = neighbourPlacement ? state.cities.findIndex((row) => row?.x === neighbourPlacement.x && row?.y === neighbourPlacement.y) : -1;
        if (slot < 0) throw new RangeError(`chapter city neighbour not placed: ${chapterId} slot ${node.id}`);
        namedNeighbors.push(slot);
      }
      namedNeighbors.sort((a, b) => a - b);
      if (namedNeighbors.join(",") !== neighbors[nodeSlot].join(","))
        throw new RangeError(`unsupported chapter topology change: ${chapterId} slot ${node.id}`);
      for (const field of ["attr", "_aiCooldown", "_strategicLastFaction", "strategicBorderCount", "disaster_event", "cityCacheByte"]) {
        if (!Number.isInteger(city[field]) || city[field] < 0 || city[field] > 255)
          throw new RangeError(`chapter city initializer out of range: ${chapterId} slot ${node.id} ${field}`);
      }
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
        compat.roadCostHex.length !== compiled.width * (extent ? 256 : compiled.height) * 2)
      throw new RangeError("invalid explicit compatibility roadCost bytes");
    const baseCost = Uint8Array.from(compat.roadCostHex.match(/../g), (hex) => Number.parseInt(hex, 16));
    roadCost = baseCost;
    if (extent) {
      roadCost = compiled.roadMask.slice();
      roadCost.set(baseCost, -extent.minY * extent.width);
      // Preserve explicit costs inside the original rectangle, as on old maps.
      // Outside it the grid is only a visual projection; graph edges own travel.
      for (const {x,y} of roadGraph.nodes) if (y < 0) roadCost[(y-extent.minY)*extent.width+x] = 1;
    }
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
    for (const node of roadGraph.nodes) roadCost[(node.y - (extent?.minY ?? 0)) * compiled.width + node.x] = 1;
    compatibilityAssetMode = "legacy-trial-derived-mask";
  }
  return { ...compiled, roadGraph, roadCost, roadOffsetBytes, compatibilityAssetMode,
    sourceDigest: canonicalDigest(game, sha256hex),
    ...compileSourceIndex(game, cities, sha256hex) };
}

// Existing editor callers keep their API; formal migration calls the
// exact same compiler, with no builtin/copy identity exemption.
export const compileTrialSource = compileGameSource;
