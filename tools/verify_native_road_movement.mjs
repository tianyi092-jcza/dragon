// I/O: synthetic bytes + exactly four in-memory asset responses, no forwarding.
// KI 2662..28CB/42AB/47BB static goldens; march notes §3.12. Not a CPU oracle.
import assert from "node:assert/strict";
import test from "node:test";
import { createContentCatalog } from "../web/src/content/catalog.js";
import { createWorldResources } from "../web/src/game/worldresources.js";
import { createNewGameScenario } from "../web/src/game/world.js";
import {
  prepareScenario,
  scenarioNativeRoadContext,
  readSavedAssembly,
  assertPlayableScenario,
} from "../web/src/game/scenarioassembly.js";
import {
  snapshotState,
  restoreSnapshotState,
  canSnapshotState,
} from "../web/src/game/savegame.js";
import {
  stepTo,
  aiTick,
  continueLegionAfterBattle,
} from "../web/src/game/ai.js";
import {
  selectOriginalRoad47BB,
  performOriginalRoadAction,
} from "../web/src/game/navigation/originalroadmovement.js";

import {
  initializeNativeLegionSlotsFromZeroChapter,
  rebindNativeLegionViews,
} from "../web/src/game/nativelegions.js";
const json = (value) => JSON.parse(JSON.stringify(value));
function soldier(changes = {}) {
  return {
    slot: 0,
    generalIdx: 0,
    status: 0xc1,
    faction: 0,
    x: 5,
    y: 10,
    roadEdgeOrNode: 0x800,
    roadPointAddress: 0x200c,
    roadStride: 4,
    targetNode: 1,
    targetCity: 1,
    commandState: 0,
    _markerFrame: 1,
    occupancyOffset: 5,
    occupancyRowParagraph: 240,
    moveDelay: 1,
    movePeriod: 3,
    troops: 100,
    morale: 100,
    units: Array.from({ length: 6 }, () => ({ type: 3, troops: 100 })),
    ...changes,
  };
}
async function fixture({
  legion = soldier(),
  edges = [[0, 1, 5]],
  movement = true,
  spans = [{ address: 3840, hex: "00000000000100000000" }],
  version = 2,
  change = () => {},
} = {}) {
  const graph = {
    version,
    width: 384,
    height: 256,
    nodes: Array.from({ length: 192 }, (_, id) => ({
      id,
      x: id === 0 ? 1 : id === 1 ? 8 : id + 10,
      y: id < 2 ? 10 : 20,
      edgeSlots: [0, 0, 0, 0],
    })),
    edges: [],
  };
  for (const [source, target, weight] of edges) {
    const id = graph.edges.length,
      address = 0x800 + id * 16;
    for (const [n, tag] of [
      [source, 0x4000],
      [target, 0x8000],
    ]) {
      const slots = graph.nodes[n].edgeSlots;
      slots[slots.indexOf(0)] = tag | address;
    }
    graph.edges.push({
      id,
      source,
      target,
      weight,
      bounds: { minX: 2, maxX: 7, minY: 10, maxY: 10 },
      points: Array.from({ length: 6 }, (_, i) => ({
        x: i + 2,
        y: 10,
        flags: i === 0 ? 0x44 : i === 5 ? 4 : 0,
      })),
    });
  }
  const template = {
    player_faction: 0,
    factions: [0, 1, 2].map((idx) => ({
      idx,
      capital: 0,
      n_legions: 0,
      active: true,
      monarch_idx: 126,
      money: 1000,
      legion_morale_cap: 200,
      march_marker_style: 0,
    })),
    generals: [],
    cities: graph.nodes.map(({ id, x, y }) => ({
      idx: id,
      x,
      y,
      faction: 0,
      governor: null,
    })),
    legions: [],
    diplomacy: Array.from({ length: 24 }, () => Array(24).fill(0)),
  };
  const content = createContentCatalog(
    {
      schemaVersion: 1,
      rules: "ki-1995",
      id: "movement-test",
      revision: "1",
      chapters: [{ id: "chapter", legacyScenarioIndex: 0, official: true }],
    },
    { scenarios: [template] },
  );
  const raw = createNewGameScenario(template);
  if (version === 2) initializeNativeLegionSlotsFromZeroChapter(raw);
  raw.legions = [legion];
  raw.factions[0].n_legions = 1;
  // Explicit synthetic inactive 2459 slots, not original initialization.
  raw.weatherClouds = Array.from({ length: 16 }, () => ({ status: 0 }));
  raw.disasterMapObjects = Array.from({ length: 16 }, () => ({ status: 0 }));
  change(raw, graph);
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
    ...(movement ? { movementMemory: { version: 1, spans } } : {}),
  };
  const oldFetch = globalThis.fetch;
  const assets = world.definition.assets;
  const allowed = new Set([
    assets.terrain,
    assets.roadCost,
    assets.roadOffset,
    assets.roadGraph,
  ]);
  const tiles = new Uint8Array(384 * 256).fill(0xba);
  tiles[3840 + 2] = tiles[3840 + 7] = 0xd4;
  globalThis.fetch = async (url) => {
    assert(allowed.has(url), `Unexpected asset ${url}`);
    return {
      ok: true,
      json: async () => (url === assets.roadGraph ? graph : {}),
      arrayBuffer: async () => tiles.slice().buffer,
    };
  };
  let prepared;
  try {
    prepared = await prepareScenario(args);
  } finally {
    globalThis.fetch = oldFetch;
  }
  const sc = prepared.scenario,
    A = sc.legions[0];
  const app = {
    scenario: sc,
    scenarioIdx: 0,
    world,
    content,
    clock: { year: 190, month: 1, day: 1 },
    originalRng: {
      nextByte: () => assert.fail("unexpected RNG"),
      snapshot: () => ({ test: true }),
    },
  };
  const context = scenarioNativeRoadContext(sc);
  return { args, sc, A, app, context, graph };
}
const slot = (f, daily = false) =>
  aiTick(f.app, {
    legionBatchStart: 0,
    runCityDaily: false,
    settleDaily: daily,
  });
