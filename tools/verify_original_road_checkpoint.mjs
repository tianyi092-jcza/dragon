// Pure in-memory Web checkpoint controls; no files/network/browser/DOS/save I/O.
// Initializer/search contracts: KI E49F, 491B..4A7A; march notes §§3.5–3.6.
// Synthetic input, not a generated world, DOS SAVE or campaign certificate.
import assert from "node:assert/strict";
import test from "node:test";
import {
  createCheckedOriginalRoadMemory,
  restoreOriginalRoadMemory,
} from "../web/src/game/navigation/originalroadmemory.js";
import { searchOriginalRoadMemory } from "../web/src/game/navigation/originalroadsearch.js";

function fixture() {
  // §3.5 S2: new C10 is enqueued before the carried B10, unlike stable PQ order.
  const nodes = Array.from({ length: 192 }, (_, id) => ({
    id,
    edgeSlots: [0, 0, 0, 0],
  }));
  const edges = [
    [0, 1, 1],
    [0, 2, 6],
    [1, 3, 1],
  ].map(([source, target, weight], id) => {
    const pointer = 0x800 + id * 16;
    for (const [node, tag] of [
      [source, 0x4000],
      [target, 0x8000],
    ]) {
      nodes[node].edgeSlots[nodes[node].edgeSlots.indexOf(0)] = pointer | tag;
    }
    return {
      id,
      source,
      target,
      weight,
      bounds: { minX: 2, maxX: 3, minY: 10, maxY: 10 },
      points: [
        { x: 2, y: 10, flags: 0x44 },
        { x: 3, y: 10, flags: 4 },
      ],
    };
  });
  return { version: 2, nodes, edges };
}
function jsonCopy(value) {
  // Exercise the persisted JSON representation, not structuredClone semantics.
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    assert.fail(
      `Synthetic checkpoint is not JSON-serializable: ${error.message}`,
    );
  }
}
const unknown = (memory, address) =>
  assert.throws(
    () => memory.readByte(address),
    /Unprovided original road byte/,
  );

function query(
  memory,
  { start = 0, stopB = 24, stopC = 16, owner = 0, cityOwner = 0 } = {},
) {
  const trace = [];
  const result = searchOriginalRoadMemory({
    start,
    stopB,
    stopC,
    owner,
    readGraphByte: memory.readByte,
    writeGraphByte: memory.writeByte,
    readStateByte: (address) => {
      trace.push({ kind: "city", address });
      return cityOwner;
    },
    observe: (event) => trace.push(event),
  });
  return { result, trace };
}

test("fresh checkpoint binds initial bytes; omitted upper RAM remains unknown", () => {
  const graph = fixture();
  const memory = createCheckedOriginalRoadMemory(graph);
  const snapshot = jsonCopy(memory.snapshot());
  assert.equal(snapshot.version, 1);
  assert.equal(snapshot.initialGraph.length, 0x10000);
  assert.deepEqual(snapshot.patches, []);
  const restored = restoreOriginalRoadMemory(graph, snapshot);
  assert.deepEqual(restored.snapshot(), snapshot);
  for (const address of [0, 0x600, 0x7fff]) {
    assert.equal(restored.readByte(address), memory.readByte(address));
  }
  for (const address of [0x8000, 0x87ff, 0x8800, 0x8bff, 0x8c00, 0xffff]) {
    unknown(restored, address);
    unknown(memory, address);
  }
});

test("roundtrip preserves every byte/unknown bit, lower writes and known upper zeros", () => {
  const graph = fixture();
  const memory = createCheckedOriginalRoadMemory(graph);
  // Full address domain, holes, initialized/unknown boundary, last byte.
  for (let address = 0; address < 0x10000; address += 7) {
    memory.writeByte(address, (address >>> 3) & 0xff);
  }
  for (const address of [0x804, 0x7fff, 0x8000, 0x87ff, 0x8bff, 0xffff]) {
    memory.writeByte(address, 0);
  }
  const restored = restoreOriginalRoadMemory(
    graph,
    jsonCopy(memory.snapshot()),
  );
  for (let address = 0; address < 0x10000; address++) {
    let expected;
    try {
      expected = memory.readByte(address);
    } catch (error) {
      assert.match(error.message, /Unprovided original road byte/);
      unknown(restored, address);
      continue;
    }
    assert.equal(restored.readByte(address), expected, address.toString(16));
  }
  assert.deepEqual(restored.snapshot(), memory.snapshot());
});

