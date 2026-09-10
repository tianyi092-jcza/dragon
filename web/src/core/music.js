// Background score selection comes from KI:0241/9321/99D4. Audio never advances
// or holds game rules. Static OPL3 rendering/volume limits: re-notes-audio.md.
import { ORIGINAL_BIOS_TICK_SECONDS } from "./speaker.js";
const FADE_TICKS = [2, 3, 4, 6, 7, 8, 10, 11, 12, 14, 15, 16, 18, 19, 20];
export const MUSIC_TYPE_LABELS = ["關閉", "TYPE1", "TYPE2", "TYPE3", "TYPE4"];
const MONTH_TRACKS = [5, 5, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5];
export function seasonalMusicTrack(month) {
  return MONTH_TRACKS[month - 1] ?? null;
}

/** Owns one current music intent; stale downloads cannot resurrect old scenes. */
export class MusicPlayer {
  constructor({
    context,
    onDriverStart = () => {},
    fetcher = (...args) => fetch(...args),
  }) {
    this.context = context;
    this.onDriverStart = onDriverStart;
    this.fetcher = fetcher;
    this.type = 1;
    this.track = null;
    this.selectionValid = true;
    this.enabled = true;
    this.driverActive = false;
    this.generation = 0;
    this.source = null;
    this.gain = null;
    this.loading = null;
    this.manifest = null;
    this.cache = null; // one decoded track, not the entire archive in RAM
    this.fade = null;
  }

  select(track) {
    if (track === this.track && this.selectionValid) return; // KI:0241 cache
    this.stopPlayback();
    this.track = track;
    this.selectionValid = true;
    this.driverActive = track != null && this.type !== 0;
    if (this.driverActive) {
      this.onDriverStart();
      void this.ensurePlaying();
    }
  }

  setType(value) {
    const type = Number(value);
    this.type = Number.isFinite(type)
      ? Math.max(0, Math.min(4, Math.trunc(type)))
      : 1;
    if (this.type === 0) {
      this.driverActive = false;
      this.stopPlayback();
    } else if (this.type === 1) {
      // KI:02D0: only TYPE1 invokes AH7 restart. TYPE2..4 change attenuation.
      this.stopPlayback();
      this.driverActive = this.track != null;
      if (this.driverActive) this.onDriverStart();
      void this.ensurePlaying();
    } else {
      this.applyVolume();
      void this.ensurePlaying();
    }
    return this.type;
  }

  setEnabled(enabled) {
    this.enabled = !!enabled;
    if (this.enabled) void this.ensurePlaying();
    else this.stopPlayback(false);
  }

  unlock() {
    const context = this.context();
    if (!context) return;
    try {
      void Promise.resolve(
        context.state === "suspended" ? context.resume() : null,
      )
        .then(() => this.ensurePlaying())
        .catch(() => {});
    } catch {
      /* Browser denied audio; game input still proceeds. */
    }
  }

  fadeOut() {
    this.selectionValid = false; // KI:02C2 sets cached song020E=FF
    if (this.type === 0 || this.track == null || this.fade) return;
    const tick = Math.floor(
      (this.context()?.currentTime ?? 0) / ORIGINAL_BIOS_TICK_SECONDS,
    );
    this.fade = { tick, end: (tick + 22) * ORIGINAL_BIOS_TICK_SECONDS };
    this.applyVolume();
    this.source?.stop(this.fade.end);
  }

  applyVolume() {
    // Static-PCM presentation: original four TL units are represented by 3dB
    // master gain steps, not saturated per-carrier register resynthesis.
    if (!this.gain) return;
    const now = this.context().currentTime;
    const gain = this.gain.gain;
    gain.cancelScheduledValues(now);
    const level = (steps) =>
      10 ** ((-3 * (Math.max(0, this.type - 1) + steps)) / 20);
    const times = this.fade
      ? FADE_TICKS.map(
          (tick) => (this.fade.tick + tick) * ORIGINAL_BIOS_TICK_SECONDS,
        )
      : [];
    gain.setValueAtTime(level(times.filter((time) => time <= now).length), now);
    times.forEach((time, index) => {
      if (time > now) gain.setValueAtTime(level(index + 1), time);
    });
  }

  stopPlayback(resetFade = true) {
    if (resetFade) this.fade = null;
    this.generation++;
    this.loading = null;
    const previous = this.source;
    this.source = null;
    if (previous) {
      try {
        previous.stop();
        previous.disconnect();
      } catch {
        /* closed context */
      }
    }
    this.gain?.disconnect();
    this.gain = null;
  }

  async ensurePlaying() {
    const context = this.context();
    if (
      !this.enabled ||
      !this.driverActive ||
      this.type === 0 ||
      this.track == null ||
      this.source ||
      this.loading != null ||
      context?.state !== "running" ||
      (this.fade && context.currentTime >= this.fade.end)
    )
      return;
    const generation = this.generation;
    const track = this.track;
    this.loading = generation;
    try {
      if (!this.manifest) {
        const response = await this.fetcher(
          new URL("../../grf/music/playback.json", import.meta.url),
        );
        if (!response.ok) throw new Error("music manifest unavailable");
        this.manifest = await response.json();
      }
      if (generation !== this.generation) return;
      const item = this.manifest.tracks.find((entry) => entry.index === track);
      if (!item) throw new Error("music track is not certified for playback");
      let buffer = this.cache?.track === track ? this.cache.buffer : null;
      if (!buffer) {
        const response = await this.fetcher(
          new URL(`../../grf/music/${item.file}`, import.meta.url),
        );
        if (!response.ok) throw new Error("music asset unavailable");
        const bytes = await response.arrayBuffer();
        if (generation !== this.generation) return;
        buffer = await context.decodeAudioData(bytes);
      }
      if (
        generation !== this.generation ||
        !this.enabled ||
        this.type === 0 ||
        context.state !== "running" ||
        (this.fade && context.currentTime >= this.fade.end)
      )
        return;
      if (
        !(
          item.loopStart >= 0 &&
          item.loopEnd > item.loopStart &&
          item.loopEnd <= buffer.duration + 1 / buffer.sampleRate
        )
      )
        throw new Error("invalid music loop certificate");
      this.cache = { track, buffer };
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = buffer;
      source.loop = true;
      source.loopStart = item.loopStart;
      source.loopEnd = item.loopEnd;
      source.connect(gain).connect(context.destination);
      this.gain = gain;
      this.source = source;
      this.applyVolume();
      source.onended = () => {
        if (this.source === source) {
          this.source = null;
          if (this.fade && context.currentTime >= this.fade.end)
            this.driverActive = false;
        }
        source.disconnect();
        gain.disconnect();
      };
      source.start();
      if (this.fade) source.stop(this.fade.end);
    } catch {
      if (generation === this.generation && this.source)
        this.stopPlayback(false);
      // Missing/unsupported audio is silent, never an unhandled rejection or a
      // rule-clock dependency. A later user gesture may retry current intent.
    } finally {
      if (this.loading === generation) this.loading = null;
    }
  }
}
