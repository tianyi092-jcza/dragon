// E-03-ROAD-LOOP: isolated service snapshot -> real native point action.
// I/O allowlist: built-in JSON/terrain listed in docs/editor-local-validation.md,
// this service's loopback HTTP, fresh OS temp store. No DOS/profile/save access.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startEditorServer, EDITOR_BUILD_FORMAT } from "./editor_server.mjs";
import { composeMapLayers } from "../web/src/content/authoring/maplayers.js";
import { compileTrialSource } from "../web/src/content/authoring/trialcompile.js";
import { buildRoad } from "../web/src/content/authoring/roadedit.js";
import { prepareTrialScenario } from "../web/src/content/authoring/trialruntime.js";
import { TRIAL_COMPILER_REVISION } from "../web/src/content/authoring/trialcompile.js";
import { scenarioNativeRoadContext } from "../web/src/game/scenarioassembly.js";
import { rebindNativeLegionViews } from "../web/src/game/nativelegions.js";
import { performOriginalRoadAction } from "../web/src/game/navigation/originalroadmovement.js";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sources = ["web/data.json", "web/content/builtin/world/world.json", "web/content/builtin/world/roads.json",
  "web/road_graph.json", "web/mmap_map.bin", ".dragon-analysis/map-migration/unified-a/unified_mapsource.json"];
