// MAP-MIGRATION-2 resource admission/retry; no search formula assertion.
// Fixed Web read whitelist; mock fetch cannot forward to network.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createWorldResources } from "../web/src/game/worldresources.js";
import { DEFAULT_WORLD } from "../web/src/content/worlddefinition.js";
const sourceHashes = {};
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
function read(path) { const bytes = readFileSync(new URL(`../${path}`, import.meta.url)); sourceHashes[path] = sha(bytes); return bytes; }
const plane = read("web/mmap_map.bin");
const cost = read("web/road_cost.bin");
const offsets = read("web/road_offset.json");
const graph = read("web/road_graph.json");
const originalFetch = globalThis.fetch;
const checks = [];
try {
  for (const fault of ["http", "json", "length", "offset-shape", "graph-http"]) {
    const prefix = `https://fixture.invalid/${fault}/`;
    const calls = new Map();
    globalThis.fetch = async (input) => {
      const url = String(input);
      assert.ok(url.startsWith(prefix), "fixture never forwards");
      const key = url.slice(prefix.length);
      assert.ok(["terrain", "cost", "offset", "graph"].includes(key));
      const n = (calls.get(key) ?? 0) + 1; calls.set(key, n);
      if (n === 1 && ((fault === "http" && key === "terrain") || (fault === "graph-http" && key === "graph"))) return new Response("{}", { status: 503 });
      if (n === 1 && key === "offset" && fault === "json") return new Response("broken JSON");
      if (n === 1 && key === "offset" && fault === "offset-shape") return new Response('{"16":[null,0]}');
      if (n === 1 && key === "cost" && fault === "length") return new Response(new Uint8Array([1]));
      return new Response({ terrain: plane, cost, offset: offsets, graph }[key]);
    };
    const world = createWorldResources({ ...DEFAULT_WORLD, id: `retry-${fault}`, assets: { ...DEFAULT_WORLD.assets,
      terrain: prefix + "terrain", roadCost: prefix + "cost", roadOffset: prefix + "offset", roadGraph: prefix + "graph" } });
    assert.equal(calls.size, 0, "construction lazy");
    await assert.rejects(world.terrain.loadTerrain());
    assert.equal(world.terrain.terrainTile(0, 0), null, "failure cannot install partial terrain");
    const pass = cost.findIndex((byte) => byte !== 0);
    assert.equal(world.terrain.passable(pass % 384, Math.floor(pass / 384)), false, "failure cannot install partial cost");
    const before = new Map(calls);
    const [a, b] = await Promise.all([world.terrain.loadTerrain(), world.terrain.loadTerrain()]);
    assert.deepEqual(Buffer.from(a), plane); assert.deepEqual(Buffer.from(b), plane);
    assert.notEqual(a, b, "mutable callers never alias resource plane");
    for (const key of ["terrain", "cost", "offset"]) assert.equal(calls.get(key), before.get(key) + 1, "retry single-flight");
    a[0] ^= 255;
    assert.equal(world.terrain.terrainTile(0, 0), plane[0]);
    const cell = plane.indexOf(16);
    assert.deepEqual(world.terrain.roadOffset(cell % 384, Math.floor(cell / 384)), [1, 0]);
    assert.throws(() => { world.terrain.roadOffset(cell % 384, Math.floor(cell / 384))[0] = 99; }, TypeError);
    const cached = new Map(calls);
    await world.terrain.loadTerrain();
    assert.deepEqual(calls, cached, "successful resource remains cached");
    checks.push(`${fault}: fail closed without partial terrain/cost; retry single-flight succeeds, returned plane isolated, offsets read-only`);
  }
} finally { globalThis.fetch = originalFetch; }
const toolHashes = Object.fromEntries(["tools/verify_world_asset_retry.mjs", "web/src/game/worldresources.js", "web/src/game/navigation/pathfinder.js",
  "web/src/game/navigation/roadgraph.js", "web/src/content/worlddefinition.js"].map((path) => [path, sha(readFileSync(new URL(`../${path}`, import.meta.url)))]));
process.stdout.write(JSON.stringify({ caseId: "M-05-WORLD-ASSET-RETRY", result: "PASS", contractRevision: "RuntimeManifest@1",
  fixtureId: "fixed-Web-v2-inputs-and-failing-Response-mocks", expectedSource: "resource admission/cache engineering contract, not KI rule mechanism",
  checks, sourceHashes, toolHashes, nodeVersion: process.version,
  artifactPaths: [".dragon-analysis/map-migration-2/session-evidence/world-retry-r1.log"],
  coverageLimits: ["Pure mocked transport, no browser/Image/HTTP/profile/IDB/SAVE", "No search algorithm, native RNG, city table or Scenario mutation",
    "Graph can be independently cached after valid admission; no playable Scenario is assembled by this test"] }, null, 2) + "\n");
