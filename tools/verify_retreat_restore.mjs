import assert from "node:assert/strict";
import fs from "node:fs/promises";

// 全程内存fixture：验证server sidecar覆盖后的强制撤退不会被下一次aiTick改写。
globalThis.window = {};
globalThis.Image = class {
  set src(_value) {
    queueMicrotask(() => this.onload?.());
  }
};
globalThis.fetch = async (url) => {
  const data = await fs.readFile(new URL(`../web/${url}`, import.meta.url));
  return {
    ok: true,
    status: 200,
    json: async () => {
      try {
        return JSON.parse(data.toString("utf8"));
      } catch (error) {
        throw new Error(`invalid JSON fixture ${url}`, { cause: error });
      }
    },
  };
};
const { loadRoadGraph, findRoadRoute, roadNodeAt } = await import(
  "../web/src/game/roadgraph.js"
);
await loadRoadGraph();
const { aiTick, buildArmies } = await import("../web/src/game/ai.js");
const { applyWebMetaToState, snapshotState } = await import(
  "../web/src/game/savegame.js"
);

let raw;
try {
  raw = JSON.parse(
    await fs.readFile(new URL("../web/data.json", import.meta.url), "utf8"),
  );
} catch (error) {
  throw new Error("cannot load data.json fixture", { cause: error });
}
const state = structuredClone(raw.scenarios[0]);
const faction = state.factions[0];
const target = state.cities[faction.capital];
const source = state.cities.find(
  (city) =>
    city.idx !== target.idx &&
    findRoadRoute(city.x, city.y, target.x, target.y)?.points.length > 1,
);
assert.ok(source);
const route = findRoadRoute(source.x, source.y, target.x, target.y);
const general = state.generals[faction.monarch_idx];
state.legions = [
  {
    slot: general.idx,
    leader: general.idx,
    faction: faction.idx,
    x: source.x,
    y: source.y,
    prevX: source.x,
    prevY: source.y,
    troops: 600,
    morale: 200,
    units: [1, 1, 3, 3, 2, 2].map((type) => ({ type, troops: 1000 })),
    status: 0x82,
    target: { idx: target.idx, x: target.x, y: target.y },
    targetNode: roadNodeAt(target.x, target.y).id,
    commandState: 10,
    cooldown: 2,
    _active: true,
  },
];
const webMeta = {
  schema: 2,
  originalRng: null,
  legionRuleState: [
    {
      slot: general.idx,
      _retreat: {
        cityIdx: target.idx,
        nodeId: roadNodeAt(target.x, target.y).id,
        captorFaction: 1,
      },
      _engagement: null,
      engagementCountdown: null,
    },
  ],
};
applyWebMetaToState(state, webMeta);
state.citiesOf = (idx) => state.cities.filter((city) => city.faction === idx);
buildArmies(state);
const legion = state.legions[0];
assert.equal(legion._retreat.cityIdx, target.idx);
const before = { x: legion.x, y: legion.y };
const app = {
  scenario: state,
  originalRng: { nextByte: () => 0xff },
  battleView: { active: false },
  engageTransition: null,
  hud: { flashEvent() {} },
};
aiTick(app);
assert.ok(
  legion._retreat,
  "forced retreat remains authoritative after fresh load",
);
assert.equal(legion.target.idx, target.idx);
assert.deepEqual(
  { x: legion.x, y: legion.y },
  before,
  "retreat cooldown is consumed before route movement",
);
assert.equal(legion.cooldown, 1);
assert.equal(legion.commandState, 10);
assert.ok(route.points.length > 1);

// 边内0x487B临时撤退点列不能伪装成DOS ±4道路上下文；Web sidecar需
// 保存最小点列，使快照→恢复后仍能从非节点坐标继续，而不是blocked后0x291A。
{
  const edgePoints = route.points.slice(0, Math.min(4, route.points.length));
  assert.ok(edgePoints.length > 1);
  const edgeLegion = legion;
  edgeLegion.x = edgePoints[0].x;
  edgeLegion.y = edgePoints[0].y;
  edgeLegion.prevX = edgeLegion.x;
  edgeLegion.prevY = edgeLegion.y;
  edgeLegion.cooldown = 0;
  edgeLegion._march = {
    targetX: target.x,
    targetY: target.y,
    targetNode: roadNodeAt(target.x, target.y).id,
    currentNode: null,
    edgeId: route.edges[0]?.id ?? 0,
    stride: 0,
    toNode: null,
    points: edgePoints.map((point) => ({ ...point })),
    pointIndex: 1,
  };
  edgeLegion._path = edgePoints.slice(1).map((point) => ({ ...point }));
  delete state.citiesOf;
  const snap = snapshotState(
    {
      scenario: state,
      scenarioIdx: 0,
      clock: { year: 1, month: 1, day: 1, sub: 0, hour: 0 },
      originalRng: { snapshot: () => null },
      battleView: { active: false },
      engageTransition: null,
    },
    0,
    "retreat",
  );
  const restored = structuredClone(snap.state);
  applyWebMetaToState(restored, snap.webMeta);
  restored.citiesOf = (idx) =>
    restored.cities.filter((city) => city.faction === idx);
  buildArmies(restored);
  const restoredLegion = restored.legions[0];
  assert.equal(restoredLegion._march?.currentNode, null);
  assert.equal(restoredLegion._march?.stride, 0);
  assert.equal(restoredLegion._march?.pointIndex, 1);
  assert.deepEqual(restoredLegion._path, edgePoints.slice(1));
  const restoredBefore = { x: restoredLegion.x, y: restoredLegion.y };
  aiTick({
    scenario: restored,
    originalRng: { nextByte: () => 0xff },
    battleView: { active: false },
    engageTransition: null,
    hud: { flashEvent() {} },
  });
  assert.notDeepEqual(
    { x: restoredLegion.x, y: restoredLegion.y },
    restoredBefore,
    "读档后的边内败军必须沿保存点列继续移动",
  );
  assert.ok(restoredLegion._retreat);
  assert.notEqual(restoredLegion.dead, true);

  // pointIndex==points.length表示边内点已全部消费、等待下一槽切端点；
  // 恢复时不得钳回最后一个边点并重复移动。
  const exhausted = structuredClone(snap.state);
  const exhaustedMeta = structuredClone(snap.webMeta);
  exhaustedMeta.legionRuleState[0].retreatMarch.pointIndex =
    exhaustedMeta.legionRuleState[0].retreatMarch.points.length;
  applyWebMetaToState(exhausted, exhaustedMeta);
  exhausted.citiesOf = (idx) =>
    exhausted.cities.filter((city) => city.faction === idx);
  buildArmies(exhausted);
  assert.equal(
    exhausted.legions[0]._march.pointIndex,
    exhausted.legions[0]._march.points.length,
  );
}

process.stdout.write(
  "retreat restore OK: webMeta overlay -> buildArmies -> aiTick keeps forced route\n",
);
