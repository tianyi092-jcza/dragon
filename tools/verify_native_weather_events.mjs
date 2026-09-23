import assert from "node:assert/strict";
import test from "node:test";
import { originalEventPump31AE } from "../web/src/game/navigation/originalevents.js";
import { consumeScenarioStrategicEvent } from "../web/src/game/navigation/scenarioevents.js";
import {
  beginScenarioDisasterAreaEvent,
  continueScenarioDisasterAreaEvent,
} from "../web/src/game/navigation/scenarioweather.js";

const eventIO = ({ divider, cursor = 0, words = new Map() }) => ({
  divider,
  cursor,
  reads: [],
  readEventDividerByte() {
    return this.divider;
  },
  writeEventDividerByte(value) {
    this.divider = value;
  },
  readEventCursorWord() {
    return this.cursor;
  },
  writeEventCursorWord(value) {
    this.cursor = value;
  },
  readEventWord(offset) {
    this.reads.push(offset);
    return words.get(offset) ?? 0;
  },
});

test("31AE decrements first; page-end leaves zero then wraps to FF next hour", () => {
  const io = eventIO({ divider: 2 });
  assert.deepEqual(originalEventPump31AE(io), {
    status: "divider",
    divider: 1,
  });
  assert.equal(io.cursor, 0);
  io.cursor = 0x100;
  assert.deepEqual(originalEventPump31AE(io), {
    status: "page-end",
    cursor: 0x100,
  });
  assert.equal(io.divider, 0);
  assert.deepEqual(originalEventPump31AE(io), {
    status: "divider",
    divider: 255,
  });
});

test("31AE reloads10, reads both words, advances D20, then exposes raw dispatch", () => {
  const io = eventIO({
    divider: 1,
    cursor: 8,
    words: new Map([
      [8, 0x010b],
      [10, 0x0302],
    ]),
  });
  assert.deepEqual(originalEventPump31AE(io), {
    status: "dispatch",
    cursor: 8,
    event: { type: 11, arg0: 1, arg1: 2, arg2: 3 },
  });
  assert.equal(io.divider, 10);
  assert.equal(io.cursor, 12);
  assert.deepEqual(io.reads, [8, 10]);
});

test("scenario event adapter retains reload when the second raw word is unknown", () => {
  const sc = {
    _strategicEventDivider: 1,
    _strategicEventCursor: 0,
    strategicEventSlots: [{ type: 11, arg0: 0 }],
  };
  assert.throws(() => consumeScenarioStrategicEvent(sc), /event arg1/);
  assert.equal(sc._strategicEventDivider, 10);
  assert.equal(sc._strategicEventCursor, 0);
});

test("34A6 consumes one RNG and 237E resumes after each player message", () => {
  const cities = Array.from({ length: 192 }, (_, idx) => ({
    idx,
    faction: 1,
    x: 1000 + idx,
    y: 1000,
    disaster_event: 77,
  }));
  Object.assign(cities[0], { faction: 0, x: 10, y: 10 });
  Object.assign(cities[1], { faction: 1, x: 11, y: 10 });
  Object.assign(cities[2], { faction: 0, x: 12, y: 10 });
  const sc = {
    player_faction: 0,
    cities,
    weatherCloudBounds: { minX: 0, maxX: 20, minY: 0, maxY: 20 },
  };
  const rng = {
    calls: 0,
    nextByte() {
      this.calls++;
      return 0;
    },
  };
  const state = beginScenarioDisasterAreaEvent(sc, rng);
  assert.equal(rng.calls, 1);
  const first = continueScenarioDisasterAreaEvent(sc, state);
  assert.deepEqual(
    { status: first.status, index: first.index, damage: first.damage },
    { status: "message", index: 0, damage: 24 },
  );
  assert.equal(cities[1].disaster_event, 77);
  const second = continueScenarioDisasterAreaEvent(sc, state);
  assert.deepEqual(
    { status: second.status, index: second.index, damage: second.damage },
    { status: "message", index: 2, damage: 23 },
  );
  assert.equal(cities[1].disaster_event, 24);
  const done = continueScenarioDisasterAreaEvent(sc, state);
  assert.equal(done.status, "return");
  assert.equal(done.changed, true);
  assert.equal(state.index, 192);
});
