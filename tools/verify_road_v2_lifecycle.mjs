// Staging-only controls: synthetic JSON, mock fetch, no browser/save/DOS I/O.
import assert from "node:assert/strict";
import test from "node:test";
import { createRoadGraph } from "../web/src/game/navigation/roadgraph.js";
import { createWorldResources } from "../web/src/game/worldresources.js";
import { DEFAULT_WORLD } from "../web/src/content/worlddefinition.js";
import { Scenario } from "../web/src/game/world.js";

function fixture() {
  const nodes = Array.from({ length: 192 }, (_, id) => ({
    id,
    x: id,
    y: 1,
    edgeSlots: [0, 0, 0, 0],
  }));
  nodes[0].edgeSlots[2] = 0x4800;
  nodes[1].edgeSlots[0] = 0x8800;
  return {
    version: 2,
    width: 384,
    height: 256,
    nodes,
    edges: [
      {
        id: 0,
        source: 0,
        target: 1,
        weight: 0,
        bounds: { minX: 0, maxX: 1, minY: 2, maxY: 2 },
        points: [
          { x: 0, y: 2, flags: 0x44 },
          { x: 1, y: 2, flags: 4 },
        ],
      },
    ],
  };
}
async function mocked(body) {
  const previous = globalThis.fetch;
  let raw = fixture();
  globalThis.fetch = async () => ({ ok: true, json: async () => raw });
  try {
    await body((next) => {
      raw = next;
    });
  } finally {
    globalThis.fetch = previous;
  }
}
const content = () => ({
  packId: "test-pack",
  chapterId: "chapter-a",
  revision: "r2",
});
const scenario = () => new Scenario({ cities: [] });
// Exercise JSON persistence, not structuredClone compatibility alone.
function copyJSON(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    assert.fail(`Expected a JSON-compatible road checkpoint: ${error.message}`);
  }
}

test("v2 loader detaches and deeply freezes raw graph; v1 still accepts its original shape", async () => {
  await mocked(async (set) => {
    const input = fixture();
    set(input);
    const roads = createRoadGraph("test/roads");
    const installed = await roads.loadRoadGraph();
    input.nodes[0].edgeSlots[2] = 0;
    input.nodes[0].x = 300;
    input.edges[0].weight = 88;
    input.edges[0].points[0].x = 300;
    input.edges[0].bounds.minX = 300;
    assert.equal(roads.roadNodeAt(0, 1).id, 0);
    assert.deepEqual(installed, fixture());
    for (const mutate of [
      () => {
        installed.version = 1;
      },
      () => {
        roads.roadNodeById(0).edgeSlots[2] = 0;
      },
      () => {
        roads.roadEdgeById(0).weight = 88;
      },
      () => {
        roads.roadEdgeById(0).bounds.minX = 3;
      },
      () => {
        roads.roadEdgeById(0).points[0].x = 3;
      },
      () => {
        roads.roadApproachesAt(0, 2)[0].node.x = 3;
      },
    ])
      assert.throws(mutate, TypeError);
    assert.strictEqual(await roads.loadRoadGraph(), installed);
    // P69 G8: the v1-fixture search probe below (legacy Dijkstra distance /
    // nodes) is deleted with the oracle. Fixture-shape validation stays
    // covered by the frozen-mutation pins above; search is native
    // (searchOriginalRoadMemory), covered by the native road suites.
  });
});

test("invalid v2 installation never exposes partial graph and retry validates again", async () => {
  await mocked(async (set) => {
    const changes = [
      (g) => {
        g.nodes[0].edgeSlots[2] = 0;
      },
      (g) => {
        g.nodes[0].edgeSlots[2] = 0xc800;
      },
      (g) => {
        g.nodes[0].edgeSlots[2] = 0x4801;
      },
      (g) => {
        g.nodes[0].edgeSlots[1] = 0x4800;
      },
      (g) => {
        g.edges[0].target = 0;
      },
      (g) => {
        g.edges[0].weight = 0.5;
      },
      (g) => {
        g.edges[0].weight = 256;
      },
      (g) => {
        delete g.edges[0].points[0].flags;
      },
      (g) => {
        delete g.edges[0].bounds;
      },
      (g) => {
        g.edges[0].bounds.maxX = 0;
      },
      (g) => {
        g.width = 768;
      },
      (g) => {
        g.nodes[0].x = 384;
      },
      (g) => {
        g.nodes[0].x = g.nodes[1].x;
      },
      (g) => {
        g.edges[0].points[0].y = 256;
      },
      (g) => {
        g.edges[0].points = Array.from({ length: 6145 }, () => ({
          x: 0,
          y: 2,
          flags: 4,
        }));
      },
    ];
    for (const change of changes) {
      const raw = fixture();
      change(raw);
      set(raw);
      const roads = createRoadGraph("retry/roads");
      await assert.rejects(roads.loadRoadGraph());
      assert.equal(roads.roadGraphReady(), false);
      assert.equal(roads.roadNodeById(0), null);
      assert.equal(roads.roadEdgeById(0), null);
      set(fixture());
      await roads.loadRoadGraph();
      assert.equal(roads.roadNodeById(0).x, 0);
    }
  });
});

