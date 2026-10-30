// I/O: only the fixed KI.EXE (never SAVE.DAT); all scenarios/RNG ports are owned memory.
// Static instruction arithmetic, not CPU execution or editor/runtime admission.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { governOriginalCity } from '../web/src/game/navigation/originalcity.js';

const ki = readFileSync(new URL('../../Dragon/KI.EXE', import.meta.url));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
assert.equal(ki.length, 67099);
assert.equal(sha(ki), 'fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868');
assert.equal(sha(ki.subarray(0x200 + 0x4194, 0x200 + 0x4236)), 'e71da7fff4fbb953cdb0f6c0579c2311408f5d0ec97ee423a2ba998048f0d4ed');
// ECE0 returns AL, leaves CX/DX/SI intact, restores BX/DS. Data starts at ECFC.
assert.equal(ki.subarray(0x200 + 0xece0, 0x200 + 0xecfc).toString('hex'), '1e538cc88ed8bbfeeca0fdecd70206fcec8006fcec89a2fdec5b1fc3');

function instructionControl(force, politics, initial, bytes) {
  // 41C2/41C6 byte ADD, then 41CA SHR; 41CE unsigned SUB/JA.
  const cl = (5 + politics) % 256, dl = Math.floor(((1 + force) % 256) / 2);
  let ch = cl > 15 ? cl - 15 : 1, growth = initial.growth, defence = initial.defence;
  let troops = initial.troops, draws = 2;
  if ((bytes[0] % 16) <= cl) {
    const al = (growth + ch) % 256;
    growth = al > 200 ? 200 : al;
  }
  if ((bytes[1] % 16) <= cl) {
    ch = Math.floor(ch / 2) + 1;
    const al = (defence + ch) % 256;
    defence = al > 200 ? 200 : al;
  }
  // 420B overwrites CX with C12/C13; 4211 full/over-cap skips third RNG.
  if (troops >= initial.troops_cap) troops = initial.troops_cap;
  else {
    draws++;
    if (bytes[2] < 24) {
      growth = growth < dl ? 0 : growth - dl;
      const sum = troops + dl, result = sum > 255 ? 255 : sum;
      troops = result > initial.troops_cap ? initial.troops_cap : result;
    }
  }
  return { growth, defence, troops, draws };
}
function run(city, general, bytes, owner = 0) {
  let draws = 0;
  const sc = { player_faction: 0, cities: [city], generals: [general] };
  governOriginalCity(sc, { readCityOwnerByte(address) { assert.equal(address, 0x841); return owner; } }, city, {
    nextByte() { assert.ok(draws < bytes.length, 'unexpected RNG consumption'); return bytes[draws++]; },
  });
  return draws;
}

test('4194 all 65,536 force/politics pairs across six explicit city/RNG boundary cases', () => {
  const cases = [
    [0, 0, 0, 255, [0, 0, 0]],
    [250, 250, 254, 255, [15, 15, 23]],
    [199, 199, 199, 200, [0, 15, 24]],
    [255, 255, 200, 200, [255, 0]],
    [255, 0, 255, 0, [0, 255]],
    [0, 255, 0, 1, [15, 15, 255]],
  ];
  let count = 0;
  for (let force = 0; force < 256; force++) for (let politics = 0; politics < 256; politics++) {
    for (const [growth, defence, troops, troops_cap, bytes] of cases) {
      const city = { idx: 0, governor: 0, growth, defence, troops, troops_cap, prod: 12345 };
      const general = { assignment_budget: 1, ability: { force, politics } };
      const expected = instructionControl(force, politics, city, bytes), draws = run(city, general, bytes);
      assert.deepEqual([city.growth, city.defence, city.troops, draws], [expected.growth, expected.defence, expected.troops, expected.draws], `force=${force} politics=${politics}`);
      assert.equal(general.assignment_budget, 0, 'budget 1 still grants this tick bonus');
      assert.equal(city.prod, 12345); assert.equal(city.governor, 0); assert.equal(city.troops_cap, troops_cap);
      assert.deepEqual(general.ability, { force, politics }); count++;
    }
  }
  assert.equal(count, 393216);
});

test('non-player, no-governor and zero-budget branches never read abilities', () => {
  for (const mode of ['npc', 'neutral', 'no-governor', 'zero-budget']) {
    let abilityReads = 0;
    const general = { assignment_budget: 0, get ability() { abilityReads++; throw new Error('forbidden ability read'); } };
    const city = { idx: 0, governor: mode === 'no-governor' ? null : 0, growth: 0, defence: 0, troops: 0, troops_cap: 255 };
    let owner = 0;
    if (mode === 'npc') owner = 1;
    if (mode === 'neutral') owner = 24;
    assert.equal(run(city, general, [0, 0, 0], owner), 3);
    assert.equal(abilityReads, 0); assert.equal(general.assignment_budget, 0);
    assert.deepEqual([city.growth, city.defence, city.troops], owner === 0 ? [0, 1, 1] : [0, 1, 4]);
  }
});

test('missing ability at its actual read preserves budget prefix and consumes no RNG', () => {
  for (const ability of [{ force: 255 }, { politics: 255 }]) {
    const city = { idx: 0, governor: 0, growth: 199, defence: 200, troops: 1, troops_cap: 255 };
    const before = structuredClone(city), general = { assignment_budget: 1, ability };
    let draws = 0;
    assert.throws(() => governOriginalCity({ player_faction: 0, cities: [city], generals: [general] }, { readCityOwnerByte: () => 0 }, city, { nextByte() { draws++; return 0; } }), /Uncovered/);
    assert.equal(general.assignment_budget, 0); assert.deepEqual(city, before); assert.equal(draws, 0);
  }
});
