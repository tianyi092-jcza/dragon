// Owned full App trial integration. No real profiles/SAVE/IDB; fixed input IO.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { startEditorServer } from "./editor_server.mjs";
import { BUILTIN_RESOURCES } from "../web/src/content/builtinresources.generated.js";
const round = process.argv[2]; assert.match(round ?? "", /^[a-zA-Z0-9-]{1,64}$/);
const out = join(".dragon-analysis/editor-phase", round); mkdirSync(out);
const sha = (b) => createHash("sha256").update(b).digest("hex");
function json(bytes) { try { return JSON.parse(bytes.toString()); } catch (cause) { throw new Error("invalid trial fixture JSON", { cause }); } }
const prefix = "web/content/builtin/compiled/" + BUILTIN_RESOURCES.world.revision + "/";
const manifest = json(readFileSync(prefix + "manifest.json"));
const resources = Object.fromEntries(["manifest.json", ...manifest.assets.map((a) => a.path)].map((p) => [p, sha(readFileSync(prefix + p))]));
const store = mkdtempSync(join(tmpdir(), "editor-app-trial-"));
const server = await startEditorServer(0, store), origin = `http://127.0.0.1:${server.address().port}`;
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright");
let browser; const errors = [], forbidden = [], requests = [];
async function call(path, body, status = 200) {
  const response = await fetch(origin + path, { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json", connection: "close" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  assert.equal(response.status, status, path); return response.json();
}
async function boot(page) {
  await page.waitForSelector("#start-trial"); await page.click("#start-trial");
  await page.waitForFunction(() => window.__app?.gameStarted && window.__app.runtimeEnabled);
  await page.waitForFunction(() => window.__app.clock.strategicTickSerial > 0);
  await page.evaluate(() => { window.__app.gamebar.settingsOpen = true; window.__app.gamebar.syncClock(); });
}
async function state(page) {
  return page.evaluate(async () => {
    const app = window.__app, { scenarioNativeRoadContext, snapshotScenarioAssembly } = await import("/src/game/scenarioassembly.js");
    const native = scenarioNativeRoadContext(app.scenario);
    return { identity: app.trialIdentity, content: app.content.revision, world: app.world.definition, sample: native.terrain.readTile(10, 10),
      state: JSON.stringify(app.scenario), ram: JSON.stringify(snapshotScenarioAssembly({ scenario: app.scenario, scenarioIdx: app.scenarioIdx, content: app.content, world: app.world })), rng: JSON.stringify(app.originalRng.snapshot()),
      minis: [app.gamebar.imgs.mbg.src, app.gamebar.imgs.mbgLarge.src], idb: window.__idbOpens };
  });
}
try {
  await call("/api/copy", { gameId: "app-trial", ownerId: "local", kind: "full" });
  const draft = await call("/api/draft?game=app-trial");
  draft.map.decorations.find((d) => d.x === 10 && d.y === 10).definitionRef = "tile-16";
  await call("/api/save", { gameId: draft.gameId, map: draft.map, expectedRevision: "1" });
  draft.localModel.draftRevision = "2";
  await call("/api/compile", { gameId: draft.gameId, expectedRevision: "1" }, 400);
  await call("/api/copy", { gameId: "empty-app", ownerId: "local", kind: "minimal" });
  await call("/api/compile", { gameId: "empty-app" });
  await call("/trial-app?game=empty-app&revision=1&chapter=missing", undefined, 400);
  browser = await chromium.launch({ headless: true }); const context = await browser.newContext({ viewport: { width: 1280, height: 768 } });
  await context.addInitScript(() => { window.__idbOpens = 0; indexedDB.open = () => { window.__idbOpens++; throw new Error("formal IDB forbidden"); }; });
  context.on("page", (page) => {
    page.setDefaultTimeout(120000); page.on("pageerror", (error) => errors.push(String(error)));
    page.on("console", (message) => { if (message.type() === "error" && !message.location().url?.endsWith("/favicon.ico")) errors.push(message.text()); });
  });
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url()); requests.push(url.href);
    if (url.origin !== origin || /save\.dat|\/mmap_map\.bin$|\/road_graph\.json$|\/src\/boot\.js$/.test(url.pathname)) { forbidden.push(url.href); return route.abort(); }
    return route.continue();
  });
  const studio = await context.newPage(); await studio.goto(origin + "/studio?game=app-trial");
  await studio.waitForFunction(() => window.__studio?.draft);
  await studio.selectOption("#trial-chapter", draft.chapterOrder[1]);
  const popup = studio.waitForEvent("popup"); await studio.click("#trial-app"); const old = await popup;
  await boot(old); assert.equal(await old.evaluate(() => window.opener), null);
  const before = await state(old); assert.equal(before.sample, 16); assert.equal(before.identity.draftRevision, "2"); assert.equal(before.identity.chapterId, draft.chapterOrder[1]); assert.equal(before.idb, 0);
  const denied = await old.evaluate(async () => {
    const app = window.__app; app.gamebar.settingsClick(0); app.gamebar.settingsClick(1);
    const save = await app.saveGame(0, "forbidden"), load = await app.loadSave(0), begin = await app.beginSavedGame(0);
    let repo = false; try { app.saveRepository.load(); } catch { repo = true; }
    return { save, load, begin, repo, saveDialog: app.gamebar.openSystemSaveDialog(), loadDialog: app.gamebar.openSystemLoadConfirmDialog(), idb: window.__idbOpens };
  });
  assert.deepEqual(denied, { save: { saved: "blocked", reason: "trial" }, load: false, begin: false, repo: true, saveDialog: false, loadDialog: false, idb: 0 });
  assert.deepEqual(await state(old), before);
  // Popup denied must keep editor usable; constant target never external.
  await studio.evaluate(() => { window.__originalOpen = window.open; window.open = () => null; });
  await studio.click("#trial-app"); await studio.waitForFunction(() => document.querySelector("#status").textContent.includes("視窗被阻擋"));
  await studio.evaluate(() => { window.open = window.__originalOpen; });
  draft.map.decorations.find((d) => d.x === 10 && d.y === 10).definitionRef = "tile-32";
  await call("/api/save", { gameId: draft.gameId, map: draft.map, expectedRevision: "2" });
  const next = await call("/api/compile", { gameId: draft.gameId, expectedRevision: "3" });
  assert.deepEqual(await state(old), before, "new saved draft cannot hot replace old trial");
  const fresh = await context.newPage(); await fresh.goto(origin + "/trial-app?" + new URLSearchParams({ game: draft.gameId, revision: "3", chapter: draft.chapterOrder[1] })); await boot(fresh);
  const after = await state(fresh); assert.equal(after.sample, 32); assert.notEqual(after.content, before.content); assert.equal(after.idb, 0);
  await studio.close(); assert.deepEqual(await state(old), before, "closing editor is not trial termination");
  for (const page of [old, fresh]) {
    await page.evaluate(async () => { for (const i of [0, 2, 3, 1]) await window.__app.setSeason(i); });
    const current = await state(page); assert.equal(current.sample, page === old ? 16 : 32); assert.equal(current.idb, 0);
    assert.ok(current.minis.every((url) => url.includes("/api/trial-asset?")));
    await page.screenshot({ path: join(out, page === old ? "old-app.png" : "new-app.png") });
  }
  await fresh.evaluate(() => window.__app.returnToTitle());
  assert.deepEqual(await fresh.evaluate(async () => {
    const app = window.__app; let restartBlocked = false;
    try { await app.beginNewGame(0, 0, null); } catch { restartBlocked = true; }
    return { runtime: app.runtimeEnabled, scenario: app.scenario, clock: app.clock, rng: app.originalRng, restartBlocked, idb: window.__idbOpens };
  }), { runtime: false, scenario: null, clock: null, rng: null, restartBlocked: true, idb: 0 });
  for (const asset of [...next.assets, ...next.minimapAssets]) assert.ok(requests.includes(origin + asset.url));
  assert.deepEqual(errors, []); assert.deepEqual(forbidden, []);
  for (const [p, hash] of Object.entries(resources)) assert.equal(sha(readFileSync(prefix + p)), hash);
  const sourceHashes = Object.fromEntries(["tools/verify_editor_app_trial.mjs", "tools/editor_server.mjs", "tools/editor_builtin_source.mjs", "web/index.html", "web/editor-studio.html", "web/src/main.js", "web/src/ui/gamebar.js", "web/src/editor/trialapp.js", "web/src/editor/trialpolicy.js", "web/src/editor/studio.js", "web/src/content/authoring/trialruntime.js"].map((p) => [p, sha(readFileSync(p))]));
  writeFileSync(join(out, "receipt.json"), JSON.stringify({ result: "PASS-SCOPED", fixtureId: BUILTIN_RESOURCES.world.revision, sourceHashes, resources, identities: [before.identity, after.identity], denied, requests, errors, forbidden,
    scope: "actual App/input/render/pump/four seasons, fixed old/new snapshots, no IDB, no draft writes by trial; auth/network/full Q69/whole combat not implemented" }, null, 2));
  process.stdout.write("PASS scoped: full App trial, immutable two revisions, formal persistence blocked, IDB0, current39 unchanged\n");
} catch (error) { writeFileSync(join(out, "failure.json"), JSON.stringify({ error: String(error), errors, forbidden, requests }, null, 2)); throw error; }
finally { await browser?.close(); await new Promise((resolve) => server.close(resolve)); }
