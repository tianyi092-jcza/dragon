import assert from "node:assert/strict";
import fs from "node:fs/promises";

const { createFieldBattle, initializeVisualBattleStartup } = await import(
  "../web/src/game/tacticalbattle.js"
);
const { runOriginalBattleStartup } = await import(
  "../web/src/game/battle/originalstartup.js"
);
const { ORIGINAL_OBJECT, OriginalBattleObjectPool, originalObjectAddress } =
  await import("../web/src/game/battle/originalstate.js");

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

const scenario = {
  player_faction: 0,
  generals: [
    {
      idx: 0,
      name: "甲",
      battle_formation: 0,
      ability: { force: 0, lead: 15, field: 0, siege: 0, naval: 0 },
    },
    {
      idx: 1,
      name: "乙",
      battle_formation: 0,
      ability: { force: 0, lead: 15, field: 0, siege: 0, naval: 0 },
    },
  ],
};
const legion = (leader, faction) => ({
  leader,
  faction,
  troops: 100,
  morale: 200,
  units: [
    { type: 1, troops: 1000 },
    ...Array.from({ length: 5 }, () => ({ type: 4, troops: 0 })),
  ],
});
const create = () =>
  createFieldBattle(scenario, legion("甲", 0), legion("乙", 1), battleMaps, {
    directoryIndex: 0xc0,
    terrainClass: 0,
    mirror: false,
  });

{
  const battle = create();
  const callsBefore = battle.session.rng.calls;
  const startup = initializeVisualBattleStartup(battle);
  assert.equal(startup.frames, 50, "A1C5 always runs 0x32 A04B/A065 frames");
  assert.equal(
    startup.scriptWordSkip,
    0,
    "failed A2E8 eligibility does not skip script words",
  );
  assert.equal(battle.session.frame, 50);
  assert.equal(battle.session.registers.tacticalFrameCounter, 50);
  assert.equal(battle.session.registers.startupComplete, true);
  assert.equal(
    battle.session.rng.calls - callsBefore,
    4,
    "A2E8/A34F consumes exactly two original RNG bytes per commander",
  );
  const second = initializeVisualBattleStartup(battle);
  assert.equal(second, startup, "startup is idempotent after completion");
  assert.equal(battle.session.frame, 50);
}

{
  const battle = create();
  battle.session.registers.mode = 0;
  const callsBefore = battle.session.rng.calls;
  const startup = initializeVisualBattleStartup(battle);
  assert.equal(startup.frames, 50);
  assert.equal(
    battle.session.rng.calls,
    callsBefore,
    "non-mode1 startup has no A2E8 RNG",
  );
}

{
  const pool = new OriginalBattleObjectPool();
  const first = originalObjectAddress(0, 0, 0);
  const second = originalObjectAddress(1, 0, 0);
  for (const [address, power] of [
    [first, 100],
    [second, 30],
  ]) {
    pool.write8(address, ORIGINAL_OBJECT.FLAGS, 0x80);
    pool.write8(address, ORIGINAL_OBJECT.HP, 100);
    pool.write8(address, ORIGINAL_OBJECT.POWER, power);
    pool.write8(address, ORIGINAL_OBJECT.CURRENT_COMMAND, 8);
    pool.write8(address, ORIGINAL_OBJECT.PENDING_COMMAND, 8);
  }
  const bytes = [0, 0, 0, 0];
  const fakeSession = {
    pool,
    registers: { mode: 1, startupComplete: false },
    events: [],
    finished: false,
    frame: 0,
    rng: {
      calls: 0,
      nextByte() {
        this.calls++;
        return bytes.shift() ?? 0;
      },
    },
  };
  const fakeHandle = { session: fakeSession };
  let ticks = 0;
  const startup = runOriginalBattleStartup(fakeHandle, {
    commanders: [
      { ability: { force: 15, lead: 0, field: 0 } },
      { ability: { force: 15, lead: 0, field: 0 } },
    ],
    tickFrame() {
      ticks++;
      fakeSession.frame++;
      if (ticks === 111) pool.write8(second, ORIGINAL_OBJECT.HP, 69);
      return { events: [], finished: false };
    },
  });
  assert.equal(startup.scriptWordSkip, 3);
  assert.equal(startup.frames, 161);
  assert.equal(fakeSession.rng.calls, 4);
  assert.deepEqual(
    startup.events
      .filter((event) => event.type === "startup-flag")
      .map((event) => event.originalId),
    [0x1b7, 0x1b9, 0x1cc, 0x1ba, 0x1bb, 0x1cc, 0x1cd],
  );
  assert.equal(pool.read8(first, ORIGINAL_OBJECT.PENDING_COMMAND), 0);
  assert.equal(pool.read8(second, ORIGINAL_OBJECT.PENDING_COMMAND), 0);
}

process.stdout.write(
  "battle original startup OK: A1C5 50 preframes + mode1 A2E8 RNG gate\n",
);
