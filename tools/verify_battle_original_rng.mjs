import assert from "node:assert/strict";

const { OriginalBattleRng, createOriginalBattleRng } = await import(
  "../web/src/game/battle/originalrng.js"
);

const vectors = [
  {
    seed: { ch: 0x12, cl: 0x34, dh: 0x56 },
    bytes: [
      0x54, 0xad, 0x8f, 0x00, 0xf7, 0x75, 0x7c, 0x11, 0x2e, 0xcf, 0xfe, 0xb5,
      0xf6, 0xbb, 0x0a, 0xe2,
    ],
  },
  {
    seed: { ch: 0, cl: 0, dh: 0 },
    bytes: [
      0x01, 0x8d, 0x9d, 0x37, 0x59, 0x09, 0x3e, 0xfb, 0x41, 0x10, 0x6d, 0x4e,
      0xb9, 0xac, 0x28, 0x2e,
    ],
  },
];

for (const vector of vectors) {
  const rng = createOriginalBattleRng(vector.seed);
  assert.deepEqual(
    vector.bytes.map(() => rng.nextByte()),
    vector.bytes,
  );
  assert.equal(rng.calls, vector.bytes.length);
}

const rng = new OriginalBattleRng({ ch: 0x23, cl: 0x59, dh: 0x59 });
const prefix = Array.from({ length: 7 }, () => rng.nextByte());
const snapshot = rng.snapshot();
const suffix = Array.from({ length: 12 }, () => rng.nextByte());
assert.equal(snapshot.table.length, 257);
assert.equal(snapshot.calls, prefix.length);
rng.restore(snapshot);
assert.deepEqual(
  Array.from({ length: 12 }, () => rng.nextByte()),
  suffix,
  "restored RNG state must reproduce the original random call stream",
);
assert.ok(rng.nextByte() >= 0 && rng.nextByte() <= 0xff);

process.stdout.write(
  "battle original RNG OK: KI.EXE 0xEC82 seed + 0xECE0 stream\n",
);
