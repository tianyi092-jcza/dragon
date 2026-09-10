import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

let graph;
try {
  graph = JSON.parse(
    await readFile(new URL("../web/road_graph.json", import.meta.url)),
  );
} catch (error) {
  throw new Error("cannot load generated road graph", { cause: error });
}
globalThis.fetch = async (url) => {
  const resource = String(url);
  if (resource.endsWith("road_graph.json")) {
    return { ok: true, json: async () => graph };
  }
  return {
    ok: true,
    arrayBuffer: async () => new ArrayBuffer(384 * 256),
    json: async () => ({}),
  };
};

const {
  loadRoadGraph,
  findRoadRoute,
  restoreRoadMarchContext,
  roadNodeRawAddress,
  serializeRoadMarchContext,
} = await import("../web/src/game/roadgraph.js");
const { buildArmies, aiTick, settleLegionDaily, stepTo } = await import(
  "../web/src/game/ai.js"
);
const { MapView } = await import("../web/src/render/mapview.js");
const { dispatch } = await import("../web/src/game/commands.js");
const { Clock } = await import("../web/src/game/clock.js");
await loadRoadGraph();

const source = graph.nodes[0];
const target = graph.nodes.at(-1);
const expected = findRoadRoute(source.x, source.y, target.x, target.y);
assert.ok(expected?.points.length > 0);
const firstLeg = expected.legs[0];
const initialMarch = {
  edgeId: firstLeg.edgeId,
  stride: firstLeg.stride,
  points: firstLeg.points,
  pointIndex: 0,
};
const rawContext = serializeRoadMarchContext(initialMarch);
assert.ok(rawContext);
const restoredContext = restoreRoadMarchContext({
  x: source.x,
  y: source.y,
  targetX: target.x,
  targetY: target.y,
  targetNode: target.id,
  stride: rawContext.stride,
  pointAddress: rawContext.pointAddress,
  edgeOrNode: rawContext.edgeOrNode,
});
assert.equal(restoredContext.edgeId, firstLeg.edgeId);
assert.equal(restoredContext.stride, firstLeg.stride);
assert.equal(restoredContext.pointIndex, 0);
assert.deepEqual(restoredContext.points[0], firstLeg.points[0]);

// 从SAVE恢复道路边后抵达节点，原始+0A/+0C边字段必须清除，+0E改写
// 为目标节点原始地址；否则次日会继续按道路边（75）而不是节点（4）扣费。
const restoredEdgeTarget = graph.nodes[firstLeg.toNode];
const restoredEdgeCity = {
  idx: 1,
  name: "存檔邊終點",
  x: restoredEdgeTarget.x,
  y: restoredEdgeTarget.y,
  faction: 0,
};
const restoredEdgeLegion = {
  slot: 0,
  leader: "存檔道路測試",
  faction: 0,
  x: source.x,
  y: source.y,
  prevX: source.x,
  prevY: source.y,
  troops: 100,
  morale: 100,
  target: { idx: restoredEdgeCity.idx },
  targetNode: restoredEdgeTarget.id,
  roadStride: rawContext.stride,
  roadPointAddress: rawContext.pointAddress,
  roadEdgeOrNode: rawContext.edgeOrNode,
};
const restoredEdgeFaction = {
  idx: 0,
  capital: 0,
  monarch: "存檔道路測試",
  gold: 1000,
  money: 1000,
  reserve_cav: 0,
  reserve_inf: 0,
  reserve_arc: 0,
  legion_morale_cap: 200,
};
const restoredEdgeScenario = {
  player_faction: 0,
  factions: [restoredEdgeFaction],
  cities: [
    { idx: 0, name: "存檔邊起點", x: source.x, y: source.y, faction: 0 },
    restoredEdgeCity,
  ],
  generals: [],
  legions: [restoredEdgeLegion],
  diplomacy: [[255]],
};
buildArmies(restoredEdgeScenario);
assert.ok(
  restoredEdgeLegion._march,
  "SAVE raw edge context restores navigation",
);
assert.ok(!("roadEdgeOrNode" in restoredEdgeLegion));
let restoredEdgeResult = "moved";
for (let step = 0; step <= firstLeg.points.length; step++) {
  restoredEdgeResult = stepTo(
    restoredEdgeScenario,
    restoredEdgeLegion,
    restoredEdgeCity.x,
    restoredEdgeCity.y,
  );
  if (restoredEdgeResult === "arrived") break;
}
assert.equal(restoredEdgeResult, "arrived");
assert.equal(restoredEdgeLegion._march, null);
assert.ok(!("roadStride" in restoredEdgeLegion));
assert.ok(!("roadPointAddress" in restoredEdgeLegion));
assert.equal(
  restoredEdgeLegion.roadEdgeOrNode,
  roadNodeRawAddress(restoredEdgeTarget.id),
);
assert.equal(restoredEdgeLegion._currentNode, restoredEdgeTarget.id);
settleLegionDaily(restoredEdgeScenario);
assert.equal(restoredEdgeFaction.gold, 996, "抵达节点后按floor(100/32)+1扣费");
assert.equal(restoredEdgeFaction.money, 996);
assert.equal(restoredEdgeLegion.morale, 110, "抵达节点后恢复士气");