const state = (f) => [
  f.A.x,
  f.A.y,
  f.A.roadEdgeOrNode,
  f.A.roadPointAddress,
  f.A.roadStride,
  f.A.targetNode,
  f.A.targetCity,
  f.A._markerFrame,
];
const plane = (f, x) => f.context.movement.readByte(240, x);
function setWord(memory, at, value) {
  memory.writeByte(at, value & 255);
  memory.writeByte((at + 1) & 65535, value >>> 8);
}

// Shared RAM primitive ABI controls are explicitly separate from real-entry tests.
function query(f, fields = {}) {
  const bytes = { 0: 0xc3, 1: 0, 10: 4, 35: 0, ...fields.bytes };
  const words = { 14: 0x800, 20: 16, 12: 0x200c, ...fields.words };
  const trace = [],
    memory = f.context.memory;
  const result = selectOriginalRoad47BB({
    readByte: (at) => {
      trace.push(["rb", at]);
      assert(Object.hasOwn(bytes, at), `unknown byte ${at}`);
      return bytes[at];
    },
    readWord: (at) => {
      trace.push(["rw", at]);
      return words[at];
    },
    writeByte: (at, value) => {
      trace.push(["wb", at, value]);
      bytes[at] = value;
    },
    writeWord: (at, value) => {
      trace.push(["ww", at, value]);
      words[at] = value;
    },
    graphWord: (at) =>
      memory.readByte(at & 65535) | (memory.readByte((at + 1) & 65535) << 8),
    readGraphByte: memory.readByte,
    writeGraphByte: memory.writeByte,
    readCityOwnerByte: f.context.readCityOwnerByte,
  });
  return { result, bytes, words, trace };
}

test("real 474A/487B returns into next due slot/47BB without synthetic march cache; remaining slots run only after normal return", async () => {
  const f = await fixture({
    change: (raw) => {
      raw.legions.push(soldier({ slot: 2, moveDelay: 8 }));
    },
  });
  assert.equal(continueLegionAfterBattle(f.sc, f.A, false), true);
  assert.equal(f.A.targetNode, 0);
  assert.equal(f.A.moveDelay, 1);
  assert.equal(f.A._march, undefined);
  slot(f);
  assert.equal(f.app._strategicBattleFailure, undefined);
  assert.equal(f.A.x, 4);
  assert.equal(f.A.roadStride, -4);
  assert.equal(f.sc.legions[1].moveDelay, 7);
  f.A.roadEdgeOrNode = 0;
  f.A.moveDelay = 1;
  f.A.commandState = 9;
  slot(f);
  assert.match(f.app._strategicBattleFailure.error.message, /pool 3 at 4735/);
  assert.equal(f.sc.legions[1].moveDelay, 7);
});

