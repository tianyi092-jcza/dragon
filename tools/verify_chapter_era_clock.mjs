// CHAPTER-WB Web calendar tests; memory only, no user files or SAVE.DAT.
import assert from 'node:assert/strict';
import test from 'node:test';
import { Clock } from '../web/src/game/clock.js';
import { StartMenu } from '../web/src/ui/startmenu.js';

test('chapter/save date presentation distinguishes BC without changing legacy dates', () => {
  assert.equal(StartMenu.prototype._dateStr({ era: 'bc', year: 1, month: 12, day: 31 }), '前1年 12月 31日');
  assert.equal(StartMenu.prototype._dateStr({ era: 'ad', year: 1, month: 1, day: 1 }), '1年  1月  1日');
  assert.equal(StartMenu.prototype._dateStr({ year: 184, month: 1, day: 1 }), '184年  1月  1日');
});

for (const [era, year, nextEra, nextYear] of [
  ['bc', 2, 'bc', 1], ['bc', 1, 'ad', 1], ['ad', 1, 'ad', 2], ['ad', 1000, 'ad', 1001],
]) test(`${era}${year} advances to ${nextEra}${nextYear} with one suspended settlement`, () => {
  const calls = [];
  const clock = new Clock({ startEra: era, startYear: year, startMonth: 12, startDay: 31,
    onYearEnd: c => calls.push(['year', c.serialize()]),
    onMonthEnd(c) { calls.push(['month', c.serialize()]); c.hold = true; },
  });
  clock.hour = 23; clock.sub = 8;
  clock.advanceFrame(clock.currentStep);
  const monthDate = { year: nextYear, month: 1, day: 0, era: nextEra };
  assert.deepEqual(calls, [['year', monthDate], ['month', monthDate]]);
  clock.advanceFrame(100000);
  assert.equal(calls.length, 2);
  clock.hold = false;
  clock.advanceFrame(clock.currentStep);
  const resumed = { year: nextYear, month: 1, day: 1, era: nextEra };
  assert.deepEqual(clock.serialize(), resumed);
  assert.equal(calls.length, 2, 'message return must not replay settlement');
  // Real JSON date round trip; not a substitute for the App/IDB integration lane.
  const saved = JSON.parse(JSON.stringify(clock.serialize()));
  const restored = new Clock({ startEra: saved.era, startYear: saved.year,
    startMonth: saved.month, startDay: saved.day });
  assert.deepEqual(restored.serialize(), resumed);
  restored.day = 31; restored._advanceDayCalendar();
  assert.deepEqual(restored.serialize(), { ...resumed, month: 2 });
});

test('explicit calendar rejects year zero and unknown era', () => {
  for (const [startEra, startYear] of [['bc', 0], ['ad', -1], ['ad', 1.5], ['bce', 1]])
    assert.throws(() => new Clock({ startEra, startYear, startMonth: 1 }), /calendar/);
});

test('unlabelled legacy calendar keeps native wrap and date shape', () => {
  const clock = new Clock({ startYear: 1000, startMonth: 12, startDay: 31 });
  clock._advanceDayCalendar();
  assert.deepEqual(clock.serialize(), { year: 999, month: 1, day: 1 });
});
