// Q70/Q71 client capability core, NOT authentication or a runtime integration.
// Outcomes must come from an independently verified adapter, never page messages.
const bindingKeys = Object.freeze([
  "trialId", "snapshotId", "ownerId", "sessionId", "authEpoch", "gameId",
  "draftRevision", "snapshotDigest", "chapterId", "manifestDigest",
]);
const invalidReasons = new Set([
  "auth-invalid", "auth-expired", "auth-revoked", "account-disabled",
  "trial-ended", "snapshot-deleted", "game-deleted",
]);
const endReasons = new Set([...invalidReasons, "exit", "window-dispose"]);
const pauseReasons = new Set([
  "offline", "connection-error", "timeout", "unconfirmed", "page-restored",
]);
function copyBinding(value) {
  if (!value || Object.keys(value).sort().join("\n") !== [...bindingKeys].sort().join("\n")) {
    throw new TypeError("invalid trial connection binding");
  }
  for (const key of bindingKeys) {
    if (typeof value[key] !== "string" || value[key].length === 0 || value[key].length > 256) {
      throw new TypeError("invalid trial connection identity field");
    }
  }
  if (!/^(?:0|[1-9][0-9]*)$/.test(value.draftRevision) ||
      !/^[0-9a-f]{64}$/.test(value.snapshotDigest) ||
      !/^[0-9a-f]{64}$/.test(value.manifestDigest)) {
    throw new TypeError("invalid trial revision/digest");
  }
  return Object.freeze(Object.fromEntries(bindingKeys.map((key) => [key, value[key]])));
}
function sameBinding(a, b) {
  try {
    const copy = copyBinding(b);
    return bindingKeys.every((key) => a[key] === copy[key]);
  } catch {
    return false;
  }
}
export function createTrialConnectionGate(value) {
  let binding = copyBinding(value);
  let state = "paused", reason = "unconfirmed", visible = true;
  let generation = {}, pending = null;
  const invalidate = (nextReason) => {
    if (state === "ended") { return; }
    generation = {};
    state = "paused";
    reason = nextReason;
    // Retain the outstanding ticket: a hint does not issue a competing probe.
  };
  const api = {
    get binding() { return binding; },
    get state() { return state; },
    get reason() { return reason; },
    get canAdvanceRules() { return state === "running" && visible; },
    // Process-local permission generation, NOT a bearer credential or session ID.
    get rulePermit() { return api.canAdvanceRules ? generation : null; },
    get hasPendingProbe() { return pending !== null; },
    beginProbe() {
      if (state === "ended") { return null; }
      if (pending) { return pending.ticket; }
      const ticket = Object.freeze({});
      pending = { ticket, generation };
      return ticket;
    },
    receive(ticket, outcome) {
      if (state === "ended" || !pending || ticket !== pending.ticket) { return false; }
      const current = pending.generation === generation;
      pending = null;
      if (!current) { return false; }
      if (outcome?.kind === "invalid" && invalidReasons.has(outcome.reason)) {
        api.end(outcome.reason);
        return true;
      }
      if (outcome?.kind === "valid" && sameBinding(binding, outcome.binding) && visible) {
        state = "running";
        reason = null;
        return true;
      }
      invalidate("unconfirmed");
      return false;
    },
    fail(ticket, failure = "connection-error") {
      if (!pauseReasons.has(failure)) { throw new TypeError("invalid connection failure"); }
      if (state === "ended" || !pending || ticket !== pending.ticket) { return false; }
      const current = pending.generation === generation;
      pending = null;
      if (!current) { return false; }
      invalidate(failure);
      return true;
    },
    pause(nextReason) {
      if (!pauseReasons.has(nextReason)) { throw new TypeError("invalid trial pause reason"); }
      invalidate(nextReason);
    },
    setVisible(nextVisible) {
      if (typeof nextVisible !== "boolean") { throw new TypeError("visibility must be boolean"); }
      if (state === "ended" || visible === nextVisible) { return; }
      visible = nextVisible;
      invalidate(nextVisible ? "page-restored" : "hidden");
    },
    end(nextReason = "exit") {
      if (!endReasons.has(nextReason)) { throw new TypeError("invalid trial end reason"); }
      if (state === "ended") { return; }
      generation = {};
      pending = null;
      binding = null;
      state = "ended";
      reason = nextReason;
    },
    runRuleStep(step) {
      if (typeof step !== "function") { throw new TypeError("rule step must be callable"); }
      if (!api.canAdvanceRules) { return false; }
      step(); // Preserve committed prefixes/exceptions; never repair, rewind or replay.
      return true;
    },
  };
  return Object.freeze(api);
}
