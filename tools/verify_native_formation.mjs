// I/O: four allowlisted synthetic fetch mocks, pure memory JSON/Clock only.
// Static KI goldens (not CPU execution): march notes §3.15.
import assert from "node:assert/strict";
import test from "node:test";
import { attachSyntheticNativeFactionSource } from "./native_faction_fixture.mjs";
import { createContentCatalog } from "../web/src/content/catalog.js";
import { createWorldResources } from "../web/src/game/worldresources.js";
import { createNewGameScenario } from "../web/src/game/world.js";
import {
  prepareScenario,
  scenarioNativeRoadContext,
  readSavedAssembly,
} from "../web/src/game/scenarioassembly.js";
import {
  snapshotState,
  restoreSnapshotState,
  canSnapshotState,
} from "../web/src/game/savegame.js";
import {
  aiTick,
  applyBattleResult,
  buildArmies,
  continueLegionAfterBattle,
  tickStrategicCity,
} from "../web/src/game/ai.js";
import { OriginalBattleRng } from "../web/src/game/battle/originalrng.js";
import { createStrategicBattleMethods } from "../web/src/app/battleflow.js";
import {
  initializeNativeLegionSlotsFromZeroChapter,
  nativeLegionAt,
  rebindNativeLegionViews,
} from "../web/src/game/nativelegions.js";
import {
  createOriginalLegion,
  redistributeOriginalLegion,
  refreshOriginalLegion,
} from "../web/src/game/navigation/originalformation.js";
const json = (value) => {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    throw new Error("synthetic fixture JSON round-trip failed", {
      cause: error,
    });
  }
};
async function fixture({
  slot = 2,
  terrainMemory = null,
  change = () => {},
} = {}) {
  const graph = {
    version: 2,
    width: 384,
    height: 256,
    nodes: Array.from({ length: 192 }, (_, id) => ({
      id,
      x: id + 1,
      y: 10,
      edgeSlots: [0, 0, 0, 0],
    })),
    edges: [],
  };
  const template = {
    player_faction: 0,
    legions: [],
    generals: Array.from({ length: 128 }, (_, idx) => ({
      idx,
      name: `G${idx}`,
      faction: 1,
      status: 0,
      // Explicit fixed-table inputs for tactical return's 55A6 refresh.
      attr: 0,
      battle_rating: 0,
      ability: { force: idx === slot ? 100 : 0, lead: 0, siege: 0, field: 0, naval: 0 },
    })),
    factions: Array.from({ length: 3 }, (_, idx) => ({
      idx,
      capital: 0,
      n_legions: 0,
      target_faction: 2,
      active: true,
      attr: 0x80,
      money: 1000,
      legion_morale_cap: 200,
      march_marker_style: 51,
      reserve_cav: 100,
      reserve_arc: 100,
      reserve_inf: 100,
      strategic_city_primary: null,
      strategic_city_secondary: null,
    })),
    cities: graph.nodes.map(({ id, x, y }) => ({
      idx: id,
      x,
      y,
      faction: 1,
      attr: 0x80,
      governor: null,
      strategicBorderCount: 0,
      strategicNeighbours: [255, 255, 255, 255],
      strategicThreat: 0,
      growth: 50,
      defence: 50,
      troops_cap: 80,
      troops: 80,
      prod: 10000,
      disaster_event: 0,
      _aiCooldown: 0,
      _strategicLastFaction: 1,
    })),
    diplomacy: Array.from({ length: 24 }, () => Array(24).fill(0)),
  };
  const content = createContentCatalog(
    {
      schemaVersion: 1,
      rules: "ki-1995",
      id: "formation-test",
      revision: "1",
      chapters: [{ id: "chapter", legacyScenarioIndex: 0, official: true }],
    },
    { scenarios: [template] },
  );
  const raw = createNewGameScenario(template);
  initializeNativeLegionSlotsFromZeroChapter(raw);
  for (const city of raw.cities) {
    city._strategicLastFaction = 1;
    city.disaster_event = 0;
  }
  raw.cities[66].strategicBorderCount = 1;
  raw.cities[66].strategicNeighbours = [67, 255, 255, 255];
  raw.cities[67].faction = 2;
  raw.weatherClouds = Array.from({ length: 16 }, () => ({ status: 0 }));
  raw.disasterMapObjects = Array.from({ length: 16 }, () => ({ status: 0 }));
  raw.legionSlotCounters[slot] = 77;
  Object.assign(raw.nativeLegionSlots.records[slot], {
    generalIdx: 99,
    roadStride: -4,
    roadPointAddress: 0x2222,
    markerBase: 17,
  });
  change(raw, graph);
  attachSyntheticNativeFactionSource(raw);
  const world = createWorldResources();
  const args = {
    raw,
    idx: 0,
    content,
    world,
    mode: "fresh",
    // Bounded formation inputs start AFTER loading their synthetic BA plane.
    // Supply that same plane explicitly; these partial city records deliberately
    // lack type and do not model 89F0. Fresh opening has its own full-city tests.
    // Do not add guessed city fields or change any formation/RNG golden.
    terrainMemory: terrainMemory ?? {
      version: 1,
      spans: [{ address: 0, hex: "ba".repeat(384 * 256) }],
    },
    movementMemory: {
      version: 1,
      spans: [{ address: 3840, hex: "00".repeat(768) }],
    },
    cityCache: { version: 1, spans: [{ address: 0, hex: "00".repeat(192) }] },
  };
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
  let sc;
  try {
    sc = (await prepareScenario(args)).scenario;
  } finally {
    globalThis.fetch = old;
  }
  const app = {
    scenario: sc,
    scenarioIdx: 0,
    world,
    content,
    originalRng: new OriginalBattleRng({ ch: 0, cl: 0, dh: 1 }),
    clock: { year: 190, month: 1, day: 1, hold: false },
  };
  return { sc, app, args, context: scenarioNativeRoadContext(sc), slot };
}
const record = (f, slot = f.slot) => nativeLegionAt(f.sc, slot, "test");
const pools = (f) => [
  f.sc.factions[1].reserve_cav,
  f.sc.factions[1].reserve_arc,
  f.sc.factions[1].reserve_inf,
];
const tick = (f, start = 0) =>
  aiTick(f.app, { cityIndex: 66, legionBatchStart: start, settleDaily: true });
