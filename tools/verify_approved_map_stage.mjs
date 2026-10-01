// Read two explicit approved output directories, pure memory assembly, and
// owned temp negative fixtures. No network/profile/DOS/saves/current Web writes.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { approvedMap, sha } from "./map_display_acceptance.mjs";
import { createContentCatalog } from "../web/src/content/catalog.js";
import { createWorldResources } from "../web/src/game/worldresources.js";
import { createNewGameScenario } from "../web/src/game/world.js";
import { prepareScenario, readSavedAssembly, snapshotScenarioAssembly } from "../web/src/game/scenarioassembly.js";
const root = fileURLToPath(new URL("../", import.meta.url)), rounds = process.argv.slice(2);
assert.equal(rounds.length, 2); assert.notEqual(rounds[0], rounds[1]); for (const r of rounds) assert.match(r, /^explicit-stage-r\d+$/);
const expected = approvedMap(root), sourceHashes = { ...expected.sourceHashes };
function read(p) { const b = readFileSync(join(root, p)); sourceHashes[p] = sha(b); return b; }
function parse(b) { try { return JSON.parse(b.toString()); } catch (cause) { throw new Error("invalid approved stage JSON", { cause }); } }
for (const round of rounds) {
  const base = ".dragon-analysis/map-migration-2/" + round + "/";
  assert.deepEqual(parse(read(base + "package/manifest.json")), expected.manifest);
  assert.deepEqual(read(base + "builtinresources.generated.js"), expected.generated);
  const report = parse(read(base + "stage-report.json")); assert.equal(report.revision, expected.revision);
  assert.deepEqual(report.sourceHashes, expected.sourceHashes); assert.deepEqual(report.toolHashes, expected.toolHashes);
  for (const [p, b] of expected.assets) assert.deepEqual(read(base + "package/" + p), b);
}
const assets = expected.assets, manifest = expected.manifest, world = parse(assets.get("world-definition.json"));
const approvedSource = parse(assets.get("game-source.json")), groups = approvedSource.map.waterGroups;
assert.equal(groups.length, 161); assert.equal(groups.filter((g) => g.showOnMinimap).length, 51);
const content = createContentCatalog(parse(assets.get("catalog.json")), parse(assets.get("data.json"))), resources = createWorldResources(world);
const requests = [], checks = [], fetchBefore = globalThis.fetch;
globalThis.fetch = async (input) => {
  const url = String(input), a = manifest.assets.find((a) => a.url === url);
  assert.ok([world.assets.terrain, world.assets.roadGraph, world.assets.roadCost, world.assets.roadOffset].includes(url) && a);
  requests.push(url); return new Response(assets.get(a.path), { status: 200 });
};
try {
  for (let idx = 0; idx < 20; idx++) {
    const raw = createNewGameScenario(content.chapter(idx).template); raw.player_faction = raw.factions[0].idx;
    const ready = await prepareScenario({ raw, idx, mode: "fresh", content, world: resources }); assert.equal(ready.scenario.cities.length, 192);
    const saved = parse(Buffer.from(JSON.stringify({ state: ready.scenario, webMeta: snapshotScenarioAssembly({ scenario: ready.scenario, scenarioIdx: idx, content, world: resources }) })));
    const restored = await prepareScenario({ raw: saved.state, idx, mode: "restore", content, world: resources, ...readSavedAssembly(saved) });
    assert.deepEqual(snapshotScenarioAssembly({ scenario: restored.scenario, scenarioIdx: idx, content, world: resources }), saved.webMeta);
    checks.push({ idx, result: "fresh-production-JSON-restored" });
  }
} finally { globalThis.fetch = fetchBefore; }
// Real builder fails closed before asset access for forged/incomplete reviews.
const temp = mkdtempSync(join(tmpdir(), "wolong-acceptance-negative-")); mkdirSync(join(temp, "docs/data"), { recursive: true });
const negatives = [{ ...expected.acceptance, decision: "PENDING" }, { ...expected.acceptance, source: "assistant" },
  { ...expected.acceptance, quote: "continue only" }, { ...expected.acceptance, candidateStage: "explicit-stage-r1" },
  { ...expected.acceptance, reviewRound: "old-review" }];
for (const bad of negatives) {
  writeFileSync(join(temp, "docs/data/current-map-display-acceptance.json"), JSON.stringify(bad)); assert.throws(() => approvedMap(temp), /Assertion/);
}
const toolHashes = { ...expected.toolHashes };
for (const p of ["tools/verify_approved_map_stage.mjs", "web/src/game/scenarioassembly.js", "web/src/game/world.js", "web/src/game/worldresources.js", "web/src/content/catalog.js"])
  toolHashes[p] = sha(read(p));
process.stdout.write(JSON.stringify({ caseId: "M-00-06-approved-stage-repro-assembly", contractRevision: "recorded-user-visual-acceptance-1/editor-local-0.6",
  result: "PASS-SCOPED", fixtureId: expected.revision, sourceHashes, toolHashes, toolVersion: process.version,
  expectedSource: "user m1668 exact candidate acceptance plus shared compiler/production assembly", checks, requests, negativeControls: negatives.length,
  assetsIdentical: 38, unchangedImageSourceAndNativeBytes: true, artifactPaths: rounds,
  coverageLimits: "Not installation/browser/CPU/full campaign; changed URI identity does not certify old save compatibility; only owned temp/memory" }, null, 2) + "\n");
