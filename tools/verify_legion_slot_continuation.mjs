import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import {
  aiTick,
  cancelLegionSlotBatch,
  resolveBattle,
  resolveFieldBattle,
} from "../web/src/game/ai.js";
import { captureLegionContinuation } from "../web/src/game/legioncontinuation.js";
import { initializeLegionSlotState } from "../web/src/game/legionphase.js";
import { canSnapshotState } from "../web/src/game/savegame.js";
import { Clock } from "../web/src/game/clock.js";
import { GameBar } from "../web/src/ui/gamebar.js";

// Only Web templates/in-memory state. Callback ownership tests are Web
// integration evidence, not a claim that DOS messages/device returns ran.
let data;
try {
  data = JSON.parse(
    await fs.readFile(new URL("../web/data.json", import.meta.url), "utf8"),
  );
} catch (cause) {
  throw new Error("Cannot read the Web fixture", { cause });
}

function fixture() {
  const sc = structuredClone(data.scenarios[16]);
  initializeLegionSlotState(sc);
  sc.player_faction = 17;
  sc.citiesOf = (idx) => sc.cities.filter((city) => city.faction === idx);
  sc.disasterMapObjects = [];
  sc.delayedLegionReturns = [];
  let weatherReads = 0;
  Object.defineProperty(sc, "weatherClouds", {
    get() {
      weatherReads++;
      return [];
    },
  });
  const messages = [];
  const draws = [];
  const app = {
    scenario: sc,
    originalRng: {
      nextByte() {
        throw new Error("stale RNG used");
      },
    },
  };
  let updates = 0;
  const options = {
    legionBatchStart: 80,
    runCityDaily: false,
    settleDaily: true,
  };
  app.clock = new Clock({
    startYear: 190,
    startMonth: 1,
    onStrategicTick() {
      updates++;
      aiTick(app, options);
    },
    onSyncHold() {
      app.gamebar.syncClock();
    },
  });
  app.gamebar = Object.create(GameBar.prototype);
  app.gamebar.app = app;
  // These cursor tests treat each aggregate as a single completion. The
  // separate real-FIFO test below exercises both visible messages.
  // Deliberately leave views inactive: the batch itself must hold.
  app.gamebar.enqueueTalkMessage = (message) =>
    messages.push({
      ...message,
      onClose: message.onComplete ?? message.onClose,
    });
  const city = sc.cities[60];
  city.attr = 0;
  function legion(slot) {
    return {
      slot,
      status: 0xc1,
      faction: 13,
      generalIdx: slot,
      _active: true,
      troops: 600,
      morale: 200,
      x: city.x,
      y: city.y,
      target: city,
      targetCity: 60,
      targetNode: 60,
      roadEdgeOrNode: 480,
      commandState: 1,
      moveDelay: 1,
      movePeriod: 3,
      units: Array.from({ length: 6 }, () => ({ type: 3, troops: 1000 })),
    };
  }
  sc.legions = [legion(81), legion(83)];
  sc.delayedLegionReturns = [80, 82].map((slot) => ({
    slot,
    status: 8,
    generalIdx: slot,
    faction: 17,
    dead: true,
  }));
  sc.legionSlotCounters[80] = sc.legionSlotCounters[82] = 1;
  return {
    app,
    sc,
    city,
    messages,
    draws,
    options,
    legion,
    weatherReads: () => weatherReads,
    updates: () => updates,
  };
}

