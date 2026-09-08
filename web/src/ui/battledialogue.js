/** User-approved modern presentation, NOT C315/A12A marker scheduling.
 * Consumes the append-only Session event log without writing any rule state.
 * UI lifetimes are deliberately absent from native message snapshots.
 */
export class BattleDialoguePresentation {
  constructor({
    now = () => Date.now(),
    schedule = (callback, delay) => setTimeout(callback, delay),
    cancel = (timer) => clearTimeout(timer),
    show,
    hide,
  } = {}) {
    this.now = now;
    this.schedule = schedule;
    this.cancel = cancel;
    this.show = show;
    this.hide = hide;
    this.slots = [null, null];
    this.cursor = 0;
    this.serial = 0;
    this.active = false;
  }

  // Opening a view is a new display boundary. Do not replay historical startup
  // or restored events: only retained endpoint captures are eligible here.
  start(events, slots) {
    this.dispose();
    this.active = true;
    this.cursor = events.length;
    for (const capture of slots) if (capture) this.replace(capture);
  }

  sync(events) {
    if (!this.active) return;
    this.expire(); // Also covers throttled background timers before next paint.
    for (; this.cursor < events.length; this.cursor++) {
      const event = events[this.cursor];
      if (event.type === "tactical-talk-show") this.replace(event.message);
      // Raw closes (including local semantic input) and C407 are independent.
    }
  }

  replace(capture) {
    const side = capture?.side;
    if (side !== 0 && side !== 1) return;
    this.dismiss(side);
    // An unresolved replacement clears the old speech, never invents new text.
    if (capture.status !== "decoded") return;
    const entry = {
      serial: ++this.serial,
      capture: structuredClone(capture),
      deadline: this.now() + 3000,
      timer: null,
    };
    this.slots[side] = entry;
    this.show?.(entry.capture, entry);
    const timeout = () => {
      if (!this.owns(side, entry)) return;
      const remaining = entry.deadline - this.now();
      if (remaining > 0) entry.timer = this.schedule(timeout, remaining);
      else this.dismiss(side);
    };
    entry.timer = this.schedule(timeout, 3000);
  }

  owns(side, entry) {
    return this.active && this.slots[side] === entry;
  }

  expire() {
    for (const [side, entry] of this.slots.entries())
      if (entry && this.now() >= entry.deadline) this.dismiss(side);
  }

  dismiss(side) {
    const entry = this.slots[side];
    if (!entry) return;
    this.cancel(entry.timer);
    this.slots[side] = null;
    this.hide?.(side);
  }

  dismissAll() {
    this.dismiss(0);
    this.dismiss(1);
  }

  dispose() {
    this.active = false;
    this.dismissAll();
    this.cursor = 0;
  }
}
