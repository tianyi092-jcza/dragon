import assert from "node:assert/strict";
import fs from "node:fs/promises";

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
const { applyBattleResult } = await import("../web/src/game/ai.js");
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
  ability: { force: 10, lead: 10, field: 1, siege: 4, naval: 0 },
});
const legion = (leader, faction, x, y, troops = 600) => ({
  leader,
  faction,
  x,
  y,
  prevX: x,
  prevY: y,
  troops,
  morale: 200,
  units: structuredClone(fixedUnits),
  status: 0x80,
  _active: true,
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
    { idx: 0, capital: 0, monarch_idx: 0, active: true },
    { idx: 1, capital: 1, monarch_idx: 1, active: true },
  ];
  const generals = [
    general(0, "甲", 0),
    general(1, "乙", 1),
    general(2, "丙", 1),
  ];
  return {
    cities,
    factions,
    generals,
    legions: [],
    diplomacy: [
      [0xff, 0],
      [0, 0xff],
    ],
    citiesOf(faction) {
      return this.cities.filter((candidate) => candidate.faction === faction);
    },
  };
};

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
  target.x = 255;
  target.y = 9;
  target.faction = 1;
  sc.cities[2].x = 246;
  sc.cities[2].y = 15;
  sc.factions[1].capital = 2;
  const attacker = legion("甲", 0, target.x, target.y, 500);
  const defenderA = legion("乙", 1, target.x, target.y, 400);
  const defenderB = legion("丙", 1, target.x, target.y, 350);
  defenderA.slot = 9;
  defenderB.slot = 3;
  sc.legions = [attacker, defenderA, defenderB];
  const events = [];
  applyBattleResult(
    { scenario: sc, hud: { flashEvent: (message) => events.push(message) } },
    attacker,
    target,
    "atk",
    480,
    [80, 80, 80, 80, 80, 80],
  );
  assert.equal(target.faction, 0);
  assert.equal(
    target.troops,
    120,
    "0x4CF3 must preserve 0x51B3-damaged city troops",
  );
  assert.equal(attacker.troops, 480);
  assert.equal(attacker.commandState, 8);
  assert.ok(defenderA._retreat);
  assert.ok(defenderB._retreat);
  assert.equal(defenderA.target.idx, defenderB.target.idx);
  assert.equal(defenderA._retreat.captorFaction, 0);
  assert.equal(defenderA._path, null);
  assert.equal(defenderB._path, null);
  assert.match(events[0], /守軍撤退2/);
}

{
  const sc = makeScenario();
  const target = sc.cities[1];
  const attacker = legion("甲", 0, target.x, target.y, 500);
  const weakDefender = legion("乙", 1, target.x, target.y, 100);
  const primaryDefender = legion("丙", 1, target.x, target.y, 500);
  weakDefender.slot = 1;
  primaryDefender.slot = 2;
  sc.legions = [attacker, weakDefender, primaryDefender];
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
  );
  assert.equal(primaryDefender.troops, 240);
  assert.equal(weakDefender.troops, 100);
}

{
  const sc = makeScenario();
  const target = sc.cities[1];
  const attacker = legion("甲", 0, target.x, target.y, 500);
  const weakDefender = legion("乙", 1, target.x, target.y, 100);
  const primaryDefender = legion("丙", 1, target.x, target.y, 500);
  weakDefender.morale = 100;
  primaryDefender.morale = 240;
  sc.legions = [attacker, weakDefender, primaryDefender];
  let openedDefender = null;
  const app = {
    scenario: sc,
    battleView: { active: false },
    startBattle(_attacker, _city, defender) {
      openedDefender = defender;
    },
  };
  const targetBefore = target.faction;
  attacker.target = target;
  const { aiTick } = await import("../web/src/game/ai.js");
  aiTick(app);
  assert.equal(target.faction, targetBefore);
  assert.equal(openedDefender, primaryDefender);
}

{
  const sc = makeScenario();
  const target = sc.cities[2];
  target.x = 255;
  target.y = 9;
  const attacker = legion("甲", 0, target.x, target.y, 500);
  sc.legions = [attacker];
  const events = [];
  applyBattleResult(
    { scenario: sc, hud: { flashEvent: (message) => events.push(message) } },
    attacker,
    target,
    "def",
    300,
    [50, 50, 50, 50, 50, 50],
    77,
  );
  assert.equal(target.faction, 1);
  assert.equal(target.troops, 77);
  assert.equal(attacker.troops, 300);
  assert.ok(attacker._retreat);
  assert.equal(attacker._retreat.captorFaction, 1);
  assert.match(events[0], /失利/);
}

{
  const sc = makeScenario();
  const target = sc.cities[1];
  const attacker = legion("甲", 0, target.x, target.y, 500);
  sc.legions = [attacker];
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
  sc.legions = [attacker, defender];
  applyBattleResult(
    { scenario: sc, hud: { flashEvent() {} } },
    attacker,
    oldCapital,
    "atk",
    450,
    [75, 75, 75, 75, 75, 75],
  );
  assert.equal(sc.factions[1].capital, fallback.idx);
  assert.equal(sc.factions[1].active, true);
  assert.equal(sc.factions[1].dead, false);
  assert.ok(defender._retreat || defender.dead);
}

{
  const sc = makeScenario();
  const lastCity = sc.cities[1];
  sc.cities[2].faction = 0;
  const attacker = legion("甲", 0, lastCity.x, lastCity.y, 500);
  const defender = legion("乙", 1, lastCity.x, lastCity.y, 400);
  sc.legions = [attacker, defender];
  const messages = [];
  const app = {
    scenario: sc,
    hud: { flashEvent() {} },
    gamebar: { enqueueStrategicMessage: (message) => messages.push(message) },
  };
  applyBattleResult(
    app,
    attacker,
    lastCity,
    "atk",
    450,
    [75, 75, 75, 75, 75, 75],
  );
  assert.equal(sc.factions[1].dead, true);
  assert.equal(sc.factions[1]._extinctionHandled, true);
  assert.equal(
    messages.filter((message) => message.kind === "faction-extinction").length,
    1,
  );
  assert.ok(
    defender._retreat || defender.dead,
    "0x4DA4守军处理必须先于0x4FCE灭亡通知",
  );
  assert.equal(sc.generals[2].faction, 1, "未闭合的0x4FCE武将去向不得臆造改写");
  applyBattleResult(
    app,
    attacker,
    lastCity,
    "atk",
    450,
    [75, 75, 75, 75, 75, 75],
  );
  assert.equal(
    messages.filter((message) => message.kind === "faction-extinction").length,
    1,
  );
}

process.stdout.write(
  "siege result OK: mode0 autoresolve, city damage, shared garrison retreat, extinction order\n",
);
