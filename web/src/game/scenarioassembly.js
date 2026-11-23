// Web identity/admission only, not a KI mechanism or a v2 gameplay switch.
// The actual App uses this detached preparation before any live installation.
// Formal JSON contract and unsupported native scope: march notes §3.10.
import { STRATEGIC_LAYOUT } from "../content/worlddefinition.js";
import { isSupportedMapExtent } from "../content/authoring/mapextent.js";
import { maxNodesForVersion } from "./navigation/originalroadmemory.js";
import { Scenario } from "./world.js";
import { assertLegionPhaseState } from "./legionphase.js";
import {
  hasNativeLegionSlots,
  assertNativeLegionSlots,
  initializeNativeLegionSlotsFromZeroChapter,
  rebindNativeLegionViews,
} from "./nativelegions.js";
import {
  assertNativeFactionSlots,
  hasNativeFactionSlots,
  initializeNativeFactionSlots,
  rebindNativeFactionViews,
} from "./nativefactions.js";
import {
  assertNativeDiplomacyMatrix,
  hasNativeDiplomacyMatrix,
  initializeNativeDiplomacyMatrix,
  rebindNativeDiplomacyViews,
} from "./nativediplomacy.js";
import {
  assertNativeStrategicEventWheel,
  hasNativeStrategicEventWheel,
  initializeNativeStrategicEventWheel,
} from "./nativeevents.js";
import {
  assertNativeMonthlyPolicy,
  hasNativeMonthlyPolicy,
  initializeNativeMonthlyPolicy,
} from "./nativemonthlypolicy.js";
import {
  hasScenarioRoadMemory,
  getScenarioRoadMemory,
  initializeScenarioRoadMemory,
  restoreScenarioRoadMemory,
  snapshotScenarioRoadMemory,
} from "./navigation/scenarioroadmemory.js";
import { readOriginalRoadCityOwnerByte, readCityOwnerByIndex, readOriginalStrategicNeighbour } from "./navigation/originalroadstate.js";
import {
  createScenarioMovementMemory,
  synthesizeScenarioMovementMemory,
} from "./navigation/scenariomovementmemory.js";
import {
  createScenarioCityCache,
  initializeScenarioCityNativeInputs,
  synthesizeScenarioCityCache,
} from "./navigation/scenariocitycache.js";
import { createScenarioTerrainMemory } from "./navigation/scenarioterrainmemory.js";
import { paint8A1E } from "./navigation/originalcitycapture.js";
import { initializeScenarioWeatherInputs } from "./weather.js";

// Assembly identity is not a second RAM owner. RAM remains in its existing adapter.
const assemblies = new WeakMap();
const has = (object, key) => object != null && Object.hasOwn(object, key);

export function assertNoEmbeddedRoadMetadata(state) {
  for (const key of [
    "scenarioAssembly",
    "roadMemory",
    "movementMemory",
    "terrainMemory",
    "cityCache",
    "roadVersion",
  ]) {
    if (has(state, key))
      throw new TypeError(`Misplaced scenario metadata: ${key}`);
  }
}

// MAP-EXT E9: grid (extended-map) save identity. The structured road graph
// asset version stays 'world-grid-experiment' at the loader gate; the save
// metadata marker is the distinct string below so every native v2/v3 gate
// (which matches exact 2/3) keeps failing closed on grid saves and restores.
const GRID_ROAD_VERSION = "grid";

// Canonical JSON for change detection only (not a security digest): sorted
// object keys, arrays in order. The loader freezes the graph, so both the
// snapshot-time and restore-time objects stringify identically when the
// compiled bytes are identical. Pure integer arithmetic: deterministic
// across processes without imports (web/src stays browser-safe).
function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}
function cyrb53(str, seed) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
function digestRoadGraph(graph) {
  const text = stableStringify(graph);
  return [1, 2, 3].map((seed) => cyrb53(text, seed).toString(16).padStart(14, "0")).join("");
}

