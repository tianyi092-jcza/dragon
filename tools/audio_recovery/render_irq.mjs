// Temporary offline PCM renderer. Direct absolute IRQ -> 49700Hz rounding.
// Does not claim seamless chip phase or hardware/analog equality. No crossfade.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
const [input, output] = process.argv.slice(2);
const core = process.env.OPL3_CORE_MODULE;
assert(input && output && core);
const relative = path.relative(os.tmpdir(), path.resolve(output));
assert(
 relative && !relative.startsWith("..") && !path.isAbsolute(relative),
 "Output must stay in OS temp",
);
const hash = (x) => createHash("sha256").update(x).digest("hex");
assert.equal(
 hash(fs.readFileSync(core)),
 "74dee027c6e2ba248d06e88a60b6756316280ee3a7563b6c7b42d088e26e8ada",
);
const require = createRequire(core);
assert.equal(
 hash(fs.readFileSync(require.resolve("extend"))),
 "b4879ec38a11a2458846788b91be630e6b1d06eb07f9515adc1ff9030af0b00b",
);
const OPL3 = require(core),
 chip = new OPL3();
const source = fs.readFileSync(input);
let j;
try {
 j = JSON.parse(source.toString("utf8"));
} catch (cause) {
 throw new Error("Invalid original music event trace", { cause });
}
const rate = 49700,
 gain = 8,
 toSample = (t) => Math.round((t * 256 * rate) / 1193182);
const end = toSample(j.endIRQ),
 begin = toSample(j.loopStartIRQ);
const pcm = new Int16Array(end * 2);
let samples = 0,
 at = 0,
 initial;
const scalars = (o) =>
 Object.fromEntries(
  Object.entries(o).filter(
   ([, v]) =>
    typeof v === "number" || typeof v === "string" || typeof v === "boolean",
  ),
 );
const phase = () => ({
 vibrato: chip.vibratoIndex,
 tremolo: chip.tremoloIndex,
 operators: chip.operators.map((b) =>
  b.map((o) =>
   o
    ? {
       phase: scalars(o.phaseGenerator),
       envelope: scalars(o.envelopeGenerator),
      }
    : null,
  ),
 ),
});
function advance(target) {
 if (target > samples) chip.read(pcm.subarray(samples * 2, target * 2));
 samples = target;
}
for (const t of [
 ...new Set([...j.writes.map((w) => w[0]), j.loopStartIRQ, j.loopEndIRQ]),
].sort((a, b) => a - b)) {
 advance(toSample(t));
 while (at < j.writes.length && j.writes[at][0] === t) {
  const [, r, v] = j.writes[at++];
  assert(!(r === 0xbd && v & 32), "nondeterministic rhythm unsupported");
  chip.write(r >> 8, r & 255, v);
 }
 if (t === j.loopStartIRQ) initial = phase();
}
advance(end);
const final = phase();
let peak = 0,
 energy = 0;
for (let i = 0; i < pcm.length; i++) {
 const v = pcm[i] * gain;
 assert(v >= -32768 && v <= 32767);
 pcm[i] = v;
 peak = Math.max(peak, Math.abs(v));
 energy += v * v;
}
const raw = Buffer.from(pcm.buffer),
 head = Buffer.alloc(44);
head.write("RIFF");
head.writeUInt32LE(raw.length + 36, 4);
head.write("WAVEfmt ", 8);
head.writeUInt32LE(16, 16);
head.writeUInt16LE(1, 20);
head.writeUInt16LE(2, 22);
head.writeUInt32LE(rate, 24);
head.writeUInt32LE(rate * 4, 28);
head.writeUInt16LE(4, 32);
head.writeUInt16LE(16, 34);
head.write("data", 36);
head.writeUInt32LE(raw.length, 40);
fs.writeFileSync(output, Buffer.concat([head, raw]));
const proof = {
 input,
 sourceSha256: hash(source),
 coreSha256: hash(fs.readFileSync(core)),
 rate,
 gain,
 samples: end,
 loopStartSample: begin,
 loopEndSample: end,
 loopStartSeconds: begin / rate,
 loopEndSeconds: end / rate,
 peak,
 rms: Math.sqrt(energy / pcm.length),
 wavSha256: hash(fs.readFileSync(output)),
 phaseEqual: JSON.stringify(initial) === JSON.stringify(final),
 initialPhase: initial,
 finalPhase: final,
 lastStereo: [...pcm.slice(-2)],
 loopFirstStereo: [...pcm.slice(begin * 2, begin * 2 + 2)],
};
fs.writeFileSync(output + ".json", JSON.stringify(proof, null, 2) + "\n");
process.stdout.write(
 JSON.stringify({ ...proof, initialPhase: undefined, finalPhase: undefined }) +
  "\n",
);
