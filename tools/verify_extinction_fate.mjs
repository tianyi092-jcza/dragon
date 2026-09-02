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
cities[1].governor = 5;
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
  { idx: 5, name: "政", faction: 1, active: true, status: 2 },
  { idx: 6, name: "使", faction: 1, active: true, status: 3 },
];
factions[1].diplomat_idx = 6;
const attacker = legion("攻", 0, 0, 20);
const fieldGeneralLegion = legion("軍", 2, 1, 50);
const sc = {
  player_faction: 0,
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
const messages = [];
const app = {
  scenario: sc,
  hud: { flashEvent() {} },
  gamebar: {
    enqueueStrategicMessage: (message) => messages.push(message),
    enqueueTalkMessage: (message) => messages.push(message),
  },
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
assert.deepEqual(
  messages.map((message) => [
    message.kind,
    message.talkIndex,
    message.personalitySelector,
  ]),
  [
    ["extinction-governor-return", 68, 0x1a6],
    ["extinction-diplomat-return", 69, 0x1a7],
    ["postbattle-captured", 34, 0x19a],
    ["faction-extinction", 36, undefined],
  ],
  "0x4D63/TALK68先于0x5074/TALK69和逐将，TALK36最后",
);

// 静态0x4D63/0x5074均无玩家门控：AI攻AI最后据点也必须产生TALK68/69链。
{
  const aiCities = [city(0, 0, 10), city(1, 1, 20), city(2, 2, 30)];
  aiCities[1].governor = 5;
  const aiFactions = structuredClone(factions).map((faction) => ({
    ...faction,
    dead: false,
    _extinctionHandled: false,
  }));
  const aiGenerals = structuredClone(generals);
  aiFactions[1].diplomat_idx = 6;
  aiCities[2].faction = 2;
  const aiAttacker = legion("攻", 0, 0, 20);
  const aiScenario = {
    player_faction: 2,
    cities: aiCities,
    factions: aiFactions,
    generals: aiGenerals,
    legions: [aiAttacker],
    diplomacy: [
      [0xff, 0, 0x80],
      [0, 0xff, 0x80],
      [0x80, 0x80, 0xff],
    ],
    citiesOf(faction) {
      return this.cities.filter((candidate) => candidate.faction === faction);
    },
  };
  const aiMessages = [];
  applyBattleResult(
    {
      scenario: aiScenario,
      gamebar: {
        enqueueTalkMessage: (message) => aiMessages.push(message),
      },
    },
    aiAttacker,
    aiCities[1],
    "atk",
    300,
    [50, 50, 50, 50, 50, 50],
  );
  assert.deepEqual(
    aiMessages.slice(0, 2).map((message) => message.talkIndex),
    [68, 69],
    "AI对AI破城仍同步显示内政官/外交官返回消息",
  );
}

process.stdout.write(
  "extinction fate verification passed: player and AI 0x4D63/0x5074/0x50D7/0x50B4/0x29C3\n",
);
