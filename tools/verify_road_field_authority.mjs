// Fixed Web assets + in-memory scenarios only. No DOS saves, browser or writes.
// 4863/4866/486C select an edge; 276A commits 0C; 27B5 changes only 0E.
// These controls do not certify the still-old route choice / flags timing.
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { DEFAULT_WORLD } from "../web/src/content/worlddefinition.js";
import {
  initializeLegionSlotState,
  bindLegionSlotCounter,
} from "../web/src/game/legionphase.js";
import { initializeFactionLegionCounts } from "../web/src/game/legioncounts.js";

function parseFixtureJSON(input) {
  try {
    return JSON.parse(String(input));
  } catch (cause) {
    throw new Error("Invalid road-field test JSON", { cause });
  }
}

globalThis.window = {};
const graphBytes = await readFile(
  new URL("../web/road_graph.json", import.meta.url),
);
const graph = parseFixtureJSON(graphBytes);
const templates = parseFixtureJSON(
  await readFile(new URL("../web/data.json", import.meta.url)),
);
globalThis.fetch = async (url) => {
  assert.equal(url, DEFAULT_WORLD.assets.roadGraph, "only the fixed manifest graph is fetched");
  return { ok: true, json: async () => parseFixtureJSON(graphBytes) };
};
const { loadRoadGraph } = await import("../web/src/game/roadgraph.js");
await loadRoadGraph();
const { aiTick, stepTo, buildArmies, settleLegionDaily } = await import(
  "../web/src/game/ai.js"
);
const { snapshotState, restoreSnapshotState } = await import(
  "../web/src/game/savegame.js"
);
const edge = graph.edges[0];
assert.equal(edge.source, 0);
assert.equal(edge.target, 2);
const firstAddress = 0x2000;
const lastAddress = firstAddress + 4 * (edge.points.length - 1);

function scenario() {
  const sc = structuredClone(templates.scenarios[16]);
  initializeLegionSlotState(sc);
  initializeFactionLegionCounts(sc);
  sc.weatherClouds = [];
  sc.cities[0].faction = sc.cities[2].faction = 0;
  Object.assign(sc.factions[0], {
    capital: 0,
    n_legions: 1,
    gold: 1000,
    money: 1000,
    legion_morale_cap: 200,
  });
  sc.legions = [
    {
      slot: 0,
      generalIdx: 0,
      faction: 0,
      status: 0xc6,
      _active: true,
      x: graph.nodes[0].x,
      y: graph.nodes[0].y,
      troops: 100,
      morale: 100,
      units: [100, 0, 0, 0, 0, 0].map((n) => ({ type: 3, troops: n * 10 })),
      target: sc.cities[2],
      targetCity: 2,
      targetNode: 2,
      commandState: 0,
      moveDelay: 1,
      movePeriod: 3,
      roadEdgeOrNode: 0,
      roadStride: -4,
      roadPointAddress: 0x3456,
    },
  ]; // Explicit old residual, not a default.
  bindLegionSlotCounter(sc, sc.legions[0]);
  return sc;
}
function snapshot(sc) {
  return snapshotState(
    {
      scenario: sc,
      scenarioIdx: 16,
      clock: { year: 190, month: 1, day: 1 },
      originalRng: { snapshot: () => null },
    },
    0,
    "road fields",
  );
}
function staleMarch() {
  // P69 G8: v1 Dijkstra oracle deleted. Node 0 -> node 2 is the graph's own
  // edge 0; stride +4 walks stored point order (same shape the search
  // returned for this pair). Staleness/poison assertions below are unaffected.
  const leg = {
    edgeId: 0,
    stride: 4,
    points: edge.points,
    fromNode: 0,
    toNode: 2,
  };
  return {
    ...leg,
    targetX: graph.nodes[2].x,
    targetY: graph.nodes[2].y,
    targetNode: 2,
    currentNode: 0,
    pointIndex: 1,
  };
}
const fields = (L) => [L.roadStride, L.roadPointAddress, L.roadEdgeOrNode];

