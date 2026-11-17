// D2-EVENT-64 refusal contract: the strict 2FBF/301C leaves keep the original
// inserted/cf truth, gain the Web `accepted` result, and place refused records
// at absolute positions. Detached fixtures without the hook still drop.
import assert from "node:assert/strict";
import test from "node:test";
import { originalCurrentEnqueue2FBF } from "../web/src/game/navigation/originalweather.js";
import { originalDelayedEnqueue301C } from "../web/src/game/navigation/originallegionfate.js";
import {
  ensureStrategicEventSchedule,
  overflowTargetFor,
  recordOverflowEvent,
} from "../web/src/game/navigation/strategiceventschedule.js";
import { applyWebMetaToState } from "../web/src/game/savegame.js";

function wheel(sc, { fill = 0, cursor = 0 } = {}) {
  sc.strategicEventSlots = Array(256).fill(null);
  for (let i = 0; i < fill; i++)
    sc.strategicEventSlots[i] = { type: 99, arg0: 1, arg1: 2, arg2: 3 };
  sc._strategicEventCursor = cursor;
  return sc;
}

function io(sc, { onWrite = null, rng = null } = {}) {
  return {
    nextRandomByte() {
      if (rng) rng.calls += 1;
      return 0;
    },
    readEventCursorWord: () => sc._strategicEventCursor * 4,
    readEventTypeByte(offset) {
      const event = sc.strategicEventSlots[offset >>> 2];
      return event ? event.type : 0;
    },
    writeEventWord(offset, value) {
      if (onWrite) return onWrite(offset, value);
      throw new Error("a full wheel must not be written");
    },
    queueOverflowRecord(record, meta) {
      return recordOverflowEvent(sc, overflowTargetFor(sc, meta), record);
    },
  };
}

test("2FBF full page accepts into the next epoch slot 0 with 0 RNG", () => {
  const sc = wheel({}, { fill: 64 });
  const before = structuredClone(sc.strategicEventSlots);
  const rng = { calls: 0 };
  const result = originalCurrentEnqueue2FBF(io(sc, { rng }), 0x000b, 0, 32);
  assert.equal(result.inserted, false);
  assert.equal(result.cf, true);
  assert.equal(result.accepted, true);
  assert.equal(rng.calls, 0, "fixed-delay path consumes no RNG");
  assert.deepEqual(sc.strategicEventSlots, before);
  const [entry] = ensureStrategicEventSchedule(sc).entries;
  assert.equal(entry.position, 64);
  assert.equal(entry.type, 0x0b);
});

test("2FBF request past the current page keeps its absolute slot", () => {
  const sc = wheel({}, { fill: 64, cursor: 40 });
  const result = originalCurrentEnqueue2FBF(io(sc), 0x000b, 0, 32);
  assert.equal(result.offset, 288);
  assert.equal(result.accepted, true);
  const [entry] = ensureStrategicEventSchedule(sc).entries;
  assert.equal(entry.position, 72, "288/4 = slot 72, never earlier");
});

test("detached io without the hook keeps the legacy drop", () => {
  const sc = wheel({}, { fill: 64 });
  const bare = {
    nextRandomByte: () => 0,
    readEventCursorWord: () => sc._strategicEventCursor * 4,
    readEventTypeByte: (offset) =>
      sc.strategicEventSlots[offset >>> 2] ? 99 : 0,
    writeEventWord() {
      throw new Error("unexpected write");
    },
  };
  const result = originalCurrentEnqueue2FBF(bare, 0x000b, 0, 32);
  assert.equal(result.inserted, false);
  assert.equal(result.accepted, false);
  assert.equal(ensureStrategicEventSchedule(sc).entries.length, 0);
});

test("301C full wheel accepts at slot 256 and keeps CF 0", () => {
  const sc = wheel({}, { fill: 256 });
  const result = originalDelayedEnqueue301C(io(sc), 0x000c, 0x1234, 8);
  assert.equal(result.inserted, false);
  assert.equal(result.cf, false);
  assert.equal(result.accepted, true);
  const [entry] = ensureStrategicEventSchedule(sc).entries;
  assert.equal(entry.position, 256);
  assert.deepEqual([entry.type, entry.arg0, entry.arg1, entry.arg2], [
    0x0c, 0, 0x34, 0x12,
  ]);
});

test("301C below the wheel still writes in place", () => {
  const sc = wheel({}, { fill: 32 });
  const written = [];
  const result = originalDelayedEnqueue301C(
    {
      ...io(sc, {
        onWrite(offset, value) {
          written.push([offset, value]);
          const index = offset >>> 2;
          sc.strategicEventSlots[index] ??= { type: 0, arg0: 0, arg1: 0, arg2: 0 };
          const event = sc.strategicEventSlots[index];
          if (offset % 4 === 0) {
            event.type = value & 0xff;
            event.arg0 = value >>> 8;
          } else {
            event.arg1 = value & 0xff;
            event.arg2 = value >>> 8;
          }
        },
      }),
    },
    0x000c,
    0x1234,
    8,
  );
  assert.equal(result.inserted, true);
  assert.equal(result.offset, 32 * 4);
  assert.equal(ensureStrategicEventSchedule(sc).entries.length, 0);
  assert.deepEqual(written, [[128, 0x000c], [130, 0x1234]]);
});

test("restore refuses a non-empty D2-C table and ignores an empty one", () => {
  assert.throws(
    () =>
      applyWebMetaToState(
        {},
        {
          scenarioRuntimeState: {
            strategicEventOverflow: [
              { type: 11, arg0: 0, arg1: 0, arg2: 0, sequence: 0 },
            ],
          },
        },
      ),
    /non-empty D2-C overflow side table/,
  );
  const state = {};
  applyWebMetaToState(state, {
    scenarioRuntimeState: { strategicEventOverflow: [] },
  });
  assert.equal(state.strategicEventOverflow, undefined);
});
