// Web assembly contract only: synthetic fixed-world data and mock fetch; no disk/save I/O.
import assert from "node:assert/strict";
import test from "node:test";
import { attachSyntheticNativeFactionSource } from "./native_faction_fixture.mjs";
import { createContentCatalog } from "../web/src/content/catalog.js";
import { createWorldResources } from "../web/src/game/worldresources.js";
import { createNewGameScenario, Scenario } from "../web/src/game/world.js";
import {
  snapshotState,
  restoreSnapshotState,
} from "../web/src/game/savegame.js";
import {
  getScenarioRoadMemory,
  initializeScenarioRoadMemory,
} from "../web/src/game/navigation/scenarioroadmemory.js";
import { searchOriginalRoadMemory } from "../web/src/game/navigation/originalroadsearch.js";

// P76 gate: only v2 graphs may reach prepare; v1 owners are unconstructible.
function fixture(version = 2, generals = []) {
  const graph = {
    version,
    width: 384,
    height: 256,
    nodes: Array.from({ length: 192 }, (_, id) => ({
      id,
      x: id,
      y: 1,
      edgeSlots: [0, 0, 0, 0],
    })),
    edges: [],
  };
  if (version === 2) {
    graph.nodes[0].edgeSlots[0] = 0x4800;
    graph.nodes[1].edgeSlots[0] = 0x8800;
    graph.edges.push({
      id: 0,
      source: 0,
      target: 1,
      weight: 1,
      bounds: { minX: 0, maxX: 1, minY: 2, maxY: 2 },
      points: [
        { x: 0, y: 2, flags: 0x44 },
        { x: 1, y: 2, flags: 4 },
      ],
    });
  }
  const template = {
    factions: [{ idx: 0, n_legions: 0 }],
    generals,
    legions: [],
    cities: graph.nodes.map(({ id, x, y }) => ({
      idx: id,
      x,
      y,
      faction: null,
    })),
    // P58 flip: fresh v2 owns 16 weather slots (cloud status fills 0x80).
    weatherClouds: Array.from({ length: 16 }, () => ({})),
  };
  const data = { scenarios: [template, structuredClone(template)] };
  const content = createContentCatalog(
    {
      schemaVersion: 1,
      rules: "ki-1995",
      id: "fixture",
      revision: "1",
      chapters: [0, 1].map((i) => ({
        id: `chapter-${i}`,
        legacyScenarioIndex: i,
        official: true,
      })),
    },
    data,
  );
  const world = createWorldResources();
  const raw = createNewGameScenario(template);
  if (version === 2) attachSyntheticNativeFactionSource(raw);
  return { graph, data, content, world, raw, idx: 0, mode: "fresh" };
}
async function withGraph(f, body) {
  const previous = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async (url) => {
    requests++;
    return {
      ok: true,
      json: async () => (url === "road_graph.json" ? f.graph : {}),
      arrayBuffer: async () => new ArrayBuffer(384 * 256),
    };
  };
  try {
    await body(() => requests);
  } finally {
    globalThis.fetch = previous;
  }
}
const json = (value) => {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    throw new Error("synthetic fixture JSON round-trip failed", {
      cause: error,
    });
  }
};
const appFor = (f, scenario) => ({
  ...f,
  scenario,
  scenarioIdx: 0,
  clock: { year: 190, month: 1, day: 1 },
  originalRng: { snapshot: () => ({ state: 7 }) },
});

// Dynamic import makes the initial red an assertion for the missing shared contract.
async function api() {
  return import("../web/src/game/scenarioassembly.js");
}

test("unbound v2 context or independently attached RAM cannot silently become a legacy v1 snapshot", async () => {
  const f = fixture(2);
  await withGraph(f, async () => {
    await f.world.terrain.loadTerrain();
    const sc = new Scenario(structuredClone(f.raw));
    const app = appFor(f, sc);
    assert.throws(
      () => snapshotState(app, 0, "unbound v2"),
      /assembly identity/,
    );
    initializeScenarioRoadMemory(sc, f.world, f.content.chapter(0).reference);
    assert.throws(
      () => snapshotState(app, 0, "unbound RAM"),
      /assembly identity/,
    );
    assert.deepEqual(getScenarioRoadMemory(sc).snapshot().patches, []);
  });
});

