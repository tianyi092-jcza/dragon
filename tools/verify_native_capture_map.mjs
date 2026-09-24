// KI8A1E/88CC/4D33 source goldens. Synthetic fixtures, four exact mocked URLs.
// No file/save/profile/child I/O; actual apply/snapshot/JSON/restore/prepare.
import assert from "node:assert/strict";
import test from "node:test";
import { attachSyntheticNativeFactionSource } from "./native_faction_fixture.mjs";
import { createContentCatalog } from "../web/src/content/catalog.js";
import { createWorldResources } from "../web/src/game/worldresources.js";
import { createNewGameScenario } from "../web/src/game/world.js";
import {
  initializeNativeLegionSlotsFromZeroChapter,
  rebindNativeLegionViews,
} from "../web/src/game/nativelegions.js";
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
import { applyBattleResult, aiTick } from "../web/src/game/ai.js";
import { OriginalBattleRng } from "../web/src/game/battle/originalrng.js";
import { createStrategicBattleMethods } from "../web/src/app/battleflow.js";
import { performScenarioFieldEntry } from "../web/src/game/navigation/originalfieldterrain.js";
function json(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (cause) {
    throw new Error("Fixture failed the actual JSON round trip", { cause });
  }
}
const center = 10 * 384 + 10;
const offsets = (type) =>
  type === 0
    ? [-770, -766, 770, 766]
    : type === 3
      ? [-384, -1, 1, 384]
      : [-385, -383, 385, 383];
const spans = (entries) =>
  [...entries]
    .sort((a, b) => a[0] - b[0])
    .map(([address, value]) => ({
      address,
      hex: value.toString(16).padStart(2, "0"),
    }));
