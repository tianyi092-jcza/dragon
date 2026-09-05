import assert from "node:assert/strict";

import { aiTick, tickStrategicCity } from "../web/src/game/ai.js";

function units(counts = [50, 50, 50, 50, 50, 50]) {
  return counts.map((count, index) => {
    let type = 3;
    if (index < 2) type = 1;
    else if (index < 4) type = 2;
    return { type, troops: count * 10 };
  });
}

function makeScenario({
  fiscal = false,
  targetAttr = 0x80,
  assigned = 1,
} = {}) {
  const capital = {
    idx: 0,
    faction: 0,
    x: 10,
    y: 10,
    attr: targetAttr,
    raw: "00".repeat(32),
  };
  const target = {
    idx: 1,
    faction: 0,
    x: 20,
    y: 20,
    attr: targetAttr,
    raw: "00".repeat(32),
  };
  const faction = {
    idx: 0,
    raw: `${"00".repeat(0x18)}02${"00".repeat(0x27)}`,
    attr: 0x80 | (fiscal ? 0x40 : 0),
    capital: 0,
    reserve_cav: 100,
    reserve_arc: 100,
    reserve_inf: 100,
    legion_morale_cap: 200,
    n_legions: assigned,
  };
  return {
    factions: [faction],
    cities: [capital, target],
    generals: [],
    delayedLegionReturns: [],
    pendingStrategicEvents: [],
    player_faction: 7,
    legions: [],
    citiesOf(factionIdx) {
      return this.cities.filter((city) => city.faction === factionIdx);
    },
  };
}

function legion(overrides = {}) {
  return {
    slot: 1,
    status: 0xc4,
    faction: 0,
    x: 20,
    y: 20,
    troops: 500,
    morale: 200,
    units: units(),
    _active: true,
    targetNode: 1,
    roadEdgeOrNode: 8,
    commandState: 0,
    ...overrides,
  };
}

function tick(sc, rng = null) {
  aiTick(
    {
      scenario: sc,
      originalRng: rng,
    },
    { runCityDaily: false, settleDaily: false },
  );
}

