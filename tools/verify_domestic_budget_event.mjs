import assert from "node:assert/strict";

import {
  enqueueDomesticBudgetEvents,
  tickStrategicWarEvents,
} from "../web/src/game/ai.js";
import {
  applyFactionFundsDelta,
  computeFactionExpense,
} from "../web/src/game/economy.js";

class ImageStub {
  set src(_value) {
    queueMicrotask(() => this.onload?.());
  }
}
globalThis.Image = ImageStub;
globalThis.fetch = async () => ({
  json: async () => ({ strings: Array.from({ length: 1023 }, () => []) }),
});
const { GameBar } = await import("../web/src/ui/gamebar.js");

function fixture() {
  return {
    player_faction: 0,
    factions: [{ idx: 0, active: true, money: 50000, gold: 50000 }],
    generals: [
      {
        idx: 0,
        name: "內政官",
        faction: 0,
        assignment_budget: 0,
        ability: { politics: 10 },
      },
      {
        idx: 1,
        name: "忙碌官",
        faction: 0,
        assignment_budget: 2,
        ability: { politics: 8 },
      },
    ],
    cities: [
      {
        idx: 0,
        name: "甲城",
        faction: 0,
        governor: 0,
        growth: 160,
        defence: 170,
        troops_cap: 100,
        troops: 90,
      },
      {
        idx: 1,
        name: "乙城",
        faction: 0,
        governor: 1,
        growth: 100,
        defence: 100,
        troops_cap: 100,
        troops: 50,
      },
      {
        idx: 2,
        name: "敵城",
        faction: 1,
        governor: 0,
        growth: 0,
        defence: 0,
        troops_cap: 100,
        troops: 0,
      },
    ],
    legions: [],
    strategicEventSlots: Array(256).fill(null),
    _strategicEventCursor: 0,
    _strategicEventDivider: 1,
  };
}

const sc = fixture();
const rngBytes = [0, 0x20];
const app = {
  scenario: sc,
  originalRng: { nextByte: () => rngBytes.shift() ?? 0 },
};
const queued = enqueueDomesticBudgetEvents(app);
assert.deepEqual(queued, [{ type: 4, arg0: 0, amount: 1000 }]);
assert.deepEqual(sc.strategicEventSlots[0], queued[0]);
assert.equal(sc.strategicEventSlots.filter(Boolean).length, 1);

let report = null;
app.gamebar = {
  enqueueDomesticBudgetReport(payload) {
    report = payload;
  },
};
assert.equal(tickStrategicWarEvents(app), true);
assert.deepEqual(report, { cityIdx: 0, requested: 1000 });

const stale = fixture();
stale.strategicEventSlots[0] = { type: 4, arg0: 0, amount: 1000 };
stale.cities[0].governor = null;
assert.equal(
  tickStrategicWarEvents({
    scenario: stale,
    gamebar: {
      enqueueDomesticBudgetReport() {
        throw new Error("stale governor event must not open audience");
      },
    },
  }),
  false,
);

const expenseScenario = fixture();
expenseScenario.citiesOf = (idx) =>
  expenseScenario.cities.filter((city) => city.faction === idx);
assert.equal(
  computeFactionExpense(expenseScenario, 0),
  40,
  "type4 request amounts are not pre-charged in monthly expenses",
);

const faction = { money: 50000, gold: 50000 };
applyFactionFundsDelta(faction, -1000);
assert.equal(faction.money, 49000);
assert.equal(Math.floor(1000 / 128), 7, "0x3AE2/3AE4 budget byte");

const budgetFaction = { money: 50000, gold: 50000 };
const budgetGeneral = { idx: 0, assignment_budget: 0 };
const budgetCity = { governor: 0 };
const budgetHost = {
  app: {
    scenario: { factions: [budgetFaction] },
    view: { draw() {} },
  },
  proposalAudience: {
    type: "domestic-budget",
    playerFaction: budgetFaction,
    city: budgetCity,
    advGen: budgetGeneral,
    budgetRequested: 1000,
  },
  _setProposalTimer(_delay, action) {
    this.proposalAudience.timerAction = action;
  },
  _closeBudgetAudience() {
    this.closed = true;
  },
};
await GameBar.prototype._finishBudgetAudience.call(budgetHost, 1000, "accept");
assert.equal(budgetFaction.money, 49000);
assert.equal(budgetGeneral.assignment_budget, 7);
assert.equal(budgetHost.proposalAudience.step, "envoy_budget_result");

const staleBudgetHost = {
  ...budgetHost,
  closed: false,
  proposalAudience: {
    ...budgetHost.proposalAudience,
    city: { governor: 1 },
    advGen: { idx: 0, assignment_budget: 0 },
  },
};
await GameBar.prototype._finishBudgetAudience.call(
  staleBudgetHost,
  1000,
  "accept",
);
assert.equal(staleBudgetHost.closed, true);
assert.equal(staleBudgetHost.proposalAudience.advGen.assignment_budget, 0);

process.stdout.write(
  "domestic budget event OK: 0x5715 request formula/filter, type4 dispatch, stale governor guard\n",
);
