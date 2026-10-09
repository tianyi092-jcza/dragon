// Pure contract fixtures only: no server/profile, timers, browser or persistence.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sourcePaths = ["web/src/editor/trialconnection.js", "tools/verify_editor_trial_connection.mjs"];
const sourceHashes = Object.fromEntries(sourcePaths.map((path) => [path, sha(readFileSync(path))]));
let storageCalls = 0;
const previousStorage = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
Object.defineProperty(globalThis, "indexedDB", { configurable: true, get() { storageCalls++; throw new Error("forbidden persistence access"); } });
try {
  const { createTrialConnectionGate } = await import("../web/src/editor/trialconnection.js");
  const binding = Object.freeze({
    trialId: "fixture-trial", snapshotId: "fixture-snapshot", ownerId: "fixture-owner",
    sessionId: "fixture-session", authEpoch: "epoch-fixture", gameId: "fixture-game",
    draftRevision: "900719925474099312345", snapshotDigest: "1".repeat(64),
    chapterId: "fixture-chapter", manifestDigest: "2".repeat(64),
  });
  const original = JSON.stringify(binding);
  const valid = () => ({ kind: "valid", binding: { ...binding } });
  let checks = 0, negativeControls = 0;
  const check = (value) => { assert.ok(value); checks++; };
  const makeRunning = () => { const gate = createTrialConnectionGate(binding); check(gate.receive(gate.beginProbe(), valid())); return gate; };
  const gate = createTrialConnectionGate(binding);
  const progress = { strategic: 0, tactical: 0, rng: [7, 9, 3], snapshot: binding.snapshotDigest };
  const strategicStep = () => { progress.strategic++; };
  const tacticalStep = () => { progress.tactical++; };
  check(!gate.canAdvanceRules);
  check(!gate.runRuleStep(strategicStep));
  const start = gate.beginProbe();
  check(gate.beginProbe() === start && gate.hasPendingProbe);
  check(gate.receive(start, valid()));
  check(gate.canAdvanceRules && gate.state === "running");
  check(gate.runRuleStep(strategicStep) && gate.runRuleStep(tacticalStep));
  const savedProgress = structuredClone(progress);
  const heartbeat = gate.beginProbe();
  check(gate.canAdvanceRules); // A periodic pending probe alone isn't a failure.
  gate.pause("offline");
  check(!gate.canAdvanceRules && gate.beginProbe() === heartbeat);
  check(!gate.runRuleStep(strategicStep) && !gate.runRuleStep(tacticalStep));
  check(!gate.receive(heartbeat, valid())); // Old pre-offline success cannot release.
  check(gate.state === "paused" && !gate.hasPendingProbe);
  assert.deepEqual(progress, savedProgress); checks++;
  const reconnect = gate.beginProbe();
  check(!gate.canAdvanceRules && gate.receive(reconnect, valid()));
  check(gate.binding.draftRevision === binding.draftRevision);
  check(gate.runRuleStep(strategicStep));
  check(progress.strategic === 2 && progress.tactical === 1); // No replay/catch-up.
  const failure = gate.beginProbe();
  check(gate.fail(failure, "connection-error"));
  check(gate.state === "paused" && gate.binding !== null);
  check(!gate.receive(failure, { kind: "invalid", reason: "auth-invalid" }));
  const unconfirmed = gate.beginProbe();
  check(!gate.receive(unconfirmed, { kind: "unconfirmed", status: 503 }));
  check(gate.state === "paused" && gate.reason === "unconfirmed");
  const raw401 = gate.beginProbe();
  check(!gate.receive(raw401, { status: 401 })); // Core doesn't authenticate raw HTTP.
  check(gate.state === "paused" && gate.binding !== null);
  for (const key of Object.keys(binding)) {
    const ticket = gate.beginProbe();
    const wrong = { ...binding, [key]: key.endsWith("Digest") ? "3".repeat(64) : `${binding[key]}-other` };
    check(!gate.receive(ticket, { kind: "valid", binding: wrong }));
    check(gate.state === "paused" && gate.binding[key] === binding[key]);
    negativeControls++;
  }
  for (const reason of ["exit", "window-dispose"]) {
    check(!gate.receive(gate.beginProbe(), { kind: "invalid", reason }));
    check(gate.state === "paused" && gate.binding !== null); negativeControls++;
  }
  const malformed = gate.beginProbe();
  check(!gate.receive(malformed, { kind: "valid", binding: { ...binding, extra: true } })); negativeControls++;
  const forged = gate.beginProbe();
  check(!gate.receive(Object.freeze({}), valid()) && gate.hasPendingProbe); negativeControls++;
  check(gate.receive(forged, valid()));
  const hidden = gate.beginProbe();
  gate.setVisible(false);
  check(!gate.canAdvanceRules && !gate.receive(hidden, valid()));
  const whileHidden = gate.beginProbe();
  check(!gate.receive(whileHidden, valid()) && !gate.canAdvanceRules);
  gate.setVisible(true);
  check(!gate.canAdvanceRules);
  check(gate.receive(gate.beginProbe(), valid()));
  gate.pause("page-restored");
  check(!gate.canAdvanceRules);
  check(gate.receive(gate.beginProbe(), valid()));
  let prefix = 0;
  check(gate.runRuleStep(() => { prefix++; gate.pause("connection-error"); }));
  check(!gate.runRuleStep(() => { prefix++; }));
  check(prefix === 1); // Failure does not undo the completed synchronous prefix.
  check(gate.receive(gate.beginProbe(), valid()));
  assert.throws(() => gate.runRuleStep(() => { prefix++; throw new Error("rule exception"); }), /rule exception/); checks++;
  check(prefix === 2);
  const terminals = ["auth-invalid", "auth-expired", "auth-revoked", "account-disabled", "trial-ended", "snapshot-deleted", "game-deleted"];
  for (const reason of terminals) {
    const current = makeRunning(), ticket = current.beginProbe();
    check(current.receive(ticket, { kind: "invalid", reason }));
    check(current.state === "ended" && current.binding === null && !current.hasPendingProbe);
    check(current.beginProbe() === null && !current.runRuleStep(strategicStep));
    check(!current.receive(ticket, valid()));
    current.pause("offline"); current.setVisible(false); current.setVisible(true);
    check(!current.canAdvanceRules && current.reason === reason);
    current.end("exit"); check(current.reason === reason);
  }
  for (const reason of ["exit", "window-dispose"]) {
    const current = makeRunning(); current.end(reason); check(current.binding === null && !current.canAdvanceRules);
  }
  const oldGate = makeRunning(), oldTicket = oldGate.beginProbe(), newGate = makeRunning();
  check(!newGate.receive(oldTicket, { kind: "invalid", reason: "auth-invalid" }) && newGate.canAdvanceRules);
  oldGate.end("exit"); check(!oldGate.receive(oldTicket, valid()));
  for (const bad of [null, { ...binding, draftRevision: 7 }, { ...binding, draftRevision: "01" }, { ...binding, manifestDigest: "bad" }]) {
    assert.throws(() => createTrialConnectionGate(bad), TypeError); negativeControls++;
  }
  assert.throws(() => gate.setVisible(null), TypeError); negativeControls++;
  assert.throws(() => gate.pause("pretend-online"), TypeError); negativeControls++;
  assert.throws(() => gate.end("503"), TypeError); negativeControls++;
  assert.throws(() => gate.fail(gate.beginProbe(), "401"), TypeError); negativeControls++;
  check(JSON.stringify(binding) === original && Object.isFrozen(gate.binding));
  check(storageCalls === 0);
  for (const [path, hash] of Object.entries(sourceHashes)) { assert.equal(sha(readFileSync(path)), hash); }
  process.stdout.write(`${JSON.stringify({ result: "PASS-PURE-TRIAL-CONNECTION-GATE-NOT-RUNTIME-AUTH", checks, negativeControls, terminalReasons: terminals.length, storageCalls, sourceHashes, limits: "Trusted adapter outcomes are fixtures, not authentication. No probe HTTP/timer/abort adapter, engine/hold/UI hook or App progress-disposal proof. Pure synchronous per-step barrier, no real rules/CPU/RNG simulation; no Q70/Q71 completion claim." })}\n`);
} finally {
  if (previousStorage) { Object.defineProperty(globalThis, "indexedDB", previousStorage); }
  else { delete globalThis.indexedDB; }
}
