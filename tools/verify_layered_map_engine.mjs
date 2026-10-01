// MAP-MIGRATION-2 M-03/M-04: controlled atomic source -> existing compiler,
// immutable service assets -> production fresh prepare, all 20 chapters.
// Inputs: exact service built-in whitelist in editor-local-validation.md;
// outputs: fresh self-owned OS temp store, loopback server and stdout.
// No DOS files, SAVE, IndexedDB, browser profile, shared baseline writes.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startEditorServer } from "./editor_server.mjs";
import { prepareTrialScenario } from "../web/src/content/authoring/trialruntime.js";
import { compileGameSource } from "../web/src/content/authoring/trialcompile.js";
import { scenarioNativeRoadContext } from "../web/src/game/scenarioassembly.js";
import { rebindNativeLegionViews } from "../web/src/game/nativelegions.js";
import { performOriginalRoadAction } from "../web/src/game/navigation/originalroadmovement.js";
const sha = (data) => createHash("sha256").update(data).digest("hex");
const protectedInputs = ["web/mmap_map.bin", "web/road_graph.json", "web/data.json", "web/road_cost.bin", "web/road_offset.json",
  "web/content/builtin/world/world.json", "web/content/builtin/world/roads.json",
  ".dragon-analysis/map-migration/unified-a/unified_mapsource.json"];
