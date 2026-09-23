import assert from "node:assert/strict";
import test from "node:test";
import {
  originalDisasterObjectRemove2438,
  originalDisasterObjectSpawn23FF,
} from "../web/src/game/navigation/originalweather.js";
import {
  beginScenarioDisasterObjectEvent,
  continueScenarioDisasterObjectEvent,
} from "../web/src/game/navigation/scenarioweather.js";

const city = (idx) => ({
  idx,
  faction: 1,
  x: 100 + idx,
  y: 80 + idx,
  disaster_event: 0,
});
const scenario = () => ({
  player_faction: 0,
  cities: Array.from({ length: 192 }, (_, idx) => city(idx)),
  disasterMapObjects: Array(16).fill(null),
  strategicEventSlots: Array(256).fill(null),
  _strategicEventCursor: 2,
});
const bytes = (...values) => ({
  calls: 0,
  nextByte() {
    assert(this.calls < values.length, "unexpected RNG");
    return values[this.calls++];
  },
});

test("23FF uses first status<80 slot and commits the exact object fields", () => {
  const records = Array.from({ length: 16 }, (_, slot) => ({
    status: slot === 3 ? 0x7f : 0x80,
    x: 900,
    y: 901,
  }));
  const writes = [];
  const result = originalDisasterObjectSpawn23FF(
    {
      readObjectByte: (slot, field) => records[slot][field],
      writeObjectByte(slot, field, value) {
        records[slot][field] = value;
        writes.push([slot, field, value]);
      },
      writeObjectWord(slot, field, value) {
        records[slot][field] = value;
        writes.push([slot, field, value]);
      },
    },
    2,
    123,
    45,
  );
  assert.deepEqual(result, { inserted: true, slot: 3, cf: false });
  assert.deepEqual(writes, [
    [3, "status", 0x80],
    [3, "subtype", 2],
    [3, "interval", 0x10],
    [3, "x", 123],
    [3, "y", 45],
    [3, "raw6", 1],
    [3, "raw7", 1],
    [3, "timer", 1],
    [3, "frame", 1],
  ]);
});

test("2438 clears every active coordinate match and reads Y only after X", () => {
  const records = Array.from({ length: 16 }, () => ({ status: 0 }));
  records[0] = { status: 0x80, x: 10, y: 20 };
  records[1] = { status: 0x80, x: 10, y: 21 };
  records[2] = { status: 0x81, x: 10, y: 20 };
  const reads = [];
  assert.equal(
    originalDisasterObjectRemove2438(
      {
        readObjectByte: (slot) => records[slot].status,
        readObjectWord(slot, field) {
          reads.push([slot, field]);
          return records[slot][field];
        },
        writeObjectByte(slot, field, value) {
          records[slot][field] = value;
        },
      },
      10,
      20,
    ),
    2,
  );
  assert.equal(records[0].status, 0);
  assert.equal(records[1].status, 0x80);
  assert.equal(records[2].status, 0);
  assert.equal(
    reads.some(([slot, field]) => slot === 1 && field === "y"),
    true,
  );
});

test("34B1 subtype1 spawns, consumes two suffix RNG bytes and queues raw removal", () => {
  const sc = scenario();
  const event = { type: 12, arg0: 1, arg1: 0x40, arg2: 0x08 };
  const state = beginScenarioDisasterObjectEvent(sc, event);
  assert.equal(state.status, "continue");
  assert.deepEqual(sc.disasterMapObjects[0], {
    status: 0x80,
    active: true,
    subtype: 1,
    group: 1,
    kind: 1,
    interval: 16,
    x: 100,
    y: 80,
    raw6: 1,
    raw7: 1,
    timer: 1,
    frame: 1,
  });
  const rng = bytes(7, 0);
  const result = continueScenarioDisasterObjectEvent(sc, state, rng);
  assert.equal(sc.cities[0].disaster_event, 11);
  assert.equal(rng.calls, 2);
  assert.deepEqual(result.queued, [
    { type: 12, arg0: 0, arg1: 0x40, arg2: 0x08 },
  ]);
  assert.deepEqual(sc.strategicEventSlots[8], result.queued[0]);
});

test("34B1 subtype0 clears city and every matching object without RNG", () => {
  const sc = scenario();
  sc.cities[0].disaster_event = 9;
  sc.disasterMapObjects[0] = {
    status: 0x80,
    active: true,
    x: 100,
    y: 80,
  };
  sc.disasterMapObjects[5] = {
    status: 0x81,
    active: true,
    x: 100,
    y: 80,
  };
  const result = beginScenarioDisasterObjectEvent(sc, {
    type: 12,
    arg0: 0,
    arg1: 0x40,
    arg2: 0x08,
  });
  assert.equal(result.status, "return");
  assert.equal(sc.cities[0].disaster_event, 0);
  assert.equal(sc.disasterMapObjects[0].status, 0);
  assert.equal(sc.disasterMapObjects[0].active, false);
  assert.equal(sc.disasterMapObjects[5].status, 0);
});

test("full 23FF returns before owner, message, city damage or RNG", () => {
  const sc = scenario();
  sc.disasterMapObjects = Array.from({ length: 16 }, () => ({ status: 0x80 }));
  delete sc.cities[0].faction;
  const result = beginScenarioDisasterObjectEvent(sc, {
    type: 12,
    arg0: 2,
    arg1: 0x40,
    arg2: 0x08,
  });
  assert.deepEqual(result, {
    status: "return",
    changed: false,
    subtype: 2,
    cityPointer: 0x0840,
  });
  assert.equal(sc.cities[0].disaster_event, 0);
});
