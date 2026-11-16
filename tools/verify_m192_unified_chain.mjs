// M192 milestone: the real built-in 192-city map walks the unified chain —
// compileGameSource index matches the real road nodes, fresh assembly owns
// and caches every slot, indexed search runs on the real graph, and a JSON
// snapshot/restore roundtrip preserves the table. Real game-source.json +
// roads.json (BUILTIN_RELEASE revision); no saves, profiles or network.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { BUILTIN_RELEASE } from "../web/src/content/builtinrelease.generated.js";
import { compileGameSource } from "../web/src/content/authoring/trialcompile.js";
import { cityNodeBoundOf, roadNodeToCitySlot } from "../web/src/game/navigation/originalroadstate.js";
import { searchOriginalRoadMemory } from "../web/src/game/navigation/originalroadsearch.js";
import { attachSyntheticNativeFactionSource } from "./native_faction_fixture.mjs";
import { createContentCatalog } from "../web/src/content/catalog.js";
import { createWorldResources } from "../web/src/game/worldresources.js";
import { createNewGameScenario } from "../web/src/game/world.js";
import { snapshotState, restoreSnapshotState } from "../web/src/game/savegame.js";
import {
  prepareScenario,
  readSavedAssembly,
  scenarioNativeRoadContext,
} from "../web/src/game/scenarioassembly.js";
import {
  initializeNativeLegionSlotsFromZeroChapter,
  rebindNativeLegionViews,
} from "../web/src/game/nativelegions.js";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const REV = BUILTIN_RELEASE.resources.world.revision;
const prefix = `../web/content/builtin/compiled/${REV}/`;
const source = JSON.parse(readFileSync(new URL(prefix + "game-source.json", import.meta.url)));
const graph = JSON.parse(readFileSync(new URL(prefix + "roads.json", import.meta.url)));

function mockFetch(world) {
  const urls = world.definition.assets;
  const allowed = new Set([urls.terrain, urls.roadCost, urls.roadOffset, urls.roadGraph]);
  const old = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert(allowed.has(url), `Unexpected asset ${url}`);
    return {
      ok: true,
      json: async () => (url === urls.roadGraph ? graph : {}),
      arrayBuffer: async () => new Uint8Array(384 * 256).fill(0xba).buffer,
    };
  };
  return () => {
    globalThis.fetch = old;
  };
}

async function prepareReal() {
  // Real node coordinates are the assembly template (slot identity + center
  // match); the game-source cross-check below proves they are the real cities.
  const template = {
    player_faction: 0,
    generals: [],
    legions: [],
    factions: [
      {
        idx: 0, capital: 0, n_legions: 0, active: true, attr: 0x80,
        money: 1000, legion_morale_cap: 200, march_marker_style: 0,
        strategic_city_primary: null, strategic_city_secondary: null, n_cities: 191,
      },
      {
        idx: 1, capital: 191, n_legions: 0, active: true, attr: 0x80,
        money: 1000, legion_morale_cap: 200, march_marker_style: 0,
        strategic_city_primary: null, strategic_city_secondary: null, n_cities: 1,
      },
    ],
    cities: graph.nodes.map(({ id, x, y }) => ({
      idx: id, x, y, faction: id === 191 ? 1 : 0, attr: 0x80,
      governor: null, _aiCooldown: 0, _strategicLastFaction: id === 191 ? 1 : 0,
    })),
    diplomacy: Array.from({ length: 24 }, () => Array(24).fill(0)),
    weatherClouds: Array.from({ length: 16 }, () => ({})),
    disasterMapObjects: Array.from({ length: 16 }, () => ({ status: 0 })),
  };
  template.cities[191].strategicBorderCount = 0;
  template.cities[191].strategicNeighbours = [255, 255, 255, 255];
  template.cities[191].disaster_event = 0;
  const content = createContentCatalog(
    {
      schemaVersion: 1, rules: "ki-1995", id: "m192-test", revision: "1",
      chapters: [{ id: "chapter", legacyScenarioIndex: 0, official: true }],
    },
    { scenarios: [template] },
  );
  const raw = createNewGameScenario(template);
  initializeNativeLegionSlotsFromZeroChapter(raw);
  attachSyntheticNativeFactionSource(raw);
  raw.nativeCityRecordRaw = Array.from({ length: 192 }, () => Buffer.alloc(32).toString("hex"));
  if (raw.nativeLegionSlots) {
    for (const legion of raw.legions) raw.nativeLegionSlots.records[legion.slot] = legion;
    rebindNativeLegionViews(raw);
  }
  const world = createWorldResources();
  const args = {
    raw, idx: 0, content, world, mode: "fresh",
    terrainMemory: { version: 1, spans: [{ address: 0, hex: "ba".repeat(384 * 256) }] },
    movementMemory: { version: 1, spans: [{ address: 3840, hex: "00".repeat(768) }] },
  };
  const unmock = mockFetch(world);
  try {
    return { ...(await prepareScenario(args)), args, world, content };
  } finally {
    unmock();
  }
}

