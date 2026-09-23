import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// P68 G8: v1 Dijkstra oracle deleted. This file now pins only the shipped
// graph asset integrity (counts, E717 point shape, 274C tile
// classification) plus node-identity reads. Route search is native
// (47BB/491B via searchOriginalRoadMemory); its coverage lives in the
// native road tests, not here.
let graph;
let terrain;
try {
  graph = JSON.parse(
    await readFile(new URL("../web/road_graph.json", import.meta.url)),
  );
  terrain = new Uint8Array(
    await readFile(new URL("../web/mmap_map.bin", import.meta.url)),
  );
} catch (error) {
  throw new Error("cannot load generated road graph/map", { cause: error });
}
globalThis.fetch = async () => ({
  ok: true,
  json: async () => graph,
});

const { loadRoadGraph, roadNodeAt, roadGraphReady } = await import(
  "../web/src/game/roadgraph.js"
);

await loadRoadGraph();
assert.equal(roadGraphReady(), true);
assert.equal(graph.nodes.length, 192);
assert.equal(graph.edges.length, 254);
assert.equal(terrain.length, 384 * 256);

let cityBoundaryEndpoints = 0;
for (const edge of graph.edges) {
  const source = graph.nodes[edge.source];
  const target = graph.nodes[edge.target];
  assert.ok(source && target, `edge ${edge.id} endpoints must exist`);
  assert.ok(
    Array.isArray(edge.points) && edge.points.length > 0,
    `edge ${edge.id} must carry points`,
  );
  assert.notDeepEqual(
    edge.points.at(-1),
    { x: target.x, y: target.y },
    "E717边点列不得包含目标据点节点中心",
  );
  assert.notDeepEqual(
    edge.points[0],
    { x: source.x, y: source.y },
    "E717边点列不得包含源据点节点中心",
  );
  for (const point of [edge.points[0], edge.points.at(-1)]) {
    const tile = terrain[point.y * 384 + point.x];
    assert.ok(
      tile >= 0xce && tile <= 0xdd,
      "0x274C must classify every edge endpoint point as a city boundary tile",
    );
    cityBoundaryEndpoints++;
  }
  for (const point of edge.points.slice(1, -1)) {
    const tile = terrain[point.y * 384 + point.x];
    assert.ok(
      tile < 0xce || tile > 0xdd,
      "0xCE..0xDD city boundary tiles must occur only at edge point ends",
    );
  }
}
assert.equal(cityBoundaryEndpoints, 508);

const first = graph.nodes[0];
assert.equal(roadNodeAt(first.x, first.y)?.id, first.id);
assert.equal(roadNodeAt(-1, -1), null);

process.stdout.write(
  `road graph OK: ${graph.nodes.length} nodes, ${graph.edges.length} edges, ` +
    `${cityBoundaryEndpoints} city-boundary endpoints ` +
    `(P68 G8: Dijkstra oracle dropped, asset pins kept)\n`,
);
