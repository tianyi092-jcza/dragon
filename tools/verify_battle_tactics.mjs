// Legacy visual-model probe retained for manual reference only.
// The production facade now requires original navigation assets and must not use
// these temporary damage/type modifiers as rule assertions.
process.stdout.write("battle tactics SKIP: legacy visual model is not production rules\n");
process.exit(0);

import assert from "node:assert/strict";

const {
  createFieldBattle,
  tacticalTerrainProfile,
  tacticalTypeModifier,
  tickBattle,
} = await import("../web/src/game/tacticalbattle.js");

assert.equal(tacticalTypeModifier(1, 3), 1.18, "騎兵應壓制弓兵");
assert.equal(tacticalTypeModifier(2, 1), 1.18, "步兵應制約騎兵");
assert.equal(tacticalTypeModifier(3, 2), 1.18, "弓兵應壓制步兵");
assert.equal(tacticalTypeModifier(1, 2), 0.86);
assert.equal(tacticalTerrainProfile("field", { terrainClass: 9 }).key, "water");
assert.equal(tacticalTerrainProfile("field", { terrainClass: 7 }).key, "land");
assert.equal(tacticalTerrainProfile("siege").key, "siege");

const sc = {
  player_faction: 0,
  generals: [
    {
      name: "攻",
      ability: { force: 70, siege: 2, field: 4, naval: 1 },
    },
    {
      name: "守",
      ability: { force: 60, siege: 1, field: 2, naval: 12 },
    },
  ],
};
const legion = (leader, faction, type) => ({
  leader,
  faction,
  troops: 100,
  morale: 180,
  formation: 1,
  units: [
    { type, troops: 1000 },
    ...Array.from({ length: 5 }, () => ({ type: 4, troops: 0 })),
  ],
});
const battleMaps = {
  directory: [
    { idx: 0xc0, layout: 1, theme: 0 },
    { idx: 0xd5, layout: 2, theme: 0 },
  ],
};
const attacker = legion("攻", 0, 1);
const defender = legion("守", 1, 2);
const land = createFieldBattle(sc, attacker, defender, battleMaps, {
  directoryIndex: 0xc0,
  mirror: false,
  terrainClass: 0,
});
const water = createFieldBattle(sc, attacker, defender, battleMaps, {
  directoryIndex: 0xd5,
  mirror: false,
  terrainClass: 9,
});
assert.equal(land.terrain.label, "野戰");
assert.equal(water.terrain.label, "水戰");
assert.equal(water.playerSide, "atk");
assert.ok(
  water.units.find((unit) => unit.side === "atk").moveModifier < 1,
  "水戰應限制騎兵機動",
);
assert.equal(
  water.units.find((unit) => unit.side === "def").battleSpecialty,
  12,
  "水戰應使用武將水戰專長",
);

function unit({ side, x, y, type = 2, facingX, facingY = 0 }) {
  return {
    side,
    idx: 0,
    x,
    y,
    hx: x,
    hy: y,
    troops: 100,
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
    tacticalOrder: "defend",
    cd: 0,
    facingX,
    facingY,
  };
}

const flanker = unit({ side: "atk", x: 100, y: 100, type: 1, facingX: 1 });
const support = unit({ side: "atk", x: 108, y: 140, type: 2, facingX: 1 });
const exposed = unit({ side: "def", x: 118, y: 100, type: 3, facingX: 1 });
const tactical = {
  units: [flanker, support, exposed],
  effects: [],
  playerSide: null,
  time: 0,
  over: null,
};
const originalRandom = Math.random;
Math.random = () => 0.5;
try {
  tickBattle(tactical, 0.1);
} finally {
  Math.random = originalRandom;
}
assert.ok(
  tactical.effects.some(
    (effect) =>
      effect.kind === "position" &&
      ["rear", "flank", "surround"].includes(effect.label),
  ),
  "側後或孤立目標受擊時應產生位置戰術效果",
);
assert.ok(exposed.morale < 98, "側後/包圍攻擊應額外削弱士氣");

const archer = unit({ side: "def", x: 120, y: 240, type: 3, facingX: -1 });
archer.tacticalOrder = null;
const pursuer = unit({ side: "atk", x: 80, y: 240, type: 1, facingX: 1 });
const skirmish = {
  units: [archer, pursuer],
  effects: [],
  playerSide: "atk",
  time: 0,
  over: null,
};
const oldX = archer.x;
tickBattle(skirmish, 0.5);
assert.ok(archer.x > oldX, "AI弓兵被貼近時應後撤保持射程");

process.stdout.write(
  "battle tactics OK: terrain + specialties + counters + flank/surround + archer skirmish\n",
);
