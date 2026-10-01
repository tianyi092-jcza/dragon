// Direct portable stage -> real production App. No copying/rebuilding from
// an installed pack, product installation, real profile/SAVE or hot replacement.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { startBrowserTestServer } from "./browser_test_server.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
const [sourceRound, round, evidence = "minimap-groups-repro-r4"] = process.argv.slice(2);
assert.ok(["explicit-stage-repro-r2", "minimap-groups-repro-r1", "minimap-groups-repro-r2", "minimap-groups-repro-r3", "minimap-groups-repro-r4"].includes(evidence));
for (const value of [sourceRound, round]) assert.match(value ?? "", /^[a-zA-Z0-9-]{1,64}$/);
assert.notEqual(sourceRound, round);
const base = ".dragon-analysis/map-migration-2/", stagePath = base + sourceRound + "/";
const output = join(root, base, round), sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sourceHashes = {};
function read(path) { const bytes = readFileSync(join(root, path)); sourceHashes[path] = sha(bytes); return bytes; }
function json(bytes) { try { return JSON.parse(bytes.toString()); } catch (cause) { throw new Error("invalid portable candidate JSON", { cause }); } }
// The earlier focused validator supplies a pinned complete byte/assembly
// receipt. Only fixed evidence and this exact declared stage subtree are read.
const verified = json(read(base + "session-evidence/" + evidence + ".json"));
assert.equal(verified.caseId, "M-00-02-portable-explicit-stage-repro-assembly");
assert.equal(verified.result, "PASS-SCOPED-REVIEW-REQUIRED");
assert.equal(verified.checks.length, 20);
for (const [p, hash] of Object.entries(verified.toolHashes)) {
  assert.ok(["tools/verify_explicit_unified_stage.mjs", "tools/map_water_display_authoring.mjs", "web/src/content/catalog.js",
    "web/src/game/worldresources.js", "web/src/game/scenarioassembly.js", "web/src/game/world.js",
    "web/src/content/authoring/trialcompile.js", "web/src/content/authoring/maplayers.js", "web/src/content/authoring/mapcompile.js"].includes(p));
  assert.equal(sha(read(p)), hash, "assembly validator source drift");
}
function checked(path) {
  assert.ok(path.startsWith(stagePath));
  const bytes = read(path); assert.equal(sha(bytes), verified.sourceHashes[path], `stage byte drift: ${path}`); return bytes;
}
const report = json(checked(stagePath + "stage-report.json"));
assert.equal(report.result, "PASS-STAGE-ONLY-REVIEW-REQUIRED");
assert.equal(report.revision, verified.fixtureId); assert.match(report.revision, /^map-2-[a-f0-9]{64}$/);
const revision = report.revision, prefix = `content/builtin/compiled/${revision}/`;
const moduleBody = checked(stagePath + "builtinresources.generated.js");
const manifest = json(checked(stagePath + "package/manifest.json")), files = new Map();
assert.equal(manifest.worldRevision, revision); assert.equal(manifest.contentRevision, revision);
assert.ok(["PROPOSED_NOT_APPROVED", "CATEGORY_APPROVED_VISUAL_PENDING"].includes(manifest.geographyReview)); assert.equal(manifest.assets.length, 38);
for (const entry of manifest.assets) {
  assert.match(entry.path, /^(?:[A-Za-z0-9_-]+\.(?:json|png|bin)|chapters\/[A-Za-z0-9_-]+\.json)$/);
  assert.equal(entry.url, prefix + entry.path); assert.ok(!files.has(entry.path));
  const bytes = checked(stagePath + "package/" + entry.path);
  assert.equal(bytes.length, entry.byteLength); assert.equal(sha(bytes), entry.sha256); files.set(entry.path, bytes);
}
files.set("manifest.json", checked(stagePath + "package/manifest.json"));
const world = json(files.get("world-definition.json"));
assert.equal(world.revision, revision);
// Byte-compare the trusted emitter's metadata, don't evaluate arbitrary Node JS.
const config = { catalogURL: prefix + "catalog.json", dataURL: prefix + "data.json", world,
  sourceURL: prefix + "game-source.json", sourceDigest: report.sourceDigest, geographyReview: manifest.geographyReview };