// DOS +0A/+0C/+0E roundtrip：边内任意位置和±4两个方向都必须可逆。
const edge = graph.edges[firstLeg.edgeId];
for (const stride of [4, -4]) {
  const points = stride === 4 ? edge.points : edge.points.toReversed();
  const interiorPointIndex = Math.max(
    1,
    Math.min(points.length - 1, Math.floor(points.length / 2)),
  );
  const march = {
    edgeId: edge.id,
    stride,
    points,
    pointIndex: interiorPointIndex,
  };
  const raw = serializeRoadMarchContext(march);
  const current = points[interiorPointIndex - 1];
  const restored = restoreRoadMarchContext({
    x: current.x,
    y: current.y,
    targetX: target.x,
    targetY: target.y,
    targetNode: target.id,
    stride: raw.stride,
    pointAddress: raw.pointAddress,
    edgeOrNode: raw.edgeOrNode,
  });
  assert.ok(restored, `restores interior stride ${stride}`);
  assert.equal(restored.stride, stride);
  assert.equal(restored.pointIndex, interiorPointIndex);
  assert.deepEqual(
    restored.points[interiorPointIndex],
    points[interiorPointIndex],
  );

  // 友方边界末点已消费，或兼容旧Web错误保存的城前等待状态时，
  // pointIndex==points.length仍是可恢复上下文；不得钳回末点重复移动。
  const exhausted = {
    edgeId: edge.id,
    stride,
    points,
    pointIndex: points.length,
  };
  const exhaustedRaw = serializeRoadMarchContext(exhausted);
  const exhaustedCurrent = points.at(-1);
  const exhaustedRestored = restoreRoadMarchContext({
    x: exhaustedCurrent.x,
    y: exhaustedCurrent.y,
    targetX: target.x,
    targetY: target.y,
    targetNode: target.id,
    stride: exhaustedRaw.stride,
    pointAddress: exhaustedRaw.pointAddress,
    edgeOrNode: exhaustedRaw.edgeOrNode,
  });
  assert.ok(exhaustedRestored, `restores exhausted stride ${stride}`);
  assert.equal(exhaustedRestored.pointIndex, exhaustedRestored.points.length);
}

const targetCity = {
  idx: 1,
  name: "終點",
  x: target.x,
  y: target.y,
  faction: 0,
};
const sourceCity = {
  idx: 0,
  name: "起點",
  x: source.x,
  y: source.y,
  faction: 0,
};

