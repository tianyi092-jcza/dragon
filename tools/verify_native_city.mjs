// I/O: synthetic content/graph only, four allowlisted fetch mocks; no disk or server.
// Static KI instruction controls, NOT independent CPU execution. See march §3.14.
import assert from "node:assert/strict";
import test from "node:test";
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
import { aiTick, tickStrategicCity } from "../web/src/game/ai.js";
import { OriginalBattleRng } from "../web/src/game/battle/originalrng.js";
import { Clock } from "../web/src/game/clock.js";
import {
  governOriginalCity,
  damageOriginalCity,
} from "../web/src/game/navigation/originalcity.js";
import { tickOriginalStrategicWeather } from "../web/src/game/weather.js";
import {
  initializeNativeLegionSlotsFromZeroChapter,
  rebindNativeLegionViews,
} from "../web/src/game/nativelegions.js";
const json = (v) => JSON.parse(JSON.stringify(v));
async function fixture({
  node = 66,
  command = 5,
  player = 0,
  owner = 0,
  cache = [],
  movement = true,
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
  graph.nodes[0].edgeSlots[0] = 0x4800;
  graph.nodes[1].edgeSlots[0] = 0x8800;
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
  const template = {
    player_faction: player,
    generals: [],
    legions: [],
    factions: Array.from({ length: 3 }, (_, idx) => ({
      idx,
      capital: node,
      n_legions: 0,
      target_faction: 1,
      active: true,
      attr: 0x80,
      money: 1000,
      legion_morale_cap: 200,
      strategic_city_primary: null,
      strategic_city_secondary: null,
    })),
    cities: graph.nodes.map(({ id, x, y }) => ({
      idx: id,
      x,
      y,
      faction: owner,
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
      _strategicLastFaction: owner,
    })),
    diplomacy: Array.from({ length: 24 }, () => Array(24).fill(0)),
  };
  const content = createContentCatalog(
    {
      schemaVersion: 1,
      rules: "ki-1995",
      id: "arrival-test",
      revision: "1",
      chapters: [{ id: "chapter", legacyScenarioIndex: 0, official: true }],
    },
    { scenarios: [template] },
  );
  const raw = createNewGameScenario(template);
  initializeNativeLegionSlotsFromZeroChapter(raw);
  for (const c of raw.cities) {
    c._strategicLastFaction = owner;
    c.disaster_event = 0; // Explicit synthetic input, not a native initializer.
  }
  raw.weatherClouds = Array.from({ length: 16 }, () => ({ status: 0 }));
  raw.disasterMapObjects = Array.from({ length: 16 }, () => ({ status: 0 }));
  raw.legions = [
    {
      slot: 0,
      generalIdx: 0,
      status: 0xc0,
      faction: owner,
      x: node + 1,
      y: 10,
      roadEdgeOrNode: node * 8,
      targetNode: node,
      targetCity: node,
      commandState: command,
      moveDelay: 1,
      movePeriod: 3,
      troops: 600,
      morale: 100,
      _markerFrame: 1,
      occupancyOffset: node + 1,
      occupancyRowParagraph: 240,
      units: Array.from({ length: 6 }, () => ({ type: 3, troops: 1000 })),
    },
  ];
  raw.factions[owner].n_legions = 1;
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
    ...(cache === null ? {} : { cityCache: { version: 1, spans: cache } }),
    ...(movement
      ? {
          movementMemory: {
            version: 1,
            spans: [{ address: 3840, hex: "00".repeat(768) }],
          },
        }
      : {}),
  };
  const urls = world.definition.assets,
    allowed = new Set([
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
  let result;
  try {
    result = await prepareScenario(args);
  } finally {
    globalThis.fetch = old;
  }
  const sc = result.scenario,
    A = sc.legions[0],
    context = scenarioNativeRoadContext(sc);
  const rng = new OriginalBattleRng({ ch: 0, cl: 0, dh: 1 });
  const app = {
    scenario: sc,
    scenarioIdx: 0,
    world,
    content,
    originalRng: rng,
    clock: { year: 190, month: 1, day: 1 },
  };
  return { args, sc, A, context, app };
}
const city = (f) => f.sc.cities[66];
const military = (f) => tickStrategicCity(f.app, 66);
function bytes(...values) {
  return {
    calls: 0,
    nextByte() {
      assert(this.calls < values.length, "unexpected RNG");
      return values[this.calls++];
    },
  };
}
function seedFor(first) {
  for (let dh = 0; dh < 60; dh++)
    for (let cl = 0; cl < 60; cl++) {
      const r = new OriginalBattleRng({ ch: 0, cl, dh });
      if ((r.nextByte() & 3) === first)
        return new OriginalBattleRng({ ch: 0, cl, dh });
    }
  assert.fail("no seed");
}
function neighbours(f, entries, caches = entries.map(() => 0)) {
  city(f).strategicBorderCount = 1;
  city(f).strategicNeighbours = [
    ...entries,
    ...Array(4 - entries.length).fill(255),
  ];
  entries.forEach((idx, i) => {
    f.sc.cities[idx].faction = 1;
    f.context.cityCache.writeByte(idx, caches[i]);
  });
}
async function cold(f) {
  const saved = json(snapshotState(f.app, 0, "native-city"));
  const result = await prepareScenario({
    ...f.args,
    mode: "restore",
    raw: restoreSnapshotState(saved),
    ...readSavedAssembly(saved),
  });
  return {
    ...f,
    sc: result.scenario,
    context: scenarioNativeRoadContext(result.scenario),
    app: {
      ...f.app,
      scenario: result.scenario,
      originalRng: new OriginalBattleRng().restore(saved.webMeta.originalRng),
    },
    saved,
  };
}

test("3FAB independent gate ignores attr/unknown neighbours and commits C14 only after RET", async () => {
  const f = await fixture();
  const c = city(f);
  c.attr = 255;
  c.strategicThreat = 99;
  delete c.strategicNeighbours;
  delete f.sc.factions[0].target_faction;
  assert.equal(military(f), "returned");
  assert.equal(c.attr, 63);
  assert.equal(c.strategicThreat, 0);
  assert.equal(f.app.originalRng.calls, 0);
  c.strategicBorderCount = 1;
  c.strategicThreat = 77;
  assert.throws(() => military(f), /3FBF/);
  assert.equal(c.strategicThreat, 77);
});
test("3FD4 FF terminates; war marker FE, peaceful/same-owner exclusions and stored neighbour caches", async () => {
  const f = await fixture();
  neighbours(f, [1, 2], [255, 2]);
  city(f).strategicNeighbours = [1, 2, 255, NaN];
  f.sc.factions[0].target_faction = 255;
  f.context.movement.writeByte(240, 67, 0x81);
  assert.equal(military(f), "returned");
  assert.equal(city(f).strategicThreat, 1);
  assert.equal(city(f).attr, 0x80);
  assert.equal(f.app.originalRng.calls, 0);
  assert.equal(f.sc.legions.length, 1);
  f.sc.diplomacy[0][1] = 128;
  assert.equal(military(f), "returned");
  assert.equal(city(f).attr, 0);
  f.sc.cities[1].faction = 0;
  delete f.sc.diplomacy[0][0];
  assert.equal(military(f), "returned");
});
test("4013 neutral target18 consumes no diplomacy but requires neighbour cache+1 even when unused", async () => {
  const f = await fixture();
  neighbours(f, [1], [255]);
  f.sc.cities[1].faction = null;
  f.sc.factions[0].target_faction = 24;
  delete f.sc.diplomacy;
  f.context.movement.writeByte(240, 67, 1);
  assert.equal(military(f), "returned");
  assert.equal(city(f).strategicThreat, 0);
  assert.equal(city(f).attr, 0xc0);
  assert.equal(f.app.originalRng.calls, 1);
  city(f).strategicNeighbours = [2, 255, 255, 255];
  f.sc.cities[2].faction = null;
  city(f).strategicThreat = 73;
  assert.throws(() => military(f), /city cache 2 at 4013/);
  assert.equal(city(f).strategicThreat, 73);
});
test("3FD4 holes/null and invalid neighbour fail at actual read, retaining prefix not partial threat", async () => {
  for (const value of [undefined, null, NaN, 192]) {
    const f = await fixture();
    neighbours(f, [1], [10]);
    city(f).strategicNeighbours[1] = value;
    city(f).strategicThreat = 77;
    city(f)._aiCooldown = 2;
    assert.throws(() => military(f), /3FD4|3FE4/);
    assert.equal(city(f).strategicThreat, 77);
    assert.equal(city(f)._aiCooldown, 1);
    assert.equal(f.context.cityCache.readByte(66), 0);
  }
});
test("4028 cooldown RET still F16; DEC1 enters player CDE without future RNG/F16", async () => {
  for (const cooldown of [1, 2]) {
    const f = await fixture();
    neighbours(f, [1], [2]);
    city(f)._aiCooldown = cooldown;
    if (cooldown === 1) assert.throws(() => military(f), /CDE\/8810 at 40E6/);
    else {
      assert.equal(military(f), "returned");
      assert.equal(f.sc.factions[0].strategic_city_primary, 66);
    }
    assert.equal(f.app.originalRng.calls, 0);
    assert.equal(city(f)._aiCooldown, cooldown - 1);
    if (cooldown === 1)
      assert.equal(f.sc.factions[0].strategic_city_primary, null);
  }
});
test("4575 signed high-word quota/byte shift true CF1; 45C1 no active gate and fixed 127 reads", async () => {
  const f = await fixture({ player: 2 });
  neighbours(f, [1], [0]);
  for (const [money, count] of [
    [-1, 5],
    [160 * 256, 5],
    [161 * 256, 5],
    [8192 * 256, 0],
  ]) {
    f.sc.factions[0].money = money;
    f.sc.factions[0].n_legions = count;
    assert.equal(military(f), "returned");
    assert.equal(f.sc.factions[0].strategic_city_primary, 66);
  }
  f.sc.factions[0].money = 0;
  f.sc.factions[0].n_legions = 0;
  f.sc.generals = Array.from({ length: 127 }, () => ({
    faction: 0,
    status: 0,
    ability: { force: 0 },
    active: false,
  }));
  assert.equal(military(f), "returned");
  assert.equal(city(f)._aiCooldown, 0);
  f.sc.generals[126].ability.force = 255;
  assert.throws(() => military(f), /pool 1 at 6ED7/);
  assert.equal(f.sc.nativeLegionSlots.records[126].generalIdx, 126);
  assert.equal(f.sc.factions[0].n_legions, 0);
  delete f.sc.generals[125];
  assert.throws(() => military(f), /general 125 at 45CE/);
});
test("4057 one-to-three candidate cyclic DEC selection: low0 means 256, not r%n", async () => {
  for (let n = 1; n <= 3; n++)
    for (let r = 0; r < 4; r++) {
      const f = await fixture();
      const entries = Array.from({ length: n }, (_, i) => i + 1);
      neighbours(f, entries);
      f.context.movement.writeByte(240, 67, 2);
      f.A.status = 0xc4;
      f.A.commandState = 7;
      f.app.originalRng = bytes(r, 64);
      assert.equal(military(f), "returned");
      assert.equal(f.A.targetCity, entries[((r || 256) - 1) % n]);
      assert.equal(f.A.commandState, 0);
      assert.equal(f.app.originalRng.calls, 2);
      assert.equal(f.A.targetNode, 66);
      assert.equal(f.A.status, 0xc4);
      assert.equal(f.A.moveDelay, 1);
    }
});
test("four candidates low1..3 return; low0 stops first outer-stack read after one RNG and attr/cache commit", async () => {
  for (let r = 0; r < 4; r++) {
    const f = await fixture();
    neighbours(f, [1, 2, 3, 4]);
    f.context.movement.writeByte(240, 67, 1);
    f.app.originalRng = seedFor(r);
    if (r === 0) assert.throws(() => military(f), /SS:\[BP\+10h\] at 4064/);
    else assert.equal(military(f), "returned");
    assert.equal(f.app.originalRng.calls, 1);
    assert.equal(city(f).attr, 0xc0);
    assert.equal(f.context.cityCache.readByte(66), 1);
  }
});
test("407A u8 threat+2 borrow/zero exits AI before player/request reads", async () => {
  for (const threat of [254, 255]) {
    const f = await fixture({ player: 2 });
    neighbours(f, [1], [threat]);
    f.context.movement.writeByte(240, 67, 1);
    delete f.sc.player_faction;
    delete f.sc.factions[0].money;
    assert.equal(military(f), "returned");
    assert.equal(f.app.originalRng.calls, 1);
  }
});
test("4155 fixed scan: 0E before status; skip RNG then eligibility; no faction filter or qualified fallback", async () => {
  const f = await fixture();
  neighbours(f, [1]);
  f.context.movement.writeByte(240, 67, 3);
  f.app.originalRng = bytes(1, 0, 64);
  f.A.status = 0xc4;
  f.A.commandState = 0;
  f.sc.nativeLegionSlots.records[1] = {
    ...f.A,
    slot: 1,
    status: 0xc0,
    commandState: 9,
  };
  f.sc.nativeLegionSlots.records[2] = {
    ...f.A,
    slot: 2,
    status: 0xc4,
    commandState: 0,
  };
  rebindNativeLegionViews(f.sc);
  assert.equal(military(f), "returned");
  assert.equal(f.sc.legions[2].targetCity, 66);
  assert.equal(f.app.originalRng.calls, 3);
  f.app.originalRng = bytes(1, 64);
  f.A.faction = 2;
  assert.equal(military(f), "returned");
  assert.equal(f.A.targetCity, 1);
  delete f.A.roadEdgeOrNode;
  f.A.status = 0;
  f.app.originalRng = bytes(1);
  assert.throws(() => military(f), /L0E at 4160/);
  assert.equal(f.app.originalRng.calls, 1);
});
test("4155 cannot skip absent slots; partial RNG remains and cooldown only clears after RET", async () => {
  const f = await fixture();
  neighbours(f, [1]);
  f.context.movement.writeByte(240, 67, 2);
  f.app.originalRng = bytes(1, 0);
  city(f)._aiCooldown = 3;
  f.sc.nativeLegionSlots.records.splice(1, 1); // Explicit unknown physical slot.
  assert.throws(() => military(f), /slot 1 at L0E at 4160/);
  assert.equal(f.app.originalRng.calls, 2);
  assert.equal(city(f)._aiCooldown, 2);
});
test("4194 budget1->0 still boosts, byte overflow politics251/force255; full and overcap consume exactly2", async () => {
  const f = await fixture();
  const c = city(f);
  c.governor = 0;
  f.sc.generals = [
    { assignment_budget: 1, ability: { politics: 251, force: 255 } },
  ];
  Object.assign(c, { growth: 255, defence: 255, troops: 81, troops_cap: 80 });
  const rng = bytes(0, 0);
  governOriginalCity(f.sc, f.context, c, rng);
  assert.equal(f.sc.generals[0].assignment_budget, 0);
  assert.equal(c.growth, 0);
  assert.equal(c.defence, 0);
  assert.equal(c.troops, 80);
  assert.equal(rng.calls, 2);
  f.sc.generals[0].assignment_budget = 1;
  c.troops = 0;
  const r2 = bytes(15, 15, 0);
  governOriginalCity(f.sc, f.context, c, r2);
  assert.equal(c.troops, 0);
  assert.equal(r2.calls, 3);
});
test("4194 high CL wraps before cap; CL15 CH1; rejected third random leaves troops", async () => {
  const f = await fixture();
  const c = city(f);
  c.governor = 0;
  f.sc.generals = [
    { assignment_budget: 1, ability: { politics: 245, force: 1 } },
  ];
  Object.assign(c, { growth: 100, defence: 200 });
  governOriginalCity(f.sc, f.context, c, bytes(0, 0));
  assert.equal(c.growth, 79);
  assert.equal(c.defence, 62);
  f.sc.generals[0] = {
    assignment_budget: 1,
    ability: { politics: 10, force: 1 },
  };
  Object.assign(c, { growth: 10, defence: 10, troops: 79 });
  governOriginalCity(f.sc, f.context, c, bytes(15, 15, 24));
  assert.equal(c.growth, 11);
  assert.equal(c.defence, 11);
  assert.equal(c.troops, 79);
});
test("4194 failures retain budget before ability and first write before second read", async () => {
  const f = await fixture();
  const c = city(f);
  c.governor = 0;
  f.sc.generals = [{ assignment_budget: 1, ability: {} }];
  const r = bytes(0, 0);
  assert.throws(() => governOriginalCity(f.sc, f.context, c, r), /41C2/);
  assert.equal(f.sc.generals[0].assignment_budget, 0);
  assert.equal(r.calls, 0);
  c.governor = null;
  delete c.defence;
  assert.throws(() => governOriginalCity(f.sc, f.context, c, r), /41F7/);
  assert.equal(c.growth, 51);
  assert.equal(r.calls, 2);
});
test("4269 persistent damage/word SUB exact write set and lazy failures", () => {
  const c = {
    disaster_event: 10,
    defence: 3,
    growth: 4,
    prod: 0x1234,
    troops: 2,
    troops_cap: 80,
    max_prod: 20000,
    faction: 1,
  };
  damageOriginalCity(c);
  assert.deepEqual(c, {
    disaster_event: 10,
    defence: 0,
    growth: 0,
    prod: 0x1215,
    troops: 0,
    troops_cap: 80,
    max_prod: 20000,
    faction: 1,
  });
  damageOriginalCity(c);
  assert.equal(c.prod, 0x11e8);
  const d = { disaster_event: 5, defence: 6 };
  damageOriginalCity(d);
  assert.equal(d.defence, 1);
  const bad = { disaster_event: 5, defence: 0, growth: 6 };
  assert.throws(() => damageOriginalCity(bad), /428F/);
  assert.equal(bad.defence, 0);
  assert.equal(bad.growth, 1);
});
test("2459 all32 status gate; timer0 wraps, front-half expiry reloads without frame/RNG", async () => {
  const f = await fixture();
  f.sc.disasterMapObjects[0] = { status: 128, timer: 1, interval: 0, frame: 7 };
  f.sc.weatherClouds[15] = { status: 255, timer: 0 };
  f.sc.weatherClouds[0] = { status: 0, active: true };
  assert.equal(tickOriginalStrategicWeather(f.sc), true);
  assert.deepEqual(f.sc.disasterMapObjects[0], {
    status: 129,
    timer: 0,
    interval: 0,
    frame: 7,
  });
  assert.equal(f.sc.weatherClouds[15].timer, 255);
  assert.equal(f.app.originalRng.calls, 0);
});
test("2459 failures preserve DEC/earlier slots; 248A stops after reload and dirty bit", async () => {
  const f = await fixture();
  f.sc.disasterMapObjects[0] = { status: 128, timer: 1 };
  assert.throws(() => tickOriginalStrategicWeather(f.sc), /246D/);
  assert.equal(f.sc.disasterMapObjects[0].timer, 0);
  f.sc.disasterMapObjects[0] = { status: 128, timer: 2 };
  f.sc.weatherClouds[0] = { status: 128, timer: 1, interval: 16 };
  assert.throws(() => tickOriginalStrategicWeather(f.sc), /248A at 247C/);
  assert.equal(f.sc.disasterMapObjects[0].timer, 1);
  assert.equal(f.sc.weatherClouds[0].status, 129);
  assert.equal(f.sc.weatherClouds[0].timer, 16);
  f.sc.weatherClouds[0] = { status: 0 };
  delete f.sc.weatherClouds[1];
  f.sc.disasterMapObjects[0].status = 0;
  assert.throws(
    () => tickOriginalStrategicWeather(f.sc),
    /slot 17 status at 2463/,
  );
});
test("Clock city191 RET then16 slots then2459 RET then date; cursors once, slot16 untouched", async () => {
  const f = await fixture({ command: 8 });
  f.sc._cityTickCursor = 191;
  f.sc._legionBatchCursor = 0;
  f.sc.legions = Array.from({ length: 17 }, (_, slot) => ({
    ...f.A,
    slot,
    moveDelay: 2,
  }));
  for (const legion of f.sc.legions)
    f.sc.nativeLegionSlots.records[legion.slot] = legion;
  rebindNativeLegionViews(f.sc);
  f.sc.disasterMapObjects[0] = { status: 128, timer: 2 };
  const clock = new Clock({
    startYear: 190,
    startMonth: 1,
    onStrategicTick(c) {
      assert.equal(
        aiTick(f.app, {
          cityIndex: f.sc._cityTickCursor,
          legionBatchStart: f.sc._legionBatchCursor,
          hour: c.hour,
        }),
        "returned",
      );
      assert.equal(c.sub, 0);
      assert.equal(f.sc.disasterMapObjects[0].timer, 1);
    },
  });
  f.app.clock = clock;
  clock.hour = 1;
  clock.advanceFrame(clock.currentStep);
  assert.equal(clock.sub, 1);
  assert.equal(f.sc._cityTickCursor, 0);
  assert.equal(f.sc._legionBatchCursor, 16);
  assert.equal(f.sc.factions[0].money, 1000 - 16 * 19);
  assert.equal(f.sc.legions[15].moveDelay, 1);
  assert.equal(f.sc.legions[16].moveDelay, 2);
  assert.equal(f.sc.legions[15].contactAnimationByte21, 0);
  assert.equal(f.app.originalRng.calls, 2);
});
test("actual aiTick failures retain city/slot/weather prefix, hold and deny save, no date/replay", async () => {
  for (const phase of [
    "military",
    "governance",
    "disaster",
    "slot",
    "weather",
  ]) {
    const f = await fixture({ command: 8 });
    const c = city(f);
    f.sc._cityTickCursor = 66;
    f.sc._legionBatchCursor = 0;
    if (phase === "military") delete c.strategicBorderCount;
    if (phase === "governance") delete c.troops_cap;
    if (phase === "disaster") delete c.disaster_event;
    if (phase === "slot") delete f.A.troops;
    if (phase === "weather")
      f.sc.weatherClouds[0] = { status: 128, timer: 1, interval: 16 };
    const clock = new Clock({
      startYear: 190,
      startMonth: 1,
      onStrategicTick() {
        assert.equal(
          aiTick(f.app, { cityIndex: 66, legionBatchStart: 0, hour: 1 }),
          "failed",
        );
      },
    });
    f.app.clock = clock;
    clock.advanceFrame(clock.currentStep);
    assert.equal(clock.sub, 0);
    assert.equal(clock.hold, true);
    assert.equal(canSnapshotState(f.app), false);
    assert.equal(
      f.sc._cityTickCursor,
      ["slot", "weather"].includes(phase) ? 67 : 66,
    );
    assert.equal(f.sc._legionBatchCursor, phase === "weather" ? 16 : 0);
    const rng = f.app.originalRng.calls;
    const state = json(f.sc);
    aiTick(f.app, { cityIndex: 66, legionBatchStart: 0, hour: 1 });
    assert.equal(f.app.originalRng.calls, rng);
    assert.deepEqual(json(f.sc), state);
  }
});
test("JSON cold restore retains 0/FF fields/cache/weather unknown timer and isolates state", async () => {
  const f = await fixture();
  city(f).strategicNeighbours = [0, 255, 0, 255];
  city(f).strategicThreat = 255;
  f.sc.weatherClouds[0] = { status: 128 };
  f.sc.disasterMapObjects[0] = { status: 255, timer: 0, interval: 255 };
  const g = await cold(f);
  assert.deepEqual(city(g).strategicNeighbours, [0, 255, 0, 255]);
  assert.equal(city(g).strategicThreat, 255);
  assert.equal(Object.hasOwn(g.sc.weatherClouds[0], "timer"), false);
  assert.equal(g.sc.disasterMapObjects[0].status, 255);
  assert.equal(g.sc.disasterMapObjects[0].timer, 0);
  assert.throws(() => tickOriginalStrategicWeather(g.sc), /2468/);
  g.sc.disasterMapObjects[0].status = 0;
  assert.equal(f.sc.disasterMapObjects[0].status, 255);
});
test("snapshot rejects neighbours holes/null/NaN and nonfinite nullable aliases; missing scalar stays unknown", async () => {
  for (const v of [undefined, null, NaN]) {
    const f = await fixture();
    city(f).strategicNeighbours[1] = v;
    assert.throws(() => snapshotState(f.app, 0, "bad"), /strategicNeighbours/);
  }
  const f = await fixture();
  delete city(f).strategicBorderCount;
  const g = await cold(f);
  assert.throws(() => military(g), /3FAB/);
  city(f).governor = NaN;
  assert.throws(() => snapshotState(f.app, 0, "bad"), /governor/);
});
test("neutral city executes exactly one governance/disaster and zero military despite missing border/governor", async () => {
  const f = await fixture();
  const c = city(f);
  c.faction = null;
  f.A.moveDelay = 2; // This control isolates city RET from the separate 291A arrival.
  delete c.strategicBorderCount;
  delete c.governor;
  delete c.strategicNeighbours;
  const expectedRng = new OriginalBattleRng().restore(
    f.app.originalRng.snapshot(),
  );
  const r1 = expectedRng.nextByte(),
    r2 = expectedRng.nextByte();
  c.disaster_event = 3;
  const attr = c.attr;
  assert.equal(
    aiTick(f.app, { cityIndex: 66, legionBatchStart: 0, hour: 0 }),
    "returned",
  );
  assert.equal(c.growth, 50 + ((r1 & 15) <= 8 ? 1 : 0));
  assert.equal(c.defence, 50 + ((r2 & 15) <= 8 ? 1 : 0) - 3);
  assert.equal(c.attr, attr);
  assert.equal(f.app.originalRng.calls, 2);
  assert.equal(f.A.moveDelay, 1);
  assert.equal(f.A._markerFrame, 1);
  assert.equal(f.A.commandState, 5); // 2662/28F4/291A was not entered.
});
test("zero budget skips missing ability; successful cold next tick matches uninterrupted fields and RNG", async () => {
  const f = await fixture();
  const c = city(f);
  c.governor = 0;
  f.sc.generals = [{ assignment_budget: 0 }];
  governOriginalCity(f.sc, f.context, c, bytes(15, 15));
  assert.equal(f.sc.generals[0].assignment_budget, 0);
  c.governor = null;
  f.A.moveDelay = 2;
  const g = await cold(f);
  for (const app of [f.app, g.app])
    assert.equal(
      aiTick(app, { cityIndex: 66, legionBatchStart: 0, hour: 1 }),
      "returned",
    );
  assert.deepEqual(city(f), city(g));
  assert.deepEqual(f.app.originalRng.snapshot(), g.app.originalRng.snapshot());
  assert.equal(f.sc._cityTickCursor, g.sc._cityTickCursor);
  assert.equal(f.sc._legionBatchCursor, g.sc._legionBatchCursor);
  const bad = json(g.saved);
  bad.webMeta.scenarioAssembly.world.revision = "wrong";
  await assert.rejects(
    () =>
      prepareScenario({
        ...f.args,
        mode: "restore",
        raw: restoreSnapshotState(bad),
        ...readSavedAssembly(bad),
      }),
    /identity|mismatch/i,
  );
});
