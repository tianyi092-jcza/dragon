// D2-EVENT-64 P2: 绝对位置调度表（Web产品决定，用户确认 D0–D8 全部 (a)）。
// 覆盖：缺字段无损、绝对槽号、排序、carry 重定向、批量取用冻结、真实 JSON
// 往返、损坏拒绝、0 RNG。纯内存，不接原轮、不读存档。
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SCHEDULE_VERSION,
  absolutePosition,
  advanceScheduleEpoch,
  carryOverdueEntries,
  ensureStrategicEventSchedule,
  pendingScheduledCount,
  positionEpoch,
  positionSlot,
  recordCarryEvent,
  recordOverflowEvent,
  strategicEventEpoch,
  takeScheduledEntries,
  STRATEGIC_EVENT_RANKS,
} from '../web/src/game/navigation/strategiceventschedule.js';

const byteRecord = (type = 0x0b, arg0 = 1, arg1 = 2, arg2 = 3) => ({
  type,
  arg0,
  arg1,
  arg2,
});

test('missing field converts losslessly to an empty epoch-0 schedule', () => {
  const sc = { strategicEventSlots: Array(64).fill(null) };
  const schedule = ensureStrategicEventSchedule(sc);
  assert.equal(schedule.version, SCHEDULE_VERSION);
  assert.equal(schedule.epoch, 0);
  assert.deepEqual(schedule.entries, []);
  assert.equal(strategicEventEpoch(sc), 0);
  assert.equal(pendingScheduledCount(sc), 0);
  // 原轮本身仍是完整 DOS 状态：转换不发明条目。
  assert.equal(schedule.entries.length, 0);
});

test('absolute slot numbering is epoch*64+slot', () => {
  assert.equal(absolutePosition(0, 0), 0);
  assert.equal(absolutePosition(0, 63), 63);
  assert.equal(absolutePosition(1, 0), 64);
  assert.equal(absolutePosition(4, 8), 264);
  assert.equal(positionEpoch(264), 4);
  assert.equal(positionSlot(264), 8);
});

test('overflow keeps position order then sequence order', () => {
  const sc = {};
  recordOverflowEvent(sc, 200, byteRecord(0x0b));
  recordOverflowEvent(sc, 100, byteRecord(0x0c));
  recordOverflowEvent(sc, 100, byteRecord(0x0d));
  recordOverflowEvent(sc, 0x300, byteRecord(0x0e));
  const entries = ensureStrategicEventSchedule(sc).entries;
  assert.deepEqual(
    entries.map((entry) => [entry.position, entry.type]),
    [
      [100, 0x0c],
      [100, 0x0d],
      [200, 0x0b],
      [0x300, 0x0e],
    ],
  );
  assert.equal(sc._strategicEventSeq, 4, 'one counter step per record, no RNG');
});

test('carry rank dispatches before overflow at the same position', () => {
  const sc = { _strategicEventSeq: 10 };
  recordOverflowEvent(sc, 64, byteRecord(0x01));
  recordCarryEvent(sc, 64, byteRecord(0x02), 3);
  recordCarryEvent(sc, 64, byteRecord(0x03), 1);
  const carry = takeScheduledEntries(sc, 64, STRATEGIC_EVENT_RANKS.carry);
  assert.deepEqual(
    carry.map((entry) => entry.type),
    [0x03, 0x02],
  );
  const overflow = takeScheduledEntries(sc, 64, STRATEGIC_EVENT_RANKS.overflow);
  assert.deepEqual(
    overflow.map((entry) => entry.type),
    [0x01],
  );
  assert.equal(pendingScheduledCount(sc), 0);
});

test('taking one position leaves other positions and ranks intact', () => {
  const sc = {};
  recordOverflowEvent(sc, 64, byteRecord(0x01));
  recordOverflowEvent(sc, 65, byteRecord(0x02));
  recordCarryEvent(sc, 65, byteRecord(0x03), 0);
  const taken = takeScheduledEntries(sc, 64, STRATEGIC_EVENT_RANKS.overflow);
  assert.equal(taken.length, 1);
  assert.equal(pendingScheduledCount(sc), 2);
  const rest = takeScheduledEntries(sc, 65, STRATEGIC_EVENT_RANKS.carry);
  assert.deepEqual(
    rest.map((entry) => entry.type),
    [0x03],
  );
  assert.equal(pendingScheduledCount(sc), 1);
});