test("real slot selects native before cached arrival/reverse/engagement; 42AB continues same action", async () => {
  for (const cache of [
    null,
    {},
    {
      edgeId: 99,
      stride: 4,
      currentNode: 1,
      points: [{ x: 999, y: 999 }],
      pointIndex: 0,
    },
  ]) {
    const f = await fixture({
      change: (raw) => {
        raw.cities[1].faction = 2;
        raw.diplomacy[0][2] = 255;
      },
    });
    if (cache) f.A._march = cache;
    f.A.target = { x: f.A.x, y: f.A.y }; // Legacy arrival would intercept.
    f.A._retreat = { captorFaction: 2 };
    f.A._engagement = { kind: "siege", target: { cityIdx: 1 } };
    slot(f);
    assert.equal(f.app._strategicBattleFailure, undefined);
    assert.deepEqual(state(f), [4, 10, 0x800, 0x2008, -4, 0, 0, 0]);
    assert.equal(plane(f, 5), 0);
    assert.equal(plane(f, 4), 1);
    assert.equal(f.A.moveDelay, 3);
    assert.equal(f.sc.factions[0].n_legions, 1);
  }
});

test("26C8 first flags gate avoids underflow; second gate nodes same action then next due reaches uncovered handler9", async () => {
  const left = await fixture({
    legion: soldier({ x: 2, roadPointAddress: 0x2000, occupancyOffset: 2 }),
    change: (raw) => {
      raw.cities[1].faction = 2;
      raw.diplomacy[0][2] = 255;
    },
  });
  assert.equal(stepTo(left.sc, left.A), "moved");
  assert.deepEqual(state(left), [1, 10, 0, 0x2000, -4, 0, 0, 4]);
  const right = await fixture({
    legion: soldier({ x: 6, roadPointAddress: 0x2010, occupancyOffset: 6 }),
  });
  slot(right, true);
  assert.equal(right.app._strategicBattleFailure, undefined);
  assert.deepEqual(state(right), [8, 10, 8, 0x2014, 4, 1, 1, 4]);
  assert.equal(right.A.morale, 110);
  assert.equal(right.sc.factions[0].money, 996);
  assert.equal(right.A.engagementCountdown, 0);
  const before = right.context.movement.snapshot();
  right.A.moveDelay = 1;
  right.A.commandState = 9;
  slot(right, true);
  assert.match(
    right.app._strategicBattleFailure.error.message,
    /pool 3 at 4735/,
  );
  assert.equal(canSnapshotState(right.app), false);
  assert.deepEqual(right.context.movement.snapshot(), before);
  assert.equal(right.sc.factions[0].money, 996);
});

test("real slot node departure first point does not OR bit0; multiple due actions reuse RAM", async () => {
  const f = await fixture({
    legion: soldier({
      x: 1,
      roadEdgeOrNode: 0,
      occupancyOffset: 1,
      status: 0xc3,
    }),
  });
  const memory = f.context.memory;
  memory.writeByte(0x8bfe, 0x73);
  slot(f);
  assert.equal(f.app._strategicBattleFailure, undefined);
  assert.deepEqual(state(f).slice(0, 5), [2, 10, 0x800, 0x2000, 4]);
  assert.equal(f.A.status & 3, 0);
  slot(f);
  slot(f);
  assert.equal(f.A.x, 2);
  slot(f);
  assert.equal(f.A.x, 3);
  assert.equal(f.A.status & 1, 1);
  assert.equal(scenarioNativeRoadContext(f.sc).memory, memory);
  assert.equal(memory.readByte(0x8bfe), 0x73);
  assert.throws(() => memory.readByte(0x9000), /Unprovided/);
});

