// Synthetic original-byte goldens: KI 487B..491A, 474A..47BA, 4DA4..4DEF.
// See march notes §3.11. No disk, real saves, profile, network or original program.
import assert from "node:assert/strict";
import test from "node:test";
import { createContentCatalog } from "../web/src/content/catalog.js";
import { createWorldResources } from "../web/src/game/worldresources.js";
import { createNewGameScenario, Scenario } from "../web/src/game/world.js";
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
} from "../web/src/game/ai.js";
import {
  snapshotState,
  restoreSnapshotState,
  admitSavedScenario,
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
  };
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
        return 0;
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
function capture(
  f,
  A,
  city,
  defenders,
  primary = null,
  sides = [side(), side()],
) {
  return applyBattleResult(
    f.app,
    A,
    city,
    "atk",
    360,
    null,
    null,
    null,
    primary,
    360,
    null,
    { defenders, sides, oldFaction: city.faction },
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
  f.sc.legions = [A];
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
  assert.equal(saved.webMeta.legionRuleState[0].retreatMarch, null);
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
  assert.throws(() => assertPlayableScenario(restored), /v2.*not connected/);
  assert.throws(() => admitSavedScenario(saved, f.app), /v2.*not connected/);
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

test("real city apply uses original BP[0] once, includes retired member and preserves commands", async () => {
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
  capture(f, A, city, group, primary);
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

test("4DA4 CF failure dispatches with capturing owner; domain exception never dispatches", async () => {
  for (const domain of [false, true]) {
    const f = await fixture();
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
    // Inject the missing/FF capital at the actual BP query, after city/capital writes.
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
      assert.throws(() => capture(f, A, city, [B, C]), /Uncovered.*capital/);
      assert.equal(B.status, 0xc4);
      assert.equal(C.status, 0xc4);
      assert.equal(f.sc.factions[0].n_legions, 2);
    } else {
      capture(f, A, city, [B, C]);
      assert.equal(B.status, 0);
      assert.equal(C.status, 0);
      assert.equal(f.sc.factions[0].n_legions, 0);
      assert.deepEqual(
        f.sc.generals.map((g) => [g.faction, g.origFaction]),
        [
          [1, 0],
          [1, 0],
        ],
      );
    }
    assert(statusReads > 0);
    assert.equal(city.faction, 1);
    assert.equal(A.commandState, 8);
    assert.equal(f.rngCalls(), 0);
    assert.deepEqual(f.memory.snapshot().patches, []);
  }
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

test("geometry/render inputs never write workspace; legacy phase v1 remains admitted", async () => {
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
  const old = await fixture(undefined, false, 1);
  const saved = json(snapshotState(old.app, 0, "v1"));
  delete saved.webMeta.scenarioAssembly;
  assert.equal(admitSavedScenario(saved, old.app).metadata, null);
  assert.equal(scenarioNativeRoadContext(old.sc), null);
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
    () => capture(f, A, f.sc.cities[0], [B, C]),
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
