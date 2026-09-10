import assert from "node:assert/strict";
import fs from "node:fs/promises";

const { advanceOriginalScriptFrame, createFieldBattle, queueTacticalCommand } =
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
    {
      idx: 0,
      name: "攻",
      battle_formation: 0,
      ability: { force: 80, lead: 70, field: 5 },
    },
    {
      idx: 1,
      name: "守",
      battle_formation: 0,
      ability: { force: 75, lead: 65, field: 4 },
    },
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
  assert.equal(
    battle.session.registers.side0Active,
    0xff,
    "9ACE diagnostic object count does not replace D31C before first ADC8",
  );
  assert.equal(
    battle.battleScriptBlock,
    2,
    "field variant uses opponent +0x16*4+2",
  );
}

{
  const cbe5Scenario = structuredClone(sc);
  cbe5Scenario.generals[1].battle_formation = 7;
  cbe5Scenario.generals.push({
    idx: 2,
    name: "槽位將",
    battle_formation: 3,
    ability: { force: 60, lead: 60, field: 3 },
  });
  const battle = createFieldBattle(
    cbe5Scenario,
    { ...legion("攻", 0, 250), slot: 0, generalIdx: 0 },
    // The battle leader remains general1; CBE5 instead reads slot2's +0x16.
    { ...legion("守", 1, 250), slot: 2, generalIdx: 1 },
    battleMaps,
    { directoryIndex: 0xc0, terrainClass: 0, mirror: false },
  );
  assert.equal(
    battle.battleScriptBlock,
    14,
    "CBE5 selects the opponent legion slot's general record, not legion +2",
  );
}

{
  const battle = createFieldBattle(
    sc,
    legion("攻", 0, 1000),
    legion("守", 1, 1000),
    battleMaps,
    { directoryIndex: 0xc0, terrainClass: 0, mirror: false },
  );
  queueTacticalCommand(battle, { groups: [0], command: "assault" });
  assert.equal(battle.session.queue.snapshot().length, 1);
  const leader = originalObjectAddress(0, 0, 0);
  const child = originalObjectAddress(0, 0, 1);
  const pendingBefore = battle.session.pool.read8(
    leader,
    ORIGINAL_OBJECT.PENDING_COMMAND,
  );
  assert.notEqual(pendingBefore, 2);
  assert.equal(
    battle.session.pool.read8(child, ORIGINAL_OBJECT.PENDING_COMMAND),
    pendingBefore,
    "DOM command must not mutate rules before its logic frame",
  );
  const vm = {
    step() {
      assert.equal(
        battle.session.pool.read8(leader, ORIGINAL_OBJECT.PENDING_COMMAND),
        2,
        "C8E6 hit id9 maps the 突擊 button to original command2 before A426",
      );
      return "run";
    },
  };
  advanceOriginalScriptFrame(battle, vm);
  assert.equal(
    battle.session.pool.read8(leader, ORIGINAL_OBJECT.CURRENT_COMMAND),
    2,
  );
  assert.equal(
    battle.session.pool.read8(child, ORIGINAL_OBJECT.CURRENT_COMMAND),
    2,
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
  advanceOriginalScriptFrame(battle, { step: () => "run" });
  assert.equal(battle.session.registers.winnerState, 1);
  const activeLeader = originalObjectAddress(0, 0, 0);
  assert.equal(
    battle.session.pool.read8(activeLeader, ORIGINAL_OBJECT.FLAGS) & 0x80,
    0,
    "B413/B4B8 removes the retreating group leader at the edge",
  );
  assert.equal(
    battle.session.temps.group(0, 0).survivors,
    8,
    "B4B8 AH=0 credits every exited object in the retreating group",
  );
  for (let group = 1; group < 6; group++)
    assert.equal(
      battle.session.pool.read8(
        originalObjectAddress(0, group, 0),
        ORIGINAL_OBJECT.PENDING_COMMAND,
      ),
      5,
      "A8F6 writes pending5 even to inactive group leaders",
    );
}

{
  const badScenario = structuredClone(sc);
  delete badScenario.generals[1].battle_formation;
  assert.throws(
    () =>
      createFieldBattle(
        badScenario,
        legion("攻", 0, 250),
        legion("守", 1, 250),
        battleMaps,
        { directoryIndex: 0xc0, terrainClass: 0, mirror: false },
      ),
    /opponent general \+0x16 must be 0\.\.7/,
  );
  badScenario.generals[1].battle_formation = 8;
  assert.throws(
    () =>
      createFieldBattle(
        badScenario,
        legion("攻", 0, 250),
        legion("守", 1, 250),
        battleMaps,
        { directoryIndex: 0xc0, terrainClass: 0, mirror: false },
      ),
    /opponent general \+0x16 must be 0\.\.7/,
  );
}

process.stdout.write(
  "battle facade original OK: troop units + queued commands + defender retreat\n",
);
