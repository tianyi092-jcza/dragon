import assert from "node:assert/strict";

const { ORIGINAL_OBJECT, OriginalBattleObjectPool, originalObjectAddress } =
  await import("../web/src/game/battle/originalstate.js");
const { OriginalBattleTempRecords } = await import(
  "../web/src/game/battle/originalinit.js"
);
const { calculateOriginalWallMetric, settleOriginalBattleExit } = await import(
  "../web/src/game/battle/originalexit.js"
);
const { OriginalBattleSession } = await import(
  "../web/src/game/battle/originalsession.js"
);

const pool = new OriginalBattleObjectPool();
const temps = new OriginalBattleTempRecords();
for (let group = 0; group < 6; group++) {
  for (let slot = 0; slot < 8; slot++) {
    const left = originalObjectAddress(0, group, slot);
    const right = originalObjectAddress(1, group, slot);
    pool.write8(left, ORIGINAL_OBJECT.FLAGS, slot < 3 ? 0x80 : 0);
    pool.write8(right, ORIGINAL_OBJECT.FLAGS, slot < 2 ? 0x80 : 0);
  }
  temps.write8(0, 8 + group * 4 + 1, 2);
  temps.write8(1, 8 + group * 4 + 1, 1);
  temps.write8(0, 8 + group * 4 + 3, 0);
  temps.write8(1, 8 + group * 4 + 3, 0);
}
const walls = Array.from({ length: 16 }, (_, index) => ({
  kind: 1,
  flags: 0,
  metric: 100 + index,
}));
assert.deepEqual(calculateOriginalWallMetric(walls), {
  anyBit0: false,
  metric: 100,
  d315: 1,
});
walls[0].flags = 1;
assert.deepEqual(calculateOriginalWallMetric(walls), {
  anyBit0: true,
  metric: 100,
  d315: 0,
});
// §2.4.1复演输入：16条kind1、flags80、metric1370 → AX=1370、D315=21。
const standardWalls = Array.from({ length: 16 }, () => ({
  kind: 1,
  flags: 0x80,
  metric: 1370,
}));
assert.deepEqual(calculateOriginalWallMetric(standardWalls), {
  anyBit0: false,
  metric: 1370,
  d315: 21,
});
// 无kind1：AX=FFFF、D315=FF，仍进9FF8计算，不得早退。
assert.deepEqual(
  calculateOriginalWallMetric(
    Array.from({ length: 16 }, () => ({ kind: 2, flags: 0, metric: 0 })),
  ),
  { anyBit0: false, metric: 0xffff, d315: 0xff },
);

const result = settleOriginalBattleExit({
  pool,
  temps,
  registers: { winnerState: 0, mode: 0 },
  legions: [
    { troops: 60, morale: 150 },
    { troops: 60, morale: 150 },
  ],
  wallRecords: walls,
  city: { growth: 100, defence: 90, troops: 80 },
});
assert.equal(result.winner, 0);
assert.deepEqual(result.sides[0].units, [5, 5, 5, 5, 5, 5]);
assert.deepEqual(result.sides[1].units, [3, 3, 3, 3, 3, 3]);
assert.equal(result.sides[0].troops, 30);
assert.equal(result.sides[0].morale, 75);
assert.equal(result.sides[1].morale, 29);
assert.equal(result.cityDamage.damage, 15);
assert.deepEqual(
  [
    result.cityDamage.growth,
    result.cityDamage.disaster,
    result.cityDamage.troops,
  ],
  [85, 75, 65],
);
assert.equal(result.rngCalls, 0);
// §2.4.1标准复演：城兵/上升率/防灾87/104/100 + metric1370 → damage=0，三字段不变。
const standardResult = settleOriginalBattleExit({
  pool,
  temps,
  registers: { winnerState: 0, mode: 0 },
  legions: [
    { troops: 60, morale: 150 },
    { troops: 60, morale: 150 },
  ],
  wallRecords: standardWalls,
  city: { growth: 104, defence: 100, troops: 87 },
});
assert.equal(standardResult.wallMetric.metric, 1370);
assert.equal(standardResult.cityDamage.damage, 0);
assert.deepEqual(
  [
    standardResult.cityDamage.growth,
    standardResult.cityDamage.disaster,
    standardResult.cityDamage.troops,
  ],
  [104, 100, 87],
);
// 无kind1：damageWord=7390、DL=222（base=87）。
const emptyResult = settleOriginalBattleExit({
  pool,
  temps,
  registers: { winnerState: 0, mode: 0 },
  legions: [
    { troops: 60, morale: 150 },
    { troops: 60, morale: 150 },
  ],
  wallRecords: [],
  city: { growth: 104, defence: 100, troops: 87 },
});
assert.equal(emptyResult.wallMetric.metric, 0xffff);
assert.equal(emptyResult.cityDamage.damage, 222);
assert.deepEqual(
  [
    emptyResult.cityDamage.growth,
    emptyResult.cityDamage.disaster,
    emptyResult.cityDamage.troops,
  ],
  [0, 0, 0],
);
// metric3000：damageWord=8171、DL=235（base=87）。
const metricResult = settleOriginalBattleExit({
  pool,
  temps,
  registers: { winnerState: 0, mode: 0 },
  legions: [
    { troops: 60, morale: 150 },
    { troops: 60, morale: 150 },
  ],
  wallRecords: [{ kind: 1, flags: 0x80, metric: 3000 }],
  city: { growth: 104, defence: 100, troops: 87 },
});
assert.equal(metricResult.cityDamage.damage, 235);
assert.deepEqual(
  [
    metricResult.cityDamage.growth,
    metricResult.cityDamage.disaster,
    metricResult.cityDamage.troops,
  ],
  [0, 0, 0],
);

for (let group = 0; group < 6; group++) {
  temps.write8(0, 8 + group * 4 + 3, 0);
  temps.write8(1, 8 + group * 4 + 3, 0);
}
const session = new OriginalBattleSession({
  objectBytes: pool.snapshot(),
  tempBytes: temps.snapshot(),
  registers: { winnerState: 0, mode: 0 },
  finished: true,
  winner: 0,
});
assert.equal(
  session.settleExit({
    legions: [
      { troops: 60, morale: 150 },
      { troops: 60, morale: 150 },
    ],
    wallRecords: walls,
    city: { growth: 100, defence: 90, troops: 80 },
  }).sides[0].troops,
  30,
);

process.stdout.write(
  "battle original exit OK: 9FDC side result + A65D/9FF8 city damage\n",
);
