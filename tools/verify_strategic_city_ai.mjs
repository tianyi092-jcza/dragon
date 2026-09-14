import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { initializeLegionSlotState } from "../web/src/game/legionphase.js";
import { initializeFactionLegionCounts } from "../web/src/game/legioncounts.js";

let data;
try {
  data = JSON.parse(
    await fs.readFile(new URL("../web/data.json", import.meta.url), "utf8"),
  );
} catch (error) {
  throw new Error(`cannot load strategic AI fixture: ${error.message}`, {
    cause: error,
  });
}
const { aiTick, buildArmies, tickStrategicCity } = await import(
  "../web/src/game/ai.js"
);

// 官方第一章（合集中索引16）：吕布首都79，边境城76邻接曹操88/74。
const sc = structuredClone(data.scenarios[16]);
initializeLegionSlotState(sc);
initializeFactionLegionCounts(sc);
sc.weatherClouds = [];
sc.player_faction = 0;
sc.citiesOf = (idx) => sc.cities.filter((city) => city.faction === idx);
buildArmies(sc);
const luBuFaction = sc.factions.find((faction) => faction.idx === 13);
assert.equal(luBuFaction.capital, 79);
luBuFaction.target_faction = 0;
sc.diplomacy[13][0] = 0;
sc.diplomacy[0][13] = 0;
const border = sc.cities[76];
const capital = sc.cities[79];
assert.equal(border.faction, 13);
assert.equal(capital.faction, 13);
assert.equal(sc.legions.length, 0);

const app = {
  scenario: sc,
  originalRng: { nextByte: () => 0 },
  gamebar: { enqueueTalkMessage: () => assert.fail("AI城不得弹援军消息") },
};
assert.equal(tickStrategicCity(app, 76), true);
assert.equal(border.attr & 0xc0, 0xc0, "战略目标邻城须写运行态attr bit7+6");
assert.equal(sc.legions.length, 1);
const legion = sc.legions[0];
assert.equal(legion.leader, luBuFaction.monarch, "武力最高待命者为吕布");
assert.deepEqual(
  legion.units.map((unit) => unit.type),
  [1, 1, 3, 3, 2, 2],
);
assert.equal(legion.troops, 600);
assert.equal(legion.status & 0x04, 0x04);
assert.equal(legion.x, capital.x);
assert.equal(legion.y, capital.y);
assert.equal(legion.target.idx, border.idx);
assert.deepEqual(
  [luBuFaction.reserve_cav, luBuFaction.reserve_arc, luBuFaction.reserve_inf],
  [200, 300, 400],
);
// 用户现场回归：吕布军团到达椎阳后，目标候选bit6会令NPC状态0保持0，
// 不得因静态raw[0]<0x80而数槽后误走0→1→2→11返首都。
legion.x = border.x;
legion.y = border.y;
legion.prevX = border.x;
legion.prevY = border.y;
legion.target = border;
legion.targetCity = border.idx;
legion.targetNode = border.idx;
legion.roadEdgeOrNode = border.idx * 8;
legion.commandState = 0;
for (let action = 0; action < 4; action++) {
  const visits = legion.moveDelay || 256;
  for (let visit = 0; visit < visits; visit++) {
    aiTick(app, {
      runCityDaily: false,
      settleDaily: false,
      legionBatchStart: Math.floor(legion.slot / 16) * 16,
    });
    assert.equal(app._strategicBattleFailure, undefined);
  }
}
assert.equal(legion.commandState, 0);
assert.equal(legion.target, border);

// 玩家边境空城仅发TALK38式通用消息，并以该城自己的24..39轮询冷却去重。
const playerSc = structuredClone(data.scenarios[16]);
initializeLegionSlotState(playerSc);
initializeFactionLegionCounts(playerSc);
playerSc.player_faction = 13;
playerSc.citiesOf = (idx) =>
  playerSc.cities.filter((city) => city.faction === idx);
