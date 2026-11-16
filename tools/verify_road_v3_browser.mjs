// M257(h): 257-city v3 road graph under real Chromium. Fresh assembly,
// indexed ownership, relocated search workspace and JSON snapshot/restore
// run in-page against an intercepted v3 road_graph.json. Synthetic
// fixtures only; no SAVE.DAT, profiles or persistent writes.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { startBrowserTestServer } from "./browser_test_server.mjs";
const require = createRequire(import.meta.url);
const {
  chromium,
} = require("C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright");

const TOTAL = 257;
const EDGE_BASE = (TOTAL * 8 + 15) & ~15;
function graphFixture() {
  const graph = {
    version: 3,
    width: 384,
    height: 256,
    nodes: Array.from({ length: TOTAL }, (_, id) => ({
      id,
      x: id + 1,
      y: 10,
      edgeSlots: [0, 0, 0, 0],
    })),
    edges: [],
  };
  graph.nodes[0].edgeSlots[0] = 0x4000 | EDGE_BASE;
  graph.nodes[1].edgeSlots[0] = 0x8000 | EDGE_BASE;
  graph.edges.push({
    id: 0,
    source: 0,
    target: 1,
    weight: 1,
    bounds: { minX: 1, maxX: 2, minY: 11, maxY: 11 },
    points: [
      { x: 1, y: 11, flags: 0x44 },
      { x: 2, y: 11, flags: 4 },
    ],
  });
  return graph;
}

