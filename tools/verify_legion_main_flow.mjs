import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { aiTick } from "../web/src/game/ai.js";
import { initializeLegionSlotState } from "../web/src/game/legionphase.js";
import { canSnapshotState } from "../web/src/game/savegame.js";
import { createStrategicBattleMethods } from "../web/src/app/battleflow.js";
import { GameBar } from "../web/src/ui/gamebar.js";
import { Clock } from "../web/src/game/clock.js";

// App uses these same imported methods. Battle construction/result calculation
// are injected doubles; the slot pump/continuation/Clock are real. This does
// not certify two tactical sessions or main's load/title/DOM lifecycle.
let data;
try {
  data = JSON.parse(
    await fs.readFile(new URL("../web/data.json", import.meta.url), "utf8"),
  );
} catch (cause) {
  throw new Error("Cannot read public Web fixture", { cause });
}
function fixture() {
  const sc = structuredClone(data.scenarios[16]);
  initializeLegionSlotState(sc);
  sc.player_faction = 17;
  sc.disasterMapObjects = [];
  sc.citiesOf = (id) => sc.cities.filter((city) => city.faction === id);
  let weather = 0;
  Object.defineProperty(sc, "weatherClouds", {
    get() {
      weather++;
      return [];
    },
  });
  const city = sc.cities[60];
  city.attr = 0;
  sc.legions = [81, 83].map((slot) => ({
    slot,
    status: 0xc1,
    faction: 13,
    generalIdx: slot,
    troops: 600,
    morale: 200,
    commandState: 1,
    moveDelay: 1,
    movePeriod: 3,
    x: city.x,
    y: city.y,
    target: city,
    targetCity: 60,
    targetNode: 60,
    roadEdgeOrNode: 480,
    units: Array.from({ length: 6 }, () => ({ type: 3, troops: 1000 })),
  }));
  sc.delayedLegionReturns = [80, 82].map((slot) => ({
    slot,
    status: 8,
    generalIdx: slot,
    faction: 17,
    dead: true,
  }));
  sc.legionSlotCounters[80] = sc.legionSlotCounters[82] = 1;
  const effects = [],
    messages = [],
    exits = [],
    draws = [];
  const options = {
    legionBatchStart: 80,
    runCityDaily: false,
    settleDaily: true,
  };
  const app = {
    scenario: sc,
    engagementFx: { reset() {} },
    score: {
      endBattle() {
        effects.push("score");
      },
    },
    hud: {
      flashEvent(text) {
        messages.push(text);
      },
      buildLegend() {},
    },
    view: { draw() {} },
    originalRng: {
      snapshot() {
        return {};
      },
      nextByte() {
        throw new Error("old RNG");
      },
    },
    battleView: {
      open(_battle, onFinish) {
        exits.push(onFinish);
        return Promise.resolve();
      },
    },
  };
  app.clock = new Clock({
    startYear: 190,
    startMonth: 1,
    onStrategicTick() {
      aiTick(app, options);
    },
    onSyncHold() {
      app.gamebar.syncClock();
    },
  });
  app.gamebar = Object.create(GameBar.prototype);
  app.gamebar.app = app;
  app.gamebar.enqueueTalkMessage = (message) => messages.push(message);
  const controls = {};
  const bindings = {
    createBattle() {
      if (controls.createError) throw controls.createError;
      return { kind: "siege" };
    },
    createFieldBattle() {
      return { kind: "field" };
    },
    classifyFieldBattleTerrain() {
      return 0;
    },
    applyBattleResult(...args) {
      effects.push(["siege", args.at(-1)]);
      controls.apply?.();
    },
    applyFieldBattleResult(...args) {
      effects.push(["field", args.at(-1)]);
      controls.apply?.();
    },
  };
  Object.assign(app, createStrategicBattleMethods(bindings));
  const rng = (value) => ({
    snapshot() {
      return { value };
    },
    nextByte() {
      draws.push(value);
      return value;
    },
  });
  return {
    app,
    sc,
    city,
    controls,
    effects,
    messages,
    exits,
    draws,
    options,
    rng,
    weather: () => weather,
  };
}

test("actual App battle callbacks resume two tickets; old exit cannot commit twice", async () => {
  const f = fixture();
  const { app, sc } = f;
  app.clock.advanceFrame(app.clock.currentStep);
  const batch = app._legionSlotBatch;
  // Both App exit routes refresh before result/fate continuation, not on open.
  sc.generals[88].battle_rating = 0;
  sc.generals[127].battle_rating = 165;
  f.controls.apply = () => {
    assert.equal(sc.generals[88].battle_rating, 40);
    assert.equal(sc.generals[127].battle_rating, 165);
  };
  await app.startBattle(sc.legions[0], f.city, null, []);
  assert.equal(sc.generals[88].battle_rating, 0);
  const first = f.exits[0];
  first({ winnerName: "atk", strategicRng: f.rng(233) });
  assert.equal(app._legionSlotBatch, batch);
  assert.deepEqual(f.draws, [233]);
  await app.startFieldBattle(sc.legions[0], sc.legions[1]);
  const second = f.exits[1];
  sc.generals[88].battle_rating = 231;
  first({ winnerName: "atk", strategicRng: f.rng(99) });
  assert.equal(sc.generals[88].battle_rating, 231, "stale callback cannot refresh");
  assert.deepEqual(f.draws, [233]);
  second({ winnerName: "def", strategicRng: f.rng(218) });
  second({ winnerName: "def", strategicRng: f.rng(99) });
  assert.deepEqual(f.draws, [233, 218]);
  assert.equal(f.effects.filter(Array.isArray).length, 2);
  assert.deepEqual(f.effects[0][1].defenders, []);
  assert.equal(app._legionSlotBatch, null);
  assert.ok(f.weather() > 0);
  assert.equal(app.clock.sub, 0);
  app.clock.advanceFrame(app.clock.currentStep);
  assert.equal(app.clock.sub, 1);
});

