import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { initializeLegionSlotState } from "../web/src/game/legionphase.js";
import { findRoadRoute, roadNodeAt } from "../web/src/game/roadgraph.js";

globalThis.window = {};
globalThis.fetch = async (url) => {
  const data = await fs.readFile(new URL(`../web/${url}`, import.meta.url));
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () =>
      data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
    json: async () => {
      try {
        return JSON.parse(data.toString("utf8"));
      } catch (error) {
        throw new Error(`invalid JSON fixture ${url}`, { cause: error });
      }
    },
  };
};

const {
  applySiegeCityDamage,
  applyTacticalSiegeCityDamage,
  baseArmyPower,
  createCityGarrison,
  resolveStrategicBattle,
} = await import("../web/src/game/autobattle.js");
const { applyBattleResult, updateFactionAfterCityCapture } = await import(
  "../web/src/game/ai.js"
);
const { OriginalBattleRng } = await import(
  "../web/src/game/battle/originalrng.js"
);
const { loadTerrain } = await import("../web/src/game/pathfind.js");
await loadTerrain();

const fixedUnits = Array.from({ length: 6 }, (_, index) => ({
  type: [1, 1, 3, 3, 2, 2][index],
  troops: 1000,
}));
const general = (idx, name, faction) => ({
  idx,
  name,
  faction,
  status: 1,
  active: true,
  attr: 0x80,
  battle_rating: 0,
  captive_flag: 0xff,
  origFaction: null,
  ability: { force: 10, lead: 10, field: 1, siege: 4, naval: 0 },
});
const legion = (leader, faction, x, y, troops = 600, generalIdx = faction) => ({
  leader,
  faction,
  generalIdx,
  slot: generalIdx,
  moveDelay: 1,
  movePeriod: 3,
  x,
  y,
  prevX: x,
  prevY: y,
  troops,
  morale: 200,
  units: fixedUnits.map((unit, index) => ({
    ...unit,
    troops: Math.max(0, Math.min(100, troops - index * 100)) * 10,
  })),
  status: 0x80,
  _active: true,
  _march: null,
  _path: null,
  _retreat: null,
});
const city = (idx, faction, x, y, troops = 120) => ({
  idx,
  name: `城${idx}`,
  faction,
  x,
  y,
  troops,
  troops_cap: 200,
  growth: 150,
  defence: 140,
});
const makeScenario = () => {
  const cities = [city(0, 0, 257, 9), city(1, 1, 218, 11), city(2, 1, 246, 15)];
  const factions = [
    { idx: 0, capital: 0, monarch_idx: 0, active: true, n_legions: 0 },
    { idx: 1, capital: 1, monarch_idx: 1, active: true, n_legions: 0 },
  ];
  const generals = [
    general(0, "甲", 0),
    general(1, "乙", 1),
    general(2, "丙", 1),
  ];
  const sc = {
    cities,
    factions,
    generals,
    player_faction: 0,
    legions: [],
    diplomacy: [
      [0xff, 0],
      [0, 0xff],
    ],
    citiesOf(faction) {
      return this.cities.filter((candidate) => candidate.faction === faction);
    },
  };
  initializeLegionSlotState(sc);
  return sc;
};
function putLegions(sc, records, counts) {
  assert.equal(sc.legions.length, 0); // new fixture construction, never runtime count repair
  sc.factions.forEach((faction, index) => {
    faction.n_legions = counts[index];
  });
  sc.legions.push(...records);
}
function prepareSiegeApproach(record, source, target) {
  const edge = findRoadRoute(source.x, source.y, target.x, target.y).legs.at(
    -1,
  );
  assert.ok(edge.points.length >= 2);
  const point = edge.points.at(-2);
  Object.assign(record, {
    x: point.x,
    y: point.y,
    prevX: point.x,
    prevY: point.y,
    target,
    targetCity: target.idx,
    targetNode: roadNodeAt(target.x, target.y).id,
    status: record.status | 0x21,
    _march: {
      currentNode: edge.fromNode,
      fromNode: edge.fromNode,
      toNode: edge.toNode,
      edgeId: edge.edgeId,
      stride: edge.stride,
      pointIndex: edge.points.length - 1,
      points: structuredClone(edge.points),
      targetNode: roadNodeAt(target.x, target.y).id,
      targetX: target.x,
      targetY: target.y,
    },
    _engagement: { kind: "siege", target: { cityIdx: target.idx } },
  });
  record._path = record._march.points.slice(record._march.pointIndex);
}