test("actual shared preparation binds v2 identity by default; explicit v1 metadata is retired at every gate", async () => {
  const { prepareScenario, assertPlayableScenario, readSavedAssembly } =
    await api();
  const { admitSavedScenario } = await import("../web/src/game/savegame.js");
  const f = fixture(2);
  await withGraph(f, async () => {
    const prepared = await prepareScenario(f);
    assertPlayableScenario(prepared); // P58 flip: v2 is playable
    assert.equal(prepared.metadata.roadVersion, 2);
    assert.notEqual(prepared.scenario.cities, f.raw.cities);
    assert.deepEqual(prepared.scenario.legions, []);
    const saved = json(snapshotState(appFor(f, prepared.scenario), 0, "v2"));
    assert.equal(saved.webMeta.scenarioAssembly.roadVersion, 2);
    assert.deepEqual(
      saved.webMeta.scenarioAssembly.content,
      f.content.chapter(0).reference,
    );
    const admission = admitSavedScenario(saved, f);
    const restored = await prepareScenario({
      ...f,
      ...admission,
      mode: "restore",
    });
    assertPlayableScenario(restored);
    assert.deepEqual(
      restored.scenario.legionSlotCounters,
      f.raw.legionSlotCounters,
    );
    delete saved.webMeta.scenarioAssembly;
    // A v2 save carries road memory: stripping its identity must reject
    // at admit and at restore (P58 flip; the old metadata-less v1 phase
    // no longer exists for v2 saves).
    assert.throws(() => admitSavedScenario(saved, f), /metadata/);
    assert.throws(() => restoreSnapshotState(saved), /metadata/);
  });
  // P65 G5 (entire-v2-replacement gate): explicit v1 save metadata is
  // retired (P24 no-old-save-compat policy). The old v1 restore contract
  // is revoked: read, admit, prepare, and playable gates all reject v1.
  const g = fixture();
  await withGraph(g, async () => {
    const legacyMetadata = {
      version: 1,
      world: {
        id: g.world.definition.id,
        revision: g.world.definition.revision,
      },
      content: structuredClone(g.content.chapter(0).reference),
      roadVersion: 1,
    };
    assert.throws(
      () =>
        readSavedAssembly({
          webMeta: { scenarioAssembly: legacyMetadata },
        }),
      /retired/,
    );
    assert.throws(
      () => assertPlayableScenario({ metadata: legacyMetadata }),
      /unstaged/,
    );
    await assert.rejects(
      prepareScenario({
        raw: g.raw,
        idx: 0,
        content: g.content,
        world: g.world,
        mode: "restore",
        metadata: legacyMetadata,
      }),
      /retired/,
    );
  });
});

test("fresh v2 owns fate display flags 0 and mirrors general +0x1D", async () => {
  // 4D33 reads CS:98A6 bit 2 (zeroed at init, display-transient); fresh
  // rule processing observes 0, so fresh assembly must own it — previously
  // absent and the first siege capture threw. General +0x1D is one DOS
  // byte with two Web names: chapters parse captive_flag, fate reads
  // (KI 5885 unconditional) serve origFaction; fresh mirrors it here so
  // the first month-end 585F scan serves the chapter byte (0xFF → null).
  const { prepareScenario } = await api();
  const f = fixture(2, [
    { idx: 0, faction: 0, captive_flag: 0xff },
    { idx: 1, faction: 0, captive_flag: 3 },
    { idx: 2, faction: 0, captive_flag: 0xff, origFaction: 5 },
  ]);
  assert.equal(f.raw.generals[0].origFaction, null);
  assert.equal(f.raw.generals[1].origFaction, 3);
  assert.equal(f.raw.generals[2].origFaction, 5);
  await withGraph(f, async () => {
    const prepared = await prepareScenario(f);
    assert.equal(prepared.scenario.nativeFateDisplayFlags, 0);
    assert.equal(prepared.scenario.generals[0].origFaction, null);
    assert.equal(prepared.scenario.generals[1].origFaction, 3);
    assert.equal(prepared.scenario.generals[2].origFaction, 5);
  });
});

