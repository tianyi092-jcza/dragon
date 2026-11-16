// CITY-CAPACITY-1 admission: 1..256 live city/node tables admit fresh
// assembly; 0/mismatch/257+ stay fail-closed. M193: 193-city fresh assembly
// with the 193rd city owned, cached and searchable through indexed readers.
// Synthetic fixtures only; no saves, profiles or network.
import assert from "node:assert/strict";
import test from "node:test";
import { createRoadGraph } from "../web/src/game/navigation/roadgraph.js";
import {
  searchRegionsFor,
} from "../web/src/game/navigation/originalroadmemory.js";
import {
  cityNodeBoundOf,
  roadNodeToCitySlot,
} from "../web/src/game/navigation/originalroadstate.js";
import { searchOriginalRoadMemory } from "../web/src/game/navigation/originalroadsearch.js";
import { attachSyntheticNativeFactionSource } from "./native_faction_fixture.mjs";
import { createHash } from "node:crypto";
import { createContentCatalog } from "../web/src/content/catalog.js";
import { saveJSON } from "../web/src/core/gamesavecodec.js";
import { createGameSaveStore } from "../web/src/core/gamesavestore.js";
import { gameSaveMemoryIDB } from "./gamesave_mock.mjs";
import { createWorldResources } from "../web/src/game/worldresources.js";
import { createNewGameScenario } from "../web/src/game/world.js";
import {
  admitSavedScenario,
  snapshotState,
  restoreSnapshotState,
} from "../web/src/game/savegame.js";
import {
  prepareScenario,
  readSavedAssembly,
  scenarioNativeRoadContext,
} from "../web/src/game/scenarioassembly.js";
import {
  initializeNativeLegionSlotsFromZeroChapter,
  rebindNativeLegionViews,
} from "../web/src/game/nativelegions.js";

function graphFixture(total, version = 2) {
  // v3 keeps node=slot*8; the single edge moves to the relocated base.
  const edgeBase = version === 3 ? (total * 8 + 15) & ~15 : 0x800;
  const graph = {
    version,
    width: 384,
    height: 256,
    nodes: Array.from({ length: total }, (_, id) => ({
      id,
      x: id + 1,
      y: 10,
      edgeSlots: [0, 0, 0, 0],
    })),
    edges: [],
  };
  if (total >= 2) {
    graph.nodes[0].edgeSlots[0] = 0x4000 | edgeBase;
    graph.nodes[1].edgeSlots[0] = 0x8000 | edgeBase;
    graph.edges.push({
      id: 0,
      source: 0,
      target: 1,
      weight: 1,
      bounds: { minX: 1, maxX: 2, minY: 11, maxY: 11 },
      points: [
        { x: 1, y: 11, flags: 0x44 },
        { x: 2, y: 11, flags: 4 },
      ],
    });
  }
  return graph;
}

function mockFetch(world, graph) {
  const urls = world.definition.assets;
  const allowed = new Set([
    urls.terrain,
    urls.roadCost,
    urls.roadOffset,
    urls.roadGraph,
  ]);
  const old = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert(allowed.has(url), `Unexpected asset ${url}`);
    return {
      ok: true,
      json: async () => (url === urls.roadGraph ? graph : {}),
      arrayBuffer: async () => new Uint8Array(384 * 256).fill(0xba).buffer,
    };
  };
  return () => {
    globalThis.fetch = old;
  };
}

