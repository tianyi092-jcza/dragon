// Stage-1 ledger retirement branches: retain/retire split, checkpoint pins,
// enqueue barrier. Owned memory SQLite only; no R2, publisher or DELETE ability.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStorage } from '../vps/sqlite-port.mjs';
import { FrozenDistributionLedger } from '../server/distributionledger.js';

const sha = value => createHash('sha256').update(value).digest('hex');
const GAME = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const op = n => `${'0'.repeat(7)}${n}-0000-4000-8000-000000000000`.slice(-36);
const payload = n => Buffer.from(JSON.stringify({ version: 1, index: n }));
const verifyReceipt = (_receipt, identity) => ({ ...identity, rootDigest: '2'.repeat(64), rootETag: '"retirement-ledger"', visibleAt: '2026-10-30T00:00:00.000Z' });

let checks = 0;
const storage = openStorage(':memory:');
const ledger = new FrozenDistributionLedger({ storage, verifyReceipt });
const tx = run => storage.transactionSync(run);
const digests = [];
for (let n = 1; n <= 3; n++) {
  const opId = op(n);
  const first = tx(() => ledger.enqueueInTxn({ operationId: opId, kind: 'publish', gameId: GAME, payload: payload(n) }));
  assert.equal(first.deduped, false); assert.equal(first.generation, n);
  const saved = tx(() => ledger.confirmInTxn(opId, null));
  assert.equal(saved.deduped, false); digests.push(first.operationDigest);
}
assert.equal(ledger.status().confirmedGeneration, 3); checks++;

// Retire [1,2] anchored at gen3: pin shape carries the stage-0 checkpoint semantics.
const pin = tx(() => ledger.retireCheckpointInTxn({ retiredGenerations: [2, 1], anchorDigest: digests[2] }));
assert.equal(pin.kind, 'retirement-checkpoint'); assert.equal(pin.version, 1);
assert.deepEqual(pin.retiredGenerations, [1, 2]);
assert.equal(pin.checkpointDigest, sha(JSON.stringify({ version: 1, authorityId: ledger.status().authorityId, retiredGenerations: [1, 2], anchorDigest: digests[2] })));
assert.ok(pin.createdAt.endsWith('Z')); checks++;

// Retired reads are minimal identity credentials; retained keeps the payload path.
const r1 = ledger.entry(1), r2 = ledger.entry(2), r3 = ledger.entry(3);
for (const [read, n] of [[r1, 1], [r2, 2]]) {
  assert.equal(read.retired, true); assert.equal(read.checkpointDigest, pin.checkpointDigest);
  assert.equal(read.generation, n); assert.equal(read.operationDigest, digests[n - 1]);
  assert.ok(!('payload' in read)); assert.equal(read.state, 'confirmed');
}
assert.deepEqual(Buffer.from(r3.payload), payload(3)); assert.ok(!('retired' in r3)); checks++;

// Simulate post-cleanup chunk loss: retired reads still succeed, retained stays strict.
storage.sql.exec('DELETE FROM content_distribution_chunks WHERE generation IN (1,2)');
assert.equal(ledger.entry(1).operationDigest, digests[0]);
assert.equal(ledger.entry(2).checkpointDigest, pin.checkpointDigest);
assert.equal(ledger.entry(1).payload, undefined);
const replay = tx(() => ledger.enqueueInTxn({ operationId: op(1), kind: 'publish', gameId: GAME, payload: payload(1) }));
assert.equal(replay.deduped, true); assert.equal(replay.retired, true);
assert.equal(replay.checkpointDigest, pin.checkpointDigest); assert.ok(!('payload' in replay)); checks++;
// Retained replay validates chunks without returning them (original contract).
const replay3 = tx(() => ledger.enqueueInTxn({ operationId: op(3), kind: 'publish', gameId: GAME, payload: payload(3) }));
assert.equal(replay3.deduped, true); assert.ok(!('retired' in replay3)); assert.ok(!('payload' in replay3)); checks++;
// op4 stays pending for the unconfirmed-retire check (metadata only).
const op4 = op(4);
tx(() => ledger.enqueueInTxn({ operationId: op4, kind: 'publish', gameId: GAME, payload: payload(4) }));
// Confirmed retiree re-confirm is a receipt dedupe without any payload read.
const again = tx(() => ledger.confirmInTxn(op(1), null));
assert.equal(again.deduped, true); checks++;

// Unconfirmed history cannot retire; malformed pins rejected before any write.
assert.throws(() => tx(() => ledger.retireCheckpointInTxn({ retiredGenerations: [4], anchorDigest: digests[2] })), /DISTRIBUTION_NOT_CONFIRMED/);
assert.throws(() => tx(() => ledger.retireCheckpointInTxn({ retiredGenerations: [], anchorDigest: digests[2] })), /DISTRIBUTION_CHECKPOINT/);
assert.throws(() => tx(() => ledger.retireCheckpointInTxn({ retiredGenerations: [1, 1], anchorDigest: digests[2] })), /DISTRIBUTION_CHECKPOINT/);
assert.throws(() => tx(() => ledger.retireCheckpointInTxn({ retiredGenerations: [0], anchorDigest: digests[2] })), /DISTRIBUTION_CHECKPOINT/);
assert.throws(() => tx(() => ledger.retireCheckpointInTxn({ retiredGenerations: [1], anchorDigest: '3'.repeat(64) })), /DISTRIBUTION_CHECKPOINT_CONFLICT/);
assert.throws(() => tx(() => ledger.retireCheckpointInTxn({ retiredGenerations: [1], anchorDigest: 'not-a-digest' })), /DISTRIBUTION_CHECKPOINT/);
assert.equal(ledger.status().tailGeneration, 4); checks++;

