import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bindLegionReturnCounter,
  bindLegionSlotCounter,
  finishLegionSlotTail,
  initializeLegionSlotState,
  resetLegionActionPhase,
} from "../web/src/game/legionphase.js";

function emptyTable() {
  const sc = { legions: [] };
  initializeLegionSlotState(sc);
  return sc;
}

test("P24: new table is zero, deactivation/reuse preserves the fixed slot byte", () => {
  const sc = emptyTable();
  assert.deepEqual(sc.legionSlotCounters, Array(128).fill(0));
  const old = { slot: 81, status: 0xc5 };
  bindLegionSlotCounter(sc, old);
  old.engagementCountdown = 7;
  old.status = 0; // 4651/29C3 do not themselves clear +03.
  const replacement = { slot: 81, status: 0xc0, engagementCountdown: 0 };
  bindLegionSlotCounter(sc, replacement);
  assert.equal(replacement.engagementCountdown, 7);
  finishLegionSlotTail(replacement);
  assert.equal(sc.legionSlotCounters[81], 0);
});

test("P01: current delayed return gets the active tail; another slot keeps 48", () => {
  const sc = emptyTable();
  const current = { slot: 81, status: 8 };
  const other = { slot: 82, status: 8 };
  for (const record of [current, other]) {
    bindLegionReturnCounter(sc, record);
    record.engagementCountdown = 48;
  }
  finishLegionSlotTail(current);
  assert.equal(current.countdown, 0);
  assert.equal(other.countdown, 48);
  // 2A7E's arithmetic, not yet the production dispatcher integration.
  current.engagementCountdown = (current.countdown - 1) & 255;
  other.engagementCountdown = (other.countdown - 1) & 255;
  assert.equal(current.countdown, 255);
  assert.equal(other.countdown, 47);
});

test("264A: byte domain, bit5 and live presentation projection", () => {
  const sc = emptyTable();
  const record = { slot: 0, status: 0xe0, _engagement: { kind: "pending" } };
  bindLegionSlotCounter(sc, record);
  for (let value = 0; value < 256; value++) {
    record.engagementCountdown = value;
    finishLegionSlotTail(record);
    const expected = (value - 1) & 255 || 1;
    assert.equal(record.engagementCountdown, expected);
    assert.equal(record._engagement.countdown, expected);
    assert.equal(sc.legionSlotCounters[0], expected);
  }
});

test("6FD2: all six type bytes count, no-change repeat still resets only 0B/1E", () => {
  const sc = emptyTable();
  const record = {
    slot: 0,
    units: Array.from({ length: 6 }, () => ({ type: 1, troops: 0 })),
  };
  bindLegionSlotCounter(sc, record);
  record.engagementCountdown = 19;
  for (let type = 0; type < 256; type++) {
    record.units[5].type = type;
    record.moveDelay = 77;
    resetLegionActionPhase(record);
    assert.equal(record.moveDelay, 1);
    assert.equal(record.movePeriod, type === 1 ? 2 : 3);
    assert.equal(record.engagementCountdown, 19);
    record.moveDelay = 88;
    resetLegionActionPhase(record);
    assert.equal(record.moveDelay, 1);
  }
});

test("counter state survives clone/JSON and rebind; stale projections never win", () => {
  const sc = emptyTable();
  const record = { slot: 17, status: 8 };
  bindLegionReturnCounter(sc, record);
  record.engagementCountdown = 0;
  sc.delayedLegionReturns = [record];
  const clone = structuredClone(sc);
  const serialized = JSON.stringify(clone);
  let parsed;
  try {
    parsed = JSON.parse(serialized);
  } catch (cause) {
    throw new Error("In-memory snapshot JSON round-trip failed", { cause });
  }
  parsed.delayedLegionReturns[0].countdown = 48;
  parsed.delayedLegionReturns[0].engagementCountdown = 48;
  bindLegionReturnCounter(parsed, parsed.delayedLegionReturns[0]);
  assert.equal(parsed.delayedLegionReturns[0].countdown, 0);
  assert.throws(() => bindLegionSlotCounter({}, { slot: 0 }), /table/);
  assert.throws(() => bindLegionSlotCounter(sc, { slot: 128 }), /slot/);
  assert.throws(() => {
    record.engagementCountdown = null;
  }, /byte/);
  assert.throws(() => resetLegionActionPhase({ units: [] }), /six/);
  assert.throws(
    () => initializeLegionSlotState({ legions: [record] }),
    /empty/,
  );
});
