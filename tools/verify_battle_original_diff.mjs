import assert from "node:assert/strict";

const { OriginalBattleSession } = await import(
  "../web/src/game/battle/originalsession.js"
);
const {
  canonicalOriginalBattlePacket,
  compareOriginalBattlePackets,
  hashOriginalBytes,
  replayOriginalBattleFixture,
} = await import("../web/src/game/battle/originaldiff.js");

const session = new OriginalBattleSession({
  objectBytes: new Uint8Array(0xc00),
  registers: { side0Active: 1, side1Active: 1, mode: 1 },
});
const initial = session.snapshot();
const first = canonicalOriginalBattlePacket(session, { full: true });
assert.equal(first.hashes.objects, hashOriginalBytes(initial.objectBytes));
const identical = canonicalOriginalBattlePacket(
  new OriginalBattleSession().restore(initial),
  { full: true },
);
assert.deepEqual(compareOriginalBattlePackets(first, identical), {
  equal: true,
  differences: [],
});

const changedSession = new OriginalBattleSession().restore(initial);
changedSession.pool.write8(0, 3, 1);
const changed = canonicalOriginalBattlePacket(changedSession, { full: true });
const mismatch = compareOriginalBattlePackets(first, changed);
assert.equal(mismatch.equal, false);
assert.deepEqual(
  mismatch.differences.find((item) => item.key === "objects").firstByte,
  {
    index: 3,
    expected: 0,
    actual: 1,
  },
);

const fixture = {
  schema: 1,
  source: "synthetic-static",
  initial,
  commands: [],
  frames: [{ full: false }, { full: true }],
};
const replay = replayOriginalBattleFixture(
  fixture,
  () => new OriginalBattleSession(),
);
assert.equal(replay.packets.length, 3);
assert.equal(replay.session.frame, 2);
assert.equal(replay.session.rng.calls, 0);

process.stdout.write(
  "battle original diff OK: canonical packets + first-byte divergence + replay\n",
);
