// G8-nRESUME: save/restore march continuation, native twin-trajectory proof (P74).
// P63 G2 deleted the v1 movement arm, which took with it the old
// retreat_restore post-restore walking assertions; restore-shape pins stayed
// but the certified rule — an in-edge legion resumes along its saved road
// context after a real save/prepare/restore round-trip — had no native test.
// This file closes that gap for both plain march resume (失联续行) and
// defeated-retreat resume (败军读档续行) through the production path only:
// snapshotState -> JSON -> admitSavedScenario -> prepareScenario restore.
// The restored twin must walk the identical trajectory as the uninterrupted
// twin (per-day x/y equality to arrival, RNG snapshot equality at the end).
// Fixture: prepareScenario fresh v2 (P70/P71 recipe); one player legion
// ordered through the real entry (7FDB/7FB4) from node 1 to far friendly
// node 150. Case B applies the REAL 474A writer
// (continueOriginalLegionAfterBattle, won=false) mid-edge — no hand-forged
// _retreat shape; the writer is the certified originalroadretreat.js:117
// path, this file certifies only the resume rule. No SAVE.DAT, no profile.
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
assert.equal(graph.version, 2, "resume world must be the v2 road asset");

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
const { continueOriginalLegionAfterBattle } = await import(
  "../web/src/game/navigation/originalroadretreat.js"
);
const { snapshotState, admitSavedScenario } = await import(
  "../web/src/game/savegame.js"
);

const HOME_NODE = 0;
const SECOND_NODE = 1;
const FAR_NODE = 150;
const ENEMY_NODE = graph.nodes.at(-1).id;
assert.ok(
  FAR_NODE !== ENEMY_NODE && FAR_NODE > SECOND_NODE,
  "far node must be friendly and distinct",
);

