// Real file SQLite backup/restore, owned conditional memory R2. Synthetic
// envelopes and explicit resource-verifier seam: NOT playable content, cloud,
// full application restore, deletion exclusion or production recovery authority.
import assert from 'node:assert/strict';
import { mkdtempSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { openStorage } from '../vps/sqlite-port.mjs';
import { createDistributionPublisher } from '../vps/distribution-publisher.mjs';
const root = mkdtempSync(join(tmpdir(), 'distribution-restore-'));
const authorityId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', gameId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const prefix = 'test/owned-restore/', rootKey = prefix + 'control/current.json';
const objects = new Map(), opened = new Set();
let writes = 0, controls = 0, groups = 0;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function own(key) { assert.ok(key.startsWith(prefix)); }
function store(key, bytes, type) {
  objects.set(key, { bytes: Buffer.from(bytes), headers: { etag: '"' + sha(bytes) + '"', 'content-type': type, 'last-modified': 'Tue, 01 Jan 2030 00:00:00 GMT' } });
}
const r2 = {
  async get(key, { maxBytes }) {
    own(key); const value = objects.get(key); if (!value) return null;
    assert.ok(value.bytes.length <= maxBytes);
    return { bytes: Buffer.from(value.bytes), headers: { ...value.headers } };
  },
  async putImmutable(key, bytes, type) {
    own(key); writes++;
    const old = objects.get(key);
    if (old) { assert.deepEqual(old.bytes, Buffer.from(bytes)); assert.equal(old.headers['content-type'], type); }
    else store(key, bytes, type);
  },
  async putControl(key, bytes, etag) {
    assert.equal(key, rootKey); controls++;
    if ((objects.get(key)?.headers.etag ?? null) !== etag) return false;
    store(key, bytes, 'application/json'); return true;
  },
};
function open(name) {
  const storage = openStorage(join(root, name)); opened.add(storage);
  const publisher = createDistributionPublisher({ storage, r2, prefix, authorityId, verifyResources: async () => {} });
  return { storage, publisher, ledger: publisher.ledger, name };
}
function close(instance) { instance.storage.close(); opened.delete(instance.storage); }
function backup(instance, name) {
  close(instance);
  // Closed SQL only: no online copying or lost WAL state assumption.
  copyFileSync(join(root, instance.name), join(root, name));
}
function enqueue(instance, n) {
  instance.storage.transactionSync(() => instance.ledger.enqueueInTxn({ operationId: `cccccccc-cccc-4ccc-8ccc-${String(n).padStart(12, '0')}`, kind: 'listing', gameId, payload: Buffer.from(JSON.stringify({ version: 1, projection: { marker: `restore-${n}` } })) }));
}
async function visible(instance) { assert.equal((await instance.publisher.drainOne()).state, 'VISIBLE_CONFIRMED'); }
async function blocked(instance, reason) {
  const before = [writes, controls];
  await assert.rejects(() => instance.publisher.checkHead(), /DISTRIBUTION_RECOVERY_REQUIRED/);
  assert.equal(instance.ledger.status().blockedReason, reason);
  await assert.rejects(() => instance.publisher.drainOne(), /DISTRIBUTION_RECOVERY_REQUIRED/);
  assert.deepEqual([writes, controls], before, 'recovery check must not repair the remote root');
}
try {
  let live = open('live.sqlite'); enqueue(live, 1); await visible(live);
  const receipt1 = live.ledger.entry(1).receipt;
  backup(live, 'old.sqlite');
  live = open('live.sqlite'); enqueue(live, 2); await visible(live);
  const status2 = live.ledger.status(), entry2 = live.ledger.entry(2);
  backup(live, 'current.sqlite');
  const current = open('current.sqlite'), beforeCurrent = [writes, controls];
  assert.deepEqual(current.ledger.status(), status2);
  assert.deepEqual(current.ledger.entry(2), entry2);
  assert.equal((await current.publisher.checkHead()).generation, 2);
  assert.equal((await current.publisher.drainOne()).state, 'IDLE');
  assert.deepEqual([writes, controls], beforeCurrent); close(current); groups++;

  let old = open('old.sqlite');
  assert.deepEqual(old.ledger.entry(1).receipt, receipt1);
  await blocked(old, 'REMOTE_AHEAD'); close(old);
  old = open('old.sqlite'); await blocked(old, 'REMOTE_AHEAD'); close(old); groups++;

  live = open('live.sqlite'); enqueue(live, 3);
  const pendingPayload = Buffer.from(live.ledger.entry(3).payload);
  backup(live, 'pending.sqlite');
  live = open('live.sqlite'); await visible(live);
  const confirmed3 = live.ledger.entry(3);
  backup(live, 'missing-root.sqlite');
  const pending = open('pending.sqlite'), beforeRecoveryControls = controls;
  assert.equal(pending.ledger.status().confirmedGeneration, 2);
  assert.equal((await pending.publisher.checkHead()).generation, 3);
  await visible(pending);
  assert.equal(controls, beforeRecoveryControls, 'valid remote receipt recovery must not repeat CAS');
  assert.deepEqual(pending.ledger.entry(3), confirmed3);
  assert.deepEqual(Buffer.from(pending.ledger.entry(3).payload), pendingPayload);
  close(pending); groups++;

  const remoteRoot = objects.get(rootKey); objects.delete(rootKey);
  let missing = open('missing-root.sqlite'); await blocked(missing, 'REMOTE_GAP'); close(missing);
  objects.set(rootKey, remoteRoot);
  missing = open('missing-root.sqlite'); await blocked(missing, 'REMOTE_GAP'); close(missing); groups++;
  live = open('live.sqlite');
  assert.equal((await live.publisher.checkHead()).generation, 3, 'locks on restore copies must not block original authority');
  assert.deepEqual(live.ledger.entry(3), confirmed3); close(live); groups++;
  process.stdout.write(`distribution restore: ${groups} groups green; file SQLite / memory R2; no production or full-content restore claim\n`);
} finally {
  for (const storage of opened) storage.close();
  rmSync(root, { recursive: true, force: true });
}
