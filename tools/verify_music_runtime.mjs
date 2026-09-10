import assert from "node:assert/strict";
import { MusicPlayer, seasonalMusicTrack } from "../web/src/core/music.js";
import { ScoreDirector, tacticalMusicTrack } from "../web/src/core/score.js";
import { ORIGINAL_BIOS_TICK_SECONDS as T } from "../web/src/core/speaker.js";

const sources = [];
const decoded = [];
let failStart = false;
const context = {
  state: "running",
  currentTime: 10 * T,
  destination: {},
  async resume() {
    this.state = "running";
  },
  async decodeAudioData(bytes) {
    decoded.push(bytes);
    return { duration: 30, sampleRate: 49700, tag: bytes };
  },
  createGain() {
    return {
      gain: {
        values: [],
        cancelScheduledValues() {
          this.values = [];
        },
        setValueAtTime(v, t) {
          this.values.push([v, t]);
        },
      },
      connect() {},
      disconnect() {},
    };
  },
  createBufferSource() {
    const source = {
      stops: [],
      connect(gain) {
        return gain;
      },
      disconnect() {},
      start() {
        if (failStart) throw new Error("start denied fixture");
        this.started = true;
      },
      stop(time) {
        this.stops.push(time);
      },
    };
    sources.push(source);
    return source;
  },
};
const manifest = {
  tracks: [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, "OVERBGM"].map((index) => ({
    index,
    file: `${index}.flac`,
    loopStart: 2,
    loopEnd: 30,
  })),
};
let requestCount = 0;
let pending;
let fail = false;
const player = new MusicPlayer({
  context: () => context,
  onDriverStart: () => requestCount++,
  fetcher: async (url) => {
    if (fail) throw new Error("offline fixture");
    if (url.pathname.endsWith("playback.json"))
      return { ok: true, json: async () => manifest };
    if (pending) return pending.promise;
    return { ok: true, arrayBuffer: async () => url.pathname };
  },
});
const flush = () => new Promise((resolve) => setImmediate(resolve));
player.select(2);
await flush();
assert.equal(sources.length, 1);
assert.equal(sources[0].loopStart, 2);
assert.equal(sources[0].loopEnd, 30);
assert.equal(sources[0].loop, true);
player.select(2);
await flush();
assert.equal(sources.length, 1, "same-index request leaves phase alone");
for (const type of [2, 3, 4]) {
  player.setType(type);
  await flush();
  assert.equal(sources.length, 1, "attenuation changes do not restart");
  assert.equal(player.gain.gain.values[0][0], 10 ** ((-3 * (type - 1)) / 20));
}
player.setType(0);
assert.equal(sources[0].stops.length, 1);
player.select(3);
await flush();
assert.equal(
  sources.length,
  1,
  "OFF still tracks desired music without playing",
);
player.setType(2);
player.unlock();
await flush();
assert.equal(
  sources.length,
  1,
  "02D0 OFF→TYPE2 only changes attenuation; it cannot start a stopped driver",
);
player.setType(1);
await flush();
assert.equal(sources.length, 2);
player.fadeOut();
assert.equal(
  player.gain.gain.values.length,
  16,
  "AH9 fifteen timed attenuation steps",
);
assert.equal(
  sources[1].stops.at(-1),
  32 * T,
  "AH9 ends at BIOS tick22 after request epoch",
);
context.currentTime = 33 * T;
sources[1].onended();
player.unlock();
await flush();
assert.equal(sources.length, 2, "gestures must not revive a completed fade");
player.select(3);
await flush();
assert.equal(
  sources.length,
  3,
  "02C2 invalidated cached track, same song can load again",
);
assert.equal(requestCount, 3);

pending = {};
pending.promise = new Promise((resolve) => {
  pending.resolve = resolve;
});
player.select(4);
await flush();
const old = pending;
pending = null;
player.select(5);
await flush();
assert.equal(player.track, 5);
const latest = player.source;
old.resolve({ ok: true, arrayBuffer: async () => "obsolete" });
await flush();
assert.equal(
  player.source,
  latest,
  "slow old decode cannot steal current scene",
);
assert.ok(
  !decoded.includes("obsolete"),
  "obsolete network bytes are not decoded into large PCM buffers",
);
player.setEnabled(false);
player.select(6);
await flush();
assert.equal(player.source, null);
player.setEnabled(true);
await flush();
assert.equal(player.track, 6);
assert.ok(player.source);
context.state = "suspended";
player.select(7);
await flush();
assert.equal(player.source, null);
player.unlock();
await flush();
assert.ok(player.source, "user gesture retries suspended audio");
fail = true;
player.select(8);
await flush();
assert.equal(player.source, null, "network errors remain audio-only");
fail = false;
player.unlock();
await flush();
assert.ok(
  player.source,
  "current intent may retry after an audio-only failure",
);
failStart = true;
player.select(9);
await flush();
assert.equal(
  player.source,
  null,
  "failed source.start must not leave a phantom active source",
);
failStart = false;
player.unlock();
await flush();
assert.ok(player.source, "retry works after source.start failed");

const intents = [];
const music = {
  select: (track) => intents.push(track),
  fadeOut: () => intents.push("fade"),
};
const clock = { month: 3, day: 1, hour: 0 };
const score = new ScoreDirector(music, () => clock);
score.title();
score.strategy();
assert.deepEqual(intents, [0, 2]);
score.calendar(clock);
assert.equal(intents.length, 2);
clock.hour = 1;
score.calendar(clock);
assert.equal(intents.at(-1), "fade");
clock.hour = 2;
score.calendar(clock);
assert.equal(intents.at(-1), "fade");
clock.day = 2;
clock.hour = 1;
score.calendar(clock);
assert.equal(intents.at(-1), 2);
assert.deepEqual(
  Array.from({ length: 12 }, (_, i) => seasonalMusicTrack(i + 1)),
  [5, 5, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5],
);
assert.deepEqual(
  [
    tacticalMusicTrack({ mode: 0, battleSideFlag: 0 }),
    tacticalMusicTrack({ mode: 0, battleSideFlag: 0xc0 }),
    tacticalMusicTrack({ mode: 1 }),
    tacticalMusicTrack({ mode: 2 }),
  ],
  [7, 8, 9, 10],
);
const audience = {};
score.beginAudience(audience);
assert.equal(intents.at(-1), 6);
const count = intents.length;
score.beginAudience(audience);
assert.equal(intents.length, count);
score.endAudience({});
assert.equal(intents.length, count);
score.endAudience(audience);
assert.equal(intents.at(-1), 2);
const battle = { session: { registers: { mode: 2 } } };
score.beginBattle(battle);
score.readyBattle(battle);
assert.equal(intents.at(-1), 10);
score.gameOver();
score.endBattle(battle);
score.endAudience(audience);
assert.equal(
  intents.at(-1),
  "OVERBGM",
  "settlement callbacks cannot replace game-over music",
);
score.title();
score.readyBattle(battle);
score.endAudience(audience);
assert.equal(
  intents.at(-1),
  0,
  "obsolete battle/audience callbacks cannot revive old music",
);
process.stdout.write(
  "music runtime OK: selection/loop, CF9 types, fade, stale downloads, disabled/autoplay, scene ownership and raw date/track mapping\n",
);