test("2831/2880 contact first/continuing/deadline preserves exact precommit prefix and slot tails", async () => {
  for (const kind of ["field", "siege"])
    for (const count of [0, 5, 1])
      for (const viaSlot of [false, true]) {
        const f = await fixture({
          legion: soldier(
            kind === "siege"
              ? { x: 6, roadPointAddress: 0x2010, occupancyOffset: 6 }
              : {},
          ),
          change: (raw) => {
            raw.legionSlotCounters[0] = count;
            if (kind === "siege") raw.cities[1].faction = 1;
            else
              raw.legions.push(
                soldier({ slot: 4, faction: 1, x: 6, moveDelay: 9 }),
              );
          },
        });
        if (kind === "field") f.context.movement.writeByte(240, 6, 1);
        f.context.movement.writeByte(240, f.A.x, 1);
        const before = state(f);
        if (viaSlot) slot(f, true);
        else if (count === 1)
          assert.throws(
            () => stepTo(f.sc, f.A),
            new RegExp(kind === "field" ? "4A7B at 2873" : "4ADE at 28BF"),
          );
        else assert.equal(stepTo(f.sc, f.A), "contact");
        assert.deepEqual(state(f), before);
        assert.equal(f.A.status & 0x20, 0x20);
        assert.equal(plane(f, f.A.x), count === 1 ? 0 : 1);
        assert.equal(
          f.sc.legionSlotCounters[0],
          count === 1 ? 1 : (count || 12) - (viaSlot ? 1 : 0),
        );
        if (viaSlot && count === 1) {
          assert.match(
            f.app._strategicBattleFailure.error.message,
            /4A7B|4ADE/,
          );
          assert.equal(f.sc.factions[0].money, 1000);
          assert.equal(f.A.moveDelay, 3);
        }
      }
});

test("2831 low-slot friend wins; slot127 excluded; status/Y/X short circuits and self retained", async () => {
  for (const mode of ["friend", "127", "inactive", "differentY", "self"]) {
    const f = await fixture({
      legion: soldier(mode === "self" ? { roadStride: 0 } : {}),
      change: (raw) => {
        const friend = {
          slot: 1,
          status: 0x80,
          y: 10,
          x: 6,
          faction: 0,
          moveDelay: 8,
          movePeriod: 3,
        };
        if (mode === "friend")
          raw.legions.push(friend, { ...friend, slot: 2, faction: 1 });
        if (mode === "127")
          raw.legions.push({ ...friend, slot: 127, faction: 1 });
        if (mode === "inactive") raw.legions.push({ slot: 1, status: 0 });
        if (mode === "differentY")
          raw.legions.push({
            slot: 1,
            status: 0x80,
            y: 11,
            moveDelay: 8,
            movePeriod: 3,
          });
      },
    });
    f.context.movement.writeByte(240, mode === "self" ? 5 : 6, 255);
    assert.equal(stepTo(f.sc, f.A), "moved");
    assert.equal(f.A.status & 0x20, 0);
    assert.equal(f.A.x, mode === "self" ? 5 : 6);
  }
});

test("47BB primitive double-stop directions, shortcut no workspace, ignored CF exhaustion AL0/5", async () => {
  for (const costs of [
    [3, 9],
    [9, 3],
  ]) {
    const f = await fixture({
      edges: [
        [0, 1, 20],
        [0, 2, costs[0]],
        [1, 2, costs[1]],
      ],
    });
    assert.equal(query(f).bytes[10], costs[0] === 3 ? 0xfc : 4);
    const before = f.context.memory.snapshot();
    assert.equal(query(f, { words: { 20: 8 } }).bytes[10], 4);
    assert.equal(query(f, { words: { 20: 0 } }).bytes[10], 0xfc);
    assert.deepEqual(f.context.memory.snapshot(), before);
  }
  const isolated = await fixture();
  const zero = query(isolated, { words: { 14: 16, 20: 24 } });
  assert.equal(zero.result.cf, false);
  assert.equal(zero.bytes[10], 0);
  assert.equal(zero.words[12], 0x2014);
  assert.equal(zero.words[14], 0x800);
  const five = await fixture({ edges: [[0, 1, 1]] });
  const out = query(five, { words: { 14: 16, 20: 0 } });
  assert.equal(out.bytes[10], 5);
  assert.equal(out.words[12], 0x2014);
});

