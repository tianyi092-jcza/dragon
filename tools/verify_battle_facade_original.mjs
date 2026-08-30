import assert from "node:assert/strict";
import fs from "node:fs/promises";

const { advanceVisualBattle, createFieldBattle, queueTacticalCommand } =
  await import("../web/src/game/tacticalbattle.js");
const { ORIGINAL_OBJECT, originalObjectAddress } = await import(
  "../web/src/game/battle/originalstate.js"
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
battleMaps.formationVectors = parseJson(
  await fs.readFile(
    new URL("../web/battle_rules.json", import.meta.url),
    "utf8",
  ),
  "battle_rules.json",
).formationVectors;
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
    { idx: 0, name: "攻", ability: { force: 80, lead: 70, field: 5 } },
    { idx: 1, name: "守", ability: { force: 75, lead: 65, field: 4 } },
  ],
};
const legion = (leader, faction, troops) => ({
  leader,
  faction,
  troops: Math.floor(troops / 10),
  morale: 200,
  units: [
    { type: 1, troops },
    ...Array.from({ length: 5 }, () => ({ type: 4, troops: 0 })),
  ],
});

{
  const battle = createFieldBattle(
    sc,
    legion("攻", 0, 250),
    legion("守", 1, 250),
    battleMaps,
    { directoryIndex: 0xc0, terrainClass: 0, mirror: false },
  );
  assert.equal(battle.session.temps.group(0, 0).remaining, 17);
  assert.equal(battle.session.registers.side0Active, 8);
}

{
  const battle = createFieldBattle(
    sc,
    legion("攻", 0, 1000),
    legion("守", 1, 1000),
    battleMaps,
    { directoryIndex: 0xc0, terrainClass: 0, mirror: false },
  );
  queueTacticalCommand(battle, { groups: [0], command: "defend" });
  assert.equal(battle.session.queue.snapshot().length, 1);
  const leader = originalObjectAddress(0, 0, 0);
  const child = originalObjectAddress(0, 0, 1);
  const pendingBefore = battle.session.pool.read8(
    leader,
    ORIGINAL_OBJECT.PENDING_COMMAND,
  );
  assert.notEqual(pendingBefore, 3);
  assert.equal(
    battle.session.pool.read8(child, ORIGINAL_OBJECT.PENDING_COMMAND),
    pendingBefore,
    "DOM command must not mutate rules before its logic frame",
  );
  advanceVisualBattle(battle, 1 / 60);
  assert.equal(
    battle.session.pool.read8(leader, ORIGINAL_OBJECT.CURRENT_COMMAND),
    3,
  );
  assert.equal(
    battle.session.pool.read8(child, ORIGINAL_OBJECT.CURRENT_COMMAND),
    3,
  );
}

{
  const battle = createFieldBattle(
    { ...sc, player_faction: 1 },
    legion("攻", 0, 1000),
    legion("守", 1, 1000),
    battleMaps,
    { directoryIndex: 0xc0, terrainClass: 0, mirror: false },
  );
  queueTacticalCommand(battle, { command: "retreat" });
  advanceVisualBattle(battle, 1 / 60);
  assert.equal(battle.session.registers.winnerState, 2);
  for (let group = 0; group < 6; group++) {
    assert.equal(
      battle.session.pool.read8(
        originalObjectAddress(1, group, 0),
        ORIGINAL_OBJECT.PENDING_COMMAND,
      ),
      5,
    );
  }
}

process.stdout.write(
  "battle facade original OK: troop units + queued commands + defender retreat\n",
);