function assertGridBounds(bounds) {
  if (!bounds || !isSupportedMapExtent(bounds))
    throw new TypeError("Invalid grid scenario bounds");
}

function assertMetadata(metadata) {
  if (metadata?.version !== 1 || (metadata.roadVersion !== GRID_ROAD_VERSION && ![1, 2, 3].includes(metadata.roadVersion)))
    throw new TypeError("Invalid scenario assembly schema/road version");
  for (const value of [
    metadata.world?.id,
    metadata.world?.revision,
    metadata.content?.packId,
    metadata.content?.chapterId,
    metadata.content?.revision,
  ]) {
    if (typeof value !== "string" || !value.length)
      throw new TypeError("Missing scenario assembly identity");
  }
}

/** Synchronous, no resource loading. Absence is legacy v1, not invented history. */
export function readSavedAssembly(saved) {
  assertNoEmbeddedRoadMetadata(saved?.state);
  assertNoEmbeddedRoadMetadata(saved);
  const meta = saved?.webMeta;
  if (has(meta, "roadVersion")) throw new TypeError("Misplaced road version");
  if (!has(meta, "scenarioAssembly")) {
    if (
      has(meta, "roadMemory") ||
      has(meta, "movementMemory") ||
      has(meta, "terrainMemory") ||
      has(meta, "cityCache")
    )
      throw new TypeError("Road memory requires assembly metadata");
    return { metadata: null, roadMemory: null };
  }
  assertMetadata(meta.scenarioAssembly);
  const metadata = structuredClone(meta.scenarioAssembly);
  // P65 G5 (entire-v2-replacement gate): explicit v1 save metadata is
  // retired at the gate (P24 no-old-save-compat policy). v1 saves cannot
  // enter play; fail closed here, never a silent downgrade or v1 restore.
  if (metadata.roadVersion === 1)
    throw new TypeError("v1 save retired; start a new game (v2 only)");
  if (metadata.roadVersion === 2 && !meta.roadMemory)
    throw new TypeError("v2 restore requires road memory");
  // MAP-EXT E9: grid saves carry the v2 occupancy plane plus the immutable
  // plane identities, never native road RAM. The graph digest and the
  // terrain identity are verified again after loading at restore; a save
  // whose world bytes drifted is refused, never rebound to new geometry.
  if (metadata.roadVersion === GRID_ROAD_VERSION) {
    assertGridBounds(metadata.bounds);
    for (const field of ["roadGraphDigest", "terrainIdentity"]) {
      if (typeof metadata[field] !== "string" || !metadata[field].length)
        throw new TypeError(`Grid save requires ${field}`);
    }
    if (meta.roadMemory || meta.terrainMemory || meta.cityCache)
      throw new TypeError("Grid save carries no native road memory");
    if (!meta.movementMemory)
      throw new TypeError("Grid restore requires movement memory");
  }
  if (has(meta, "movementMemory") && !meta.movementMemory)
    throw new TypeError("Invalid saved movement memory");
  if (has(meta, "terrainMemory") && !meta.terrainMemory)
    throw new TypeError("Invalid saved terrain memory");
  if (has(meta, "cityCache") && !meta.cityCache)
    throw new TypeError("Invalid saved city cache");
  return {
    metadata,
    roadMemory: structuredClone(meta.roadMemory ?? null),
    movementMemory: structuredClone(meta.movementMemory ?? null),
    terrainMemory: structuredClone(meta.terrainMemory ?? null),
    cityCache: structuredClone(meta.cityCache ?? null),
  };
}

export function assertAssemblyIdentity(metadata, idx, content, world) {
  assertMetadata(metadata);
  const chapter = content?.resolveReference(metadata.content);
  if (!chapter || chapter.legacyScenarioIndex !== idx)
    throw new TypeError("Scenario content identity/index mismatch");
  if (
    metadata.world.id !== world?.definition?.id ||
    metadata.world.revision !== world?.definition?.revision
  )
    throw new TypeError("Scenario world identity mismatch");
}

