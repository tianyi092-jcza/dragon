import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { tickStrategicWarEvents } from "../web/src/game/ai.js";

const ki = fs.readFileSync("E:/Dragon/Dragon/KI.EXE");
assert.equal(
  createHash("sha256").update(ki).digest("hex"),
  "fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868",
);
const raw = (address, length) =>
  ki.subarray(address + 0x200, address + 0x200 + length);

function fixture(talkIndex = 123, arg0 = 0xab, withQueue = true) {
  const messages = [];
  let rngCalls = 0;
  const slots = Array(256).fill(null);
  slots[0] = {
    type: 10,
    arg0,
    arg1: talkIndex & 0xff,
    arg2: talkIndex >>> 8,
  };
  const scenario = {
    nativeLegionSlots: { version: 1, records: [] },
    strategicEventSlots: slots,
    _strategicEventCursor: 0,
    _strategicEventDivider: 1,
  };
  const app = {
    scenario,
    clock: { hold: false },
    originalRng: {
      nextByte() {
        rngCalls++;
        return 0;
      },
    },
    gamebar: withQueue
      ? {
          enqueueGenericTalkEvent(message) {
            messages.push(message);
          },
          syncClock() {},
        }
      : { syncClock() {} },
  };
  return { app, scenario, messages, rngCalls: () => rngCalls };
}

test("fixed KI type10 jump-table entry and 3496 generic TALK body", () => {
  assert.equal(raw(0x3204, 2).toString("hex"), "9634");
  assert.equal(
    raw(0x3496, 0x10).toString("hex"),
    "8ac4b4ff8bca508bfcb093e86c5358c3",
  );
});

test("native type10 preserves arg0/word payload and waits for generic TALK return", () => {
  const { app, scenario, messages, rngCalls } = fixture();
  assert.equal(tickStrategicWarEvents(app), true);
  assert.equal(scenario._strategicEventCursor, 1);
  assert.equal(scenario._strategicEventDivider, 10);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].talkIndex, 123);
  assert.equal(messages[0].arg0, 0xab);
  assert.equal(messages[0].argumentWord, 0xffab);
  assert.equal(messages[0].kind, "native-generic-talk");
  assert.equal(app._strategicEventPostMessageRngPending, true);
  messages[0].onClose();
  assert.equal(app._nativeGenericTalkContinuation, null);
  assert.equal(app._strategicEventPostMessageRngPending, false);
  assert.equal(rngCalls(), 0);
});

test("invalid resource index fails after event cursor prefix and holds", () => {
  const { app, scenario, messages } = fixture(1023);
  assert.throws(() => tickStrategicWarEvents(app), /generic TALK index/);
  assert.equal(scenario._strategicEventCursor, 1);
  assert.equal(scenario._strategicEventDivider, 10);
  assert.equal(messages.length, 0);
  assert.equal(app.clock.hold, true);
  assert.ok(app._strategicBattleFailure?.error);
});

test("missing generic TALK queue fails without fabricating a return", () => {
  const { app, scenario } = fixture(123, 7, false);
  assert.throws(() => tickStrategicWarEvents(app), /generic TALK return/);
  assert.equal(scenario._strategicEventCursor, 1);
  assert.equal(app.clock.hold, true);
});
