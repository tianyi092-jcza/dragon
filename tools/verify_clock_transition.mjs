import assert from "node:assert/strict";

const { Clock, STRATEGIC_SPEEDS, MAX_TICKS_PER_FRAME } = await import("../web/src/game/clock.js");

assert.deepEqual(
  STRATEGIC_SPEEDS,
  [120, 70, 40, 20, 6.25],
  "战略五档相较旧表现值整体提速3倍，普通档每主更新40ms",
);

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
assert.equal(clock.hour, 0);
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
assert.equal(legacy.hour, 0);
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
// 单个RAF至多执行MAX_TICKS_PER_FRAME次（60Hz喂饱最高速），超额欠账丢弃；
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
assert.equal(frameClock.advanceFrame(frameClock.currentStep * 20), true);
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
});
monthHold.sub = 8;
monthHold.hour = 23;
monthHold.advance(monthHold.currentStep);
assert.equal(monthHold.day, 31);
assert.equal(monthHold.month, 1);
assert.equal(months, 0);
monthHold.hold = false;
monthHold.advance(monthHold.currentStep);
assert.equal(monthHold.day, 1);
assert.equal(monthHold.month, 2);
assert.equal(monthHold.hour, 1, "1DDB清零后1DE0仍会把新日时刻加到1");
assert.equal(months, 1);

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
