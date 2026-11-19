// CHAPTER-WB opening lane: read-only KI evidence plus in-memory factory tests.
// No DB, browser or SAVE access.
// Does not stand in for compiler/publication or IndexedDB restore integration.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { encodePlayerOpening } from '../web/src/editor/chapteropening.js';
import { createNewGameScenario, Scenario } from '../web/src/game/world.js';
import { initializeNativeMonthlyPolicy, nativeMonthlyPolicyWord, assertNativeMonthlyPolicy } from '../web/src/game/nativemonthlypolicy.js';

const template = {
  trust: 61, tax: 18, next_tax: 19, conscription: [0, 0, 0], next_conscription: [0, 0, 0],
  nativeMonthlyPolicyRaw: '12a100000000000013b2000000000000',
  factions: [
    { idx: 2, n_legions: 0, playerOpening: { trust: 47, policyRaw: '0ca10c000100000013b2020003000400' } },
    { idx: 7, n_legions: 0, playerOpening: { trust: 201, policyRaw: '18a107000800090019b20a000b000c00' } },
  ], cities: [], generals: [],
};

test('KI keypad bounds and recruitment DIV 10 write instructions remain pinned', () => {
  const ki = readFileSync('E:/Dragon/Dragon/KI.EXE');
  assert.equal(createHash('sha256').update(ki).digest('hex'), 'fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868');
  for (const [at, hex] of [
    [0x67d9, 'b86400e88f1472042ea2100dc3'],
    [0x67f2, 'b81027e87614720b33d2bb0a00f7f32ea3120dc3'],
    [0x6812, 'b81027e85614720b33d2bb0a00f7f32ea3140dc3'],
    [0x6832, 'b81027e83614720b33d2bb0a00f7f32ea3160dc3'],
    [0x7c99, '894600895602895e0433f6'],
    [0x7db9, '3b760076038b7600f8c3'],
    [0x7cf5, '9e8bc65d5f5e5a595b071fc3'],
  ]) assert.equal(ki.subarray(at + 0x200, at + 0x200 + hex.length / 2).toString('hex'), hex);
});

test('author people inputs quantize once and preserve next tax and unknown bytes', () => {
  const base = template.factions[0].playerOpening;
  const before = structuredClone(base);
  for (const [people, word, effective] of [[0, 0, 0], [9, 0, 0], [10, 1, 10], [127, 12, 120], [10000, 1000, 10000]]) {
    const plan = encodePlayerOpening(base, { trust: 255, tax: 100, conscription: [people, people, people], nextConscription: [people, people, people] });
    const source = structuredClone(template);
    source.factions[0].playerOpening = plan;
    const fresh = createNewGameScenario(source, 2);
    initializeNativeMonthlyPolicy(fresh);
    assert.deepEqual(fresh.conscription, [effective, effective, effective]);
    assert.deepEqual(fresh.next_conscription, [effective, effective, effective]);
    for (const offset of [2, 4, 6, 10, 12, 14]) assert.equal(nativeMonthlyPolicyWord(fresh, offset, 'author roundtrip'), word);
    assert.equal(fresh.next_tax, 19);
    assert.equal(fresh.nativeMonthlyPolicy.bytes[1], 0xa1);
    assert.equal(fresh.nativeMonthlyPolicy.bytes[9], 0xb2);
  }
  assert.deepEqual(base, before);
  const values = { trust: 0, tax: 0, conscription: [0, 0, 0], nextConscription: [0, 0, 0] };
  assert.doesNotThrow(() => encodePlayerOpening(base, values));
  for (const invalid of [-1, -0, 1.5, 10001, NaN, Infinity, '127']) {
    assert.throws(() => encodePlayerOpening(base, { ...values, conscription: [invalid, 0, 0] }), RangeError);
    assert.throws(() => encodePlayerOpening(base, { ...values, nextConscription: [0, invalid, 0] }), RangeError);
  }
  assert.throws(() => encodePlayerOpening(base, { ...values, tax: 101 }), RangeError);
  assert.throws(() => encodePlayerOpening(base, { ...values, nextTax: 1 }), TypeError);
});

test('selected stable faction slot chooses its own opening without changing source or other plans', () => {
  const before = structuredClone(template);
  const a = createNewGameScenario(template, 2), b = createNewGameScenario(template, 7);
  assert.equal(a.trust, 47);
  assert.equal(b.trust, 201);
  assert.equal(a.tax, 12);
  assert.equal(b.tax, 24);
  assert.equal(a.next_tax, 19);
  assert.equal(b.next_tax, 25);
  assert.deepEqual(a.conscription, [120, 10, 0]);
  assert.deepEqual(b.conscription, [70, 80, 90]);
  assert.deepEqual(a.next_conscription, [20, 30, 40]);
  assert.deepEqual(b.next_conscription, [100, 110, 120]);
  initializeNativeMonthlyPolicy(a);
  initializeNativeMonthlyPolicy(b);
  assert.equal(nativeMonthlyPolicyWord(a, 2, 'opening test'), 12);
  assert.equal(nativeMonthlyPolicyWord(b, 2, 'opening test'), 7);
  assert.equal(a.nativeMonthlyPolicy.bytes[1], 0xa1);
  assert.equal(a.nativeMonthlyPolicy.bytes[9], 0xb2);
  assert.deepEqual(template, before);
  assert.deepEqual(a.factions.map(f => f.playerOpening), before.factions.map(f => f.playerOpening));
});

test('legacy fresh default is preserved only for templates without a selected plan', () => {
  const legacy = structuredClone(template);
  delete legacy.factions[0].playerOpening;
  const fresh = createNewGameScenario(legacy, 2);
  assert.equal(fresh.trust, 255);
  assert.equal(fresh.nativeMonthlyPolicyRaw, template.nativeMonthlyPolicyRaw);
  initializeNativeMonthlyPolicy(fresh);
  assert.deepEqual(fresh.conscription, [0, 0, 0]);
});

test('JSON snapshot and Scenario construction retain running trust and policy, not opening defaults', () => {
  const running = createNewGameScenario(template, 2);
  initializeNativeMonthlyPolicy(running);
  running.trust = 13;
  running.nativeMonthlyPolicy.bytes[2] = 15;
  running.conscription[0] = 150;
  const snapshot = JSON.parse(JSON.stringify(running));
  const restored = new Scenario(snapshot);
  assert.equal(restored.trust, 13);
  assert.equal(restored.conscription[0], 150);
  assert.equal(nativeMonthlyPolicyWord(restored, 2, 'restore unit test'), 15);
  assertNativeMonthlyPolicy(restored);
});

test('invalid selected opening fails before source mutation', () => {
  for (const opening of [null, { trust: -1, policyRaw: template.nativeMonthlyPolicyRaw },
    { trust: 256, policyRaw: template.nativeMonthlyPolicyRaw },
    { trust: 1.5, policyRaw: template.nativeMonthlyPolicyRaw },
    { trust: 1, policyRaw: '00' }, { trust: 1, policyRaw: 'z'.repeat(32) },
    { trust: 1, policyRaw: template.nativeMonthlyPolicyRaw, extra: 1 }]) {
    const source = structuredClone(template);
    source.factions[0].playerOpening = opening;
    const before = structuredClone(source);
    assert.throws(() => createNewGameScenario(source, 2), TypeError);
    assert.deepEqual(source, before);
  }
});
