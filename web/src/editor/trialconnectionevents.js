// Window-local lifecycle adapter only; no opener, credentials, HTTP or game state.
export function bindTrialConnectionEvents(monitor, {
  windowTarget, documentTarget, navigatorState,
}) {
  for (const method of ["offline", "online", "setVisible", "restored", "checkNow", "dispose"]) {
    if (typeof monitor?.[method] !== "function") {
      throw new TypeError("invalid trial monitor");
    }
  }
  for (const target of [windowTarget, documentTarget]) {
    if (typeof target?.addEventListener !== "function" ||
        typeof target?.removeEventListener !== "function") {
      throw new TypeError("invalid trial event target");
    }
  }
  if (typeof documentTarget.hidden !== "boolean" || typeof navigatorState?.onLine !== "boolean") {
    throw new TypeError("invalid trial browser state");
  }
  let disposed = false, parked = false, visible = !documentTarget.hidden;
  const listeners = [];
  function dispose() {
    if (disposed) { return false; }
    disposed = true;
    // End first: synchronous abort/removal hooks cannot request another step.
    // Remove only our exact callbacks, including after a failing monitor adapter.
    try { monitor.dispose("window-dispose"); }
    finally {
      for (const [target, name, callback] of listeners) {
        target.removeEventListener(name, callback);
      }
    }
    return true;
  }
  function syncVisibility() {
    const next = !parked && documentTarget.hidden === false;
    const changed = next !== visible;
    visible = next;
    monitor.setVisible(next);
    return changed;
  }
  function listen(target, name, action) {
    const callback = (event) => { if (!disposed) { action(event); } };
    // Record before install so a partially throwing injected target is cleaned.
    listeners.push([target, name, callback]);
    target.addEventListener(name, callback);
  }
  try {
    listen(windowTarget, "offline", () => monitor.offline());
    listen(windowTarget, "online", () => { if (visible) { monitor.online(); } });
    listen(documentTarget, "visibilitychange", () => syncVisibility());
    listen(windowTarget, "pagehide", (event) => {
      if (event.persisted === true) { parked = true; syncVisibility(); }
      else { dispose(); }
    });
    listen(windowTarget, "pageshow", (event) => {
      if (event.persisted !== true) { return; }
      parked = false;
      // A visibility transition already requests fresh confirmation. Avoid
      // invalidating that newly issued ticket by issuing restored a second time.
      if (!syncVisibility() && visible) { monitor.restored(); }
    });
    monitor.setVisible(visible);
    if (!navigatorState.onLine) { monitor.offline(); }
    if (visible) {
      if (navigatorState.onLine) { monitor.restored(); }
      else { monitor.checkNow(); }
    }
  } catch (cause) {
    dispose();
    throw cause;
  }
  // beforeunload is deliberately absent: navigation can still be cancelled.
  return Object.freeze({ dispose, get disposed() { return disposed; } });
}
