// D2-EVENT-64 chain: real adapters + real wheel + schedule table.
// Covers D1 (page-full target), D2 (301C absolute target), D3 (month carry),
// D4 (one cursor step, serial batch), D6 (area snapshot), D7 (clear
// generation), D8 (restore gate). Isolated: no SAVE.DAT, no browser state.
import assert from "node:assert/strict";
import test from "node:test";
import {
  beginScenarioDisasterObjectEvent,
  performScenarioMonthlyWeatherEvents,
} from "../web/src/game/navigation/scenarioweather.js";
import { consumeScenarioStrategicEvent } from "../web/src/game/navigation/scenarioevents.js";
import { originalDelayedEnqueue301C } from "../web/src/game/navigation/originallegionfate.js";
import {
  advanceScheduleEpoch,
  attachPositionMeta,
  ensureStrategicEventSchedule,
  recordCarryEvent,
  recordOverflowEvent,
  rotateStrategicEventSchedule,
  takeScheduledEntries,
} from "../web/src/game/navigation/strategiceventschedule.js";
import { applyWebMetaToState } from "../web/src/game/savegame.js";
import { hasPendingStrategicEvent } from "../web/src/game/ai.js";

const GLOBAL_BOUNDS = { minX: -16, maxX: 400, minY: -16, maxY: 400 };

const city = (idx) => ({
  idx,
  faction: 1,
  x: (idx * 2) % 384,
  y: (idx * 3) % 256,
  growth: 255,
  defence: 255,
  disaster_event: 0,
});

function scenario({ fill = 0, cursor = 0, divider = 7 } = {}) {
  const slots = Array(256).fill(null);
  for (let i = 0; i < fill; i++)
    slots[i] = { type: 99, arg0: 1, arg1: 2, arg2: 3 };
  const cities = Array.from({ length: 192 }, (_, idx) => city(idx));
  cities[0].x = 200;
  cities[0].y = 90;
  return {
    player_faction: 0,
    cities,
    weatherCloudBounds: { ...GLOBAL_BOUNDS },
    _disasterBounds: { ...GLOBAL_BOUNDS },
    _strategicEventCursor: cursor,
    _strategicEventDivider: divider,
    strategicEventSlots: slots,
    disasterMapObjects: Array(16).fill(null),
  };
}

// 230C=1, 2313=0 (city 0), 2333=0 (delay 32 slots); 2286 then fails every gate.
function weatherRng() {
  const bytes = [1, 0, 0];
  return {
    calls: 0,
    nextByte() {
      const value = this.calls < bytes.length ? bytes[this.calls] : 255;
      this.calls += 1;
      return value;
    },
  };
}

test("D1 page-full area event is accepted into the next epoch slot 0", () => {
  const sc = scenario({ fill: 64 });
  const before = structuredClone(sc.strategicEventSlots);
  const rng = weatherRng();
  const result = performScenarioMonthlyWeatherEvents(sc, rng);
  assert.equal(result.areaQueued, true, "D5: accepted, not reported as failed");
  assert.equal(rng.calls, 387);
  assert.deepEqual(sc.strategicEventSlots, before, "wheel stays untouched");
  const schedule = ensureStrategicEventSchedule(sc);
  assert.equal(schedule.entries.length, 1);
  const [entry] = schedule.entries;
  assert.equal(entry.position, 64, "D1: next epoch slot 0");
  assert.equal(entry.type, 0x0b);
  assert.deepEqual(entry.region, { minX: 195, maxX: 205, minY: 85, maxY: 95 });
});

test("D1 control: a free slot still writes the wheel and records metadata", () => {
  const sc = scenario({ fill: 64 });
  sc.strategicEventSlots[32] = null;
  const rng = weatherRng();
  const result = performScenarioMonthlyWeatherEvents(sc, rng);
  assert.equal(result.areaQueued, true);
  assert.equal(ensureStrategicEventSchedule(sc).entries.length, 0);
  assert.equal(sc.strategicEventSlots[32].type, 0x0b);
  const [meta] = ensureStrategicEventSchedule(sc).meta;
  assert.equal(meta.position, 32);
  assert.deepEqual(meta.region, { minX: 195, maxX: 205, minY: 85, maxY: 95 });
});