test("real 47BB high fee checks command lazily, throws at 291A retaining search/DEC/bit1", async () => {
  for (const command of [9, 10, undefined]) {
    const f = await fixture({
      legion: soldier({
        roadEdgeOrNode: 0,
        x: 1,
        occupancyOffset: 1,
        status: 0xc3,
        commandState: command,
      }),
      change: (raw) => {
        raw.cities[1].faction = 1;
        if (command === undefined) delete raw.legions[0].commandState;
      },
    });
    f.context.movement.writeByte(240, 1, 1);
    const before = f.context.memory.snapshot();
    if (command === 9) assert.equal(stepTo(f.sc, f.A), "moved");
    else {
      assert.throws(
        () => stepTo(f.sc, f.A),
        command === 10 ? /291A at 4851/ : /L23/,
      );
      assert.equal(f.A.roadEdgeOrNode, 0);
      assert.equal(f.A.status & 2, 0);
      assert.equal(plane(f, 1), 0);
    }
    assert.notDeepEqual(f.context.memory.snapshot(), before);
  }
  const low = await fixture({
    legion: soldier({ roadEdgeOrNode: 0, occupancyOffset: 1, status: 0xc3 }),
  });
  delete low.A.commandState;
  assert.equal(stepTo(low.sc, low.A), "moved");
});

test("occupancy unknown/zero/FF and stale pointer never inferred from coordinates", async () => {
  const unknown = await fixture({
    spans: [],
    legion: soldier({ status: 0xc3 }),
  });
  const before = unknown.context.memory.snapshot();
  assert.throws(() => stepTo(unknown.sc, unknown.A), /Uncovered movement byte/);
  assert.equal(unknown.A.status, 0xc3);
  assert.deepEqual(unknown.context.memory.snapshot(), before);
  const candidateUnknown = await fixture({
    spans: [{ address: 3845, hex: "01" }],
  });
  assert.throws(
    () => stepTo(candidateUnknown.sc, candidateUnknown.A),
    /Uncovered movement byte: 3846/,
  );
  assert.equal(plane(candidateUnknown, 5), 0);
  assert.equal(candidateUnknown.A.roadPointAddress, 0x200c);
  const stale = await fixture({ legion: soldier({ occupancyOffset: 3 }) });
  stale.context.movement.writeByte(240, 6, 255);
  stepTo(stale.sc, stale.A);
  assert.equal(plane(stale, 3), 255);
  assert.equal(plane(stale, 5), 1);
  assert.equal(plane(stale, 6), 0);
  const same = await fixture({ legion: soldier({ roadStride: 0 }) });
  same.context.movement.writeByte(240, 5, 0);
  stepTo(same.sc, same.A);
  assert.equal(plane(same, 5), 0);
});

