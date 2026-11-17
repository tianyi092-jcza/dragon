// D2-EVENT-64 V-matrix (plan §6). Synthetic fixtures only: no SAVE.DAT, no
// browser state, no dev store. Each case names the V item it evidences.
import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  beginScenarioDisasterAreaEvent,
  continueScenarioDisasterAreaEvent,
  performScenarioMonthlyWeatherEvents,
} from "../web/src/game/navigation/scenarioweather.js";
import { consumeScenarioStrategicEvent } from "../web/src/game/navigation/scenarioevents.js";
import { originalDelayedEnqueue301C } from "../web/src/game/navigation/originallegionfate.js";
import { originalCurrentEnqueue2FBF } from "../web/src/game/navigation/originalweather.js";
import {
  absolutePosition,
  ensureStrategicEventSchedule,
  recordOverflowEvent,
  rotateStrategicEventSchedule,
} from "../web/src/game/navigation/strategiceventschedule.js";
import { applyWebMetaToState } from "../web/src/game/savegame.js";

const GLOBAL = { minX: -16, maxX: 400, minY: -16, maxY: 400 };

function scenario({ fill = 0, cursor = 0, divider = 7, cities = 192 } = {}) {
  const slots = Array(256).fill(null);
  for (let i = 0; i < fill; i++)
    slots[i] = { type: 99, arg0: 1, arg1: 2, arg2: 3 };
  return {
    player_faction: 0,
    cities: Array.from({ length: cities }, (_, idx) => ({
      idx,
      faction: 1,
      x: (idx * 7) % 380,
      y: (idx * 5) % 250,
      growth: 255,
      defence: 255,
      disaster_event: 0,
    })),
    weatherCloudBounds: { ...GLOBAL },
    _disasterBounds: { ...GLOBAL },
    _strategicEventCursor: cursor,
    _strategicEventDivider: divider,
    strategicEventSlots: slots,
    disasterMapObjects: Array(16).fill(null),
  };
}

function shiftWheel(sc) {
  sc.strategicEventSlots = sc.strategicEventSlots
    .slice(64)
    .concat(Array(64).fill(null));
}

function wheelIO(sc, { free = null } = {}) {
  return {
    nextRandomByte: () => 0xff,
    readEventCursorWord: () => sc._strategicEventCursor * 4,
    readEventTypeByte(offset) {
      const event = sc.strategicEventSlots[offset >>> 2];
      return event ? event.type : 0;
    },
    writeEventWord(offset, value) {
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
      void free;
    },
    queueOverflowRecord(record, meta) {
      const epoch = ensureStrategicEventSchedule(sc).epoch;
      const position = meta.pageFull
        ? (epoch + 1) * 64
        : epoch * 64 + (meta.offset >>> 2);
      return recordOverflowEvent(sc, position, record);
    },
  };
}

test("V01 normal 192 wheel insertion has no carry and no extra effects", () => {
  for (const delay of [0, 8, 32, 63]) {
    const sc = scenario({ cursor: 0 });
    const rng = { calls: 0 };
    const result = originalCurrentEnqueue2FBF(
      {
        ...wheelIO(sc),
        nextRandomByte() {
          rng.calls += 1;
          return 0xff;
        },
      },
      0x000b,
      0,
      delay,
    );
    assert.equal(result.inserted, true);
    assert.equal(result.accepted, true);
    assert.equal(result.offset, delay * 4);
    assert.equal(rng.calls, 0, "fixed delay consumes no random start");
    assert.equal(ensureStrategicEventSchedule(sc).entries.length, 0);
    assert.equal(sc._strategicEventCursor, 0);
    assert.equal(sc._strategicEventDivider, 7);
  }
});