// 0x4028：真实SINARIO raw[0]仅有邻接低位；轮询时必须按FE威胁/
// 战略目标候选重算运行态bit7/bit6，不能伪造静态raw高位。
{
  const sc = makeScenario();
  const raw = new Uint8Array(32);
  raw[0] = 1;
  raw[0x1c] = 1;
  sc.cities[0].raw = Array.from(raw, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  delete sc.cities[0].attr;
  sc.cities[1].faction = 1;
  sc.factions[0].target_faction = 1;
  sc.factions.push({ idx: 1, active: true, capital: 1 });
  sc.diplomacy = [
    [0xff, 0],
    [0, 0xff],
  ];
  tickStrategicCity({ scenario: sc }, 0);
  assert.equal(sc.cities[0].attr, 0xc1);
  sc.factions[0].target_faction = null;
  tickStrategicCity({ scenario: sc }, 0);
  assert.equal(sc.cities[0].attr, 0x81);
  sc.diplomacy[0][1] = 0xff;
  tickStrategicCity({ scenario: sc }, 0);
  assert.equal(sc.cities[0].attr, 0x01);
}

// 0x3F29：据点所属变化时，旧所属势力+0x17接收该城索引。
{
  const sc = makeScenario();
  sc.factions.push({ idx: 1, attr: 0x80, active: true });
  sc.cities[1]._strategicLastFaction = 0;
  sc.cities[1].faction = 1;
  tickStrategicCity({ scenario: sc }, 1);
  assert.equal(sc.factions[0].strategic_city_secondary, 1);
}

// 0x439D→0x43A5：NPC状态0只按目标城attr bit6转态；原版这里没有首都低兵补员。
{
  const sc = makeScenario();
  const L = legion({ target: sc.cities[1], commandState: 0 });
  sc.legions = [L];
  tick(sc);
  assert.equal(L.commandState, 1);
}
{
  const sc = makeScenario();
  const L = legion({
    target: sc.cities[0],
    x: sc.cities[0].x,
    y: sc.cities[0].y,
    targetNode: 0,
    roadEdgeOrNode: 0,
    commandState: 0,
    troops: 100,
  });
  sc.legions = [L];
  tick(sc);
  assert.equal(L.commandState, 1);
  assert.equal(L.troops, 100);
}
{
  const sc = makeScenario({ targetAttr: 0xc0 });
  const L = legion({ target: sc.cities[1], commandState: 0 });
  sc.legions = [L];
  tick(sc);
  assert.equal(L.commandState, 0);
}

// 0x43AF：NPC状态1在>300兵时，目标城attr bit6置位回0；attr>=0x80时仅DI别名byte+0x18>2才随机转2，<=2保持1并检查首都补员。
{
  const sc = makeScenario({ targetAttr: 0xc0 });
  const L = legion({ target: sc.cities[1], commandState: 1 });
  sc.legions = [L];
  tick(sc);
  assert.equal(L.commandState, 0);
}
{
  const calls = [];
  const sc = makeScenario();
  const L = legion({ target: sc.cities[1], commandState: 1 });
  sc.legions = [L];
  tick(sc, {
    nextByte() {
      calls.push(0xab);
      return 0xab;
    },
  });
  assert.equal(L.commandState, 1);
  assert.equal(calls.length, 0);
}
{
  const calls = [];
  const sc = makeScenario();
  const raw = Uint8Array.from(sc.factions[0].raw.match(/../g), (byte) =>
    Number.parseInt(byte, 16),
  );
  raw[0x38] = 3;
  sc.factions[0].raw = Array.from(raw, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const L = legion({ target: sc.cities[1], commandState: 1 });
  sc.legions = [L];
  tick(sc, {
    nextByte() {
      calls.push(0xab);
      return 0xab;
    },
  });
  assert.equal(L.commandState, 2);
  assert.equal(L.cooldown, 4);
  assert.equal(calls.length, 1);
}

// 0x440F/0x442F：NPC状态2在财政危机下跳过势力+0x17，只消费+0x16并转0。
{
  const sc = makeScenario({ fiscal: true, targetAttr: 0x00 });
  sc.factions[0].strategic_city_secondary = 1;
  sc.factions[0].strategic_city_primary = 0;
  const L = legion({ target: sc.cities[1], commandState: 2 });
  sc.legions = [L];
  tick(sc);
  assert.equal(L.target, sc.cities[0]);
  assert.equal(L.commandState, 0);
  assert.equal(sc.factions[0].strategic_city_secondary, 1);
  assert.equal(sc.factions[0].strategic_city_primary, null);
}

// 0x4466：NPC状态3六队任一<300人转11；全部>=300人转8。
{
  const sc = makeScenario();
  const L = legion({
    target: sc.cities[1],
    commandState: 3,
    units: units([30, 30, 29, 30, 30, 30]),
  });
  sc.legions = [L];
  tick(sc);
  assert.equal(L.commandState, 11);
}
{
  const sc = makeScenario();
  const L = legion({
    target: sc.cities[1],
    commandState: 3,
    units: units([30, 30, 30, 30, 30, 30]),
  });
  sc.legions = [L];
  tick(sc);
  assert.equal(L.commandState, 8);
}

// 0x4483：状态8仅在达到势力士气上限时回1。
{
  const sc = makeScenario();
  const L = legion({ target: sc.cities[1], commandState: 8, morale: 199 });
  sc.legions = [L];
  tick(sc);
  assert.equal(L.commandState, 8);
  L.morale = 200;
  tick(sc);
  assert.equal(L.commandState, 1);
}

// 0x44A9：状态10锁定首都；抵达后无总兵门槛，直接进入9并同轮按预备兵重编到状态3。
{
  const sc = makeScenario();
  const L = legion({
    target: sc.cities[1],
    commandState: 10,
    troops: 300,
    morale: 1,
  });
  sc.legions = [L];
  tick(sc);
  assert.equal(L.target, sc.cities[0]);
  assert.equal(L.commandState, 10);
  L.x = sc.cities[0].x;
  L.y = sc.cities[0].y;
  L.targetNode = 0;
  L.roadEdgeOrNode = 0;
  tick(sc);
  assert.equal(L.commandState, 9);
  tick(sc);
  assert.equal(L.commandState, 3);
  assert.equal(L.troops, 600);
  assert.equal(L.morale, 1, "状态10→9补员全链不读取或改写士气");
}
{
  const sc = makeScenario();
  const L = legion({
    target: sc.cities[0],
    x: sc.cities[0].x,
    y: sc.cities[0].y,
    targetNode: 0,
    roadEdgeOrNode: 0,
    commandState: 10,
    troops: 600,
  });
  sc.legions = [L];
  tick(sc);
  assert.equal(L.commandState, 9, "状态10抵达首都不检查总兵<600");
  tick(sc);
  assert.equal(L.commandState, 3, "状态9在下一次槽调度执行重编");
}

// 0x433D的门槛是state<8，不是state<4：NPC原始状态5偏移到处理器9。
{
  const sc = makeScenario();
  const L = legion({
    target: sc.cities[0],
    x: sc.cities[0].x,
    y: sc.cities[0].y,
    targetNode: 0,
    roadEdgeOrNode: 0,
    commandState: 5,
    troops: 300,
  });
  sc.legions = [L];
  tick(sc);
  assert.equal(L.commandState, 3);
  assert.equal(L.troops, 600);
}
{
  const sc = makeScenario();
  sc.factions[0].reserve_inf = 0;
  sc.factions[0].reserve_cav = 0;
  sc.factions[0].reserve_arc = 0;
  const L = legion({
    target: sc.cities[0],
    x: sc.cities[0].x,
    y: sc.cities[0].y,
    targetNode: 0,
    roadEdgeOrNode: 0,
    commandState: 9,
    troops: 600,
  });
  sc.legions = [L];
  tick(sc);
  assert.equal(L.commandState, 3, "状态9即使无可补预备兵也无条件转状态3");
  tick(sc);
  assert.equal(L.commandState, 8, "NPC六队均不少于300人时转状态8而非解散");
}
{
  const sc = makeScenario();
  sc.factions[0].reserve_inf = 0;
  sc.factions[0].reserve_cav = 0;
  sc.factions[0].reserve_arc = 0;
  const L = legion({
    target: sc.cities[0],
    x: sc.cities[0].x,
    y: sc.cities[0].y,
    targetNode: 0,
    roadEdgeOrNode: 0,
    commandState: 9,
    troops: 179,
    units: units([30, 30, 29, 30, 30, 30]),
  });
  sc.legions = [L];
  tick(sc);
  assert.equal(L.commandState, 3);
  tick(sc);
  assert.equal(
    L.commandState,
    11,
    "NPC补员后任一队少于300人时转状态11；不是按总兵阈值",
  );
}
{
  const sc = makeScenario();
  sc.player_faction = 0;
  sc.factions[0].reserve_inf = 0;
  sc.factions[0].reserve_cav = 0;
  sc.factions[0].reserve_arc = 0;
  const L = legion({
    target: sc.cities[0],
    x: sc.cities[0].x,
    y: sc.cities[0].y,
    targetNode: 0,
    roadEdgeOrNode: 0,
    commandState: 9,
    troops: 179,
    units: units([30, 30, 29, 30, 30, 30]),
  });
  sc.legions = [L];
  tick(sc);
  assert.equal(L.commandState, 3);
  tick(sc);
  assert.equal(
    L.commandState,
    9,
    "玩家势力（包括委任军团）后备不足时继续补员循环，不走NPC自动解散",
  );
  assert.equal(L.dead, undefined);
}

// 0x44D6→0x463E：状态11抵达首都后解散，六队兵归还预备池，武将回待命。
{
  const sc = makeScenario();
  sc.generals = [{ idx: 0, name: "甲", status: 1 }];
  const L = legion({
    leader: "甲",
    generalIdx: 0,
    target: sc.cities[0],
    x: 10,
    y: 10,
    targetNode: 0,
    roadEdgeOrNode: 0,
    commandState: 11,
  });
  sc.legions = [L];
  const before = sc.factions[0].reserve_cav;
  tick(sc);
  assert.equal(sc.legions.length, 0);
  assert.equal(sc.generals[0].status, 0);
  assert.equal(sc.factions[0].reserve_cav, before + 100);
}

process.stdout.write(
  "legion command state verification passed: 0x4325 city/fiscal bit6 gates and states 8/10/11\n",
);