buildArmies(playerSc);
const playerFaction = playerSc.factions.find((faction) => faction.idx === 13);
playerFaction.target_faction = 0;
playerSc.diplomacy[13][0] = 0;
playerSc.diplomacy[0][13] = 0;
const messages = [];
let playerRngCalls = 0;
const playerApp = {
  scenario: playerSc,
  originalRng: {
    nextByte: () => {
      playerRngCalls++;
      return 5;
    },
  },
  gamebar: { enqueueTalkMessage: (message) => messages.push(message) },
};
assert.equal(tickStrategicCity(playerApp, 76), true);
assert.equal(messages.length, 1);
assert.equal(messages[0].gen, null);
assert.equal(messages[0].talkIndex, 38);
assert.equal(messages[0].cityName, border.name.trim());
assert.equal(playerRngCalls, 0, "TALK38 must precede its RNG consumption");
assert.equal(playerSc.cities[76]._aiCooldown, undefined);
assert.equal(playerSc.factions[13].strategic_city_primary, null);
messages[0].onClose();
messages[0].onClose();
assert.equal(playerRngCalls, 1, "TALK38 completion consumes exactly one byte");
assert.equal(playerSc.cities[76]._aiCooldown, 29);
assert.equal(playerSc.factions[13].strategic_city_primary, 76);
assert.equal(tickStrategicCity(playerApp, 76), false);
assert.equal(messages.length, 1);

// 0x3FA9的0xFE威胁标记看任一正式交战邻国，不依赖玩家势力+0x19目标。
// AI向玩家宣战时0x35AB明确不写玩家目标，仍必须触发无守军边城TALK38。
const untargetedPlayerSc = structuredClone(data.scenarios[16]);
initializeLegionSlotState(untargetedPlayerSc);
initializeFactionLegionCounts(untargetedPlayerSc);
untargetedPlayerSc.player_faction = 13;
untargetedPlayerSc.citiesOf = (idx) =>
  untargetedPlayerSc.cities.filter((city) => city.faction === idx);
buildArmies(untargetedPlayerSc);
untargetedPlayerSc.factions.find(
  (faction) => faction.idx === 13,
).target_faction = null;
untargetedPlayerSc.diplomacy[13][0] = 0;
untargetedPlayerSc.diplomacy[0][13] = 0;
const untargetedMessages = [];
assert.equal(
  tickStrategicCity(
    {
      scenario: untargetedPlayerSc,
      originalRng: { nextByte: () => 0 },
      gamebar: {
        enqueueTalkMessage: (message) => untargetedMessages.push(message),
      },
    },
    76,
  ),
  true,
);
assert.equal(untargetedMessages.length, 1);
assert.equal(untargetedMessages[0].talkIndex, 38);
assert.equal(
  untargetedPlayerSc.cities[76].attr & 0xc0,
  0x80,
  "无战略目标但存在交战邻城时只写运行态bit7",
);