test("restore accepts the full 64KiB span and maximum 65536 one-byte ranges", () => {
  const graph = fixture();
  const memory = createCheckedOriginalRoadMemory(graph);
  for (let address = 0; address < 0x10000; address++) {
    memory.writeByte(
      address,
      address < 0x8000 ? memory.readByte(address) ^ 0xff : address & 0xff,
    );
  }
  const checkpoint = jsonCopy(memory.snapshot());
  assert.equal(checkpoint.patches.length, 1);
  assert.equal(checkpoint.patches[0].address, 0);
  assert.equal(checkpoint.patches[0].hex.length, 0x20000);
  assert.deepEqual(
    restoreOriginalRoadMemory(graph, checkpoint).snapshot(),
    checkpoint,
  );
  const fragmented = {
    ...checkpoint,
    patches: Array.from({ length: 0x10000 }, (_, address) => ({
      address,
      hex: checkpoint.patches[0].hex.slice(address * 2, address * 2 + 2),
    })),
  };
  assert.deepEqual(
    restoreOriginalRoadMemory(graph, fragmented).snapshot(),
    checkpoint,
  );
});

test("patches coalesce adjacent changes, omit reverted initial bytes, retain known zero", () => {
  const memory = createCheckedOriginalRoadMemory(fixture());
  memory.writeByte(0x804, 99);
  memory.writeByte(0x804, 1);
  memory.writeByte(0x7fff, 1);
  memory.writeByte(0x8000, 0);
  memory.writeByte(0x8002, 0);
  memory.writeByte(0xffff, 0);
  const snapshot = memory.snapshot();
  assert.deepEqual(snapshot.patches, [
    { address: 0x7fff, hex: "0100" },
    { address: 0x8002, hex: "00" },
    { address: 0xffff, hex: "00" },
  ]);
  const restored = restoreOriginalRoadMemory(fixture(), snapshot);
  unknown(restored, 0x8001);
  assert.equal(restored.readByte(0xffff), 0);
});

test("graph byte identity rejects same-version changed assets, not mutable object labels", () => {
  const graph = fixture();
  const memory = createCheckedOriginalRoadMemory(graph);
  const snapshot = jsonCopy(memory.snapshot());
  for (const change of [
    (g) => {
      g.edges[0].weight++;
    },
    (g) => {
      g.edges[0].points[0].flags ^= 1;
    },
    (g) => {
      g.nodes[0].edgeSlots = g.nodes[0].edgeSlots.toReversed();
    },
    (g) => {
      g.edges[0].bounds.minX++;
    },
  ]) {
    const different = jsonCopy(graph);
    change(different);
    assert.throws(
      () => restoreOriginalRoadMemory(different, snapshot),
      /mismatched/,
    );
  }
  graph.edges[0].weight = 77;
  assert.deepEqual(
    memory.snapshot(),
    snapshot,
    "initial identity captured at construction",
  );
  assert.equal(memory.readByte(0x804), 1);
  // Graph RAM identity is NOT full-world identity (city coordinates live elsewhere).
  const sameBytes = fixture();
  sameBytes.nodes[0].x = 99;
  assert.deepEqual(
    restoreOriginalRoadMemory(sameBytes, snapshot).snapshot(),
    snapshot,
  );
});

test("restoration rechecks initial reciprocity but does not rewrite live lower-half patches", () => {
  const graph = fixture();
  const memory = createCheckedOriginalRoadMemory(graph);
  memory.writeByte(0, 1); // Explicit runtime write, not a generated-map claim.
  const snapshot = memory.snapshot();
  assert.equal(restoreOriginalRoadMemory(graph, snapshot).readByte(0), 1);
  graph.nodes[0].edgeSlots[0] = 0;
  assert.throws(
    () => restoreOriginalRoadMemory(graph, snapshot),
    /missing endpoint tag/,
  );
});

test("snapshots and restored instances do not alias each other or the live memory", () => {
  const graph = fixture();
  const memory = createCheckedOriginalRoadMemory(graph);
  memory.writeByte(0x8bff, 0xa5);
  const checkpoint = memory.snapshot();
  const restored = restoreOriginalRoadMemory(graph, checkpoint);
  checkpoint.patches[0].hex = "00";
  memory.writeByte(0x8bff, 0xbb);
  restored.writeByte(0x8000, 0x55);
  assert.equal(restored.readByte(0x8bff), 0xa5);
  assert.equal(memory.readByte(0x8bff), 0xbb);
  unknown(memory, 0x8000);
  unknown(createCheckedOriginalRoadMemory(graph), 0x8bff);
});