// 玩家军团在道路边内改令时，必须保留当前edge/stride/point，先抵达
// 既定端点后再按新目标选边；节点级寻路不能以道路点为起点。
{
  const retargetSource = { ...sourceCity };
  const retargetOldTarget = { ...targetCity };
  const retargetLegion = {
    leader: "途中改令",
    faction: 0,
    x: source.x,
    y: source.y,
    prevX: source.x,
    prevY: source.y,
    troops: 100,
    morale: 100,
    target: retargetOldTarget,
    targetCity: retargetOldTarget.idx,
    targetNode: target.id,
    commandState: 0,
    cooldown: 0,
    status: 0x82,
    _active: true,
  };
  const retargetScenario = {
    player_faction: 0,
    factions: [{ idx: 0, capital: 0 }],
    cities: [retargetSource, retargetOldTarget],
    legions: [retargetLegion],
    diplomacy: [[0xff]],
  };
  assert.equal(
    stepTo(retargetScenario, retargetLegion, target.x, target.y),
    "moved",
  );
  const activeEdge = retargetLegion._march.edgeId;
  retargetLegion.target = retargetSource;
  retargetLegion.targetCity = retargetSource.idx;
  retargetLegion.targetNode = source.id;
  const retargetResult = stepTo(
    retargetScenario,
    retargetLegion,
    source.x,
    source.y,
  );
  assert.notEqual(retargetResult, "blocked");
  if (retargetResult !== "arrived") {
    assert.equal(
      retargetLegion._march?.edgeId,
      activeEdge,
      "途中改令只能在当前edge上改向，不能丢失道路上下文",
    );
  }
  let arrived = retargetResult;
  for (let guard = 0; guard < expected.points.length * 2 + 32; guard++) {
    if (arrived === "arrived") break;
    arrived = stepTo(retargetScenario, retargetLegion, source.x, source.y);
  }
  assert.equal(arrived, "arrived");
  assert.equal(retargetLegion.x, source.x);
  assert.equal(retargetLegion.y, source.y);
}

// 城池「出征」创建的玩家军团必须直接进入正式0x4325命令链，不能只靠
// 旧快照的commandState缺失兼容旁路完成返都补员。
{
  const dispatchSource = {
    ...sourceCity,
    sim: { troops: 1200 },
  };
  const dispatchTarget = { ...targetCity };
  const dispatchGeneral = {
    idx: 0,
    name: "出征命令态",
    faction: 0,
    active: true,
    status: 0,
    ability: { force: 100 },
  };
  const dispatchScenario = {
    player_faction: 0,
    factions: [{ idx: 0, monarch: "測試", legion_morale_cap: 200 }],
    cities: [dispatchSource, dispatchTarget],
    generals: [dispatchGeneral],
    legions: [],
  };
  assert.ok(dispatch(dispatchScenario, dispatchSource, dispatchTarget).ok);
  const dispatched = dispatchScenario.legions[0];
  assert.equal(dispatched.commandState, 0);
  assert.equal(dispatched.targetCity, dispatchTarget.idx);
  assert.equal(dispatched.targetNode, target.id);
  assert.equal(dispatched.status & 0x02, 0x02);
  assert.equal(dispatched._active, true);
  assert.equal(dispatchGeneral.status, 1);
}

const legion = {
  leader: "測試",
  faction: 0,
  x: source.x,
  y: source.y,
  prevX: source.x,
  prevY: source.y,
  troops: 100,
  morale: 100,
  cooldown: 0,
  delegated: false,
  target: targetCity,
};
const scenario = {
  player_faction: 0,
  factions: [
    {
      idx: 0,
      capital: 0,
      monarch: "測試",
      n_cities: 2,
      gold: 100000,
      money: 100000,
      reserve_cav: 0,
      reserve_inf: 0,
      reserve_arc: 0,
      legion_morale_cap: 200,
    },
  ],
  generals: [
    {
      name: "測試",
      faction: 0,
      active: true,
      status: 1,
      ability: { politics: 1 },
    },
  ],
  cities: [sourceCity, targetCity],
  legions: [legion],
  diplomacy: [[255]],
  citiesOf(faction) {
    return this.cities.filter((city) => city.faction === faction);
  },
};
buildArmies(scenario);
legion.target = targetCity;

const app = {
  scenario,
  originalRng: { nextByte: () => 0xff },
  hud: null,
  view: null,
  battleView: null,
};
const visited = [];
let finalSettlementCost = null;
let finalMoraleBefore = null;
for (
  let update = 0;
  update < expected.points.length + expected.edges.length + 8;
  update++
) {
  const fundsBefore = scenario.factions[0].gold;
  const moraleBefore = legion.morale;
  aiTick(app);
  const settlementCost = fundsBefore - scenario.factions[0].gold;
  visited.push({ x: legion.x, y: legion.y });
  if (update === 0) {
    assert.equal(settlementCost, 75, "节点出发进入道路后按道路军费结算");
    assert.equal(legion.morale, 100, "节点出发进入道路后不恢复士气");
  }
  if (!legion.target) {
    finalSettlementCost = settlementCost;
    finalMoraleBefore = moraleBefore;
    break;
  }
}

