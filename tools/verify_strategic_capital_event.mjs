import assert from "node:assert/strict";

import {
  enqueueStrategicCapitalEvents,
  tickStrategicWarEvents,
} from "../web/src/game/ai.js";

function rawCity({ attr = 0, type = 0, prod = 0 } = {}) {
  const bytes = new Uint8Array(32);
  bytes[0] = attr;
  bytes[0x0e] = prod & 0xff;
  bytes[0x0f] = (prod >>> 8) & 0xff;
  bytes[0x16] = type & 0x0f;
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join(
    "",
  );
}

function fixture(bytes = []) {
  const messages = [];
  const scenario = {
    player_faction: 0,
    factions: [
      { idx: 0, active: true, capital: 0, target_faction: null },
      {
        idx: 1,
        active: true,
        capital: 1,
        target_faction: null,
        monarch: "乙",
        diplomat_idx: 0,
      },
      { idx: 2, active: true, capital: 4, target_faction: 1 },
    ],
    cities: [
      { idx: 0, faction: 0, name: "玩家城", raw: rawCity() },
      { idx: 1, faction: 1, name: "舊都", raw: rawCity({ type: 3, prod: 10 }) },
      {
        idx: 2,
        faction: 1,
        name: "普通城",
        raw: rawCity({ type: 2, prod: 20 }),
      },
      {
        idx: 3,
        faction: 1,
        name: "候選新都",
        raw: rawCity({ attr: 0x20, type: 1, prod: 30 }),
      },
      { idx: 4, faction: 2, name: "丙城", raw: rawCity() },
    ],
    generals: [{ idx: 0, name: "外交官" }],
    legions: [],
    strategicEventSlots: Array(256).fill(null),
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
    },
  };
  return { app, scenario, messages };
}

// 0x2D3A runs for each active targetless faction, including player; RNG<0x40 queues
// literal {8,faction,FF,FF}. A faction with an existing target consumes no RNG.
{
  const { app, scenario } = fixture([0x40, 0x00]);
  const events = enqueueStrategicCapitalEvents(app);
  assert.deepEqual(events, [{ type: 8, arg0: 1, arg1: 0xff, arg2: 0xff }]);
  assert.equal(scenario.strategicEventSlots.filter(Boolean).length, 1);
  assert.deepEqual(scenario.strategicEventSlots.find(Boolean), events[0]);
}

// 0x33EA drops player-faction events before selection.
{
  const { app, scenario } = fixture();
  scenario.strategicEventSlots[0] = {
    type: 8,
    arg0: 0,
    arg1: 0xff,
    arg2: 0xff,
  };
  assert.equal(tickStrategicWarEvents(app), false);
  assert.equal(scenario.factions[0].capital, 0);
}

// 0x6A3D scan: city3 wins because type decreases, production increases and attr low5
// is zero. 0x4502 retargets only active same-faction legions whose +20 is old capital.
{
  const { app, scenario, messages } = fixture();
  scenario.legions = [
    {
      faction: 1,
      _active: true,
      status: 0x80,
      target: scenario.cities[1],
      targetCity: 1,
      targetNode: 3 << 3,
      _march: { stale: true },
    },
    {
      faction: 1,
      _active: true,
      status: 0x80,
      target: scenario.cities[2],
      targetCity: 2,
      targetNode: 2 << 3,
      _march: { keep: true },
    },
    {
      faction: 0,
      _active: true,
      target: scenario.cities[1],
      targetCity: 1,
    },
  ];
  scenario.strategicEventSlots[0] = {
    type: 8,
    arg0: 1,
    arg1: 0xff,
    arg2: 0xff,
  };
  assert.equal(tickStrategicWarEvents(app), true);
  assert.equal(scenario.factions[1].capital, 3);
  assert.equal(scenario.legions[0].target, scenario.cities[3]);
  assert.equal(scenario.legions[0].targetCity, 3);
  assert.equal(scenario.legions[0].targetNode, 1 << 3);
  assert.equal(scenario.legions[0]._march, null);
  assert.equal(scenario.legions[0].status & 2, 2);
  assert.equal(scenario.legions[1].target, scenario.cities[2]);
  assert.equal(scenario.legions[1]._march.keep, true);
  assert.equal(scenario.legions[2].target, scenario.cities[1]);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].kind, "capital-relocation");
  assert.equal(messages[0].gen.name, "外交官");
}

// No diplomat means the AI relocation mutates state silently.
{
  const { app, scenario, messages } = fixture();
  scenario.factions[1].diplomat_idx = null;
  scenario.strategicEventSlots[0] = {
    type: 8,
    arg0: 1,
    arg1: 0xff,
    arg2: 0xff,
  };
  assert.equal(tickStrategicWarEvents(app), true);
  assert.equal(scenario.factions[1].capital, 3);
  assert.equal(messages.length, 0);
}

process.stdout.write(
  "strategic capital event OK: 0x2D3A type8 producer, 0x6A3D selection, 0x4502 retarget and report\n",
);
