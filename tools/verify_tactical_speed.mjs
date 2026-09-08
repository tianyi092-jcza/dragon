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
assert.deepEqual(
  budget,
  { frames: 1, remainderMs: 0 },
  "highest speed defaults to one complete rule frame per visible RAF",
);
budget = consumeTacticalFrameBudget(0, 16.67, 4, 12);
assert.deepEqual(
  budget,
  { frames: 12, remainderMs: 0 },
  "multi-frame batches require an explicit non-production limit",
);
budget = consumeTacticalFrameBudget(0, 0, 4);
assert.deepEqual(budget, { frames: 0, remainderMs: 0 });

budget = consumeTacticalFrameBudget(0, normal * 20 + 7, 2);
assert.equal(budget.frames, 1);
assert.ok(
  Math.abs(budget.remainderMs - 7) < 1e-9,
  "a delayed/background frame drops whole missed intervals instead of retaining catch-up debt",
);

const delayedNormal = consumeTacticalFrameBudget(0, 250, 2);
assert.equal(delayedNormal.frames, 1);
assert.ok(Math.abs(normal - 109.85080230844918) < 1e-9);
assert.ok(
  Math.abs(delayedNormal.remainderMs - 30.29839538310164) < 1e-9,
  "a 250ms normal-speed RAF keeps the true modulo phase after advancing once",
);
const untilNextNormal = normal - delayedNormal.remainderMs;
budget = consumeTacticalFrameBudget(
  delayedNormal.remainderMs,
  untilNextNormal - 1,
  2,
);
assert.equal(budget.frames, 0, "retained phase is not eligible one millisecond early");
budget = consumeTacticalFrameBudget(budget.remainderMs, 1, 2);
assert.equal(budget.frames, 1, "retained phase becomes eligible at the exact next interval");
assert.ok(Math.abs(budget.remainderMs) < 1e-9);

for (let speed = 0; speed < 5; speed++) {
  const interval = tacticalFrameIntervalMs(speed);
  const delayed = consumeTacticalFrameBudget(0, 250, speed);
  assert.equal(delayed.frames, 1, `speed ${speed}: delayed callback advances at most once`);
  assert.ok(
    Math.abs(delayed.remainderMs - (interval === 0 ? 0 : 250 % interval)) < 1e-9,
    `speed ${speed}: delayed callback retains its true fractional phase`,
  );
  for (const unsafeElapsed of [-1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])
    assert.deepEqual(
      consumeTacticalFrameBudget(0, unsafeElapsed, speed),
      { frames: 0, remainderMs: 0 },
      `speed ${speed}: negative/nonfinite elapsed time is ignored`,
    );
}
for (const unsafeAccumulator of [-1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])
  assert.deepEqual(
    consumeTacticalFrameBudget(unsafeAccumulator, 1, 2),
    { frames: 0, remainderMs: 1 },
    "negative/nonfinite phase is ignored",
  );

process.stdout.write(
  "tactical speed OK: original 291.304Hz/64,48,32,16,0 gates; exact 250ms modulo phase; finite nonnegative safety; one-frame RAF cap; no background debt\n",
);
