// C7-J: four city-group recipes under real Chromium. Plan, materialize,
// place, disband and gate-removal run in-page against a synthetic map
// source; JSON save/reload round-trips the placed state. Recipe shapes
// mirror editor-ui/src/mapcitygroups.json items (structure only, not art).
// No SAVE.DAT, profiles or persistent writes.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { startBrowserTestServer } from "./browser_test_server.mjs";
const require = createRequire(import.meta.url);
const {
  chromium,
} = require("C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright");

// Structural mirror of mapcitygroups.json items (itemId/cityTypes/anchor/
// gates/rows). Art bytes are the catalog's own; only the layout contract
// (rectangular grid, in-grid anchor/gates, non-empty cityTypes) matters here.
const RECIPES = [
  {
    itemId: "city-group-large-v1",
    cityTypes: [0],
    anchor: [2, 2],
    gates: [[2, 0], [0, 2], [4, 2], [2, 4]],
    rows: [
      [222, 231, 220, 231, 223],
      [230, 255, 254, 255, 246],
      [221, 254, 205, 254, 221],
      [230, 255, 254, 255, 246],
      [224, 247, 220, 247, 225],
    ],
  },
  {
    itemId: "city-group-common-v1",
    cityTypes: [1, 2, 4],
    anchor: [1, 1],
    gates: [[1, 0], [0, 1], [2, 1], [1, 2]],
    rows: [
      [226, 216, 227],
      [218, 205, 219],
      [228, 217, 229],
    ],
  },
  {
    itemId: "city-group-gate-vertical-v1",
    cityTypes: [3],
    anchor: [1, 0],
    gates: [[0, 0], [2, 0]],
    rows: [[214, 211, 215]],
  },
  {
    itemId: "city-group-gate-horizontal-v1",
    cityTypes: [3],
    anchor: [0, 1],
    gates: [[0, 0], [0, 2]],
    rows: [[212], [208], [213]],
  },
];
const ANCHORS = [[20, 20], [60, 20], [100, 20], [140, 20]];

const server = await startBrowserTestServer();
const origin = `http://127.0.0.1:${server.port}`;
let browser;
const errors = [],
  forbidden = [];
