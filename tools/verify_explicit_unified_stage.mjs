// Focused explicit-source reproducibility/assembly and author-data rejects.
// Reads only declared new rounds/Web baselines; mock fetch never forwards.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createContentCatalog } from "../web/src/content/catalog.js";
import { createWorldResources } from "../web/src/game/worldresources.js";
import { createNewGameScenario } from "../web/src/game/world.js";
import { prepareScenario, readSavedAssembly, snapshotScenarioAssembly } from "../web/src/game/scenarioassembly.js";
import { applyWaterDisplayProposal } from "./map_water_display_authoring.mjs";
import { compileGameSource } from "../web/src/content/authoring/trialcompile.js";
const root = fileURLToPath(new URL("../", import.meta.url));
const [first, second] = process.argv.slice(2);
for (const round of [first, second]) assert.match(round ?? "", /^[a-zA-Z0-9-]{1,64}$/);
assert.notEqual(first, second);
const sha = (data) => createHash("sha256").update(data).digest("hex");
const inputHashes = {}, toolHashes = {};
function read(path) { const b = readFileSync(join(root, path)); inputHashes[path] = sha(b); return b; }
function json(bytes) { try { return JSON.parse(bytes.toString()); } catch (cause) { throw new Error("invalid stage fixture JSON", { cause }); } }
const base = ".dragon-analysis/map-migration-2/";
const a = json(read(`${base}${first}/stage-report.json`)), b = json(read(`${base}${second}/stage-report.json`));
assert.deepEqual(a, b); assert.equal(a.result, "PASS-STAGE-ONLY-REVIEW-REQUIRED");
assert.ok(Object.keys(a.sourceHashes).every((p) => p.startsWith("web/") || ["docs/data/original-map-water-display-proposal.json", "docs/data/original-map-minimap-groups.json"].includes(p)));
const allowedInputs = new Set(["web/content/builtin/world/world.json", "web/content/builtin/world/roads.json", "web/content/builtin/catalog.json",
  "web/data.json", "web/mmap_map.bin", "web/road_cost.bin", "web/road_offset.json", "docs/data/original-map-water-display-proposal.json",
  "docs/data/original-map-minimap-groups.json",
  ...["spring", "summer", "autumn", "winter"].flatMap((s) => [`web/map_atlas_${s}.png`, `web/map_tiles_${s}.png`]),
  ...["battle_maps.json", "battle_navigation.json", "battle_display.bin", "battle_rules.json", "battle_scripts.json", "battle_talk.json"].map((p) => "web/" + p)]);
assert.equal(Object.keys(a.sourceHashes).length, allowedInputs.size);
for (const [p, record] of Object.entries(a.sourceHashes)) {
  assert.ok(allowedInputs.has(p)); const bytes = read(p); assert.equal(sha(bytes), record.sha256); assert.equal(bytes.length, record.byteLength);
}
const allowedTools = new Set(["tools/stage_explicit_unified_map_game.mjs", "tools/map_water_display_authoring.mjs", "tools/map_minimap_groups.mjs",
  "web/src/content/authoring/fixedgameimport.js", "web/src/content/authoring/atomicmapimport.js", "web/src/content/authoring/maplayers.js",
  "web/src/content/authoring/mapcompile.js", "web/src/content/authoring/gamesource.js", "web/src/content/authoring/roadedit.js",
  "web/src/content/authoring/trialcompile.js", "web/src/content/authoring/fixedcitybindings.js", "web/src/content/authoring/minimap.js"]);
