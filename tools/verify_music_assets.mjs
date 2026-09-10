// Original resource identity, month-selection bytes and reproducible WAV certificates.
// No SAVE.DAT access. PCM checks prove valid synthesis, not hardware/listening equivalence.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
const hash = (data) => createHash("sha256").update(data).digest("hex");
const base = new URL("../web/grf/music/", import.meta.url);
async function json(name) {
  try {
    return JSON.parse(await fs.readFile(new URL(name, base), "utf8"));
  } catch (cause) {
    throw new Error(`Invalid music certificate: ${name}`, { cause });
  }
}
const manifest = await json("manifest.json");
const ki = await fs.readFile(new URL("../../Dragon/KI.EXE", import.meta.url));
assert.equal(
  hash(ki),
  "fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868",
);
assert.equal(
  ki.subarray(0x9509, 0x9515).toString("hex"),
  "050502020203030304040405",
);
const bgm = await fs.readFile(new URL("../../Dragon/BGM.DAT", import.meta.url));
assert.equal(
  hash(bgm),
  "7a51c8b9a349b9e088f3796b70c268181c60bcebead70942f00e1621523dedc9",
);
assert.equal(manifest.sources["BGM.DAT"], hash(bgm));
assert.equal(manifest.tracks.length, 14);
const validation = await json("validation.json");
assert.equal(validation.length, 14);
assert.ok(validation.every((item) => item.pass));
assert.equal(
  validation.reduce((n, item) => n + item.registerWritesRoundtrip, 0),
  66192,
);
for (const index of [2, 3, 4, 5]) {
  const name = `BGM_0${index}`;
  const track = manifest.tracks.find((item) => item.name === name);
  assert.equal(track.archiveOffset, bgm.readUInt32LE(index * 8));
  assert.equal(track.archiveLength, bgm.readUInt32LE(index * 8 + 4));
  assert.equal(
    track.sha256,
    hash(
      bgm.subarray(
        track.archiveOffset,
        track.archiveOffset + track.archiveLength,
      ),
    ),
  );
  const certificate = await json(`${name}.wav.json`);
  const vgm = await fs.readFile(new URL(`${name}.vgm`, base));
  const wav = await fs.readFile(new URL(`${name}.wav`, base));
  assert.equal(certificate.sourceSha256, hash(vgm));
  assert.equal(certificate.wavSha256, hash(wav));
  assert.equal(wav.toString("ascii", 0, 4), "RIFF");
  assert.equal(wav.toString("ascii", 8, 16), "WAVEfmt ");
  assert.equal(wav.readUInt16LE(20), 1);
  assert.equal(wav.readUInt16LE(22), 2);
  assert.equal(wav.readUInt32LE(24), 49700);
  assert.equal(wav.readUInt16LE(34), 16);
  assert.equal(wav.readUInt32LE(40), certificate.samples * 4);
  assert.equal(wav.length, 44 + certificate.samples * 4);
  assert.ok(
    Math.abs(certificate.seconds - track.seconds) < 1 / 44100 + 1 / 49700,
  );
  let peak = 0;
  let sum = 0;
  for (let i = 44; i < wav.length; i += 2) {
    const value = wav.readInt16LE(i);
    peak = Math.max(peak, Math.abs(value));
    sum += value * value;
  }
  assert.equal(peak, certificate.peak);
  assert.ok(peak > 0 && peak < 32768);
  assert.equal(Math.sqrt(sum / (certificate.samples * 2)), certificate.rms);
}
process.stdout.write(
  "music assets OK: raw four-season selector, 11+3 export certificates, non-silent unclipped reproducible WAVs\n",
);