/** Admission identity: only staged road versions may enter App play.
 * Saves without assembly metadata are legacy phaseless saves and pass
 * through (P58 flip keeps the pre-flip null-metadata admission intact). */
export function assertPlayableScenario({ metadata }) {
  // P65 G5: only staged v2/v3 (or phaseless legacy metadata, v2-initialized
  // at prepare per P58) may enter App play. Explicit v1 is retired.
  // MAP-EXT E9: staged grid saves (explicit bounds + digest + terrain
  // identity) enter App play through the grid restore branch below.
  if (
    metadata != null &&
    metadata.roadVersion !== 2 &&
    metadata.roadVersion !== 3 &&
    metadata.roadVersion !== GRID_ROAD_VERSION
  )
    throw new Error("unstaged road version cannot enter play");
}

function currentMetadata(idx, content, world, roadVersion) {
  const chapter = content?.chapter(idx);
  const metadata = {
    version: 1,
    world: { id: world?.definition?.id, revision: world?.definition?.revision },
    content: structuredClone(chapter?.reference),
    roadVersion,
  };
  assertAssemblyIdentity(metadata, idx, content, world);
  return metadata;
}

/** Explicit fresh/restore; v2 returns only a detached owner, never a playable App. */
const gridOwners = new WeakMap();
export const scenarioGridRoadContext = scenario => gridOwners.get(scenario);

