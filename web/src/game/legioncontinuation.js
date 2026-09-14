// Web callback ownership, not a new game-rule timer. Capture before yielding;
// a callback from a previous scene or an earlier battle must never commit to
// the current batch (even when the next battle belongs to the same scenario).
export function captureLegionContinuation(app) {
  const scenario = app.scenario;
  const clock = app.clock;
  const batch = app._legionSlotBatch ?? null;
  const ticket = batch?.ticket ?? null;
  let claimed = false;
  const isCurrent = () =>
    app.scenario === scenario &&
    app.clock === clock &&
    (app._legionSlotBatch ?? null) === batch &&
    (!batch || (batch.ticket === ticket && !ticket?.completed)) &&
    !app.endView?.active &&
    !app._strategicBattleFailure;
  return {
    batch,
    ticket,
    isCurrent,
    claim() {
      if (claimed || !isCurrent()) return false;
      claimed = true;
      return true;
    },
  };
}
