import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { startBrowserTestServer } from "./browser_test_server.mjs";

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
  await context.addInitScript(({ origin }) => {
    if (location.origin !== origin) return;
    sessionStorage.setItem("wolong.intro.seen.v1", "1");
  }, { origin: `http://127.0.0.1:${port}` });
  const page = await context.newPage();
  const errors = [];
  const netErrors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("requestfailed", (request) =>
    netErrors.push(
      `${request.method()} ${request.url()}: ${request.failure()?.errorText}`,
    ),
  );

  await page.goto(`http://127.0.0.1:${port}/index.html`);
  await page.waitForFunction(() => !!window.__app?.startMenu?._onClick);
  async function clickAndRebind(x, y) {
    for (let attempt = 0; attempt < 4; attempt++) {
      await page.evaluate(() => {
        window.__frameLoopHandler =
          window.__app?.startMenu?._onClick ?? null;
      });
      await page.mouse.click(x, y);
      const rebound = await page
        .waitForFunction(
          () =>
            window.__app?.startMenu?._onClick &&
            window.__app.startMenu._onClick !== window.__frameLoopHandler,
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
  await page.evaluate(() => {
    window.__app.clock.strategicSpeed = 4;
  });

  // Baseline: the loop is alive before the probe.
  const tick0 = await page.evaluate(
    () => window.__app.clock.strategicTickSerial,
  );
  await page.waitForFunction(
    (before) => window.__app.clock.strategicTickSerial > before,
    tick0,
    { timeout: 8000 },
  );

  // P88 probe: one uncaught throw escaping through frame must not kill it.
  // Without entry-first scheduling the loop dies here and the wait below
  // times out (red); with the fix the clock keeps advancing (green).
  await page.evaluate(() => {
    const app = window.__app;
    const originalAdvance = app.clock.advanceFrame.bind(app.clock);
    let armed = true;
    app.clock.advanceFrame = (...args) => {
      if (armed) {
        armed = false;
        throw new Error("__frameLoopSurvivalProbe");
      }
      return originalAdvance(...args);
    };
  });
  const tick1 = await page.evaluate(
    () => window.__app.clock.strategicTickSerial,
  );
  await page.waitForFunction(
    (before) => window.__app.clock.strategicTickSerial > before,
    tick1,
    { timeout: 8000 },
  );
  await page.waitForTimeout(500);

  assert.ok(errors.length > 0, "the probe throw must surface uncaught");
  assert.ok(
    errors.every((entry) => entry.includes("__frameLoopSurvivalProbe")),
    `no unrelated noise allowed, got: ${JSON.stringify(errors)}`,
  );
  assert.deepEqual(netErrors, []);

  process.stdout.write(
    "frame loop survival OK: one uncaught frame throw, clock keeps advancing\n",
  );
} finally {
  await browser?.close();
  await server.close();
}