async function cold(f) {
  const saved = json(snapshotState(f.app, 0, "formation"));
  const prepared = await prepareScenario({
    ...f.args,
    mode: "restore",
    raw: restoreSnapshotState(saved),
    ...readSavedAssembly(saved),
  });
  const sc = prepared.scenario;
  const next = {
    ...f,
    sc,
    context: scenarioNativeRoadContext(sc),
    app: { ...f.app, scenario: sc },
  };
  next.app.originalRng = new OriginalBattleRng().restore(
    saved.webMeta.originalRng,
  );
  buildArmies(sc);
  return { next, saved };
}

test("native formation: city→6E8F→same-tick arrival→daily→tail→weather", async () => {
  const f = await fixture();
  const original = record(f);
  tick(f);
  assert.equal(f.app._strategicBattleFailure, undefined);
  assert.strictEqual(f.sc.legions[0], original);
  assert.deepEqual(
    original.units.map((u) => u.type),
    [1, 1, 3, 3, 2, 2],
  );
  assert.deepEqual(
    original.units.map((u) => u.troops),
    Array(6).fill(500),
  );
  assert.deepEqual(pools(f), [0, 0, 0]);
  assert.equal(original.status, 0xc4);
  assert.equal(original.generalIdx, 2);
  assert.equal(original.troops, 300);
  assert.equal(original.markerBase, 255);
  assert.equal(original.moveDelay, 3);
  assert.equal(original.targetCity, 66);
  assert.equal(original.targetNode, 66); // handler4/4548, not birth 14=capital.
  assert.equal(original.roadEdgeOrNode, 0);
  assert.equal(original.roadStride, -4);
  assert.equal(original.roadPointAddress, 0x2222);
  assert.equal(original.x, 1); // born this tick did NOT depart.
  assert.equal(f.sc.legionSlotCounters[2], 0);
  assert.equal(original.contactAnimationByte21, 0);
  assert.equal(f.sc.factions[1].money, 990);
  assert.equal(f.sc.factions[1].n_legions, 1);
  assert.equal(f.sc.cities[66]._aiCooldown, 9);
  assert.equal(f.sc.factions[1].strategic_city_primary, 66);
  assert.equal(f.context.movement.readByte(240, 1), 1);
  assert.equal(f.context.cityCache.readByte(0), 0); // no birth cache refresh.
  assert.equal(f.sc._cityTickCursor, 67);
  assert.equal(f.sc._legionBatchCursor, 16);
  assert(canSnapshotState(f.app));
  const { next, saved } = await cold(f);
  assert.deepEqual(saved.state.legions, []);
  assert.equal(
    saved.webMeta.scenarioRuntimeState.delayedLegionReturns,
    undefined,
  );
  assert.equal(
    saved.state.nativeLegionSlots.records[2].engagementCountdown,
    undefined,
  );
  assert.equal(saved.state.nativeLegionSlots.records[2].markerBase, 255);
  assert.strictEqual(next.sc.legions[0], record(next));
  assert.deepEqual(pools(next), pools(f));
  assert.deepEqual(
    next.app.originalRng.snapshot(),
    f.app.originalRng.snapshot(),
  );
  tick(next, 16);
  assert.equal(next.app._strategicBattleFailure, undefined);
  assert.equal(record(next).moveDelay, 3); // unvisited physical slot.
});

