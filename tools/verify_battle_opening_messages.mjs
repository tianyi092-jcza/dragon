import assert from "node:assert/strict";

const scheduled = new Map();
let nextTimerId = 1;
globalThis.innerWidth = 640;
globalThis.innerHeight = 400;
globalThis.setTimeout = (callback, ms) => {
  const id = nextTimerId++;
  scheduled.set(id, { callback, ms });
  return id;
};
globalThis.clearTimeout = (id) => scheduled.delete(id);
globalThis.fetch = async (url) => {
  if (String(url).endsWith("talk.json")) {
    const strings = Array.from({ length: 1023 }, () => []);
    strings[27] = ["\\1的部隊向", "\\2進攻過來了。"];
    strings[28] = ["\\1大人的部隊向", "\\2進攻。"];
    strings[29] = ["\\1大人的部隊與", "\\1的部隊交戰。"];
    strings[30] = ["遷都完成。新首都是", "\\2。"];
    return { json: async () => ({ strings }) };
  }
  return { json: async () => ({}) };
};
globalThis.Image = class {
  set src(_value) {
    queueMicrotask(() => this.onload?.());
  }
};

const { resolveBattle, resolveFieldBattle, applyBattleResult } = await import(
  "../web/src/game/ai.js"
);
const { GameBar } = await import("../web/src/ui/gamebar.js");

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

function fireOnlyTimer(expectedMs = 3000) {
  assert.equal(scheduled.size, 1);
  const [id, timer] = [...scheduled.entries()][0];
  assert.equal(timer.ms, expectedMs);
  scheduled.delete(id);
  timer.callback();
}

function faction(idx, capital) {
  return { idx, capital, monarch_idx: idx, active: true, n_cities: 1 };
}

function general(idx, name, factionIdx) {
  return {
    idx,
    name,
    faction: factionIdx,
    status: 1,
    active: true,
    attr: 0x80,
    battle_rating: 0,
  };
}

function legion(leader, factionIdx, x, y) {
  return {
    leader,
    faction: factionIdx,
    x,
    y,
    prevX: x,
    prevY: y,
    troops: 100,
    morale: 200,
    status: 0x80,
    _active: true,
    units: [{ type: 1, troops: 1000 }],
  };
}

function fixture() {
  const cities = [
    { idx: 0, name: "許昌", faction: 0, x: 10, y: 10, troops: 100 },
    { idx: 1, name: "下邳", faction: 1, x: 20, y: 20, troops: 100 },
    { idx: 2, name: "小沛", faction: 0, x: 30, y: 30, troops: 100 },
  ];
  const scenario = {
    player_faction: 0,
    factions: [faction(0, 0), faction(1, 1)],
    generals: [general(0, "曹操", 0), general(1, "呂布", 1)],
    cities,
    legions: [],
    diplomacy: [
      [0xff, 0],
      [0, 0xff],
    ],
    citiesOf(factionIdx) {
      return this.cities.filter((city) => city.faction === factionIdx);
    },
    monarchOf(factionRecord) {
      return this.generals[factionRecord.monarch_idx];
    },
  };
  const started = [];
  const app = {
    scenario,
    clock: { setHold() {} },
    view: { draw() {} },
    hud: { flashEvent() {}, buildLegend() {}, refreshInfo() {} },
    battleView: { active: false },
    engageTransition: { active: false },
    startBattle(...args) {
      started.push(["siege", ...args]);
    },
    startFieldBattle(...args) {
      started.push(["field", ...args]);
    },
  };
  const bar = new GameBar(app);
  app.gamebar = bar;
  bar.imgs = { messageNpc: {} };
  return { app, bar, scenario, cities, started };
}

// 玩家攻城：TALK28关闭前不得打开战术层。
{
  scheduled.clear();
  const { app, bar, scenario, cities, started } = fixture();
  const attacker = legion("曹操", 0, cities[1].x, cities[1].y);
  const defender = legion("呂布", 1, cities[1].x, cities[1].y);
  scenario.legions = [attacker, defender];
  assert.equal(resolveBattle(app, attacker, cities[1]), true);
  await flush();
  assert.equal(started.length, 0);
  assert.equal(
    bar.generalCard.lines
      .flat()
      .map((part) => part.text)
      .join(""),
    "曹操大人的部隊向下邳進攻。",
  );
  fireOnlyTimer();
  assert.equal(started.length, 1);
  assert.equal(started[0][0], "siege");
}

// 右键关闭同样只启动一次战场，旧3秒timer不得二次启动。
{
  scheduled.clear();
  const { app, bar, scenario, cities, started } = fixture();
  const attacker = legion("曹操", 0, cities[1].x, cities[1].y);
  const defender = legion("呂布", 1, cities[1].x, cities[1].y);
  scenario.legions = [attacker, defender];
  assert.equal(resolveBattle(app, attacker, cities[1]), true);
  await flush();
  const timer = [...scheduled.values()][0];
  bar.closeGeneralCard();
  assert.equal(started.length, 1);
  timer.callback();
  assert.equal(started.length, 1);
}

// 敌军攻玩家据点：TALK27关闭前不得打开战术层。
{
  scheduled.clear();
  const { app, bar, scenario, cities, started } = fixture();
  const attacker = legion("呂布", 1, cities[0].x, cities[0].y);
  const defender = legion("曹操", 0, cities[0].x, cities[0].y);
  scenario.legions = [attacker, defender];
  assert.equal(resolveBattle(app, attacker, cities[0]), true);
  await flush();
  assert.equal(started.length, 0);
  assert.equal(
    bar.generalCard.lines
      .flat()
      .map((part) => part.text)
      .join(""),
    "呂布的部隊向許昌進攻過來了。",
  );
  fireOnlyTimer();
  assert.equal(started.length, 1);
  assert.equal(started[0][0], "siege");
}

// 玩家参与野战：两个\\1按原参数顺序展开，TALK29关闭后才开战场。
{
  scheduled.clear();
  const { app, bar, scenario, started } = fixture();
  const attacker = legion("曹操", 0, 15, 15);
  const defender = legion("呂布", 1, 15, 15);
  scenario.legions = [attacker, defender];
  assert.equal(resolveFieldBattle(app, attacker, defender), true);
  await flush();
  assert.equal(started.length, 0);
  assert.equal(
    bar.generalCard.lines
      .flat()
      .map((part) => part.text)
      .join(""),
    "曹操大人的部隊與呂布的部隊交戰。",
  );
  fireOnlyTimer();
  assert.equal(started.length, 1);
  assert.equal(started[0][0], "field");
}

// 玩家首都失陷但势力尚存：新首都TALK30先于据点失陷TALK26入队。
{
  const { app, scenario, cities } = fixture();
  const messages = [];
  app.gamebar = {
    enqueueTalkMessage(message) {
      messages.push(message);
    },
  };
  const attacker = legion("呂布", 1, cities[0].x, cities[0].y);
  scenario.legions = [attacker];
  applyBattleResult(app, attacker, cities[0], "atk", 90, [90, 0, 0, 0, 0, 0]);
  assert.equal(scenario.factions[0].capital, 2);
  assert.deepEqual(
    messages
      .filter((message) => [26, 30].includes(message.talkIndex))
      .map((message) => message.talkIndex),
    [30, 26],
  );
  assert.equal(messages[0].cityName, "小沛");
}

process.stdout.write(
  "battle opening messages OK: TALK27/28/29 gate battle start, TALK30 precedes TALK26\n",
);