{
  const sc = makeScenario();
  sc.cities = [
    {
      ...city(0, 0, 10, 10),
      type: 8,
      prod: 10,
    },
    {
      ...city(1, 0, 20, 20),
      type: 9,
      prod: 20,
    },
    {
      ...city(2, 1, 30, 30),
      type: 7,
      prod: 30,
    },
    {
      ...city(3, 1, 40, 40),
      type: 6,
      prod: 40,
    },
  ];
  sc.factions[1].capital = 0;
  const capital = updateFactionAfterCityCapture(sc, 1);
  assert.equal(capital.idx, 3);
  assert.equal(
    sc.factions[1].capital,
    3,
    "0x4DF0必须按0x6A3D重选首都，而不是退化为最低idx据点",
  );
}

{
  const target = city(9, 1, 50, 50, 121);
  const garrison = createCityGarrison(target);
  assert.equal(garrison.generalIdx, 0x7f);
  assert.equal(garrison._commanderProfile.ability.force, 8);
  assert.equal(garrison._commanderProfile.ability.lead, 8);
  assert.equal(garrison._commanderProfile.ability.siege, 0);
  assert.equal(garrison._commanderProfile.ability.field, 0);
  assert.equal(garrison._commanderProfile.ability.naval, 0);
  assert.equal(garrison.morale, 0xff);
  assert.equal(garrison.units.length, 6);
  assert.ok(garrison.units.every((unit) => unit.type === 3));
  assert.equal(
    garrison.units.reduce((sum, unit) => sum + unit.troops, 0),
    1210,
  );
  assert.equal(baseArmyPower(garrison, 0, target.troops), 15004);

  const sc = makeScenario();
  const attacker = legion("甲", 0, 257, 9);
  const result = resolveStrategicBattle(sc, attacker, garrison, {
    mode: 0,
    cityDefence: target.troops,
    rng: new OriginalBattleRng({ ch: 1, cl: 2, dh: 3 }),
  });
  assert.ok(["atk", "def"].includes(result.winner));
  assert.equal(result.attack.units.length, 6);
  assert.equal(result.defence.units.length, 6);

  const damage = applySiegeCityDamage(target, 8);
  assert.equal(damage, 13);
  assert.equal(target.troops, 108);
  assert.equal(target.growth, 137);
  assert.equal(target.defence, 127);
  const wrapped = city(10, 1, 50, 50, 100);
  assert.equal(applySiegeCityDamage(wrapped, 100), 54);
  assert.equal(wrapped.troops, 46);

  const intactTactical = city(11, 1, 50, 50, 120);
  const tactical = city(12, 1, 50, 50, 120);
  const walls = Array.from({ length: 16 }, () => ({
    kind: 1,
    intact: true,
    metric: 1000,
  }));
  assert.equal(applyTacticalSiegeCityDamage(intactTactical, walls), 0);
  walls[3].metric = 500;
  walls[3].intact = false;
  assert.equal(applyTacticalSiegeCityDamage(tactical, walls), 15);
  assert.equal(tactical.troops, 105);
  assert.equal(tactical.growth, 135);
  assert.equal(tactical.defence, 125);
}

