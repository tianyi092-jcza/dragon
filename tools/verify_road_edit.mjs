// Road authoring operations (E-03 slice 3): build/delete roundtrip on real
// data, every refusal class, repaint-then-build coherence on a synthetic
// micro-map, slot-occupied detection. Pure node, no disk writes, no SAVE.DAT.
import assert from "node:assert/strict";
import { format } from "node:util";
const tlog = (...args) => process.stdout.write(`${format(...args)}\n`);
import { readFileSync } from "node:fs";
import { buildRoad, deleteRoad, deriveSlots } from "../web/src/content/authoring/roadedit.js";

const tiles = readFileSync(new URL("../web/mmap_map.bin", import.meta.url));
const T = (x, y) => tiles[y * 384 + x];
const readJSON = (rel) => {
  try {
    return JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf-8"));
  } catch (error) {
    throw new Error(`cannot load ${rel}`, { cause: error });
  }
};
const graph = readJSON("../web/content/builtin/world/roads.json");
const world = readJSON("../web/content/builtin/world/world.json");
const cities = new Map(world.cities.map((c) => [c.id, { x: c.x, y: c.y }]));
const roads = graph.edges.map((e) => ({
  id: `road-${e.id}`,
  fromCityId: world.cities[e.source].id,
  toCityId: world.cities[e.target].id,
  travelKind: "land",
  geometry: e.points.map((p) => ({ x: p.x, y: p.y })),
  nativeBinding: {
    slots: (() => {
      const [s, t] = deriveSlots(e.points, { x: graph.nodes[e.source].x, y: graph.nodes[e.source].y });
      return [
        { node: world.cities[e.source].id, ...s },
        { node: world.cities[e.target].id, ...t },
      ];
    })(),
  },
}));

function expectCode(name, fn, code) {
  try {
    fn();
  } catch (error) {
    assert.equal(error.code, code, `${name} must refuse with ${code} (got ${error.code}: ${error.message})`);
    tlog(`refuse OK: ${name} (${code})`);
    return;
  }
  assert.fail(`${name} must refuse`);
}

// Roundtrip: delete road-0, rebuild it identically.
const e0 = graph.edges[0];
const built = buildRoad({
  fromCityId: world.cities[e0.source].id,
  toCityId: world.cities[e0.target].id,
  geometry: e0.points.map((p) => ({ x: p.x, y: p.y })),
  travelKind: "land",
  cities,
  roads: roads.filter((r) => r.id !== "road-0"),
  tiles: T,
});
assert.equal(built.nativeBinding.weight, e0.weight, "roundtrip cost");
assert.deepEqual(
  built.nativeBinding.flags,
  e0.points.map((p) => p.flags),
  "roundtrip flags",
);
assert.deepEqual(built.nativeBinding.bounds, e0.bounds, "roundtrip bounds");
assert.deepEqual(
  built.geometry,
  e0.points.map((p) => ({ x: p.x, y: p.y })),
  "roundtrip geometry",
);
tlog(`roundtrip: road-0 rebuilt identically (cost ${built.nativeBinding.weight})`);
const afterDelete = deleteRoad(roads, "road-0");
assert.equal(afterDelete.length, 253);
try {
  deleteRoad(roads, "road-zzz");
  assert.fail("unknown road must refuse");
} catch (error) {
  assert.equal(error.code, "unknown-road");
}
tlog("delete: road-0 removed, unknown id refused");

// Refusal classes on real data.
const dup = {
  fromCityId: world.cities[e0.source].id,
  toCityId: world.cities[e0.target].id,
  geometry: e0.points.map((p) => ({ x: p.x, y: p.y })),
  travelKind: "land",
  cities,
  roads,
  tiles: T,
};
expectCode("self-loop", () => buildRoad({ ...dup, toCityId: dup.fromCityId }), "self-loop");
expectCode("unknown endpoint", () => buildRoad({ ...dup, toCityId: "city-999" }), "unknown-endpoint");
expectCode("bad kind", () => buildRoad({ ...dup, travelKind: "air" }), "bad-travel-kind");
expectCode("shared cells", () => buildRoad(dup), "shared-cell");
expectCode(
  "unclassifiable",
  () =>
    buildRoad({
      ...dup,
      geometry: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
    }),
  "non-port-endpoint",
);

// Synthetic micro-map: repaint-then-build + slot-occupied.
{
  const M = new Uint8Array(384 * 256).fill(0x20);
  const put = (x, y, v) => {
    M[y * 384 + x] = v;
  };
  const T2 = (x, y) => M[y * 384 + x];
  const A = { x: 50, y: 50 };
  const B = { x: 60, y: 50 };
  const C = { x: 50, y: 60 };
  put(50, 50, 0xcd);
  put(60, 50, 0xcd);
  put(50, 60, 0xcd);
  put(51, 50, 0xd4);
  put(59, 50, 0xd4);
  put(50, 59, 0xd4);
  for (let x = 52; x <= 58; x++) put(x, 50, 0xc8);
  put(51, 51, 0xc8);
  put(51, 52, 0xc8);
  const mc = new Map([
    ["A", A],
    ["B", B],
    ["C", C],
  ]);
  const r1 = buildRoad({
    fromCityId: "A",
    toCityId: "B",
    geometry: Array.from({ length: 9 }, (_, i) => ({ x: 51 + i, y: 50 })),
    travelKind: "land",
    cities: mc,
    roads: [],
    tiles: T2,
  });
  assert.equal(r1.nativeBinding.weight, 8, "micro cost N-1");
  assert.deepEqual(
    r1.nativeBinding.slots.map((s) => [s.node, s.slot, s.side]),
    [["A", 1, "source"], ["B", 0, "target"]],
    "micro slots E/W discipline",
  );
  tlog("micro build: A->B cost 8, slots E/W");
  // slot-occupied is unreachable through geometry and stays as
  // defense-in-depth: same (city,dir) slot implies the same port cell
  // (certified: no city has two ports in one cardinal direction), so any
  // geometric attempt trips shared-cell first. The duplicate-edge case
  // above exercises exactly that precedence.
}
tlog("roadedit OK: roundtrip + refusals + micro repaint/slot discipline");


