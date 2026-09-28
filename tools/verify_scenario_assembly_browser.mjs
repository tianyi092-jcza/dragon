// Run ONLY from an owned TEMP copy of tools/ + web/, never a shared/user profile.
// Real App/title/save entry paths; synthetic slots, fresh contexts, own static port.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { startBrowserTestServer } from "./browser_test_server.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    "C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright",
);
const server = await startBrowserTestServer();
const origin = `http://127.0.0.1:${server.port}`;
const errors = [],
  forbidden = [],
  requests = [];
let browser;
try {
  browser = await chromium.launch({ headless: true });
  async function pageFor() {
    const context = await browser.newContext({
      viewport: { width: 1024, height: 768 },
    });
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
      requests.push(url.pathname);
      return route.continue();
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(String(error)));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("requestfailed", (request) =>
      errors.push(`${request.url()} ${request.failure()?.errorText}`),
    );
    await page.goto(`${origin}/index.html`);
    await page.waitForFunction(() => !!window.__app?.startMenu?._onClick);
    await page.evaluate(async () => {
      const app = window.__app;
      await app.ensureGameAssets();
      const { createNewGameScenario } = await import("/src/game/world.js");
      const { prepareScenario } = await import("/src/game/scenarioassembly.js");
      const { snapshotState } = await import("/src/game/savegame.js");
      const prepared = await prepareScenario({
        raw: createNewGameScenario(app.data.scenarios[16], 0, null),
        idx: 16,
        content: app.content,
        world: app.world,
        mode: "fresh",
      });
      app.saves.slots[0] = snapshotState(
        {
          scenario: prepared.scenario,
          scenarioIdx: 16,
          clock: app.clock ?? { year: 190, month: 1, day: 1 },
          originalRng: app.originalRng,
          content: app.content,
          world: app.world,
        },
        0,
        "synthetic v2",
      );
    });
    return { page, context };
  }
  const cases = process.env.ROAD_SAVE_CASE
    ? [process.env.ROAD_SAVE_CASE]
    : [
        "title",
        "preflight",
        "installed-pending",
        "installed-failed",
        "snapshot",
        "ratings",
        "v2",
      ];
  for (const name of cases) {
    const { page, context } = await pageFor();
    if (name === "title") {
      const first = requests.length;
      const result = await page.evaluate(async () => {
        const app = window.__app,
          menu = app.startMenu;
        const bad = structuredClone(app.saves.slots[0]);
        bad.slot = 1;
        bad.webMeta.scenarioAssembly.world.revision = "bad";
        app.saves.slots[1] = bad;
        const rows = menu._saveRows();
        let selected = null;
        const prompt = menu._chooseSave().then((value) => {
          selected = value;
        });
        const rect = menu.cv.getBoundingClientRect();
        const point = (row, button = 0) => ({
          button,
          clientX: rect.left + (200 * rect.width) / 640,
          clientY: rect.top + ((110 + row * 56) * rect.height) / 400,
        });
        menu._onMove(point(1));
        const badHover = menu._hover;
        menu._onClick(point(1));
        await new Promise((resolve) => setTimeout(resolve, 0));
        const badClick = selected;
        menu._onMove(point(2));
        const emptyHover = menu._hover;
        menu._onClick(point(2));
        await new Promise((resolve) => setTimeout(resolve, 0));
        const emptyClick = selected;
        // Current slot changes after rows/prompt construction: no cached admission.
        app.saves.slots[0].webMeta.scenarioAssembly.content.chapterId = "wrong";
        menu._onMove(point(0));
        const staleHover = menu._hover;
        menu._onClick(point(0));
        await new Promise((resolve) => setTimeout(resolve, 0));
        const staleClick = selected;
        const staleDisabled = rows[0].disabled;
        menu._onClick(point(0, 2));
        await prompt;
        const runtime = app.runtimeEnabled,
          active = app.gameStarted;
        let enters = 0;
        const enter = app.enterGame;
        app.enterGame = async () => {
          enters++;
        };
        let rejected = false;
        try {
          await app.beginSavedGame(1);
        } catch {
          rejected = true;
        }
        app.enterGame = enter;
        return {
          badHover,
          badClick,
          emptyHover,
          emptyClick,
          staleHover,
          staleClick,
          staleDisabled,
          rejected,
          enters,
          runtimeUnchanged: runtime === app.runtimeEnabled,
          activeUnchanged: active === app.gameStarted,
          graphCold: !app.world.roads.roadGraphReady(),
        };
      });
      assert.deepEqual(result, {
        badHover: -1,
        badClick: null,
        emptyHover: -1,
        emptyClick: null,
        staleHover: -1,
        staleClick: null,
        staleDisabled: true,
        rejected: true,
        enters: 0,
        runtimeUnchanged: true,
        activeUnchanged: true,
        // P58 setup creates a genuine v2 snapshot through prepareScenario,
        // which necessarily warms this realm's graph. The request slice below
        // remains the authoritative proof that invalid title rows fetch nothing.
        graphCold: false,
      });
      assert.deepEqual(
        requests
          .slice(first)
          .filter((path) => /road_|mmap_|map_tiles/.test(path)),
        [],
      );
    } else if (name === "preflight") {
      const result = await page.evaluate(async () => {
        const app = window.__app;
        await app.ensureGameAssets();
        app.ensureGameShell();
        await app.beginNewGame(16, 0, null);
        app.gamebar._clockHoldRequested = false;
        const live = app.scenario,
          clock = app.clock;
        const { canSnapshotState } = await import("/src/game/savegame.js");
        const rng = JSON.stringify(app.originalRng.snapshot());
        const load = app.world.terrain.loadTerrain;
        const gates = [];
        app.world.terrain.loadTerrain = () =>
          new Promise((resolve, reject) => gates.push({ resolve, reject }));
        const newer = structuredClone(app.saves.slots[0]);
        newer.slot = 1;
        newer.label = "newer";
        const savedRng = app.originalRng.snapshot();
        savedRng.calls = 111;
        newer.webMeta.originalRng = savedRng;
        app.saves.slots[1] = newer;
        const saved = JSON.stringify(app.saves);
        const olderLoad = app.loadSave(0).then(
          () => "accepted",
          (error) => error.name,
        );
        const pendingSame = live === app.scenario && clock === app.clock;
        const held = app.clock.hold,
          prohibited = !canSnapshotState(app);
        const pendingSave = await app.saveGame(2, "pending");
        const newerLoad = app.loadSave(1);
        gates[0].reject(new Error("synthetic stale asset failure"));
        const older = await olderLoad;
        const stillHeld = app.clock.hold && !!app._scenarioAssemblyPending;
        const oldRngUntouched =
          JSON.stringify(app.originalRng.snapshot()) === rng;
        app.mapPointerHold = true;
        app.gamebar.settingsOpen = true;
        gates[1].resolve();
        await newerLoad;
        const committed =
          app.loadedSaveSlot === 1 && app.originalRng.calls === 111;
        const independentHold = app.clock.hold;
        app.world.terrain.loadTerrain = load;
        // Current failure must preserve a pre-existing live scene/RNG/slot.
        const current = app.scenario,
          currentClock = app.clock;
        const currentRng = JSON.stringify(app.originalRng.snapshot());
        app.world.terrain.loadTerrain = async () => {
          throw new Error("synthetic current asset failure");
        };
        let rejected = false;
        try {
          await app.loadSave(0);
        } catch {
          rejected = true;
        }
        const currentPreserved =
          current === app.scenario &&
          currentClock === app.clock &&
          app.loadedSaveSlot === 1 &&
          currentRng === JSON.stringify(app.originalRng.snapshot()) &&
          !app._scenarioAssemblyPending;
        // A fails only AFTER B has committed: no stale rollback/slot/RNG writes.
        let rejectLate,
          calls = 0;
        app.world.terrain.loadTerrain = () =>
          ++calls === 1
            ? new Promise((_resolve, reject) => {
                rejectLate = reject;
              })
            : load();
        const lateA = app.loadSave(0).then(
          () => "accepted",
          (error) => error.name,
        );
        await app.loadSave(1);
        const latest = app.scenario,
          latestClock = app.clock;
        rejectLate(new Error("late A failure after committed B"));
        const lateFailure = await lateA;
        const latePreserved =
          app.scenario === latest &&
          app.clock === latestClock &&
          app.loadedSaveSlot === 1 &&
          currentRng === JSON.stringify(app.originalRng.snapshot()) &&
          !app._scenarioAssemblyPending;
        // Return-to-title invalidates pending load and its saved RNG.
        let release;
        app.world.terrain.loadTerrain = () =>
          new Promise((resolve) => {
            release = resolve;
          });
        const pending = app.loadSave(0).then(
          () => "accepted",
          (error) => error.name,
        );
        void app.returnToTitle();
        release();
        const cancelled = await pending;
        const title =
          app.scenario === null &&
          app.clock === null &&
          app.loadedSaveSlot === 1 &&
          currentRng === JSON.stringify(app.originalRng.snapshot());
        app.world.terrain.loadTerrain = load;
        return {
          pendingSame,
          held,
          prohibited,
          pendingSave: pendingSave.saved,
          older,
          stillHeld,
          oldRngUntouched,
          committed,
          independentHold,
          rejected,
          currentPreserved,
          lateFailure,
          latePreserved,
          cancelled,
          title,
          savesUnchanged: saved === JSON.stringify(app.saves),
        };
      });
      assert.deepEqual(result, {
        pendingSame: true,
        held: true,
        prohibited: true,
        pendingSave: "blocked",
        older: "Error",
        stillHeld: true,
        oldRngUntouched: true,
        committed: true,
        independentHold: true,
        rejected: true,
        currentPreserved: true,
        lateFailure: "Error",
        latePreserved: true,
        cancelled: "AbortError",
        title: true,
        savesUnchanged: true,
      });
    } else if (name === "installed-pending" || name === "installed-failed") {
      const result = await page.evaluate(async (postcommitFailure) => {
        const app = window.__app;
        const { canSnapshotState } = await import("/src/game/savegame.js");
        await app.beginNewGame(16, 0, null);
        app.hud.closeAll();
        app.gamebar.resetScenarioUi();
        app.gamebar._clockHoldRequested = false;
        app.mapPointerHold = false;
        app.gamebar.syncClock();
        const isolated = !app.clock.hold && canSnapshotState(app);
        const baselineSave = await app.saveGame(2, "complete baseline");
        const priorSlot = app.loadedSaveSlot,
          priorLabel = app._lastLoadedSaveLabel;
        app.saves.slots[0].webMeta.originalRng = app.originalRng.snapshot();
        app.saves.slots[0].webMeta.originalRng.calls = 111;
        const bad = structuredClone(app.saves.slots[0]);
        bad.slot = 1;
        bad.state.cities[0].x++;
        bad.webMeta.originalRng.calls = 999;
        app.saves.slots[1] = bad;
        const saved = JSON.stringify(app.saves);
        const originalSetSeason = app.setSeason;
        let reached, release, rejectSeason;
        const installed = new Promise((resolve) => {
          reached = resolve;
        });
        const seasonGate = new Promise((resolve, reject) => {
          release = resolve;
          rejectSeason = reject;
        });
        app.setSeason = (i, isCurrent) => {
          reached();
          return seasonGate.then(() =>
            originalSetSeason.call(app, i, isCurrent),
          );
        };
        const oldLive = app.scenario;
        const loadA = app.loadSave(0).then(
          () => "accepted",
          (error) => error.name,
        );
        await installed;
        const live = app.scenario,
          clock = app.clock;
        const liveBytes = JSON.stringify(live),
          rng = JSON.stringify(app.originalRng.snapshot());
        let image = app.view.seasonImg,
          imageWrites = 0;
        Object.defineProperty(app.view, "seasonImg", {
          configurable: true,
          get: () => image,
          set: (value) => {
            image = value;
            imageWrites++;
          },
        });
        const aInstalled =
          oldLive !== live && clock.hold && !canSnapshotState(app);
        let aResult;
        if (postcommitFailure) {
          rejectSeason(new Error("synthetic postcommit season failure"));
          aResult = await loadA;
        }
        let bResult;
        try {
          await app.loadSave(1);
          bResult = "accepted";
        } catch (error) {
          bResult = error.message;
        }
        const afterRejected = {
          held: clock.hold,
          prohibited: !canSnapshotState(app),
          unchanged:
            app.scenario === live &&
            app.clock === clock &&
            JSON.stringify(live) === liveBytes &&
            JSON.stringify(app.originalRng.snapshot()) === rng &&
            app.loadedSaveSlot === priorSlot &&
            app._lastLoadedSaveLabel === priorLabel,
        };
        const rejectedSave = await app.saveGame(3, "must stay blocked");
        if (!postcommitFailure) {
          release();
          aResult = await loadA;
        }
        const staleCannotFinish =
          imageWrites === 0 &&
          app.loadedSaveSlot === priorSlot &&
          app._lastLoadedSaveLabel === priorLabel &&
          app.scenario === live &&
          app.clock === clock &&
          JSON.stringify(app.originalRng.snapshot()) === rng;
        const stillProtected = clock.hold && !canSnapshotState(app);
        const slotsUntouched = JSON.stringify(app.saves) === saved;
        app.setSeason = originalSetSeason;
        let cleanup;
        if (postcommitFailure) {
          // Title explicitly discards incomplete live state; no stale commit right is restored.
          void app.returnToTitle();
          cleanup =
            app.scenario === null &&
            app.clock === null &&
            canSnapshotState(app);
        } else {
          // A successful replacement clears only assembly protection, not an independent hold.
          app.gamebar.settingsOpen = true;
          await app.loadSave(0);
          cleanup =
            app.scenario !== live &&
            app.loadedSaveSlot === 0 &&
            canSnapshotState(app) &&
            app.clock.hold;
          app.gamebar.settingsOpen = false;
          app.gamebar.syncClock();
          cleanup = cleanup && !app.clock.hold;
        }
        return {
          isolated,
          baselineSave: baselineSave.saved,
          aInstalled,
          bResult,
          afterRejected,
          rejectedSave: rejectedSave.saved,
          aResult,
          staleCannotFinish,
          stillProtected,
          slotsUntouched,
          cleanup,
        };
      }, name === "installed-failed");
      assert.match(result.bResult, /city.*mismatch/i);
      assert.deepEqual(
        { ...result, bResult: null },
        {
          isolated: true,
          baselineSave: "local",
          aInstalled: true,
          bResult: null,
          afterRejected: { held: true, prohibited: true, unchanged: true },
          rejectedSave: "blocked",
          aResult: name === "installed-failed" ? "Error" : "AbortError",
          staleCannotFinish: true,
          stillProtected: true,
          slotsUntouched: true,
          cleanup: true,
        },
      );
    } else if (name === "snapshot") {
      const result = await page.evaluate(async () => {
        const app = window.__app;
        await app.beginNewGame(16, 0, null);
        const { loadLocalSaveSlots } = await import("/src/core/localstore.js");
        const { snapshotState } = await import("/src/game/savegame.js");
        const freshEmpty = app.scenario.legions.length === 0;
        const first = await app.saveGame(0, "isolated");
        const durable = JSON.stringify(await loadLocalSaveSlots());
        const saved = JSON.stringify(app.saves),
          live = JSON.stringify(app.scenario);
        const snapshot = snapshotState(app, 1, "detached");
        snapshot.state.cities[0].faction = 255;
        if (!snapshot.webMeta.scenarioAssembly)
          return { missingMetadata: true };
        snapshot.webMeta.scenarioAssembly.world.id = "changed copy";
        const detached = live === JSON.stringify(app.scenario);
        const idx = app.scenarioIdx;
        app.scenarioIdx = 17;
        const malformed = await app.saveGame(1, "bad identity");
        app.scenarioIdx = idx;
        const failedSnapshotPreserved =
          saved === JSON.stringify(app.saves) &&
          durable === JSON.stringify(await loadLocalSaveSlots());
        // Abort a real transaction in this NEW browser profile, not a fake successful put.
        const transaction = IDBDatabase.prototype.transaction;
        IDBDatabase.prototype.transaction = function (...args) {
          const tx = transaction.apply(this, args);
          if (args[1] === "readwrite") queueMicrotask(() => tx.abort());
          return tx;
        };
        let failed;
        try {
          failed = await app.saveGame(2, "aborted");
        } finally {
          IDBDatabase.prototype.transaction = transaction;
        }
        const transactionPreserved =
          saved === JSON.stringify(app.saves) &&
          durable === JSON.stringify(await loadLocalSaveSlots()) &&
          live === JSON.stringify(app.scenario) &&
          app.loadedSaveSlot === 0;
        // Successful final load is the real public entry. P58 default saves
        // are v2 and therefore retain their exact assembly identity; explicit
        // v1 restore remains covered by the unit assembly suite.
        const storedIdentity = app.saves.slots[0].webMeta.scenarioAssembly;
        app.saves.slots[1] = structuredClone(app.saves.slots[0]);
        app.saves.slots[1].slot = 1;
        await app.beginSavedGame(1);
        return {
          freshEmpty,
          first: first.saved,
          detached,
          malformed: malformed.saved,
          failedSnapshotPreserved,
          failed: failed.saved,
          transactionPreserved,
          roadVersion: storedIdentity?.roadVersion,
          reloaded: app.loadedSaveSlot === 1,
          empty: app.scenario.legions.length === 0,
        };
      });
      assert.deepEqual(result, {
        freshEmpty: true,
        first: "local",
        detached: true,
        malformed: "failed",
        failedSnapshotPreserved: true,
        failed: "failed",
        transactionPreserved: true,
        roadVersion: 2,
        reloaded: true,
        empty: true,
      });
    } else if (name === "ratings") {
      const result = await page.evaluate(async () => {
        const app = window.__app;
        const template = JSON.stringify(app.content.chapter(16).template);
        const sourceCounts = JSON.parse(template).nativeFactionSlotRaw.map(
          (raw) => Number.parseInt(raw.slice(0x18 * 2, 0x19 * 2), 16),
        );
        await app.beginNewGame(16, 0, null);
        const sc = app.scenario;
        const advisor = sc.generals[sc.factions[0].advisor_idx];
        const excludedRecord = JSON.stringify(sc.generals[127]);
        const fresh = {
          cao: sc.generals[16].battle_rating,
          dian: sc.generals[88].battle_rating,
          advisorAttr: advisor.attr,
          advisorActive: advisor.active,
          advisorRating: advisor.battle_rating,
          countDelta: sourceCounts[0] - sc.factions[0].nativeGeneralCount,
          onlyPlayerChanged: sc.nativeFactionSlots.records.every((f, idx) =>
            f.nativeGeneralCount === ((sourceCounts[idx] - (idx === 0 ? 1 : 0)) & 255)),
          sharedFaction: sc.factions[0] === sc.nativeFactionSlots.records[0],
          excluded: sc.generals[127].battle_rating,
          templateUnchanged: template === JSON.stringify(app.content.chapter(16).template),
        };
        // Explicit mid-game stored values are not necessarily a fresh formula.
        // Snapshot restore must not replay DOS 1BE9 or repair/normalize them.
        sc.generals[16].battle_rating = 231;
        advisor.battle_rating = 197;
        sc.generals[127].battle_rating = 165;
        const rng = JSON.stringify(app.originalRng.snapshot());
        const saved = await app.saveGame(2, "G1F isolated snapshot");
        const { loadLocalSaveSlots } = await import("/src/core/localstore.js");
        const stored = (await loadLocalSaveSlots()).slots[2];
        const body = JSON.stringify(stored);
        // Real title entry with isolated IndexedDB body, not a direct hot swap.
        const show = app.startMenu.show;
        app.startMenu.show = async () => {};
        try { await app.returnToTitle(); }
        finally { app.startMenu.show = show; }
        if (app.scenario !== null || app.gameStarted)
          throw new Error("restore must cross title boundary");
        app.saves.slots[2] = stored;
        await app.beginSavedGame(2);
        const restoredAdvisor = app.scenario.generals[advisor.idx];
        const restoreResult = {
          fresh,
          restoredAdvisorState: [restoredAdvisor.attr, restoredAdvisor.active, restoredAdvisor.is_player],
          countPreserved: app.scenario.factions[0].nativeGeneralCount === sc.factions[0].nativeGeneralCount,
          saved: saved.saved,
          restored: [app.scenario.generals[16].battle_rating,
            app.scenario.generals[advisor.idx].battle_rating,
            app.scenario.generals[127].battle_rating],
          sameRng: rng === JSON.stringify(app.originalRng.snapshot()),
          storedUnchanged: body === JSON.stringify((await loadLocalSaveSlots()).slots[2]),
        };
        // Starting again clones the chapter, not the previous game's decremented F18.
        await app.beginNewGame(16, 0, null);
        const restartedOnce = app.scenario.factions[0].nativeGeneralCount === sc.factions[0].nativeGeneralCount;
        await app.beginNewGame(16, 0, { name: "自定", hao: "測試", portrait: 0 });
        const custom = app.scenario;
        return { ...restoreResult, restartedOnce,
          customPreserved: custom.factions[0].nativeGeneralCount === sourceCounts[0] &&
            custom.generals[advisor.idx].attr === 0x80 &&
            custom.generals[advisor.idx].active === true &&
            !custom.generals[advisor.idx].is_player &&
            JSON.stringify(custom.generals[127]) === excludedRecord,
        };
      });
      assert.deepEqual(result, {
        fresh: { cao: 54, dian: 40, advisorAttr: 0, advisorActive: false, advisorRating: 0,
          countDelta: 1, onlyPlayerChanged: true, sharedFaction: true,
          excluded: 0, templateUnchanged: true },
        saved: "local", restored: [231, 197, 165], sameRng: true, storedUnchanged: true,
        restoredAdvisorState: [0, false, true], countPreserved: true,
        restartedOnce: true, customPreserved: true,
      });
    } else if (name === "v2") {
      // P58: an alternate valid v2 graph with actual catalog city slots is
      // playable; the saved stock identity still rejects that replacement.
      await page.route(`${origin}/road_graph.json`, async (route) => {
        const graph = await page.evaluate(() => ({
          version: 2,
          width: 384,
          height: 256,
          edges: [],
          nodes: window.__app.data.scenarios[16].cities.map((city) => ({
            id: city.idx,
            x: city.x,
            y: city.y,
            edgeSlots: [0, 0, 0, 0],
          })),
        }));
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(graph),
        });
      });
      const result = await page.evaluate(async () => {
        const app = window.__app;
        const rng = JSON.stringify(app.originalRng.snapshot()),
          saved = JSON.stringify(app.saves);
        app.loadedSaveSlot = 3;
        let fresh, restore;
        try {
          await app.setScenario(16, 0, null);
        } catch (error) {
          fresh = error.message;
        }
        try {
          await app.loadSave(0);
        } catch (error) {
          restore = error.message;
        }
        return {
          fresh,
          restore,
          sceneCities: app.scenario?.cities?.length ?? null,
          slot: app.loadedSaveSlot,
          unchanged:
            saved === JSON.stringify(app.saves) &&
            rng === JSON.stringify(app.originalRng.snapshot()),
          pending: !!app._scenarioAssemblyPending,
        };
      });
      assert.equal(result.fresh, undefined);
      assert.equal(result.restore, undefined);
      assert.equal(result.sceneCities, 192);
      assert.equal(result.slot, 0);
      assert.equal(result.unchanged, true);
      assert.equal(result.pending, false);
    } else throw new Error(`Unknown case ${name}`);
    console.log(`PASS ${name}`);
    // Let explicitly awaited title/asset callbacks settle before closing a realm.
    await page.waitForTimeout(100);
    await context.close();
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(forbidden, []);
  console.log(
    "OK: fresh isolated title/preflight/installed/snapshot/v2 boundaries; no console/page/request errors",
  );
} finally {
  await browser?.close();
  await server.close();
}
