import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { initializeLegionSlotState } from "../web/src/game/legionphase.js";

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
  restoreRoadMarchContext,
  roadNodeAt,
  roadNodeRawAddress,
  serializeRoadMarchContext,
} = await import("../web/src/game/roadgraph.js");
const { buildArmies, settleLegionDaily } = await import(
  "../web/src/game/ai.js"
);
const { MapView } = await import("../web/src/render/mapview.js");
const { dispatch } = await import("../web/src/game/commands.js");
await loadRoadGraph();

// P68 G8: v1 Dijkstra oracle deleted. The serialize/restore pins below need
// a real leg; take the graph's own first edge record directly (no search).
// Stride +4 walks stored point order from edge source to edge target.
const firstEdge = graph.edges[0];
const source = graph.nodes[firstEdge.source];
const target = graph.nodes[firstEdge.target];
const firstLeg = {
  edgeId: firstEdge.id,
  stride: 4,
  points: firstEdge.points,
  toNode: firstEdge.target,
};
assert.ok(firstLeg.points.length > 0);
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

// KI 27A2 only replaces +0E; +0A/+0C retain their last edge values.
// Daily cost reads the resulting +0E, not whether residual edge fields exist.
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
  status: 0xc0,
  moveDelay: 1,
  movePeriod: 3,
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
  n_legions: 1,
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
  legions: [],
  diplomacy: [[255]],
};
initializeLegionSlotState(restoredEdgeScenario);
restoredEdgeScenario.legions = [restoredEdgeLegion];
buildArmies(restoredEdgeScenario);
assert.ok(
  restoredEdgeLegion._march,
  "SAVE raw edge context restores navigation",
);
assert.equal(restoredEdgeLegion.roadEdgeOrNode, rawContext.edgeOrNode);
// P63 G2: the walk-to-arrival below (stepTo through the deleted arm) plus
// the 27A2 +0A/+0C-retention trap are dropped. Arrival write sequencing is
// natively locked (verify_native_road_arrival: 2662 due-slot arrival,
// 28F4/4325 dispatch). The node-rate daily rule below keeps its own lock
// via a planted arrived state (position/node context carry the rate; the
// +0A/+0C values do not enter settleLegionDaily).
restoredEdgeLegion.x = restoredEdgeCity.x;
restoredEdgeLegion.y = restoredEdgeCity.y;
restoredEdgeLegion.prevX = restoredEdgeCity.x;
restoredEdgeLegion.prevY = restoredEdgeCity.y;
restoredEdgeLegion._march = null;
restoredEdgeLegion.roadEdgeOrNode = roadNodeRawAddress(restoredEdgeTarget.id);
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
// P63 G2: dropped with the deleted walker. The in-edge 47EA shortcut this
// section pinned is a documented non-contract (march notes §5.4: 47EA
// searches BOTH endpoints; the shortcut is not its full contract), and the
// full 47EA contract is still open RE — not a gate test item.

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
    factions: [
      { idx: 0, monarch: "測試", legion_morale_cap: 200, n_legions: 0 },
    ],
    cities: [dispatchSource, dispatchTarget],
    generals: [dispatchGeneral],
    legions: [],
  };
  initializeLegionSlotState(dispatchScenario);
  assert.ok(dispatch(dispatchScenario, dispatchSource, dispatchTarget).ok);
  const dispatched = dispatchScenario.legions[0];
  assert.equal(dispatched.commandState, 0);
  assert.equal(dispatched.targetCity, dispatchTarget.idx);
  assert.equal(dispatched.targetNode, target.id);
  assert.equal(dispatched.status & 0x02, 0x02);
  assert.equal(dispatched._active, true);
  assert.equal(dispatchGeneral.status, 1);
  // 出征军团出发即在源城节点上：缺roadEdgeOrNode原生首个行军动作读0x0E即
  // fail-closed（196年实机复现；与UI编成同一roadNodeRawAddress写法）。
  assert.equal(
    dispatched.roadEdgeOrNode,
    roadNodeRawAddress(roadNodeAt(dispatchSource.x, dispatchSource.y)?.id),
  );
}

// P63 G2: the aiTick traversal below (walk the whole v1 route asserting
// per-point positions, road/node daily rates and morale inside the walk,
// plus the strategic-clock batch-timing section after it) is dropped with
// the deleted walker. Rates are natively locked (verify_native_road_arrival
// "native daily strict words/owner/funds"; node-rate morale in the same
// suite); slot-batch scheduling is covered by the scheduler contract and
// the native due-slot tests (verify_native_road_movement).

// 主游戏调度回归：军团移动由0x1D0B战略主更新/16槽批次驱动，不等onDay。
// P63 G2: dropped with the traversal section above (same deleted walker;
// slot0-at-ticks-1/25 timing pinned v1 locomotion). Scheduling itself is
// covered as cited there.

