import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { initializeLegionSlotState } from "../web/src/game/legionphase.js";

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
const { loadTerrain } = await import("../web/src/game/pathfind.js");
const { aiTick, applyFieldBattleResult } = await import(
  "../web/src/game/ai.js"
);
// P69 G8: v1 Dijkstra oracle deleted. Fixture geometry comes straight from
// the shipped graph record (first edge with >2 points); the battle-result
// pins below only need real mid-edge positions, not a searched route.
let roadGraphAsset;
try {
  roadGraphAsset = JSON.parse(
    await fs.readFile(new URL("../web/road_graph.json", import.meta.url), "utf8"),
  );
} catch (error) {
  throw new Error("cannot load shipped road graph", { cause: error });
}
const fixtureEdge = roadGraphAsset.edges.find(
  (edge) => Array.isArray(edge.points) && edge.points.length > 2,
);
assert.ok(fixtureEdge, "shipped graph must offer an edge with >2 points");
await loadTerrain();

const makeLegion = (leader, faction, troops, x, y) => ({
  leader,
  slot: faction,
  generalIdx: faction,
  faction,
  troops,
  morale: 200,
  status: 0x80,
  _active: true,
  units: Array.from({ length: 6 }, (_, index) => ({
    type: index === 0 ? 1 : 4,
    troops: index === 0 ? troops * 10 : 0,
  })),
  x,
  y,
  prevX: 0,
  prevY: 0,
  target: { idx: 1 },
  moveDelay: 1,
  movePeriod: 3,
  _markerFrame: faction ? 0 : 1,
  _march: { points: [{ x: 11, y: 20 }] },
  _engagement: { kind: "field", countdown: 1 },
});
const cities = [
  { idx: 0, faction: 0, x: 257, y: 9 },
  { idx: 1, faction: 1, x: 246, y: 15 },
];
const app = {
  scenario: {
    generals: [
      { idx: 0, name: "甲", faction: 0, status: 1, battle_rating: 0 },
      { idx: 1, name: "乙", faction: 1, status: 1, battle_rating: 0 },
    ],
    factions: [
      { idx: 0, capital: 0, monarch_idx: 0, n_legions: 1 },
      { idx: 1, capital: 1, monarch_idx: 1, n_legions: 1 },
    ],
    cities,
    prisoners: [],
    legions: [],
    citiesOf(faction) {
      return this.cities.filter((city) => city.faction === faction);
    },
  },
  hud: {
    flashEvent() {
      assert.fail("strategic battle results must not bypass the TALK FIFO");
    },
  },
};
initializeLegionSlotState(app.scenario);
const A = makeLegion("甲", 0, 100, 257, 9);
const D = makeLegion("乙", 1, 100, 255, 9);
const leg = {
  toNode: fixtureEdge.target,
  fromNode: fixtureEdge.source,
  edgeId: fixtureEdge.id,
  stride: 4,
  points: fixtureEdge.points,
};
assert.ok(leg.points.length > 2);
const march = (pointIndex) => ({
  targetX: 246,
  targetY: 15,
  targetNode: leg.toNode,
  currentNode: leg.fromNode,
  edgeId: leg.edgeId,
  stride: leg.stride,
  fromNode: leg.fromNode,
  toNode: leg.toNode,
  points: leg.points.map((point) => ({ ...point })),
  pointIndex,
});
Object.assign(A, {
  x: leg.points[0].x,
  y: leg.points[0].y,
  prevX: leg.points[0].x,
  prevY: leg.points[0].y,
  target: cities[1],
  _march: march(1),
});
Object.assign(D, {
  x: leg.points[1].x,
  y: leg.points[1].y,
  prevX: leg.points[1].x,
  prevY: leg.points[1].y,
  target: cities[1],
  _march: march(2),
});
app.scenario.diplomacy = [
  [0xff, 0],
  [0, 0xff],
];
app.scenario.legions = [A, D];

applyFieldBattleResult(
  app,
  A,
  D,
  "atk",
  37,
  22,
  [37, 0, 0, 0, 0, 0],
  [22, 0, 0, 0, 0, 0],
);
assert.equal(A.troops, 37);
assert.equal(D.troops, 22);
assert.equal(A.dead, undefined);
// P62 G1: v1 retreat arm deleted. This non-native fixture no longer gets a
// 487B retreat route; the loser falls through to fate dispatch (monarch-
// return: dead + delayed return). TEMP-PIN (delete at G5/G6 with v1
// support). Winner-side and battle-result pins below are unaffected.
assert.equal(D.dead, true);
assert.equal(D._retreat, null);
assert.equal(app.scenario.prisoners.length, 0);
assert.equal(
  A.moveDelay,
  1,
  "0x474A→0x6FD2 writes +0x0B=1, so the winner acts on its next slot without a Web pause",
);
assert.equal(D.moveDelay, 1);
assert.equal(A.movePeriod, 3);
assert.equal(D.movePeriod, 3);
assert.equal(A.commandState, 8);
// (P62 G1 TEMP) D commandState/target/_retreat.cityIdx were v1-arm
// products; the commandState-10 rule stays locked on native fixtures.
assert.equal(D.commandState, undefined);
assert.equal(A.units[0].troops, 370);
assert.equal(D.units[0].troops, 220);
assert.equal(A.morale, 74);
assert.equal(D.morale, 21);
for (const legion of [A, D]) {
  assert.equal(legion._engagement, null);
  assert.equal(legion._markerFrame, 4);
  assert.equal(legion.prevX, legion.x);
  assert.equal(legion.prevY, legion.y);
}
// P63 G2: the winner-resume walk below went through the deleted v1 movement
// arm (stepTo on this !native fixture now fails closed to "blocked"). The
// certified rule — 474A winner keeps its target and acts on its next slot
// without a Web pause — stays locked above (moveDelay/movePeriod pins) and
// natively in verify_native_road_movement (474A/487B returns into next due
// slot). No KI-derived expectation is altered; only the v1-locomotion
// assertion is removed.
process.stdout.write(
  "field result OK: winner resumes next slot; non-native loser fails closed to fate (P62 G1 TEMP)\n",
);
