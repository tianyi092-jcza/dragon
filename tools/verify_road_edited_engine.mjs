import { format } from "node:util";
const tlog = (...args) => process.stdout.write(`${format(...args)}
`);
// A-ROAD-1 (part 2): edited-graph engine returns through the native engine.
// Real v2 graph + synthetic cities-at-nodes, edited in-memory copies served
// via the same fetch entry as production assets. Live 487B/491B searches:
// baseline found; leaf-bridge removal -> honest exhaustion (no throw);
// cycle-edge removal -> still found with a changed next hop; weight
// deflation -> choice switches (sensitivity); truncation -> search
// identical (491B is topology-only; geometry lives in movement).
// 2708/2880 engagement on edited geometry is covered by composition:
// the derivation (part 1) exposes the exact per-point E961 inputs those
// consumers read; live battles on the real graph were proven in round 3.
// No disk writes, no SAVE.DAT, stdout only.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { attachSyntheticNativeFactionSource } from "./native_faction_fixture.mjs";
import { createContentCatalog } from "../web/src/content/catalog.js";
import { createWorldResources } from "../web/src/game/worldresources.js";
import { createNewGameScenario } from "../web/src/game/world.js";
import {
  prepareScenario,
  scenarioNativeRoadContext,
} from "../web/src/game/scenarioassembly.js";
import { getScenarioRoadMemory } from "../web/src/game/navigation/scenarioroadmemory.js";
import { retreatOriginalRoadMemory } from "../web/src/game/navigation/originalroadretreat.js";

let realGraph;
try {
  realGraph = JSON.parse(
    readFileSync(new URL("../web/road_graph.json", import.meta.url), "utf-8"),
  );
} catch (error) {
  throw new Error("cannot load v2 road graph", { cause: error });
}
assert.equal(realGraph.version, 2);

const CAPITAL = 0;
const FAR = 150;

function template() {
  return {
    player_faction: 0,
    factions: [
      {
        idx: 0,
        capital: CAPITAL,
        n_legions: 0,
        active: true,
        monarch_idx: 126,
        march_marker_style: 0,
      },
    ],
    generals: [],
    cities: realGraph.nodes.map(({ id, x, y }) => ({
      idx: id,
      x,
      y,
      faction: 0,
      governor: null,
      type: 0,
      production: 10,
    })),
    legions: [],
    weatherClouds: Array.from({ length: 16 }, () => ({ status: 0 })),
    disasterMapObjects: Array.from({ length: 16 }, () => ({ status: 0 })),
  };
}

function clone(value, label) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    throw new Error(`cannot clone ${label}`, { cause: error });
  }
}

async function prepareWithGraph(graph) {
  const manifest = {
    schemaVersion: 1,
    rules: "ki-1995",
    id: "road-edited-engine",
    revision: "1",
    chapters: [{ id: "chapter", legacyScenarioIndex: 0, official: true }],
  };
  const content = createContentCatalog(manifest, { scenarios: [template()] });
  const world = createWorldResources();
  const raw = createNewGameScenario(template());
  attachSyntheticNativeFactionSource(raw);
  const oldFetch = globalThis.fetch;
  const allowed = new Set([
    world.definition.assets.terrain,
    world.definition.assets.roadCost,
    world.definition.assets.roadOffset,
    world.definition.assets.roadGraph,
  ]);
  globalThis.fetch = async (url) => {
    assert(allowed.has(String(url)), `Unexpected asset ${url}`);
    if (String(url) === world.definition.assets.roadGraph) {
      return { ok: true, json: async () => clone(graph, "edited road graph") };
    }
    return {
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(384 * 256),
      json: async () => ({}),
    };
  };
  try {
    const prepared = await prepareScenario({ raw, idx: 0, mode: "fresh", content, world });
    return { sc: prepared.scenario, memory: getScenarioRoadMemory(prepared.scenario) };
  } finally {
    globalThis.fetch = oldFetch;
  }
}

function query487B(f, currentNode) {
  const context = scenarioNativeRoadContext(f.sc);
  return retreatOriginalRoadMemory({
    readFactionByte: () => 0,
    readCapitalByte: () => CAPITAL,
    readCurrentWord: () => currentNode * 8,
    readGraphByte: f.memory.readByte,
    writeGraphByte: f.memory.writeByte,
    readStateByte: context.readCityOwnerByte,
  });
}

// Drop edge eid with full renumber (ids/addresses/tags), as a real
// editor/encoder would emit: the removed edge's two endpoint slots are
// cleared, surviving slots keep positions, addresses remap.
function dropEdge(graph, eid) {
  const DIRS = ["W", "E", "N", "S"];
  const OPP = { W: "E", E: "W", N: "S", S: "N" };
  const card = (ax, ay, bx, by) => {
    const dx = Math.sign(bx - ax);
    const dy = Math.sign(by - ay);
    if (dx === -1 && dy === 0) return "W";
    if (dx === 1 && dy === 0) return "E";
    if (dx === 0 && dy === -1) return "N";
    if (dx === 0 && dy === 1) return "S";
    return null;
  };
  const gone = graph.edges.find((e) => e.id === eid);
  const gs = graph.nodes[gone.source];
  const p0 = gone.points[0];
  const pn = gone.points[gone.points.length - 1];
  const pm = gone.points[gone.points.length - 2];
  const clearAt = [
    [gone.source, DIRS.indexOf(card(gs.x, gs.y, p0.x, p0.y))],
    [gone.target, DIRS.indexOf(OPP[card(pm.x, pm.y, pn.x, pn.y)])],
  ];
  const kept = graph.edges.filter((e) => e.id !== eid);
  const addrMap = new Map();
  kept.forEach((e, index) => addrMap.set(0x800 + e.id * 16, 0x800 + index * 16));
  const edges = kept.map((e, index) => ({ ...e, id: index }));
  const nodes = graph.nodes.map((n) => ({
    ...n,
    edgeSlots: n.edgeSlots.map((tag, si) => {
      if (tag === 0) return 0;
      if (clearAt.some(([cn, cs]) => cn === n.id && cs === si)) return 0;
      return (tag & 0xc000) | addrMap.get(tag & 0x3fff);
    }),
  }));
  for (const tag of nodes.flatMap((n) => n.edgeSlots)) {
    if (tag === 0) continue;
    const addr = tag & 0x3fff;
    assert.ok(
      (tag & 0xc000) !== 0 && addr >= 0x800 && addr < 0x800 + edges.length * 16 && addr % 16 === 0,
      "no dangling tag after renumber",
    );
  }
  return { ...graph, nodes, edges };
}

