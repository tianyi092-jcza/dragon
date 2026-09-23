// Synthetic original-byte goldens: KI 487B..491A, 474A..47BA, 4DA4..4DEF.
// See march notes §3.11. No disk, real saves, profile, network or original program.
import assert from "node:assert/strict";
import test from "node:test";
import { attachSyntheticNativeFactionSource } from "./native_faction_fixture.mjs";
import { createContentCatalog } from "../web/src/content/catalog.js";
import { createWorldResources } from "../web/src/game/worldresources.js";
import { createNewGameScenario, Scenario } from "../web/src/game/world.js";
import { rebindNativeLegionViews } from "../web/src/game/nativelegions.js";
import {
  prepareScenario,
  scenarioNativeRoadContext,
  assertPlayableScenario,
} from "../web/src/game/scenarioassembly.js";
import {
  getScenarioRoadMemory,
  initializeScenarioRoadMemory,
} from "../web/src/game/navigation/scenarioroadmemory.js";
import { retreatOriginalRoadMemory } from "../web/src/game/navigation/originalroadretreat.js";
import {
  continueLegionAfterBattle,
  applyFieldBattleResult,
  applyBattleResult,
  retreatCapturedGarrison,
  updateFactionAfterCityCapture,
} from "../web/src/game/ai.js";
import {
  snapshotState,
  restoreSnapshotState,
  admitSavedScenario,
  canSnapshotState,
} from "../web/src/game/savegame.js";

function json(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    assert.fail(`JSON roundtrip failed: ${error}`);
  }
}
function legion(slot = 0, faction = 0, current = 0x800) {
  return {
    slot,
    generalIdx: slot,
    faction,
    status: 0xc4,
    troops: 360,
    morale: 150,
    x: 100,
    y: 100,
    roadEdgeOrNode: current,
    roadPointAddress: 0x2000,
    roadStride: -4,
    targetCity: 9,
    targetNode: 9,
    commandState: 3,
    moveDelay: 7,
    movePeriod: 3,
    engagementCountdown: 6,
    units: Array.from({ length: 6 }, () => ({ type: 3, troops: 600 })),
  };
}
async function fixture(
  edges = [
    [0, 1, 20],
    [0, 2, 3],
    [1, 2, 9],
  ],
  swap = false,
  version = 2,
  { movementMemory = null, rngByte = 0, change = () => {} } = {},
  bind = true,
) {
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
  for (const [source, target, weight] of edges) {
    const id = graph.edges.length,
      address = 0x800 + id * 16;
    for (const [node, tag] of [
      [source, 0x4000],
      [target, 0x8000],
    ]) {
      const slots = graph.nodes[node].edgeSlots;
      slots[slots.indexOf(0)] = tag | address;
    }
    graph.edges.push({
      id,
      source,
      target,
      weight,
      bounds: { minX: source, maxX: target, minY: 2, maxY: 2 },
      points: [
        { x: source, y: 2, flags: 0x44 },
        { x: target, y: 2, flags: 4 },
      ],
    });
  }
  if (swap) graph.nodes[2].edgeSlots.reverse();
  const template = {
    player_faction: 23,
    factions: [0, 1].map((idx) => ({
      idx,
      capital: idx === 0 ? 2 : 10,
      n_legions: 0,
      active: true,
      monarch_idx: 126,
      march_marker_style: 0,
    })),
    generals: [],
    cities: graph.nodes.map(({ id, x, y }) => ({
      idx: id,
      x,
      y,
      faction: 0,
      governor: null,
      type: 0,
      production: 10,
    })),
    legions: [],
    // P58 fresh v2 requires the fixed 16-slot SINARIO cloud table.
    weatherClouds: Array.from({ length: 16 }, () => ({ status: 0 })),
    disasterMapObjects: Array.from({ length: 16 }, () => ({ status: 0 })),
  };
  const manifest = {
    schemaVersion: 1,
    rules: "ki-1995",
    id: "native-test",
    revision: "1",
    chapters: [{ id: "chapter", legacyScenarioIndex: 0, official: true }],
  };
  const content = createContentCatalog(manifest, { scenarios: [template] });
  const world = createWorldResources();
  const f = {
    raw: createNewGameScenario(template),
    idx: 0,
    mode: "fresh",
    content,
    world,
    movementMemory,
  };
  change(f.raw);
  if (version === 2) attachSyntheticNativeFactionSource(f.raw);
  // P76 gate: bind=false skips prepare to yield an unbound scenario for
  // legacy-branch pins. v1 owners are unconstructible, so no v1 graph
  // may reach prepare; unbound scenarios keep the legacy dispatch
  // (null context, no native slots) without any owner.
  if (!bind) {
    const messages = [];
    let calls = 0;
    // Unbound but method-complete: prepare clones raw into a Scenario,
    // so wrap the same way without binding an assembly owner.
    const sc = new Scenario(structuredClone(f.raw));
    const app = {
      scenario: sc,
      scenarioIdx: 0,
      world,
      content,
      data: { scenarios: [template] },
      clock: { year: 190, month: 1, day: 1 },
      originalRng: {
        nextByte: () => {
          calls++;
          return rngByte;
        },
        snapshot: () => ({ test: 1 }),
      },
      gamebar: { enqueueTalkMessage: (message) => messages.push(message) },
    };
    return {
      ...f,
      sc,
      app,
      manifest,
      messages,
      rngCalls: () => calls,
      memory: null,
    };
  }
  const oldFetch = globalThis.fetch;
  const allowed = new Set([
    world.definition.assets.terrain,
    world.definition.assets.roadCost,
    world.definition.assets.roadOffset,
    world.definition.assets.roadGraph,
  ]);
  // Exact four world assets only; never forward a request to the original fetch.
  globalThis.fetch = async (url) => {
    assert(allowed.has(url), `Unexpected asset ${url}`);
    return {
      ok: true,
      json: async () =>
        url === world.definition.assets.roadGraph ? graph : {},
      arrayBuffer: async () => new ArrayBuffer(384 * 256),
    };
  };
  let prepared;
  try {
    prepared = await prepareScenario(f);
  } finally {
    globalThis.fetch = oldFetch;
  }
  const sc = prepared.scenario;
  let calls = 0;
  const app = {
    scenario: sc,
    scenarioIdx: 0,
    world,
    content,
    data: { scenarios: [template] },
    clock: { year: 190, month: 1, day: 1 },
    originalRng: {
      nextByte: () => {
        calls++;
        return rngByte;
      },
      snapshot: () => ({ test: 1 }),
    },
    gamebar: { enqueueTalkMessage: (message) => messages.push(message) },
  };
  const messages = [];
  return {
    ...f,
    ...prepared,
    sc,
    app,
    manifest,
    messages,
    rngCalls: () => calls,
    memory: version === 2 ? getScenarioRoadMemory(sc) : null,
  };
}
function rawQuery(f, current, owner = 0) {
  const context = scenarioNativeRoadContext(f.sc);
  return retreatOriginalRoadMemory({
    readFactionByte: () => owner,
    readCapitalByte: () =>
      f.sc.factions[owner].capital === null
        ? 255
        : f.sc.factions[owner].capital,
    readCurrentWord: () => current,
    readGraphByte: f.memory.readByte,
    writeGraphByte: f.memory.writeByte,
    readStateByte: context.readCityOwnerByte,
  });
}
const side = (morale = 150) => ({
  troops: 360,
  morale,
  units: Array.from({ length: 6 }, () => ({ type: 3, troops: 60 })),
});
function field(f, A, D, winner = "def", sides = [side(), side()]) {
  return applyFieldBattleResult(f.app, A, D, winner, 360, 360, null, null, {
    sides,
  });
}
// Explicit state AT4DA4, not a returned4CF3/capture simulation. The caller's
// owner exchange/474A/capital decision are prerequisites, not executed here.
function garrisonAt4DA4(f, A, city, defenders) {
  city.faction = A.faction;
  return retreatCapturedGarrison(
    f.app,
    f.sc,
    defenders,
    A.faction,
    f.app.originalRng,
  );
}

