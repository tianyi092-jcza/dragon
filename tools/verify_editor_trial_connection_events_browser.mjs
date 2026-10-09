// Fresh Chromium + actual DOM/network lifecycle, NOT authenticated Trial/App.
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { join } from "node:path";
import { startBrowserTestServer } from "./browser_test_server.mjs";
const round = process.argv[2]; assert.equal(process.argv.length, 3); assert.match(round ?? "", /^[a-zA-Z0-9-]{1,64}$/);
const out = join(".dragon-analysis/editor-phase", round); mkdirSync(out);
const sha = b => createHash("sha256").update(b).digest("hex");
const paths = ["web/src/editor/trialconnection.js", "web/src/editor/trialconnectionmonitor.js", "web/src/editor/trialconnectionevents.js", "tools/browser_test_server.mjs", "tools/verify_editor_trial_connection_events_browser.mjs"];
const sourceHashes = Object.fromEntries(paths.map(p => [p, sha(readFileSync(p))]));
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright");
const server = await startBrowserTestServer(), origin = `http://127.0.0.1:${server.port}`;
const allowed = new Set(["/__trial-events-fixture", ...paths.slice(0, 3).map(p => p.slice(3))]);
let browser, checks = 0;
const errors = [], forbidden = [], requests = [], nativeEvents = [], disposal = [];
function check(v) { assert.ok(v); checks++; }
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addInitScript(() => {
    window.__idbAccesses = 0;
    Object.defineProperty(window, "indexedDB", { configurable: true, get() { window.__idbAccesses++; throw new Error("formal IDB forbidden"); } });
  });
  context.on("page", page => {
    page.setDefaultTimeout(15000); page.on("pageerror", e => errors.push(String(e)));
    page.on("console", m => {
      if (m.type() === "error") { errors.push(m.text()); }
    });
  });
  await context.route("**/*", async route => {
    const url = new URL(route.request().url()); requests.push(url.href);
    if (url.origin !== origin || !allowed.has(url.pathname)) { forbidden.push(url.href); return route.abort(); }
    if (url.pathname === "/__trial-events-fixture") {
      return route.fulfill({ contentType: "text/html; charset=utf-8", body: '<!doctype html><html><head><link rel="icon" href="data:,"><title>Owned lifecycle fixture; not authenticated Trial</title></head><body>Memory-only fixture</body></html>' });
    }
    return route.continue();
  });
  const page = await context.newPage(); await page.goto(`${origin}/__trial-events-fixture`);
  const initialize = async () => {
    const { createTrialConnectionGate } = await import("/src/editor/trialconnection.js");
    const { createTrialConnectionMonitor } = await import("/src/editor/trialconnectionmonitor.js");
    const { bindTrialConnectionEvents } = await import("/src/editor/trialconnectionevents.js");
    const binding = { trialId: "browser-fixture-trial", snapshotId: "fixture-snapshot", ownerId: "fixture-owner", sessionId: "fixture-session", authEpoch: "fixture-epoch", gameId: "fixture-game", draftRevision: "12345678901234567890", snapshotDigest: "a".repeat(64), chapterId: "fixture-chapter", manifestDigest: "b".repeat(64) };
    const gate = createTrialConnectionGate(binding), requests = [], timers = new Map(); let id = 0;
    const monitor = createTrialConnectionMonitor(gate, {
      setTimer(fn, ms) { const handle = ++id; timers.set(handle, { fn, ms }); return handle; },
      clearTimer(handle) { timers.delete(handle); },
      probe(expected, signal) { return new Promise((resolve, reject) => requests.push({ expected, signal, resolve, reject })); },
    });
    const bridge = bindTrialConnectionEvents(monitor, { windowTarget: window, documentTarget: document, navigatorState: navigator });
    const steps = { strategic: 0, tactical: 0 };
    window.__events = { gate, monitor, bridge, binding, requests, timers, steps,
      valid(index) { requests[index].resolve({ kind: "valid", binding: { ...binding } }); },
      step() { for (const key of ["strategic", "tactical"]) { gate.runRuleStep(() => steps[key]++);  }},
    };
    window.__nativeEventTrace = [];
    for (const name of ["offline", "online"]) { window.addEventListener(name, e => window.__nativeEventTrace.push({ name, trusted: e.isTrusted, online: navigator.onLine })); }
  };
  await page.evaluate(initialize);
  const snapshot = () => page.evaluate(() => { const f = window.__events; return { state: f.gate.state, reason: f.gate.reason, count: f.requests.length, online: navigator.onLine, steps: { ...f.steps }, idb: window.__idbAccesses, disposed: f.bridge.disposed }; });
  await page.waitForFunction(() => window.__events.requests.length === 1);
  check((await snapshot()).state === "paused"); await page.evaluate(() => window.__events.valid(0));
  await page.waitForFunction(() => window.__events.gate.canAdvanceRules);
  await page.evaluate(() => window.__events.step()); const before = await snapshot(); check(before.steps.strategic === 1 && before.steps.tactical === 1);
  const editor = await context.newPage(); await editor.goto(`${origin}/__trial-events-fixture?editor=1`); await editor.close(); check((await snapshot()).state === "running");
  await context.setOffline(true); await page.waitForFunction(() => !navigator.onLine && !window.__events.gate.canAdvanceRules);
  await page.evaluate(() => window.__events.step()); const offline = await snapshot(); assert.deepEqual(offline.steps, before.steps); checks++; check(offline.idb === 0);
  await context.setOffline(false); await page.waitForFunction(() => navigator.onLine && window.__events.requests.length === 2);
  check((await snapshot()).state === "paused"); await page.evaluate(() => window.__events.valid(1));
  await page.waitForFunction(() => window.__events.gate.canAdvanceRules); await page.evaluate(() => window.__events.step()); check((await snapshot()).steps.tactical === 2);
  // These are injected lifecycle hints, not actual BFCache/hidden-tab proof.
  await page.evaluate(() => { window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true })); window.__events.step(); });
  check((await snapshot()).state === "paused" && !(await snapshot()).disposed);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
  await page.waitForFunction(() => window.__events.requests.length === 3);
  check((await snapshot()).state === "paused"); await page.evaluate(() => window.__events.valid(2)); await page.waitForFunction(() => window.__events.gate.canAdvanceRules);
  await page.evaluate(() => window.dispatchEvent(new Event("beforeunload"))); check((await snapshot()).state === "running");
  // Synthetic hidden-tab hint on the actual document, restored immediately.
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, value: true }); document.dispatchEvent(new Event("visibilitychange")); window.__events.step(); });
  check((await snapshot()).state === "paused" && (await snapshot()).steps.strategic === 2);
  await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event("visibilitychange")); });
  await page.waitForFunction(() => window.__events.requests.length === 4); check((await snapshot()).state === "paused");
  await page.evaluate(() => window.__events.valid(3)); await page.waitForFunction(() => window.__events.gate.canAdvanceRules);
  // Real refresh drops the running fixture realm; it does NOT prove native
  // pagehide callback delivery. Prior failed callback observations are retained.
  nativeEvents.push(...await page.evaluate(() => window.__nativeEventTrace));
  await page.reload(); check(await page.evaluate(() => window.__events === undefined && window.__idbAccesses === 0));
  await page.evaluate(initialize); await page.waitForFunction(() => window.__events.requests.length === 1);
  check((await snapshot()).state === "paused" && (await snapshot()).steps.strategic === 0);
  await page.evaluate(() => window.__events.valid(0)); await page.waitForFunction(() => window.__events.gate.canAdvanceRules);
  // Isolated synthetic terminal dispatch, explicitly not native page closing.
  disposal.push(await page.evaluate(() => {
    const event = new PageTransitionEvent("pagehide", { persisted: false }); window.dispatchEvent(event);
    const f = window.__events; return { trusted: event.isTrusted, disposed: f.bridge.disposed, ended: f.gate.state === "ended", bindingCleared: f.gate.binding === null, timers: f.timers.size, idb: window.__idbAccesses };
  }));
  check(disposal[0].trusted === false && disposal[0].disposed && disposal[0].ended && disposal[0].bindingCleared && disposal[0].timers === 0 && disposal[0].idb === 0);
  check(nativeEvents.some(e => e.name === "offline" && e.trusted && !e.online)); check(nativeEvents.some(e => e.name === "online" && e.trusted && e.online));
  assert.deepEqual(errors, []); assert.deepEqual(forbidden, []); checks += 2;
  for (const [p, h] of Object.entries(sourceHashes)) { assert.equal(sha(readFileSync(p)), h); }
  const receipt = { result: "PASS-FRESH-DOM-TRIAL-EVENTS-NOT-AUTH-OR-APP", checks, sourceHashes, nativeEvents, disposal, requests, errors, forbidden, idbAccesses: 0, limits: "Standalone real DOM adapter only; probe/outcomes/timers and strategic+tactical counters are fixtures, not backend or engine. BFCache/nonpersisted pagehide hints synthetic; native refresh verifies empty new realm only, NOT native close callback delivery or actual BFCache/hidden-tab claim. Native network hints do not authenticate. No App/native/RNG/holds/save/HTTP status/private resource binding." };
  writeFileSync(join(out, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" }); process.stdout.write(`${JSON.stringify({ result: receipt.result, checks, nativeEvents, errors, forbidden })}\n`);
} catch (error) {
  writeFileSync(join(out, "failure.json"), `${JSON.stringify({ error: String(error), stack: error.stack, sourceHashes, errors, forbidden, nativeEvents, disposal }, null, 2)}\n`, { flag: "wx" }); throw error;
} finally { await browser?.close(); await server.close(); }
