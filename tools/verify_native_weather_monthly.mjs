import assert from "node:assert/strict";
import test from "node:test";
import {
  originalDisasterArea237E,
  originalCurrentEnqueue2FBF,
} from "../web/src/game/navigation/originalweather.js";
import { performScenarioMonthlyWeatherEvents } from "../web/src/game/navigation/scenarioweather.js";

const city = (idx) => ({
  idx,
  faction: idx % 3,
  x: (idx * 2) % 384,
  y: (idx * 3) % 256,
  growth: 255,
  defence: 255,
  disaster_event: 77,
});
const scenario = () => ({
  player_faction: 0,
  cities: Array.from({ length: 192 }, (_, idx) => city(idx)),
  weatherCloudBounds: { minX: -16, maxX: 400, minY: -16, maxY: 400 },
  _disasterBounds: { minX: -16, maxX: 400, minY: -16, maxY: 400 },
  _strategicEventCursor: 0,
  strategicEventSlots: Array(64).fill(null),
});
const sequence = (...values) => ({
  calls: 0,
  nextByte() {
    const value = this.calls < values.length ? values[this.calls] : 255;
    this.calls++;
    return value;
  },
});

test("22DB resets only non-global minX, clears only cities within radius, then runs fixed 2286", () => {
  const sc = scenario();
  sc._disasterBounds = { minX: 0, maxX: 20, minY: 0, maxY: 20 };
  sc.cities[0].x = 10;
  sc.cities[0].y = 10;
  sc.cities[1].x = 31;
  sc.cities[1].y = 10;
  const rng = sequence(2);
  const result = performScenarioMonthlyWeatherEvents(sc, rng);
  assert.deepEqual(result, { areaQueued: false, cityQueued: 0, queued: [] });
  assert.deepEqual(sc._disasterBounds, {
    minX: -16,
    minY: -16,
    maxX: 400,
    maxY: 400,
  });
  assert.equal(sc.cities[0].disaster_event, 0);
  assert.equal(sc.cities[1].disaster_event, 77);
  assert.equal(rng.calls, 385);
});

test("22DB storm uses x-low extra gate, current-page collision scan and delayed bound writes", () => {
  const sc = scenario();
  sc.cities[5].x = 200;
  sc.cities[5].y = 90;
  sc.strategicEventSlots[44] = { type: 99, arg0: 1, arg1: 2, arg2: 3 };
  sc.strategicEventSlots[45] = { type: 98, arg0: 4, arg1: 5, arg2: 6 };
  const rng = sequence(1, 5, 3);
  const result = performScenarioMonthlyWeatherEvents(sc, rng);
  assert.equal(result.areaQueued, true);
  assert.deepEqual(result.queued[0], { type: 11, arg0: 0, arg1: 0, arg2: 0 });
  assert.deepEqual(sc.strategicEventSlots[46], result.queued[0]);
  assert.deepEqual(sc._disasterBounds, {
    minX: 195,
    maxX: 205,
    minY: 85,
    maxY: 95,
  });
});

test("2286 equality queues type12 first gate and stores the raw city pointer", () => {
  const sc = scenario();
  sc.cities[0].defence = 10;
  sc.cities[0].growth = 10;
  const rng = sequence(2, 4, 10, 8);
  const result = performScenarioMonthlyWeatherEvents(sc, rng);
  assert.equal(result.areaQueued, false);
  assert.equal(result.cityQueued, 1);
  assert.deepEqual(sc.strategicEventSlots[2], {
    type: 12,
    arg0: 1,
    arg1: 0x40,
    arg2: 0x08,
  });
});

test("2286 below-threshold first gate falls through to the second gate without queue RNG", () => {
  const sc = scenario();
  sc.cities[0].defence = 10;
  sc.cities[0].growth = 10;
  const rng = sequence(2, 4, 9, 24);
  const result = performScenarioMonthlyWeatherEvents(sc, rng);
  assert.equal(result.cityQueued, 0);
  assert.equal(
    sc.strategicEventSlots.every((event) => event === null),
    true,
  );
  assert.equal(rng.calls, 386);
});

test("native adapter stops at the actual missing bound/event reads and retains prefixes", () => {
  const missingBound = scenario();
  missingBound._disasterBounds = { minX: 0 };
  const firstRng = sequence(2);
  assert.throws(
    () => performScenarioMonthlyWeatherEvents(missingBound, firstRng),
    /native weather maxX/,
  );
  assert.deepEqual(missingBound._disasterBounds, { minX: 0 });
  assert.equal(firstRng.calls, 0);

  const hole = scenario();
  hole.cities[5].x = 200;
  delete hole.strategicEventSlots[44];
  const stormRng = sequence(1, 5, 3);
  assert.throws(
    () => performScenarioMonthlyWeatherEvents(hole, stormRng),
    /event slot 44/,
  );
  assert.deepEqual(hole._disasterBounds, {
    minX: -16,
    maxX: 400,
    minY: -16,
    maxY: 400,
  });
  assert.equal(stormRng.calls, 3);
});

test("237E commits intensity before the still-uncovered TALK70 return", () => {
  const cities = [
    { x: 10, y: 10, owner: 0, disaster: 77 },
    { x: 11, y: 10, owner: 1, disaster: 77 },
  ];
  const writes = [];
  assert.throws(
    () =>
      originalDisasterArea237E(
        {
          readBoundWord: (field) =>
            ({ minX: 0, maxX: 20, minY: 0, maxY: 20 })[field],
          readCityWord: (idx, field) => cities[idx]?.[field] ?? 1000,
          writeCityByte(idx, field, value) {
            cities[idx][field] = value;
            writes.push([idx, field, value]);
          },
          readPlayerFaction: () => 0,
          readCityByte: (idx, field) => cities[idx][field],
          showAreaMessage() {
            throw new Error("TALK70 stop");
          },
        },
        24,
      ),
    /TALK70 stop/,
  );
  assert.deepEqual(writes, [[0, "disaster", 24]]);
  assert.equal(cities[1].disaster, 77);
});

test("2FBF wraps the word cursor before its 0x100 limit and preserves scan order", () => {
  const slots = Array(64).fill(null);
  slots[24] = [9, 9, 9, 9];
  const writes = [];
  const result = originalCurrentEnqueue2FBF(
    {
      readEventCursorWord: () => 0xffe0,
      readEventTypeByte: (offset) => slots[offset >>> 2]?.[0] ?? 0,
      writeEventWord(offset, value) {
        writes.push([offset, value]);
        const index = offset >>> 2;
        slots[index] ??= [0, 0, 0, 0];
        slots[index][offset & 2 ? 2 : 0] = value & 0xff;
        slots[index][offset & 2 ? 3 : 1] = value >>> 8;
      },
    },
    0x000b,
    0,
    32,
  );
  assert.deepEqual(result, { inserted: true, offset: 100, cf: false });
  assert.deepEqual(writes, [
    [100, 0x000b],
    [102, 0],
  ]);
});
