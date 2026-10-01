// Read-only stage audit + formal-catalog engine harness (no HTTP/profile/SAVE).
// node tools/verify_unified_map_stage.mjs <stage-a> <independent-stage-b>
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createContentCatalog } from "../web/src/content/catalog.js";
import { createWorldResources } from "../web/src/game/worldresources.js";
import { prepareScenario, snapshotScenarioAssembly, readSavedAssembly } from "../web/src/game/scenarioassembly.js";
import { createNewGameScenario } from "../web/src/game/world.js";
import { copyBuiltinGame } from "../web/src/content/authoring/gamesource.js";
import { compileGameSource } from "../web/src/content/authoring/trialcompile.js";
import { FIXED_CITY_BINDINGS } from "../web/src/content/authoring/fixedcitybindings.js";
const root = fileURLToPath(new URL("../", import.meta.url));
const rounds = process.argv.slice(2);
if (rounds.length !== 2 || rounds.some((r) => !/^[a-zA-Z0-9-]+$/.test(r))) throw new RangeError("two declared stage rounds required");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
function json(bytes) { try { return JSON.parse(bytes.toString("utf8")); } catch (cause) { throw new Error("invalid stage JSON", { cause }); } }
const checks = [];
const sourceHashes = {};
function read(path) { const bytes = readFileSync(join(root, path)); sourceHashes[path] = sha(bytes); return bytes; }
const allowedBaseline = new Set(["web/mmap_map.bin", "web/data.json", "web/road_cost.bin", "web/road_offset.json",
  "web/content/builtin/world/world.json", "web/content/builtin/world/roads.json", "web/content/builtin/catalog.json",
  ".dragon-analysis/map-migration/unified-a/unified_mapsource.json",
  ...["spring", "summer", "autumn", "winter"].flatMap((s) => [`web/map_atlas_${s}.png`, `web/map_tiles_${s}.png`]),
  ...["battle_maps.json", "battle_navigation.json", "battle_display.bin", "battle_rules.json", "battle_scripts.json", "battle_talk.json"].map((s) => `web/${s}`)]);
function load(round) {
  const folder = `.dragon-analysis/map-migration-2/${round}`;
  const report = json(read(`${folder}/stage-report.json`));
  const manifest = json(read(`${folder}/package/manifest.json`));
  assert.equal(report.result, "PASS-STAGE-ONLY");
  assert.notEqual(manifest.contentRevision, "1");
  assert.equal(manifest.worldRevision, manifest.contentRevision);
  assert.equal(manifest.sourceDigest, report.sourceDigest);
  assert.equal(manifest.compatibilityAssetMode, "source-explicit");
  assert.match(manifest.geographyReview, /^PENDING/);
  for (const [path, expected] of Object.entries(report.sourceHashes)) {
    assert.ok(allowedBaseline.has(path), `undeclared baseline input ${path}`);
    const bytes = read(path);
    assert.equal(sha(bytes), expected.sha256);
    assert.equal(bytes.length, expected.byteLength);
  }
  const assets = new Map();
  for (const asset of manifest.assets) {
    assert.match(asset.path, /^(?:[A-Za-z0-9_-]+\.(?:json|png|bin)|chapters\/[A-Za-z0-9_-]+\.json)$/);
    assert.equal(asset.url, `content/builtin/compiled/${manifest.contentRevision}/${asset.path}`);
    assert.ok(!assets.has(asset.path), "duplicate stage artifact");
    const bytes = read(`${folder}/package/${asset.path}`);
    assert.equal(bytes.length, asset.byteLength);
    assert.equal(sha(bytes), asset.sha256);
    assert.ok(typeof asset.role === "string" && asset.role);
    assets.set(asset.path, { ...asset, bytes });
  }
  for (const role of ["native-initial-terrain-and-visual-layout", "native-road-v2", "preserved-legacy-grid-NOT-native-weights",
    "preserved-visual-offsets", "fixed-world-definition-new-revision", "fixed-chapter-catalog-new-revision", "editable-four-layer-GameSource@1"])
    assert.ok([...assets.values()].some((a) => a.role === role), `missing stage role ${role}`);
  for (const related of manifest.related) {
    assert.ok(allowedBaseline.has(`web/${related.url}`));
    assert.equal(sha(read(`web/${related.url}`)), related.sha256);
  }
  const definition = json(assets.get("world-definition.json").bytes);
  const urls = [definition.assets.terrain, definition.assets.roadGraph, definition.assets.roadCost, definition.assets.roadOffset,
    ...Object.values(definition.assets.seasonAtlases), ...Object.values(definition.assets.seasons), ...Object.values(definition.assets.minimap)];
  for (const url of urls) assert.ok([...assets.values()].some((a) => a.url === url), `world dependency absent ${url}`);
  assert.equal(definition.id, "mmap-original");
  assert.equal(definition.revision, manifest.worldRevision);
  const catalog = json(assets.get("catalog.json").bytes);
  assert.equal(catalog.id, "wolong-builtin");
  assert.equal(catalog.revision, manifest.contentRevision);
  assert.equal(catalog.chapters.length, 20);
  assert.deepEqual(assets.get("terrain.bin").bytes, read("web/mmap_map.bin"));
  assert.deepEqual(assets.get("road_cost.bin").bytes, read("web/road_cost.bin"));
  assert.deepEqual(assets.get("road_offset.json").bytes, read("web/road_offset.json"));
  assert.deepEqual(assets.get("data.json").bytes, read("web/data.json"));
  assert.deepEqual(json(assets.get("roads.json").bytes), json(read("web/content/builtin/world/roads.json")));
  for (const [name, w, h] of [["minimap_base.png", 208, 139], ["minimap_large.png", 250, 167]]) {
    const bytes = assets.get(name).bytes;
    assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.equal(bytes.readUInt32BE(16), w); assert.equal(bytes.readUInt32BE(20), h);
  }
  checks.push(`${round}: full declared resource hashes, baseline parity, original IDs, new revisions and pending display flag`);
  return { report, manifest, assets, definition, catalog };
}
const first = load(rounds[0]);
const second = load(rounds[1]);
assert.equal(first.report.revision, second.report.revision);
assert.deepEqual(first.manifest, second.manifest);
for (const [path, entry] of first.assets) assert.deepEqual(entry.bytes, second.assets.get(path).bytes);
checks.push("independent clean-directory reproduction identical (source, native inputs, auxiliary bytes, PNG, identity and manifests)");
const authored = json(first.assets.get("game-source.json").bytes);
const baselineWorld = json(read("web/content/builtin/world/world.json"));
assert.deepEqual(FIXED_CITY_BINDINGS, baselineWorld.cities.toSorted((a, b) => a.index - b.index).map((c) => [c.x, c.y]));
const copyInput = { revision: first.report.revision, world: baselineWorld,
  map: authored.map, componentDefinitions: authored.componentDefinitions, compatibilityAssets: authored.compatibilityAssets,
  chapters: authored.chapterOrder.map((id) => ({ id, state: authored.chapters[id].state })) };
