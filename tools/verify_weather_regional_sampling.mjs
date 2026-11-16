// D4 regional sampling: 22DB live-N selection. Scripted RNG + minimal mock
// io (bounds preset to skip 237E). Asserts: N=192 byte-identical to the old
// single-byte pick (accept r<192 -> r, reject r>=192 -> false, 1 byte each);
// N=193 reaches slot 192; N=257 uses two bytes with the 3/4 cap; both
// 1/2 gates and the xLow gate are preserved; RNG consumption is exact.
import assert from 'node:assert/strict';
import test from 'node:test';
import { originalMonthlyWeather22DB } from '../web/src/game/navigation/originalweather.js';

function mockIO({ count, bytes, xLow = 0xc0 }) {
  const log = { bytes: 0, bounds: [], picks: [] };
  let at = 0;
  return { log,
    nextRandomByte() { assert.ok(at < bytes.length, 'RNG overrun'); log.bytes++; return bytes[at++]; },
    readCityCount() { return count; },
    readBoundWord() { return 0xfff0; },
    writeBoundWord(field, value) { log.bounds.push([field, value & 0xffff]); return value & 0xffff; },
    readCityByte() { return xLow; },
    readCityWord(index) { log.picks.push(index); return 100; },
    readEventCursorWord() { return 0; },
    readEventTypeByte() { return 0; },
    writeEventWord() { return 0; },
  };
}

test('N=192 matches the legacy single-byte pick', () => {
  const accept = mockIO({ count: 192, bytes: [1, 100, 0] });
  assert.equal(originalMonthlyWeather22DB(accept), true);
  assert.equal(accept.log.bytes, 3);
  const reject = mockIO({ count: 192, bytes: [1, 200] });
  assert.equal(originalMonthlyWeather22DB(reject), false);
  assert.equal(reject.log.bytes, 2); // rejected before the delay byte
  // 0x18-gate parity spot check: roll byte equals the old formula inputs.
  const edge = mockIO({ count: 192, bytes: [1, 191, 0] });
  assert.equal(originalMonthlyWeather22DB(edge), true);
  assert.equal(edge.log.bytes, 3);
});

test('coverage sweep pins 0..191 for N=192 and N=193 (slot 192 absent)', () => {
  for (const count of [192, 193]) {
    const picked = new Set();
    for (let byte = 0; byte < 192; byte++) {
      const io = mockIO({ count, bytes: [1, byte, 0] });
      assert.equal(originalMonthlyWeather22DB(io), true);
      picked.add(io.log.picks[0]);
    }
    assert.deepEqual([...picked].sort((a, b) => a - b),
      Array.from({ length: 192 }, (_, i) => i));
    assert.equal(picked.has(192), false);
  }
});

test('first 1/2 gate still short-circuits before any pick byte', () => {
  const io = mockIO({ count: 193, bytes: [0] });
  assert.equal(originalMonthlyWeather22DB(io), false);
  assert.equal(io.log.bytes, 1);
});

test('N=193 verbatim: same-byte reject, coverage pins to 0..191 (top slot gap)', () => {
  // cap = floor(256*3/4) = 192 < N: floor(r*193/192) maxes at 191, so slot
  // 192 is unreachable under the verbatim proposal. Pinned here as a verified
  // property; widening k for 193..256 needs an explicit user decision
  // (proposal §9.4 only promises "at most one discrete bucket" skew).
  const legacy = mockIO({ count: 192, bytes: [1, 192] });
  assert.equal(originalMonthlyWeather22DB(legacy), false);
  assert.equal(legacy.log.bytes, 2);
  const added = mockIO({ count: 193, bytes: [1, 192, 0] });
  assert.equal(originalMonthlyWeather22DB(added), false);
  assert.equal(added.log.bytes, 2); // rejected before the delay byte
});

test('N=257 composes two bytes with the 3/4 cap', () => {
  // r = 0xFFFF = 65535 >= floor(65536*3/4) = 49152 -> reject, 2 bytes.
  const reject = mockIO({ count: 257, bytes: [1, 0xff, 0xff] });
  assert.equal(originalMonthlyWeather22DB(reject), false);
  assert.equal(reject.log.bytes, 3);
  // r = 0x00C0 = 192 -> floor(192*257/49152) = 1, 2 bytes.
  const accept = mockIO({ count: 257, bytes: [1, 0x00, 0xc0, 0] });
  assert.equal(originalMonthlyWeather22DB(accept), true);
  assert.equal(accept.log.bytes, 4);
});

test('xLow second gate preserved', () => {
  // xLow < 0xC0 arms the second 1/2 gate; odd keeps, even drops.
  const keep = mockIO({ count: 192, bytes: [1, 100, 1, 0], xLow: 0 });
  assert.equal(originalMonthlyWeather22DB(keep), true);
  const drop = mockIO({ count: 192, bytes: [1, 100, 0, 0], xLow: 0 });
  assert.equal(originalMonthlyWeather22DB(drop), false);
});
