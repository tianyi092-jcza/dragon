// User-approved Web pacing, NOT KI:264A/286C/28B4 timing. One presentation-only
// clock owns map/minimap phases and the single SFX channel. No rule writes/RNG.
export const ENGAGEMENT_FRAME_MS = 100;
export const ENGAGEMENT_SOUND_MS = 200;

function inContact(legion) {
  const countdown =
    legion?._engagement?.countdown ?? legion?.engagementCountdown;
  return (
    !!legion?._engagement &&
    !legion.dead &&
    legion._active !== false &&
    Number.isInteger(countdown) &&
    countdown > 0
  );
}

export class EngagementPresentation {
  constructor({ playSound = () => false, stopSound = () => {} } = {}) {
    this.playSound = playSound;
    this.stopSound = stopSound;
    this.contacts = new Set();
    this.scenario = null;
    this.elapsed = 0;
    this.lastTime = null;
    this.needsPulse = false;
    this.sounding = false;
    this.paused = false;
  }

  pause() {
    this.lastTime = null; // hidden-tab time must not become catch-up debt
    this.paused = true;
    if (this.sounding) {
      try {
        this.stopSound();
      } catch {
        /* Audio failure cannot affect rules. */
      }
      this.sounding = false;
    }
  }

  reset() {
    const changed = this.contacts.size > 0;
    this.pause();
    this.contacts.clear();
    this.scenario = null;
    this.elapsed = 0;
    this.needsPulse = false;
    return changed;
  }

  /** Called once by the map RAF, never by draw. All contacts share one beat,
   * so simultaneous legions cannot multiply SFX volume or request frequency.
   */
  update(scenario, now, { enabled = true, paused = false } = {}) {
    if (!enabled || !scenario || !Number.isFinite(now)) return this.reset();
    let changed = false;
    if (scenario !== this.scenario) {
      changed = this.reset();
      this.scenario = scenario;
    }
    const contacts = new Set((scenario.legions ?? []).filter(inContact));
    if (!contacts.size) return this.reset() || changed;
    const first = !this.contacts.size;
    changed ||=
      contacts.size !== this.contacts.size ||
      [...contacts].some((legion) => !this.contacts.has(legion));
    this.contacts = contacts;
    if (first) {
      this.elapsed = 0;
      this.lastTime = now;
      this.needsPulse = true;
    }
    if (paused) {
      this.pause();
      return changed;
    }
    this.paused = false;
    const oldFrame = Math.floor(this.elapsed / ENGAGEMENT_FRAME_MS);
    const oldPulse = Math.floor(this.elapsed / ENGAGEMENT_SOUND_MS);
    this.elapsed +=
      this.lastTime == null ? 0 : Math.max(0, now - this.lastTime);
    this.lastTime = now;
    if (
      this.needsPulse ||
      Math.floor(this.elapsed / ENGAGEMENT_SOUND_MS) !== oldPulse
    ) {
      this.needsPulse = false;
      // At most one request per RAF, even after a delayed frame; no audio queue.
      try {
        if (this.playSound() !== false) this.sounding = true;
      } catch {
        /* Retain ownership of any older sound so reset still stops it. */
      }
    }
    return (
      changed || Math.floor(this.elapsed / ENGAGEMENT_FRAME_MS) !== oldFrame
    );
  }

  /** Read-only: refreshed _engagement objects/targets never restart the beat.
   * A cleared contact disappears immediately, even before the next RAF update.
   */
  frameOf(legion) {
    if (!this.contacts.has(legion) || !inContact(legion)) return null;
    return 3 - (Math.floor(this.elapsed / ENGAGEMENT_FRAME_MS) % 4);
  }
}
