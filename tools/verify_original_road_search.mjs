// Pure-memory tests; no files, original executables, saves, browser or network.
// Goldens: KI 491B..4A7A, march notes §3.5 (static contracts, not DOS runs).
import assert from "node:assert/strict";
import test from "node:test";
import { searchOriginalRoadMemory } from "../web/src/game/navigation/originalroadsearch.js";
import { retreatOriginalRoadMemory } from "../web/src/game/navigation/originalroadretreat.js";

function fixture(nodes, edges) {
  const graph = new Map();
  const state = new Map();
  const events = [];
  const reads = [];
  const putWord = (address, value) => {
    graph.set(address, value & 255);
    graph.set(address + 1, value >>> 8);
  };
  for (const [address, tags, owner] of nodes) {
    assert.equal(tags.length, 4);
    tags.forEach((tag, slot) => putWord(address + slot * 2, tag));
    if (owner !== undefined) state.set(address * 4 + 0x841, owner);
  }
  for (const [address, source, target, cost] of edges) {
    graph.set(address + 4, cost);
    putWord(address + 6, source);
    putWord(address + 8, target);
  }
  const readKnown = (memory, address) => {
    assert(memory.has(address), `uncovered byte ${address.toString(16)}`);
    return memory.get(address);
  };
  return {
    graph,
    state,
    events,
    reads,
    run(start, stopB, stopC = stopB, owner = 0) {
      return searchOriginalRoadMemory({
        start,
        stopB,
        stopC,
        owner,
        readGraphByte: (address) => {
          reads.push(address);
          return readKnown(graph, address);
        },
        writeGraphByte: (address, value) => graph.set(address, value),
        readStateByte: (address) => readKnown(state, address),
        observe: (event) => events.push(event),
      });
    },
  };
}

const found = (ax, bx, cx) => ({ ax, bx, cx, cf: false, reason: "found" });
const exhausted = (ax) => ({
  ax,
  bx: 0x800,
  cx: 0,
  cf: true,
  reason: "exhausted",
});

test("491B shortcut preserves the two stop words and performs no memory access", () => {
  const f = fixture([], []);
  assert.deepEqual(f.run(8, 16, 8), {
    ax: 8,
    bx: 16,
    cx: 8,
    cf: true,
    reason: "shortcut",
  });
  assert.equal(f.graph.size, 0);
  assert.equal(f.events.length, 0);
});

test("S1: two-stop ties use the root's tagged-slot order, not stop-parameter order", () => {
  const edges = [
    [0x800, 0, 8, 20],
    [0x810, 0, 16, 3],
    [0x820, 8, 16, 3],
  ];
  for (const reverse of [false, true]) {
    for (const stops of [
      [8, 0],
      [0, 8],
    ]) {
      const f = fixture(
        [
          [0, [0x4810, 0x4800, 0, 0], undefined],
          [8, [0x4820, 0x8800, 0, 0], undefined],
          [16, reverse ? [0x8820, 0x8810, 0, 0] : [0x8810, 0x8820, 0, 0], 0],
        ],
        edges,
      );
      assert.deepEqual(
        f.run(16, ...stops),
        found(4, reverse ? 0x820 : 0x810, 7),
      );
      // 4968 CMP, 496C MOV only for the first smaller value; then 4980.
      assert.equal(f.reads.filter((address) => address === 0x8802).length, 3);
      assert.equal(f.reads.filter((address) => address === 0x880a).length, 1);
    }
  }
});

test("S2: interleaved carry puts newly generated C before the older equal-cost B", () => {
  const f = fixture(
    [
      [0, [0x4800, 0x4810, 0, 0], 0],
      [8, [0x8800, 0x4820, 0, 0], 0],
      [16, [0x8810, 0, 0, 0], undefined],
      [24, [0x8820, 0, 0, 0], undefined],
    ],
    [
      [0x800, 0, 8, 1],
      [0x810, 0, 16, 6],
      [0x820, 8, 24, 1],
    ],
  );
  assert.deepEqual(f.run(0, 16, 24), found(0xfffc, 0x820, 10));
  assert.deepEqual(
    f.events
      .filter((e) => e.kind === "enqueue")
      .map(({ address, node, cost }) => [address, node, cost]),
    [
      [0x8800, 8, 5],
      [0x8808, 16, 10],
      [0x8810, 24, 10],
    ],
  );
  assert.deepEqual(
    f.events.filter((e) => e.kind === "carry"),
    [{ kind: "carry", from: 0x8808, address: 0x8818, node: 16, cost: 10 }],
  );
});