test("native formation: residual troops return under newly selected types", async () => {
  const f = await fixture({ slot: 20 });
  record(f).units = [10, 20, 30, 40, 50, 60].map((n) => ({
    type: 3,
    troops: n * 10,
  }));
  tick(f);
  assert.equal(f.app._strategicBattleFailure, undefined);
  assert.deepEqual(
    record(f).units.map((u) => u.troops),
    [650, 650, 850, 850, 1000, 1000],
  );
  assert.deepEqual(pools(f), [0, 10, 0]);
  assert.equal(record(f).troops, 500);
  assert.equal(record(f).moveDelay, 1);
  assert.equal(record(f).targetNode, 0);
  assert.equal(f.sc.legionSlotCounters[20], 77);
  tick(f, 16);
  assert.equal(f.app._strategicBattleFailure, undefined);
  assert.equal(record(f).moveDelay, 3);
  assert.equal(record(f).targetNode, 66);
  assert.equal(f.sc.legionSlotCounters[20], 0);
});

test("native formation: genuine CF1 persists type/L02 prefix, normal caller and cold retry", async () => {
  const f = await fixture();
  Object.assign(f.sc.factions[1], {
    reserve_cav: 50,
    reserve_arc: 0,
    reserve_inf: 0,
  });
  record(f).units.forEach((u) => {
    u.type = 4;
  });
  tick(f);
  assert.equal(f.app._strategicBattleFailure, undefined);
  assert.equal(record(f).generalIdx, 2);
  assert.deepEqual(
    record(f).units.map((u) => u.type),
    [1, 4, 4, 4, 4, 4],
  );
  assert.deepEqual(pools(f), [50, 0, 0]);
  assert.equal(record(f).status, 0);
  assert.equal(f.sc.legionSlotCounters[2], 77);
  assert.equal(f.sc._cityTickCursor, 67);
  assert.equal(f.sc._legionBatchCursor, 16);
  assert.equal(f.sc.factions[1].strategic_city_primary, 66);
  const { next } = await cold(f);
  assert.equal(record(next).units[0].type, 1);
  Object.assign(next.sc.factions[1], {
    reserve_cav: 100,
    reserve_arc: 100,
    reserve_inf: 100,
  });
  tick(next);
  assert.equal(next.app._strategicBattleFailure, undefined);
  assert.equal(record(next).status, 0xc4);
});

test("native formation: each of six eligibility failures retains only preceding type writes", async () => {
  for (let completed = 0; completed < 6; completed++) {
    const f = await fixture();
    Object.assign(f.sc.factions[1], {
      reserve_cav: completed * 50,
      reserve_arc: 0,
      reserve_inf: 0,
    });
    record(f).units.forEach((u) => {
      u.type = 4;
      u.troops = 170;
    });
    const result = createOriginalLegion(f.sc, f.context, 2);
    assert.equal(result.cf, true);
    assert.deepEqual(
      record(f).units.map((u) => u.type),
      [...Array(completed).fill(1), ...Array(6 - completed).fill(4)],
    );
    assert.deepEqual(
      record(f).units.map((u) => u.troops),
      Array(6).fill(170),
    );
    assert.deepEqual(pools(f), [completed * 50, 0, 0]);
    assert.equal(f.sc.generals[2].status, 0);
    assert.equal(record(f).generalIdx, 2);
    assert.equal(f.sc.factions[1].n_legions, 0);
  }
});

test("native formation: active same-slot reuse preserves F14/03/residue and old occupancy", async () => {
  const f = await fixture();
  Object.assign(record(f), {
    status: 0xc0,
    faction: 2,
    dead: true,
    occupancyOffset: 3,
    occupancyRowParagraph: 240,
  });
  f.sc.factions[1].n_legions = 4;
  f.context.movement.writeByte(240, 3, 17);
  f.context.movement.writeByte(240, 1, 255);
  const same = record(f);
  assert.equal(createOriginalLegion(f.sc, f.context, 2).cf, false);
  assert.strictEqual(f.sc.legions[0], same);
  assert.equal(same.dead, false);
  assert.equal(f.sc.factions[1].n_legions, 4);
  assert.equal(f.context.movement.readByte(240, 3), 17);
  assert.equal(f.context.movement.readByte(240, 1), 0);
  assert.equal(f.sc.legionSlotCounters[2], 77);
  assert.equal(same.roadStride, -4);
  assert.equal(same.roadPointAddress, 0x2222);
  assert.equal(f.app.originalRng.calls, 0);
});

test("native formation: state9 competes after city creation, one dispatch, true tail", async () => {
  const f = await fixture();
  const old = record(f, 3);
  Object.assign(old, {
    status: 0xc4,
    faction: 1,
    generalIdx: 3,
    x: 1,
    y: 10,
    commandState: 9,
    moveDelay: 1,
    movePeriod: 3,
    morale: 100,
    troops: 60,
    units: Array.from({ length: 6 }, () => ({ type: 1, troops: 100 })),
  });
  f.sc.generals[3].status = 1;
  f.sc.factions[1].n_legions = 1;
  rebindNativeLegionViews(f.sc);
  tick(f);
  assert.equal(f.app._strategicBattleFailure, undefined);
  assert.equal(record(f).troops, 300);
  assert.equal(old.troops, 60);
  assert.equal(old.commandState, 3); // no immediate NPC handler7.
  assert.equal(old.movePeriod, 2);
  assert.equal(old.moveDelay, 1);
  assert.equal(old.markerBase, 255);
  assert.equal(old.morale, 110);
  assert.equal(f.sc.legionSlotCounters[3], 0);
  assert.equal(f.sc.factions[1].money, 988);
  tick(f);
  assert.equal(f.app._strategicBattleFailure, undefined);
  assert.equal(old.commandState, 11); // next visit NPC six-team >=30 gate.
});

