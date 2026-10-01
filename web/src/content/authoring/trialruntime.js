// Local compiled snapshot -> production catalog/world/prepare entry.
// No persistence, no latest-draft lookups, no fallback to built-in roads.
import { createContentCatalog } from "../catalog.js";
import { DEFAULT_WORLD } from "../worlddefinition.js";
import { createWorldResources } from "../../game/worldresources.js";
import { createNewGameScenario } from "../../game/world.js";
import { prepareScenario } from "../../game/scenarioassembly.js";
import { bindNativePlayerFactionPointer } from "../../game/nativefactions.js";
import { TRIAL_COMPILER_REVISION } from "./trialcompile.js";

export async function prepareTrialScenario(pack) {
  const manifest = pack?.manifest;
  const identity = manifest?.identity;
  if (manifest?.compilerRevision !== TRIAL_COMPILER_REVISION || !pack.chapter ||
      !identity?.gameId || !identity.sourceDigest || !identity.trialSnapshotId ||
      !manifest.chapters.includes(pack.chapterId))
    throw new TypeError("incomplete compiled trial snapshot");
  const assets = {};
  for (const key of ["terrain", "roadGraph", "roadCost", "roadOffset"]) {
    const asset = manifest.assets.find((a) => a.assetId === key);
    if (!asset || typeof asset.url !== "string") throw new TypeError(`missing trial asset: ${key}`);
    assets[key] = asset.url;
  }
  const content = createContentCatalog({ schemaVersion: 1, rules: "ki-1995",
    id: identity.gameId, revision: identity.sourceDigest,
    chapters: [{ id: pack.chapterId, legacyScenarioIndex: 0, official: false }] },
    { scenarios: [pack.chapter] });
  const world = createWorldResources({ ...DEFAULT_WORLD, ...manifest.world,
    assets: { ...DEFAULT_WORLD.assets, ...assets } });
  const raw = createNewGameScenario(pack.chapter);
  const player = raw.factions?.[0]?.idx;
  if (!Number.isInteger(player)) throw new TypeError("trial chapter has no player faction");
  raw.player_faction = player;
  // No explicit plane: production fresh preparation takes the compiled
  // asset and performs its existing 89F0 opening pass (not a second map).
  const prepared = await prepareScenario({ raw, idx: 0, mode: "fresh", content, world });
  bindNativePlayerFactionPointer(prepared.scenario, "trial");
  return { ...prepared, content, world, player };
}
