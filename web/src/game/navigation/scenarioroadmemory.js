// Per-Scenario RAM adapter used by detached assembly and formal sidecars.
// Production v2 remains unsupported; original RAM semantics stay in the codec.
// See march notes §§3.9–3.10. Ordinary reads never initialize or rebuild RAM.
import { Scenario } from "../world.js";
import {
  createCheckedOriginalRoadMemory,
  restoreOriginalRoadMemory,
} from "./originalroadmemory.js";

const owners = new WeakMap();

function identityFor(resources, content) {
  const world = resources?.definition;
  for (const value of [
    world?.id,
    world?.revision,
    content?.packId,
    content?.chapterId,
    content?.revision,
  ]) {
    if (typeof value !== "string" || value.length === 0) {
      throw new TypeError("Missing original road world/content identity");
    }
  }
  return {
    world: { id: world.id, revision: world.revision },
    content: {
      packId: content.packId,
      chapterId: content.chapterId,
      revision: content.revision,
    },
  };
}

function unattached(scenario) {
  if (!(scenario instanceof Scenario))
    throw new TypeError("Expected a Scenario road owner");
  if (owners.has(scenario))
    throw new Error("Scenario road memory already initialized");
}

function ownerFor(scenario) {
  const owner = owners.get(scenario);
  if (!owner) throw new Error("Scenario road memory is not initialized");
  return owner;
}

/** Explicit fresh-session entry. Repeated initialization must not discard old RAM. */
export function initializeScenarioRoadMemory(scenario, resources, content) {
  unattached(scenario);
  const identity = identityFor(resources, content);
  const memory = createCheckedOriginalRoadMemory(
    resources.roads.originalRoadGraph(),
  );
  owners.set(scenario, { identity, memory });
  return memory;
}

/** Restore only onto a new owner, after complete identity and checkpoint validation.
 * Missing RAM cannot be replaced with initialization, even for identical graph bytes.
 */
export function restoreScenarioRoadMemory(
  scenario,
  resources,
  content,
  checkpoint,
) {
  unattached(scenario);
  const identity = identityFor(resources, content);
  const saved = checkpoint?.identity;
  if (
    checkpoint?.version !== 1 ||
    saved?.world?.id !== identity.world.id ||
    saved?.world?.revision !== identity.world.revision ||
    saved?.content?.packId !== identity.content.packId ||
    saved?.content?.chapterId !== identity.content.chapterId ||
    saved?.content?.revision !== identity.content.revision
  ) {
    throw new TypeError("Mismatched original road world/content identity");
  }
  const memory = restoreOriginalRoadMemory(
    resources.roads.originalRoadGraph(),
    checkpoint.memory,
  );
  owners.set(scenario, { identity, memory });
  return memory;
}

export function hasScenarioRoadMemory(scenario) {
  return owners.has(scenario);
}

export function getScenarioRoadMemory(scenario) {
  return ownerFor(scenario).memory;
}

/** Detached JSON adapter output; never enumerable Scenario state. */
export function snapshotScenarioRoadMemory(scenario) {
  const { identity, memory } = ownerFor(scenario);
  return {
    version: 1,
    identity: structuredClone(identity),
    memory: memory.snapshot(),
  };
}
