import assert from "node:assert/strict";

const { Clock, STRATEGIC_SPEEDS } = await import("../web/src/game/clock.js");

assert.deepEqual(
  STRATEGIC_SPEEDS,
  [240, 140, 80, 40, 12.5],
  "战略五档相较旧表现值整体提速1倍，普通档每主更新80ms",
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
// 最多执行一个战略主更新，避免同一军团跨道路点或接战四相不可见。
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
assert.equal(frameTicks, 1, "大dt的单个RAF最多执行一个战略主更新");
assert.equal(frameClock._acc, 0, "整帧欠账丢弃，只保留小于step的相位");
assert.equal(frameClock.advanceFrame(frameClock.currentStep / 2), false);
assert.equal(frameClock.advanceFrame(frameClock.currentStep / 2), true);
assert.equal(frameTicks, 2, "小数相位跨RAF累积后正常执行下一更新");

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
assert.equal(months, 1);

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
