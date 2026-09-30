import { format } from "node:util";
const tlog = (...args) => process.stdout.write(`${format(...args)}
`);
// A-INIT-2 (bounded): blank-chapter fixed-table inventory with init
// sources, explicit unknowns, and a minimal blank probe through
// prepareScenario. Full blank-chapter authoring (E-04/E-10) stays
// editor-phase work; first-round/month-boundary LIVE validation needs the
// full app shell and is recorded as remainder, not claimed here.
// Pure node, no disk writes, no SAVE.DAT, stdout only.
import assert from "node:assert/strict";
import { attachSyntheticNativeFactionSource } from "./native_faction_fixture.mjs";
import { createContentCatalog } from "../web/src/content/catalog.js";
import { createWorldResources } from "../web/src/game/worldresources.js";
import { createNewGameScenario } from "../web/src/game/world.js";
import { prepareScenario } from "../web/src/game/scenarioassembly.js";

tlog("fixed-table init sources (evidence-pinned):");
tlog("  128x64B legions: official chapters carry 22C0..42C0 all zero (entity §3.15.5); 1A2F rep-stosw zeroes the plane");
tlog("  256x4B events: surveyed region all zero (admission §3.3)");
tlog("  16 disaster slots: surveyed zero; 16 rain-cloud slots status 0x80 (admission §3.3)");
tlog("  F18/F23: stored per faction; 4 known F23 skews preserved (A-INIT-1)");
tlog("  192x32B cities + 127x32B generals: stored chapter bytes");
tlog("  24x24 diplomacy + D08..17 monthly policy: rebuilt from chapter bytes (world.js)");
tlog("  advisor fresh: 1AF8..1B25 exactly-once (A-INIT-1)");
tlog("UNKNOWN: G127/custom-general slot recipe; hidden-faction (>active) init;");
tlog("UNKNOWN: 政策 full-byte semantics; G1F-BOUNDARY reroll timing on blank;");
tlog("UNKNOWN: event-page pointers for an empty queue; D2A initial for <2 factions.");

const realGraph = {
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

// Minimal blank: 192 neutral cities, one empty faction, no generals.
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
  cities: realGraph.nodes.map(({ id, x, y }) => ({
    idx: id,
    x,
    y,
    faction: null,
    governor: null,
    type: 1,
    production: 10,
  })),
  legions: [],
  weatherClouds: Array.from({ length: 16 }, () => ({ status: 0 })),
  disasterMapObjects: Array.from({ length: 16 }, () => ({ status: 0 })),
};

const manifest = {
  schemaVersion: 1,
  rules: "ki-1995",
  id: "init2-blank-probe",
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
    return { ok: true, json: async () => realGraph };
  }
  return {
    ok: true,
    arrayBuffer: async () => new ArrayBuffer(384 * 256),
    json: async () => ({}),
  };
};
try {
  const prepared = await prepareScenario({ raw, idx: 0, mode: "fresh", content, world });
  const sc = prepared.scenario;
  tlog(`blank probe: prepare SUCCEEDED (cities=${sc.cities.length}, factions=${sc.factions.length})`);
  const { scenarioNativeRoadContext } = await import(
    "../web/src/game/scenarioassembly.js"
  );
  const { getScenarioRoadMemory } = await import(
    "../web/src/game/navigation/scenarioroadmemory.js"
  );
  const { retreatOriginalRoadMemory } = await import(
    "../web/src/game/navigation/originalroadretreat.js"
  );
  const context = scenarioNativeRoadContext(sc);
  const memory = getScenarioRoadMemory(sc);
  tlog(`  neutral city owner byte: ${context.readCityOwnerByte(0x841).toString(16)} (expect 18)`);
  const r = retreatOriginalRoadMemory({
    readFactionByte: () => 0,
    readCapitalByte: () => 255, // empty faction: no capital
    readCurrentWord: () => 8,
    readGraphByte: memory.readByte,
    writeGraphByte: memory.writeByte,
    readStateByte: context.readCityOwnerByte,
  });
  tlog(`  first-round 487B with no capital: reason=${r.reason} (honest no-capital exit)`);
} catch (error) {
  tlog(`blank probe: prepare stops exactly at: ${error?.message ?? error}`);
}
globalThis.fetch = oldFetch;
tlog("A-INIT-2 (bounded): inventory + unknowns + blank probe recorded");
