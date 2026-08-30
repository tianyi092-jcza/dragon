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
const generals = sc.generals.slice(0, 3);
for (let i = 0; i < generals.length; i++) {
  generals[i].name = `G${i}`;
  generals[i].battle_rating = i * 0x20;
  generals[i].ability = {
    force: 8 + i,
    lead: 9 + i,
    field: i + 1,
    siege: i + 2,
    naval: 0,
  };
}
sc.generals = generals;

assert.deepEqual(TYPE_WEIGHT[1], [3, 2, 1, 0]);
const fixedUnits = [
  { type: 1, troops: 1000 },
  { type: 1, troops: 1000 },
  { type: 3, troops: 1000 },
  { type: 3, troops: 1000 },
  { type: 2, troops: 1000 },
  { type: 2, troops: 1000 },
];
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
  morale: 200,
  units: structuredClone(fixedUnits),
};
assert.equal(
  legionBattleUnits(A).reduce((sum, unit) => sum + unit.troops, 0),
  600,
);
assert.equal(baseArmyPower(A, 1), (200 >> 3) * 1200);
assert.ok(commanderPower(sc, A, 1, baseArmyPower(A, 1), () => 0) > 0);
// 0x52D7 的 MUL + 字节重排 + 两次 RCR 精确等于 u32乘积>>10，
// 且例行程序最终只返回低16位DX。
const extreme = {
  _commanderProfile: {
    ability: { force: 0xff, lead: 0xff, field: 15, siege: 15, naval: 15 },
  },
};
const extremeCommand = 0xff + 0xff - (0xff >> 2);
const extremeModifier = Math.floor((extremeCommand << 4) / (16 - 15));
assert.equal(
  commanderPower(sc, extreme, 1, 0xffff, () => 0.5),
  (Math.imul(0xffff, extremeModifier & 0xffff) >>> 10) & 0xffff,
);

const weaker = { ...D, leader: "G2", troops: 400, morale: 160 };
assert.equal(selectPrimaryLegion(sc, [weaker, D]), D);
assert.equal(selectPrimaryLegion(sc, [weaker, D, { ...D, dead: true }]), D);

const lowRng = () => 0;
const result = resolveStrategicBattle(sc, A, D, { mode: 1, random: lowRng });
assert.ok(["atk", "def"].includes(result.winner));
assert.ok(result.ratio >= 8 && result.ratio <= 100);
assert.equal(result.attack.units.length, 6);
assert.equal(result.defence.units.length, 6);
assert.equal(
  result.attack.troops,
  result.attack.units.reduce((sum, unit) => sum + unit.troops, 0),
);
assert.equal(
  result.defence.troops,
  result.defence.units.reduce((sum, unit) => sum + unit.troops, 0),
);
assert.ok(result.attack.units[0].troops >= 1);
assert.ok(result.defence.units[0].troops >= 1);

writeStrategicBattleResult(A, result.attack);
assert.equal(A.troops, result.attack.troops);
assert.equal(
  A.units.reduce((sum, unit) => sum + unit.troops, 0),
  A.troops * 10,
);
assert.equal(A.morale, result.attack.morale);

process.stdout.write(
  `autobattle OK: winner=${result.winner}, ratio=${result.ratio}, ` +
    `survivors=${result.attack.troops}/${result.defence.troops}\n`,
);
