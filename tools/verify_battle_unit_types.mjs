import assert from "node:assert/strict";

const { createFieldBattle, tickBattle } = await import(
  "../web/src/game/battle/simulation.js"
);

const sc = {
  generals: [
    { name: "攻", ability: { force: 70 } },
    { name: "守", ability: { force: 60 } },
  ],
};
const legion = (leader, faction, types) => ({
  leader,
  faction,
  troops: types.filter((type) => type !== 4).length * 100,
  morale: 180,
  formation: 1,
  units: types.map((type) => ({ type, troops: type === 4 ? 0 : 1000 })),
});
const attacker = legion("攻", 0, [1, 2, 3, 4, 4, 4]);
const defender = legion("守", 1, [3, 2, 1, 4, 4, 4]);
const battleMaps = {
  directory: [{ idx: 0xc0, layout: 1, theme: 0 }],
};
const battle = createFieldBattle(sc, attacker, defender, battleMaps, {
  directoryIndex: 0xc0,
  mirror: false,
  terrainClass: 0,
});

const attackers = battle.units.filter((unit) => unit.side === "atk");
assert.deepEqual(
  attackers.map((unit) => unit.type),
  [1, 2, 3],
  "strategic unit types must survive into the tactical layer",
);
assert.deepEqual(
  attackers.map((unit) => unit.typeLabel),
  ["騎", "步", "弓"],
);
assert.ok(attackers[0].speed > attackers[1].speed);
assert.ok(attackers[1].speed > attackers[2].speed);

const archer = attackers[2];
const target = battle.units.find((unit) => unit.side === "def");
archer.x = 100;
archer.y = 200;
archer.hx = 100;
archer.hy = 200;
archer.cd = 0;
target.x = 240;
target.y = 200;
target.hx = 240;
target.hy = 200;
for (const unit of battle.units) {
  if (unit !== archer && unit !== target) unit.gone = true;
}
const before = target.troops;
tickBattle(battle, 0.1);
assert.ok(target.troops < before, "archers must damage enemies at range");
assert.equal(
  archer.x,
  100,
  "archers in range must fire without closing to melee",
);
assert.ok(battle.effects.some((effect) => effect.kind === "arrow"));
assert.ok(battle.effects.some((effect) => effect.kind === "damage"));

archer.cd = 0;
archer.x = 210;
target.x = 225;
const archerBeforeMelee = archer.troops;
tickBattle(battle, 0.1);
assert.ok(
  archer.troops < archerBeforeMelee,
  "archers caught in melee must exchange casualties",
);
assert.ok(battle.effects.some((effect) => effect.kind === "melee"));

process.stdout.write(
  "battle unit types legacy presentation OK: speed + ranged/melee effects\n",
);