// 3FFF/407A：CH只累计敌邻城缓存，不含候选记录的+1。
// 本城1军、一个空敌城应请求0+2-1=1军。
const raw = new Uint8Array(0x20);
raw[0] = 1;
raw[0x1c] = 1;
const weakSc = {
  player_faction: 9,
  cities: [
    {
      idx: 0,
      name: "弱城",
      faction: 0,
      x: 10,
      y: 10,
      raw: Buffer.from(raw).toString("hex"),
    },
    { idx: 1, name: "敵城", faction: 1, x: 20, y: 10, raw: "00".repeat(0x20) },
    { idx: 2, name: "首都", faction: 0, x: 0, y: 0, raw: "00".repeat(0x20) },
  ],
  factions: [
    {
      idx: 0,
      active: true,
      target_faction: 1,
      capital: 2,
      money: 0,
      n_legions: 1,
      reserve_cav: 1000,
      reserve_arc: 1000,
      reserve_inf: 1000,
      legion_morale_cap: 200,
    },
    { idx: 1, active: true, capital: 1, n_legions: 0 },
  ],
  diplomacy: [
    [0xff, 0],
    [0, 0xff],
  ],
  generals: [
    {
      idx: 0,
      name: "守將",
      faction: 0,
      status: 1,
      active: true,
      ability: { force: 1 },
    },
    {
      idx: 1,
      name: "強將",
      faction: 0,
      status: 0,
      active: true,
      ability: { force: 15 },
    },
    {
      idx: 2,
      name: "次將",
      faction: 0,
      status: 0,
      active: true,
      ability: { force: 14 },
    },
  ],
  legions: [],
};
initializeLegionSlotState(weakSc);
weakSc.legions.push({
  slot: 0,
  generalIdx: 0,
  status: 0xc4,
  moveDelay: 1,
  movePeriod: 3,
  leader: "守將",
  faction: 0,
  x: 10,
  y: 10,
  troops: 100,
  morale: 200,
  units: [1, 4, 4, 4, 4, 4].map((type) => ({
    type,
    troops: type === 1 ? 1000 : 0,
  })),
  _active: true,
});
// 0x4028的空城分支在4057目标选择前即调用40C9：战略目标被财政
// 调度暂时清空也不能阻止AI为交战空边城编成；40B3仍记该请求城。
const untargetedAiSc = structuredClone(weakSc);
untargetedAiSc.factions[0].target_faction = 0xff;
untargetedAiSc.factions[0].n_legions = 0;
untargetedAiSc.legions = [];
for (const general of untargetedAiSc.generals) general.status = 0;
const untargetedAiApp = {
  scenario: untargetedAiSc,
  originalRng: { nextByte: () => 0 },
};
assert.equal(tickStrategicCity(untargetedAiApp, 0), true);
assert.equal(untargetedAiSc.legions.length, 1);
assert.equal(untargetedAiSc.legions[0].target.idx, 0);
assert.equal(untargetedAiSc.factions[0].strategic_city_primary, 0);
untargetedAiSc.cities[0]._aiCooldown = 5;
untargetedAiSc.factions[0].strategic_city_primary = null;
assert.equal(tickStrategicCity(untargetedAiApp, 0), false);
assert.equal(
  untargetedAiSc.factions[0].strategic_city_primary,
  0,
  "40C9被城冷却短路时40B3仍必须记录AI请求城",
);

// 敌邻城一军时请求1+2-1=2，保留同次请求多军编成与逐军计数覆盖。
const multiSc = structuredClone(weakSc);
multiSc.factions[1].n_legions = 1;
multiSc.legions.push({
  slot: 10,
  faction: 1,
  status: 0xc4,
  moveDelay: 1,
  movePeriod: 3,
  x: 20,
  y: 10,
  troops: 600,
  morale: 200,
  units: [1, 1, 3, 3, 2, 2].map((type) => ({ type, troops: 1000 })),
  _active: true,
});
assert.equal(
  tickStrategicCity(
    {
      scenario: multiSc,
      originalRng: { nextByte: () => 0 },
    },
    0,
  ),
  true,
);
assert.equal(multiSc.factions[0].n_legions, 3);
assert.deepEqual(
  multiSc.legions
    .filter((item) => item.slot === 1 || item.slot === 2)
    .map((item) => item.leader),
  ["強將", "次將"],
);

const weakApp = { scenario: weakSc, originalRng: { nextByte: () => 0 } };
assert.equal(tickStrategicCity(weakApp, 0), true);
assert.equal(weakSc.legions.length, 2, "空敌邻城不额外增加一支援军请求");
assert.equal(
  weakSc.factions[0].n_legions,
  2,
  "4575在同一弱城请求内每成功编成一军都递增势力军团计数",
);
assert.deepEqual(
  weakSc.legions.slice(1).map((item) => item.leader),
  ["強將"],
  "编成按武力降序选择，不得君主特判",
);