const fingerprints = sources.map((path) => sha(readFileSync(path)));
const store = mkdtempSync(join(tmpdir(), "editor-road-loop-"));
const server = await startEditorServer(0, store);
const base = `http://127.0.0.1:${server.address().port}`;
const originalFetch = globalThis.fetch;
async function call(method, path, body, expected = 200) {
  const res = await originalFetch(base + path, { method,
    headers: { "content-type": "application/json", connection: "close" },
    body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json();
  assert.equal(res.status, expected, `${method} ${path}: ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}
async function prepare(pack, beforeFetch = async () => {}) {
  const allowed = new Set(pack.manifest.assets.map((a) => a.url));
  const requested = [];
  globalThis.fetch = async (url) => {
    assert(allowed.has(String(url)), `no built-in/latest resource fallback: ${url}`);
    requested.push(String(url));
    await beforeFetch(String(url));
    return originalFetch(base + url, { headers: { connection: "close" } });
  };
  try {
    const prepared = await prepareTrialScenario(pack);
    assert.equal(requested.length, 4);
    return prepared;
  } finally { globalThis.fetch = originalFetch; }
}
function march(prepared, expected) {
  const sc = prepared.scenario;
  const context = scenarioNativeRoadContext(sc);
  const graph = context.roads.originalRoadGraph();
  const edge = graph.edges[0];
  const point = edge.points[2];
  // Explicit test-only active slot placed inside the road. No new chapter
  // initializer or artificial rule formula; movement executes the real API.
  const legion = { slot: 0, generalIdx: 0, status: 0xc1, faction: sc.cities[edge.source].faction,
    x: point.x, y: point.y, roadEdgeOrNode: 0x800, roadPointAddress: 0x2008,
    roadStride: 4, targetNode: edge.target * 8, targetCity: edge.target,
    commandState: 0, occupancyOffset: point.x, occupancyRowParagraph: point.y * 24,
    _markerFrame: 0, contactCounter: 0, moveDelay: 1, movePeriod: 3 };
  sc.nativeLegionSlots.records[0] = legion;
  rebindNativeLegionViews(sc);
  context.movement.writeByte(point.y * 24, point.x, 1);
  assert.equal(performOriginalRoadAction(sc, legion, context), "moved");
  assert.deepEqual([legion.x, legion.y], expected, "native 2708 commits compiled candidate, not original point");
  assert.equal(legion.roadPointAddress, 0x200c);
  assert.equal(context.movement.readByte(expected[1] * 24, expected[0]), 1);
  return graph;
}
try {
  await call("POST", "/api/copy", { gameId: "road-loop", ownerId: "admin-1", kind: "full" });
  const draft = await call("GET", "/api/draft?game=road-loop");
  const originalMap = structuredClone(draft.map);
  const reversed = structuredClone(draft);
  reversed.map.placements = reversed.map.placements.toReversed();
  assert.deepEqual(compileTrialSource(reversed, sha).roadGraph, compileTrialSource(draft, sha).roadGraph,
    "placement ordering never changes native city slots");
  await call("POST", "/api/compile", { gameId: draft.gameId });
  const chapter = draft.chapterOrder[1];
  const packURL = (rev) => `/api/trial-pack?game=road-loop&revision=${rev}&chapter=${encodeURIComponent(chapter)}`;
  const pack1 = await call("GET", packURL("1"));
  let baseline;
  try { baseline = JSON.parse(readFileSync("web/content/builtin/world/roads.json", "utf-8")); }
  catch (error) { throw new Error("cannot load fixed road baseline", { cause: error }); }
  assert.deepEqual(march(await prepare(pack1), [252, 9]), baseline,
    "unmodified compilation is exactly the baseline v2 graph");

  const road = draft.map.roads[0];
  assert.deepEqual(road.geometry[3], { x: 252, y: 9 });
  const geometry = structuredClone(road.geometry);
  geometry[3] = { x: 252, y: 10 };
  // Author explicitly chooses restored underlay and new constructible tile.
  draft.map.base.terrainRef[9 * 384 + 252] = 0x10;
  draft.map.base.terrainRef[10 * 384 + 252] = 0xc8;
  // Current copy is already layered. Move its actual road stamp with the
  // authored point; changing a covered base alone would be a false edit.
  road.components[3].x = 252; road.components[3].y = 10;
  const plane = composeMapLayers(draft).terrain;
  const rebuilt = buildRoad({ ...road, geometry,
    cities: new Map(draft.map.placements.map((p) => [p.cityId, p])),
    roads: draft.map.roads.slice(1), tiles: (x, y) => plane[y * 384 + x] });
  draft.map.roads[0] = { ...rebuilt, id: road.id, components: road.components };
  assert.equal((await call("POST", "/api/save", { gameId: draft.gameId, map: draft.map })).draftRevision, "2");
  const manifest2 = await call("POST", "/api/compile", { gameId: draft.gameId });
  assert.deepEqual(await call("POST", "/api/compile", { gameId: draft.gameId }), manifest2, "recompile preserves immutable manifest");
  const pack2 = await call("GET", packURL("2"));
  assert.notEqual(pack2.manifest.identity.sourceDigest, pack1.manifest.identity.sourceDigest);
  const edited = await prepare(pack2);
  march(edited, [252, 10]);
  assert.equal(edited.world.terrain.terrainTile(252, 10), 0xc8);
  assert.equal(edited.content.id, draft.gameId);
  assert.equal(edited.world.definition.revision, manifest2.identity.sourceDigest);

  // Delay revision-2 road fetch until after revision-3 has been saved AND
  // compiled. The old snapshot still supplies chapter/terrain/roads together.
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let started;
  const waiting = new Promise((resolve) => { started = resolve; });
  const delayed = prepare(pack2, async (url) => {
    if (url.includes("asset=roadGraph")) { started(); await gate; }
  });
  await waiting;
  await call("POST", "/api/save", { gameId: draft.gameId, map: originalMap });
  await call("POST", "/api/compile", { gameId: draft.gameId });
  release();
  march(await delayed, [252, 10]);
  const pack3 = await call("GET", packURL("3"));
  march(await prepare(pack3), [252, 9]);
  assert.deepEqual(await call("GET", packURL("2")), pack2, "old pack never reads latest draft");

  const bad = structuredClone(originalMap);
  bad.roads[0].geometry[3] = { x: 200, y: 9 };
  await call("POST", "/api/save", { gameId: draft.gameId, map: bad });
  const blocked = await call("POST", "/api/compile", { gameId: draft.gameId }, 400);
  assert.match(blocked.error, /adjacent/);
  await call("GET", packURL("4"), undefined, 400);
  await call("GET", `/api/trial-asset?game=road-loop&revision=2&asset=roadGraph&digest=wrong`, undefined, 400);
  await call("POST", "/api/copy", { gameId: draft.gameId, kind: "full" }, 400);
  const stale = structuredClone(originalMap);
  stale.roads[0].nativeBinding.weight++;
  await call("POST", "/api/save", { gameId: draft.gameId, map: stale });
  assert.match((await call("POST", "/api/compile", { gameId: draft.gameId }, 400)).error, /stale native/);
  const cut = structuredClone(originalMap);
  const removed = cut.roads.shift(), removedIds = new Set(removed.components.map((d) => d.id));
  // Explicit fixture replacement, not inferred hidden terrain: isolate the
  // existing chapter-topology refusal after a structurally valid removal.
  for (const d of removed.components) cut.base.terrainRef[d.y * 384 + d.x] = 0x10;
  cut.waterGroups = cut.waterGroups.map((g) => ({ ...g, memberIds: g.memberIds.filter((id) => !removedIds.has(id)) })).filter((g) => g.memberIds.length || g.baseCells.length);
  await call("POST", "/api/save", { gameId: draft.gameId, map: cut });
  assert.match((await call("POST", "/api/compile", { gameId: draft.gameId }, 400)).error, /unsupported chapter topology/);
  // Asset corruption is an integrity failure, not a built-in fallback.
  const path = join(store, draft.gameId, "build", "2", TRIAL_COMPILER_REVISION, EDITOR_BUILD_FORMAT, "roads.json");
  const bytes = readFileSync(path);
  writeFileSync(path, "{}");
  assert.match((await call("GET", packURL("2"), undefined, 400)).error, /integrity/);
  writeFileSync(path, bytes);
  assert.deepEqual(sources.map((path) => sha(readFileSync(path))), fingerprints, "original sources unchanged");
  process.stdout.write("E-03 road loop OK: unchanged v2 parity; real bent point committed; fixed revisions/late fetch; bad/stale/corrupt assets refused; originals unchanged\n");
} finally { globalThis.fetch = originalFetch; server.close(); }
