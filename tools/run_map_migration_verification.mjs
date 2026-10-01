// Explicit reviewed entry list. No wildcard execution, git operations, network
// forwarding, real saves/profiles, deployment or inherited credential env.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, openSync, closeSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { BUILTIN_RESOURCES } from "../web/src/content/builtinresources.generated.js";
import { TRIAL_COMPILER_REVISION } from "../web/src/content/authoring/trialcompile.js";
const root = fileURLToPath(new URL("../", import.meta.url));
const round = process.argv[2];
assert.match(round ?? "", /^[a-zA-Z0-9-]{1,64}$/);
const output = join(root, ".dragon-analysis/map-migration-2", round);
mkdirSync(output);
const childEnv = {};
for (const key of ["SystemRoot", "SYSTEMROOT", "WINDIR", "COMSPEC", "ComSpec", "PATH", "Path", "PATHEXT", "TEMP", "TMP",
  "USERPROFILE", "LOCALAPPDATA", "APPDATA", "HOMEDRIVE", "HOMEPATH", "PLAYWRIGHT_MODULE"])
  if (process.env[key] !== undefined) childEnv[key] = process.env[key];
childEnv.PYTHONDONTWRITEBYTECODE = "1"; childEnv.PYTHONUTF8 = "1"; childEnv.PYTHONOPTIMIZE = "";
const node = (id, script, args = [], expectedSource = "reviewed scoped regression; not new original-mechanism certification") =>
  ({ id, binary: process.execPath, args: [script, ...args], script, expectedSource });
const test = (id, script) => ({ ...node(id, script), args: ["--test", "--test-reporter=tap", script] });
const python = (id, script, args = []) => ({ id, binary: "C:/Python313/python.exe", args: ["-B", script, ...args], script,
  expectedSource: "reviewed original non-save inputs/old Web content, literal preserved goldens" });