test("actual field entry: dual-stop costs and slot-order choose immediate retreat", async () => {
  for (const [left, right, swap, expected] of [
    [3, 9, false, 0],
    [9, 3, false, 1],
    [3, 3, false, 0],
    [3, 3, true, 1],
  ]) {
    const f = await fixture(
      [
        [0, 1, 20],
        [0, 2, left],
        [1, 2, right],
      ],
      swap,
    );
    const A = legion(),
      D = legion(1, 1);
    f.sc.legions = [A, D];
    field(f, A, D);
    assert.equal(A.targetCity, expected);
    assert.equal(A.targetNode, expected);
    assert.equal(A.commandState, 8);
    assert.equal(D.commandState, 8);
    assert.deepEqual(
      [A.roadEdgeOrNode, A.roadPointAddress, A.roadStride],
      [0x800, 0x2000, -4],
    );
    assert.equal(A.moveDelay, 1);
    assert.equal(f.rngCalls(), 0);
  }
});

test("487B endpoint collapse/owner order, capital may already be foreign", async () => {
  for (const [source, target, expected] of [
    [0, 1, 0],
    [1, 0, 1],
    [1, 1, null],
  ]) {
    const f = await fixture();
    f.sc.cities[0].faction = source;
    f.sc.cities[1].faction = target;
    const reads = [];
    for (const id of [0, 1]) {
      const value = f.sc.cities[id].faction;
      Object.defineProperty(f.sc.cities[id], "faction", {
        get: () => {
          reads.push(id);
          return value;
        },
      });
    }
    const result = rawQuery(f, 0x800);
    assert.deepEqual(reads.slice(0, 2), [0, 1]);
    assert.equal(result.cf, expected === null);
    if (expected === null) assert.deepEqual(f.memory.snapshot().patches, []);
    else assert.equal(result.bx, expected * 32);
  }
  const f = await fixture();
  f.sc.cities[2].faction = 1;
  const A = legion();
  assert.equal(continueLegionAfterBattle(f.sc, A, false), true);
  assert.equal(A.targetCity, 0); // high cost isn't a CF/friendly-capital gate.
});

test("4761 uses raw node even at conflicting coordinates; lost node uses next hop", async () => {
  const f = await fixture();
  const home = legion(0, 0, 0);
  home.x = 190;
  assert(continueLegionAfterBattle(f.sc, home, false));
  assert.equal(home.targetCity, 9);
  assert.deepEqual(f.memory.snapshot().patches, []);
  const edge = legion();
  edge.x = 0;
  edge.y = 1;
  assert(continueLegionAfterBattle(f.sc, edge, false));
  assert.equal(edge.targetCity, 0);
  f.sc.cities[0].faction = 1;
  const lost = legion(2, 0, 0);
  assert(continueLegionAfterBattle(f.sc, lost, false));
  assert.equal(lost.targetCity, 2);
  assert.equal(lost.commandState, 10);
});

test("487B shortcut preserves old queue and AX itself shifts; FF has partial ABI", async () => {
  const f = await fixture();
  f.memory.writeByte(0x8000, 0);
  f.memory.writeByte(0x8bff, 0xa5);
  for (const [capital, current, cx] of [
    [0, 0x800, 0],
    [1, 0x800, 0],
    [2, 16, 16],
  ]) {
    f.sc.factions[0].capital = capital;
    const before = f.memory.snapshot();
    const result = rawQuery(f, current);
    assert.deepEqual(result, {
      ax: capital * 32,
      bx: capital * 32,
      cx,
      cf: false,
      reason: "shortcut",
    });
    assert.deepEqual(f.memory.snapshot(), before);
  }
  const deny = () => {
    throw new Error("must not read");
  };
  const noCapital = retreatOriginalRoadMemory({
    readFactionByte: () => 3,
    readCapitalByte: () => 255,
    readCurrentWord: deny,
    readGraphByte: deny,
    writeGraphByte: deny,
    readStateByte: deny,
  });
  assert.deepEqual(noCapital, { bx: 192, cf: true, reason: "no-capital" });
  assert(!Object.hasOwn(noCapital, "ax"));
  assert(!Object.hasOwn(noCapital, "cx"));
});

test("487B literal exhaustion zero maps city0, AX5 bridge rejects after search writes", async () => {
  const f = await fixture([[0, 1, 1]]);
  f.sc.factions[0].capital = 2;
  f.sc.cities[0].faction = 1;
  const empty = legion(0, 0, 0);
  assert(continueLegionAfterBattle(f.sc, empty, false));
  assert.equal(empty.targetCity, 0);
  f.sc.cities[0].faction = 0;
  f.sc.factions[0].capital = 0;
  f.sc.cities[2].faction = 1;
  assert.deepEqual(rawQuery(f, 16), {
    ax: 20,
    bx: 20,
    cx: 0,
    cf: false,
    reason: "exhausted",
  });
  const A = legion(0, 0, 16),
    D = legion(1, 1);
  f.sc.legions = [A, D];
  assert.throws(() => field(f, A, D), /Uncovered.*city return: 20/);
  assert.equal(A.moveDelay, 1);
  assert.equal(A.targetCity, 9);
  assert.equal(A.commandState, 3);
  assert.equal(A.target, null);
  assert.equal(D.targetCity, 9); // both results settled first.
  assert.equal(D._markerFrame, 4);
  assert.equal(D.moveDelay, 7); // no defender 474A after error.
  assert.equal(f.memory.readByte(0x8802), 5);
  assert.equal(f.rngCalls(), 0);
  assert.equal(f.messages.length, 0);
});

