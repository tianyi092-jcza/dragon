import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  envoyBudgetRequest,
  prepareEnvoyBudgetReports,
} from "../web/src/game/diplomacy.js";
import {
  initializeStrategicDiplomacy,
  monthlyDiplomacyAI,
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
      {
        idx: 1,
        n_cities: 1,
        active: true,
        money: 50000,
        diplomat_idx: 1,
      },
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
peace.generals[1].assignment_budget = 1;
assert.deepEqual(
  prepareEnvoyBudgetReports(peace),
  [],
  "预算尚未耗尽时不应再次申请",
);

const authoritativeAssignment = fixture(0xb4);
delete authoritativeAssignment.envoys;
assert.deepEqual(prepareEnvoyBudgetReports(authoritativeAssignment), [
  { targetIdx: 1, requested: 9600 },
]);
assert.equal(authoritativeAssignment.envoys[1].gen_idx, 1);
assert.equal(authoritativeAssignment.envoys[1].name, "夏侯惇");

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
assert.equal(
  calls,
  1,
  "0x3E96先做概率门：有外交官但预算为0时仍消费第一次随机数",
);

const funded = fixture(0xb4);
funded.envoys[1].budget = Math.floor(9600 / 128);
funded.generals[1].assignment_budget = funded.envoys[1].budget;
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
    enqueueTalkMessage(message) {
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

// 原版第一章「呂布歸天」：曹操派政治14的荀攸驻刘备。
// 月结0x2BD9先令刘备→曹操再降1，随后0x578F应申请9600；
// 关系改善先推刘备→曹操，超过反向值后曹操→刘备才追赶，绝非按月直接加政治/金额公式。
{
  let library;
  try {
    library = JSON.parse(
      readFileSync(new URL("../web/data.json", import.meta.url), "utf8"),
    );
  } catch (error) {
    throw new Error("failed to load official scenario fixture", {
      cause: error,
    });
  }
  const scenario = structuredClone(library.scenarios[16]);
  scenario.player_faction = 0;
  const app = {
    scenario,
    originalRng: { nextByte: () => 0xff },
  };
  initializeStrategicDiplomacy(app);
  const liuBei = scenario.factions.find(
    (faction) => faction.monarch === "劉備",
  );
  const xunYou = scenario.generals.find(
    (general) => general.name?.trim?.() === "荀攸",
  );
  assert.equal(liuBei.idx, 2);
  assert.equal(xunYou.ability.politics, 14);
  scenario.envoys = {
    [liuBei.idx]: {
      name: xunYou.name.trim(),
      gen_idx: xunYou.idx,
      budget: 0,
      requested: 0,
      reportPending: false,
    },
  };
  liuBei.diplomat_idx = xunYou.idx;
  xunYou.assignment_budget = 0;

  monthlyDiplomacyAI(app);
  const reports = prepareEnvoyBudgetReports(scenario);
  assert.deepEqual(reports, [{ targetIdx: 2, requested: 9600 }]);
  const budgetPoints = Math.floor(reports[0].requested / 128);
  xunYou.assignment_budget = budgetPoints;
  scenario.envoys[2].budget = budgetPoints;
  assert.deepEqual(
    prepareEnvoyBudgetReports(scenario),
    [],
    "批准的工作预算耗尽前，0x578F不会再次申请",
  );

  const playerToTarget = scenario.diplomacy[0][2];
  const targetToPlayer = scenario.diplomacy[2][0];
  const successApp = {
    scenario,
    originalRng: { nextByte: () => 0 },
  };
  for (let i = 0; i < 4; i++) {
    assert.equal(tickEnvoyDiplomacy(successApp, liuBei), true);
  }
  assert.equal(scenario.diplomacy[2][0], targetToPlayer + 4);
  assert.equal(
    scenario.diplomacy[0][2],
    playerToTarget + 1,
    "玩家界面方向须等驻在国→玩家超过反向值后才追赶",
  );
  assert.equal(xunYou.assignment_budget, budgetPoints - 4 * (23 - 14));
}

process.stdout.write(
  "envoy/faction tick verification passed: original chapter Cao Cao/Xun You/Liu Bei, budget authority, RNG order, relation direction, fiscal crisis, reserve upkeep and 7/10 event cadence\n",
);
