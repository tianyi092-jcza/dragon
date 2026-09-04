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
  "transition prepare must decode ID3 and resume AudioContext before frame 0",
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
assert.match(
  mainSource,
  /prepare:\s*\(\)\s*=>[\s\S]*speaker\.prepareEngageSfx\(\)/,
  "delegated transition must await the audio-ready prepare path",
);
assert.match(
  source,
  /export function engageSfx\(\)[\s\S]*actx\.state !== "running"[\s\S]*source\.start\(actx\.currentTime\)/,
  "each animation frame must synchronously start an already-cached sample",
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
  "engage SFX asset OK: confirmed mono PCM ID3 sample replaces sweep approximation\n",
);
