// Web assembly contract only: synthetic fixed-world data and mock fetch; no disk/save I/O.
import assert from "node:assert/strict";
import test from "node:test";
import { createContentCatalog } from "../web/src/content/catalog.js";
import { createWorldResources } from "../web/src/game/worldresources.js";
import { createNewGameScenario, Scenario } from "../web/src/game/world.js";
import { snapshotState, restoreSnapshotState } from "../web/src/game/savegame.js";
import { getScenarioRoadMemory, initializeScenarioRoadMemory } from "../web/src/game/navigation/scenarioroadmemory.js";
import { searchOriginalRoadMemory } from "../web/src/game/navigation/originalroadsearch.js";

function fixture(version = 1) {
  const graph = {
    version, width: 384, height: 256,
    nodes: Array.from({ length: 192 }, (_, id) => ({ id, x: id, y: 1, edgeSlots: [0, 0, 0, 0] })),
    edges: [],
  };
  if (version === 2) {
    graph.nodes[0].edgeSlots[0] = 0x4800;
    graph.nodes[1].edgeSlots[0] = 0x8800;
    graph.edges.push({ id: 0, source: 0, target: 1, weight: 1,
      bounds: { minX: 0, maxX: 1, minY: 2, maxY: 2 },
      points: [{ x: 0, y: 2, flags: 0x44 }, { x: 1, y: 2, flags: 4 }] });
  }
  const template = {
    factions: [{ idx: 0, n_legions: 0 }], generals: [], legions: [],
    cities: graph.nodes.map(({ id, x, y }) => ({ idx: id, x, y, faction: null })),
  };
  const data = { scenarios: [template, structuredClone(template)] };
  const content = createContentCatalog({ schemaVersion: 1, rules: "ki-1995", id: "fixture", revision: "1",
    chapters: [0, 1].map(i => ({ id: `chapter-${i}`, legacyScenarioIndex: i, official: true })) }, data);
  const world = createWorldResources();
  const raw = createNewGameScenario(template);
  return { graph, data, content, world, raw, idx: 0, mode: "fresh" };
}
async function withGraph(f, body) {
  const previous = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async (url) => {
    requests++;
    return { ok: true, json: async () => url === "road_graph.json" ? f.graph : {},
      arrayBuffer: async () => new ArrayBuffer(384 * 256) };
  };
  try { await body(() => requests); } finally { globalThis.fetch = previous; }
}
const json = value => JSON.parse(JSON.stringify(value));
const appFor = (f, scenario) => ({ ...f, scenario, scenarioIdx: 0,
  clock: { year: 190, month: 1, day: 1 }, originalRng: { snapshot: () => ({ state: 7 }) } });

// Dynamic import makes the initial red an assertion for the missing shared contract.
async function api() { return import("../web/src/game/scenarioassembly.js"); }

test("unbound v2 context or independently attached RAM cannot silently become a legacy v1 snapshot", async () => {
  const f = fixture(2);
  await withGraph(f, async () => {
    await f.world.terrain.loadTerrain();
    const sc = new Scenario(structuredClone(f.raw));
    const app = appFor(f, sc);
    assert.throws(() => snapshotState(app, 0, "unbound v2"), /assembly identity/);
    initializeScenarioRoadMemory(sc, f.world, f.content.chapter(0).reference);
    assert.throws(() => snapshotState(app, 0, "unbound RAM"), /assembly identity/);
    assert.deepEqual(getScenarioRoadMemory(sc).snapshot().patches, []);
  });
});

test("actual shared preparation binds v1 identity; formal JSON and metadata-less phase v1 restore", async () => {
  const { prepareScenario, assertPlayableScenario } = await api();
  const { admitSavedScenario } = await import("../web/src/game/savegame.js");
  const f = fixture();
  await withGraph(f, async () => {
    const prepared = await prepareScenario(f);
    assertPlayableScenario(prepared);
    assert.notEqual(prepared.scenario.cities, f.raw.cities);
    assert.deepEqual(prepared.scenario.legions, []);
    const saved = json(snapshotState(appFor(f, prepared.scenario), 0, "v1"));
    assert.equal(saved.webMeta.scenarioAssembly.roadVersion, 1);
    assert.deepEqual(saved.webMeta.scenarioAssembly.content, f.content.chapter(0).reference);
    const admission = admitSavedScenario(saved, f);
    const restored = await prepareScenario({ ...f, ...admission, mode: "restore" });
    assertPlayableScenario(restored);
    assert.deepEqual(restored.scenario.legionSlotCounters, f.raw.legionSlotCounters);
    delete saved.webMeta.scenarioAssembly;
    assert.equal(admitSavedScenario(saved, f).metadata, null);
    assert.deepEqual(restoreSnapshotState(saved).legions, []);
  });
});

test("synchronous admission rejects explicit malformed identity/mode without map requests or mutations", async () => {
  const { prepareScenario } = await api();
  const { admitSavedScenario } = await import("../web/src/game/savegame.js");
  const f = fixture();
  await withGraph(f, async requests => {
    const prepared = await prepareScenario(f);
    const valid = json(snapshotState(appFor(f, prepared.scenario), 0, "v1"));
    const count = requests();
    for (const mutate of [
      s => { s.webMeta.scenarioAssembly.version = 2; },
      s => { s.webMeta.scenarioAssembly = null; },
      s => { s.webMeta.scenarioAssembly.roadVersion = 3; },
      s => { s.webMeta.scenarioAssembly.world.revision = "wrong"; },
      s => { s.webMeta.scenarioAssembly.world.id = "wrong"; },
      s => { s.webMeta.scenarioAssembly.content.revision = "wrong"; },
      s => { s.webMeta.scenarioAssembly.content.packId = "wrong"; },
      s => { s.webMeta.scenarioAssembly.content.chapterId = "chapter-1"; },
      s => { s.scenario_idx = 1; },
      s => { s.webMeta.roadMemory = {}; },
      s => { delete s.webMeta.scenarioAssembly; s.webMeta.roadMemory = {}; },
      s => { delete s.webMeta.scenarioAssembly; s.state.roadVersion = 2; },
      s => { delete s.state.legionSlotCounters; },
      s => { s.webMeta.scenarioRuntimeState.delayedLegionReturns = [{ slot: 0, status: 128 }]; },
    ]) {
      const bad = json(valid); mutate(bad); const before = json(bad);
      assert.throws(() => admitSavedScenario(bad, f));
      assert.deepEqual(bad, before);
    }
    assert.equal(requests(), count);
  });
});

