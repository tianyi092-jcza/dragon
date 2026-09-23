// G8-nCONTACT: pre-center siege timing native walk lock (P73).
// KI 2880 fires at the LAST ROAD POINT with the position held: the city
// point is not committed and the legion does not teleport to the center.
// The old v1 siege walk (moved-loop to contact via stepTo) is dropped with
// the deleted arm; establishment mechanics are unit-locked in the native
// pointer suites (siege contact + cityIdx, 2831/2880 deadline rules), and
// the countdown-progression rule keeps its plant lock in
// verify_engagement_state.mjs. This file locks the walk: a real order at a
// hostile city marches natively, siege contact establishes off-center with
// countdown 12, and the countdown progresses with the position still held.
// Battle resolution past 2880 expiry belongs to the C10/C11 domain and is
// deliberately out of scope here. No SAVE.DAT, no profile.
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
const ENEMY_NODE = graph.nodes.at(-1).id;

function template() {
  const nodes = graph.nodes;
  return {
    player_faction: 0,
    generals: [
      {
        idx: 0,
        name: "攻城將",
        faction: 0,
        active: true,
        status: 1,
        ability: { force: 80, lead: 70, field: 4, siege: 4, naval: 0 },
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
    // At war with the enemy (0 < 0x80); 42AB only fires at >= 0x80, so the
    // final edge runs to contact instead of rerouting (cf. nBLOCKER).
    diplomacy: [
      [0, 0],
      [0, 0],
    ],
  };
}

function paintedTerrainHex() {
  const bytes = new Uint8Array(384 * 256);
  for (const edge of graph.edges) {
    for (const point of [edge.points[0], edge.points.at(-1)]) {
      if (point) bytes[point.y * 384 + point.x] = 0xd0;
    }
  }
  return Buffer.from(bytes).toString("hex");
}

async function siegeScenario() {
  const raw = createNewGameScenario(template(), 0);
  initializeNativeLegionSlotsFromZeroChapter(raw);
  const at = graph.nodes[SECOND_NODE];
  raw.legions = [
    {
      slot: 0,
      generalIdx: 0,
      leader: "攻城將",
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
  // Explicit runtime input (no pending fate display), same as the sibling
  // native suites; createNewGameScenario never inherits it.
  raw.nativeFateDisplayFlags = 0;
  raw.weatherCloudBounds = { minX: -16, maxX: 400, minY: -16, maxY: 400 };
  raw.weatherClouds = Array.from({ length: 16 }, () => ({ status: 0 }));
  raw.disasterMapObjects = Array.from({ length: 16 }, () => ({ status: 0 }));
  const content = createContentCatalog(
    {
      schemaVersion: 1,
      rules: "ki-1995",
      id: "siege-march",
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
    // Proven data shape (march §740: MMAP×E717 cross-scan): all 254
    // edges' first/last points are 0xCE..0xDD boundary tiles. Paint the
    // representative in-range value there, zeros elsewhere; the 274C tile
    // gate only range-checks, so contact timing is shape-faithful.
    terrainMemory: {
      version: 1,
      spans: [{ address: 0, hex: paintedTerrainHex() }],
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

function tickCity(app, cityIndex, label) {
  const result = aiTick(app, { cityIndex, runFactionTick: false });
  assert.ok(
    result === "returned" || result === "pending",
    `${label} pump must stay failure-free (got ${result})`,
  );
  assert.equal(app._strategicBattleFailure, undefined);
}

test("siege contact establishes at the last road point", async () => {
  const { sc, app, bar } = await siegeScenario();
  const [legion] = sc.legions;
  const enemy = sc.cities[ENEMY_NODE];
  assert.equal(bar.assignMarchOrder(legion, enemy, false), true);
  // Native cadence: the slot acts on every city tick, so a 12-countdown
  // lives only ~12 actions. Drive city-tick by city-tick and catch the
  // first contact transition; a whole-day stride would sail past expiry
  // (2880 entry needs battle machinery, C10/C11 domain) before observing.
  let transition = null;
  for (let day = 0; day < 1200 && !transition; day++) {
    for (let cityIndex = 0; cityIndex < 192 && !transition; cityIndex++) {
      const before = legion._engagement?.kind ?? null;
      tickCity(app, cityIndex, `march day ${day} city ${cityIndex}`);
      const after = legion._engagement?.kind ?? null;
      if (!before && after === "siege") {
        transition = {
          day,
          cityIndex,
          x: legion.x,
          y: legion.y,
          countdown: legion._engagement.countdown,
        };
      }
    }
  }
  assert.ok(transition, "siege contact establishes on the march");
  // Pre-center timing: contact holds off-center — the city point is not
  // committed and the legion never teleports in. The establishing action
  // writes 12 and the same-action 264A tail already decrements, so the
  // first observable count is 11 (observed transition), not a stale 12.
  assert.notDeepEqual(
    { x: transition.x, y: transition.y },
    { x: enemy.x, y: enemy.y },
    "contact holds at the last road point, not the city center",
  );
  assert.equal(transition.countdown, 11);
  assert.equal(
    legion._engagement.target?.cityIdx,
    ENEMY_NODE,
    "contact names the hostile city",
  );
  const held = { x: transition.x, y: transition.y };
  const firstCount = transition.countdown;
  assert.ok(firstCount > 1, "contact observed before expiry");
  for (let step = 0; step < 3; step++) {
    tickCity(app, step, `hold ${step}`);
    assert.deepEqual(
      { x: legion.x, y: legion.y },
      held,
      "besieging legion holds its road point",
    );
  }
  assert.ok(
    legion._engagement.countdown < firstCount,
    "siege countdown progresses off-center",
  );
  assert.deepEqual(sc.diplomacy[0].slice(0, 2), [0, 0]);
  assert.deepEqual(sc.diplomacy[1].slice(0, 2), [0, 0]);
});
console.log("pre-center siege timing: native walk lock (P73 G8-nCONTACT)");
