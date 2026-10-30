// Evidence-matrix backup/restore over retired history. File-DB copy is the
// backup; restore must not resurrect cleaned bodies, must keep other games
// and post-restore publishing intact, and must refuse a missing/tampered pin.
import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStorage } from '../vps/sqlite-port.mjs';
import { FrozenDistributionLedger } from '../server/distributionledger.js';

const GAME = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OTHER = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const op = n => ('0000000' + n + '-0000-4000-8000-000000000000').slice(-36);
const payload = n => Buffer.from(JSON.stringify({ version: 1, index: n }));
const verifyReceipt = (_receipt, identity) => ({ ...identity, rootDigest: '2'.repeat(64), rootETag: '"backup-restore"', visibleAt: '2026-10-30T00:00:00.000Z' });

let checks = 0;
const own = mkdtempSync(join(tmpdir(), 'dragon-distribution-backup-'));
const live = join(own, 'live.sqlite');
const snap = join(own, 'backup.sqlite');
const noPin = join(own, 'nopin.sqlite');
const tampered = join(own, 'tampered.sqlite');
const open = path => openStorage(path);
try {
  const keeper = openStorage(live);
  const ledger = new FrozenDistributionLedger({ storage: keeper, verifyReceipt });
  const tx = run => keeper.transactionSync(run);
  // Confirm each generation before enqueueing the next publish of the same game.
  let first = null;
  for (const [n, game] of [[1, GAME], [2, GAME], [3, OTHER]]) {
    const id = op(n);
    const done = tx(() => ledger.enqueueInTxn({ operationId: id, kind: 'publish', gameId: game, payload: payload(n) }));
    if (n === 1) first = done;
    tx(() => ledger.confirmInTxn(id, null));
  }
  const anchor = ledger.status().confirmedDigest;
  tx(() => ledger.pauseEnqueue());
  const pin = tx(() => ledger.retireCheckpointInTxn({ retiredGenerations: [1], anchorDigest: anchor }));
  tx(() => ledger.resumeEnqueue());
  const cleaned = tx(() => ledger.cleanRetiredChunksInTxn({ checkpointDigest: pin.checkpointDigest, generations: [1] }));
  assert.deepEqual(cleaned.deletedGenerations, [1]); assert.deepEqual(cleaned.remainingGenerations, []);
  const done = tx(() => ledger.completeRetiredCleanupInTxn({ checkpointDigest: pin.checkpointDigest }));
  assert.deepEqual(done.retiredGenerations, [1]); checks++;
  // Backup only after a closed checkpoint: retired body gone, pin present.
  keeper.sql.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  keeper.close();
  copyFileSync(live, snap);
  copyFileSync(live, noPin);
  copyFileSync(live, tampered);
  checks++;
  // Original continues: next-generation publish after cleanup and barrier.
  const keeper2 = openStorage(live);
  const ledger2 = new FrozenDistributionLedger({ storage: keeper2, verifyReceipt });
  const tx2 = run => keeper2.transactionSync(run);
  const fourth = tx2(() => ledger2.enqueueInTxn({ operationId: op(4), kind: 'publish', gameId: GAME, payload: payload(4) }));
  assert.equal(fourth.generation, 4); tx2(() => ledger2.confirmInTxn(op(4), null));
  assert.equal(ledger2.status().confirmedGeneration, 4);
  assert.equal(ledger2.entry(1).retired, true); keeper2.close(); checks++;
  // Restore: retired stays minimal, other game intact, publishing continues.
  const skeeper = open(snap);
  const restore = new FrozenDistributionLedger({ storage: skeeper, verifyReceipt });
  const r1 = restore.entry(1);
  assert.equal(r1.retired, true); assert.equal(r1.operationDigest, first.operationDigest);
  assert.equal(r1.checkpointDigest, pin.checkpointDigest); assert.equal(r1.payload, undefined);
  assert.deepEqual(Buffer.from(restore.entry(2).payload), payload(2));
  assert.deepEqual(Buffer.from(restore.entry(3).payload), payload(3));
  assert.equal(restore.status().tailGeneration, 3); assert.equal(restore.next(), null);
  skeeper.close();
  checks++;
  const rkeeper = openStorage(snap);
  const rledger = new FrozenDistributionLedger({ storage: rkeeper, verifyReceipt });
  const rtx = run => rkeeper.transactionSync(run);
  const fifth = rtx(() => rledger.enqueueInTxn({ operationId: op(5), kind: 'publish', gameId: OTHER, payload: payload(5) }));
  assert.equal(fifth.generation, 4); rtx(() => rledger.confirmInTxn(op(5), null));
  assert.equal(rledger.status().confirmedGeneration, 4);
  assert.equal(rledger.entry(1).retired, true); rkeeper.close(); checks++;
  // Missing pin: retired generation refuses as corrupt, nothing resurrected.
  const nkeeper = openStorage(noPin);
  nkeeper.sql.exec('DELETE FROM content_distribution_checkpoints');
  const nledger = new FrozenDistributionLedger({ storage: nkeeper, verifyReceipt });
  assert.throws(() => nledger.entry(1), /DISTRIBUTION_LEDGER_CORRUPT/);
  assert.deepEqual(Buffer.from(nledger.entry(2).payload), payload(2));
  nkeeper.close(); checks++;
  // Tampered pin (retired set rewritten): same explicit refusal, no silent pass.
  const tkeeper = openStorage(tampered);
  tkeeper.sql.exec("UPDATE content_distribution_checkpoints SET retired_generations='[2]'");
  const tledger = new FrozenDistributionLedger({ storage: tkeeper, verifyReceipt });
  assert.throws(() => tledger.entry(1), /DISTRIBUTION_LEDGER_CORRUPT/);
  assert.deepEqual(Buffer.from(tledger.entry(3).payload), payload(3));
  tkeeper.close(); checks++;
} finally { rmSync(own, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
process.stdout.write(`frozen distribution backup/restore: ${checks} groups green (retired bodies stay gone, restored publishing continues, pin loss refuses)\n`);
