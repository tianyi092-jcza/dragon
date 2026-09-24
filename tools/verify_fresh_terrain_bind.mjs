// P89 root-cause regression: fresh new games must bind terrain memory.
// Live-verified crash (real title->new-game flow, speed 4): the first legion
// road step threw "Uncovered native terrain memory" from
// originalroadmovement candidate -> context.readTerrainByte into the frame
// loop (strategic failure dialog + clock hold). Production main.js never
// passed terrainMemory, so fresh owners had terrain=null; fixtures masked it
// with explicit spans. Fresh v2 now synthesizes the certified map tile plane
// (world.terrain bytes) as explicit known spans. No SAVE.DAT, no profile.
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
  readSavedAssembly,
} from "../web/src/game/scenarioassembly.js";
import {
  snapshotState,
  restoreSnapshotState,
} from "../web/src/game/savegame.js";
import { initializeNativeLegionSlotsFromZeroChapter } from "../web/src/game/nativelegions.js";
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
    // Distinctive resource byte proves synthesis reads world.terrain.
    const fill = String(url) === urls.terrain ? 0xba : 0x00;
    return {
      ok: true,
      arrayBuffer: async () => new Uint8Array(384 * 256).fill(fill).buffer,
      json: async () => ({}),
    };
  };
}

const ENEMY_NODE = graph.nodes.at(-1).id;
const ENDPOINT = graph.edges[0].points[0];

function template() {
  return {
    player_faction: 0,
    generals: [],
    legions: [],
    factions: [0, 1].map((idx) => ({
      idx,
      capital: idx === 0 ? 0 : ENEMY_NODE,
      n_legions: 0,
      n_cities: idx === 0 ? 191 : 1,
      active: true,
      attr: 0x80,
      money: 100000,
      legion_morale_cap: 200,
    })),
    cities: graph.nodes.map((node) => ({
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
      _aiCooldown: 0,
    })),
    diplomacy: [
      [0, 0],
      [0, 0],
    ],
  };
}

function json(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (cause) {
    throw new Error("Fixture failed the actual JSON round trip", { cause });
  }
}

test("fresh without terrainMemory binds the certified tile plane", async () => {
  const content = createContentCatalog(
    {
      schemaVersion: 1,
      rules: "ki-1995",
      id: "fresh-terrain-test",
      revision: "1",
      chapters: [{ id: "chapter", legacyScenarioIndex: 0, official: true }],
    },
    { scenarios: [template()] },
  );
  const raw = createNewGameScenario(template(), 0);
  attachSyntheticNativeFactionSource(raw);
  initializeNativeLegionSlotsFromZeroChapter(raw);
  raw.nativeFateDisplayFlags = 0;
  raw.weatherClouds = Array.from({ length: 16 }, () => ({ status: 0 }));
  raw.disasterMapObjects = Array.from({ length: 16 }, () => ({ status: 0 }));
  const args = { raw, idx: 0, content, world, mode: "fresh" };
  const prepared = await prepareScenario(args);
  const sc = prepared.scenario;
  const context = scenarioNativeRoadContext(sc);
  assert.ok(context.terrain, "fresh v2 must own terrain memory");
  // The exact crashed call: movement candidate reads the road-point tile.
  assert.equal(
    context.readTerrainByte(ENDPOINT.x, ENDPOINT.y),
    0xba,
    "endpoint tile comes from world.terrain bytes",
  );
  assert.equal(context.readTerrainByte(0, 0), 0xba);
  const app = {
    scenario: sc,
    scenarioIdx: 0,
    content,
    world,
    clock: { year: 190, month: 1, day: 1 },
    originalRng: new OriginalBattleRng({ ch: 0, cl: 0, dh: 1 }),
  };
  const saved = json(snapshotState(app, 0, "terrain"));
  assert.equal(
    Object.hasOwn(saved.webMeta, "terrainMemory"),
    true,
    "fresh saves carry the bound plane",
  );
  const restored = await prepareScenario({
    ...args,
    mode: "restore",
    raw: restoreSnapshotState(saved),
    ...readSavedAssembly(saved),
  });
  const rcontext = scenarioNativeRoadContext(restored.scenario);
  assert.equal(rcontext.readTerrainByte(ENDPOINT.x, ENDPOINT.y), 0xba);
  assert.equal(rcontext.readTerrainByte(0, 0), 0xba);
});
console.log("fresh terrain bind: synthesis from world.terrain, no-throw reads");
