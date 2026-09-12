// Isolated browser context + ephemeral static origin; never accesses DOS saves.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { openingFrame } from "../web/intro/timeline.js";
const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    "C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright",
);
assert.equal(openingFrame(0).landscapeY, 352);
assert.equal(openingFrame(28).landscapeY, 43);
assert.equal(openingFrame(24).foregroundY, 594);
assert.equal(openingFrame(15).titleOpacity, 0);
const root = fileURLToPath(new URL("../web/", import.meta.url));
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".mp3": "audio/mpeg",
  ".gif": "image/gif",
  ".png": "image/png",
};
const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, "http://localhost").pathname;
    const filename = path.resolve(
      root,
      `.${pathname === "/" ? "/index.html" : pathname}`,
    );
    if (!filename.startsWith(root)) {
      res.writeHead(403).end();
      return;
    }
    res.writeHead(200, {
      "Content-Type":
        types[path.extname(filename)] || "application/octet-stream",
    });
    res.end(await readFile(filename));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1024, height: 768 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (e) => {
    if (e.type() === "error") errors.push(e.text());
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  await page.goto(origin);
  await page.waitForFunction(
    () => window.__dragonApp && window.WolongIntro?.phase === "intro",
  );
  assert.equal(await page.locator("#startv").isVisible(), false);
  await page.waitForFunction(() => window.WolongIntro.time >= 15);
  await page.waitForFunction(() => !!window.__dragonApp.startMenu._onClick);
  assert.equal(await page.locator("#startv").isVisible(), true);
  await page.evaluate(() => {
    window.savedHandler = window.__dragonApp.startMenu._onClick;
  });
  await page.locator("#sound-toggle").click();
  await page.locator("#skip-button").click();
  assert.equal(
    await page.evaluate(
      () => window.savedHandler === window.__dragonApp.startMenu._onClick,
    ),
    true,
  );
  assert.deepEqual(
    await page.evaluate(() => [
      window.WolongIntro.phase,
      window.WolongIntro.music.playing,
      window.WolongIntro.music.muted,
      window.__dragonApp.music.track,
    ]),
    ["idle", false, true, null],
  );
  for (const [x, y] of [
    [468, 360],
    [512, 234],
    [512, 234],
  ]) {
    await page.evaluate(() => {
      window.savedHandler = window.__dragonApp.startMenu._onClick;
    });
    await page.mouse.click(x, y);
    await page.waitForFunction(
      () => window.savedHandler !== window.__dragonApp.startMenu._onClick,
    );
  }
  // Existing custom-advisor overlay remains aligned and survives background skip.
  await page.mouse.click(584, 429);
  await page.waitForFunction(() =>
    document.querySelector('input[placeholder="最多3字"]'),
  );
  const before = await page
    .locator('input[placeholder="最多3字"]')
    .first()
    .boundingBox();
  await page.locator("#skip-button").click();
  assert.deepEqual(
    await page.locator('input[placeholder="最多3字"]').first().boundingBox(),
    before,
  );
  await page.mouse.click(500, 380, { button: "right" });
  await page.waitForFunction(
    () => !document.querySelector('input[placeholder="最多3字"]'),
  );
  await page.mouse.click(584, 455);
  await page.waitForFunction(
    () =>
      window.__dragonApp.gameStarted &&
      !document.body.contains(
        document.querySelector('input[placeholder="最多3字"]'),
      ) &&
      document.querySelector("#startv").style.display === "none",
  );
  assert.equal(await page.locator("#sound-toggle").isVisible(), false);
  assert.equal(
    await page.evaluate(() => window.WolongIntro.music.playing),
    false,
  );
  // Save only into this disposable browser context.
  await page.evaluate(async () => {
    await window.__dragonApp.saveGame(0, "opening-test");
  });
  await page.evaluate(() => {
    void window.__dragonApp.returnToTitle(1);
  });
  await page.waitForFunction(
    () =>
      document.querySelector("#startv").style.display === "block" &&
      window.__dragonApp.startMenu._onClick,
  );
  assert.equal(await page.evaluate(() => window.WolongIntro.phase), "idle");
  assert.equal(
    await page.evaluate(() => window.WolongIntro.music.playing),
    false,
  );
  await page.mouse.click(512, 312);
  await page.waitForFunction(
    () =>
      window.__dragonApp.gameStarted &&
      document.querySelector("#startv").style.display === "none",
  );
  assert.equal(
    await page.evaluate(() => window.__dragonApp._lastLoadedSaveLabel),
    "opening-test",
  );
  // Refresh must preserve seen marker, not replay.
  await page.reload();
  await page.waitForFunction(() => window.__dragonApp?.startMenu?._onClick);
  assert.equal(await page.evaluate(() => window.WolongIntro.phase), "idle");
  // Explicit restart resets the entire page, even while a popup exists.
  await page.locator("#replay-button").click();
  await page.waitForFunction(
    () => window.WolongIntro?.phase === "intro" && window.WolongIntro.time < 15,
  );
  assert.equal(await page.locator("#startv").isVisible(), false);
  await page.locator("#skip-button").click();
  await page.waitForFunction(() => window.__dragonApp?.startMenu?._onClick);
  assert.equal(await page.evaluate(() => window.WolongIntro.phase), "idle");
  for (const [width, height] of [
    [1912, 956],
    [1920, 1080],
    [2560, 1440],
    [3840, 2160],
    [1366, 768],
    [3440, 1440],
    [1280, 1024],
    [800, 1200],
    [640, 400],
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForFunction(() => {
      const scale = Number(
        document
          .querySelector("#scene")
          .style.getPropertyValue("--scene-scale"),
      );
      return scale === Math.max(1, innerWidth / 1920, innerHeight / 1080);
    });
    const layout = await page.evaluate(() => {
      const scene = document.querySelector("#scene").getBoundingClientRect();
      const popup = document.querySelector("#startv").getBoundingClientRect();
      return {
        scene: [scene.x, scene.y, scene.width, scene.height],
        popup: [
          popup.width,
          popup.height,
          popup.x + popup.width / 2,
          popup.y + popup.height / 2,
        ],
        overflow: [
          getComputedStyle(document.documentElement).overflow,
          getComputedStyle(document.body).overflow,
        ],
        client: [
          document.documentElement.clientWidth,
          document.documentElement.clientHeight,
        ],
      };
    });
    assert.deepEqual(layout.scene.slice(0, 2), [0, 0]);
    assert.ok(
      layout.scene[2] >= width - 0.01 && layout.scene[3] >= height - 0.01,
      "scene covers viewport without letterboxing",
    );
    assert.ok(
      layout.scene[2] >= 1920 && layout.scene[3] >= 1080,
      "never downscale",
    );
    assert.deepEqual(layout.popup, [640, 400, width / 2, height / 2]);
    assert.deepEqual(layout.overflow, ["hidden", "hidden"]);
    assert.deepEqual(layout.client, [width, height]);
    await page.mouse.wheel(300, 300);
    assert.deepEqual(await page.evaluate(() => [scrollX, scrollY]), [0, 0]);
    if (width === 1912 && process.env.OPENING_SCREENSHOT)
      await page.screenshot({ path: process.env.OPENING_SCREENSHOT });
  }
  await page.setViewportSize({ width: 640, height: 400 });
  assert.deepEqual(
    await page
      .locator("#startv")
      .evaluate((cv) => [
        cv.getBoundingClientRect().width,
        cv.getBoundingClientRect().height,
      ]),
    [640, 400],
  );
  for (const id of ["sound-toggle", "skip-button", "replay-button"]) {
    assert.equal(
      await page.locator(`#${id}`).evaluate((button) => {
        const r = button.getBoundingClientRect();
        return button.contains(
          document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
        );
      }),
      true,
      `${id} stays clickable above the popup canvas`,
    );
  }
  assert.deepEqual(errors, []);
  await context.close();
  const naturalContext = await browser.newContext();
  const natural = await naturalContext.newPage();
  natural.on("pageerror", (error) => errors.push(String(error)));
  await natural.goto(origin);
  await natural.waitForFunction(
    () => window.WolongIntro?.phase === "idle",
    null,
    { timeout: 45000 },
  );
  assert.equal(await natural.locator("#startv").isVisible(), true);
  assert.equal(await natural.evaluate(() => window.WolongIntro.time), 31.55);
  assert.equal(
    await natural.evaluate(() => window.__dragonApp.gameStarted),
    false,
  );
  assert.deepEqual(errors, []);
  await naturalContext.close();
  // Controlled async media race: an old play promise resolves after a newer play.
  const raceContext = await browser.newContext();
  await raceContext.addInitScript(() => {
    window.Audio = class extends EventTarget {
      constructor() {
        super();
        this.paused = true;
        this.ended = false;
        this.currentTime = 0;
        this.duration = 100;
        this.pending = [];
        window.__testOpeningAudio = this;
      }
      load() { queueMicrotask(() => this.dispatchEvent(new Event('canplay'))); }
      play() { this.paused = false; return new Promise((resolve) => this.pending.push(resolve)); }
      pause() { this.paused = true; }
      removeAttribute() {}
    };
  });
  const race = await raceContext.newPage();
  race.on('pageerror', (error) => errors.push(String(error)));
  await race.goto(origin);
  await race.waitForFunction(() => window.__testOpeningAudio?.pending.length === 1);
  await race.locator('#sound-toggle').click();
  await race.locator('#sound-toggle').click();
  await race.waitForFunction(() => window.__testOpeningAudio.pending.length === 2);
  await race.evaluate(async () => { window.__testOpeningAudio.pending[0](); await Promise.resolve(); });
  assert.equal(await race.evaluate(() => window.WolongIntro.music.playing), true, 'stale play must not stop newer playback');
  await race.evaluate(async () => { window.__testOpeningAudio.pending[1](); await Promise.resolve(); window.__testOpeningAudio.currentTime = 12; });
  await race.locator('#skip-button').click();
  assert.deepEqual(await race.evaluate(() => [window.WolongIntro.music.playing, window.WolongIntro.music.muted, window.WolongIntro.music.time]), [false, true, 0]);
  assert.equal(await race.evaluate(() => window.__testOpeningAudio.loop), false);
  assert.deepEqual(errors, []);
  await raceContext.close();
  process.stdout.write(
    "opening OK: 15s gate, early/late skip, independent audio, custom UI, new/load game, refresh/restart, small-screen controls and natural completion\n",
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