test("real slot pump: two yields, fresh RNG, remaining actions, weather then calendar", () => {
  const f = fixture();
  const { app, sc, messages, draws } = f;
  app.clock.advanceFrame(app.clock.currentStep);
  const batch = app._legionSlotBatch;
  assert.ok(batch);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].talkIndex, 35);
  assert.equal(sc.legionSlotCounters[80], 0);
  assert.equal(sc.legions[0].moveDelay, 1);
  assert.equal(app.clock.hold, true);
  assert.equal(app.clock.sub, 0);
  assert.equal(app.clock._pendingStrategicAdvance, true);
  assert.equal(canSnapshotState(app), false);
  assert.equal(f.weatherReads(), 0);
  assert.equal(app.clock.advanceFrame(1000), false);

  app.originalRng = {
    nextByte() {
      draws.push(233);
      return 233;
    },
  };
  messages[0].onClose();
  assert.equal(app._legionSlotBatch, batch);
  assert.equal(messages.length, 2);
  assert.deepEqual(draws, [233]);
  assert.equal(sc.legions[0].commandState, 2);
  assert.equal(sc.legions[1].commandState, 1);
  assert.equal(f.weatherReads(), 0);
  messages[0].onClose(); // Cannot acknowledge the SECOND ticket.
  assert.deepEqual(draws, [233]);
  assert.equal(sc.legions[1].commandState, 1);

  app.originalRng = {
    nextByte() {
      draws.push(218);
      return 218;
    },
  };
  messages[1].onClose();
  assert.equal(app._legionSlotBatch, null);
  assert.deepEqual(draws, [233, 218]);
  assert.equal(sc.legions[1].commandState, 2);
  assert.deepEqual(sc.delayedLegionReturns, []);
  assert.ok(f.weatherReads() > 0);
  const completedWeatherReads = f.weatherReads();
  messages[0].onClose();
  messages[1].onClose();
  assert.equal(f.weatherReads(), completedWeatherReads);
  assert.deepEqual(draws, [233, 218]);
  assert.equal(app.clock.hold, false);
  assert.equal(canSnapshotState(app), false); // Calendar is still pending.
  app.clock.advanceFrame(app.clock.currentStep);
  assert.equal(app.clock.sub, 1);
  assert.equal(f.updates(), 1); // No second city/legion update.
  assert.equal(canSnapshotState(app), true);
});

test("cancelled batch and replaced scene cannot resume old return messages", () => {
  const f = fixture();
  aiTick(f.app, f.options);
  const batch = f.app._legionSlotBatch;
  assert.equal(cancelLegionSlotBatch(f.app), true);
  assert.equal(batch.cursor.phase, "cancelled");
  f.app.scenario = {};
  f.messages[0].onClose();
  assert.equal(f.sc.legions[0].commandState, 1);
  assert.equal(f.weatherReads(), 0);
  assert.equal(f.app._legionSlotBatch, null);
});

test("queued battle openings are single-use and clear the right +03 before TALK", () => {
  const f = fixture();
  const { app, sc, city } = f;
  sc.player_faction = 13;
  const A = f.legion(81),
    D = f.legion(83);
  A.faction = 17;
  A.x--;
  sc.legions = [A, D];
  sc.delayedLegionReturns = [];
  sc.legionSlotCounters[81] = 1;
  sc.legionSlotCounters[83] = 7;
  const starts = [];
  app.battleView = { active: false };
  app.startBattle = (...args) => starts.push(args);
  assert.equal(resolveBattle(app, A, city), true);
  assert.equal(sc.legionSlotCounters[81], 0);
  assert.equal(sc.legionSlotCounters[83], 7); // Siege does not clear defender.
  const opening = f.messages[0];
  opening.onClose();
  opening.onClose();
  assert.equal(starts.length, 1);
  assert.equal(starts[0][2], D);
  assert.deepEqual(starts[0][3], [D]); // Original list/reference survives.

  sc.legionSlotCounters[81] = 1;
  app.startFieldBattle = (...args) => starts.push(args);
  assert.equal(resolveFieldBattle(app, A, D), true);
  assert.equal(sc.legionSlotCounters[81], 0);
  assert.equal(sc.legionSlotCounters[83], 0); // Field clears both.
  app.scenario = {};
  f.messages[1].onClose();
  assert.equal(starts.length, 1);
});

