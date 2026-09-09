import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { cityDaily } from "../web/src/game/ai.js";
import {
  appointDomesticGovernor,
  dismissDomesticGovernor,
  domesticGovernorCandidates,
} from "../web/src/game/commands.js";
import { snapshotState } from "../web/src/game/savegame.js";
import {
  activateNextMonthPolicy,
  computeConscriptionYields,
  monthlySettlement,
} from "../web/src/game/economy.js";

async function loadOfficialData() {
  try {
    return JSON.parse(
      await readFile(new URL("../web/data.json", import.meta.url), "utf8"),
    );
  } catch (error) {
    throw new Error("failed to load official data.json", { cause: error });
  }
}

const officialData = await loadOfficialData();

function controlledRng(bytes) {
  const calls = [];
  return {
    calls,
    nextByte() {
      const value = bytes[calls.length] ?? 0;
      calls.push(value);
      return value;
    },
  };
}

function oneCityScenario({ faction = 0, budget = 1, troops = 50 } = {}) {
  return {
    player_faction: 0,
    generals: [
      {
        idx: 0,
        active: true,
        faction: 0,
        status: 2,
        assignment_budget: budget,
        ability: { politics: 12, force: 8, lead: 1 },
      },
    ],
    cities: [
      {
        idx: 0,
        faction,
        governor: 0,
        growth: 100,
        defence: 170,
        troops,
        troops_cap: 100,
      },
    ],
  };
}

// 官方第一章解析必须只保存city[+0x11] defence，不产生Web旧disaster镜像。
{
  const sourceCity = officialData.scenarios[16].cities.find(
    (city) => city.faction != null,
  );
  assert.equal(sourceCity.defence, 100);
  assert.equal("disaster" in sourceCity, false);
  const city = {
    ...sourceCity,
    idx: 0,
    faction: 0,
    governor: null,
    troops: 100,
    troops_cap: 100,
  };
  const sc = { player_faction: 0, generals: [], cities: [city] };
  const rng = controlledRng([0, 0]);
  cityDaily(sc, rng);
  assert.equal(city.defence, 101);
  assert.equal("disaster" in city, false);
  assert.equal(rng.calls.length, 2);
}

// 玩家确认的默认军师是玩家化身：保留原武将记录，但不得进入内政官候选。
{
  const faction = { idx: 0, monarch_idx: 0, advisor_idx: 1 };
  const sc = {
    generals: [
      { idx: 0, faction: 0, status: 5, is_monarch: true },
      { idx: 1, faction: 0, status: 0, is_player: true },
      { idx: 2, faction: 0, status: 1 },
      { idx: 3, faction: 1, status: 0 },
      { idx: 4, faction: 0, status: 0 },
    ],
  };
  assert.deepEqual(
    domesticGovernorCandidates(sc, faction).map((general) => general.idx),
    [4],
  );
  sc.generals[1].is_player = false;
  sc.player_advisor = { custom: false, general_idx: 1 };
  assert.deepEqual(
    domesticGovernorCandidates(sc, faction).map((general) => general.idx),
    [4],
    "saved advisor identity must exclude the avatar even before marker rebuild",
  );
  const city = { governor: null };
  const general = sc.generals[4];
  general.assignment_budget = 9;
  appointDomesticGovernor(city, general);
  assert.equal(city.governor, 4);
  assert.equal(general.status, 2);
  assert.equal(general.assignment_budget, 9);
  dismissDomesticGovernor(city, general);
  assert.equal(city.governor, null);
  assert.equal(general.status, 0);
  assert.equal(general.assignment_budget, 0);
}

// 0x4194：有预算的玩家内政官先扣预算，政治控制门控/步长，武术控制补兵。
{
  const sc = oneCityScenario();
  const rng = controlledRng([15, 15, 0]);
  cityDaily(sc, rng);
  assert.equal(sc.generals[0].assignment_budget, 0);
  assert.equal(sc.cities[0].growth, 98); // +2，再为4城兵扣4
  assert.equal(sc.cities[0].defence, 172);
  assert.equal(sc.cities[0].troops, 54);
  assert.equal(rng.calls.length, 3);

  const zeroBudgetRng = controlledRng([15, 15, 0]);
  cityDaily(sc, zeroBudgetRng);
  assert.equal(sc.cities[0].growth, 97); // 基准cl=5两门控失败，补1兵扣1
  assert.equal(sc.cities[0].defence, 172);
  assert.equal(sc.cities[0].troops, 55);
  assert.equal(zeroBudgetRng.calls.length, 3);
}

// 城兵已满时只消费固定前两字节；从预算1扣到0的当轮仍享受加成。
{
  const sc = oneCityScenario({ troops: 100 });
  const rng = controlledRng([15, 15]);
  cityDaily(sc, rng);
  assert.equal(sc.generals[0].assignment_budget, 0);
  assert.equal(sc.cities[0].growth, 102);
  assert.equal(sc.cities[0].defence, 172);
  assert.equal(rng.calls.length, 2);
}

