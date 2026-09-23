// G8-nBLOCKER: third-party blocker rerouting native walk lock (P72).
// KI 42AB (in-edge, current >= 0x800): when the far endpoint's owner is a
// non-neutral third party with diplomacy >= 0x80, the action rewrites the
// target (0x14) to the NEAR endpoint node instead of arriving — no stride
// reversal, no kept final target (SKILL re-march-engagement §7). The old v1
// ownership-change walks are dropped with the deleted arm; own-city entry
// and siege contact are natively locked elsewhere.
// Fixture: prepareScenario fresh v2 (c15/nDELEG recipe). Target city B is
// third-party-owned (faction 2, diplomacy 0x80 neutral) from the start; the
// player legion is ordered at B through the real entry. Lock: the march
// proceeds, 42AB fires on the final edge, the target is rewritten to the
// near end, and the legion turns back instead of arriving — failure-free,
// war relations constant. No SAVE.DAT, no profile.
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

function template() {
  const nodes = graph.nodes;
  return {
    player_faction: 0,
    generals: [
      {
        idx: 0,
        name: "行軍將",
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
        n_cities: 190,
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
      {
        idx: 2,
        capital: FAR_NODE,
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
      faction:
        // eslint-disable-next-line no-nested-ternary
        node.id === ENEMY_NODE ? 1 : node.id === FAR_NODE ? 2 : 0,
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
      _strategicLastFaction:
        // eslint-disable-next-line no-nested-ternary
        node.id === ENEMY_NODE ? 1 : node.id === FAR_NODE ? 2 : 0,
    })),
    // 0<0x80 reads at war (player-enemy); 0x80 reads neutral third party.
    diplomacy: [
      [0, 0, 0x80],
      [0, 0, 0x80],
      [0x80, 0x80, 0],
    ],
  };
}

async function blockerScenario() {
  const raw = createNewGameScenario(template(), 0);
  initializeNativeLegionSlotsFromZeroChapter(raw);
  const at = graph.nodes[SECOND_NODE];
  raw.legions = [
    {
      slot: 0,
      generalIdx: 0,
      leader: "行軍將",
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
      id: "blocker-march",
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

test("third-party endpoint reroutes to the near end", async () => {
  const { sc, app, bar } = await blockerScenario();
  const [legion] = sc.legions;
  const home = sc.cities[SECOND_NODE];
  const far = sc.cities[FAR_NODE];
  assert.equal(far.faction, 2, "far endpoint must stay third-party");
  assert.equal(bar.assignMarchOrder(legion, far, false), true);
  // The march must proceed (search routes; 42AB only fires in-edge).
  tickDay(app);
  const leftHome = legion.x !== home.x || legion.y !== home.y;
  // 42AB rewrites the target to the near end instead of arriving: observe
  // the rewrite (target leaves the far city), never entering the
  // third-party city.
  let rewrote = legion.targetCity !== FAR_NODE;
  for (let day = 1; day < 400; day++) {
    tickDay(app);
    if (legion.targetCity !== FAR_NODE) rewrote = true;
    assert.ok(
      legion.x !== far.x || legion.y !== far.y,
      `never enters the third-party city (day ${day})`,
    );
  }
  assert.ok(leftHome || rewrote, "march proceeds toward the far city");
  assert.ok(rewrote, "42AB rewrites the target off the third-party city");
  // Authentic end state: the march diverts to the rewritten near-end city
  // and waits there for orders (arrived at target, commandState 0) — it
  // neither enters the third-party city nor marches back to its origin.
  const diverted = sc.cities[legion.targetCity];
  assert.notEqual(diverted.idx, FAR_NODE);
  assert.equal(legion.x, diverted.x);
  assert.equal(legion.y, diverted.y);
  const restX = legion.x,
    restY = legion.y;
  for (let day = 0; day < 50; day++) tickDay(app);
  assert.equal(legion.x, restX, "diverted legion waits instead of leaving");
  assert.equal(legion.y, restY, "diverted legion waits instead of leaving");
  assert.equal(legion.targetCity, diverted.idx);
  assert.deepEqual(sc.diplomacy[0].slice(0, 3), [0, 0, 0x80]);
  assert.deepEqual(sc.diplomacy[2].slice(0, 3), [0x80, 0x80, 0]);
});
console.log("third-party blocker: native 42AB reroute lock (P72 G8-nBLOCKER)");