test("S3: distinct edges may enqueue the same node twice", () => {
  const f = fixture(
    [
      [0, [0x4800, 0x4810, 0, 0], 0],
      [8, [0x8800, 0x4820, 0, 0], 0],
      [16, [0x8810, 0x4830, 0, 0], 0],
      [24, [0x8820, 0x8830, 0, 0], undefined],
    ],
    [
      [0x800, 0, 8, 1],
      [0x810, 0, 16, 1],
      [0x820, 8, 24, 1],
      [0x830, 16, 24, 2],
    ],
  );
  assert.deepEqual(f.run(0, 24), found(0xfffc, 0x820, 10));
  assert.deepEqual(
    f.events
      .filter((e) => e.kind === "enqueue" && e.node === 24)
      .map((e) => [e.cost, e.edge]),
    [
      [10, 0x820],
      [11, 0x830],
    ],
  );
  assert.equal(f.graph.get(0x8018), 1);
  assert.equal(f.graph.get(0x801a), 1);
});

test("S4: exhausted returns CX=0 and last min; isolated root returns AX=0", () => {
  const f = fixture(
    [
      [0, [0x4800, 0, 0, 0], 0],
      [8, [0x8800, 0, 0, 0], 0],
      [16, [0, 0, 0, 0], 0],
    ],
    [[0x800, 0, 8, 1]],
  );
  assert.deepEqual(f.run(0, 16), exhausted(5));
  f.graph.set(0x8bff, 0xa5); // Explicit old byte; no implicit queue zero fill.
  f.events.length = 0;
  assert.deepEqual(f.run(16, 0), exhausted(0));
  assert.equal(f.graph.get(0x8bff), 0xa5);
  assert.equal(
    f.events.filter((e) => e.kind === "write" && e.address >= 0x8800).length,
    0,
  );
  assert.equal(
    f.events.filter((e) => e.kind === "write" && e.width === 2).length,
    1024,
  );
});

function chain(length, cost, owner) {
  const nodes = [];
  const edges = [];
  for (let i = 0; i <= length; i++) {
    nodes.push([
      i * 8,
      [
        i === 0 ? 0 : 0x8800 + (i - 1) * 16,
        i === length ? 0 : 0x4800 + i * 16,
        0,
        0,
      ],
      owner,
    ]);
    if (i < length) edges.push([0x800 + i * 16, i * 8, (i + 1) * 8, cost]);
  }
  return fixture(nodes, edges);
}

test("S5: 130-node chain wraps 8BF8 to 8800 without clearing old queue bytes", () => {
  const f = chain(129, 1, 0);
  assert.deepEqual(f.run(0, 0x408), found(0xfffc, 0x1000, 0x285));
  const entries = f.events.filter((e) => e.kind === "enqueue");
  assert.deepEqual(
    entries.slice(-2).map((e) => [e.address, e.node]),
    [
      [0x8bf8, 0x400],
      [0x8800, 0x408],
    ],
  );
  assert.deepEqual(f.run(0, 0x410), exhausted(0x285));
});

test("49D5: non-own ADD A6 then OR 8000, including word carry, is not ADD 80A6", () => {
  const short = chain(2, 1, 1);
  assert.deepEqual(short.run(0, 16), found(0xfffc, 0x810, 0x8156));
  const long = chain(78, 255, 1);
  assert.deepEqual(long.run(0, 78 * 8), found(0xfffc, 0xcd0, 0x817e));
});

test("49C3: a supplied non-city node >=600 has no owner lookup or +4 fee", () => {
  const f = fixture(
    [
      [0x600, [0x4800, 0, 0, 0], undefined],
      [0x608, [0x8800, 0, 0, 0], undefined],
    ],
    [[0x800, 0x600, 0x608, 1]],
  );
  assert.deepEqual(f.run(0x600, 0x608), found(0xfffc, 0x800, 1));
  assert.deepEqual(
    f.reads.filter((address) => address === 0x8802 || address === 0x8803),
    [
      0x8802,
      0x8803, // 4968 CMP
      0x8802,
      0x8803, // 496C MOV (strictly smaller)
      0x8802,
      0x8803, // 4980 input item cost
    ],
  );
});

test("4A43 uncovered reciprocal scan throws with earlier writes preserved, not blocked", () => {
  const f = fixture(
    [
      [0, [0x4800, 0, 0, 0], 0],
      [8, [0, 0, 0, 0], undefined], // Explicitly malformed graph, not a normal-map claim.
    ],
    [[0x800, 0, 8, 1]],
  );
  assert.throws(() => f.run(0, 24), /uncovered byte 10/);
  assert.equal(f.graph.get(0x8000), 1);
  assert.equal(f.graph.has(0x8800), false);
});

