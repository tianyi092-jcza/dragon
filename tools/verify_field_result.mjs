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
const { applyFieldBattleResult } = await import("../web/src/game/ai.js");
await loadTerrain();

const makeLegion = (leader, faction, troops, x, y) => ({
  leader,
  faction,
  troops,
  morale: 200,
  status: 0x80,
  _active: true,
  units: [{ type: 1, troops: troops * 10 }],
  x,
  y,
  prevX: 0,
  prevY: 0,
  target: { idx: 1 },
  cooldown: 0,
  _markerFrame: faction ? 0 : 1,
  _march: { points: [{ x: 11, y: 20 }] },
  _engagement: { kind: "field", countdown: 1 },
});
const events = [];
const cities = [
  { idx: 0, faction: 0, x: 257, y: 9 },
  { idx: 1, faction: 1, x: 246, y: 15 },
];
const app = {
  scenario: {
    generals: [
      { idx: 0, name: "甲", faction: 0, status: 1, battle_rating: 0 },
      { idx: 1, name: "乙", faction: 1, status: 1, battle_rating: 0 },
    ],
    factions: [
      { idx: 0, capital: 0, monarch_idx: 0 },
      { idx: 1, capital: 1, monarch_idx: 1 },
    ],
    cities,
    prisoners: [],
    legions: [],
    citiesOf(faction) {
      return this.cities.filter((city) => city.faction === faction);
    },
  },
  hud: { flashEvent: (message) => events.push(message) },
};
const A = makeLegion("甲", 0, 100, 257, 9);
const D = makeLegion("乙", 1, 100, 255, 9);
app.scenario.legions = [A, D];

applyFieldBattleResult(
  app,
  A,
  D,
  "atk",
  37,
  22,
  [37, 0, 0, 0, 0, 0],
  [22, 0, 0, 0, 0, 0],
);
assert.equal(A.troops, 37);
assert.equal(D.troops, 22);
assert.equal(A.dead, undefined);
assert.equal(D.dead, undefined);
assert.equal(app.scenario.prisoners.length, 0);
assert.equal(A.cooldown, 8);
assert.equal(D.cooldown, 12);
assert.equal(A.commandState, 8);
assert.equal(D.commandState, 10);
assert.equal(D.target.idx, 1);
assert.equal(D._retreat.cityIdx, 1);
assert.equal(A.units[0].troops, 370);
assert.equal(D.units[0].troops, 220);
assert.equal(A.morale, 74);
assert.equal(D.morale, 22);
for (const legion of [A, D]) {
  assert.equal(legion._engagement, null);
  assert.equal(legion._markerFrame, 4);
  assert.equal(legion.prevX, legion.x);
  assert.equal(legion.prevY, legion.y);
}
assert.match(events[0], /野戰擊退/);
process.stdout.write(
  "field result OK: winner continues, loser retreats by 0x474A route\n",
);
