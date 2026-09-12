// Fresh contexts + temporary origin; only opening assets, never game/DOS saves.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    "C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright",
);
const root = path.resolve(fileURLToPath(new URL("../web/", import.meta.url)));
const music = await readFile(path.join(root, "intro/assets/opening.mp3"));
const harness = `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="intro/styles.css">
<style>html,body{margin:0;overflow:hidden}</style><div id="titlebg"></div>
<script type="module">import {mountOpening} from './intro/app.js';
mountOpening().then(api => { window.mounted = true; api.menuReady.then(() => window.menuReleased = true); });</script>`;
let downloads = 0,
  slow = true,
  knownLength = true,
  finishDownload;
const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, "http://localhost").pathname;
    if (pathname === "/")
      return res.writeHead(200, { "Content-Type": "text/html" }).end(harness);
    if (pathname === "/favicon.ico") return res.writeHead(204).end();
    if (pathname === "/intro/assets/opening.mp3") {
      downloads++;
      res.writeHead(200, {
        "Content-Type": "audio/mpeg",
        ...(knownLength ? { "Content-Length": music.length } : {}),
      });
      if (!slow) return res.end(music);
      const split = Math.floor(music.length / 2);
      res.write(music.subarray(0, split));
      finishDownload = () => res.end(music.subarray(split));
      return;
    }
    const filename = path.resolve(root, `.${pathname}`);
    if (!filename.startsWith(root + path.sep)) return res.writeHead(403).end();
    const bytes = await readFile(filename);
    const types = {
      ".html": "text/html",
      ".js": "text/javascript",
      ".css": "text/css",
      ".png": "image/png",
      ".gif": "image/gif",
    };
    res
      .writeHead(200, {
        "Content-Type":
          types[path.extname(filename)] || "application/octet-stream",
      })
      .end(bytes);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
