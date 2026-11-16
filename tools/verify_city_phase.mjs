// Pure in-memory D1 contract checks; no source assets, SAVE, IDB or network.
import assert from 'node:assert/strict';
import test from 'node:test';
import { cityPhaseRange } from '../web/src/game/cityphase.js';

for (const count of [0, 1, 191, 192, 193, 257, 384 * 256]) {
  test(`${count} cities visited exactly once per 192 phases`, () => {
    const ranges = Array.from({ length: 192 }, (_, phase) => cityPhaseRange(phase, count));
    assert.equal(ranges[0].start, 0);
    assert.equal(ranges[191].end, count);
    ranges.forEach((range, phase) => {
      assert.equal(range.nextPhase, (phase + 1) % 192);
      if (phase) assert.equal(range.start, ranges[phase - 1].end);
      assert.ok(range.end - range.start <= Math.ceil(count / 192));
      assert.ok(range.end - range.start >= Math.floor(count / 192));
    });
    const visits = ranges.flatMap(({ start, end }) =>
      Array.from({ length: end - start }, (_, index) => start + index));
    assert.deepEqual(visits, Array.from({ length: count }, (_, index) => index));
  });
}
test('192 preserves every old city cursor; 193 ends with two cities; 257 includes index256', () => {
  for (let phase = 0; phase < 192; phase++) {
    assert.equal(cityPhaseRange(phase, 192).start, phase);
    assert.equal(cityPhaseRange(phase, 192).end, phase + 1);
  }
  assert.deepEqual(cityPhaseRange(191, 193), { start: 191, end: 193, nextPhase: 0 });
  assert.deepEqual(cityPhaseRange(191, 257), { start: 255, end: 257, nextPhase: 0 });
});
test('phase/count boundary rejects non-integers and fixed-map overflow', () => {
  for (const phase of [-1, 192, 0.5, NaN, undefined, '0'])
    assert.throws(() => cityPhaseRange(phase, 192), RangeError);
  for (const count of [-1, 98305, 0.5, Infinity, undefined, '192'])
    assert.throws(() => cityPhaseRange(0, count), RangeError);
});
