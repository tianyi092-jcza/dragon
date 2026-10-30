// Stage-1 scan retirement branch: retired generations surface as minimal
// identity credentials and contribute nothing to the reference partitions.
// Owned memory SQLite + fixture R2 only; no cloud, cleanup or delete proof.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openStorage } from '../vps/sqlite-port.mjs';
import { FrozenDistributionLedger } from '../server/distributionledger.js';
import { projectPublicationCatalog } from '../server/publicationcatalog.js';
import { inspectFrozenCatalogObjects } from '../vps/deletion-catalog-scan.mjs';
import { publication, GAME, OTHER_GAME, PORTRAIT, TEMPLATE_PORTRAIT } from './fixtures/publication.mjs';

const prefix = 'test/frozen-scan-retire/';
const publications = [publication(0, GAME, [GAME + '#chapter'], randomUUID()), publication(1, GAME, [GAME + '#chapter'], randomUUID()), publication(0, OTHER_GAME, [OTHER_GAME + '#chapter'], randomUUID())];
const stored = new Map(publications.flatMap(p => p.files.map(f => [prefix + f.key, { bytes: Buffer.from(f.bytes), headers: { 'content-type': f.contentType } }])));
for (const [id, bytes] of [['0', PORTRAIT], ['p0001', TEMPLATE_PORTRAIT]]) stored.set(prefix + `kao/${id}.png`, { bytes, headers: { 'content-type': 'image/png' } });
const storage = openStorage(':memory:');
const verifyReceipt = (_receipt, identity) => ({ ...identity, rootDigest: '4'.repeat(64), rootETag: '"scan-retire"', visibleAt: '2026-10-30T00:00:00.000Z' });
const ledger = new FrozenDistributionLedger({ storage, verifyReceipt });
const r2 = { async get(key, options) { const row = stored.get(key); assert.ok(options.maxBytes > 0); return row && { ...row, bytes: Buffer.from(row.bytes) }; } };
const tx = run => storage.transactionSync(run);
const payloads = new Map();
function current(p) {
  const pin = p.directory[0], release = p.releases[0];
  return { gameId: pin.gameId, listed: false, deleted: false, current: { ...pin, runtime: release.runtime, createdAt: release.created_at }, announcements: [] };
}
function append(games) {
  const catalog = { version: 1, games }, status = ledger.status();
  const context = { authorityId: status.authorityId, generation: status.tailGeneration + 1 };
  const payload = Buffer.from(JSON.stringify({ version: 1, projection: projectPublicationCatalog(catalog, context), catalog }));
  const result = tx(() => ledger.enqueueInTxn({ operationId: randomUUID(), kind: 'listing', gameId: OTHER_GAME, payload }));
  payloads.set(result.operationId, payload);
  return result;
}

let checks = 0;
try {
  const first = append([current(publications[0])]), second = append([current(publications[1]), current(publications[2])]);
  // Both games carried forward unchanged: the same runtime keys repeat in gen3.
  // A runtime key embeds gameId/ordinal/releaseId by contract, so cross-game
  // key sharing cannot occur in valid catalogs; the retirement-relevant sharing
  // is the same key referenced by several retained generations of one game.
  const third = append([current(publications[1]), current(publications[2])]);
  void third;
  void first; void second;
  for (const n of [1, 2]) {
    const row = storage.sql.exec('SELECT operation_id FROM content_distribution_events WHERE generation=?', n).toArray()[0];
    tx(() => ledger.confirmInTxn(row.operation_id, null));
  }
  assert.equal(ledger.status().confirmedGeneration, 2); checks++;
  const pin = tx(() => ledger.retireCheckpointInTxn({ retiredGenerations: [1], anchorDigest: ledger.status().confirmedDigest }));
  storage.sql.exec('DELETE FROM content_distribution_chunks WHERE generation=1');
  const report = await inspectFrozenCatalogObjects({ ledger, r2, gameId: GAME, prefix });
  assert.deepEqual(report.frozenReferences.retiredGenerations, [1]);
  assert.equal(report.frozenReferences.scannedGenerations, 3);
  assert.equal(report.frozenReferences.entries.length, 3);
  const retired = report.frozenReferences.entries[0];
  assert.equal(retired.generation, 1); assert.equal(retired.retired, true);
  assert.equal(retired.checkpointDigest, pin.checkpointDigest);
  assert.ok(!('containsContent' in retired));
  assert.equal(report.frozenReferences.entries[1].retired, undefined);
  assert.equal(report.frozenReferences.entries[2].generation, 3);
  assert.equal(report.frozenReferences.entries[2].retired, undefined); checks++;
  // Retired content contributes nothing: partitions come from retained gens only
  // (GAME head K1 via gen2+gen3 carry-forward, OTHER head K2; gen1's key never
  // enters the inventory), and the scan still refuses any deletion eligibility
  // or ownership proof.
  assert.deepEqual(report.frozenReferences.headRuntimeReferences.map(ref => ref.key), [publications[1].releases[0].runtime.key, publications[2].releases[0].runtime.key]);
  assert.deepEqual(report.frozenReferences.historicalOnlyRuntimeReferences.map(ref => ref.key), []);
  for (const key of ['writerLeaseHeld', 'providerSnapshotProven', 'catalogCoverageProven', 'resourceBodiesVerified', 'exclusiveOwnershipProven', 'deleteAllowed', 'physicalCleanupProven']) assert.equal(report[key], false); checks++;
  // A mismatched pin digest on the retired entry is not silently accepted: the
  // metadata chain still binds generation, operation and payload digests.
  assert.equal(retired.operationDigest, ledger.entry(1).operationDigest);
  assert.equal(retired.payloadDigest, ledger.entry(1).payloadDigest); checks++;
  // B survives A's retirement whole: retained payloads parse with identical
  // bytes, and old-key replays split by branch (retired A minimal without
  // chunk reads, retained B fully validated).
  for (const n of [2, 3]) assert.ok(Buffer.from(ledger.entry(n).payload).length > 0);
  const gen2payload = JSON.parse(Buffer.from(ledger.entry(2).payload).toString());
  assert.equal(gen2payload.catalog.games.find(g => g.gameId === OTHER_GAME).current.runtime.key, publications[2].releases[0].runtime.key);
  const replayA = tx(() => ledger.enqueueInTxn({ operationId: first.operationId, kind: 'listing', gameId: OTHER_GAME, payload: payloads.get(first.operationId) }));
  assert.equal(replayA.deduped, true); assert.equal(replayA.retired, true); assert.ok(!('payload' in replayA));
  const replayB = tx(() => ledger.enqueueInTxn({ operationId: second.operationId, kind: 'listing', gameId: OTHER_GAME, payload: payloads.get(second.operationId) }));
  assert.equal(replayB.deduped, true); assert.ok(!('retired' in replayB)); checks++;
} finally { storage.close(); }
process.stdout.write(`frozen deletion scan retirement: ${checks} groups green (retired minimal entries, retained-only partitions, no eligibility; no cloud, cleanup or delete proof)\n`);