const entries = [
  node("M00-current-baseline", "tools/audit_map_migration_baseline.mjs", [round + "-m0"]),
  node("M01-combinations", "tools/verify_minimap_groups.mjs"),
  node("M01-seed", "tools/verify_minimap_seed.mjs"),
  node("M04-06-approved-stage", "tools/verify_approved_map_stage.mjs", ["explicit-stage-r11", "explicit-stage-r12"]),
  node("E03-component-pure", "tools/verify_editor_component_tools.mjs"),
  node("E03-component-browser", "tools/verify_editor_component_browser.mjs", [round + "-components"]),
  node("E02-03-current-workspace", "tools/verify_editor_unified_workspace.mjs", [round + "-workspace"]),
  node("E02-service", "tools/editor_server.mjs"),
  node("E03-road-loop", "tools/verify_editor_road_loop.mjs"),
  node("E02-trial-loop", "tools/verify_editor_trial_loop.mjs"),
  node("E02-trial-browser", "tools/verify_editor_trial_browser.mjs"),
  node("E03-studio-road", "tools/verify_editor_studio_road_browser.mjs"),
  node("M03-four-layer", "tools/verify_layered_map_compile.mjs"),
  node("M03-modified-engine", "tools/verify_layered_map_engine.mjs"),
  node("M04-05-stage", "tools/verify_unified_map_stage.mjs", ["m2-stage-r6", "m2-stage-r7"]),
  node("M03-persistent-sample", "tools/stage_map_migration_sample.mjs", [round + "-sample"]),
  python("safe-content-compile", "tools/compile_content.py", ["--output", ".dragon-analysis/map-migration-2/" + round + "-legacy"]),
  python("safe-content-pipeline", "tools/verify_content_pipeline.py"),
  node("safe-catalog", "tools/verify_content_catalog.mjs"),
  node("safe-world", "tools/verify_world_resources.mjs"),
  node("safe-start", "tools/verify_start_flow.mjs"),
  test("safe-slot-phase", "tools/verify_legion_slot_phase.mjs"),
  test("safe-slot-battle", "tools/verify_legion_slot_battle.mjs"),
  test("safe-formation", "tools/verify_native_formation.mjs"),
  test("safe-road-authority", "tools/verify_road_field_authority.mjs"),
  test("safe-road-movement", "tools/verify_native_road_movement.mjs"),
  python("safe-marker", "tools/verify_map_marker_anchor.py"),
  node("safe-weather", "tools/verify_weather_presentation.mjs"),
  node("safe-disaster", "tools/verify_disaster_presentation.mjs"),
  node("safe-retained", "tools/verify_retained_layers.mjs"),
  node("safe-render-browser", "tools/verify_render_layers_browser.mjs"),
  node("safe-weather-browser", "tools/verify_weather_browser.mjs"),
  node("safe-lifecycle", "tools/verify_legion_lifecycle_browser.mjs"),
  node("save-transaction", "tools/verify_save_repository.mjs"),
  node("save-memory-roundtrip", "tools/verify_local_saves.mjs"),
  node("save-guard", "tools/verify_save_transition_guard.mjs"),
  test("M04-fixed-rng", "tools/verify_fixed_rng_march_diff.mjs"),
  test("M04-tactical-map", "tools/verify_tactical_entry_full.mjs"),
  node("M05-cache-retry", "tools/verify_asset_retry.mjs"),
  node("M05-world-retry", "tools/verify_world_asset_retry.mjs"),
  node("M05-layout", "tools/verify_map_panel_layout.mjs"),
  node("M05-current-browser", "tools/verify_unified_map_browser.mjs", [round + "-browser"]),
  node("M04-projection", "tools/verify_unified_map_projection_browser.mjs", [round + "-projection"]),
  node("M05-save-identity", "tools/verify_unified_map_identity_browser.mjs", [round + "-identity"]),
  node("M05-menu-save", "tools/verify_menu_save_slots_browser.mjs", [round + "-menu-save"]),
  node("M05-advisor-lock", "tools/verify_advisor_lock_browser.mjs", [round + "-advisor"]),
  node("M04-05-march-target", "tools/verify_march_indication_browser.mjs", [round + "-march"]),
];
const sha = (data) => createHash("sha256").update(data).digest("hex");
const sourceFiles = ["web/src/content/authoring/maplayers.js", "web/src/content/authoring/mapcompile.js", "web/src/content/authoring/atomicmapimport.js",
  "web/src/content/authoring/fixedgameimport.js", "web/src/content/authoring/fixedcitybindings.js", "web/src/content/authoring/gamesource.js",
  "web/src/content/authoring/trialcompile.js", "web/src/content/authoring/trialruntime.js", "web/src/content/authoring/roadedit.js",
  "tools/map_display_acceptance.mjs", "tools/stage_approved_unified_map_game.mjs", "tools/map_minimap_groups.mjs", "tools/map_water_display_authoring.mjs",
  "tools/editor_server.mjs", "tools/editor_builtin_source.mjs", "tools/minimap_png.mjs", "web/editor-studio.html", "web/src/editor/studio.js", "web/src/editor/componenttools.js", "web/src/content/catalog.js", "web/src/content/worlddefinition.js", "web/src/content/builtinresources.generated.js",
  "web/src/core/assets.js", "web/src/core/localstore.js", "web/src/core/saverepository.js", "web/src/core/indexeddbsavebackend.js",
  "web/src/game/scenarioassembly.js", "web/src/game/savegame.js", "web/src/game/worldresources.js", "web/src/game/world.js",
  "web/src/game/navigation/pathfinder.js", "web/src/game/navigation/roadgraph.js", "web/src/ui/gamebar.js", "web/src/ui/mappanellayout.js",
  "web/src/content/authoring/minimap.js", "tools/browser_test_server.mjs", "tools/savebackend_mock.mjs", "tools/run_map_migration_verification.mjs",
  ...entries.map((e) => e.script)];
