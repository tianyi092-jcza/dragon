import assert from "node:assert/strict";

// Browser-only sound routines are inert in Node.
globalThis.window = {};

const {
  aiTick,
  finishDeferredLegionDaily,
  replenishLegionAtCapital,
  settleLegionDaily,
} = await import("../web/src/game/ai.js");
const {
  FACTION_FUNDS_MIN,
  applyFactionFundsDelta,
  factionLegionMoraleCap,
  legionDailyMaintenanceCost,
} = await import("../web/src/game/economy.js");

const units = (types, strengths) =>
  types.map((type, index) => ({ type, troops: strengths[index] * 10 }));

// 0x2609：道路军费=floor(n/2)+floor(n/4)，节点军费=floor(n/32)+1。
for (const [troops, road, node] of [
  [0, 0, 1],
  [1, 0, 1],
  [31, 22, 1],
  [32, 24, 2],
  [33, 24, 2],
  [599, 448, 19],
  [600, 450, 19],
]) {
  assert.equal(legionDailyMaintenanceCost({ troops }, true), road);
  assert.equal(legionDailyMaintenanceCost({ troops }, false), node);
}
assert.equal(
  legionDailyMaintenanceCost(
    { troops: 123, units: units([1, 1, 1, 1, 1, 1], [1, 1, 1, 1, 1, 1]) },
    true,
  ),
  legionDailyMaintenanceCost(
    { troops: 123, units: units([3, 3, 3, 3, 3, 3], [1, 1, 1, 1, 1, 1]) },
    true,
  ),
  "兵种不直接参与单日军费公式",
);

const nodeFaction = {
  idx: 0,
  gold: 10,
  money: 10,
  legion_morale_cap: 180,
};
const roadFaction = {
  idx: 1,
  gold: 1000,
  money: 1000,
  legion_morale_cap: 200,
};
const inactiveFaction = { idx: 2, gold: 50, money: 50 };
const nodeLegion = {
  faction: 0,
  troops: 32,
  morale: 175,
  _active: true,
};
const roadLegion = {
  faction: 1,
  troops: 33,
  morale: 150,
  _active: true,
  _march: { edgeId: 7 },
};
const engagedAtNode = {
  faction: 0,
  troops: 0,
  morale: 100,
  _active: true,
  _engagement: { kind: "field", countdown: 4 },
};
const retreatingAtNode = {
  faction: 0,
  troops: 0,
  morale: 120,
  _active: true,
  _retreat: { captorFaction: 1 },
};
const inactive = {
  faction: 2,
  troops: 600,
  morale: 100,
  _active: false,
};
const sc = {
  factions: [nodeFaction, roadFaction, inactiveFaction],
  legions: [nodeLegion, roadLegion, engagedAtNode, retreatingAtNode, inactive],
};
settleLegionDaily(sc);
assert.equal(nodeFaction.gold, 6);
assert.equal(nodeFaction.money, 6);
assert.equal(nodeLegion.morale, 180, "节点恢复+10并封顶势力+0x1D");
assert.equal(roadFaction.gold, 976);
assert.equal(roadFaction.money, 976);
assert.equal(roadLegion.morale, 150, "道路分支扣费后立即返回，不恢复士气");
assert.equal(engagedAtNode.morale, 110, "0x2600不排除接敌状态");
assert.equal(retreatingAtNode.morale, 130, "0x2600不排除撤退状态");
assert.equal(inactiveFaction.gold, 50, "非活动军团不结算");
assert.equal(factionLegionMoraleCap({ legion_morale_cap: 177 }), 177);
assert.equal(factionLegionMoraleCap({}), 200, "旧快照兼容原版常值200");

const debt = { gold: -654999, money: -654999 };
applyFactionFundsDelta(debt, -999);
assert.equal(debt.gold, FACTION_FUNDS_MIN);
assert.equal(debt.money, FACTION_FUNDS_MIN);

// 0x4370→状态9→0x4499→0x461D/0x4717/0x4698：首都按兵种池重编补员。
const capital = { idx: 0, faction: 0, x: 10, y: 20 };
const faction = {
  idx: 0,
  capital: 0,
  reserve_cav: 50,
  reserve_inf: 60,
  reserve_arc: 10,
};
const legion = {
  faction: 0,
  x: 10,
  y: 20,
  troops: 300,
  morale: 100,
  _active: true,
  units: units([1, 1, 2, 2, 3, 3], [50, 50, 50, 50, 50, 50]),
};
const capitalSc = { factions: [faction], cities: [capital] };
assert.equal(replenishLegionAtCapital(capitalSc, legion), true);
assert.deepEqual(
  legion.units.map((unit) => unit.troops / 10),
  [75, 75, 80, 80, 55, 55],
);
assert.equal(legion.troops, 420);
assert.equal(faction.reserve_cav, 0);
assert.equal(faction.reserve_inf, 0);
assert.equal(faction.reserve_arc, 0);