assert.equal(Object.keys(a.toolHashes).length, allowedTools.size);
for (const [p, hash] of Object.entries(a.toolHashes)) { assert.ok(allowedTools.has(p)); assert.equal(sha(read(p)), hash); }
const packagePath = `${base}${first}/package/`;
const manifestBytes = read(packagePath + "manifest.json");
assert.deepEqual(manifestBytes, read(`${base}${second}/package/manifest.json`));
const manifest = json(manifestBytes), resources = new Map();
assert.equal(manifest.assets.length, 38); assert.equal(manifest.worldRevision, a.revision);
assert.equal(manifest.geographyReview, "CATEGORY_APPROVED_VISUAL_PENDING");
assert.equal(manifest.visualReview, "PENDING_STYLE_2");
for (const asset of manifest.assets) {
  assert.match(asset.path, /^(?:[A-Za-z0-9_-]+\.(?:json|png|bin)|chapters\/[A-Za-z0-9_-]+\.json)$/);
  assert.equal(asset.url, `content/builtin/compiled/${a.revision}/${asset.path}`);
  assert.ok(!resources.has(asset.url), "duplicate resource identity");
  const bytes = read(packagePath + asset.path); assert.equal(bytes.length, asset.byteLength); assert.equal(sha(bytes), asset.sha256);
  assert.deepEqual(bytes, read(`${base}${second}/package/${asset.path}`)); resources.set(asset.url, bytes);
}
assert.deepEqual(read(`${base}${first}/builtinresources.generated.js`), read(`${base}${second}/builtinresources.generated.js`));
// The four native resources must stay byte-identical to the prior evidence;
// new display PNGs deliberately change and must NOT reuse old visual approval.
const proposalReport = json(read(`${base}explicit-water-proposal-r3/receipt.json`));
for (const name of ["terrain.bin", "roads.json", "road_cost.bin", "road_offset.json"]) {
  const expected = proposalReport.artifactPaths.find((r) => r.path === name); assert.ok(expected);
  const asset = manifest.assets.find((r) => r.path === name); assert.equal(asset.sha256, expected.sha256);
}
// Whole real candidate source, not only a toy fixture: all combination
// switches off affect display only; serialized identities/flags survive.
const game = json(read(packagePath + "game-source.json"));
const visible = compileGameSource(game, sha), hiddenGame = structuredClone(game);
for (const group of hiddenGame.map.waterGroups) group.showOnMinimap = false;
const hidden = compileGameSource(hiddenGame, sha);
for (const key of ["terrainBytes", "geography", "roadMask", "roadGraph", "roadCost", "roadOffsetBytes"]) assert.deepEqual(hidden[key], visible[key]);
assert.ok(visible.minimapGeography.some(Boolean)); assert.ok(!hidden.minimapGeography.some(Boolean));
assert.notEqual(hidden.sourceDigest, visible.sourceDigest, "content switch belongs to source identity, not workspace state");
const requests = [], checks = [], oldFetch = globalThis.fetch;
const definition = json(read(packagePath + "world-definition.json")), catalog = json(read(packagePath + "catalog.json")), data = json(read(packagePath + "data.json"));
globalThis.fetch = async (input) => {
  const url = String(input);
  assert.ok([definition.assets.terrain, definition.assets.roadGraph, definition.assets.roadCost, definition.assets.roadOffset].includes(url));
  assert.ok(resources.has(url)); requests.push(url); return new Response(resources.get(url), { status: 200 });
};
try {
  const content = createContentCatalog(catalog, data), world = createWorldResources(definition);
  assert.equal(requests.length, 0);
  for (let idx = 0; idx < 20; idx++) {
    const raw = createNewGameScenario(content.chapter(idx).template); raw.player_faction = raw.factions[0].idx;
    const ready = await prepareScenario({ raw, idx, mode: "fresh", content, world });
    assert.equal(ready.scenario.cities.length, 192);
    const text = JSON.stringify({ state: ready.scenario, webMeta: snapshotScenarioAssembly({ scenario: ready.scenario, scenarioIdx: idx, content, world }) });
    const saved = json(Buffer.from(text));
    const restored = await prepareScenario({ raw: saved.state, idx, mode: "restore", content, world, ...readSavedAssembly(saved) });
    assert.deepEqual(snapshotScenarioAssembly({ scenario: restored.scenario, scenarioIdx: idx, content, world }), saved.webMeta);
    checks.push({ idx, chapter: content.chapter(idx).reference, result: "fresh-and-JSON-restored" });
  }
} finally { globalThis.fetch = oldFetch; }
// Small isolated DISPLAY fixtures; do not invent native mechanisms/goldens.
const plane = Buffer.alloc(384 * 256); plane[3850] = 32;
const source = { map: { base: { geography: Array(plane.length).fill(0) }, roads: [], placements: [],
  decorations: [{ id: "water", x: 10, y: 10 }] } };
const proposal = { schemaVersion: 1, status: "PROPOSED_NOT_APPROVED", id: "fixture", sourcePlaneSha256: sha(plane),
  waterBearingTileIds: [32], defaultWaterRegion: { id: "R", waterClass: "river" }, regions: [], waterRoadIds: [] };
const valid = applyWaterDisplayProposal(structuredClone(source), plane, proposal, sha(Buffer.from("fixture")), sha(plane));
assert.equal(valid.annotations[0].waterClass, "river");
const rejects = [
  [{ ...proposal, status: "APPROVED_WITHOUT_REVIEW" }, /PROPOSED_NOT_APPROVED/],
  [{ ...proposal, waterBearingTileIds: [32, 32] }, /Assertion/],
  [{ ...proposal, waterRoadIds: ["unknown-road"] }, /unknown author road/],
  [{ ...proposal, regions: [{ id: "R", waterClass: "sea", polygon: [[0, 0], [20, 0], [0, 20]] }] }, /Assertion/],
  [{ ...proposal, regions: [{ id: "bad", waterClass: "snow", polygon: [[0, 0], [20, 0], [0, 20]] }] }, /Assertion/],
  [{ ...proposal, regions: [{ id: "bad", waterClass: "lake", polygon: [[-1, 0], [20, 0], [0, 20]] }] }, /Assertion/],
  [{ ...proposal, regions: ["A", "B"].map((id) => ({ id, waterClass: "lake", polygon: [[0, 0], [20, 0], [20, 20], [0, 20]] })) }, /ambiguous authored water/],
];
for (const [bad, message] of rejects) assert.throws(() => applyWaterDisplayProposal(structuredClone(source), plane, bad, sha(Buffer.from("fixture")), sha(plane)), message);
for (const p of ["tools/verify_explicit_unified_stage.mjs", "tools/map_water_display_authoring.mjs", "web/src/content/catalog.js", "web/src/game/worldresources.js",
  "web/src/game/scenarioassembly.js", "web/src/game/world.js", "web/src/content/authoring/trialcompile.js",
  "web/src/content/authoring/maplayers.js", "web/src/content/authoring/mapcompile.js"]) toolHashes[p] = sha(readFileSync(join(root, p)));
process.stdout.write(JSON.stringify({ caseId: "M-00-02-portable-explicit-stage-repro-assembly", contractRevision: a.contractRevision,
  sourceHashes: inputHashes, toolHashes, toolVersion: process.version, fixtureId: a.revision,
  expectedSource: "fixed readonly native input parity; category approved by user, new combination/style visual review pending", result: "PASS-SCOPED-REVIEW-REQUIRED",
  checks, requests, negativeControls: rejects.length, artifactsIdentical: 38, combinationSwitches: { allOff: true, nativeAndFullGeographyUnchanged: true }, artifactPaths: [],
  coverageLimits: "No installation/visual approval/real profile/native water semantic claim; portable stage differs in origin metadata from installed candidate" }, null, 2) + "\n");
