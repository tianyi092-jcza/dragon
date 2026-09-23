// Real Web Locks/BroadcastChannel; fresh context and port0; no App/assets/saves.
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
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const errors = [];
  context.on("page", (page) => {
    page.on("pageerror", (error) => errors.push(String(error)));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("requestfailed", (request) =>
      errors.push(request.failure()?.errorText),
    );
    page.on("response", (response) => {
      if (response.status() >= 400)
        errors.push(`${response.status()} ${response.url()}`);
    });
  });
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === "/single-instance-fixture")
      return route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><body><script type="module">
        import { startSingleInstance } from '/src/core/singleinstance.js';
        window.calls = { active: 0, suspend: 0, lost: 0 };
        window.runtime = await startSingleInstance({
          onActive: () => calls.active++, onSuspend: () => calls.suspend++,
          onLost: () => calls.lost++
        });
        window.ready = true;
      </script>`,
      });
    return route.continue();
  });
  const active = await context.newPage();
  await active.goto(`${origin}/single-instance-fixture`);
  await active.waitForFunction(() => window.ready);
  assert.equal(await active.evaluate(() => window.runtime.kind), "web-lock");
  const blocked = await context.newPage();
  await blocked.goto(`${origin}/single-instance-fixture`);
  await blocked.waitForFunction(() => window.ready);
  assert.equal(await blocked.evaluate(() => window.runtime), null);
  await blocked.reload();
  await blocked.waitForFunction(() => window.ready);
  assert.deepEqual(await blocked.evaluate(() => window.calls), {
    active: 0,
    suspend: 0,
    lost: 0,
  });
  assert.deepEqual(
    errors,
    [],
    "blocked reload lifecycle must not post on a closed channel",
  );
  await active.evaluate(() => {
    window.runtime.stop();
    window.runtime.stop();
    dispatchEvent(new Event("beforeunload"));
    dispatchEvent(new Event("pagehide"));
  });
  await active.waitForFunction(() => window.runtime.state === "stopped");
  assert.deepEqual(await active.evaluate(() => window.calls), {
    active: 1,
    suspend: 1,
    lost: 0,
  });
  await blocked.reload();
  await blocked.waitForFunction(() => window.ready);
  assert.equal(await blocked.evaluate(() => window.runtime.state), "active");
  await active.close(); // Old owner's repeated cleanup must not release the new owner.
  const third = await context.newPage();
  await third.goto(`${origin}/single-instance-fixture`);
  await third.waitForFunction(() => window.ready);
  assert.equal(await third.evaluate(() => window.runtime), null);
  await blocked.close();
  await third.reload();
  await third.waitForFunction(() => window.ready);
  assert.equal(await third.evaluate(() => window.runtime.state), "active");
  await context.close();
  assert.deepEqual(errors, []);
  console.log(
    "singleinstance browser OK: blocked reload, explicit/close release, repeated lifecycle cleanup, new owner retained",
  );
} finally {
  await browser?.close();
  await server.close();
}
