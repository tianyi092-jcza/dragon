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
globalThis.Image = class {
  set src(_value) {
    queueMicrotask(() => this.onload?.());
  }
};
globalThis.fetch = async (url) => {
  if (String(url).endsWith("talk.json")) {
    const strings = Array.from({ length: 1023 }, () => []);
    strings[298] = ["\\1／\\2／\\3／\\4"];
    return { json: async () => ({ strings }) };
  }
  return { json: async () => ({}) };
};

const { tickStrategicWarEvents } = await import("../web/src/game/ai.js");
const { GameBar } = await import("../web/src/ui/gamebar.js");

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

const scenario = {
  player_faction: 0,
  factions: [{ idx: 0, monarch_idx: 9, monarch: "勢力名" }],
  generals: Array.from({ length: 10 }, (_, idx) => ({
    idx,
    name: idx === 9 ? "武將名" : `將${idx}`,
    portrait: idx,
  })),
  cities: Array.from({ length: 10 }, (_, idx) => ({
    idx,
    name: idx === 9 ? "城名" : `城${idx}`,
  })),
  legions: [],
  strategicEventSlots: Array(256).fill(null),
  _strategicEventCursor: 0,
  _strategicEventDivider: 1,
};
scenario.strategicEventSlots[0] = { type: 10, arg0: 9, talkIndex: 298 };
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
  hud: {},
  battleView: { active: false },
  engageTransition: { active: false },
};
const bar = new GameBar(app);
app.gamebar = bar;
bar.imgs = { messageNpc: {} };

assert.equal(tickStrategicWarEvents(app), true);
await flush();
const text = bar.generalCard.lines
  .flat()
  .map((part) => part.text)
  .join("");
assert.equal(text, "武將名／城名／武將名／武將名");
assert.equal(clock.hold, true);
assert.equal(scenario._strategicEventCursor, 1);
assert.equal(scheduled.size, 1);
const [id, timer] = [...scheduled.entries()][0];
assert.equal(timer.ms, 3000);
scheduled.delete(id);
timer.callback();
await flush();
assert.equal(bar.generalCard, null);
assert.equal(clock.hold, false);

process.stdout.write(
  "type10 message FIFO OK: SAVE event dispatch, generic placeholders, 3s hold lifecycle\n",
);