test("malformed checkpoints fail without changing an existing memory or their input", () => {
  const graph = fixture();
  const memory = createCheckedOriginalRoadMemory(graph);
  memory.writeByte(0x8bff, 0xa5);
  const valid = jsonCopy(memory.snapshot());
  for (const invalid of [
    undefined,
    null,
    {},
    { ...valid, version: 2 },
    { ...valid, initialGraph: "00" },
    { ...valid, patches: null },
    { ...valid, patches: Array.from({ length: 0x10001 }, () => null) },
  ]) {
    assert.throws(() => restoreOriginalRoadMemory(graph, invalid), TypeError);
  }
  for (const patches of [
    [null],
    [{ address: -1, hex: "00" }],
    [{ address: 0x10000, hex: "00" }],
    [{ address: 1.5, hex: "00" }],
    [{ address: "1", hex: "00" }],
    [{ address: 0, hex: "" }],
    [{ address: 0, hex: "0" }],
    [{ address: 0, hex: "zz" }],
    [{ address: 0, hex: "A5" }],
    [{ address: 0, hex: null }],
    [{ address: 0xffff, hex: "0000" }],
    [
      { address: 0x8000, hex: "0000" },
      { address: 0x8001, hex: "01" },
    ],
    [
      { address: 2, hex: "00" },
      { address: 1, hex: "00" },
    ],
    [
      { address: 0x8000, hex: "00" },
      { address: 0x8000, hex: "00" },
    ],
  ]) {
    const invalid = { ...valid, patches };
    const before = JSON.stringify(invalid);
    assert.throws(() => restoreOriginalRoadMemory(graph, invalid), TypeError);
    assert.equal(JSON.stringify(invalid), before);
  }
  assert.deepEqual(memory.snapshot(), valid);
  assert.deepEqual(graph, fixture());
});

test("continuous queries after JSON restoration preserve returns, write order and old queue", () => {
  const graph = fixture();
  const memory = createCheckedOriginalRoadMemory(graph);
  memory.writeByte(0x8bff, 0xa5);
  const first = query(memory);
  assert.deepEqual(first.result, {
    ax: 0xfffc,
    bx: 0x820,
    cx: 10,
    cf: false,
    reason: "found",
  });
  assert.ok(first.trace.some((event) => event.kind === "carry"));
  const restored = restoreOriginalRoadMemory(
    graph,
    jsonCopy(memory.snapshot()),
  );
  for (const options of [
    { start: 16, stopB: 0, stopC: 0 },
    { start: 0, stopB: 24, stopC: 24, cityOwner: 1 },
    { start: 0, stopB: 0, stopC: 24 }, // shortcut: no initialization or writes
    { start: 0, stopB: 32, stopC: 32 }, // isolated stop: literal CF exhaustion
  ]) {
    assert.deepEqual(query(restored, options), query(memory, options));
    assert.deepEqual(restored.snapshot(), memory.snapshot());
    assert.equal(restored.readByte(0x8bff), 0xa5);
    unknown(restored, 0x8c00);
  }
  const before = restored.snapshot();
  assert.equal(query(restored, { start: 0, stopB: 0 }).trace.length, 0);
  assert.deepEqual(restored.snapshot(), before);
});

test("an uncovered read keeps earlier writes; checkpoint does not invent rollback or extra RAM", () => {
  const graph = fixture();
  const memory = createCheckedOriginalRoadMemory(graph);
  assert.throws(
    () =>
      searchOriginalRoadMemory({
        start: 0,
        stopB: 8,
        stopC: 8,
        owner: 0,
        readGraphByte: memory.readByte,
        writeGraphByte: memory.writeByte,
        readStateByte: () => {
          throw new Error("uncovered city owner");
        },
      }),
    /uncovered city owner/,
  );
  const restored = restoreOriginalRoadMemory(
    graph,
    jsonCopy(memory.snapshot()),
  );
  for (const address of [0x8000, 0x87ff])
    assert.equal(restored.readByte(address), 0);
  unknown(restored, 0x8800);
  assert.deepEqual(query(restored), query(memory));
  assert.deepEqual(restored.snapshot(), memory.snapshot());
});
