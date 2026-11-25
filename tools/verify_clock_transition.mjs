import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { TrialStrategicClock } from "../web/src/editor/trialruleboundaries.js";

const { Clock, calendarDisplayDay, STRATEGIC_SPEEDS, STRATEGIC_TIMER_MS, MAX_TICKS_PER_FRAME } = await import("../web/src/game/clock.js");

// Original timer and wait gate: explicit KI/COM only, never DOS SAVE.DAT.
const ki = readFileSync(new URL("../../Dragon/KI.EXE", import.meta.url));
const soundDriver = readFileSync(new URL("../../Dragon/YNSOUND.COM", import.meta.url));
assert.equal(ki.subarray(0x1df8 + 0x200, 0x1e17 + 0x200).toString("hex"),
  "a0fa0c22c07417803e2c0d0074f938062d0d72fac6062d0d00c6062c0d00c3");
assert.equal(soundDriver.subarray(0x8d7 - 0x100, 0x8e4 - 0x100).toString("hex"),
  "b036e643b80001e6408ac4e640");
assert.equal(ki.subarray(0x1dd1 + 0x200, 0x1dec + 0x200).toString("hex"),
  "a3f00ce88135fe06f00cc606f30c00fe06f30cc606f20c00e88b75");
assert.equal(STRATEGIC_TIMER_MS, 1000 * 256 * 16 / 1193182);
assert.deepEqual(STRATEGIC_SPEEDS, [24, 16, 9.6, 6.4, 4.8], "user-approved Web intervals, not DOS timer rounding");
assert.equal(MAX_TICKS_PER_FRAME, 16, "two slot sweeps; at most one normal period-2/3 movement per RAF");

// Both entry points must consume the same source, including the generated
// server trial bundle. Read only these explicit source/bundle paths; no saves.
let bundle;
try {
  bundle = JSON.parse(readFileSync(new URL("../server/public/trialweb.txt", import.meta.url), "utf8"));
} catch (cause) {
  throw new Error("Cannot read generated Trial bundle", { cause });
}
for (const path of ["src/game/clock.js", "src/editor/trialruleboundaries.js", "src/render/engagementpresentation.js"]) {
  const source = readFileSync(new URL(`../web/${path}`, import.meta.url));
  const packed = bundle.files.find((file) => file.path === path);
  assert.equal(packed.text, source.toString("utf8"), `${path}: trial bundle current`);
  assert.equal(packed.byteLength, source.length);
  assert.equal(packed.sha256, createHash("sha256").update(source).digest("hex"));
}

// Simulated 60Hz: all five rates are distinct and player/Trial remain identical.
// Calendar and rule counts are independent of display sampling.
for (const speed of [0, 1, 2, 3, 4]) {
  const options = { startYear: 196, startMonth: 1 };
  const base = new Clock(options);
  const trial = new TrialStrategicClock({
    ...options, gate: { canAdvanceRules: true, rulePermit: {} },
  });
  for (const c of [base, trial]) c.strategicSpeed = speed;
  for (let frame = 0; frame < 600; frame++) {
    base.advanceFrame(1000 / 60);
    trial.advanceFrame(1000 / 60);
  }
  const expected = Math.min(10000 / STRATEGIC_SPEEDS[speed], 600 * MAX_TICKS_PER_FRAME);
  assert.ok(Math.abs(base.strategicTickSerial - expected) < 1.001);
  if (speed === 4) assert.equal(base.strategicTickSerial, 2083, "top speed matches the former normal rate");
  if (speed > 0) assert.ok(STRATEGIC_SPEEDS[speed] < STRATEGIC_SPEEDS[speed - 1]);
  assert.equal(trial.strategicTickSerial, base.strategicTickSerial);
  assert.deepEqual(trial.serialize(), base.serialize());
  assert.equal(trial.sub, base.sub);
  assert.equal(trial.hour, base.hour);
  // Strategic speed does not change the calendar per completed update.
  const singleStep = new Clock(options);
  for (let i = 0; i < base.strategicTickSerial; i++) singleStep.advance(singleStep.currentStep);
  assert.deepEqual(singleStep.serialize(), base.serialize());
  assert.equal(singleStep.sub, base.sub);
  assert.equal(singleStep.hour, base.hour);
}

