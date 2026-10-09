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
import { BUILTIN_ENTITY_SOURCE } from "../web/src/editor/builtinentitysource.generated.js";
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
  node("E01-navigation-pure", "tools/verify_editor_navigation.mjs"),
  node("E01-navigation-browser", "tools/verify_editor_navigation_browser.mjs", [round + "-navigation"]),
  node("E03-viewport-pure", "tools/verify_editor_viewport.mjs"),
  node("E03-viewport-browser", "tools/verify_editor_viewport_browser.mjs", [round + "-viewport"]),
  python("E04-ability-offline-byte", "tools/verify_editor_ability_import.py"),
  python("E04-money-offline-signed24", "tools/verify_editor_money_import.py"),
  node("E04-money-native-compile", "tools/verify_editor_money_compile.mjs"),
  node("E04-reserve-native-compile", "tools/verify_editor_reserve_compile.mjs"),
  python("E04-faction-encoding-consistency", "tools/verify_editor_faction_consistency.py"),
  node("E04-chapter-resources-memory", "tools/verify_editor_chapter_resources.mjs"),
  node("E04-chapter-resources-api", "tools/verify_editor_chapter_resources_api.mjs"),
  node("E04-date-atomic-faults", "tools/verify_atomic_builtin_release.mjs"),
  node("E04-date-real-upgrade", "tools/verify_editor_date_upgrade.mjs"),
  node("E04-date-installed-App", "tools/verify_editor_date_installed_app.mjs", [round + "-date-App"]),
  node("E04-entity-history", "tools/verify_editor_entity_history.mjs"),
  node("E04-entity-copy-pure", "tools/verify_editor_entity_copy.mjs"),
  node("E04-entity-copy-api", "tools/verify_editor_entity_copy_api.mjs"),
  node("E04-entity-inspection-pure", "tools/verify_editor_entity_inspection.mjs"),
  node("E04-entity-inspection-browser", "tools/verify_editor_entity_inspection_browser.mjs", [round + "-inspection"]),
  node("E02-metadata-pure", "tools/verify_editor_metadata.mjs"),
  node("E02-game-management", "tools/verify_editor_game_management.mjs", [round + "-games"]),
  node("E05-list-trial-pure", "tools/verify_editor_list_trial.mjs"),
  node("E05-list-trial-App", "tools/verify_editor_list_trial_browser.mjs", [round + "-list-trial"]),
  node("E05-trial-policy", "tools/verify_editor_trial_policy.mjs"),
  node("E05-chapter-projection", "tools/verify_editor_trial_scope.mjs"),
  node("E05-chapter-service", "tools/verify_editor_chapter_trial_api.mjs"),
  node("E05-chapter-App", "tools/verify_editor_chapter_trial_browser.mjs", [round + "-chapter-App"]),
  node("E05-App-trial", "tools/verify_editor_app_trial.mjs", [round + "-app-trial"]),
  node("E05-connection-core", "tools/verify_editor_trial_connection.mjs"),
  node("E05-connection-monitor", "tools/verify_editor_trial_connection_monitor.mjs"),
  node("E05-connection-events", "tools/verify_editor_trial_connection_events.mjs"),
  node("E05-connection-events-browser", "tools/verify_editor_trial_connection_events_browser.mjs", [round + "-connection-events"]),
  node("E05-rule-boundaries", "tools/verify_editor_trial_rule_boundaries.mjs"),
  node("E05-discard-pure", "tools/verify_editor_trial_discard.mjs"),
  node("E05-discard-App", "tools/verify_editor_trial_discard_browser.mjs", [round + "-discard-App"]),
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
  node("E08-game-save-runtime-callee", "tools/verify_game_save_runtime.mjs"),
  node("E08-game-save-exchange", "tools/verify_game_save_exchange.mjs"),
  node("E08-game-save-snapshot-detached", "tools/verify_game_save_snapshot.mjs"),
  node("E08-game-save-store-memory", "tools/verify_game_save_store.mjs"),
  node("E08-game-save-store-browser", "tools/verify_game_save_store_browser.mjs", [round + "-game-save"]),
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
  "web/src/main.js", "web/index.html", "web/src/editor/trialapp.js", "web/src/editor/trialpolicy.js",
  "web/editor-games.html", "web/src/editor/games.js", "web/src/editor/listtrial.js", "web/src/editor/navigation.js", "web/src/editor/gamemetadata.js", "web/src/editor/viewport.js",
  "web/src/editor/trialscope.js", "web/src/editor/entityindex.js", "web/src/editor/entitysource.js", "web/src/editor/entitycopy.js", "web/src/editor/builtinentitysource.generated.js",
  "web/src/editor/entityinspection.js", "web/src/editor/entities.js", "web/editor-entities.html",
  "web/src/editor/entityhistory.js", "web/src/editor/builtinentityhistory.generated.js", "tools/preserve_editor_entity_history.mjs",
  "tools/verify_entity_fields.py", "tools/content_pipeline.py", "tools/verify_editor_money_compile.py", "tools/verify_editor_reserve_compile.py",
  "web/src/editor/chapterresources.js",
  "tools/parse_sinario.py", "tools/verify_editor_date_import.py", "tools/stage_editor_date_candidate.mjs", "tools/verify_editor_date_candidate.mjs",
  "tools/verify_editor_date_app.mjs", "tools/date_display_inheritance.mjs", "tools/stage_editor_date_adoption.mjs", "tools/verify_editor_date_adoption.mjs",
  "tools/atomic_builtin_release.mjs", "tools/install_editor_date_adoption.mjs", "web/src/content/builtinrelease.generated.js",
  "tools/audit_editor_entities.mjs", "tools/verify_editor_entity_index.mjs", "tools/stage_editor_entity_source.mjs", "tools/verify_editor_entity_source.mjs",
  "tools/install_editor_entity_source.mjs", "tools/editor_entity_source.mjs", "tools/verify_installed_editor_entity_source.mjs",
  "tools/editor_server.mjs", "tools/editor_builtin_source.mjs", "tools/minimap_png.mjs", "web/editor-studio.html", "web/src/editor/studio.js", "web/src/editor/componenttools.js", "web/src/content/catalog.js", "web/src/content/worlddefinition.js", "web/src/content/builtinresources.generated.js",
  "web/src/core/assets.js", "web/src/core/localstore.js", "web/src/core/saverepository.js", "web/src/core/indexeddbsavebackend.js",
  "web/src/core/gamesavecodec.js", "web/src/core/gamesavestore.js", "web/src/core/savecatalog.js", "tools/gamesave_mock.mjs",
  "web/src/core/gamesaveexchange.js", "web/src/core/saveexchange.js", "web/src/content/ruleprofile.js", "tools/gamesavefixture.mjs",
  "web/src/game/scenarioassembly.js", "web/src/game/savegame.js", "web/src/game/worldresources.js", "web/src/game/world.js",
  "web/src/game/navigation/pathfinder.js", "web/src/game/navigation/roadgraph.js", "web/src/ui/gamebar.js", "web/src/ui/mappanellayout.js",
  "web/src/content/authoring/minimap.js", "tools/browser_test_server.mjs", "tools/savebackend_mock.mjs", "tools/run_map_migration_verification.mjs",
  "tools/audit_editor_trial_assets.mjs", "tools/stage_editor_trial_assets.mjs", "tools/verify_editor_trial_assets.mjs",
  "web/src/editor/trialassetpaths.js", "web/src/editor/trialassetmanifest.js",
  "tools/audit_editor_portrait_reader.py", "tools/audit_editor_portrait_callers.py",
  "web/src/editor/trialconnection.js", "web/src/editor/trialconnectionmonitor.js", "web/src/editor/trialconnectionevents.js", "web/src/editor/trialruleboundaries.js",
  "web/src/game/clock.js", "web/src/game/tacticalclock.js", "web/src/render/battleview.js", "web/src/game/tacticalbattle.js",
  "web/src/game/battlescript.js", "web/src/game/battle/originalsession.js", "web/src/game/battle/originalrng.js", "web/src/game/battle/originalstartup.js",
  // Explicit lexical static-relative dependencies of the direct strategic save trace.
  // Read/hash coverage is not active battle/event/full-campaign execution coverage.
  "web/src/render/chunkedterrain.js", "web/src/game/navigation/originalroadcontent.js", "web/src/game/navigation/originalroadmemory.js", "web/src/game/legionphase.js", "web/src/game/legioncounts.js", "web/src/game/nativelegions.js", "web/src/game/navigation/scenariomovementmemory.js", "web/src/game/nativefactions.js", "web/src/game/nativediplomacy.js", "web/src/game/nativeevents.js", "web/src/game/nativemonthlypolicy.js", "web/src/game/navigation/scenarioroadmemory.js", "web/src/game/navigation/originalroadstate.js", "web/src/game/navigation/scenariocitycache.js", "web/src/game/navigation/scenarioterrainmemory.js", "web/src/game/navigation/originalcitycapture.js", "web/src/game/navigation/originallegionfate.js", "web/src/game/weather.js", "web/src/game/legionmode.js", "web/src/game/navigation/scenariolegionfate.js", "web/src/game/navigation/originalformation.js", "web/src/game/ai.js", "web/src/game/diplomacy.js", "web/src/game/playerqueries.js", "web/src/game/economy.js", "web/src/game/navigation/scenariomonthlyfiscal.js", "web/src/game/navigation/originalmonthlyfiscal.js", "web/src/game/legacyrecords.js", "web/src/game/navigation/originalvictorygate.js", "web/src/game/pathfind.js", "web/src/game/roadgraph.js", "web/src/core/speaker.js", "web/src/game/navigation/originalroadmovement.js", "web/src/game/navigation/originalroadsearch.js", "web/src/game/navigation/originalfieldterrain.js", "web/src/game/navigation/originalroadretreat.js", "web/src/game/navigation/originalfieldbattle.js", "web/src/game/autobattle.js", "web/src/game/legionunits.js", "web/src/game/navigation/originalsiege.js", "web/src/game/navigation/originalroadarrival.js", "web/src/game/battle/battleprojection.js", "web/src/game/battle/originalstate.js", "web/src/game/battle/originalobjectframe.js", "web/src/game/battle/originalmovement.js", "web/src/game/battle/originalinit.js", "web/src/game/battle/originaleffects.js", "web/src/game/battle/originalspatial.js", "web/src/game/battle/originalcommands.js", "web/src/game/battle/originalcollision.js", "web/src/game/battle/originalframe.js", "web/src/game/battle/originalexecutor.js", "web/src/game/battle/originaltargeting.js", "web/src/game/battle/originalformation.js", "web/src/game/battle/originalattack.js", "web/src/game/battle/originalretreat.js", "web/src/game/battle/originaleffectframe.js", "web/src/game/battle/originalexit.js", "web/src/game/battle/originalresult.js", "web/src/game/battle/originalmapobjects.js", "web/src/game/battle/originalpathqueue.js", "web/src/game/battle/originalmessages.js", "web/src/game/battle/originaldisplay.js", "web/src/game/battle/originalnavigation.js", "web/src/game/battle/originalpathfinder.js", "web/src/game/battle/originalmoveframe.js", "web/src/game/navigation/originalcity.js", "web/src/game/navigation/scenarioweather.js", "web/src/game/navigation/originalweather.js", "web/src/game/navigation/scenarioevents.js", "web/src/game/navigation/originalevents.js", "web/src/game/navigation/scenariofactiontick.js", "web/src/game/navigation/originalfactiontick.js", "web/src/game/navigation/scenariogeneralrating.js", "web/src/game/navigation/originalgeneralrating.js", "web/src/game/navigation/scenariomonthlydiplomacy.js", "web/src/game/navigation/scenariowarconsumer.js", "web/src/game/navigation/originalwarconsumer.js", "web/src/game/navigation/originalmonthlydiplomacy.js", "web/src/game/navigation/scenariomonthlybudgets.js", "web/src/game/navigation/originalmonthlybudgets.js", "web/src/game/navigation/scenariomonthlypolicy.js", "web/src/game/navigation/originalmonthlypolicy.js", "web/src/game/navigation/scenariocapitalrelocation.js", "web/src/game/navigation/originalcapitalrelocation.js", "web/src/game/navigation/scenarionegotiation.js", "web/src/game/navigation/originalassistanceconsumer.js", "web/src/game/navigation/originalnegotiation.js", "web/src/game/navigation/originalbudgetconsumer.js", "web/src/game/navigation/originalenvoyresultconsumer.js", "web/src/game/navigation/originaltruceconsumer.js", "web/src/game/navigation/originalplayerdecision.js", "web/src/game/navigation/scenariodeficittrust.js", "web/src/game/navigation/originaldeficittrust.js", "web/src/game/talk.js", "web/src/game/legionscheduler.js", "web/src/game/legioncontinuation.js", "web/src/game/strategicfailure.js",
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
const authorResourceSnapshot = () => Object.fromEntries([BUILTIN_ENTITY_SOURCE.manifestURL, BUILTIN_ENTITY_SOURCE.resourceURL].map(url =>
  [url, sha(readFileSync(join(root, "web", url)))]));