export async function prepareScenario({
  raw,
  idx,
  content,
  world,
  mode,
  metadata = null,
  roadMemory = null,
  movementMemory = null,
  terrainMemory = null,
  cityCache = null,
  northExperiment = false,
  // MAP-EXT E6: explicit opt-in for supported extents (any side), not north-only.
  mapExtent = false,
}) {
  if (mode !== "fresh" && mode !== "restore")
    throw new TypeError("Explicit scenario preparation mode required");
  assertNoEmbeddedRoadMetadata(raw);
  const scenario = new Scenario(structuredClone(raw));
  assertNativeLegionSlots(scenario);
  if (hasNativeLegionSlots(scenario)) rebindNativeLegionViews(scenario);
  assertNativeFactionSlots(scenario);
  if (hasNativeFactionSlots(scenario)) rebindNativeFactionViews(scenario);
  assertNativeDiplomacyMatrix(scenario);
  if (hasNativeDiplomacyMatrix(scenario)) {
    rebindNativeDiplomacyViews(scenario);
    assertNativeStrategicEventWheel(scenario);
    if (!hasNativeMonthlyPolicy(scenario))
      throw new TypeError("Missing native monthly policy");
    assertNativeMonthlyPolicy(scenario);
  } else if (hasNativeMonthlyPolicy(scenario)) {
    throw new TypeError(
      "Native monthly policy requires native diplomacy matrix",
    );
  }
  assertLegionPhaseState(scenario);
  if (!Array.isArray(raw.cities))
    throw new TypeError("Missing scenario cities");
  if (metadata !== null) assertAssemblyIdentity(metadata, idx, content, world);
  if (mode === "fresh" && (metadata !== null || roadMemory !== null))
    throw new TypeError("Fresh scenario cannot restore metadata/memory");
  // P65 G5: explicit v1 save metadata is retired at the gate (P24
  // no-old-save-compat policy). Fail closed; never restore a v1 path.
  if (metadata?.roadVersion === 1)
    throw new TypeError("v1 save retired; start a new game (v2 only)");
  // MAP-EXT E9: grid restore. The movement plane is rebuilt from the saved
  // spans through the same validating constructor; the immutable planes
  // (bounds, road graph bytes, terrain bytes) are reloaded from the live
  // world and must reproduce the saved identities exactly. Anything else
  // (fresh mode, stray RAM planes, drifted bytes) fails closed here.
  if (mode === "restore" && metadata?.roadVersion === GRID_ROAD_VERSION) {
    if (movementMemory == null)
      throw new TypeError("Grid restore requires movement memory");
    if (roadMemory != null || terrainMemory != null || cityCache != null)
      throw new TypeError("Grid restore carries no native road memory");
    assertAssemblyIdentity(metadata, idx, content, world);
    assertGridBounds(metadata.bounds);
    const definition = world?.definition;
    for (const key of ["minX", "minY", "width", "height"]) {
      if (metadata.bounds[key] !== definition?.[key])
        throw new TypeError("Grid bounds/world definition mismatch");
    }
    const bounds = { ...metadata.bounds };
    await world.terrain.loadTerrain();
    if (world.terrain.terrainIdentity() !== metadata.terrainIdentity)
      throw new TypeError("Grid terrain identity mismatch");
    const graph = await world.roads.loadRoadGraph();
    if (digestRoadGraph(graph) !== metadata.roadGraphDigest)
      throw new TypeError("Grid road graph digest mismatch");
    if (
      graph.nodes.length !== scenario.cities.length ||
      graph.nodes.some((node, i) => {
        const city = scenario.cities[i];
        return (
          city?.idx !== i ||
          city.x !== node.x ||
          city.y !== node.y ||
          (city.cityId != null && city.cityId !== node.cityId)
        );
      })
    )
      throw new RangeError("World-grid chapter/road nodes disagree");
    // The movement constructor revalidates the saved spans (schema,
    // schema bounds, world/content identity, initial graph) in restore
    // mode; a corrupt or transplanted plane fails closed inside it. The
    // checkpoint identity must repeat the fresh-time `expected` shape
    // exactly (version + roadVersion 2), otherwise the restored plane
    // snapshots a different identity than the hot plane.
    const movement = createScenarioMovementMemory(
      structuredClone(movementMemory),
      {
        identity: {
          version: 1,
          world: { id: definition.id, revision: definition.revision },
          content: structuredClone(content?.chapter(idx)?.reference),
          roadVersion: 2,
        },
        memory: { initialGraph: definition.revision },
      },
      true,
      bounds,
    );
    const gridMetadata = structuredClone(metadata);
    gridOwners.set(
      scenario,
      Object.freeze({ graph, movement, metadata: gridMetadata, idx, content, world }),
    );
    return { scenario, metadata: structuredClone(gridMetadata) };
  }
  // Capture all mutable inputs before yielding. Ownership is checked again by App.
  const expected = currentMetadata(
    idx,
    content,
    world,
    metadata?.roadVersion ?? 2,
  );
  const checkpoint = structuredClone(roadMemory);
  let movementInput = structuredClone(movementMemory);
  const terrainInput = structuredClone(terrainMemory);
  let cacheInput = structuredClone(cityCache);
  await world.terrain.loadTerrain();
  const roadVersion = world.roads.loadedRoadVersion();
  if (metadata !== null && roadVersion !== expected.roadVersion)
    throw new TypeError("Loaded road version mismatch");
  if ((northExperiment || mapExtent) && mode === 'fresh' && roadVersion === 'world-grid-experiment') {
    if (movementInput !== null || terrainInput !== null || cacheInput !== null) throw new TypeError('Fresh grid world requires fresh planes');
    const graph = await world.roads.loadRoadGraph();
    if (graph.nodes.length !== scenario.cities.length || graph.nodes.some((node,i) => {
      const city = scenario.cities[i];
      return city?.idx !== i || city.x !== node.x || city.y !== node.y || (city.cityId != null && city.cityId !== node.cityId);
    })) throw new RangeError('World-grid chapter/road nodes disagree');
    const {minX,minY,width,height} = world.definition, bounds = {minX,minY,width,height};
    assertGridBounds(bounds);
    const movement = createScenarioMovementMemory({version:2,bounds,zeroFilled:true,spans:[]},
      {identity:expected,memory:{initialGraph:world.definition.revision}},false,bounds);
    for (const army of scenario.legions) {
      const node = graph.nodes.find(n=>n.x===army.x && n.y===army.y);
      if (!node) throw new RangeError('Fresh grid legion requires a city position');
      army.roadPosition = {kind:'city',cityIndex:node.cityIndex};
      movement.writeTile(army.x,army.y,movement.readTile(army.x,army.y)+1);
    }
    // MAP-EXT E9: grid saves verify the immutable planes at snapshot and
    // restore. Terrain is a loaded resource (never a bound RAM plane), so
    // the owner pins its identity hex; the live world must reproduce it.
    await world.terrain.loadTerrain();
    const gridMetadata = {
      ...expected,
      roadVersion: GRID_ROAD_VERSION,
      bounds: {minX, minY, width, height},
      roadGraphDigest: digestRoadGraph(graph),
      terrainIdentity: world.terrain.terrainIdentity(),
    };
    // Grid navigation replaces the road plane, not the chapter's strategic tables.
    initializeNativeFactionSlots(scenario);
    initializeNativeDiplomacyMatrix(scenario);
    initializeNativeStrategicEventWheel(scenario);
    initializeNativeMonthlyPolicy(scenario);
    if (!hasNativeLegionSlots(scenario)) initializeNativeLegionSlotsFromZeroChapter(scenario);
    initializeScenarioWeatherInputs(scenario);
    initializeScenarioCityNativeInputs(scenario);
    scenario._factionTickCursor ??= 0;
    scenario.nativeFateDisplayFlags ??= 0;
    gridOwners.set(scenario, Object.freeze({graph, movement, metadata: gridMetadata, idx, content, world}));
    return {scenario, metadata: structuredClone(gridMetadata)};
  }
  expected.roadVersion = roadVersion;
  assertMetadata(expected);
  // P76 gate (entire v2 replacement): v1 owners are unconstructible.
  // Fresh preparation against a non-v2/v3 graph fails closed here; restore
  // of explicit v1 metadata is already retired at the prepare gate above.
  if (roadVersion !== 2 && roadVersion !== 3)
    throw new TypeError("Scenario road graph must be v2 or v3");
  // CITY-CAPACITY-1 admission (user-authorized 2026-11-17): the live city
  // table must equal the live road-graph node table 1:1 (slot identity +
  // center match per slot). v2 keeps the DOS 256-node domain; v3 caps at
  // the 512-node visited-scratch ceiling. STRATEGIC_LAYOUT.citySlots stays
  // the original-layout constant, not the admission bound.
  const cityTotal = scenario.cities.length;
  const graphNodes =
    typeof world.roads?.roadNodeCount === "function"
      ? world.roads.roadNodeCount()
      : STRATEGIC_LAYOUT.citySlots;
  if (
    !Number.isInteger(cityTotal) ||
    cityTotal < 1 ||
    cityTotal > maxNodesForVersion(roadVersion) ||
    cityTotal !== graphNodes
  )
    throw new TypeError("Invalid scenario city table");
  for (let slot = 0; slot < cityTotal; slot++) {
    const city = scenario.cities[slot],
      node = world.roads.roadNodeById(slot);
    if (
      city?.idx !== slot ||
      node?.id !== slot ||
      city.x !== node.x ||
      city.y !== node.y
    )
      throw new TypeError(`Scenario city/node mismatch at ${slot}`);
  }
  if (roadVersion === 2 || roadVersion === 3) {
    if (mode === "restore") {
      if (!metadata || !checkpoint)
        throw new TypeError("v2 restore requires metadata and road memory");
      if (!hasNativeFactionSlots(scenario))
        throw new TypeError("v2 restore requires native faction slots");
      if (!hasNativeDiplomacyMatrix(scenario))
        throw new TypeError("v2 restore requires native diplomacy matrix");
      if (!hasNativeStrategicEventWheel(scenario))
        throw new TypeError("v2 restore requires native strategic event wheel");
      if (!hasNativeMonthlyPolicy(scenario))
        throw new TypeError("v2 restore requires native monthly policy");
      assertNativeMonthlyPolicy(scenario);
      rebindNativeFactionViews(scenario);
      rebindNativeDiplomacyViews(scenario);
      restoreScenarioRoadMemory(scenario, world, expected.content, checkpoint);
    } else {
      initializeNativeFactionSlots(scenario);
      initializeNativeDiplomacyMatrix(scenario);
      initializeNativeStrategicEventWheel(scenario);
      initializeNativeMonthlyPolicy(scenario);
      initializeScenarioRoadMemory(scenario, world, expected.content);
      // 128-slot zero table: all 20 fixed chapters carry zero at +22C0h
      // (P24); fresh v2 owns it before the first 25A3 batch pump, unless
      // the caller explicitly provided a table (detached fixtures do).
      if (!hasNativeLegionSlots(scenario))
        initializeNativeLegionSlotsFromZeroChapter(scenario);
      // 2459 weather slots: disaster region +0x20C0 all zero, cloud
      // status +0x21C0 all 0x80 in 20 chapters (P58 flip, read-only file
      // evidence); fresh v2 owns them before the first daily tick.
      initializeScenarioWeatherInputs(scenario);
      // 3F06/3F11/3FAB/3FD4/4028/88CC fresh inputs = official city record
      // bytes (P58 flip). DOS 8CAE loads the 192x32 records as the live
      // structs, so the initial cooldown (+0x17, all zero in 20 chapters),
      // old owner (+0x1A, per-city raw byte), border count (+0x1B),
      // neighbour slots (+0x1C..+0x1F) and attr byte (+0x00, low nibble =
      // baked border bits) are the record bytes, never backfilled.
      initializeScenarioCityNativeInputs(scenario);
      // D1C faction-tick cursor: word-zero in all 19 fixed chapters
      // (block+0x1C under the block-base layout; +0x18/+0x20 are the tax
      // bytes 0x12, not cursors). 3E11 rotates D1C 0..21 from 0
      // (re-notes-ai-diplomacy §monthly/3E11 entries); the strict 3E14
      // adapter reads D1C unconditionally, so fresh v2 must own 0.
      // D18/D1E/D20 file images stay unmapped (unknown): city/legion/event
      // cursors remain undefined until their pumps write (formation and
      // legion-fate failure tests lock this). Explicit inputs still win.
      if (scenario._factionTickCursor === undefined)
        scenario._factionTickCursor = 0;
      // 4D33 display gate reads CS:98A6 bit 2 (code-segment flag, not D52
      // state): zeroed at init (1AA7 `mov byte cs:[0x98a6],0`) and only
      // set/cleared transiently inside display-domain code (5A3D or /
      // 5AA2-and). Fresh rule processing therefore observes 0; explicit
      // inputs still win and absence stays fail-closed at the 4D33 read.
      // Open unknown (display-subsystem call graph): whether any rule-path
      // capture can observe the bit set; the 4D41 branch stays fail-closed.
      if (scenario.nativeFateDisplayFlags === undefined)
        scenario.nativeFateDisplayFlags = 0;
      // 1A2D 清零平面 + 89F0/8AEA 重建（P40）；显式传入的记忆优先。
      if (movementInput === null)
        movementInput = synthesizeScenarioMovementMemory(scenario);
      // C18 初值 = 8CAE 载入的城记录 byte+0x18（P37 nativeCityRecordRaw）。
      if (cacheInput === null)
        cacheInput = synthesizeScenarioCityCache(scenario);
    }
  }
  const movement =
    movementInput === null
      ? null
      : createScenarioMovementMemory(
          movementInput,
          snapshotScenarioRoadMemory(scenario),
          mode === "restore",
        );
  const cache =
    cacheInput === null
      ? null
      : createScenarioCityCache(
          cacheInput,
          snapshotScenarioRoadMemory(scenario),
          mode === "restore",
          scenario.cities.length,
        );
  // P89 root cause (live-verified crash: fresh new games bound no terrain,
  // first legion road step threw "Uncovered native terrain memory" into the
  // frame loop). The original always owns a D44 terrain plane at load (E48A
  // decode + 89F0 8A1E paints), so terrain reads never fault there. Fresh v2
  // — and restores whose saves predate terrainMemory — bind the certified
  // map tile plane as explicit known spans: the shipped layout bytes
  // reproduce two independent original-MMAP cross-scans (march §2.2: 192
  // city cells 0xCB..0xD3 exact; march §740: 508 endpoints 0xCE..0xDD with
  // 0/5018 mid hits, re-verified on current assets this round), so this is
  // the certified tile truth, not §12-prohibited PNG/raw backfill of holes:
  // the plane is fully bound, no holes.
  // Restore-validation runs only for explicit inputs; synthesized planes
  // take the fresh-construction path in either mode.
  const terrainExplicit = terrainInput !== null;
  const terrainEffect =
    terrainExplicit
      ? terrainInput
      : {
          version: 1,
          spans: [{ address: 0, hex: world.terrain.terrainIdentity() }],
        };
  const terrain = createScenarioTerrainMemory(
    terrainEffect,
    expected,
    world.terrain.terrainIdentity(),
    mode === "restore" && terrainExplicit,
    // MAP-EXT E6: origin callers pass definitions without min fields (?? 0 keeps v1).
    { minX: world.definition.minX ?? 0, minY: world.definition.minY ?? 0, width: world.definition.width, height: world.definition.height },
  );
  assemblies.set(scenario, {
    terrain,
    movement,
    cityCache: cache,
    metadata: structuredClone(expected),
    idx,
    content,
    world,
  });
  // 89F0 opening pass (G-完结): the original 1BE6 startup chain repaints
  // all 192 cities through the SAME 8A1E body production captures use
  // (centers + corners per owner; 89FB..8A07 loop re-read this round).
  // Web fresh initial plane only: restores retain their saved plane,
  // and explicit test planes are used as planted. DOS load DOES join the
  // common 0067 -> 1BE0 -> 1BE6 -> 89F0 path after 1ADE -> 1B2C;
  // it is not evidence for this Web snapshot policy. See the initialization
  // evidence note's shared new/load paint-entry section. The
  // tactical-return pass is idempotent (same owners, no other writers)
  // and stays out of scope. City coords are gate-validated above, so the
  // y<2 segment-alias stop cannot fire on admitted scenarios.
  if (mode === "fresh" && !terrainExplicit) {
    for (const city of scenario.cities) paint8A1E(scenario, city);
  }
  return {
    scenario,
    metadata: structuredClone(expected),
    readCityOwner: (index, instruction) => readCityOwnerByIndex(scenario, index, instruction),
    readStrategicNeighbour: readOriginalStrategicNeighbour,
    readCityOwnerByte: (address) =>
      readOriginalRoadCityOwnerByte(scenario, address),
  };
}