// Indexed 47BB search contract: same 3-node chain shape at slots 198..200.
// The legacy run below pins the shape; the indexed runs prove slot decode,
// the live bound gate, and that no D52 address read fires.
function highChain(base) {
  const graph = new Map();
  const putWord = (address, value) => {
    graph.set(address, value & 255);
    graph.set(address + 1, value >>> 8);
  };
  const tags = [
    [0, 0x4800, 0, 0],
    [0x8800, 0x4810, 0, 0],
    [0x8810, 0, 0, 0],
  ];
  for (let i = 0; i <= 2; i++) {
    tags[i].forEach((tag, slot) => putWord((base + i) * 8 + slot * 2, tag));
    if (i < 2) {
      putWord(0x800 + i * 16 + 6, (base + i) * 8);
      putWord(0x800 + i * 16 + 8, (base + i + 1) * 8);
      graph.set(0x800 + i * 16 + 4, 1);
    }
  }
  return graph;
}

test("indexed search reads high city slots via node decode under a live bound", () => {
  // Shape pin on the legacy contract at slots 0..2.
  const low = fixture(
    [
      [0, [0, 0x4800, 0, 0], 0],
      [8, [0x8800, 0x4810, 0, 0], 0],
      [16, [0x8810, 0, 0, 0], 0],
    ],
    [
      [0x800, 0, 8, 1],
      [0x810, 8, 16, 1],
    ],
  );
  assert.deepEqual(low.run(0, 16), found(0xfffc, 0x810, 10));
  // Same shape at slots 198..200, indexed reads, live bound 201*8.
  const graph = highChain(198);
  const nodeReads = [];
  const runIndexed = (bound) =>
    searchOriginalRoadMemory({
      start: 198 * 8,
      stopB: 200 * 8,
      stopC: 200 * 8,
      owner: 0,
      readGraphByte: (address) => {
        assert(graph.has(address), `uncovered byte ${address.toString(16)}`);
        return graph.get(address);
      },
      writeGraphByte: (address, value) => graph.set(address, value),
      readStateByte: () => {
        throw new Error("legacy address read must not fire");
      },
      readCityOwnerAtNode: (node, at) => {
        nodeReads.push([node, at]);
        return 0;
      },
      cityNodeBound: bound,
    });
  assert.deepEqual(runIndexed(201 * 8), found(0xfffc, 0x810, 10));
  // Start and middle cities are read; the stop returns before its fee read.
  assert.deepEqual(nodeReads, [
    [198 * 8, "city owner"],
    [199 * 8, "city owner"],
  ]);
  // The legacy 0x600 bound gates the same high nodes out of the fee path.
  nodeReads.length = 0;
  assert.deepEqual(runIndexed(0x600), found(0xfffc, 0x810, 2));
  assert.deepEqual(nodeReads, []);
});

test("487B indexed plumbing reaches found through high slots without address reads", () => {
  const graph = highChain(198);
  const nodeReads = [];
  const result = retreatOriginalRoadMemory({
    readFactionByte: () => 0,
    readCapitalByte: () => 198,
    readCurrentWord: () => 200 * 8,
    readGraphByte: (address) => {
      assert(graph.has(address), `uncovered byte ${address.toString(16)}`);
      return graph.get(address);
    },
    writeGraphByte: (address, value) => graph.set(address, value),
    readStateByte: () => {
      throw new Error("legacy address read must not fire");
    },
    readCityOwnerAtNode: (node, at) => {
      nodeReads.push([node, at]);
      return 0;
    },
    cityNodeBound: 201 * 8,
  });
  // word(0x816) is node 199*8; <<2 is the 0x20*slot return bridge.
  assert.deepEqual(result, {
    ax: 0xfffc,
    bx: 199 * 32,
    cx: 10,
    cf: false,
    reason: "found",
  });
  assert.deepEqual(nodeReads, [
    [198 * 8, "city owner"],
    [199 * 8, "city owner"],
    [199 * 8, "city owner"],
  ]);
});

