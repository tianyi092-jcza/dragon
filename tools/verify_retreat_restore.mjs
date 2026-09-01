import assert from "node:assert/strict";
import fs from "node:fs/promises";

// 全程内存fixture：验证server sidecar覆盖后的强制撤退不会被下一次aiTick改写。
globalThis.window = {};
globalThis.Image = class {
  set src(_value) {
    queueMicrotask(() => this.onload?.());
  }
};
globalThis.fetch = async (url) => {
  const data = await fs.readFile(new URL(`../web/${url}`, import.meta.url));
  return {
    ok: true,
    status: 200,
    json: async () => {
      try {
        return JSON.parse(data.toString("utf8"));
      } catch (error) {
        throw new Error(`invalid JSON fixture ${url}`, { cause: error });
      }
    },
  };
};
const { loadRoadGraph, findRoadRoute, roadNodeAt } = await import(
  "../web/src/game/roadgraph.js"
);
await loadRoadGraph();
const { aiTick, buildArmies } = await import("../web/src/game/ai.js");
const { applyWebMetaToState } = await import("../web/src/game/savegame.js");

let raw;
try {
  raw = JSON.parse(
    await fs.readFile(new URL("../web/data.json", import.meta.url), "utf8"),
  );
} catch (error) {
  throw new Error("cannot load data.json fixture", { cause: error });
}
const state = structuredClone(raw.scenarios[0]);
const faction = state.factions[0];
const target = state.cities[faction.capital];
const source = state.cities.find(
  (city) =>
    city.idx !== target.idx &&
    findRoadRoute(city.x, city.y, target.x, target.y)?.points.length > 1,
);
assert.ok(source);
const route = findRoadRoute(source.x, source.y, target.x, target.y);
const general = state.generals[faction.monarch_idx];
state.legions = [
  {
    slot: general.idx,
    leader: general.idx,
    faction: faction.idx,
    x: source.x,
    y: source.y,
    prevX: source.x,
    prevY: source.y,
    troops: 600,
    morale: 200,
    units: [1, 1, 3, 3, 2, 2].map((type) => ({ type, troops: 1000 })),
    status: 0x82,
    target: { idx: target.idx, x: target.x, y: target.y },
    targetNode: roadNodeAt(target.x, target.y).id,
    commandState: 10,
    cooldown: 2,
    _active: true,
  },
];
const webMeta = {
  schema: 2,
  originalRng: null,
  legionRuleState: [
    {
      slot: general.idx,
      _retreat: {
        cityIdx: target.idx,
        nodeId: roadNodeAt(target.x, target.y).id,
        captorFaction: 1,
      },
      _engagement: null,
      engagementCountdown: null,
    },
  ],
};
applyWebMetaToState(state, webMeta);
state.citiesOf = (idx) => state.cities.filter((city) => city.faction === idx);
buildArmies(state);
const legion = state.legions[0];
assert.equal(legion._retreat.cityIdx, target.idx);
const before = { x: legion.x, y: legion.y };
const app = {
  scenario: state,
  originalRng: { nextByte: () => 0xff },
  battleView: { active: false },
  engageTransition: null,
  hud: { flashEvent() {} },
};
aiTick(app);
assert.ok(
  legion._retreat,
  "forced retreat remains authoritative after fresh load",
);
assert.equal(legion.target.idx, target.idx);
assert.deepEqual(
  { x: legion.x, y: legion.y },
  before,
  "retreat cooldown is consumed before route movement",
);
assert.equal(legion.cooldown, 1);
assert.equal(legion.commandState, 10);
assert.ok(route.points.length > 1);

process.stdout.write(
  "retreat restore OK: webMeta overlay -> buildArmies -> aiTick keeps forced route\n",
);