test("native formation: type4 short circuits redistribution but counts in 6FD2", async () => {
  const f = await fixture();
  const a = record(f);
  a.faction = 1;
  a.units = [
    { type: 1, troops: 0 },
    ...Array.from({ length: 5 }, () => ({ type: 4, troops: 200 })),
  ];
  let reads = 0;
  for (const u of a.units.slice(1))
    Object.defineProperty(u, "troops", {
      configurable: true,
      enumerable: true,
      get() {
        reads++;
        return 200;
      },
    });
  redistributeOriginalLegion(f.sc, a);
  assert.equal(reads, 0);
  refreshOriginalLegion(f.sc, a);
  assert.equal(reads, 5);
  assert.equal(a.troops, 200);
  assert.equal(a.movePeriod, 3);
  assert.equal(a.moveDelay, 1);
  assert.equal(f.app.originalRng.calls, 0);
});

test("native formation: 55EC saturation, remainder distribution and strict clipping CF", async () => {
  const f = await fixture();
  const a = record(f);
  a.faction = 1;
  a.units = [1, 1, 1, 4, 4, 4].map((type) => ({ type, troops: 0 }));
  f.sc.factions[1].reserve_cav = 101;
  assert.equal(redistributeOriginalLegion(f.sc, a).cf, true);
  assert.deepEqual(
    a.units.map((u) => u.troops),
    [350, 330, 330, 0, 0, 0],
  );
  a.units = Array.from({ length: 6 }, () => ({ type: 1, troops: 2550 }));
  f.sc.factions[1].reserve_cav = 65535;
  assert.equal(redistributeOriginalLegion(f.sc, a).cf, false);
  assert.equal(f.sc.factions[1].reserve_cav, 0xffdc - 600);
  a.units.forEach((u) => {
    u.troops = 0;
  });
  f.sc.factions[1].reserve_cav = 600;
  assert.equal(redistributeOriginalLegion(f.sc, a).cf, true); // exactly100 is not clipped.
  assert.deepEqual(
    a.units.map((u) => u.troops),
    Array(6).fill(1000),
  );
});

test("native formation: later caller coordinate failure retains completed creation, no governance", async () => {
  const f = await fixture();
  // First read is 6F89; 412B is the second actual capital X consumption.
  let reads = 0;
  Object.defineProperty(f.sc.cities[0], "x", {
    configurable: true,
    get() {
      return ++reads === 1 ? 1 : undefined;
    },
  });
  tick(f);
  assert(f.app._strategicBattleFailure);
  assert.equal(record(f).status, 0xc4);
  assert.deepEqual(pools(f), [0, 0, 0]);
  assert.equal(f.sc.cities[66]._aiCooldown, 0);
  assert.equal(f.sc.factions[1].strategic_city_primary, null);
  assert.equal(f.app.originalRng.calls, 0);
  assert.equal(f.sc._cityTickCursor, undefined);
  assert.equal(f.sc.legionSlotCounters[2], 77);
  assert.equal(canSnapshotState(f.app), false);
});

for (const boundary of ["G1C", "pool2", "status", "occupancy", "style"]) {
  test(`native formation: immediate failure prefix ${boundary}`, async () => {
    const f = await fixture();
    const a = record(f);
    if (boundary === "G1C") delete f.sc.generals[2].faction;
    if (boundary === "pool2") delete f.sc.factions[1].reserve_arc;
    if (boundary === "status") delete a.status;
    if (boundary === "occupancy") f.context = { ...f.context, movement: null };
    if (boundary === "style") delete f.sc.factions[1].march_marker_style;
    assert.throws(() => createOriginalLegion(f.sc, f.context, 2), /Uncovered/);
    assert.equal(a.generalIdx, 2);
    assert.equal(f.sc.legionSlotCounters[2], 77);
    if (["G1C", "pool2"].includes(boundary))
      assert.deepEqual(
        a.units.map((u) => u.type),
        Array(6).fill(0),
      );
    else
      assert.deepEqual(
        a.units.map((u) => u.type),
        [1, 1, 3, 3, 2, 2],
      );
    if (boundary === "status") {
      assert.equal(f.sc.generals[2].status, 1);
      assert.equal(a.faction, 1);
      assert.equal(a.targetCity, 0);
      assert.equal(f.sc.factions[1].n_legions, 0);
    }
    if (["occupancy", "style"].includes(boundary)) {
      assert.strictEqual(f.sc.legions[0], a);
      assert.equal(a.status, 0xc0);
      assert.equal(f.sc.factions[1].n_legions, 1);
      assert.equal(a.occupancyOffset, 1);
      assert.equal(a.occupancyRowParagraph, 240);
    }
    if (boundary === "style") {
      assert.equal(a.troops, 300);
      assert.equal(a.movePeriod, 3);
      assert.equal(a.markerBase, 17);
      assert.equal(a.moveDelay, 0);
    }
    assert.equal(f.app.originalRng.calls, 0);
  });
}

