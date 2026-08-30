import assert from "node:assert/strict";
import fs from "node:fs/promises";

globalThis.window = {};
globalThis.fetch = async (url) => {
  const data = await fs.readFile(new URL(`../web/${url}`, import.meta.url));
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () =>
      data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
    json: async () => {
      try {
        return JSON.parse(data.toString("utf8"));
      } catch (error) {
        throw new Error(`invalid JSON fixture ${url}`, { cause: error });
      }
    },
  };
};

const { loadTerrain } = await import("../web/src/game/pathfind.js");
const { roadApproachesAt } = await import("../web/src/game/roadgraph.js");
const {
  aiTick,
  applyFieldBattleResult,
  continueLegionAfterBattle,
  dispatchLegionFate,
} = await import("../web/src/game/ai.js");
await loadTerrain();
assert.ok(roadApproachesAt(255, 9).length >= 2);

const city = (idx, faction, x, y) => ({ idx, faction, x, y, sim: {} });
const general = (idx, name, faction, extra = {}) => ({
  idx,
  name,
  faction,
  status: 1,
  active: true,
  attr: 0x80,
  battle_rating: 0,
  ...extra,
});
const makeScenario = () => {
  const cities = [city(0, 0, 257, 9), city(1, 1, 218, 11), city(2, 1, 246, 15)];
  const factions = [
    { idx: 0, capital: 0, monarch_idx: 0 },
    { idx: 1, capital: 1, monarch_idx: 1 },
  ];
  const generals = [general(0, "甲", 0), general(1, "乙", 1)];
  return {
    cities,
    factions,
    generals,
    legions: [],
    player_faction: 0,
    citiesOf(faction) {
      return this.cities.filter((candidate) => candidate.faction === faction);
    },
  };
};
const legion = (leader, faction, x, y) => ({
  leader,
  faction,
  x,
  y,
  prevX: x,
  prevY: y,
  troops: 100,
  morale: 200,
  status: 0x80,
  _active: true,
  units: [{ type: 1, troops: 1000 }],
});

{
  const sc = makeScenario();
  const loser = legion("乙", 1, 255, 9);
  loser.troops = 400;
  loser.units[0].troops = 4000;
  sc.legions = [loser];
  assert.equal(continueLegionAfterBattle(sc, loser, false), true);
  assert.equal(loser.commandState, 8);
  assert.equal(loser.target.idx, 2);
  assert.equal(loser._retreat.cityIdx, 2);
  assert.ok(loser._path.length > 0);
}

{
  const sc = makeScenario();
  const monarch = legion("甲", 0, 257, 9);
  sc.legions = [monarch];
  assert.equal(
    dispatchLegionFate(sc, monarch, 1, {
      nextByte: () => assert.fail("monarch path must not consume RNG"),
    }),
    "return",
  );
  assert.equal(monarch.dead, true);
  assert.equal(sc.delayedLegionReturns[0].countdown, 48);
  for (let i = 0; i < 47; i++) aiTick({ scenario: sc });
  assert.equal(sc.delayedLegionReturns[0].countdown, 1);
  assert.equal(sc.generals[0].status, 1);
  aiTick({ scenario: sc });
  assert.equal(sc.generals[0].status, 0);
  assert.equal(sc.delayedLegionReturns.length, 0);
  assert.ok(!sc.legions.includes(monarch));
}

{
  const sc = makeScenario();
  sc.factions[0].monarch_idx = 7;
  const ordinary = legion("甲", 0, 257, 9);
  sc.legions = [ordinary];
  let rngCalls = 0;
  assert.equal(
    dispatchLegionFate(sc, ordinary, 1, {
      nextByte() {
        rngCalls++;
        return 0xfd;
      },
    }),
    "captured",
  );
  assert.equal(rngCalls, 1);
  assert.equal(ordinary.dead, true);
  assert.equal(sc.delayedLegionReturns?.length ?? 0, 0);
  assert.equal(sc.generals[0].status, 4);
  assert.equal(sc.generals[0].origFaction, 0);
  assert.equal(sc.generals[0].faction, 1);
}

{
  const sc = makeScenario();
  sc.factions[0].monarch_idx = 7;
  sc.generals[0].battle_rating = 0xff;
  const ordinary = legion("甲", 0, 257, 9);
  sc.legions = [ordinary];
  let rngCalls = 0;
  assert.equal(
    dispatchLegionFate(sc, ordinary, 1, {
      nextByte() {
        rngCalls++;
        return 0xff;
      },
    }),
    "return",
  );
  assert.equal(rngCalls, 1, "threshold>=127 still consumes the original byte");
}

{
  const sc = makeScenario();
  sc.factions[1].monarch_idx = 7;
  const attacker = legion("乙", 1, 257, 9);
  const defender = legion("甲", 0, 246, 15);
  defender.units[0].troops = 0;
  defender.morale = 0;
  sc.generals[0].status = 1;
  sc.factions[0].monarch_idx = 7;
  sc.cities = [city(0, 0, 218, 11)];
  sc.factions[0].capital = 0;
  sc.factions[0].active = true;
  sc.factions[0].dead = false;
  sc.legions = [attacker, defender];
  let rngCalls = 0;
  applyFieldBattleResult(
    {
      scenario: sc,
      originalRng: {
        nextByte() {
          rngCalls++;
          return 0xff;
        },
      },
      hud: { flashEvent() {} },
    },
    attacker,
    defender,
    "atk",
    90,
    0,
    [90, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0],
  );
  assert.equal(
    rngCalls,
    1,
    "strategic autoresolve must carry app original RNG",
  );
  assert.equal(sc.generals[0].status, 4);
}

{
  const sc = makeScenario();
  const attacker = legion("甲", 0, 257, 9);
  const defender = legion("乙", 1, 246, 15);
  defender.units[0].troops = 0;
  sc.legions = [attacker, defender];
  const events = [];
  applyFieldBattleResult(
    { scenario: sc, hud: { flashEvent: (message) => events.push(message) } },
    attacker,
    defender,
    "atk",
    90,
    0,
    [90, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0],
  );
  assert.equal(attacker.commandState, 8);
  assert.equal(defender.dead, true);
  assert.equal(sc.delayedLegionReturns[0].leader, "乙");
  assert.match(events[0], /野戰擊退/);
}

process.stdout.write("postbattle fate OK: retreat, 48-tick return, capture\n");
