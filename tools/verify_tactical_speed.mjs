import assert from "node:assert/strict";

const {
  TACTICAL_HIGHEST_SPEED_CAP_MS,
  TACTICAL_PLAYBACK_RATE,
  TACTICAL_IRQ_WAIT_COUNTS,
  YNSOUND_TIMER_HZ,
  YNSOUND_TIMER_PERIOD_MS,
  consumeTacticalFrameBudget,
  tacticalFrameIntervalMs,
} = await import("../web/src/game/tacticalclock.js");

assert.deepEqual(TACTICAL_IRQ_WAIT_COUNTS, [64, 48, 32, 16, 0]);
assert.ok(Math.abs(YNSOUND_TIMER_HZ - 291.30419921875) < 1e-9);
assert.ok(Math.abs(YNSOUND_TIMER_PERIOD_MS - 3.4328375721390367) < 1e-12);
const beforeIntervals = [
  219.70160461689835,
  164.77620346267378,
  109.85080230844918,
  54.92540115422459,
  1000 / 60,
];
assert.equal(
  TACTICAL_PLAYBACK_RATE,
  0.5,
  "user-approved Web playback policy, not an original IRQ claim",
);
for (let speed = 0; speed < 5; speed++) {
  assert.ok(
    Math.abs(tacticalFrameIntervalMs(speed) - beforeIntervals[speed] * 2) <
      1e-9,
  );
}
assert.equal(TACTICAL_HIGHEST_SPEED_CAP_MS, 1000 / 30);
assert.equal(
  tacticalFrameIntervalMs(4),
  TACTICAL_HIGHEST_SPEED_CAP_MS,
  "Web highest speed uses a refresh-rate-independent 30Hz cap; raw IRQ wait remains zero",
);
assert.equal(tacticalFrameIntervalMs(-1), tacticalFrameIntervalMs(0));
assert.equal(tacticalFrameIntervalMs(99), tacticalFrameIntervalMs(4));

const normal = tacticalFrameIntervalMs(2);
let budget = consumeTacticalFrameBudget(0, normal - 1, 2);
assert.deepEqual(budget, { frames: 0, remainderMs: normal - 1 });
budget = consumeTacticalFrameBudget(budget.remainderMs, 1, 2);
assert.equal(budget.frames, 1);
assert.ok(Math.abs(budget.remainderMs) < 1e-9);
const highest = tacticalFrameIntervalMs(4);
budget = consumeTacticalFrameBudget(0, highest - 0.01, 4);
assert.equal(
  budget.frames,
  0,
  "highest speed honors the fixed browser-frame cap",
);
budget = consumeTacticalFrameBudget(budget.remainderMs, 0.01, 4);
assert.equal(budget.frames, 1);
assert.ok(Math.abs(budget.remainderMs) < 1e-9);
budget = consumeTacticalFrameBudget(0, highest * 12, 4, 12);
assert.deepEqual(
  budget,
  { frames: 12, remainderMs: 0 },
  "multi-frame batches require an explicit non-production limit",
);
budget = consumeTacticalFrameBudget(0, 0, 4);
assert.deepEqual(budget, { frames: 0, remainderMs: 0 });

function simulatedHighestFrames(refreshHz, durationMs = 2000) {
  let accumulator = 0;
  let frames = 0;
  const elapsed = 1000 / refreshHz;
  for (let at = 0; at < durationMs - 1e-9; at += elapsed) {
    const next = consumeTacticalFrameBudget(accumulator, elapsed, 4);
    accumulator = next.remainderMs;
    frames += next.frames;
  }
  return frames;
}
for (const refreshHz of [60, 120, 144])
  assert.equal(
    simulatedHighestFrames(refreshHz),
    60,
    `highest speed executes 60 fixed frames in 2s at ${refreshHz}Hz`,
  );

budget = consumeTacticalFrameBudget(0, normal * 20 + 7, 2);
assert.equal(budget.frames, 1);
assert.ok(
  Math.abs(budget.remainderMs - 7) < 1e-9,
  "a delayed/background frame drops whole missed intervals instead of retaining catch-up debt",
);

const delayedNormal = consumeTacticalFrameBudget(0, 250, 2);
assert.equal(delayedNormal.frames, 1);
assert.ok(Math.abs(normal - 219.70160461689835) < 1e-9);
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
assert.equal(
  budget.frames,
  0,
  "retained phase is not eligible one millisecond early",
);
budget = consumeTacticalFrameBudget(budget.remainderMs, 1, 2);
assert.equal(
  budget.frames,
  1,
  "retained phase becomes eligible at the exact next interval",
);
assert.ok(Math.abs(budget.remainderMs) < 1e-9);

for (let speed = 0; speed < 5; speed++) {
  const interval = tacticalFrameIntervalMs(speed);
  const delayed = consumeTacticalFrameBudget(0, 250, speed);
  assert.equal(
    delayed.frames,
    Math.min(1, Math.floor(250 / interval)),
    `speed ${speed}: delayed callback advances only if due, at most once`,
  );
  const expectedRemainder = 250 % interval;
  assert.ok(
    Math.abs(delayed.remainderMs - expectedRemainder) < 1e-9,
    `speed ${speed}: delayed callback retains its true fractional phase`,
  );
  for (const unsafeElapsed of [
    -1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ])
    assert.deepEqual(
      consumeTacticalFrameBudget(0, unsafeElapsed, speed),
      { frames: 0, remainderMs: 0 },
      `speed ${speed}: negative/nonfinite elapsed time is ignored`,
    );
}
for (const unsafeAccumulator of [
  -1,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
])
  assert.deepEqual(
    consumeTacticalFrameBudget(unsafeAccumulator, 1, 2),
    { frames: 0, remainderMs: 1 },
    "negative/nonfinite phase is ignored",
  );

process.stdout.write(
  "tactical speed OK: original 291.304Hz/64,48,32,16,0 unchanged; all five Web intervals doubled, highest 30Hz; exact modulo phase; one-frame RAF cap; no background debt\n",
);