const snapshot = () => Object.fromEntries([...new Set(sourceFiles)].map((name) => [name, sha(readFileSync(join(root, name)))]));
const sourceHashes = snapshot();
assert.match(BUILTIN_RESOURCES.sourceURL, /^content\/builtin\/compiled\/map-2-[a-f0-9]{64}\/game-source\.json$/);
const assetRoot = join(root, "web", BUILTIN_RESOURCES.sourceURL.replace(/game-source\.json$/, ""));
const manifestBytes = readFileSync(join(assetRoot, "manifest.json"));
let manifest;
try { manifest = JSON.parse(manifestBytes.toString()); }
catch (cause) { throw new Error("invalid current runtime manifest", { cause }); }
assert.equal(manifest.worldRevision, BUILTIN_RESOURCES.world.revision);
assert.equal(manifest.assets.length, 38);
for (const entry of manifest.assets) {
  assert.match(entry.path, /^(?:[a-zA-Z0-9_-]+\.(?:json|png|bin)|chapters\/[a-zA-Z0-9_.-]+\.json)$/);
  const bytes = readFileSync(join(assetRoot, entry.path));
  assert.equal(bytes.length, entry.byteLength); assert.equal(sha(bytes), entry.sha256);
}
const resourceSnapshot = () => Object.fromEntries(["manifest.json", ...manifest.assets.map((a) => a.path)].map((name) =>
  [name, sha(readFileSync(join(assetRoot, name)))]));
const resourceHashes = resourceSnapshot();
const results = [];
const receipt = { caseId: "MAP-MIGRATION-2-explicit-machine-suite", contractRevision: `GameSource@1/ki-byte-stamp-1/${TRIAL_COMPILER_REVISION}`,
  sourceHashes, resourceHashes, toolHashes: sourceHashes, toolVersion: process.version, fixtureId: BUILTIN_RESOURCES.world.revision,
  expectedSource: "explicit AGENTS safe suite plus reviewed M00-M05 proofs; no wildcard or rule expectation refresh",
  result: "running", artifactPaths: [], coverageLimits: ["NOT task completion or M06 approval", "Web display acceptance recorded separately; not original water-mechanism certification",
    "Road authority includes five retired walker skips", "Fixed RNG is scoped Web determinism, not CPU equivalence", "Only owned browser contexts/memory stores"],
  results, startedAt: new Date().toISOString() };
const writeReceipt = () => writeFileSync(join(output, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n");
writeReceipt();
for (const entry of entries) {
  const log = `${entry.id}.log`, path = join(output, log), descriptor = openSync(path, "wx");
  const start = Date.now();
  let run;
  try { run = spawnSync(entry.binary, entry.args, { cwd: root, env: childEnv, stdio: ["ignore", descriptor, descriptor], timeout: 600000 }); }
  finally { closeSync(descriptor); }
  results.push({ caseId: entry.id, command: [entry.binary, ...entry.args], result: run.status === 0 ? "pass-scoped" : "failed",
    exitCode: run.status, signal: run.signal, error: run.error ? String(run.error) : null, durationMs: Date.now() - start,
    expectedSource: entry.expectedSource, artifactPath: log, logSha256: sha(readFileSync(path)), toolSha256: sourceHashes[entry.script] });
  receipt.artifactPaths.push(log); writeReceipt();
  process.stdout.write(`${entry.id}: ${results.at(-1).result}\n`);
  if (run.status !== 0) { receipt.result = "failed"; writeReceipt(); process.exitCode = 1; break; }
}
try {
  assert.deepEqual(snapshot(), sourceHashes, "source drift during suite invalidates combined receipt");
  assert.deepEqual(resourceSnapshot(), resourceHashes, "immutable resource drift invalidates combined receipt");
} catch (error) {
  receipt.result = "source-or-resource-drift"; receipt.validationError = String(error); writeReceipt(); throw error;
}
if (!process.exitCode) receipt.result = "pass-scoped-machine-suite";
receipt.finishedAt = new Date().toISOString();
writeReceipt();
process.stdout.write(JSON.stringify({ result: receipt.result, groups: results.length, goalComplete: false,
  pending: ["final requirement-to-evidence completion and diff/syntax/LSP audit"] }) + "\n");
