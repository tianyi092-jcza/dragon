import assert from "node:assert/strict";
import fs from "node:fs/promises";

const {
  blockingWall,
  createWallRecords,
  strikeWallRecord,
  wallCenter,
  wallDestroyed,
} = await import("../web/src/game/battlewalls.js");
const { createBattle, tickBattle } = await import(
  "../web/src/game/battle/simulation.js"
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
assert.deepEqual(Object.keys(battleMaps.layouts).sort(), ["0", "1", "2"]);
for (const tiles of Object.values(battleMaps.layouts))
  assert.equal(tiles.length, 4096);

const direct = createWallRecords(battleMaps.layouts[0], 120, 0);
assert.equal(direct.length, 16);
const wall = direct.find((record) => record.kind === 1);
assert.ok(wall);
assert.equal(wall.metric, 1700);
assert.deepEqual(wallCenter(wall), { x: 584, y: 520 });
assert.equal(
  blockingWall(direct, { x: 100, y: 520 }, { x: 900, y: 520 }),
  wall,
);
const before = wall.metric;
assert.equal(strikeWallRecord(wall, 7), 7);
assert.equal(wall.metric, before - 7);
assert.equal(wallDestroyed(wall), false);
strikeWallRecord(wall, wall.metric);
assert.equal(wallDestroyed(wall), true);
assert.equal(wall.flags & 1, 1);

const sc = {
  generals: [
    { name: "攻", ability: { force: 90 } },
    { name: "守", ability: { force: 50 } },
  ],
  factions: [{ monarch: "攻" }, { monarch: "守" }],
};
const A = { leader: "攻", faction: 0, troops: 500, formation: 1 };
const city = {
  idx: 0,
  name: "城",
  faction: 1,
  troops: 120,
  growth: 100,
  defence: 100,
};
const battle = createBattle(sc, A, city, battleMaps);
const liveWall = battle.wallRecords.find((record) => record.kind === 1);
assert.ok(liveWall, "siege battle must construct wall records from BATTLE.MAP");
const attacker = battle.units.find((unit) => unit.side === "atk");
const center = wallCenter(liveWall);
attacker.x = center.x - 18;
attacker.y = center.y;
attacker.hx = attacker.x;
attacker.hy = attacker.y;
attacker.tacticalOrder = "wall";
attacker.order = { ...center };
attacker.cd = 0;
const metricBeforeCombat = liveWall.metric;
tickBattle(battle, 0.1);
assert.ok(
  liveWall.metric < metricBeforeCombat,
  "wall command must apply confirmed metric decrement on contact",
);

liveWall.metric = 1;
liveWall.flags = 0x80;
liveWall.intact = true;
attacker.cd = 0;
attacker.order = { ...center };
tickBattle(battle, 0.1);
assert.equal(wallDestroyed(liveWall), true);
assert.equal(battle.wallRevision, 1);
attacker.order = null;
attacker.tacticalOrder = "siege";
tickBattle(battle, 0.1);
assert.equal(
  attacker.tacticalOrder,
  "assault",
  "攻城命令打出最后缺口后应转为突入",
);

process.stdout.write(
  "battle walls legacy presentation OK: layout records + visual contact strike\n",
);
