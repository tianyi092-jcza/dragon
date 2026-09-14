import assert from "node:assert/strict";
import test from "node:test";
import { readOriginalRoadCityOwnerByte } from "../web/src/game/navigation/originalroadstate.js";
import { createOriginalRoadMemory } from "../web/src/game/navigation/originalroadmemory.js";
import { searchOriginalRoadMemory } from "../web/src/game/navigation/originalroadsearch.js";

function memoryFixture() {
  // Synthetic two-node search ABI, not a claim about generated-map reachability.
  const nodes = Array.from({ length: 192 }, (_, id) => ({
    id,
    edgeSlots: [0, 0, 0, 0],
  }));
  nodes[0].edgeSlots[0] = 0x4800;
  nodes[1].edgeSlots[0] = 0x8800;
  return createOriginalRoadMemory({
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
  });
}

function query(memory, scenario, owner = 0, reads = []) {
  return searchOriginalRoadMemory({
    start: 0,
    stopB: 8,
    stopC: 8,
    owner,
    readGraphByte: memory.readByte,
    writeGraphByte: memory.writeByte,
    readStateByte: (address) => {
      reads.push(address);
      return readOriginalRoadCityOwnerByte(scenario, address);
    },
  });
}

test("D52 city +1 addresses preserve slots and the byte storage domain", () => {
  const scenario = {
    cities: Array.from({ length: 192 }, (_, idx) => ({ idx, faction: idx })),
  };
  for (let slot = 0; slot < 192; slot++) {
    assert.equal(
      readOriginalRoadCityOwnerByte(scenario, 0x841 + slot * 0x20),
      slot,
    );
  }
  // This is the storage domain, not permission for extra active factions.
  for (let owner = 0; owner < 256; owner++) {
    scenario.cities[0].faction = owner;
    assert.equal(readOriginalRoadCityOwnerByte(scenario, 0x841), owner);
  }
  scenario.cities[0].raw = "00ff" + "00".repeat(30);
  scenario.cities[0].faction = null;
  assert.equal(readOriginalRoadCityOwnerByte(scenario, 0x841), 0x18);
  scenario.cities[0].faction = 0;
  assert.equal(
    readOriginalRoadCityOwnerByte(scenario, 0x841),
    0,
    "live ownership, not stale raw",
  );
});

test("uncovered addresses, slots and ownership never become neutral", () => {
  const scenario = { cities: [{ idx: 0, faction: 0 }] };
  for (const address of [
    -1,
    0x10000,
    NaN,
    Infinity,
    "2113",
    null,
    0x840,
    0x842,
    0x845,
    0x2041,
  ]) {
    assert.throws(
      () => readOriginalRoadCityOwnerByte(scenario, address),
      /state (?:address|byte)/,
    );
  }
  assert.throws(
    () => readOriginalRoadCityOwnerByte(scenario, 0x2021),
    /city slot/,
  );
  scenario.cities[0].idx = 1;
  assert.throws(
    () => readOriginalRoadCityOwnerByte(scenario, 0x841),
    /city slot/,
  );
  scenario.cities[0].idx = 0;
  for (const owner of [
    undefined,
    -1,
    256,
    0.5,
    NaN,
    Infinity,
    "0",
    false,
    {},
  ]) {
    scenario.cities[0].faction = owner;
    assert.throws(
      () => readOriginalRoadCityOwnerByte(scenario, 0x841),
      /city owner/,
    );
  }
});

test("491B consumes live ownership; terminal city ownership is not read", () => {
  const memory = memoryFixture();
  const scenario = { cities: [{ idx: 0, faction: 0 }] };
  const reads = [];
  assert.deepEqual(query(memory, scenario, 0, reads), {
    ax: 0xfffc,
    bx: 0x800,
    cx: 5,
    cf: false,
    reason: "found",
  });
  // 49D5/49D9/49DC, then 4A3D: (0+A6)|8000, +4, +edge byte 1.
  scenario.cities[0].faction = 1;
  assert.equal(query(memory, scenario, 0, reads).cx, 0x80ab);
  scenario.cities[0].faction = null;
  assert.equal(query(memory, scenario, 0x18, reads).cx, 5);
  assert.deepEqual(reads, [0x841, 0x841, 0x841]);
});

test("uncovered city read throws after prior search writes, without a fake result", () => {
  const memory = memoryFixture();
  memory.writeByte(0x8000, 0x99);
  assert.throws(() => query(memory, { cities: [] }), /city slot/);
  assert.equal(
    memory.readByte(0x8000),
    0,
    "4940 visited clear is not rolled back",
  );
  assert.throws(() => memory.readByte(0x8800), /Unprovided original road byte/);
});
