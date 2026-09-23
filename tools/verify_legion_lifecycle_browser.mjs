// Real main/StartMenu/IndexedDB lifecycle, in a NEW browser context and a
// static web-only server. No original saves, user profile, or save API.
import assert from "node:assert/strict";
import { startBrowserTestServer } from "./browser_test_server.mjs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    "C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright",
);
// The listener owns port 0 through close; no parsed stdout port or child server.
const server = await startBrowserTestServer();
let browser, page;
const errors = [],
  forbidden = [],
  failedRequests = [];
try {
  const origin = `http://127.0.0.1:${server.port}`;
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1024, height: 768 },
  });
  page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("requestfailed", (request) =>
    failedRequests.push({
      url: request.url(),
      failure: request.failure()?.errorText,
    }),
  );
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !message.location().url?.endsWith("/favicon.ico")
    )
      errors.push(message.text());
  });
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (/\/api\/|\.dragon-runtime|save\.dat/i.test(url.pathname)) {
      forbidden.push(url.pathname);
      return route.abort();
    }
    return route.continue();
  });
  await page.goto(`${origin}/index.html`);
  await page.locator("#skip-button").click();
  await page.waitForFunction(() => !!window.__app?.startMenu?._onClick);
  // Verify the initially empty load menu through actual input first.
  await page.evaluate(() => {
    window.__oldMenuInput = window.__app.startMenu._onClick;
  });
  await page.mouse.click(468, 384); // NO -> saves
  await page.waitForFunction(
    () =>
      window.__app.startMenu._onClick &&
      window.__app.startMenu._onClick !== window.__oldMenuInput,
  );
  assert.deepEqual(
    await page.evaluate(() =>
      window.__app.startMenu._saveRows().map((row) => !!row.disabled),
    ),
    [true, true, true, true],
  );
  await page.evaluate(() => {
    window.__oldMenuInput = window.__app.startMenu._onClick;
  });
  for (const y of [292, 348, 404, 460]) {
    await page.mouse.move(512, y);
    await page.mouse.click(512, y);
    assert.equal(
      await page.evaluate(
        () =>
          window.__app.startMenu._hover === -1 &&
          window.__app.startMenu._onClick === window.__oldMenuInput,
      ),
      true,
    );
  }
  await page.mouse.click(512, 292, { button: "right" });
  await page.waitForFunction(
    () =>
      window.__app.startMenu._onClick &&
      window.__app.startMenu._onClick !== window.__oldMenuInput,
  );
  // Actual canvas new-game flow, as in the existing exit browser test.
  for (const [x, y] of [
    [468, 360],
    [512, 234],
    [512, 234],
  ]) {
    await page.evaluate(() => {
      window.__oldMenuInput = window.__app.startMenu._onClick;
    });
    await page.mouse.click(x, y);
    await page.waitForFunction(
      () =>
        window.__app.startMenu._onClick &&
        window.__app.startMenu._onClick !== window.__oldMenuInput,
    );
  }
  await page.mouse.click(584, 455);
  await page.waitForFunction(
    () =>
      window.__app?.gameStarted &&
      document.querySelector("#startv").style.display === "none",
  );
  const baseline = await page.evaluate(async () => {
    const app = window.__app;
    app.gamebar._clockHoldRequested = true;
    app.gamebar.syncClock();
    if (app.saves.slots.some((slot) => slot.played))
      throw new Error("Context was not empty");
    const saved = await app.saveGame(0, "P24 isolated current");
    if (saved.saved !== "local")
      throw new Error(`Save blocked: ${saved.saved}`);
    const { saveLocalSaveSlots } = await import("/src/core/localstore.js");
    const old = structuredClone(app.saves.slots[0]);
    old.slot = 1;
    old.label = "P24 isolated old";
    delete old.state.legionPhaseVersion;
    const bad = structuredClone(app.saves.slots[0]);
    bad.slot = 2;
    bad.scenario_idx = 99999;
    const badMeta = structuredClone(app.saves.slots[0]);
    badMeta.slot = 3;
    // P58 fresh saves own nativeLegionSlots; delayedLegionReturns is only a
    // derived empty view and is intentionally ignored on restore. Corrupt the
    // authoritative fixed table instead to retain this preflight-rejection pin.
    badMeta.state.nativeLegionSlots.records[127].slot = 128;
    app.saves = await saveLocalSaveSlots({
      ...app.saves,
      slots: app.saves.slots.map((slot) => {
        if (slot.slot === 1) return old;
        if (slot.slot === 2) return bad;
        if (slot.slot === 3) return badMeta;
        return slot;
      }),
    });
    window.__savedBefore = JSON.stringify(app.saves);
    return {
      phase: app.scenario.legionPhaseVersion,
      fields: app.scenario.legionSlotCounters.length,
    };
  });
  assert.deepEqual(baseline, { phase: 1, fields: 128 });
  const rejected = await page.evaluate(async () => {
    const app = window.__app,
      scene = app.scenario,
      clock = app.clock;
    const selected = app.loadedSaveSlot,
      rng = JSON.stringify(app.originalRng.snapshot());
    const sceneData = JSON.stringify(scene);
    const results = [];
    for (const slot of [1, 2, 3]) {
      let message = "";
      try {
        await app.loadSave(slot);
      } catch (error) {
        message = error.message;
      }
      results.push({
        rejected: !!message,
        scene: app.scenario === scene,
        clock: app.clock === clock,
        sceneData: JSON.stringify(app.scenario) === sceneData,
        selected: app.loadedSaveSlot === selected,
        rng: JSON.stringify(app.originalRng.snapshot()) === rng,
      });
    }
    return {
      results,
      savesUnchanged: JSON.stringify(app.saves) === window.__savedBefore,
    };
  });
  assert.deepEqual(rejected, {
    results: [1, 2, 3].map(() => ({
      rejected: true,
      scene: true,
      clock: true,
      sceneData: true,
      selected: true,
      rng: true,
    })),
    savesUnchanged: true,
  });
  const title = await page.evaluate(async () => {
    const app = window.__app;
    const { aiTick } = await import("/src/game/ai.js");
    const { captureLegionContinuation } = await import(
      "/src/game/legioncontinuation.js"
    );
    const { canSnapshotState } = await import("/src/game/savegame.js");
    const g = app.scenario.generals[80];
    g.faction = app.scenario.player_faction;
    g.status = 1;
    // P58 fixed slots are authoritative: install the delayed record there
    // and rebuild the derived delayedLegionReturns view.
    const { rebindNativeLegionViews } = await import(
      "/src/game/nativelegions.js"
    );
    Object.assign(app.scenario.nativeLegionSlots.records[80], {
      status: 8,
      generalIdx: 80,
      faction: g.faction,
    });
    rebindNativeLegionViews(app.scenario);
    app.scenario.legionSlotCounters[80] = 1;
    aiTick(app, {
      legionBatchStart: 80,
      runCityDaily: false,
      settleDaily: false,
    });
    const batch = app._legionSlotBatch;
    if (!batch) throw new Error("Expected real 2A7E batch suspension");
    const owner = captureLegionContinuation(app);
    window.__oldBatch = batch;
    window.__forbiddenFinish = false;
    const started = app.playDelegatedEngage({}, () => {
      window.__forbiddenFinish = true;
    });
    const transition = app.engageTransition;
    if (!started || !transition?.active)
      throw new Error("Delegated transition did not start");
    const blocked = !canSnapshotState(app);
    window.__returning = app.returnToTitle(1);
    // Observe rejection without leaving an unhandled promise if a test fails.
    window.__returning.catch((error) => {
      window.__titleError = error.message;
    });
    return {
      blocked,
      cannotClaim: !owner.claim(),
      scene: app.scenario === null,
      batch: app._legionSlotBatch === null,
      transition: app.engageTransition === null && !transition.active,
    };
  });
  assert.deepEqual(title, {
    blocked: true,
    cannotClaim: true,
    scene: true,
    batch: true,
    transition: true,
  });
  await page.waitForFunction(
    () =>
      document.querySelector("#startv").style.display === "block" &&
      !!window.__app.startMenu._onClick,
  );
  const rows = await page.evaluate(() =>
    window.__app.startMenu._saveRows().map((row) => !!row.disabled),
  );
  assert.deepEqual(
    rows,
    [false, true, true, true],
    "current, incompatible, invalid index, invalid merged metadata",
  );
  await page.evaluate(() => {
    window.__saveInput = window.__app.startMenu._onClick;
  });
  for (const y of [348, 404, 460]) {
    await page.mouse.move(512, y);
    await page.mouse.click(512, y);
    assert.deepEqual(
      await page.evaluate(() => ({
        hover: window.__app.startMenu._hover,
        unchanged: window.__app.startMenu._onClick === window.__saveInput,
        title: window.__app.scenario === null,
      })),
      { hover: -1, unchanged: true, title: true },
    );
  }
  // The first save row: y=(768-256)/2+8+28.
  await page.mouse.click(512, 292);
  await page.waitForFunction(
    () =>
      window.__app.gameStarted &&
      document.querySelector("#startv").style.display === "none",
  );
  const restored = await page.evaluate(async () => {
    await window.__returning;
    const app = window.__app;
    app.gamebar._clockHoldRequested = true;
    app.gamebar.syncClock();
    const { loadLocalSaveSlots } = await import("/src/core/localstore.js");
    return {
      slot: app.loadedSaveSlot,
      phase: app.scenario.legionPhaseVersion,
      counter: app.scenario.legionSlotCounters[80],
      noLateFinish: !window.__forbiddenFinish,
      storedUnchanged:
        JSON.stringify(await loadLocalSaveSlots()) === window.__savedBefore,
      titleError: window.__titleError ?? null,
    };
  });
  assert.deepEqual(restored, {
    slot: 0,
    phase: 1,
    counter: 0,
    noLateFinish: true,
    storedUnchanged: true,
    titleError: null,
  });
  assert.deepEqual(forbidden, []);
  assert.deepEqual(errors, []);
  process.stdout.write(
    "P24 lifecycle browser: real new/save/reject/title/cancel/load; isolated IndexedDB unchanged; no console/page errors\n",
  );
} catch (error) {
  console.error(
    JSON.stringify({ errors, forbidden, failedRequests, url: page?.url() }),
  );
  throw error;
} finally {
  await browser?.close();
  await server.close();
}
