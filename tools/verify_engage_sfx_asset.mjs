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
  "transition prepare must await decoded ID3 before emitting the first frame",
);
assert.doesNotMatch(
  source,
  /exponentialRampToValueAtTime\([\s\S]*profile\.frequency \* 0\.38/,
  "交战音效不得回退为旧Web扫频近似",
);

process.stdout.write(
  "engage SFX asset OK: confirmed mono PCM ID3 sample replaces sweep approximation\n",
);
