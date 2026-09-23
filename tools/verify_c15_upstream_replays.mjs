// C15 upstream replays: real entries + real pump, in-memory, no presets.
// P70 G8-nREPLAY: native fixtures via prepareScenario fresh v2 (P63 G2
// planted-contact pattern was insufficient here: the replays walk real roads
// through assignMarchOrder + aiTick, so the scenario must carry a bound v2
// assembly with real road memory, not a bare scenario object).
// Replay A: mid-war all-legions-return-to-capital — three player legions in
//   different states (mid-road order, garrisoned, low-troop post-battle rest),
//   ordered home through the real GameBar.assignMarchOrder (7FDB/7FB4) while
//   war relations stay constant; first-arrival order recorded per fiscal
//   variant, invariants asserted (all arrive, war-constant, failure-free).
// Replay B: abandon-city — the sole garrison ordered away through the same
//   real entry; the city must stay owned, no fate, no battle failure.
// Style: plain asserts, exit code only (like verify_march_navigation.mjs).
// True App/pump integration, not CPU execution. No SAVE.DAT, no profile.
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { attachSyntheticNativeFactionSource } from "./native_faction_fixture.mjs";
import { createContentCatalog } from "../web/src/content/catalog.js";
import { createWorldResources } from "../web/src/game/worldresources.js";
import { createNewGameScenario } from "../web/src/game/world.js";
import {
  prepareScenario,
  scenarioNativeRoadContext,
} from "../web/src/game/scenarioassembly.js";
import {
  initializeNativeLegionSlotsFromZeroChapter,
  rebindNativeLegionViews,
} from "../web/src/game/nativelegions.js";
import { OriginalBattleRng } from "../web/src/game/battle/originalrng.js";

let graph;
try {
  graph = JSON.parse(
    await readFile(new URL("../web/road_graph.json", import.meta.url)),
  );
} catch (error) {
  throw new Error("cannot load generated road graph", { cause: error });
}
assert.equal(graph.version, 2, "replay world must be the v2 road asset");
assert.equal(graph.nodes.length, 192, "replay world must carry 192 nodes");

const world = createWorldResources();
{
  const urls = world.definition.assets;
  const allowed = new Set([
    urls.terrain,
    urls.roadCost,
    urls.roadOffset,
    urls.roadGraph,
  ]);
  globalThis.fetch = async (url) => {
    assert(allowed.has(String(url)), `Unexpected asset ${url}`);
    if (String(url).endsWith("road_graph.json"))
      return { ok: true, json: async () => graph };
    return {
      ok: true,
      arrayBuffer: async () => new Uint8Array(384 * 256).buffer,
      json: async () => ({}),
    };
  };
}
const { loadRoadGraph } = await import("../web/src/game/roadgraph.js");
await loadRoadGraph();
const { aiTick } = await import("../web/src/game/ai.js");
const { GameBar } = await import("../web/src/ui/gamebar.js");

// Home-road geometry (native records, not legacy language): player capital
// node 0, second city node 1, enemy capital far away on the last node, so no
// hostile city sits on the home road (else the replay would correctly
// intercept instead of returning). All other cities are player-owned: the
// closest native equivalent of the old 3-city fixture, where off-road nodes
// carried no city at all; friendly transit never trips 42AB/third-party.
const HOME_NODE = 0;
const SECOND_NODE = 1;
const ENEMY_NODE = graph.nodes.at(-1).id;