async function fixture({
  type = 0,
  terrain = true,
  omit = -1,
  player = 1,
  flags = 0,
} = {}) {
  const graph = {
    version: 2,
    width: 384,
    height: 256,
    nodes: Array.from({ length: 192 }, (_, id) => ({
      id,
      x: id + 10,
      y: 10,
      edgeSlots: [0, 0, 0, 0],
    })),
    edges: [
      {
        id: 0,
        source: 0,
        target: 1,
        weight: 1,
        bounds: { minX: 10, maxX: 11, minY: 11, maxY: 11 },
        points: [
          { x: 10, y: 11, flags: 0x44 },
          { x: 11, y: 11, flags: 4 },
        ],
      },
    ],
  };
  graph.nodes[0].edgeSlots[0] = 0x4800;
  graph.nodes[1].edgeSlots[0] = 0x8800;
  const template = {
    player_faction: player,
    generals: [],
    legions: [],
    factions: [0, 1, 2].map((idx) => ({
      idx,
      attr: 128,
      active: true,
      capital: 2,
      n_legions: 0,
      n_cities: 9,
      money: 1000,
      legion_morale_cap: 200,
      march_marker_style: 0,
    })),
    cities: graph.nodes.map(({ id, x, y }) => ({
      idx: id,
      x,
      y,
      faction: 0,
      governor: null,
      attr: 0xa0,
      prod: 100,
      type,
      _aiCooldown: 0,
      strategicBorderCount: 0,
      strategicNeighbours: [255, 255, 255, 255],
    })),
    diplomacy: Array.from({ length: 24 }, () => Array(24).fill(128)),
  };
  const content = createContentCatalog(
    {
      schemaVersion: 1,
      rules: "ki-1995",
      id: "capture-map-test",
      revision: "1",
      chapters: [{ id: "chapter", legacyScenarioIndex: 0, official: true }],
    },
    { scenarios: [template] },
  );
  const raw = createNewGameScenario(template);
  initializeNativeLegionSlotsFromZeroChapter(raw);
  raw.nativeFateDisplayFlags = flags;
  for (const c of raw.cities) {
    c._strategicLastFaction = 0;
    c.strategicBorderCount = 0;
    c.strategicNeighbours = [255, 255, 255, 255];
  }
  raw.weatherClouds = Array.from({ length: 16 }, () => ({ status: 0 }));
  raw.disasterMapObjects = Array.from({ length: 16 }, () => ({ status: 0 }));
  Object.assign(raw.nativeLegionSlots.records[5], {
    status: 0xc4,
    faction: 1,
    generalIdx: 5,
    x: 10,
    y: 10,
    roadEdgeOrNode: 0,
    targetNode: 0,
    targetCity: 0,
    commandState: 8,
    moveDelay: 7,
    movePeriod: 3,
    troops: 600,
    morale: 145,
    occupancyOffset: 10,
    occupancyRowParagraph: 240,
    units: Array.from({ length: 6 }, () => ({ type: 3, troops: 1000 })),
  });
  raw.factions[1].n_legions = 1;
  rebindNativeLegionViews(raw);
  attachSyntheticNativeFactionSource(raw);
  const input = {
    version: 1,
    spans: spans(
      [
        [center, 0xcd],
        ...offsets(type).map((d, i) => [center + d, 0xde + i]),
      ].filter((_, i) => i !== omit),
    ),
  };
  const world = createWorldResources();
  const args = {
    raw,
    idx: 0,
    content,
    world,
    mode: "fresh",
    terrainMemory: terrain ? input : null,
    movementMemory: {
      version: 1,
      spans: [{ address: 3840, hex: "00".repeat(768) }],
    },
  };
  const old = globalThis.fetch,
    urls = world.definition.assets;
  const allowed = new Set([
    urls.terrain,
    urls.roadCost,
    urls.roadOffset,
    urls.roadGraph,
  ]);
  globalThis.fetch = async (url) => {
    assert(allowed.has(url), `Unexpected asset ${url}`);
    return {
      ok: true,
      json: async () => (url === urls.roadGraph ? graph : {}),
      arrayBuffer: async () => new Uint8Array(384 * 256).fill(0xba).buffer,
    };
  };
  let prepared;
  try {
    prepared = await prepareScenario(args);
  } finally {
    globalThis.fetch = old;
  }
  const sc = prepared.scenario,
    context = scenarioNativeRoadContext(sc),
    A = sc.legions[0];
  const app = {
    scenario: sc,
    scenarioIdx: 0,
    content,
    world,
    clock: { year: 190, month: 1, day: 1 },
    originalRng: new OriginalBattleRng({ ch: 0, cl: 0, dh: 1 }),
  };
  return { sc, context, A, app, args, input, city: sc.cities[0] };
}
function apply(f, defenders = []) {
  return applyBattleResult(
    f.app,
    f.A,
    f.city,
    "atk",
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    {
      defenders,
      sides: [{ troops: 600, morale: 145, units: Array(6).fill(100) }],
    },
  );
}
async function cold(f) {
  const saved = json(snapshotState(f.app, 0, "map"));
  const prepared = await prepareScenario({
    ...f.args,
    mode: "restore",
    raw: restoreSnapshotState(saved),
    ...readSavedAssembly(saved),
  });
  const sc = prepared.scenario;
  return {
    ...f,
    sc,
    city: sc.cities[0],
    A: sc.legions[0],
    context: scenarioNativeRoadContext(sc),
    app: { ...f.app, scenario: sc },
    saved,
  };
}
function held(f, at) {
  assert.equal(f.app._strategicBattleFailure.error.instruction, at);
  assert.equal(f.app.clock.hold, true);
  assert.equal(canSnapshotState(f.app), false);
  assert.throws(() => snapshotState(f.app, 0, "failed"), /cannot save/);
}