test("siege loss commits both precomputed sides before attacking native exception", async () => {
  // 5180/5189 -> 51B3 writes both six-team results, totals and morale
  // before 5192 invokes attacker 474A; defender 474A is later at 51A1.
  const f = await fixture([
    [0, 1, 20],
    [2, 3, 1],
  ]);
  f.sc.cities[1].faction = 1;
  const A = legion(),
    D = legion(1, 1, 8);
  D.troops = 600;
  D.units = Array.from({ length: 6 }, () => ({ type: 3, troops: 1000 }));
  f.sc.legions = [A, D];
  const city = f.sc.cities[1];
  const sides = [side(145), side(137)];
  const phaseBefore = [D.moveDelay, D.movePeriod, D.commandState];
  const countersBefore = json(f.sc.legionSlotCounters);
  const countsBefore = f.sc.factions.map((faction) => faction.n_legions);
  f.memory.writeByte(0x8bff, 0xa5);

  assert.throws(
    () =>
      applyBattleResult(
        f.app,
        A,
        city,
        "def",
        360,
        null,
        null,
        null,
        D,
        360,
        null,
        { defenders: [D], sides, oldFaction: 1 },
      ),
    /Uncovered.*city return: 20/,
  );
  assert.equal(D.troops, 360);
  assert.equal(D.morale, 137);
  assert.deepEqual(
    D.units,
    sides[1].units.map((unit) => ({
      type: unit.type,
      troops: unit.troops * 10,
    })),
  );
  assert.equal(D._markerFrame, 4);
  assert.deepEqual([D.moveDelay, D.movePeriod, D.commandState], phaseBefore);
  assert.equal(A.troops, 360);
  assert.equal(A.morale, 145);
  assert.equal(A.moveDelay, 1);
  assert.equal(A.target, null);
  assert.deepEqual([A.targetNode, A.targetCity, A.commandState], [9, 9, 3]);
  assert.deepEqual([D.targetNode, D.targetCity], [9, 9]);
  assert.equal(city.faction, 1);
  assert.deepEqual(f.sc.legionSlotCounters, countersBefore);
  assert.deepEqual(
    f.sc.factions.map((faction) => faction.n_legions),
    countsBefore,
  );
  assert.equal(f.memory.readByte(0x8802), 5);
  assert.equal(f.memory.readByte(0x8bff), 0xa5);
  assert.equal(f.rngCalls(), 0);
  assert.equal(f.messages.length, 0);
});

test("474A early gates preserve phase prefix without touching missing road fields", async () => {
  const f = await fixture();
  for (const [morale, first, won, expected] of [
    [0, 600, false, false],
    [150, 0, false, false],
    [150, 600, true, true],
  ]) {
    const A = legion();
    A.morale = morale;
    A.units[0].troops = first;
    delete A.roadEdgeOrNode; // 6FD2 still requires L01/F3E before early gates.
    assert.equal(continueLegionAfterBattle(f.sc, A, won), expected);
    assert.equal(A.moveDelay, 1);
  }
  assert.deepEqual(f.memory.snapshot().patches, []);
  const A = legion();
  delete A.roadEdgeOrNode;
  assert.throws(
    () => continueLegionAfterBattle(f.sc, A, false),
    /Uncovered.*current word/,
  );
  assert.equal(A.moveDelay, 1);
  f.sc.factions[0].capital = undefined;
  assert.throws(
    () => continueLegionAfterBattle(f.sc, legion(), false),
    /Uncovered.*capital/,
  );
  assert.deepEqual(f.memory.snapshot().patches, []);
});

test("persistent Scenario RAM, live owner changes, isolated owner and formal JSON continue", async () => {
  const f = await fixture(),
    other = await fixture();
  f.memory.writeByte(0x8bff, 0xa5);
  f.memory.writeByte(0x8c00, 0);
  const A = legion();
  // P58 fresh v2 owns the fixed 128-slot table; install this synthetic
  // active record into that authority rather than mutating its live view.
  f.sc.nativeLegionSlots.records[0] = A;
  rebindNativeLegionViews(f.sc);
  assert(continueLegionAfterBattle(f.sc, A, false));
  assert.equal(A.targetCity, 0);
  f.sc.cities[0].faction = 1;
  assert(continueLegionAfterBattle(f.sc, A, false));
  assert.equal(A.targetCity, 1);
  assert.equal(getScenarioRoadMemory(f.sc), f.memory);
  assert.equal(f.memory.readByte(0x8bff), 0xa5);
  assert.equal(f.memory.readByte(0x8c00), 0);
  assert.throws(() => f.memory.readByte(0x8c01), /Unprovided/);
  assert.deepEqual(other.memory.snapshot().patches, []);
  const beforeSave = f.memory.snapshot();
  const saved = json(snapshotState(f.app, 0, "native"));
  for (const projection of [
    {
      currentNode: null,
      targetX: 2,
      targetY: 1,
      edgeId: 0,
      pointIndex: 0,
      points: [],
    },
    {
      currentNode: 190,
      targetNode: 190,
      edgeId: 99,
      stride: 0,
      targetX: -1,
      points: [{ x: -1 }],
    },
  ]) {
    A._march = projection;
    assert.deepEqual(json(snapshotState(f.app, 0, "native")), saved);
    assert.deepEqual(f.memory.snapshot(), beforeSave);
  }
  delete A._march;
  assert.deepEqual(saved.webMeta.legionRuleState, []);
  const restored = await prepareScenario({
    ...f,
    raw: restoreSnapshotState(saved),
    mode: "restore",
    metadata: saved.webMeta.scenarioAssembly,
    roadMemory: saved.webMeta.roadMemory,
  });
  const B = restored.scenario.legions[0];
  f.sc.cities[0].faction = restored.scenario.cities[0].faction = 0;
  assert(continueLegionAfterBattle(f.sc, A, false));
  assert(continueLegionAfterBattle(restored.scenario, B, false));
  assert.equal(A.targetCity, B.targetCity);
  assert.deepEqual(
    f.memory.snapshot(),
    getScenarioRoadMemory(restored.scenario).snapshot(),
  );
  assertPlayableScenario(restored); // P58 flip: v2 enters play
  admitSavedScenario(saved, f.app); // P58 flip: v2 save admitted
});

test("engineering error in second field continuation keeps first slot and both battle writes", async () => {
  const f = await fixture();
  const A = legion(),
    D = legion(1, 1);
  // Real defender victory: attack search precedes the winner's 6FD2 phase gate.
  const invalidDefence = side();
  invalidDefence.units[0].type = 256;
  assert.throws(
    () => field(f, A, D, "def", [side(), invalidDefence]),
    /Uncovered type at 6FE0/,
  );
  assert.equal(A.targetCity, 0);
  assert.equal(A.commandState, 8);
  assert(A._retreat);
  assert.equal(D._markerFrame, 4);
  assert.equal(D.moveDelay, 7);
  assert.equal(D.commandState, 3);
  assert.equal(f.rngCalls(), 0);
  assert.equal(f.messages.length, 0);
  assert.equal(f.memory.readByte(0x8802), 7);
});

test("4DA4 leaf uses original BP[0] once, includes retired member and preserves commands", async () => {
  const f = await fixture();
  const A = legion(5, 1),
    representative = legion(0),
    primary = legion(2, 0, 0);
  const retired = legion(1);
  retired.status = 8;
  retired.dead = true;
  retired._active = false;
  const city = f.sc.cities[0];
  const group = [representative, retired, primary];
  f.sc.cities[1].faction = 0;
  f.sc.cities[10].faction = 1;
  let queries = 0;
  const current = representative.roadEdgeOrNode;
  Object.defineProperty(representative, "roadEdgeOrNode", {
    get: () => {
      queries++;
      return current;
    },
  });
  const preserved = group.map((L) => [
    L.roadPointAddress,
    L.roadStride,
    L.commandState,
    L.movePeriod,
    L.engagementCountdown,
  ]);
  primary.commandState = 8; // Explicit prior474A output, not this leaf's write.
  garrisonAt4DA4(f, A, city, group);
  assert.equal(city.faction, 1);
  assert.equal(queries, 1);
  for (const [i, L] of group.entries()) {
    assert.equal(L.targetCity, 1);
    assert.equal(L.targetNode, 1);
    assert.equal(L.moveDelay, 1);
    assert.deepEqual(
      [L.roadPointAddress, L.roadStride, L.commandState, L.movePeriod],
      [
        preserved[i][0],
        preserved[i][1],
        L === primary ? 8 : preserved[i][2],
        preserved[i][3],
      ],
    );
    if (L !== primary) assert.equal(L.engagementCountdown, preserved[i][4]);
  }
  assert.equal(retired.status, 10);
  assert.equal(retired.dead, true);
  assert.equal(f.rngCalls(), 0);
});

