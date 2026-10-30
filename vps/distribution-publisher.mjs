// Ordered frozen-envelope transport; NOT the authoritative publish HTTP producer.
// Default resource closure reads the frozen runtime graph. An explicit trusted
// override is only a server injection seam. No current-game SQL regeneration.
import { createHash } from 'node:crypto';
import { FrozenDistributionLedger } from '../server/distributionledger.js';
import { createDistributionReceipts } from './distribution-receipts.mjs';
import { createDistributionResourceVerifier } from './distribution-resources.mjs';
import { isGameId, parseJSON } from '../reader/runtimecontract.js';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function requireValue(condition) { if (!condition) throw new Error('DISTRIBUTION_READBACK'); }
function headers(stored) {
  const one = name => {
    const found = Object.entries(stored?.headers ?? {}).filter(([key]) => key.toLowerCase() === name);
    requireValue(found.length === 1 && typeof found[0][1] === 'string'); return found[0][1];
  };
  const type = one('content-type'), etag = one('etag'), modified = one('last-modified');
  requireValue(type === 'application/json' || type === 'application/json; charset=utf-8');
  requireValue(etag.length > 0 && etag.length <= 256 && !/[\r\n]/.test(etag));
  const time = Date.parse(modified);
  requireValue(Number.isFinite(time) && new Date(time).toUTCString() === modified);
  return { etag, visibleAt: new Date(time).toISOString() };
}
export function createDistributionPublisher({ storage, r2, prefix = '', authorityId, verifyResources, verifyStaticResources }) {
  if (typeof r2?.putControl !== 'function' || verifyResources !== undefined && typeof verifyResources !== 'function') throw new TypeError('conditional R2 port and valid trusted verifier required');
  const verify = verifyResources ?? createDistributionResourceVerifier({ r2, prefix, verifyStaticResources });
  const proof = createDistributionReceipts({ r2, prefix });
  const ledger = new FrozenDistributionLedger({ storage, authorityId, verifyReceipt: proof.verifyReceipt });
  const rootKey = prefix + 'control/current.json';
  function blocked(reason) { ledger.block(reason); throw new Error('DISTRIBUTION_RECOVERY_REQUIRED:' + reason); }
  function unlocked(status) { if (status.blockedReason !== null) throw new Error('DISTRIBUTION_RECOVERY_REQUIRED:' + status.blockedReason); }
  async function checkHead() {
    // Before/after snapshots distinguish a real rollback from a read overtaken by
    // another publisher. Busy observation does not permanently lock the authority.
    for (let attempt = 0; attempt < 4; attempt++) {
      const before = ledger.status(); unlocked(before);
      const stored = await r2.get(rootKey, { maxBytes: 4096 });
      const after = ledger.status(); unlocked(after);
      if (stored === null) {
        if (before.confirmedGeneration > 0) blocked('REMOTE_GAP');
        if (after.confirmedGeneration > 0) continue;
        if (after.tailGeneration > 0) {
          const first = ledger.entry(1);
          if (await proof.recover(first)) {
            // The receipt may have appeared after our absent-root observation.
            // It proves a gap only if a later strong root read is still absent.
            if (await r2.get(rootKey, { maxBytes: 4096 }) === null) blocked('REMOTE_GAP');
            continue;
          }
          // A concurrent first CAS/ack may have completed during receipt lookup.
          const now = ledger.status(); unlocked(now);
          if (now.confirmedGeneration > 0) continue;
        }
        return { generation: 0, etag: null, record: null };
      }
      let root, observed;
      try {
        requireValue(stored?.bytes instanceof Uint8Array && stored.bytes.byteLength > 0 && stored.bytes.byteLength <= 4096);
        root = parseJSON(stored.bytes); observed = headers(stored);
      } catch { blocked('REMOTE_GAP'); }
      if (root?.version !== 2) blocked('LEGACY_PENDING');
      if (!isGameId(root.authorityId) || !Number.isSafeInteger(root.generation) || root.generation < 1) blocked('REMOTE_GAP');
      if (root.authorityId !== after.authorityId) blocked('AUTHORITY_MISMATCH');
      if (root.generation > after.tailGeneration || root.generation > after.confirmedGeneration + 1) blocked('REMOTE_AHEAD');
      const record = ledger.entry(root.generation);
      // Retired history cannot be rebuilt from payload. Compare the remote root
      // against the metadata identity the checkpoint pin covers. Backend-assigned
      // etag/visibleAt are deliberately not gated: a restored backend assigns new
      // ones for identical bytes, and idle checkHead must keep working there.
      if (record.retired === true) {
        if (root.operationId !== record.operationId || root.operationDigest !== record.operationDigest || root.payloadDigest !== record.payloadDigest || root.previousOperationDigest !== record.previousDigest) blocked('REMOTE_GAP');
        return { generation: root.generation, etag: observed.etag, record };
      }
      if (root.generation < before.confirmedGeneration) blocked('REMOTE_GAP');
      if (root.generation < after.confirmedGeneration) continue;
      const expected = proof.expectedObjects(record);
      if (!Buffer.from(stored.bytes).equals(Buffer.from(expected.root.bytes))) blocked('REMOTE_GAP');
      if (record.state === 'confirmed' && (record.receipt.rootDigest !== sha(stored.bytes) || record.receipt.rootETag !== observed.etag || record.receipt.visibleAt !== observed.visibleAt)) blocked('REMOTE_GAP');
      return { generation: root.generation, etag: observed.etag, record };
    }
    throw new Error('DISTRIBUTION_HEAD_BUSY');
  }
  async function predecessor(head, record) {
    if (head.generation === record.generation) return;
    requireValue(head.generation === record.generation - 1);
    if (head.record === null) return;
    // A retired head keeps its persisted receipt object (stage-1 never cleans
    // receipts). Verify it payload-free against the ledger's own metadata.
    if (head.record.retired === true) {
      const ticket = await proof.recoverRetired(head.record);
      if (!ticket) throw new Error('DISTRIBUTION_PREDECESSOR_RECEIPT');
      const saved = proof.verifyReceipt(ticket, head.record);
      requireValue(JSON.stringify(saved) === JSON.stringify(head.record.receipt));
      return;
    }
    const ticket = await proof.recover(head.record);
    if (!ticket) throw new Error('DISTRIBUTION_PREDECESSOR_RECEIPT');
    const saved = proof.verifyReceipt(ticket, head.record);
    requireValue(JSON.stringify(saved) === JSON.stringify(head.record.receipt));
  }
  async function drainOne() {
    // This preflight is also used when idle: a restored database must not silently
    // accept a foreign, old-protocol, missing or remotely advanced authority.
    const record = ledger.next();
    if (record === null) { await checkHead(); return Object.freeze({ state: 'IDLE' }); }
    try {
      let head = await checkHead();
      storage.transactionSync(() => ledger.noteAttemptInTxn(record.operationId));
      const expected = proof.expectedObjects(record);
      await predecessor(head, record);
      // Pass a disposable copy: neither asynchronous verifier code nor its caller
      // can change the exact retained operation selected for this attempt.
      await verify(Object.freeze({ ...record, payload: new Uint8Array(record.payload) }));
      // Persist the exact frozen root descriptor even when recovering an already
      // visible CAS. This is NOT visibility proof: only the separately observed
      // immutable receipt can establish that this candidate became public.
      const archive = expected.rootArchive;
      await r2.putImmutable(archive.key, archive.bytes, archive.contentType);
      const archived = await r2.get(archive.key, { maxBytes: archive.bytes.byteLength });
      requireValue(archived?.bytes instanceof Uint8Array && Buffer.from(archived.bytes).equals(Buffer.from(archive.bytes)));
      headers(archived);
      if (head.generation < record.generation) {
        await r2.putImmutable(expected.projection.key, expected.projection.bytes, expected.projection.contentType);
        const projection = await r2.get(expected.projection.key, { maxBytes: expected.projection.bytes.byteLength });
        requireValue(projection?.bytes instanceof Uint8Array && Buffer.from(projection.bytes).equals(Buffer.from(expected.projection.bytes)));
        headers(projection);
        head = await checkHead();
        await predecessor(head, record);
        if (head.generation < record.generation) {
          // A false result or lost response is NOT a failed authority transaction.
          // Only a subsequent exact root/projection/receipt observation can ack it.
          try { await r2.putControl(expected.root.key, expected.root.bytes, head.etag); }
          catch { /* The request may have committed. Observe before any retry. */ }
        }
      }
      const ticket = await proof.observe(record);
      const receipt = storage.transactionSync(() => ledger.confirmInTxn(record.operationId, ticket));
      return Object.freeze({ state: 'VISIBLE_CONFIRMED', receipt });
    } catch (error) {
      if (ledger.status().blockedReason !== null) throw error;
      // Permanent SQLite operation and frozen payload remain intact. No new
      // ordinal, automatic unblock, root rollback or destructive cleanup.
      return Object.freeze({ state: 'COMMITTED_SYNC_PENDING', operationId: record.operationId });
    }
  }
  return Object.freeze({ ledger, checkHead, drainOne });
}
