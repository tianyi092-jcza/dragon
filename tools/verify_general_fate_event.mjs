import assert from "node:assert/strict";

import {
  processMonthlyGeneralFates,
  tickStrategicWarEvents,
} from "../web/src/game/ai.js";

function fixture(randomBytes = []) {
  const strategicEventSlots = Array(256).fill(null);
  const messages = [];
  const scenario = {
    player_faction: 0,
    factions: [
      { idx: 0, active: true, capital: 0 },
      { idx: 1, active: true, capital: 1 },
      { idx: 2, active: false, dead: true, capital: null },
      { idx: 3, active: true, capital: 2 },
    ],
    cities: [
      { idx: 0, faction: 0 },
      { idx: 1, faction: 1 },
      { idx: 2, faction: 3 },
    ],
    generals: [],
    legions: [],
    strategicEventSlots,
    _strategicEventCursor: 0,
    _strategicEventDivider: 1,
  };
  const app = {
    scenario,
    originalRng: { nextByte: () => randomBytes.shift() ?? 0xff },
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

const general = (idx, extra = {}) => ({
  idx,
  name: `將${idx}`,
  active: true,
  status: 4,
  faction: 1,
  join_faction: 3,
  origFaction: 0,
  captive_flag: 0,
  ...extra,
});

// 0x5940: random >= 0x40 does nothing and consumes exactly one byte.
{
  const { app, scenario } = fixture([0x40]);
  const g = general(0);
  scenario.generals = [g];
  assert.deepEqual(processMonthlyGeneralFates(app), []);
  assert.equal(g.faction, 1);
  assert.equal(g.origFaction, 0);
  assert.equal(scenario.strategicEventSlots.filter(Boolean).length, 0);
}

// random 0x20..0x3F and current == scheduled join: immediate clear, no event.
{
  const { app, scenario, messages } = fixture([0x20]);
  const g = general(0, { faction: 0, join_faction: 0 });
  scenario.generals = [g];
  assert.deepEqual(processMonthlyGeneralFates(app), []);
  assert.equal(g.status, 0);
  assert.equal(g.faction, 0);
  assert.equal(g.origFaction, null);
  assert.equal(g.captive_flag, 0xff);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].talkIndex, 66);
  assert.equal(messages[0].kind, "general-joined");
}

// random < 0x20: delay (random&15)+8 slots, event bytes type/general/FF/FF,
// then current faction becomes original neutral sentinel 0x18.
{
  const { app, scenario, messages } = fixture([0x05]);
  const g = general(0, { faction: 0 });
  scenario.generals = [g];
  const queued = processMonthlyGeneralFates(app);
  assert.deepEqual(queued, [{ type: 9, arg0: 0, arg1: 0xff, arg2: 0xff }]);
  assert.deepEqual(scenario.strategicEventSlots[13], queued[0]);
  assert.equal(g.faction, 0x18);
  assert.equal(g.origFaction, 0);
  assert.equal(g.captive_flag, 0);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].talkIndex, 65);
  assert.equal(messages[0].kind, "general-fate-pending");
}

// Collision scan is forward from the requested slot through all four pages.
{
  const { app, scenario } = fixture([0x00]);
  const g = general(0);
  scenario.generals = [g];
  scenario.strategicEventSlots[8] = { type: 10 };
  processMonthlyGeneralFates(app);
  assert.equal(scenario.strategicEventSlots[9].type, 9);
}

// 0x3485 -> 0x50D7: a living origin is restored; player receives TALK37-equivalent report.
{
  const { app, scenario, messages } = fixture();
  const g = general(0, { faction: 0x18 });
  scenario.generals = [g];
  scenario.strategicEventSlots[0] = {
    type: 9,
    arg0: 0,
    arg1: 0xff,
    arg2: 0xff,
  };
  assert.equal(tickStrategicWarEvents(app), true);
  assert.equal(g.status, 0);
  assert.equal(g.faction, 0);
  assert.equal(g.origFaction, null);
  assert.equal(g.captive_flag, 0xff);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].kind, "general-returned");
  assert.equal(messages[0].talkIndex, 37);
  assert.equal(messages[0].personalitySelector, 0x199);
}

// Dead/inactive original faction yields unowned general, with no player report.
{
  const { app, scenario, messages } = fixture();
  const g = general(0, {
    faction: 0x18,
    origFaction: 2,
    captive_flag: 2,
  });
  scenario.generals = [g];
  scenario.strategicEventSlots[0] = {
    type: 9,
    arg0: 0,
    arg1: 0xff,
    arg2: 0xff,
  };
  assert.equal(tickStrategicWarEvents(app), true);
  assert.equal(g.faction, null);
  assert.equal(g.origFaction, null);
  assert.equal(g.captive_flag, 0xff);
  assert.equal(messages.length, 0);
}

process.stdout.write(
  "general fate event OK: 0x585F/0x5940 producer, type9 4-byte delay, 0x3485/0x50D7 restore\n",
);
