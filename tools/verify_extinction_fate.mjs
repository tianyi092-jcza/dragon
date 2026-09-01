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

const { applyBattleResult } = await import("../web/src/game/ai.js");
const { loadTerrain } = await import("../web/src/game/pathfind.js");
await loadTerrain();

const city = (idx, faction, x) => ({
  idx,
  name: `城${idx}`,
  faction,
  x,
  y: 10,
  troops: 10,
  troops_cap: 100,
  growth: 100,
  defence: 100,
});
const unitSet = () =>
  Array.from({ length: 6 }, (_, index) => ({
    type: (index % 3) + 1,
    troops: 500,
  }));
const legion = (leader, generalIdx, faction, x) => ({
  leader,
  generalIdx,
  slot: generalIdx,
  faction,
  x,
  y: 10,
  prevX: x,
  prevY: 10,
  troops: 300,
  morale: 200,
  units: unitSet(),
  status: 0x80,
  _active: true,
});

const cities = [city(0, 0, 10), city(1, 1, 20), city(2, 2, 30)];
const factions = [
  { idx: 0, capital: 0, monarch_idx: 0, active: true },
  { idx: 1, capital: 1, monarch_idx: 1, active: true },
  { idx: 2, capital: 2, monarch_idx: 4, active: true },
];
const generals = [
  { idx: 0, name: "攻", faction: 0, active: true, status: 1 },
  {
    idx: 1,
    name: "君",
    faction: 1,
    active: true,
    status: 0,
    captive_flag: 0xff,
  },
  {
    idx: 2,
    name: "軍",
    faction: 1,
    active: true,
    status: 1,
    captive_flag: 0xff,
  },
  {
    idx: 3,
    name: "歸",
    faction: 1,
    active: true,
    status: 4,
    captive_flag: 2,
    origFaction: 2,
  },
  { idx: 4, name: "原", faction: 2, active: true, status: 0 },
];
const attacker = legion("攻", 0, 0, 20);
const fieldGeneralLegion = legion("軍", 2, 1, 50);
const sc = {
  cities,
  factions,
  generals,
  legions: [attacker, fieldGeneralLegion],
  diplomacy: [
    [0xff, 0, 0x80],
    [0, 0xff, 0x80],
    [0x80, 0x80, 0xff],
  ],
  citiesOf(faction) {
    return this.cities.filter((candidate) => candidate.faction === faction);
  },
};
const app = {
  scenario: sc,
  hud: { flashEvent() {} },
  gamebar: { enqueueStrategicMessage() {} },
};
applyBattleResult(
  app,
  attacker,
  cities[1],
  "atk",
  300,
  [50, 50, 50, 50, 50, 50],
);
assert.equal(factions[1].dead, true);
assert.equal(generals[1].status, 4);
assert.equal(generals[1].faction, 0, "君主走0x29C3并由攻方接收");
assert.equal(generals[2].status, 0);
assert.equal(generals[2].faction, null, "有活动军团的非君主走0x50B4流散");
assert.equal(fieldGeneralLegion.dead, true);
assert.equal(generals[3].status, 0);
assert.equal(generals[3].faction, 2, "+0x1D分支走0x50D7恢复仍活跃原属");
assert.equal(generals[3].captive_flag, 0xff);
assert.equal(generals[3].origFaction, null);

process.stdout.write(
  "extinction fate verification passed: 0x50D7/0x50B4/0x29C3 branches\n",
);