// 原版余数由先处理的同兵种队吸收，单队最大100。
const remainderFaction = {
  idx: 0,
  capital: 0,
  reserve_cav: 1,
  reserve_inf: 0,
  reserve_arc: 0,
};
const remainderLegion = {
  faction: 0,
  x: 10,
  y: 20,
  troops: 20,
  _active: true,
  units: units([1, 1, 2, 2, 3, 3], [10, 10, 0, 0, 0, 0]),
};
assert.equal(
  replenishLegionAtCapital(
    { factions: [remainderFaction], cities: [capital] },
    remainderLegion,
  ),
  true,
);
assert.deepEqual(
  remainderLegion.units.slice(0, 2).map((unit) => unit.troops / 10),
  [11, 10],
);

const away = structuredClone(legion);
away.x = 11;
assert.equal(replenishLegionAtCapital(capitalSc, away), false);
const full = structuredClone(legion);
full.troops = 600;
assert.equal(replenishLegionAtCapital(capitalSc, full), false);
const marching = structuredClone(legion);
marching.target = { idx: 1, x: 11, y: 20 };
assert.equal(
  replenishLegionAtCapital(capitalSc, marching),
  false,
  "0x2662未到达目标节点时不会进入首都状态9补员",
);
const arrived = structuredClone(legion);
arrived.target = capital;
assert.equal(
  replenishLegionAtCapital(
    {
      factions: [{ ...faction, reserve_cav: 1 }],
      cities: [capital],
    },
    arrived,
  ),
  true,
  "目标仍指向首都但坐标已到达时同轮进入状态9补员",
);

// 0x25A3按军团槽地址升序轮询；多个首都军团争用同一预备池时必须保持槽序。
const slotCapital = { idx: 0, faction: 0, x: 10, y: 20 };
const slotFaction = {
  idx: 0,
  capital: 0,
  gold: 1000,
  money: 1000,
  reserve_cav: 50,
  reserve_inf: 0,
  reserve_arc: 0,
};
const earlySlotLegion = {
  slot: 2,
  faction: 0,
  x: 10,
  y: 20,
  troops: 300,
  morale: 100,
  _active: true,
  units: units([1, 1, 4, 4, 4, 4], [50, 50, 50, 50, 50, 50]),
};
const lateSlotLegion = {
  slot: 9,
  faction: 0,
  x: 10,
  y: 20,
  troops: 300,
  morale: 100,
  _active: true,
  units: units([1, 1, 4, 4, 4, 4], [50, 50, 50, 50, 50, 50]),
};
const slotApp = {
  originalRng: { nextByte: () => 0xff },
  scenario: {
    factions: [slotFaction],
    cities: [slotCapital],
    legions: [lateSlotLegion, earlySlotLegion],
    generals: [],
    pendingStrategicEvents: [],
    delayedLegionReturns: [],
  },
};
aiTick(slotApp);
assert.deepEqual(
  earlySlotLegion.units.slice(0, 2).map((unit) => unit.troops / 10),
  [75, 75],
  "较早军团槽先取得共享骑兵预备池",
);
assert.deepEqual(
  lateSlotLegion.units.slice(0, 2).map((unit) => unit.troops / 10),
  [50, 50],
  "较晚军团槽只能使用前槽结算后的剩余预备池",
);
assert.equal(slotFaction.reserve_cav, 0);

// 交互战斗在0x2662等价更新中暂停日调度；0x2600必须延迟到战果回写之后。
const deferredFaction = {
  idx: 0,
  gold: 1000,
  money: 1000,
  legion_morale_cap: 200,
};
const deferredLegion = {
  faction: 0,
  troops: 100,
  morale: 100,
  _active: true,
  _march: { edgeId: 3 },
  units: units([1, 1, 2, 2, 3, 3], [20, 20, 15, 15, 15, 15]),
};
const deferredApp = {
  scenario: { factions: [deferredFaction], legions: [deferredLegion] },
  _legionDailySettlementDeferred: true,
};
// 模拟战果把军团留在节点且兵力降到32，再执行战术回调中的延迟日结。
deferredLegion._march = null;
deferredLegion.troops = 32;
assert.equal(finishDeferredLegionDaily(deferredApp), true);
assert.equal(deferredFaction.gold, 998, "异步战果后按新总兵和节点状态结算");
assert.equal(deferredFaction.money, 998);
assert.equal(deferredLegion.morale, 110);
assert.equal(
  finishDeferredLegionDaily(deferredApp),
  false,
  "延迟日结至多执行一次",
);
assert.equal(deferredFaction.gold, 998);

process.stdout.write(
  "legion daily verification passed: KI maintenance, morale cap, debt saturation, capital replenishment\n",
);
