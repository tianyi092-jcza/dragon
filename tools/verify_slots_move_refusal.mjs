// A-SLOTS-1 remainder 3: moved-city inputs are accurately refused.
// prepareScenario's city/node gate (city.idx==slot, node.id==slot,
// city.x/y==node.x/y, all 192) is the explicit alias enforcement today:
// identity holds or preparation fails closed with TypeError. This pins
// both the refusal (moved city 5 -> /mismatch/) and the control
// (identity -> prepares). Fresh + restore share the gate (same function).
// Consumer audit (read-only, see report): idx-indexed readers
// (sc.cities[capital/targetCity/cityIdx], cities.find(idx), cityAtPointer
// 0840+i*32 incl. the D34 chain, faction-capital refs) are move-safe given
// consistent city records; node-indexed readers (roadstate 0841+20h*slot,
// tags, search cursors) shift with numbering; coord-indexed finds
// (cities.find x/y, endpoint match) track position truth. Pure node.
import assert from "node:assert/strict";
import test from "node:test";
import { format } from "node:util";
const tlog = (...args) => process.stdout.write(`${format(...args)}\n`);
import { attachSyntheticNativeFactionSource } from "./native_faction_fixture.mjs";
import { createContentCatalog } from "../web/src/content/catalog.js";
import { createWorldResources } from "../web/src/game/worldresources.js";
import { createNewGameScenario } from "../web/src/game/world.js";
import { prepareScenario } from "../web/src/game/scenarioassembly.js";

const graph = {
  version: 2,
  width: 384,
  height: 256,
  nodes: Array.from({ length: 192 }, (_, id) => ({
    id,
    x: id % 384,
    y: 1,
    edgeSlots: [0, 0, 0, 0],
  })),
  edges: [],
};

function template(moveCity5) {
  return {
    player_faction: 0,
    factions: [
      {
        idx: 0,
        capital: 100,
        n_legions: 0,
        n_cities: 0,
        active: true,
        attr: 0x80,
        monarch_idx: 126,
        march_marker_style: 0,
      },
    ],
    generals: [],
    cities: graph.nodes.map(({ id, x, y }) => ({
      idx: id,
      x: id === 5 && moveCity5 ? x + 10 : x,
      y,
      faction: 1,
      governor: null,
      type: 1,
      max_prod: 10,
      prod: 10,
      growth: 0,
      defence: 0,
      troops: 0,
      troops_cap: 100,
    })),
    legions: [],
    weatherClouds: Array.from({ length: 16 }, () => ({ status: 0 })),
    disasterMapObjects: Array.from({ length: 16 }, () => ({ status: 0 })),
  };
}

async function prepare(moveCity5) {
  const tpl = template(moveCity5);
  const manifest = {
    schemaVersion: 1,
    rules: "ki-1995",
    id: "slots-refusal",
    revision: "1",
    chapters: [{ id: "chapter", legacyScenarioIndex: 0, official: false }],
  };
  const content = createContentCatalog(manifest, { scenarios: [tpl] });
  const world = createWorldResources();
  const raw = createNewGameScenario(tpl);
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
      return { ok: true, json: async () => graph };
    }
    return {
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(384 * 256),
      json: async () => ({}),
    };
  };
  try {
    return await prepareScenario({ raw, idx: 0, mode: "fresh", content, world });
  } finally {
    globalThis.fetch = oldFetch;
  }
}

test("identity prepares (control)", async () => {
  const prepared = await prepare(false);
  assert.equal(prepared.scenario.cities.length, 192);
  tlog("control: identity prepares");
});

test("moved city is accurately refused", async () => {
  await assert.rejects(() => prepare(true), /mismatch/);
  tlog("refusal: moved city 5 fails closed with city/node mismatch");
});
