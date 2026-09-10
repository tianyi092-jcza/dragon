// Offline audio synthesis only. Product has no npm/runtime emulator dependency.
// OPL3_CORE_MODULE must point to npm opl3@0.4.3/lib/opl3.js (with extend@3.0.2).
// See docs/re-notes-audio.md for provenance, reproduction and fidelity limits.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const [input, output] = process.argv.slice(2);
if (!input || !output || !process.env.OPL3_CORE_MODULE)
  throw new Error(
    "Usage: OPL3_CORE_MODULE=<absolute lib/opl3.js> node tools/render_opl3_vgm.mjs input.vgm output.wav",
  );
const corePath = path.resolve(process.env.OPL3_CORE_MODULE);
const hash = (data) => createHash("sha256").update(data).digest("hex");
assert.equal(
  hash(fs.readFileSync(corePath)),
  "74dee027c6e2ba248d06e88a60b6756316280ee3a7563b6c7b42d088e26e8ada",
);
const require = createRequire(corePath);
assert.equal(
  hash(fs.readFileSync(require.resolve("extend"))),
  "b4879ec38a11a2458846788b91be630e6b1d06eb07f9515adc1ff9030af0b00b",
);
const OPL3 = require(corePath);
const chip = new OPL3();
const source = fs.readFileSync(input);
assert.equal(source.toString("ascii", 0, 4), "Vgm ");
const rate = 49700; // this pinned core's native OPL3Data.sampleRate; no resampling
const gain = 8; // fixed Web audition gain, not a recovered analog-mixer setting
let cursor = 0x34 + source.readUInt32LE(0x34);
let clock = 0;
let samples = 0;
let writes = 0;
const chunks = [];
for (;;) {
  assert.ok(cursor < source.length, "VGM must terminate with 66");
  const command = source[cursor++];
  if (command === 0x66) break;
  if (command === 0x5e || command === 0x5f) {
    assert.ok(cursor + 2 <= source.length);
    const register = source[cursor++];
    const value = source[cursor++];
    // Core's rhythm-noise implementation is nondeterministic. The original
    // recovered YNSOUND streams use melodic channels and keep rhythm disabled.
    assert.ok(
      command !== 0x5e || register !== 0xbd || !(value & 0x20),
      "rhythm mode requires a separately verified deterministic noise core",
    );
    chip.write(command - 0x5e, register, value);
    writes++;
    continue;
  }
  let wait;
  if (command === 0x61) {
    wait = source.readUInt16LE(cursor);
    cursor += 2;
  } else if (command === 0x62) wait = 735;
  else if (command === 0x63) wait = 882;
  else if (command >= 0x70 && command <= 0x7f) wait = (command & 15) + 1;
  else throw new Error(`unsupported VGM opcode ${command.toString(16)}`);
  clock += wait;
  const end = Math.round((clock * rate) / 44100);
  const pcm = new Int16Array((end - samples) * 2);
  if (pcm.length) chip.read(pcm);
  chunks.push(Buffer.from(pcm.buffer));
  samples = end;
}
const pcm = Buffer.concat(chunks);
let peak = 0;
let energy = 0;
for (let index = 0; index < pcm.length; index += 2) {
  const value = pcm.readInt16LE(index) * gain;
  assert.ok(
    value >= -32768 && value <= 32767,
    "fixed audition gain must not clip",
  );
  pcm.writeInt16LE(value, index);
  peak = Math.max(peak, Math.abs(value));
  energy += value * value;
}
assert.ok(peak > 0, "a silent renderer output is not a recovered track");
const header = Buffer.alloc(44);
header.write("RIFF");
header.writeUInt32LE(36 + pcm.length, 4);
header.write("WAVEfmt ", 8);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(2, 22);
header.writeUInt32LE(rate, 24);
header.writeUInt32LE(rate * 4, 28);
header.writeUInt16LE(4, 32);
header.writeUInt16LE(16, 34);
header.write("data", 36);
header.writeUInt32LE(pcm.length, 40);
const wav = Buffer.concat([header, pcm]);
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, wav);
const evidence = {
  source: path.basename(input),
  sourceSha256: hash(source),
  core: "doomjs/opl3@0.4.3",
  coreSha256: hash(fs.readFileSync(corePath)),
  rate,
  channels: 2,
  gain,
  writes,
  samples,
  seconds: samples / rate,
  peak,
  rms: Math.sqrt(energy / (pcm.length / 2)),
  wavSha256: hash(wav),
};
fs.writeFileSync(`${output}.json`, JSON.stringify(evidence, null, 2) + "\n");
process.stdout.write(JSON.stringify(evidence) + "\n");