const expectedModule = `// Isolated explicit display candidate; not approved or installed.\nfunction freeze(value) { if (value && typeof value === "object") { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; }\nexport const BUILTIN_RESOURCES = freeze(${JSON.stringify(config)});\n`;
assert.equal(moduleBody.toString(), expectedModule);
mkdirSync(output);
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright");
const server = await startBrowserTestServer(), origin = `http://127.0.0.1:${server.port}`;
const errors = [], forbidden = [], requests = [], responses = [], layouts = [];
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin || /save\.dat|\/api\//i.test(url.pathname)) { forbidden.push(url.href); return route.abort(); }
    if (url.pathname === "/src/content/builtinresources.generated.js") return route.fulfill({ contentType: "text/javascript", body: moduleBody });
    if (url.pathname.startsWith("/" + prefix)) {
      const name = url.pathname.slice(prefix.length + 1);
      if (!files.has(name)) { forbidden.push(url.href); return route.abort(); }
      let contentType = "application/octet-stream";
      if (name.endsWith(".png")) contentType = "image/png";
      else if (name.endsWith(".json")) contentType = "application/json";
      return route.fulfill({ contentType, body: files.get(name), headers: { "Cache-Control": "no-store" } });
    }
    if (/\/compiled\/|\/mmap_map\.bin$|\/road_graph\.json$|\/road_cost\.bin$|\/road_offset\.json$|\/map_(?:atlas|tiles)_/.test(url.pathname)) {
      forbidden.push(url.href); return route.abort();
    }
    return route.continue();
  });
  const page = await context.newPage(); page.setDefaultTimeout(60000);
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !m.location().url?.endsWith("/favicon.ico")) errors.push(m.text()); });
  page.on("request", (r) => { try { requests.push(new URL(r.url()).pathname); } catch (e) { errors.push(String(e)); } });
  page.on("response", (r) => { try { responses.push({ path: new URL(r.url()).pathname, status: r.status() }); } catch (e) { errors.push(String(e)); } });
  await page.goto(origin + "/index.html"); await page.locator("#skip-button").click();
  await page.waitForFunction(() => Boolean(window.__app?.startMenu?._onClick));
  assert.ok(!requests.some((p) => /map_atlas_|\/terrain\.bin|\/roads\.json/.test(p)), "world resources stay lazy at title");
  for (const [x, y] of [[468, 360], [512, 234], [512, 234]]) {
    await page.evaluate(() => { window.__stageMenuHandler = window.__app.startMenu._onClick; });
    await page.mouse.click(x, y);
    await page.waitForFunction(() => window.__app.startMenu._onClick && window.__app.startMenu._onClick !== window.__stageMenuHandler);
  }
  await page.mouse.click(584, 455);
  await page.waitForFunction(() => window.__app.gameStarted && window.__app.runtimeEnabled);
  // Same explicitly scoped screenshot hold as the prior review, never a
  // timing-rule test: union after actual sync, no speed change or visible modal.
  await page.evaluate(() => {
    const app = window.__app, realSync = app.gamebar.syncClock.bind(app.gamebar);
    app.gamebar.syncClock = () => { const value = realSync(); app.clock.hold = true; return value; };
    app.gamebar.syncClock();
  });
  const boot = await page.evaluate(() => ({ world: window.__app.world.definition, revision: window.__app.content.revision,
    cities: window.__app.scenario.cities.length, mini: [window.__app.gamebar.imgs.mbg.src, window.__app.gamebar.imgs.mbgLarge.src] }));
  assert.deepEqual(boot.world, world); assert.equal(boot.revision, revision); assert.equal(boot.cities, 192);
  assert.deepEqual(boot.mini, ["base", "large"].map((key) => origin + "/" + world.assets.minimap[key]));
  for (const fixture of [{ id: "normal", width: 1024, height: 768, mapWidth: 208 }, { id: "large", width: 1280, height: 768, mapWidth: 250 }, { id: "fallback", width: 640, height: 400, mapWidth: 208 }]) {
    await page.setViewportSize({ width: fixture.width, height: fixture.height });
    const { panels, menu } = await page.evaluate(() => {
      window.__app.gamebar.layout(); window.__app.view.draw();
      return { panels: window.__app.gamebar.panels.map((p) => ({ kind: p.kind, frame: p.frame, mapBox: p.mapBox })),
        menu: { x: window.__app.gamebar.bx, y: 32, w: 640, h: 48 } };
    });
    assert.equal(panels.find((p) => p.kind === "mini").mapBox.w, fixture.mapWidth);
    for (const p of panels) {
      const f = p.frame;
      assert.ok(f.x >= 0 && f.y >= 32 && f.x + f.w <= fixture.width && f.y + f.h <= fixture.height);
      assert.ok(f.x + f.w <= menu.x || menu.x + menu.w <= f.x || f.y >= menu.y + menu.h,
        "real panel frame must not obscure advisor strip");
    }
    await page.screenshot({ path: join(output, fixture.id + ".png") }); layouts.push({ ...fixture, panels });
  }
  const roleRequests = requests.filter((p) => p.startsWith("/" + prefix));
  for (const key of ["terrain", "roadGraph", "roadCost", "roadOffset"]) assert.ok(roleRequests.includes("/" + world.assets[key]));
  for (const key of ["base", "large"]) assert.ok(roleRequests.includes("/" + world.assets.minimap[key]));
  assert.deepEqual(errors, []); assert.deepEqual(forbidden, []);
  assert.equal(responses.filter((r) => r.status >= 400 && !r.path.endsWith("/favicon.ico")).length, 0);
  // Detect stage drift during the async browser work, not merely before it.
  for (const [name, bytes] of files) assert.equal(sha(readFileSync(join(root, stagePath, "package", name))), sha(bytes));
  assert.equal(sha(readFileSync(join(root, stagePath, "builtinresources.generated.js"))), sha(moduleBody));
  const toolHashes = {};
  for (const name of ["tools/verify_explicit_stage_app.mjs", "tools/browser_test_server.mjs", "web/src/content/catalog.js", "web/src/content/worlddefinition.js",
    "web/src/game/scenarioassembly.js", "web/src/core/assets.js", "web/src/ui/gamebar.js", "web/src/ui/mappanellayout.js"])
    toolHashes[name] = sha(readFileSync(join(root, name)));
  writeFileSync(join(output, "receipt.json"), JSON.stringify({ caseId: "M-05-06-direct-portable-stage-App", contractRevision: "immutable-world-revision-1/ki-byte-stamp-1",
    sourceHashes, toolHashes, toolVersion: process.version, fixtureId: revision,
    expectedSource: "exact unchanged independently generated 38-role stage; no installed-pack copy or revision repack", result: "PASS-SCOPED-REVIEW-REQUIRED",
    boot, layouts, requests, responses, errors, forbidden, artifactPaths: ["normal.png", "large.png", "fallback.png"],
    coverageLimits: "NOT installed/visually approved; one chapter App, screenshot hold only. Prior pinned same-stage20 assembly proof not rerun; not native water semantics/full rules or real save evidence" }, null, 2) + "\n");
  process.stdout.write(JSON.stringify({ result: "PASS-SCOPED-REVIEW-REQUIRED", revision, cities: boot.cities, layouts: layouts.length, errors, forbidden }) + "\n");
} catch (error) {
  writeFileSync(join(output, "failure.json"), JSON.stringify({ error: String(error), errors, forbidden, requests, responses }, null, 2) + "\n"); throw error;
} finally { await browser?.close(); await server.close(); }
