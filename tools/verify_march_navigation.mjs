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
  if (String(url).endsWith("road_graph.json")) {
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
  serializeRoadMarchContext,
} = await import("../web/src/game/roadgraph.js");
const { buildArmies, aiTick, stepTo } = await import("../web/src/game/ai.js");
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

// DOS +0A/+0C/+0E roundtrip：边内任意位置和±4两个方向都必须可逆。
const edge = graph.edges[firstLeg.edgeId];
for (const stride of [4, -4]) {
  const points =
    stride === 4
      ? [...edge.points, graph.nodes[edge.target]]
      : [...edge.points].reverse().concat(graph.nodes[edge.source]);
  const interiorPointIndex = Math.max(1, Math.min(points.length - 1, Math.floor(points.length / 2)));
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
  assert.deepEqual(restored.points[interiorPointIndex], points[interiorPointIndex]);
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
const legion = {
  leader: "測試",
  faction: 0,
  x: source.x,
  y: source.y,
  prevX: source.x,
  prevY: source.y,
  troops: 100,
  cooldown: 0,
  delegated: false,
  target: targetCity,
};
const scenario = {
  player_faction: 0,
  factions: [{ idx: 0, capital: 0, monarch: "測試", n_cities: 2 }],
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
  hud: null,
  view: null,
  battleView: null,
};
const visited = [];
for (
  let day = 0;
  day < expected.points.length + expected.edges.length + 8;
  day++
) {
  aiTick(app);
  visited.push({ x: legion.x, y: legion.y });
  if (!legion.target) break;
}

assert.deepEqual(
  visited.filter(
    (point, index) =>
      index === 0 ||
      point.x !== visited[index - 1].x ||
      point.y !== visited[index - 1].y,
  ),
  expected.points,
);
assert.equal(legion.x, target.x);
assert.equal(legion.y, target.y);
assert.equal(legion.target, null);
assert.equal(legion._march, null);
assert.equal(legion._path, null);
assert.equal(legion.prevX, legion.x);
assert.equal(legion.prevY, legion.y);
assert.ok(!("_feint" in legion));

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
assert.equal(stepTo(scenario, legacyDelegated, targetCity.x, targetCity.y), "moved");
assert.ok(legacyDelegated._march, "loaded target rebuilds road navigation on first step");

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
scenario.factions.push({ idx: 1, capital: hostileCity.idx, monarch: "敵" });
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
  let day = 0;
  day < expected.points.length + expected.edges.length + 8;
  day++
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
scenario.factions.push({ idx: 1, capital: targetCity.idx, monarch: "敵" });
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
  graph.edges.some((edge) =>
    (edge.source === node.id || edge.target === node.id) &&
    graph.nodes[edge.source === node.id ? edge.target : edge.source],
  ),
);
const nearbyEdge = graph.edges.find(
  (edge) => edge.source === nearbySource.id || edge.target === nearbySource.id,
);
const nearbyTarget = graph.nodes[
  nearbyEdge.source === nearbySource.id ? nearbyEdge.target : nearbyEdge.source
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

console.log(
  `march navigation OK: ${expected.edges.length} edges, ` +
    `${expected.points.length} points, ${visited.length} daily updates`,
);
