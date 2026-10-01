// Owned immutable proposal package -> real production App in a fresh context.
// No install, hot replacement, DOS/SAVE/profile or external network access.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { BUILTIN_RESOURCES } from "../web/src/content/builtinresources.generated.js";
import { startBrowserTestServer } from "./browser_test_server.mjs";
import { createContentCatalog } from "../web/src/content/catalog.js";
import { createWorldResources } from "../web/src/game/worldresources.js";
import { createNewGameScenario } from "../web/src/game/world.js";
import { prepareScenario, snapshotScenarioAssembly, readSavedAssembly } from "../web/src/game/scenarioassembly.js";
const root = fileURLToPath(new URL("../", import.meta.url));
const [sourceRound, round] = process.argv.slice(2);
for (const value of [sourceRound, round]) assert.match(value ?? "", /^[a-zA-Z0-9-]{1,64}$/);
assert.notEqual(sourceRound, round);
const source = join(root, ".dragon-analysis/map-migration-2", sourceRound), output = join(root, ".dragon-analysis/map-migration-2", round);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
function json(bytes) { try { return JSON.parse(bytes.toString()); } catch (cause) { throw new Error("invalid candidate JSON", { cause }); } }
const receipt = json(readFileSync(join(source, "receipt.json")));
assert.equal(receipt.caseId, "M-00-01-explicit-water-display-proposal");
assert.equal(receipt.result, "PASS-SCOPED-REVIEW-REQUIRED");
const revision = "water-proposal-" + receipt.sourceDigest;
assert.match(revision, /^water-proposal-[a-f0-9]{64}$/);
const prefix = `content/builtin/compiled/${revision}/`;
assert.match(BUILTIN_RESOURCES.sourceURL, /^content\/builtin\/compiled\/map-2-[a-f0-9]{64}\/game-source\.json$/);
const current = join(root, "web", BUILTIN_RESOURCES.sourceURL.replace(/game-source\.json$/, ""));
const manifest = json(readFileSync(join(current, "manifest.json"))), files = new Map();
assert.equal(manifest.worldRevision, receipt.fixtureId);
mkdirSync(output); const packageFolder = join(output, "package"); mkdirSync(packageFolder);
const sourceHashes = {};
for (const entry of manifest.assets) {
  assert.match(entry.path, /^(?:[A-Za-z0-9_-]+\.(?:json|png|bin)|chapters\/[A-Za-z0-9_-]+\.json)$/);
  const bytes = readFileSync(join(current, entry.path));
  assert.equal(bytes.length, entry.byteLength); assert.equal(sha(bytes), entry.sha256);
  files.set(entry.path, bytes); sourceHashes[entry.url] = sha(bytes);
}
for (const name of ["terrain.bin", "roads.json", "road_cost.bin", "road_offset.json", "minimap_base.png", "minimap_large.png", "candidate-source.json"]) {
  const entry = receipt.artifactPaths.find((a) => a.path === name), bytes = readFileSync(join(source, name));
  assert.ok(entry); assert.equal(sha(bytes), entry.sha256); assert.equal(bytes.length, entry.byteLength);
  files.set(name === "candidate-source.json" ? "game-source.json" : name, bytes);
  sourceHashes[sourceRound + "/" + name] = sha(bytes);
}
const world = structuredClone(BUILTIN_RESOURCES.world);
world.revision = revision;
for (const key of ["terrain", "roadGraph", "roadCost", "roadOffset"]) world.assets[key] = prefix + world.assets[key].split("/").at(-1);
for (const group of ["seasonAtlases", "seasons", "minimap"]) for (const key of Object.keys(world.assets[group]))
  world.assets[group][key] = prefix + world.assets[group][key].split("/").at(-1);
const catalog = json(files.get("catalog.json")); catalog.revision = revision;
files.set("catalog.json", Buffer.from(JSON.stringify(catalog) + "\n"));
files.set("world-definition.json", Buffer.from(JSON.stringify(world) + "\n"));
const moduleBody = `function freeze(v) { if(v && typeof v === 'object') { for(const c of Object.values(v)) freeze(c); Object.freeze(v); } return v; }\nexport const BUILTIN_RESOURCES = freeze(${JSON.stringify({ catalogURL: prefix + "catalog.json", dataURL: prefix + "data.json", world,
  sourceURL: prefix + "game-source.json", sourceDigest: receipt.sourceDigest, geographyReview: "PROPOSED_NOT_APPROVED" })});\n`;
const entries = [];
for (const [name, bytes] of files) {
  if (name === "manifest.json") continue;
  if (name.startsWith("chapters/")) mkdirSync(join(packageFolder, "chapters"), { recursive: true });
  writeFileSync(join(packageFolder, name), bytes);
  entries.push({ path: name, url: prefix + name, byteLength: bytes.length, sha256: sha(bytes) });
}
const packageManifest = { schemaVersion: 1, worldRevision: revision, contentRevision: revision, gameId: catalog.id,
  sourceDigest: receipt.sourceDigest, geographyReview: "PROPOSED_NOT_APPROVED", assets: entries, related: manifest.related };
