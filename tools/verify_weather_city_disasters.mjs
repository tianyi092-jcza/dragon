// 2286 live city scan: N=192 consumes the identical RNG prefix as the legacy
// fixed 0xC0 loop; N=193 scans the admitted slot (defence 0 forces the first
// gate) and queues type12 with the 0x2040 city pointer. Mock io only.
import assert from 'node:assert/strict';
import test from 'node:test';
import { originalMonthlyCityDisasters2286 } from '../web/src/game/navigation/originalweather.js';

function mockIO({ count, bytes, defenceOf = () => 100 }) {
  const log = { bytes: 0, writes: [], queued: [] };
  const slots = new Map();
  let at = 0;
  return { log,
    readCityCount() { return count; },
    nextRandomByte() { assert.ok(at < bytes.length, 'RNG overrun'); log.bytes++; return bytes[at++]; },
    readCityByte(index, field) {
      if (field === 'defence') return defenceOf(index);
      return 0;
    },
    readCityWord() { return 100; },
    writeCityByte(index, field, value) { log.writes.push([index, field, value]); return value; },
    readEventCursorWord() { return 0; },
    readEventTypeByte(offset) { return slots.get(offset) ?? 0; },
    writeEventWord(offset, value) {
      slots.set(offset, value);
      if (offset % 4 === 2) log.queued.push(value);
      return value;
    },
  };
}
// 192 legacy cities, both gates fail (0x18), 2 RNG bytes each, nothing queued.
const quiet192 = Array.from({ length: 192 }, () => [0x18, 0x18]).flat();

test('N=192 prefix behavior identical with or without the live bound', () => {
  const legacy = mockIO({ count: 192, bytes: quiet192 });
  assert.equal(originalMonthlyCityDisasters2286(legacy), 0);
  assert.equal(legacy.log.bytes, 384);
  const same = mockIO({ count: 193, bytes: [...quiet192, 0x18, 0x18] });
  assert.equal(originalMonthlyCityDisasters2286(same), 0);
  assert.equal(same.log.bytes, 386);
});

test('N=193 scans the admitted slot and queues its type12', () => {
  const io = mockIO({ count: 193,
    bytes: [...quiet192, 0x00, 0x00, 0x00],
    defenceOf: index => (index === 192 ? 0 : 100) });
  assert.equal(originalMonthlyCityDisasters2286(io), 1);
  // gate + roll + 2FBF delay byte.
  assert.equal(io.log.bytes, 384 + 3);
  // Second word queued carries the 0x2040 city pointer.
  assert.ok(io.log.queued.includes(0x2040), JSON.stringify(io.log.queued));
});
