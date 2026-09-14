// Infrastructure-only: two listeners owned by this process, public web assets,
// rejected private/API paths. No browser, game state, writes, or old service.
import assert from "node:assert/strict";
import test from "node:test";
import { startBrowserTestServer } from "./browser_test_server.mjs";

test("port zero stays owned until close; closing one does not affect the other", async (t) => {
  const first = await startBrowserTestServer();
  const second = await startBrowserTestServer();
  t.after(async () => {
    await Promise.all([first.close(), second.close()]);
  });
  assert.notEqual(first.port, second.port);
  const firstUrl = `http://127.0.0.1:${first.port}`;
  const secondUrl = `http://127.0.0.1:${second.port}`;
  const firstPage = await fetch(firstUrl);
  assert.equal(firstPage.status, 200);
  assert.match(firstPage.headers.get("content-type"), /^text\/html/);
  const html = await firstPage.text();
  assert.match(html, /<!doctype html>/i);
  assert.equal(await (await fetch(secondUrl)).text(), html);
  await first.close();
  await first.close();
  // Never probe the released port: that could hit an unrelated later listener.
  assert.equal(await (await fetch(secondUrl)).text(), html);
  const script = await fetch(`${secondUrl}/src/game/legionscheduler.js`);
  assert.equal(script.status, 200);
  assert.match(script.headers.get("content-type"), /^text\/javascript/);
  const head = await fetch(secondUrl, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
});

test("private/API/traversal requests are rejected before reading files", async (t) => {
  const server = await startBrowserTestServer();
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.port}`;
  for (const pathname of [
    "/.dragon-runtime/save.json",
    "/SAVE.DAT",
    "/save.webmeta.json",
    "/api/save",
    "/%2e%2e%5cindex.html",
    "/%00",
  ]) {
    const response = await fetch(base + pathname);
    assert.equal(response.status, 403, pathname);
    assert.equal(await response.text(), "");
  }
  const malformed = await fetch(base + "/%ZZ");
  const missing = await fetch(base + "/__p24-not-a-resource__.js");
  const writeAttempt = await fetch(base, {
    method: "POST",
    body: "no filesystem writes",
  });
  assert.equal(malformed.status, 400);
  assert.equal(missing.status, 404);
  assert.equal(writeAttempt.status, 405);
});
