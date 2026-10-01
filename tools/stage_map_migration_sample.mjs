// Persistent controlled M3 sample, not an editor, deployment or save exporter.
// Reads hash-verified current source/world/catalog and four original helpers;
// writes only a new evidence round. Mock fetch never forwards to a network.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { BUILTIN_RESOURCES } from "../web/src/content/builtinresources.generated.js";
import { copyBuiltinGame } from "../web/src/content/authoring/gamesource.js";
import { compileGameSource, TRIAL_COMPILER_REVISION } from "../web/src/content/authoring/trialcompile.js";
import { createContentCatalog } from "../web/src/content/catalog.js";
import { createWorldResources } from "../web/src/game/worldresources.js";
import { createNewGameScenario } from "../web/src/game/world.js";
import { prepareScenario, scenarioNativeRoadContext, snapshotScenarioAssembly, readSavedAssembly } from "../web/src/game/scenarioassembly.js";
const root = fileURLToPath(new URL("../", import.meta.url));
const round = process.argv[2];
assert.match(round ?? "", /^[a-zA-Z0-9-]+$/);
const output = join(root, ".dragon-analysis/map-migration-2", round);
assert.match(BUILTIN_RESOURCES.sourceURL, /^content\/builtin\/compiled\/map-2-[a-f0-9]{64}\/game-source\.json$/);
const sourceFolder = join(root, "web", BUILTIN_RESOURCES.sourceURL.replace(/game-source\.json$/, ""));
const sha = (data) => createHash("sha256").update(data).digest("hex");
function json(bytes, label) {
  try { return JSON.parse(bytes.toString()); }
  catch (cause) { throw new Error(`invalid ${label}`, { cause }); }
}
const manifestBytes = readFileSync(join(sourceFolder, "manifest.json"));
const manifest = json(manifestBytes, "manifest");
assert.equal(manifest.worldRevision, BUILTIN_RESOURCES.world.revision);
assert.equal(manifest.sourceDigest, BUILTIN_RESOURCES.sourceDigest);
const inputs = { "runtime-manifest": sha(manifestBytes) };
function asset(name) {
  assert.ok(["game-source.json", "catalog.json", "terrain.bin", "roads.json", "road_cost.bin", "road_offset.json"].includes(name));
  const entry = manifest.assets.find((a) => a.path === name);
  assert.ok(entry);
  const bytes = readFileSync(join(sourceFolder, name));
  assert.equal(bytes.length, entry.byteLength); assert.equal(sha(bytes), entry.sha256);
  inputs[name] = entry.sha256;
  return bytes;
}
const originalBytes = asset("game-source.json");
const source = json(originalBytes, "game source");
const originalCatalog = json(asset("catalog.json"), "catalog");
const originalPlane = asset("terrain.bin");
const originalRoads = json(asset("roads.json"), "roads");
const originalCost = asset("road_cost.bin"), originalOffset = asset("road_offset.json");
const cityWorldPath = join(root, "web/content/builtin/world/world.json");
const cityWorldBytes = readFileSync(cityWorldPath);
inputs["web/content/builtin/world/world.json"] = sha(cityWorldBytes);
const copy = copyBuiltinGame({ gameId: "map-migration-isolated-sample", kind: "full", source: {
  revision: BUILTIN_RESOURCES.world.revision, world: json(cityWorldBytes, "fixed city world"),
  map: source.map, componentDefinitions: source.componentDefinitions, compatibilityAssets: source.compatibilityAssets,
  chapters: source.chapterOrder.map((id) => ({ id, state: source.chapters[id].state })),
} }, sha);
const originCopyDigest = copy.sourceRef.digest;
const atom = copy.map.decorations.find((d) => d.x === 10 && d.y === 10);
assert.equal(atom.definitionRef, "tile-20");
atom.definitionRef = "tile-16";
const compiled = compileGameSource(copy, sha);
assert.equal(compiled.compatibilityAssetMode, "source-explicit");
const differences = [];
for (let i = 0; i < originalPlane.length; i++) if (compiled.terrainBytes[i] !== originalPlane[i]) differences.push(i);
assert.deepEqual(differences, [3850]);
assert.equal(compiled.terrainBytes[3850], 16);
assert.deepEqual(compiled.roadGraph, originalRoads);
assert.deepEqual(Buffer.from(compiled.roadCost), originalCost);
assert.deepEqual(Buffer.from(compiled.roadOffsetBytes), originalOffset);
const revision = `sample-${compiled.sourceDigest}`;
const prefix = `fixture://map-migration-2/${round}/${revision}/`;
const definition = { ...structuredClone(BUILTIN_RESOURCES.world), id: "map-migration-isolated-sample", revision,
  assets: { ...structuredClone(BUILTIN_RESOURCES.world.assets), terrain: prefix + "terrain.bin", roadGraph: prefix + "roads.json",
    roadCost: prefix + "road_cost.bin", roadOffset: prefix + "road_offset.json" } };
const catalog = { ...originalCatalog, id: copy.gameId, revision,
  chapters: originalCatalog.chapters.map((c, index) => ({ ...c, id: copy.chapterOrder[index],
    file: `chapters/copy-${String(index).padStart(2, "0")}.json` })) };