test("native formation: 4717 XCHG precedes unknown pool and type0 alias", async () => {
  const f = await fixture();
  const a = record(f);
  a.faction = 1;
  a.units = Array.from({ length: 6 }, () => ({ type: 1, troops: 100 }));
  a.units[1].type = 2;
  delete f.sc.factions[1].reserve_arc;
  assert.throws(() => redistributeOriginalLegion(f.sc, a), /4735/);
  assert.equal(f.sc.factions[1].reserve_cav, 110);
  assert.deepEqual(
    a.units.map((u) => u.troops),
    [0, 0, 100, 100, 100, 100],
  );
  a.units[0] = { type: 0, troops: 230 };
  assert.throws(
    () => redistributeOriginalLegion(f.sc, a),
    /pool alias type 0 at 4735/,
  );
  assert.equal(a.units[0].troops, 0);
});

test("native formation: native474A strict late style and morale reads", async () => {
  const f = await fixture();
  const a = record(f);
  Object.assign(a, {
    faction: 1,
    moveDelay: 44,
    markerBase: 17,
    units: Array.from({ length: 6 }, () => ({ type: 1, troops: 100 })),
  });
  delete f.sc.factions[1].march_marker_style;
  assert.throws(() => continueLegionAfterBattle(f.sc, a, true), /700F/);
  assert.equal(a.troops, 60);
  assert.equal(a.movePeriod, 2);
  assert.equal(a.moveDelay, 44);
  assert.equal(a.markerBase, 17);
  f.sc.factions[1].march_marker_style = 1;
  delete a.morale;
  assert.throws(() => continueLegionAfterBattle(f.sc, a, true), /4751/);
  assert.equal(a.moveDelay, 1);
  assert.equal(a.markerBase, 5);
});

test("native formation: unknown slot is not empty; native25E5 decrements48→47 without active tail", async () => {
  const f = await fixture();
  f.sc.nativeLegionSlots.records.splice(4, 1);
  tick(f);
  assert(f.app._strategicBattleFailure);
  assert.equal(f.sc._cityTickCursor, 67);
  assert.equal(f.sc._legionBatchCursor, undefined);
  assert.equal(f.sc.legionSlotCounters[2], 0);
  assert.equal(canSnapshotState(f.app), false);
  const g = await fixture();
  record(g, 0).status = 8;
  g.sc.legionSlotCounters[0] = 48;
  tick(g);
  assert.equal(g.app._strategicBattleFailure, undefined);
  assert.equal(g.sc.legionSlotCounters[0], 47);
  assert.equal(record(g, 0).status, 8);
  assert.equal(g.sc._legionBatchCursor, 16);
  assert.equal(g.sc.legionSlotCounters[2], 0); //new active slot receives264A.
});

test("native formation: one success then partial CF1 still returns success and one cooldown", async () => {
  const f = await fixture();
  f.sc.generals[3].ability.force = 90;
  f.sc.factions[1].reserve_cav = 250;
  f.context.cityCache.writeByte(67, 2);
  f.context.movement.writeByte(240, 67, 1); // C18=1 ⇒ requested CL=3.
  tick(f, 16); // creation slots not visited: preserve birth14 and both slot03.
  assert.equal(f.app._strategicBattleFailure, undefined);
  assert.equal(record(f).troops, 400);
  assert.equal(record(f).targetCity, 66);
  assert.equal(record(f).commandState, 0);
  assert.equal(record(f).targetNode, 0);
  assert.equal(record(f, 3).generalIdx, 3);
  assert.deepEqual(
    record(f, 3).units.map((u) => u.type),
    [1, 0, 0, 0, 0, 0],
  );
  assert.equal(record(f, 3).status, 0);
  assert.deepEqual(pools(f), [50, 0, 0]);
  assert.equal(f.sc.factions[1].n_legions, 1);
  assert.equal(f.sc.cities[66]._aiCooldown, 9);
  assert.equal(f.app.originalRng.calls, 3); // one candidate + two governance.
});