function template(gold) {
  const nodes = graph.nodes;
  return {
    player_faction: 0,
    generals: [0, 1, 2].map((idx) => ({
      idx,
      name: `將${idx}`,
      faction: 0,
      active: true,
      status: 1,
      ability: { force: 80 + idx },
    })),
    legions: [],
    factions: [
      {
        idx: 0,
        capital: HOME_NODE,
        monarch_idx: 0,
        n_legions: 3,
        n_cities: 191,
        target_faction: 1,
        active: true,
        attr: 0x80,
        money: gold,
        legion_morale_cap: 200,
        strategic_city_primary: null,
        strategic_city_secondary: null,
      },
      {
        idx: 1,
        capital: ENEMY_NODE,
        n_legions: 0,
        n_cities: 1,
        target_faction: 0,
        active: true,
        attr: 0x80,
        money: 100000,
        legion_morale_cap: 200,
        strategic_city_primary: null,
        strategic_city_secondary: null,
      },
    ],
    cities: nodes.map((node) => ({
      idx: node.id,
      name: `城${node.id}`,
      x: node.x,
      y: node.y,
      faction: node.id === ENEMY_NODE ? 1 : 0,
      attr: 0x80,
      type: 1,
      prod: 100,
      troops: 80,
      governor: null,
      strategicBorderCount: 0,
      strategicNeighbours: [255, 255, 255, 255],
      strategicThreat: 0,
      growth: 50,
      defence: 50,
      troops_cap: 80,
      disaster_event: 0,
      _aiCooldown: 0,
      _strategicLastFaction: node.id === ENEMY_NODE ? 1 : 0,
    })),
    // Fixed hostile diplomacy both ways (0 < 0x80 reads at war); self cells
    // short-circuit in isAtWar. attachSynthetic expands this prefix to 24x24.
    diplomacy: [
      [0, 0],
      [0, 0],
    ],
  };
}

function legion(slot, name, troops, morale, commandState) {
  const at = graph.nodes[SECOND_NODE];
  return {
    slot,
    generalIdx: slot,
    leader: name,
    status: 0xc0,
    faction: 0,
    x: at.x,
    y: at.y,
    prevX: at.x,
    prevY: at.y,
    roadEdgeOrNode: SECOND_NODE * 8,
    targetNode: SECOND_NODE,
    targetCity: SECOND_NODE,
    commandState,
    moveDelay: 1,
    movePeriod: 3,
    troops,
    morale,
    units: Array.from({ length: 6 }, () => ({ type: 3, troops: 1000 })),
  };
}

async function warScenario(gold) {
  const raw = createNewGameScenario(template(gold), 0);
  initializeNativeLegionSlotsFromZeroChapter(raw);
  raw.legions = [
    legion(0, "行軍中", 800, 150, 1),
    legion(1, "駐守中", 800, 150, 1),
    legion(2, "戰後休整", 250, 40, 8),
  ];
  if (raw.nativeLegionSlots) {
    for (const record of raw.legions)
      raw.nativeLegionSlots.records[record.slot] = record;
    rebindNativeLegionViews(raw);
  }
  attachSyntheticNativeFactionSource(raw);
  raw.weatherCloudBounds = { minX: -16, maxX: 400, minY: -16, maxY: 400 };
  raw.weatherClouds = Array.from({ length: 16 }, () => ({ status: 0 }));
  raw.disasterMapObjects = Array.from({ length: 16 }, () => ({ status: 0 }));
  const content = createContentCatalog(
    {
      schemaVersion: 1,
      rules: "ki-1995",
      id: "c15-replay",
      revision: "1",
      chapters: [{ id: "chapter", legacyScenarioIndex: 0, official: true }],
    },
    { scenarios: [template(gold)] },
  );
  const result = await prepareScenario({
    raw,
    idx: 0,
    content,
    world,
    mode: "fresh",
    terrainMemory: {
      version: 1,
      spans: [{ address: 0, hex: "00".repeat(384 * 256) }],
    },
  // Movement plane: omit explicit spans so prepare synthesizes coverage from
  // terrain (explicit zero spans only cover the synthetic-coordinate window;
  // real-graph city coordinates need the synthesized plane).
  });
  const sc = result.scenario;
  assert.ok(scenarioNativeRoadContext(sc), "replay scenario must bind v2");
  const app = {
    scenario: sc,
    scenarioIdx: 0,
    world,
    content,
    originalRng: new OriginalBattleRng({ ch: 0, cl: 0, dh: 1 }),
    clock: { year: 190, month: 1, day: 1 },
    view: null,
    battleView: null,
    engageTransition: null,
    hud: { flashEvent() {}, resolveAdvice() {} },
  };
  const bar = new GameBar(app);
  if (bar._assets) bar._assets.catch(() => {});
  return { sc, app, bar };
}

// One full strategic day: every city governed once (main.js order), all 128
// legion slots pumped per city tick. runFactionTick stays false (main.js
// production drive); no date advance, so no weather/month-end writes.
function tickDay(app) {
  for (let cityIndex = 0; cityIndex < 192; cityIndex++) {
    const result = aiTick(app, { cityIndex, runFactionTick: false });
    assert.ok(
      result === "returned" || result === "pending",
      `day pump must stay failure-free (got ${result})`,
    );
    assert.equal(app._strategicBattleFailure, undefined);
  }
}

