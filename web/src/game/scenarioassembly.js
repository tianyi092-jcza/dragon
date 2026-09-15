// Web identity/admission only, not a KI mechanism or a v2 gameplay switch.
// The actual App uses this detached preparation before any live installation.
// Formal JSON contract and unsupported native scope: march notes §3.10.
import { STRATEGIC_LAYOUT } from "../content/worlddefinition.js";
import { Scenario } from "./world.js";
import { assertLegionPhaseState } from "./legionphase.js";
import {
  hasNativeLegionSlots,
  assertNativeLegionSlots,
  rebindNativeLegionViews,
} from "./nativelegions.js";
import {
  hasScenarioRoadMemory,
  getScenarioRoadMemory,
  initializeScenarioRoadMemory,
  restoreScenarioRoadMemory,
  snapshotScenarioRoadMemory,
} from "./navigation/scenarioroadmemory.js";
import { readOriginalRoadCityOwnerByte } from "./navigation/originalroadstate.js";
import { createScenarioMovementMemory } from "./navigation/scenariomovementmemory.js";
import { createScenarioCityCache } from "./navigation/scenariocitycache.js";

// Assembly identity is not a second RAM owner. RAM remains in its existing adapter.
const assemblies = new WeakMap();
const has = (object, key) => object != null && Object.hasOwn(object, key);

export function assertNoEmbeddedRoadMetadata(state) {
  for (const key of [
    "scenarioAssembly",
    "roadMemory",
    "movementMemory",
    "cityCache",
    "roadVersion",
  ]) {
    if (has(state, key))
      throw new TypeError(`Misplaced scenario metadata: ${key}`);
  }
}

function assertMetadata(metadata) {
  if (metadata?.version !== 1 || ![1, 2].includes(metadata.roadVersion))
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
      has(meta, "cityCache")
    )
      throw new TypeError("Road memory requires assembly metadata");
    return { metadata: null, roadMemory: null };
  }
  assertMetadata(meta.scenarioAssembly);
  const metadata = structuredClone(meta.scenarioAssembly);
  if (
    metadata.roadVersion === 1 &&
    (has(meta, "roadMemory") ||
      has(meta, "movementMemory") ||
      has(meta, "cityCache"))
  )
    throw new TypeError("v1 cannot carry original road memory");
  if (metadata.roadVersion === 2 && !meta.roadMemory)
    throw new TypeError("v2 restore requires road memory");
  if (has(meta, "movementMemory") && !meta.movementMemory)
    throw new TypeError("Invalid saved movement memory");
  if (has(meta, "cityCache") && !meta.cityCache)
    throw new TypeError("Invalid saved city cache");
  return {
    metadata,
    roadMemory: structuredClone(meta.roadMemory ?? null),
    movementMemory: structuredClone(meta.movementMemory ?? null),
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

export function assertPlayableScenario({ metadata }) {
  if (metadata?.roadVersion === 2)
    throw new Error("v2 road rule callers are not connected");
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
export async function prepareScenario({
  raw,
  idx,
  content,
  world,
  mode,
  metadata = null,
  roadMemory = null,
  movementMemory = null,
  cityCache = null,
}) {
  if (mode !== "fresh" && mode !== "restore")
    throw new TypeError("Explicit scenario preparation mode required");
  assertNoEmbeddedRoadMetadata(raw);
  const scenario = new Scenario(structuredClone(raw));
  assertNativeLegionSlots(scenario);
  if (hasNativeLegionSlots(scenario)) rebindNativeLegionViews(scenario);
  assertLegionPhaseState(scenario);
  if (!Array.isArray(raw.cities))
    throw new TypeError("Missing scenario cities");
  if (metadata !== null) assertAssemblyIdentity(metadata, idx, content, world);
  if (mode === "fresh" && (metadata !== null || roadMemory !== null))
    throw new TypeError("Fresh scenario cannot restore metadata/memory");
  // Capture all mutable inputs before yielding. Ownership is checked again by App.
  const expected = currentMetadata(
    idx,
    content,
    world,
    metadata?.roadVersion ?? 1,
  );
  const checkpoint = structuredClone(roadMemory);
  const movementInput = structuredClone(movementMemory);
  const cacheInput = structuredClone(cityCache);
  await world.terrain.loadTerrain();
  const roadVersion = world.roads.loadedRoadVersion();
  if (metadata !== null && roadVersion !== expected.roadVersion)
    throw new TypeError("Loaded road version mismatch");
  expected.roadVersion = roadVersion;
  assertMetadata(expected);
  if (scenario.cities.length !== STRATEGIC_LAYOUT.citySlots)
    throw new TypeError("Invalid fixed scenario city table");
  for (let slot = 0; slot < STRATEGIC_LAYOUT.citySlots; slot++) {
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
  if (roadVersion === 2) {
    if (mode === "restore") {
      if (!metadata || !checkpoint)
        throw new TypeError("v2 restore requires metadata and road memory");
      restoreScenarioRoadMemory(scenario, world, expected.content, checkpoint);
    } else initializeScenarioRoadMemory(scenario, world, expected.content);
  } else if (checkpoint !== null)
    throw new TypeError("v1 cannot carry original road memory");
  if (roadVersion === 1 && hasNativeLegionSlots(scenario))
    throw new TypeError("v1 cannot carry native legion slots");
  if (roadVersion === 1 && movementInput !== null)
    throw new TypeError("v1 cannot carry movement memory");
  const movement =
    movementInput === null
      ? null
      : createScenarioMovementMemory(
          movementInput,
          snapshotScenarioRoadMemory(scenario),
          mode === "restore",
        );
  if (roadVersion === 1 && cacheInput !== null)
    throw new TypeError("v1 cannot carry city cache");
  const cache =
    cacheInput === null
      ? null
      : createScenarioCityCache(
          cacheInput,
          snapshotScenarioRoadMemory(scenario),
          mode === "restore",
        );
  assemblies.set(scenario, {
    movement,
    cityCache: cache,
    metadata: structuredClone(expected),
    idx,
    content,
    world,
  });
  return {
    scenario,
    metadata: structuredClone(expected),
    readCityOwnerByte: (address) =>
      readOriginalRoadCityOwnerByte(scenario, address),
  };
}

/** Read-only assembly lookup for detached native callers, never a RAM initializer.
 * A legacy v1 has no native context. Known v2 without formal ownership is an
 * engineering error, not permission to use the default v1 graph.
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
  if (owner.metadata.roadVersion === 1) {
    if (hasScenarioRoadMemory(scenario))
      throw new TypeError("v1 cannot carry original road memory");
    return null;
  }
  return Object.freeze({
    roads: owner.world.roads,
    memory: getScenarioRoadMemory(scenario),
    movement: owner.movement,
    cityCache: owner.cityCache,
    readTerrainByte: owner.world.terrain.terrainTile,
    readCityOwnerByte: (address) =>
      readOriginalRoadCityOwnerByte(scenario, address),
  });
}

/** Snapshot bound current identity and RAM without exposing either private owner. */
export function snapshotScenarioAssembly(app) {
  const sc = app.scenario;
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
  if (owner.metadata.roadVersion === 2) {
    result.roadMemory = snapshotScenarioRoadMemory(sc);
    if (owner.movement) result.movementMemory = owner.movement.snapshot();
    if (owner.cityCache) result.cityCache = owner.cityCache.snapshot();
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
