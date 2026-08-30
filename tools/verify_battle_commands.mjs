import assert from "node:assert/strict";

const { tickBattle } = await import("../web/src/game/tacticalbattle.js");

function unit(side, x, tacticalOrder = null) {
  return {
    side,
    idx: 0,
    x,
    y: 200,
    hx: x,
    hy: 200,
    troops: 100,
    maxTroops: 100,
    morale: 100,
    force: 50,
    speed: 30,
    routed: false,
    gone: false,
    order: null,
    tacticalOrder,
    cd: 0,
  };
}

const defend = unit("atk", 100, "defend");
const distantEnemy = unit("def", 300);
const defendBattle = {
  units: [defend, distantEnemy],
  time: 0,
  over: null,
};
tickBattle(defendBattle, 1);
assert.equal(defend.x, 100, "守阵单位不得主动追击远处敌军");

const assault = unit("atk", 100, "assault");
const farEnemy = unit("def", 800);
const assaultBattle = {
  units: [assault, farEnemy],
  time: 0,
  over: null,
};
tickBattle(assaultBattle, 1);
assert.ok(assault.x > 100, "突击单位应越过普通索敌距离主动推进");

const formation = unit("atk", 160, "formation");
formation.hx = 100;
formation.order = { x: 100, y: 200 };
const formationBattle = {
  units: [formation, unit("def", 900)],
  time: 0,
  over: null,
};
for (let i = 0; i < 4; i++) tickBattle(formationBattle, 1);
assert.equal(formation.order, null);
assert.equal(formation.tacticalOrder, "defend");

process.stdout.write("battle commands OK: assault / formation / defend\n");
