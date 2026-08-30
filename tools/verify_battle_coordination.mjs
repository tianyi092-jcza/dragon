import assert from "node:assert/strict";

const { tickBattle } = await import("../web/src/game/tacticalbattle.js");

function unit({
  side,
  idx,
  x,
  y,
  type = 2,
  tacticalOrder = "assault",
  troops = 100,
}) {
  return {
    side,
    idx,
    strategicIndex: idx,
    x,
    y,
    hx: x,
    hy: y,
    troops,
    maxTroops: 100,
    morale: 100,
    force: 60,
    speed: 30,
    type,
    moveModifier: 1,
    attackModifier: 1,
    battleSpecialty: 0,
    routed: false,
    gone: false,
    order: null,
    tacticalOrder,
    cd: 0,
    facingX: side === "atk" ? 1 : -1,
    facingY: 0,
  };
}

const attackers = [
  unit({ side: "atk", idx: 0, x: 100, y: 100, type: 1 }),
  unit({ side: "atk", idx: 1, x: 100, y: 150, type: 2 }),
  unit({ side: "atk", idx: 2, x: 100, y: 200, type: 3 }),
];
const defenders = [
  unit({ side: "def", idx: 0, x: 250, y: 100, type: 3 }),
  unit({ side: "def", idx: 1, x: 250, y: 150, type: 1 }),
  unit({ side: "def", idx: 2, x: 250, y: 200, type: 2 }),
];
const coordinated = {
  units: [...attackers, ...defenders],
  effects: [],
  playerSide: null,
  time: 1,
  over: null,
};
tickBattle(coordinated, 0.1);
assert.equal(new Set(attackers.map((item) => item.targetId)).size, 3);
assert.equal(attackers[0].targetId, "def:0", "騎兵應優先壓制弓兵");
assert.equal(attackers[1].targetId, "def:1", "步兵應優先制約騎兵");
assert.equal(attackers[2].targetId, "def:2", "弓兵應優先射擊步兵");

const archer = unit({ side: "atk", idx: 0, x: 100, y: 300, type: 3 });
const screen = unit({ side: "atk", idx: 1, x: 160, y: 300, type: 2 });
const enemy = unit({
  side: "def",
  idx: 0,
  x: 230,
  y: 300,
  type: 2,
  tacticalOrder: "defend",
});
const obstructed = {
  units: [archer, screen, enemy],
  effects: [],
  playerSide: "def",
  time: 1,
  over: null,
};
tickBattle(obstructed, 0.1);
assert.equal(enemy.troops, 100, "友軍遮擋射線時弓兵不可穿隊射擊");
assert.ok(archer.y < 300, "射線受阻的弓兵應向側翼移位尋找射界");
assert.ok(!obstructed.effects.some((effect) => effect.kind === "arrow"));

const moverA = unit({ side: "atk", idx: 0, x: 100, y: 420 });
const moverB = unit({ side: "atk", idx: 1, x: 100, y: 420 });
const distantEnemy = unit({
  side: "def",
  idx: 0,
  x: 500,
  y: 420,
  tacticalOrder: "defend",
});
moverA.order = { x: 300, y: 420 };
moverB.order = { x: 300, y: 420 };
const avoidance = {
  units: [moverA, moverB, distantEnemy],
  effects: [],
  playerSide: "def",
  time: 1,
  over: null,
};
tickBattle(avoidance, 0.5);
assert.notEqual(moverA.y, moverB.y, "重疊友軍移動時應自動分流避讓");

const front = unit({ side: "atk", idx: 0, x: 100, y: 520 });
const reserve = unit({ side: "atk", idx: 5, x: 100, y: 570 });
const formationEnemy = unit({
  side: "def",
  idx: 0,
  x: 240,
  y: 545,
  tacticalOrder: "defend",
});
const formation = {
  units: [front, reserve, formationEnemy],
  effects: [],
  playerSide: null,
  time: 0.05,
  over: null,
};
const frontX = front.x;
const reserveX = reserve.x;
tickBattle(formation, 0.05);
assert.ok(front.x > frontX, "前列應先接近敵軍");
assert.equal(reserve.x, reserveX, "後備隊應稍後再推進，保持進攻梯次");

process.stdout.write(
  "battle coordination OK: target assignment + archer line-of-fire + ally avoidance\n",
);
