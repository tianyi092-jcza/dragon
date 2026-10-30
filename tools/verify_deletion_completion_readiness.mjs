// Stage-1 completion gate verification, fixture-only. The gate stays closed on
// current evidence and enumerates exactly what is missing; a labeled synthetic
// control proves the gate is live logic. No product change, no DELETE grant.
import assert from 'node:assert/strict';
import { openStorage } from '../vps/sqlite-port.mjs';
import { FrozenDistributionLedger } from '../server/distributionledger.js';
import { assessDeletionCompletion, syntheticFullEvidence } from './fixtures/deletion-completion-readiness.mjs';
import { purgeBackupDir } from './fixtures/backup-purge.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const sha = value => createHash('sha256').update(value).digest('hex');
const GAME = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const op = n => ('0000000' + n + '-0000-4000-8000-000000000000').slice(-36);
const payload = n => Buffer.from(JSON.stringify({ version: 1, index: n }));
const verifyReceipt = (_receipt, identity) => ({ ...identity, rootDigest: '2'.repeat(64), rootETag: '"completion-gate"', visibleAt: '2026-10-30T00:00:00.000Z' });

let checks = 0;
const storage = openStorage(':memory:');
const ledger = new FrozenDistributionLedger({ storage, verifyReceipt });
const tx = run => storage.transactionSync(run);
const digests = [];
for (let n = 1; n <= 2; n++) {
  const id = op(n);
  const first = tx(() => ledger.enqueueInTxn({ operationId: id, kind: 'delete-fence', gameId: GAME, payload: payload(n) }));
  tx(() => ledger.confirmInTxn(id, null)); digests.push(first.operationDigest);
}
const pin = tx(() => ledger.retireCheckpointInTxn({ retiredGenerations: [1], anchorDigest: digests[1] }));
tx(() => ledger.cleanRetiredChunksInTxn({ checkpointDigest: pin.checkpointDigest, generations: [1] }));
const cleanupReceipt = tx(() => ledger.completeRetiredCleanupInTxn({ checkpointDigest: pin.checkpointDigest }));
assert.equal(cleanupReceipt.retiredGenerations.length, 1); checks++;

// A real backup purge receipt for the target, produced by the local mechanism.
const own = join(tmpdir(), 'dragon-backup-purge-');
mkdirSync(own, { recursive: true });
const files = [0, 1].map(i => ({ name: `backup-${i}.bin`, bytes: Buffer.from(`backup-bytes-${i}`) }));
for (const file of files) writeFileSync(join(own, file.name), file.bytes);
const purgeReceipt = purgeBackupDir({ dir: own, target: GAME, files: files.map(file => ({ name: file.name, sha256: sha(file.bytes) })) });
assert.equal(purgeReceipt.fileCount, 2); checks++;

// Current evidence: ledger-level closure is real, everything else is missing.
const report = assessDeletionCompletion({ sql: storage.sql, ledger, gameId: GAME, fenceGeneration: 1, checkpointDigest: pin.checkpointDigest, cleanupReceipt, backupPurgeReceipts: [purgeReceipt] });
assert.equal(report.deleteAllowed, false);
assert.equal(report.mode, 'DELETION_COMPLETION_READINESS_FIXTURE_ONLY_NO_DELETE_GRANT');
const byId = Object.fromEntries(report.requirements.map(r => [r.id, r]));
assert.equal(byId['ledger-retired-covered'].met, true);
assert.equal(byId['trial-publish-cascaded'].met, true);
assert.equal(byId['backups-purged'].met, true);
for (const id of ['writers-drained', 'sql-scrubbed', 'private-writes-purged', 'names-released', 'caches-cleared', 'recovery-excludes-target']) {
  assert.equal(byId[id].met, false, id);
  assert.ok(typeof byId[id].evidence === 'string' && byId[id].evidence.length > 0, id);
}
checks++;

// A corrupted cleanup receipt must not satisfy the ledger requirement.
const tampered = assessDeletionCompletion({ sql: storage.sql, ledger, gameId: GAME, fenceGeneration: 1, checkpointDigest: pin.checkpointDigest, cleanupReceipt: { ...cleanupReceipt, checkpointDigest: '0'.repeat(64) }, backupPurgeReceipts: [purgeReceipt] });
assert.equal(tampered.deleteAllowed, false);
assert.equal(tampered.requirements.find(r => r.id === 'ledger-retired-covered').met, false); checks++;

// Synthetic positive control: the gate opens only on complete evidence.
const full = syntheticFullEvidence({ gameId: GAME, checkpointDigest: pin.checkpointDigest });
const open = assessDeletionCompletion({ sql: storage.sql, ledger, gameId: GAME, fenceGeneration: 1, checkpointDigest: pin.checkpointDigest, cleanupReceipt, ...full });
assert.equal(open.deleteAllowed, true);
assert.equal(open.requirements.every(r => r.met), true); checks++;

storage.close();
process.stdout.write(`deletion completion readiness: ${checks} groups green (gate closed on current evidence; no product DELETE grant)\n`);