const wheelIO = (sc) => ({
  nextRandomByte: () => 255,
  readEventCursorWord() {
    return sc._strategicEventCursor * 4;
  },
  readEventTypeByte(offset) {
    const event = sc.strategicEventSlots[offset >>> 2];
    return event ? event.type : 0;
  },
  writeEventWord() {
    throw new Error("full wheel must not be written");
  },
  queueOverflowRecord(record, meta) {
    return recordOverflowEvent(
      sc,
      ensureStrategicEventSchedule(sc).epoch * 64 + (meta.offset >>> 2),
      record,
    );
  },
});

test("D2 full-wheel 301C keeps the absolute target and CF 0", () => {
  const sc = scenario({ fill: 256 });
  const result = originalDelayedEnqueue301C(wheelIO(sc), 0x000c, 0x1234, 8);
  assert.equal(result.inserted, false);
  assert.equal(result.cf, false);
  assert.equal(result.accepted, true);
  const [entry] = ensureStrategicEventSchedule(sc).entries;
  assert.equal(entry.position, 256, "scan ends at byte 0x400 = slot 256");
  assert.equal(entry.type, 0x0c);
  assert.deepEqual([entry.arg0, entry.arg1, entry.arg2], [0, 0x34, 0x12]);
});

test("D2 control: a later free slot is written in place", () => {
  const sc = scenario({ fill: 40 });
  for (let i = 32; i < 40; i++)
    sc.strategicEventSlots[i] = { type: 99, arg0: 1, arg1: 2, arg2: 3 };
  const written = [];
  const result = originalDelayedEnqueue301C(
    {
      ...wheelIO(sc),
      writeEventWord(offset, value) {
        written.push([offset, value]);
        const index = offset >>> 2;
        sc.strategicEventSlots[index] ??= { type: 0, arg0: 0, arg1: 0, arg2: 0 };
        const event = sc.strategicEventSlots[index];
        if (offset % 4 === 0) {
          event.type = value & 0xff;
          event.arg0 = value >>> 8;
        } else {
          event.arg1 = value & 0xff;
          event.arg2 = value >>> 8;
        }
      },
    },
    0x000c,
    0x1234,
    8,
  );
  assert.equal(result.inserted, true);
  assert.equal(result.offset, 40 * 4);
  assert.equal(ensureStrategicEventSchedule(sc).entries.length, 0);
  assert.deepEqual(written, [[160, 0x000c], [162, 0x1234]]);
});

test("D3 rotation carries the unconsumed tail with its metadata", () => {
  const sc = scenario({ cursor: 5 });
  sc.strategicEventSlots[5] = { type: 10, arg0: 1, arg1: 0, arg2: 0 };
  sc.strategicEventSlots[7] = { type: 10, arg0: 2, arg1: 0, arg2: 0 };
  attachPositionMeta(sc, 5, { region: { minX: 1, maxX: 9, minY: 2, maxY: 8 } });
  recordOverflowEvent(sc, 3, { type: 99, arg0: 0, arg1: 0, arg2: 0 });
  const result = rotateStrategicEventSchedule(sc, {
    cursorSlot: 5,
    readRecord: (slot) => sc.strategicEventSlots[slot],
  });
  assert.deepEqual(result, { carried: 2, overdue: 1, epoch: 1 });
  const schedule = ensureStrategicEventSchedule(sc);
  assert.deepEqual(
    schedule.entries.map((entry) => [entry.position, entry.rank, entry.arg0]),
    [
      [64, 0, 1],
      [64, 0, 2],
      [64, 0, 0],
    ],
  );
  assert.deepEqual(schedule.entries[0].region, {
    minX: 1,
    maxX: 9,
    minY: 2,
    maxY: 8,
  });
  assert.equal(schedule.entries[2].type, 99, "overdue overflow follows the tail");
});

test("D4 pump advances the cursor once and freezes carry/wheel/overflow", () => {
  const sc = scenario({ cursor: 0, divider: 1 });
  sc.strategicEventSlots[0] = { type: 10, arg0: 9, arg1: 0, arg2: 0 };
  advanceScheduleEpoch(sc);
  recordCarryEvent(sc, 64, { type: 10, arg0: 1, arg1: 0, arg2: 0 }, 0);
  recordCarryEvent(sc, 64, { type: 10, arg0: 2, arg1: 0, arg2: 0 }, 1);
  recordOverflowEvent(sc, 64, { type: 0x0b, arg0: 0, arg1: 0, arg2: 0 });
  const step = consumeScenarioStrategicEvent(sc);
  assert.equal(step.status, "dispatch");
  assert.equal(step.event.arg0, 1, "carry dispatches first");
  assert.deepEqual(
    step.rest.map((event) => (event.type === 0x0b ? "overflow" : event.arg0)),
    [2, 9, "overflow"],
  );
  assert.equal(sc._strategicEventCursor, 1, "cursor advanced exactly once");
  assert.equal(sc._strategicEventDivider, 10);
  const next = consumeScenarioStrategicEvent(sc);
  assert.equal(next.status, "divider", "no second dispatch for the same slot");
  assert.equal(next.divider, 9);
});

