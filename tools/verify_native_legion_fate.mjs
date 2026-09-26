// I/O: all fixtures synthetic; four explicitly mocked asset URLs, no forwarding.
// KI static goldens: fate notes §7; true Scenario/caller/JSON integration, not CPU execution.
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
  assertPlayableScenario,
} from "../web/src/game/scenarioassembly.js";
import {
  snapshotState,
  restoreSnapshotState,
  canSnapshotState,
} from "../web/src/game/savegame.js";
import {
  aiTick,
  applyFieldBattleResult,
  dispatchLegionFate,
  dispatchGeneralFateEvent,
  processMonthlyGeneralFates,
  enqueueDelayedStrategicEvent,
  hasPendingStrategicEvent,
  monthlyDiplomacyAI,
  settleFactionNegotiation,
  tickStrategicWarEvents,
  suspendNativeBattleFateMessage,
} from "../web/src/game/ai.js";
import { OriginalBattleRng } from "../web/src/game/battle/originalrng.js";
import { performScenarioLegionFate } from "../web/src/game/navigation/scenariolegionfate.js";
import {
  initializeNativeLegionSlotsFromZeroChapter,
  rebindNativeLegionViews,
} from "../web/src/game/nativelegions.js";
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
  node = 0,
  command = 10,
  player = 0,
  owner = 1,
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
    generals: Array.from({ length: 128 }, (_, idx) => ({
      idx,
      name: `G${idx}`,
      attr: 0x80,
      active: true,
      faction: owner,
      origFaction: null,
      status: 1,
      battle_rating: 0,
      talk_idx: 0,
    })),
    legions: [],
    factions: Array.from({ length: 3 }, (_, idx) => ({
      idx,
      capital: node,
      n_legions: 0,
      n_generals: 99,
      monarch_idx: 127,
      reserve_cav: 0,
      reserve_arc: 0,
      reserve_inf: 0,
      active: true,
      attr: 0x80,
      money: 1000,
      legion_morale_cap: 200,
      march_marker_style: 0,
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
      _aiCooldown: 0,
      _strategicLastFaction: owner,
    })),
    diplomacy: Array.from({ length: 24 }, () => Array(24).fill(0)),
  };
  const content = createContentCatalog(
    {
      schemaVersion: 1,
      rules: "ki-1995",
      id: "fate-test",
      revision: "1",
      chapters: [{ id: "chapter", legacyScenarioIndex: 0, official: true }],
    },
    { scenarios: [template] },
  );
  const raw = createNewGameScenario(template);
  initializeNativeLegionSlotsFromZeroChapter(raw);
  for (const c of raw.cities) c._strategicLastFaction = owner;
  raw.nativeFateDisplayFlags = 0;
  for (const f of raw.factions) f.nativeGeneralCount = 10;
  // Explicit synthetic inactive 2459 slots, not inferred original initialization.
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
  attachSyntheticNativeFactionSource(raw);
  const world = createWorldResources();
  const args = {
    raw,
    idx: 0,
    content,
    world,
    mode: "fresh",
    // Explicit synthetic rules terrain, not an occupancy/resource fallback.
    terrainMemory: {
      version: 1,
      spans: [{ address: 0, hex: "ba".repeat(384 * 256) }],
    },
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
const slot = (f, daily = false) =>
  aiTick(f.app, {
    legionBatchStart: 0,
    runCityDaily: false,
    settleDaily: daily,
  });
async function restored(f) {
  const saved = json(snapshotState(f.app, 0, "arrival"));
  const result = await prepareScenario({
    ...f.args,
    mode: "restore",
    raw: restoreSnapshotState(saved),
    ...readSavedAssembly(saved),
  });
  return {
    ...f,
    sc: result.scenario,
    A: result.scenario.nativeLegionSlots
      ? result.scenario.nativeLegionSlots.records.find((r) => r.slot === 0)
      : result.scenario.legions.find((r) => r.slot === 0),
    context: scenarioNativeRoadContext(result.scenario),
    app: { ...f.app, scenario: result.scenario },
    saved,
  };
}

const mem = (f) => f.context.movement.readByte(240, 1);
const other = (f) => f.sc.nativeLegionSlots.records.find((r) => r.slot === 1);

test("28F4 actual due-slot 291A return still dispatches4325, daily,264A and other slot48→47", async () => {
  const f = await fixture({
    player: 2,
    change(sc) {
      sc.cities[0].faction = 0;
      sc.generals[0].battle_rating = 255;
      sc.legions.push({ ...sc.legions[0], slot: 1, generalIdx: 100 });
    },
  });
  // Another slot already returned before this 16-slot batch.
  dispatchLegionFate(f.sc, other(f), 1, f.app.originalRng, f.app);
  const before = f.sc.factions[1].money;
  assert.equal(slot(f, true), "returned");
  assert.equal(f.A.status, 8);
  assert.equal(f.A.commandState, 9); // 2671→state10 after the fate RET.
  assert.equal(f.sc.legionSlotCounters[0], 0);
  assert.equal(f.A.contactAnimationByte21, 0);
  assert.equal(f.A.morale, 110);
  assert.equal(f.sc.factions[1].money, before - 19);
  assert.equal(f.sc.legionSlotCounters[1], 47);
  assert.equal(f.sc.factions[1].n_legions, 255); // 1 minus two removals.
  assert.equal(f.sc.generals[0].status, 1);
  assert.equal(mem(f), 254);
  assert.equal(canSnapshotState(f.app), true);
});

test("47BB node high-cost fate STC skips points, rejoins26F5 INC then current tail", async () => {
  const f = await fixture({
    cache: [{ address: 0, hex: "02" }],
    change(sc) {
      Object.assign(sc.legions[0], { targetCity: 1, targetNode: 1 });
      sc.cities[1].faction = 2;
    },
  });
  assert.equal(slot(f), "returned");
  assert.equal(f.A.status, 8);
  assert.equal(f.sc.legionSlotCounters[0], 0);
  assert.equal(mem(f), 255); // outer DEC,2977 DEC,26F5 INC (not two removals).
  assert.equal(f.A.roadEdgeOrNode, 0);
  assert.equal(f.A.roadPointAddress, undefined);
  assert.equal(f.sc.factions[1].n_legions, 0);
});

test("291A capitalFF via real dispatcher captures SAME slot, F14 and F18 distinct", async () => {
  const f = await fixture({
    change(sc) {
      sc.factions[1].capital = null;
      sc.legions[0].generalIdx = 99;
      sc.generals[0].attr = 0xc0;
      sc.generals[0].talk_idx = 254;
    },
  });
  assert.equal(dispatchLegionFate(f.sc, f.A, 2, null, f.app), "captured");
  assert.equal(f.sc.generals[0].faction, 2);
  assert.equal(f.sc.generals[0].origFaction, 1);
  assert.equal(f.sc.generals[0].status, 4);
  assert.equal(f.sc.generals[0].talk_idx, 1);
  assert.equal(f.sc.generals[99].status, 1);
  assert.equal(f.sc.factions[1].nativeGeneralCount, 9);
  assert.equal(f.sc.factions[2].nativeGeneralCount, 10);
  assert.equal(f.sc.factions[1].n_generals, 99);
  assert.equal(f.sc.factions[1].n_legions, 0);
  assert.equal(mem(f), 255);
});

test("native29C3 inactive slot bypasses occupancy/F14, permanent exit keeps G17=4", async () => {
  const f = await fixture();
  f.A.status = 0;
  delete f.A.occupancyOffset;
  f.sc.factions[1].attr = 0;
  f.sc.generals[0].attr = 0x90;
  assert.equal(
    performScenarioLegionFate(f.sc, f.A, f.context, "29C3", 2),
    "eliminated",
  );
  assert.equal(f.sc.generals[0].status, 4);
  assert.equal(f.sc.generals[0].attr, 0);
  assert.equal(f.sc.generals[0].faction, null);
  assert.equal(f.sc.generals[0].origFaction, null);
  assert.equal(f.sc.factions[1].nativeGeneralCount, 9);
  assert.equal(f.sc.factions[1].n_legions, 1);
});

test("native2A7E actual25E5 and JSON restored own inputs/unique slots/unknown occupancy", async () => {
  let f = await fixture();
  dispatchLegionFate(f.sc, f.A, 1, null, f.app);
  f.sc.legionSlotCounters[0] = 2;
  delete f.sc.factions[2].nativeGeneralCount;
  // Sparse unknown slot beyond this batch must remain absent after restore.
  f.sc.nativeLegionSlots.records = f.sc.nativeLegionSlots.records.filter(
    (r) => r.slot !== 100,
  );
  f = await restored(f);
  assert.equal(f.sc.nativeFateDisplayFlags, 0);
  assert.equal(Object.hasOwn(f.sc.factions[2], "nativeGeneralCount"), false);
  assert.equal(
    f.sc.nativeLegionSlots.records.some((r) => r.slot === 100),
    false,
  );
  assert.equal(f.sc.delayedLegionReturns[0], f.A);
  assert.throws(() => f.context.movement.readByte(0, 0), /Uncovered/);
  assert.equal(slot(f), "returned");
  assert.equal(f.sc.legionSlotCounters[0], 1);
  assert.equal(slot(f), "returned");
  assert.equal(f.sc.generals[0].status, 0);
  assert.equal(f.sc.generals[0].faction, 1);
  assert.equal(f.A.status, 0);
  assert.equal(f.sc.factions[1].nativeGeneralCount, 10);
  assert.equal(f.sc.delayedLegionReturns.length, 0);
});

test("state11 actual463E returns pools first, same-slot G17, occupancy, active daily tail", async () => {
  const f = await fixture({
    command: 11,
    change(sc) {
      sc.legions[0].generalIdx = 99;
      sc.legionSlotCounters[0] = 77;
      sc.factions[1].reserve_inf = 65500;
      sc.legions[0].units = [1, 2, 3, 4, 1, 2].map((type) => ({
        type,
        troops: 100,
      }));
    },
  });
  assert.equal(slot(f, true), "returned");
  assert.equal(f.A.status, 0);
  assert.deepEqual(
    f.A.units.map((u) => u.troops),
    [0, 0, 0, 100, 0, 0],
  );
  assert.deepEqual(
    [
      f.sc.factions[1].reserve_cav,
      f.sc.factions[1].reserve_arc,
      f.sc.factions[1].reserve_inf,
    ],
    [20, 20, 65500],
  );
  assert.equal(f.sc.generals[0].status, 0);
  assert.equal(f.sc.generals[99].status, 1);
  assert.equal(f.sc.factions[1].nativeGeneralCount, 10);
  assert.equal(f.sc.factions[1].n_legions, 0);
  assert.equal(mem(f), 255);
  assert.equal(f.A.troops, 600); // 4651 does not recompute total.
  assert.equal(f.A.morale, 110);
  assert.equal(f.sc.legionSlotCounters[0], 0);
});

test("463E pool failure retains F14/team exchange; no status/occupancy/tail or later slot", async () => {
  const f = await fixture({
    command: 11,
    change(sc) {
      sc.legionSlotCounters[0] = 77;
      sc.legions.push({ ...sc.legions[0], slot: 1, moveDelay: 9 });
    },
  });
  delete f.sc.factions[1].reserve_inf;
  assert.equal(slot(f, true), "failed");
  assert.equal(f.sc.factions[1].n_legions, 0);
  assert.equal(f.A.units[0].troops, 0);
  assert.equal(f.A.units[1].troops, 1000);
  assert.equal(f.A.status, 0xc0);
  assert.equal(f.sc.legionSlotCounters[0], 77);
  assert.equal(other(f).moveDelay, 9);
  assert.equal(mem(f), 0);
  assert.equal(f.app.clock.hold, true);
  assert.equal(canSnapshotState(f.app), false);
});

test("47BB missing F18 retains two occupancy decrements/F14, rejects raw and n_generals fallback", async () => {
  const f = await fixture({
    cache: [{ address: 0, hex: "02" }],
    change(sc) {
      sc.factions[1].capital = null;
      sc.factions[1].raw = Array(64).fill(17);
      Object.assign(sc.legions[0], { targetCity: 1, targetNode: 1 });
      sc.cities[1].faction = 2;
      sc.legionSlotCounters[0] = 77;
    },
  });
  delete f.sc.factions[1].nativeGeneralCount;
  assert.equal(slot(f), "failed");
  assert.match(
    f.app._strategicBattleFailure.error.message,
    /nativeGeneralCount/,
  );
  assert.equal(mem(f), 254);
  assert.equal(f.sc.factions[1].n_legions, 0);
  assert.equal(f.A.status, 0xc0);
  assert.equal(f.sc.generals[0].status, 1);
  assert.equal(f.sc.legionSlotCounters[0], 77);
  assert.equal(canSnapshotState(f.app), false);
});

test("explicit2BA8 flags missing/open stop AFTER clearbit4 without occupancy or RNG", async () => {
  for (const flags of [undefined, 4]) {
    const f = await fixture();
    f.A.status = 0xd0;
    if (flags === undefined) delete f.sc.nativeFateDisplayFlags;
    else f.sc.nativeFateDisplayFlags = flags;
    const rng = {
      nextByte() {
        assert.fail("no RNG before display return");
      },
    };
    assert.throws(
      () => dispatchLegionFate(f.sc, f.A, 2, rng, f.app),
      /nativeFateDisplayFlags|2BB3/,
    );
    assert.equal(f.A.status, 0xc0);
    assert.equal(mem(f), 0);
    assert.equal(f.sc.factions[1].n_legions, 1);
    assert.equal(canSnapshotState(f.app), false);
  }
});

test("player message boundaries retain prefix; 2A7E uses the closed TALK35 deferred FIFO", async () => {
  for (const kind of ["return", "capture", "delayed"]) {
    const f = await fixture({
      player: 1,
      command: 10,
    });
    let delayedMessage = null;
    f.app.gamebar = {
      clickSfx() {},
      enqueueTalkMessage(message) {
        if (kind !== "delayed") assert.fail("ABI is not closed");
        delayedMessage = message;
      },
      syncClock() {},
    };
    if (kind === "return" || kind === "capture") {
      if (kind === "capture") f.sc.factions[1].capital = null;
      assert.throws(
        () => dispatchLegionFate(f.sc, f.A, 2, { nextByte: () => 0 }, f.app),
        /TALK31|TALK33/,
      );
      assert.equal(f.A.status, kind === "return" ? 8 : 0);
    } else {
      f.A.status = 8;
      f.sc.legionSlotCounters[0] = 1;
      assert.equal(slot(f), "pending");
      assert.equal(delayedMessage?.talkIndex, 35);
      assert.equal(delayedMessage?.personalitySelector, 0x198);
      assert.equal(canSnapshotState(f.app), false);
      assert.equal(f.A.status, 0);
      assert.equal(f.sc.generals[0].status, 0);
      delayedMessage.onComplete();
      assert.equal(f.app._legionSlotBatch, null);
      assert.equal(canSnapshotState(f.app), true);
      continue;
    }
    assert.equal(canSnapshotState(f.app), false);
    assert.equal(f.app.clock.hold, true);
  }
});

test("battle fate channel threads blocks: 2977 yields fate-suspended, not TALK31 stop", async () => {
  const f = await fixture({ player: 1, command: 10 });
  const seen = [];
  const out = performScenarioLegionFate(
    f.sc,
    f.A,
    f.context,
    "291A",
    2,
    { nextByte: () => 0 },
    {
      onPlayerFateMessage: (message) => {
        seen.push(message);
        return "fate-suspended";
      },
    },
  );
  assert.equal(out, "fate-suspended");
  assert.deepEqual(seen, [{ talk: 31, slot: 0 }]);
  assert.equal(f.A.status, 8);
});

test("battle fate suspend enqueues exact TALK shape; 34 alone takes 19A", async () => {
  const queued = [];
  const ticket = { completed: true }; // stale: completion claim is a safe no-op
  const sc = { generals: { 5: { name: "  G5 " } } };
  const batch = { ticket, scenario: sc, clock: {} };
  const app = {
    scenario: sc,
    clock: batch.clock,
    _legionSlotBatch: batch,
    gamebar: {
      enqueueTalkMessage(message) {
        queued.push(message);
      },
    },
  };
  for (const talk of [31, 32, 33, 34, 67]) {
    assert.equal(
      suspendNativeBattleFateMessage(app, sc, { talk, slot: 5 }),
      "fate-suspended",
    );
  }
  assert.deepEqual(
    queued.map((message) => message.talkIndex),
    [31, 32, 33, 34, 67],
  );
  for (const message of queued) {
    assert.equal(message.kind, "postbattle-fate");
    assert.equal(message.generalName, "G5");
    assert.equal(typeof message.onComplete, "function");
    if (message.talkIndex === 34)
      assert.equal(message.personalitySelector, 0x19a);
    else assert.equal("personalitySelector" in message, false);
    message.onComplete(); // stale ticket: must not throw, must not run pump
  }
  assert.equal(ticket.completed, true);
  assert.throws(
    () => suspendNativeBattleFateMessage({ scenario: sc }, sc, { talk: 31, slot: 5 }),
    /has no UI/,
  );
});

test("player disband 464B: 5E80 HUD gate is display-only, rules complete normally", async () => {
  // 4641..4650：旧属主==cs:[CFF] 时 CALL 5E80(AL=8) 仅刷新玩家 HUD 资金面板；
  // P32 写集审计实锤 5E80 全树零规则写入、零 RNG，4650 直接 RET。
  const f = await fixture({ player: 1, command: 11 });
  f.app.gamebar = {
    enqueueTalkMessage() {
      assert.fail("5E80 HUD refresh is display-only, no TALK message");
    },
  };
  assert.equal(slot(f), "returned");
  assert.equal(f.A.status, 0);
  assert.equal(f.sc.generals[0].status, 0);
  assert.equal(f.app._strategicBattleFailure, undefined);
  assert.equal(canSnapshotState(f.app), true);
});

test("native save rejects lossy explicit fate fields while missing inputs stay unknown", async () => {
  for (const value of [undefined, null, NaN, Infinity, -1, 256]) {
    for (const field of [
      "nativeGeneralCount",
      "nativeFateDisplayFlags",
      "battle_rating",
    ]) {
      const f = await fixture();
      const target =
        field === "nativeGeneralCount"
          ? f.sc.factions[1]
          : field === "battle_rating"
            ? f.sc.generals[0]
            : f.sc;
      target[field] = value;
      assert.throws(() => snapshotState(f.app, 0, "invalid"), /native fate/);
    }
  }
  const f = await fixture();
  const saved = json(snapshotState(f.app, 0, "valid"));
  saved.state.factions[1].nativeGeneralCount = null;
  saved.state.nativeFactionSlots.records[1].nativeGeneralCount = null;
  assert.throws(
    () => restoreSnapshotState(saved),
    /native fate|存檔的軍團調度/,
  );
  delete f.sc.nativeFateDisplayFlags;
  const clean = json(snapshotState(f.app, 0, "unknown"));
  assert.equal(
    Object.hasOwn(restoreSnapshotState(clean), "nativeFateDisplayFlags"),
    false,
  );
  assertPlayableScenario(readSavedAssembly(clean)); // P58 flip: v2 enters play
});

test("unknown585F/event fields and unsupported native owner writers reject before mutation, RNG and payment", async () => {
  for (const run of [
    (f) => processMonthlyGeneralFates(f.app),
    (f) => tickStrategicWarEvents(f.app),
    (f) =>
      settleFactionNegotiation(f.app, {
        recipientFaction: f.sc.factions[1],
        requesterFaction: f.sc.factions[2],
        outcome: 1,
        goldRequired: 100,
      }),
  ]) {
    const f = await fixture();
    const before = json(f.sc);
    f.app.originalRng = {
      nextByte() {
        assert.fail("unknown lifecycle RNG");
      },
    };
    assert.throws(
      () => run(f),
      /native general lifecycle|Uncovered fate|Uncovered native event/,
    );
    assert.deepEqual(json(f.sc), before);
    assert.equal(canSnapshotState(f.app), false);
  }
});

test("real field battle474A failure imports291A and returns without legacy fate", async () => {
  const f = await fixture({
    change(sc) {
      sc.generals[0].battle_rating = 255;
      sc.legions.push({ ...sc.legions[0], slot: 1, faction: 2, generalIdx: 1 });
      sc.generals[1].faction = 2;
      sc.factions[2].n_legions = 1;
      sc.cities[0].faction = 2;
    },
  });
  const calls = f.app.originalRng.calls;
  applyFieldBattleResult(
    f.app,
    f.A,
    other(f),
    "def",
    600,
    600,
    Array(6).fill(100),
    Array(6).fill(100),
    {
      strategicRng: f.app.originalRng,
      sides: [
        { troops: 600, units: Array(6).fill(100), morale: 0 },
        { troops: 600, units: Array(6).fill(100), morale: 200 },
      ],
    },
  );
  assert.equal(f.A.status, 8);
  assert.equal(f.sc.legionSlotCounters[0], 48);
  assert.equal(other(f).status, 0xc0);
  assert.equal(other(f).commandState, 8);
  assert.equal(f.sc.factions[1].n_legions, 0);
  assert.equal(f.app.originalRng.calls, calls + 1);
  assert.equal(mem(f), 255);
  assert.equal(slot(f), "returned");
  assert.equal(f.sc.legionSlotCounters[0], 47);
});

test("native inactive291A does not require owner/general/display; copied SI rejected", async () => {
  const f = await fixture();
  f.A.status = 0;
  delete f.A.faction;
  delete f.sc.nativeFateDisplayFlags;
  delete f.sc.generals[0];
  assert.equal(dispatchLegionFate(f.sc, f.A, 2), "inactive");
  assert.throws(() => dispatchLegionFate(f.sc, { ...f.A }, 2), /unique SI/);
});

test("463E missing occupancy fails after teams/status/general; current tail never runs", async () => {
  const f = await fixture({
    command: 11,
    change(sc) {
      sc.legions[0].occupancyOffset = 1;
      sc.legions[0].occupancyRowParagraph = 0;
      sc.legionSlotCounters[0] = 77;
    },
  });
  assert.equal(slot(f), "failed");
  assert.equal(f.A.status, 0);
  assert.equal(f.sc.generals[0].status, 0);
  assert.equal(f.sc.factions[1].reserve_inf, 600);
  assert.equal(f.sc.legionSlotCounters[0], 77);
  assert.equal(canSnapshotState(f.app), false);
});

test("new chapter never inherits runtime F18/display inputs from template", () => {
  const sc = createNewGameScenario({
    legions: [],
    factions: [{ idx: 0, n_legions: 0, nativeGeneralCount: 77 }],
    nativeFateDisplayFlags: 4,
  });
  assert.equal(Object.hasOwn(sc, "nativeFateDisplayFlags"), false);
  assert.equal(Object.hasOwn(sc.factions[0], "nativeGeneralCount"), false);
});

test("47BB edge high-cost4801 preserves road residues and rejoins outer occupancy tail", async () => {
  const f = await fixture({
    change(sc, graph) {
      graph.nodes[1].edgeSlots[1] = 0x4810;
      graph.nodes[2].edgeSlots[0] = 0x8810;
      graph.edges.push({
        id: 1,
        source: 1,
        target: 2,
        weight: 1,
        bounds: { minX: 2, maxX: 3, minY: 12, maxY: 12 },
        points: [
          { x: 2, y: 12, flags: 0x44 },
          { x: 3, y: 12, flags: 4 },
        ],
      });
      Object.assign(sc.legions[0], {
        status: 0xc3,
        roadEdgeOrNode: 0x800,
        roadPointAddress: 0x2000,
        roadStride: 4,
        targetCity: 2,
        targetNode: 2,
      });
      sc.cities[2].faction = 2;
    },
  });
  assert.equal(
    slot(f),
    "returned",
    f.app._strategicBattleFailure?.error?.message,
  );
  assert.equal(f.A.status, 8);
  assert.equal(f.A.roadEdgeOrNode, 0x800);
  assert.equal(f.A.roadPointAddress, 0x2000);
  assert.equal(f.A.roadStride, 4);
  assert.equal(mem(f), 255);
  assert.equal(f.sc.legionSlotCounters[0], 0);
});

test("capture F18 and same-general state roundtrip through actual JSON save/prepare", async () => {
  let f = await fixture();
  f.sc.factions[1].capital = null;
  dispatchLegionFate(f.sc, f.A, 2, null, f.app);
  f = await restored(f);
  assert.equal(f.sc.factions[1].nativeGeneralCount, 9);
  assert.equal(f.sc.factions[2].nativeGeneralCount, 10);
  assert.equal(f.sc.factions[1].n_generals, 99);
  assert.equal(f.sc.generals[0].status, 4);
  assert.equal(f.sc.generals[0].faction, 2);
  assert.equal(f.sc.generals[0].origFaction, 1);
  assert.equal(f.A.status, 0);
  assert.equal(mem(f), 255);
  assert.equal(slot(f), "returned");
  assert.equal(f.sc.factions[1].nativeGeneralCount, 9);
});

// Direct existing type9 handler, NOT a returned native1D8E/month/event pump.
test("native3485 handler returns same/different/FF current owners without touching legion or old-side F18", async () => {
  for (const current of [1, 2, null, 255, 0x18, undefined]) {
    const f = await fixture();
    f.A.generalIdx = 77; // Not the event general and not an identity source.
    const general = f.sc.generals[0];
    Object.assign(general, {
      attr: 0,
      active: false,
      faction: current,
      origFaction: 1,
      status: 4,
    });
    if (current === undefined) delete general.faction;
    f.sc.factions[1].nativeGeneralCount = 255;
    const expected = json(f.sc);
    Object.assign(expected.generals[0], {
      status: 0,
      origFaction: null,
      captive_flag: 255,
      faction: 1,
    });
    expected.factions[1].nativeGeneralCount = 0;
    expected.nativeFactionSlots.records[1].nativeGeneralCount = 0;
    const calls = f.app.originalRng.calls;
    const occupancy = mem(f);
    assert.equal(dispatchGeneralFateEvent(f.app, { type: 9, arg0: 0 }), true);
    assert.deepEqual(json(f.sc), expected);
    assert.equal(mem(f), occupancy);
    assert.equal(f.app.originalRng.calls, calls);
    assert.equal(canSnapshotState(f.app), true);
  }
});

test("native3485 original inactive faction returns unaffiliated with no F18 read and zero RNG", async () => {
  const f = await fixture();
  f.sc.generals[0].origFaction = 1;
  f.sc.factions[1].attr = 0x7f;
  f.sc.factions[1].active = true; // Projection cannot override original byte.
  delete f.sc.factions[1].nativeGeneralCount;
  delete f.sc.nativeFateDisplayFlags; //50D7 does not read98A6.
  const calls = f.app.originalRng.calls;
  assert.equal(dispatchGeneralFateEvent(f.app, { type: 9, arg0: 0 }), true);
  assert.equal(f.sc.generals[0].faction, null);
  assert.equal(f.sc.generals[0].status, 0);
  assert.equal(f.sc.generals[0].origFaction, null);
  assert.equal(Object.hasOwn(f.sc.factions[1], "nativeGeneralCount"), false);
  assert.equal(f.app.originalRng.calls, calls);
});

test("native3485 player message and FF/18 original aliases fail with committed prefix, hold and no fake FIFO", async () => {
  for (const origin of [0, null, 255, 0x18]) {
    const f = await fixture();
    f.sc.generals[0].origFaction = origin;
    const before = json(f.sc);
    f.app.gamebar = {
      enqueueTalkMessage() {
        assert.fail("unclosed message must not enqueue");
      },
    };
    const calls = f.app.originalRng.calls;
    assert.throws(
      () => dispatchGeneralFateEvent(f.app, { type: 9, arg0: 0 }),
      origin === 0 ? /5101/ : /50EB/,
    );
    Object.assign(before.generals[0], {
      status: 0,
      origFaction: null,
      captive_flag: 255,
    });
    if (origin === 0) {
      before.generals[0].faction = 0;
      before.factions[0].nativeGeneralCount++;
      before.nativeFactionSlots.records[0].nativeGeneralCount++;
    }
    assert.deepEqual(json(f.sc), before);
    assert.equal(f.app.originalRng.calls, calls);
    assert.equal(f.app.clock.hold, true);
    assert.equal(canSnapshotState(f.app), false);
    assert.throws(() => snapshotState(f.app, 0, "stopped"), /cannot save/);
  }
});

test("native3485 strict same-general and own input validation; no active/raw/captive fallback", async () => {
  for (const kind of [
    "event",
    "index",
    "identity",
    "origin",
    "attr",
    "count",
    "player",
  ]) {
    const f = await fixture();
    const general = f.sc.generals[0];
    general.origFaction = 1;
    const event = { type: 9, arg0: 0 };
    if (kind === "event") delete event.arg0;
    if (kind === "index") event.arg0 = "0";
    if (kind === "identity") general.idx = 1;
    if (kind === "origin") {
      delete general.origFaction;
      general.captive_flag = 1;
    }
    if (kind === "attr") {
      delete f.sc.factions[1].attr;
      f.sc.factions[1].raw = [128];
    }
    if (kind === "count") {
      delete f.sc.factions[1].nativeGeneralCount;
      f.sc.factions[1].raw = Array(25).fill(99);
    }
    if (kind === "player") delete f.sc.player_faction;
    assert.throws(
      () => dispatchGeneralFateEvent(f.app, event),
      /Uncovered fate/,
    );
    assert.equal(
      general.status,
      ["event", "index", "identity"].includes(kind) ? 1 : 0,
    );
    assert.equal(
      general.origFaction,
      ["event", "index", "identity"].includes(kind)
        ? 1
        : kind === "origin"
          ? undefined
          : null,
    );
    assert.equal(
      f.sc.factions[1].nativeGeneralCount,
      kind === "count" ? undefined : kind === "player" ? 11 : 10,
    );
    assert.equal(f.sc.factions[1].n_generals, 99);
    assert.equal(f.app.clock.hold, true);
    assert.equal(canSnapshotState(f.app), false);
  }
});

test("native3485 slot127 and returned F18 persist through real JSON snapshot/restore/prepare", async () => {
  let f = await fixture();
  const general = f.sc.generals[127];
  Object.assign(general, { active: false, attr: 0, origFaction: 2, status: 4 });
  f.sc.factions[2].nativeGeneralCount = 255;
  delete f.sc.factions[1].nativeGeneralCount; // Unconsumed old owner stays unknown.
  const before = json(f.sc.nativeLegionSlots);
  assert.equal(dispatchGeneralFateEvent(f.app, { type: 9, arg0: 127 }), true);
  f = await restored(f);
  assert.equal(f.sc.generals[127].faction, 2);
  assert.equal(f.sc.generals[127].origFaction, null);
  assert.equal(f.sc.generals[127].status, 0);
  assert.equal(f.sc.factions[2].nativeGeneralCount, 0);
  assert.equal(Object.hasOwn(f.sc.factions[1], "nativeGeneralCount"), false);
  assert.deepEqual(json(f.sc.nativeLegionSlots), before);
  // Saving a successful result is not permission to replay the consumed event.
  assert.throws(
    () => dispatchGeneralFateEvent(f.app, { type: 9, arg0: 127 }),
    /50EB/,
  );
  assert.equal(f.sc.factions[2].nativeGeneralCount, 0);
});

test("native3485 newly consumed owner fields reject lossy JSON values without creating authority", async () => {
  for (const value of [undefined, NaN, Infinity, -1, 256, "1"]) {
    const f = await fixture();
    f.sc.generals[0].origFaction = value;
    assert.throws(
      () => snapshotState(f.app, 0, "invalid-origin"),
      /native fate/,
    );
    f.sc.generals[0].origFaction = 1;
    const saved = json(snapshotState(f.app, 0, "valid-origin"));
    saved.state.generals[0].origFaction = value;
    assert.throws(() => restoreSnapshotState(saved), /native fate/);
  }
});

test("legacy3485 handler retains its existing active-general and owned-capital gates", () => {
  const general = {
    idx: 0,
    active: true,
    status: 4,
    faction: 2,
    origFaction: 1,
  };
  const app = {
    scenario: {
      player_faction: 0,
      generals: [general],
      factions: [{ idx: 1, active: true, attr: 128, capital: 0 }],
      cities: [{ faction: 1 }],
    },
  };
  assert.equal(dispatchGeneralFateEvent(app, { type: 9, arg0: 0 }), true);
  assert.equal(general.faction, 1);
  assert.equal(general.status, 0);
  assert.equal(general.origFaction, null);
  general.active = false;
  general.status = 4;
  assert.equal(dispatchGeneralFateEvent(app, { type: 9, arg0: 0 }), false);
  assert.equal(general.status, 4);
});

async function recruitmentFixture(random = 0, preferred = 1) {
  const f = await monthlyFixture(random);
  Object.assign(f.sc.generals[0], { faction: null, join_faction: preferred });
  f.sc.nativePlayerFactionPointer = 0xffff;
  return f;
}

// Real processMonthlyGeneralFates, not a parallel recruitment handler.
test("native5899 preferred joins through585F and JSON restore without G17/G1D or legacy count writes", async () => {
  let f = await recruitmentFixture();
  f.sc.factions[1].nativeGeneralCount = 255;
  f.sc.factions[1].n_cities = 0; // Stored byte need not equal actual city count.
  const before = json(f.sc);
  assert.deepEqual(processMonthlyGeneralFates(f.app), []);
  Object.assign(before.generals[0], { faction: 1, join_faction: null });
  before.factions[1].nativeGeneralCount = 0;
  before.nativeFactionSlots.records[1].nativeGeneralCount = 0;
  assert.deepEqual(json(f.sc), before);
  assert.equal(f.randomCalls, 1);
  const rng = f.app.originalRng.snapshot();
  f = await restored(f);
  assert.equal(f.sc.nativePlayerFactionPointer, 0xffff);
  assert.equal(f.sc.generals[0].join_faction, null);
  assert.equal(f.sc.generals[0].faction, 1);
  assert.equal(f.sc.generals[0].status, 4);
  assert.equal(f.sc.generals[0].origFaction, 2);
  assert.equal(f.sc.factions[1].nativeGeneralCount, 0);
  assert.equal(f.sc.factions[1].n_cities, 0);
  assert.deepEqual(f.saved.webMeta.originalRng, rng);
  f.app.originalRng = new OriginalBattleRng().restore(
    f.saved.webMeta.originalRng,
  );
  assert.deepEqual(f.app.originalRng.snapshot(), rng);
});

test("native5899 high random/dead preferred do not require CFD or F18 and preserve scan countdown prefix", async () => {
  for (const random of [0, 64, 255]) {
    const f = await recruitmentFixture(random);
    delete f.sc.nativePlayerFactionPointer;
    delete f.sc.factions[1].nativeGeneralCount;
    f.sc.factions[1].attr = 127;
    f.sc.generals[0].attr = 0xa0;
    Object.assign(f.sc.generals[1], { attr: 128, appear_months: 1 });
    assert.deepEqual(processMonthlyGeneralFates(f.app), []);
    assert.equal(f.sc.generals[0].attr, random < 64 ? 0 : 0xa0);
    assert.equal(f.sc.generals[0].active, false);
    assert.equal(f.sc.generals[0].join_faction, random < 64 ? null : 1);
    assert.equal(f.sc.generals[1].appear_months, 0);
    assert.equal(f.randomCalls, 1);
  }
});

test("native5899 player recruit defers5921 message;5930 commit and585F resume after close", async () => {
  for (const playerPointer of [0, 64]) {
    const f = await recruitmentFixture();
    f.sc.nativePlayerFactionPointer = playerPointer;
    f.sc.player_faction = 1; // CFF cannot determine this comparison.
    const messages = [];
    f.app.gamebar = { enqueueTalkMessage: (m) => messages.push(m) };
    if (playerPointer === 64) {
      Object.assign(f.sc.generals[1], { attr: 128, appear_months: 3 });
      let tail = 0;
      assert.equal(
        processMonthlyGeneralFates(f.app, () => tail++),
        "suspended",
      );
      // 前缀保留：G19已清、RNG已消；owner/F18在5921消息返回前不写。
      assert.equal(f.sc.generals[0].faction, null);
      assert.equal(f.sc.factions[1].nativeGeneralCount, 10);
      assert.equal(f.randomCalls, 1);
      assert.equal(f.app._strategicEventPostMessageRngPending, true);
      assert.equal(canSnapshotState(f.app), false);
      assert.throws(() => processMonthlyGeneralFates(f.app), /already pending/);
      assert.equal(messages.length, 1);
      assert.equal(messages[0].talkIndex, 41);
      assert.equal(messages[0].gen, f.sc.generals[0]);
      assert.deepEqual(
        (({ scenario: _s, deferredTail: _t, ...rest }) => rest)(
          f.app._nativeMonthlyFateContinuation,
        ),
        { kind: "recruit-join", slot: 0, owner: 1, talkIndex: 41 },
      );
      messages[0].onClose(); // CDE+8810返回：5930写owner/F18，从slot+1续扫
      assert.equal(f.sc.generals[0].faction, 1);
      assert.equal(f.sc.factions[1].nativeGeneralCount, 11);
      assert.equal(f.sc.generals[1].appear_months, 2); // 585F从slot+1重入
      assert.equal(f.randomCalls, 1); // 续扫无新RNG
      assert.equal(f.app._nativeMonthlyFateContinuation, null);
      assert.equal(f.app._strategicEventPostMessageRngPending, false);
      assert.equal(tail, 1); // 月结剩余步延后到消息返回后
      // 上面故意失败的再入仍按故障合同保持hold/禁存（干净完成后的可存档
      // 由5990测试覆盖）。
      assert.equal(f.app.clock.hold, true);
      assert.ok(f.app._strategicBattleFailure);
      assert.equal(canSnapshotState(f.app), false);
    } else {
      processMonthlyGeneralFates(f.app);
      assert.equal(f.sc.generals[0].faction, 1);
      assert.equal(f.sc.factions[1].nativeGeneralCount, 11);
      assert.equal(messages.length, 0);
    }
    assert.equal(f.sc.generals[0].join_faction, null);
    assert.equal(f.randomCalls, 1);
  }
});

test("native5899 no-target fixed22 and rare F23 use stored bytes, not live-city/UI counts", async () => {
  for (const random of [0, 22, 23, 46, 47, 63, 255]) {
    const f = await recruitmentFixture(random, null);
    for (let idx = 3; idx < 22; idx++)
      Object.assign(f.sc.nativeFactionSlots.records[idx], {
        attr: 128,
        nativeGeneralCount: 10,
      });
    f.sc.nativePlayerFactionPointer = 0;
    f.sc.factions[0].n_cities = 0;
    // citiesOf(0) can be anything; the rare gate reads explicit F23=0/F18=10.
    assert.deepEqual(processMonthlyGeneralFates(f.app), []);
    const selection = (random & 63) + 1;
    assert.equal(
      f.sc.generals[0].faction,
      selection >= 48 ? null : selection >= 24 ? 21 : (21 + selection - 1) % 22,
    );
    assert.equal(f.randomCalls, 1);
  }
});

test("native5899 missing/invalid operands and all-inactive preserve prefixes, hold and forbid JSON save", async () => {
  for (const kind of [
    "pointer",
    "count",
    "attr",
    "alias",
    "inactive-ring",
    "cities",
  ]) {
    const noTarget = kind === "inactive-ring" || kind === "cities";
    const f = await recruitmentFixture(
      kind === "cities" ? 47 : 0,
      noTarget ? null : 1,
    );
    if (kind === "pointer") delete f.sc.nativePlayerFactionPointer;
    if (kind === "count") delete f.sc.factions[1].nativeGeneralCount;
    if (kind === "attr") delete f.sc.factions[1].attr;
    if (kind === "alias") f.sc.generals[0].join_faction = 24;
    if (noTarget) {
      for (const faction of f.sc.nativeFactionSlots.records) faction.attr = 0;
      f.sc.nativePlayerFactionPointer = 0;
      if (kind === "cities") delete f.sc.factions[0].n_cities;
      f.sc.factions[0].raw = Array(64).fill(0); // Never a F23 fallback.
    }
    assert.throws(
      () => processMonthlyGeneralFates(f.app),
      /Uncovered fate/,
      kind,
    );
    assert.equal(f.sc.generals[0].join_faction, null);
    assert.equal(f.sc.generals[0].faction, kind === "count" ? 1 : null);
    assert.equal(f.randomCalls, 1, kind);
    assert.equal(f.app.clock.hold, true);
    assert.equal(canSnapshotState(f.app), false);
    assert.throws(
      () => snapshotState(f.app, 0, "recruit-prefix"),
      /cannot save/,
    );
  }
});

test("native5899 optional CFD/F23 JSON contract rejects lossy values and never derives/backfills fields", async () => {
  for (const [field, values] of [
    [
      "nativePlayerFactionPointer",
      [undefined, null, NaN, Infinity, -1, 65536, 0.5, "64"],
    ],
    ["n_cities", [undefined, null, NaN, Infinity, -1, 256, 0.5, "0"]],
  ]) {
    for (const value of values) {
      const f = await recruitmentFixture();
      const saved = json(snapshotState(f.app, 0, "valid-pointer"));
      (field === "n_cities" ? f.sc.factions[0] : f.sc)[field] = value;
      assert.throws(
        () => snapshotState(f.app, 0, "invalid-pointer"),
        /native fate/,
      );
      (field === "n_cities" ? saved.state.factions[0] : saved.state)[field] =
        value;
      if (field === "n_cities")
        saved.state.nativeFactionSlots.records[0][field] = value;
      assert.throws(
        () => restoreSnapshotState(saved),
        /native fate|native faction|存檔的軍團調度/,
      );
    }
  }
  let f = await recruitmentFixture();
  delete f.sc.nativePlayerFactionPointer;
  f = await restored(f);
  assert.equal(Object.hasOwn(f.sc, "nativePlayerFactionPointer"), false);
  assert.equal(f.sc.factions[0].n_cities, 0);
  for (const pointer of [0, 1, 0x600, 65535]) {
    f.sc.nativePlayerFactionPointer = pointer;
    f.sc.factions[0].n_cities = 255;
    f = await restored(f);
    assert.equal(f.sc.nativePlayerFactionPointer, pointer);
    assert.equal(f.sc.factions[0].n_cities, 255);
  }
  const fresh = createNewGameScenario({
    nativePlayerFactionPointer: 64,
    player_faction: 1,
    factions: [{ idx: 1, n_cities: 7, n_legions: 0 }],
    legions: [],
  });
  assert.equal(Object.hasOwn(fresh, "nativePlayerFactionPointer"), false);
  assert.equal(fresh.factions[0].n_cities, 7); // Imported original byte preserved.
});

async function monthlyFixture(random = 0) {
  const f = await fixture();
  for (const g of f.sc.generals) g.attr = 0; // Explicit inactive bytes, not projected active.
  Object.assign(f.sc.generals[0], {
    attr: 128,
    active: false,
    appear_months: 0,
    faction: 1,
    origFaction: 2,
    join_faction: 1,
    status: 4,
  });
  f.sc.strategicEventSlots = Array(256).fill(null);
  f.sc._strategicEventCursor = 2;
  // Explicit synthetic RNG byte at the next canonical index; no replacement stream.
  const rng = f.app.originalRng;
  rng.table[rng.index] = (random - rng.addend) & 255;
  Object.defineProperty(f, "randomCalls", { get: () => rng.calls });
  return f;
}

test("native585F real caller joins or leaves mismatch alone; sole F18 and fixed127 ignore UI activity", async () => {
  for (const match of [false, true]) {
    const f = await monthlyFixture(32);
    f.sc.generals[0].join_faction = match ? 1 : 2;
    f.sc.factions[1].nativeGeneralCount = 255;
    f.sc.generals[127].attr = 128; // Missing G18 must not be consumed here.
    const before = json(f.sc);
    assert.deepEqual(processMonthlyGeneralFates(f.app), []);
    if (match) {
      Object.assign(before.generals[0], {
        origFaction: null,
        captive_flag: 255,
        status: 0,
      });
      before.factions[1].nativeGeneralCount = 0;
      before.nativeFactionSlots.records[1].nativeGeneralCount = 0;
    }
    assert.deepEqual(json(f.sc), before);
    assert.equal(f.randomCalls, 1);
    assert.equal(f.sc.factions[1].n_generals, 99);
    assert.equal(canSnapshotState(f.app), true);
  }
});

test("native5940 delayed301C uses own wheel, full queue still writes18, then explicit3485 consumes without RNG", async () => {
  for (const full of [false, true]) {
    let f = await monthlyFixture(15);
    if (full)
      f.sc.strategicEventSlots.fill({
        type: 255,
        arg0: 0,
        arg1: 0,
        arg2: 0,
      });
    else
      f.sc.strategicEventSlots[25] = {
        type: 8,
        arg0: 0,
        arg1: 0,
        arg2: 0,
      }; // cursor2 + delay23; search to26.
    const slotsBefore = json(f.sc.nativeLegionSlots);
    const count = f.sc.factions[2].nativeGeneralCount;
    const event = { type: 9, arg0: 0, arg1: 255, arg2: 255 };
    assert.deepEqual(processMonthlyGeneralFates(f.app), full ? [] : [event]);
    assert.equal(f.sc.generals[0].faction, 24);
    assert.equal(f.sc.generals[0].origFaction, 2);
    assert.equal(f.sc.generals[0].status, 4);
    assert.equal(f.randomCalls, 1);
    assert.equal(f.sc._strategicEventCursor, 2);
    assert.equal(f.sc.factions[2].nativeGeneralCount, count);
    const afterRng = f.app.originalRng.snapshot();
    f = await restored(f);
    assert.deepEqual(f.saved.webMeta.originalRng, afterRng);
    f.app.originalRng = new OriginalBattleRng().restore(
      f.saved.webMeta.originalRng,
    );
    assert.deepEqual(f.app.originalRng.snapshot(), afterRng);
    assert.equal(f.sc.generals[0].faction, 24);
    assert.equal(f.sc._strategicEventCursor, 2);
    assert.deepEqual(json(f.sc.nativeLegionSlots), slotsBefore);
    if (!full) {
      assert.deepEqual(f.sc.strategicEventSlots[26], event);
      const rng = f.app.originalRng.snapshot();
      dispatchGeneralFateEvent(f.app, f.sc.strategicEventSlots[26]);
      assert.equal(f.sc.generals[0].faction, 2);
      assert.equal(f.sc.factions[2].nativeGeneralCount, count + 1);
      assert.deepEqual(f.app.originalRng.snapshot(), rng);
    }
  }
});

test("native5990 player notice defers;598A/续扫严格在消息返回后", async () => {
  for (const random of [0, 32]) {
    const f = await monthlyFixture(random);
    f.sc.player_faction = 1;
    Object.assign(f.sc.generals[1], { attr: 128, appear_months: 9 });
    const messages = [];
    f.app.gamebar = { enqueueTalkMessage: (m) => messages.push(m) };
    let tail = 0;
    assert.equal(
      processMonthlyGeneralFates(f.app, () => tail++),
      "suspended",
    );
    assert.equal(f.sc.generals[0].faction, 1);
    assert.equal(f.sc.factions[1].nativeGeneralCount, random === 32 ? 11 : 10);
    assert.equal(f.randomCalls, 1);
    if (random === 0) {
      assert.deepEqual(f.sc.strategicEventSlots[10], {
        type: 9,
        arg0: 0,
        arg1: 255,
        arg2: 255,
      });
      assert.equal(f.sc.generals[0].origFaction, 2); // 598A/归宿写在返回后
      assert.equal(
        f.app._nativeMonthlyFateContinuation.kind,
        "captive-pending",
      );
      assert.equal(messages[0].talkIndex, 65);
    } else {
      assert.equal(f.sc.generals[0].origFaction, null); // 5956写在消息前
      assert.equal(f.app._nativeMonthlyFateContinuation.kind, "captive-joined");
      assert.equal(messages[0].talkIndex, 66);
    }
    assert.equal(f.app._strategicEventPostMessageRngPending, true);
    assert.equal(canSnapshotState(f.app), false);
    assert.throws(
      () => snapshotState(f.app, 0, "message-prefix"),
      /cannot save/,
    );
    messages[0].onClose(); // 8810返回：pending径598A写0x18，续扫slot+1
    assert.equal(f.sc.generals[0].faction, random === 32 ? 1 : 24);
    assert.equal(f.sc.generals[1].appear_months, 8);
    assert.equal(f.randomCalls, 1);
    assert.equal(f.app._nativeMonthlyFateContinuation, null);
    assert.equal(f.app._strategicEventPostMessageRngPending, false);
    assert.equal(tail, 1);
    assert.equal(canSnapshotState(f.app), true);
  }
});

test("native585F countdown and unknown/recruitment second general retain first prefix; missing own fields never fallback", async () => {
  for (const kind of ["unknown", "recruitment", "missing-slot"]) {
    const f = await monthlyFixture(255);
    f.sc.generals[0].appear_months = 1;
    if (kind === "missing-slot") delete f.sc.generals[1];
    else {
      f.sc.generals[1].attr = 128;
      if (kind === "recruitment")
        Object.assign(f.sc.generals[1], {
          appear_months: 0,
          faction: null,
          origFaction: 2,
        });
    }
    // Recruitment must reach589A's own G19 read, not merely any native error.
    const missing = {
      unknown: "appear_months",
      recruitment: "join_faction",
      "missing-slot": "same-slot general 1",
    }[kind];
    Object.assign(f.sc.generals[2], { attr: 128, appear_months: 7 });
    const expected = json(f.sc);
    expected.generals[0].appear_months = 0;
    assert.throws(
      () => processMonthlyGeneralFates(f.app),
      (error) => {
        assert.equal(error.name, "OriginalFateBoundaryError");
        assert.equal(error.instruction, "Scenario IO");
        assert.equal(
          error.message,
          `Web engineering Uncovered fate ${missing} at Scenario IO`,
        );
        return true;
      },
    );
    assert.deepEqual(json(f.sc), expected); // Only first G18 DEC; no G19/owner/F18/event or later scan writes.
    assert.equal(f.sc.generals[2].appear_months, 7);
    assert.equal(f.sc.generals[0].appear_months, 0);
    assert.equal(f.sc.generals[0].faction, 1);
    assert.equal(f.randomCalls, 0);
    assert.equal(f.app.clock.hold, true);
    assert.equal(canSnapshotState(f.app), false);
  }
  for (const field of [
    "attr",
    "appear_months",
    "faction",
    "origFaction",
    "join_faction",
  ]) {
    const f = await monthlyFixture(32);
    delete f.sc.generals[0][field];
    f.sc.generals[0].captive_flag = 2;
    const before = json(f.sc);
    assert.throws(
      () => processMonthlyGeneralFates(f.app),
      (error) => {
        assert.equal(error.name, "OriginalFateBoundaryError");
        assert.equal(error.instruction, "Scenario IO");
        assert.equal(
          error.message,
          `Web engineering Uncovered fate ${field} at Scenario IO`,
        );
        return true;
      },
    );
    assert.deepEqual(json(f.sc), before);
    assert.equal(f.sc.factions[1].nativeGeneralCount, 10);
    assert.equal(f.randomCalls, field === "join_faction" ? 1 : 0);
    assert.equal(f.app.clock.hold, true);
  }
});

test("native301C word cursor wrap, out-of-buffer first probe, missing queue/type and no legacy ensure", async () => {
  const wrapped = await monthlyFixture(0);
  wrapped.sc._strategicEventCursor = 16376; // D20=FFE0 +32 wraps0.
  assert.equal(processMonthlyGeneralFates(wrapped.app).length, 1);
  assert.equal(wrapped.sc.strategicEventSlots[0].type, 9);
  assert.equal(wrapped.sc._strategicEventCursor, 16376);
  for (const kind of [
    "cursor",
    "queue",
    "hole",
    "type",
    "beyond",
    "bad-cursor",
  ]) {
    const f = await monthlyFixture();
    if (kind === "cursor") delete f.sc._strategicEventCursor;
    if (kind === "queue") delete f.sc.strategicEventSlots;
    if (kind === "hole") delete f.sc.strategicEventSlots[10];
    if (kind === "type") f.sc.strategicEventSlots[10] = { arg0: 0 };
    if (kind === "beyond") f.sc._strategicEventCursor = 248; // probes400 BEFORE bounds.
    if (kind === "bad-cursor") f.sc._strategicEventCursor = "2";
    assert.throws(() => processMonthlyGeneralFates(f.app), /Uncovered fate/);
    assert.equal(f.sc.generals[0].faction, 1);
    assert.equal(f.randomCalls, 1);
    assert.equal(f.app.clock.hold, true);
    assert.equal(canSnapshotState(f.app), false);
  }
  for (const [run, error, commitsReset] of [
    [
      (f) => enqueueDelayedStrategicEvent(f.app, { type: 9 }, 8),
      /legacy event wheel/,
      false,
    ],
    [
      (f) => monthlyDiplomacyAI(f.app),
      /monthly diplomacy strategicEventSlots/,
      true,
    ],
    [(f) => hasPendingStrategicEvent(f.sc, 9), /legacy event wheel/, false],
  ]) {
    const f = await monthlyFixture();
    delete f.sc.strategicEventSlots;
    delete f.sc._strategicEventCursor;
    const before = json(f.sc);
    assert.throws(() => run(f), error);
    if (commitsReset) {
      before._strategicEventCursor = 0;
      before._strategicEventDivider = 7;
    }
    assert.deepEqual(json(f.sc), before);
    assert.equal(f.randomCalls, 0);
  }
});

test("native301C both MOV-word failures retain exact prefixes, hold, forbid saving and later owner writes", async () => {
  for (const failOn of [1, 2]) {
    const f = await monthlyFixture();
    let writes = 0;
    let value = { type: 0, arg1: 19 }; // arg2 unknown; never prefill it.
    Object.defineProperty(f.sc.strategicEventSlots, 10, {
      enumerable: true,
      configurable: true,
      get() {
        return value;
      },
      set(next) {
        if (++writes === failOn) throw new Error("injected queue word");
        value = next;
      },
    });
    assert.throws(
      () => processMonthlyGeneralFates(f.app),
      /injected queue word/,
    );
    assert.deepEqual(
      value,
      failOn === 1 ? { type: 0, arg1: 19 } : { type: 9, arg0: 0, arg1: 19 },
    );
    assert.equal(Object.hasOwn(value, "arg2"), false);
    assert.equal(f.sc.generals[0].faction, 1);
    assert.equal(f.app.clock.hold, true);
    assert.equal(canSnapshotState(f.app), false);
  }
});

test("native monthly fixed event wheel survives JSON while unrelated optional fields stay unknown", async () => {
  let f = await monthlyFixture(255);
  delete f.sc.generals[0].join_faction;
  f.sc.strategicEventSlots[1] = { type: 9, arg0: 7, arg1: 255, arg2: 0 };
  f.sc._strategicEventCursor = 16383;
  f = await restored(f);
  assert.equal(f.sc.strategicEventSlots.length, 256);
  assert.deepEqual(f.sc.strategicEventSlots[1], {
    type: 9,
    arg0: 7,
    arg1: 255,
    arg2: 0,
  });
  assert.equal(f.sc._strategicEventCursor, 16383);
  assert.equal(Object.hasOwn(f.sc.generals[0], "join_faction"), false);

  for (const mutate of [
    (sc) => delete sc.strategicEventSlots,
    (sc) => {
      sc.strategicEventSlots.length = 3;
    },
    (sc) => {
      sc.strategicEventSlots[1] = { type: 9, arg0: 7 };
    },
  ]) {
    const bad = await monthlyFixture(255);
    mutate(bad.sc);
    assert.throws(() => snapshotState(bad.app, 0, "bad-fixed-wheel"));
  }
});

test("native monthly JSON guards reject holes, undefined and malformed bytes/cursors on snapshot AND restore", async () => {
  for (const mutate of [
    (sc) => {
      sc.strategicEventSlots = Array(2);
    },
    (sc) => {
      sc.strategicEventSlots = [undefined];
    },
    (sc) => {
      sc.strategicEventSlots = [{ type: NaN }];
    },
    (sc) => {
      sc.strategicEventSlots = [{ arg1: undefined }];
    },
    (sc) => {
      sc.strategicEventSlots = [{ type: 256 }];
    },
    (sc) => {
      sc._strategicEventCursor = null;
    },
    (sc) => {
      sc._strategicEventCursor = 16384;
    },
    (sc) => {
      sc.generals[0].appear_months = Infinity;
    },
    (sc) => {
      sc.generals[0].join_faction = undefined;
    },
  ]) {
    const f = await monthlyFixture();
    const saved = json(snapshotState(f.app, 0, "valid"));
    mutate(f.sc);
    assert.throws(
      () => snapshotState(f.app, 0, "invalid"),
      /native (?:fate|strategic event)/,
    );
    mutate(saved.state);
    // Test merged authority, not a stale sidecar overriding the deliberately invalid input.
    delete saved.webMeta.scenarioRuntimeState.strategicEventSlots;
    delete saved.webMeta.scenarioRuntimeState._strategicEventCursor;
    assert.throws(() => restoreSnapshotState(saved), /不完整|native/);
  }
});
