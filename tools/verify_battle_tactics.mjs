import assert from "node:assert/strict";
import fs from "node:fs/promises";

const { createBattle, createFieldBattle, queueTacticalCommand } = await import(
  "../web/src/game/tacticalbattle.js"
);
const { mirrorOriginalBattleTiles } = await import(
  "../web/src/game/battle/originalnavigation.js"
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
  queueTacticalCommand(battle, { groups: [0], command: "wall" }),
  true,
  "wall input is queued; C1CE clears mask before C1D9 rejects writes at consumption",
);
battle.session.registers.themeFlag = 1;
const originalButtonCommands = [
  ["assault", 2],
  ["attack", 1],
  ["formation", 0],
  ["wall", 3],
  ["defend", 4],
  ["retreat", 5],
];
for (const [command, commandNumber] of originalButtonCommands) {
  assert.equal(
    queueTacticalCommand(battle, { groups: [0], command }),
    true,
    `${command} is accepted by the original command queue`,
  );
  assert.equal(
    battle.session.queue.snapshot().at(-1).commandNumber,
    commandNumber,
    `${command} maps to original command ${commandNumber}`,
  );
}
assert.equal(
  battle.session.queue.snapshot().length,
  before + 1 + originalButtonCommands.length,
);

for (const cityIndex of [0, 10]) {
  const city = {
    idx: cityIndex,
    name: `城${cityIndex}`,
    faction: 1,
    troops: 100,
  };
  const siege = createBattle(
    sc,
    legion("攻", 0, 1),
    city,
    battleMaps,
    legion("守", 1, 2),
  );
  assert.equal(siege.directoryIndex, cityIndex);
  assert.equal(siege.layout, battleMaps.directory[cityIndex].layout);
  assert.equal(siege.theme, battleMaps.directory[cityIndex].theme);
  assert.deepEqual(
    Array.from(siege.session.spatial.tiles),
    battleMaps.maps[String(cityIndex)],
    `siege city ${cityIndex} retains its independent BATTLE.MAP payload`,
  );
}

{
  const city = { idx: 0, name: "城", faction: 1, troops: 100 };
  const siege = createBattle(
    { ...sc, player_faction: 1 },
    legion("攻", 0, 1),
    city,
    battleMaps,
    legion("守", 1, 2),
  );
  const rawTheme = battleMaps.directory[0].theme;
  assert.equal(siege.playerSide, "def");
  assert.equal(siege.mirror, true, "4F16 sets map bit6 for a player defender");
  assert.equal(siege.session.registers.battleSideFlag & 0xc0, 0xc0);
  assert.equal(siege.theme, rawTheme === 0 ? 0 : 0x3f - rawTheme);
  assert.deepEqual(
    Array.from(siege.session.spatial.tiles),
    Array.from(
      mirrorOriginalBattleTiles(Uint8Array.from(battleMaps.maps["0"])),
    ),
    "player-defender siege renders the CB9B-resolved city map",
  );
}

process.stdout.write(
  "battle tactics OK: production facade uses original Session command queue\n",
);