test("V02 refusal targets differ by cause and never redraw the random start", () => {
  const pageFull = scenario({ fill: 64 });
  const full = originalCurrentEnqueue2FBF(wheelIO(pageFull), 0x000b, 0, 32);
  assert.equal(full.accepted, true);
  assert.equal(ensureStrategicEventSchedule(pageFull).entries[0].position, 64);

  const crossMonth = scenario({ fill: 64, cursor: 40 });
  const cross = originalCurrentEnqueue2FBF(
    wheelIO(crossMonth),
    0x000b,
    0,
    32,
  );
  assert.equal(cross.offset, 288);
  assert.equal(
    ensureStrategicEventSchedule(crossMonth).entries[0].position,
    288 >>> 2,
  );

  const randomStart = scenario({ fill: 64 });
  const rng = { calls: 0 };
  const random = originalCurrentEnqueue2FBF(
    {
      ...wheelIO(randomStart),
      nextRandomByte() {
        rng.calls += 1;
        return 0x1f;
      },
    },
    0x000b,
    0,
    0xff,
  );
  assert.equal(random.accepted, true);
  assert.equal(rng.calls, 1, "one random start byte, not two");
  assert.equal(
    ensureStrategicEventSchedule(randomStart).entries[0].position,
    64,
    "the full page still routes to the next epoch",
  );
});

test("V03 a scheduled far event is not dispatched before its position", () => {
  const sc = scenario({ fill: 256, divider: 1 });
  const queued = originalDelayedEnqueue301C(wheelIO(sc), 0x000c, 0x1234, 8);
  assert.equal(queued.accepted, true);
  const [entry] = ensureStrategicEventSchedule(sc).entries;
  assert.equal(entry.position, 256);
  const statuses = [];
  for (let i = 0; i < 65; i += 1) {
    const step = consumeScenarioStrategicEvent(sc);
    statuses.push(step.status);
    sc._strategicEventDivider = 1;
  }
  assert.equal(statuses.at(-1), "page-end");
  assert.equal(
    statuses.filter((status) => status === "dispatch").length,
    64,
    "only the filler records in slots 0..63 dispatch",
  );
  assert.equal(
    ensureStrategicEventSchedule(sc).entries.length,
    1,
    "the far event is still pending",
  );
  const hole = scenario({ cursor: 10 });
  delete hole.strategicEventSlots[10];
  assert.throws(
    () => consumeScenarioStrategicEvent({ ...hole, _strategicEventDivider: 1 }),
    /Uncovered native event slot 10/,
  );
});

test("V04 cursor 63 + delay 2 lands at slot 65 and stays slot 1 after rotation", () => {
  const sc = scenario({ cursor: 63 });
  const result = originalDelayedEnqueue301C(wheelIO(sc), 0x000c, 0x1234, 2);
  assert.equal(result.inserted, true);
  assert.equal(result.offset, 260, "63*4 + 2*4");
  rotateStrategicEventSchedule(sc, {
    cursorSlot: 63,
    readRecord: (slot) => sc.strategicEventSlots[slot],
  });
  assert.equal(sc.strategicEventSchedule.epoch, 1);
  shiftWheel(sc);
  const shifted = sc.strategicEventSlots.slice(0, 64);
  assert.notEqual(shifted[1], null, "old slot 65 becomes new slot 1");
  assert.equal(shifted[2], null, "not slot 2");
});

test("V05 two events queued at delay 6 keep their slots after slot 0 is consumed", () => {
  const sc = scenario({ divider: 1 });
  sc.strategicEventSlots[0] = { type: 10, arg0: 0, arg1: 0, arg2: 0 };
  const io = wheelIO(sc);
  originalDelayedEnqueue301C(io, 0x000c, 0x0001, 6);
  originalCurrentEnqueue2FBF(io, 0x000b, 0, 6);
  assert.equal(sc.strategicEventSlots[6].type, 0x0c);
  assert.equal(sc.strategicEventSlots[7].type, 0x0b);
  const step = consumeScenarioStrategicEvent(sc);
  assert.equal(step.status, "dispatch");
  assert.equal(sc._strategicEventCursor, 1, "one cursor step for slot 0");
  assert.equal(sc.strategicEventSlots[6].type, 0x0c, "future events not shifted");
  assert.equal(sc.strategicEventSlots[7].type, 0x0b);
});