const expectedTraversal = expected.legs.flatMap((leg) => [
  ...leg.points,
  (({ x, y }) => ({ x, y }))(graph.nodes[leg.toNode]),
]);
assert.deepEqual(
  visited.filter(
    (point, index) =>
      index === 0 ||
      point.x !== visited[index - 1].x ||
      point.y !== visited[index - 1].y,
  ),
  expectedTraversal,
);
assert.equal(legion.x, target.x);
assert.equal(legion.y, target.y);
assert.equal(legion.target, null);
assert.equal(legion._march, null);
assert.equal(legion._path, null);
assert.equal(legion.prevX, legion.x);
assert.equal(legion.prevY, legion.y);
assert.equal(finalSettlementCost, 4, "道路抵达目标节点后按节点军费结算");
assert.equal(
  legion.morale,
  Math.min(200, finalMoraleBefore + 10),
  "道路抵达目标节点后恢复士气",
);
assert.ok(!("_feint" in legion));

// 主游戏调度回归：军团移动由0x1D0B战略主更新/16槽批次驱动，不等onDay。
// slot0在第1与第9次主更新各前进一步；此时只刚进入游戏第1时刻，日期未变。
{
  const clockSource = graph.nodes[0];
  const clockTarget = graph.nodes.at(-1);
  const clockSourceCity = {
    idx: 0,
    name: "時鐘起點",
    x: clockSource.x,
    y: clockSource.y,
    faction: 0,
  };
  const clockTargetCity = {
    idx: 1,
    name: "時鐘終點",
    x: clockTarget.x,
    y: clockTarget.y,
    faction: 0,
  };
  const clockLegion = {
    slot: 0,
    leader: "時鐘軍團",
    faction: 0,
    x: clockSource.x,
    y: clockSource.y,
    prevX: clockSource.x,
    prevY: clockSource.y,
    troops: 100,
    morale: 100,
    target: clockTargetCity,
    status: 0x80,
    _active: true,
  };
  const clockScenario = {
    player_faction: 0,
    factions: [
      {
        idx: 0,
        active: true,
        capital: 0,
        monarch: "時鐘軍團",
        gold: 100000,
        money: 100000,
        reserve_cav: 0,
        reserve_arc: 0,
        reserve_inf: 0,
        legion_morale_cap: 200,
      },
    ],
    cities: [clockSourceCity, clockTargetCity],
    generals: [],
    legions: [clockLegion],
    diplomacy: [[0xff]],
  };
  const clockApp = {
    scenario: clockScenario,
    originalRng: { nextByte: () => 0xff },
    battleView: null,
    engageTransition: null,
  };
  let batchStart = 0;
  const changedAt = [];
  let previous = `${clockLegion.x},${clockLegion.y}`;
  const strategicClock = new Clock({
    startYear: 190,
    startMonth: 1,
    startDay: 1,
    onStrategicTick(current) {
      clockScenario._strategicTickSerial = current.strategicTickSerial;
      aiTick(clockApp, {
        legionBatchStart: batchStart,
        runCityDaily: false,
        runFactionTick: false,
        settleDaily: false,
      });
      batchStart = (batchStart + 16) % 128;
      const position = `${clockLegion.x},${clockLegion.y}`;
      if (position !== previous) changedAt.push(current.strategicTickSerial);
      previous = position;
    },
  });
  for (let update = 0; update < 9; update++)
    strategicClock.advance(strategicClock.currentStep);
  assert.deepEqual(changedAt, [1, 9]);
  assert.equal(strategicClock.hour, 1);
  assert.equal(strategicClock.day, 1);
}

// 旧 Web snapshot 只有 delegated=true 且无status时，buildArmies必须先迁移bit2。
targetCity.faction = 0;
const legacyDelegated = {
  leader: "舊委任將",
  faction: 0,
  x: source.x,
  y: source.y,
  prevX: source.x,
  prevY: source.y,
  troops: 100,
  morale: 200,
  delegated: true,
  target: { idx: targetCity.idx },
};
scenario.legions = [legacyDelegated];
buildArmies(scenario);
assert.equal(legacyDelegated.status & 0x04, 0x04);
assert.equal(legacyDelegated.delegated, true);
assert.equal(legacyDelegated.target, targetCity);
assert.equal(legacyDelegated._march, null);
assert.equal(
  stepTo(scenario, legacyDelegated, targetCity.x, targetCity.y),
  "moved",
);
assert.ok(
  legacyDelegated._march,
  "loaded target rebuilds road navigation on first step",
);