// AI和中立城固定cl=8/dl=4，忽略内政官及其预算；中立槽也必须推进RNG。
for (const faction of [1, null]) {
  const sc = oneCityScenario({ faction, budget: 5 });
  const rng = controlledRng([9, 9, 0]);
  cityDaily(sc, rng);
  assert.equal(sc.generals[0].assignment_budget, 5);
  assert.equal(sc.cities[0].growth, 96);
  assert.equal(sc.cities[0].defence, 170);
  assert.equal(sc.cities[0].troops, 54);
  assert.equal(rng.calls.length, 3);
}

// 0x5547三地带兵种比例，严格按逐次移位取整。
{
  const cities = [
    { idx: 0, faction: 0, x: 0, y: 0, prod: 2048 },
    { idx: 1, faction: 0, x: 0, y: 100, prod: 2048 },
    { idx: 2, faction: 0, x: 0, y: 160, prod: 2048 },
  ];
  const yields = cities.map((city) => {
    const sc = {
      factions: [{ idx: 0, capital: city.idx }],
      cities,
      citiesOf: (idx) => (idx === 0 ? [city] : []),
    };
    return computeConscriptionYields(sc, 0);
  });
  assert.deepEqual(yields, [
    { cav: 19, arc: 1, inf: 12 },
    { cav: 4, arc: 4, inf: 24 },
    { cav: 1, arc: 16, inf: 15 },
  ]);
}

// 0x5358先按当前政策和旧生产力结算；0x5695以prod高字节作倍率且不重复治理；
// 0x53A6由独立边界在其余月结事件之后转正次月政策。
{
  const city = {
    idx: 0,
    faction: 0,
    x: 0,
    y: 0,
    prod: 4096,
    max_prod: 10000,
    growth: 101,
    defence: 170,
    troops: 100,
    troops_cap: 100,
    type: 4,
  };
  const faction = {
    idx: 0,
    capital: 0,
    money: 0,
    gold: 0,
    reserve_cav: 0,
    reserve_arc: 0,
    reserve_inf: 0,
    monthly_reserve_upkeep: 0,
  };
  const sc = {
    player_faction: 0,
    tax: 10,
    next_tax: 20,
    conscription: [0, 0, 0],
    next_conscription: [10, 20, 30],
    factions: [faction],
    generals: [],
    cities: [city],
    legions: [],
    citiesOf: (idx) => (idx === 0 ? [city] : []),
  };
  const report = monthlySettlement(sc, null, controlledRng([0]));
  assert.equal(report[0].income, 204); // floor((4096/2)*10%)，不是更新后的prod
  assert.equal(faction.gold, 204);
  assert.equal(city.prod, 4264); // +floor((prod>>8)*21/2) = +168
  assert.equal(city.growth, 121);
  assert.equal(city.defence, 170);
  assert.equal(sc.tax, 10);
  assert.deepEqual(sc.conscription, [0, 0, 0]);
  activateNextMonthPolicy(sc);
  assert.equal(sc.tax, 20);
  assert.deepEqual(sc.conscription, [10, 20, 30]);
}

// 非玩家势力收入是raw/2，不是Web旧值25%。
{
  const city = {
    idx: 0,
    faction: 1,
    x: 0,
    y: 0,
    prod: 4096,
    max_prod: 10000,
    growth: 100,
    defence: 100,
    troops: 100,
    troops_cap: 100,
  };
  const faction = {
    idx: 1,
    capital: 0,
    money: 0,
    gold: 0,
    reserve_cav: 0,
    reserve_arc: 0,
    reserve_inf: 0,
    monthly_reserve_upkeep: 0,
  };
  const sc = {
    player_faction: 0,
    tax: 10,
    conscription: [0, 0, 0],
    factions: [null, faction],
    generals: [],
    cities: [city],
    legions: [],
    citiesOf: (idx) => (idx === 1 ? [city] : []),
  };
  const report = monthlySettlement(sc, null, controlledRng([0]));
  assert.equal(report[0].income, 1024);
  assert.equal(faction.gold, 1024);
}

// 已批准的general[+0x1A]预算与city[+0x19]任命必须进入浏览器快照往返。
{
  const scenario = {
    factions: [{ idx: 0 }],
    cities: [{ idx: 0, governor: 0, defence: 170 }],
    generals: [{ idx: 0, status: 2, assignment_budget: 7 }],
    legions: [],
    diplomacy: [],
  };
  const saved = snapshotState(
    {
      scenarioIdx: 0,
      scenario,
      clock: { year: 190, month: 1, day: 1, daysInMonth: 31 },
      gamebar: { _strategicMessageActive: false, proposalAudience: null },
    },
    0,
    "DOMESTIC",
  );
  assert.equal(saved.state.cities[0].governor, 0);
  assert.equal(saved.state.cities[0].defence, 170);
  assert.equal(saved.state.generals[0].status, 2);
  assert.equal(saved.state.generals[0].assignment_budget, 7);
}

process.stdout.write(
  "domestic governance OK: 0x4194 budget/force/RNG, neutral slots, 0x5358 policy order, 0x5695 production, 0x5547 yields and save round-trip\n",
);
