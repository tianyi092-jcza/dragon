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
    for (const index of [43, 44, 45, 47, 48, 49, 57])
      strings[index] = [`TALK${index}`];
    return { json: async () => ({ strings }) };
  }
  return { json: async () => ({}) };
};
globalThis.Image = class {
  set src(_value) {
    queueMicrotask(() => this.onload?.());
  }
};

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

function fixture() {
  const me = {
    idx: 0,
    active: true,
    monarch_idx: 0,
    monarch: "曹操",
    gold: 10000,
    money: 10000,
    bellicosity: 8,
  };
  const other = {
    idx: 1,
    active: true,
    monarch_idx: 1,
    monarch: "劉備",
    gold: 10000,
    money: 10000,
    bellicosity: 0,
    target_faction: null,
  };
  const target = {
    idx: 2,
    active: true,
    monarch_idx: 2,
    monarch: "呂布",
    gold: 10000,
    money: 10000,
    bellicosity: 8,
  };
  const scenario = {
    player_faction: 0,
    trust: 255,
    factions: [me, other, target],
    generals: [
      {
        idx: 0,
        name: "曹操",
        portrait: 0,
        faction: 0,
        status: 0,
        ability: { politics: 15 },
      },
      {
        idx: 1,
        name: "劉備",
        portrait: 1,
        faction: 1,
        status: 0,
        ability: { politics: 15 },
      },
      {
        idx: 2,
        name: "呂布",
        portrait: 2,
        faction: 2,
        status: 0,
        ability: { politics: 1 },
      },
      {
        idx: 3,
        name: "荀彧",
        portrait: 3,
        faction: 0,
        status: 0,
        ability: { politics: 15 },
      },
    ],
    cities: [],
    legions: [],
    envoys: { 1: { gen_idx: 3, name: "荀彧" } },
    diplomacy: [
      [0xff, 0xf0, 0x20],
      [0xf0, 0xff, 0x20],
      [0x20, 0x20, 0xff],
    ],
    monarchOf(faction) {
      return this.generals[faction.monarch_idx];
    },
  };
  const app = {
    scenario,
    originalRng: { nextByte: () => 0 },
    clock: { setHold() {} },
    view: { draw() {} },
    hud: {
      buildLegend() {},
      refreshInfo() {},
      flashEvent() {},
    },
    battleView: { active: false },
    engageTransition: { active: false },
  };
  const bar = new GameBar(app);
  app.gamebar = bar;
  bar.imgs = { messageNpc: {} };
  return { app, bar, scenario, me, other, target };
}

// 玩家停战使者：第二段结果框关闭前，外交和资金均不得提交。
{
  scheduled.clear();
  const { bar, scenario, me, other } = fixture();
  scenario.diplomacy[0][1] = 0x20;
  scenario.diplomacy[1][0] = 0x20;
  const pending = bar.showTruceNegotiationResult({
    targetFaction: other,
    envoyName: "荀彧",
  });
  await flush();
  fireOnlyTimer();
  await pending;
  await flush();
  assert.equal(scenario.diplomacy[0][1] < 0x80, true);
  assert.equal(me.gold, 10000);
  assert.equal(scheduled.size, 1);
  const [, resultTimer] = [...scheduled.entries()][0];
  assert.equal(resultTimer.ms, 3000);
  fireOnlyTimer();
  assert.equal(scenario.diplomacy[0][1] >= 0x80, true);
  assert.equal(scenario.diplomacy[1][0] >= 0x80, true);
}

// 玩家请援使者：协助方仅在最终结果框关闭后才对目标宣战。
{
  scheduled.clear();
  const { bar, scenario, other, target } = fixture();
  scenario.diplomacy[1][0] = 0xff;
  scenario.diplomacy[1][2] = 0x80;
  const pending = bar.showAssistanceNegotiationResult({
    allyFaction: other,
    targetFaction: target,
    envoyName: "荀彧",
  });
  await flush();
  fireOnlyTimer();
  await pending;
  await flush();
  assert.equal(scenario.diplomacy[1][2] >= 0x80, true);
  const [, resultTimer] = [...scheduled.entries()][0];
  assert.equal(resultTimer.ms, 3000);
  fireOnlyTimer();
  assert.equal(scenario.diplomacy[1][2] < 0x80, true);
  assert.equal(scenario.diplomacy[2][1] < 0x80, true);
}

process.stdout.write(
  "negotiation message commit OK: truce/assistance settle only after 3s result close\n",
);
