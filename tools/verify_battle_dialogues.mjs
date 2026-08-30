import assert from "node:assert/strict";
import fs from "node:fs/promises";

const { createFieldBattle, tickBattle } = await import(
  "../web/src/game/tacticalbattle.js"
);

const parseJson = (text, label) => {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`cannot parse ${label}: ${error.message}`, {
      cause: error,
    });
  }
};
const battleMaps = parseJson(
  await fs.readFile(
    new URL("../web/battle_maps.json", import.meta.url),
    "utf8",
  ),
  "battle_maps.json",
);
battleMaps.navigation = parseJson(
  await fs.readFile(
    new URL("../web/battle_navigation.json", import.meta.url),
    "utf8",
  ),
  "battle_navigation.json",
);

const sc = {
  player_faction: 0,
  generals: [
    {
      name: "攻將",
      portrait: 12,
      ability: { force: 80, siege: 4, field: 8, naval: 2 },
    },
    {
      name: "守將",
      portrait: 34,
      ability: { force: 75, siege: 3, field: 7, naval: 2 },
    },
  ],
};
const legion = (leader, faction, type = 1) => ({
  leader,
  faction,
  troops: 100,
  morale: 100,
  units: [
    { type, troops: 1000 },
    ...Array.from({ length: 5 }, () => ({ type: 4, troops: 0 })),
  ],
});
const battle = createFieldBattle(
  sc,
  legion("攻將", 0, 1),
  legion("守將", 1, 3),
  battleMaps,
  { directoryIndex: 0xc0, terrainClass: 0, mirror: false },
);
assert.equal(battle.speakers.atk.portrait, 12);
assert.equal(battle.speakers.def.portrait, 34);
assert.deepEqual(battle.dialogues, []);

const attacker = battle.units.find((unit) => unit.side === "atk");
const defender = battle.units.find((unit) => unit.side === "def");
attacker.x = 100;
attacker.y = 100;
defender.x = 100 + 26;
defender.y = 100;
const rngBefore = battle.session.rng.calls;
tickBattle(battle, 0.1);
assert.equal(
  battle.session.rng.calls,
  rngBefore,
  "Canvas dialogue/presentation tick must not consume extra rule RNG",
);
assert.deepEqual(battle.dialogues, []);
assert.equal(battle.nextDialogueSequence, 0);

process.stdout.write(
  "battle dialogues OK: side-routed commander portraits + event queue\n",
);
