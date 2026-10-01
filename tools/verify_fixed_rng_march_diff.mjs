import { format } from "node:util";
const tlog = (...args) => process.stdout.write(`${format(...args)}
`);
// Fixed-RNG route/march/engagement determinism diff (M-04 deep cover, second round).
// Characterization of WEB determinism only: same fixed original-RNG clock +
// same fixture must produce byte-identical route/march/battle traces across
// two fresh runs. This does NOT certify KI.EXE equivalence (no original-run
// diff is claimed here). No SAVE.DAT, no profile, no file writes; stdout only.
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
assert.equal(graph.version, 2, "march world must be the v2 road asset");

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
    if (String(url) === urls.roadGraph)
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

const HOME_NODE = 0;
const START_NODE = 1;
const FAR_NODE = 150;
const ENEMY_NODE = graph.nodes.at(-1).id;
assert.ok(
  FAR_NODE !== ENEMY_NODE && FAR_NODE > START_NODE,
  "far target must be a distinct player-owned city",
);

// Fixed original-RNG clock (CH/CL/DH bytes); both runs share it.
const FIXED_CLOCK = { ch: 0, cl: 0, dh: 1 };

function template() {
  const nodes = graph.nodes;
  return {
    player_faction: 0,
    generals: [
      {
        idx: 0,
        name: "定數將",
        faction: 0,
        active: true,
        status: 1,
        ability: { force: 80 },
      },
    ],
    legions: [],
    factions: [
      {
        idx: 0,
        capital: HOME_NODE,
        monarch_idx: 0,
        n_legions: 1,
        n_cities: 191,
        target_faction: 1,
        active: true,
        attr: 0x80,
        money: 100000,
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
    diplomacy: [
      [0, 0],
      [0, 0],
    ],
  };
}

async function freshRun() {
  const raw = createNewGameScenario(template(), 0);
  initializeNativeLegionSlotsFromZeroChapter(raw);
  const at = graph.nodes[START_NODE];
  raw.legions = [
    {
      slot: 0,
      generalIdx: 0,
      leader: "定數將",
      status: 0xc0,
      faction: 0,
      _markerFrame: 4,
      x: at.x,
      y: at.y,
      prevX: at.x,
      prevY: at.y,
      roadEdgeOrNode: START_NODE * 8,
      targetNode: START_NODE,
      targetCity: START_NODE,
      commandState: 1,
      moveDelay: 1,
      movePeriod: 3,
      troops: 800,
      morale: 150,
      units: Array.from({ length: 6 }, () => ({ type: 3, troops: 1000 })),
    },
  ];
  if (raw.nativeLegionSlots) {
    for (const record of raw.legions) {
      // Merge over the zero-initialized slot record so movement-required
      // keys (markerBase/occupancy/alias/counter bytes) exist; wholesale
      // replacement drops them and fails non-player 4300 reads (L8).
      Object.assign(raw.nativeLegionSlots.records[record.slot], record);
    }
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
      id: "fixed-rng-march-diff",
      revision: "1",
      chapters: [{ id: "chapter", legacyScenarioIndex: 0, official: true }],
    },
    { scenarios: [template()] },
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
  });
  const sc = result.scenario;
  assert.ok(scenarioNativeRoadContext(sc), "march scenario must bind v2");
  const app = {
    scenario: sc,
    scenarioIdx: 0,
    world,
    content,
    originalRng: new OriginalBattleRng(FIXED_CLOCK),
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

function traceLegion(legion, rng) {
  return {
    x: legion.x,
    y: legion.y,
    status: legion.status,
    commandState: legion.commandState,
    targetCity: legion.targetCity,
    road: legion.roadEdgeOrNode,
    troops: legion.troops,
    morale: legion.morale,
    rngCalls: rng.calls,
  };
}

// Route + march: normal order to a far player city, until arrival.
async function runMarchTrace() {
  const { sc, app, bar } = await freshRun();
  const [legion] = sc.legions;
  assert.equal(bar.assignMarchOrder(legion, sc.cities[FAR_NODE], false), true);
  const trace = [traceLegion(legion, app.originalRng)];
  const edges = [];
  let arrivedDay = -1;
  for (let day = 1; day <= 900; day++) {
    tickDay(app);
    const point = traceLegion(legion, app.originalRng);
    trace.push(point);
    if (edges.at(-1) !== point.road) edges.push(point.road);
    if (legion.x === sc.cities[FAR_NODE].x && legion.y === sc.cities[FAR_NODE].y) {
      arrivedDay = day;
      break;
    }
  }
  assert.ok(arrivedDay > 0, "march must arrive within 900 days");
  return { trace, edges, arrivedDay, rngCalls: app.originalRng.calls };
}

// Engagement (player attacker): delegated order at the enemy capital.
// The rules deterministically route 47BB -> 2708 march -> 28F4 arrival fate
// -> 291A -> 2977, which stops headless on the known TALK31 UI boundary
// (player is the reluctant side; fail-closed, prefix committed). Both runs
// must produce the identical trace AND the identical terminal stop.
async function runPlayerEngageTrace() {
  const { sc, app, bar } = await freshRun();
  const [legion] = sc.legions;
  assert.equal(
    bar.assignMarchOrder(legion, sc.cities[ENEMY_NODE], true),
    true,
  );
  const trace = [traceLegion(legion, app.originalRng)];
  let stop = null;
  let firstContactDay = -1;
  for (let day = 1; day <= 1500 && !stop; day++) {
    for (let cityIndex = 0; cityIndex < 192; cityIndex++) {
      const result = aiTick(app, { cityIndex, runFactionTick: false });
      if (result !== "returned" && result !== "pending") {
        const failure = app._strategicBattleFailure?.error;
        stop = {
          day,
          city: cityIndex,
          message: String(failure?.message ?? failure),
        };
        break;
      }
      assert.equal(app._strategicBattleFailure, undefined);
    }
    if (stop) break;
    const point = traceLegion(legion, app.originalRng);
    trace.push(point);
    if (
      firstContactDay < 0 &&
      (point.status !== 0xc0 || point.commandState !== 0)
    ) {
      firstContactDay = day;
    }
    if (
      legion.x === sc.cities[ENEMY_NODE].x &&
      legion.y === sc.cities[ENEMY_NODE].y
    )
      break;
    if (point.commandState >= 8) break;
  }
  return { trace, stop, firstContactDay, rngCalls: app.originalRng.calls };
}

const AI_HOME = 2;
const AI_SECOND = 190;

// AI-vs-AI: neither side is the player, so 2977/29C3 fate messages stay
// silent and the headless pump can run through contact, 5130, 474A, the
// 4CF3 ownership change (8A1E write), and settling.
function aiTemplate() {
  const nodes = graph.nodes;
  const ownerOf = (id) =>
    id === AI_HOME ? 1 : id === AI_SECOND || id === ENEMY_NODE ? 2 : 0;
  return {
    player_faction: 0,
    generals: [
      {
        idx: 0,
        name: "旁觀君",
        faction: 0,
        active: true,
        status: 1,
        ability: { force: 80 },
      },
      {
        idx: 1,
        name: "進攻將",
        faction: 1,
        active: true,
        status: 1,
        ability: { force: 80 },
      },
      {
        idx: 2,
        name: "守城將",
        faction: 2,
        active: true,
        status: 1,
        ability: { force: 70 },
      },
    ],
    legions: [],
    factions: [
      {
        idx: 0,
        capital: HOME_NODE,
        monarch_idx: 0,
        n_legions: 0,
        n_cities: 189,
        target_faction: 1,
        active: true,
        attr: 0x80,
        money: 100000,
        legion_morale_cap: 200,
        strategic_city_primary: null,
        strategic_city_secondary: null,
      },
      {
        idx: 1,
        capital: AI_HOME,
        monarch_idx: 1,
        n_legions: 1,
        n_cities: 1,
        target_faction: 2,
        active: true,
        attr: 0x80,
        money: 100000,
        legion_morale_cap: 200,
        strategic_city_primary: null,
        strategic_city_secondary: null,
      },
      {
        idx: 2,
        capital: ENEMY_NODE,
        monarch_idx: 2,
        n_legions: 0,
        n_cities: 2,
        target_faction: 1,
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
      faction: ownerOf(node.id),
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
      _strategicLastFaction: ownerOf(node.id),
    })),
    diplomacy: [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ],
  };
}

async function freshAiRun() {
  const raw = createNewGameScenario(aiTemplate(), 0);
  initializeNativeLegionSlotsFromZeroChapter(raw);
  const at = graph.nodes[AI_HOME];
  raw.legions = [
    {
      slot: 0,
      generalIdx: 1,
      leader: "進攻將",
      status: 0xc0,
      faction: 1,
      _markerFrame: 4,
      x: at.x,
      y: at.y,
      prevX: at.x,
      prevY: at.y,
      roadEdgeOrNode: AI_HOME * 8,
      targetNode: AI_HOME,
      targetCity: AI_HOME,
      commandState: 1,
      moveDelay: 1,
      movePeriod: 3,
      troops: 800,
      morale: 150,
      units: Array.from({ length: 6 }, () => ({ type: 3, troops: 1000 })),
    },
  ];
  if (raw.nativeLegionSlots) {
    for (const record of raw.legions) {
      // Merge over the zero-initialized slot record so movement-required
      // keys (markerBase/occupancy/alias/counter bytes) exist; wholesale
      // replacement drops them and fails non-player 4300 reads (L8).
      Object.assign(raw.nativeLegionSlots.records[record.slot], record);
    }
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
      id: "fixed-rng-ai-engage",
      revision: "1",
      chapters: [{ id: "chapter", legacyScenarioIndex: 0, official: true }],
    },
    { scenarios: [aiTemplate()] },
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
  });
  const sc = result.scenario;
  assert.ok(scenarioNativeRoadContext(sc), "march scenario must bind v2");
  const app = {
    scenario: sc,
    scenarioIdx: 0,
    world,
    content,
    originalRng: new OriginalBattleRng(FIXED_CLOCK),
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

async function runAiEngageTrace() {
  const { sc, app, bar } = await freshAiRun();
  const [legion] = sc.legions;
  assert.equal(
    bar.assignMarchOrder(legion, sc.cities[ENEMY_NODE], true),
    true,
  );
  const trace = [traceLegion(legion, app.originalRng)];
  let stop = null;
  let firstContactDay = -1;
  let captureDay = -1;
  for (let day = 1; day <= 1500 && !stop; day++) {
    for (let cityIndex = 0; cityIndex < 192; cityIndex++) {
      const result = aiTick(app, { cityIndex, runFactionTick: false });
      if (result !== "returned" && result !== "pending") {
        const failure = app._strategicBattleFailure?.error;
        stop = {
          day,
          city: cityIndex,
          message: String(failure?.message ?? failure),
        };
        break;
      }
      assert.equal(app._strategicBattleFailure, undefined);
    }
    if (stop) break;
    const point = traceLegion(legion, app.originalRng);
    trace.push(point);
    if (
      firstContactDay < 0 &&
      (point.status !== 0xc0 || point.commandState !== 0)
    ) {
      firstContactDay = day;
    }
    if (captureDay < 0 && sc.cities[ENEMY_NODE].faction === 1)
      captureDay = day;
    if (
      captureDay > 0 &&
      (point.commandState === 8 || point.commandState === 1)
    )
      break;
  }
  const last = trace.at(-1);
  const general = sc.generals.find((entry) => entry.idx === 1);
  const leftMarchDay = trace.findIndex(
    (point) => (point.status & 0xc0) !== 0xc0 || point.commandState !== 0,
  );
  return {
    trace,
    stop,
    firstContactDay,
    captureDay,
    leftMarchDay,
    endStatus: legion.status,
    endCommand: legion.commandState,
    endTroops: legion.troops,
    endMorale: legion.morale,
    endX: last.x,
    endY: last.y,
    generalStatus: general?.status,
    generalFaction: general?.faction,
    generalOldFaction: general?.["+0x1d"] ?? general?.oldFaction,
    city190Faction: sc.cities[AI_SECOND].faction,
    city191Troops: sc.cities[ENEMY_NODE].troops,
    attackerUnits: legion.units.map((unit) => unit.troops).join(","),
    enemyCityFaction: sc.cities[ENEMY_NODE].faction,
    rngCalls: app.originalRng.calls,
  };
}

test("fixed RNG: AI-vs-AI engagement trace is byte-identical", async () => {
  const first = await runAiEngageTrace();
  const second = await runAiEngageTrace();
  assert.deepEqual(second.trace, first.trace);
  assert.deepEqual(second.stop, first.stop);
  assert.equal(first.stop, null, "AI-vs-AI must run headless end to end");
  tlog(
    `ai-engage identical: left-march day ${first.leftMarchDay}, ` +
      `capture day ${first.captureDay}, end status ${first.endStatus} ` +
      `command ${first.endCommand} troops ${first.endTroops} ` +
      `morale ${first.endMorale} at ${first.endX},${first.endY} ` +
      `units [${first.attackerUnits}] general status ${first.generalStatus} ` +
      `faction ${first.generalFaction} city190 faction ${first.city190Faction} ` +
      `city191 faction ${first.enemyCityFaction} troops ${first.city191Troops}, ` +
      `${first.trace.length} ticks, rng calls ${first.rngCalls}`,
  );
});

test("fixed RNG: route+march trace is byte-identical across runs", async () => {
  const first = await runMarchTrace();
  const second = await runMarchTrace();
  assert.deepEqual(second.trace, first.trace);
  assert.deepEqual(second.edges, first.edges);
  tlog(
    `march identical: arrived day ${first.arrivedDay}, ` +
      `${first.edges.length} road contexts, ${first.trace.length} ticks, ` +
      `rng calls ${first.rngCalls}`,
  );
});

test("fixed RNG: player engagement stops identically at the UI boundary", async () => {
  const first = await runPlayerEngageTrace();
  const second = await runPlayerEngageTrace();
  assert.deepEqual(second.trace, first.trace);
  assert.deepEqual(second.stop, first.stop);
  assert.ok(first.stop, "player attack must reach the fate UI boundary");
  assert.match(first.stop.message, /TALK31/, "known fate message gate");
  tlog(
    `engage identical through day ${first.stop.day} city ${first.stop.city}: ` +
      `${first.trace.length} ticks, ${first.stop.message}, ` +
      `rng calls ${first.rngCalls} (UI stop is fail-closed, not a KI claim)`,
  );
});
tlog("fixed-rng-march-diff: web determinism only, no KI.EXE claim");