/** Read-only assembly lookup for detached native callers, never a RAM initializer.
 * P76 gate: only v2/v3 owners exist. Known staged versions without formal
 * ownership are an engineering error, never permission to run unbound.
 */
export function scenarioNativeRoadContext(scenario) {
  assertNoEmbeddedRoadMetadata(scenario);
  const owner = assemblies.get(scenario);
  if (!owner) {
    if (hasScenarioRoadMemory(scenario))
      throw new TypeError("Road memory lacks assembly identity");
    return null;
  }
  assertAssemblyIdentity(owner.metadata, owner.idx, owner.content, owner.world);
  if (owner.world.roads.loadedRoadVersion() !== owner.metadata.roadVersion)
    throw new TypeError("Native caller road version mismatch");
  // P76 gate: v1 owners are unconstructible (prepare requires a v2/v3 graph;
  // explicit v1 metadata is retired at every gate). Fail closed.
  if (owner.metadata.roadVersion !== 2 && owner.metadata.roadVersion !== 3)
    throw new TypeError("Scenario road owner must be v2 or v3");
  return Object.freeze({
    roads: owner.world.roads,
    memory: getScenarioRoadMemory(scenario),
    movement: owner.movement,
    cityCache: owner.cityCache,
    terrain: owner.terrain,
    readStrategicNeighbour: readOriginalStrategicNeighbour,
    readCityOwner: (index, instruction) => readCityOwnerByIndex(scenario, index, instruction),
    readTerrainByte: (x, y) => {
      if (!owner.terrain)
        throw new RangeError("Uncovered native terrain memory");
      return owner.terrain.readTile(x, y);
    },
    readCityOwnerByte: (address) =>
      readOriginalRoadCityOwnerByte(scenario, address),
  });
}

