// Regression: CF9 is the original single 音效 volume control, NOT SFX profiles.
import assert from "node:assert/strict";
import { MusicPlayer, MUSIC_TYPE_LABELS } from "../web/src/core/music.js";

const voices = [];
const samples = [];
class Context {
  state = "running";
  currentTime = 0;
  destination = {};
  createOscillator() {
    const oscillator = {
      frequency: {},
      stops: [],
      connect: (gain) => gain,
      start(at) {
        this.startAt = at;
      },
      stop(at) {
        this.stops.push(at);
      },
      disconnect() {
        this.disconnected = true;
      },
    };
    voices.push(oscillator);
    return oscillator;
  }
  createGain() {
    return {
      gain: {
        values: [],
        cancelScheduledValues() {},
        setValueAtTime(value, at) {
          this.values.push([value, at]);
        },
      },
      connect() {},
      disconnect() {},
    };
  }
  async decodeAudioData() {
    return { duration: 1, sampleRate: 49700 };
  }
  createBufferSource() {
    const sample = {
      playbackRate: {},
      stops: [],
      connect: (gain) => gain,
      start() {},
      stop(at) {
        this.stops.push(at);
      },
      disconnect() {
        this.disconnected = true;
      },
    };
    samples.push(sample);
    return sample;
  }
}
globalThis.window = { AudioContext: Context };
globalThis.fetch = async () => ({
  ok: true,
  arrayBuffer: async () => new ArrayBuffer(1),
});
const speaker = await import("../web/src/core/speaker.js");
assert.equal(
  "SOUND_PROFILES" in speaker,
  false,
  "no unsupported four-timbre feature",
);
assert.equal(
  "setSoundType" in speaker,
  false,
  "no second audio configuration state",
);
assert.deepEqual(MUSIC_TYPE_LABELS, [
  "關閉",
  "TYPE1",
  "TYPE2",
  "TYPE3",
  "TYPE4",
]);
speaker.unlockSfx();
const music = new MusicPlayer({
  context: speaker.getAudioContext,
  onDriverStart: speaker.musicDriverStarted,
  fetcher: async () => ({
    ok: true,
    json: async () => ({
      tracks: [{ index: 2, file: "fixture", loopStart: 0, loopEnd: 1 }],
    }),
    arrayBuffer: async () => new ArrayBuffer(1),
  }),
});
const flush = () => new Promise((resolve) => setImmediate(resolve));
music.select(2);
await flush();
const first = music.source;
for (const type of [2, 3, 4, 0]) {
  music.setType(type);
  await flush();
  assert.equal(music.track, 2, "CF9 never changes the song index");
  if (type) {
    assert.equal(music.source, first, "TYPE2..4 do not restart");
    assert.equal(
      music.gain.gain.values.at(-1)[0],
      10 ** ((-3 * (type - 1)) / 20),
    );
  } else assert.equal(music.source, null);
  speaker.clickSfx();
  assert.equal(
    voices.at(-1).frequency.value,
    950,
    "preserve fixed Web default beep, not switch timbres",
  );
  assert.equal(voices.at(-1).type, "square");
}
await speaker.preloadEngageSfx();
assert.equal(
  speaker.engageSfx(),
  true,
  "CF9 OFF stops music, not channel6 SFX requests",
);
const live = samples.at(-2),
  future = samples.at(-1);
const stops = future.stops.length;
music.setType(2);
await flush();
assert.equal(music.source, null, "OFF→TYPE2 only writes attenuation");
assert.equal(
  future.stops.length,
  stops,
  "attenuation does not change SFX record/timing",
);
music.setType(0);
assert.equal(
  future.stops.length,
  stops,
  "AH8 does not cancel the SFX successor",
);
music.setType(1);
await flush();
assert.ok(music.source);
assert.equal(
  future.stops.at(-1),
  undefined,
  "AH7 cancels future ID13, not a different timbre selection",
);
assert.notEqual(
  live.disconnected,
  true,
  "AH7 preserves current SFX natural decay",
);
speaker.warnSfx();
assert.equal(voices.at(-1).startAt, 0.14);
assert.equal(speaker.engageSfx(), true);
const currentFm = samples.at(-2);
speaker.toggleMute();
assert.equal(currentFm.stops.at(-1), undefined);
assert.ok(
  voices.every(
    (voice) => voice.disconnected && voice.stops.at(-1) === undefined,
  ),
  "diagnostic mute cancels current and scheduled PC sounds",
);
const count = voices.length;
speaker.clickSfx();
speaker.warnSfx();
assert.equal(voices.length, count);
assert.equal(speaker.engageSfx(), false);
speaker.toggleMute();
speaker.clickSfx();
assert.equal(voices.length, count + 1);
process.stdout.write(
  "audio setting OK: single CF9 volume/OFF, same song and fixed beep, SFX unaffected except proven AH7 successor reset, diagnostic mute preserved\n",
);
