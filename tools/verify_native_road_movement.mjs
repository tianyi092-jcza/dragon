// I/O: synthetic bytes + exactly four in-memory asset responses, no forwarding.
// KI 2662..28CB/42AB/47BB static goldens; march notes §3.12. Not a CPU oracle.
import assert from "node:assert/strict";
import test from "node:test";
import { attachSyntheticNativeFactionSource } from "./native_faction_fixture.mjs";
import { createContentCatalog } from "../web/src/content/catalog.js";
import { OriginalBattleRng } from "../web/src/game/battle/originalrng.js";
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
  snapshotNativeLegionSlots,
} from "../web/src/game/nativelegions.js";
function json(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (cause) {
    // Serialization failures must fail the test, never substitute a clone/default.
    throw new Error("Fixture failed the actual JSON round trip", { cause });
  }
}
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
  if (version === 2) attachSyntheticNativeFactionSource(raw);
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
  // Explicit synthetic current terrain, supplied separately from asset loading.
  if (version === 2)
    args.terrainMemory = {
      version: 1,
      spans: [
        {
          address: 0,
          hex: Array.from(tiles, (b) => b.toString(16).padStart(2, "0")).join(
            "",
          ),
        },
      ],
    };
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
  delete f.sc.factions[0].reserve_inf;
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
  delete right.sc.factions[0].reserve_inf;
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

