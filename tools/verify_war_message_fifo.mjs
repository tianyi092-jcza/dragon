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
    const strings = Array.from({ length: 1023 }, (_, index) => [
      `TALK${index}`,
    ]);
    strings[63] = ["\\3對我方發出宣戰布告。"];
    strings[479] = ["與你不共戴天。"];
    strings[487] = ["擊潰\\3。\\4，立即進兵。"];
    return { json: async () => ({ strings }) };
  }
  return { json: async () => ({}) };
};
globalThis.Image = class {
  set src(_value) {
    queueMicrotask(() => this.onload?.());
  }
};

const { processStrategicWarEvent } = await import("../web/src/game/ai.js");
const { GameBar } = await import("../web/src/ui/gamebar.js");

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

function fireOnlyTimer() {
  assert.equal(scheduled.size, 1);
  const [id, timer] = [...scheduled.entries()][0];
  assert.equal(timer.ms, 3000);
  scheduled.delete(id);
  timer.callback();
}

function fixture(playerFaction = 0) {
  const scenario = {
    player_faction: playerFaction,
    player_advisor: { name: "荀彧" },
    factions: [
      { idx: 0, active: true, monarch_idx: 0, monarch: "曹操" },
      { idx: 1, active: true, monarch_idx: 1, monarch: "呂布" },
    ],
    generals: [
      { idx: 0, name: "曹操", portrait: 0, talk_idx: 1 },
      { idx: 1, name: "呂布", portrait: 1, talk_idx: 1 },
    ],
    cities: [],
    legions: [],
    diplomacy: [
      [0xff, 0xd0],
      [0xd0, 0xff],
    ],
    monarchOf(faction) {
      return this.generals[faction.monarch_idx];
    },
  };
  const clock = {
    hold: false,
    setHold(value) {
      this.hold = Boolean(value);
    },
  };
  const app = {
    scenario,
    clock,
    view: { draw() {} },
    hud: { refreshInfo() {}, buildLegend() {}, flashEvent() {} },
    battleView: { active: false },
    engageTransition: { active: false },
  };
  const bar = new GameBar(app);
  app.gamebar = bar;
  bar.imgs = { messageNpc: {} };
  return { app, bar, scenario, clock };
}

// AI向玩家宣战：TALK63→个性479，最终关闭前不得提交战争状态。
{
  scheduled.clear();
  const { app, bar, scenario, clock } = fixture(0);
  assert.equal(
    processStrategicWarEvent(app, { type: 1, aggressor: 1, defender: 0 }),
    true,
  );
  await flush();
  assert.equal(clock.hold, true);
  assert.equal(scenario.diplomacy[1][0] >= 0x80, true);
  assert.equal(
    bar.generalCard.lines
      .flat()
      .map((part) => part.text)
      .join(""),
    "呂布對我方發出宣戰布告。",
  );
  fireOnlyTimer();
  await flush();
  assert.equal(
    bar.generalCard.lines
      .flat()
      .map((part) => (typeof part === "string" ? part : part.text))
      .join(""),
    "與你不共戴天。",
  );
  assert.equal(scenario.diplomacy[1][0] >= 0x80, true);
  const [, stale] = [...scheduled.entries()][0];
  bar.closeGeneralCard();
  assert.equal(scenario.diplomacy[1][0] < 0x80, true);
  assert.equal(clock.hold, false);
  stale.callback();
  assert.equal(scenario.diplomacy[1][0] < 0x80, true);
}

// 系统让玩家主动宣战：TALK487关闭后才提交。
{
  scheduled.clear();
  const { app, bar, scenario } = fixture(0);
  assert.equal(
    processStrategicWarEvent(app, { type: 1, aggressor: 0, defender: 1 }),
    true,
  );
  await flush();
  assert.equal(scenario.diplomacy[0][1] >= 0x80, true);
  assert.equal(
    bar.generalCard.lines
      .flat()
      .map((part) => (typeof part === "string" ? part : part.text))
      .join(""),
    "擊潰呂布。荀彧，立即進兵。",
  );
  fireOnlyTimer();
  assert.equal(scenario.diplomacy[0][1] < 0x80, true);
}

process.stdout.write(
  "war message FIFO OK: TALK63/479 and TALK487 format, hold and final-close commit\n",
);