test("8A1E actual capture byte arithmetic; missing063E rejects neutral474A despite fabricated faction24", async () => {
  for (const type of [0, 1, 3, 15])
    for (const player of [1, 2]) {
      const f = await fixture({ type, player });
      const rng = f.app.originalRng.snapshot(),
        occupancy = f.context.movement.snapshot();
      for (let tile = 0; tile < 256; tile++) {
        f.context.terrain.writeByte(center, tile);
        f.city.faction = 0;
        apply(f);
        const expected =
          (Math.floor(((tile - 0xcb) & 255) / 3) * 3 +
            0xcb +
            (player === 1 ? 0 : 1)) &
          255;
        assert.equal(f.context.readTerrainByte(10, 10), expected);
      }
      for (const [i, delta] of offsets(type).entries())
        assert.equal(
          f.context.terrain.readByte(center + delta),
          0xde + i + (player === 1 ? 10 : 0),
        );
      assert.deepEqual(f.context.movement.snapshot(), occupancy);
      assert.deepEqual(f.app.originalRng.snapshot(), rng);
      assert.equal(f.args.world.terrain.terrainTile(10, 10), 0xba);
      assert.equal(f.A.commandState, 8);
    }
  const neutral = await fixture();
  neutral.A.faction = 24;
  neutral.sc.factions.push({ idx: 24, n_cities: 1, march_marker_style: 7 });
  delete neutral.sc.diplomacy[2][14];
  // 700F must read raw063E, never fabricated faction24. Unknown stops before4CF3.
  const cityBefore = structuredClone(neutral.city);
  const mapBefore = neutral.context.terrain.snapshot();
  const countsBefore = neutral.sc.factions.map((f) => f.n_cities);
  neutral.A.troops = 1;
  neutral.app.engagementFx = { reset() {} };
  neutral.app.battleView = {
    open(_battle, finish) {
      finish({
        winnerName: "atk",
        strategicRng: neutral.app.originalRng,
        sides: [{ troops: 600, morale: 145, units: Array(6).fill(100) }],
      });
    },
  };
  await createStrategicBattleMethods({
    createBattle: () => ({}),
  }).startBattle.call(neutral.app, neutral.A, neutral.city, null, []);
  assert.match(
    neutral.app._strategicBattleFailure.error.message,
    /063E at 700F/,
  );
  assert.equal(neutral.A.troops, 600);
  assert.equal(neutral.A.moveDelay, 7); //701D is after the rejected700F read.
  assert.deepEqual(neutral.city, cityBefore);
  assert.deepEqual(neutral.context.terrain.snapshot(), mapBefore);
  assert.deepEqual(
    neutral.sc.factions.map((f) => f.n_cities),
    countsBefore,
  );
  assert.equal(neutral.app.clock.hold, true);
  assert.equal(canSnapshotState(neutral.app), false);
});

test("8AD1 ignores all outsideDE..F1 and folds both color groups, real known0/FF not missing", async () => {
  const f = await fixture();
  for (let value = 0; value < 256; value++) {
    for (const d of offsets(0)) f.context.terrain.writeByte(center + d, value);
    apply(f);
    for (const d of offsets(0))
      assert.equal(
        f.context.terrain.readByte(center + d),
        value >= 0xde && value < 0xf2
          ? 0xde + ((value - 0xde) % 10) + 10
          : value,
      );
  }
});

test("8A1E missing capability and each missing tile preserve exact prior writes/F23; no88CC or RNG", async () => {
  for (const omit of [-2, 0, 1, 2, 3, 4]) {
    const f = await fixture({ terrain: omit !== -2, omit });
    const rng = f.app.originalRng.snapshot();
    delete f.city.strategicNeighbours;
    // P89: omit -2 no longer means "no terrain plane" (fresh synthesis
    // binds world bytes), so the first fault moves 8A3F -> 88EB downstream.
    const at = omit === -2 ? "88EB" : omit <= 0 ? "8A3F" : "8AD1";
    assert.throws(
      () => apply(f),
      (e) => e.instruction === at,
    );
    held(f, at);
    assert.equal(f.city.faction, 1);
    assert.equal(f.sc.factions[0].n_cities, 8);
    assert.equal(f.sc.factions[1].n_cities, 10);
    if (omit > 0) {
      assert.equal(f.context.terrain.readByte(center), 0xcb);
      for (let i = 0; i < 4; i++)
        if (i + 1 !== omit)
          assert.equal(
            f.context.terrain.readByte(center + offsets(0)[i]),
            0xde + i + (i + 1 < omit ? 10 : 0),
          );
    }
    assert.deepEqual(f.app.originalRng.snapshot(), rng);
  }
});