test("4DA4 CF missing-table rejection holds and preserves prefix; domain exception never dispatches", async () => {
  for (const domain of [false, true]) {
    const f = await fixture();
    // This test deliberately pins the missing-table boundary. P58 fresh v2
    // now initializes the real table, so remove it explicitly for the fault.
    delete f.sc.nativeLegionSlots;
    const A = legion(5, 1),
      B = legion(0),
      C = legion(1);
    f.sc.legions = [A, B, C];
    f.sc.factions[0].n_legions = 2;
    f.sc.generals = [0, 1].map((idx) => ({
      idx,
      faction: 0,
      status: 1,
      attr: 0,
      active: true,
    }));
    // Inject missing/FF capital at the actual BP query with explicit prior owner state.
    Object.defineProperty(B, "roadEdgeOrNode", {
      get: () => {
        throw new Error("should not read after FF");
      },
    });
    const city = f.sc.cities[0];
    let statusReads = 0;
    Object.defineProperty(B, "faction", {
      get: () => {
        statusReads++;
        f.sc.factions[0].capital = domain ? undefined : null;
        return 0;
      },
    });
    if (domain) {
      assert.throws(
        () => garrisonAt4DA4(f, A, city, [B, C]),
        /Uncovered.*capital/,
      );
      // Bare leaf has no outer battle owner; the fate dispatcher was never
      // entered, so its missing-table exception/failure hold cannot appear.
      assert.equal(f.app._strategicBattleFailure, undefined);
      assert.equal(f.app.clock.hold, undefined);
    } else {
      assert.throws(
        () => garrisonAt4DA4(f, A, city, [B, C]),
        /Uncovered native fixed-slot table at 291A/,
      );
      assert.match(
        f.app._strategicBattleFailure.error.message,
        /fixed-slot table/,
      );
      assert.equal(f.app.clock.hold, true);
      assert.equal(canSnapshotState(f.app), false);
      assert.throws(() => snapshotState(f.app, 0, "blocked"), /cannot save/);
    }
    assert.equal(Object.hasOwn(f.sc, "nativeLegionSlots"), false);
    assert.equal(B.status, 0xc4);
    assert.equal(C.status, 0xc4);
    assert.equal(f.sc.factions[0].n_legions, 2);
    assert.deepEqual(
      f.sc.generals.map((g) => [g.faction, g.status]),
      [
        [0, 1],
        [0, 1],
      ],
    );
    assert.equal(f.sc._lastCapturingFaction, undefined); // No post-4DA4 tail.
    assert(statusReads > 0);
    assert.equal(city.faction, 1);
    assert.equal(A.commandState, 3); // Leaf never touches the attacking legion.
    assert.equal(f.rngCalls(), 0);
    assert.deepEqual(f.memory.snapshot().patches, []);
  }
});

// Explicit synthetic native inputs, not inferred initialization or a live-array
// repair. 487B:48B5..490B sees both edge endpoints foreign AFTER city0 capture.
// 4DA7/4DAD preserve the new city's owner across that query, then 4DE5 calls
// 291A in the original BP order even as each status write rebinds live views.
async function nativeGarrisonFixture(
  rngByte = 127,
  player = 23,
  lastCity = false,
) {
  const f = await fixture(undefined, false, 2, {
    rngByte,
    movementMemory: { version: 1, spans: [{ address: 38500, hex: "0201" }] },
    change(sc) {
      sc.player_faction = player;
      sc.nativeFateDisplayFlags = 0;
      sc.generals = Array.from({ length: 6 }, (_, idx) => ({
        idx,
        faction: idx === 5 ? 1 : 0,
        origFaction: null,
        status: 1,
        attr: 0x80,
        active: true,
        battle_rating: 0,
        talk_idx: 0,
      }));
      const B = legion(0),
        C = legion(1),
        A = legion(5, 1);
      for (const L of [B, C, A]) {
        L.occupancyOffset = L === A ? 101 : 100;
        L.occupancyRowParagraph = 2400;
        L.x = L.occupancyOffset;
      }
      // Different L02 values prove capture/return use same-slot generals.
      B.generalIdx = 3;
      C.generalIdx = 4;
      sc.nativeLegionSlots = { version: 1, records: [B, C, A] };
      sc.legionSlotCounters[0] = 77;
      sc.legionSlotCounters[1] = 31;
      sc.factions[0].n_legions = 2;
      sc.factions[1].n_legions = 1;
      for (const F of sc.factions) {
        F.attr = 0x80;
        F.nativeGeneralCount = 10;
      }
      sc.cities[1].faction = 1;
      sc.cities[10].faction = 1;
      if (lastCity) {
        sc.factions[0].capital = null; // Explicit prior4DF0 no-capital result.
        for (const city of sc.cities) if (city.idx !== 0) city.faction = 1;
      }
    },
  });
  const [B, C, A] = f.sc.nativeLegionSlots.records;
  return { ...f, A, B, C, movement: scenarioNativeRoadContext(f.sc).movement };
}

