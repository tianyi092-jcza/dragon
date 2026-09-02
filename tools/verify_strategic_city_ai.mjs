import assert from "node:assert/strict";
import fs from "node:fs/promises";

let data;
try {
  data = JSON.parse(
    await fs.readFile(new URL("../web/data.json", import.meta.url), "utf8"),
  );
} catch (error) {
  throw new Error(`cannot load strategic AI fixture: ${error.message}`, {
    cause: error,
  });
}
const { buildArmies, tickStrategicCity } = await import(
  "../web/src/game/ai.js"
);

// 官方第一章（合集中索引16）：吕布首都79，边境城76邻接曹操88/74。
const sc = structuredClone(data.scenarios[16]);
sc.player_faction = 0;
sc.citiesOf = (idx) => sc.cities.filter((city) => city.faction === idx);
buildArmies(sc);
const luBuFaction = sc.factions.find((faction) => faction.idx === 13);
assert.equal(luBuFaction.capital, 79);
luBuFaction.target_faction = 0;
sc.diplomacy[13][0] = 0;
sc.diplomacy[0][13] = 0;
const border = sc.cities[76];
const capital = sc.cities[79];
assert.equal(border.faction, 13);
assert.equal(capital.faction, 13);
assert.equal(sc.legions.length, 0);

const app = {
  scenario: sc,
  originalRng: { nextByte: () => 0 },
  gamebar: { enqueueTalkMessage: () => assert.fail("AI城不得弹援军消息") },
};
assert.equal(tickStrategicCity(app, 76), true);
assert.equal(sc.legions.length, 1);
const legion = sc.legions[0];
assert.equal(legion.leader, luBuFaction.monarch, "武力最高待命者为吕布");
assert.deepEqual(
  legion.units.map((unit) => unit.type),
  [1, 1, 3, 3, 2, 2],
);
assert.equal(legion.troops, 600);
assert.equal(legion.status & 0x04, 0x04);
assert.equal(legion.x, capital.x);
assert.equal(legion.y, capital.y);
assert.equal(legion.target.idx, border.idx);
assert.deepEqual(
  [luBuFaction.reserve_cav, luBuFaction.reserve_arc, luBuFaction.reserve_inf],
  [200, 300, 400],
);

// 玩家边境空城仅发TALK38式通用消息，并以该城自己的24..39轮询冷却去重。
const playerSc = structuredClone(data.scenarios[16]);
playerSc.player_faction = 13;
playerSc.citiesOf = (idx) =>
  playerSc.cities.filter((city) => city.faction === idx);
buildArmies(playerSc);
const playerFaction = playerSc.factions.find((faction) => faction.idx === 13);
playerFaction.target_faction = 0;
playerSc.diplomacy[13][0] = 0;
playerSc.diplomacy[0][13] = 0;
const messages = [];
const playerApp = {
  scenario: playerSc,
  originalRng: { nextByte: () => 5 },
  gamebar: { enqueueTalkMessage: (message) => messages.push(message) },
};
assert.equal(tickStrategicCity(playerApp, 76), true);
assert.equal(messages.length, 1);
assert.equal(messages[0].gen, null);
assert.equal(messages[0].talkIndex, 38);
assert.equal(messages[0].cityName, border.name.trim());
assert.equal(playerSc.cities[76]._aiCooldown, 29);
assert.equal(tickStrategicCity(playerApp, 76), false);
assert.equal(messages.length, 1);

// 0x3FA9的0xFE威胁标记看任一正式交战邻国，不依赖玩家势力+0x19目标。
// AI向玩家宣战时0x35AB明确不写玩家目标，仍必须触发无守军边城TALK38。
const untargetedPlayerSc = structuredClone(data.scenarios[16]);
untargetedPlayerSc.player_faction = 13;
untargetedPlayerSc.citiesOf = (idx) =>
  untargetedPlayerSc.cities.filter((city) => city.faction === idx);
buildArmies(untargetedPlayerSc);
untargetedPlayerSc.factions.find(
  (faction) => faction.idx === 13,
).target_faction = null;
untargetedPlayerSc.diplomacy[13][0] = 0;
untargetedPlayerSc.diplomacy[0][13] = 0;
const untargetedMessages = [];
assert.equal(
  tickStrategicCity(
    {
      scenario: untargetedPlayerSc,
      originalRng: { nextByte: () => 0 },
      gamebar: {
        enqueueTalkMessage: (message) => untargetedMessages.push(message),
      },
    },
    76,
  ),
  true,
);
assert.equal(untargetedMessages.length, 1);
assert.equal(untargetedMessages[0].talkIndex, 38);

// 0x407A：弱城请求数为所有交战邻城(运行态强度+1)之和+2-local。
// 本城1军、一个空敌城时应请求2军；以调用次数而非最终成功数锁住+1语义。
const raw = new Uint8Array(0x20);
raw[0] = 1;
raw[0x1c] = 1;
const weakSc = {
  player_faction: 9,
  cities: [
    {
      idx: 0,
      name: "弱城",
      faction: 0,
      x: 10,
      y: 10,
      raw: Buffer.from(raw).toString("hex"),
    },
    { idx: 1, name: "敵城", faction: 1, x: 20, y: 10, raw: "00".repeat(0x20) },
    { idx: 2, name: "首都", faction: 0, x: 0, y: 0, raw: "00".repeat(0x20) },
  ],
  factions: [
    {
      idx: 0,
      active: true,
      target_faction: 1,
      capital: 2,
      money: 0,
      n_legions: 1,
      reserve_cav: 1000,
      reserve_arc: 1000,
      reserve_inf: 1000,
      legion_morale_cap: 200,
    },
    { idx: 1, active: true, capital: 1 },
  ],
  diplomacy: [
    [0xff, 0],
    [0, 0xff],
  ],
  generals: [
    {
      idx: 0,
      name: "守將",
      faction: 0,
      status: 1,
      active: true,
      ability: { force: 1 },
    },
    {
      idx: 1,
      name: "強將",
      faction: 0,
      status: 0,
      active: true,
      ability: { force: 15 },
    },
    {
      idx: 2,
      name: "次將",
      faction: 0,
      status: 0,
      active: true,
      ability: { force: 14 },
    },
  ],
  legions: [
    {
      slot: 0,
      leader: "守將",
      faction: 0,
      x: 10,
      y: 10,
      troops: 100,
      morale: 200,
      units: [{ type: 1, troops: 1000 }],
      _active: true,
    },
  ],
};
const weakApp = { scenario: weakSc, originalRng: { nextByte: () => 0 } };
assert.equal(tickStrategicCity(weakApp, 0), true);
assert.equal(weakSc.legions.length, 3, "一个空敌邻城应使弱城请求两支援军");
assert.deepEqual(
  weakSc.legions.slice(1).map((item) => item.leader),
  ["強將", "次將"],
  "编成按武力降序选择，不得君主特判",
);

process.stdout.write(
  "strategic city AI OK: border reinforcement formation + TALK38 cooldown + weak-city request\n",
);