test("8A63 precedes C16 and second owner/player read; missing display waits until terrain and borders finish", async () => {
  for (const field of ["type", "nativeFateDisplayFlags"]) {
    const f = await fixture();
    delete (field === "type" ? f.city : f.sc)[field];
    const at = field === "type" ? "8A74" : "4D33";
    assert.throws(
      () => apply(f),
      (e) => e.instruction === at,
    );
    held(f, at);
    assert.equal(f.context.terrain.readByte(center), 0xcb);
    assert.equal(
      f.context.terrain.readByte(center + offsets(0)[0]),
      field === "type" ? 0xde : 0xe8,
    );
  }
  const on = await fixture({ flags: 4 });
  assert.throws(
    () => apply(on),
    (e) => e.instruction === "4D41",
  );
  held(on, "4D41");
  assert.equal(on.context.terrain.readByte(center + offsets(0)[3]), 0xeb);
});

test("88CC FF does not shiftDL; reverse-missing calleeRET still shiftsDL and continues outer loop", async () => {
  const f = await fixture();
  f.city.strategicNeighbours = [255, 1, 2, 3];
  f.sc.cities[1].strategicNeighbours = [255, 255, 255, 255]; //no reverse: return890A only.
  f.sc.cities[2].strategicNeighbours = [255, 255, 0, 255];
  f.sc.cities[3].strategicNeighbours = [0, 255, 255, 255];
  apply(f);
  assert.equal(f.city.attr, 0xa6); //FF no shift;missing reverse consumes bit1;then2/4.
  assert.equal(f.city.strategicBorderCount, 2);
  assert.equal(f.sc.cities[1].attr, 0xa0);
  assert.equal(f.sc.cities[2].attr, 0xa4);
  assert.equal(f.sc.cities[3].attr, 0xa1);
});

test("88CC bilateral INC/DEC byte wrap preserves unrelated bits; already-matching flags skip count reads", async () => {
  for (const same of [false, true])
    for (const value of [0, 255]) {
      const f = await fixture();
      f.city.strategicNeighbours = [1, 255, 255, 255];
      const other = f.sc.cities[1];
      other.strategicNeighbours = [255, 0, 255, 255];
      other.faction = same ? 1 : 0;
      f.city.attr = same ? 0xa1 : 0xa0;
      other.attr = same ? 0xa2 : 0xa0;
      f.city.strategicBorderCount = other.strategicBorderCount = value;
      apply(f);
      assert.equal(f.city.attr, same ? 0xa0 : 0xa1);
      assert.equal(other.attr, same ? 0xa0 : 0xa2);
      assert.equal(
        f.city.strategicBorderCount,
        (value + (same ? -1 : 1)) & 255,
      );
      assert.equal(other.strategicBorderCount, f.city.strategicBorderCount);
      delete f.city.strategicBorderCount;
      delete other.strategicBorderCount;
      apply(f); //same flags now: no count read/write.
      assert.equal(Object.hasOwn(f.city, "strategicBorderCount"), false);
    }
});

test("88CC exact other count/attr then self count/attr prefix under each write fault", async () => {
  for (const same of [false, true])
    for (let fault = 0; fault < 4; fault++) {
      const f = await fixture();
      f.city.strategicNeighbours = [1, 255, 255, 255];
      const other = f.sc.cities[1];
      other.strategicNeighbours = [0, 255, 255, 255];
      other.faction = same ? 1 : 0;
      other.attr = f.city.attr = same ? 0xa1 : 0xa0;
      const writes = [],
        error = new Error(`write${fault}`);
      const targets = [
        [other, "strategicBorderCount"],
        [other, "attr"],
        [f.city, "strategicBorderCount"],
        [f.city, "attr"],
      ];
      targets.forEach(([record, field], index) => {
        let value = record[field];
        Object.defineProperty(record, field, {
          enumerable: true,
          configurable: true,
          get: () => value,
          set(next) {
            writes.push(index);
            if (index === fault) throw error;
            value = next;
          },
        });
      });
      assert.throws(
        () => apply(f),
        (e) => e === error,
      );
      assert.deepEqual(
        writes,
        Array.from({ length: fault + 1 }, (_, i) => i),
      );
      assert.equal(f.app._strategicBattleFailure.error, error);
      assert.equal(f.app.clock.hold, true);
      assert.equal(f.context.terrain.readByte(center), 0xcb);
      for (let i = 0; i < fault; i++) {
        const [record, field] = targets[i];
        assert.equal(
          record[field],
          field === "attr" ? (same ? 0xa0 : 0xa1) : same ? 255 : 1,
        );
      }
    }
});

