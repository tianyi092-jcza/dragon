// Real App candidate integration. New Chromium context and owned static server.
// No DOS/profile/SAVE access, no external requests, no shared browser/server.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { startBrowserTestServer } from "./browser_test_server.mjs";
import { BUILTIN_RESOURCES } from "../web/src/content/builtinresources.generated.js";
const round = process.argv[2];
assert.match(round ?? "", /^[a-zA-Z0-9-]+$/);
const output = fileURLToPath(new URL(`../.dragon-analysis/map-migration-2/${round}/`, import.meta.url));
mkdirSync(output);
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright");
const server = await startBrowserTestServer();
const origin = `http://127.0.0.1:${server.port}`;
const errors = [], requests = [], responses = [], forbidden = [], fixtures = [];
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin || /save\.dat|\/api\/|\.dragon-runtime/i.test(url.pathname)) {
      forbidden.push(url.href); return route.abort();
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => { if (message.type() === "error" && !message.location().url?.endsWith("/favicon.ico")) errors.push(message.text()); });
  page.on("request", (request) => requests.push(new URL(request.url()).pathname));
  page.on("response", (response) => responses.push({ path: new URL(response.url()).pathname, status: response.status() }));
  await page.goto(`${origin}/index.html`);
  await page.locator("#skip-button").click();
  await page.waitForFunction(() => Boolean(window.__app?.startMenu?._onClick));
  assert.ok(!requests.some((p) => /map_atlas_|\/terrain\.bin|\/roads\.json/.test(p)), "title must not load world bitmaps/terrain/roads");
  const rebind = async (x, y) => {
    await page.evaluate(() => { window.__mapMenuHandler = window.__app.startMenu._onClick; });
    await page.mouse.click(x, y);
    await page.waitForFunction(() => window.__app.startMenu._onClick && window.__app.startMenu._onClick !== window.__mapMenuHandler);
  };
  await rebind(468, 360); await rebind(512, 234); await rebind(512, 234);
  await page.mouse.click(584, 455);
  await page.waitForFunction(() => window.__app.gameStarted && window.__app.runtimeEnabled);
  await page.evaluate(() => { window.__app.clock.hold = true; window.__app.gamebar.submenuOpen = false; });
  const boot = await page.evaluate(() => ({ world: window.__app.world.definition, revision: window.__app.content.revision,
    cities: window.__app.scenario.cities.length, images: [window.__app.gamebar.imgs.mbg.src, window.__app.gamebar.imgs.mbgLarge.src] }));
  assert.equal(boot.revision, BUILTIN_RESOURCES.world.revision);
  assert.deepEqual(boot.world, BUILTIN_RESOURCES.world);
  assert.equal(boot.cities, 192);
  assert.deepEqual(boot.images, ["base", "large"].map((size) => `${origin}/${BUILTIN_RESOURCES.world.assets.minimap[size]}`));
  for (const fixture of [
    { id: "normal", width: 1024, height: 768, mapWidth: 208 },
    { id: "large", width: 1280, height: 768, mapWidth: 250 },
    { id: "fallback", width: 640, height: 400, mapWidth: 208 },
  ]) {
    await page.setViewportSize({ width: fixture.width, height: fixture.height });
    const geometry = await page.evaluate(() => {
      const app = window.__app; app.gamebar.layout(); app.view.draw();
      return { panels: app.gamebar.panels.map((p) => ({ kind: p.kind, frame: p.frame, mapBox: p.mapBox, bannerY: p.bannerY })),
        camera: { x: app.view.cam.x, y: app.view.cam.y } };
    });
    const mini = geometry.panels.find((p) => p.kind === "mini");
    assert.equal(mini.mapBox.w, fixture.mapWidth);
    for (const p of geometry.panels) assert.ok(p.frame.x >= 0 && p.frame.y >= 32 && p.frame.x + p.frame.w <= fixture.width && p.frame.y + p.frame.h <= fixture.height);
    await page.screenshot({ path: join(output, `${fixture.id}.png`) });
    // Actual click through Input -> GameBar (not direct private _miniHit).
    await page.mouse.click(mini.mapBox.x + mini.mapBox.w * 0.25, mini.mapBox.y + mini.mapBox.h * 0.25);
    const after = await page.evaluate(() => ({ x: window.__app.view.cam.x, y: window.__app.view.cam.y }));
    assert.notDeepEqual(after, geometry.camera, "map click must navigate");
    // Map left frame is physical chrome and must not cause map navigation.
    await page.mouse.click(mini.frame.x + 1, mini.frame.y + 1);
    const frameAfter = await page.evaluate(() => ({ x: window.__app.view.cam.x, y: window.__app.view.cam.y }));
    assert.deepEqual(frameAfter, after);
    fixtures.push({ fixtureId: fixture.id, result: "pass", ...geometry });
  }
  assert.deepEqual(forbidden, []);
  assert.deepEqual(errors, []);
  assert.equal(responses.filter((r) => r.status >= 400 && !r.path.endsWith("/favicon.ico")).length, 0);
  const legacyWorld = requests.filter((p) => /^\/(?:mmap_map\.bin|road_graph\.json|road_cost\.bin|road_offset\.json|map_atlas_.*\.png|map_tiles_.*\.png)$/.test(p));
  assert.deepEqual(legacyWorld, [], "current world must use only its immutable compiled URLs");
  const hashes = {};
  for (const path of ["tools/verify_unified_map_browser.mjs", "tools/browser_test_server.mjs", "web/src/content/builtinresources.generated.js", "web/src/content/catalog.js", "web/src/content/worlddefinition.js", "web/src/ui/gamebar.js", "web/src/ui/mappanellayout.js"]) {
    hashes[path] = createHash("sha256").update(readFileSync(new URL("../" + path, import.meta.url))).digest("hex");
  }
  writeFileSync(join(output, "receipt.json"), JSON.stringify({ caseId: "M-05-unified-map-browser", contractRevision: "map-panel-layout-1",
    sourceHashes: hashes, toolHashes: hashes, toolVersion: process.version, fixtureId: "new-context-owned-origin", expectedSource: "controlled compiled candidate and approved Web layout",
    result: "pass", boot, fixtures, requests, responses, artifactPaths: ["normal.png", "large.png", "fallback.png"],
    coverageLimits: "not four-season/DPR/ownership/save/long campaign or user visual/classification approval" }, null, 2) + "\n");
  process.stdout.write(JSON.stringify({ result: "pass", bootRevision: boot.revision, fixtures: fixtures.map((f) => f.fixtureId), errors, forbidden }) + "\n");
} catch (error) {
  writeFileSync(join(output, "failure.json"), JSON.stringify({ error: String(error), errors, forbidden, requests, responses }, null, 2) + "\n");
  throw error;
} finally {
  await browser?.close(); await server.close();
}