// 0x4099..0x40AA：正常出击命中候选后把AL从0改为1，再作为DL传给
// 0x4155；无论敌城驻军多少，每次据点轮询最多只给一支委任军团写目标。
{
  const cityRaw = new Uint8Array(0x20);
  cityRaw[0] = 1;
  cityRaw[0x1c] = 1;
  const sortieSc = {
    player_faction: 9,
    cities: [
      {
        idx: 0,
        faction: 0,
        x: 10,
        y: 10,
        raw: Buffer.from(cityRaw).toString("hex"),
      },
      {
        idx: 1,
        faction: 1,
        x: 20,
        y: 10,
        raw: "00".repeat(0x20),
      },
    ],
    factions: [
      {
        idx: 0,
        active: true,
        target_faction: 1,
        capital: 0,
        strategic_city_primary: 99,
        n_legions: 3,
      },
      { idx: 1, active: true, capital: 1, n_legions: 4 },
    ],
    diplomacy: [
      [0xff, 0],
      [0, 0xff],
    ],
    legions: [],
  };
  initializeLegionSlotState(sortieSc);
  sortieSc.legions.push(
    ...Array.from({ length: 3 }, (_, index) => ({
      slot: index,
      status: 0xc4,
      moveDelay: 1,
      movePeriod: 3,
      faction: 0,
      x: 10,
      y: 10,
      troops: 600,
      morale: 200,
      units: [1, 1, 3, 3, 2, 2].map((type) => ({ type, troops: 1000 })),
      commandState: 1,
      _active: true,
    })),
    ...Array.from({ length: 4 }, (_, index) => ({
      slot: 10 + index,
      status: 0xc4,
      moveDelay: 1,
      movePeriod: 3,
      faction: 1,
      x: 20,
      y: 10,
      troops: 600,
      morale: 200,
      units: [1, 1, 3, 3, 2, 2].map((type) => ({ type, troops: 1000 })),
      commandState: 1,
      _active: true,
    })),
  );
  const sortieRngBytes = [1, 1, 1];
  let sortieRngCalls = 0;
  assert.equal(
    tickStrategicCity(
      {
        scenario: sortieSc,
        originalRng: {
          nextByte: () => sortieRngBytes[sortieRngCalls++] ?? 0,
        },
      },
      0,
    ),
    true,
  );
  const ordered = sortieSc.legions.filter(
    (item) => item.faction === 0 && item.target?.idx === 1,
  );
  assert.equal(
    ordered.length,
    1,
    "一次据点轮询只能派一支委任军团，不能按敌城兵力把驻军全部派出",
  );
  assert.equal(
    ordered[0].slot,
    2,
    "4155按槽扫描；前两支驻军的低RNG分别消耗DH并跳过",
  );
  assert.equal(
    sortieRngCalls,
    3,
    "4057选择目标后，4155为DH=2的两个前序活动槽各消费一字节",
  );
  assert.equal(
    sortieSc.factions[0].strategic_city_primary,
    99,
    "4099正常出击只清城冷却，不得调用40B3覆盖编成请求城",
  );

  // 418A：第一个未随机跳过的槽不合格，也耗掉唯一机会。
  for (const blocked of [{ commandState: 8 }, { status: 0xc0 }]) {
    const probe = structuredClone(sortieSc);
    for (const item of probe.legions) delete item.target;
    Object.assign(probe.legions[0], blocked);
    const bytes = [1, 0x80];
    let calls = 0;
    tickStrategicCity(
      {
        scenario: probe,
        originalRng: {
          nextByte: () => {
            assert.ok(calls < bytes.length);
            return bytes[calls++];
          },
        },
      },
      0,
    );
    assert.equal(calls, 2);
    assert.equal(
      probe.legions.some((item) => item.target),
      false,
    );
  }

  // 405D在4073/408F/40C9之前；玩家最后一军绝不落入4155，
  // NPC弱城即使冷却未过，也必须消费候选选择字节。
  for (const player of [true, false]) {
    const probe = structuredClone(sortieSc);
    probe.legions = [probe.legions[0]];
    probe.factions[0].n_legions = 1;
    probe.factions[1].n_legions = 0;
    delete probe.legions[0].target;
    probe.player_faction = player ? 0 : 9;
    probe.cities[0]._aiCooldown = 5;
    let calls = 0;
    tickStrategicCity(
      {
        scenario: probe,
        originalRng: {
          nextByte: () => {
            calls++;
            return 1;
          },
        },
      },
      0,
    );
    assert.equal(calls, 1);
    assert.equal(probe.legions[0].target, undefined);
    assert.equal(probe.legions.length, 1);
  }
}