const authorResourceHashes = authorResourceSnapshot();
assert.equal(authorResourceHashes[BUILTIN_ENTITY_SOURCE.manifestURL], BUILTIN_ENTITY_SOURCE.manifestSha256);
assert.equal(authorResourceHashes[BUILTIN_ENTITY_SOURCE.resourceURL], BUILTIN_ENTITY_SOURCE.resource.sha256);
const results = [];
const receipt = { caseId: "MAP-MIGRATION-2-explicit-machine-suite", contractRevision: `GameSource@1/ki-byte-stamp-1/${TRIAL_COMPILER_REVISION}`,
  sourceHashes, resourceHashes, authorResourceHashes, toolHashes: sourceHashes, toolVersion: process.version, fixtureId: BUILTIN_RESOURCES.world.revision,
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
  assert.deepEqual(authorResourceSnapshot(), authorResourceHashes, "author input resource drift invalidates combined receipt");
} catch (error) {
  receipt.result = "source-or-resource-drift"; receipt.validationError = String(error); writeReceipt(); throw error;
}
if (!process.exitCode) receipt.result = "pass-scoped-machine-suite";
receipt.finishedAt = new Date().toISOString();
writeReceipt();
process.stdout.write(JSON.stringify({ result: receipt.result, groups: results.length, goalComplete: false,
  pending: ["final requirement-to-evidence completion and diff/syntax/LSP audit"] }) + "\n");
