import assert from "node:assert/strict";

import {
  enqueueMonthlyDisasterEvents,
  tickStrategicWarEvents,
} from "../web/src/game/ai.js";

function city(idx, extra = {}) {
  return {
    idx,
    name: `城${idx}`,
    faction: idx === 0 ? 0 : 1,
    x: 100 + idx,
    y: 100,
    growth: 100,
    defence: 100,
    raw: "00".repeat(32),
    ...extra,
  };
}

function fixture(bytes = [], count = 24) {
  const messages = [];
  const scenario = {
    player_faction: 0,
    factions: [{ idx: 0 }, { idx: 1 }],
    cities: Array.from({ length: count }, (_, idx) => city(idx)),
    generals: [],
    legions: [],
    strategicEventSlots: Array(256).fill(null),
    disasterMapObjects: [],
    _strategicEventCursor: 0,
    _strategicEventDivider: 1,
  };
  const app = {
    scenario,
    originalRng: { nextByte: () => bytes.shift() ?? 0xff },
    gamebar: {
      enqueueStrategicMessage(message) {
        messages.push(message);
      },
      enqueueTalkMessage(message) {
        messages.push(message);
      },
    },
  };
  return { app, scenario, messages };
}

// 0x22DB hit: bit, selector, x-low gate, fixed slot offset; all city riot gates then fail.
{
  const bytes = [1, 0, 1, 7];
  for (let i = 0; i < 24; i++) bytes.push(0xff, 0xff);
  const { app, scenario } = fixture(bytes);
  const events = enqueueMonthlyDisasterEvents(app);
  assert.equal(events[0].type, 11);
  assert.deepEqual(scenario.strategicEventSlots[15], {
    type: 11,
    arg0: 0,
    arg1: 0,
    arg2: 0,
  });
  assert.deepEqual(scenario._disasterBounds, {
    minX: 95,
    maxX: 105,
    minY: 95,
    maxY: 105,
  });
}

// 0x2286 first branch: gate <24 and roll >= city+11, event {12,1,cityPtr}.
{
  const { app, scenario } = fixture([0, 0, 63], 1);
  scenario.cities[0].defence = 10;
  const events = enqueueMonthlyDisasterEvents(app);
  assert.deepEqual(events, [{ type: 12, arg0: 1, cityPointer: 0x840 }]);
}

// Type11 handler consumes one byte and writes exact city +15 analogue, reporting player hits.
{
  const { app, scenario, messages } = fixture([0x0f], 2);
  scenario._disasterBounds = { minX: 95, maxX: 105, minY: 95, maxY: 105 };
  scenario.strategicEventSlots[0] = { type: 11, arg0: 0, arg1: 0, arg2: 0 };
  assert.equal(tickStrategicWarEvents(app), true);
  assert.equal(scenario.cities[0].disaster_event, 39);
  assert.equal(scenario.cities[1].disaster_event, 39);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].kind, "disaster-area");
  assert.equal(messages[0].talkIndex, 70);
}

// Type12 create allocates object, uses 2 RNG bytes, and schedules type12 removal.
{
  const { app, scenario, messages } = fixture([3, 2], 1);
  scenario.strategicEventSlots[0] = { type: 12, arg0: 1, cityPointer: 0x840 };
  assert.equal(tickStrategicWarEvents(app), true);
  assert.deepEqual(scenario.disasterMapObjects, [{ kind: 1, x: 100, y: 100 }]);
  assert.equal(scenario.cities[0].disaster_event, 7);
  assert.deepEqual(scenario.strategicEventSlots[9], {
    type: 12,
    arg0: 0,
    cityPointer: 0x840,
  });
  assert.equal(messages[0].kind, "disaster-object");
  assert.equal(messages[0].talkIndex, 71);

  scenario._strategicEventCursor = 9;
  scenario._strategicEventDivider = 1;
  assert.equal(tickStrategicWarEvents(app), true);
  assert.equal(scenario.disasterMapObjects.length, 0);
  assert.equal(scenario.cities[0].disaster_event, 0);
}

// type12 arg0=2 uses TALK72 (暴動), distinct from arg0=1 TALK71 (大火).
{
  const { app, scenario, messages } = fixture([0, 0], 1);
  scenario.strategicEventSlots[0] = { type: 12, arg0: 2, cityPointer: 0x840 };
  assert.equal(tickStrategicWarEvents(app), true);
  assert.equal(messages[0].talkIndex, 72);
}

// 0x34B1 uses a 32-slot object table: slots 17..32 remain valid, the 33rd is rejected.
{
  const bytes = [];
  for (let index = 0; index < 33; index++) bytes.push(0, 0);
  const { app, scenario } = fixture(bytes, 33);
  for (let index = 0; index < 33; index++) {
    scenario.strategicEventSlots[index] = {
      type: 12,
      arg0: 1,
      cityPointer: 0x840 + index * 0x20,
    };
  }
  for (let index = 0; index < 32; index++) {
    scenario._strategicEventCursor = index;
    scenario._strategicEventDivider = 1;
    tickStrategicWarEvents(app);
  }
  assert.equal(scenario.disasterMapObjects.length, 32);
  scenario._strategicEventCursor = 32;
  scenario._strategicEventDivider = 1;
  tickStrategicWarEvents(app);
  assert.equal(scenario.disasterMapObjects.length, 32);
}

process.stdout.write(
  "disaster events OK: type11/12 producers, area handler, object lifecycle and delayed removal\n",
);
