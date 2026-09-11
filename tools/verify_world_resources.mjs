import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DEFAULT_WORLD } from "../web/src/content/worlddefinition.js";
import {
  createWorldResources,
  defaultWorldResources,
} from "../web/src/game/worldresources.js";

let graph;
try {
  graph = JSON.parse(
    await readFile(new URL("../web/road_graph.json", import.meta.url)),
  );
} catch (error) {
  throw new Error("cannot load Web road fixture", { cause: error });
}
const secondGraph = structuredClone(graph);
secondGraph.nodes[0].x += 1;
const requests = [];
const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = async (url) => {
    requests.push(url);
    const second = url.startsWith("second/");
    if (url.endsWith("roads"))
      return {
        ok: true,
        json: async () => structuredClone(second ? secondGraph : graph),
      };
    if (url.endsWith("offset"))
      return { ok: true, json: async () => ({ [second ? 202 : 95]: [second ? 2 : 1, 0] }) };
    const tile = second ? 202 : 95;
    const cost = second ? 0 : 1;
    const bytes = new Uint8Array(384 * 256).fill(
      url.endsWith("terrain") ? tile : cost,
    );
    return { ok: true, arrayBuffer: async () => bytes.buffer };
  };
  const makeDefinition = (id) => ({
    ...DEFAULT_WORLD,
    id,
    assets: {
      ...DEFAULT_WORLD.assets,
      roadGraph: `${id}/roads`,
      terrain: `${id}/terrain`,
      roadCost: `${id}/cost`,
      roadOffset: `${id}/offset`,
    },
  });
  const first = createWorldResources(makeDefinition("first"));
  const second = createWorldResources(makeDefinition("second"));
  assert.equal(defaultWorldResources.roads.roadGraphReady(), false);
  await first.terrain.loadTerrain();
  assert.equal(first.roads.roadGraphReady(), true);
  assert.equal(second.roads.roadGraphReady(), false);
  await second.terrain.loadTerrain();
  const point = graph.nodes[0];
  assert.equal(first.roads.roadNodeAt(point.x, point.y)?.id, 0);
  assert.equal(second.roads.roadNodeAt(point.x, point.y), null);
  assert.equal(second.roads.roadNodeAt(point.x + 1, point.y)?.id, 0);
  assert.deepEqual(first.terrain.roadOffset(0, 0), [1, 0]);
  assert.deepEqual(second.terrain.roadOffset(0, 0), [2, 0]);
  assert.equal(first.terrain.terrainTile(0, 0), 95);
  assert.equal(second.terrain.terrainTile(0, 0), 202);
  assert.equal(first.terrain.passable(0, 0), true);
  assert.equal(second.terrain.passable(0, 0), false);
  await first.terrain.loadTerrain();
  await first.roads.loadRoadGraph();
  assert.equal(requests.filter((url) => url === "first/roads").length, 1);
  assert.equal(requests.filter((url) => url === "first/terrain").length, 1);
  assert.equal(
    defaultWorldResources.roads.roadGraphReady(),
    false,
    "preview must not install the active world's graph",
  );
  assert.throws(
    () => createWorldResources({ ...DEFAULT_WORLD, width: 768 }),
    /unsupported world/,
  );
} finally {
  globalThis.fetch = originalFetch;
}
process.stdout.write(
  "world resources OK: independent roads, terrain, offsets and caches; default instance untouched\n",
);