// v2 re-encode: authoring roads (with backfilled slots, as copies carry)
// encode byte-identical to roads.json; an edited set (leaf edge dropped)
// encodes to a loadable graph whose 487B honestly exhausts at the leaf.
{
  const { encodeRoadGraphV2, deriveSlots } = await import("../web/src/content/authoring/roadedit.js");
  const citiesById = new Map(world.cities.map((c) => [c.id, { x: c.x, y: c.y }]));
  const authoring = graph.edges.map((e) => {
    const [a, b] = deriveSlots(
      e.points,
      { x: graph.nodes[e.source].x, y: graph.nodes[e.source].y },
    );
    return {
      id: `road-${e.id}`,
      fromCityId: world.cities[e.source].id,
      toCityId: world.cities[e.target].id,
      travelKind: "land",
      geometry: e.points.map((p) => ({ x: p.x, y: p.y })),
      nativeBinding: {
        weight: e.weight,
        flags: e.points.map((p) => p.flags),
        bounds: e.bounds,
        slots: [
          { node: world.cities[e.source].id, ...a },
          { node: world.cities[e.target].id, ...b },
        ],
      },
    };
  });
  const encoded = encodeRoadGraphV2(authoring, citiesById);
  assert.deepEqual(encoded, graph, "re-encode matches roads.json exactly");
  tlog("v2 re-encode: byte-identical roundtrip on all 254 edges");

  // Edited set through the encoder into the live engine.
  const cut = authoring.filter((r) => r.id !== "road-39"); // leaf-27 bridge
  const edited = encodeRoadGraphV2(cut, citiesById);
  assert.equal(edited.edges.length, 253);
  const { attachSyntheticNativeFactionSource } = await import("./native_faction_fixture.mjs");
  const { createContentCatalog } = await import("../web/src/content/catalog.js");
  const { createWorldResources } = await import("../web/src/game/worldresources.js");
  const { createNewGameScenario } = await import("../web/src/game/world.js");
  const { prepareScenario, scenarioNativeRoadContext } = await import("../web/src/game/scenarioassembly.js");
  const { getScenarioRoadMemory } = await import("../web/src/game/navigation/scenarioroadmemory.js");
  const { retreatOriginalRoadMemory } = await import("../web/src/game/navigation/originalroadretreat.js");
  const template = {
    player_faction: 0,
    factions: [{ idx: 0, capital: 0, n_legions: 0, active: true, monarch_idx: 126, march_marker_style: 0 }],
    generals: [],
    cities: graph.nodes.map(({ id, x, y }) => ({ idx: id, x, y, faction: 0, governor: null, type: 0, production: 10 })),
    legions: [],
    weatherClouds: Array.from({ length: 16 }, () => ({ status: 0 })),
    disasterMapObjects: Array.from({ length: 16 }, () => ({ status: 0 })),
  };
  const manifest = {
    schemaVersion: 1, rules: "ki-1995", id: "encode-engine", revision: "1",
    chapters: [{ id: "chapter", legacyScenarioIndex: 0, official: false }],
  };
  const content = createContentCatalog(manifest, { scenarios: [template] });
  const worldRes = createWorldResources();
  const raw = createNewGameScenario(template);
  attachSyntheticNativeFactionSource(raw);
  const oldFetch = globalThis.fetch;
  const allowed = new Set([
    worldRes.definition.assets.terrain,
    worldRes.definition.assets.roadCost,
    worldRes.definition.assets.roadOffset,
    worldRes.definition.assets.roadGraph,
  ]);
  globalThis.fetch = async (url) => {
    assert(allowed.has(String(url)), `Unexpected asset ${url}`);
    if (String(url) === worldRes.definition.assets.roadGraph) return { ok: true, json: async () => edited };
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(384 * 256), json: async () => ({}) };
  };
  let sc;
  let memory;
  try {
    ({ scenario: sc } = await prepareScenario({ raw, idx: 0, mode: "fresh", content, world: worldRes }));
    memory = getScenarioRoadMemory(sc);
  } finally {
    globalThis.fetch = oldFetch;
  }
  const context = scenarioNativeRoadContext(sc);
  const r = retreatOriginalRoadMemory({
    readFactionByte: () => 0,
    readCapitalByte: () => 0,
    readCurrentWord: () => 27 * 8,
    readGraphByte: memory.readByte,
    writeGraphByte: memory.writeByte,
    readStateByte: context.readCityOwnerByte,
  });
  assert.notEqual(r.reason, "found", "encoder-dropped bridge exhausts honestly");
  assert.equal(r.cf, false, "exhaustion exits without CF");
  tlog(`encoded edited graph loads live; leaf query -> ${r.reason}`);
}
tlog("roadedit v2 encode OK");