test("native formation: cold second expiry consumes original47BB then one road point", async () => {
  const f = await fixture({
    // Synthetic BA formerly read from the mock asset; now explicit current byte.
    terrainMemory: {
      version: 1,
      spans: [{ address: 11 * 384 + 2, hex: "ba" }],
    },
    change: (_raw, graph) => {
      graph.nodes[0].edgeSlots[0] = 0x4800;
      graph.nodes[66].edgeSlots[0] = 0x8800;
      graph.edges.push({
        id: 0,
        source: 0,
        target: 66,
        weight: 1,
        bounds: { minX: 2, maxX: 66, minY: 11, maxY: 11 },
        points: [
          { x: 2, y: 11, flags: 0x44 },
          { x: 66, y: 11, flags: 4 },
        ],
      });
    },
  });
  tick(f);
  const { next } = await cold(f);
  for (let visit = 0; visit < 3; visit++) {
    tick(f);
    tick(next);
  }
  for (const current of [f, next]) {
    assert.equal(current.app._strategicBattleFailure, undefined);
    assert.equal(record(current).x, 2);
    assert.equal(record(current).y, 11);
    assert.equal(record(current).roadEdgeOrNode, 0x800);
    assert.equal(record(current).roadPointAddress, 0x2000);
    assert.equal(record(current).roadStride, 4);
    assert.equal(current.context.movement.readByte(240, 1), 0);
    assert.equal(current.context.movement.readByte(264, 2), 1);
  }
  // Compare the same restore boundary on both sides; unrelated legacy sidecar
  // metadata is materialized by restore, not by the original in-memory fixture.
  assert.deepEqual(
    restoreSnapshotState(json(snapshotState(next.app, 0, "same"))),
    restoreSnapshotState(json(snapshotState(f.app, 0, "same"))),
  );
  assert.deepEqual(
    next.app.originalRng.snapshot(),
    f.app.originalRng.snapshot(),
  );
});

test("native formation: city caller late6FD2 failure holds with visible half-created record", async () => {
  const f = await fixture();
  delete f.sc.factions[1].march_marker_style;
  tick(f);
  assert(f.app._strategicBattleFailure);
  assert.strictEqual(f.sc.legions[0], record(f));
  assert.equal(record(f).status, 0xc0);
  assert.equal(record(f).troops, 300);
  assert.equal(record(f).movePeriod, 3);
  assert.equal(record(f).moveDelay, 0);
  assert.equal(f.sc.legionSlotCounters[2], 77);
  assert.equal(f.sc.factions[1].n_legions, 1);
  assert.equal(f.sc.factions[1].strategic_city_primary, null);
  assert.equal(f.sc._cityTickCursor, undefined);
  assert.equal(f.app.originalRng.calls, 0);
  assert.equal(canSnapshotState(f.app), false);
  assert.throws(() => snapshotState(f.app, 0, "half"));
  assert.equal(f.app.clock.hold, true);
});

test("native formation: capital same-city, foreign-owner and FF remain separate domains", async () => {
  const same = await fixture();
  same.sc.factions[1].capital = 66;
  tick(same);
  assert.equal(same.app._strategicBattleFailure, undefined);
  assert.equal(record(same).roadEdgeOrNode, 66 * 8);
  assert.equal(record(same).commandState, 0); // request city attr40 remains set.
  const foreign = await fixture();
  foreign.sc.cities[0].faction = 2;
  tick(foreign);
  assert.equal(foreign.app._strategicBattleFailure, undefined);
  assert.equal(record(foreign).targetNode, 66); // 28F4 mismatch, target20 != current.
  const missing = await fixture();
  missing.sc.factions[1].capital = 255;
  tick(missing);
  assert.match(missing.app._strategicBattleFailure.error.message, /6F89/);
  assert.equal(record(missing).status, 0xc0);
  assert.equal(record(missing).targetCity, 255);
  assert.equal(record(missing).roadPointAddress, 0x2222);
  assert.deepEqual(pools(missing), [100, 100, 100]);
});

test("native formation: sparse partial failed slot survives JSON until real status consumption", async () => {
  const f = await fixture();
  f.sc.nativeLegionSlots.records.splice(2, 1);
  Object.assign(f.sc.factions[1], {
    reserve_cav: 50,
    reserve_arc: 0,
    reserve_inf: 0,
  });
  tick(f, 16);
  assert.equal(f.app._strategicBattleFailure, undefined);
  const partial = record(f);
  assert.equal(partial.status, undefined);
  assert.deepEqual(partial.units, [{ type: 1 }, {}, {}, {}, {}, {}]);
  const { next } = await cold(f);
  assert.deepEqual(record(next).units, partial.units);
  tick(next);
  assert(next.app._strategicBattleFailure);
  assert.equal(next.sc._cityTickCursor, 67);
  assert.equal(next.sc._legionBatchCursor, 32); // prior completed batch only.
  assert.equal(next.sc.legionSlotCounters[2], 77);
});

test("native formation: prepare captures table before await; invalid slot schema rejects without live mutation", async () => {
  const f = await fixture();
  tick(f);
  const saved = json(snapshotState(f.app, 0, "capture"));
  const raw = restoreSnapshotState(saved);
  const pending = prepareScenario({
    ...f.args,
    mode: "restore",
    raw,
    ...readSavedAssembly(saved),
  });
  raw.nativeLegionSlots.records[2].markerBase = 0;
  const prepared = await pending;
  assert.equal(prepared.scenario.nativeLegionSlots.records[2].markerBase, 255);
  assert.notStrictEqual(
    prepared.scenario.nativeLegionSlots.records[2],
    record(f),
  );
  for (const bad of [
    { version: 1, records: [{ slot: 0 }, { slot: 0 }] },
    { version: 1, records: [{ slot: 128 }] },
    { version: 2, records: [] },
  ]) {
    const broken = json(saved);
    broken.state.nativeLegionSlots = bad;
    assert.throws(() => restoreSnapshotState(broken));
  }
  assert.equal(record(f).markerBase, 255);
  assert.equal(f.app._strategicBattleFailure, undefined);
});

