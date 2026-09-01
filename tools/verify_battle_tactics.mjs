import assert from "node:assert/strict";
import fs from "node:fs/promises";

const { createFieldBattle, queueTacticalCommand } = await import(
  "../web/src/game/tacticalbattle.js"
);

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`cannot parse ${label}: ${error.message}`, {
      cause: error,
    });
  }
}

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
battleMaps.formationVectors = parseJson(
  await fs.readFile(
    new URL("../web/battle_rules.json", import.meta.url),
    "utf8",
  ),
  "battle_rules.json",
).formationVectors;

const sc = {
  player_faction: 0,
  generals: [
    {
      name: "攻",
      battle_formation: 0,
      ability: { force: 70, siege: 2, field: 4, naval: 1 },
    },
    {
      name: "守",
      battle_formation: 0,
      ability: { force: 60, siege: 1, field: 2, naval: 12 },
    },
  ],
};
const legion = (leader, faction, type) => ({
  leader,
  faction,
  troops: 100,
  morale: 180,
  units: [
    { type, troops: 1000 },
    ...Array.from({ length: 5 }, () => ({ type: 4, troops: 0 })),
  ],
});
const battle = createFieldBattle(
  sc,
  legion("攻", 0, 1),
  legion("守", 1, 2),
  battleMaps,
  { directoryIndex: 0xc0, mirror: false, terrainClass: 0 },
);
const before = battle.session.queue.snapshot().length;
assert.equal(
  queueTacticalCommand(battle, { groups: [0], command: "siege" }),
  true,
  "facade accepts only rule-level command validation; BattleView blocks field-only UI commands",
);
assert.equal(battle.session.queue.snapshot().length, before + 1);

process.stdout.write(
  "battle tactics OK: production facade uses original Session command queue\n",
);
