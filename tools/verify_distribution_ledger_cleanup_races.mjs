// Stage-1 cleanup races: partial/resume convergence, multi-pin close-out,
// other-game writes mid-cleanup, old-writer late return, barrier interplay.
// Owned memory SQLite only; no R2, publisher or DELETE-grant proof.
import assert from 'node:assert/strict';
import { openStorage } from '../vps/sqlite-port.mjs';
import { FrozenDistributionLedger } from '../server/distributionledger.js';

const GAME_A = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const GAME_B = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const op = n => ('0000000' + n + '-0000-4000-8000-000000000000').slice(-36);
const payload = n => Buffer.from(JSON.stringify({ version: 1, index: n }));
const verifyReceipt = (_receipt, identity) => ({ ...identity, rootDigest: '2'.repeat(64), rootETag: '"cleanup-races"', visibleAt: '2026-10-30T00:00:00.000Z' });
const chunksOf = (storage, generation) => storage.sql.exec('SELECT COUNT(*) AS n FROM content_distribution_chunks WHERE generation=?', generation).toArray()[0].n;
const tailOf = storage => storage.sql.exec('SELECT COUNT(*) AS n FROM content_distribution_events').toArray()[0].n;

let checks = 0;
const storage = openStorage(':memory:');
const ledger = new FrozenDistributionLedger({ storage, verifyReceipt });
const tx = run => storage.transactionSync(run);
const digests = [];
const games = [GAME_A, GAME_B, GAME_A];
for (let n = 1; n <= 3; n++) {
  const id = op(n);
  tx(() => ledger.enqueueInTxn({ operationId: id, kind: 'publish', gameId: games[n - 1], payload: payload(n) }));
  tx(() => ledger.confirmInTxn(id, null));
  digests.push(tx(() => ledger.status()).tailDigest);
}
// Pin P1 retires [1,2]; partial clean converges by union on resume.
const anchor = digests[2];
const pin1 = tx(() => ledger.retireCheckpointInTxn({ retiredGenerations: [1, 2], anchorDigest: anchor }));
const part = tx(() => ledger.cleanRetiredChunksInTxn({ checkpointDigest: pin1.checkpointDigest, generations: [1] }));
assert.deepEqual(part.deletedGenerations, [1]); assert.deepEqual(part.remainingGenerations, [2]);
assert.equal(part.state, 'in-progress');
const resumed = tx(() => ledger.cleanRetiredChunksInTxn({ checkpointDigest: pin1.checkpointDigest, generations: [2] }));
assert.deepEqual(resumed.deletedGenerations, [1, 2]); assert.deepEqual(resumed.remainingGenerations, []);
const repeat = tx(() => ledger.cleanRetiredChunksInTxn({ checkpointDigest: pin1.checkpointDigest, generations: [1, 2] }));
assert.deepEqual(repeat.deletedGenerations, [1, 2]); assert.equal(chunksOf(storage, 1), 0); checks++;

// Mid-failure stays in-progress: fresh pin, close-out refused until actually deleted.
const pin2 = tx(() => ledger.retireCheckpointInTxn({ retiredGenerations: [1], anchorDigest: anchor }));
assert.throws(() => tx(() => ledger.completeRetiredCleanupInTxn({ checkpointDigest: '0'.repeat(64) })), /DISTRIBUTION_CHECKPOINT/);
assert.throws(() => tx(() => ledger.completeRetiredCleanupInTxn({ checkpointDigest: pin2.checkpointDigest })), /DISTRIBUTION_CLEANUP_INCOMPLETE/);
const cleaned2 = tx(() => ledger.cleanRetiredChunksInTxn({ checkpointDigest: pin2.checkpointDigest, generations: [1] }));
assert.deepEqual(cleaned2.deletedGenerations, [1]);
const done2 = tx(() => ledger.completeRetiredCleanupInTxn({ checkpointDigest: pin2.checkpointDigest }));
assert.equal(done2.verifiedRetired, 1); assert.ok(done2.verifiedRetained >= 1); checks++;