const data = { scenarios: copy.chapterOrder.map((id) => copy.chapters[id].state) };
mkdirSync(output);
const artifacts = new Map();
function write(path, value, role) {
  const bytes = typeof value === "string" ? Buffer.from(value) : Buffer.from(value);
  if (path.startsWith("chapters/")) mkdirSync(join(output, "chapters"), { recursive: true });
  writeFileSync(join(output, path), bytes);
  assert.equal(sha(readFileSync(join(output, path))), sha(bytes));
  artifacts.set(path, { path, url: prefix + path, role, byteLength: bytes.length, sha256: sha(bytes), bytes });
}
write("game-source.json", JSON.stringify(copy) + "\n", "modified-four-layer-full-copy");
write("terrain.bin", compiled.terrainBytes, "modified-native-initial-plane");
write("roads.json", JSON.stringify(compiled.roadGraph) + "\n", "unchanged-native-v2-road-graph");
write("road_cost.bin", compiled.roadCost, "unchanged-literal-legacy-grid-not-native-weights");
write("road_offset.json", compiled.roadOffsetBytes, "unchanged-literal-visual-offsets");
write("world-definition.json", JSON.stringify(definition) + "\n", "immutable-sample-world");
write("catalog.json", JSON.stringify(catalog) + "\n", "full-copy-chapter-identities");
write("data.json", JSON.stringify(data) + "\n", "unchanged-twenty-chapter-states");
for (const entry of catalog.chapters) write(entry.file, JSON.stringify(data.scenarios[entry.legacyScenarioIndex]) + "\n", "copied-chapter-template");
writeFileSync(join(output, "manifest.json"), JSON.stringify({ schemaVersion: 1, gameId: copy.gameId, revision,
  compiler: TRIAL_COMPILER_REVISION, sourceDigest: compiled.sourceDigest,
  origin: { sourceURL: BUILTIN_RESOURCES.sourceURL, sourceAssetSha256: inputs["game-source.json"],
    worldRevision: BUILTIN_RESOURCES.world.revision, fullSourceDigest: manifest.sourceDigest, constructorInputDigest: originCopyDigest },
  changes: [{ x: 10, y: 10, before: 20, after: 16, instanceId: atom.id }],
  assets: [...artifacts.values()].map(({ bytes: _bytes, ...entry }) => entry),
  relatedVisualAssets: manifest.assets.filter((a) => /^(?:season-|automatic-minimap)/.test(a.role)),
  relatedBattleAssets: manifest.related,
  geographyReview: "PENDING original imported labels; sample does not certify them",
}, null, 2) + "\n");
const requests = [], checks = [];
const oldFetch = globalThis.fetch;
globalThis.fetch = async (input) => {
  const url = String(input);
  const name = ["terrain.bin", "roads.json", "road_cost.bin", "road_offset.json"].find((n) => url === prefix + n);
  if (!name) throw new Error(`sample fetch outside four-resource whitelist: ${url}`);
  requests.push(url);
  return new Response(artifacts.get(name).bytes, { status: 200 });
};
try {
  const content = createContentCatalog(catalog, data), world = createWorldResources(definition);
  assert.equal(requests.length, 0);
  for (let idx = 0; idx < 20; idx++) {
    const raw = createNewGameScenario(content.chapter(idx).template);
    raw.player_faction = raw.factions[0].idx;
    const prepared = await prepareScenario({ raw, idx, mode: "fresh", content, world });
    assert.equal(scenarioNativeRoadContext(prepared.scenario).terrain.readTile(10, 10), 16);
    assert.equal(prepared.metadata.world.revision, revision);
    assert.equal(prepared.metadata.content.chapterId, copy.chapterOrder[idx]);
    const checkpointJson = JSON.stringify({ state: prepared.scenario,
      webMeta: snapshotScenarioAssembly({ scenario: prepared.scenario, scenarioIdx: idx, content, world }) });
    const saved = json(Buffer.from(checkpointJson), "sample JSON checkpoint");
    const restored = await prepareScenario({ raw: saved.state, idx, mode: "restore", content, world, ...readSavedAssembly(saved) });
    assert.deepEqual(snapshotScenarioAssembly({ scenario: restored.scenario, scenarioIdx: idx, content, world }), saved.webMeta);
    checks.push({ legacyScenarioIndex: idx, chapterId: copy.chapterOrder[idx], nativeTile: 16, jsonRestore: "pass" });
  }
} catch (error) {
  writeFileSync(join(output, "failure.json"), JSON.stringify({ error: String(error), requests }, null, 2) + "\n");
  throw error;
} finally { globalThis.fetch = oldFetch; }
assert.equal(sha(readFileSync(join(sourceFolder, "game-source.json"))), inputs["game-source.json"]);
const toolHashes = {};
for (const name of ["tools/stage_map_migration_sample.mjs", "web/src/content/authoring/gamesource.js", "web/src/content/authoring/trialcompile.js",
  "web/src/content/authoring/maplayers.js", "web/src/content/authoring/mapcompile.js", "web/src/content/authoring/fixedcitybindings.js",
  "web/src/game/scenarioassembly.js", "web/src/game/worldresources.js", "web/src/content/builtinresources.generated.js"])
  toolHashes[name] = sha(readFileSync(join(root, name)));
writeFileSync(join(output, "receipt.json"), JSON.stringify({ caseId: "M-03-persistent-modified-source-engine",
  contractRevision: "GameSource@1/ki-byte-stamp-1", sourceHashes: inputs, toolHashes, toolVersion: process.version,
  fixtureId: revision, expectedSource: "approved isolated authored change; original native byte/road/slot baselines unchanged otherwise",
  result: "pass-scoped", checks, requests, artifactPaths: [...artifacts.keys(), "manifest.json"],
  coverageLimits: "No full editor/real profile/network/CPU equivalence/visual approval. Reuses pinned original visual atlas/minimap references; this sample changes one grass byte without changing geographic class." }, null, 2) + "\n");
process.stdout.write(JSON.stringify({ caseId: "M-03-persistent-modified-source-engine", result: "pass-scoped", revision, chapters: checks.length, differences }) + "\n");
