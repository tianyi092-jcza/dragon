import assert from "node:assert/strict";

import {
  envoyBudgetRequest,
  prepareEnvoyBudgetReports,
} from "../web/src/game/diplomacy.js";
import {
  tickEnvoyDiplomacy,
  tickFactionStrategicState,
  tickStrategicWarEvents,
} from "../web/src/game/ai.js";
import {
  computeFactionExpense,
  factionReserveUpkeepTick,
  updateFactionFiscalCrisis,
} from "../web/src/game/economy.js";

function fixture(raw = 0xb4) {
  const envoyGeneral = {
    idx: 1,
    name: "夏侯惇",
    portrait: 1,
    assignment_budget: 0,
    ability: { politics: 10 },
  };
  return {
    player_faction: 0,
    factions: [
      { idx: 0, n_cities: 1, active: true, money: 50000 },
      { idx: 1, n_cities: 1, active: true, money: 50000 },
    ],
    generals: [
      { idx: 0, name: "曹操", ability: { politics: 8 } },
      envoyGeneral,
    ],
    diplomacy: [
      [0xff, raw],
      [raw, 0xff],
    ],
    _envoyDiplomacyCursor: 1,
    envoys: {
      1: {
        name: "夏侯惇",
        gen_idx: 1,
        budget: 0,
        requested: 0,
        reportPending: false,
      },
    },
  };
}

const peace = fixture(0xb4); // 52
assert.equal(envoyBudgetRequest(peace, 1), (100 - 52) * 200);
assert.deepEqual(prepareEnvoyBudgetReports(peace), [
  { targetIdx: 1, requested: 9600 },
]);
assert.equal(peace.envoys[1].reportPending, true);
peace.envoys[1].budget = 1;
assert.deepEqual(
  prepareEnvoyBudgetReports(peace),
  [],
  "预算尚未耗尽时不应再次申请",
);

const war = fixture(40);
assert.equal(envoyBudgetRequest(war, 1), (125 - 40) * 200);

const noBudget = fixture(0xb4);
let calls = 0;
assert.equal(
  tickEnvoyDiplomacy({
    scenario: noBudget,
    originalRng: { nextByte: () => (calls++, 0) },
  }),
  false,
);
assert.equal(calls, 0, "没有预算时不应消费随机数或改善关系");

const funded = fixture(0xb4);
funded.envoys[1].budget = Math.floor(9600 / 128);
const rolls = [0, 0];
assert.equal(
  tickEnvoyDiplomacy({
    scenario: funded,
    originalRng: { nextByte: () => rolls.shift() ?? 0 },
  }),
  true,
);
assert.equal(funded.envoys[1].budget, 75 - (23 - 10));
assert.equal(funded.generals[1].assignment_budget, 62);
assert.equal(funded.diplomacy[1][0], 0xb5);
assert.equal(funded.diplomacy[0][1], 0xb5);

const healthy = {
  idx: 0,
  attr: 0xc0,
  active: true,
  money: 50000,
  n_cities: 2,
  target_faction: 1,
};
assert.equal(updateFactionFiscalCrisis(healthy), false);
assert.equal(healthy.target_faction, 1);
assert.equal(healthy.attr & 0x40, 0);
const lowFunds = { ...healthy, attr: 0x80, money: 8000 };
assert.equal(updateFactionFiscalCrisis(lowFunds), true);
assert.equal(lowFunds.target_faction, null);
assert.equal(lowFunds.attr & 0x40, 0);
const deficit = { ...healthy, attr: 0x80, money: -1 };
assert.equal(updateFactionFiscalCrisis(deficit), true);
assert.equal(deficit.attr & 0x40, 0x40);

const reserveFaction = {
  idx: 0,
  attr: 0x80,
  active: true,
  money: 50000,
  n_cities: 1,
  reserve_cav: 320,
  reserve_arc: 160,
  reserve_inf: 160,
};
assert.equal(factionReserveUpkeepTick(reserveFaction), 20);
const reserveScenario = {
  player_faction: 0,
  factions: [reserveFaction],
  generals: [],
  citiesOf: () => [],
};
assert.equal(tickFactionStrategicState({ scenario: reserveScenario }), false);
assert.equal(reserveFaction.monthly_reserve_upkeep, 20);
assert.equal(computeFactionExpense(reserveScenario, 0), 20);

const eventOrder = [];
const strategicEventSlots = Array(256).fill(null);
strategicEventSlots[0] = { type: 1, aggressor: 1, defender: 0 };
strategicEventSlots[1] = { type: 1, aggressor: 2, defender: 0 };
const eventScenario = {
  _strategicEventCursor: 0,
  _strategicEventDivider: 2,
  strategicEventSlots,
  player_faction: 0,
  factions: [
    { idx: 0, active: true },
    { idx: 1, active: true, monarch_idx: 1 },
    { idx: 2, active: true, monarch_idx: 2 },
  ],
  generals: [{ idx: 0 }, { idx: 1 }, { idx: 2 }],
  diplomacy: [
    [0xff, 0xb0, 0xb0],
    [0xb0, 0xff, 0xb0],
    [0xb0, 0xb0, 0xff],
  ],
};
const eventApp = {
  scenario: eventScenario,
  gamebar: {
    enqueueStrategicMessage(message) {
      if (message.onClose) eventOrder.push(eventScenario._strategicEventCursor);
    },
  },
};
assert.equal(tickStrategicWarEvents(eventApp), false);
assert.equal(eventScenario._strategicEventCursor, 0);
assert.equal(tickStrategicWarEvents(eventApp), true);
assert.equal(eventScenario._strategicEventCursor, 1);
for (let i = 0; i < 9; i++)
  assert.equal(tickStrategicWarEvents(eventApp), false);
assert.equal(tickStrategicWarEvents(eventApp), true);
assert.equal(eventScenario._strategicEventCursor, 2);
assert.deepEqual(eventOrder, [1, 2]);

process.stdout.write(
  "envoy/faction tick verification passed: budget, fiscal crisis, reserve upkeep and 7/10 event cadence\n",
);