test("Y low-byte write, X-priority wrapped direction, pointer writes and repeated read prefixes", async () => {
  const f = await fixture({ legion: soldier({ y: 0x120a }) });
  stepTo(f.sc, f.A);
  assert.equal(f.A.y, 0x120a);
  assert.equal(f.A._markerFrame, 1);
  const broken = await fixture();
  let row = broken.A.occupancyRowParagraph;
  Object.defineProperty(broken.A, "occupancyRowParagraph", {
    get: () => row,
    set: (v) => {
      row = v;
    },
  });
  Object.defineProperty(broken.A, "occupancyOffset", {
    get: () => 5,
    set: () => {
      throw new Error("offset-write");
    },
  });
  assert.throws(() => stepTo(broken.sc, broken.A), /offset-write/);
  assert.equal(row, 240);
  assert.equal(broken.A.roadPointAddress, 0x200c);
  assert.equal(plane(broken, 5), 0);
  const terminal = await fixture({
    legion: soldier({ x: 6, roadPointAddress: 0x2010, occupancyOffset: 6 }),
  });
  delete terminal.sc.cities[1].y;
  assert.throws(() => stepTo(terminal.sc, terminal.A), /city Y/);
  assert.equal(terminal.A.roadEdgeOrNode, 8);
  assert.equal(terminal.A.x, 7);
  assert.equal(terminal.A.occupancyOffset, 7);
  assert.equal(plane(terminal, 7), 0);
  const trace = [],
    repeated = await fixture();
  const memory = repeated.context.memory;
  let reads = 0;
  const context = {
    ...repeated.context,
    memory: {
      ...memory,
      readByte: (at) => {
        trace.push(at);
        if (at === 0x2012 && ++reads === 2) throw new Error("276D-reread");
        return memory.readByte(at);
      },
    },
  };
  assert.throws(
    () => performOriginalRoadAction(repeated.sc, repeated.A, context),
    /276D-reread/,
  );
  assert.equal(repeated.A.roadPointAddress, 0x2010);
  assert.equal(repeated.A.occupancyOffset, 6);
  assert.equal(repeated.A.x, 5);
  assert.equal(plane(repeated, 6), 0);
  assert.equal(reads, 2);
  const directionUnknown = await fixture({
    legion: soldier({ roadPointAddress: 0x7ff8 }),
  });
  setWord(directionUnknown.context.memory, 0x7ffc, 6);
  setWord(directionUnknown.context.memory, 0x7ffe, 10);
  assert.throws(
    () => stepTo(directionUnknown.sc, directionUnknown.A),
    /Unprovided/,
  );
  assert.equal(directionUnknown.A.roadPointAddress, 0x7ffc);
  assert.equal(directionUnknown.A.x, 6);
  assert.equal(directionUnknown.A.occupancyOffset, 6);
  assert.equal(plane(directionUnknown, 6), 0); // No tail INC after direction read failure.
});

test("JSON formal sidecar restores pointers, unknowns and same workspace before next real action", async () => {
  const f = await fixture({
    legion: soldier({
      roadEdgeOrNode: 0,
      occupancyOffset: 1,
      x: 1,
      status: 0xc3,
    }),
  });
  slot(f);
  f.context.memory.writeByte(0x8bfe, 0x72);
  f.context.memory.writeByte(0x9001, 0);
  const saved = json(snapshotState(f.app, 0, "movement"));
  const assembly = readSavedAssembly(saved);
  const restored = await prepareScenario({
    ...f.args,
    mode: "restore",
    raw: restoreSnapshotState(saved),
    ...assembly,
  });
  const g = {
    sc: restored.scenario,
    A: restored.scenario.legions[0],
    context: scenarioNativeRoadContext(restored.scenario),
    app: { ...f.app, scenario: restored.scenario },
  };
  for (let i = 0; i < 6; i++) {
    slot(f);
    slot(g);
  }
  assert.deepEqual(state(g), state(f));
  assert.deepEqual(g.context.memory.snapshot(), f.context.memory.snapshot());
  assert.deepEqual(
    g.context.movement.snapshot(),
    f.context.movement.snapshot(),
  );
  assert.equal(g.context.memory.readByte(0x8bfe), 0x72);
  assert.equal(g.context.memory.readByte(0x9001), 0);
  assert.throws(() => g.context.memory.readByte(0x9000), /Unprovided/);
  for (const corrupt of ["identity", "initialGraph", "overlap"]) {
    const bad = json(assembly);
    if (corrupt === "identity")
      bad.movementMemory.identity.content.chapterId = "wrong";
    if (corrupt === "initialGraph") bad.movementMemory.initialGraph = "00";
    if (corrupt === "overlap")
      bad.movementMemory.spans.push(bad.movementMemory.spans[0]);
    await assert.rejects(
      () =>
        prepareScenario({
          ...f.args,
          mode: "restore",
          raw: restoreSnapshotState(saved),
          ...bad,
        }),
      /movement/,
    );
  }
  assert.throws(() => assertPlayableScenario(assembly), /v2/);
});