// 玩家选择「委任」后仍必须先执行所选目标；旧逻辑会直接进入AI分支，
// 因目标是己方据点而将其覆盖为null，军团始终不出城。
const delegatedLegion = {
  leader: "委任將",
  faction: 0,
  x: source.x,
  y: source.y,
  prevX: source.x,
  prevY: source.y,
  troops: 100,
  cooldown: 1,
  delegated: true,
  target: targetCity,
};
const hostileCity = {
  idx: 2,
  name: "誘餌敵城",
  x: graph.nodes[1].x,
  y: graph.nodes[1].y,
  faction: 1,
};
scenario.cities = [sourceCity, targetCity, hostileCity];
scenario.factions.push({
  idx: 1,
  capital: hostileCity.idx,
  monarch: "敵",
  gold: 100000,
  money: 100000,
  reserve_cav: 0,
  reserve_inf: 0,
  reserve_arc: 0,
  legion_morale_cap: 200,
});
scenario.diplomacy = [
  [255, 0],
  [0, 255],
];
scenario.legions = [delegatedLegion];
aiTick(app);
assert.equal(delegatedLegion.cooldown, 0);
assert.equal(delegatedLegion.target, targetCity);
assert.equal(delegatedLegion.x, source.x);
aiTick(app);
assert.equal(delegatedLegion.target, targetCity);
assert.ok(delegatedLegion._march);
for (
  let update = 0;
  update < expected.points.length + expected.edges.length + 8;
  update++
) {
  if (!delegatedLegion.target) break;
  aiTick(app);
}
assert.equal(delegatedLegion.x, target.x);
assert.equal(delegatedLegion.y, target.y);
assert.equal(delegatedLegion.target, null);
assert.equal(delegatedLegion.delegated, true);

const blockedLegion = {
  leader: "受阻",
  faction: 0,
  x: source.x,
  y: source.y,
  prevX: source.x,
  prevY: source.y,
  troops: 10,
  target: targetCity,
};
const blockers = graph.nodes
  .filter(
    (node) =>
      node.id !== expected.nodes[0] && node.id !== expected.nodes.at(-1),
  )
  .map((node, index) => ({
    idx: index + 2,
    name: `阻塞${node.id}`,
    x: node.x,
    y: node.y,
    faction: 1,
  }));
targetCity.faction = 1;
scenario.cities = [sourceCity, targetCity, ...blockers];
if (!scenario.factions.some((faction) => faction.idx === 1)) {
  scenario.factions.push({
    idx: 1,
    capital: targetCity.idx,
    monarch: "敵",
    gold: 100000,
    money: 100000,
    reserve_cav: 0,
    reserve_inf: 0,
    reserve_arc: 0,
    legion_morale_cap: 200,
  });
}
scenario.diplomacy = [
  [255, 200],
  [200, 255],
];
scenario.legions = [blockedLegion];
const blockedResult = stepTo(scenario, blockedLegion, target.x, target.y);
assert.equal(blockedResult, "blocked");
assert.equal(blockedLegion.x, source.x);
assert.equal(blockedLegion.y, source.y);
assert.equal(blockedLegion._march, null);
assert.ok(!("_feint" in blockedLegion));

// 目标中立城在换边前提前易主：己方无战进入；交战方攻击实时占领者；
// 未开战第三方由现有道路 blocker 阻断（最后一边竞态仍未知，不在此猜测）。
const nearbySource = graph.nodes.find((node) =>
  graph.edges.some(
    (edge) =>
      (edge.source === node.id || edge.target === node.id) &&
      graph.nodes[edge.source === node.id ? edge.target : edge.source],
  ),
);
const nearbyEdge = graph.edges.find(
  (edge) => edge.source === nearbySource.id || edge.target === nearbySource.id,
);
const nearbyTarget =
  graph.nodes[
    nearbyEdge.source === nearbySource.id
      ? nearbyEdge.target
      : nearbyEdge.source
  ];