// Changing speed preserves fractional strategic progress, not old millisecond debt.
const changing = new Clock({ startYear: 196, startMonth: 1 });
changing.advanceFrame(changing.currentStep * 0.5);
for (const speed of [4, 0, 3, 1, 2]) {
  changing.strategicSpeed = speed;
  assert.ok(Math.abs(changing.dayProgress() - 0.5) < 1e-12);
  assert.equal(changing.strategicTickSerial, 0);
}
// Display phase is not future catch-up budget, and clearing that budget on
// menu/network pause must not rewind a partially displayed road segment.
for (const ClockType of [Clock, TrialStrategicClock]) {
  const gate = { canAdvanceRules: true, rulePermit: {} };
  const c = new ClockType({ startYear: 196, startMonth: 1, gate,
    onStrategicTick: current => assert.equal(current.dayProgress(), 0),
  });
  c.advanceFrame(c.currentStep * 0.75);
  const frozenPhase = c.dayProgress();
  for (const network of ClockType === TrialStrategicClock ? [false, true] : [false]) {
    if (network) { gate.canAdvanceRules = false; gate.rulePermit = null; }
    else c.hold = true;
    c.advanceFrame(100000);
    assert.equal(c._acc, 0);
    assert.equal(c.dayProgress(), frozenPhase);
    c.strategicSpeed = 4;
    assert.equal(c._acc, 0, "changing speed cannot restore discarded budget");
    c.hold = false;
    gate.canAdvanceRules = true;
    if (network) gate.rulePermit = {};
    c.advanceFrame(c.currentStep * 0.25);
    assert.equal(c.dayProgress(), frozenPhase);
  }
  c.hold = false;
  gate.canAdvanceRules = true;
  c.advanceFrame(c.currentStep * MAX_TICKS_PER_FRAME);
  assert.ok(Math.abs(c.dayProgress()) < 1e-12);
}
for (const hz of [30, 60, 144]) {
  const sampled = new Clock({ startYear: 196, startMonth: 1 });
  sampled.strategicSpeed = 4;
  for (let frame = 0; frame < hz; frame++) {
    const before = sampled.strategicTickSerial;
    sampled.advanceFrame(1000 / hz);
    assert.ok(sampled.strategicTickSerial - before <= MAX_TICKS_PER_FRAME);
  }
  const expected = Math.min(1000 / STRATEGIC_SPEEDS[4], hz * MAX_TICKS_PER_FRAME);
  assert.ok(Math.abs(sampled.strategicTickSerial - expected) < 1.001,
    "30/60/144Hz respect both the frame budget and the configured top rate");
}

let days = 0;
const clock = new Clock({
  startYear: 190,
  startMonth: 1,
  startDay: 1,
  onDay(current) {
    days++;
    current.hold = true;
  },
});
clock.strategicSpeed = 4;
clock.sub = 8;
clock.hour = 23;
clock._acc = 0;
clock.advance(clock.currentStep * 20);
assert.equal(days, 1, "large dt stops after onDay obtains hold");
assert.equal(clock.hour, 23);
assert.equal(clock.sub, 8);
assert.equal(clock._acc, 0);

const legacy = new Clock({
  startYear: 190,
  startMonth: 1,
  startDay: 1,
  onDay(current) {
    current._legacyPaused = true;
  },
});
legacy.strategicSpeed = 4;
legacy.sub = 8;
legacy.hour = 23;
legacy.advance(legacy.currentStep * 20);
assert.equal(legacy.hour, 23);
assert.equal(legacy._acc, 0);