test("terrainMemory actual JSON/restore/prepare isolation, identity and missing bytes with immutable asset", async () => {
  const f = await fixture();
  f.context.terrain.writeByte(0, 0);
  f.context.terrain.writeByte(1, 255);
  apply(f);
  const g = await cold(f);
  assert.equal(g.context.terrain.readByte(0), 0);
  assert.equal(g.context.terrain.readByte(1), 255);
  assert.throws(
    () => g.context.terrain.readByte(2),
    /Uncovered terrain byte: 2/,
  );
  assert.equal(g.context.readTerrainByte(10, 10), 0xcb);
  g.context.terrain.writeByte(center, 9);
  assert.equal(f.context.readTerrainByte(10, 10), 0xcb);
  const base = await f.args.world.terrain.loadTerrain();
  base[center] = 99;
  assert.equal(f.args.world.terrain.terrainTile(10, 10), 0xba);
  for (const key of ["world", "content", "initialTerrain"]) {
    const saved = json(g.saved);
    if (key === "initialTerrain")
      saved.webMeta.terrainMemory.initialTerrain = "00";
    else
      saved.webMeta.terrainMemory.identity[key][
        key === "world" ? "revision" : "chapterId"
      ] = "foreign";
    await assert.rejects(
      () =>
        prepareScenario({
          ...f.args,
          mode: "restore",
          raw: restoreSnapshotState(saved),
          ...readSavedAssembly(saved),
        }),
      /terrain/i,
    );
  }
  assertPlayableScenario(readSavedAssembly(g.saved)); // P58 flip: v2 enters play
  const absent = await fixture({ terrain: false }),
    restored = await cold(absent);
  // P89: fresh without explicit terrainMemory synthesizes the certified map
  // tile plane (mocked world bytes 0xBA here); null-terrain owners retired.
  assert.ok(restored.context.terrain);
  assert.equal(Object.hasOwn(restored.saved.webMeta, "terrainMemory"), true);
  assert.equal(restored.context.readTerrainByte(10, 10), 0xba);
});

test("terrain schema rejects holes/illegal/overlap and v1/misplaced metadata without modifying live owner", async () => {
  const f = await fixture();
  const before = f.context.terrain.snapshot();
  for (const bad of [
    [undefined],
    [null],
    [{ address: -1, hex: "00" }],
    [{ address: 0, hex: "0" }],
    [
      { address: 0, hex: "00" },
      { address: 0, hex: "ff" },
    ],
    [{ address: 98304, hex: "00" }],
  ]) {
    await assert.rejects(
      () =>
        prepareScenario({
          ...f.args,
          terrainMemory: { version: 1, spans: bad },
        }),
      /terrain known span/,
    );
  }
  assert.deepEqual(f.context.terrain.snapshot(), before);
  const saved = json(snapshotState(f.app, 0, "gates"));
  assert.throws(
    () =>
      readSavedAssembly({
        webMeta: { terrainMemory: saved.webMeta.terrainMemory },
      }),
    /requires assembly/,
  );
  const v1 = json(saved);
  v1.webMeta.scenarioAssembly.roadVersion = 1;
  delete v1.webMeta.roadMemory;
  delete v1.webMeta.movementMemory;
  assert.throws(() => readSavedAssembly(v1), /retired/);
  saved.state.terrainMemory = {};
  assert.throws(() => readSavedAssembly(saved), /Misplaced/);
});