// Duplicate pin of the same set conflicts; a second pin unions and wins latest.
assert.throws(() => tx(() => ledger.retireCheckpointInTxn({ retiredGenerations: [1, 2], anchorDigest: digests[2] })), /DISTRIBUTION_CHECKPOINT_CONFLICT/);
const pin2 = tx(() => ledger.retireCheckpointInTxn({ retiredGenerations: [3], anchorDigest: digests[2] }));
assert.notEqual(pin2.checkpointDigest, pin.checkpointDigest);
assert.equal(ledger.entry(3).retired, true); assert.equal(ledger.entry(3).checkpointDigest, pin2.checkpointDigest);
assert.equal(ledger.entry(1).checkpointDigest, pin.checkpointDigest); checks++;

// Barrier pauses NEW enqueue only: reads, next and confirm paths are unaffected.
assert.equal(ledger.status().enqueuePaused, false);
assert.equal(ledger.pauseEnqueue().enqueuePaused, true);
assert.throws(() => tx(() => ledger.enqueueInTxn({ operationId: op(5), kind: 'publish', gameId: GAME, payload: payload(5) })), /DISTRIBUTION_ENQUEUE_PAUSED/);
assert.throws(() => tx(() => ledger.enqueueInTxn({ operationId: op(3), kind: 'publish', gameId: GAME, payload: payload(3) })), /DISTRIBUTION_ENQUEUE_PAUSED/);
assert.equal(ledger.entry(2).retired, true);
assert.equal(ledger.next().generation, 4);
assert.equal(ledger.resumeEnqueue().enqueuePaused, false);
const fifth = tx(() => ledger.enqueueInTxn({ operationId: op(5), kind: 'listing', gameId: GAME, payload: payload(5) }));
assert.equal(fifth.generation, 5); assert.equal(fifth.deduped, false); checks++;

// Blocked ledgers keep recovery precedence over the barrier on a separate instance.
// A recovery lock also refuses retirement: remote-ahead/foreign/missing history
// is never retired around. Retired reads on the locked instance still serve.
const storageB = openStorage(':memory:');
const ledgerB = new FrozenDistributionLedger({ storage: storageB, verifyReceipt });
const firstB = storageB.transactionSync(() => ledgerB.enqueueInTxn({ operationId: op(9), kind: 'publish', gameId: GAME, payload: payload(9) }));
storageB.transactionSync(() => ledgerB.confirmInTxn(op(9), null));
ledgerB.block('AUTHORITY_MISMATCH'); ledgerB.pauseEnqueue();
assert.throws(() => storageB.transactionSync(() => ledgerB.enqueueInTxn({ operationId: op(10), kind: 'publish', gameId: GAME, payload: payload(10) })), /DISTRIBUTION_RECOVERY_REQUIRED/);
assert.throws(() => storageB.transactionSync(() => ledgerB.retireCheckpointInTxn({ retiredGenerations: [1], anchorDigest: firstB.operationDigest })), /DISTRIBUTION_RECOVERY_REQUIRED/);
assert.equal(storageB.transactionSync(() => ledgerB.entry(1)).operationDigest, firstB.operationDigest);
storageB.close(); checks++;