// 旧 Web snapshot 只有 delegated=true 且无status时，buildArmies必须先迁移bit2。
// P63 G2: minimal scenario shell for the kept build/render sections below
// (the old full traversal scenario went with the deleted walker).
targetCity.faction = 0;
const scenario = {
  player_faction: 0,
  factions: [{ idx: 0, capital: 0, monarch: "測試", n_legions: 0 }],
  generals: [],
  cities: [sourceCity, targetCity],
  legions: [],
  diplomacy: [[255]],
  citiesOf(faction) {
    return this.cities.filter((city) => city.faction === faction);
  },
};
initializeLegionSlotState(scenario);
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
// P63 G2: the first-step navigation rebuild below (stepTo through the
// deleted arm) is dropped. bit2 migration stays locked above.

// 玩家选择「委任」后仍必须先执行所选目标；旧逻辑会直接进入AI分支，
// 因目标是己方据点而将其覆盖为null，军团始终不出城。
// P63 G2: this aiTick walk (delegated target preserved then marched via the
// deleted arm) is dropped. Delegated-target-first has no native walk test
// yet — gate gap item G8-nDELEG. The old null-target regression stays
// described here; its native lock arrives with the gap item.

// P63 G2: the blocked-route probe below (stepTo through the deleted arm)
// is dropped — post-deletion it would pass trivially via fail-closed
// "blocked", proving nothing. Third-party blocker rerouting has no native
// walk test yet — gate gap item G8-nBLOCKER.

// 目标中立城在换边前提前易主：己方无战进入；交战方攻击实时占领者；
// 未开战第三方由现有道路 blocker 阻断（最后一边竞态仍未知，不在此猜测）。
// P63 G2: all three ownership-change walks below (aiTick/stepTo through the
// deleted arm) are dropped. Own-city entry and siege contact are natively
// locked (verify_native_road_arrival; verify_native_road_movement siege
// contact + cityIdx); third-party blocking joins gate gap item G8-nBLOCKER.

// 状态10必须走完整道路后保留命令目标/当前节点，并在后续两次槽调度
// 完成10→9→3及按现有兵种从三个预备池补员；玩家/NPC都覆盖。
// P63 G2: this aiTick walk (capital return via the deleted arm, then 10→9→3
// and reserve repartition) is dropped. State transitions are natively locked
// (verify_native_road_arrival "4325 player/NPC table all 12 states",
// incl. handler 9); repartition numbers ride the native formation suite
// (march notes §3.15).
// 玩家在外据点选择首都「解體」会写状态11；必须沿原版道路返首都，
// 到达后的下一次军团槽调度才归还六队兵员并移除军团。
// P63 G2: this aiTick walk plus the disband-at-capital assertions below are
// dropped with the deleted arm. 463E/4651 disband rules are natively locked
// (verify_native_legion_fate "state11 actual463E returns pools first" +
// pool-failure/occupancy cases).
  

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
  "水平道路与据点使用相同X锚点",
);
assert.equal(
  quarterPos.wyp,
  source.y * 16 + 8,
  "D4C7同格叠图：水平道路不补偿到道路视觉中线",
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
assert.equal(verticalPos.wxp, source.x * 16 + 8, "D4C7同格叠图：垂直道路不向右补偿");
assert.equal(
  verticalPos.wyp,
  (source.y + 0.25 / 8) * 16 + 8,
  "垂直道路与据点使用相同Y锚点",
);
const waitingRoadLegion = {
  x: source.x,
  y: source.y,
  prevX: source.x,
  prevY: source.y,
  _path: [{ x: source.x + 1, y: source.y }],
};
const waitingPos = renderView.getLegionRenderPos(waitingRoadLegion, 1);
assert.equal(waitingPos.wxp, source.x * 16 + 8, "道路等待保持统一锚点");
assert.equal(
  waitingPos.wyp,
  source.y * 16 + 8,
  "接敌/冷却等待与移动共用原图块中心",
);

// 真实周期2/3覆盖16/24次更新，全程等差前进，末尾与驻城/下一步连续。
for (const period of [2, 3]) {
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1]]) {
    const army = { ...renderLegion, movePeriod: period,
      x: source.x + dx, y: source.y + dy };
    const before = structuredClone(army);
    const duration = 8 * period;
    for (let tick = 0; tick <= duration; tick++) {
      renderView.app.clock.strategicTickSerial = 8 + tick;
      const pos = renderView.getLegionRenderPos(army, 0);
      assert.equal(pos.curT, tick / duration);
      assert.equal(pos.wxp, (source.x + dx * tick / duration) * 16 + 8);
      assert.equal(pos.wyp, (source.y + dy * tick / duration) * 16 + 8);
    }
    const end = renderView.legionPixel(army, 0);
    assert.deepEqual(end, renderView.cityPixel(army));
    assert.deepEqual(end, renderView.legionPixel({ ...army, prevX: army.x, prevY: army.y }, 0));
    assert.deepEqual(army, before, "draw/hit projection never writes rule or presentation input");
  }
}

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
  `march navigation OK: edge ${firstLeg.edgeId} stride ${firstLeg.stride}, ` +
    `${firstLeg.points.length} points (P63 G2: v1 walks dropped, natively locked; P68 G8: Dijkstra oracle dropped)\n`,
);