try {
  browser = await chromium.launch({ headless: true });
  const digests = [];
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 800, height: 600 },
  ]) {
    const context = await browser.newContext({ viewport });
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
    const page = await context.newPage();
    page.setDefaultTimeout(60000);
    page.on("pageerror", (error) => errors.push(String(error)));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.goto(`${origin}/index.html`);
    await page.waitForFunction(() => !!window.__app?.startMenu?._onClick);
    const digest = await page.evaluate(
      async ({ recipes, anchors }) => {
        const out = { placements: [], saveReload: null, gateRefused: null };
        const { planCityGroupPlacement, materializeCityGroupPlacement } =
          await import("/src/editor/citygroupplacement.js");
        const { placeCityGroup, disbandCityGroup, removeCityGate } =
          await import("/src/editor/componenttools.js");
        const { BYTE_STAMP_RECIPE } = await import(
          "/src/content/authoring/maplayers.js"
        );
        const tileDef = (n) => ({
          id: `tile-${n}`,
          revision: "1",
          category: "explicit-fixture",
          footprint: [[0, 0]],
          anchor: [0, 0],
          visualRef: `MMAP.MDL:tile-${n}`,
          ruleRecipeRef: BYTE_STAMP_RECIPE,
          variants: { original: { tiles: [[0, 0, n]] } },
        });
        let source = {
          // Every atomic byte the four recipes can emit; wall tile included.
          componentDefinitions: Object.fromEntries(
            Array.from({ length: 256 }, (_, n) => [`tile-${n}`, tileDef(n)])
          ),
          map: {
            bounds: { minX: 0, minY: 0, width: 384, height: 256 },
            base: {
              terrainRef: Array(384 * 256).fill(20),
              geography: Array(384 * 256).fill(0),
              unknownUnderlays: {},
            },
            decorations: [],
            roads: [],
            placements: [],
            waterGroups: [],
          },
          selectionGroups: [],
          cityGatePorts: [],
        };
        let serial = 0;
        const newId = (kind) => `${kind}-${++serial}`;
        const cityIds = [];
        recipes.forEach((item, index) => {
          const cityId = `browser-city-${index}`;
          cityIds.push(cityId);
          const [x, y] = anchors[index];
          const plan = planCityGroupPlacement(source, item, {
            x,
            y,
            cityType: item.cityTypes[0],
          });
          const materialized = materializeCityGroupPlacement(plan, {
            cityId,
            newId,
          });
          source = placeCityGroup(source, materialized);
          out.placements.push({
            cityId,
            decorations: source.map.decorations.length,
            ports: source.cityGatePorts.length,
            groups: source.selectionGroups.length,
          });
        });
        // Disband the first group: group link removed, records preserved.
        const before = {
          decorations: source.map.decorations.length,
          ports: source.cityGatePorts.length,
        };
        source = disbandCityGroup(source, cityIds[0]);
        if (
          source.selectionGroups.some(
            (row) => row.id === `city-group-${cityIds[0]}`
          )
        )
          throw new Error("disbanded group still listed");
        if (
          source.map.decorations.length !== before.decorations ||
          source.cityGatePorts.length !== before.ports
        )
          throw new Error("disband removed records");
        // A road touching the second city blocks gate removal until unlinked.
        const gateCity = cityIds[1];
        source = {
          ...source,
          map: {
            ...source.map,
            roads: [
              ...source.map.roads,
              { id: "road-1", fromCityId: gateCity, components: [] },
            ],
          },
        };
        let refused = null;
        try {
          removeCityGate(source, {
            cityId: gateCity,
            gateIndex: 0,
            wallMaterialId: "tile-95",
            wallInstanceId: newId("decoration"),
          });
        } catch (error) {
          refused = String(error);
        }
        if (!refused || !/道路引用/.test(refused))
          throw new Error("gate removal without unlink should refuse");
        out.gateRefused = refused;
        source = {
          ...source,
          map: {
            ...source.map,
            roads: source.map.roads.filter((road) => road.id !== "road-1"),
          },
        };
        source = removeCityGate(source, {
          cityId: gateCity,
          gateIndex: 0,
          wallMaterialId: "tile-95",
          wallInstanceId: newId("decoration"),
        });
        if (
          source.cityGatePorts.some(
            (row) => row.portId === `${gateCity}:0`
          )
        )
          throw new Error("removed port still listed");
        // Save/reload: JSON round-trip preserves the placed state exactly.
        const text = JSON.stringify(source);
        const reloaded = JSON.parse(text);
        const retext = JSON.stringify(reloaded);
        if (retext !== text) throw new Error("save/reload mismatch");
        out.saveReload = {
          bytes: text.length,
          decorations: reloaded.map.decorations.length,
          ports: reloaded.cityGatePorts.length,
          groups: reloaded.selectionGroups.length,
        };
        // Reloaded state stays operable: disband another group on it.
        const again = disbandCityGroup(reloaded, cityIds[2]);
        if (
          again.selectionGroups.some(
            (row) => row.id === `city-group-${cityIds[2]}`
          )
        )
          throw new Error("reloaded disband failed");
        return out;
      },
      { recipes: RECIPES, anchors: ANCHORS }
    );
    digests.push(JSON.stringify(digest));
    await context.close();
    assert.equal(digest.placements.length, 4);
    for (const placement of digest.placements) {
      assert.ok(placement.decorations > 0);
      assert.ok(placement.ports > 0);
      assert.equal(placement.groups, digest.placements.indexOf(placement) + 1);
    }
    assert.ok(digest.saveReload.bytes > 0);
  }
  assert.equal(digests[0], digests[1], "viewport-independent results");
  assert.deepEqual(forbidden, []);
  assert.deepEqual(errors, []);
  console.log("PASS C7-J city groups: 4 recipes placed/disbanded/gate-removed in Chromium, save/reload identical, two viewports agree.");
} finally {
  await browser?.close();
  await server.close();
}