function connectedWithout(graph, skipEid) {
  const adj = new Map();
  for (const e of graph.edges) {
    if (e.id === skipEid) continue;
    if (!adj.has(e.source)) adj.set(e.source, []);
    if (!adj.has(e.target)) adj.set(e.target, []);
    adj.get(e.source).push(e.target);
    adj.get(e.target).push(e.source);
  }
  const seen = new Set([0]);
  const stack = [0];
  while (stack.length) {
    for (const m of adj.get(stack.pop()) ?? []) {
      if (!seen.has(m)) {
        seen.add(m);
        stack.push(m);
      }
    }
  }
  return seen;
}

test("baseline 487B on the real graph finds a next hop", async () => {
  const f = await prepareWithGraph(realGraph);
  const r = query487B(f, FAR);
  assert.equal(r.reason, "found", `baseline must route (got ${r.reason})`);
  assert.equal(r.cf, false);
  tlog(`baseline: node ${FAR} -> capital ${CAPITAL}: bx=${r.bx.toString(16)} reason=${r.reason}`);
});

test("leaf-bridge removal exhausts honestly (no throw)", async () => {
  // Node 27 has degree 1 (edge 39, 27->38): the only bridge to the leaf.
  const g2 = dropEdge(realGraph, 39);
  assert.equal(g2.edges.length, 253);
  const f = await prepareWithGraph(g2);
  const r = query487B(f, 27);
  assert.notEqual(r.reason, "found", "leaf with no edges must not route");
  assert.equal(r.cf, false, "487B exhaustion exits without CF");
  tlog(`bridge removal: node 27 query -> reason=${r.reason} ax=${r.ax.toString(16)}`);
});

test("cycle-edge removal still routes with a changed next hop", async () => {
  // Find a cycle edge (removal keeps all 192 reachable) that lies on the
  // baseline route: dropping it must keep "found" but move the next hop.
  const before = await prepareWithGraph(realGraph);
  const r0 = query487B(before, FAR);
  assert.equal(r0.reason, "found");
  let moved = null;
  for (const e of realGraph.edges) {
    if (connectedWithout(realGraph, e.id).size !== 192) continue;
    const g2 = dropEdge(realGraph, e.id);
    const after = await prepareWithGraph(g2);
    const r1 = query487B(after, FAR);
    assert.equal(r1.reason, "found", `cycle removal of ${e.id} must keep a route`);
    if (r1.bx !== r0.bx) {
      moved = { edge: e.id, from: r0.bx, to: r1.bx };
      break;
    }
  }
  assert.ok(moved, "some on-route cycle edge must move the next hop");
  tlog(`cycle removal: edge ${moved.edge} dropped, bx ${moved.from.toString(16)} -> ${moved.to.toString(16)}`);
});

test("weight deflation switches the first-hop choice", async () => {
  const f0 = await prepareWithGraph(realGraph);
  const r0 = query487B(f0, FAR);
  assert.equal(r0.reason, "found");
  // Deflate each incident edge of FAR to 0 until the choice moves.
  const incident = realGraph.edges.filter((e) => e.source === FAR || e.target === FAR);
  assert.ok(incident.length >= 2, "FAR must have a routing choice");
  let switched = null;
  for (const e of incident) {
    const g2 = clone(realGraph, "weight case");
    g2.edges[e.id].weight = 0;
    const f = await prepareWithGraph(g2);
    const r = query487B(f, FAR);
    assert.equal(r.reason, "found");
    if (r.bx !== r0.bx) {
      switched = { edge: e.id, from: r0.bx, to: r.bx };
      break;
    }
  }
  assert.ok(switched, "a zero-weight edge must attract the choice");
  tlog(`weight: edge ${switched.edge} deflated -> bx ${switched.from.toString(16)} -> ${switched.to.toString(16)}`);
});

test("truncated geometry leaves 491B search identical (topology-only)", async () => {
  // Truncate edge 1 mid-field (drop its last 3 points, bounds recomputed,
  // stored cost/flags of the remainder untouched): the loader accepts it,
  // and search returns byte-identical results (geometry lives in movement).
  const g2 = clone(realGraph, "truncation case");
  const e = g2.edges[1];
  e.points = e.points.slice(0, e.points.length - 3);
  const xs = e.points.map((p) => p.x);
  const ys = e.points.map((p) => p.y);
  e.bounds = {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
  const f0 = await prepareWithGraph(realGraph);
  const f1 = await prepareWithGraph(g2);
  for (const node of [FAR, 27, 100, 5]) {
    const r0 = query487B(f0, node);
    const r1 = query487B(f1, node);
    assert.deepEqual(r1, r0, `search from ${node} must be geometry-blind`);
  }
  tlog("truncation: 4 search origins byte-identical before/after");
});