const changingCity = {
  idx: 9,
  name: "易主城",
  x: nearbyTarget.x,
  y: nearbyTarget.y,
  faction: null,
};
const makeChangingLegion = () => ({
  leader: "易主測試",
  faction: 0,
  x: nearbySource.x,
  y: nearbySource.y,
  prevX: nearbySource.x,
  prevY: nearbySource.y,
  troops: 100,
  morale: 200,
  units: [{ type: 1, troops: 1000 }],
  status: 0x84,
  target: changingCity,
});
scenario.cities = [
  { idx: 8, name: "起點2", x: nearbySource.x, y: nearbySource.y, faction: 0 },
  changingCity,
];
scenario.diplomacy = [
  [255, 0, 200],
  [0, 255, 200],
  [200, 200, 255],
];

changingCity.faction = 0;
let changingLegion = makeChangingLegion();
scenario.legions = [changingLegion];
for (let guard = 0; guard < 200 && changingLegion.target; guard++) aiTick(app);
assert.equal(changingLegion.x, changingCity.x);
assert.equal(changingLegion.y, changingCity.y);
assert.ok(changingLegion._engagement == null);

changingCity.faction = 1;
changingLegion = makeChangingLegion();
scenario.legions = [changingLegion];
let contact = "moved";
for (let guard = 0; guard < 200 && contact === "moved"; guard++)
  contact = stepTo(scenario, changingLegion, changingCity.x, changingCity.y);
assert.equal(contact, "contact");
assert.equal(changingLegion._engagement.kind, "siege");

changingCity.faction = 2;
changingLegion = makeChangingLegion();
scenario.legions = [changingLegion];
assert.equal(
  stepTo(scenario, changingLegion, changingCity.x, changingCity.y),
  "blocked",
);
assert.equal(changingLegion._engagement, undefined);

// 状态10必须走完整道路后保留命令目标/当前节点，并在后续两次槽调度
// 完成10→9→3及按现有兵种从三个预备池补员；玩家/NPC都覆盖。
for (const playerFactionIdx of [0, 7]) {
  const capital = {
    idx: 1,
    name: "返京补员首都",
    x: target.x,
    y: target.y,
    faction: 0,
    attr: 0x80,
  };
  const origin = {
    idx: 0,
    name: "返京补员出发地",
    x: source.x,
    y: source.y,
    faction: 0,
    attr: 0x80,
  };
  const faction = {
    idx: 0,
    capital: 1,
    attr: 0x80,
    monarch: "返京补员测试",
    gold: 100000,
    money: 100000,
    reserve_cav: 140,
    reserve_arc: 140,
    reserve_inf: 140,
    legion_morale_cap: 200,
    n_legions: 1,
  };
  const returning = {
    slot: 0,
    leader: "返京补员测试",
    faction: 0,
    status: 0xc4,
    x: origin.x,
    y: origin.y,
    prevX: origin.x,
    prevY: origin.y,
    troops: 180,
    morale: 100,
    units: [1, 1, 2, 2, 3, 3].map((type) => ({ type, troops: 300 })),
    target: capital,
    targetCity: 1,
    targetNode: target.id,
    commandState: 10,
    cooldown: 0,
    _active: true,
  };
  const returnScenario = {
    player_faction: playerFactionIdx,
    factions: [faction],
    cities: [origin, capital],
    generals: [],
    legions: [returning],
    diplomacy: [[0xff]],
    delayedLegionReturns: [],
    pendingStrategicEvents: [],
    citiesOf(factionIdx) {
      return this.cities.filter((city) => city.faction === factionIdx);
    },
  };
  const returnApp = {
    scenario: returnScenario,
    originalRng: { nextByte: () => 0xff },
    hud: null,
    view: null,
    battleView: null,
  };
  for (
    let guard = 0;
    guard < expected.points.length + expected.edges.length + 20;
    guard++
  ) {
    aiTick(returnApp, { runCityDaily: false, settleDaily: false });
    if (returning.commandState === 3) break;
  }
  assert.equal(returning.x, capital.x);
  assert.equal(returning.y, capital.y);
  assert.equal(returning.target, capital);
  assert.equal(returning._currentNode, target.id);
  assert.equal(returning.roadEdgeOrNode, roadNodeRawAddress(target.id));
  assert.equal(returning.commandState, 3);
  assert.equal(returning.troops, 600);
  assert.deepEqual(
    [faction.reserve_cav, faction.reserve_arc, faction.reserve_inf],
    [0, 0, 0],
  );
}

