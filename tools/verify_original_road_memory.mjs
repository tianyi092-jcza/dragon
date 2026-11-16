// Pure, explicitly supplied memory fixtures. No files, browser, saves or network.
// These are codec/search controls, not certificates that these worlds are generated.
import assert from "node:assert/strict";
import test from "node:test";
import {
  createOriginalRoadMemory,
  createCheckedOriginalRoadMemory,
  restoreOriginalRoadMemory,
} from "../web/src/game/navigation/originalroadmemory.js";
import { searchOriginalRoadMemory } from "../web/src/game/navigation/originalroadsearch.js";

function fixture() {
  const nodes = Array.from({ length: 192 }, (_, id) => ({
    id,
    edgeSlots: [0, 0, 0, 0],
  }));
  nodes[0].edgeSlots[0] = 0x4800;
  nodes[1].edgeSlots[0] = 0x8800;
  return {
    version: 2,
    nodes,
    edges: [
      {
        id: 0,
        source: 0,
        target: 1,
        weight: 1,
        bounds: { minX: 2, maxX: 3, minY: 10, maxY: 10 },
        points: [
          { x: 2, y: 10, flags: 0x44 },
          { x: 3, y: 10, flags: 4 },
        ],
      },
    ],
  };
}
const bytesAt = (memory, address, count) =>
  Array.from({ length: count }, (_, i) => memory.readByte(address + i));

test("E49F/E77D: ordered tags, all edge header fields and complete 4-byte points", () => {
  const memory = createOriginalRoadMemory(fixture());
  assert.deepEqual(
    bytesAt(memory, 0, 16),
    [0, 0x48, 0, 0, 0, 0, 0, 0, 0, 0x88, 0, 0, 0, 0, 0, 0],
  );
  assert.deepEqual(
    bytesAt(memory, 0x800, 16),
    [0, 0x20, 4, 0x20, 1, 0, 0, 0, 8, 0, 2, 0, 3, 0, 10, 10],
  );
  assert.deepEqual(bytesAt(memory, 0x2000, 8), [2, 0, 10, 0x44, 3, 0, 10, 4]);
  assert.equal(memory.readByte(0x600), 0);
  assert.equal(memory.readByte(0x1fff), 0);
  assert.equal(memory.readByte(0x7fff), 0);
  assert.throws(
    () => memory.readByte(0x8000),
    /Unprovided original road byte 8000/,
  );
  assert.throws(
    () => memory.readByte(0x8800),
    /Unprovided original road byte 8800/,
  );
});

test("record byte values are preserved, not recomputed from geometry or endpoints", () => {
  const graph = fixture();
  graph.edges[0].weight = 254;
  graph.edges[0].points[0].flags = 0x80;
  const memory = createOriginalRoadMemory(graph);
  assert.equal(memory.readByte(0x804), 254);
  assert.equal(memory.readByte(0x2003), 0x80);
  graph.edges[0].weight = 2;
  assert.equal(
    memory.readByte(0x804),
    254,
    "encoded RAM is not a mutable JSON projection",
  );
});

test("491B initializes only its visited bytes and preserves explicit old queue memory", () => {
  const memory = createOriginalRoadMemory(fixture());
  memory.writeByte(0x8bff, 0xa5);
  for (let pass = 0; pass < 2; pass++) {
    const result = searchOriginalRoadMemory({
      start: 0,
      stopB: 8,
      stopC: 8,
      owner: 0,
      readGraphByte: memory.readByte,
      writeGraphByte: memory.writeByte,
      readStateByte: (address) => {
        assert.equal(address, 0x841);
        return 0;
      },
    });
    assert.deepEqual(result, {
      ax: 0xfffc,
      bx: 0x800,
      cx: 5,
      cf: false,
      reason: "found",
    });
    assert.equal(memory.readByte(0x8000), 1);
    assert.equal(memory.readByte(0x8008), 1);
    assert.equal(memory.readByte(0x87ff), 0);
    assert.equal(memory.readByte(0x8bff), 0xa5);
    assert.throws(() => memory.readByte(0x8808), /Unprovided/);
  }
});

test("missing metadata is rejected rather than silently becoming initialized zero", () => {
  for (const invalidate of [
    (g) => {
      g.version = 1;
    },
    (g) => {
      delete g.nodes[1].edgeSlots;
    },
    (g) => {
      g.nodes[1].edgeSlots.length = 3;
    },
    (g) => {
      delete g.edges[0].points[0].flags;
    },
    (g) => {
      delete g.edges[0].bounds.minY;
    },
    (g) => {
      g.edges[0].weight = 256;
    },
    (g) => {
      g.edges[0].source = 192;
    },
  ]) {
    const graph = fixture();
    invalidate(graph);
    assert.throws(() => createOriginalRoadMemory(graph), TypeError);
  }
});