/** Snapshot bound current identity and RAM without exposing either private owner. */
export function snapshotScenarioAssembly(app) {
  const sc = app.scenario;
  // MAP-EXT E9: grid saves admitted. The snapshot pins the staged metadata
  // plus a fresh occupancy-plane snapshot; the live graph and terrain are
  // re-digested here so a mutated or swapped world fails closed at save
  // time instead of producing a load-bearing lie.
  if (gridOwners.has(sc)) {
    assertNoEmbeddedRoadMetadata(sc);
    const owner = gridOwners.get(sc);
    if (
      app.scenarioIdx !== owner.idx ||
      (app.world && app.world !== owner.world) ||
      (app.content && app.content !== owner.content)
    )
      throw new TypeError("Snapshot assembly identity/index mismatch");
    assertAssemblyIdentity(owner.metadata, owner.idx, owner.content, owner.world);
    assertGridBounds(owner.metadata.bounds);
    if (digestRoadGraph(owner.graph) !== owner.metadata.roadGraphDigest)
      throw new TypeError("Snapshot grid road graph changed under owner");
    if (owner.world.terrain.terrainIdentity() !== owner.metadata.terrainIdentity)
      throw new TypeError("Snapshot grid terrain changed under owner");
    return {
      scenarioAssembly: structuredClone(owner.metadata),
      movementMemory: owner.movement.snapshot(),
    };
  }
  assertNoEmbeddedRoadMetadata(sc);
  const owner = assemblies.get(sc);
  if (!owner) {
    // Deliberate legacy pure-state API, never a downgrade of known v2 context.
    if (
      hasScenarioRoadMemory(sc) ||
      app.world?.roads?.loadedRoadVersion?.() === 2
    )
      throw new TypeError("Road memory lacks assembly identity");
    return {};
  }
  if (
    app.scenarioIdx !== owner.idx ||
    (app.world && app.world !== owner.world) ||
    (app.content && app.content !== owner.content)
  )
    throw new TypeError("Snapshot assembly identity/index mismatch");
  assertAssemblyIdentity(owner.metadata, owner.idx, owner.content, owner.world);
  if (owner.world.roads.loadedRoadVersion() !== owner.metadata.roadVersion)
    throw new TypeError("Snapshot road version mismatch");
  const result = { scenarioAssembly: structuredClone(owner.metadata) };
  if (owner.metadata.roadVersion === 2 || owner.metadata.roadVersion === 3) {
    result.roadMemory = snapshotScenarioRoadMemory(sc);
    if (owner.movement) result.movementMemory = owner.movement.snapshot();
    if (owner.cityCache) result.cityCache = owner.cityCache.snapshot();
    if (owner.terrain) result.terrainMemory = owner.terrain.snapshot();
    // Validate the detached checkpoint through the same existing adapter/codec.
    restoreScenarioRoadMemory(
      new Scenario({}),
      owner.world,
      owner.metadata.content,
      result.roadMemory,
    );
  } else if (hasScenarioRoadMemory(sc))
    throw new TypeError("v1 cannot carry original road memory");
  return result;
}