const server = await startBrowserTestServer();
const origin = `http://127.0.0.1:${server.port}`;
const graph = graphFixture();
let browser;
const errors = [],
  forbidden = [];
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1024, height: 768 },
  });
  await context.addInitScript((origin) => {
    if (location.origin !== origin) return;
    sessionStorage.setItem("wolong.intro.seen.v1", "1");
  }, origin);
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (
      url.origin !== origin ||
      /\/api\/|\.dragon-runtime|save\.dat/i.test(url.pathname)
    ) {
      forbidden.push(url.href);
      return route.abort();
    }
    return route.continue();
  });
  // The default world fetches its roads asset (content/.../roads.json);
  // serve the synthetic v3 graph there. Genuine terrain/cost/offset stay.
  await context.route(`**/roads.json`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(graph),
    }),
  );
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(`${origin}/index.html`);
  await page.waitForFunction(() => !!window.__app?.startMenu?._onClick);
  const result = await page.evaluate(async (graph) => {
    const out = {};
    const total = graph.nodes.length;
    const { createContentCatalog } = await import("/src/content/catalog.js");
    const { createWorldResources } = await import("/src/game/worldresources.js");
    const { createNewGameScenario } = await import("/src/game/world.js");
    const {
      prepareScenario,
      scenarioNativeRoadContext,
      readSavedAssembly,
    } = await import("/src/game/scenarioassembly.js");
    const { snapshotState, restoreSnapshotState } = await import(
      "/src/game/savegame.js"
    );
    const { searchOriginalRoadMemory } = await import(
      "/src/game/navigation/originalroadsearch.js"
    );
    const { searchRegionsFor } = await import(
      "/src/game/navigation/originalroadmemory.js"
    );
    const { roadNodeToCitySlot, cityNodeBoundOf } = await import(
      "/src/game/navigation/originalroadstate.js"
    );
    const { initializeNativeLegionSlotsFromZeroChapter } = await import(
      "/src/game/nativelegions.js"
    );
    // Inline port of native_faction_fixture (browser has no node:assert/Buffer).
    const hex = (bytes) =>
      Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    const put16 = (raw, offset, value) => {
      raw[offset] = value & 0xff;
      raw[offset + 1] = (value >>> 8) & 0xff;
    };
    const put24 = (raw, offset, value) => {
      value &= 0xffffff;
      put16(raw, offset, value);
      raw[offset + 2] = value >>> 16;
    };
    const attachFactions = (sc) => {
      const recordHex = (slot) => {
        const raw = new Uint8Array(64);
        const faction = sc.factions[slot];
        raw[0x16] = 0xff;
        raw[0x17] = 0xff;
        raw[0x19] = 0xff;
        raw[0x2a] = 0xff;
        if (faction) {
          raw[0] = faction.attr ?? (faction.active === false ? 0 : 0x80);
          raw[1] = faction.monarch_idx ?? slot;
          raw[2] = faction.advisor_idx ?? 0x7f;
          raw[3] = faction.capital ?? 0xff;
          put16(raw, 4, faction.reserve_cav ?? 0);
          put16(raw, 6, faction.reserve_arc ?? 0);
          put16(raw, 8, faction.reserve_inf ?? 0);
          raw[0x14] = faction.n_legions ?? 0;
          raw[0x16] = faction.strategic_city_primary ?? 0xff;
          raw[0x17] = faction.strategic_city_secondary ?? 0xff;
          raw[0x18] = faction.nativeGeneralCount ?? 0;
          raw[0x19] = faction.target_faction ?? 0xff;
          put24(raw, 0x1a, faction.monthly_reserve_upkeep ?? 0);
          raw[0x1d] = faction.legion_morale_cap ?? 0;
          raw[0x1e] = faction.talk_style ?? 0;
          put24(raw, 0x20, faction.money ?? 0);
          raw[0x23] = faction.n_cities ?? 0;
          raw[0x28] = faction.bellicosity ?? 0;
          raw[0x2a] = faction.diplomat_idx ?? 0xff;
          raw[0x3e] = faction.march_marker_style ?? 0;
        }
        return hex(raw);
      };
      sc.nativeFactionSlotRaw = Array.from({ length: 22 }, (_, slot) =>
        recordHex(slot),
      );
      const declared = sc.factions.length;
      const sourceDiplomacy = sc.diplomacy;
      const diplomacy = new Uint8Array(24 * 24).fill(0x80);
      for (let actor = 0; actor < 24; actor++)
        diplomacy[actor * 24 + actor] = 0xff;
      for (let actor = 0; actor < Math.min(24, sourceDiplomacy.length); actor++)
        for (
          let target = 0;
          target < Math.min(24, sourceDiplomacy[actor]?.length ?? 0);
          target++
        )
          diplomacy[actor * 24 + target] = sourceDiplomacy[actor][target];
      sc.diplomacy = Array.from({ length: declared }, (_, actor) =>
        Array.from(
          { length: declared },
          (_, target) => diplomacy[actor * 24 + target],
        ),
      );
      sc.nativeDiplomacyRaw = hex(diplomacy);
      sc.nativeStrategicEventRaw = "00".repeat(0x400);
      const policy = new Uint8Array(0x10);
      policy[0] = sc.tax ?? 18;
      policy[8] = sc.next_tax ?? policy[0];
      sc.tax = policy[0];
      sc.conscription = [0, 0, 0];
      sc.next_tax = policy[8];
      sc.next_conscription = [0, 0, 0];
      sc.nativeMonthlyPolicyRaw = hex(policy);
      sc.nativeCityRecordRaw = Array.from({ length: total }, () =>
        "00".repeat(32),
      );
      return sc;
    };
    const template = {
      player_faction: 0,
      generals: [],
      legions: [],
      factions: [
        {
          idx: 0,
          capital: 0,
          n_legions: 0,
          active: true,
          attr: 0x80,
          money: 1000,
          legion_morale_cap: 200,
          march_marker_style: 0,
          strategic_city_primary: null,
          strategic_city_secondary: null,
          n_cities: total - 1,
        },
        {
          idx: 1,
          capital: total - 1,
          n_legions: 0,
          active: true,
          attr: 0x80,
          money: 1000,
          legion_morale_cap: 200,
          march_marker_style: 0,
          strategic_city_primary: null,
          strategic_city_secondary: null,
          n_cities: 1,
        },
      ],
      cities: graph.nodes.map(({ id, x, y }) => ({
        idx: id,
        x,
        y,
        faction: id === total - 1 ? 1 : 0,
        attr: 0x80,
        governor: null,
        _aiCooldown: 0,
        _strategicLastFaction: id === total - 1 ? 1 : 0,
      })),
      diplomacy: Array.from({ length: 24 }, () => Array(24).fill(0)),
      weatherClouds: Array.from({ length: 16 }, () => ({})),
      disasterMapObjects: Array.from({ length: 16 }, () => ({ status: 0 })),
    };
    template.cities[total - 1].strategicBorderCount = 0;
    template.cities[total - 1].strategicNeighbours = [255, 255, 255, 255];
    template.cities[total - 1].disaster_event = 0;
    const content = createContentCatalog(
      {
        schemaVersion: 1,
        rules: "ki-1995",
        id: "v3browser-test",
        revision: "1",
        chapters: [{ id: "chapter", legacyScenarioIndex: 0, official: true }],
      },
      { scenarios: [template] },
    );
    const world = createWorldResources();
    await world.roads.loadRoadGraph();
    out.roadVersion = world.roads.loadedRoadVersion();
    out.graphNodes = world.roads.roadNodeCount();
    const raw = createNewGameScenario(template);
    initializeNativeLegionSlotsFromZeroChapter(raw);
    attachFactions(raw);
    const args = {
      raw,
      idx: 0,
      content,
      world,
      mode: "fresh",
      terrainMemory: {
        version: 1,
        spans: [{ address: 0, hex: "ba".repeat(384 * 256) }],
      },
      movementMemory: {
        version: 1,
        spans: [{ address: 3840, hex: "00".repeat(768) }],
      },
    };
    const prepared = await prepareScenario(args);
    const scenario = prepared.scenario;
    out.cities = scenario.cities.length;
    const context = scenarioNativeRoadContext(scenario);
    out.layoutVersion = context.memory.roadLayout.version;
    out.owner0 = context.readCityOwner(0, "v3browser");
    out.owner256 = context.readCityOwner(256, "v3browser");
    out.cache256 = context.cityCache.readByte(256);
    out.search = searchOriginalRoadMemory({
      start: 0,
      stopB: 8,
      stopC: 8,
      owner: 0,
      readGraphByte: context.memory.readByte,
      writeGraphByte: context.memory.writeByte,
      readStateByte: () => {
        throw new Error("legacy address read must not fire");
      },
      readCityOwnerAtNode: (node, at) =>
        context.readCityOwner(roadNodeToCitySlot(scenario, node, at), at),
      cityNodeBound: cityNodeBoundOf(scenario),
      regions: searchRegionsFor(context.memory.roadLayout),
    });
    const app = {
      scenario,
      scenarioIdx: 0,
      world,
      content,
      clock: { year: 190, month: 1, day: 1 },
    };
    const saved = JSON.parse(JSON.stringify(snapshotState(app, 0, "v3browser")));
    const restored = await prepareScenario({
      ...args,
      mode: "restore",
      raw: restoreSnapshotState(saved),
      ...readSavedAssembly(saved),
    });
    out.restoreCities = restored.scenario.cities.length;
    const rcontext = scenarioNativeRoadContext(restored.scenario);
    out.restoreOwner256 = rcontext.readCityOwner(256, "v3browser-restore");
    out.restoreCache256 = rcontext.cityCache.readByte(256);
    return out;
  }, graph);
  assert.equal(result.roadVersion, 3, "page must load the intercepted v3 graph");
  assert.equal(result.graphNodes, 257);
  assert.equal(result.cities, 257, "fresh assembly must admit 257 cities");
  assert.equal(result.layoutVersion, 3);
  assert.equal(result.owner0, 0);
  assert.equal(result.owner256, 1, "last city keeps its faction");
  assert.equal(result.cache256, 0, "last city cache initializes to zero");
  assert.deepEqual(result.search, {
    ax: 0xfffc,
    bx: 0x810,
    cx: 5,
    cf: false,
    reason: "found",
  });
  assert.equal(result.restoreCities, 257, "restore must preserve 257 cities");
  assert.equal(result.restoreOwner256, 1);
  assert.equal(result.restoreCache256, 0);
  assert.deepEqual(errors, []);
  assert.deepEqual(forbidden, []);
  process.stdout.write(
    "OK: 257-city v3 fresh assembly, indexed ownership, relocated search, snapshot/restore; no page errors\n",
  );
} finally {
  await browser?.close();
  await server.close();
}