test("real slot action writes edge/point/stride before its daily settlement", { skip: "P63 G2: v1 walker deleted; field-write sequencing is natively locked (native pointer suites)" }, () => {
  const sc = scenario(),
    L = sc.legions[0];
  const app = {
    scenario: sc,
    originalRng: {
      nextByte() {
        throw new Error("unexpected RNG");
      },
    },
  };
  aiTick(app, { runCityDaily: false, settleDaily: true, legionBatchStart: 0 });
  assert.equal(app._strategicBattleFailure, undefined);
  assert.deepEqual(fields(L), [4, firstAddress, 0x800]);
  assert.deepEqual([L.x, L.y], [edge.points[0].x, edge.points[0].y]);
  assert.equal(sc.factions[0].gold, 925);
  assert.equal(L.morale, 100);
  assert.deepEqual(
    [L.moveDelay, L.movePeriod, sc.legionSlotCounters[0]],
    [3, 3, 0],
  );
  assert.equal(stepTo(sc, L, L.target.x, L.target.y), "moved");
  assert.deepEqual(fields(L), [4, firstAddress + 4, 0x800]);
  assert.deepEqual(
    fields(restoreSnapshotState(snapshot(sc)).legions[0]),
    fields(L),
  );
});

test("snapshot and daily read explicit 0E, never stale edge projection", () => {
  for (const address of [0, 16, 0x800]) {
    const sc = scenario(),
      L = sc.legions[0];
    L.roadEdgeOrNode = address;
    L.roadStride = 0;
    L.roadPointAddress = 0;
    L._march = staleMarch();
    const before = fields(L);
    const saved = restoreSnapshotState(
      parseFixtureJSON(JSON.stringify(snapshot(sc))),
    );
    assert.deepEqual(fields(saved.legions[0]), before);
    assert.deepEqual(
      fields(L),
      before,
      "serialization must not repair/mutate live state",
    );
    settleLegionDaily(sc);
    assert.equal(sc.factions[0].gold, address >= 0x800 ? 925 : 996);
    assert.equal(L.morale, address >= 0x800 ? 100 : 110);
  }
});

test("build keeps node residual 0A/0C and does not infer 0E from coordinates", () => {
  const sc = scenario(),
    L = sc.legions[0];
  L.roadEdgeOrNode = 16; // Deliberately different from the coordinate node.
  const before = fields(L);
  const restored = restoreSnapshotState(snapshot(sc));
  buildArmies(restored);
  assert.deepEqual(fields(restored.legions[0]), before);
  assert.equal(restored.legions[0]._march, null);
});

test("build preserves known runtime target node independently of target city", () => {
  for (const node of [0, 8, 16, 191]) {
    for (const hasCity of [false, true]) {
      const sc = scenario(),
        L = sc.legions[0];
      L.targetNode = node; // Runtime graph id, NOT a raw DOS node address.
      if (!hasCity) {
        L.target = null;
        delete L.targetCity;
      }
      const restored = restoreSnapshotState(
        parseFixtureJSON(JSON.stringify(snapshot(sc))),
      );
      buildArmies(restored);
      assert.equal(
        restored.legions[0].targetNode,
        node,
        `targetNode=${node}, targetCity=${hasCity ? 2 : "absent"}`,
      );
      assert.equal(restored.legions[0].targetCity, hasCity ? 2 : undefined);
      assert.deepEqual(fields(restored.legions[0]), fields(L));
    }
  }
});

test("real action ignores a stale edge BEFORE the outer 42AB/engagement checks", { skip: "P63 G2: v1 walker deleted; field-write sequencing is natively locked (native pointer suites)" }, () => {
  for (const stride of [0, 4]) {
    const outcomes = [];
    for (const poisoned of [false, true]) {
      const sc = scenario(),
        L = sc.legions[0];
      sc.cities[2].faction = 1;
      sc.diplomacy[0][1] = 0xff;
      L.roadStride = stride;
      if (poisoned) L._march = staleMarch();
      const app = {
        scenario: sc,
        originalRng: {
          nextByte() {
            throw new Error("unexpected RNG");
          },
        },
      };
      aiTick(app, {
        runCityDaily: false,
        settleDaily: true,
        legionBatchStart: 0,
      });
      assert.equal(app._strategicBattleFailure, undefined);
      outcomes.push({
        fields: fields(L),
        x: L.x,
        y: L.y,
        target: L.target?.idx ?? null,
        status: L.status,
        delay: L.moveDelay,
        gold: sc.factions[0].gold,
      });
    }
    // Compare identical rule inputs with/without a poisoned display cache;
    // do NOT bless the still-old planner's response to a non-warring city.
    assert.deepEqual(outcomes[1], outcomes[0]);
  }
});