// Playwright evaluation/screenshot helpers may grant user activation. Keep all
// pre-play observations and the optional screenshot passive via CDP.
const sessions = new WeakMap();
async function inspect(page, fn) {
  if (!sessions.has(page))
    sessions.set(page, await page.context().newCDPSession(page));
  const result = await sessions.get(page).send("Runtime.evaluate", {
    expression: `(${fn.toString()})()`,
    returnByValue: true,
    awaitPromise: true,
    userGesture: false,
  });
  if (result.exceptionDetails)
    throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function until(page, fn) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (await inspect(page, fn)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out: ${fn}`);
}
try {
  // Exercise real browser autoplay rejection, not a mock or permissive flag.
  browser = await chromium.launch({
    headless: true,
    args: ["--autoplay-policy=user-gesture-required"],
  });
  const context = await browser.newContext({
    viewport: { width: 1024, height: 768 },
  });
  await context.addInitScript(() => {
    const put = Cache.prototype.put;
    Cache.prototype.put = async function (...args) {
      window.cacheWriting = true;
      await new Promise((resolve) => {
        window.releaseCache = resolve;
      });
      return put.apply(this, args);
    };
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  await page.goto(origin);
  await until(
    page,
    () => document.querySelector("#load-progress")?.value >= 49,
  );
  assert.equal(
    await inspect(page, () => document.querySelector("#load-status").hidden),
    false,
  );
  const bounds = await inspect(page, () =>
    document.querySelector("#load-status").getBoundingClientRect().toJSON(),
  );
  assert.ok(Math.abs(bounds.x + bounds.width / 2 - 512) < 1);
  assert.ok(Math.abs(bounds.y + bounds.height / 2 - 384) < 1);
  // Intentionally exceed the removed four-second shortcut.
  await page.waitForTimeout(4200);
  assert.deepEqual(
    await inspect(page, () => [
      WolongIntro.phase,
      WolongIntro.time,
      WolongIntro.music.playing,
      !!window.menuReleased,
      document.querySelector("#scene").classList.contains("is-loaded"),
    ]),
    ["loading", 0, false, false, false],
  );
  if (process.env.OPENING_LOADING_SCREENSHOT) {
    const { data } = await sessions
      .get(page)
      .send("Page.captureScreenshot", { format: "png" });
    await writeFile(
      process.env.OPENING_LOADING_SCREENSHOT,
      Buffer.from(data, "base64"),
    );
  }
  finishDownload();
  await until(page, () => window.cacheWriting);
  assert.equal(
    await inspect(page, () => document.querySelector("#load-progress").value),
    99,
  );
  assert.deepEqual(
    await inspect(page, () => [
      WolongIntro.phase,
      WolongIntro.time,
      WolongIntro.music.playing,
    ]),
    ["loading", 0, false],
  );
  await inspect(page, () => window.releaseCache());
  await until(
    page,
    () => window.WolongIntro?.phase === "waiting" && window.mounted,
  );
  assert.equal(await page.locator("#start-opening").isVisible(), true);
  assert.equal(await page.evaluate(() => WolongIntro.time), 0);
  assert.equal(
    await page.locator("#load-progress").getAttribute("value"),
    "100",
  );
  assert.equal(
    await page.evaluate(async () => {
      const { MUSIC_CACHE } = await import("/intro/music-cache.js");
      const cache = await caches.open(MUSIC_CACHE);
      const [key] = await cache.keys();
      const bytes = await (await cache.match(key)).arrayBuffer();
      return Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
        (n) => n.toString(16).padStart(2, "0"),
      ).join("");
    }),
    "2f00b4805ba824ab141dd51bb69e1bd71d01e8d35a6335e65c7cf55133592413",
  );
  await page.locator("#start-opening").click();
  await page.waitForFunction(
    () =>
      WolongIntro.phase === "intro" &&
      WolongIntro.music.playing &&
      WolongIntro.music.time > 0,
  );
  assert.equal(await page.locator("#load-status").isVisible(), false);
  await page.locator("#skip-button").click();
  assert.deepEqual(
    await page.evaluate(() => [
      WolongIntro.phase,
      WolongIntro.music.playing,
      WolongIntro.music.time,
      !!window.menuReleased,
    ]),
    ["idle", false, 0, true],
  );
  assert.equal(downloads, 1);
  await page.close();
  // New tab has no seen marker, but the same origin's persistent music is reused.
  slow = false;
  const cached = await context.newPage();
  cached.on("pageerror", (error) => errors.push(String(error)));
  await cached.route("**/opening.mp3*", (route) => route.abort());
  await cached.goto(origin);
  await until(cached, () => window.WolongIntro?.phase === "waiting");
  assert.equal(downloads, 1, "cache hit must not issue a second music request");
  assert.equal(await cached.evaluate(() => !!window.cacheWriting), false);
  await cached.locator("#start-opening").focus();
  await cached.keyboard.press("Enter");
  await cached.waitForFunction(
    () => WolongIntro.phase === "intro" && WolongIntro.music.playing,
  );
  await cached.reload();
  await cached.waitForFunction(
    () => window.mounted && WolongIntro.phase === "idle",
  );
  assert.equal(await cached.evaluate(() => WolongIntro.music.playing), false);
  assert.equal(downloads, 1, "ordinary refresh must not load music");
  assert.deepEqual(errors, []);
  await context.close();

  // Missing Content-Length: standard indeterminate progress, no invented %.
  slow = true;
  knownLength = false;
  const fallbackContext = await browser.newContext();
  await fallbackContext.addInitScript(() => {
    CacheStorage.prototype.open = () =>
      Promise.reject(new DOMException("denied", "SecurityError"));
  });
  const fallback = await fallbackContext.newPage();
  fallback.on("pageerror", (error) => errors.push(String(error)));
  await fallback.goto(origin);
  await until(fallback, () =>
    document.querySelector("#load-label")?.textContent.includes("KB"),
  );
  assert.equal(
    await inspect(fallback, () =>
      document.querySelector("#load-progress").getAttribute("value"),
    ),
    null,
  );
  assert.equal(await inspect(fallback, () => WolongIntro.time), 0);
  finishDownload();
  await until(fallback, () => window.WolongIntro?.phase === "waiting");
  assert.match(
    await fallback.locator("#load-label").textContent(),
    /仅本次缓存/,
  );
  await fallback.locator("#start-opening").click();
  await fallback.waitForFunction(
    () => WolongIntro.phase === "intro" && WolongIntro.music.playing,
  );
  await fallback.evaluate(() => {
    const revoke = URL.revokeObjectURL;
    URL.revokeObjectURL = (url) => {
      window.revokedMusic = url;
      revoke(url);
    };
    WolongIntro.destroy();
  });
  assert.equal(await fallback.evaluate(() => WolongIntro.music.playing), false);
  assert.match(await fallback.evaluate(() => window.revokedMusic), /^blob:/);
  await fallbackContext.close();

  // Quota failure after download is also an explicit in-memory fallback.
  slow = false;
  const quotaContext = await browser.newContext({ reducedMotion: "reduce" });
  await quotaContext.addInitScript(() => {
    Cache.prototype.put = () =>
      Promise.reject(new DOMException("full", "QuotaExceededError"));
  });
  const quota = await quotaContext.newPage();
  quota.on("pageerror", (error) => errors.push(String(error)));
  await quota.goto(origin);
  await until(quota, () => window.WolongIntro?.phase === "waiting");
  assert.match(await quota.locator("#load-label").textContent(), /仅本次缓存/);
  await quota.locator("#start-opening").click();
  await quota.waitForFunction(
    () =>
      WolongIntro.phase === "idle" &&
      WolongIntro.music.playing &&
      window.menuReleased,
  );
  await quotaContext.close();

  // HTTP failure never writes bad data or starts animation; game remains usable.
  const failedContext = await browser.newContext();
  const failed = await failedContext.newPage();
  failed.on("pageerror", (error) => errors.push(String(error)));
  await failed.route("**/opening.mp3*", (route) =>
    route.fulfill({ status: 503, body: "unavailable" }),
  );
  await failed.goto(origin);
  await failed.waitForFunction(
    () => WolongIntro.phase === "error" && window.menuReleased,
  );
  assert.equal(await failed.evaluate(() => WolongIntro.music.playing), false);
  assert.equal(
    await failed.evaluate(
      async () =>
        (await (await caches.open("wolong.intro.music.v1")).keys()).length,
    ),
    0,
  );
  assert.equal(await failed.locator("#replay-button").isVisible(), true);
  await failedContext.close();
  assert.deepEqual(errors, []);
  process.stdout.write(
    "opening loading OK: real byte progress, >4s freeze, await cache write, SHA256 cache content, real autoplay gate + mouse/keyboard, cache hit without network, silent refresh, denied/quota fallback, reduced motion, failure and blob cleanup\n",
  );
} catch (error) {
  for (const context of browser?.contexts() || [])
    for (const page of context.pages()) {
      process.stderr.write(
        JSON.stringify(
          await page.evaluate(() => ({
            phase: window.WolongIntro?.phase,
            time: window.WolongIntro?.time,
            music: window.WolongIntro?.music,
            label: document.querySelector("#load-label")?.textContent,
          })),
        ) + "\n",
      );
    }
  throw error;
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
