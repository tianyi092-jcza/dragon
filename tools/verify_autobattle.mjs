import assert from "node:assert/strict";
import fs from "node:fs/promises";

const { generalForLegion } = await import("../web/src/game/legionunits.js");
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

// 旧Web快照只有显示名时，运行期分配的slot不能冒充原版军团+2主将索引。
assert.equal(generalForLegion(sc, { leader: "G2", slot: 0 })?.name, "G2");
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
assert.ok(commanderPower(sc, A, 1, baseArmyPower(A, 1), new ByteRng([0])) > 0);
// mode0的0x52D7必须读攻城专长；field/siege不同值给出精确分叉golden。
const specialtyProbe = {
  _commanderProfile: {
    ability: { force: 40, lead: 50, field: 1, siege: 9, naval: 0 },
  },
};
assert.equal(
  commanderPower(sc, specialtyProbe, 1, 0x4000, new ByteRng([])),
  1488,
);
assert.equal(
  commanderPower(sc, specialtyProbe, 0, 0x4000, new ByteRng([])),
  3216,
);

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
// 0x4C72按军团槽地址升序扫描；评分相等时JAe保留先遇到的低槽。
const highSlot = { ...D, slot: 20 };
const lowSlot = { ...D, slot: 5 };
assert.equal(selectPrimaryLegion(sc, [highSlot, lowSlot]), lowSlot);

// 0x4F8A空城防御只读取当前城兵+0x13；据点type/城兵上限/生产力
// 不直接进入0x5130。不同规模据点的差异来自其当前城兵原始值。
{
  const { createCityGarrison } = await import("../web/src/game/autobattle.js");
  const small = createCityGarrison({
    faction: 1,
    troops: 59,
    type: 2,
    troops_cap: 85,
    prod: 3000,
  });
  const large = createCityGarrison({
    faction: 1,
    troops: 118,
    type: 0,
    troops_cap: 169,
    prod: 20714,
  });
  assert.equal(small.troops, 59);
  assert.deepEqual(
    small.units.map((unit) => unit.troops),
    [100, 100, 100, 100, 100, 90],
  );
  assert.equal(large.troops, 118);
  assert.deepEqual(
    large.units.map((unit) => unit.troops),
    [200, 200, 200, 200, 190, 190],
  );
  assert.ok(baseArmyPower(large, 0, 118) > baseArmyPower(small, 0, 59));
}

// 0x5285直接读取六队；+4总兵暂时不一致时不得均分并替换兵种。
const mismatchedTotal = {
  ...A,
  troops: 600,
  units: [
    { type: 3, troops: 1000 },
    { type: 4, troops: 0 },
    { type: 4, troops: 0 },
    { type: 4, troops: 0 },
    { type: 4, troops: 0 },
    { type: 4, troops: 0 },
  ],
};
assert.deepEqual(
  legionBattleUnits(mismatchedTotal).map((unit) => [unit.type, unit.troops]),
  [
    [3, 100],
    [4, 0],
    [4, 0],
    [4, 0],
    [4, 0],
    [4, 0],
  ],
);

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
assert.equal(
  A.units.reduce((sum, unit) => sum + unit.troops, 0),
  5280,
);
assert.equal(A.morale, 88);

process.stdout.write(
  "autobattle OK: field/siege specialty golden + fixed-byte interleaved 12-byte losses\n",
);
