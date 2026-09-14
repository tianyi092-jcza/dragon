// Fixed KI/SINARIO whitelist; no SAVE access. Combat arithmetic certificate,
// NOT a full 5130 CPU/DOS execution or a replay of the user's unknown live state.
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import {
  TYPE_WEIGHT,
  baseArmyPower,
  commanderPower,
  resolveStrategicBattle,
  selectPrimaryLegion,
  applySiegeCityDamage,
} from "../web/src/game/autobattle.js";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const ki = fs.readFileSync(new URL("../../Dragon/KI.EXE", import.meta.url));
const scenario = fs.readFileSync(
  new URL("../../原版/SINARIO.DAT", import.meta.url),
);
assert.equal(
  hash(ki),
  "fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868",
);
assert.equal(
  hash(scenario),
  "4ad37ad619649bf9ca2f075ffe483ff67f205fafa1e2d7b4926dc2598ec08c87",
);
const bytes = (va, hex) =>
  assert.equal(
    ki.subarray(va + 0x200, va + 0x200 + hex.length / 2).toString("hex"),
    hex,
  );
bytes(0x5120, "02030300030201000103020002010200");
bytes(0x51f5, "8ae8b106"); // CH initialized once, CL six rounds
bytes(0x5218, "e8c59a32e4fec5f6f5"); // ECE0, INC CH, DIV CH
bytes(0x5243, "fec975b2"); // loop returns BEFORE INC CH, no reset
bytes(0x5249, "875c04875504"); // old +4 denominators
bytes(0x4cca, "81eb4022d1eb8a975f42"); // slot-derived +1F

function general(index) {
  const record = scenario.subarray(0x42c0 + index * 32, 0x42e0 + index * 32);
  return {
    ability: {
      siege: record[14] >> 4,
      field: record[15] >> 4,
      naval: record[16] >> 4,
      force: record[17],
      lead: record[18],
    },
  };
}
const sc = { generals: Array.from({ length: 128 }, (_, i) => general(i)) };
assert.deepEqual(sc.generals[35].ability, {
  siege: 4,
  field: 10,
  naval: 0,
  force: 15,
  lead: 11,
});
assert.deepEqual(sc.generals[88].ability, {
  siege: 0,
  field: 4,
  naval: 0,
  force: 13,
  lead: 5,
});
const cityRecord = scenario.subarray(0x13c0, 0x13e0);
assert.equal(cityRecord[19], 87);
const army = (slot) => ({
  slot,
  generalIdx: slot,
  faction: slot === 35 ? 13 : 0,
  status: 0xc4,
  troops: 600,
  morale: 200,
  units: [1, 1, 3, 3, 2, 2].map((type) => ({ type, troops: 1000 })),
});
const attacker = army(35),
  defender = army(88);
assert.deepEqual(
  TYPE_WEIGHT,
  Array.from({ length: 4 }, (_, i) =>
    Array.from(ki.subarray(0x5320 + i * 4, 0x5324 + i * 4)),
  ),
);
assert.equal(baseArmyPower(attacker, 3), 25000);
assert.equal(baseArmyPower(defender, 0, 87), 42175);
class Bytes {
  constructor(values) {
    this.values = values;
    this.calls = 0;
  }
  nextByte() {
    assert.ok(this.calls < this.values.length);
    return this.values[this.calls++];
  }
}
const rows = [
  [0, 0, 740, 625, "atk", 9, [92, 85, 92, 90, 90, 92], 541, 90],
  [0, 1, 740, 1078, "def", 11, [84, 91, 88, 87, 88, 91], 529, 88],
  [1, 0, 984, 625, "atk", 12, [85, 80, 92, 92, 77, 80], 506, 84],
  [1, 1, 984, 1078, "def", 8, [90, 92, 87, 84, 83, 84], 520, 86],
];
for (const [a, d, as, ds, winner, ratio, losses, total, morale] of rows) {
  const rng = new Bytes([
    a,
    d,
    10,
    20,
    30,
    40,
    50,
    60,
    70,
    80,
    90,
    100,
    110,
    120,
  ]);
  const result = resolveStrategicBattle(sc, attacker, defender, {
    mode: 0,
    cityDefence: 87,
    rng,
  });
  assert.deepEqual(
    [result.atkScore, result.defScore, result.winner, result.ratio],
    [as, ds, winner, ratio],
  );
  const win = winner === "atk" ? result.attack : result.defence;
  const lose = winner === "atk" ? result.defence : result.attack;
  assert.deepEqual(
    win.units.map((u) => u.troops),
    [96, 92, 96, 92, 96, 92],
  );
  assert.deepEqual([win.troops, win.morale], [564, 188]);
  assert.deepEqual(
    lose.units.map((u) => u.troops),
    losses,
  );
  assert.deepEqual([lose.troops, lose.morale, rng.calls], [total, morale, 14]);
  const city = { troops: 87, growth: 104, defence: 100 };
  const damage = applySiegeCityDamage(city, result.ratio);
  assert.equal(damage, ratio === 12 ? 12 : 13);
  assert.deepEqual(Object.values(city), [
    87 - damage,
    104 - damage,
    100 - damage,
  ]);
}
// Every ability-byte pair covered; this is not a claim about actual RNG probabilities.
let attackingWins = 0;
for (let a = 0; a < 256; a++)
  for (let d = 0; d < 256; d++) {
    const as = commanderPower(sc, attacker, 0, 25000, new Bytes([a])) + 8;
    const ds = commanderPower(sc, defender, 0, 42175, new Bytes([d])) + 8;
    assert.equal(as, a % 4 === 0 ? 740 : 984);
    assert.equal(ds, d % 4 === 0 ? 625 : 1078);
    if (as >= ds) attackingWins++;
  }
assert.equal(attackingWins, 16384);
// +1F is stored input here; this test DOES NOT certify its missing 55A6 lifecycle.
const selection = { generals: [{ battle_rating: 0 }, { battle_rating: 0xf0 }] };
const low = { ...army(0), generalIdx: 1 },
  high = { ...army(1), generalIdx: 0 };
assert.equal(selectPrimaryLegion(selection, [low, high]), high);
assert.equal(selectPrimaryLegion(selection, [{ ...high, slot: 127 }]), null);
assert.equal(selectPrimaryLegion(selection, [{ ...high, status: 0x7f }]), null);
// 51B3 must preserve old+4, even when it disagrees with the six-team sum.
const sparse = {
  ...army(35),
  troops: 600,
  units: [1, 4, 4, 4, 4, 4].map((type, i) => ({ type, troops: i ? 0 : 1000 })),
};
const result = resolveStrategicBattle(
  sc,
  sparse,
  { ...sparse, generalIdx: 88 },
  { mode: 1, rng: new Bytes(Array(14).fill(0)) },
);
for (const [key, side] of [
  ["atk", result.attack],
  ["def", result.defence],
]) {
  assert.equal(side.oldTotal, 600);
  assert.equal(
    side.morale,
    Math.floor(((result.winner === key ? 200 : 100) * side.troops) / 600),
  );
}
process.stdout.write(
  "NPC siege evidence OK: official chapter, 4 outcomes, 65536 ability pairs, interleaved casualties, stored denominator/slot boundary\n",
);