test("versioned workspace regions: v3 scratch/queue relocation keeps results", () => {
  const runWith = (regions) => {
    const graph = highChain(0);
    // Beyond the 3-node scratch and never a visited mark for this shape.
    graph.set(0x8018, 0xa5);
    const events = [];
    const result = searchOriginalRoadMemory({
      start: 0,
      stopB: 16,
      stopC: 16,
      owner: 0,
      readGraphByte: (address) => {
        assert(graph.has(address), `uncovered byte ${address.toString(16)}`);
        return graph.get(address);
      },
      writeGraphByte: (address, value) => graph.set(address, value),
      readStateByte: () => 0,
      regions,
      observe: (event) => events.push(event),
    });
    return { result, graph, events };
  };
  const v3 = runWith({ scratchEnd: 0x8000 + 3 * 8, queueBase: 0x9000 });
  assert.deepEqual(v3.result, found(0xfffc, 0x810, 10));
  assert.equal(v3.graph.get(0x8018), 0xa5);
  const queued = v3.events.filter(
    (event) => event.kind === "enqueue" || event.kind === "carry",
  );
  assert.ok(queued.length > 0);
  for (const event of queued) assert.ok(event.address >= 0x9000);
  const v2 = runWith(undefined);
  assert.deepEqual(v2.result, found(0xfffc, 0x810, 10));
  assert.equal(v2.graph.get(0x8018), 0);
  assert.throws(
    () => runWith({ scratchEnd: 0x9000, queueBase: 0x8800 }),
    /search regions/,
  );
});

// Versioned edge-kind marker: nodes 0x7f0/0x7f8/0x800 with edges parked
// at 0x900+. Capital (a DOS byte, 0xff means none) stays 254; node 0x800
// exercises the marker. A v3 edgeBase (0x820) routes it down the city
// path; the legacy 0x800 marker takes the edge branch and fails closed
// at the return bridge.
function edgeParkFixture() {
  const graph = new Map();
  const putWord = (address, value) => {
    graph.set(address, value & 255);
    graph.set(address + 1, value >>> 8);
  };
  putWord(0x7f0, 0);
  putWord(0x7f2, 0x4900);
  putWord(0x7f4, 0);
  putWord(0x7f6, 0);
  putWord(0x7f8, 0x8900);
  putWord(0x7fa, 0x4910);
  putWord(0x7fc, 0);
  putWord(0x7fe, 0);
  putWord(0x800, 0x8910);
  putWord(0x802, 0);
  putWord(0x804, 0);
  putWord(0x806, 0);
  // Padding: the legacy edge branch reads endpoint words at current+6/+8;
  // real RAM returns zeros there, the strict mock needs them supplied.
  putWord(0x808, 0);
  // Edge 0x900: 0x7f0 -> 0x7f8; edge 0x910: 0x7f8 -> 0x800.
  putWord(0x900, 0x2000);
  putWord(0x902, 0x2000);
  graph.set(0x904, 1);
  putWord(0x906, 0x7f0);
  putWord(0x908, 0x7f8);
  putWord(0x910, 0x2000);
  putWord(0x912, 0x2000);
  graph.set(0x914, 1);
  putWord(0x916, 0x7f8);
  putWord(0x918, 0x800);
  return graph;
}

function runRetreatEdge(graph, extra) {
  const nodeReads = [];
  const result = retreatOriginalRoadMemory({
    readFactionByte: () => 0,
    readCapitalByte: () => 254,
    readCurrentWord: () => 0x800,
    readGraphByte: (address) => {
      assert(graph.has(address), `uncovered byte ${address.toString(16)}`);
      return graph.get(address);
    },
    writeGraphByte: (address, value) => graph.set(address, value),
    readStateByte: () => {
      throw new Error("legacy address read must not fire");
    },
    readCityOwnerAtNode: (node, at) => {
      nodeReads.push(node);
      return 0;
    },
    cityNodeBound: 0x1000,
    // v3 workspace: scratch covers the 0x8800 visited flags, queue moved
    // off them to 0x9000. The legacy default keeps the v2 alias.
    regions: { scratchEnd: 0x8820, queueBase: 0x9000 },
    ...extra,
  });
  return { result, nodeReads };
}

test("versioned edge marker: 0x800 is a city under a v3 base, an edge under 0x800", () => {
  const v3 = runRetreatEdge(edgeParkFixture(), { edgeBase: 0x820 });
  assert.deepEqual(v3.result, {
    ax: 0xfffc,
    bx: 0x1fe0,
    cx: 10,
    cf: false,
    reason: "found",
  });
  assert.deepEqual(v3.nodeReads, [0x7f0, 0x7f8, 0x7f8]);
  // Legacy marker takes the edge branch: zero endpoint owners, the search
  // exhausts on the aliased v2 workspace (0x8800 queue alias skips the
  // 0x800 expansion), and the minimum maps through without a stop.
  const v2 = runRetreatEdge(edgeParkFixture(), {
    regions: undefined,
  });
  assert.deepEqual(v2.result, {
    ax: 20,
    bx: 20,
    cx: 0,
    cf: false,
    reason: "exhausted",
  });
  assert.deepEqual(v2.nodeReads, [0, 0, 0x7f0, 0x7f8]);
});
