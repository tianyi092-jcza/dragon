import assert from "node:assert/strict";
import fs from "node:fs/promises";

const scheduled = new Map();
let nextTimerId = 1;
globalThis.window = {};
globalThis.innerWidth = 640;
globalThis.innerHeight = 400;
globalThis.setTimeout = (callback, ms) => {
  const id = nextTimerId++;
  scheduled.set(id, { callback, ms });
  return id;
};
globalThis.clearTimeout = (id) => scheduled.delete(id);
globalThis.Image = class {
  set src(_value) {
    queueMicrotask(() => this.onload?.());
  }
};
globalThis.fetch = async (url) => {
  if (String(url).endsWith("talk.json")) {
    const strings = Array.from({ length: 1023 }, (_, index) => [
      `TALK${index}`,
    ]);
    return { json: async () => ({ strings }) };
  }
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
const { GameBar } = await import("../web/src/ui/gamebar.js");
await loadTerrain();

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
const units = () =>
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
  units: units(),
  status: 0x80,
  _active: true,
});

const cities = [city(0, 0, 10), city(1, 1, 20), city(2, 2, 30)];
cities[1].governor = 5;
const factions = [
  { idx: 0, capital: 0, monarch_idx: 0, monarch: "攻", active: true },
  {
    idx: 1,
    capital: 1,
    monarch_idx: 1,
    monarch: "君",
    diplomat_idx: 6,
    active: true,
  },
  { idx: 2, capital: 2, monarch_idx: 4, monarch: "原", active: true },
];
const generals = [
  { idx: 0, name: "攻", faction: 0, active: true, status: 1, portrait: 0 },
  {
    idx: 1,
    name: "君",
    faction: 1,
    active: true,
    status: 0,
    captive_flag: 0xff,
    portrait: 1,
    talk_idx: 1,
  },
  {
    idx: 2,
    name: "軍",
    faction: 1,
    active: true,
    status: 1,
    captive_flag: 0xff,
    portrait: 2,
  },
  {
    idx: 3,
    name: "歸",
    faction: 1,
    active: true,
    status: 4,
    captive_flag: 2,
    origFaction: 2,
    portrait: 3,
  },
  { idx: 4, name: "原", faction: 2, active: true, status: 0, portrait: 4 },
  {
    idx: 5,
    name: "政",
    faction: 1,
    active: true,
    status: 2,
    portrait: 5,
    talk_idx: 5,
  },
  {
    idx: 6,
    name: "使",
    faction: 1,
    active: true,
    status: 3,
    portrait: 6,
    talk_idx: 6,
  },
];
const attacker = legion("攻", 0, 0, 20);
const fieldGeneralLegion = legion("軍", 2, 1, 50);
const scenario = {
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
  monarchOf(faction) {
    return this.generals[faction?.monarch_idx] ?? null;
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
  hud: { flashEvent() {}, refreshInfo() {}, buildLegend() {} },
  battleView: { active: false },
  engageTransition: { active: false },
};
const bar = new GameBar(app);
app.gamebar = bar;
bar.imgs = { messageNpc: {} };

applyBattleResult(
  app,
  attacker,
  cities[1],
  "atk",
  300,
  [50, 50, 50, 50, 50, 50],
);

// 0x4D63 governor pair, 0x5074 diplomat pair, 0x29C3 monarch pair, TALK36.
const expected = [68, 539, 69, 548, 34, 439, 36];
for (let index = 0; index < expected.length; index++) {
  await flush();
  const text = bar.generalCard?.lines
    ?.flat()
    .map((part) => (typeof part === "string" ? part : (part?.text ?? "")))
    .join("");
  assert.equal(text, `TALK${expected[index]}`);
  assert.equal(clock.hold, true, "clock remains held through the whole chain");
  fireOnlyTimer();
}
await flush();
assert.equal(bar.generalCard, null);
assert.equal(bar._strategicMessageQueue.length, 0);
assert.equal(bar._strategicMessageActive, false);
assert.equal(clock.hold, false);

process.stdout.write(
  "extinction message FIFO OK: governor/diplomat/capture personality pairs then TALK36\n",
);
