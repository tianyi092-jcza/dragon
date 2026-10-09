// Actual fixed-imported chapter scope App/UI, only owned OS store + fresh context.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { startEditorServer } from "./editor_server.mjs";
import { BUILTIN_RESOURCES } from "../web/src/content/builtinresources.generated.js";
import { BUILTIN_ENTITY_SOURCE } from "../web/src/editor/builtinentitysource.generated.js";
const round = process.argv[2]; assert.equal(process.argv.length, 3); assert.match(round ?? "", /^[a-zA-Z0-9-]{1,64}$/);
const out = join(".dragon-analysis/editor-phase", round); mkdirSync(out);
const sha = b => createHash("sha256").update(b).digest("hex");
function parse(bytes) { try { return JSON.parse(bytes.toString()); } catch (cause) { throw new Error("invalid owned chapter-browser fixture", { cause }); } }
const prefix = "web/content/builtin/compiled/" + BUILTIN_RESOURCES.world.revision + "/", manifest = parse(readFileSync(prefix + "manifest.json"));
const inputs = Object.fromEntries(["manifest.json", ...manifest.assets.map(a => a.path)].map(p => [prefix + p, sha(readFileSync(prefix + p))]));
for (const url of [BUILTIN_ENTITY_SOURCE.manifestURL, BUILTIN_ENTITY_SOURCE.resourceURL]) inputs["web/" + url] = sha(readFileSync("web/" + url));
const store = mkdtempSync(join(tmpdir(), "dragon-chapter-browser-")), server = await startEditorServer(0, store), origin = `http://127.0.0.1:${server.address().port}`;
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright");
let browser, release;
const errors = [], forbidden = [], requests = [], replies = [];
async function call(path, body, expected = 200) {
  const init = { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json", connection: "close" }, signal: AbortSignal.timeout(120000) };
  if (body !== undefined) init.body = JSON.stringify(body);
  const r = await fetch(origin + path, init); assert.equal(r.status, expected, path); return r.json();
}
async function started(page) { await page.waitForFunction(() => window.__app?.gameStarted && window.__app.runtimeEnabled && window.__scopeHeld); }
async function capture(page) { return page.evaluate(async () => {
  const app = window.__app, { scenarioNativeRoadContext, snapshotScenarioAssembly } = await import("/src/game/scenarioassembly.js");
  return { identity: app.trialIdentity, revision: app.content.revision, world: app.world.definition, sample: scenarioNativeRoadContext(app.scenario).terrain.readTile(10, 10), year: app.clock.year,
    serial: app.clock.strategicTickSerial, idb: window.__idbOpens, state: JSON.stringify(app.scenario), ram: JSON.stringify(snapshotScenarioAssembly({ scenario: app.scenario, scenarioIdx: app.scenarioIdx, content: app.content, world: app.world })), rng: JSON.stringify(app.originalRng.snapshot()), clock: JSON.stringify(app.clock.serialize()) };
}); }
try {
  const gameId = "chapter-browser"; await call("/api/copy", { gameId, ownerId: "local", kind: "full" });
  const draft = await call("/api/draft?game=" + gameId), first = draft.chapterOrder[14], second = draft.chapterOrder[15];
  draft.chapters[draft.chapterOrder[0]].state = {}; // owned incomplete unrelated chapter
  draft.map.decorations.find(d => d.x === 10 && d.y === 10).definitionRef = "tile-16";
  writeFileSync(join(store, gameId, "gamesource.json"), JSON.stringify(draft));
  await call("/api/compile", { gameId, expectedRevision: "1" }, 400);
  browser = await chromium.launch({ headless: true }); const context = await browser.newContext({ viewport: { width: 1280, height: 768 } });
  await context.addInitScript(() => {
    window.__idbOpens = 0; indexedDB.open = () => { window.__idbOpens++; throw new Error("formal IDB forbidden"); };
    // Same existing system-menu hold, before the first active App RAF; no speed/RNG changes.
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = callback => raf(time => {
      if (window.__app?.gameStarted && !window.__scopeHeld) { window.__app.gamebar.settingsOpen = true; window.__app.gamebar.syncClock(); window.__scopeHeld = true; }
      callback(time);
    });
  });
  context.on("page", page => {
    page.setDefaultTimeout(120000); page.on("pageerror", e => errors.push(String(e)));
    page.on("console", m => { if (m.type() === "error" && !m.location().url?.endsWith("/favicon.ico")) errors.push(m.text()); });
    page.on("response", r => { if (r.status() >= 400 && !r.url().endsWith("/favicon.ico")) replies.push({ url: r.url(), status: r.status() }); });
  });
  let reached; const delayed = new Promise(resolve => { reached = resolve; }), barrier = new Promise(resolve => { release = resolve; }); let held = false;
  await context.route("**/*", async route => {
    const url = new URL(route.request().url()); requests.push(url.href);
    if (url.origin !== origin || /save\.dat|\/mmap_map\.bin$|\/road_graph\.json$|\/src\/boot\.js$/.test(url.pathname)) { forbidden.push(url.href); return route.abort(); }
    if (!held && url.pathname === "/api/trial-asset" && url.searchParams.get("scope") === "chapter" && url.searchParams.get("chapter") === first && url.searchParams.get("revision") === "1" && url.searchParams.get("asset") === "roadGraph") {
      held = true; reached(); await barrier;
    }
    return route.continue();
  });
  const studio = await context.newPage(); await studio.goto(origin + "/studio?game=" + gameId); await studio.waitForFunction(() => window.__studio?.draft);
  await studio.selectOption("#trial-chapter", first);
  const popup = studio.waitForEvent("popup"); await studio.click("#trial-app"); const old = await popup;
  await old.waitForSelector("#start-trial"); await old.click("#start-trial");
  let deadline;
  try { await Promise.race([delayed, new Promise((_, reject) => { deadline = setTimeout(() => reject(new Error("scope road request not observed")), 120000); })]); }
  finally { clearTimeout(deadline); }
  const packQuery = (chapter, revision) => "/api/trial-pack?" + new URLSearchParams({ game: gameId, revision, chapter, scope: "chapter" });
  const originalPack = await call(packQuery(first, "1")); assert.equal(originalPack.manifest.scope.kind, "chapter");
  draft.map.decorations.find(d => d.x === 10 && d.y === 10).definitionRef = "tile-32";
  await call("/api/save", { gameId, map: draft.map, expectedRevision: "1" });
  const newer = await call("/api/compile", { gameId, expectedRevision: "2", scope: { kind: "chapter", chapterId: first } });
  const other = await call("/api/compile", { gameId, expectedRevision: "2", scope: { kind: "chapter", chapterId: second } });
  release(); await started(old); const before = await capture(old);
  assert.equal(await old.evaluate(() => window.opener), null); assert.equal(before.sample, 16); assert.equal(before.year, 264); assert.equal(before.identity.savedSourceDigest, originalPack.manifest.scope.savedSourceDigest); assert.equal(before.identity.draftRevision, "1"); assert.equal(before.idb, 0); assert.equal(before.serial, 0);
  const pages = [];
  for (const [chapter, compiled, year] of [[first, newer, 264], [second, other, 266]]) {
    const page = await context.newPage(); await page.goto(origin + "/trial-app?" + new URLSearchParams({ game: gameId, revision: "2", chapter, scope: "chapter" }));
    await page.waitForSelector("#start-trial"); await page.click("#start-trial"); await started(page); const value = await capture(page);
    assert.equal(value.sample, 32); assert.equal(value.year, year); assert.equal(value.identity.trialSnapshotId, compiled.identity.trialSnapshotId); assert.equal(value.serial, 0); assert.equal(value.idb, 0); pages.push({ page, value });
  }
  assert.notEqual(pages[0].value.identity.trialSnapshotId, pages[1].value.identity.trialSnapshotId);
  assert.deepEqual(await capture(old), before, "late original scope never switches to new draft/chapter");
  const denied = await old.evaluate(async () => ({ save: await window.__app.saveGame(0, "forbidden"), load: await window.__app.loadSave(0), canPersist: window.__app.canPersist, idb: window.__idbOpens }));
  assert.deepEqual(denied, { save: { saved: "blocked", reason: "trial" }, load: false, canPersist: false, idb: 0 });
  assert.deepEqual(await capture(old), before);
  for (const [index, entry] of [{ page: old, value: before }, ...pages].entries()) {
    for (const season of [0, 2, 3, 1]) await entry.page.evaluate(s => window.__app.setSeason(s), season);
    const after = await capture(entry.page); for (const key of ["state", "ram", "rng", "clock", "identity", "sample", "idb"]) assert.deepEqual(after[key], entry.value[key], key);
    await entry.page.screenshot({ path: join(out, `scope-${index}.png`) });
  }
  for (const m of [originalPack.manifest, newer, other]) for (const asset of [...m.assets, ...m.minimapAssets]) assert.ok(requests.includes(origin + asset.url), asset.assetId);
  const currentDraft = readFileSync(join(store, gameId, "gamesource.json"));
  await studio.close(); assert.deepEqual((await capture(old)).state, before.state);
  assert.deepEqual(readFileSync(join(store, gameId, "gamesource.json")), currentDraft, "Trial never writes the draft");
  assert.deepEqual(errors, []); assert.deepEqual(forbidden, []); assert.deepEqual(replies, []);
  for (const [p, hash] of Object.entries(inputs)) assert.equal(sha(readFileSync(p)), hash);
  const tools = ["tools/verify_editor_chapter_trial_browser.mjs", "tools/editor_server.mjs", "web/src/editor/trialscope.js", "web/src/content/authoring/trialruntime.js", "web/src/editor/trialapp.js", "web/src/editor/studio.js"];
  const sourceHashes = Object.fromEntries(tools.map(p => [p, sha(readFileSync(p))]));
  writeFileSync(join(out, "receipt.json"), JSON.stringify({ result: "PASS-FIXED-CHAPTER-APP-SERVICE", sourceHashes, inputs, identities: [before.identity, ...pages.map(e => e.value.identity)], years: [264, 264, 266], samples: [16, 32, 32], zeroTicks: true, delayedOldScope: true, denied, requests, errors, forbidden, replies,
    limitations: "actual imported chapter UI/service/App and existing all-season visuals; no complete Q69 staticbattle/portrait/TALK closure, auth/network lifecycle/new initializer/general library/whole campaign" }, null, 2) + "\n");
  process.stdout.write("PASS fixed chapter: incomplete other chapter, popup App, delayed original scope/two new scopes, seasons/forbidden persistence/IDB0\n");
} catch (error) { writeFileSync(join(out, "failure.json"), JSON.stringify({ error: String(error), errors, forbidden, requests }, null, 2)); throw error; }
finally { release?.(); await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); rmSync(store, { recursive: true, force: true }); }