test("v2 collection shape matches compiler: empty arrays accepted, non-arrays rejected", async () => {
  await mocked(async (set) => {
    const empty = fixture();
    empty.edges = [];
    for (const node of empty.nodes) node.edgeSlots = [0, 0, 0, 0];
    set(empty);
    const roads = createRoadGraph("empty/roads");
    assert.deepEqual(await roads.loadRoadGraph(), empty);
    for (const field of ["edges", "nodes"]) {
      for (const invalid of [{}, "", null]) {
        const graph = structuredClone(empty);
        graph[field] = invalid;
        set(graph);
        const rejected = createRoadGraph("invalid-collection/roads");
        await assert.rejects(rejected.loadRoadGraph());
        assert.equal(rejected.roadGraphReady(), false);
      }
    }
  });
});

test("installed v2 serves rule entries (P58 flip connects v2 callers)", async () => {
  await mocked(async () => {
    const resources = createWorldResources();
    assert.equal(resources.terrain.findPath(0, 0, 0, 0), null);
    await resources.roads.loadRoadGraph();
    const roads = resources.roads;
    assert.equal(roads.loadedRoadVersion(), 2);
    // P69 G8: installed-graph smoke now probes node identity, not the
    // deleted v1 search. Search is native (searchOriginalRoadMemory).
    assert.equal(roads.roadNodeAt(0, 1)?.id, 0);
    assert.equal(roads.roadNodeAt(-1, -1), null);
    // Invalid inputs still return null; only the v2 gate throw is retired.
    assert.equal(roads.restoreRoadMarchContext({}), null);
    assert.equal(roads.serializeRoadMarchContext({}), null);
    assert.equal(roads.reverseRoadMarchContext({}, 0, 0), null);
    assert.equal(resources.terrain.findPath(0, 0, 0, 0), null);
    assert.equal(resources.terrain.findPath(-1, -1, -1, -1), null);
    assert.equal(roads.roadPointRawAddress(0, 1), 0x2004);
    assert.equal(roads.roadNodeById(0).x, 0);
  });
});

test("world definition and resource container cannot be aliased or replaced", async () => {
  const definition = structuredClone(DEFAULT_WORLD);
  const resources = createWorldResources(definition);
  definition.id = "poison";
  definition.assets.roadGraph = "poison";
  definition.assets.seasons.spring = "poison";
  assert.deepEqual(resources.definition, DEFAULT_WORLD);
  for (const mutate of [
    () => {
      resources.definition.id = "poison";
    },
    () => {
      resources.definition.assets.roadGraph = "poison";
    },
    () => {
      resources.definition.assets.seasons.spring = "poison";
    },
    () => {
      resources.definition = definition;
    },
    () => {
      resources.roads = null;
    },
  ])
    assert.throws(mutate, TypeError);
});