const copy = copyBuiltinGame({ gameId: "stage-isolated-copy", kind: "full", source: copyInput }, sha);
const copyCompiled = compileGameSource(copy, sha);
assert.equal(copyCompiled.compatibilityAssetMode, "source-explicit");
assert.deepEqual(copyCompiled.roadCost, new Uint8Array(first.assets.get("road_cost.bin").bytes));
const atom = copyInput.map.decorations.find((d) => d.x === 10 && d.y === 10);
assert.equal(atom.definitionRef, "tile-20"); atom.definitionRef = "tile-16";
const editedCopy = copyBuiltinGame({ gameId: "stage-isolated-copy", kind: "full", source: copyInput }, sha);
assert.notEqual(copy.sourceRef.digest, editedCopy.sourceRef.digest, "source pin covers map/components/compatibility, not only chapter/world metadata");
const edited = compileGameSource(editedCopy, sha);
const nodeAtom = editedCopy.map.decorations.find((d) => d.x === 10 && d.y === 10);
nodeAtom.definitionRef = "tile-203"; // CB would introduce an unbound 193rd scan node.
assert.throws(() => compileGameSource(editedCopy, sha), /unsupported city node scan/);
nodeAtom.definitionRef = "tile-16";
const firstPlacement = editedCopy.map.placements.find((p) => p.cityId === Object.values(editedCopy.cities).find((c) => c.runtimeSlot === 0).cityId);
const firstComponent = firstPlacement.componentRef;
firstPlacement.componentRef = "tile-16"; // Removing the visible node cannot retain its old graph slot.
assert.throws(() => compileGameSource(editedCopy, sha), /unsupported city node scan/);
firstPlacement.componentRef = firstComponent;
const badCity = editedCopy.chapters[editedCopy.chapterOrder[0]].state.cities[0];
const savedRaw = badCity.raw;
badCity.raw = savedRaw.slice(0, 16) + "0000" + savedRaw.slice(20);
assert.throws(() => compileGameSource(editedCopy, sha), /chapter native city coordinate mismatch/);
badCity.raw = savedRaw;
assert.equal(sha(read(`.dragon-analysis/map-migration-2/${rounds[0]}/package/game-source.json`)), first.assets.get("game-source.json").sha256);
assert.equal(edited.terrainBytes[10 * 384 + 10], 16);
assert.equal(copyCompiled.terrainBytes[10 * 384 + 10], 20);
assert.equal(editedCopy.sourceRef.revision, first.report.revision);
checks.push("same-contract isolated copy preserves explicit auxiliary assets; real atom edit changes derived plane and full-source provenance digest, original file retained; extra/missing visible scan nodes rejected without slot reindexing");
const originalFetch = globalThis.fetch;
const requests = [];
globalThis.fetch = async (input) => {
  const url = String(input);
  const asset = [...first.assets.values()].find((a) => a.url === url);
  if (!asset) throw new Error(`undeclared stage engine fetch ${url}`);
  requests.push(url);
  return new Response(asset.bytes, { status: 200 });
};
try {
  const content = createContentCatalog(first.catalog, json(first.assets.get("data.json").bytes));
  const world = createWorldResources(first.definition);
  assert.equal(requests.length, 0, "catalog/world construction is resource lazy");
  for (let idx = 0; idx < 20; idx++) {
    const raw = createNewGameScenario(content.chapter(idx).template);
    raw.player_faction = raw.factions[0].idx;
    const prepared = await prepareScenario({ raw, idx, mode: "fresh", content, world });
    assert.equal(prepared.scenario.cities.length, 192);
    assert.equal(prepared.metadata.content.chapterId, first.catalog.chapters[idx].id);
    assert.equal(prepared.metadata.world.revision, first.manifest.worldRevision);
    assert.equal(prepared.metadata.content.revision, first.manifest.contentRevision);
    const webMeta = snapshotScenarioAssembly({ scenario: prepared.scenario, scenarioIdx: idx, content, world });
    // Exercise actual JSON transport, not an in-memory cloning substitute.
    const checkpointJson = JSON.stringify({ state: prepared.scenario, webMeta });
    const saved = JSON.parse(checkpointJson);
    const restored = await prepareScenario({ raw: saved.state, idx, mode: "restore", content, world, ...readSavedAssembly(saved) });
    assert.deepEqual(snapshotScenarioAssembly({ scenario: restored.scenario, scenarioIdx: idx, content, world }), saved.webMeta,
      "production assembly JSON checkpoint preserves all RAM/terrain/cache without replaying opening pass");
    const oldIdentity = readSavedAssembly(saved);
    oldIdentity.metadata.world.revision = "1";
    const before = requests.length;
    await assert.rejects(prepareScenario({ raw: saved.state, idx, mode: "restore", content,
      world: createWorldResources(first.definition), ...oldIdentity }), /world identity mismatch/);
    assert.equal(requests.length, before, "old-world identity rejected before resource fetch");
    oldIdentity.metadata.world.revision = first.definition.revision;
    oldIdentity.metadata.content.revision = "1";
    await assert.rejects(prepareScenario({ raw: saved.state, idx, mode: "restore", content,
      world: createWorldResources(first.definition), ...oldIdentity }), /content identity/);
    assert.equal(requests.length, before);
    assert.equal(saved.webMeta.scenarioAssembly.world.revision, first.definition.revision, "rejected identity does not rewrite original memory checkpoint");
  }
  checks.push("formal new-revision catalog/world, 20 original chapter IDs and 192-city fresh engine assembly, no fallback or network");
  checks.push("20 production assembly JSON checkpoints restore RAM/terrain/cache exactly; old world/content revision 1 rejected before resources, original snapshots preserved");
} finally { globalThis.fetch = originalFetch; }
const toolHashes = Object.fromEntries(["tools/verify_unified_map_stage.mjs", "web/src/content/catalog.js", "web/src/game/worldresources.js",
  "web/src/core/assets.js", "web/src/game/scenarioassembly.js", "web/src/game/world.js",
  "web/src/game/navigation/pathfinder.js", "web/src/game/navigation/roadgraph.js",
  "web/src/content/authoring/gamesource.js", "web/src/content/authoring/trialcompile.js", "web/src/content/authoring/fixedcitybindings.js"].map((path) => [path, sha(readFileSync(join(root, path)))]));
process.stdout.write(JSON.stringify({ caseId: "M-02-STAGE-REPRO-ENGINE", result: "PASS", contractRevision: "GameSource@1/ki-byte-stamp-1",
  fixtureId: rounds.join("+"), expectedSource: "declared original Web baselines + shared fixed-map compiler", checks, requests,
  sourceHashes, toolHashes, nodeVersion: process.version,
  artifactPaths: rounds.map((r) => `.dragon-analysis/map-migration-2/${r}/package`),
  coverageLimits: ["No installation/current browser validation", "No geographic annotation/user visual acceptance", "No CPU/whole-campaign certification",
    "JSON covers production assembly RAM checkpoint only, not complete App save/IDB/menu/old-slot UI; no season Image/DPR/delayed-world/browser profile coverage", "Mock fetch never reaches network; no SAVE/profile"] }, null, 2) + "\n");