test("native2708 consumes same mutable terrain; unknown tile preserves preceding occupancyDEC and holds", async () => {
  for (const known of [true, false]) {
    const f = await fixture();
    Object.assign(f.A, {
      status: 0xc1,
      roadEdgeOrNode: 0x800,
      roadPointAddress: 0x2000,
      roadStride: 4,
      targetNode: 1,
      targetCity: 1,
      x: 10,
      y: 11,
      occupancyOffset: 10,
      occupancyRowParagraph: 264,
    });
    f.context.movement.writeByte(264, 10, 1);
    f.sc.diplomacy[1][0] = 0; //42AB permits the hostile endpoint, no reversal.
    const rng = f.app.originalRng.snapshot();
    if (known) f.context.terrain.writeByte(11 * 384 + 11, 0xd4);
    aiTick(f.app, {
      legionBatchStart: 0,
      runCityDaily: false,
      settleDaily: false,
    }); //due after set below
    f.A.moveDelay = 1;
    aiTick(f.app, {
      legionBatchStart: 0,
      runCityDaily: false,
      settleDaily: false,
    });
    if (known) {
      assert.equal(f.app._strategicBattleFailure, undefined);
      assert.equal(f.A._engagement.kind, "siege");
      assert.equal(f.A.x, 10);
      assert.equal(f.A.y, 11);
      assert.equal(f.A.roadStride, 4);
      assert.equal(f.context.movement.readByte(264, 10), 1);
    } else {
      assert.match(
        f.app._strategicBattleFailure.error.message,
        /Uncovered terrain byte/,
      );
      assert.equal(f.context.movement.readByte(264, 10), 0);
      assert.equal(canSnapshotState(f.app), false);
    }
    assert.deepEqual(f.app.originalRng.snapshot(), rng);
  }
});

test("4B63 prefix after8A1E consumes the same rules cap, not immutable BA resource", async () => {
  const f = await fixture({ type: 3 });
  apply(f);
  assert.equal(f.context.terrain.readByte(center), 0xcb);
  assert.equal(f.context.terrain.readByte(center - 384), 0xe8);
  f.A._markerFrame = 0;
  const D = {
    faction: 0,
    occupancyOffset: 10,
    occupancyRowParagraph: 240,
    x: 100,
    y: 100,
  };
  let failure;
  assert.throws(
    () =>
      performScenarioFieldEntry(
        f.sc,
        f.A,
        D,
        f.context,
        f.app.originalRng,
        99,
        42,
      ),
    (error) => {
      failure = error;
      assert.deepEqual(error.nativeFieldCall.selection, {
        bx: 0x4200,
        cx: 0,
        cf: true,
      });
      return error.instruction === "4AD3";
    },
  );
  assert.deepEqual(failure.nativeFieldPrefix, {
    d32: 0,
    d35: 0,
    d34: 0xc6,
    bpWords: { 254: 0 },
  });
  const g = await cold(f);
  assert.throws(
    () =>
      performScenarioFieldEntry(
        g.sc,
        g.A,
        D,
        g.context,
        g.app.originalRng,
        99,
        42,
      ),
    (error) => {
      assert.deepEqual(error.nativeFieldPrefix, failure.nativeFieldPrefix);
      assert.deepEqual(
        error.nativeFieldCall.selection,
        failure.nativeFieldCall.selection,
      );
      return error.instruction === "4AD3";
    },
  );
});

test("native field battle ABI gate never invokes default classifier/creates battle/consumes RNG", async () => {
  const f = await fixture(),
    rng = f.app.originalRng.snapshot();
  f.app.engagementFx = { reset() {} };
  f.app.battleView = {
    open() {
      assert.fail("unclosed field ABI");
    },
  };
  const result = await createStrategicBattleMethods({
    classifyFieldBattleTerrain() {
      assert.fail("default reader");
    },
    createFieldBattle() {
      assert.fail("unclosed field");
    },
  }).startFieldBattle.call(f.app, f.A, f.A);
  assert.equal(result, false);
  assert.match(f.app._strategicBattleFailure.error.message, /4B63/);
  assert.deepEqual(f.app.originalRng.snapshot(), rng);
  assert.equal(canSnapshotState(f.app), false);
});