test("synchronous admission rejects explicit malformed identity/mode without map requests or mutations", async () => {
  const { prepareScenario } = await api();
  const { admitSavedScenario } = await import("../web/src/game/savegame.js");
  const f = fixture(2);
  await withGraph(f, async (requests) => {
    const prepared = await prepareScenario(f);
    const valid = json(snapshotState(appFor(f, prepared.scenario), 0, "v2"));
    const count = requests();
    for (const mutate of [
      (s) => {
        s.webMeta.scenarioAssembly.version = 2;
      },
      (s) => {
        s.webMeta.scenarioAssembly = null;
      },
      (s) => {
        s.webMeta.scenarioAssembly.roadVersion = 3;
      },
      (s) => {
        s.webMeta.scenarioAssembly.world.revision = "wrong";
      },
      (s) => {
        s.webMeta.scenarioAssembly.world.id = "wrong";
      },
      (s) => {
        s.webMeta.scenarioAssembly.content.revision = "wrong";
      },
      (s) => {
        s.webMeta.scenarioAssembly.content.packId = "wrong";
      },
      (s) => {
        s.webMeta.scenarioAssembly.content.chapterId = "chapter-1";
      },
      (s) => {
        s.scenario_idx = 1;
      },
      (s) => {
        // roadMemory shape is validated in prepare, not admit; instead pin
        // that a version lie (v2 save admitted as v1) rejects synchronously
        // at the P65 retired-v1 gate.
        s.webMeta.scenarioAssembly.roadVersion = 1;
      },
      (s) => {
        delete s.webMeta.scenarioAssembly;
        s.webMeta.roadMemory = {};
      },
      (s) => {
        delete s.webMeta.scenarioAssembly;
        s.state.roadVersion = 2;
      },
      (s) => {
        delete s.state.legionSlotCounters;
      },
      (s) => {
        // v2 authoritative table owns returns; runtime-state returns are
        // skipped by design, so malform the v2 road memory instead.
        delete s.webMeta.roadMemory;
      },
    ]) {
      const bad = json(valid);
      mutate(bad);
      const before = json(bad);
      assert.throws(() => admitSavedScenario(bad, f));
      assert.deepEqual(bad, before);
    }
    assert.equal(requests(), count);
  });
});