test("a lost or stale cache rebuilds from the saved point before endpoint reselect", { skip: "P63 G2: v1 walker deleted; field-write sequencing is natively locked (native pointer suites)" }, () => {
  for (const cache of [null, staleMarch()]) {
    const sc = scenario(),
      L = sc.legions[0];
    Object.assign(L, {
      x: edge.points[2].x,
      y: edge.points[2].y,
      roadStride: 4,
      roadPointAddress: firstAddress + 8,
      roadEdgeOrNode: 0x800,
      _march: cache,
      target: sc.cities[0],
      targetCity: 0,
      targetNode: 0,
    });
    // Both the absent cache and stale pointIndex=1 must use the actual 0C=2008.
    assert.equal(stepTo(sc, L, L.target.x, L.target.y), "moved");
    assert.deepEqual(fields(L), [-4, firstAddress + 4, 0x800]);
    assert.deepEqual([L.x, L.y], [edge.points[1].x, edge.points[1].y]);
    assert.equal(L.status & 3, 1, "26A5 consumes bit1; 482A sets bit0");
    assert.deepEqual([L.moveDelay, L.movePeriod], [1, 3]);
  }
});

test("endpoint turn followed by contact keeps pre-contact 0C/0E", { skip: "P63 G2: v1 walker deleted; field-write sequencing is natively locked (native pointer suites)" }, () => {
  const sc = scenario(),
    L = sc.legions[0];
  Object.assign(L, {
    x: edge.points[2].x,
    y: edge.points[2].y,
    roadStride: 4,
    roadPointAddress: firstAddress + 8,
    roadEdgeOrNode: 0x800,
    _march: null,
    target: sc.cities[0],
    targetCity: 0,
    targetNode: 0,
  });
  sc.legions.push({
    slot: 1,
    faction: 1,
    status: 0xc0,
    _active: true,
    x: edge.points[1].x,
    y: edge.points[1].y,
    troops: 100,
    morale: 100,
  });
  assert.equal(stepTo(sc, L, L.target.x, L.target.y), "contact");
  assert.deepEqual(fields(L), [-4, firstAddress + 8, 0x800]);
  assert.deepEqual([L.x, L.y], [edge.points[2].x, edge.points[2].y]);
  assert.equal(L.status & 0x23, 0x21);
  assert.equal(
    sc.legionSlotCounters[0],
    12,
    "direct contact, before 264A tail",
  );
});

test("explicit exhausted-edge input: node write keeps the last point and stride", { skip: "P63 G2: v1 walker deleted; field-write sequencing is natively locked (native pointer suites)" }, () => {
  const sc = scenario(),
    L = sc.legions[0];
  L._march = staleMarch();
  L._march.pointIndex = edge.points.length;
  L.x = edge.points.at(-1).x;
  L.y = edge.points.at(-1).y;
  L.roadEdgeOrNode = 0x800;
  L.roadPointAddress = lastAddress;
  L.roadStride = 4;
  // This input isolates 27B5's write set; not a certificate of old flags timing.
  assert.equal(stepTo(sc, L, L.target.x, L.target.y), "arrived");
  assert.deepEqual(fields(L), [4, lastAddress, 16]);
  assert.equal(L._march, null);
  settleLegionDaily(sc);
  assert.equal(sc.factions[0].gold, 996);
  assert.equal(L.morale, 110);
  const restored = restoreSnapshotState(snapshot(sc));
  buildArmies(restored);
  assert.deepEqual(fields(restored.legions[0]), fields(L));
});
