// Owned in-memory EventTargets, fake scheduler/transport; no browser/user IO.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createTrialConnectionGate } from "../web/src/editor/trialconnection.js";
import { createTrialConnectionMonitor } from "../web/src/editor/trialconnectionmonitor.js";
import { bindTrialConnectionEvents } from "../web/src/editor/trialconnectionevents.js";
const paths = ["web/src/editor/trialconnection.js", "web/src/editor/trialconnectionmonitor.js", "web/src/editor/trialconnectionevents.js", "tools/verify_editor_trial_connection_events.mjs"];
const sha = (b) => createHash("sha256").update(b).digest("hex");
const sourceHashes = Object.fromEntries(paths.map((p) => [p, sha(readFileSync(p))]));
const binding = Object.freeze({ trialId: "event-trial", snapshotId: "event-snapshot", ownerId: "event-owner", sessionId: "event-session", authEpoch: "event-epoch", gameId: "event-game", draftRevision: "12345678901234567890", snapshotDigest: "a".repeat(64), chapterId: "event-chapter", manifestDigest: "b".repeat(64) });
const valid = () => ({ kind: "valid", binding: { ...binding } });
const flush = async () => { for (let i = 0; i < 8; i++) { await Promise.resolve(); } };
let checks = 0, negativeControls = 0, idb = 0;
Object.defineProperty(globalThis, "indexedDB", { configurable: true, get() { idb++; throw new Error("no formal IDB"); } });
function check(value) { assert.ok(value); checks++; }
function event(target, type, persisted) { const e = new Event(type); if (persisted !== undefined) { Object.defineProperty(e, "persisted", { value: persisted }); } target.dispatchEvent(e); }
function fixture({ hidden = false, online = true } = {}) {
  const win = new EventTarget(), doc = new EventTarget(), editor = new EventTarget(), tasks = new Map(), requests = [];
  doc.hidden = hidden;
  const nav = { onLine: online }, gate = createTrialConnectionGate(binding);
  Object.defineProperty(win, "opener", { get() { throw new Error("opener must not be read"); } });
  let id = 0;
  const monitor = createTrialConnectionMonitor(gate, {
    setTimer(fn, ms) { const key = ++id; tasks.set(key, { fn, ms }); return key; },
    clearTimer(key) { tasks.delete(key); },
    probe(expected, signal) { return new Promise((resolve, reject) => requests.push({ expected, signal, resolve, reject })); },
  });
  const options = { windowTarget: win, documentTarget: doc, navigatorState: nav };
  return { win, doc, editor, tasks, requests, nav, gate, monitor, options };
}
{
  const f = fixture(); let foreign = 0;
  f.win.addEventListener("online", () => foreign++);
  const bridge = bindTrialConnectionEvents(f.monitor, f.options);
  check(Object.isFrozen(bridge) && !bridge.disposed && !f.gate.canAdvanceRules);
  await flush(); check(f.requests.length === 1);
  f.requests[0].resolve(valid()); await flush(); check(f.gate.canAdvanceRules);
  event(f.editor, "pagehide", false); event(f.win, "beforeunload"); check(f.gate.canAdvanceRules && !bridge.disposed);
  event(f.win, "offline"); check(!f.gate.canAdvanceRules && f.gate.binding !== null);
  event(f.win, "online"); check(!f.gate.canAdvanceRules); await flush(); check(f.requests.length === 2);
  event(f.win, "online"); check(f.requests.length === 2);
  // A repeated hint asks for a new current confirmation after this outstanding result.
  f.requests[1].resolve(valid()); await flush(); check(f.requests.length === 3 && f.gate.canAdvanceRules);
  f.requests[2].resolve(valid()); await flush();
  event(f.win, "pagehide", true); check(!bridge.disposed && !f.gate.canAdvanceRules && f.tasks.size === 0);
  event(f.win, "online"); event(f.doc, "visibilitychange"); await flush(); check(f.requests.length === 3 && !f.gate.canAdvanceRules);
  event(f.win, "pageshow", true); await flush(); check(f.requests.length === 4 && !f.gate.canAdvanceRules);
  f.requests[3].resolve(valid()); await flush(); check(f.gate.canAdvanceRules && f.requests.length === 4);
  f.doc.hidden = true; event(f.doc, "visibilitychange"); check(!f.gate.canAdvanceRules && f.tasks.size === 0);
  f.doc.hidden = false; event(f.doc, "visibilitychange"); await flush(); check(f.requests.length === 5 && !f.gate.canAdvanceRules);
  f.requests[4].resolve(valid()); await flush(); check(f.gate.canAdvanceRules);
  f.monitor.checkNow(); await flush(); const last = f.requests[5];
  let abortAdvance;
  last.signal.addEventListener("abort", () => { abortAdvance = f.gate.canAdvanceRules; event(f.win, "online"); });
  event(f.win, "pagehide", false); check(bridge.disposed && f.gate.binding === null && f.tasks.size === 0 && abortAdvance === false);
  last.resolve(valid()); await flush(); check(f.gate.state === "ended");
  const count = f.requests.length; event(f.win, "online"); event(f.doc, "visibilitychange"); event(f.win, "pageshow", true); await flush();
  check(f.requests.length === count && foreign > 0 && !bridge.dispose());
}
{
  const f = fixture({ hidden: true }); const bridge = bindTrialConnectionEvents(f.monitor, f.options);
  await flush(); check(f.requests.length === 0 && !f.gate.canAdvanceRules);
  event(f.win, "online"); await flush(); check(f.requests.length === 0);
  f.doc.hidden = false; event(f.doc, "visibilitychange"); await flush(); check(f.requests.length === 1);
  f.requests[0].resolve(valid()); await flush(); check(f.gate.canAdvanceRules);
  bridge.dispose();
}
{
  const f = fixture({ online: false }); const bridge = bindTrialConnectionEvents(f.monitor, f.options);
  check(f.gate.reason === "offline"); await flush(); check(f.requests.length === 1);
  f.requests[0].reject(new Error("fixture no connection")); await flush(); check(!f.gate.canAdvanceRules && f.gate.binding !== null);
  f.nav.onLine = true; event(f.win, "online"); await flush(); check(f.requests.length === 2 && !f.gate.canAdvanceRules);
  f.requests[1].resolve({ kind: "valid", binding: { ...binding, authEpoch: "other-login" } }); await flush(); check(!f.gate.canAdvanceRules);
  event(f.win, "pageshow", true); await flush(); check(f.requests.length === 3);
  f.requests[2].resolve({ kind: "invalid", reason: "auth-revoked" }); await flush(); check(f.gate.state === "ended" && f.gate.binding === null);
  bridge.dispose();
}
{
  const f = fixture(); const bridge = bindTrialConnectionEvents(f.monitor, f.options); await flush();
  event(f.win, "pagehide", true); f.requests[0].resolve({ kind: "invalid", reason: "auth-invalid" }); await flush();
  check(f.gate.state === "paused" && f.gate.binding !== null);
  event(f.win, "pageshow", true); await flush(); check(f.requests.length === 2);
  f.requests[1].resolve(valid()); await flush(); check(f.gate.canAdvanceRules); bridge.dispose();
}
{
  const f = fixture(); const installed = [], removed = [];
  const add = f.win.addEventListener.bind(f.win), remove = f.win.removeEventListener.bind(f.win);
  f.win.addEventListener = (name, callback) => { installed.push([name, callback]); add(name, callback); if (name === "pagehide") { throw new Error("fixture partial install"); } };
  f.win.removeEventListener = (name, callback) => { removed.push([name, callback]); remove(name, callback); };
  assert.throws(() => bindTrialConnectionEvents(f.monitor, f.options), /partial install/); negativeControls++;
  await flush(); check(f.gate.state === "ended" && f.requests.length === 0 && f.tasks.size === 0);
  assert.deepEqual(removed, installed); checks++;
}
for (const change of [o => { o.windowTarget = {}; }, o => { o.documentTarget = {}; }, o => { o.navigatorState = {}; }]) {
  const f = fixture(); const options = { ...f.options }; change(options);
  assert.throws(() => bindTrialConnectionEvents(f.monitor, options), TypeError); negativeControls++; check(f.tasks.size === 0); f.monitor.dispose();
}
{
  const f = fixture(); assert.throws(() => bindTrialConnectionEvents({}, f.options), TypeError); negativeControls++; f.monitor.dispose();
}
check(idb === 0); delete globalThis.indexedDB;
for (const [p, h] of Object.entries(sourceHashes)) { assert.equal(sha(readFileSync(p)), h); }
process.stdout.write(`${JSON.stringify({ result: "PASS-INJECTED-TRIAL-BROWSER-EVENTS-NOT-AUTH-OR-APP", checks, negativeControls, idbAccesses: idb, sourceHashes, limits: "Fake EventTargets, scheduler and verified-outcome fixtures only; BFCache events are synthetic. No real auth/backend/HTTP/engine barriers/hold debt/actual App progress disposal. No beforeunload termination, no editor-window or opener binding." })}\n`);
