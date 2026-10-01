// Two owned pages simulate an already-running previous release and a new
// release. Never hot-replace a live scenario or access a user's browser/profile.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { startBrowserTestServer } from "./browser_test_server.mjs";
import { BUILTIN_RESOURCES } from "../web/src/content/builtinresources.generated.js";
const root = fileURLToPath(new URL("../", import.meta.url));
const round = process.argv[2];
assert.match(round ?? "", /^[a-zA-Z0-9-]+$/);
const output = join(root, ".dragon-analysis/map-migration-2", round);
mkdirSync(output);
const oldModule = readFileSync(join(root, ".dragon-analysis/map-migration-2/m2-stage-r4/builtinresources.generated.js"), "utf8");
let oldWorld;
try { oldWorld = JSON.parse(readFileSync(join(root, ".dragon-analysis/map-migration-2/m2-stage-r4/package/world-definition.json"))); }
catch (cause) { throw new Error("invalid reviewed previous world", { cause }); }
assert.match(oldWorld.revision, /^map-2-[a-f0-9]{64}$/);
assert.notEqual(oldWorld.revision, BUILTIN_RESOURCES.world.revision);
assert.ok(oldModule.includes(JSON.stringify(oldWorld)), "old module must embed the reviewed old world");
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright");
const server = await startBrowserTestServer();
const origin = `http://127.0.0.1:${server.port}`;
const errors = [], forbidden = [], requests = [];
let browser, release, gateSeen;
const delayed = new Promise((resolve) => { release = resolve; });
const intercepted = new Promise((resolve) => { gateSeen = resolve; });
async function pageIn(context, id) {
  const page = await context.newPage(); page.setDefaultTimeout(60000);
  page.on("pageerror", (e) => errors.push(`${id}: ${e}`));
  page.on("console", (m) => { if (m.type() === "error" && !m.location().url?.endsWith("/favicon.ico")) errors.push(`${id}: ${m.text()}`); });
  page.on("request", (r) => {
    try { requests.push({ id, path: new URL(r.url()).pathname }); }
    catch (error) { errors.push(`${id}: invalid request URL: ${error}`); }
  });
  return page;
}
async function start(page) {
  await page.goto(origin + "/index.html"); await page.locator("#skip-button").click();
  await page.waitForFunction(() => Boolean(window.__app?.startMenu?._onClick));
  for (const [x, y] of [[468, 360], [512, 234], [512, 234]]) {
    await page.evaluate(() => { window.__lateHandler = window.__app.startMenu._onClick; });
    await page.mouse.click(x, y);
    await page.waitForFunction(() => window.__app.startMenu._onClick && window.__app.startMenu._onClick !== window.__lateHandler);
  }
  await page.mouse.click(584, 455);
}
const snapshot = (page) => page.evaluate(async () => {
  const app = window.__app;
  const { snapshotScenarioAssembly } = await import("/src/game/scenarioassembly.js");
  return { world: app.world.definition, revision: app.content.revision, state: JSON.stringify(app.scenario), rng: app.originalRng.snapshot(),
    ram: snapshotScenarioAssembly({ scenario: app.scenario, scenarioIdx: app.scenarioIdx, content: app.content, world: app.world }),
    mini: [app.gamebar.imgs.mbg.src, app.gamebar.imgs.mbgLarge.src] };
});
try {
  browser = await chromium.launch({ headless: true });
  const previous = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  await previous.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin || /save\.dat|\/api\//i.test(url.pathname)) { forbidden.push(url.href); return route.abort(); }
    // Reviewed fixture substitutes only the immutable metadata module that a
    // previous page would already have imported, not rules or source bytes.
    if (url.pathname === "/src/content/builtinresources.generated.js") return route.fulfill({ contentType: "text/javascript", body: oldModule });
    if (url.pathname === "/" + oldWorld.assets.seasonAtlases.spring) { gateSeen(); await delayed; }
    return route.continue();
  });
  const oldPage = await pageIn(previous, "previous");
  await start(oldPage);
  let gateTimer;
  try {
    await Promise.race([intercepted, new Promise((_, reject) => {
      gateTimer = setTimeout(() => reject(new Error("old atlas gate not reached")), 60000);
    })]);
  } finally { clearTimeout(gateTimer); }
  const next = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  await next.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin || /save\.dat|\/api\//i.test(url.pathname)) { forbidden.push(url.href); return route.abort(); }
    return route.continue();
  });
  const newPage = await pageIn(next, "current"); await start(newPage);
  await newPage.waitForFunction(() => window.__app.gameStarted && window.__app.runtimeEnabled);
  await newPage.evaluate(() => { window.__app.gamebar.settingsOpen = true; window.__app.gamebar.syncClock(); });
  const before = await snapshot(newPage);
  assert.deepEqual(before.world, BUILTIN_RESOURCES.world);
  assert.ok(before.ram?.scenarioAssembly, "snapshot must contain actual runtime assembly");
  release();
  await oldPage.waitForFunction(() => window.__app.gameStarted && window.__app.runtimeEnabled);
  await oldPage.evaluate(() => { window.__app.gamebar.settingsOpen = true; window.__app.gamebar.syncClock(); });
  const old = await snapshot(oldPage), after = await snapshot(newPage);
  assert.deepEqual(old.world, oldWorld); assert.equal(old.revision, oldWorld.revision);
  assert.deepEqual(after, before, "late old page resources must not change the current page/world/state/RAM/RNG");
  assert.ok(old.mini.every((url) => url.includes(oldWorld.revision)));
  assert.ok(after.mini.every((url) => url.includes(BUILTIN_RESOURCES.world.revision)));
  for (const request of requests.filter((r) => /\/compiled\//.test(r.path)))
    assert.ok(request.path.includes(request.id === "previous" ? oldWorld.revision : BUILTIN_RESOURCES.world.revision));
  assert.deepEqual(errors, []); assert.deepEqual(forbidden, []);
  const hashes = {};
  for (const name of ["tools/verify_world_revision_late_browser.mjs", "tools/browser_test_server.mjs", "web/src/content/builtinresources.generated.js",
    "web/src/game/worldresources.js", "web/src/core/assets.js", "web/src/ui/gamebar.js", ".dragon-analysis/map-migration-2/m2-stage-r4/builtinresources.generated.js"])
    hashes[name] = createHash("sha256").update(readFileSync(join(root, name))).digest("hex");
  writeFileSync(join(output, "receipt.json"), JSON.stringify({ caseId: "M-05-previous-page-late-assets", contractRevision: "immutable-world-revision-1",
    sourceHashes: hashes, toolHashes: hashes, toolVersion: process.version, fixtureId: `${oldWorld.revision}+${BUILTIN_RESOURCES.world.revision}`,
    expectedSource: "approved old-page retention/new-page assembly, no live-world hot replacement", result: "pass-scoped", requests,
    artifactPaths: [], coverageLimits: "two separate owned browser contexts; not editor multi-world switching, native mechanism or visual approval" }, null, 2) + "\n");
  process.stdout.write(JSON.stringify({ result: "pass-scoped", old: oldWorld.revision, current: BUILTIN_RESOURCES.world.revision, errors }) + "\n");
} catch (error) {
  writeFileSync(join(output, "failure.json"), JSON.stringify({ error: String(error), errors, forbidden, requests }, null, 2) + "\n");
  throw error;
} finally { release(); await browser?.close(); await server.close(); }