test("D7 a clear only owns the disaster generation it was produced for", () => {
  const sc = scenario();
  const pointer = 0x0840;
  sc.cities[0]._disasterGeneration = 3;
  sc.cities[0].disaster_event = 24;
  sc.disasterMapObjects[0] = { status: 0x80, x: 200, y: 90 };
  const stale = beginScenarioDisasterObjectEvent(sc, {
    type: 12,
    arg0: 0,
    arg1: pointer & 0xff,
    arg2: pointer >>> 8,
    generation: 2,
  });
  assert.equal(stale.skipped, true);
  assert.equal(stale.changed, false);
  assert.equal(sc.cities[0].disaster_event, 24, "newer disaster untouched");
  assert.equal(sc.disasterMapObjects[0].status, 0x80, "object not removed");
  const owned = beginScenarioDisasterObjectEvent(sc, {
    type: 12,
    arg0: 0,
    arg1: pointer & 0xff,
    arg2: pointer >>> 8,
    generation: 3,
  });
  assert.equal(owned.status, "return");
  assert.equal(owned.changed, true);
  assert.equal(sc.cities[0].disaster_event, 0);
  assert.equal(sc.disasterMapObjects[0].status, 0);
});

test("D8 restore accepts the schedule, refuses legacy tables and corruption", () => {
  const sc = scenario();
  recordOverflowEvent(sc, 64, {
    type: 0x0b,
    arg0: 0,
    arg1: 0,
    arg2: 0,
    region: { minX: 1, maxX: 2, minY: 3, maxY: 4 },
    generation: 5,
  });
  const runtime = JSON.parse(JSON.stringify(sc.strategicEventSchedule));
  const state = { strategicEventSlots: sc.strategicEventSlots };
  applyWebMetaToState(state, {
    scenarioRuntimeState: {
      strategicEventSchedule: runtime,
      _strategicEventSeq: 1,
    },
  });
  assert.deepEqual(state.strategicEventSchedule, sc.strategicEventSchedule);
  assert.throws(
    () =>
      applyWebMetaToState(
        { strategicEventSlots: [] },
        {
          scenarioRuntimeState: {
            strategicEventOverflow: [
              { type: 11, arg0: 0, arg1: 0, arg2: 0, sequence: 0 },
            ],
          },
        },
      ),
    /non-empty D2-C overflow side table/,
  );
  assert.throws(
    () =>
      applyWebMetaToState(
        { strategicEventSlots: [] },
        {
          scenarioRuntimeState: {
            strategicEventSchedule: { version: 99, epoch: 0, entries: [] },
          },
        },
      ),
    /unsupported version/,
  );
  assert.throws(
    () =>
      applyWebMetaToState(
        { strategicEventSlots: [] },
        {
          scenarioRuntimeState: {
            strategicEventSchedule: {
              version: 1,
              epoch: 0,
              entries: [
                {
                  position: 0,
                  rank: 1,
                  order: 0,
                  type: 0x1ff,
                  arg0: 0,
                  arg1: 0,
                  arg2: 0,
                },
              ],
            },
          },
        },
      ),
    /type is not a byte/,
  );
});

test("D4/304E: scheduled records count as pending until dispatched", () => {
  const sc = scenario({ fill: 64 });
  performScenarioMonthlyWeatherEvents(sc, weatherRng());
  const [entry] = ensureStrategicEventSchedule(sc).entries;
  assert.equal(hasPendingStrategicEvent(sc, entry.type, { arg0: entry.arg0 }), true);
  assert.equal(
    hasPendingStrategicEvent(sc, entry.type, { arg0: (entry.arg0 + 1) & 0xff }),
    false,
    "different target does not match",
  );
  assert.equal(hasPendingStrategicEvent(sc, entry.type ^ 0x01), false);
  // 取走后才不再报告待办（与 304E 只读语义一致）。
  takeScheduledEntries(sc, entry.position, entry.rank);
  assert.equal(hasPendingStrategicEvent(sc, entry.type, { arg0: entry.arg0 }), false);
});
