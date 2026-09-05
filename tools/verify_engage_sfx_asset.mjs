import assert from "node:assert/strict";
import fs from "node:fs/promises";

const wav = await fs.readFile(
  new URL("../web/grf/sfx/ynsound-id3.wav", import.meta.url),
);
assert.equal(wav.subarray(0, 4).toString("ascii"), "RIFF");
assert.equal(wav.subarray(8, 12).toString("ascii"), "WAVE");
assert.equal(wav.readUInt16LE(20), 1, "engage SFX must be PCM");
assert.equal(wav.readUInt16LE(22), 1, "original ID3 uses the left OPL2 only");
assert.equal(wav.readUInt32LE(24), 48_000);
assert.equal(wav.readUInt16LE(34), 16);
const dataOffset = wav.indexOf(Buffer.from("data"));
assert.ok(dataOffset >= 12, "engage SFX must contain a data chunk");
const duration = wav.readUInt32LE(dataOffset + 4) / (48_000 * 2);
assert.ok(duration > 0.64 && duration < 0.66);

let createdSource = null;
const createdSources = [];
class FakeAudioContext {
  constructor() {
    this.state = "running";
    this.currentTime = 7.5;
    this.destination = {};
  }

  async decodeAudioData(bytes) {
    assert.ok(bytes.byteLength > 0);
    return { duration };
  }

  createBufferSource() {
    createdSource = {
      buffer: null,
      playbackRate: { value: 1 },
      connectedTo: null,
      startedAt: null,
      stoppedAt: null,
      connect: (destination) => {
        createdSource.connectedTo = destination;
      },
      start: (at) => {
        createdSource.startedAt = at;
      },
      stop: (at) => {
        createdSource.stoppedAt = at;
      },
    };
    createdSources.push(createdSource);
    return createdSource;
  }
}
globalThis.window = { AudioContext: FakeAudioContext };
globalThis.fetch = async () => ({
  ok: true,
  status: 200,
  arrayBuffer: async () =>
    wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.byteLength),
});
const speaker = await import("../web/src/core/speaker.js");
await speaker.preloadEngageSfx();
assert.equal(speaker.ENGAGE_SFX_PLAYBACK_RATE, 2);
assert.equal(speaker.ENGAGE_SFX_MAX_DURATION_MS, 165);
assert.equal(speaker.ENGAGE_SFX_BURST_COUNT, 5);
assert.equal(speaker.ENGAGE_SFX_BURST_INTERVAL_MS, 82.5);
assert.equal(speaker.engageSfx(), true);
assert.equal(createdSource.playbackRate.value, 2);
assert.equal(createdSource.startedAt, 7.5);
assert.equal(createdSource.stoppedAt, 7.665);
createdSources.length = 0;
assert.equal(speaker.engageSfxBurst(), 5);
assert.deepEqual(
  createdSources.map((source) => source.startedAt),
  [7.5, 7.5825, 7.665, 7.7475, 7.83],
);
assert.deepEqual(
  createdSources.map((source) => source.stoppedAt),
  [7.665, 7.7475, 7.83, 7.9125, 7.995],
);
assert.ok(
  createdSources.every(
    (source) => source.playbackRate.value === 2 && source.buffer != null,
  ),
);

const source = await fs.readFile(
  new URL("../web/src/core/speaker.js", import.meta.url),
  "utf8",
);
assert.match(source, /ynsound-id3\.wav/);
assert.match(
  source,
  /export function preloadEngageSfx\(\) \{\s*return loadEngageBuffer\(\);\s*\}/,
  "ID3 asset must remain explicitly preloadable",
);
assert.match(
  source,
  /export async function prepareEngageSfx\(\)[\s\S]*await loadEngageBuffer\(\)[\s\S]*await actx\.resume\(\)/,
  "user-gesture prewarm must decode ID3 and attempt to resume AudioContext",
);
const mainSource = await fs.readFile(
  new URL("../web/src/main.js", import.meta.url),
  "utf8",
);
assert.match(
  mainSource,
  /prepareEngageAudio\(\)\s*\{[\s\S]*speaker\.unlockSfx\(\)[\s\S]*speaker\.prepareEngageSfx\(\)/,
  "title input must unlock and cache the engage sample during a user gesture",
);
assert.match(
  mainSource,
  /ensureGameAssets\(\)[\s\S]*speaker\.preloadEngageSfx\(\)[\s\S]*preloadEngageMarkerImages/,
  "game loading must cache both audio and all four engage frames",
);
assert.doesNotMatch(
  mainSource,
  /playDelegatedEngage[\s\S]*prepareEngageSfx\(\)/,
  "battle resolution must not wait up to one second for AudioContext statechange",
);
assert.match(
  source,
  /export function engageSfxBurst\([\s\S]*startAt \+ \(index \* safeIntervalMs\) \/ 1000/,
  "all five sounds must be scheduled on one WebAudio clock at exact intervals",
);
assert.doesNotMatch(
  source,
  /export async function engageSfx\(\)/,
  "frame-synchronous engage playback must not await loading or resume",
);
assert.doesNotMatch(
  source,
  /exponentialRampToValueAtTime\([\s\S]*profile\.frequency \* 0\.38/,
  "交战音效不得回退为旧Web扫频近似",
);

process.stdout.write(
  "engage SFX asset OK: confirmed full 2x PCM envelope supports five 82.5ms starts\n",
);
