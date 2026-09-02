import assert from "node:assert/strict";

const {
  TACTICAL_IRQ_WAIT_COUNTS,
  YNSOUND_TIMER_HZ,
  YNSOUND_TIMER_PERIOD_MS,
  consumeTacticalFrameBudget,
  tacticalFrameIntervalMs,
} = await import("../web/src/game/tacticalclock.js");

assert.deepEqual(TACTICAL_IRQ_WAIT_COUNTS, [64, 48, 32, 16, 0]);
assert.ok(Math.abs(YNSOUND_TIMER_HZ - 291.30419921875) < 1e-9);
assert.ok(Math.abs(YNSOUND_TIMER_PERIOD_MS - 3.4328375721390367) < 1e-12);
assert.ok(Math.abs(tacticalFrameIntervalMs(0) - 219.70160461689835) < 1e-9);
assert.ok(Math.abs(tacticalFrameIntervalMs(1) - 164.77620346267378) < 1e-9);
assert.ok(Math.abs(tacticalFrameIntervalMs(2) - 109.85080230844918) < 1e-9);
assert.ok(Math.abs(tacticalFrameIntervalMs(3) - 54.92540115422459) < 1e-9);
assert.equal(tacticalFrameIntervalMs(4), 0);
assert.equal(tacticalFrameIntervalMs(-1), tacticalFrameIntervalMs(0));
assert.equal(tacticalFrameIntervalMs(99), tacticalFrameIntervalMs(4));

const normal = tacticalFrameIntervalMs(2);
let budget = consumeTacticalFrameBudget(0, normal - 1, 2);
assert.deepEqual(budget, { frames: 0, remainderMs: normal - 1 });
budget = consumeTacticalFrameBudget(budget.remainderMs, 1, 2);
assert.equal(budget.frames, 1);
assert.ok(Math.abs(budget.remainderMs) < 1e-9);
budget = consumeTacticalFrameBudget(0, 16.67, 4);
assert.deepEqual(budget, { frames: 12, remainderMs: 0 });
budget = consumeTacticalFrameBudget(0, 0, 4);
assert.deepEqual(budget, { frames: 0, remainderMs: 0 });

process.stdout.write(
  "tactical speed OK: YNSOUND 291.304Hz callback and 64/48/32/16/0 IRQ gates\n",
);