test("detached v2 formal sidecar preserves known zero, holes, old queue and low writes; v2 is playable since the P58 flip", async () => {
  const { prepareScenario, assertPlayableScenario } = await api();
  const { admitSavedScenario } = await import("../web/src/game/savegame.js");
  const f = fixture(2);
  await withGraph(f, async () => {
    const prepared = await prepareScenario(f);
    assertPlayableScenario(prepared); // P58 flip: v2 enters play
    assert.equal(prepared.scenario.nativeFactionSlots.records.length, 22);
    assert.equal(
      prepared.scenario.nativeFactionSlots.records[0],
      prepared.scenario.factions[0],
    );
    prepared.scenario.nativeFactionSlots.records[21].reserve_cav = 321;
    prepared.scenario.nativeMonthlyPolicy.bytes[1] = 0x5a;
    prepared.scenario.nativeMonthlyPolicy.bytes[9] = 0xa5;
    const memory = getScenarioRoadMemory(prepared.scenario);
    memory.writeByte(0x804, 77);
    memory.writeByte(0x8000, 0);
    memory.writeByte(0x8bff, 165);
    const saved = json(
      snapshotState(appFor(f, prepared.scenario), 0, "detached"),
    );
    const admission = admitSavedScenario(saved, f); // P58 flip: v2 admitted
    assert.equal(admission.metadata.roadVersion, 2);
    const restored = await prepareScenario({
      ...f,
      mode: "restore",
      raw: restoreSnapshotState(saved),
      metadata: saved.webMeta.scenarioAssembly,
      roadMemory: saved.webMeta.roadMemory,
    });
    const other = getScenarioRoadMemory(restored.scenario);
    assert.equal(
      restored.scenario.nativeFactionSlots.records[0],
      restored.scenario.factions[0],
    );
    assert.equal(
      restored.scenario.nativeFactionSlots.records[21].reserve_cav,
      321,
    );
    assert.equal(restored.scenario.nativeMonthlyPolicy.bytes[1], 0x5a);
    assert.equal(restored.scenario.nativeMonthlyPolicy.bytes[9], 0xa5);
    assert.notEqual(other, memory);
    assert.deepEqual(other.snapshot(), memory.snapshot());
    assert.equal(other.readByte(0x8000), 0);
    assert.equal(other.readByte(0x8bff), 165);
    assert.throws(() => other.readByte(0x8001), /Unprovided/);
    // Same engine before/after formal JSON persistence, not an independent KI oracle.
    const query = (prepared, ram, start, stopB) => {
      const trace = [];
      const result = searchOriginalRoadMemory({
        start,
        stopB,
        stopC: stopB,
        owner: 0,
        readGraphByte: ram.readByte,
        writeGraphByte: ram.writeByte,
        readStateByte: prepared.readCityOwnerByte,
        observe: (event) => trace.push(event),
      });
      return { result, trace };
    };
    for (const [start, stop] of [
      [0, 8],
      [8, 0],
      [0, 0],
      [0, 16],
    ]) {
      assert.deepEqual(
        query(restored, other, start, stop),
        query(prepared, memory, start, stop),
      );
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
      (s) => {
        delete s.webMeta.roadMemory;
      },
      (s) => {
        delete s.webMeta.roadMemory.memory;
      },
      (s) => {
        s.webMeta.roadMemory.memory.initialGraph = "00";
      },
      (s) => {
        s.webMeta.roadMemory.memory.patches = [{ address: 65535, hex: "0000" }];
      },
      (s) => {
        s.webMeta.roadMemory.identity.content.chapterId = "chapter-1";
      },
      (s) => {
        delete s.state.nativeMonthlyPolicy;
      },
      (s) => {
        delete s.state.nativeMonthlyPolicy.bytes[15];
      },
      (s) => {
        s.state.next_tax++;
      },
    ]) {
      const bad = json(snapshotState(appFor(f, prepared.scenario), 0, "bad"));
      mutate(bad);
      await assert.rejects(
        prepareScenario({
          ...f,
          mode: "restore",
          raw: bad.state,
          metadata: bad.webMeta.scenarioAssembly,
          roadMemory: bad.webMeta.roadMemory,
        }),
      );
    }
    await assert.rejects(
      prepareScenario({ ...f, mode: "restore" }),
      /memory|metadata/i,
    );
    await assert.rejects(
      prepareScenario({
        ...f,
        mode: "fresh",
        roadMemory: saved.webMeta.roadMemory,
      }),
    );
  });
});

test("loaded version and fixed city correspondence reject, ownership changes remain legal; snapshot identity cannot drift", async () => {
  const { prepareScenario } = await api();
  const f = fixture();
  await withGraph(f, async () => {
    const prepared = await prepareScenario(f);
    const app = appFor(f, prepared.scenario);
    const saved = snapshotState(app, 0, "v1");
    for (const mutate of [
      (r) => {
        r.cities[0].idx = 1;
      },
      (r) => {
        r.cities[0].x = 2;
      },
      (r) => {
        r.cities.pop();
      },
    ]) {
      const raw = structuredClone(f.raw);
      mutate(raw);
      await assert.rejects(prepareScenario({ ...f, raw }), /city|cities/i);
    }
    const raw = structuredClone(f.raw);
    raw.cities[0].faction = 7;
    await prepareScenario({ ...f, raw });
    const metadata = structuredClone(saved.webMeta.scenarioAssembly);
    metadata.roadVersion = 2;
    // P76 gate: the v1-graph version-lie mutant is retired with v1 owners.
    // Malformed restore (empty road memory on slot-less raw) still rejects
    // at the v2 restore gates.
    await assert.rejects(
      prepareScenario({ ...f, mode: "restore", metadata, roadMemory: {} }),
      /version|memory|v2 restore requires/i,
    );
    app.scenarioIdx = 1;
    const before = JSON.stringify(prepared.scenario);
    assert.throws(() => snapshotState(app, 0, "bad"), /identity|index/i);
    assert.equal(JSON.stringify(prepared.scenario), before);
  });
});
