import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";

const buffers = new Map();
for (const name of ["ynsound-id3", "ynsound-record3", "ynsound-record13"]) {
  const wav = await fs.readFile(
    new URL(`../web/grf/sfx/${name}.wav`, import.meta.url),
  );
  let cert;
  try {
    cert = JSON.parse(
      await fs.readFile(
        new URL(`../web/grf/sfx/${name}.wav.json`, import.meta.url),
        "utf8",
      ),
    );
  } catch (cause) {
    throw new Error(`Invalid ${name} synthesis certificate`, { cause });
  }
  assert.equal(createHash("sha256").update(wav).digest("hex"), cert.wavSha256);
  assert.equal(wav.toString("ascii", 0, 4), "RIFF");
  assert.equal(wav.toString("ascii", 8, 12), "WAVE");
  assert.equal(wav.readUInt16LE(20), 1);
  assert.equal(wav.readUInt16LE(22), 2);
  assert.equal(wav.readUInt32LE(24), 49700);
  assert.equal(wav.readUInt16LE(34), 16);
  assert.ok(cert.peak > 0 && cert.peak < 32768);
  if (name !== "ynsound-id3") {
    assert.ok(cert.seconds > 0.6 && cert.seconds < 0.601);
    for (
      let offset = 44 + Math.ceil(0.166 * 49700) * 4;
      offset < wav.length;
      offset += 2
    )
      assert.equal(
        wav.readInt16LE(offset),
        0,
        "held EGT=0 note is already silent before AH7's delayed ID0",
      );
  }
  buffers.set(name, wav);
}
const sources = [];
let context;
class Context {
  constructor() {
    context = this;
    this.state = "running";
    this.currentTime = 0;
    this.destination = {};
  }
  async decodeAudioData(bytes) {
    return { duration: (bytes.byteLength - 44) / (49700 * 4), bytes };
  }
  createBufferSource() {
    const source = {
      playbackRate: {},
      stops: [],
      connect() {},
      disconnect() {
        this.disconnected = true;
      },
      start(at) {
        this.startedAt = at;
      },
      stop(at) {
        this.stops.push(at);
      },
    };
    sources.push(source);
    return source;
  }
}
globalThis.window = { AudioContext: Context };
globalThis.fetch = async (url) => {
  const name = /([^/]+)\.wav$/.exec(String(url))[1];
  const wav = buffers.get(name);
  return {
    ok: true,
    arrayBuffer: async () =>
      wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.byteLength),
  };
};
const speaker = await import("../web/src/core/speaker.js");
const T = speaker.ORIGINAL_BIOS_TICK_SECONDS;
assert.equal(speaker.engageSfx(), false, "unready requests drop, never queue");
await speaker.preloadEngageSfx();
assert.equal(sources.length, 0);
assert.equal(speaker.ENGAGE_SFX_PLAYBACK_RATE, 1);
context.currentTime = T / 2;
assert.equal(speaker.engageSfx(), true);
assert.equal(sources[0].startedAt, T / 2);
assert.equal(sources[0].stops[0], 3 * T);
assert.equal(sources[1].startedAt, 3 * T);
assert.equal(sources[1].stops[0], 10 * T);
const previous = [...sources];
context.currentTime = T;
assert.equal(speaker.engageSfx(), true);
assert.ok(
  previous.every(
    (source) => source.disconnected && source.stops.at(-1) === undefined,
  ),
  "ID3 retriggers one channel and discards old successor",
);
previous[0].onended();
const live = sources[2];
const future = sources[3];
context.currentTime = 1.5 * T;
speaker.musicDriverStarted();
assert.equal(future.stops.at(-1), undefined, "AH7 suppresses future ID13");
assert.equal(
  live.stops.at(-1),
  live.startedAt + live.buffer.duration,
  "AH7 does not key-off current physical note",
);
assert.notEqual(live.disconnected, true);
assert.equal(speaker.engageSfx(), true);
const current3 = sources[4];
const current13 = sources[5];
context.currentTime = current13.startedAt + T / 2;
const priorStops = current3.stops.length;
speaker.musicDriverStarted();
assert.equal(
  current3.stops.length,
  priorStops,
  "AH7 cannot revive the earlier record3",
);
assert.equal(
  current13.stops.at(-1),
  current13.startedAt + current13.buffer.duration,
);
assert.equal(current13.playbackRate.value, 1);
speaker.toggleMute();
assert.equal(current13.stops.at(-1), undefined);
assert.equal(speaker.engageSfx(), false);
speaker.toggleMute();
context.state = "suspended";
assert.equal(speaker.engageSfx(), false);
const count = sources.length;
context.state = "running";
assert.equal(sources.length, count, "no backlog after browser suspension");
speaker.toggleMute(); // diagnostic mute is separate from original CF9
assert.equal(speaker.engageSfx(), false);
process.stdout.write(
  "engage SFX OK: certified original records, BIOS-phase successor, same-channel retrigger, AH7 preserves current decay/cancels tail, no backlog\n",
);
