// M-04/M-05: old identity / missing capability admission must not mutate the
// live App or delete, relabel or rewrite persisted records. Owned temporary IDB.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { startBrowserTestServer } from "./browser_test_server.mjs";
const round = process.argv[2];
assert.match(round ?? "", /^[a-zA-Z0-9-]+$/);
const output = fileURLToPath(new URL(`../.dragon-analysis/map-migration-2/${round}/`, import.meta.url));
mkdirSync(output);
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright");
const server = await startBrowserTestServer();
const origin = `http://127.0.0.1:${server.port}`;
const errors = [], forbidden = [], requests = [];
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin || /save\.dat|\/api\/|\.dragon-runtime/i.test(url.pathname)) { forbidden.push(url.href); return route.abort(); }
    return route.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => { if (message.type() === "error" && !message.location().url?.endsWith("/favicon.ico")) errors.push(message.text()); });
  page.on("request", (request) => requests.push(new URL(request.url()).pathname));
  await page.goto(`${origin}/index.html`);
  await page.locator("#skip-button").click();
  await page.waitForFunction(() => Boolean(window.__app?.startMenu?._onClick));
  const rebind = async (x, y) => {
    await page.evaluate(() => { window.__identityMenuHandler = window.__app.startMenu._onClick; });
    await page.mouse.click(x, y);
    await page.waitForFunction(() => window.__app.startMenu._onClick && window.__app.startMenu._onClick !== window.__identityMenuHandler);
  };
  await rebind(468, 360); await rebind(512, 234); await rebind(512, 234);
  await page.mouse.click(584, 455);
  await page.waitForFunction(() => window.__app.gameStarted && window.__app.runtimeEnabled);
  const setup = await page.evaluate(async () => {
    const app = window.__app;
    // Use a real owner of the union hold; assigning clock.hold alone is
    // overwritten by the production per-frame GameBar.syncClock aggregator.
    app.gamebar.settingsOpen = true; app.gamebar.syncClock();
    // Same guarded production save method; actual menu sequencing separately
    // covered by verify_menu_save_slots_browser. No successful hot restore.
    const write = await app.saveGame(0, "migration identity control");
    if (write.saved !== "local") throw new Error(`cannot create control save: ${write.saved}`);
    const valid = await app.saveRepository.get(0), saved = [];
    for (const [slot, field] of [[1, "world"], [2, "content"], [3, "terrainMemory"], [4, "movementMemory"], [5, "cityCache"]]) {
      const record = structuredClone(valid);
      record.slot = slot; record.label = `synthetic rejected ${field}`;
      if (["terrainMemory", "movementMemory", "cityCache"].includes(field)) delete record.webMeta[field];
      else record.webMeta.scenarioAssembly[field].revision = "1";
      await app.saveRepository.put(record);
      const actual = await app.saveRepository.get(slot);
      if (JSON.stringify(actual) !== JSON.stringify(record)) throw new Error("transport repaired admission fixture");
      saved.push({ slot, field, bytes: JSON.stringify(actual) });
    }
    app.saves = await app.saveRepository.load();
    window.__identityFixtures = saved;
    return { controlWorld: valid.webMeta.scenarioAssembly.world, controlContent: valid.webMeta.scenarioAssembly.content, slots: saved.map(({ slot, field }) => ({ slot, field })) };
  });
  assert.notEqual(setup.controlWorld.revision, "1");
  assert.notEqual(setup.controlContent.revision, "1");
  const outcomes = await page.evaluate(async () => {
    const app = window.__app;
    const { snapshotScenarioAssembly } = await import("/src/game/scenarioassembly.js");
    const beforeScenario = app.scenario, beforeWorld = app.world;
    const before = JSON.stringify({ state: app.scenario, assembly: snapshotScenarioAssembly(app), rng: app.originalRng.snapshot(), date: [app.clock.year, app.clock.month, app.clock.day] });
    const outcomes = [];
    for (const fixture of window.__identityFixtures) {
      let error = null;
      try { await app.loadSave(fixture.slot); } catch (cause) { error = String(cause); }
      if (!error) throw new Error(`fixture ${fixture.field} was admitted`);
      if (app.scenario !== beforeScenario || app.world !== beforeWorld) throw new Error("rejection replaced live scene");
      const after = JSON.stringify({ state: app.scenario, assembly: snapshotScenarioAssembly(app), rng: app.originalRng.snapshot(), date: [app.clock.year, app.clock.month, app.clock.day] });
      if (after !== before) {
        const previous = JSON.parse(before), next = JSON.parse(after);
        const changed = Object.keys(previous).filter((key) => JSON.stringify(previous[key]) !== JSON.stringify(next[key]));
        throw new Error(`rejection changed ${changed.join(",")} (${fixture.field})`);
      }
      if (JSON.stringify(await app.saveRepository.get(fixture.slot)) !== fixture.bytes) throw new Error("rejection deleted or rewrote persisted record");
      outcomes.push({ slot: fixture.slot, field: fixture.field, error, liveUnchanged: true, recordUnchanged: true });
    }
    window.__identityExpected = JSON.stringify(await app.saveRepository.load());
    return outcomes;
  });
  for (const result of outcomes) assert.match(result.error, /mismatch|terrain|movement|cityCache/i);
  const beforeReload = await page.evaluate(() => window.__identityExpected);
  await page.reload();
  await page.locator("#skip-button").click();
  await page.waitForFunction(() => Boolean(window.__app?.startMenu?._onClick));
  const durable = await page.evaluate(async () => {
    const loaded = await window.__app.saveRepository.load();
    return { bytes: JSON.stringify(loaded), records: loaded.slots.filter((s) => s.played).map((s) => ({ slot: s.slot, label: s.label })) };
  });
  assert.equal(durable.bytes, beforeReload, "new title boot must not clear or normalize incompatible records");
  assert.deepEqual(durable.records.map((r) => r.slot), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(errors, []); assert.deepEqual(forbidden, []);
  const hashes = {};
  for (const path of ["tools/verify_unified_map_identity_browser.mjs", "tools/browser_test_server.mjs", "web/src/main.js", "web/src/game/savegame.js", "web/src/game/scenarioassembly.js", "web/src/core/localstore.js", "web/src/core/saverepository.js", "web/src/core/indexeddbsavebackend.js"])
    hashes[path] = createHash("sha256").update(readFileSync(new URL("../" + path, import.meta.url))).digest("hex");
  writeFileSync(join(output, "receipt.json"), JSON.stringify({ caseId: "M-04-M-05-old-identity-record-preservation", contractRevision: "map-migration-2-0.4", sourceHashes: hashes, toolHashes: hashes, toolVersion: process.version,
    fixtureId: "owned-IDB-synthetic-world1-content1-missing-terrain-movement-cache", expectedSource: "approved migration identity/admission/record preservation contract", result: "pass", setup, outcomes, durableRecords: durable.records, errors, forbidden, requests,
    artifactPaths: ["receipt.json"], coverageLimits: "synthetic incompatibility records, not old user saves; no successful direct hot restore, menu write/restore covered separately" }, null, 2) + "\n");
  process.stdout.write(JSON.stringify({ result: "pass", outcomes, durableRecords: durable.records, errors }) + "\n");
} catch (error) {
  writeFileSync(join(output, "failure.json"), JSON.stringify({ error: String(error), errors, forbidden, requests }, null, 2) + "\n"); throw error;
} finally { await browser?.close(); await server.close(); }
