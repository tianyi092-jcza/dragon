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

function fixture({ trust = 100, selector = 0x0196, pointer = 0 } = {}) {
  const messages = [];
  let gameOverChecks = 0;
  let rngCalls = 0;
  const strategicEventSlots = Array(256).fill(null);
  strategicEventSlots[0] = {
    type: 13,
    arg0: 0,
    arg1: selector & 0xff,
    arg2: selector >>> 8,
  };
  const scenario = {
    trust,
    nativePlayerFactionPointer: pointer,
    nativeFactionSlots: {
      version: 1,
      records: [{ idx: 0, monarch_idx: 0 }],
    },
    nativeLegionSlots: { version: 1, records: [] },
    generals: [
      {
        idx: 0,
        portrait: 5,
        talk_idx: 2,
        name: "君主",
      },
    ],
    strategicEventSlots,
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
    gamebar: {
      enqueueTalkMessage(message) {
        messages.push(message);
      },
      syncClock() {},
    },
    checkTrustGameOver() {
      gameOverChecks++;
      return scenario.trust === 0;
    },
  };
  return {
    app,
    scenario,
    messages,
    checks: () => gameOverChecks,
    rngCalls: () => rngCalls,
  };
}

test("fixed KI type13 jump-table entry and 3507/3DC9 bodies", () => {
  assert.equal(raw(0x320a, 2).toString("hex"), "0735");
  assert.equal(
    raw(0x3507, 0x13).toString("hex"),
    "e8ddd7b093b93300e8fe52b0328bcae8b008c3",
  );
  assert.equal(
    raw(0x3dc9, 0x48).toString("hex"),
    "1e5053512e8e1e520d2e2806000d73092ec606000d00b99e01b002e80ec583f9ff741be8104a8aa75e428a874142e8164a2e803e000d007505b001e8aadeb002e87420595b581fc3",
  );
});

test("native type13 waits for TALK51, subtracts, then waits for ruler personality TALK", () => {
  const { app, scenario, messages, checks, rngCalls } = fixture({ trust: 100 });
  assert.equal(tickStrategicWarEvents(app), true);
  assert.equal(scenario._strategicEventCursor, 1);
  assert.equal(scenario._strategicEventDivider, 10);
  assert.equal(scenario.trust, 100);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].talkIndex, 51);
  assert.equal(messages[0].kind, "deficit-trust-notice");
  assert.equal(app._strategicEventPostMessageRngPending, true);
  messages[0].onClose();
  assert.equal(scenario.trust, 50);
  assert.equal(messages.length, 2);
  assert.equal(messages[1].talkIndex, 408, "selector406 + personality2");
  assert.equal(messages[1].gen.idx, 0);
  assert.equal(checks(), 0);
  messages[1].onClose();
  assert.equal(checks(), 0, "3DFA only enters 1CB1 when trust is zero");
  assert.equal(app._strategicEventPostMessageRngPending, false);
  assert.equal(app._nativeDeficitTrustContinuation, null);
  assert.equal(rngCalls(), 0);
});

test("exact-zero and underflow select distinct rebukes; game over waits for second return", () => {
  for (const [trust, talkIndex] of [
    [50, 408],
    [49, 472],
  ]) {
    const { app, scenario, messages, checks } = fixture({ trust });
    tickStrategicWarEvents(app);
    messages[0].onClose();
    assert.equal(scenario.trust, 0);
    assert.equal(messages[1].talkIndex, talkIndex);
    assert.equal(checks(), 0);
    messages[1].onClose();
    assert.equal(checks(), 1);
  }
});

test("FFFF selector skips ruler TALK and trust-zero check exactly as 3DE7 branch", () => {
  const { app, scenario, messages, checks } = fixture({ selector: 0xffff });
  tickStrategicWarEvents(app);
  messages[0].onClose();
  assert.equal(scenario.trust, 50);
  assert.equal(messages.length, 1);
  assert.equal(checks(), 0);
  assert.equal(app._strategicEventPostMessageRngPending, false);
});

test("missing 87FF pointer fails after committed trust subtraction and holds", () => {
  const { app, scenario, messages } = fixture({ pointer: 1 });
  tickStrategicWarEvents(app);
  assert.throws(() => messages[0].onClose(), /aligned player faction pointer/);
  assert.equal(scenario.trust, 50);
  assert.equal(app.clock.hold, true);
  assert.ok(app._strategicBattleFailure?.error);
  assert.equal(app._strategicEventPostMessageRngPending, true);
  assert.equal(messages.length, 1);
});
