import assert from "node:assert/strict";

const { Clock } = await import("../web/src/game/clock.js");

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
legacy.hour = 23;
legacy.advance(legacy.currentStep * 20);
assert.equal(legacy.hour, 0);
assert.equal(legacy._acc, 0);

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

process.stdout.write(
  "clock transition OK: catch-up and month rollover stop on hold/legacy pause\n",
);