test("4DA4 native CF dispatch preserves capturing owner and continues the original BP list", async () => {
  for (const returning of [false, true]) {
    const f = await nativeGarrisonFixture(returning ? 0 : 127);
    const { A, B, C } = f;
    const roads = [B, C].map((L) => [
      L.roadEdgeOrNode,
      L.roadPointAddress,
      L.roadStride,
    ]);
    let queries = 0;
    Object.defineProperty(B, "roadEdgeOrNode", {
      enumerable: true,
      get: () => {
        queries++;
        return 0x800;
      },
    });
    garrisonAt4DA4(f, A, f.sc.cities[0], [B, C]);
    assert.equal(queries, 1); // No second BP query / live-array rescan.
    assert.equal(f.sc.cities[0].faction, 1);
    assert.equal(f.sc.factions[0].capital, 2);
    assert.equal(A.commandState, 3);
    assert.deepEqual(f.sc.legions, [A]);
    assert.deepEqual(f.sc.delayedLegionReturns, returning ? [B, C] : []);
    assert.deepEqual([B.status, C.status], returning ? [8, 8] : [0, 0]);
    assert.deepEqual(
      f.sc.legionSlotCounters.slice(0, 2),
      returning ? [48, 48] : [77, 31],
    );
    assert.deepEqual(
      [B, C].map((L) => [L.roadEdgeOrNode, L.roadPointAddress, L.roadStride]),
      roads,
    );
    assert.deepEqual(
      [B, C].map((L) => [
        L.commandState,
        L.moveDelay,
        L.targetCity,
        L.targetNode,
      ]),
      [
        [3, 7, 9, 9],
        [3, 7, 9, 9],
      ],
    );
    assert.deepEqual(
      f.sc.generals
        .slice(0, 2)
        .map((G) => [G.faction, G.origFaction, G.status]),
      returning
        ? [
            [0, null, 1],
            [0, null, 1],
          ]
        : [
            [1, 0, 4],
            [1, 0, 4],
          ],
    );
    assert.deepEqual(
      f.sc.generals.slice(3, 5).map((G) => G.status),
      [1, 1],
    );
    assert.deepEqual(
      f.sc.factions.map((F) => F.n_legions),
      [0, 1],
    );
    assert.deepEqual(
      f.sc.factions.map((F) => F.nativeGeneralCount),
      [returning ? 10 : 8, 10],
    );
    assert.equal(f.movement.readByte(2400, 100), 0);
    assert.equal(f.movement.readByte(2400, 101), 1);
    assert.throws(() => f.movement.readByte(2400, 99), /Uncovered/);
    assert.equal(f.rngCalls(), 2);
    assert.equal(f.messages.length, 0);
    assert.deepEqual(f.memory.snapshot().patches, []);
    assert.equal(f.sc.factions[0]._extinctionHandled, undefined);
    assert.equal(f.sc._lastCapturingFaction, undefined); // No outer capture tail was executed.
    assert.equal(f.app._strategicBattleFailure, undefined);
    assert.equal(canSnapshotState(f.app), true);
    // Real JSON snapshot/restore keeps the sparse unique slots, not L02 views.
    const restored = restoreSnapshotState(
      json(snapshotState(f.app, 0, "4DA4")),
    );
    assert.deepEqual(
      restored.nativeLegionSlots.records.map((L) => [L.slot, L.status]),
      [
        [0, returning ? 8 : 0],
        [1, returning ? 8 : 0],
        [5, A.status],
      ],
    );
    assert.deepEqual(
      restored.legionSlotCounters.slice(0, 2),
      f.sc.legionSlotCounters.slice(0, 2),
    );
  }
});

test("4DA4 native player-message boundary stops before the next BP member; no outer capture tail", async () => {
  for (const [rngByte, player, talk] of [
    [127, 0, 33],
    [127, 1, 34],
    [0, 0, 31],
    [0, 1, 32],
  ]) {
    const f = await nativeGarrisonFixture(rngByte, player);
    const { A, B, C } = f;
    assert.throws(
      () => garrisonAt4DA4(f, A, f.sc.cities[0], [B, C]),
      new RegExp(`TALK${talk}`),
    );
    assert.equal(f.sc.cities[0].faction, 1);
    assert.equal(A.commandState, 3);
    assert.equal(B.status, rngByte ? 0 : 8);
    assert.equal(C.status, 0xc4);
    assert.equal(f.sc.legionSlotCounters[1], 31);
    assert.equal(f.sc.generals[1].status, 1);
    assert.equal(f.sc.factions[0].n_legions, 1);
    assert.equal(f.sc.factions[0].nativeGeneralCount, rngByte ? 9 : 10);
    assert.equal(f.movement.readByte(2400, 100), 1);
    assert.equal(f.rngCalls(), 1);
    assert.equal(f.messages.length, 0); // No fake FIFO/callee RET.
    assert.equal(f.sc._lastCapturingFaction, undefined);
    assert.equal(f.app.clock.hold, true);
    assert.equal(canSnapshotState(f.app), false);
    assert.throws(() => snapshotState(f.app, 0, "blocked"), /cannot save/);
  }
});

test("4DA4 native capitalFF leaf captures both BP slots with zero RNG, not outer4FCE success", async () => {
  const f = await nativeGarrisonFixture(127, 23, true);
  const { A, B, C } = f;
  garrisonAt4DA4(f, A, f.sc.cities[0], [B, C]);
  assert.equal(f.sc.cities[0].faction, 1);
  assert.equal(f.sc.factions[0].capital, null);
  assert.equal(A.commandState, 3);
  assert.deepEqual([B.status, C.status], [0, 0]);
  assert.deepEqual(
    f.sc.generals.slice(0, 2).map((G) => [G.faction, G.origFaction, G.status]),
    [
      [1, 0, 4],
      [1, 0, 4],
    ],
  );
  assert.deepEqual(
    f.sc.generals.slice(3, 5).map((G) => G.status),
    [1, 1],
  );
  assert.equal(f.sc.factions[0].n_legions, 0);
  assert.equal(f.sc.factions[0].nativeGeneralCount, 8);
  assert.equal(f.movement.readByte(2400, 100), 0);
  assert.equal(f.rngCalls(), 0); // FF before monarch/L02/RNG gates.
  assert.equal(f.messages.length, 0);
  assert.equal(f.sc.factions[0]._extinctionHandled, undefined);
  assert.equal(f.app.clock.hold, undefined);
  assert.equal(canSnapshotState(f.app), true); // Completed leaf only; no4FCE RET claim.
});

test("unbound RAM, explicit v2 markers and invalid identity reject, never default v1", async () => {
  const f = await fixture();
  const unbound = new Scenario(structuredClone(f.raw));
  initializeScenarioRoadMemory(
    unbound,
    f.world,
    f.content.chapter(0).reference,
  );
  const A = legion();
  assert.throws(
    () => continueLegionAfterBattle(unbound, A, false),
    /assembly identity/,
  );
  assert.equal(A.moveDelay, 7); // engineering ownership rejects before native6FD2.
  const marked = new Scenario(structuredClone(f.raw));
  marked.roadVersion = 2;
  assert.throws(
    () => continueLegionAfterBattle(marked, legion(), false),
    /Misplaced/,
  );
  f.manifest.revision = "mismatched";
  assert.throws(
    () => continueLegionAfterBattle(f.sc, legion(), false),
    /identity/,
  );
});

test("unknown graph read retains search/prefix writes and skips fate", async () => {
  const f = await fixture();
  // Runtime graph corruption, not an asset rejected before search: root tag
  // points to edge whose opposite is unprovided high-half memory.
  f.memory.writeByte(0x816, 0);
  f.memory.writeByte(0x817, 0x90);
  const A = legion(),
    D = legion(1, 1);
  assert.throws(() => field(f, A, D), /Unprovided/);
  assert.equal(A.moveDelay, 1);
  assert.equal(A.commandState, 3);
  assert.equal(A.targetCity, 9);
  assert.equal(f.memory.readByte(0x8010), 1);
  assert.equal(f.rngCalls(), 0);
});

test("geometry/render inputs never write workspace; synthetic v1 graphs rejected; unbound snapshots admit with null metadata", async () => {
  const f = await fixture();
  rawQuery(f, 0x800);
  const before = f.memory.snapshot();
  f.world.roads.roadNodeAt(0, 1);
  f.world.roads.roadNodeById(2);
  f.world.roads.roadEdgeById(0);
  f.world.roads.roadApproachesAt(0, 2);
  f.world.terrain.roadOffset(0, 2);
  f.world.terrain.terrainTile(0, 2);
  assert.deepEqual(f.memory.snapshot(), before);
  // P76 gate: v1 owners are unconstructible; fresh preparation against a
  // synthetic v1 graph fails closed (P24 no-old-save-compat policy).
  await assert.rejects(fixture(undefined, false, 1), /must be v2/);
  // prepareScenario clones raw, so the pre-prepare raw scenario stays
  // unbound. Snapshots of it are taken against a fresh (road-unloaded)
  // world: the fixture world now carries loaded v2 roads, and unbound
  // scenarios under a v2-loaded world correctly reject (P58 downgrade
  // guard). Unbound snapshots carry no road memory and admit null.
  const bareWorld = createWorldResources();
  const bareApp = { ...f.app, scenario: f.raw, world: bareWorld };
  const saved = json(snapshotState(bareApp, 0, "unbound"));
  assert.equal(saved.webMeta.scenarioAssembly, undefined);
  assert.equal(admitSavedScenario(saved, f.app).metadata, null);
  assert.equal(scenarioNativeRoadContext(f.raw), null);
});

