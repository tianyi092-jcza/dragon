// Pure read-only certificates/assets. No original SAVE and no native codec dependency.
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
const root = new URL("../web/grf/music/", import.meta.url);
const read = (name) => fs.readFileSync(new URL(name, root));
function json(name) {
  try {
    return JSON.parse(read(name).toString("utf8"));
  } catch (cause) {
    throw new Error(`Invalid music certificate ${name}`, { cause });
  }
}
const hash = (data) => createHash("sha256").update(data).digest("hex");
const manifest = json("playback.json");
const certs = json("loops/certificates.json");
assert.deepEqual(
  manifest.tracks.map((x) => x.index),
  [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, "OVERBGM"],
);
const archive = fs.readFileSync(
  new URL("../../Dragon/BGM.DAT", import.meta.url),
);
assert.equal(
  hash(archive),
  "7a51c8b9a349b9e088f3796b70c268181c60bcebead70942f00e1621523dedc9",
);
for (const item of manifest.tracks) {
  const name =
    typeof item.index === "number"
      ? `BGM_${String(item.index).padStart(2, "0")}`
      : item.index;
  const proof = json(`loops/${name}.proof.json`);
  const pcm = json(`loops/${name}.audible.wav.json`);
  const eventsName = `loops/${name}.audible.events.json`;
  const events = json(eventsName);
  const recurrence = proof.modes.audible;
  const cert = certs.find((c) => c.index === item.index);
  const flac = read(item.file);
  assert.equal(flac.subarray(0, 4).toString("ascii"), "fLaC");
  assert.equal(hash(flac), cert.flacSha256);
  assert.equal(cert.losslessRoundtrip, true);
  assert.equal(cert.pcmBytes, pcm.samples * 4);
  assert.equal(cert.loopStartSample, pcm.loopStartSample);
  assert.equal(cert.loopEndSample, pcm.loopEndSample);
  assert.equal(item.loopStart, pcm.loopStartSample / pcm.rate);
  assert.equal(item.loopEnd, pcm.loopEndSample / pcm.rate);
  assert.equal(pcm.rate, 49700);
  assert.equal(pcm.gain, 8);
  assert.equal(
    pcm.loopStartSample,
    Math.round((recurrence.startIRQ * 256 * pcm.rate) / 1193182),
  );
  assert.equal(
    pcm.loopEndSample,
    Math.round((recurrence.endIRQ * 256 * pcm.rate) / 1193182),
  );
  assert.equal(pcm.sourceSha256, hash(read(eventsName)));
  const boundary = Buffer.from(
    read(`loops/${name}.audible.boundary-state.hex`).toString().trim(),
    "hex",
  );
  assert.equal(hash(boundary), recurrence.stateSha256);
  assert.equal(recurrence.exactSecondStateAndRegisterSequence, true);
  assert.equal(
    recurrence.verifiedSecondEndIRQ,
    recurrence.endIRQ + recurrence.periodIRQ,
  );
  assert.equal(events.endIRQ, recurrence.endIRQ);
  const writes = events.writes
    .filter(
      ([t, reg]) =>
        t > recurrence.startIRQ &&
        t <= recurrence.endIRQ &&
        !proof.silentRegisters.includes(reg),
    )
    .map(([t, reg, value]) => [t - recurrence.startIRQ, reg, value]);
  assert.equal(hash(JSON.stringify(writes)), recurrence.registerSequenceSha256);
  assert.equal(writes.length, recurrence.registerWritesPerLoop);
  if (typeof item.index === "number") {
    const at = item.index * 8;
    const offset = archive.readUInt32LE(at),
      length = archive.readUInt32LE(at + 4);
    assert.equal(
      hash(archive.subarray(offset, offset + length)),
      proof.songSha256,
    );
  } else
    assert.equal(
      proof.songSha256,
      "702154f9d104a865b9c45a17469b10cb7aea89e08ed1e1270dde85735e38a681",
    );
  assert.equal(
    pcm.phaseEqual,
    false,
    "score/register recurrence is not a seamless PCM-phase proof",
  );
}
process.stdout.write(
  "music loops OK: eleven FLAC/certificates, raw archive, ordered recurrence writes, direct-IRQ endpoints; PCM seam limitation explicit\n",
);