test("codec profile rejects workspace overlap; explicit writes distinguish known zero", () => {
  const graph = fixture();
  graph.edges[0].points = Array.from({ length: 6145 }, () => ({
    x: 2,
    y: 10,
    flags: 0,
  }));
  assert.throws(
    () => createOriginalRoadMemory(graph),
    /overlap the search workspace/,
  );
  const memory = createOriginalRoadMemory(fixture());
  assert.throws(() => memory.readByte(0xffff), /Unprovided/);
  memory.writeByte(0xffff, 0);
  assert.equal(memory.readByte(0xffff), 0);
  assert.throws(() => memory.writeByte(0xffff, -1), TypeError);
  assert.equal(memory.readByte(0xffff), 0);
  assert.throws(() => memory.readByte(0x10000), TypeError);
});

// M257 v3 (plan §9.10.24 V3-A): node=slot*8 kept, edge base relocated past
// the live node table. v2 bytes stay untouched (pinned above).
function v3Fixture(nodeCount = 257) {
  const nodes = Array.from({ length: nodeCount }, (_, id) => ({
    id,
    edgeSlots: [0, 0, 0, 0],
  }));
  nodes[0].edgeSlots[0] = 0x4810;
  nodes[1].edgeSlots[0] = 0x8810;
  return {
    version: 3,
    nodes,
    edges: [
      {
        id: 0,
        source: 0,
        target: 1,
        weight: 1,
        bounds: { minX: 2, maxX: 3, minY: 10, maxY: 10 },
        points: [{ x: 2, y: 10, flags: 0x44 }],
      },
    ],
  };
}

test("v3 relocates the edge base past 257 nodes; v2 cap and layout untouched", () => {
  const memory = createOriginalRoadMemory(v3Fixture());
  assert.deepEqual(memory.roadLayout, {
    version: 3,
    nodeCount: 257,
    edgeBase: 0x810,
    pointBase: 0x2000,
  });
  // Node 256 base 0x800 is addressable and no longer an edge record.
  assert.deepEqual(bytesAt(memory, 256 * 8, 8), [0, 0, 0, 0, 0, 0, 0, 0]);
  // Edge 0 header at 0x810 with node*8 endpoints.
  assert.deepEqual(bytesAt(memory, 0x810, 10), [0, 0x20, 0, 0x20, 1, 0, 0, 0, 8, 0]);
  assert.deepEqual(bytesAt(memory, 0x2000, 4), [2, 0, 10, 0x44]);
  // v2 layout descriptor and 256-node admission stay as before.
  assert.deepEqual(createOriginalRoadMemory(fixture()).roadLayout, {
    version: 2,
    nodeCount: 192,
    edgeBase: 0x800,
    pointBase: 0x2000,
  });
  assert.throws(() => createOriginalRoadMemory({ ...v3Fixture(), version: 2 }), TypeError);
  assert.throws(() => createOriginalRoadMemory(v3Fixture(513)), TypeError);
  const overflow = v3Fixture();
  overflow.edges = Array.from({ length: 400 }, (_, id) => ({
    ...overflow.edges[0],
    id,
  }));
  assert.throws(() => createOriginalRoadMemory(overflow), /overlap the point region/);
});

test("v3 checked reciprocal tags and checkpoint roundtrip use the relocated base", () => {
  const memory = createCheckedOriginalRoadMemory(v3Fixture());
  assert.equal(memory.readByte(0x816), 0);
  assert.equal(memory.readByte(0x818), 8);
  const bad = v3Fixture();
  bad.edges[0].source = bad.edges[0].target;
  assert.throws(() => createCheckedOriginalRoadMemory(bad), /self-loop/);
  const mismatched = v3Fixture();
  mismatched.nodes[1].edgeSlots[0] = 0x8810;
  mismatched.nodes[2].edgeSlots[1] = 0x8810;
  assert.throws(
    () => createCheckedOriginalRoadMemory(mismatched),
    /endpoint mismatch/,
  );
  const checkpoint = memory.snapshot();
  memory.writeByte(0x9000, 0x5a);
  const restored = restoreOriginalRoadMemory(v3Fixture(), memory.snapshot());
  assert.equal(restored.readByte(0x9000), 0x5a);
  assert.throws(() => restoreOriginalRoadMemory({ ...v3Fixture(), version: 2 }, checkpoint), TypeError);
});