test("native formation: snapshot rejects lossy values and sidecars cannot replace slots/03", async () => {
  const f = await fixture();
  tickStrategicCity(f.app, 66);
  const before = f.sc.legionSlotCounters[2];
  const saved = json(snapshotState(f.app, 0, "formation"));
  saved.webMeta.legionRuleState = [{ slot: 2, engagementCountdown: 13 }];
  saved.webMeta.scenarioRuntimeState.delayedLegionReturns = [
    { slot: 2, status: 8 },
  ];
  const restored = restoreSnapshotState(saved);
  assert.equal(restored.legionSlotCounters[2], before);
  assert.strictEqual(
    restored.legions[0],
    restored.nativeLegionSlots.records[2],
  );
  assert.equal(restored.delayedLegionReturns.length, 0);
  for (const value of [undefined, null, NaN, Infinity, -Infinity]) {
    record(f).markerBase = value;
    assert.throws(() => snapshotState(f.app, 0, "bad"));
  }
  record(f).markerBase = 0;
  for (const field of ["reserve_cav", "march_marker_style", "capital"]) {
    const value = f.sc.factions[1][field];
    f.sc.factions[1][field] = NaN;
    assert.throws(() => snapshotState(f.app, 0, "bad faction"));
    f.sc.factions[1][field] = value;
  }
  delete record(f).units[2];
  assert.throws(() => snapshotState(f.app, 0, "hole"));
});

// Actual NPC capture now reaches conditional4FCE after proven owner/F23/capital writes.
// Synthetic battle exit; real prepare/apply/owner/save, not a message certificate.
async function extinctionFixture(missing = null) {
  const f = await fixture({
    change: (raw) => {
      Object.assign(raw.factions[2], {
        capital: 67,
        monarch_idx: 5,
        n_legions: 7,
      });
      Object.assign(raw.generals[5], {
        active: true,
        attr: 0x80,
        faction: 2,
        status: 1,
        captive_flag: 0xff,
      });
      raw.legionSlotCounters[5] = 77;
      Object.assign(raw.nativeLegionSlots.records[5], {
        status: 4,
        faction: 2,
        generalIdx: 99,
        morale: 81,
        troops: 203,
        roadStride: -4,
        roadPointAddress: 0x2344,
        roadEdgeOrNode: 0x800,
        occupancyRowParagraph: 240,
        occupancyOffset: 7,
        targetCity: 66,
        targetNode: 3,
        targetX: 4,
        targetY: 5,
        commandState: 9,
        moveDelay: 19,
        movePeriod: 3,
        markerBase: 17,
        contactAnimationByte21: 23,
        units: Array.from({ length: 6 }, () => ({ type: 4, troops: 120 })),
      });
      if (missing === "status") delete raw.nativeLegionSlots.records[5].status;
      if (missing === "slot") raw.nativeLegionSlots.records.splice(5, 1);
    },
  });
  assert.equal(createOriginalLegion(f.sc, f.context, 2).cf, false);
  f.context.movement.writeByte(240, 7, 0x81);
  f.sc._cityTickCursor = 12;
  f.sc._legionBatchCursor = 64;
  const exit = {
    winnerName: "atk",
    defenders: [],
    oldFaction: 2,
    strategicRng: f.app.originalRng,
    sides: [{ troops: 240, morale: 123, units: Array(6).fill(40) }],
    cityDamage: { growth: 31, defence: 32, troops: 33 },
  };
  f.sc.factions[2].nativeGeneralCount = 31; //explicit test F18, not n_generals.
  f.sc.factions[2].n_cities = 255; // Explicit stored F23, not live-city counts.
  f.sc.factions[1].n_cities = 0;
  f.app.gamebar = {
    enqueueTalkMessage() {
      assert.fail("no unclosed extinction message");
    },
  };
  return { ...f, exit, city: f.sc.cities[67], monarch: f.sc.generals[5] };
}
function applyExtinction(f) {
  return applyBattleResult(
    f.app,
    record(f),
    f.city,
    "atk",
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    f.exit,
  );
}
function assertExtinctionPrefix(f) {
  assert.equal(record(f).troops, 240);
  assert.deepEqual(
    record(f).units.map((u) => u.troops),
    Array(6).fill(400),
  );
  assert.equal(record(f).morale, 123);
  assert.equal(record(f).moveDelay, 1);
  assert.equal(record(f).commandState, 8);
  assert.equal(f.city.faction, 1); //4CF5 committed before capital failure.
  assert.equal(f.city._strategicLastFaction, 2);
  assert.deepEqual(
    [f.city.growth, f.city.defence, f.city.troops],
    [31, 32, 33],
  );
  assert.equal(f.sc.factions[2].dead, undefined);
  assert.equal(f.sc.factions[2].capital, null);
  assert.equal(f.sc.factions[2].attr, 0);
  assert.equal(f.sc.factions[2].n_cities, 254);
  assert.equal(f.sc.factions[1].n_cities, 0);
  assert.equal(f.sc.factions[2]._extinctionHandled, undefined); // Legacy v1 marker untouched by the native scan.
  assert.equal(f.sc.factions[2].n_legions, 7);
  assert.equal(f.sc.factions[2].nativeGeneralCount, 31);
  assert.equal(f.sc.factions[1].n_legions, 1);
  assert.equal(f.sc.legionSlotCounters[5], 77);
  assert.equal(f.sc.legionSlotCounters[2], 77);
  assert.equal(f.context.movement.readByte(240, 7), 0x81);
  assert.equal(f.sc._cityTickCursor, 12);
  assert.equal(f.sc._legionBatchCursor, 64);
  assert.equal(f.app.originalRng.calls, 0);
}

