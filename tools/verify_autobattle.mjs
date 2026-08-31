import assert from "node:assert/strict";
import fs from "node:fs/promises";

const {
  TYPE_WEIGHT,
  baseArmyPower,
  commanderPower,
  legionBattleUnits,
  resolveStrategicBattle,
  selectPrimaryLegion,
  writeStrategicBattleResult,
} = await import("../web/src/game/autobattle.js");

class ByteRng {
  constructor(bytes) {
    this.bytes = bytes;
    this.calls = 0;
  }
  nextByte() {
    assert.ok(this.calls < this.bytes.length, "unexpected RNG consumption");
    return this.bytes[this.calls++];
  }
}

let data;
try {
  data = JSON.parse(
    await fs.readFile(new URL("../web/data.json", import.meta.url), "utf8"),
  );
} catch (error) {
  throw new Error(`cannot read web/data.json: ${error.message}`, {
    cause: error,
  });
}
const sc = structuredClone(data.scenarios[0]);
sc.generals = [
  {
    name: "G0",
    battle_rating: 0,
    ability: { force: 80, lead: 60, field: 4, siege: 5, naval: 0 },
  },
  {
    name: "G1",
    battle_rating: 0x20,
    ability: { force: 70, lead: 90, field: 3, siege: 2, naval: 0 },
  },
  {
    name: "G2",
    battle_rating: 0x40,
    ability: { force: 40, lead: 50, field: 1, siege: 1, naval: 0 },
  },
];

assert.deepEqual(TYPE_WEIGHT[1], [3, 2, 1, 0]);
const fixedUnits = [1, 1, 3, 3, 2, 2].map((type) => ({
  type,
  troops: 1000,
}));
const A = {
  leader: "G0",
  faction: 0,
  troops: 600,
  morale: 200,
  units: structuredClone(fixedUnits),
};
const D = {
  leader: "G1",
  faction: 1,
  troops: 600,
  morale: 180,
  units: structuredClone(fixedUnits),
};
assert.equal(
  legionBattleUnits(A).reduce((sum, unit) => sum + unit.troops, 0),
  600,
);
assert.equal(baseArmyPower(A, 1), (200 >> 3) * 1200);
assert.ok(
  commanderPower(
    sc,
    A,
    1,
    baseArmyPower(A, 1),
    new ByteRng([0]),
  ) > 0,
);
// mode0的0x52D7必须读攻城专长；field/siege不同值给出精确分叉golden。
const specialtyProbe = {
  _commanderProfile: {
    ability: { force: 40, lead: 50, field: 1, siege: 9, naval: 0 },
  },
};
assert.equal(commanderPower(sc, specialtyProbe, 1, 0x4000, new ByteRng([])), 1488);
assert.equal(commanderPower(sc, specialtyProbe, 0, 0x4000, new ByteRng([])), 3216);

// 0x52D7 的 MUL + 字节重排 + 两次 RCR 精确等于 u32乘积>>10。
const extreme = {
  _commanderProfile: {
    ability: { force: 0xff, lead: 0xff, field: 15, siege: 15, naval: 15 },
  },
};
const extremeCommand = 0xff + 0xff - (0xff >> 2);
const extremeModifier = Math.floor((extremeCommand << 4) / (16 - 15));
assert.equal(
  commanderPower(sc, extreme, 1, 0xffff, new ByteRng([0])),
  (Math.imul(0xffff, extremeModifier & 0xffff) >>> 10) & 0xffff,
);

const weaker = { ...D, leader: "G2", troops: 100, morale: 100 };
assert.equal(selectPrimaryLegion(sc, [weaker, D]), D);
assert.equal(selectPrimaryLegion(sc, [weaker, D, { ...D, dead: true }]), D);

// 固定原版字节 golden：攻方 commander 消费1字节，守方force<lead不消费；
// 后续按胜方/败方逐队交错消费12字节。
const rng = new ByteRng([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]);
const result = resolveStrategicBattle(sc, A, D, { mode: 1, rng });
assert.equal(result.atkScore, 4695);
assert.equal(result.defScore, 5009);
assert.equal(result.winner, "def");
assert.equal(result.ratio, 8);
assert.deepEqual(
  result.attack.units.map((unit) => unit.troops),
  [90, 88, 86, 84, 91, 89],
);
assert.deepEqual(
  result.defence.units.map((unit) => unit.troops),
  [96, 92, 96, 92, 96, 92],
);
assert.equal(result.attack.troops, 528);
assert.equal(result.defence.troops, 564);
assert.equal(result.attack.morale, 88);
assert.equal(result.defence.morale, 169);
assert.equal(rng.calls, 13);

writeStrategicBattleResult(A, result.attack);
assert.equal(A.troops, 528);
assert.equal(A.units.reduce((sum, unit) => sum + unit.troops, 0), 5280);
assert.equal(A.morale, 88);

process.stdout.write(
  "autobattle OK: field/siege specialty golden + fixed-byte interleaved 12-byte losses\n",
);