test("explicit Scenario lifecycle owns independent persistent RAM with detached JSON checkpoints", async () => {
  const api = await import("../web/src/game/navigation/scenarioroadmemory.js");
  await mocked(async () => {
    const resources = createWorldResources();
    await resources.roads.loadRoadGraph();
    const first = scenario(),
      second = scenario();
    const identity = content();
    const one = api.initializeScenarioRoadMemory(first, resources, identity);
    const two = api.initializeScenarioRoadMemory(second, resources, content());
    identity.chapterId = "poison";
    one.writeByte(0x804, 77); // live low-half write, not an initial-asset constraint
    one.writeByte(0x8000, 0);
    one.writeByte(0x8bff, 0xa5);
    assert.strictEqual(api.getScenarioRoadMemory(first), one);
    assert.throws(
      () => api.initializeScenarioRoadMemory(first, resources, content()),
      /already/,
    );
    assert.equal(two.readByte(0x804), 0);
    assert.throws(() => two.readByte(0x8000), /Unprovided/);
    const checkpoint = copyJSON(api.snapshotScenarioRoadMemory(first));
    assert.equal(checkpoint.identity.content.chapterId, "chapter-a");
    const restoredScenario = scenario();
    const restored = api.restoreScenarioRoadMemory(
      restoredScenario,
      resources,
      content(),
      checkpoint,
    );
    assert.equal(restored.readByte(0x804), 77);
    assert.equal(restored.readByte(0x8000), 0);
    assert.equal(restored.readByte(0x8bff), 0xa5);
    assert.throws(() => restored.readByte(0x8001), /Unprovided/);
    assert.throws(() => restored.readByte(0x8c00), /Unprovided/);
    checkpoint.identity.world.id = "poison";
    checkpoint.memory.patches[0].hex = "00";
    assert.deepEqual(
      api.snapshotScenarioRoadMemory(restoredScenario),
      api.snapshotScenarioRoadMemory(first),
    );
    assert.deepEqual(
      structuredClone(first),
      { cities: [] },
      "RAM never becomes enumerable Scenario data",
    );
    assert.deepEqual(Object.keys(resources).sort(), [
      "definition",
      "loadSeason",
      "roads",
      "terrain",
    ]);
  });
});

test("missing/mismatched identities or RAM cannot attach, replace or mutate a Scenario owner", async () => {
  const api = await import("../web/src/game/navigation/scenarioroadmemory.js");
  await mocked(async (set) => {
    const resources = createWorldResources();
    await resources.roads.loadRoadGraph();
    const live = scenario();
    const memory = api.initializeScenarioRoadMemory(live, resources, content());
    memory.writeByte(0x8bff, 0xa5);
    const valid = api.snapshotScenarioRoadMemory(live);
    for (const change of [
      (c) => {
        delete c.memory;
      },
      (c) => {
        c.version = 2;
      },
      (c) => {
        delete c.identity;
      },
      (c) => {
        c.identity.world.id = "other";
      },
      (c) => {
        c.identity.world.revision = "other";
      },
      (c) => {
        c.identity.content.chapterId = "other";
      },
      (c) => {
        c.identity.content.packId = "other";
      },
      (c) => {
        c.identity.content.revision = "other";
      },
      (c) => {
        c.memory.initialGraph = "00";
      },
      (c) => {
        c.memory.patches.push({ address: 65535, hex: "0000" });
      },
    ]) {
      const invalid = copyJSON(valid);
      change(invalid);
      const fresh = scenario();
      const before = copyJSON(invalid);
      assert.throws(() =>
        api.restoreScenarioRoadMemory(fresh, resources, content(), invalid),
      );
      assert.throws(() => api.getScenarioRoadMemory(fresh), /not initialized/);
      assert.deepEqual(invalid, before);
      assert.deepEqual(api.snapshotScenarioRoadMemory(live), valid);
      api.restoreScenarioRoadMemory(fresh, resources, content(), valid); // failure does not poison retry
    }
    assert.throws(
      () => api.restoreScenarioRoadMemory(live, resources, content(), valid),
      /already/,
    );
    assert.throws(() =>
      api.restoreScenarioRoadMemory(
        scenario(),
        resources,
        content(),
        undefined,
      ),
    );
    for (const identity of [undefined, {}, { ...content(), revision: "" }]) {
      assert.throws(
        () => api.initializeScenarioRoadMemory(scenario(), resources, identity),
        /identity/,
      );
    }
    const noWorldIdentity = createWorldResources({
      ...DEFAULT_WORLD,
      id: undefined,
    });
    await noWorldIdentity.roads.loadRoadGraph();
    assert.throws(
      () =>
        api.initializeScenarioRoadMemory(
          scenario(),
          noWorldIdentity,
          content(),
        ),
      /identity/,
    );
    const cold = createWorldResources();
    assert.throws(
      () => api.initializeScenarioRoadMemory(scenario(), cold, content()),
      /loaded v2/,
    );
    const different = fixture();
    different.edges[0].weight = 1;
    set(different);
    const changed = createWorldResources();
    await changed.roads.loadRoadGraph();
    assert.throws(
      () =>
        api.restoreScenarioRoadMemory(scenario(), changed, content(), valid),
      /mismatched/,
    );
    assert.deepEqual(api.snapshotScenarioRoadMemory(live), valid);
  });
});
