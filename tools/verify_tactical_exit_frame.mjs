// P48 1BAA..1BC6 exit-frame regression: settleVisualBattle must return
// sides in attacker/defender frame ([attacker, defender]), mirroring the
// original xor-al,1 + xchg frame conversion before the 1BBA/1BC9 474A pair.
// Object-side frame (sides[0] = object-0 = player side) is NOT the ai.js
// contract: ai.js writes sides[0] -> A (strategic attacker) unconditionally.
import assert from "node:assert/strict";

const { createFieldBattle, settleVisualBattle } = await import(
  "../web/src/game/tacticalbattle.js",
);
const { OriginalBattleRng } = await import(
  "../web/src/game/battle/originalrng.js"
);

const mkUnits = (troops) =>
  [1, 1, 3, 3, 2, 2].map((type) => ({ type, troops }));
const battleMaps = {
  layouts: { 1: Array(4096).fill(0) },
  directory: [{ idx: 0xc0, layout: 1, theme: 0 }],
  navigation: {
    layouts: {
      1: {
        tiles: Array(4096).fill(0),
        attributes: Array(0xf800).fill(0),
        schedule: Array(0x100).fill(0),
      },
    },
  },
};
const fieldTerrain = { directoryIndex: 0xc0, mirror: false };
function fixture(playerFaction) {
  const sc = {
    player_faction: playerFaction,
    generals: [
      {
        idx: 0,
        name: "甲",
        battle_formation: 0,
        ability: { force: 8, lead: 7, field: 4, siege: 4, naval: 0 },
      },
      {
        idx: 1,
        name: "乙",
        battle_formation: 0,
        ability: { force: 7, lead: 9, field: 3, siege: 3, naval: 0 },
      },
    ],
  };
  // A = strategic attacker (600 display troops), D = defender (5400).
  const A = {
    leader: "甲",
    faction: 0,
    troops: 600,
    morale: 200,
    units: mkUnits(100),
    formation: 1,
  };
  const D = {
    leader: "乙",
    faction: 1,
    troops: 5400,
    morale: 180,
    units: mkUnits(900),
    formation: 1,
  };
  return { sc, A, D };
}
function settleAttackerFirst(playerFaction, winner) {
  const { sc, A, D } = fixture(playerFaction);
  const battle = createFieldBattle(
    sc,
    A,
    D,
    battleMaps,
    fieldTerrain,
    new OriginalBattleRng({ ch: 3, cl: 4, dh: 5 }).snapshot(),
  );
  battle.session.finished = true;
  battle.session.winner = winner;
  battle.session.registers.winnerState = winner;
  return settleVisualBattle(battle);
}

// Case 1: player attacks. Object-0 = attacker; identity mapping.
{
  const exit = settleAttackerFirst(0, 0);
  assert.equal(exit.winnerName, "atk");
  assert.equal(exit.sides[0].troops, 60);
  assert.equal(exit.sides[1].troops, 540);
  assert.equal(exit.sides[0].won, true);
  assert.equal(exit.sides[1].won, false);
}
// Case 2: player defends. Object-0 = defender; sides must still be
// attacker-first so ai.js sides[0] -> A stays correct.
{
  const exit = settleAttackerFirst(1, 0);
  assert.equal(exit.winnerName, "def");
  assert.equal(exit.sides[0].troops, 60);
  assert.equal(exit.sides[1].troops, 540);
  assert.equal(exit.sides[0].won, false);
  assert.equal(exit.sides[1].won, true);
}
// Case 3: player defends and loses (object-1 = attacker wins).
{
  const exit = settleAttackerFirst(1, 1);
  assert.equal(exit.winnerName, "atk");
  assert.equal(exit.sides[0].troops, 60);
  assert.equal(exit.sides[1].troops, 540);
  assert.equal(exit.sides[0].won, true);
  assert.equal(exit.sides[1].won, false);
}

process.stdout.write(
  "tactical exit frame OK: sides attacker-first in atk/def/win/lose cases\n",
);
