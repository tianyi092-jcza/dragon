// Pure record/reciprocity controls, not KI-generated maps or queue-bound proofs.
// No files, saves, browser or network. The production graph is not installed here.
import assert from "node:assert/strict";
import test from "node:test";
import {
  createOriginalRoadMemory,
  createCheckedOriginalRoadMemory,
} from "../web/src/game/navigation/originalroadmemory.js";

function graphFixture() {
  const nodes = Array.from({ length: 192 }, (_, id) => ({ id, edgeSlots: [] }));
  const edges = nodes.map((_, id) => {
    const target = (id + 1) % nodes.length;
    const pointer = 0x800 + id * 16;
    nodes[id].edgeSlots.push(pointer | 0x4000);
    nodes[target].edgeSlots.push(pointer | 0x8000);
    return {
      id,
      source: id,
      target,
      weight: 1,
      bounds: { minX: 382, maxX: 383, minY: 255, maxY: 255 },
      points: [
        { x: 382, y: 255, flags: 0x44 },
        { x: 383, y: 255, flags: 4 },
      ],
    };
  });
  for (const node of nodes)
    while (node.edgeSlots.length < 4) node.edgeSlots.push(0);
  return { version: 2, nodes, edges };
}
const wordAt = (memory, address) =>
  memory.readByte(address) | (memory.readByte(address + 1) << 8);

// First prove that tests cannot rely on the permissive codec to check topology.
test("plain codec preserves a dangling tag; checked construction rejects the asset", () => {
  const graph = graphFixture();
  graph.nodes[0].edgeSlots[0] = 0x4001;
  assert.equal(wordAt(createOriginalRoadMemory(graph), 0), 0x4001);
  assert.throws(() => createCheckedOriginalRoadMemory(graph), /edge pointer/);
});

test("checked construction preserves zeros, raw slot order and all low-half bytes", () => {
  const graph = graphFixture();
  graph.nodes[0].edgeSlots = [
    0,
    graph.nodes[0].edgeSlots[1],
    0,
    graph.nodes[0].edgeSlots[0],
  ];
  graph.edges[0].weight = 0;
  graph.edges[0].points[0].flags = 0xa5; // Storage value, not an E961 semantic claim.
  const before = JSON.stringify(graph);
  const plain = createOriginalRoadMemory(graph);
  const checked = createCheckedOriginalRoadMemory(graph);
  assert.equal(JSON.stringify(graph), before);
  for (let address = 0; address < 0x8000; address++) {
    assert.equal(checked.readByte(address), plain.readByte(address));
  }
  assert.deepEqual(
    [0, 2, 4, 6].map((offset) => wordAt(checked, offset)),
    graph.nodes[0].edgeSlots,
  );
  assert.equal(wordAt(checked, 0x2000), 382);
  assert.equal(wordAt(checked, 0x2004), 383);
  assert.throws(() => checked.readByte(0x8000), /Unprovided/);
  assert.throws(() => checked.readByte(0x8800), /Unprovided/);
});

test("bad selectors and dangling/misaligned edge addresses are format errors", () => {
  for (const [tag, message] of [
    [0x0800, /tag selector/],
    [0xc800, /tag selector/],
    [0x47f0, /edge pointer/],
    [0x4801, /edge pointer/],
    [0x5400, /edge pointer/],
  ]) {
    const graph = graphFixture();
    graph.nodes[0].edgeSlots[0] = tag;
    assert.throws(() => createCheckedOriginalRoadMemory(graph), message);
  }
});

test("each edge has one correctly owned source tag and one target tag", () => {
  const cases = [
    [
      (g) => {
        g.nodes[0].edgeSlots[0] = 0x8800;
      },
      /tag endpoint/,
    ],
    [
      (g) => {
        g.nodes[2].edgeSlots[2] = 0x4800;
      },
      /tag endpoint/,
    ],
    [
      (g) => {
        g.nodes[0].edgeSlots[2] = 0x4800;
      },
      /duplicate.*tag/,
    ],
    [
      (g) => {
        g.nodes[1].edgeSlots[1] = 0x8800;
      },
      /duplicate.*tag/,
    ],
    [
      (g) => {
        g.nodes[0].edgeSlots[0] = 0;
      },
      /missing.*tag/,
    ],
    [
      (g) => {
        g.nodes[1].edgeSlots[0] = 0;
      },
      /missing.*tag/,
    ],
    [
      (g) => {
        g.edges[0].target = 0;
      },
      /self-loop/,
    ],
  ];
  for (const [invalidate, message] of cases) {
    const graph = graphFixture();
    invalidate(graph);
    assert.throws(() => createCheckedOriginalRoadMemory(graph), message);
  }
});

test("initial topology validation is neither a connectivity proof nor a persistent write guard", () => {
  const graph = graphFixture();
  // Slot 2 remains isolated; remove both tags of its two edges, not just one side.
  graph.edges = [graph.edges[0]];
  for (const node of graph.nodes) node.edgeSlots = [0, 0, 0, 0];
  graph.nodes[0].edgeSlots[0] = 0x4800;
  graph.nodes[1].edgeSlots[0] = 0x8800;
  const memory = createCheckedOriginalRoadMemory(graph);
  const original = wordAt(memory, 0);
  graph.nodes[0].edgeSlots[0] = 0;
  graph.edges[0].points[0].x = 1;
  assert.equal(wordAt(memory, 0), original);
  assert.equal(wordAt(memory, 0x2000), 382);
  memory.writeByte(0x8800, 0);
  assert.equal(memory.readByte(0x8800), 0);
  assert.throws(() => memory.readByte(0x8801), /Unprovided/);
  // The rule memory remains explicitly mutable, just like the underlying codec.
  memory.writeByte(0, 7);
  assert.equal(memory.readByte(0), 7);
});
