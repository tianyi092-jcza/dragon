// Actual in-memory SQLite frozen ledger + owned transport indexes. No cloud,
// application publication, compiler, lease or cleanup proof. Optional body
// verification covers only these explicitly owned opaque transport fixtures.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openStorage } from '../vps/sqlite-port.mjs';
import { FrozenDistributionLedger } from '../server/distributionledger.js';
import { projectPublicationCatalog } from '../server/publicationcatalog.js';
import { inspectFrozenCatalogObjects } from '../vps/deletion-catalog-scan.mjs';
import { publication, GAME, OTHER_GAME, PORTRAIT, TEMPLATE_PORTRAIT } from './fixtures/publication.mjs';
const prefix = 'test/frozen-catalog-scan/';
const publications = [publication(0, GAME, [GAME + '#chapter'], randomUUID()), publication(1, GAME, [GAME + '#chapter'], randomUUID()), publication(0, OTHER_GAME, [OTHER_GAME + '#chapter'], randomUUID())];
const stored = new Map(publications.flatMap(p => p.files.map(f => [prefix + f.key, { bytes: Buffer.from(f.bytes), headers: { 'content-type': f.contentType } }])));
for (const [id, bytes] of [['0', PORTRAIT], ['p0001', TEMPLATE_PORTRAIT]]) stored.set(prefix + `kao/${id}.png`, { bytes, headers: { 'content-type': 'image/png' } });
const storage = openStorage(':memory:');
const ledger = new FrozenDistributionLedger({ storage, verifyReceipt() { throw new Error('no receipt capability'); } });
const reads = [];
const r2 = { async get(key, options) { reads.push(key); const row = stored.get(key); assert.ok(options.maxBytes > 0); return row && { ...row, bytes: Buffer.from(row.bytes) }; } };
function current(p) {
  const pin = p.directory[0], release = p.releases[0];
  return { gameId: pin.gameId, listed: false, deleted: false, current: { ...pin, runtime: release.runtime, createdAt: release.created_at }, announcements: [] };
}
function append(games) {
  const catalog = { version: 1, games }, status = ledger.status();
  const context = { authorityId: status.authorityId, generation: status.tailGeneration + 1 };
  const payload = Buffer.from(JSON.stringify({ version: 1, projection: projectPublicationCatalog(catalog, context), catalog }));
  return storage.transactionSync(() => ledger.enqueueInTxn({ operationId: randomUUID(), kind: 'listing', gameId: OTHER_GAME, payload }));
}
const latest = [current(publications[1]), current(publications[2])];
const inspect = extra => inspectFrozenCatalogObjects({ ledger, r2, gameId: GAME, prefix, ...extra });
const snapshot = () => ['content_distribution_state', 'content_distribution_events', 'content_distribution_chunks'].map(table => storage.sql.exec(`SELECT * FROM ${table} ORDER BY rowid`).toArray());
let checks = 0;
try {
  append([current(publications[0])]); append(latest);
  const before = snapshot(), report = await inspect();
  assert.equal(report.head.tailGeneration, 2); assert.equal(report.frozenReferences.scannedGenerations, 2);
  assert.equal(report.frozenReferences.runtimeReferences.length, 2);
  assert.equal(report.resourceReferences.scannedGames, 2); assert.equal(report.resourceReferences.scannedRuntimes, 3);
  assert.equal(reads.length, 3);
  assert.deepEqual(report.frozenReferences.headRuntimeReferences.map(ref => ref.key), publications.slice(1).map(p => p.releases[0].runtime.key));
  assert.deepEqual(report.frozenReferences.historicalOnlyRuntimeReferences.map(ref => ref.key), [publications[0].releases[0].runtime.key]);
  assert.equal(report.head.confirmedGeneration, 0);
  for (const row of report.resourceReferences.objects.filter(row => row.sharedLibrary)) {
    assert.deepEqual(row.gameIds, [GAME, OTHER_GAME]); assert.equal(row.references.length, 3); assert.equal(row.sharedAcrossGames, true);
  }
  for (const key of ['writerLeaseHeld', 'providerSnapshotProven', 'catalogCoverageProven', 'resourceBodiesVerified', 'exclusiveOwnershipProven', 'deleteAllowed', 'physicalCleanupProven']) assert.equal(report[key], false);
  assert.deepEqual(snapshot(), before); checks++;
  assert.equal(report.objectFrontier.basis, 'local-frozen-tail');
  assert.equal(report.objectFrontier.tailGeneration, 2);
  assert.deepEqual(report.objectFrontier.objects.map(row => row.key), report.resourceReferences.objects.map(row => row.key));
  const headKeys = new Set(publications.slice(1).map(p => p.releases[0].runtime.key));
  for (const row of report.resourceReferences.objects) {
    const partition = report.objectFrontier.objects.find(entry => entry.key === row.key);
    assert.deepEqual(partition.headReferences, row.references.filter(ref => headKeys.has(ref.indexKey)));
    assert.deepEqual(partition.historicalReferences, row.references.filter(ref => !headKeys.has(ref.indexKey)));
    if (row.sharedLibrary) {
      assert.equal(partition.headReferences.length, 2, 'shared images remain referenced by BOTH latest local games');
      assert.equal(partition.historicalReferences.length, 1);
    }
  }
  const oldIndex = report.objectFrontier.objects.find(row => row.key === publications[0].releases[0].runtime.key);
  assert.equal(oldIndex.headReferences.length, 0); assert.equal(oldIndex.historicalReferences.length, 1);
  assert.equal(reads.length, 3, 'classification does not add provider reads');
  assert.deepEqual(snapshot(), before); checks++;
  reads.length = 0;
  const bodyBytes = report.resourceReferences.objects.reduce((sum, row) => sum + row.byteLength, 0);
  const bodies = await inspect({ verifyBodies: true, maxBodyBytes: bodyBytes });
  assert.equal(bodies.resourceBodiesVerified, true); assert.equal(bodies.resourceReferences.verifiedBodyBytes, bodyBytes);
  assert.deepEqual(bodies.resourceReferences.objects, report.resourceReferences.objects);
  assert.deepEqual(bodies.objectFrontier, report.objectFrontier);
  assert.equal(reads.length, report.resourceReferences.objects.length); assert.equal(new Set(reads).size, reads.length);
  for (const flag of ['writerLeaseHeld', 'providerSnapshotProven', 'catalogCoverageProven', 'exclusiveOwnershipProven', 'deleteAllowed', 'physicalCleanupProven']) assert.equal(bodies[flag], false);
  assert.deepEqual(snapshot(), before); checks++;
  for (const options of [{ verifyBodies: true, maxBodyBytes: 1 }, { verifyBodies: 1 }, { maxBodyBytes: 1073741825 }]) {
    reads.length = 0; await assert.rejects(inspect(options)); assert.equal(reads.length, 0);
  }
  assert.deepEqual(snapshot(), before); checks++;
  // The absent target cannot filter other games out of the global payload.
  const absent = await inspect({ gameId: randomUUID() });
  assert.deepEqual(absent.frozenReferences.runtimeReferences, []); assert.equal(absent.resourceReferences.scannedRuntimes, 3);
  assert.deepEqual(absent.frozenReferences.headRuntimeReferences, report.frozenReferences.headRuntimeReferences);
  assert.deepEqual(absent.frozenReferences.historicalOnlyRuntimeReferences, report.frozenReferences.historicalOnlyRuntimeReferences);
  assert.deepEqual(absent.objectFrontier, report.objectFrontier);
  const partitionBefore = structuredClone(report.objectFrontier);
  const sharedPartition = report.objectFrontier.objects.find(row => row.headReferences.length === 2 && row.historicalReferences.length === 1);
  sharedPartition.headReferences[0].gameId = 'mutated frontier';
  sharedPartition.historicalReferences[0].indexKey = 'mutated frontier';
  assert.deepEqual(report.resourceReferences.objects, bodies.resourceReferences.objects);
  assert.deepEqual((await inspect()).objectFrontier, partitionBefore);
  assert.deepEqual(snapshot(), before); checks++;
  report.resourceReferences.objects[0].key = 'mutated report'; report.head.tailGeneration = 900;
  assert.equal((await inspect()).head.tailGeneration, 2); assert.deepEqual(snapshot(), before); checks++;
  for (const extra of [{ maxGenerations: 1 }, { maxRuntimes: 1 }, { maxReferences: 1 }, { prefix: 'private/' }, { gameId: 'invalid' }]) {
    reads.length = 0; await assert.rejects(inspect(extra));
    if (extra.maxReferences !== 1) assert.equal(reads.length, 0);
    assert.deepEqual(snapshot(), before);
  }
  checks++;
  const otherKey = prefix + publications[2].releases[0].runtime.key, other = stored.get(otherKey);
  stored.delete(otherKey);
  try { await assert.rejects(inspect(), /DELETE_RUNTIME_REFERENCE_INVALID/); }
  finally { stored.set(otherKey, other); }
  assert.deepEqual(snapshot(), before); checks++;
  // Append during the FIRST await. The changed ledger is preserved; no stale
  // report or invented rollback is returned even though its old indexes exist.
  let count = 0;
  await assert.rejects(inspect({ r2: { async get(key, options) {
    if (++count === 1) append(latest);
    return r2.get(key, options);
  } } }), /DELETE_CATALOG_HEAD_CHANGED/);
  assert.equal(count, 1, 'stop before further provider reads after observing drift');
  assert.equal(ledger.status().tailGeneration, 3);
  assert.equal((await inspect()).frozenReferences.scannedGenerations, 3); checks++;
  // A change during the LAST provider await must also be seen.
  count = 0;
  await assert.rejects(inspect({ r2: { async get(key, options) {
    if (++count === 3) append(latest);
    return r2.get(key, options);
  } } }), /DELETE_CATALOG_HEAD_CHANGED/);
  assert.equal(count, 3); assert.equal(ledger.status().tailGeneration, 4); checks++;
  // Same generation, different recovery state: checking only a counter fails.
  count = 0;
  await assert.rejects(inspect({ r2: { async get(key, options) {
    if (++count === 1) ledger.block('REMOTE_AHEAD');
    return r2.get(key, options);
  } } }), /DELETE_CATALOG_HEAD_CHANGED/);
  assert.equal(ledger.status().tailGeneration, 4); assert.equal(ledger.status().blockedReason, 'REMOTE_AHEAD');
  const blockedBefore = snapshot(), blocked = await inspect({ verifyBodies: true });
  assert.equal(blocked.resourceBodiesVerified, true);
  assert.equal(blocked.head.blockedReason, 'REMOTE_AHEAD'); assert.equal(blocked.deleteAllowed, false);
  assert.deepEqual(snapshot(), blockedBefore); checks++;
  // Head drift during a RESOURCE body await, not just during index discovery.
  const bodyStorage = openStorage(':memory:');
  try {
    const bodyLedger = new FrozenDistributionLedger({ storage: bodyStorage, verifyReceipt() { throw new Error('no receipt capability'); } });
    const context = { authorityId: bodyLedger.status().authorityId, generation: 1 }, catalog = { version: 1, games: latest };
    bodyStorage.transactionSync(() => bodyLedger.enqueueInTxn({ operationId: randomUUID(), kind: 'listing', gameId: OTHER_GAME,
      payload: Buffer.from(JSON.stringify({ version: 1, projection: projectPublicationCatalog(catalog, context), catalog })) }));
    let resourceReads = 0;
    await assert.rejects(inspect({ ledger: bodyLedger, verifyBodies: true, r2: { get(key, options) {
      if (!key.includes('/runtime-')) { resourceReads++; bodyLedger.block('REMOTE_GAP'); }
      return r2.get(key, options);
    } } }), /DELETE_CATALOG_HEAD_CHANGED/);
    assert.equal(resourceReads, 1); assert.equal(bodyLedger.status().blockedReason, 'REMOTE_GAP');
  } finally { bodyStorage.close(); }
  checks++;
  // Local confirmation is exercised through the real SQL transition. The
  // receipt capability below is an explicit fixture, NOT a remote readback.
  const confirmedStorage = openStorage(':memory:');
  try {
    const receiptCapability = {};
    const confirmedLedger = new FrozenDistributionLedger({ storage: confirmedStorage, verifyReceipt(receipt, identity) {
      assert.equal(receipt, receiptCapability);
      return { ...identity, rootDigest: '1'.repeat(64), rootETag: 'owned-confirmed-fixture', visibleAt: '2026-01-01T00:00:00.000Z' };
    } });
    const enqueue = (games, kind = 'listing', eventGameId = OTHER_GAME) => {
      const operationId = randomUUID(), context = { authorityId: confirmedLedger.status().authorityId, generation: confirmedLedger.status().tailGeneration + 1 };
      const catalog = { version: 1, games };
      confirmedStorage.transactionSync(() => confirmedLedger.enqueueInTxn({ operationId, kind, gameId: eventGameId,
        payload: Buffer.from(JSON.stringify({ version: 1, projection: projectPublicationCatalog(catalog, context), catalog })) }));
      return operationId;
    };
    const first = enqueue([current(publications[0])]), second = enqueue(latest);
    const localInspect = extra => inspect({ ledger: confirmedLedger, ...extra });
    const pending = await localInspect();
    assert.equal(pending.frozenReferences.confirmedGeneration, 0);
    assert.deepEqual(pending.frozenReferences.confirmedRuntimeReferences, []);
    assert.equal(pending.confirmedObjectFrontier.basis, 'local-confirmed-generation');
    assert.ok(pending.confirmedObjectFrontier.objects.every(row => row.confirmedReferences.length === 0)); checks++;
    confirmedStorage.transactionSync(() => confirmedLedger.confirmInTxn(first, receiptCapability));
    const dump = () => ['content_distribution_state', 'content_distribution_events', 'content_distribution_chunks'].map(table => confirmedStorage.sql.exec(`SELECT * FROM ${table} ORDER BY rowid`).toArray());
    const confirmedBefore = dump(); reads.length = 0;
    const confirmed = await localInspect();
    assert.equal(confirmed.head.tailGeneration, 2); assert.equal(confirmed.head.confirmedGeneration, 1);
    assert.deepEqual(confirmed.frozenReferences.confirmedRuntimeReferences.map(ref => ref.key), [publications[0].releases[0].runtime.key]);
    assert.deepEqual(confirmed.frozenReferences.headRuntimeReferences, pending.frozenReferences.headRuntimeReferences);
    assert.equal(reads.length, 3); assert.deepEqual(dump(), confirmedBefore);
    const confirmedKey = publications[0].releases[0].runtime.key;
    for (const row of confirmed.resourceReferences.objects) {
      const partition = confirmed.confirmedObjectFrontier.objects.find(entry => entry.key === row.key);
      assert.deepEqual(partition.confirmedReferences, row.references.filter(ref => ref.indexKey === confirmedKey));
      if (row.sharedLibrary) assert.equal(partition.confirmedReferences.length, 1);
    }
    assert.equal(confirmed.confirmedObjectFrontier.confirmedGeneration, 1);
    assert.equal(confirmed.deleteAllowed, false); assert.equal(confirmed.providerSnapshotProven, false); checks++;
    const confirmedCopy = structuredClone(confirmed.confirmedObjectFrontier);
    confirmed.confirmedObjectFrontier.objects.find(row => row.confirmedReferences.length).confirmedReferences[0].gameId = 'mutated';
    confirmed.frozenReferences.confirmedRuntimeReferences[0].key = 'mutated';
    assert.deepEqual((await localInspect({ gameId: randomUUID(), verifyBodies: true })).confirmedObjectFrontier, confirmedCopy);
    assert.deepEqual(confirmed.resourceReferences.objects, pending.resourceReferences.objects);
    assert.deepEqual(dump(), confirmedBefore); checks++;
    let confirmationReads = 0;
    await assert.rejects(localInspect({ r2: { async get(key, options) {
      if (++confirmationReads === 1) confirmedStorage.transactionSync(() => confirmedLedger.confirmInTxn(second, receiptCapability));
      return r2.get(key, options);
    } } }), /DELETE_CATALOG_HEAD_CHANGED/);
    assert.equal(confirmationReads, 1);
    const caughtUp = await localInspect();
    assert.equal(caughtUp.head.confirmedGeneration, 2);
    assert.deepEqual(caughtUp.frozenReferences.confirmedRuntimeReferences, caughtUp.frozenReferences.headRuntimeReferences);
    for (const row of caughtUp.confirmedObjectFrontier.objects) assert.deepEqual(row.confirmedReferences, caughtUp.objectFrontier.objects.find(item => item.key === row.key).headReferences);
    assert.equal(caughtUp.deleteAllowed, false); checks++;
    const deletion = enqueue([{ ...current(publications[1]), current: null, deleted: true }, current(publications[2])], 'delete-fence', GAME);
    const pendingDeletion = await localInspect();
    assert.equal(pendingDeletion.head.tailGeneration, 3); assert.equal(pendingDeletion.head.confirmedGeneration, 2);
    assert.deepEqual(pendingDeletion.frozenReferences.headRuntimeReferences.map(ref => ref.gameId), [OTHER_GAME]);
    assert.deepEqual(pendingDeletion.frozenReferences.confirmedRuntimeReferences, caughtUp.frozenReferences.confirmedRuntimeReferences);
    const pendingIndex = pendingDeletion.confirmedObjectFrontier.objects.find(row => row.key === publications[1].releases[0].runtime.key);
    assert.equal(pendingIndex.confirmedReferences.length, 1, 'pending deletion must not erase the last locally confirmed reference');
    assert.equal(pendingDeletion.deleteAllowed, false); checks++;
    confirmedStorage.transactionSync(() => confirmedLedger.confirmInTxn(deletion, receiptCapability));
    const confirmedDeletion = await localInspect();
    assert.deepEqual(confirmedDeletion.frozenReferences.confirmedRuntimeReferences.map(ref => ref.gameId), [OTHER_GAME]);
    assert.equal(confirmedDeletion.frozenReferences.catalogRuntimeReferences.length, 3);
    assert.equal(confirmedDeletion.resourceReferences.scannedRuntimes, 3);
    assert.equal(confirmedDeletion.deleteAllowed, false); assert.equal(confirmedDeletion.physicalCleanupProven, false); checks++;
    // Confirmation of delete-fence is not permission to prune historical
    // payloads: generation1 belongs to OTHER_GAME but still contains GAME.
    const retained = dump(), retainedHead = confirmedLedger.status();
    const historicalChunks = confirmedStorage.sql.exec('SELECT rowid AS saved_rowid,* FROM content_distribution_chunks WHERE generation=1 ORDER BY part').toArray();
    assert.equal(confirmedLedger.entry(1).gameId, OTHER_GAME);
    assert.equal(confirmedDeletion.frozenReferences.entries.find(row => row.generation === 1).containsContent, true);
    confirmedStorage.sql.exec('DELETE FROM content_distribution_chunks WHERE generation=1');
    try {
      assert.deepEqual(confirmedLedger.status(), retainedHead, 'metadata-only head cannot prove retained payload closure');
      reads.length = 0;
      await assert.rejects(localInspect(), error => error.code === 'DISTRIBUTION_LEDGER_CORRUPT');
      assert.equal(reads.length, 0, 'missing historical payload rejects before provider access');
    } finally {
      for (const row of historicalChunks) confirmedStorage.sql.exec('INSERT INTO content_distribution_chunks(rowid,generation,part,bytes) VALUES(?,?,?,?)', row.saved_rowid, row.generation, row.part, row.bytes);
    }
    assert.deepEqual(dump(), retained);
    assert.deepEqual((await localInspect()).frozenReferences, confirmedDeletion.frozenReferences); checks++;
    // Nor may a historical-only target runtime be removed while the frozen
    // global payload still references it, even after local confirmation3.
    const oldKey = prefix + publications[0].releases[0].runtime.key, oldObject = stored.get(oldKey);
    assert.ok(oldObject);
    stored.delete(oldKey);
    try {
      await assert.rejects(localInspect(), /DELETE_RUNTIME_REFERENCE_INVALID/);
      assert.deepEqual(confirmedLedger.status(), retainedHead);
      assert.deepEqual(dump(), retained);
    } finally { stored.set(oldKey, oldObject); }
    const restored = await localInspect({ verifyBodies: true });
    assert.equal(restored.resourceBodiesVerified, true);
    assert.equal(restored.deleteAllowed, false); assert.equal(restored.physicalCleanupProven, false);
    assert.deepEqual(dump(), retained); checks++;
  } finally { confirmedStorage.close(); }
  // Pruned payloads also break the publisher's live consumers, not just the
  // read-only joint scan: idle checkHead reads entry(), pending drainOne
  // reads next(), and idempotent old-op replay re-reads #payload on dedupe.
  // All three run on an owned pending-only ledger; no product change.
  const pendingStorage = openStorage(':memory:');
  try {
    const pendingLedger = new FrozenDistributionLedger({ storage: pendingStorage, verifyReceipt() { throw new Error('no receipt capability'); } });
    const operationId = randomUUID();
    const pendingContext = { authorityId: pendingLedger.status().authorityId, generation: 1 };
    const pendingCatalog = { version: 1, games: [current(publications[0])] };
    const pendingPayload = Buffer.from(JSON.stringify({ version: 1, projection: projectPublicationCatalog(pendingCatalog, pendingContext), catalog: pendingCatalog }));
    const enqueueArgs = { operationId, kind: 'listing', gameId: OTHER_GAME, payload: pendingPayload };
    pendingStorage.transactionSync(() => pendingLedger.enqueueInTxn(enqueueArgs));
    const pendingHead = pendingLedger.status();
    pendingStorage.sql.exec('DELETE FROM content_distribution_chunks WHERE generation=1');
    assert.deepEqual(pendingLedger.status(), pendingHead, 'metadata-only head cannot prove retained payload closure');
    assert.throws(() => pendingLedger.entry(1), error => error.code === 'DISTRIBUTION_LEDGER_CORRUPT');
    assert.throws(() => pendingLedger.next(), error => error.code === 'DISTRIBUTION_LEDGER_CORRUPT');
    assert.throws(() => pendingStorage.transactionSync(() => pendingLedger.enqueueInTxn(enqueueArgs)), error => error.code === 'DISTRIBUTION_LEDGER_CORRUPT');
  } finally { pendingStorage.close(); }
  checks++;
  // A real empty ledger is a bounded observation, never proof of no other refs.
  const emptyStorage = openStorage(':memory:');
  try {
    const emptyLedger = new FrozenDistributionLedger({ storage: emptyStorage, verifyReceipt() { throw new Error('no receipt capability'); } });
    reads.length = 0; const empty = await inspect({ ledger: emptyLedger });
    assert.equal(empty.head.tailGeneration, 0); assert.equal(empty.resourceReferences.scannedGames, 0); assert.equal(reads.length, 0);
    assert.equal(empty.catalogCoverageProven, false); assert.equal(empty.deleteAllowed, false);
    assert.deepEqual(empty.frozenReferences.headRuntimeReferences, []); assert.deepEqual(empty.frozenReferences.historicalOnlyRuntimeReferences, []);
    assert.deepEqual(empty.objectFrontier, { basis: 'local-frozen-tail', tailGeneration: 0, objects: [] });
  } finally { emptyStorage.close(); }
  checks++;
  process.stdout.write(JSON.stringify({ checks, scope: 'actual SQLite frozen ledger to cross-game transport indexes; first/last await and recovery-state drift reject; no cleanup grant' }) + '\n');
} finally { storage.close(); }
