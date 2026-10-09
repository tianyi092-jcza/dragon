// Transport/scheduler coordinator only. The supplied probe must independently
// verify session + Trial + immutable manifest and honor AbortSignal.
export function createTrialConnectionMonitor(gate, {
  probe, setTimer, clearTimer, pollMs = 5000, timeoutMs = 10000,
}) {
  if (!gate || typeof gate.beginProbe !== "function" ||
      typeof probe !== "function" || typeof setTimer !== "function" ||
      typeof clearTimer !== "function" || !Number.isSafeInteger(pollMs) ||
      pollMs <= 0 || !Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError("invalid trial connection monitor adapters");
  }
  let active = null, polling = null, closed = false, visible = true, freshRequested = false;
  function cancelPoll() {
    if (polling !== null) { clearTimer(polling); polling = null; }
  }
  function cancelActive() {
    if (!active) { return; }
    const request = active;
    active = null;
    clearTimer(request.deadline);
    request.controller.abort();
  }
  function schedule() {
    cancelPoll();
    if (!closed && visible && gate.state !== "ended") {
      polling = setTimer(() => { polling = null; checkNow(); }, pollMs);
    }
  }
  function finish(request, kind, value) {
    if (closed || active !== request) { return; }
    active = null;
    clearTimer(request.deadline);
    if (kind === "result") { gate.receive(request.ticket, value); }
    else {
      gate.fail(request.ticket, value);
      // Pause before synchronous abort listeners can request another rule step.
      if (value === "timeout") { request.controller.abort(); }
    }
    if (gate.state === "ended") {
      closed = true;
      cancelPoll();
      return;
    }
    if (freshRequested && visible) { freshRequested = false; checkNow(); }
    else { schedule(); }
  }
  function checkNow() {
    if (closed || gate.state === "ended") { return false; }
    cancelPoll();
    if (active) { return false; }
    freshRequested = false;
    const ticket = gate.beginProbe();
    const request = { ticket, controller: new AbortController(), deadline: null };
    active = request;
    const binding = gate.binding;
    request.deadline = setTimer(() => {
      if (active !== request || closed) { return; }
      finish(request, "failure", "timeout");
    }, timeoutMs);
    Promise.resolve().then(() => {
      if (request.controller.signal.aborted) { throw new Error("cancelled trial probe"); }
      return probe(binding, request.controller.signal);
    }).then(
      (result) => finish(request, "result", result),
      () => finish(request, "failure", "connection-error"),
    );
    return true;
  }
  return Object.freeze({
    checkNow,
    offline() { if (!closed) { gate.pause("offline"); } },
    online() {
      if (closed) { return; }
      if (active) { freshRequested = true; }
      else { checkNow(); }
    },
    setVisible(nextVisible) {
      if (typeof nextVisible !== "boolean") { throw new TypeError("visibility must be boolean"); }
      if (closed || visible === nextVisible) { return; }
      visible = nextVisible;
      gate.setVisible(nextVisible);
      if (!nextVisible) { cancelPoll(); freshRequested = false; }
      else if (active) { freshRequested = true; }
      else { checkNow(); }
    },
    restored() {
      if (closed) { return; }
      gate.pause("page-restored");
      if (active) { freshRequested = true; }
      else { checkNow(); }
    },
    dispose(reason = "window-dispose") {
      gate.end(reason);
      closed = true;
      freshRequested = false;
      cancelPoll();
      cancelActive();
    },
  });
}