files.set("manifest.json", Buffer.from(JSON.stringify(packageManifest, null, 2) + "\n"));
writeFileSync(join(packageFolder, "manifest.json"), files.get("manifest.json"));
writeFileSync(join(output, "builtinresources.generated.js"), moduleBody);
const assemblyChecks = [], fixtureRequests = [], oldFetch = globalThis.fetch;
globalThis.fetch = async (input) => {
  const url = String(input), name = ["terrain.bin", "roads.json", "road_cost.bin", "road_offset.json"].find((n) => url === prefix + n);
  assert.ok(name, `Node assembly request outside exact candidate whitelist: ${url}`);
  fixtureRequests.push(url); return new Response(files.get(name), { status: 200 });
};
try {
  const content = createContentCatalog(catalog, json(files.get("data.json"))), resources = createWorldResources(world);
  for (let idx = 0; idx < 20; idx++) {
    const raw = createNewGameScenario(content.chapter(idx).template); raw.player_faction = raw.factions[0].idx;
    const prepared = await prepareScenario({ raw, idx, mode: "fresh", content, world: resources });
    assert.equal(prepared.metadata.world.revision, revision);
    const transport = JSON.stringify({ state: prepared.scenario, webMeta: snapshotScenarioAssembly({ scenario: prepared.scenario, scenarioIdx: idx, content, world: resources }) });
    const saved = json(Buffer.from(transport));
    const restored = await prepareScenario({ raw: saved.state, idx, mode: "restore", content, world: resources, ...readSavedAssembly(saved) });
    assert.deepEqual(snapshotScenarioAssembly({ scenario: restored.scenario, scenarioIdx: idx, content, world: resources }), saved.webMeta);
    assemblyChecks.push({ idx, chapterId: content.chapter(idx).id, result: "fresh/JSON-restore-exact" });
  }
} finally { globalThis.fetch = oldFetch; }
writeFileSync(join(output, "assembly-receipt.json"), JSON.stringify({ caseId: "M-04-water-proposal-20-assembly", contractRevision: "scenario-assembly-2",
  sourceHashes, toolHashes: Object.fromEntries(["tools/verify_water_proposal_browser.mjs", "web/src/game/scenarioassembly.js", "web/src/game/worldresources.js", "web/src/content/catalog.js"].map((name) => [name, sha(readFileSync(join(root, name)))])),
  toolVersion: process.version, expectedSource: "declared immutable proposed package native bytes and 20 preserved chapter states", artifactPaths: ["package/manifest.json"],
  fixtureId: revision, result: "pass-scoped", checks: assemblyChecks, requests: fixtureRequests,
  coverageLimits: "new identity fresh/JSON capability restore only; not CPU rule equivalence, original water taxonomy or real saves" }, null, 2) + "\n");
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright");
const server = await startBrowserTestServer();
const origin = `http://127.0.0.1:${server.port}`;
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
  assert.ok(!requests.some((p) => /map_atlas_|\/terrain\.bin|\/roads\.json/.test(p)), "no world load at title");
  for (const [x, y] of [[468, 360], [512, 234], [512, 234]]) {
    await page.evaluate(() => { window.__waterMenuHandler = window.__app.startMenu._onClick; });
    await page.mouse.click(x, y); await page.waitForFunction(() => window.__app.startMenu._onClick && window.__app.startMenu._onClick !== window.__waterMenuHandler);
  }
  await page.mouse.click(584, 455); await page.waitForFunction(() => window.__app.gameStarted && window.__app.runtimeEnabled);
  // Own screenshot-only hold, unioned after the real UI owner calculation.
  // No speed change/UI popup, and no hold behavior assertion or native proof.
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
    const panels = await page.evaluate(() => { window.__app.gamebar.layout(); window.__app.view.draw(); return window.__app.gamebar.panels.map((p) => ({ kind: p.kind, frame: p.frame, mapBox: p.mapBox })); });
    assert.equal(panels.find((p) => p.kind === "mini").mapBox.w, fixture.mapWidth);
    for (const p of panels) assert.ok(p.frame.x >= 0 && p.frame.y >= 32 && p.frame.x + p.frame.w <= fixture.width && p.frame.y + p.frame.h <= fixture.height);
    await page.screenshot({ path: join(output, fixture.id + ".png") }); layouts.push({ ...fixture, panels });
  }
  assert.deepEqual(errors, []); assert.deepEqual(forbidden, []);
  assert.equal(responses.filter((r) => r.status >= 400 && !r.path.endsWith("/favicon.ico")).length, 0);
  const toolHashes = {};
  for (const name of ["tools/verify_water_proposal_browser.mjs", "tools/browser_test_server.mjs", "web/src/content/builtinresources.generated.js", "web/src/content/catalog.js",
    "web/src/content/worlddefinition.js", "web/src/game/scenarioassembly.js", "web/src/ui/gamebar.js", "web/src/ui/mappanellayout.js"])
    toolHashes[name] = sha(readFileSync(join(root, name)));
  writeFileSync(join(output, "receipt.json"), JSON.stringify({ caseId: "M-05-06-water-proposal-App", contractRevision: "immutable-world-revision-1/ki-byte-stamp-1",
    sourceHashes, toolHashes, toolVersion: process.version, fixtureId: revision, expectedSource: "scoped real App loading an explicit author proposal; not approval",
    result: "PASS-SCOPED-REVIEW-REQUIRED", boot, layouts, assemblyChecks, fixtureRequests, requests, responses, errors, forbidden,
    artifactPaths: ["package/manifest.json", "builtinresources.generated.js", "assembly-receipt.json", "normal.png", "large.png", "fallback.png"],
    coverageLimits: "Proposal NOT installed; one chapter App fresh/three layouts only. Owned screenshot hold unioned after product sync; not a UI-hold test. 20 chapters fresh/JSON capability restore checked separately; no CPU native equivalence or visual/classification certification claimed" }, null, 2) + "\n");
  process.stdout.write(JSON.stringify({ result: "PASS-SCOPED-REVIEW-REQUIRED", revision, cities: boot.cities, layouts: layouts.length, errors, forbidden }) + "\n");
} catch (error) {
  writeFileSync(join(output, "failure.json"), JSON.stringify({ error: String(error), errors, forbidden, requests, responses }, null, 2) + "\n"); throw error;
} finally { await browser?.close(); await server.close(); }
