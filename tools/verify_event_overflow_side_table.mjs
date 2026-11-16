// D2-C overflow side table: 2FBF-full and 301C-full capture instead of
// dropping; drain writes head-first into the cleared page 3; savegame
// apply restores the table. Mock ios; no RNG consumed by capture/drain.
import assert from 'node:assert/strict';
import test from 'node:test';
import { originalCurrentEnqueue2FBF } from '../web/src/game/navigation/originalweather.js';
import { originalDelayedEnqueue301C } from '../web/src/game/navigation/originallegionfate.js';
import { captureStrategicOverflow, drainStrategicOverflow, pendingStrategicOverflow } from '../web/src/game/navigation/strategiceventoverflow.js';
import { applyWebMetaToState } from '../web/src/game/savegame.js';

function mockIO(sc, { occupied = true } = {}) {
  return {
    nextRandomByte() { return 0; },
    readEventCursorWord() { return 0; },
    readEventTypeByte() { return occupied ? 1 : 0; },
    writeEventWord() { throw new Error('no placement expected on a full wheel'); },
    queueOverflowRecord(record) { return captureStrategicOverflow(sc, record); },
  };
}

test('2FBF full captures with sequence; legacy io without hook drops', () => {
  const sc = {};
  const full = mockIO(sc);
  const r1 = originalCurrentEnqueue2FBF(full, 0x000b, 0x1234, 0xff);
  assert.equal(r1.inserted, false);
  const r2 = originalCurrentEnqueue2FBF(full, 0x010c, 0x0840, 0xff);
  assert.equal(r2.inserted, false);
  assert.deepEqual(sc.strategicEventOverflow, [
    { type: 0x0b, arg0: 0x00, arg1: 0x34, arg2: 0x12, sequence: 0 },
    { type: 0x0c, arg0: 0x01, arg1: 0x40, arg2: 0x08, sequence: 1 },
  ]);
  assert.equal(sc._strategicEventSeq, 2);
  assert.equal(pendingStrategicOverflow(sc), 2);
  // No hook: identical refusal, nothing tabled (legacy preserved).
  const bare = { nextRandomByte() { return 0; }, readEventCursorWord() { return 0; },
    readEventTypeByte() { return 1; }, writeEventWord() { throw new Error('unexpected write'); } };
  const legacy = originalCurrentEnqueue2FBF(bare, 0x000b, 0x1234, 0xff);
  assert.equal(legacy.inserted, false);
});

test('301C full captures (CF stays 0) while callers proceed', () => {
  const sc = {};
  const io = mockIO(sc);
  const r = originalDelayedEnqueue301C(io, (192 << 8) | 9, 0xffff, 8);
  assert.equal(r.inserted, false);
  assert.equal(r.cf, false);
  assert.deepEqual(sc.strategicEventOverflow, [
    { type: 9, arg0: 192, arg1: 0xff, arg2: 0xff, sequence: 0 },
  ]);
});

test('drain writes head-first into cleared page 3 and keeps order', () => {
  const slots = Array.from({ length: 256 }, () => null);
  const sc = { strategicEventSlots: slots, strategicEventOverflow: [
    { type: 0x0b, arg0: 1, arg1: 2, arg2: 3, sequence: 0 },
    { type: 0x0c, arg0: 4, arg1: 5, arg2: 6, sequence: 1 },
    { type: 0x0d, arg0: 7, arg1: 8, arg2: 9, sequence: 2 },
  ], _strategicEventSeq: 3 };
  const written = [];
  const placed = drainStrategicOverflow(sc,
    offset => (slots[offset >>> 2] === null ? 0 : 1),
    (offset, value) => { written.push([offset, value]); slots[offset >>> 2] = { type: 0, arg0: 0, arg1: 0, arg2: 0 }; });
  assert.equal(placed, 3);
  assert.deepEqual(written.map(([, v]) => v), [0x010b, 0x0302, 0x040c, 0x0605, 0x070d, 0x0908]);
  assert.deepEqual(sc.strategicEventOverflow, []);
  assert.equal(written[0][0], 0x300);
  assert.equal(written[2][0], 0x304);
});

test('drain stops at the first non-empty slot, remainder keeps order', () => {
  const slots = Array.from({ length: 256 }, () => null);
  slots[193] = { type: 1, arg0: 0, arg1: 0, arg2: 0 };
  const sc = { strategicEventSlots: slots, strategicEventOverflow: [
    { type: 0x0b, arg0: 1, arg1: 2, arg2: 3, sequence: 0 },
    { type: 0x0c, arg0: 4, arg1: 5, arg2: 6, sequence: 1 },
  ], _strategicEventSeq: 2 };
  const written = [];
  const placed = drainStrategicOverflow(sc,
    offset => (slots[offset >>> 2] === null ? 0 : 1),
    (offset, value) => { written.push([offset, value]); slots[offset >>> 2] = { type: 0, arg0: 0, arg1: 0, arg2: 0 }; });
  assert.equal(placed, 1);
  assert.equal(written.length, 2);
  assert.equal(sc.strategicEventOverflow.length, 1);
  assert.equal(sc.strategicEventOverflow[0].sequence, 1);
});

test('savegame apply restores the overflow table and sequence', () => {
  const state = {};
  applyWebMetaToState(state, { scenarioRuntimeState: {
    strategicEventOverflow: [{ type: 0x0b, arg0: 1, arg1: 2, arg2: 3, sequence: 0 }],
    _strategicEventSeq: 1,
  } });
  assert.deepEqual(state.strategicEventOverflow, [{ type: 0x0b, arg0: 1, arg1: 2, arg2: 3, sequence: 0 }]);
  assert.equal(state._strategicEventSeq, 1);
});