test("474A target writes precede late capital-read failure; no speculative command write", async () => {
  const f = await fixture();
  const A = legion();
  let reads = 0;
  Object.defineProperty(f.sc.factions[0], "capital", {
    get: () => (++reads === 1 ? 2 : undefined),
  });
  const writes = [];
  for (const key of ["targetNode", "targetCity", "status", "commandState"]) {
    let value = A[key];
    Object.defineProperty(A, key, {
      get: () => value,
      set: (next) => {
        writes.push(key);
        value = next;
      },
    });
  }
  assert.throws(
    () => continueLegionAfterBattle(f.sc, A, false),
    /Uncovered.*capital/,
  );
  assert.deepEqual(writes, ["targetNode", "targetCity", "status"]);
  assert.equal(A.targetCity, 0);
  assert.equal(A.commandState, 3);
  assert.equal(A.moveDelay, 1);
  assert.equal(f.memory.readByte(0x8802), 7);
});

test("4DA4 per-member write order and partial group failure do not roll back earlier slot", async () => {
  const f = await fixture();
  const A = legion(5, 1),
    B = legion(0),
    C = legion(1);
  const writes = [];
  for (const L of [B, C])
    for (const key of ["targetCity", "targetNode", "moveDelay", "status"]) {
      let value = L[key];
      Object.defineProperty(L, key, {
        get: () => value,
        set: (next) => {
          writes.push(`${L.slot}:${key}`);
          if (L === C && key === "targetNode")
            throw new Error("instrumented target write failure");
          value = next;
        },
      });
    }
  assert.throws(
    () => garrisonAt4DA4(f, A, f.sc.cities[0], [B, C]),
    /instrumented target/,
  );
  assert.deepEqual(writes, [
    "0:targetCity",
    "0:targetNode",
    "0:moveDelay",
    "0:status",
    "1:targetCity",
    "1:targetNode",
  ]);
  assert.equal(B.targetNode, 1);
  assert.equal(B.moveDelay, 1);
  assert.equal(C.targetCity, 1);
  assert.equal(C.targetNode, 9);
  assert.equal(C.moveDelay, 7);
  assert.equal(f.sc.cities[0].faction, 1);
  assert.equal(f.rngCalls(), 0);
});

test("native actual capture commits owner/C1A then governor message prefix or neutral F23 bypass", async () => {
  for (const oldOwner of [0, null]) {
    const f = await nativeGarrisonFixture(127);
    const { A, B, C } = f;
    const city = f.sc.cities[0];
    city.faction = oldOwner;
    city.governor = 3;
    f.sc.factions[0].n_cities = 255;
    f.sc.factions[1].n_cities = 0;
    const beforeCity = json(city);
    const beforeFactions = json(f.sc.factions);
    const beforeGenerals = json(f.sc.generals);
    const beforeDefenders = json([B, C]);
    if (oldOwner === null) {
      assert.throws(
        () =>
          applyBattleResult(
            f.app,
            A,
            city,
            "atk",
            360,
            null,
            null,
            null,
            null,
            null,
            null,
            { defenders: [B, C], sides: [side(145)] },
          ),
        /8A3F/,
      );
    } else {
      // P55-C09-2a: the native branch now suspends at the 4D86 gate
      // (TALK68+1A6 deferred) instead of holding; prefix state matches.
      const result = applyBattleResult(
        f.app,
        A,
        city,
        "atk",
        360,
        null,
        null,
        null,
        null,
        null,
        null,
        { defenders: [B, C], sides: [side(145)] },
      );
      assert.equal(result, "governor-suspended");
      assert.notEqual(f.app._nativeGovernorContinuation, null);
      assert.equal(f.messages.length, 1);
      assert.equal(f.messages[0].talkIndex, 68);
      assert.equal(f.messages[0].personalitySelector, 0x1a6);
      assert.equal(typeof f.messages[0].onComplete, "function");
    }
    assert.equal(A.troops, 360);
    assert.equal(A.morale, 145);
    assert.equal(A.moveDelay, 1);
    assert.equal(A.commandState, 8);
    beforeCity.faction = 1;
    beforeCity._strategicLastFaction = oldOwner === null ? 24 : oldOwner;
    if (oldOwner === null) beforeFactions[1].n_cities = 1;
    else {
      beforeCity.governor = null;
      beforeGenerals[3].status = 0;
    }
    assert.deepEqual(json(city), beforeCity);
    assert.deepEqual(json(f.sc.factions), beforeFactions);
    assert.deepEqual(json(f.sc.generals), beforeGenerals);
    assert.deepEqual(json([B, C]), beforeDefenders);
    assert.equal(f.movement.readByte(2400, 100), 2);
    assert.equal(f.rngCalls(), 0);
    if (oldOwner === null) assert.equal(f.messages.length, 0);
    if (oldOwner === null) {
      assert.equal(f.app.clock.hold, true); // 8A3F failure hold.
    } else {
      // Suspend path: no failure hold (P54 TALK36 pattern — the modal owns
      // the UI hold); the continuation ban is the hard guard, pinned below.
      assert.equal(f.app.clock.hold, undefined);
      assert.equal(f.app._strategicBattleFailure ?? null, null);
    }
    assert.equal(canSnapshotState(f.app), false);
    assert.throws(
      () => snapshotState(f.app, 0, "capture-prefix"),
      /cannot save/,
    );
    assert.throws(
      () => updateFactionAfterCityCapture(f.sc, 0),
      /F23 legacy recomputation/,
    );
    assert.deepEqual(json(f.sc.factions), beforeFactions);
  }
});

test("unbound capture retains its existing owner/live-count path, not native F23 authority", async () => {
  // P76 gate: v1 owners are unconstructible, so the legacy capture branch
  // (applyBattleResult without a bound native context) is pinned on an
  // unbound scenario instead of a synthetic v1 graph. Same dispatch:
  // null context plus no native slots in both cases.
  const f = await fixture(undefined, false, 2, {}, false);
  const A = legion(5, 1);
  const city = f.sc.cities[0];
  f.sc.cities[10].faction = 1;
  applyBattleResult(
    f.app,
    A,
    city,
    "atk",
    360,
    null,
    null,
    null,
    null,
    null,
    null,
    { defenders: [], sides: [side()] },
  );
  assert.equal(city.faction, 1);
  assert.equal(f.sc.factions[1].n_cities, f.sc.citiesOf(1).length);
  assert.equal(f.app.clock.hold, undefined);
});