test('rotation moves overdue entries to the new slot 0, order preserved', () => {
  const sc = {};
  recordOverflowEvent(sc, 10, byteRecord(0x0a));
  recordOverflowEvent(sc, 70, byteRecord(0x0b)); // 已是新纪元
  recordOverflowEvent(sc, 63, byteRecord(0x0c));
  const moved = carryOverdueEntries(sc, 1);
  assert.equal(moved, 2);
  const entries = ensureStrategicEventSchedule(sc).entries;
  assert.deepEqual(
    entries.map((entry) => [entry.position, entry.rank, entry.type]),
    [
      [64, STRATEGIC_EVENT_RANKS.carry, 0x0a],
      [64, STRATEGIC_EVENT_RANKS.carry, 0x0c],
      [70, STRATEGIC_EVENT_RANKS.overflow, 0x0b],
    ],
  );
  // 多次轮转仍同一规则：新纪元位置 0 的 carry 再被搬到下一纪元。
  carryOverdueEntries(sc, 2);
  const next = ensureStrategicEventSchedule(sc).entries;
  assert.deepEqual(
    next.map((entry) => entry.position),
    [128, 128, 128],
  );
});

test('epoch advance is a plain counter and keeps entries', () => {
  const sc = {};
  recordOverflowEvent(sc, 300, byteRecord(0x0b));
  assert.equal(advanceScheduleEpoch(sc), 1);
  assert.equal(advanceScheduleEpoch(sc), 2);
  assert.equal(strategicEventEpoch(sc), 2);
  assert.equal(pendingScheduledCount(sc), 1);
});

test('region snapshot and city generation survive a real JSON round trip', () => {
  const sc = {};
  recordOverflowEvent(sc, 264, {
    ...byteRecord(0x0b, 0, 0, 0),
    region: { minX: 190, maxX: 200, minY: 140, maxY: 150 },
    generation: 7,
  });
  ensureStrategicEventSchedule(sc);
  const cloned = JSON.parse(JSON.stringify(sc));
  assert.deepEqual(cloned.strategicEventSchedule, sc.strategicEventSchedule);
  const taken = takeScheduledEntries(
    cloned,
    264,
    STRATEGIC_EVENT_RANKS.overflow,
  );
  assert.deepEqual(taken[0].region, {
    minX: 190,
    maxX: 200,
    minY: 140,
    maxY: 150,
  });
  assert.equal(taken[0].generation, 7);
});

test('corrupt schedules fail closed instead of being repaired', () => {
  const cases = [
    { version: 99, epoch: 0, entries: [] },
    { version: SCHEDULE_VERSION, epoch: -1, entries: [] },
    { version: SCHEDULE_VERSION, epoch: 0, entries: 'nope' },
    { version: SCHEDULE_VERSION, epoch: 0, entries: [null] },
    {
      version: SCHEDULE_VERSION,
      epoch: 0,
      entries: [{ position: 0, rank: 2, order: 0, type: 1, arg0: 0, arg1: 0, arg2: 0 }],
    },
    {
      version: SCHEDULE_VERSION,
      epoch: 0,
      entries: [{ position: 0, rank: 1, order: -1, type: 1, arg0: 0, arg1: 0, arg2: 0 }],
    },
    {
      version: SCHEDULE_VERSION,
      epoch: 0,
      entries: [{ position: 0, rank: 1, order: 0, type: 0x1ff, arg0: 0, arg1: 0, arg2: 0 }],
    },
    {
      version: SCHEDULE_VERSION,
      epoch: 0,
      entries: [{ position: 0, rank: 1, order: 0, type: 1, arg0: 0, arg1: 0, arg2: 0, region: { minX: 0 } }],
    },
    {
      version: SCHEDULE_VERSION,
      epoch: 0,
      entries: [{ position: 0, rank: 1, order: 0, type: 1, arg0: 0, arg1: 0, arg2: 0, generation: -2 }],
    },
  ];
  for (const bad of cases)
    assert.throws(
      () => ensureStrategicEventSchedule({ strategicEventSchedule: bad }),
      RangeError,
      JSON.stringify(bad),
    );
  assert.throws(() => ensureStrategicEventSchedule(null), RangeError);
  assert.throws(() => recordOverflowEvent({}, 0, { ...byteRecord(), type: 300 }), RangeError);
  assert.throws(() => recordOverflowEvent({}, -1, byteRecord()), RangeError);
});