test("2831/2880 deadline: field missing G1F stops4CD0; siege preserves 4AEC/4F92 prefix before missing city troops", async () => {
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
            (error) =>
              kind === "field"
                ? error.instruction === "4CD0" &&
                  /missing battle_rating/.test(error.message)
                : error.instruction === "4F9D" &&
                  /missing troops/.test(error.message),
          );
        else assert.equal(stepTo(f.sc, f.A), "contact");
        assert.deepEqual(state(f), before);
        const siegePrefix = kind === "siege" && count === 1;
        assert.equal(f.A.status & 0x20, siegePrefix ? 0 : 0x20);
        assert.equal(plane(f, f.A.x), count === 1 ? 0 : 1);
        assert.equal(
          f.sc.legionSlotCounters[0],
          count === 1
            ? siegePrefix
              ? 0
              : 1
            : (count || 12) - (viaSlot ? 1 : 0),
        );
        if (viaSlot && count === 1) {
          if (kind === "field") {
            assert.equal(
              f.app._strategicBattleFailure.error.instruction,
              "4CD0",
            );
            assert.deepEqual(
              f.app._strategicBattleFailure.error.nativeFieldPrefix.bpWords,
              { 0: 0x2340, 254: 1 },
            );
          } else {
            const error = f.app._strategicBattleFailure.error;
            assert.equal(error.instruction, "4F9D");
            assert.deepEqual(error.nativeSiegePrefix, {
              d32: 0x860,
              d34: 1,
              d35: 0,
              bpWords: { 254: 0 },
            });
            const temporary = f.sc.nativeLegionSlots.records.find(
              (r) => r.slot === 127,
            );
            assert.equal(temporary.generalIdx, 127);
            assert.equal(temporary.morale, 255);
            assert.equal(temporary.faction, 1);
          }
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

test("real 47BB high fee enters291A then stops at explicit display input retaining search/DEC/bit1", async () => {
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
        command === 10 ? /nativeFateDisplayFlags/ : /L23/,
      );
      assert.equal(f.A.roadEdgeOrNode, 0);
      assert.equal(f.A.status & 2, 0);
      assert.equal(plane(f, 1), 0);
      assert.equal(f.A.status & 0x10, 0);
      assert.equal(f.sc.factions[0].n_legions, 1); // no2977/29C3 return.
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
  assertPlayableScenario(assembly); // P58 flip: v2 enters play
});

test("fresh v2 always synthesizes the movement plane (P40 1A2D/8AEA); old detached saves without capability stay valid; movement/metadata misuse rejects", async () => {
  // P40：fresh v2 恒合成占格平面（1A2D 清零 + 89F0/8AEA 重建），fresh 不再
  // 存在无能力状态；“旧档无能力”用删除 webMeta.movementMemory 的 restore 模拟。
  const f = await fixture({ movement: false });
  assert.equal(f.context.movement.readByte(240, 0) >= 0, true);
  const saved = json(snapshotState(f.app, 0, "old-native"));
  assert.equal(saved.webMeta.movementMemory.zeroFilled, true);
  delete saved.webMeta.movementMemory; // 能力出现前的旧档
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
  // P76 gate: v1 owners are unconstructible; fresh preparation against a
  // synthetic v1 graph fails closed at the v2-graph gate (the retired
  // "v1 cannot carry movement" guard is deleted with the v1 arms).
  await assert.rejects(
    () => fixture({ version: 1 }),
    /must be v2/,
  );
  assert.throws(
    () =>
      readSavedAssembly({
        webMeta: { movementMemory: { version: 1, spans: [] } },
      }),
    /requires assembly/,
  );
  const bit4 = await fixture({ legion: soldier({ status: 0xd1 }) });
  assert.throws(() => stepTo(bit4.sc, bit4.A), /nativeFateDisplayFlags/);
  assert.equal(bit4.A.status, 0xc1); //2BA8 clears bit4 before unknown98A6.
  assert.equal(plane(bit4, 5), 1); //269C not reached.
  // 4304 城市缓存能力门：P40 后 fresh 恒合成 C18 缓存，该门只剩旧档可达；
  // 用删除 webMeta.cityCache 的 restore 模拟。
  const npcBase = await fixture({
    legion: soldier({ roadEdgeOrNode: 0 }),
    change: (raw) => {
      raw.player_faction = 1;
    },
  });
  const savedNpc = json(snapshotState(npcBase.app, 0, "old-native"));
  delete savedNpc.webMeta.cityCache;
  const npcRestored = await prepareScenario({
    ...npcBase.args,
    mode: "restore",
    raw: restoreSnapshotState(savedNpc),
    ...readSavedAssembly(savedNpc),
  });
  assert.throws(
    () => stepTo(npcRestored.scenario, npcRestored.scenario.legions[0]),
    /city cache capability at 4304/,
  );
  const npcContext = scenarioNativeRoadContext(npcRestored.scenario);
  assert.equal(npcContext.movement.readByte(240, 5), 1);
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

async function fieldDeadline() {
  const f = await fixture({
    change(raw) {
      raw.player_faction = 2; // neither combatant: AL must remain candidate Y=10.
      raw.legionSlotCounters[0] = 1;
      raw.legionSlotCounters[4] = 7;
      raw.legionSlotCounters[8] = 11;
      raw.generals = Array.from({ length: 9 }, (_, idx) => ({
        idx,
        battle_rating: 32,
      }));
      raw.legions.push(
        soldier({
          slot: 4,
          faction: 1,
          x: 6,
          occupancyOffset: 20,
          occupancyRowParagraph: 480,
          troops: 1,
          moveDelay: 9,
        }),
      );
      raw.legions.push(
        soldier({
          slot: 8,
          faction: 1,
          x: 6,
          occupancyOffset: 30,
          occupancyRowParagraph: 480,
          troops: 600,
          moveDelay: 9,
        }),
      );
    },
  });
  f.app.originalRng = new OriginalBattleRng({ ch: 1, cl: 2, dh: 3 });
  f.context.movement.writeByte(240, 6, 1);
  // Saved first-D pointer != XY and != stronger slot8 pointer. W=3,E=5,
  // N=4,S=6,center0. Candidate AL10 => W/E => directory C2, no bit6.
  for (const [delta, tile] of [
    [-1, 0x70],
    [1, 0xb1],
    [-384, 6],
    [384, 0x0e],
    [0, 0],
  ])
    f.context.terrain.writeByte(20 * 384 + 20 + delta, tile);
  f.context.terrain.writeByte(20 * 384 + 30, 0xba);
  f.app.startFieldBattle = () =>
    assert.fail("no tactical lifecycle before4E5C");
  f.app.gamebar = {
    enqueueTalkMessage: () => assert.fail("no message before4E5C"),
  };
  return f;
}

test("real2873 first DI before strongest selection, candidate AL, globals, no tails; JSON cold restore", async () => {
  const f = await fieldDeadline();
  const saved = json(snapshotState(f.app, 0, "pre-field-prefix"));
  const restored = await prepareScenario({
    ...f.args,
    mode: "restore",
    raw: restoreSnapshotState(saved),
    ...readSavedAssembly(saved),
  });
  const g = {
    sc: restored.scenario,
    A: restored.scenario.legions[0],
    context: scenarioNativeRoadContext(restored.scenario),
    app: {
      ...f.app,
      scenario: restored.scenario,
      clock: { ...f.app.clock },
      originalRng: new OriginalBattleRng({ ch: 1, cl: 2, dh: 3 }),
    },
  };
  const reported = [];
  const debug = globalThis.__dragonDebug;
  globalThis.__dragonDebug = {
    reportError: (_label, error) => reported.push(error),
  };
  try {
    for (const h of [f, g]) {
      const before = h.app.originalRng.snapshot();
      slot(h, true);
      const error = h.app._strategicBattleFailure.error;
      assert.equal(error.instruction, "52E7"); // original commander read, no ability defaults
      assert.deepEqual(error.nativeFieldPrefix, {
        d32: 0,
        d35: 0,
        d34: 0xc2,
        bpWords: { 0: 0x2340, 2: 0x2440, 254: 2 },
      });
      assert.equal(error.nativeFieldCall.ax, 10);
      assert.equal(error.nativeFieldCall.dx, 6);
      assert.equal(
        error.nativeFieldCall.firstDefender,
        h.sc.nativeLegionSlots.records[4],
      );
      assert.deepEqual(error.nativeFieldCall.selection, {
        bx: 0x2440,
        cx: 4,
        cf: false,
      });
      assert.equal(error.nativeFieldCall.di, 0x2440);
      assert.equal(reported.at(-1), error);
      assert.equal(reported.at(-1).nativeFieldPrefix, error.nativeFieldPrefix);
      assert.equal(h.A.status & 0x20, 0);
      assert.equal(h.sc.legionSlotCounters[0], 0);
      assert.equal(h.sc.legionSlotCounters[4], 7);
      assert.equal(h.sc.legionSlotCounters[8], 0);
      assert.equal(h.sc.nativeLegionSlots.records[4].moveDelay, 9);
      assert.equal(h.sc.nativeLegionSlots.records[8].moveDelay, 9);
      assert.equal(h.sc.factions[0].money, 1000);
      assert.equal(h.context.movement.readByte(240, 5), 0);
      assert.equal(h.context.movement.readByte(240, 6), 1);
      assert.equal(h.app.clock.hold, true);
      assert.equal(canSnapshotState(h.app), false);
      assert.deepEqual(h.app.originalRng.snapshot(), before);
      assert.equal(Object.hasOwn(h.sc, "nativeFieldPrefix"), false);
      assert.equal(Object.hasOwn(saved.webMeta, "nativeFieldPrefix"), false);
    }
    assert.deepEqual(
      g.context.terrain.snapshot(),
      f.context.terrain.snapshot(),
    );
    assert.deepEqual(
      g.context.movement.snapshot(),
      f.context.movement.snapshot(),
    );
  } finally {
    globalThis.__dragonDebug = debug;
  }
});

test("real2873 selected prefix failures retain same owned Error, hold/nonsave and no daily/remaining tail", async () => {
  for (const at of ["4AA5", "4AA8", "4AAC", "4AAF"]) {
    const f = await fieldDeadline(),
      error = new TypeError(at);
    const selected = f.sc.nativeLegionSlots.records[8];
    selected.status |= 0x20;
    if (at === "4AA5" || at === "4AAC") {
      const record = at === "4AA5" ? f.A : selected;
      let value = record.status;
      Object.defineProperty(record, "status", {
        configurable: true,
        enumerable: true,
        get: () => value,
        set(next) {
          if (value & 0x20 && !(next & 0x20)) throw error;
          value = next;
        },
      });
    } else {
      const key = at === "4AA8" ? "0" : "8";
      f.sc.legionSlotCounters = new Proxy(f.sc.legionSlotCounters, {
        set(table, index, value) {
          if (index === key && value === 0) throw error;
          table[index] = value;
          return true;
        },
      });
    }
    slot(f, true);
    assert.equal(f.app._strategicBattleFailure.error, error);
    assert.equal(error.instruction, at);
    assert.deepEqual(error.nativeFieldCall.selection, {
      bx: 0x2440,
      cx: 4,
      cf: false,
    });
    assert.deepEqual(error.nativeFieldPrefix.bpWords, {
      0: 0x2340,
      2: 0x2440,
      254: 2,
    });
    assert.equal(f.A.status & 0x20, at === "4AA5" ? 0x20 : 0);
    assert.equal(
      f.sc.legionSlotCounters[0],
      at === "4AA5" || at === "4AA8" ? 1 : 0,
    );
    assert.equal(selected.status & 0x20, at === "4AAF" ? 0 : 0x20);
    assert.equal(f.sc.legionSlotCounters[8], 11);
    assert.equal(f.sc.legionSlotCounters[4], 7);
    assert.equal(f.sc.factions[0].money, 1000);
    assert.equal(selected.moveDelay, 9);
    assert.equal(f.context.movement.readByte(240, 5), 0);
    assert.equal(f.app.clock.hold, true);
    assert.equal(canSnapshotState(f.app), false);
  }
});

test("real2873 class8 consumed RNG survives stop; early field/class9 failures keep onlyD32", async () => {
  for (const kind of ["marker", "pointer", "class8", "class9"]) {
    const f = await fieldDeadline();
    const control = new OriginalBattleRng({ ch: 1, cl: 2, dh: 3 });
    if (kind === "marker") {
      f.sc.player_faction = 0;
      delete f.A._markerFrame;
    }
    if (kind === "pointer")
      delete f.sc.nativeLegionSlots.records[4].occupancyRowParagraph;
    if (kind === "class8") f.context.terrain.writeByte(20 * 384 + 20, 0xca);
    if (kind === "class9") f.context.terrain.writeByte(20 * 384 + 20, 0xc0);
    const directory =
      kind === "class8" ? 0xd1 + (control.nextByte() & 3) : null;
    slot(f, true);
    const error = f.app._strategicBattleFailure.error;
    assert.equal(
      error.instruction,
      { marker: "4B71", pointer: "4B7D", class8: "52E7", class9: "4C41" }[kind],
    );
    assert.deepEqual(
      error.nativeFieldPrefix,
      kind === "class8"
        ? {
            d32: 0,
            d35: 0,
            d34: directory,
            bpWords: { 0: 0x2340, 2: 0x2440, 254: 2 },
          }
        : { d32: 0 },
    );
    assert.deepEqual(f.app.originalRng.snapshot(), control.snapshot());
    assert.equal(f.sc.legionSlotCounters[0], kind === "class8" ? 0 : 1);
    assert.equal(f.sc.legionSlotCounters[4], 7);
    assert.equal(f.sc.legionSlotCounters[8], kind === "class8" ? 0 : 11);
    assert.equal(f.context.movement.readByte(240, 5), 0);
    assert.equal(canSnapshotState(f.app), false);
  }
});

async function quickField() {
  const f = await fieldDeadline();
  const D = f.sc.nativeLegionSlots.records[8];
  for (const record of [f.A, D]) {
    record.troops = 600;
    record.morale = 200;
    record.units = Array.from({ length: 6 }, () => ({ type: 3, troops: 1000 }));
  }
  // Both L02=0 even though selector uses G1F@slot8. Ability is NOT G1F.
  f.sc.generals[0].ability = { force: 8, lead: 9, field: 0 };
  f.sc.generals[8].ability = { force: 255, lead: 255, field: 15 };
  f.sc.cities[1].faction = 1;
  f.sc.factions[1].capital = 1;
  f.sc.factions[1].n_legions = 2;
  f.context.movement.writeByte(480, 30, 1);
  return { ...f, D };
}

test("real2873 neither/delegated player A/D quick RET: same canonical RNG, no4EAF DEC, current daily and other slots", async () => {
  for (const player of [0, 1, 2]) {
    const f = await quickField();
    f.sc.player_faction = player;
    if (player === 0) f.A.status |= 4;
    if (player === 1) f.D.status |= 4;
    const control = new OriginalBattleRng({ ch: 1, cl: 2, dh: 3 });
    const w = [],
      l = [];
    for (let i = 0; i < 6; i++) {
      w.push(100 - ((control.nextByte() & 7) + 2));
      l.push(100 - ((control.nextByte() % (8 + i + 1)) + 8));
    }
    const wt = w.reduce((a, b) => a + b),
      lt = l.reduce((a, b) => a + b);
    slot(f, true);
    assert.equal(f.app._strategicBattleFailure, undefined);
    assert.deepEqual(
      f.A.units.map((u) => u.troops),
      w.map((n) => n * 10),
    );
    assert.deepEqual(
      f.D.units.map((u) => u.troops),
      l.map((n) => n * 10),
    );
    assert.equal(f.A.troops, wt);
    assert.equal(f.D.troops, lt);
    assert.equal(f.A.morale, Math.floor((200 * wt) / 600));
    assert.equal(f.D.morale, Math.floor((100 * lt) / 600));
    assert.equal(f.A.commandState, 8);
    assert.equal(f.D.commandState, 10);
    assert.equal(f.A.targetNode, 1);
    assert.equal(f.A.x, 5);
    assert.equal(f.A.moveDelay, 1);
    assert.equal(f.D.moveDelay, 3);
    assert.equal(f.sc.nativeLegionSlots.records[4].moveDelay, 8);
    assert.equal(f.sc.legionSlotCounters[0], 0);
    assert.equal(f.sc.legionSlotCounters[8], 0);
    assert.equal(f.sc.factions[0].money, 1000 - (wt >> 1) - (wt >> 2));
    assert.equal(f.sc.factions[1].money, 1000 - (lt >> 1) - (lt >> 2)); // unselected troop1 costs0
    assert.equal(f.context.movement.readByte(240, 5), 1); //269C DEC +26FA INC only
    assert.equal(f.context.movement.readByte(480, 30), 0); //D's later slot moves old pointer
    assert.equal(f.context.movement.readByte(240, 6), 2);
    assert.deepEqual(f.app.originalRng.snapshot(), control.snapshot());
    assert.equal(f.sc._legionBatchCursor, 16);
    assert.equal(canSnapshotState(f.app), true);
    assert.equal(Object.hasOwn(f.sc, "nativeFieldPrefix"), false);
    const saved = json(snapshotState(f.app, 0, "quick-return"));
    const restored = await prepareScenario({
      ...f.args,
      mode: "restore",
      raw: restoreSnapshotState(saved),
      ...readSavedAssembly(saved),
    });
    const savedAgain = json(
      snapshotState(
        { ...f.app, scenario: restored.scenario },
        0,
        "quick-return",
      ),
    );
    assert.deepEqual(
      savedAgain.state.nativeLegionSlots,
      saved.state.nativeLegionSlots,
    );
    assert.deepEqual(
      savedAgain.webMeta.movementMemory,
      saved.webMeta.movementMemory,
    );
    const restoredRng = new OriginalBattleRng().restore(
      saved.webMeta.originalRng,
    );
    assert.equal(restoredRng.nextByte(), control.nextByte());
  }
});

test("real2873 selected player A/D first-unknown messages keep globals/clears without quick RNG, occupancy tail or replay", async () => {
  for (const player of [0, 1]) {
    const f = await quickField();
    f.sc.player_faction = player;
    const before = f.app.originalRng.snapshot();
    slot(f, true);
    const e = f.app._strategicBattleFailure.error;
    assert.equal(e.instruction, player === 0 ? "4E82" : "4EA1");
    assert.equal(e.nativeFieldPrefix.d2e, player === 0 ? 0x2240 : 0x2440);
    assert.equal(e.nativeFieldPrefix.d30, player === 0 ? 0x2440 : 0x2240);
    assert.equal(e.nativeFieldPrefix.d35 & 0x80, player === 1 ? 0x80 : 0);
    assert.equal(f.sc.legionSlotCounters[0], 0);
    assert.equal(f.sc.legionSlotCounters[8], 0);
    assert.equal(f.sc.legionSlotCounters[4], 7);
    assert.equal(f.context.movement.readByte(240, 5), 0);
    assert.equal(f.D.moveDelay, 9);
    assert.equal(f.sc.factions[0].money, 1000);
    assert.deepEqual(f.app.originalRng.snapshot(), before);
    assert.equal(canSnapshotState(f.app), false);
    slot(f, true);
    assert.equal(f.app._strategicBattleFailure.error, e);
    assert.deepEqual(f.app.originalRng.snapshot(), before);
  }
});

test("real5130 second474A failure retains both battle writes and attack474A, no tail or repeated RNG", async () => {
  const f = await quickField();
  delete f.sc.factions[1].march_marker_style;
  const control = new OriginalBattleRng({ ch: 1, cl: 2, dh: 3 });
  for (let i = 0; i < 12; i++) control.nextByte();
  slot(f, true);
  const e = f.app._strategicBattleFailure.error;
  assert.equal(e.instruction, "51A1");
  assert.match(e.message, /F3E at 700F/);
  assert(f.A.troops < 600 && f.D.troops < 600);
  assert(f.A.morale < 200 && f.D.morale < 200);
  assert.equal(f.A.commandState, 8);
  assert.equal(f.A.moveDelay, 1);
  assert.equal(f.D.movePeriod, 3);
  assert.equal(f.D.moveDelay, 9);
  assert.equal(f.context.movement.readByte(240, 5), 0);
  assert.equal(f.sc.factions[0].money, 1000);
  assert.deepEqual(f.app.originalRng.snapshot(), control.snapshot());
  assert.equal(canSnapshotState(f.app), false);
  slot(f, true);
  assert.equal(f.app._strategicBattleFailure.error, e);
  assert.deepEqual(f.app.originalRng.snapshot(), control.snapshot());
});

test("real4AB6 current/other-slot2977 return tails and AH3 onlyA fate, storedF14 and no extra RNG", async () => {
  for (const failed of [1, 2, 3]) {
    const f = await quickField();
    f.sc.nativeFateDisplayFlags = 0;
    f.sc.factions[0].monarch_idx = 0;
    f.sc.factions[1].monarch_idx = 0;
    if (failed & 1) f.A.morale = 99;
    if (failed & 2) f.D.morale = 99;
    const control = new OriginalBattleRng({ ch: 1, cl: 2, dh: 3 });
    for (let i = 0; i < 12; i++) control.nextByte();
    slot(f, true);
    assert.equal(f.app._strategicBattleFailure, undefined);
    const aRetired = failed !== 2;
    assert.equal(f.A.status, aRetired ? 8 : 0xc1);
    assert.equal(f.D.status, failed === 2 ? 8 : 0xc1);
    assert.equal(f.sc.legionSlotCounters[0], 0); //current48→264A0
    assert.equal(f.sc.legionSlotCounters[8], failed === 2 ? 47 : 0); //other48→2A7E47
    assert.equal(f.sc.factions[0].n_legions, aRetired ? 0 : 1);
    assert.equal(f.sc.factions[1].n_legions, failed === 2 ? 1 : 2);
    assert.equal(f.context.movement.readByte(240, 5), aRetired ? 0 : 1);
    assert.equal(f.context.movement.readByte(480, 30), 0);
    assert.equal(f.sc._legionBatchCursor, 16);
    assert.equal(
      f.sc.factions[0].money,
      1000 - (f.A.troops >> 1) - (f.A.troops >> 2),
    );
    assert.equal(
      f.sc.factions[1].money,
      failed === 2 ? 1000 : 1000 - (f.D.troops >> 1) - (f.D.troops >> 2),
    );
    assert.deepEqual(f.app.originalRng.snapshot(), control.snapshot());
    assert.equal(canSnapshotState(f.app), true);
    const saved = json(snapshotState(f.app, 0, "fate-tail"));
    const restored = await prepareScenario({
      ...f.args,
      mode: "restore",
      raw: restoreSnapshotState(saved),
      ...readSavedAssembly(saved),
    });
    assert.deepEqual(
      restored.scenario.legionSlotCounters,
      f.sc.legionSlotCounters,
    );
    assert.equal(
      restored.scenario.nativeLegionSlots.records[0].status,
      f.A.status,
    );
    assert.equal(
      restored.scenario.nativeLegionSlots.records[8].status,
      f.D.status,
    );
  }
});

test("real2831 both-player is friendly first-D, not a reachable4E5C battle", async () => {
  const f = await quickField();
  f.sc.player_faction = 0;
  f.sc.nativeLegionSlots.records[4].faction = 0;
  f.D.faction = 0;
  const before = f.app.originalRng.snapshot();
  slot(f);
  assert.equal(f.app._strategicBattleFailure, undefined);
  assert.equal(f.A.x, 6);
  assert.equal(f.A.roadPointAddress, 0x2010);
  assert.equal(f.A.troops, 600);
  assert.equal(f.D.troops, 600);
  assert.equal(f.A.commandState, 0);
  assert.equal(f.D.moveDelay, 8);
  assert.deepEqual(f.app.originalRng.snapshot(), before);
});

test("real5130 unsupported aliases and DIV preserve precise prefixes/hold without fallback or repeated RNG", async () => {
  for (const at of ["52A4", "52E7", "5171", "5263"]) {
    const f = await quickField();
    if (at === "52A4") f.A.units[2].type = 0;
    if (at === "52E7") f.A.generalIdx = 128;
    if (at === "5263") f.A.troops = 1;
    if (at === "5171") {
      f.A.units = [255, 34, 1, 0, 0, 0].map((troops, i) => ({
        type: [1, 1, 2, 4, 4, 4][i],
        troops: troops * 10,
      }));
      f.A.morale = 152;
      f.sc.generals[0].ability = { force: 127, lead: 0, field: 15 };
      f.app.originalRng = new OriginalBattleRng().restore({
        table: Array(257).fill(0),
        addend: 1,
        index: 0,
        calls: 0,
      });
    }
    const before = json({ a: f.A.units, d: f.D.units });
    slot(f, true);
    const e = f.app._strategicBattleFailure.error;
    assert.equal(e.instruction, at);
    assert.equal(
      f.app.originalRng.calls,
      at === "5263" ? 12 : at === "5171" ? 2 : 0,
    );
    if (at === "5263") {
      assert(f.A.troops > 500);
      assert(f.D.troops > 400);
      assert.equal(f.A.morale, 200);
      assert.equal(f.D.morale, 200);
    } else assert.deepEqual({ a: f.A.units, d: f.D.units }, before);
    assert.equal(f.sc.factions[0].money, 1000);
    assert.equal(f.context.movement.readByte(240, 5), 0);
    assert.equal(f.D.moveDelay, 9);
    assert.equal(canSnapshotState(f.app), false);
    const after = f.app.originalRng.snapshot();
    slot(f, true);
    assert.equal(f.app._strategicBattleFailure.error, e);
    assert.deepEqual(f.app.originalRng.snapshot(), after);
  }
});

async function quickSiege() {
  const f = await fixture({
    legion: soldier({
      x: 6,
      occupancyOffset: 6,
      roadPointAddress: 0x2010,
      troops: 300,
      morale: 200,
      units: Array.from({ length: 6 }, () => ({ type: 3, troops: 500 })),
    }),
    change(raw) {
      raw.player_faction = 2;
      raw.legionSlotCounters[0] = 1;
      raw.legionSlotCounters[8] = 7;
      Object.assign(raw.cities[1], {
        faction: 1,
        troops: 87,
        growth: 104,
        defence: 100,
      });
      raw.factions[1].capital = 1;
      raw.generals = Array.from({ length: 128 }, (_, idx) => ({
        idx,
        battle_rating: 0,
        ability: { force: 8, lead: 9, siege: 0 },
      }));
      raw.legions.push(
        soldier({
          slot: 8,
          generalIdx: 8,
          faction: 1,
          status: 0xe4,
          x: 8,
          roadEdgeOrNode: 8,
          occupancyOffset: 8,
          moveDelay: 9,
          troops: 600,
          morale: 200,
          units: Array.from({ length: 6 }, () => ({ type: 3, troops: 1000 })),
        }),
      );
    },
  });
  f.context.movement.writeByte(240, 6, 1);
  f.context.movement.writeByte(240, 8, 1);
  f.app.originalRng = new OriginalBattleRng({ ch: 1, cl: 2, dh: 3 });
  return f;
}

test("real28BF siege loss returns to occupancy INC and same-slot tail without moving to candidate or clearing D03", async () => {
  for (const viaSlot of [false, true]) {
    const f = await quickSiege(),
      D = f.sc.nativeLegionSlots.records[8];
    if (viaSlot) slot(f, true);
    else
      assert.equal(
        performOriginalRoadAction(f.sc, f.A, f.context, f.app.originalRng),
        "siege-battle",
      );
    assert.equal(f.app._strategicBattleFailure, undefined);
    assert.equal(f.A.x, 6);
    assert.equal(f.A.roadPointAddress, 0x2010);
    assert.equal(plane(f, 6), 1);
    assert.equal(plane(f, 7), 0);
    assert.equal(f.A.targetCity, 0);
    assert.equal(f.A.commandState, 10);
    assert.equal(f.sc.cities[1].faction, 1);
    assert(f.sc.cities[1].troops < 87);
    // Entry preserves D03/bit5. Later slot8 now has 0B=1 from474A;
    // 25CC clears bit5 at its own due action, then264A clears03.
    assert.equal(D.status & 0x20, viaSlot ? 0 : 0x20);
    assert.equal(f.sc.legionSlotCounters[8], viaSlot ? 0 : 7);
    assert.equal(f.sc.legionSlotCounters[0], 0);
    assert.equal(f.app.originalRng.snapshot().calls, 12);
  }
});

test("real28BF player siege stops before RNG, owns failure/hold, and never replays prefix", async () => {
  const f = await quickSiege();
  f.sc.player_faction = 0;
  const before = f.app.originalRng.snapshot();
  slot(f, true);
  const error = f.app._strategicBattleFailure.error;
  assert.equal(error.instruction, "4F36");
  assert.deepEqual(error.nativeSiegePrefix, {
    d32: 0x860,
    d34: 1,
    d35: 0,
    bpWords: { 0: 0x2440, 254: 1 },
  });
  assert.equal(f.A.status & 0x20, 0);
  assert.equal(f.sc.legionSlotCounters[0], 0);
  assert.equal(f.sc.legionSlotCounters[8], 7);
  assert.equal(plane(f, 6), 0);
  assert.equal(f.app.clock.hold, true);
  assert.equal(canSnapshotState(f.app), false);
  slot(f, true);
  assert.equal(f.app._strategicBattleFailure.error, error);
  assert.deepEqual(f.app.originalRng.snapshot(), before);
  assert.equal(f.sc.factions[0].money, 1000);
});

test("real28BF neutral zero-garrison still fights, raw063E then cleanup/capture/map/slot tail; unknown alias retains prefix", async () => {
  for (const missing of [false, true]) {
    const f = await quickSiege();
    f.sc.nativeLegionSlots.records[8].status = 0;
    rebindNativeLegionViews(f.sc);
    Object.assign(f.sc.cities[1], {
      faction: null,
      troops: 0,
      type: 0,
      strategicNeighbours: [255, 255, 255, 255],
    });
    f.sc.factions[0].n_cities = 1;
    f.sc.nativeFateDisplayFlags = 0;
    f.sc.diplomacy[2][14] = 0xed;
    if (missing) delete f.sc.diplomacy[2][14];
    const temporary = f.sc.nativeLegionSlots.records[127];
    temporary.roadEdgeOrNode = 0x1234;
    slot(f, true);
    if (missing) {
      assert.match(f.app._strategicBattleFailure.error.message, /063E at 700F/);
      assert.equal(f.sc.cities[1].faction, null);
      assert.equal(plane(f, 6), 0);
      assert.equal(canSnapshotState(f.app), false);
    } else {
      assert.equal(f.app._strategicBattleFailure, undefined);
      assert.equal(f.sc.cities[1].faction, 0);
      assert.equal(f.sc.factions[0].n_cities, 2);
      assert.equal(temporary.status, 0);
      assert.equal(temporary.markerBase, (0xed * 5) & 255);
      assert.equal(temporary.roadEdgeOrNode, 0x1234);
      assert.equal(temporary.morale, 0);
      assert.equal(plane(f, 6), 1);
      assert.equal(f.A.x, 6);
      assert.equal(f.A.commandState, 8);
      assert.equal(f.sc.legionSlotCounters[0], 0);
      assert.equal(f.context.terrain.readByte(3840 + 8), 0xb9);
    }
  }
});

test("real28BF fixed127 and G127 survive pre/post siege JSON cold restoration without defaults or duplicate authority", async () => {
  const f = await quickSiege();
  f.sc.nativeLegionSlots.records[8].status = 0;
  rebindNativeLegionViews(f.sc);
  Object.assign(f.sc.cities[1], {
    faction: null,
    troops: 0,
    type: 0,
    strategicNeighbours: [255, 255, 255, 255],
  });
  f.sc.factions[0].n_cities = 1;
  f.sc.nativeFateDisplayFlags = 0;
  f.sc.diplomacy[2][14] = 0xed;
  // Explicit stored input: raw G127 abilities in all 20 chapters; owner2 in
  // upper chapters 0/1. Neither field is derived from the attacked city.
  Object.assign(f.sc.generals[127], {
    attr: 0,
    faction: 2,
    ability: { siege: 0, field: 0, naval: 0, force: 8, lead: 8, politics: 8 },
  });
  const generalBefore = json(f.sc.generals[127]);
  const temporary = f.sc.nativeLegionSlots.records[127];
  // Controlled residue, not a claim that these nonzero bytes were loaded
  // from the zero SINARIO legion table or reached by a whole campaign.
  temporary.roadEdgeOrNode = 0x1234;
  temporary.commandState = 11;
  f.sc.legionSlotCounters[127] = 106;
  const saved = json(snapshotState(f.app, 0, "pre-siege-127"));
  const prepared = await prepareScenario({
    ...f.args,
    mode: "restore",
    raw: restoreSnapshotState(saved),
    ...readSavedAssembly(saved),
  });
  const g = {
    sc: prepared.scenario,
    A: prepared.scenario.nativeLegionSlots.records[0],
    context: scenarioNativeRoadContext(prepared.scenario),
    app: {
      ...f.app,
      scenario: prepared.scenario,
      clock: { ...f.app.clock },
      originalRng: new OriginalBattleRng().restore(saved.webMeta.originalRng),
    },
  };
  assert.notEqual(g.sc.nativeLegionSlots.records[127], temporary);
  for (const h of [f, g]) {
    slot(h, true);
    assert.equal(h.app._strategicBattleFailure, undefined);
    const t = h.sc.nativeLegionSlots.records[127];
    assert.equal(t.status, 0);
    assert.equal(t.generalIdx, 127);
    assert.equal(t.faction, 24);
    assert.equal(t.roadEdgeOrNode, 0x1234);
    assert.equal(t.commandState, 11);
    assert.equal(h.sc.legionSlotCounters[127], 106);
    assert.equal(t.markerBase, (0xed * 5) & 255);
    assert.deepEqual(h.sc.generals[127], generalBefore);
    assert.equal(h.sc.legions.includes(t), false);
    assert.equal(canSnapshotState(h.app), true);
    const after = json(snapshotState(h.app, 0, "post-siege-127"));
    const cold = await prepareScenario({
      ...f.args,
      mode: "restore",
      raw: restoreSnapshotState(after),
      ...readSavedAssembly(after),
    });
    const restored = cold.scenario.nativeLegionSlots.records[127];
    assert.notEqual(restored, t);
    assert.deepEqual(json(restored), json(t));
    assert.deepEqual(cold.scenario.generals[127], generalBefore);
    assert.equal(cold.scenario.legionSlotCounters[127], 106);
    const rng = new OriginalBattleRng().restore(after.webMeta.originalRng);
    assert.deepEqual(rng.snapshot(), h.app.originalRng.snapshot());
    assert.equal(
      rng.nextByte(),
      new OriginalBattleRng().restore(h.app.originalRng.snapshot()).nextByte(),
    );
  }
  // Compare serialized rule authority; inactive UI projections (dead/leader/
  // target object) are intentionally absent after restore, not rule bytes.
  assert.deepEqual(
    json(snapshotNativeLegionSlots(g.sc)),
    json(snapshotNativeLegionSlots(f.sc)),
  );
  assert.deepEqual(g.sc.legionSlotCounters, f.sc.legionSlotCounters);
  assert.deepEqual(g.app.originalRng.snapshot(), f.app.originalRng.snapshot());
  assert.deepEqual(
    g.context.movement.snapshot(),
    f.context.movement.snapshot(),
  );
  assert.deepEqual(g.context.terrain.snapshot(), f.context.terrain.snapshot());
});

test("real28BF surviving neutral defender uses0603; FF/shortcut return versus missing-alias failure never replays combat", async () => {
  for (const capital of [0, 255, undefined]) {
    const f = await quickSiege();
    f.sc.nativeLegionSlots.records[8].status = 0;
    rebindNativeLegionViews(f.sc);
    Object.assign(f.sc.cities[1], {
      faction: null,
      troops: 255,
      type: 0,
      strategicNeighbours: [255, 255, 255, 255],
    });
    f.sc.generals[0].ability.siege = 12;
    f.sc.factions[0].n_cities = 1;
    f.sc.nativeFateDisplayFlags = 0;
    f.sc.diplomacy[2][14] = 17;
    if (capital === undefined) delete f.sc.diplomacy[0][3];
    else f.sc.diplomacy[0][3] = capital;
    const t = f.sc.nativeLegionSlots.records[127];
    t.roadEdgeOrNode = 0;
    t.commandState = 11;
    slot(f, true);
    assert(t.morale > 0, "fixture must reach487B after6FD2/morale gate");
    assert(t.units[0].troops > 0);
    assert.equal(t.markerBase, 85);
    assert.equal(t.moveDelay, 1);
    assert.equal(f.app.originalRng.snapshot().calls, 12);
    if (capital === undefined) {
      const error = f.app._strategicBattleFailure.error;
      assert.match(error.message, /DS0603/);
      assert.equal(t.commandState, 11);
      assert.equal(f.sc.cities[1].faction, null);
      assert(f.sc.cities[1].troops < 255); // numeric writes committed first
      assert.equal(plane(f, 6), 0);
      assert.equal(f.app.clock.hold, true);
      assert.equal(canSnapshotState(f.app), false);
      const rng = f.app.originalRng.snapshot();
      slot(f, true);
      assert.equal(f.app._strategicBattleFailure.error, error);
      assert.deepEqual(f.app.originalRng.snapshot(), rng);
    } else {
      assert.equal(f.app._strategicBattleFailure, undefined);
      assert.equal(t.status, 0); //4FC9 after the actual474A return
      assert.equal(t.commandState, capital === 0 ? 10 : 11);
      if (capital === 0) {
        assert.equal(t.targetCity, 0);
        assert.equal(t.targetNode, 0);
      }
      assert.equal(f.sc.cities[1].faction, 0);
      assert.equal(plane(f, 6), 1);
      assert.equal(f.sc.legionSlotCounters[0], 0);
      assert.equal(canSnapshotState(f.app), true);
    }
  }
});