{
  const sc = makeScenario();
  const target = sc.cities[0];
  target.faction = 1;
  sc.cities[1].faction = 0;
  sc.factions[0].capital = 1;
  sc.cities[2].x = 246;
  sc.cities[2].y = 15;
  sc.factions[1].capital = 2;
  const attacker = legion("甲", 0, target.x, target.y, 500);
  const defenderA = legion("乙", 1, target.x, target.y, 400);
  const defenderB = legion("丙", 1, target.x, target.y, 350, 2);
  defenderA.slot = 9;
  defenderB.slot = 3;
  defenderA.commandState = 1;
  defenderB.commandState = 2;
  prepareSiegeApproach(attacker, sc.cities[2], target);
  putLegions(sc, [attacker, defenderA, defenderB], [1, 2]);
  const position = { x: attacker.x, y: attacker.y };
  const originalMarch = structuredClone(attacker._march);
  applyBattleResult(
    {
      scenario: sc,
      hud: {
        flashEvent() {
          assert.fail("strategic siege results must use the TALK FIFO");
        },
      },
    },
    attacker,
    target,
    "atk",
    480,
    [80, 80, 80, 80, 80, 80],
    null,
    null,
    defenderA,
    null,
    null,
    { oldFaction: 1, defenders: [defenderB, defenderA] },
  );
  assert.equal(target.faction, 0);
  assert.equal(
    target.troops,
    120,
    "0x4CF3 must preserve 0x51B3-damaged city troops",
  );
  assert.equal(attacker.troops, 480);
  assert.equal(attacker.commandState, 8);
  assert.deepEqual(
    { x: attacker.x, y: attacker.y },
    position,
    "474A/4CF3 do not teleport the winner",
  );
  assert.deepEqual({ x: attacker.prevX, y: attacker.prevY }, position);
  assert.deepEqual(attacker._march, originalMarch);
  assert.equal(attacker.target, target, "破城胜军保留原进攻目标");
  assert.equal(attacker.targetCity, target.idx);
  assert.equal(attacker.targetNode, 0);
  assert.equal(attacker.moveDelay, 1);
  assert.equal(defenderA.commandState, 8, "实际参战主守军由0x474A转8");
  assert.equal(defenderB.commandState, 2, "0x4DA4不得覆盖同城其余守军状态");
  assert.equal(defenderA.target.idx, defenderB.target.idx);
  assert.equal(defenderA._retreat, null);
  assert.equal(defenderB._retreat, null);
  assert.equal(defenderA.moveDelay, 1);
  assert.equal(defenderB.moveDelay, 1);
  assert.equal(defenderA._path, null);
  assert.equal(defenderB._path, null);
}

{
  const sc = makeScenario();
  const target = sc.cities[1];
  const attacker = legion("甲", 0, target.x, target.y, 500);
  const weakDefender = legion("乙", 1, target.x, target.y, 100);
  const primaryDefender = legion("丙", 1, target.x, target.y, 500, 2);
  weakDefender.slot = 1;
  primaryDefender.slot = 2;
  weakDefender.commandState = 1;
  primaryDefender.commandState = 0;
  putLegions(sc, [attacker, weakDefender, primaryDefender], [1, 2]);
  applyBattleResult(
    { scenario: sc, hud: { flashEvent() {} } },
    attacker,
    target,
    "def",
    300,
    [50, 50, 50, 50, 50, 50],
    null,
    null,
    primaryDefender,
    240,
    [40, 40, 40, 40, 40, 40],
    { oldFaction: 1, defenders: [weakDefender, primaryDefender] },
  );
  assert.equal(primaryDefender.troops, 240);
  assert.equal(primaryDefender.commandState, 8);
  assert.equal(primaryDefender.target, undefined);
  assert.equal(weakDefender.troops, 100);
  assert.equal(weakDefender.commandState, 1);
  assert.equal(weakDefender.target, undefined);
}

{
  const sc = makeScenario();
  const target = sc.cities[1];
  const attacker = legion("甲", 0, target.x, target.y, 500);
  const weakDefender = legion("乙", 1, target.x, target.y, 100);
  const primaryDefender = legion("丙", 1, target.x, target.y, 500, 2);
  weakDefender.morale = 100;
  primaryDefender.morale = 240;
  prepareSiegeApproach(attacker, sc.cities[2], target);
  putLegions(sc, [attacker, weakDefender, primaryDefender], [1, 2]);
  sc.legionSlotCounters[attacker.slot] = 1;
  let openedDefender = null;
  const app = {
    scenario: sc,
    originalRng: { nextByte: () => 0xff },
    battleView: { active: false },
    startBattle(_attacker, _city, defender) {
      openedDefender = defender;
      this.battleView.active = true;
    },
  };
  const targetBefore = target.faction;
  attacker.target = target;
  const { aiTick } = await import("../web/src/game/ai.js");
  aiTick(app, { legionBatchStart: 0, runCityDaily: false, settleDaily: false });
  assert.equal(app._strategicBattleFailure, undefined);
  assert.equal(target.faction, targetBefore);
  assert.equal(openedDefender, primaryDefender);
}

{
  const sc = makeScenario();
  const target = sc.cities[2];
  const attacker = legion("甲", 0, target.x, target.y, 500);
  prepareSiegeApproach(attacker, sc.cities[0], target);
  putLegions(sc, [attacker], [1, 0]);
  applyBattleResult(
    {
      scenario: sc,
      hud: {
        flashEvent() {
          assert.fail("strategic siege results must use the TALK FIFO");
        },
      },
    },
    attacker,
    target,
    "def",
    300,
    [50, 50, 50, 50, 50, 50],
    77,
    null,
    null,
    null,
    null,
    { oldFaction: 1, defenders: [] },
  );
  assert.equal(target.faction, 1);
  assert.equal(target.troops, 77);
  assert.equal(attacker.troops, 300);
  assert.ok(attacker._retreat);
  assert.equal(attacker._retreat.captorFaction, 1);
}

