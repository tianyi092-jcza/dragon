// A-INIT-2 remainder 2: blank-chapter live first-round + month-boundary
// through the genuine calendar (Clock) and production tick callbacks
// (aiTick per strategic tick, war-events per hour, fiscal settlement per
// month-end), on an isolated blank scenario (192 neutral cities, one empty
// faction, no generals/legions). Asserts: 40 days advance with no throw,
// first round completes, month boundary settles, nothing spawns, all
// cities stay neutral, faction stays empty. Either pass or an exact error
// is evidence; a failure here would scope (not silently extend) the blank
// recipe. Pure node, no disk writes, no SAVE.DAT, stdout only.
import assert from "node:assert/strict";
import { format } from "node:util";
const tlog = (...args) => process.stdout.write(`${format(...args)}\n`);
import { attachSyntheticNativeFactionSource } from "./native_faction_fixture.mjs";
import { createContentCatalog } from "../web/src/content/catalog.js";
import { createWorldResources } from "../web/src/game/worldresources.js";
import { createNewGameScenario } from "../web/src/game/world.js";
import {
  prepareScenario,
  scenarioNativeRoadContext,
} from "../web/src/game/scenarioassembly.js";
import { Clock } from "../web/src/game/clock.js";
import { OriginalBattleRng } from "../web/src/game/battle/originalrng.js";

const graph = {
  version: 2,
  width: 384,
  height: 256,
  nodes: Array.from({ length: 192 }, (_, id) => ({
    id,
    x: id % 384,
    y: 1,
    edgeSlots: [0, 0, 0, 0],
  })),
  edges: [],
};
const template = {
  player_faction: 0,
  factions: [
    {
      idx: 0,
      capital: null,
      n_legions: 0,
      n_cities: 0,
      active: false,
      attr: 0,
      monarch_idx: 126,
      march_marker_style: 0,
    },
  ],
  generals: [],
  cities: graph.nodes.map(({ id, x, y }) => ({
    idx: id,
    x,
    y,
    faction: null,
    governor: null,
    type: 1,
    max_prod: 10,
    prod: 10,
    // Blank-recipe presence contract (governance reads C10..C13): values
    // are author choices, presence is certified by the 420B read.
    growth: 0,
    defence: 0,
    troops: 0,
    troops_cap: 100,
  })),
  legions: [],
  weatherClouds: Array.from({ length: 16 }, () => ({ status: 0 })),
  disasterMapObjects: Array.from({ length: 16 }, () => ({ status: 0 })),
};

const manifest = {
  schemaVersion: 1,
  rules: "ki-1995",
  id: "init2-blank-live",
  revision: "1",
  chapters: [{ id: "chapter", legacyScenarioIndex: 0, official: false }],
};
const content = createContentCatalog(manifest, { scenarios: [template] });
const world = createWorldResources();
const raw = createNewGameScenario(template);
attachSyntheticNativeFactionSource(raw);
const oldFetch = globalThis.fetch;
const allowed = new Set([
  world.definition.assets.terrain,
  world.definition.assets.roadCost,
  world.definition.assets.roadOffset,
  world.definition.assets.roadGraph,
]);
globalThis.fetch = async (url) => {
  assert(allowed.has(String(url)), `Unexpected asset ${url}`);
  if (String(url) === world.definition.assets.roadGraph) {
    return { ok: true, json: async () => graph };
  }
  return {
    ok: true,
    arrayBuffer: async () => new ArrayBuffer(384 * 256),
    json: async () => ({}),
  };
};
let sc;
try {
  ({ scenario: sc } = await prepareScenario({ raw, idx: 0, mode: "fresh", content, world }));
} finally {
  globalThis.fetch = oldFetch;
}
assert.ok(scenarioNativeRoadContext(sc), "blank scenario must bind native context");

const { aiTick, tickStrategicWarEvents, tickFactionStrategicState, processMonthlyFiscalSettlement, initializeStrategicDiplomacy } =
  await import("../web/src/game/ai.js");
const settlements = [];
const app = {
  scenario: sc,
  scenarioIdx: 0,
  world,
  content,
  originalRng: new OriginalBattleRng({ ch: 0, cl: 0, dh: 1 }),
  battleView: null,
  engageTransition: null,
  gamebar: { syncClock() {} },
  hud: { showSettlement() {}, flashEvent() {} },
};
app.clock = new Clock({
  startYear: 196,
  startMonth: 1,
  startDay: 1,
  onStrategicTick: (c) => {
    const batchStart = sc._legionBatchCursor ?? 0;
    const cityCursor = sc._cityTickCursor ?? 0;
    aiTick(app, {
      legionBatchStart: batchStart,
      cityIndex: cityCursor,
      hour: c.hour,
      runFactionTick: false,
    });
  },
  onSyncHold: () => app.gamebar.syncClock(),
  onHour: () => {
    tickStrategicWarEvents(app);
    tickFactionStrategicState(app);
  },
  onMonthEnd: (c) => {
    settlements.push(processMonthlyFiscalSettlement(app, c));
  },
});
// Production new-game 0x1B29->0x2BD9 (same exported initializer enterGame
// calls): opens the event wheel (divider 7, cursor 0) and enqueues capital
// + war events. On blank this either succeeds or stops with the exact
// recipe gap (recorded, not worked around).
try {
  initializeStrategicDiplomacy(app);
  tlog(`diplomacy init: divider=${sc._strategicEventDivider} cursor=${sc._strategicEventCursor}`);
} catch (error) {
  tlog(`diplomacy init stops exactly at: ${error?.message ?? error}`);
  throw new Error("blank diplomacy-init gap (exact error above)");
}
app.clock.strategicSpeed = 4;

// 40 days through the genuine calendar (9 sub-ticks/hour x 24h).
const TICKS = 40 * 24 * 9;
for (let i = 0; i < TICKS; i++) {
  app.clock.advance(3.125);
  if (app._strategicBattleFailure || app.clock.hold) {
    const err = app._strategicBattleFailure?.error;
    tlog(`blank tick stopped at ${app.clock.year}/${app.clock.month}/${app.clock.day}: ${err?.message ?? err}`);
    tlog(`stack: ${String(err?.stack ?? "").split("\n").slice(0, 6).join(" <- ")}`);
    throw new Error("blank scenario tick failure (exact error above)");
  }
}
tlog(`advanced to ${app.clock.year}/${app.clock.month}/${app.clock.day} (day count ok)`);
assert.equal(app.clock.month, 2, "must cross into February");
assert.ok(app.clock.day >= 9 && app.clock.day <= 11, `day ~10 (got ${app.clock.day})`);
assert.ok(settlements.length >= 1, "month-end settlement must have run");
tlog(`month settlements: ${settlements.length}`);
assert.deepEqual(sc.legions, [], "no legions may spawn");
assert.ok(sc.cities.every((c) => c.faction === null), "all cities stay neutral");
assert.equal(sc.factions[0].n_cities, 0, "faction stays empty");
assert.equal(sc.delayedLegionReturns?.length ?? 0, 0, "no delayed returns");
tlog("blank live: 40 days, first round + month boundary clean, nothing spawned");
tlog("A-INIT-2 live remainder closed at engine level (full UI month modal is product surface)");