// Other-game write mid-cleanup: new generation lands, stays retained, counts at close-out.
const pin3 = tx(() => ledger.retireCheckpointInTxn({ retiredGenerations: [3], anchorDigest: anchor }));
tx(() => ledger.cleanRetiredChunksInTxn({ checkpointDigest: pin3.checkpointDigest, generations: [3] }));
const id4 = op(4);
const fourth = tx(() => ledger.enqueueInTxn({ operationId: id4, kind: 'publish', gameId: GAME_B, payload: payload(4) }));
assert.equal(fourth.generation, 4); assert.equal(fourth.deduped, false);
tx(() => ledger.confirmInTxn(id4, null));
const live = ledger.entry(4);
assert.deepEqual(Buffer.from(live.payload), payload(4)); assert.ok(!('retired' in live));
assert.equal(ledger.entry(3).retired, true);
const done3 = tx(() => ledger.completeRetiredCleanupInTxn({ checkpointDigest: pin3.checkpointDigest }));
assert.equal(done3.verifiedRetired, 1); assert.ok(done3.verifiedRetained >= 1); checks++;

// Old-writer late return after cleanup: minimal dedupe, no chunk resurrection, no new row.
const before = tailOf(storage);
const late = tx(() => ledger.enqueueInTxn({ operationId: op(1), kind: 'publish', gameId: GAME_A, payload: payload(1) }));
assert.equal(late.deduped, true); assert.equal(late.retired, true);
assert.equal(chunksOf(storage, 1), 0); assert.equal(tailOf(storage), before); checks++;

// Cleanup proceeds under the enqueue barrier; new enqueue stays paused.
ledger.pauseEnqueue();
const pin4 = tx(() => ledger.retireCheckpointInTxn({ retiredGenerations: [4], anchorDigest: anchor }));
tx(() => ledger.cleanRetiredChunksInTxn({ checkpointDigest: pin4.checkpointDigest, generations: [4] }));
assert.throws(() => tx(() => ledger.enqueueInTxn({ operationId: op(5), kind: 'publish', gameId: GAME_A, payload: payload(5) })), /DISTRIBUTION_ENQUEUE_PAUSED/);
const done4 = tx(() => ledger.completeRetiredCleanupInTxn({ checkpointDigest: pin4.checkpointDigest }));
assert.equal(done4.verifiedRetired, 1);
ledger.resumeEnqueue();
const fifth = tx(() => ledger.enqueueInTxn({ operationId: op(5), kind: 'listing', gameId: GAME_A, payload: payload(5) }));
assert.equal(fifth.generation, 5); checks++;

// Multi-pin close-out: overlapping pins converge and close independently.
const storage2 = openStorage(':memory:');
const ledger2 = new FrozenDistributionLedger({ storage: storage2, verifyReceipt });
const tx2 = run => storage2.transactionSync(run);
const d2 = [];
for (let n = 1; n <= 2; n++) {
  const id = op(n);
  tx2(() => ledger2.enqueueInTxn({ operationId: id, kind: 'publish', gameId: GAME_A, payload: payload(n) }));
  tx2(() => ledger2.confirmInTxn(id, null));
  d2.push(tx2(() => ledger2.status()).tailDigest);
}
const pa = tx2(() => ledger2.retireCheckpointInTxn({ retiredGenerations: [1], anchorDigest: d2[1] }));
const pb = tx2(() => ledger2.retireCheckpointInTxn({ retiredGenerations: [1, 2], anchorDigest: d2[1] }));
tx2(() => ledger2.cleanRetiredChunksInTxn({ checkpointDigest: pa.checkpointDigest, generations: [1] }));
tx2(() => ledger2.cleanRetiredChunksInTxn({ checkpointDigest: pb.checkpointDigest, generations: [1, 2] }));
const doneA = tx2(() => ledger2.completeRetiredCleanupInTxn({ checkpointDigest: pa.checkpointDigest }));
const doneB = tx2(() => ledger2.completeRetiredCleanupInTxn({ checkpointDigest: pb.checkpointDigest }));
assert.equal(doneA.verifiedRetired, 1); assert.equal(doneB.verifiedRetired, 2);
assert.equal(ledger2.entry(1).checkpointDigest, pb.checkpointDigest); checks++;

storage.close(); storage2.close();
process.stdout.write(`frozen distribution cleanup races: ${checks} groups green (union convergence, no resurrection, barrier interplay; no R2 or cross-process proof)\n`);