test("owned battle exit applies map before endBattle; display-on fault prevents all successful tail callbacks", async () => {
  for (const flags of [0, 4]) {
    const f = await fixture({ flags }),
      events = [];
    const rng = f.app.originalRng.snapshot();
    f.app.engagementFx = { reset() {} };
    f.app.score = {
      endBattle() {
        events.push("end");
        assert.equal(f.context.readTerrainByte(10, 10), 0xcb);
      },
    };
    f.app.hud = {
      buildLegend() {
        events.push("legend");
      },
    };
    f.app.view = {
      draw() {
        events.push("draw");
      },
    };
    f.app.battleView = {
      open(_battle, finish) {
        finish({
          winnerName: "atk",
          strategicRng: f.app.originalRng,
          sides: [{ troops: 600, morale: 145, units: Array(6).fill(100) }],
        });
      },
    };
    await createStrategicBattleMethods({
      createBattle: () => ({}),
    }).startBattle.call(f.app, f.A, f.city, null, []);
    assert.deepEqual(events, flags ? [] : ["end", "legend", "draw"]);
    assert.deepEqual(f.app.originalRng.snapshot(), rng);
    if (flags) held(f, "4D41");
    else {
      assert.equal(f.app._strategicBattleFailure, undefined);
      assert.equal(f.A.moveDelay, 1);
      const g = await cold(f); //formal JSON after normal captured map return.
      assert.equal(g.context.readTerrainByte(10, 10), 0xcb);
      assert.equal(g.sc.diplomacy[0][1], 128); //no legacy diplomatic capture tail.
    }
  }
});

test("8A1E independent u16 BX wrap and bounded segment alias; no coordinate clamping", async () => {
  const f = await fixture();
  f.city.x = 65535; //explicit runtime word, not an initializer/asset rewrite.
  const addresses = [3839, 68605, 3073, 4609, 4605];
  for (const [i, address] of addresses.entries())
    f.context.terrain.writeByte(address, i ? 0xde : 0xcd);
  apply(f);
  assert.equal(f.context.terrain.readByte(addresses[0]), 0xcb);
  for (const address of addresses.slice(1))
    assert.equal(f.context.terrain.readByte(address), 0xe8);
  for (const y of [0, 1, 256, 65535]) {
    const g = await fixture();
    g.city.y = y;
    const before = g.context.terrain.snapshot();
    assert.throws(
      () => apply(g),
      (e) => e.instruction === "8A3F",
    );
    assert.equal(g.sc.factions[1].n_cities, 10);
    assert.deepEqual(g.context.terrain.snapshot(), before);
  }
});

test("88CC unknown forward/reverse/owner/count preserves terrain and earlier city writes", async () => {
  for (const kind of ["forward", "reverse", "owner", "count"]) {
    const f = await fixture();
    f.city.strategicNeighbours = [1, 255, 255, 255];
    const other = f.sc.cities[1];
    other.strategicNeighbours = [0, 255, 255, 255];
    if (kind === "forward") delete f.city.strategicNeighbours[0];
    if (kind === "reverse") delete other.strategicNeighbours[0];
    if (kind === "owner") delete other.faction;
    if (kind === "count") delete f.city.strategicBorderCount;
    const at = {
      forward: "88EB",
      reverse: "8915",
      owner: "891F",
      count: "8937",
    }[kind];
    assert.throws(
      () => apply(f),
      (e) => e.instruction === at,
    );
    held(f, at);
    assert.equal(f.context.terrain.readByte(center), 0xcb);
    assert.equal(other.attr, kind === "count" ? 0xa1 : 0xa0);
    assert.equal(f.city.attr, 0xa0);
  }
});