test("detached v2 formal sidecar preserves known zero, holes, old queue and low writes, never playable", async () => {
  const { prepareScenario, assertPlayableScenario } = await api();
  const { admitSavedScenario } = await import("../web/src/game/savegame.js");
  const f = fixture(2);
  await withGraph(f, async () => {
    const prepared = await prepareScenario(f);
    assert.throws(() => assertPlayableScenario(prepared), /v2.*not connected/);
    const memory = getScenarioRoadMemory(prepared.scenario);
    memory.writeByte(0x804, 77); memory.writeByte(0x8000, 0); memory.writeByte(0x8bff, 165);
    const saved = json(snapshotState(appFor(f, prepared.scenario), 0, "detached"));
    assert.throws(() => admitSavedScenario(saved, f), /v2.*not connected/);
    const restored = await prepareScenario({ ...f, mode: "restore", raw: restoreSnapshotState(saved),
      metadata: saved.webMeta.scenarioAssembly, roadMemory: saved.webMeta.roadMemory });
    const other = getScenarioRoadMemory(restored.scenario);
    assert.notEqual(other, memory);
    assert.deepEqual(other.snapshot(), memory.snapshot());
    assert.equal(other.readByte(0x8000), 0);
    assert.equal(other.readByte(0x8bff), 165);
    assert.throws(() => other.readByte(0x8001), /Unprovided/);
    // Same engine before/after formal JSON persistence, not an independent KI oracle.
    const query = (prepared, ram, start, stopB) => {
      const trace = [];
      const result = searchOriginalRoadMemory({ start, stopB, stopC: stopB, owner: 0,
        readGraphByte: ram.readByte, writeGraphByte: ram.writeByte,
        readStateByte: prepared.readCityOwnerByte, observe: event => trace.push(event) });
      return { result, trace };
    };
    for (const [start, stop] of [[0, 8], [8, 0], [0, 0], [0, 16]]) {
      assert.deepEqual(query(restored, other, start, stop), query(prepared, memory, start, stop));
      assert.deepEqual(other.snapshot(), memory.snapshot());
      assert.equal(other.readByte(0x8bff), 165);
      assert.throws(() => other.readByte(0x8c00), /Unprovided/);
    }
    restored.scenario.cities[0].faction = 7;
    assert.equal(restored.readCityOwnerByte(0x841), 7);
    assert.equal(prepared.readCityOwnerByte(0x841), 24);
    const detached = saved.webMeta.roadMemory;
    detached.memory.patches[0].hex = "00";
    assert.equal(other.readByte(0x804), 77);
    for (const mutate of [
      s => { delete s.webMeta.roadMemory; },
      s => { delete s.webMeta.roadMemory.memory; },
      s => { s.webMeta.roadMemory.memory.initialGraph = "00"; },
      s => { s.webMeta.roadMemory.memory.patches = [{ address: 65535, hex: "0000" }]; },
      s => { s.webMeta.roadMemory.identity.content.chapterId = "chapter-1"; },
    ]) {
      const bad = json(snapshotState(appFor(f, prepared.scenario), 0, "bad")); mutate(bad);
      await assert.rejects(prepareScenario({ ...f, mode: "restore", raw: bad.state,
        metadata: bad.webMeta.scenarioAssembly, roadMemory: bad.webMeta.roadMemory }));
    }
    await assert.rejects(prepareScenario({ ...f, mode: "restore" }), /memory|metadata/i);
    await assert.rejects(prepareScenario({ ...f, mode: "fresh", roadMemory: saved.webMeta.roadMemory }));
  });
});

test("loaded version and fixed city correspondence reject, ownership changes remain legal; snapshot identity cannot drift", async () => {
  const { prepareScenario } = await api();
  const f = fixture();
  await withGraph(f, async () => {
    const prepared = await prepareScenario(f);
    const app = appFor(f, prepared.scenario);
    const saved = snapshotState(app, 0, "v1");
    for (const mutate of [r => { r.cities[0].idx = 1; }, r => { r.cities[0].x = 2; }, r => { r.cities.pop(); }]) {
      const raw = structuredClone(f.raw); mutate(raw);
      await assert.rejects(prepareScenario({ ...f, raw }), /city|cities/i);
    }
    const raw = structuredClone(f.raw); raw.cities[0].faction = 7;
    await prepareScenario({ ...f, raw });
    const metadata = structuredClone(saved.webMeta.scenarioAssembly); metadata.roadVersion = 2;
    await assert.rejects(prepareScenario({ ...f, mode: "restore", metadata, roadMemory: {} }), /version|memory/i);
    app.scenarioIdx = 1;
    const before = JSON.stringify(prepared.scenario);
    assert.throws(() => snapshotState(app, 0, "bad"), /identity|index/i);
    assert.equal(JSON.stringify(prepared.scenario), before);
  });
});
