import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { OriginalBattleRng } from "../web/src/game/battle/originalrng.js";

const require = createRequire(import.meta.url);
const playwrightPath =
  process.env.PLAYWRIGHT_MODULE ||
  "C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright";
const { chromium } = require(playwrightPath);
const repo = fileURLToPath(new URL("../", import.meta.url));

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
    server.on("error", reject);
  });
}

const port = await getFreePort();
const server = spawn(
  "python",
  [path.join(repo, "tools", "webserver.py"), String(port)],
  { stdio: "ignore" },
);
let browser;
try {
  await new Promise((resolve) => setTimeout(resolve, 600));
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1024, height: 768 },
    deviceScaleFactor: 2,
  });
  // EC82 reads local RTC only once before KI.EXE's title flow. Fix browser
  // wall time so this product-lifecycle assertion is deterministic.
  const seedTime = new Date(2000, 0, 1, 13, 45, 9).getTime();
  await context.addInitScript((timestamp) => {
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
  }, seedTime);
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
  await page.evaluate(() => {
    sessionStorage.setItem("openPlayed", "1");
    window.__app?.openView?.finish?.();
  });

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
    const verify = { writes: { width: 0, height: 0 }, pointerCalls: 0 };
    window.__clockVerify = verify;
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
      rngStreamReused: app.originalRng === window.__clockVerifyStartupRng,
    };
  });
  assert.deepEqual(initial.backing, [2048, 1536]);
  assert.equal(initial.dpr, 2);
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
  await page.waitForTimeout(100);
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
  assert.deepEqual(errors, []);

  process.stdout.write(
    "clock browser OK: DPR resize, pointer RAF coalescing, and 1s map-pointer hold\n",
  );
} finally {
  await browser?.close();
  server.kill();
}
