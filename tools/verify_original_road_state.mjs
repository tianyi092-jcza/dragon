import assert from "node:assert/strict";
import test from "node:test";
import { readOriginalRoadCityOwnerByte, readCityOwnerByIndex, readOriginalStrategicNeighbour, roadNodeToCitySlot, cityAtRoadPointer } from "../web/src/game/navigation/originalroadstate.js";
import { governOriginalCity } from "../web/src/game/navigation/originalcity.js";
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

test('legacy neighbour decoding is lazy, ordered, and never repairs unknown bytes', () => {
  const city = { strategicNeighbours: [4, 255, 1, 255] };
  assert.equal(readOriginalStrategicNeighbour(city, 0), 4);
  assert.equal(readOriginalStrategicNeighbour(city, 1), null);
  assert.equal(readOriginalStrategicNeighbour(city, 2), 1);
  assert.deepEqual(city.strategicNeighbours, [4, 255, 1, 255]);
  for (const value of [null, undefined, -1, 256, NaN, '1']) {
    city.strategicNeighbours[3] = value;
    assert.equal(readOriginalStrategicNeighbour(city, 1), null);
    assert.throws(() => readOriginalStrategicNeighbour(city, 3), /C1C neighbour at 3FD4/);
  }
  for (const slot of [-1, 4, 0.5, null])
    assert.throws(() => readOriginalStrategicNeighbour(city, slot), /neighbour slot/);
});

test('28F4 node bridge decodes 8*slot with u16 wrap and no 192 cap', () => {
  const scenario = { cities: Array.from({ length: 200 }, (_, idx) => ({ idx, faction: idx % 24 })) };
  assert.equal(roadNodeToCitySlot(scenario, 0, '28F4-first'), 0);
  assert.equal(roadNodeToCitySlot(scenario, 66 * 8, '28F4-first'), 66);
  assert.equal(roadNodeToCitySlot(scenario, 199 * 8, '28F4-first'), 199);
  assert.equal(readCityOwnerByIndex(scenario, roadNodeToCitySlot(scenario, 199 * 8, '28F4-first'), '28F4-first'), 199 % 24);
  // Misaligned / wrapped / identity-broken nodes stay fail-closed.
  assert.throws(() => roadNodeToCitySlot(scenario, 1, '28F4-first'), /bridge.*28F4-first/);
  assert.throws(() => roadNodeToCitySlot(scenario, 0x10000, '28F4-first'), /Invalid road node/);
  assert.throws(() => roadNodeToCitySlot({ cities: [] }, 0, '28F4-first'), /city slot/);
  scenario.cities[199].idx = 198;
  assert.throws(() => roadNodeToCitySlot(scenario, 199 * 8, '28F4-first'), /city slot/);
});

test('road city pointer bridge decodes 0x840+slot*32 with live length, not 192', () => {
  const scenario = { cities: Array.from({ length: 200 }, (_, idx) => ({ idx, faction: idx % 24, attr: 0x80 })) };
  assert.equal(cityAtRoadPointer(scenario, 0x840, '4311').idx, 0);
  assert.equal(cityAtRoadPointer(scenario, 0x840 + 199 * 32, '4549').faction, 199 % 24);
  for (const pointer of [-1, 0x10000, NaN, 0x83f, 0x841, 0x840 + 200 * 32])
    assert.throws(() => cityAtRoadPointer(scenario, pointer, '4311'), /city pointer.*4311/);
  scenario.cities[199].idx = 198;
  assert.throws(() => cityAtRoadPointer(scenario, 0x840 + 199 * 32, '4549'), /city pointer.*4549/);
});

test('indexed ownership reaches 192/254/255/256 without opening the legacy address domain', () => {
  const scenario = { cities: Array.from({ length: 257 }, (_, idx) => ({ idx, faction: null })) };
  for (const index of [0, 191, 192, 254, 255, 256]) {
    assert.equal(readCityOwnerByIndex(scenario, index), 24);
    scenario.cities[index].faction = 1;
    scenario.cities[index].raw = '00ff' + '00'.repeat(30);
    assert.equal(readCityOwnerByIndex(scenario, index), 1);
    if (index < 192) assert.equal(readOriginalRoadCityOwnerByte(scenario, 0x841 + index * 32), 1);
    else assert.throws(() => readOriginalRoadCityOwnerByte(scenario, 0x841 + index * 32), /state byte/);
  }
});

test('indexed unknowns stay errors and preserve the instruction diagnostic', () => {
  const scenario = { cities: [{ idx: 0, faction: 0 }] };
  for (const index of [-1, 0.5, NaN, Infinity, '0', null, undefined, Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() => readCityOwnerByIndex(scenario, index, '3FE4'), /city index.*3FE4/);
  assert.throws(() => readCityOwnerByIndex(scenario, 1, '3FE4'), /city slot.*3FE4/);
  for (const owner of [undefined, -1, 256, NaN, '0']) {
    scenario.cities[0].faction = owner;
    assert.throws(() => readCityOwnerByIndex(scenario, 0, '40B3'), /city owner.*40B3/);
  }
});

test('same governance leaf and indexed service handle high cities with unchanged values/RNG', () => {
  const run = index => {
    const city = { idx: index, faction: 0, governor: 0, prod: 500, growth: 100, defence: 120, troops: 10, troops_cap: 20 };
    const general = { assignment_budget: 3, ability: { force: 13, politics: 9 } };
    const scenario = { cities: Array.from({ length: index + 1 }, (_, idx) => idx === index ? city : { idx, faction: null }),
      player_faction: 0, generals: [general] };
    const reads = [], bytes = [0, 15, 0];
    let rng = 0;
    governOriginalCity(scenario, { readCityOwner(i, at) {
      reads.push([i, at]); return readCityOwnerByIndex(scenario, i, at);
    } }, city, { nextByte() { assert.ok(rng < bytes.length); return bytes[rng++]; } });
    assert.deepEqual(reads, [[index, '419C']]);
    return { city: { ...city, idx: 0 }, general, rng };
  };
  const baseline = run(0);
  assert.equal(baseline.rng, 3);
  for (const index of [192, 254, 255, 256]) assert.deepEqual(run(index), baseline);
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
