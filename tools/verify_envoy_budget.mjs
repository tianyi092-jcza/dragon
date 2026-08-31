import assert from "node:assert/strict";

import {
  envoyBudgetRequest,
  prepareEnvoyBudgetReports,
} from "../web/src/game/diplomacy.js";
import { tickEnvoyDiplomacy } from "../web/src/game/ai.js";

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

process.stdout.write(
  "envoy budget verification passed: request formula, monthly report, budget-gated politics effect\n",
);