test("V06 multi-month carry neither duplicates nor replays consumed slots", () => {
  const sc = scenario({ cursor: 5 });
  sc.strategicEventSlots[3] = { type: 10, arg0: 3, arg1: 0, arg2: 0 }; // consumed
  sc.strategicEventSlots[5] = { type: 10, arg0: 5, arg1: 0, arg2: 0 };
  sc.strategicEventSlots[9] = { type: 10, arg0: 9, arg1: 0, arg2: 0 };
  rotateStrategicEventSchedule(sc, {
    cursorSlot: 5,
    readRecord: (slot) => sc.strategicEventSlots[slot],
  });
  let entries = ensureStrategicEventSchedule(sc).entries;
  assert.deepEqual(entries.map((entry) => entry.arg0), [5, 9]);
  assert.equal(entries[0].position, 64);
  shiftWheel(sc);
  // Second rotation with cursor 0 leaves the carried pair pending, still once.
  sc._strategicEventCursor = 0;
  rotateStrategicEventSchedule(sc, {
    cursorSlot: 0,
    readRecord: (slot) => sc.strategicEventSlots[slot],
  });
  entries = ensureStrategicEventSchedule(sc).entries;
  assert.deepEqual(entries.map((entry) => entry.arg0), [5, 9]);
  assert.equal(entries[0].position, 128);
  assert.equal(
    entries.length,
    2,
    "the already-consumed slot 3 is never carried or replayed",
  );
});

test("V07 page end and divider underflow create no dispatch", () => {
  const end = scenario({ cursor: 64, divider: 1 });
  assert.equal(consumeScenarioStrategicEvent(end).status, "page-end");
  assert.equal(end._strategicEventDivider, 0);
  assert.equal(end._strategicEventCursor, 64);
  const zero = scenario({ divider: 0 });
  const step = consumeScenarioStrategicEvent(zero);
  assert.deepEqual(step, { status: "divider", divider: 255 });
  assert.equal(zero._strategicEventCursor, 0);
});

test("V08 a 65-entry position is not truncated at 64", () => {
  const sc = scenario({ divider: 1 });
  for (let i = 0; i < 65; i += 1)
    recordOverflowEvent(sc, 0, { type: 10, arg0: i, arg1: 0, arg2: 0 });
  const step = consumeScenarioStrategicEvent(sc);
  assert.equal(step.status, "dispatch");
  assert.equal(step.event.arg0, 0);
  assert.equal(step.rest.length, 64);
  assert.deepEqual(
    step.rest.map((event) => event.arg0),
    Array.from({ length: 64 }, (_, i) => i + 1),
  );
  assert.equal(ensureStrategicEventSchedule(sc).entries.length, 0);
});

test("V11 a cross-month area event uses its snapshot, not a newer region", () => {
  const sc = scenario({ fill: 64 });
  // city 0 must have xLow >= 0xc0 so the 232B gate does not drop the event.
  sc.cities[0].x = 200;
  sc.cities[0].y = 100;
  sc.cities[1].x = 20;
  sc.cities[1].y = 20;
  const rng = { calls: 0, nextByte: () => [1, 0, 0][rng.calls++] ?? 255 };
  performScenarioMonthlyWeatherEvents(sc, rng);
  const [entry] = ensureStrategicEventSchedule(sc).entries;
  assert.deepEqual(entry.region, { minX: 195, maxX: 205, minY: 95, maxY: 105 });
  // A later month narrows the shared bounds to the other city's corner.
  sc._disasterBounds = { minX: 15, maxX: 25, minY: 15, maxY: 25 };
  shiftWheel(sc); // 2BD9 shifts pages right after the carry hook
  advanceTo(sc, 1);
  const step = consumeScenarioStrategicEvent(sc);
  assert.equal(step.status, "dispatch");
  assert.deepEqual(step.event.region, { minX: 195, maxX: 205, minY: 95, maxY: 105 });
  const state = beginScenarioDisasterAreaEvent(sc, { nextByte: () => 0 }, step.event.region);
  for (;;) {
    const result = continueScenarioDisasterAreaEvent(sc, state);
    if (result.status === "return") break;
  }
  assert.ok(sc.cities[0].disaster_event > 0, "snapshot region A damaged city 0");
  assert.equal(sc.cities[1].disaster_event, 0, "newer region B not used");
});

