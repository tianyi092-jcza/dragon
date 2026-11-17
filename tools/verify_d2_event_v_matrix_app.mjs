// D2-EVENT-64 V-matrix part 2 (V09/V10/V12/V13/V14): app-level message
// serialization, failure hold, generation trajectory, JSON restore and the
// restore gate. Synthetic fixtures only; no SAVE.DAT, no browser state.
import assert from "node:assert/strict";
import test from "node:test";
import {
  tickFactionStrategicState,
  tickStrategicWarEvents,
} from "../web/src/game/ai.js";
import { consumeScenarioStrategicEvent } from "../web/src/game/navigation/scenarioevents.js";
import { beginScenarioDisasterObjectEvent } from "../web/src/game/navigation/scenarioweather.js";
import {
  advanceScheduleEpoch,
  attachPositionMeta,
  ensureStrategicEventSchedule,
  recordCarryEvent,
  recordOverflowEvent,
  rotateStrategicEventSchedule,
} from "../web/src/game/navigation/strategiceventschedule.js";
import { LEGION_PHASE_VERSION } from "../web/src/game/legionphase.js";
import {
  applyWebMetaToState,
  canSnapshotState,
  restoreSnapshotState,
} from "../web/src/game/savegame.js";

function scenario({ slots = {}, cursor = 0, divider = 1 } = {}) {
  const wheel = Array(256).fill(null);
  for (const [slot, event] of Object.entries(slots)) wheel[slot] = event;
  return {
    nativeLegionSlots: {},
    player_faction: 0,
    factions: [],
    cities: [
      {
        idx: 0,
        faction: 1,
        x: 200,
        y: 90,
        growth: 255,
        defence: 255,
        disaster_event: 24,
        _disasterGeneration: 5,
      },
    ],
    disasterMapObjects: Array(16).fill(null),
    strategicEventSlots: wheel,
    _strategicEventCursor: cursor,
    _strategicEventDivider: divider,
  };
}

function appFor(sc) {
  const messages = [];
  const app = {
    scenario: sc,
    messages,
    refreshCount: 0,
    clock: { hold: false },
    originalRng: { nextByte: () => 0 },
    gamebar: {
      enqueueGenericTalkEvent(options) {
        messages.push(options);
      },
      syncClock() {},
    },
    hud: {
      refreshInfo() {
        app.refreshCount += 1;
      },
      flashEvent() {},
    },
  };
  return app;
}

const talk = (index) => ({ type: 10, arg0: 0, arg1: index, arg2: 0 });

test("V09 messages serialize: A returns, then B, then the message-free C", () => {
  const sc = scenario({ slots: { 0: talk(1) } });
  recordOverflowEvent(sc, 0, talk(2));
  recordOverflowEvent(sc, 0, {
    type: 12,
    arg0: 0,
    arg1: 0x40,
    arg2: 0x08,
    generation: 1, // stale: city generation is 5
  });
  const app = appFor(sc);
  assert.equal(tickStrategicWarEvents(app), true);
  assert.equal(app.messages.length, 1, "only A before its return");
  assert.equal(app.messages[0].talkIndex, 1);
  assert.equal(app._strategicEventBatch.pending.length, 2);
  assert.equal(tickFactionStrategicState(app), false);
  assert.equal(app._factionTickDeferred, true);
  assert.equal(app.refreshCount, 0);

  app.messages[0].onClose();
  assert.equal(app._strategicEventPostMessageRngPending, true, "B is waiting");
  assert.equal(app.messages.length, 2, "B dispatched only after A returned");
  assert.equal(app.messages[1].talkIndex, 2);
  assert.equal(app._factionTickDeferred, true);
  assert.equal(app.refreshCount, 0, "no faction tick before B returns");

  app.messages[1].onClose();
  assert.equal(app._strategicEventPostMessageRngPending, false);
  assert.equal(app._strategicEventBatch, null);
  assert.equal(app._factionTickDeferred, false);
  assert.equal(app.refreshCount, 1, "exactly one tick for the whole position");
  assert.equal(sc._strategicEventCursor, 1, "cursor advanced once");
  assert.equal(sc._strategicEventDivider, 10);
  assert.equal(sc.cities[0].disaster_event, 24, "stale clear skipped (D7)");
  assert.equal(ensureStrategicEventSchedule(sc).entries.length, 0);
});