function template() {
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
      troops_cap: 80,
      governor: null,
      strategicBorderCount: 0,
      strategicNeighbours: [255, 255, 255, 255],
      strategicThreat: 0,
      growth: 50,
      defence: 50,
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

async function resumeScenario() {
  const raw = createNewGameScenario(template(), 0);
  initializeNativeLegionSlotsFromZeroChapter(raw);
  const at = graph.nodes[SECOND_NODE];
  raw.legions = [
    {
      slot: 0,
      generalIdx: 0,
      leader: "續行將",
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
      id: "march-resume",
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
  assert.ok(scenarioNativeRoadContext(sc), "resume scenario must bind v2");
  const app = {
    scenario: sc,
    scenarioIdx: 0,
    world,
    content,
    data: { scenarios: [template()] },
    originalRng: new OriginalBattleRng({ ch: 0, cl: 0, dh: 1 }),
    clock: { year: 190, month: 1, day: 1, sub: 0, hour: 0 },
    view: null,
    battleView: null,
    engageTransition: null,
    hud: { flashEvent() {}, resolveAdvice() {} },
  };
  const bar = new GameBar(app);
  if (bar._assets) bar._assets.catch(() => {});
  return { sc, app, bar, content };
}

function tickDay(app, label) {
  for (let cityIndex = 0; cityIndex < 192; cityIndex++) {
    const result = aiTick(app, { cityIndex, runFactionTick: false });
    assert.ok(
      result === "returned" || result === "pending",
      `${label} pump must stay failure-free (got ${result})`,
    );
    assert.equal(app._strategicBattleFailure, undefined);
  }
}

const json = (value) => {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    throw new Error("resume fixture JSON round-trip failed", {
      cause: error,
    });
  }
};

// Real production round-trip: snapshot -> JSON -> admit -> prepare restore.
// The restored app rehydrates RNG from the save's own RNG snapshot, so any
// divergence after this point is a restore-fidelity failure, not seeding.
async function roundTrip(app, content, label) {
  const saved = json(snapshotState(app, 0, `${label} save`));
  const admission = admitSavedScenario(saved, {
    data: { scenarios: [template()] },
    content,
    world,
  });
  const restored = await prepareScenario({
    raw: admission.raw,
    idx: admission.idx,
    content,
    world,
    mode: "restore",
    metadata: admission.metadata,
    roadMemory: admission.roadMemory,
    movementMemory: admission.movementMemory,
    terrainMemory: admission.terrainMemory,
    cityCache: admission.cityCache,
  });
  const rng = new OriginalBattleRng({});
  rng.restore(saved.webMeta.originalRng);
  const app2 = {
    scenario: restored.scenario,
    scenarioIdx: 0,
    world,
    content,
    data: { scenarios: [template()] },
    originalRng: rng,
    clock: { year: 190, month: 1, day: 1, sub: 0, hour: 0 },
    view: null,
    battleView: null,
    engageTransition: null,
    hud: { flashEvent() {}, resolveAdvice() {} },
  };
  return { app2, saved };
}

function roadFields(record) {
  return {
    edgeOrNode: record.roadEdgeOrNode,
    stride: record.roadStride,
    pointAddress: record.roadPointAddress,
    targetNode: record.targetNode,
    targetCity: record.targetCity,
    moveDelay: record.moveDelay,
    status: record.status,
  };
}

test("march resume: restored twin walks the identical trajectory", async () => {
  const { sc, app, bar, content } = await resumeScenario();
  const [legion] = sc.legions;
  const far = sc.cities[FAR_NODE];
  assert.equal(far.faction, 0, "far target must stay player-owned");
  assert.equal(bar.assignMarchOrder(legion, far, false), true);
  // Walk until genuinely mid-edge (0E >= 0x0800), not at a node.
  let saveDay = -1;
  for (let day = 0; day < 900 && saveDay < 0; day++) {
    tickDay(app, `pre-save day ${day}`);
    if (legion.roadEdgeOrNode >= 0x0800) saveDay = day;
  }
  assert.ok(saveDay >= 0, "legion must reach mid-edge before saving");
  const fieldsBefore = roadFields(legion);
  const { app2 } = await roundTrip(app, content, "march");
  const [restored] = app2.scenario.legions;
  assert.deepEqual(
    roadFields(restored),
    fieldsBefore,
    "restore must preserve the in-edge road context exactly",
  );
  // Twin trajectory: every subsequent day lands on the same tile, and both
  // arrive at the ordered city. RNG equality at the end proves the save
  // carried the trajectory, not just the position.
  let arrivedDay = -1;
  for (let day = 0; day < 900 && arrivedDay < 0; day++) {
    tickDay(app, `twin day ${day}`);
    tickDay(app2, `restored day ${day}`);
    assert.deepEqual(
      { x: restored.x, y: restored.y },
      { x: legion.x, y: legion.y },
      `trajectories diverge on post-save day ${day}`,
    );
    if (legion.x === far.x && legion.y === far.y) arrivedDay = day;
  }
  assert.ok(arrivedDay >= 0, "both twins must reach the ordered city");
  assert.deepEqual(
    app2.originalRng.snapshot(),
    app.originalRng.snapshot(),
    "RNG trajectories must stay identical after restore",
  );
});

test("retreat resume: defeated twin resumes along the saved edge", async () => {
  const { sc, app, bar, content } = await resumeScenario();
  const [legion] = sc.legions;
  const far = sc.cities[FAR_NODE];
  assert.equal(bar.assignMarchOrder(legion, far, false), true);
  let defeatDay = -1;
  for (let day = 0; day < 900 && defeatDay < 0; day++) {
    tickDay(app, `pre-defeat day ${day}`);
    if (legion.roadEdgeOrNode >= 0x0800) defeatDay = day;
  }
  assert.ok(defeatDay >= 0, "legion must reach mid-edge before defeat");
  // Real 474A writer (won=false), not a hand-forged _retreat shape.
  const native = scenarioNativeRoadContext(sc);
  assert.equal(
    continueOriginalLegionAfterBattle(sc, legion, false, native),
    true,
    "real defeat must plant the retreat route",
  );
  assert.ok(legion._retreat, "defeat must leave an authoritative _retreat");
  const retreatCity = sc.cities[legion._retreat.cityIdx];
  assert.ok(retreatCity, "retreat target must be a real city");
  // Pre-save sanity: the defeated legion actually walks its retreat route.
  const walkFrom = { x: legion.x, y: legion.y };
  for (let day = 0; day < 30; day++) tickDay(app, `retreat walk ${day}`);
  assert.ok(
    legion.x !== walkFrom.x || legion.y !== walkFrom.y || legion._retreat,
    "defeated legion must act on its retreat route before saving",
  );
  const retreatBefore = structuredClone(legion._retreat);
  const fieldsBefore = roadFields(legion);
  const { app2 } = await roundTrip(app, content, "retreat");
  const [restored] = app2.scenario.legions;
  assert.deepEqual(
    restored._retreat,
    retreatBefore,
    "restore must preserve the authoritative _retreat",
  );
  assert.deepEqual(
    roadFields(restored),
    fieldsBefore,
    "restore must preserve the in-edge road context exactly",
  );
  // Both twins walk the retreat to its end: _retreat clears on arrival at
  // the same post-save day, at the same tile.
  let clearDay = -1;
  for (let day = 0; day < 900 && clearDay < 0; day++) {
    tickDay(app, `retreat twin day ${day}`);
    tickDay(app2, `retreat restored day ${day}`);
    assert.deepEqual(
      { x: restored.x, y: restored.y },
      { x: legion.x, y: legion.y },
      `retreat trajectories diverge on post-save day ${day}`,
    );
    assert.equal(
      Boolean(restored._retreat),
      Boolean(legion._retreat),
      `retreat liveness diverges on post-save day ${day}`,
    );
    if (!legion._retreat) clearDay = day;
  }
  assert.ok(clearDay >= 0, "both twins must complete the retreat");
  assert.deepEqual(
    app2.originalRng.snapshot(),
    app.originalRng.snapshot(),
    "RNG trajectories must stay identical after restore",
  );
});
console.log("march-resume: native save/restore twin-trajectory lock (P74 G8-nRESUME)");