async function prepareFresh(total, change, version = 2) {
  const graph = graphFixture(total, version);
  const template = {
    player_faction: 0,
    generals: [],
    legions: [],
    factions: [
      {
        idx: 0,
        capital: 0,
        n_legions: 0,
        active: true,
        attr: 0x80,
        money: 1000,
        legion_morale_cap: 200,
        march_marker_style: 0,
        strategic_city_primary: null,
        strategic_city_secondary: null,
        n_cities: total - 1,
      },
      {
        idx: 1,
        capital: total - 1,
        n_legions: 0,
        active: true,
        attr: 0x80,
        money: 1000,
        legion_morale_cap: 200,
        march_marker_style: 0,
        strategic_city_primary: null,
        strategic_city_secondary: null,
        n_cities: 1,
      },
    ],
    cities: graph.nodes.map(({ id, x, y }) => ({
      idx: id,
      x,
      y,
      faction: id === total - 1 ? 1 : 0,
      attr: 0x80,
      governor: null,
      _aiCooldown: 0,
      _strategicLastFaction: id === total - 1 ? 1 : 0,
    })),
    diplomacy: Array.from({ length: 24 }, () => Array(24).fill(0)),
    weatherClouds: Array.from({ length: 16 }, () => ({})),
    disasterMapObjects: Array.from({ length: 16 }, () => ({ status: 0 })),
  };
  // The last city carries explicit C1B/C1C/ disaster inputs (null-terminated);
  // the rest follow the existing zero-record fixture convention.
  template.cities[total - 1].strategicBorderCount = 0;
  template.cities[total - 1].strategicNeighbours = [255, 255, 255, 255];
  template.cities[total - 1].disaster_event = 0;
  const content = createContentCatalog(
    {
      schemaVersion: 1,
      rules: "ki-1995",
      id: "admission-test",
      revision: "1",
      chapters: [{ id: "chapter", legacyScenarioIndex: 0, official: true }],
    },
    { scenarios: [template] },
  );
  const raw = createNewGameScenario(template);
  initializeNativeLegionSlotsFromZeroChapter(raw);
  attachSyntheticNativeFactionSource(raw);
  // Synthetic 32B city records (C18 byte only); production records stay official.
  raw.nativeCityRecordRaw = Array.from({ length: total }, () =>
    Buffer.alloc(32).toString("hex"),
  );
  if (raw.nativeLegionSlots) {
    for (const legion of raw.legions)
      raw.nativeLegionSlots.records[legion.slot] = legion;
    rebindNativeLegionViews(raw);
  }
  const world = createWorldResources();
  const args = {
    raw,
    idx: 0,
    content,
    world,
    mode: "fresh",
    terrainMemory: {
      version: 1,
      spans: [{ address: 0, hex: "ba".repeat(384 * 256) }],
    },
    movementMemory: {
      version: 1,
      spans: [{ address: 3840, hex: "00".repeat(768) }],
    },
  };
  if (change) change(raw, graph);
  const unmock = mockFetch(world, graph);
  try {
    return { ...(await prepareScenario(args)), args, world, content, graph, template };
  } finally {
    unmock();
  }
}

test("M257: 257-city v3 fresh assembly admits, owns, caches and searches the last city", async () => {
  const { scenario } = await prepareFresh(257, null, 3);
  assert.equal(scenario.cities.length, 257);
  const context = scenarioNativeRoadContext(scenario);
  assert.equal(context.memory.roadLayout.version, 3);
  assert.equal(context.readCityOwner(0, "admission-v3"), 0);
  assert.equal(context.readCityOwner(256, "admission-v3"), 1);
  assert.equal(context.cityCache.readByte(256), 0);
  const result = searchOriginalRoadMemory({
    start: 0,
    stopB: 8,
    stopC: 8,
    owner: 0,
    readGraphByte: context.memory.readByte,
    writeGraphByte: context.memory.writeByte,
    readStateByte: () => {
      throw new Error("legacy address read must not fire");
    },
    readCityOwnerAtNode: (node, at) =>
      context.readCityOwner(roadNodeToCitySlot(scenario, node, at), at),
    cityNodeBound: cityNodeBoundOf(scenario),
    regions: searchRegionsFor(context.memory.roadLayout),
  });
  assert.deepEqual(result, {
    ax: 0xfffc,
    bx: 0x810,
    cx: 5,
    cf: false,
    reason: "found",
  });
});

test("M257: v3 snapshot/restore roundtrip preserves 257 cities and high-slot ownership", async () => {
  const { scenario, args, world, content, graph } = await prepareFresh(257, null, 3);
  const app = {
    scenario,
    scenarioIdx: 0,
    world,
    content,
    clock: { year: 190, month: 1, day: 1 },
  };
  const saved = JSON.parse(JSON.stringify(snapshotState(app, 0, "admission-v3")));
  const unmock = mockFetch(world, graph);
  let result;
  try {
    result = await prepareScenario({
      ...args,
      mode: "restore",
      raw: restoreSnapshotState(saved),
      ...readSavedAssembly(saved),
    });
  } finally {
    unmock();
  }
  assert.equal(result.scenario.cities.length, 257);
  assert.equal(result.scenario.cities[256].idx, 256);
  const context = scenarioNativeRoadContext(result.scenario);
  assert.equal(context.readCityOwner(256, "restore-v3"), 1);
  assert.equal(context.cityCache.readByte(256), 0);
});

test("M193: 193-city fresh assembly admits, owns, caches and searches the last city", async () => {
  const { scenario } = await prepareFresh(193);
  assert.equal(scenario.cities.length, 193);
  const context = scenarioNativeRoadContext(scenario);
  assert.equal(context.readCityOwner(0, "admission"), 0);
  assert.equal(context.readCityOwner(192, "admission"), 1);
  assert.equal(context.cityCache.readByte(192), 0);
  const result = searchOriginalRoadMemory({
    start: 0,
    stopB: 8,
    stopC: 8,
    owner: 0,
    readGraphByte: context.memory.readByte,
    writeGraphByte: context.memory.writeByte,
    readStateByte: () => {
      throw new Error("legacy address read must not fire");
    },
    readCityOwnerAtNode: (node, at) =>
      context.readCityOwner(roadNodeToCitySlot(scenario, node, at), at),
    cityNodeBound: cityNodeBoundOf(scenario),
  });
  assert.deepEqual(result, {
    ax: 0xfffc,
    bx: 0x800,
    cx: 5,
    cf: false,
    reason: "found",
  });
});