test("prepare captures terrain input before await; late owner stays detached from installed scenario", async () => {
  const f = await fixture(),
    before = f.context.terrain.snapshot();
  let release;
  const wait = new Promise((resolve) => {
    release = resolve;
  });
  const world = {
    ...f.args.world,
    terrain: {
      ...f.args.world.terrain,
      async loadTerrain() {
        await wait;
        return f.args.world.terrain.loadTerrain();
      },
    },
  };
  const input = json(f.input);
  const pending = prepareScenario({ ...f.args, world, terrainMemory: input });
  input.spans[0].hex = "ff";
  release();
  const result = await pending,
    terrain = scenarioNativeRoadContext(result.scenario).terrain;
  assert.equal(
    terrain.readByte(f.input.spans[0].address),
    parseInt(f.input.spans[0].hex, 16),
  );
  terrain.writeByte(center, 42);
  assert.deepEqual(f.context.terrain.snapshot(), before);
  assert.equal(f.app.scenario, f.sc);
});

test("capture return then actual due slot uses captured ownership, daily/03/next slot exactly once", async () => {
  const f = await fixture();
  f.sc.legionSlotCounters[5] = 77;
  apply(f);
  const rng = f.app.originalRng.snapshot();
  assert.equal(f.sc.legionSlotCounters[5], 77); //4CF3 itself never finishes264A.
  assert.equal(f.sc.factions[1].money, 1000);
  assert.equal(f.A.moveDelay, 1);
  aiTick(f.app, {
    legionBatchStart: 0,
    runCityDaily: false,
    settleDaily: true,
  });
  assert.equal(f.app._strategicBattleFailure, undefined);
  assert.equal(f.sc.factions[1].money, 981);
  assert.equal(f.A.morale, 155);
  assert.equal(f.A.moveDelay, 3);
  assert.equal(f.sc.legionSlotCounters[5], 0);
  assert.equal(f.A.contactAnimationByte21, 0);
  assert.equal(f.sc._legionBatchCursor, 16);
  assert.deepEqual(f.app.originalRng.snapshot(), rng);
  const g = await cold(f);
  assert.equal(g.A.moveDelay, 3);
  assert.equal(g.sc.legionSlotCounters[5], 0);
  assert.equal(g.context.readTerrainByte(10, 10), 0xcb);
});

test("4CF3 map return follows same original BP including inactive members; no extra RNG/occupancy/03 writes", async () => {
  const f = await fixture();
  const bp = [0, 1].map((slot) => {
    const record = f.sc.nativeLegionSlots.records[slot];
    Object.assign(record, {
      faction: 0,
      status: 8,
      roadEdgeOrNode: 16,
      roadStride: -4,
      roadPointAddress: 0x2000,
      targetNode: 0,
      targetCity: 0,
      moveDelay: 7,
      commandState: 9,
    });
    f.sc.legionSlotCounters[slot] = 48;
    return record;
  });
  const rng = f.app.originalRng.snapshot(),
    occupancy = f.context.movement.snapshot();
  apply(f, bp); //capital2=current node;487B shortcut yields same shared retreat.
  for (const [slot, record] of bp.entries()) {
    assert.equal(f.sc.nativeLegionSlots.records[slot], record);
    assert.equal(record.status, 10);
    assert.equal(record.targetCity, 2);
    assert.equal(record.targetNode, 2);
    assert.equal(record.moveDelay, 1);
    assert.equal(record.commandState, 9);
    assert.equal(f.sc.legionSlotCounters[slot], 48);
  }
  assert.equal(f.context.readTerrainByte(10, 10), 0xcb);
  assert.deepEqual(f.app.originalRng.snapshot(), rng);
  assert.deepEqual(f.context.movement.snapshot(), occupancy);
  assert.equal(canSnapshotState(f.app), true);
  const g = await cold(f);
  assert.equal(g.sc.nativeLegionSlots.records[0].status, 10);
  assert.equal(g.sc.legionSlotCounters[0], 48);
});
