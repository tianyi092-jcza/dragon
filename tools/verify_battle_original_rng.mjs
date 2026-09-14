import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { OriginalBattleRng } from "../web/src/game/battle/originalrng.js";

// Authenticated KI EC82/ECE0 execution, private memory, controlled RTC only.
// Neither the oracle nor this test accesses any SAVE file.
const run = spawnSync(
  "python",
  [
    "-B",
    fileURLToPath(new URL("./strategic_rng_raw_oracle.py", import.meta.url)),
  ],
  {
    encoding: "utf8",
    timeout: 30000,
    maxBuffer: 1024 * 1024,
    env: { ...process.env, PYTHONOPTIMIZE: "", PYTHONDONTWRITEBYTECODE: "1" },
  },
);
assert.equal(run.status, 0, run.error?.message ?? run.stderr);
let oracle;
try {
  oracle = JSON.parse(run.stdout);
} catch (cause) {
  throw new Error("invalid EC82/ECE0 oracle output", { cause });
}
assert.equal(oracle.results.length, 5);
for (const expected of oracle.results) {
  const rng = new OriginalBattleRng(expected.clock);
  assert.deepEqual(Array.from(rng.table.slice(0, 256)), expected.table);
  assert.equal(
    rng.table.length,
    257,
    "extra byte is Web snapshot compatibility padding",
  );
  assert.equal(rng.table[256], 0);
  assert.deepEqual(
    [rng.addend, rng.index, rng.calls],
    [expected.addend, expected.index, 0],
  );
  assert.deepEqual(
    Array.from({ length: 16 }, () => rng.nextByte()),
    expected.draws.slice(0, 16),
  );
  const saved = rng.snapshot();
  assert.deepEqual(
    Array.from({ length: 16 }, () => rng.nextByte()),
    expected.draws.slice(16),
  );
  assert.deepEqual([rng.addend, rng.index], expected.final);
  rng.restore(saved);
  assert.deepEqual(
    Array.from({ length: 16 }, () => rng.nextByte()),
    expected.draws.slice(16),
  );
  assert.equal(rng.calls, 32);
}
// Existing snapshots restore their stored stream without reseeding or rewriting it.
const old = new OriginalBattleRng().snapshot();
old.table = Array.from({ length: 257 }, (_, i) => i & 255);
old.addend = 17;
old.index = 32;
old.calls = 41;
assert.deepEqual(new OriginalBattleRng().restore(old).snapshot(), old);
assert.throws(() => new OriginalBattleRng({ dh: 0xff }), RangeError);
process.stdout.write(
  "battle original RNG OK: 5 authenticated EC82/ECE0 executions, 256B table + 32 draws + snapshot continuity\n",
);
