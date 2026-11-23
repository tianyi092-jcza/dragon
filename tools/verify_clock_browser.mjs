import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { startBrowserTestServer, mockBuiltinOnlyCatalog } from "./browser_test_server.mjs";

import { OriginalBattleRng } from "../web/src/game/battle/originalrng.js";

const require = createRequire(import.meta.url);
const playwrightPath =
  process.env.PLAYWRIGHT_MODULE ||
  "C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright";
const { chromium } = require(playwrightPath);
const server = await startBrowserTestServer();
const { port } = server;
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1024, height: 768 },
    deviceScaleFactor: 2,
  });
  await mockBuiltinOnlyCatalog(context, `http://127.0.0.1:${port}`);
  // EC82 reads local RTC only once before KI.EXE's title flow. Fix browser
  // wall time so this product-lifecycle assertion is deterministic.
  const seedTime = new Date(2000, 0, 1, 13, 45, 9).getTime();
  await context.addInitScript(
    ({ timestamp, origin }) => {
      if (location.origin !== origin) return;
      // Exercise strategic timing, not intro media cancellation. The opening
      // has its own test; skip it before any MP3 request starts in this realm.
      sessionStorage.setItem("wolong.intro.seen.v1", "1");
      const NativeDate = Date;
      class FixedDate extends NativeDate {
        constructor(...args) {
          super(...(args.length ? args : [timestamp]));
        }
        static now() {
          return timestamp;
        }
      }
      globalThis.Date = FixedDate;
    },
    { timestamp: seedTime, origin: `http://127.0.0.1:${port}` },
  );
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("requestfailed", (request) =>
    errors.push(
      `${request.method()} ${request.url()}: ${request.failure()?.errorText}`,
    ),
  );

  await page.goto(`http://127.0.0.1:${port}/index.html`);
  await page.waitForFunction(() => !!window.__app?.startMenu?._onClick);
  const startupRng = await page.evaluate(() => {
    window.__clockVerifyStartupRng = window.__app.originalRng;
    return window.__app.originalRng.snapshot();
  });
  assert.deepEqual(
    startupRng,
    new OriginalBattleRng({ ch: 0x13, cl: 0x45, dh: 0x09 }).snapshot(),
    "browser startup must seed EC82 from local BCD clock, not zero fixture",
  );
  async function clickAndRebind(x, y) {
    for (let attempt = 0; attempt < 4; attempt++) {
      await page.evaluate(() => {
        window.__clockVerifyMenuHandler =
          window.__app?.startMenu?._onClick ?? null;
      });
      await page.mouse.click(x, y);
      const rebound = await page
        .waitForFunction(
          () =>
            window.__app?.startMenu?._onClick &&
            window.__app.startMenu._onClick !== window.__clockVerifyMenuHandler,
          null,
          { timeout: 3000 },
        )
        .then(
          () => true,
          () => false,
        );
      if (rebound) return;
    }
    throw new Error(`start menu click at ${x},${y} did not rebind`);
  }

  await clickAndRebind(468, 360);
  await clickAndRebind(512, 234);
  await clickAndRebind(512, 234);
  await page.mouse.click(584, 455);
  await page.waitForFunction(
    () =>
      document.querySelector("#startv")?.style.display === "none" &&
      window.__app?.gameStarted === true &&
      window.__app?.runtimeEnabled === true,
  );
  await page.waitForTimeout(100);

  const initial = await page.evaluate(() => {
    const app = window.__app;
    const canvas = document.querySelector("#cv");
    const proto = Object.getOwnPropertyDescriptor(
      HTMLCanvasElement.prototype,
      "width",
    );
    const heightProto = Object.getOwnPropertyDescriptor(
      HTMLCanvasElement.prototype,
      "height",
    );
    const verify = { writes: { width: 0, height: 0 }, pointerCalls: 0,
      refreshes: 0, mapDraws: 0, legends: 0, strategicFrames: [] };
    window.__clockVerify = verify;
    for (const [object, key, counter] of [[app, 'refreshStrategicView', 'refreshes'],
      [app.view, 'draw', 'mapDraws'], [app.hud, 'buildLegend', 'legends']]) {
      const original = object[key];
      object[key] = function(...args) { verify[counter]++; return original.apply(this, args); };
    }
    // Real App callbacks remain installed: city AI, native slots, hourly events,
    // weather and message holds. Check the actual RAF, not an isolated slot pump.
    const advance = app.clock.advanceFrame;
    app.clock.advanceFrame = function(dt) {
      const before = { refreshes: verify.refreshes, mapDraws: verify.mapDraws,
        legends: verify.legends, hold: this.hold };
      const result = advance.call(this, dt);
      if (!before.hold && !this.hold) verify.strategicFrames.push({
        refreshes: verify.refreshes - before.refreshes,
        mapDraws: verify.mapDraws - before.mapDraws,
        legends: verify.legends - before.legends,
      });
      return result;
    };
    Object.defineProperty(canvas, "width", {
      configurable: true,
      get: () => proto.get.call(canvas),
      set: (value) => {
        verify.writes.width++;
        proto.set.call(canvas, value);
      },
    });
    Object.defineProperty(canvas, "height", {
      configurable: true,
      get: () => heightProto.get.call(canvas),
      set: (value) => {
        verify.writes.height++;
        heightProto.set.call(canvas, value);
      },
    });
    const originalSetPointer = app.view.setPointer.bind(app.view);
    app.view.setPointer = (...args) => {
      verify.pointerCalls++;
      return originalSetPointer(...args);
    };
    app.clock.strategicSpeed = 4;
    return {
      backing: [canvas.width, canvas.height],
      dpr: devicePixelRatio,
      tick: app.clock.strategicTickSerial,
      steps: app.clock.SPEEDS,
      rngStreamReused: app.originalRng === window.__clockVerifyStartupRng,
    };
  });
  assert.deepEqual(initial.backing, [2048, 1536]);
  assert.equal(initial.dpr, 2);
  assert.deepEqual(initial.steps, [24, 16, 9.6, 6.4, 4.8]);
  assert.equal(
    initial.rngStreamReused,
    true,
    "new-game load must continue the process RNG rather than reseeding EC82",
  );

  await page.waitForTimeout(100);
  const stable = await page.evaluate(() => ({
    writes: window.__clockVerify.writes,
    backing: [
      document.querySelector("#cv").width,
      document.querySelector("#cv").height,
    ],
  }));
  assert.deepEqual(stable.backing, [2048, 1536]);
  assert.deepEqual(stable.writes, { width: 0, height: 0 });

  const pausedAtFirstMove = await page.evaluate(() => {
    const canvas = document.querySelector("#cv");
    for (let index = 0; index < 100; index++)
      canvas.dispatchEvent(
        new MouseEvent("mousemove", {
          clientX: 100 + index,
          clientY: 120,
          bubbles: true,
        }),
      );
    return window.__app.clock.strategicTickSerial;
  });
  // P58 native-v2 first strategic frame performs strict fixed-slot/city
  // work and may exceed the old 100ms CI budget. Wait for the one coalesced
  // RAF result itself; the map hold was already asserted synchronously below.
  await page.waitForFunction(
    () => window.__clockVerify.pointerCalls === 1,
    null,
    { timeout: 2000 },
  );
  const firstPointerEvidence = await page.evaluate(() => ({
    hold: window.__app.clock.hold,
    tick: window.__app.clock.strategicTickSerial,
    pointerCalls: window.__clockVerify.pointerCalls,
  }));
  assert.equal(
    firstPointerEvidence.hold,
    true,
    "map pointer activity must hold strategy immediately",
  );
  assert.equal(
    firstPointerEvidence.tick,
    pausedAtFirstMove,
    "no strategic rule step may run while the pointer is moving",
  );
  assert.equal(
    firstPointerEvidence.pointerCalls,
    1,
    "100 pointer events coalesce to one RAF update",
  );

  // A later move restarts the full one-second idle window.
  await page.waitForTimeout(600);
  const pausedAtLastMove = await page.evaluate(() => {
    document.querySelector("#cv").dispatchEvent(
      new MouseEvent("mousemove", {
        clientX: 400,
        clientY: 120,
        bubbles: true,
      }),
    );
    return window.__app.clock.strategicTickSerial;
  });
  await page.waitForTimeout(600);
  const activePointerEvidence = await page.evaluate(() => ({
    hold: window.__app.clock.hold,
    tick: window.__app.clock.strategicTickSerial,
    pointerCalls: window.__clockVerify.pointerCalls,
  }));
  assert.equal(activePointerEvidence.hold, true);
  assert.equal(activePointerEvidence.tick, pausedAtLastMove);
  assert.equal(activePointerEvidence.pointerCalls, 2);

  await page.waitForTimeout(500);
  const idlePointerEvidence = await page.evaluate(() => ({
    hold: window.__app.clock.hold,
    tick: window.__app.clock.strategicTickSerial,
  }));
  assert.equal(
    idlePointerEvidence.hold,
    false,
    "strategy resumes only after one full second without map movement",
  );
  assert.ok(
    idlePointerEvidence.tick > activePointerEvidence.tick,
    "strategy resumes after the idle delay",
  );

  // 顶栏属于UI而非地图：其hover不能重新取得地图专属的计时hold。
  const tickBeforeUiHover = await page.evaluate(
    () => window.__app.clock.strategicTickSerial,
  );
  await page.evaluate(() => {
    document.querySelector("#cv").dispatchEvent(
      new MouseEvent("mousemove", {
        clientX: window.__app.gamebar.bx + 10,
        clientY: 16,
        bubbles: true,
      }),
    );
  });
  await page.waitForTimeout(100);
  const uiHoverEvidence = await page.evaluate(() => ({
    hit: window.__app.gamebar.hitTest(window.__app.gamebar.bx + 10, 16),
    hold: window.__app.clock.hold,
    tick: window.__app.clock.strategicTickSerial,
  }));
  assert.equal(uiHoverEvidence.hit, true, "fixture coordinate must be UI");
  assert.equal(uiHoverEvidence.hold, false);
  assert.ok(uiHoverEvidence.tick > tickBeforeUiHover);
  const batches = await page.evaluate(() => window.__clockVerify.strategicFrames.filter(f => f.refreshes > 1));
  assert.ok(batches.length > 0, 'full App advances multiple completed slot batches per RAF');
  assert.ok(batches.every(f => f.mapDraws === 0 && f.legends === 0),
    'ordinary rule batches do not repeat Canvas/DOM work inside advanceFrame');

  // Global UI input locks do not erase exposed-map pointer movement.
  for (const mode of ["settings", "submenu"]) {
    await page.evaluate((kind) => {
      const app = window.__app;
      app.gamebar.settingsOpen = kind === "settings";
      app.gamebar.selectedSubmenu = kind === "submenu" ? 0 : null;
      app.gamebar.syncClock();
    }, mode);
    await page.waitForTimeout(1100);
    const locked = await page.evaluate((kind) => {
      const app = window.__app;
      const inputLocked = app.gamebar.hitTest(100, 120);
      const chrome = app.gamebar.hitMapChrome(100, 120);
      document.querySelector("#cv").dispatchEvent(
        new MouseEvent("mousemove", {
          clientX: 100,
          clientY: 120,
          bubbles: true,
        }),
      );
      if (kind === "settings") app.gamebar.click(100, 120, 2);
      else {
        app.gamebar.selectedSubmenu = null;
        app.gamebar.syncClock();
      }
      return {
        inputLocked,
        chrome,
        pointer: app.mapPointerHold,
        hold: app.clock.hold,
        tick: app.clock.strategicTickSerial,
      };
    }, mode);
    assert.equal(locked.inputLocked, true);
    assert.equal(locked.chrome, false);
    assert.equal(locked.pointer, true);
    assert.equal(locked.hold, true);
    await page.waitForTimeout(600);
    assert.equal(
      await page.evaluate(() => window.__app.clock.strategicTickSerial),
      locked.tick,
    );
    await page.evaluate(() => {
      window.__app.gamebar._clockHoldRequested = true;
      window.__app.gamebar.syncClock();
    });
    await page.waitForTimeout(500);
    assert.deepEqual(
      await page.evaluate(() => ({
        pointer: window.__app.mapPointerHold,
        hold: window.__app.clock.hold,
      })),
      { pointer: false, hold: true },
    );
    await page.evaluate(() => {
      window.__app.gamebar._clockHoldRequested = false;
      window.__app.gamebar.syncClock();
    });
    await page.waitForTimeout(100);
    assert.ok(
      (await page.evaluate(() => window.__app.clock.strategicTickSerial)) >
        locked.tick,
    );
  }

  await page.setViewportSize({ width: 800, height: 600 });
  await page.waitForTimeout(100);
  const resized = await page.evaluate(() => {
    const canvas = document.querySelector("#cv");
    return {
      backing: [canvas.width, canvas.height],
      writes: window.__clockVerify.writes,
    };
  });
  assert.deepEqual(resized.backing, [1600, 1200]);
  assert.deepEqual(resized.writes, { width: 1, height: 1 });
  const outsideFrame = await page.evaluate(() => {
    const app = window.__app, v = window.__clockVerify;
    const before = [v.mapDraws, v.legends];
    app.refreshStrategicView();
    return [v.mapDraws - before[0], v.legends - before[1], app._advancingStrategicFrame];
  });
  assert.deepEqual(outsideFrame, [1, 1, false], 'async completions outside RAF retain immediate refresh');
  const messageBarrier = await page.evaluate(() => {
    const app = window.__app, v = window.__clockVerify;
    if (!app.gamebar._canShowStrategicMessage()) throw new Error('message fixture requires an idle UI');
    v.messageReturns = 0;
    app.gamebar._strategicMessageQueue.push({ text: '刷新邊界測試', onClose: () => v.messageReturns++ });
    app._advancingStrategicFrame = true;
    try {
      app.refreshStrategicView();
      return { hold: app.clock.hold, active: app.gamebar._strategicMessageActive, returns: v.messageReturns };
    } finally { app._advancingStrategicFrame = false; }
  });
  assert.deepEqual(messageBarrier, { hold: true, active: true, returns: 0 },
    'deferring pixels must still take the queued message hold synchronously');
  await page.waitForFunction(() => window.__app.gamebar.generalCard?.lines?.includes('刷新邊界測試'));
  await page.mouse.click(400, 400, { button: 'right' });
  await page.waitForFunction(() => !window.__app.gamebar._strategicMessageActive);
  assert.equal(await page.evaluate(() => window.__clockVerify.messageReturns), 1);
  assert.deepEqual(errors, []);

  // Fresh realm imports the actual generated Trial bundle, not /web sources.
  // This is clock/bundle evidence, not a backend authentication or full Trial UI test.
  let bundle;
  try {
    bundle = JSON.parse(readFileSync(new URL("../server/public/trialweb.txt", import.meta.url), "utf8"));
  } catch (cause) {
    throw new Error("Cannot read generated Trial bundle", { cause });
  }
  const trialContext = await browser.newContext();
  const origin = `http://127.0.0.1:${port}`;
  await trialContext.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    assert.equal(url.origin, origin);
    if (url.pathname === "/__speed__/index.html") {
      return route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Trial clock fixture</title>" });
    }
    const path = url.pathname.replace("/__speed__/", "");
    assert.ok(["src/game/clock.js", "src/editor/trialruleboundaries.js"].includes(path));
    const packed = bundle.files.find((file) => file.path === path);
    return route.fulfill({ contentType: "text/javascript", body: packed.text });
  });
  await trialContext.addInitScript(() => {
    Object.defineProperty(globalThis, "indexedDB", { get() { throw new Error("Trial clock must not access storage"); } });
  });
  const trialPage = await trialContext.newPage();
  trialPage.on("pageerror", (error) => errors.push(String(error)));
  trialPage.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  trialPage.on("requestfailed", (request) => errors.push(request.url()));
  await trialPage.goto(`${origin}/__speed__/index.html`);
  const trialEvidence = await trialPage.evaluate(async () => {
    const { TrialStrategicClock } = await import("./src/editor/trialruleboundaries.js");
    const { STRATEGIC_SPEEDS, MAX_TICKS_PER_FRAME } = await import("./src/game/clock.js");
    const counts = [];
    for (let speed = 0; speed < 5; speed++) {
      const clock = new TrialStrategicClock({ startYear: 196, startMonth: 1, gate: { canAdvanceRules: true, rulePermit: {} } });
      clock.strategicSpeed = speed;
      for (let frame = 0; frame < 600; frame++) clock.advanceFrame(1000 / 60);
      counts.push(clock.strategicTickSerial);
    }
    return { steps: STRATEGIC_SPEEDS, cap: MAX_TICKS_PER_FRAME, counts };
  });
  assert.deepEqual(trialEvidence.steps, initial.steps);
  assert.equal(trialEvidence.cap, 16);
  for (let speed = 0; speed < 5; speed++) {
    const expected = Math.min(10000 / initial.steps[speed], 600 * trialEvidence.cap);
    assert.ok(Math.abs(trialEvidence.counts[speed] - expected) < 1.001);
  }
  assert.equal(trialEvidence.counts[4], 2083, "generated Trial top speed matches former normal rate");
  assert.deepEqual(errors, []);
  await trialContext.close();
  process.stdout.write(
    "clock browser OK: player App + generated Trial clock, DPR resize, pointer RAF coalescing, and 1s map-pointer hold\n",
  );
} finally {
  await browser?.close();
  await server.close();
}