const before = protectedInputs.map((path) => sha(readFileSync(path)));
const store = mkdtempSync(join(tmpdir(), "layered-engine-"));
const server = await startEditorServer(0, store);
const base = `http://127.0.0.1:${server.address().port}`;
const originalFetch = globalThis.fetch;
let stage = "copy";
// Avoid reusing an idle undici loopback connection during the deliberately
// heavy full-source integrity checks. This is fixture transport policy,
// not an automatic retry hiding failed rule checks or a server change.
async function call(method, path, body, status = 200) {
  stage = `${method} ${path}`;
  const response = await originalFetch(base + path, { method,
    headers: { "content-type": "application/json", connection: "close" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json();
  assert.equal(response.status, status, `${path}: ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}
async function prepare(pack) {
  const urls = new Set(pack.manifest.assets.map((a) => a.url));
  const requests = [];
  globalThis.fetch = async (url) => {
    assert.ok(urls.has(String(url)), `no old/latest asset fallback ${url}`);
    requests.push(String(url));
    stage = `prepare asset ${url}`;
    return originalFetch(base + url, { headers: { connection: "close" } });
  };
  try {
    const result = await prepareTrialScenario(pack);
    assert.equal(requests.length, 4);
    return result;
  } finally { globalThis.fetch = originalFetch; }
}
function march(prepared) {
  const sc = prepared.scenario;
  const context = scenarioNativeRoadContext(sc);
  const graph = context.roads.originalRoadGraph();
  const edge = graph.edges[0];
  const point = edge.points[2];
  const legion = { slot: 0, generalIdx: 0, status: 0xc1, faction: sc.cities[edge.source].faction,
    x: point.x, y: point.y, roadEdgeOrNode: 0x800, roadPointAddress: 0x2008,
    roadStride: 4, targetNode: edge.target * 8, targetCity: edge.target,
    commandState: 0, occupancyOffset: point.x, occupancyRowParagraph: point.y * 24,
    _markerFrame: 0, contactCounter: 0, moveDelay: 1, movePeriod: 3 };
  sc.nativeLegionSlots.records[0] = legion;
  rebindNativeLegionViews(sc);
  context.movement.writeByte(point.y * 24, point.x, 1);
  assert.equal(performOriginalRoadAction(sc, legion, context), "moved");
  assert.deepEqual([legion.x, legion.y], [252, 9]);
  assert.equal(legion.roadPointAddress, 0x200c);
}
try {
  await call("POST", "/api/copy", { gameId: "layered-engine", kind: "full", ownerId: "test" });
  const draft = await call("GET", "/api/draft?game=layered-engine");
  // Fixture write is directly to this test's private store, NOT an editor
  // permission bypass or a claim that component-definition CRUD is built.
  const layered = structuredClone(draft); // service now copies the already-atomic installed source
  layered.compatibilityAssets = { roadCostHex: readFileSync("web/road_cost.bin").toString("hex"),
    roadOffsetJson: readFileSync("web/road_offset.json", "utf8"),
    sourceRole: "preserved Web legacy assets, not native KI costs" };
  const badCompat = structuredClone(layered);
  badCompat.compatibilityAssets.roadCostHex = "00";
  assert.throws(() => compileGameSource(badCompat, sha), /invalid explicit compatibility/);
  badCompat.compatibilityAssets = { ...layered.compatibilityAssets, roadOffsetJson: "{broken" };
  assert.throws(() => compileGameSource(badCompat, sha), /invalid explicit roadOffset JSON/);
  const draftPath = join(store, "layered-engine", "gamesource.json");
  writeFileSync(draftPath, JSON.stringify(layered));
  const manifest1 = await call("POST", "/api/compile", { gameId: "layered-engine" });
  assert.equal(manifest1.compatibilityAssetMode, "source-explicit");
  for (const [assetId, original] of [["roadCost", "web/road_cost.bin"], ["roadOffset", "web/road_offset.json"]]) {
    stage = `parity ${assetId}`;
    const response = await originalFetch(base + manifest1.assets.find((a) => a.assetId === assetId).url, { headers: { connection: "close" } });
    assert.equal(response.status, 200);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), readFileSync(original), `${assetId} no-edit exact byte parity`);
  }
  const packURL = (revision, chapter) => `/api/trial-pack?game=layered-engine&revision=${revision}&chapter=${encodeURIComponent(chapter)}`;
  assert.equal(layered.chapterOrder.length, 20);
  let chapters = 0;
  for (const chapter of layered.chapterOrder) {
    const pack = await call("GET", packURL("1", chapter));
    const prepared = await prepare(pack);
    assert.equal(prepared.scenario.cities.length, 192);
    assert.equal(prepared.world.terrain.terrainTile(10, 10), 0x14);
    const terrain = scenarioNativeRoadContext(prepared.scenario).terrain;
    assert.equal(terrain.readTile(10, 10), 0x14);
    if (chapters === 1) march(prepared);
    chapters++;
  }
  const chapter = layered.chapterOrder[1];
  const originalPack = await call("GET", packURL("1", chapter));
  const atom = layered.map.decorations.find((d) => d.x === 10 && d.y === 10);
  assert.ok(atom);
  atom.definitionRef = "tile-16";
  // Keep this historical engine probe's owned-file fixture contract.
  // The new workspace/API has separately tested 64 MiB bounded requests.
  layered.localModel.draftRevision = "2";
  writeFileSync(draftPath, JSON.stringify(layered));
  const manifest2 = await call("POST", "/api/compile", { gameId: "layered-engine" });
  assert.notEqual(manifest1.identity.sourceDigest, manifest2.identity.sourceDigest);
  const prepared2 = await prepare(await call("GET", packURL("2", chapter)));
  assert.equal(prepared2.world.terrain.terrainTile(10, 10), 0x10);
  assert.equal(scenarioNativeRoadContext(prepared2.scenario).terrain.readTile(10, 10), 0x10);
  march(prepared2);
  // Old fixed snapshot remains unchanged after saved/compiled atom edit.
  assert.deepEqual(await call("GET", packURL("1", chapter)), originalPack);
  const originalPrepared = await prepare(originalPack);
  assert.equal(originalPrepared.world.terrain.terrainTile(10, 10), 0x14);
  assert.deepEqual(protectedInputs.map((path) => sha(readFileSync(path))), before);
  process.stdout.write(JSON.stringify({ caseId: "M-03-LAYERED-SAME-ENGINE", contractRevision: "GameSource@1/ki-byte-stamp-1",
    fixtureId: "all-original-chapters-in-controlled-atomic-copy", expectedSource: "exact original bytes plus explicit author atom change",
    result: "PASS", chapters, originalNativePoint: [252, 9], editedAtom: [10, 10, 0x14, 0x10],
    sourceHashes: Object.fromEntries(protectedInputs.map((path, i) => [path, before[i]])),
    toolHashes: Object.fromEntries(["verify_layered_map_engine.mjs", "editor_server.mjs",
      "../web/src/content/authoring/atomicmapimport.js", "../web/src/content/authoring/mapcompile.js",
      "../web/src/content/authoring/maplayers.js", "../web/src/content/authoring/trialcompile.js",
      "../web/src/content/authoring/trialruntime.js", "../web/src/game/scenarioassembly.js"].map((path) => [path, sha(readFileSync(new URL(path, import.meta.url)))])),
    nodeVersion: process.version, compatibilityAssetMode: manifest1.compatibilityAssetMode,
    artifactPaths: [".dragon-analysis/map-migration-2/session-evidence/layered-engine-r4.log"],
    coverageLimits: ["All 20 chapters fresh assembly; no whole-campaign or monthly AI proof",
      "Private fixture store write, not component CRUD/auth certification",
      "Original water annotation still pending; synthetic stack tests do not certify original water labels",
      "Formal builtin manifest/App hookup, JSON restore, seasons/DPR/browser are separate pending checks"] }, null, 2) + "\n");
} catch (error) {
  process.stderr.write(JSON.stringify({ caseId: "M-03-LAYERED-SAME-ENGINE", result: "FAIL", stage,
    error: error.message, cause: error.cause?.message }) + "\n");
  throw error;
} finally { globalThis.fetch = originalFetch; server.close(); }