// 0x1D0B固定先跑0x3EFD据点AI、后跑0x25A3军团槽；0x5358月结
// 又发生在当轮二者之后。因此新月预备兵到账后的下一战略tick，边城可先经
// 0x40C9→0x4575→0x6E8F→0x461D编成新军，再轮到首都状态9败军补员。
// 原版不存在“先补现有败军”的全局优先级，后者可能只能重分自己的残兵。
{
  const borderRaw = new Uint8Array(0x20);
  borderRaw[0] = 1;
  borderRaw[0x1c] = 1;
  const capital = {
    idx: 2,
    name: "首都",
    faction: 0,
    x: 0,
    y: 0,
    raw: "00".repeat(0x20),
  };
  const prioritySc = {
    player_faction: 9,
    cities: [
      {
        idx: 0,
        name: "邊城",
        faction: 0,
        x: 10,
        y: 10,
        raw: Buffer.from(borderRaw).toString("hex"),
        growth: 100,
        defence: 100,
        troops: 0,
        troops_cap: 200,
      },
      {
        idx: 1,
        name: "敵城",
        faction: 1,
        x: 20,
        y: 10,
        raw: "00".repeat(0x20),
      },
      capital,
    ],
    factions: [
      {
        idx: 0,
        active: true,
        target_faction: 1,
        capital: 2,
        money: 0,
        n_legions: 1,
        reserve_cav: 100,
        reserve_arc: 100,
        reserve_inf: 100,
        legion_morale_cap: 200,
      },
      { idx: 1, active: true, capital: 1, n_legions: 0 },
    ],
    diplomacy: [
      [0xff, 0],
      [0, 0xff],
    ],
    generals: [
      {
        idx: 0,
        name: "敗軍將",
        faction: 0,
        status: 1,
        active: true,
        ability: { force: 20 },
      },
      {
        idx: 1,
        name: "新軍將",
        faction: 0,
        status: 0,
        active: true,
        ability: { force: 15 },
      },
    ],
    legions: [],
    delayedLegionReturns: [],
    pendingStrategicEvents: [],
    citiesOf(factionIdx) {
      return this.cities.filter((city) => city.faction === factionIdx);
    },
  };
  initializeLegionSlotState(prioritySc);
  prioritySc.legions.push({
    slot: 0,
    moveDelay: 1,
    movePeriod: 3,
    leader: "敗軍將",
    generalIdx: 0,
    status: 0xc4,
    faction: 0,
    x: 0,
    y: 0,
    prevX: 0,
    prevY: 0,
    troops: 275,
    morale: 142,
    units: [
      { type: 1, troops: 500 },
      { type: 1, troops: 450 },
      { type: 3, troops: 450 },
      { type: 3, troops: 450 },
      { type: 2, troops: 450 },
      { type: 2, troops: 450 },
    ],
    _active: true,
    target: capital,
    targetCity: 2,
    targetNode: 2,
    roadEdgeOrNode: 16,
    commandState: 9,
    delegated: true,
  });
  const priorityApp = {
    scenario: prioritySc,
    originalRng: { nextByte: () => 0 },
  };
  aiTick(priorityApp, {
    cityIndex: 0,
    legionBatchStart: 0,
    settleDaily: false,
  });
  assert.equal(priorityApp._strategicBattleFailure, undefined);
  assert.equal(prioritySc.legions.length, 2);
  assert.equal(prioritySc.legions[1].leader, "新軍將");
  assert.equal(prioritySc.legions[1].troops, 300);
  assert.equal(prioritySc.legions[0].troops, 275);
  assert.equal(prioritySc.legions[0].commandState, 3);
  assert.deepEqual(
    [
      prioritySc.factions[0].reserve_cav,
      prioritySc.factions[0].reserve_arc,
      prioritySc.factions[0].reserve_inf,
    ],
    [0, 0, 0],
  );
}

process.stdout.write(
  "strategic city AI OK: reinforcement, TALK38, sortie, and original formation priority\n",
);