function advanceTo(sc, epoch) {
  while (ensureStrategicEventSchedule(sc).epoch < epoch)
    ensureStrategicEventSchedule(sc).epoch += 1;
  sc._strategicEventCursor = 0;
  sc._strategicEventDivider = 1;
}

test("V15 257-city weather keeps sampling and the schedule intact", () => {
  const sc = scenario({ fill: 64, cities: 257 });
  const rng = {
    calls: 0,
    nextByte: () => [1, 0x00, 0x10, 1, 0][rng.calls++] ?? 255,
  };
  const result = performScenarioMonthlyWeatherEvents(sc, rng);
  assert.equal(result.areaQueued, true);
  const schedule = ensureStrategicEventSchedule(sc);
  assert.equal(schedule.entries.length, 1);
  assert.equal(schedule.entries[0].position, 64);
  assert.ok(sc.cities.length === 257);
});

test("V16 every producer adapter uses the schedule and the old table is gone", () => {
  const dir = join(process.cwd(), "web/src/game/navigation");
  const sources = readdirSync(dir)
    .filter((name) => name.endsWith(".js"))
    .map((name) => [name, readFileSync(join(dir, name), "utf8")]);
  assert.equal(
    sources.filter(([, text]) => text.includes("strategiceventoverflow")).length,
    0,
    "no module references the retired side table",
  );
  const adapters = sources.filter(([, text]) =>
    text.includes("queueOverflowRecord(record"),
  );
  assert.ok(adapters.length >= 5, `expected five adapters, saw ${adapters.length}`);
  for (const [name, text] of adapters)
    assert.ok(
      text.includes("recordOverflowEvent"),
      `${name} must record into the schedule`,
    );
});

test("V17 fresh 2BD9 advances one epoch and restore does not", () => {
  const sc = scenario();
  assert.equal(ensureStrategicEventSchedule(sc).epoch, 0);
  rotateStrategicEventSchedule(sc, { cursorSlot: 0, readRecord: () => null });
  assert.equal(ensureStrategicEventSchedule(sc).epoch, 1);
  rotateStrategicEventSchedule(sc, { cursorSlot: 0, readRecord: () => null });
  assert.equal(ensureStrategicEventSchedule(sc).epoch, 2);
  const saved = JSON.parse(JSON.stringify(sc.strategicEventSchedule));
  const state = { strategicEventSlots: sc.strategicEventSlots };
  applyWebMetaToState(state, { scenarioRuntimeState: { strategicEventSchedule: saved } });
  assert.equal(state.strategicEventSchedule.epoch, 2, "restore does not re-rotate");
  assert.equal(state.strategicEventSchedule.entries.length, 0);
});

test("V18 metadata failure cannot leave a half record", () => {
  const sc = scenario({ fill: 256 });
  assert.throws(
    () => recordOverflowEvent(sc, absolutePosition(0, 4), { type: 0x1ff, arg0: 0, arg1: 0, arg2: 0 }),
    /type is not a byte/,
  );
  assert.equal(ensureStrategicEventSchedule(sc).entries.length, 0);
  assert.equal(
    sc.strategicEventSlots.every((event) => event?.type === 99),
    true,
    "wheel untouched by the refused metadata write",
  );
  const queued = originalDelayedEnqueue301C(wheelIO(sc), 0x000c, 0x1234, 8);
  assert.equal(queued.accepted, true);
  assert.equal(queued.offset, 0x400);
});