function atCity(record, targetCity) {
  return record.x === targetCity.x && record.y === targetCity.y;
}

// Arrival takes two real forms: garrisoned-in-place (healthy arrivals stay
// in sc.legions at the capital) or absorbed into the reserve pool
// (commandState 9 replenishment removes the record). Track both.
function trackArrivals(sc, capital, arrivals, day) {
  const present = new Set(sc.legions.map((record) => record.slot));
  for (const record of sc.legions) {
    if (
      !arrivals.some((entry) => entry.slot === record.slot) &&
      atCity(record, capital)
    )
      arrivals.push({ slot: record.slot, day, name: record.leader });
  }
  return present;
}

// Replay A: order three differently-stated legions home mid-war.
async function replayReturnToCapital(gold) {
  const { sc, app, bar } = await warScenario(gold);
  const c0 = sc.cities[HOME_NODE];
  const [mid] = sc.legions;
  const diplomacyBefore = structuredClone(sc.diplomacy);
  // L1 first marches toward the enemy (real order), then is recalled mid-road.
  assert.equal(bar.assignMarchOrder(mid, sc.cities[ENEMY_NODE], false), true);
  for (let day = 0; day < 6; day++) tickDay(app);
  assert.ok(!atCity(mid, c0), "L1 must still be away from the capital");
  // All three ordered home through the player order entry (7FDB/7FB4).
  for (const record of sc.legions)
    assert.equal(bar.assignMarchOrder(record, c0, false), true);
  const arrivals = [];
  const known = new Map(sc.legions.map((record) => [record.slot, record.leader]));
  for (let day = 0; day < 900; day++) {
    tickDay(app);
    const present = trackArrivals(sc, c0, arrivals, day);
    for (const [slot, name] of known)
      if (
        !present.has(slot) &&
        !arrivals.some((entry) => entry.slot === slot)
      )
        arrivals.push({ slot, day, name, absorbed: true });
    if (arrivals.length === 3) break;
  }
  assert.equal(arrivals.length, 3, "all three legions reach the capital");
  assert.deepEqual(sc.diplomacy, diplomacyBefore, "war relations constant");
  return arrivals.map((entry) => entry.slot);
}

test("replay A: mid-war return to capital", async () => {
  const richOrder = await replayReturnToCapital(100000);
  const leanOrder = await replayReturnToCapital(100);
  assert.deepEqual(
    leanOrder,
    richOrder,
    "fiscal variant keeps the same arrival order",
  );
});

test("replay B: abandon city", async () => {
  // Replay B: the sole garrison abandons its city through the real entry.
  const { sc, app, bar } = await warScenario(100000);
  sc.legions = sc.legions.slice(0, 1);
  sc.factions[0].n_legions = 1;
  const [c0, c1] = [sc.cities[HOME_NODE], sc.cities[SECOND_NODE]];
  const [guard] = sc.legions;
  guard.target = c1;
  guard.targetCity = c1.idx;
  const general = sc.generals[0];
  assert.equal(bar.assignMarchOrder(guard, c0, false), true);
  let arrived = -1;
  for (let day = 0; day < 600; day++) {
    tickDay(app);
    if (atCity(guard, c0)) {
      arrived = day;
      break;
    }
  }
  assert.ok(arrived >= 0, "garrison reaches the capital after abandoning");
  const guardAfter = sc.legions.find((record) => record.slot === guard.slot);
  // Abandoning is not losing: owner, generals and war state are untouched.
  assert.equal(c1.faction, 0);
  assert.equal(general.status, 1);
  assert.equal(general.faction, 0);
  assert.ok(guardAfter && atCity(guardAfter, c0));
  // Native diplomacy rows are 24-wide; the replay pins the declared pair.
  assert.deepEqual(sc.diplomacy[0].slice(0, 2), [0, 0]);
  assert.deepEqual(sc.diplomacy[1].slice(0, 2), [0, 0]);
});
console.log("c15 upstream replays: native fixtures via prepareScenario fresh v2 (P70 G8-nREPLAY)");