test("V10 handler failure holds, forbids saving and never replays", () => {
  const sc = scenario({ slots: { 0: { type: 0xff, arg0: 0, arg1: 0, arg2: 0 } } });
  const app = appFor(sc);
  assert.throws(() => tickStrategicWarEvents(app), /Uncovered native strategic event type 255/);
  assert.equal(app._strategicBattleFailure.error instanceof RangeError, true);
  assert.equal(app.clock.hold, true);
  assert.equal(canSnapshotState(app), false);
  assert.equal(sc._strategicEventCursor, 1, "prefix retained");
  assert.equal(sc._strategicEventDivider, 10);
  assert.equal(tickStrategicWarEvents(app), false, "no replay of the same slot");
  assert.equal(sc._strategicEventCursor, 1);
});

test("V12 a newer disaster keeps its damage until the owning clear arrives", () => {
  const sc = scenario();
  const clear = (generation) => ({
    type: 12,
    arg0: 0,
    arg1: 0x40,
    arg2: 0x08,
    generation,
  });
  const stale = beginScenarioDisasterObjectEvent(sc, clear(4));
  assert.equal(stale.skipped, true);
  assert.equal(sc.cities[0].disaster_event, 24);
  const owned = beginScenarioDisasterObjectEvent(sc, clear(5));
  assert.equal(owned.changed, true);
  assert.equal(sc.cities[0].disaster_event, 0);
});

test("V13 JSON restore reproduces the pending order across a month", () => {
  const build = () => {
    const sc = scenario({ slots: { 0: talk(1) }, cursor: 0, divider: 1 });
    recordCarryEvent(sc, 0, talk(7), 0);
    recordOverflowEvent(sc, 64, talk(8));
    attachPositionMeta(sc, 0, { region: { minX: 1, maxX: 2, minY: 3, maxY: 4 } });
    return sc;
  };
  const run = (sc) => {
    const seen = [];
    const first = consumeScenarioStrategicEvent(sc);
    seen.push(first.event.arg1);
    for (const event of first.rest) seen.push(event.arg1);
    rotateStrategicEventSchedule(sc, {
      cursorSlot: sc._strategicEventCursor,
      readRecord: (slot) => sc.strategicEventSlots[slot],
    });
    sc.strategicEventSlots = sc.strategicEventSlots
      .slice(64)
      .concat(Array(64).fill(null));
    sc._strategicEventCursor = 0;
    sc._strategicEventDivider = 1;
    const second = consumeScenarioStrategicEvent(sc);
    if (second.status === "dispatch") seen.push(second.event.arg1);
    return seen;
  };
  const control = build();
  const expected = run(control);
  assert.deepEqual(expected, [7, 1, 8]);

  const source = build();
  const saved = JSON.parse(
    JSON.stringify({
      strategicEventSlots: source.strategicEventSlots,
      strategicEventSchedule: source.strategicEventSchedule,
      _strategicEventCursor: source._strategicEventCursor,
      _strategicEventDivider: source._strategicEventDivider,
      _strategicEventSeq: source._strategicEventSeq,
    }),
  );
  const restored = {
    nativeLegionSlots: {},
    player_faction: 0,
    factions: [],
    cities: source.cities,
    strategicEventSlots: saved.strategicEventSlots,
  };
  applyWebMetaToState(restored, {
    scenarioRuntimeState: {
      strategicEventSchedule: saved.strategicEventSchedule,
      _strategicEventSeq: saved._strategicEventSeq,
    },
  });
  restored._strategicEventCursor = saved._strategicEventCursor;
  restored._strategicEventDivider = saved._strategicEventDivider;
  assert.deepEqual(run(restored), expected);
});

test("V14 restore failures are wrapped and leave the input untouched", () => {
  const webMeta = {
    scenarioRuntimeState: {
      strategicEventSchedule: { version: 99, epoch: 0, entries: [] },
      _strategicEventSeq: 4,
    },
  };
  const snapshot = JSON.parse(JSON.stringify(webMeta));
  assert.throws(
    () => applyWebMetaToState({ strategicEventSlots: [] }, webMeta),
    /unsupported version/,
  );
  assert.deepEqual(webMeta, snapshot, "apply does not mutate the saved meta");
  assert.throws(
    () =>
      restoreSnapshotState({
        state: { legionPhaseVersion: LEGION_PHASE_VERSION },
        webMeta,
      }),
    /存檔的軍團調度資料不完整或已損壞/,
  );
  let legacy = null;
  try {
    restoreSnapshotState({ state: { legionPhaseVersion: -1 }, webMeta });
  } catch (error) {
    legacy = error;
  }
  assert.match(legacy.message, /舊版 AI 存檔/);
});