{
  const sc = makeScenario();
  const target = sc.cities[1];
  const attacker = legion("甲", 0, target.x, target.y, 500);
  putLegions(sc, [attacker], [1, 0]);
  const before = {
    troops: target.troops,
    growth: target.growth,
    defence: target.defence,
  };
  applyBattleResult(
    { scenario: sc, hud: { flashEvent() {} } },
    attacker,
    target,
    "def",
    300,
    [50, 50, 50, 50, 50, 50],
    null,
    null,
    null,
    null,
    null,
    { oldFaction: 1, defenders: [] },
  );
  assert.equal(target.troops, before.troops);
  assert.equal(target.growth, before.growth);
  assert.equal(target.defence, before.defence);
}

{
  const sc = makeScenario();
  const oldCapital = sc.cities[1];
  const fallback = sc.cities[2];
  const attacker = legion("甲", 0, oldCapital.x, oldCapital.y, 500);
  const defender = legion("乙", 1, oldCapital.x, oldCapital.y, 400);
  putLegions(sc, [attacker, defender], [1, 1]);
  applyBattleResult(
    { scenario: sc, hud: { flashEvent() {} } },
    attacker,
    oldCapital,
    "atk",
    450,
    [75, 75, 75, 75, 75, 75],
    null,
    null,
    defender,
    null,
    null,
    { oldFaction: 1, defenders: [defender] },
  );
  assert.equal(sc.factions[1].capital, fallback.idx);
  assert.equal(sc.factions[1].active, true);
  assert.equal(sc.factions[1].dead, false);
  assert.ok(defender.target === fallback || defender.dead);
  if (!defender.dead) {
    assert.equal(defender._retreat, null);
    assert.equal(defender.moveDelay, 1);
  }
}

{
  const sc = makeScenario();
  const lastCity = sc.cities[1];
  sc.cities[2].faction = 0;
  const attacker = legion("甲", 0, lastCity.x, lastCity.y, 500);
  const defender = legion("乙", 1, lastCity.x, lastCity.y, 400);
  const remote = legion("丙", 1, 255, 9, 100, 2);
  putLegions(sc, [attacker, defender, remote], [1, 2]);
  const originalExit = { oldFaction: 1, defenders: [defender] };
  const messages = [];
  const app = {
    scenario: sc,
    hud: { flashEvent() {} },
    gamebar: {
      enqueueStrategicMessage: (message) => messages.push(message),
      enqueueTalkMessage: (message) => messages.push(message),
    },
  };
  applyBattleResult(
    app,
    attacker,
    lastCity,
    "atk",
    450,
    [75, 75, 75, 75, 75, 75],
    null,
    null,
    defender,
    null,
    null,
    originalExit,
  );
  assert.equal(sc.factions[1].dead, true);
  assert.equal(sc.factions[1]._extinctionHandled, true);
  assert.equal(
    messages.filter((message) => message.kind === "faction-extinction").length,
    1,
  );
  assert.equal(
    messages.find((message) => message.kind === "faction-extinction").talkIndex,
    36,
  );
  assert.ok(
    defender._retreat || defender.dead,
    "0x4DA4守军处理必须先于0x4FCE灭亡通知",
  );
  assert.equal(sc.generals[1].status, 4, "灭亡君主走0x29C3被俘/退场态");
  assert.equal(sc.generals[1].faction, 0, "0x29C3接收方是攻城势力");
  assert.equal(sc.generals[2].status, 0, "非君主且+0x17非零走0x50B4流散");
  assert.equal(sc.generals[2].faction, null);
  applyBattleResult(
    app,
    attacker,
    lastCity,
    "atk",
    450,
    [75, 75, 75, 75, 75, 75],
    null,
    null,
    null,
    null,
    null,
    originalExit,
  );
  assert.equal(
    messages.filter((message) => message.kind === "faction-extinction").length,
    1,
  );
}

process.stdout.write(
  "siege result OK: mode0 autoresolve, city damage, shared garrison retreat, extinction order\n",
);
