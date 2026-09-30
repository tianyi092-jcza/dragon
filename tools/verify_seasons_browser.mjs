import { format } from "node:util";
const tlog = (...args) => process.stdout.write(`${format(...args)}
`);
// Four-season switch in a real browser (M-05 remainder; round 1 did 0->1).
// Fresh Chromium, isolated profile, self-owned static server. The product
// re-syncs season from the calendar month on a 10Hz UI tick (0x9377 logic),
// so seasons are driven by setting the calendar month (fixture control);
// the sync itself, atlas attach (world.loadSeason) and repaint are all
// production code. Months: 6 summer, 9 autumn, 12 winter, 3 spring.
// Screenshots feed M-06.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { startBrowserTestServer } from "./browser_test_server.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    "C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright",
);

const server = await startBrowserTestServer();
let browser;
const errors = [];
try {
  const origin = `http://127.0.0.1:${server.port}`;
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1024, height: 768 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !message.location().url?.endsWith("/favicon.ico")
    )
      errors.push(message.text());
  });
  await page.goto(`${origin}/index.html`);
  await page.locator("#skip-button").click();
  await page.waitForFunction(() => !!window.__app?.startMenu?._onClick);
  async function rebind(x, y) {
    await page.evaluate(() => {
      window.__seasonMenuHandler = window.__app.startMenu._onClick;
    });
    await page.mouse.click(x, y);
    await page.waitForFunction(
      () =>
        window.__app.startMenu._onClick &&
        window.__app.startMenu._onClick !== window.__seasonMenuHandler,
    );
  }
  await rebind(468, 360);
  await rebind(512, 234);
  await rebind(512, 234);
  await page.mouse.click(584, 455);
  await page.waitForFunction(
    () => window.__app.gameStarted && window.__app.runtimeEnabled,
  );
  // Freeze strategy so season shots differ only by season assets.
  await page.evaluate(() => {
    window.__app.clock.hold = true;
  });
  const names = ["spring", "summer", "autumn", "winter"];
  const tags = [];
  await page.evaluate(() => {
    window.__seasonImgs = [];
  });
  for (const [month, want] of [[6, 1], [9, 2], [12, 3], [3, 0]]) {
    await page.evaluate((m) => {
      window.__app.clock.month = m;
      window.__app.clock.day = 1;
    }, month);
    await page.waitForFunction((w) => window.__app.seasonIdx === w, want, {
      timeout: 15000,
    });
    // One more beat so loadSeason resolves, attaches and repaints.
    await page.waitForFunction(() => !!window.__app.view.seasonImg, null, {
      timeout: 15000,
    });
    const tag = await page.evaluate(() => {
      const img = window.__app.view.seasonImg;
      let index = window.__seasonImgs.indexOf(img);
      if (index < 0) {
        window.__seasonImgs.push(img);
        index = window.__seasonImgs.length - 1;
      }
      const canvas = document.querySelector("#cv");
      const pixels = window.__app.view.ctx.getImageData(
        0,
        0,
        canvas.width,
        canvas.height,
      );
      let hash = 2166136261;
      for (let i = 0; i < pixels.data.length; i += 37) {
        hash ^= pixels.data[i];
        hash = Math.imul(hash, 16777619);
      }
      return { index, hash: hash >>> 0 };
    });
    tags.push(tag);
    await page.screenshot({ path: `season_${names[want]}.png` });
    tlog(
      `month ${month} -> season ${names[want]} (idx ${want}), ` +
        `atlas #${tag.index}, pixels hash ${tag.hash}`,
    );
  }
  assert.equal(
    new Set(tags.map((t) => t.index)).size,
    4,
    "four seasons must attach four atlases",
  );
  assert.equal(
    new Set(tags.map((t) => t.hash)).size,
    4,
    "four seasons must repaint different pixels",
  );
  assert.deepEqual(errors, [], "no page/console errors");
} finally {
  await browser?.close();
  server.close();
}
tlog("four seasons browser: summer->autumn->winter->spring all attached");
