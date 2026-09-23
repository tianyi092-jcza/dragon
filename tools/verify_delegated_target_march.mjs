// G8-nDELEG: delegated-target-first native walk lock (P71).
// Old v1 regression (kept described in verify_march_navigation.mjs): after
// the player chose 委任， the order entry must execute the chosen target
// first; the old Web logic fell into the AI branch and nulled the target
// because it was an owned city, so the legion never left.
// Native substrate: assignMarchOrder writes target/targetCity/commandState 0
// + bit1; interior player cities never trigger the 4155 sortie (work[0] is
// 255 with no hostile-border candidate, early return), so the player order
// stands and the slot pump walks it home. The 4155 overwrite path itself is
// engine-authentic with no player guard (KI 4179..4187 closed window, see
// re-notes-entity-fields 4155 section) and is NOT re-tested here.
// Fixture: prepareScenario fresh v2 (same recipe as the c15 upstream
// replays); one garrisoned player legion ordered delegated to a far
// player-owned city; asserts target preserved across ticks, departure, and
// arrival, failure-free. No SAVE.DAT, no profile.
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
import { isLegionDelegated } from "../web/src/game/legionmode.js";
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

const HOME_NODE = 0;
const SECOND_NODE = 1;
const FAR_NODE = 150;
const ENEMY_NODE = graph.nodes.at(-1).id;
assert.ok(
  FAR_NODE !== ENEMY_NODE && FAR_NODE > SECOND_NODE,
  "far target must be a distinct player-owned city",
);

function template() {
  const nodes = graph.nodes;
  return {
    player_faction: 0,
    generals: [
      {
        idx: 0,
        name: "委任將",
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

async function delegatedScenario() {
  const raw = createNewGameScenario(template(), 0);
  initializeNativeLegionSlotsFromZeroChapter(raw);
  const at = graph.nodes[SECOND_NODE];
  raw.legions = [
    {
      slot: 0,
      generalIdx: 0,
      leader: "委任將",
      status: 0xc0,
      faction: 0,
      x: at.x,
      y: at.y,
      prevX: at.x,
      prevY: at.y,
      roadEdgeOrNode: SECOND_NODE * 8,
      targetNode: SECOND_NODE,
      targetCity: SECOND_NODE,
      commandState: 1,
      moveDelay: 1,
      movePeriod: 3,
      troops: 800,
      morale: 150,
      units: Array.from({ length: 6 }, () => ({ type: 3, troops: 1000 })),
    },
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
      id: "delegated-march",
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

test("delegated order executes its target first", async () => {
  const { sc, app, bar } = await delegatedScenario();
  const [legion] = sc.legions;
  const home = sc.cities[SECOND_NODE];
  const far = sc.cities[FAR_NODE];
  assert.equal(far.faction, 0, "far target must stay player-owned");
  // Player chooses 委任 through the real order entry (7FDB/7FB4).
  assert.equal(bar.assignMarchOrder(legion, far, true), true);
  assert.ok(isLegionDelegated(legion), "order must set the bit2 authority");
  // First day: the AI branch must not null or steal the player target —
  // the old v1 regression kept the legion garrisoned forever.
  tickDay(app);
  assert.equal(legion.targetCity, FAR_NODE, "player target survives day one");
  assert.ok(legion.target === far, "player target object survives day one");
  // The legion must actually leave: target-first means marching, not waiting.
  let departed = legion.x !== home.x || legion.y !== home.y;
  let arrivedDay = -2;
  for (let day = 1; day < 900 && arrivedDay < 0; day++) {
    tickDay(app);
    assert.equal(
      legion.targetCity,
      FAR_NODE,
      `player target survives day ${day}`,
    );
    if (!departed && (legion.x !== home.x || legion.y !== home.y))
      departed = true;
    if (departed && legion.x === far.x && legion.y === far.y) arrivedDay = day;
  }
  assert.ok(departed, "delegated legion leaves its garrison");
  assert.ok(arrivedDay >= 0, "delegated legion reaches the ordered city");
  assert.deepEqual(sc.diplomacy[0].slice(0, 2), [0, 0]);
  assert.deepEqual(sc.diplomacy[1].slice(0, 2), [0, 0]);
});
console.log("delegated-target-first: native walk lock (P71 G8-nDELEG)");