// Scenario-4: retired-payload cleanup with durable progress. Chunks of gens
// 1,2 are already gone (simulated earlier loss); cleaning re-records them,
// then gen3 is actually deleted here. Metadata and pins are never touched.
assert.throws(() => tx(() => ledger.cleanRetiredChunksInTxn({ checkpointDigest: '4'.repeat(64), generations: [1] })), /DISTRIBUTION_CHECKPOINT/);
assert.throws(() => tx(() => ledger.cleanRetiredChunksInTxn({ checkpointDigest: pin.checkpointDigest, generations: [1, 4] })), /DISTRIBUTION_NOT_RETIRED/);
const progress1 = tx(() => ledger.cleanRetiredChunksInTxn({ checkpointDigest: pin.checkpointDigest, generations: [1] }));
assert.deepEqual(progress1.deletedGenerations, [1]); assert.deepEqual(progress1.remainingGenerations, [2]); assert.equal(progress1.state, 'in-progress');
const progress1b = tx(() => ledger.cleanRetiredChunksInTxn({ checkpointDigest: pin.checkpointDigest, generations: [1] }));
assert.deepEqual(progress1b.deletedGenerations, [1]); checks++;
assert.throws(() => tx(() => ledger.completeRetiredCleanupInTxn({ checkpointDigest: pin2.checkpointDigest })), /DISTRIBUTION_CLEANUP_INCOMPLETE/);
const progress2 = tx(() => ledger.cleanRetiredChunksInTxn({ checkpointDigest: pin2.checkpointDigest, generations: [3] }));
assert.deepEqual(progress2.deletedGenerations, [3]); assert.deepEqual(progress2.remainingGenerations, []); checks++;
const done2 = tx(() => ledger.completeRetiredCleanupInTxn({ checkpointDigest: pin2.checkpointDigest }));
assert.equal(done2.verifiedRetired, 1); assert.equal(done2.verifiedRetained, 2); assert.ok(done2.completedAt.endsWith('Z'));
const done2b = tx(() => ledger.completeRetiredCleanupInTxn({ checkpointDigest: pin2.checkpointDigest }));
assert.ok(done2b.completedAt >= done2.completedAt); assert.equal(done2b.verifiedRetired, 1); checks++;
const progress3 = tx(() => ledger.cleanRetiredChunksInTxn({ checkpointDigest: pin.checkpointDigest, generations: [2] }));
assert.deepEqual(progress3.deletedGenerations, [1, 2]); assert.deepEqual(progress3.remainingGenerations, []);
const done1 = tx(() => ledger.completeRetiredCleanupInTxn({ checkpointDigest: pin.checkpointDigest }));
assert.equal(done1.verifiedRetired, 2); assert.equal(done1.verifiedRetained, 2); checks++;
assert.equal(ledger.entry(1).retired, true); assert.equal(ledger.entry(3).checkpointDigest, pin2.checkpointDigest);
const postReplay = tx(() => ledger.enqueueInTxn({ operationId: op(2), kind: 'publish', gameId: GAME, payload: payload(2) }));
assert.equal(postReplay.deduped, true); assert.equal(postReplay.retired, true); checks++;

// Retained strictness is preserved end to end: missing retained chunks still corrupt.
storage.sql.exec('DELETE FROM content_distribution_chunks WHERE generation=4');
assert.throws(() => tx(() => ledger.enqueueInTxn({ operationId: op4, kind: 'publish', gameId: GAME, payload: payload(4) })), /DISTRIBUTION_LEDGER_CORRUPT/);
assert.throws(() => ledger.entry(4), /DISTRIBUTION_LEDGER_CORRUPT/);
assert.equal(ledger.entry(2).retired, true); checks++;

// Checkpoint durability across restart: the pin is ordinary durable state.
// After close/reopen the retired read, replay and digest verify from disk;
// an ambiguous-commit retry of the identical pin conflicts instead of
// duplicating, and recovery proceeds by reading back the stored pin.
const own = mkdtempSync(join(tmpdir(), 'dragon-ledger-retire-'));
let fileStorage = openStorage(join(own, 'owned.sqlite'));
let fileLedger = new FrozenDistributionLedger({ storage: fileStorage, verifyReceipt });
const ftx = run => fileStorage.transactionSync(run);
const ffirst = ftx(() => fileLedger.enqueueInTxn({ operationId: op(21), kind: 'publish', gameId: GAME, payload: payload(21) }));
ftx(() => fileLedger.confirmInTxn(op(21), null));
const fsecond = ftx(() => fileLedger.enqueueInTxn({ operationId: op(22), kind: 'publish', gameId: GAME, payload: payload(22) }));
ftx(() => fileLedger.confirmInTxn(op(22), null));
const fpin = ftx(() => fileLedger.retireCheckpointInTxn({ retiredGenerations: [1], anchorDigest: fsecond.operationDigest }));
fileStorage.close(); fileStorage = openStorage(join(own, 'owned.sqlite'));
fileLedger = new FrozenDistributionLedger({ storage: fileStorage, verifyReceipt });
const ftx2 = run => fileStorage.transactionSync(run);
assert.equal(fileLedger.entry(1).retired, true);
assert.equal(fileLedger.entry(1).checkpointDigest, fpin.checkpointDigest);
assert.equal(fileLedger.entry(1).operationDigest, ffirst.operationDigest);
const freplay = ftx2(() => fileLedger.enqueueInTxn({ operationId: op(21), kind: 'publish', gameId: GAME, payload: payload(21) }));
assert.equal(freplay.deduped, true); assert.equal(freplay.retired, true); checks++;
assert.throws(() => ftx2(() => fileLedger.retireCheckpointInTxn({ retiredGenerations: [1], anchorDigest: fsecond.operationDigest })), /DISTRIBUTION_CHECKPOINT_CONFLICT/);
assert.equal(fileStorage.sql.exec('SELECT COUNT(*) AS n FROM content_distribution_checkpoints').toArray()[0].n, 1);
assert.equal(fileLedger.entry(2).retired, undefined);
assert.deepEqual(Buffer.from(fileLedger.entry(2).payload), payload(22)); checks++;
fileStorage.close(); rmSync(own, { recursive: true, force: true });

storage.close();
process.stdout.write(`frozen distribution ledger retirement: ${checks} groups green (metadata-only retired reads; no publisher, R2 or DELETE proof)\n`);
