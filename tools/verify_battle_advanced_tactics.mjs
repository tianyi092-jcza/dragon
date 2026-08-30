import assert from "node:assert/strict";

const { regroupFormation, tickBattle } = await import(
  "../web/src/game/tacticalbattle.js"
);

function unit({
  side = "atk",
  idx = 0,
  x = 100,
  y = 100,
  type = 2,
  tacticalOrder = null,
  terrainKey = "land",
  facingX = side === "atk" ? 1 : -1,
  facingY = 0,
}) {
  return {
    side,
    idx,
    strategicIndex: idx,
    x,
    y,
    hx: x,
    hy: y,
    troops: 200,
    maxTroops: 200,
    morale: 100,
    force: 60,
    speed: 32,
    type,
    moveModifier: 1,
    attackModifier: 1,
    battleSpecialty: 0,
    terrainKey,
    routed: false,
    gone: false,
    order: null,
    tacticalOrder,
    cd: 0,
    facingX,
    facingY,
    chargeRun: 0,
    chargeTargetId: null,
  };
}

const formation = [
  unit({ idx: 0, x: 300, y: 300 }),
  unit({ idx: 1, x: 320, y: 308 }),
  unit({ idx: 2, x: 290, y: 330 }),
  unit({ idx: 3, x: 330, y: 335 }),
];
regroupFormation(formation);
assert.ok(formation.every((item) => item.tacticalOrder === "formation"));
assert.equal(
  new Set(formation.map((item) => `${item.order.x}:${item.order.y}`)).size,
  4,
);
const regroupBattle = {
  units: [...formation, unit({ side: "def", x: 900, y: 900 })],
  effects: [],
  playerSide: "atk",
  time: 0,
  over: null,
};
for (let index = 0; index < 80; index++) tickBattle(regroupBattle, 0.1);
assert.ok(
  formation.every(
    (item) => item.order === null && item.tacticalOrder === "defend",
  ),
  "重新集結完成後應自動轉為守陣",
);

const guard = unit({
  x: 300,
  y: 300,
  tacticalOrder: "defend",
  facingX: 1,
});
const rearEnemy = unit({
  side: "def",
  x: 180,
  y: 300,
  tacticalOrder: "defend",
});
const guardBattle = {
  units: [guard, rearEnemy],
  effects: [],
  playerSide: "atk",
  time: 0,
  over: null,
};
tickBattle(guardBattle, 0.2);
assert.equal(guard.targetId, null, "守陣不得警戒背後遠處敵軍");
assert.equal(guard.x, 300);
rearEnemy.x = 282;
tickBattle(guardBattle, 0.2);
assert.equal(guard.targetId, "def:0", "敵軍貼身時守陣仍應自衛");

function cavalryBattle(type = 1, terrainKey = "land") {
  const attacker = unit({
    x: 100,
    y: 500,
    type,
    terrainKey,
    tacticalOrder: "assault",
  });
  const defender = unit({
    side: "def",
    x: 230,
    y: 500,
    type: 3,
    terrainKey,
    tacticalOrder: "defend",
  });
  return {
    attacker,
    defender,
    battle: {
      units: [attacker, defender],
      effects: [],
      playerSide: null,
      time: 0,
      over: null,
    },
  };
}
const charge = cavalryBattle();
const originalRandom = Math.random;
Math.random = () => 0.5;
try {
  for (let index = 0; index < 70 && charge.defender.troops === 200; index++)
    tickBattle(charge.battle, 0.1);
} finally {
  Math.random = originalRandom;
}
assert.ok(charge.defender.troops < 200);
assert.ok(charge.battle.effects.some((effect) => effect.kind === "charge"));
assert.ok(charge.defender.morale < 95, "騎兵長距離衝鋒應額外打擊士氣");

const archerA = unit({ idx: 0, x: 100, y: 650, type: 3 });
const archerB = unit({ idx: 1, x: 105, y: 690, type: 3 });
const volleyTarget = unit({
  side: "def",
  x: 245,
  y: 670,
  type: 2,
  tacticalOrder: "defend",
});
const volleyBattle = {
  units: [archerA, archerB, volleyTarget],
  effects: [],
  playerSide: null,
  time: 0,
  over: null,
};
Math.random = () => 0.5;
try {
  tickBattle(volleyBattle, 0.1);
} finally {
  Math.random = originalRandom;
}
assert.ok(volleyBattle.effects.some((effect) => effect.kind === "volley"));
assert.equal(
  volleyBattle.effects.filter((effect) => effect.kind === "arrow").length,
  2,
);
assert.ok(archerA.cd > 0 && archerB.cd > 0, "齊射弓兵應同步進入冷卻");

const ship = unit({
  x: 500,
  y: 500,
  terrainKey: "water",
  tacticalOrder: null,
  facingX: 1,
  facingY: 0,
});
ship.order = { x: 500, y: 650 };
const shipBattle = {
  units: [ship, unit({ side: "def", x: 900, y: 900, terrainKey: "water" })],
  effects: [],
  playerSide: "atk",
  time: 0,
  over: null,
};
tickBattle(shipBattle, 0.1);
assert.ok(ship.facingY > 0, "水戰單位應逐步轉向目標");
assert.ok(ship.x > 500, "未完成轉向前應沿原艦首帶弧線航行");

const boarding = cavalryBattle(2, "water");
boarding.attacker.x = 200;
boarding.defender.x = 220;
boarding.attacker.cd = 0;
Math.random = () => 0.5;
try {
  tickBattle(boarding.battle, 0.1);
} finally {
  Math.random = originalRandom;
}
assert.ok(
  boarding.battle.effects.some((effect) => effect.kind === "boarding"),
  "水戰近戰應顯示接舷效果",
);
assert.ok(!boarding.battle.effects.some((effect) => effect.kind === "charge"));

process.stdout.write(
  "battle advanced tactics OK: regroup + guard arc + charge + volley + naval turning/boarding\n",
);
