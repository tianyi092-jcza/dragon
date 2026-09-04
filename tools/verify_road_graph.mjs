import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

let graph;
try {
  graph = JSON.parse(
    await readFile(new URL("../web/road_graph.json", import.meta.url)),
  );
} catch (error) {
  throw new Error("cannot load generated road graph", { cause: error });
}
globalThis.fetch = async () => ({
  ok: true,
  json: async () => graph,
});

const { findRoadRoute, loadRoadGraph, roadNodeAt, roadGraphReady } =
  await import("../web/src/game/roadgraph.js");

await loadRoadGraph();
assert.equal(roadGraphReady(), true);
assert.equal(graph.nodes.length, 192);
assert.equal(graph.edges.length, 254);

for (const edge of graph.edges) {
  const source = graph.nodes[edge.source];
  const target = graph.nodes[edge.target];
  const forward = findRoadRoute(source.x, source.y, target.x, target.y);
  const reverse = findRoadRoute(target.x, target.y, source.x, source.y);
  assert.ok(forward);
  assert.ok(reverse);
  assert.equal(forward.legs.length, forward.edges.length);
  assert.equal(reverse.legs.length, reverse.edges.length);
  assert.ok(forward.legs.every((leg) => leg.stride === 4 || leg.stride === -4));
  // A direct edge can be longer than an alternate multi-edge route; Dijkstra must
  // never return a route more expensive than that direct edge, and is symmetric.
  assert.ok(forward.distance <= edge.weight + 4);
  assert.equal(reverse.distance, forward.distance);
  assert.notDeepEqual(
    forward.points.at(-1),
    { x: target.x, y: target.y },
    "E717边点列不得包含目标据点节点中心",
  );
  assert.notDeepEqual(
    reverse.points.at(-1),
    { x: source.x, y: source.y },
    "E717反向边点列不得包含源据点节点中心",
  );
}

const first = graph.nodes[0];
assert.equal(roadNodeAt(first.x, first.y)?.id, first.id);
assert.equal(roadNodeAt(-1, -1), null);
assert.deepEqual(findRoadRoute(first.x, first.y, first.x, first.y)?.points, []);
assert.equal(findRoadRoute(-1, -1, first.x, first.y), null);

const last = graph.nodes.at(-1);
const crossGraph = findRoadRoute(first.x, first.y, last.x, last.y);
assert.ok(crossGraph?.edges.length > 0);
assert.notDeepEqual(crossGraph.points.at(-1), { x: last.x, y: last.y });

console.log(
  `road graph OK: ${graph.nodes.length} nodes, ${graph.edges.length} edges, ` +
    `cross-route ${crossGraph.edges.length} edges/${crossGraph.distance} weight`,
);