test("487B raw reader prefix follows faction/capital/current/+6/+8/owners order", async () => {
  const f = await fixture(),
    events = [];
  const context = scenarioNativeRoadContext(f.sc);
  retreatOriginalRoadMemory({
    readFactionByte: () => {
      events.push("faction");
      return 0;
    },
    readCapitalByte: () => {
      events.push("capital");
      return 2;
    },
    readCurrentWord: () => {
      events.push("current");
      return 0x800;
    },
    readGraphByte: (address) => {
      events.push(address);
      return f.memory.readByte(address);
    },
    writeGraphByte: f.memory.writeByte,
    readStateByte: (address) => {
      events.push(`owner:${address}`);
      return context.readCityOwnerByte(address);
    },
  });
  assert.deepEqual(events.slice(0, 10), [
    "faction",
    "capital",
    "faction",
    "current",
    0x806,
    0x807,
    0x808,
    0x809,
    "owner:2113",
    "owner:2145",
  ]);
});

// P24-CAPTURE-1: actual apply caller; KI4CF3..4E5B /4502 /6A3D.
function applyCapture(f, defenders = []) {
  return applyBattleResult(
    f.app,
    f.A,
    f.sc.cities[0],
    "atk",
    360,
    null,
    null,
    null,
    null,
    null,
    null,
    { defenders, sides: [side(145)], oldFaction: 99 },
  ); // stale DTO is not C01.
}
async function captureFixture() {
  const f = await nativeGarrisonFixture(127);
  f.sc.factions[0].n_cities = 0;
  f.sc.factions[1].n_cities = 255;
  return f;
}
function captureHeld(f, instruction) {
  assert.match(
    f.app._strategicBattleFailure.error.message,
    new RegExp(instruction),
  );
  assert.equal(f.app.clock.hold, true);
  assert.equal(canSnapshotState(f.app), false);
  assert.throws(() => snapshotState(f.app, 0, "partial"), /cannot save/);
  assert.equal(f.messages.length, 0);
}

test("4CF3 actual noncapital: old DEC wraps, original BP retires in order, new INC wraps AFTER BP", async () => {
  const f = await captureFixture();
  const originalBP = [f.B, f.C];
  const roads = json(
    originalBP.map((L) => [L.roadEdgeOrNode, L.roadStride, L.roadPointAddress]),
  );
  let reads = 0;
  Object.defineProperty(f.B, "roadEdgeOrNode", {
    enumerable: true,
    configurable: true,
    get() {
      reads++;
      assert.equal(f.sc.cities[0].faction, 1);
      assert.equal(f.sc.cities[0]._strategicLastFaction, 0);
      assert.equal(f.sc.factions[0].n_cities, 255);
      assert.equal(f.sc.factions[1].n_cities, 255); // not incremented yet.
      return 0x800;
    },
  });
  assert.throws(() => applyCapture(f, originalBP), /8A3F/);
  assert.equal(reads, 1);
  Object.defineProperty(f.B, "roadEdgeOrNode", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: 0x800,
  });
  assert.equal(f.sc.factions[1].n_cities, 0);
  assert.deepEqual([f.B.status, f.C.status], [0, 0]);
  assert.deepEqual(f.sc.legions, [f.A]);
  assert.equal(f.sc.nativeLegionSlots.records[0], originalBP[0]);
  assert.equal(f.sc.nativeLegionSlots.records[1], originalBP[1]);
  assert.deepEqual(f.sc.legionSlotCounters.slice(0, 2), [77, 31]);
  assert.deepEqual(
    json(
      originalBP.map((L) => [
        L.roadEdgeOrNode,
        L.roadStride,
        L.roadPointAddress,
      ]),
    ),
    roads,
  );
  assert.equal(f.movement.readByte(2400, 100), 0);
  assert.equal(f.rngCalls(), 2);
  captureHeld(f, "8A3F");
});

test("4CF3 capital CF survives BP: no-capital clears F03/F00 before zero-RNG29C3, then scan stops at uninitialized CFD before newF23", async () => {
  const f = await captureFixture();
  f.sc.factions[0].capital = 0;
  f.sc.factions[0].attr = 0xff;
  for (const city of f.sc.cities) if (city.idx) city.faction = 1;
  // 4FCE scan now runs past4D1E: F00 idempotent, then4FDC CFD read stops
  // (CFD uninitialized in production too; fail-closed scan entry).
  assert.throws(() => applyCapture(f, [f.B, f.C]), /nativePlayerFactionPointer/);
  assert.equal(f.sc.factions[0].capital, null);
  assert.equal(f.sc.factions[0].attr, 0x7f);
  assert.equal(f.sc.factions[0].n_cities, 255);
  assert.equal(f.sc.factions[1].n_cities, 255);
  assert.deepEqual([f.B.status, f.C.status], [0, 0]);
  assert.deepEqual(f.sc.legionSlotCounters.slice(0, 2), [77, 31]);
  assert.equal(f.movement.readByte(2400, 100), 0);
  assert.equal(f.rngCalls(), 0);
  captureHeld(f, "nativePlayerFactionPointer");
});

async function relocationFixture() {
  const f = await captureFixture();
  f.sc.factions[0].capital = 0;
  f.sc.nativePlayerFactionPointer = 0xffff; // legal nonaligned comparison-only word.
  for (const city of f.sc.cities) if (city.idx) city.faction = 1;
  Object.assign(f.sc.cities[2], {
    faction: 0,
    type: 3,
    prod: 65535,
    attr: 0x80,
  });
  // Explicit synthetic fixed slots, never an implementation initializer.
  const records = f.sc.nativeLegionSlots.records;
  for (let slot = 0; slot < 127; slot++)
    if (!records.some((r) => r.slot === slot))
      records.push({ slot, faction: 255, status: 0 });
  records.sort((a, b) => a.slot - b.slot);
  f.B.targetCity = 0;
  f.B.targetNode = 0; // word != new*8: targetCity changes, status/14 do NOT.
  f.B.status = 0xc4;
  f.C.targetCity = 0;
  f.C.targetNode = 2;
  f.C.status = 0xc4;
  return f;
}

test("4DF0/6A3D/4502 actual capital selection keeps unsigned word score, exact127 and reversed14 conditional OR2", async () => {
  const f = await relocationFixture();
  // Better type cannot compensate lower unsigned production; preferred candidate wins ties late.
  Object.assign(f.sc.cities[3], { faction: 0, type: 0, prod: 65534, attr: 0 });
  Object.assign(f.sc.cities[4], { faction: 0, type: 3, prod: 65535, attr: 1 });
  const outside = {
    slot: 127,
    faction: 0,
    status: 0xc4,
    targetCity: 0,
    targetNode: 2,
  };
  f.sc.nativeLegionSlots.records.push(outside);
  const before = json(outside);
  assert.throws(() => applyCapture(f), /8A3F/);
  assert.equal(f.sc.factions[0].capital, 2);
  assert.deepEqual([f.B.targetCity, f.B.targetNode, f.B.status], [2, 0, 0xc4]);
  assert.deepEqual([f.C.targetCity, f.C.targetNode, f.C.status], [2, 0, 0xc6]);
  assert.deepEqual(json(outside), before);
  assert.equal(f.sc.factions[1].n_cities, 0);
  assert.equal(f.rngCalls(), 0);
  captureHeld(f, "8A3F");
});

