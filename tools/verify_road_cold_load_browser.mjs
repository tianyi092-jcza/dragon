// New isolated browser context; owned static listener; synthetic in-memory save.
// No SAVE.DAT, runtime API, user profile, or persistent save writes.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { startBrowserTestServer } from "./browser_test_server.mjs";
const require = createRequire(import.meta.url);
const {
  chromium,
} = require("C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright");
const server = await startBrowserTestServer();
const origin = `http://127.0.0.1:${server.port}`;
let browser;
const errors = [],
  forbidden = [];
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1024, height: 768 },
  });
  await context.addInitScript(() =>
    sessionStorage.setItem("wolong.intro.seen.v1", "1"),
  );
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
  page.setDefaultTimeout(30000);
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(`${origin}/index.html`);
  await page.waitForFunction(() => !!window.__app?.startMenu?._onClick);
  const before = await page.evaluate(async () => {
    const app = window.__app;
    await app.ensureGameAssets();
    app.ensureGameShell();
    const { createNewGameScenario } = await import("/src/game/world.js");
    const { countLegionActivation } = await import("/src/game/legioncounts.js");
    const state = createNewGameScenario(app.data.scenarios[16], 0, null);
    // Explicit phase1 saved edge input; edge0 point2004=(254,9), towards node2.
    // This tests public loading/assembly, not normal production of this snapshot.
    const legion = {
      idx: 0,
      slot: 0,
      leader: 0,
      generalIdx: 0,
      faction: 0,
      status: 0xc5,
      x: 254,
      y: 9,
      troops: 600,
      morale: 100,
      units: Array.from({ length: 6 }, () => ({ type: 1, troops: 100 })),
      moveDelay: 2,
      movePeriod: 3,
      roadStride: 4,
      roadPointAddress: 0x2004,
      roadEdgeOrNode: 0x800,
      targetNode: 2, // Web runtime id, not the DOS 0010h node address.
      targetCity: 2,
      targetX: state.cities[2].x,
      targetY: state.cities[2].y,
      commandState: 0,
    };
    countLegionActivation(state, legion);
    state.legions.push(legion);
    app.saves = {
      slots: [
        {
          slot: 0,
          played: true,
          state,
          scenario_idx: 16,
          label: "cold synthetic",
        },
      ],
    };
    window.__roadColdSaveBefore = JSON.stringify(app.saves);
    return {
      ready: app.world.roads.roadGraphReady(),
      fields: state.legionSlotCounters.length,
    };
  });
  assert.deepEqual(
    before,
    { ready: false, fields: 128 },
    "fixture must not prewarm graph",
  );
  const inspectLoad = async () =>
    page.evaluate(async () => {
      const app = window.__app;
      const success = await app.loadSave(0);
      const army = app.scenario.legions[0];
      return {
        success,
        ready: app.world.roads.roadGraphReady(),
        x: army.x,
        y: army.y,
        edgeId: army._march?.edgeId ?? null,
        stride: army._march?.stride ?? null,
        pointIndex: army._march?.pointIndex ?? null,
        targetNode: army.targetNode,
        moveDelay: army.moveDelay,
        movePeriod: army.movePeriod,
        selected: app.loadedSaveSlot,
        unchanged: JSON.stringify(app.saves) === window.__roadColdSaveBefore,
        fault: !!app._strategicBattleFailure,
      };
    });
  const loaded = await inspectLoad();
  const warm = await inspectLoad();
  const expected = {
    success: true,
    ready: true,
    x: 254,
    y: 9,
    edgeId: 0,
    stride: 4,
    pointIndex: 2,
    targetNode: 2,
    moveDelay: 2,
    movePeriod: 3,
    selected: 0,
    unchanged: true,
    fault: false,
  };
  assert.deepEqual(
    warm,
    expected,
    "warm control must prove the fixture can restore",
  );
  assert.deepEqual(
    loaded,
    expected,
    "cold public load must retain the saved edge before projection",
  );
  const overlap = await page.evaluate(async () => {
    const app = window.__app;
    const newer = structuredClone(app.saves.slots[0]);
    newer.slot = 1;
    newer.label = "newer synthetic";
    newer.state.legions[0].x = 253;
    newer.state.legions[0].roadPointAddress = 0x2008;
    app.saves.slots.push(newer);
    const saved = JSON.stringify(app.saves);
    const { canSnapshotState } = await import("/src/game/savegame.js");
    const olderLoad = app.loadSave(0).then(
      () => "accepted",
      (error) => error.name,
    );
    const newerLoad = app.loadSave(1);
    const pendingAllowed = canSnapshotState(app),
      pendingHeld = app.clock.hold;
    const outcomes = await Promise.all([olderLoad, newerLoad]);
    const army = app.scenario.legions[0];
    return {
      outcomes,
      selected: app.loadedSaveSlot,
      x: army.x,
      edge: army._march?.edgeId,
      index: army._march?.pointIndex,
      pendingAllowed,
      pendingHeld,
      readyAllowed: canSnapshotState(app),
      unchanged: JSON.stringify(app.saves) === saved,
    };
  });
  assert.deepEqual(
    overlap,
    {
      outcomes: ["AbortError", true],
      selected: 1,
      x: 253,
      edge: 0,
      index: 3,
      pendingAllowed: false,
      pendingHeld: true,
      readyAllowed: true,
      unchanged: true,
    },
    "pending assembly is held/unsavable; old load cannot overwrite new scene/slot",
  );

  // Controlled Web load promises isolate UI-entry ownership, not original AI callees.
  const entry = await page.evaluate(async () => {
    const app = window.__app;
    let releaseOld, releaseNew, oldStarted, newStarted;
    const oldReady = new Promise((resolve) => {
      oldStarted = resolve;
    });
    const newReady = new Promise((resolve) => {
      newStarted = resolve;
    });
    const older = app
      .enterGame(() => {
        oldStarted();
        return new Promise((resolve) => {
          releaseOld = resolve;
        });
      })
      .then(
        () => "accepted",
        (error) => error.name,
      );
    await oldReady;
    const newer = app.enterGame(() => {
      newStarted();
      return new Promise((resolve) => {
        releaseNew = resolve;
      });
    });
    await newReady;
    releaseOld();
    const rejected = await older;
    const held = !app.runtimeEnabled;
    releaseNew();
    await newer;
    app.gamebar._clockHoldRequested = true;
    app.gamebar.syncClock();
    return {
      rejected,
      held,
      active: app.gameStarted,
      enabled: app.runtimeEnabled,
    };
  });
  assert.deepEqual(entry, {
    rejected: "AbortError",
    held: true,
    active: true,
    enabled: true,
  });

  const title = await page.evaluate(async () => {
    const app = window.__app;
    const saved = JSON.stringify(app.saves);
    let releaseEntry, started;
    const ready = new Promise((resolve) => {
      started = resolve;
    });
    const pendingEntry = app
      .enterGame(() => {
        started();
        return new Promise((resolve) => {
          releaseEntry = resolve;
        });
      })
      .then(
        () => "accepted",
        (error) => error.name,
      );
    await ready;
    const pendingLoad = app.loadSave(0).then(
      () => "accepted",
      (error) => error.name,
    );
    // show() waits for a user's next choice; observe rejection without choosing one.
    window.__titleReturn = app.returnToTitle().catch((error) => {
      window.__titleError = error.message;
    });
    releaseEntry();
    const outcomes = await Promise.all([pendingEntry, pendingLoad]);
    return {
      outcomes,
      scene: app.scenario,
      clock: app.clock,
      active: app.gameStarted,
      enabled: app.runtimeEnabled,
      selected: app.loadedSaveSlot,
      unchanged: JSON.stringify(app.saves) === saved,
    };
  });
  assert.deepEqual(title, {
    outcomes: ["AbortError", "AbortError"],
    scene: null,
    clock: null,
    active: false,
    enabled: true,
    selected: 1,
    unchanged: true,
  });
  assert.deepEqual(errors, []);
  const syntheticSaves = await page.evaluate(() => window.__app.saves);
  await context.close();

  // A second fresh realm injects only a malformed road response, not a failed
  // AI callee. Failure must remain unsavable; a later valid load may recover.
  const brokenContext = await browser.newContext();
  await brokenContext.addInitScript(() =>
    sessionStorage.setItem("wolong.intro.seen.v1", "1"),
  );
  await brokenContext.route("**/*", (route) => {
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
  const brokenPage = await brokenContext.newPage();
  const failureConsoleErrors = [];
  brokenPage.on("pageerror", (error) => errors.push(String(error)));
  brokenPage.on("console", (message) => {
    if (message.type() === "error") failureConsoleErrors.push(message.text());
  });
  await brokenPage.route(`${origin}/road_graph.json`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "{}",
    }),
  );
  await brokenPage.goto(`${origin}/index.html`);
  await brokenPage.waitForFunction(() => !!window.__app?.startMenu?._onClick);
  const failed = await brokenPage.evaluate(async (saves) => {
    const app = window.__app;
    await app.ensureGameAssets();
    app.ensureGameShell();
    app.saves = saves;
    const before = JSON.stringify(saves);
    const { canSnapshotState } = await import("/src/game/savegame.js");
    const error = await app.loadSave(0).then(
      () => null,
      (reason) => reason.message,
    );
    return {
      error,
      allowed: canSnapshotState(app),
      pending: app._scenarioAssemblyPending === app.scenario,
      ready: app.world.roads.roadGraphReady(),
      noClock: app.clock == null,
      selected: app.loadedSaveSlot ?? null,
      unchanged: JSON.stringify(app.saves) === before,
    };
  }, syntheticSaves);
  assert.equal(failed.error, "invalid strategic road graph");
  assert.deepEqual(
    { ...failed, error: null },
    {
      error: null,
      allowed: false,
      pending: true,
      ready: false,
      noClock: true,
      selected: null,
      unchanged: true,
    },
  );
  // Stock profile has no optional __dragonDebug reporter; rejection is caught above.
  assert.deepEqual(failureConsoleErrors, []);
  await brokenPage.unroute(`${origin}/road_graph.json`);
  const recovered = await brokenPage.evaluate(async () => {
    const app = window.__app;
    const { canSnapshotState } = await import("/src/game/savegame.js");
    const ok = await app.loadSave(0);
    return {
      ok,
      edge: app.scenario.legions[0]._march?.edgeId,
      index: app.scenario.legions[0]._march?.pointIndex,
      allowed: canSnapshotState(app),
      pending: !!app._scenarioAssemblyPending,
    };
  });
  assert.deepEqual(recovered, {
    ok: true,
    edge: 0,
    index: 2,
    allowed: true,
    pending: false,
  });
  assert.deepEqual(
    failureConsoleErrors,
    [],
    "no unexpected errors during recovery",
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(forbidden, []);
  process.stdout.write(
    "OK: cold/warm loading, overlapping loads, entry/title ownership, rejected assets and retry; synthetic saves unchanged\n",
  );
} finally {
  await browser?.close();
  await server.close();
}