// 高速档的大dt中，战略tick刚建立委任过渡后必须在同一catch-up循环
// 同步hold；不能等下一浏览器RAF才由GameBar发现，否则日期仍继续跑。
let transitionActive = false;
let transitionTicks = 0;
const transitionClock = new Clock({
  startYear: 190,
  startMonth: 1,
  startDay: 1,
  onStrategicTick() {
    transitionTicks++;
    transitionActive = true;
  },
  onSyncHold() {
    transitionClock.hold = transitionActive;
  },
});
transitionClock.strategicSpeed = 4;
transitionClock.advance(transitionClock.currentStep * 20);
assert.equal(transitionTicks, 1, "委任过渡建立后必须立即停止高速追赶");
assert.equal(transitionClock.sub, 1, "仅当前0x1D0B完成，后续日历追赶必须冻结");
assert.equal(transitionClock._acc, 0);

// 浏览器RAF不得追赶整帧欠账；即使最高速遇到大dt，每次Canvas提交前
// 单个RAF至多执行MAX_TICKS_PER_FRAME次（60Hz最高约960次/秒），超额欠账丢弃；
// hold在每次更新后检查，任一接战即停（advanceFrame内单测用hold变体另覆盖）。
let frameTicks = 0;
const frameClock = new Clock({
  startYear: 190,
  startMonth: 1,
  startDay: 1,
  onStrategicTick() {
    frameTicks++;
  },
});
frameClock.strategicSpeed = 4;
assert.equal(frameClock.advanceFrame(frameClock.currentStep * 100), true);
assert.equal(frameTicks, MAX_TICKS_PER_FRAME, "大dt单个RAF按上限执行后停");
assert.ok(frameClock._acc < frameClock.currentStep, "超额欠账丢弃，只保留小于step的相位");
assert.equal(frameClock.advanceFrame(frameClock.currentStep / 2), false);
assert.equal(frameClock.advanceFrame(frameClock.currentStep / 2), true);
assert.equal(frameTicks, MAX_TICKS_PER_FRAME + 1, "小数相位跨RAF累积后正常执行下一更新");

// 首tick置hold：同一RAF内不再执行后续更新（接战四相即停）。
let holdTicks = 0;
const holdClock = new Clock({
  startYear: 190,
  startMonth: 1,
  startDay: 1,
  onStrategicTick() {
    holdTicks++;
    holdClock.hold = true;
  },
});
holdClock.strategicSpeed = 4;
assert.equal(holdClock.advanceFrame(holdClock.currentStep * 20), true);
assert.equal(holdTicks, 1, "hold后同一RAF不再推进");

// 月末当天onDay取得hold时，同一_tick不能继续月进位或触发月结算。
let months = 0;
const preparedDates = [];
let holdMonthOnce = true;
const monthHold = new Clock({
  startYear: 190,
  startMonth: 1,
  startDay: 31,
  onDay(current) {
    if (holdMonthOnce) {
      holdMonthOnce = false;
      current.hold = true;
    }
  },
  onMonthEnd() {
    months++;
  },
  onStrategicUpdateComplete(c) { preparedDates.push([c.strategicTickSerial, c.month, c.day, c.hour]); },
});
monthHold.sub = 8;
monthHold.hour = 23;
monthHold.advance(monthHold.currentStep);
assert.equal(monthHold.day, 31);
assert.equal(monthHold.month, 1);
assert.equal(months, 0);
assert.deepEqual(preparedDates, [], '2533 cannot run before the suspended calendar returns');
monthHold.hold = false;
monthHold.advance(monthHold.currentStep);
assert.equal(monthHold.day, 1);
assert.equal(monthHold.month, 2);
assert.equal(monthHold.hour, 1, "1DDB清零后1DE0仍会把新日时刻加到1");
assert.equal(months, 1);
assert.deepEqual(preparedDates, [[1, 2, 1, 1]], 'prepare once after the calendar, not before month reset');
monthHold.advanceFrame(0);
assert.equal(preparedDates.length, 1, 'no duplicate completion on a no-update RAF');

