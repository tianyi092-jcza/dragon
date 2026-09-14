import assert from "node:assert/strict";
import test from "node:test";
import {
  assertLegionPhaseState,
  initializeLegionSlotState,
  bindLegionSlotCounter,
} from "../web/src/game/legionphase.js";
import {
  canSnapshotState,
  snapshotState,
  restoreSnapshotState,
} from "../web/src/game/savegame.js";

// Pure memory/JSON; never open IndexedDB, a browser profile or a DOS save.
function fixture() {
  const sc = {
    legions: [],
    cities: [],
    factions: [{ idx: 0, n_legions: 0, raw: "ff".repeat(64) }],
    generals: [],
  };
  initializeLegionSlotState(sc);
  sc.legions.push({
    slot: 2,
    status: 0x80,
    moveDelay: 0,
    movePeriod: 0,
    raw: "ff".repeat(64),
  });
  sc.legionSlotCounters[2] = 7;
  bindLegionSlotCounter(sc, sc.legions[0]);
  return {
    scenario: sc,
    scenarioIdx: 0,
    clock: { year: 190, month: 1, day: 1, sub: 0, hour: 0 },
  };
}
function jsonRoundTrip(value) {
  const text = JSON.stringify(value);
  try {
    return JSON.parse(text);
  } catch (cause) {
    throw new Error("Invalid test JSON", { cause });
  }
}

test("new snapshot retains explicit zero action bytes and authoritative fixed slots", () => {
  const app = fixture();
  const saved = jsonRoundTrip(snapshotState(app, 0, "NEW"));
  assert.equal(saved.state.legionPhaseVersion, 1);
  assert.equal(saved.state.legionSlotCounters.length, 128);
  assert.equal(saved.state.factions[0].n_legions, 0);
  saved.state.legions[0].engagementCountdown = 48; // Stale projection, not authority.
  const restored = restoreSnapshotState(saved);
  bindLegionSlotCounter(restored, restored.legions[0]);
  assert.equal(restored.factions[0].n_legions, 0); // Stale FF raw does not win.
  assert.deepEqual(
    [
      restored.legions[0].moveDelay,
      restored.legions[0].movePeriod,
      restored.legions[0].engagementCountdown,
    ],
    [0, 0, 7],
  );
  restored.legions[0].engagementCountdown = 9;
  assert.equal(saved.state.legionSlotCounters[2], 7);
  assert.equal(app.scenario.legionSlotCounters[2], 7);
});

test("snapshot retains the actual runtime direction including frame zero", () => {
  for (const frame of [0, 1, 2, 3, 4]) {
    const app = fixture();
    app.scenario.legions[0]._markerFrame = frame;
    const saved = jsonRoundTrip(snapshotState(app, 0, "DIRECTION"));
    assert.equal(saved.state.legions[0]._markerFrame, frame);
    assert.equal(restoreSnapshotState(saved).legions[0]._markerFrame, frame);
    assert.equal(app.scenario.legions[0]._markerFrame, frame);
  }
  // No missing-field migration or direction-generation formula is added here.
});

test("old format is rejected without modifying any slot, even with plausible raw bytes", () => {
  const saved = snapshotState(fixture(), 0, "OLD");
  delete saved.state.legionPhaseVersion;
  const before = JSON.stringify(saved);
  assert.throws(() => restoreSnapshotState(saved), /舊版 AI 存檔/);
  assert.equal(JSON.stringify(saved), before);
});

test("invalid new format is rejected instead of supplying missing bytes or resolving duplicates", () => {
  for (const mutate of [
    (state) => {
      delete state.factions[0].n_legions;
    },
    (state) => {
      state.factions[0].n_legions = 256;
    },
    (state) => {
      delete state.legions[0].moveDelay;
    },
    (state) => {
      delete state.legions[0].movePeriod;
    },
    (state) => {
      delete state.legionSlotCounters[1];
    },
    (state) => {
      state.legionSlotCounters[0] = 256;
    },
    (state) => {
      state.legions.push({ ...state.legions[0] });
    },
  ]) {
    const saved = snapshotState(fixture(), 0, "INVALID");
    mutate(saved.state);
    assert.throws(() => assertLegionPhaseState(saved.state));
    const before = JSON.stringify(saved);
    assert.throws(() => restoreSnapshotState(saved), /不完整或已損壞/);
    assert.equal(JSON.stringify(saved), before);
  }
});

test("pending slot continuation blocks save even before a view/message becomes active", () => {
  const app = fixture();
  app._legionSlotBatch = { ticket: {} };
  assert.equal(canSnapshotState(app), false);
  assert.throws(() => snapshotState(app, 0, "BLOCKED"), /cannot save/);
  app._legionSlotBatch = null;
  assert.equal(canSnapshotState(app), true);
});