// 玩家在外据点选择首都「解體」会写状态11；必须沿原版道路返首都，
// 到达后的下一次军团槽调度才归还六队兵员并移除军团。
const returnCapital = {
  idx: 1,
  name: "返京首都",
  x: target.x,
  y: target.y,
  faction: 0,
};
const returnOrigin = {
  idx: 0,
  name: "外地據點",
  x: source.x,
  y: source.y,
  faction: 0,
};
const returningLegion = {
  slot: 0,
  leader: "返京解體測試",
  faction: 0,
  x: returnOrigin.x,
  y: returnOrigin.y,
  prevX: returnOrigin.x,
  prevY: returnOrigin.y,
  troops: 600,
  morale: 200,
  units: [
    { type: 1, troops: 1000 },
    { type: 1, troops: 1000 },
    { type: 2, troops: 1000 },
    { type: 2, troops: 1000 },
    { type: 3, troops: 1000 },
    { type: 3, troops: 1000 },
  ],
  target: returnCapital,
  targetNode: target.id,
  commandState: 11,
};
const returnFaction = {
  idx: 0,
  capital: returnCapital.idx,
  monarch: "返京解體測試",
  gold: 100000,
  money: 100000,
  reserve_cav: 0,
  reserve_inf: 0,
  reserve_arc: 0,
  legion_morale_cap: 200,
  n_legions: 1,
};
scenario.player_faction = 0;
scenario.factions = [returnFaction];
scenario.cities = [returnOrigin, returnCapital];
scenario.generals = [
  {
    name: returningLegion.leader,
    faction: 0,
    active: true,
    status: 1,
    ability: { politics: 1 },
  },
];
scenario.legions = [returningLegion];
scenario.diplomacy = [[255]];
for (
  let guard = 0;
  guard < expected.points.length + expected.edges.length + 16;
  guard++
) {
  if (!scenario.legions.length) break;
  aiTick(app);
}
assert.equal(scenario.legions.length, 0, "状态11军团抵达首都后才解体");
assert.equal(returnFaction.reserve_cav, 200);
assert.equal(returnFaction.reserve_inf, 200);
assert.equal(returnFaction.reserve_arc, 200);
assert.equal(scenario.generals[0].status, 0);

// 0x25A3每次处理16/128槽：一次道路点位移应连续铺满8个战略更新间隔。
// 最高速只缩短每步墙钟时间，仍不得在单个显示帧内跳过整步。
const renderView = new MapView({ getContext: () => ({}) }, () => scenario);
renderView.app = { clock: { strategicTickSerial: 9 } };
const renderLegion = {
  x: source.x + 1,
  y: source.y,
  prevX: source.x,
  prevY: source.y,
  _renderMoveSerial: 8,
};
assert.equal(
  renderView.getLegionRenderPos(renderLegion, 0).curT,
  1 / 8,
  "下一批次应接续上一道路步而非倒跳或瞬移到终点",
);
renderView.app.clock.strategicTickSerial = 8;
const quarterPos = renderView.getLegionRenderPos(renderLegion, 0.25);
assert.equal(
  quarterPos.curT,
  0.25 / 8,
  "战略tick提交后按完整军团槽周期连续推进道路单步",
);
assert.equal(
  quarterPos.wxp,
  (source.x + 0.25 / 8) * 16 + 8,
  "水平道路不添加切向横移",
);
assert.equal(
  quarterPos.wyp,
  source.y * 16 + 11,
  "水平道路按连续截图夹逼向下补偿3px",
);
renderView.app.clock.strategicTickSerial = 15;
assert.equal(
  renderView.getLegionRenderPos(renderLegion, 0.5).curT,
  7.5 / 8,
  "下一次同槽调度前应连续接近本步终点",
);
renderView.app.clock.strategicTickSerial = 16;
assert.equal(
  renderView.getLegionRenderPos(renderLegion, 0).curT,
  1,
  "下一次同槽调度时必须完整落在本步终点",
);
renderView.app.clock.strategicTickSerial = 8;
const verticalLegion = {
  ...renderLegion,
  prevX: source.x,
  prevY: source.y,
  x: source.x,
  y: source.y + 1,
};
const verticalPos = renderView.getLegionRenderPos(verticalLegion, 0.25);
assert.equal(verticalPos.wxp, source.x * 16 + 10, "垂直道路向右补偿2px");
assert.equal(
  verticalPos.wyp,
  (source.y + 0.25 / 8) * 16 + 8,
  "垂直道路不添加切向纵移",
);
const waitingRoadLegion = {
  x: source.x,
  y: source.y,
  prevX: source.x,
  prevY: source.y,
  _path: [{ x: source.x + 1, y: source.y }],
};
const waitingPos = renderView.getLegionRenderPos(waitingRoadLegion, 1);
assert.equal(waitingPos.wxp, source.x * 16 + 8, "道路等待不添加切向横移");
assert.equal(
  waitingPos.wyp,
  source.y * 16 + 11,
  "接敌/冷却等待时仍按下一道路点保持轴向补偿",
);

