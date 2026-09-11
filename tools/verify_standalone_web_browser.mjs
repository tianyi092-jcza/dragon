// 只复制Web发行目录；静态服务根与浏览器profile均隔离，不接触原版目录/真实存档。
import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { verifySingleInstanceUi } from "./verify_single_instance_ui.js";

const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    "C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright",
);
const temporary = await mkdtemp(path.join(tmpdir(), "wolong-standalone-"));
const root = path.join(temporary, "web");
const types = {
  ".js": "text/javascript",
  ".json": "application/json",
  ".html": "text/html",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".css": "text/css",
};
const requests = [];
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(
      new URL(request.url, "http://localhost").pathname,
    );
    requests.push(pathname);
    if (pathname === "/favicon.ico") {
      response.writeHead(204).end();
      return;
    }
    const filename = path.resolve(
      root,
      `.${pathname === "/" ? "/index.html" : pathname}`,
    );
    if (!filename.startsWith(root + path.sep)) {
      response.writeHead(403).end();
      return;
    }
    const bytes = await readFile(filename);
    response.writeHead(200, {
      "Content-Type":
        types[path.extname(filename)] ?? "application/octet-stream",
    });
    response.end(bytes);
  } catch {
    response.writeHead(404).end();
  }
});
let browser;
try {
  await cp(new URL("../web/", import.meta.url), root, { recursive: true });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1024, height: 768 },
  });
  const errors = [];
  await context.route("**/*", async (route) => {
    if (new URL(route.request().url()).origin === origin)
      await route.continue();
    else {
      errors.push(`external request: ${route.request().url()}`);
      await route.abort();
    }
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("requestfailed", (request) => {
    errors.push(`request failed: ${request.url()} ${request.failure()?.errorText}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400)
      errors.push(`${response.status()} ${response.url()}`);
  });
  await page.goto(origin);
  await page.waitForFunction(() =>
    Boolean(window.__dragonApp?.startMenu?._onClick),
  );
  assert.ok(
    !requests.some((url) => /map_tiles_|road_graph|battle_rules/.test(url)),
    "title must not fetch world/battle assets",
  );
  const identity = await page.evaluate(() => ({
    id: window.__dragonApp.content.id,
    count: window.__dragonApp.content.chapters.length,
    saves: window.__dragonApp.saves,
  }));
  assert.equal(identity.id, "wolong-builtin");
  assert.equal(identity.count, 20);
  // 真正点击既有开局流程，不直接热装配Scenario跳过标题生命周期。
  for (const [x, y] of [
    [468, 360],
    [512, 234],
    [512, 234],
  ]) {
    await page.evaluate(() => {
      window.__standalonePrevious = window.__dragonApp.startMenu._onClick;
    });
    await page.mouse.click(x, y);
    await page.waitForFunction(
      () =>
        window.__dragonApp.startMenu._onClick &&
        window.__dragonApp.startMenu._onClick !== window.__standalonePrevious,
    );
  }
  await page.mouse.click(584, 455);
  await page.waitForFunction(
    () =>
      window.__dragonApp.gameStarted &&
      window.__dragonApp.runtimeEnabled &&
      document.querySelector("#startv").style.display === "none",
  );
  const active = await page.evaluate(() => ({
    scenarioIndex: window.__dragonApp.scenarioIdx,
    roads: window.__dragonApp.world.roads.roadGraphReady(),
    chapter: window.__dragonApp.content.chapter(window.__dragonApp.scenarioIdx)
      .id,
  }));
  assert.equal(active.scenarioIndex, 16);
  assert.equal(active.chapter, "original-1");
  assert.equal(active.roads, true);
  assert.deepEqual(errors, []);
  const lock = await verifySingleInstanceUi(page);
  assert.equal(lock.blocked, true);
  process.stdout.write(
    "standalone Web OK: copied static release, fresh profile, deferred assets, real new-game flow, single-instance takeover\n",
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
  await rm(temporary, { recursive: true, force: true });
}