test("optional capability leaves old detached 487B prepare/save valid; movement/metadata misuse rejects", async () => {
  const f = await fixture({ movement: false });
  assert.throws(() => stepTo(f.sc, f.A), /movement capability/);
  const saved = json(snapshotState(f.app, 0, "old-native"));
  assert.equal(Object.hasOwn(saved.webMeta, "movementMemory"), false);
  const restored = await prepareScenario({
    ...f.args,
    mode: "restore",
    raw: restoreSnapshotState(saved),
    ...readSavedAssembly(saved),
  });
  assert.throws(
    () => stepTo(restored.scenario, restored.scenario.legions[0]),
    /movement capability/,
  );
  await assert.rejects(
    () => fixture({ version: 1 }),
    /v1 cannot carry movement/,
  );
  assert.throws(
    () =>
      readSavedAssembly({
        webMeta: { movementMemory: { version: 1, spans: [] } },
      }),
    /requires assembly/,
  );
  const bit4 = await fixture({ legion: soldier({ status: 0xd1 }) });
  assert.throws(() => stepTo(bit4.sc, bit4.A), /2BA8 at 267A/);
  assert.equal(bit4.A.status, 0xd1);
  const npc = await fixture({
    legion: soldier({ roadEdgeOrNode: 0 }),
    change: (raw) => {
      raw.player_faction = 1;
    },
  });
  assert.throws(() => stepTo(npc.sc, npc.A), /city cache capability at 4304/);
  assert.equal(plane(npc, 5), 1);
});

test("both flags gates: low classes and bit6 signed gates; at most one candidate", async () => {
  for (const first of [true, false])
    for (const low of [0, 1, 2, 4])
      for (const high of [0, 0x40])
        for (const stride of [-4, 0, 4]) {
          const f = await fixture({ legion: soldier({ roadStride: stride }) });
          const point = first ? 0x200c : 0x200c + stride;
          f.context.memory.writeByte(point + 3, low | high);
          const result = stepTo(f.sc, f.A);
          assert.equal(result, "moved");
          const node = low >= 2 && (high ? stride <= 0 : stride >= 0);
          assert.equal(
            f.A.roadEdgeOrNode,
            node ? (stride === 4 ? 8 : 0) : 0x800,
            JSON.stringify({ first, low, high, stride }),
          );
          assert.equal(
            f.A.roadPointAddress,
            first && node ? 0x200c : 0x200c + stride,
          );
        }
});

test("14 is id not address or 20/tx; real exhausted AL0/5 consumes literal point RAM", async () => {
  for (const id of [0, 8, 16, 191]) {
    const f = await fixture({
      legion: soldier({ status: 0xc3, targetNode: id, targetCity: 17 }),
    });
    assert.equal(stepTo(f.sc, f.A, f.A.x, f.A.y), "moved");
    assert.equal(f.A.targetNode, id);
    assert.equal(f.A.targetCity, 17);
    if (id !== 0) assert.equal(f.A.roadStride, 4); // AL0 selects 0800+8 == old BP (4810/4819).
  }
  for (const cost of [0, 1]) {
    const f = await fixture({
      edges: [[0, 1, cost]],
      legion: soldier({
        roadEdgeOrNode: 16,
        targetNode: cost ? 0 : 3,
        status: 0xc3,
      }),
    });
    assert.equal(stepTo(f.sc, f.A), "moved");
    assert.equal(f.A.roadStride, cost ? 5 : 0);
    assert.equal(f.A.roadPointAddress, 0x2014);
    assert.equal(f.A.roadEdgeOrNode, 0);
  }
});

test("42AB only FC selects source; 2880 and nodeize only byte4 select target", async () => {
  for (const stride of [0, 5, -128]) {
    const f = await fixture({
      legion: soldier({ roadStride: stride }),
      change: (raw) => {
        raw.cities[1].faction = 2;
        raw.diplomacy[0][2] = 255;
      },
    });
    stepTo(f.sc, f.A);
    assert.equal(f.A.targetNode, 0);
    assert.equal(f.A.roadStride, -4);
  }
  const f = await fixture({ legion: soldier({ roadStride: 5 }) });
  // Non-point-aligned candidate at 2011 is legal known RAM, not an array index.
  setWord(f.context.memory, 0x2011, 7);
  setWord(f.context.memory, 0x2013, 0x040a);
  f.sc.cities[0].faction = 1;
  assert.equal(stepTo(f.sc, f.A), "contact"); // +6 despite positive stride5.
  assert.equal(f.A.x, 5);
  assert.equal(f.A._engagement.target.cityIdx, 0);
});