test("synchronous App exit during batch.running does not re-enter or lose the next slot", () => {
  const f = fixture();
  const { app, sc } = f;
  let count = 0;
  app.battleView.open = (_battle, onFinish) => {
    assert.equal(app._legionSlotBatch.running, true);
    onFinish({ winnerName: "atk", strategicRng: f.rng(count++ ? 218 : 233) });
    return Promise.resolve();
  };
  app.gamebar.enqueueTalkMessage = () => {
    void app.startFieldBattle(sc.legions[0], sc.legions[1]);
  };
  app.clock.advanceFrame(app.clock.currentStep);
  assert.equal(count, 2);
  assert.deepEqual(f.draws, [233, 218]);
  assert.equal(app._legionSlotBatch, null);
  assert.equal(app.clock.sub, 1);
});

test("startup rejection cancels, records an explicit fault and never advances the unfinished batch", async () => {
  const f = fixture();
  const { app, sc } = f;
  app.clock.advanceFrame(app.clock.currentStep);
  const batch = app._legionSlotBatch;
  const error = new Error("injected startup failure");
  app.battleView.open = () => Promise.reject(error);
  assert.equal(await app.startBattle(sc.legions[0], f.city, null, []), false);
  assert.equal(app._strategicBattleFailure.error, error);
  assert.equal(batch.cursor.phase, "cancelled");
  assert.equal(app._legionSlotBatch, null);
  assert.equal(canSnapshotState(app), false);
  assert.equal(app.clock.hold, true);
  assert.equal(app.clock.advanceFrame(9999), false);
  aiTick(app, f.options); // Even a direct caller cannot silently restart it.
  assert.deepEqual(f.draws, []);
  assert.equal(f.weather(), 0);
  assert.equal(app.clock.sub, 0);
  assert.match(f.messages.at(-1), /失敗.*原存檔不變/);
});

test("stale rejection cannot cancel a replacement batch", async () => {
  const f = fixture();
  const { app, sc } = f;
  app.clock.advanceFrame(app.clock.currentStep);
  let reject;
  app.battleView.open = () =>
    new Promise((_resolve, fail) => {
      reject = fail;
    });
  const opening = app.startFieldBattle(sc.legions[0], sc.legions[1]);
  const replacement = {
    ticket: {},
    cursor: {
      cancel() {
        throw new Error("new batch cancelled");
      },
    },
  };
  app._legionSlotBatch = replacement;
  reject(new Error("obsolete assets"));
  assert.equal(await opening, false);
  assert.equal(app._legionSlotBatch, replacement);
  assert.equal(app._strategicBattleFailure, undefined);
  assert.deepEqual(f.draws, []);
});

test("slot pump owns errors after a battle ticket is consumed, and on initial entry", async () => {
  for (const entry of ["resume", "initial"]) {
    const f = fixture();
    const { app, sc } = f;
    const error = new Error("injected next-slot RNG failure");
    const badRng = {
      nextByte() {
        throw error;
      },
    };
    if (entry === "resume") {
      app.clock.advanceFrame(app.clock.currentStep);
      const ticket = app._legionSlotBatch.ticket;
      f.controls.apply = () => {
        sc.testPartialCommit = 1;
      };
      await app.startBattle(sc.legions[0], f.city, null, []);
      f.exits[0]({ winnerName: "atk", strategicRng: badRng });
      assert.equal(ticket.completed, true);
      assert.equal(sc.testPartialCommit, 1);
    } else {
      sc.delayedLegionReturns = [];
      app.originalRng = badRng;
      assert.doesNotThrow(() => app.clock.advanceFrame(app.clock.currentStep));
    }
    assert.equal(app._strategicBattleFailure?.error, error);
    assert.equal(app._legionSlotBatch, null);
    assert.equal(sc.legions[0].moveDelay, 3); // Pre-action reload is not rolled back.
    assert.equal(sc.legions[1].moveDelay, 1);
    assert.equal(app.clock.sub, 0);
    assert.equal(f.weather(), 0);
    assert.equal(canSnapshotState(app), false);
    assert.equal(app.clock.hold, true);
  }
});

test("synchronous construction and partial-result errors fail closed, without fabricated rollback", async () => {
  for (const phase of ["create", "apply"]) {
    const f = fixture();
    const { app, sc } = f;
    app.clock.advanceFrame(app.clock.currentStep);
    const error = new Error(phase);
    if (phase === "create") f.controls.createError = error;
    else {
      f.controls.apply = () => {
        sc.testPartialCommit = 1;
        throw error;
      };
      app.battleView.open = (_battle, onFinish) => {
        onFinish({ winnerName: "atk", strategicRng: f.rng(233) });
        return Promise.resolve();
      };
    }
    await app.startBattle(sc.legions[0], f.city, null, []);
    assert.equal(app._strategicBattleFailure.error, error);
    assert.equal(sc.testPartialCommit, phase === "apply" ? 1 : undefined);
    assert.equal(app._legionSlotBatch, null);
    assert.deepEqual(f.draws, []);
    assert.equal(f.weather(), 0);
  }
});