test("M192: compile index matches the real 192 road nodes slot by slot", () => {
  assert.equal(graph.version, 2);
  assert.equal(graph.nodes.length, 192);
  const compiled = compileGameSource(source, sha);
  assert.equal(compiled.cityIndex.length, 192);
  const byCoord = new Map(Object.values(source.cities).map((c) => [`${c.x},${c.y}`, c]));
  for (const entry of compiled.cityIndex) {
    assert.equal(entry.slot, graph.nodes[entry.slot].id);
    assert.equal(entry.x, graph.nodes[entry.slot].x);
    assert.equal(entry.y, graph.nodes[entry.slot].y);
    assert.ok(byCoord.has(`${entry.x},${entry.y}`), `node ${entry.slot} matches a real city`);
  }
});

test("M192: real-map fresh assembly owns, caches and searches every slot", async () => {
  const { scenario } = await prepareReal();
  assert.equal(scenario.cities.length, 192);
  const context = scenarioNativeRoadContext(scenario);
  assert.equal(context.memory.roadLayout.version, 2);
  assert.equal(context.readCityOwner(0, "m192"), 0);
  assert.equal(context.readCityOwner(191, "m192"), 1);
  assert.equal(context.cityCache.readByte(191), 0);
  const edge = graph.edges[0];
  const result = searchOriginalRoadMemory({
    start: edge.source * 8,
    stopB: edge.target * 8,
    stopC: edge.target * 8,
    owner: 0,
    readGraphByte: context.memory.readByte,
    writeGraphByte: context.memory.writeByte,
    readStateByte: () => {
      throw new Error("legacy address read must not fire");
    },
    readCityOwnerAtNode: (node, at) =>
      context.readCityOwner(roadNodeToCitySlot(scenario, node, at), at),
    cityNodeBound: cityNodeBoundOf(scenario),
  });
  assert.equal(result.cf, false);
  assert.equal(result.reason, "found");
});

test("M192: JSON snapshot/restore roundtrip preserves the real 192-city table", async () => {
  const { scenario, args, world, content } = await prepareReal();
  const app = { scenario, scenarioIdx: 0, world, content, clock: { year: 190, month: 1, day: 1 } };
  const saved = JSON.parse(JSON.stringify(snapshotState(app, 0, "m192")));
  const unmock = mockFetch(world);
  let result;
  try {
    result = await prepareScenario({
      ...args, mode: "restore", raw: restoreSnapshotState(saved), ...readSavedAssembly(saved),
    });
  } finally {
    unmock();
  }
  assert.equal(result.scenario.cities.length, 192);
  assert.equal(result.scenario.cities[191].idx, 191);
  const context = scenarioNativeRoadContext(result.scenario);
  assert.equal(context.readCityOwner(191, "m192-restore"), 1);
  assert.equal(context.cityCache.readByte(191), 0);
});