test("4DF0 player comparison uses independent CFD word; message stops AFTER capital/4502, BEFORE BP/newF23", async () => {
  const f = await relocationFixture();
  f.sc.nativePlayerFactionPointer = 0; // CFF remains23.
  assert.throws(() => applyCapture(f, [f.B, f.C]), /4E3A/);
  assert.equal(f.sc.factions[0].capital, 2);
  assert.deepEqual([f.C.targetCity, f.C.targetNode, f.C.status], [2, 0, 0xc6]);
  assert.equal(f.sc.factions[1].n_cities, 255);
  assert.equal(f.movement.readByte(2400, 100), 2);
  assert.equal(f.rngCalls(), 0);
  captureHeld(f, "4E3A");
});

test("4CF3 unknown reads preserve instruction prefixes without preflight or later effects", async () => {
  for (const [field, at] of [
    ["governor", "4D63"],
    ["n_cities", "4D0A"],
    ["capital", "4DFE"],
  ]) {
    const f = await captureFixture();
    delete (field === "governor" ? f.sc.cities[0] : f.sc.factions[0])[field];
    assert.throws(() => applyCapture(f, [f.B, f.C]), new RegExp(at));
    assert.equal(f.sc.cities[0].faction, 1);
    assert.equal(f.sc.cities[0]._strategicLastFaction, 0);
    assert.equal(f.sc.factions[1].n_cities, 255);
    if (field === "capital") assert.equal(f.sc.factions[0].n_cities, 255);
    assert.equal(f.movement.readByte(2400, 100), 2);
    assert.equal(f.rngCalls(), 0);
    captureHeld(f, at);
  }
  const f = await captureFixture();
  delete f.sc.factions[1].n_cities;
  assert.throws(() => applyCapture(f, [f.B, f.C]), /4D2A/);
  assert.deepEqual([f.B.status, f.C.status], [0, 0]);
  assert.equal(f.sc.factions[0].n_cities, 255);
  assert.equal(f.rngCalls(), 2);
  captureHeld(f, "4D2A");
});

test("4D63 unknown governor pointer preserves city clear; 4502 late unknown word preserves targetCity", async () => {
  const f = await captureFixture();
  f.sc.cities[0].governor = 128;
  assert.throws(() => applyCapture(f), /4D7E/);
  assert.equal(f.sc.cities[0].governor, null);
  assert.equal(f.sc.factions[0].n_cities, 0);
  const r = await relocationFixture();
  delete r.B.targetNode;
  assert.throws(() => applyCapture(r), /4531/);
  assert.equal(r.sc.factions[0].capital, 2);
  assert.equal(r.B.targetCity, 2);
  assert.equal(r.B.status, 0xc4);
  assert.equal(r.C.targetCity, 0);
  assert.equal(r.sc.factions[1].n_cities, 255);
  captureHeld(r, "4531");
});

test("capture inputs actual JSON preserve own unknowns/word values; invalid present city fields reject, not null coercion", async () => {
  const f = await relocationFixture();
  // Avoid extra synthetic inactive slots being mistaken for completed formation records:
  // snapshot accepts explicit partial inactive state and retains missing own fields.
  delete f.sc.cities[0]._strategicLastFaction;
  delete f.sc.cities[5].type;
  const saved = json(snapshotState(f.app, 0, "capture-input"));
  const restored = restoreSnapshotState(saved);
  assert.equal(restored.cities[2].prod, 65535);
  assert.equal(restored.nativePlayerFactionPointer, 65535);
  assert.equal(
    Object.hasOwn(restored.cities[0], "_strategicLastFaction"),
    false,
  );
  assert.equal(Object.hasOwn(restored.cities[5], "type"), false);
  for (const [field, bad] of [
    ["prod", 65536],
    ["type", 16],
    ["_strategicLastFaction", NaN],
    ["attr", undefined],
  ]) {
    const before = Object.getOwnPropertyDescriptor(f.sc.cities[2], field);
    f.sc.cities[2][field] = bad;
    assert.throws(() => snapshotState(f.app, 0, "invalid"));
    if (before) Object.defineProperty(f.sc.cities[2], field, before);
    else delete f.sc.cities[2][field];
    const invalid = structuredClone(saved);
    invalid.state.cities[2][field] = bad;
    assert.throws(() => restoreSnapshotState(invalid));
  }
});

test("4CF3 all256 stored F23 bytes wrap independently; same-owner DEC/INC cancels without recount", async () => {
  for (let value = 0; value < 256; value++) {
    const f = await captureFixture();
    f.sc.factions[0].n_cities = value;
    f.sc.factions[1].n_cities = value;
    assert.throws(() => applyCapture(f), /8A3F/);
    assert.equal(f.sc.factions[0].n_cities, (value - 1) & 255);
    assert.equal(f.sc.factions[1].n_cities, (value + 1) & 255);
  }
  const f = await captureFixture();
  f.sc.cities[0].faction = 1;
  assert.throws(() => applyCapture(f), /8A3F/);
  assert.equal(f.sc.factions[1].n_cities, 255);
  assert.equal(f.sc.factions[0].n_cities, 0);
});

test("4DF0 source scan negatives: ignored foreign missing fields, later equal preferred wins, missing matching word stops before capital write", async () => {
  const f = await relocationFixture();
  // Equal preferred at later index replaces; type remains subordinate to BOTH comparisons.
  Object.assign(f.sc.cities[4], {
    faction: 0,
    type: 3,
    prod: 65535,
    attr: 0x80,
  });
  assert.throws(() => applyCapture(f), /8A3F/);
  assert.equal(f.sc.factions[0].capital, 4);
  const unknown = await relocationFixture();
  delete unknown.sc.cities[2].prod;
  assert.throws(() => applyCapture(unknown), /6A5F/);
  assert.equal(unknown.sc.cities[0].faction, 1);
  assert.equal(unknown.sc.factions[0].n_cities, 255);
  assert.equal(unknown.sc.factions[0].capital, 0);
  assert.equal(unknown.B.targetCity, 0);
  captureHeld(unknown, "6A5F");
});

test("4CF3 injected write failure holds committed owner without rollback; governor path never prereads F03", async () => {
  const f = await captureFixture();
  const failure = new Error("injected C1A store");
  Object.defineProperty(f.sc.cities[0], "_strategicLastFaction", {
    set() {
      throw failure;
    },
  });
  assert.throws(
    () => applyCapture(f),
    (error) => error === failure,
  );
  assert.equal(f.sc.cities[0].faction, 1);
  assert.equal(f.sc.factions[0].n_cities, 0);
  assert.equal(f.sc.factions[1].n_cities, 255);
  assert.equal(f.app._strategicBattleFailure.error, failure);
  assert.equal(canSnapshotState(f.app), false);
  const governor = await captureFixture();
  governor.sc.cities[0].governor = 3;
  Object.defineProperty(governor.sc.factions[0], "capital", {
    get() {
      assert.fail("4DFE has not been reached");
    },
  });
  // P55-C09-2a: the governor gate now suspends (TALK68+1A6 deferred with a
  // continuation) instead of the historic 4D86 hold; 4DFE stays unreached.
  const suspended = applyCapture(governor);
  assert.equal(suspended, "governor-suspended");
  assert.notEqual(governor.app._nativeGovernorContinuation, null);
  assert.equal(governor.messages.length, 1);
  assert.equal(governor.messages[0].talkIndex, 68);
  assert.equal(governor.sc.generals[3].status, 0);
  assert.equal(governor.sc.factions[0].n_cities, 0);
});