test("M193: snapshot/restore roundtrip preserves 193 cities and high-slot ownership", async () => {
  const { scenario, args, world, content, graph } = await prepareFresh(193);
  const app = {
    scenario,
    scenarioIdx: 0,
    world,
    content,
    clock: { year: 190, month: 1, day: 1 },
  };
  // JSON roundtrip proves save-codec safety, not just structuredClone.
  const saved = JSON.parse(JSON.stringify(snapshotState(app, 0, "admission")));
  const unmock = mockFetch(world, graph);
  let result;
  try {
    result = await prepareScenario({
      ...args,
      mode: "restore",
      raw: restoreSnapshotState(saved),
      ...readSavedAssembly(saved),
    });
  } finally {
    unmock();
  }
  assert.equal(result.scenario.cities.length, 193);
  assert.equal(result.scenario.cities[192].idx, 192);
  const context = scenarioNativeRoadContext(result.scenario);
  assert.equal(context.readCityOwner(192, "restore"), 1);
  assert.equal(context.cityCache.readByte(192), 0);
});

test("admission rejects 257+ v2 nodes, 513+ v3 nodes, empty tables and city/graph mismatch", async () => {
  const graph257 = graphFixture(257);
  const roads = createRoadGraph("admission/257", {
    fetcher: async () => ({ ok: true, json: async () => graph257 }),
  });
  await assert.rejects(roads.loadRoadGraph(), /node records/);
  const graph513 = graphFixture(513, 3);
  const roads513 = createRoadGraph("admission/513", {
    fetcher: async () => ({ ok: true, json: async () => graph513 }),
  });
  await assert.rejects(roads513.loadRoadGraph(), /node records/);
  await assert.rejects(prepareFresh(0), /./);
  await assert.rejects(
    prepareFresh(193, (raw, graph) => {
      graph.nodes.pop();
      raw.cities.pop();
      raw.nativeCityRecordRaw.pop();
      // Graph now shorter than the city table.
      raw.cities.push({
        idx: 193,
        x: 194,
        y: 10,
        faction: 0,
        attr: 0x80,
        governor: null,
        _aiCooldown: 0,
        _strategicLastFaction: 0,
        strategicBorderCount: 0,
        strategicNeighbours: [255, 255, 255, 255],
        disaster_event: 0,
      });
      raw.nativeCityRecordRaw.push(Buffer.alloc(32).toString("hex"));
      raw.factions[0].n_cities = 193;
    }),
    /Invalid scenario city table/,
  );
});

test("M257: v3 full store roundtrip preserves 257 cities through put/get/admit/restore", async () => {
  const { scenario, world, content, graph, template } = await prepareFresh(
    257,
    null,
    3,
  );
  const app = {
    scenario,
    scenarioIdx: 0,
    world,
    content,
    clock: { year: 190, month: 1, day: 1 },
  };
  const saved = snapshotState(app, 0, "admission-v3-store");
  const text = saveJSON(saved);
  const memory = gameSaveMemoryIDB();
  const gameId = "admission-v3-store";
  const store = createGameSaveStore({
    gameId,
    databaseName: "admission-v3-memory",
    getIndexedDB: () => memory.indexedDB,
    createRecordId: () => gameId + "-" + memory.stats.writes.length,
  });
  await store.put({
    gameId,
    releaseId: "fixture-not-published",
    releaseOrdinal: 0,
    chapterId: "chapter",
    manifestDigest: createHash("sha256").update("admission-v3").digest("hex"),
    slot: 0,
    snapshot: saved,
  });
  const got = await store.get(0);
  assert.equal(saveJSON(got.record.snapshot), text);
  assert.deepEqual(got.record.snapshot, saved);
  const restoredWorld = createWorldResources();
  const admitted = admitSavedScenario(got.record.snapshot, {
    data: { scenarios: [template] },
    content,
    world: restoredWorld,
  });
  const unmock = mockFetch(restoredWorld, graph);
  let result;
  try {
    result = await prepareScenario({
      ...admitted,
      mode: "restore",
      content,
      world: restoredWorld,
    });
  } finally {
    unmock();
  }
  assert.equal(result.scenario.cities.length, 257);
  assert.equal(result.scenario.cities[256].idx, 256);
  const context = scenarioNativeRoadContext(result.scenario);
  assert.equal(context.readCityOwner(256, "store-restore-v3"), 1);
  assert.equal(context.cityCache.readByte(256), 0);
});