test("direction X dominates Y; unsigned differences, equal points, NEG80 and mandatory terrain read", async () => {
  for (const [nextX, nextY, marker] of [
    [5, 200, 0],
    [0x8007, 10, 0],
    [6, 250, 2],
    [6, 100, 3],
    [6, 10, 1],
  ]) {
    const f = await fixture();
    setWord(f.context.memory, 0x2014, nextX);
    f.context.memory.writeByte(0x2016, nextY);
    stepTo(f.sc, f.A);
    assert.equal(f.A._markerFrame, marker);
  }
  const neg = await fixture({ legion: soldier({ roadStride: -128 }) });
  neg.context.memory.writeByte(0x200f, 0x44);
  setWord(neg.context.memory, 0x1f8c, 6);
  const reads = [],
    memory = neg.context.memory;
  performOriginalRoadAction(neg.sc, neg.A, {
    ...neg.context,
    memory: {
      ...memory,
      readByte: (at) => {
        reads.push(at);
        return memory.readByte(at);
      },
    },
  });
  assert(reads.includes(0x1f8c));
  assert(!reads.includes(0x208c));
  const initial = await fixture({
    legion: soldier({ roadEdgeOrNode: 0, status: 0xc3 }),
  });
  assert.throws(
    () =>
      performOriginalRoadAction(initial.sc, initial.A, {
        ...initial.context,
        readTerrainByte: () => {
          throw new Error("terrain-first-point");
        },
      }),
    /terrain-first-point/,
  );
  assert.equal(initial.A.roadEdgeOrNode, 0x800);
  assert.equal(initial.A.status & 1, 0);
  assert.equal(plane(initial, 5), 0);
});

test("pointer row-before-offset on points; offset-before-row at city; errors keep each prefix", async () => {
  for (const city of [false, true]) {
    const f = await fixture({
      legion: soldier({ roadStride: city ? -4 : 4, targetNode: 0 }),
    });
    const writes = [];
    if (city) f.context.memory.writeByte(0x200f, 0x44);
    else {
      f.context.memory.writeByte(0x2012, 11);
      f.context.movement.writeByte(264, 6, 0);
    }
    for (const key of ["occupancyOffset", "occupancyRowParagraph"]) {
      let value = f.A[key];
      Object.defineProperty(f.A, key, {
        get: () => value,
        set: (v) => {
          writes.push([key, v]);
          if (writes.length === 2) throw new Error("second-pointer-half");
          value = v;
        },
      });
    }
    assert.throws(() => stepTo(f.sc, f.A), /second-pointer-half/);
    assert.deepEqual(
      writes.map(([key]) => key),
      city
        ? ["occupancyOffset", "occupancyRowParagraph"]
        : ["occupancyRowParagraph", "occupancyOffset"],
    );
    assert.equal(plane(f, 5), 0);
    if (city) {
      assert.equal(f.A.roadEdgeOrNode, 0);
      assert.equal(f.A.x, 1);
    } else {
      assert.equal(f.A.occupancyRowParagraph, 264);
      assert.equal(f.A.x, 5);
    }
  }
});

test("read-only geometry and waiting projection do not change graph/plane or marker", async () => {
  const f = await fixture({
    legion: soldier({ x: 6, occupancyOffset: 6, roadPointAddress: 0x2010 }),
    change: (raw) => {
      raw.cities[1].faction = 1;
    },
  });
  stepTo(f.sc, f.A);
  const graph = f.context.memory.snapshot(),
    occupancy = f.context.movement.snapshot(),
    before = state(f);
  f.args.world.roads.roadNodeById(1);
  f.args.world.roads.roadEdgeById(0);
  f.args.world.roads.roadApproachesAt(7, 10);
  f.args.world.terrain.roadOffset(7, 10);
  assert.equal(f.A._engagement.countdown, 12);
  snapshotState(f.app, 0, "waiting");
  assert.deepEqual(f.context.memory.snapshot(), graph);
  assert.deepEqual(f.context.movement.snapshot(), occupancy);
  assert.deepEqual(state(f), before);
});
