import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { initializeLegionSlotState } from "../web/src/game/legionphase.js";
import { initializeFactionLegionCounts } from "../web/src/game/legioncounts.js";

// New in-memory Web snapshot/sidecar, not an old-AI or DOS save migration.
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
const { loadRoadGraph, roadNodeAt, serializeRoadMarchContext } = await import(
  "../web/src/game/roadgraph.js"
);
await loadRoadGraph();
const { aiTick, buildArmies } = await import("../web/src/game/ai.js");
const { applyWebMetaToState, restoreSnapshotState, snapshotState } =
  await import("../web/src/game/savegame.js");

let raw;
try {
  raw = JSON.parse(
    await fs.readFile(new URL("../web/data.json", import.meta.url), "utf8"),
  );
} catch (error) {
  throw new Error("cannot load data.json fixture", { cause: error });
}
const state = structuredClone(raw.scenarios[0]);
initializeLegionSlotState(state);
initializeFactionLegionCounts(state);
state.weatherClouds = [];
const faction = state.factions[0];
faction.n_legions = 1;
const target = state.cities[faction.capital];
// P69 G8: v1 Dijkstra oracle deleted. 487B's retreat target is the immediate
// friendly endpoint (single graph edge, not a distant capital beyond a
// neutral first edge — that stays the separate 42AB gate). The shipped
// record gives it directly: capital node 58 hangs off node 52 via edge 74.
let shippedGraph;
try {
  shippedGraph = JSON.parse(
    await fs.readFile(new URL("../web/road_graph.json", import.meta.url), "utf8"),
  );
} catch (error) {
  throw new Error("cannot load shipped road graph", { cause: error });
}
const capitalNode = shippedGraph.nodes.find(
  (node) => node.x === target.x && node.y === target.y,
);
const retreatEdge = shippedGraph.edges.find(
  (edge) =>
    Array.isArray(edge.points) &&
    edge.points.length > 1 &&
    (edge.source === capitalNode?.id || edge.target === capitalNode?.id),
);
assert.ok(retreatEdge, "capital must hang off a single multi-point edge");
const farNodeId =
  retreatEdge.source === capitalNode.id ? retreatEdge.target : retreatEdge.source;
const farNode = shippedGraph.nodes[farNodeId];
const source = state.cities.find(
  (city) => city.x === farNode.x && city.y === farNode.y,
);
assert.ok(source);
const outwards = retreatEdge.source === farNodeId;
const routeLegPoints = outwards
  ? retreatEdge.points
  : retreatEdge.points.toReversed();
const route = {
  points: routeLegPoints,
  legs: [
    {
      edgeId: retreatEdge.id,
      stride: outwards ? 4 : -4,
      fromNode: farNodeId,
      toNode: capitalNode.id,
      points: routeLegPoints,
    },
  ],
};
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
    moveDelay: 2,
    movePeriod: 3,
    _active: true,
  },
];
const webMeta = {
  schema: 1,
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
      engagementCountdown: 0,
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
const slotOptions = {
  runCityDaily: false,
  settleDaily: false,
  legionBatchStart: Math.floor(general.idx / 16) * 16,
};
aiTick(app, slotOptions);
assert.equal(app._strategicBattleFailure, undefined);
assert.ok(
  legion._retreat,
  "forced retreat remains authoritative after fresh load",
);
assert.equal(legion.target.idx, target.idx);
assert.deepEqual(
  { x: legion.x, y: legion.y },
  before,
  "the first own-slot visit only decrements +0B=2 to 1",
);
assert.equal(legion.moveDelay, 1);
assert.equal(legion.commandState, 10);
assert.ok(route.points.length > 1);

// 474A preserves the real current edge. Save/restore must retain its ±4
// stride and whole edge, not the withdrawn stride0 truncated representation.
{
  const edge = route.legs[0];
  const edgePoints = edge.points;
  assert.ok(edgePoints.length > 1);
  const edgeLegion = legion;
  edgeLegion.x = edgePoints[0].x;
  edgeLegion.y = edgePoints[0].y;
  edgeLegion.prevX = edgeLegion.x;
  edgeLegion.prevY = edgeLegion.y;
  edgeLegion.moveDelay = 1;
  edgeLegion._markerFrame = 0; // Explicit runtime value; not a new direction formula.
  // This fixture moves the record from a node to an edge explicitly. Its old
  // node 0E must not be silently overwritten by snapshot's drawing projection.
  // P69 G8: raw addresses come from the native serializer (shared production
  // helper), not v1 leg fields.
  const projected = serializeRoadMarchContext({
    edgeId: edge.edgeId,
    stride: edge.stride,
    points: edgePoints,
    pointIndex: 1,
  });
  edgeLegion.roadStride = edge.stride;
  edgeLegion.roadPointAddress = projected.pointAddress;
  edgeLegion.roadEdgeOrNode = projected.edgeOrNode;
  edgeLegion._march = {
    targetX: target.x,
    targetY: target.y,
    targetNode: roadNodeAt(target.x, target.y).id,
    currentNode: edge.fromNode,
    edgeId: edge.edgeId,
    stride: edge.stride,
    fromNode: edge.fromNode,
    toNode: edge.toNode,
    points: edgePoints.map((point) => ({ ...point })),
    pointIndex: 1,
  };
  edgeLegion._path = edgePoints.slice(1).map((point) => ({ ...point }));
  delete state.citiesOf;
  const makeSnapshot = () =>
    snapshotState(
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
  const snap = makeSnapshot();
  const restored = restoreSnapshotState(snap);
  restored.citiesOf = (idx) =>
    restored.cities.filter((city) => city.faction === idx);
  buildArmies(restored);
  const restoredLegion = restored.legions[0];
  assert.equal(
    restoredLegion._markerFrame,
    0,
    "build must not replace saved zero with frame 4",
  );
  assert.equal(restoredLegion._march?.currentNode, edge.fromNode);
  assert.equal(restoredLegion._march?.stride, edge.stride);
  assert.equal(restoredLegion._march?.pointIndex, 1);
  assert.deepEqual(restoredLegion._path, edgePoints.slice(1));
  // P63 G2: the post-restore movement-resume assertions below went through
  // the deleted v1 movement arm (stepTo on this !native fixture now fails
  // closed to "blocked"). Restore-shape pins above stay. The certified
  // rule — in-edge defeated legion resumes along saved points — has no
  // native restore-resume test yet; tracked as gate gap item G8-nRESUME
  // (must close before the C15 gate flips). No KI-derived expectation altered.

  // Artificial exhausted-point input: restoration must not clamp it back.
  // This does not certify how a real action produces it, or its next action;
  // original 2783..279E may already reach 27A2 within the final-point action.
  edgeLegion._march.pointIndex = edgePoints.length;
  edgeLegion.roadPointAddress =
    projected.pointAddress + (edgePoints.length - 1) * edge.stride;
  edgeLegion.x = edgePoints.at(-1).x;
  edgeLegion.y = edgePoints.at(-1).y;
  const exhausted = restoreSnapshotState(makeSnapshot());
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