// 5358 held at a message: day=0, old CF3/CF2 remain until 1DD7/1DDB/1DE4.
for (const ClockType of [Clock, TrialStrategicClock]) for (const speed of [0, 1, 2, 3, 4]) {
  const calls = [];
  const c = new ClockType({ startYear: 196, startMonth: 2, startDay: 28,
    gate: { canAdvanceRules: true, rulePermit: {} },
    onStrategicTick: () => calls.push('rules'),
    onMonthEnd(current) {
      calls.push(['month', current.month, current.day, current.hour, current.sub]);
      current.hold = true;
    },
    onHour: current => calls.push(['hour', current.month, current.day, current.hour, current.sub]),
    onStrategicUpdateComplete: () => calls.push('objects'),
  });
  c.strategicSpeed = speed;
  c.sub = 8; c.hour = 23;
  c.advanceFrame(c.currentStep * 8);
  assert.equal(c._pendingMonthAdvance, true);
  assert.equal(calendarDisplayDay(c), 1, 'Never show day zero during the month-end message');
  assert.deepEqual([c.month, c.day, c.hour, c.sub], [3, 0, 23, 8]);
  assert.deepEqual(calls, ['rules', ['month', 3, 0, 23, 8]]);
  c.advanceFrame(100000);
  assert.equal(calls.length, 2);
  c.hold = false;
  c.advanceFrame(0);
  assert.equal(calls.length, 2, '2533 cannot precede the pending month return');
  c.advanceFrame(c.currentStep);
  assert.equal(c.strategicTickSerial, 1, 'resuming 1DD7 is not a new rule update');
  assert.equal(c._pendingMonthAdvance, false);
  assert.deepEqual(calls, ['rules', ['month', 3, 0, 23, 8], ['hour', 3, 1, 1, 0], 'objects']);
  c.advanceFrame(0);
  assert.equal(calls.length, 4, 'no duplicate hour callback or preparation');
}

// 1DA3..1DD7：5358看到新年月与day低字节0，真实返回后day才加一。
for (const [startYear, expectedYear] of [
  [999, 1000],
  [1000, 999],
  [1001, 999],
  [0xffff, 999],
]) {
  const calls = [];
  const boundary = new Clock({
    startYear,
    startMonth: 12,
    startDay: 31,
    onYearEnd: (current) =>
      calls.push(["year", current.year, current.month, current.day]),
    onMonthEnd: (current) =>
      calls.push(["month", current.year, current.month, current.day]),
  });
  boundary._advanceDayCalendar();
  assert.deepEqual(
    [boundary.year, boundary.month, boundary.day],
    [expectedYear, 1, 1],
  );
  assert.deepEqual(calls, [
    ["year", expectedYear, 1, 0],
    ["month", expectedYear, 1, 0],
  ]);
}
{
  const calls = [];
  const boundary = new Clock({
    startYear: 190,
    startMonth: 1,
    startDay: 31,
    onMonthEnd: (current) =>
      calls.push([current.year, current.month, current.day]),
  });
  boundary._advanceDayCalendar();
  assert.deepEqual(calls, [[190, 2, 0]]);
  assert.deepEqual([boundary.year, boundary.month, boundary.day], [190, 2, 1]);
}

// 0x1D8E：CF2必须经历0..8共9次主更新才进一时刻；onStrategicTick每次执行。
let strategicTicks = 0;
let hours = 0;
const layered = new Clock({
  startYear: 190,
  startMonth: 1,
  startDay: 1,
  onStrategicTick() {
    strategicTicks++;
  },
  onHour() {
    hours++;
  },
});
for (let i = 0; i < 8; i++) layered.advance(layered.currentStep);
assert.equal(layered.sub, 8);
assert.equal(layered.hour, 0);
layered.advance(layered.currentStep);
assert.equal(layered.sub, 0);
assert.equal(layered.hour, 1);
assert.equal(strategicTicks, 9);
assert.equal(hours, 1);

process.stdout.write(
  "clock transition OK: 9 strategic ticks/hour + bounded RAF + catch-up and month rollover holds\n",
);