// Previous native5030/capture certificates withdrawn: enclosing4CF3/4FCE
// lifecycles are unclosed. Strict29C3 leaf coverage lives in verify_native_legion_fate.
test("native formation: legal inactive04 JSON survives; capture enters4FCE scan, stops at uninitialized CFD", async () => {
  const f = await extinctionFixture();
  const retired = record(f, 5);
  assert(!f.sc.legions.includes(retired));
  assert(!f.sc.delayedLegionReturns.includes(retired));
  const before = json(snapshotState(f.app, 0, "before"));
  const { next, saved } = await cold(f);
  const expected = before.state.nativeLegionSlots.records[5];
  assert.deepEqual(saved.state.nativeLegionSlots.records[5], expected);
  assert.deepEqual(
    json(snapshotState(next.app, 0, "cold")).state.nativeLegionSlots.records[5],
    expected,
  );
  assert.equal(next.sc.legionSlotCounters[5], 77);
  assert.equal(next.sc.factions[2].nativeGeneralCount, 31);
  const beforeGeneral = json(f.monarch);
  const beforeRecord = json(retired);
  // 4FCE scan now runs past4D1E: F00 idempotent, then4FDC CFD read stops.
  assert.throws(() => applyExtinction(f), /Uncovered.*nativePlayerFactionPointer/);
  assertExtinctionPrefix(f);
  assert.deepEqual(json(f.monarch), beforeGeneral);
  assert.deepEqual(json(retired), beforeRecord);
  assert.equal(f.app.clock.hold, true);
  assert.equal(canSnapshotState(f.app), false);
  assert.throws(() => snapshotState(f.app, 0, "incomplete"));
});

for (const missing of ["status", "slot"]) {
  test(`native formation: extinction missing ${missing} stops at uninitialized CFD with owned failure`, async () => {
    const direct = await extinctionFixture(missing);
    const beforeGeneral = json(direct.monarch);
    assert.throws(() => applyExtinction(direct), /Uncovered.*nativePlayerFactionPointer/);
    assertExtinctionPrefix(direct);
    assert.deepEqual(json(direct.monarch), beforeGeneral);
    // Explicit unsupported native entry both throws and fail-holds this owner.
    assert(direct.app._strategicBattleFailure);
    assert.equal(direct.app.clock.hold, true);
    assert.equal(direct.sc._lastCapturingFaction, undefined);
    const f = await extinctionFixture(missing);
    let afterApply = 0;
    f.app.engagementFx = { reset() {} };
    f.app.score = {
      endBattle() {
        afterApply++;
      },
    };
    f.app.battleView = {
      open(_battle, finish) {
        finish(f.exit);
      },
    };
    await createStrategicBattleMethods({
      createBattle: () => ({}),
    }).startBattle.call(f.app, record(f), f.city, null, []);
    assert.match(
      f.app._strategicBattleFailure?.error?.message ?? "",
      /Uncovered.*nativePlayerFactionPointer/,
    );
    assertExtinctionPrefix(f);
    assert.deepEqual(json(f.monarch), beforeGeneral);
    assert.equal(afterApply, 0);
    assert.equal(f.app.clock.hold, true);
    assert.equal(canSnapshotState(f.app), false);
    assert.throws(() => snapshotState(f.app, 0, "incomplete"));
    if (missing === "slot")
      assert.equal(
        f.sc.nativeLegionSlots.records.some((r) => r.slot === 5),
        false,
      );
    else assert.equal(Object.hasOwn(record(f, 5), "status"), false);
  });
}

test("native formation: capture enters4FCE scan, stops at uninitialized CFD without consuming corrupt downstream slot status", async () => {
  for (const status of [null, -1, 256, 1.5, NaN, Infinity]) {
    const f = await extinctionFixture();
    // The scan now runs past4D1E but stops at the4FDC CFD read before any
    // slot touch (29D4): do not claim to have consumed this byte.
    record(f, 5).status = status;
    const beforeGeneral = json(f.monarch);
    assert.throws(() => applyExtinction(f), /Uncovered.*nativePlayerFactionPointer/);
    assertExtinctionPrefix(f);
    assert.deepEqual(json(f.monarch), beforeGeneral);
    assert(Object.is(record(f, 5).status, status));
  }
});