// 恢复的大地图虚线只能读取既有导航/道路图，不能在draw阶段写回路径缓存。
const routeLegion = {
  ...renderLegion,
  faction: 0,
  target: { x: target.x, y: target.y },
  _path: null,
};
const drawCalls = [];
const drawCtx = {
  imageSmoothingEnabled: false,
  fillStyle: "",
  strokeStyle: "",
  lineWidth: 0,
  font: "",
  textBaseline: "",
  fillRect() {},
  drawImage(...args) {
    drawCalls.push(["image", ...args]);
  },
  strokeText() {},
  fillText() {},
  strokeRect() {},
  setLineDash(value) {
    drawCalls.push(["dash", [...value]]);
  },
  beginPath() {},
  moveTo(x, y) {
    drawCalls.push(["move", x, y]);
  },
  lineTo(x, y) {
    drawCalls.push(["line", x, y]);
  },
  stroke() {
    drawCalls.push(["stroke"]);
  },
  save() {},
  restore() {},
  roundRect() {},
  arc() {},
};
const routeScenario = {
  cities: [],
  factions: [{ idx: 0, march_marker_style: 0 }],
  legions: [routeLegion],
  player_faction: 0,
  factionOf() {
    return null;
  },
};
globalThis.innerWidth = 1280;
globalThis.innerHeight = 720;
globalThis.Image = class {
  set src(_value) {
    this.onload?.();
  }
};
const routeView = new MapView(
  { width: 0, height: 0, getContext: () => drawCtx },
  () => routeScenario,
);
routeView.cam.x = -(routeLegion.x * 16 - 100);
routeView.cam.y = -(routeLegion.y * 16 - 100);
routeView.app = {
  gameStarted: true,
  clock: { strategicTickSerial: 8, dayProgress: () => 0.25 },
};
routeView.draw();
assert.deepEqual(routeLegion._path, null, "绘制军团不得回写军团_path");
assert.ok(
  drawCalls.every(([kind]) => kind !== "dash"),
  "大地图军团行军不再绘制道路路线虚线",
);
assert.ok(
  drawCalls.some(([kind]) => kind === "image"),
  "行军军团必须绘制军团标识",
);

// 活动军团在节点等待下一命令时也必须使用MMAP.MCH驻止帧；不得退化为
// 4px小圆点，否则会把战后目标/状态问题误表现成坐标异常。
const stationaryLegion = {
  faction: 0,
  x: source.x,
  y: source.y,
  prevX: source.x,
  prevY: source.y,
  _active: true,
  target: null,
};
routeScenario.legions = [stationaryLegion];
const imagesBefore = drawCalls.filter(([kind]) => kind === "image").length;
routeView.draw();
assert.ok(
  drawCalls.filter(([kind]) => kind === "image").length > imagesBefore,
  "无目标活动军团必须绘制驻止标识，不得绘制小圆点",
);
const stationaryPos = routeView.getLegionRenderPos(stationaryLegion, 1);
assert.equal(
  routeView.pick(stationaryPos.sx, stationaryPos.sy)?.legion,
  stationaryLegion,
  "地图上独立显示的无目标/冷却军团也必须可以点击查看",
);

process.stdout.write(
  `march navigation OK: ${expected.edges.length} edges, ` +
    `${expected.points.length} points, ${visited.length} strategic updates\n`,
);
