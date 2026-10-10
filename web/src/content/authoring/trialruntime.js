// Local compiled snapshot -> production catalog/world/prepare entry.
// Server Trial packs (9-field binding) and dev-server packs (6-arg trial-asset URLs) both accepted.
// No persistence, no latest-draft lookups, no fallback to built-in roads.
import { createContentCatalog } from "../catalog.js";
import { DEFAULT_WORLD } from "../worlddefinition.js";
import { createWorldResources } from "../../game/worldresources.js";
import { createNewGameScenario } from "../../game/world.js";
import { prepareScenario } from "../../game/scenarioassembly.js";
import { bindNativePlayerFactionPointer } from "../../game/nativefactions.js";
import { TRIAL_COMPILER_REVISION } from "./trialcompile.js";
import { setPortraitOverrides, buildPortraitOverrides } from "../../core/assets.js";

function assertTrialBinding(pack, identity, binding) {
  if (binding === undefined) { return; }
  if (!binding || typeof binding !== "object" || Array.isArray(binding) ||
      Object.keys(binding).sort().join(",") !== "authEpoch,chapterId,draftRevision,gameId,manifestDigest,ownerId,snapshotDigest,snapshotId,trialId") {
    throw new TypeError("invalid trial server binding");
  }
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(binding.trialId ?? "") ||
      typeof binding.ownerId !== "string" || binding.ownerId.length === 0 || binding.ownerId.length > 128 ||
      binding.gameId !== identity.gameId || binding.draftRevision !== identity.draftRevision || binding.chapterId !== pack.chapterId ||
      typeof binding.snapshotId !== "string" || binding.snapshotId.length === 0 || binding.snapshotId.length > 256 ||
      binding.snapshotDigest !== identity.savedSourceDigest || binding.manifestDigest !== identity.sourceDigest ||
      !Number.isSafeInteger(binding.authEpoch) || binding.authEpoch < 0) {
    throw new TypeError("invalid trial server binding");
  }
}
function buildFullAppVisuals(manifest, binding, scopedAsset) {
  const visuals = manifest.visualAssets;
  if (!visuals?.seasonAtlases || !visuals?.seasons) { throw new TypeError("missing snapshot season assets"); }
  const seasonURLs = (key) => Object.fromEntries(["spring", "summer", "autumn", "winter"].map((s) => {
    const url = visuals[key][s]?.url;
    if (typeof url !== "string" || !/^content\/builtin\/compiled\/map-2-[a-f0-9]{64}\//.test(url)) { throw new TypeError("invalid trial visual asset"); }
    return [s, url];
  }));
  const miniURLs = Object.fromEntries(["base", "large"].map((s) => {
    const id = s === "base" ? "minimapBase" : "minimapLarge";
    const url = manifest.minimapAssets?.find((a) => a.assetId === id)?.url;
    if (typeof url !== "string" || (binding === undefined && !url.startsWith("/api/trial-asset?"))) { throw new TypeError("missing snapshot minimap"); }
    scopedAsset(url, id);
    return [s, url];
  }));
  return { seasonAtlases: seasonURLs("seasonAtlases"), seasons: seasonURLs("seasons"), minimap: miniURLs };
}
export function createTrialEnvironment(pack, { fullApp = false, playerFaction = null, persistent = false } = {}) {
  const manifest = pack?.manifest;
  const identity = manifest?.identity;
  if (manifest?.compilerRevision !== TRIAL_COMPILER_REVISION || !pack.chapter ||
      !identity?.gameId || !identity.sourceDigest || !identity.trialSnapshotId ||
      !manifest.chapters.includes(pack.chapterId)) {
    throw new TypeError("incomplete compiled trial snapshot");
  }
  const scope = manifest.scope;
  if ((manifest.buildFormat === "studio-chapter-1") !== (scope !== undefined)) { throw new TypeError("missing/mixed trial scope format"); }
  if (scope !== undefined && (scope?.kind !== "chapter" || manifest.buildFormat !== "studio-chapter-1" ||
      scope.chapterId !== pack.chapterId || manifest.chapters.length !== 1 || scope.selectedSourceDigest !== identity.sourceDigest ||
      !/^[a-f0-9]{64}$/.test(scope.savedSourceDigest ?? "") || identity.savedSourceDigest !== scope.savedSourceDigest)) {
    throw new TypeError("invalid compiled trial chapter scope");
  }
  const binding = pack.binding;
  assertTrialBinding(pack, identity, binding);
  function scopedAsset(url, assetId) {
    if (scope === undefined) { return; }
    if (binding !== undefined) {
      if (url !== `/api/trials/${binding.trialId}/assets/${assetId}`) { throw new TypeError("mixed scoped trial asset identity"); }
      return;
    }
    if (!url.startsWith("/api/trial-asset?")) { throw new TypeError("invalid scoped trial asset URL"); }
    const args = new URLSearchParams(url.slice(url.indexOf("?") + 1));
    const expected = { game: identity.gameId, revision: identity.draftRevision, digest: identity.sourceDigest, asset: assetId, scope: "chapter", chapter: pack.chapterId };
    if ([...args].length !== 6 || Object.entries(expected).some(([key, value]) => args.getAll(key).length !== 1 || args.get(key) !== value)) {
      throw new TypeError("mixed scoped trial asset identity");
    }
  }
  const assets = {};
  for (const key of ["terrain", "roadGraph", "roadCost", "roadOffset"]) {
    const asset = manifest.assets.find((a) => a.assetId === key);
    if (!asset || typeof asset.url !== "string") { throw new TypeError(`missing trial asset: ${key}`); }
    scopedAsset(asset.url, key);
    assets[key] = asset.url;
  }
  const content = createContentCatalog({ schemaVersion: 1, rules: "ki-1995",
    id: identity.gameId, revision: identity.sourceDigest,
    chapters: [{ id: pack.chapterId, legacyScenarioIndex: 0, official: false }] },
    { scenarios: [pack.chapter] });
  let visualAssets = DEFAULT_WORLD.assets;
  if (fullApp) {
    visualAssets = buildFullAppVisuals(manifest, binding, scopedAsset);
  }
  const world = createWorldResources({ ...DEFAULT_WORLD, ...manifest.world,
    assets: { ...visualAssets, ...assets } });
  setPortraitOverrides(buildPortraitOverrides(pack.chapter?.generals, manifest.portraits));
  const raw = createNewGameScenario(pack.chapter);
  const player = playerFaction ?? raw.factions?.[0]?.idx;
  if (!Number.isInteger(player) || !raw.factions?.some((f) => f.idx === player)) { throw new TypeError("trial chapter has no selected player faction"); }
  raw.player_faction = player;
  return { raw, content, world, player, identity: Object.freeze({ ...identity, chapterId: pack.chapterId }),
    ...(persistent === true ? { persistent: true } : {}),
    ...(binding === undefined ? {} : { binding: Object.freeze({ ...binding }) }) };
}

export async function prepareTrialScenario(pack) {
  const { raw, content, world, player } = createTrialEnvironment(pack);
  // No explicit plane: production fresh preparation takes the compiled
  // asset and performs its existing 89F0 opening pass (not a second map).
  const prepared = await prepareScenario({ raw, idx: 0, mode: "fresh", content, world });
  bindNativePlayerFactionPointer(prepared.scenario, "trial");
  return { ...prepared, content, world, player };
}
