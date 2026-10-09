// Fake scheduler/transport: never HTTP/browser/profile/native rules or real timer IO.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createTrialConnectionGate } from "../web/src/editor/trialconnection.js";
import { createTrialConnectionMonitor } from "../web/src/editor/trialconnectionmonitor.js";
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const paths = ["web/src/editor/trialconnection.js", "web/src/editor/trialconnectionmonitor.js", "tools/verify_editor_trial_connection_monitor.mjs"];
const sourceHashes = Object.fromEntries(paths.map((path) => [path, sha(readFileSync(path))]));
const binding = Object.freeze({ trialId: "monitor-trial", snapshotId: "monitor-snapshot", ownerId: "monitor-owner", sessionId: "monitor-session", authEpoch: "monitor-epoch", gameId: "monitor-game", draftRevision: "99999999999999999999", snapshotDigest: "a".repeat(64), chapterId: "monitor-chapter", manifestDigest: "b".repeat(64) });
const valid = () => ({ kind: "valid", binding: { ...binding } });
const flush = async () => { for (let i = 0; i < 8; i++) { await Promise.resolve(); } };
let checks = 0;
function check(value) { assert.ok(value); checks++; }
function fixture({ cooperative = true } = {}) {
  let now = 0, id = 0;
  const tasks = new Map(), requests = [], abortCanAdvance = [];
  const setTimer = (fn, delay) => { const handle = ++id; tasks.set(handle, { fn, at: now + delay }); return handle; };
  const clearTimer = (handle) => { tasks.delete(handle); };
  function advance(ms) {
    const end = now + ms;
    let iterations = 0;
    for (;;) {
      const due = [...tasks].filter(([, task]) => task.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!due) { break; }
      assert.ok(++iterations < 100, "fixture timer livelock");
      tasks.delete(due[0]); now = due[1].at; due[1].fn();
    }
    now = end;
  }
  const gate = createTrialConnectionGate(binding);
  const probe = (expected, signal) => new Promise((resolve, reject) => {
    requests.push({ expected, signal, resolve, reject });
    signal.addEventListener("abort", () => abortCanAdvance.push(gate.canAdvanceRules), { once: true });
    if (cooperative) { signal.addEventListener("abort", () => reject(new Error("fixture abort")), { once: true }); }
  });
  const monitor = createTrialConnectionMonitor(gate, { probe, setTimer, clearTimer });
  return { gate, monitor, requests, tasks, abortCanAdvance, advance, setTimer, clearTimer, probe };
}
{
  const f = fixture();
  check(f.monitor.checkNow()); check(!f.monitor.checkNow());
  await flush(); check(f.requests.length === 1 && !f.gate.canAdvanceRules);
  check(Object.isFrozen(f.requests[0].expected)); assert.deepEqual(f.requests[0].expected, binding); checks++;
  f.requests[0].resolve(valid()); await flush(); check(f.gate.canAdvanceRules);
  f.advance(4999); await flush(); check(f.requests.length === 1);
  f.advance(1); await flush(); check(f.requests.length === 2 && f.gate.canAdvanceRules);
  f.monitor.offline(); check(!f.gate.canAdvanceRules);
  f.monitor.online(); f.monitor.online(); check(f.requests.length === 2);
  f.requests[1].resolve(valid()); await flush();
  check(!f.gate.canAdvanceRules && f.requests.length === 3); // Fresh post-offline confirmation required.
  f.requests[2].resolve(valid()); await flush(); check(f.gate.canAdvanceRules);
  f.monitor.checkNow(); await flush(); f.requests[3].reject(new Error("fixture connection failure")); await flush();
  check(!f.gate.canAdvanceRules && f.gate.binding !== null);
  f.monitor.online(); await flush(); check(f.requests.length === 5 && !f.gate.canAdvanceRules);
  f.requests[4].resolve(valid()); await flush(); check(f.gate.canAdvanceRules);
  f.monitor.setVisible(false); check(!f.gate.canAdvanceRules && f.tasks.size === 0);
  f.advance(100000); await flush(); check(f.requests.length === 5);
  f.monitor.setVisible(true); await flush(); check(!f.gate.canAdvanceRules && f.requests.length === 6);
  f.requests[5].resolve({ kind: "valid", binding: { ...binding, draftRevision: "100000000000000000000" } }); await flush();
  check(!f.gate.canAdvanceRules && f.gate.binding.draftRevision === binding.draftRevision);
  f.monitor.restored(); await flush(); check(f.requests.length === 7 && !f.gate.canAdvanceRules);
  f.requests[6].resolve(valid()); await flush(); check(f.gate.canAdvanceRules);
  f.monitor.dispose(); check(f.gate.state === "ended" && f.tasks.size === 0 && f.gate.binding === null);
}
{
  const f = fixture({ cooperative: false });
  f.monitor.checkNow(); await flush(); const old = f.requests[0];
  f.advance(9999); check(!old.signal.aborted);
  f.advance(1); check(old.signal.aborted && f.gate.reason === "timeout" && !f.gate.canAdvanceRules);
  f.advance(5000); await flush(); check(f.requests.length === 2);
  old.resolve({ kind: "invalid", reason: "auth-invalid" }); await flush();
  check(f.gate.state === "paused" && f.gate.binding !== null);
  f.requests[1].resolve(valid()); await flush(); check(f.gate.canAdvanceRules);
  f.monitor.checkNow(); await flush(); const late = f.requests[2];
  f.monitor.dispose("exit"); check(late.signal.aborted && f.gate.reason === "exit" && f.tasks.size === 0);
  late.resolve(valid()); await flush(); check(f.gate.state === "ended" && f.gate.binding === null);
  f.monitor.online(); f.monitor.restored(); f.monitor.offline(); f.monitor.setVisible(false); f.monitor.setVisible(true);
  check(!f.monitor.checkNow()); f.advance(100000); await flush(); check(f.requests.length === 3);
}
{
  const f = fixture(); f.monitor.checkNow(); await flush();
  f.requests[0].resolve(valid()); await flush(); check(f.gate.canAdvanceRules);
  f.monitor.checkNow(); await flush(); f.advance(10000); await flush();
  check(!f.gate.canAdvanceRules && f.gate.reason === "timeout");
  assert.deepEqual(f.abortCanAdvance, [false]); checks++;
  f.monitor.dispose();
}
for (const reason of ["auth-invalid", "account-disabled", "snapshot-deleted", "game-deleted"]) {
  const f = fixture(); f.monitor.checkNow(); await flush();
  f.requests[0].resolve({ kind: "invalid", reason }); await flush();
  check(f.gate.state === "ended" && f.gate.reason === reason && f.tasks.size === 0);
  check(!f.monitor.checkNow()); f.monitor.dispose(); check(f.gate.reason === reason);
}
{
  const f = fixture();
  const bad = createTrialConnectionMonitor(f.gate, { probe() { throw new Error("fixture sync throw"); }, setTimer: f.setTimer, clearTimer: f.clearTimer });
  bad.checkNow(); await flush(); check(f.gate.state === "paused" && f.gate.reason === "connection-error");
  bad.dispose(); check(f.tasks.size === 0);
}
{
  const f = fixture(); f.monitor.checkNow(); f.monitor.dispose(); await flush();
  check(f.requests.length === 0 && f.tasks.size === 0 && f.gate.state === "ended");
}
{
  const f = fixture();
  assert.throws(() => createTrialConnectionMonitor(f.gate, { probe: f.probe, setTimer: f.setTimer, clearTimer: f.clearTimer, pollMs: 0 }), TypeError); checks++;
  assert.throws(() => f.monitor.setVisible(null), TypeError); checks++;
  f.monitor.dispose();
}
for (const [path, hash] of Object.entries(sourceHashes)) { assert.equal(sha(readFileSync(path)), hash); }
process.stdout.write(`${JSON.stringify({ result: "PASS-INJECTED-TRIAL-CONNECTION-MONITOR-NOT-BACKEND", checks, suggestedPollMs: 5000, suggestedTimeoutMs: 10000, sourceHashes, limits: "Only fake timer/transport, one active logical probe and at most one un-aborted signal. Noncooperative aborted work can still physically exist; late results discarded, not a real HTTP cancellation proof. No browser events/real auth/private routes/engine barrier/disposal wiring or Q70/Q71 completion." })}\n`);