test("real GameBar FIFO waits for each return's personality before resuming slots", async (t) => {
  const f = fixture();
  const { app, sc, draws } = f;
  const bar = app.gamebar;
  const priorWidth = Object.getOwnPropertyDescriptor(globalThis, "innerWidth");
  const priorHeight = Object.getOwnPropertyDescriptor(
    globalThis,
    "innerHeight",
  );
  globalThis.innerWidth = 640;
  globalThis.innerHeight = 400;
  t.after(() => {
    if (priorWidth) Object.defineProperty(globalThis, "innerWidth", priorWidth);
    else delete globalThis.innerWidth;
    if (priorHeight)
      Object.defineProperty(globalThis, "innerHeight", priorHeight);
    else delete globalThis.innerHeight;
  });
  // Fake text only; real formatter, enqueue, FIFO, close and hold functions.
  t.mock.method(globalThis, "fetch", async (url) => {
    assert.equal(url, "talk.json");
    return new Response(
      JSON.stringify({
        strings: Array.from({ length: 1024 }, (_, i) => [String(i)]),
      }),
    );
  });
  const shown = [];
  bar.enqueueTalkMessage = GameBar.prototype.enqueueTalkMessage;
  bar._strategicMessageQueue = [];
  bar._scenarioUiGeneration = 1;
  /** @type {Promise<void>} */
  let draining = Promise.resolve();
  bar._drainStrategicMessages = function () {
    draining = GameBar.prototype._drainStrategicMessages.call(this);
    return draining;
  };
  bar.showGeneralMessageDialog = async (gen, text, onClose) => {
    shown.push({ gen, text, onClose });
  };
  app.view = { draw() {} };
  sc.generals[80].talk_idx = 0;
  sc.generals[82].talk_idx = 1;
  app.originalRng = {
    nextByte() {
      draws.push(233);
      return 233;
    },
  };
  app.clock.advanceFrame(app.clock.currentStep);
  await draining;
  const batch = app._legionSlotBatch;
  const firstTicket = batch.ticket;
  assert.equal(shown[0].text, "35");
  shown[0].onClose();
  await draining;
  assert.equal(shown[1].text, "422");
  assert.deepEqual(draws, []);
  assert.equal(batch.ticket, firstTicket);
  assert.equal(f.weatherReads(), 0);
  assert.equal(app.clock.hold, true);
  shown[1].onClose();
  await draining;
  assert.deepEqual(draws, [233]);
  assert.notEqual(batch.ticket, firstTicket);
  assert.equal(shown[2].text, "35");
  shown[0].onClose();
  shown[1].onClose();
  assert.deepEqual(draws, [233]);
  shown[2].onClose();
  await draining;
  assert.equal(shown[3].text, "423");
  assert.deepEqual(draws, [233]);
  assert.equal(f.weatherReads(), 0);
  app.originalRng = {
    nextByte() {
      draws.push(218);
      return 218;
    },
  };
  shown[3].onClose();
  await draining;
  assert.deepEqual(draws, [233, 218]);
  assert.equal(app._legionSlotBatch, null);
  assert.ok(f.weatherReads() > 0);
  assert.equal(app.clock.hold, false);
  assert.equal(app.clock.sub, 0);
  app.clock.advanceFrame(app.clock.currentStep);
  assert.equal(app.clock.sub, 1);
  assert.equal(f.updates(), 1);
});

test("callback guard rejects duplicate, later-ticket and terminal callbacks", () => {
  const app = {
    scenario: {},
    clock: {},
    _legionSlotBatch: { ticket: { completed: false } },
  };
  const first = captureLegionContinuation(app);
  app._legionSlotBatch.ticket = { completed: false };
  assert.equal(first.claim(), false);
  const second = captureLegionContinuation(app);
  assert.equal(second.claim(), true);
  assert.equal(second.claim(), false);
  const terminal = captureLegionContinuation(app);
  app.endView = { active: true };
  assert.equal(terminal.claim(), false);
});
