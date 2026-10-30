// Stage-1 retired-head publisher paths: idle checkHead on a retired remote head
// via metadata comparison, next-generation publish over a retired head via
// payload-free receipt recovery, and fail-closed missing retired receipts.
// Owned memory SQLite + memory R2 only; no HTTP, production R2 or DELETE proof.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openStorage } from '../vps/sqlite-port.mjs';
import { createDistributionPublisher } from '../vps/distribution-publisher.mjs';

const GAME = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const prefix = 'test/retirepub/';
const payload = n => Buffer.from(JSON.stringify({ version: 1, projection: { runtimeVersion: 1, index: n, directory: [], releases: [], announcements: [], gameStates: [] } }));
function memoryR2() {
  const objects = new Map();
  const put = (key, bytes, type, etag, modified) => objects.set(key, { bytes: Buffer.from(bytes), headers: { etag, 'content-type': type, 'last-modified': modified } });
  let counter = 0;
  const stamp = () => ({ etag: `"owned-${++counter}"`, modified: 'Tue, 01 Jan 2030 00:00:00 GMT' });
  const r2 = {
    async get(key, options) { assert.ok(options.maxBytes > 0); const value = objects.get(key); return value ? { bytes: Buffer.from(value.bytes), headers: { ...value.headers } } : null; },
    async putImmutable(key, bytes, type) { assert.equal(arguments.length, 3); if (!objects.has(key)) { const s = stamp(); put(key, bytes, type, s.etag, s.modified); } else assert.deepEqual(objects.get(key).bytes, Buffer.from(bytes)); },
    async putControl(key, bytes, etag) { assert.equal(arguments.length, 3); const prior = objects.get(key); if (etag === null ? prior !== undefined : prior?.headers.etag !== etag) return false; const s = stamp(); put(key, bytes, 'application/json', s.etag, s.modified); return true; },
  };
  return { r2, remove(key) { objects.delete(key); } };
}

let checks = 0;
const storage = openStorage(':memory:');
const { r2, remove } = memoryR2();
const publisher = createDistributionPublisher({ storage, r2, prefix, verifyResources: async () => {} });
const ledger = publisher.ledger;
const tx = run => storage.transactionSync(run);
const rootKey = prefix + 'control/current.json';
async function root() { const stored = await r2.get(rootKey, { maxBytes: 4096 }); assert.ok(stored); return { bytes: Buffer.from(stored.bytes), etag: stored.headers.etag }; }
async function publishNext(n) {
  const id = randomUUID();
  tx(() => ledger.enqueueInTxn({ operationId: id, kind: 'publish', gameId: GAME, payload: payload(n) }));
  const done = await publisher.drainOne();
  assert.equal(done.state, 'VISIBLE_CONFIRMED');
  return done.receipt;
}
try {
  await publishNext(1);
  const root1 = await root();
  await publishNext(2);
  const root2 = await root();
  assert.equal(ledger.status().confirmedGeneration, 2); checks++;

  // Retire gen1, clean its chunks, lag the remote head back to gen1 (restored
  // backup shape). Idle checkHead still succeeds via metadata comparison.
  const anchor = ledger.status().confirmedDigest;
  const pin1 = tx(() => ledger.retireCheckpointInTxn({ retiredGenerations: [1], anchorDigest: anchor }));
  storage.sql.exec('DELETE FROM content_distribution_chunks WHERE generation=1');
  assert.equal(await r2.get(rootKey, { maxBytes: 4096 }).then(() => true), true);
  const lagged = await (async () => { const ok = await r2.putControl(rootKey, root1.bytes, root2.etag); assert.equal(ok, true); return root1; })();
  void lagged;
  const head = await publisher.checkHead();
  assert.equal(head.generation, 1); assert.equal(head.record.retired, true);
  assert.equal(head.record.gameId, GAME); assert.equal(head.record.kind, 'publish');
  assert.equal(head.record.checkpointDigest, pin1.checkpointDigest);
  assert.equal(head.record.operationDigest, JSON.parse(root1.bytes.toString()).operationDigest); checks++;

  // Retire gen2 as well; the remote head is already back at gen2. Publish
  // gen3 over the retired head end to end.
  assert.equal(await r2.putControl(rootKey, root2.bytes, head.etag), true);
  const pin2 = tx(() => ledger.retireCheckpointInTxn({ retiredGenerations: [2], anchorDigest: anchor }));
  void pin2;
  storage.sql.exec('DELETE FROM content_distribution_chunks WHERE generation=2');
  assert.equal(await r2.putControl(rootKey, root2.bytes, (await r2.get(rootKey, { maxBytes: 4096 })).headers.etag), true);
  const idle = await publisher.checkHead();
  assert.equal(idle.generation, 2); assert.equal(idle.record.retired, true); checks++;
  const id3 = randomUUID();
  tx(() => ledger.enqueueInTxn({ operationId: id3, kind: 'publish', gameId: GAME, payload: payload(3) }));
  const third = await publisher.drainOne();
  assert.equal(third.state, 'VISIBLE_CONFIRMED');
  assert.equal(ledger.status().confirmedGeneration, 3);
  const now = JSON.parse((await root()).bytes.toString());
  assert.equal(now.generation, 3); checks++;

  // A missing retired receipt object fails closed: no silent predecessor skip,
  // the generation stays pending, no new ordinal or unlock.
  const pin3 = tx(() => ledger.retireCheckpointInTxn({ retiredGenerations: [3], anchorDigest: ledger.status().confirmedDigest }));
  void pin3;
  storage.sql.exec('DELETE FROM content_distribution_chunks WHERE generation=3');
  const id4 = randomUUID();
  tx(() => ledger.enqueueInTxn({ operationId: id4, kind: 'publish', gameId: GAME, payload: payload(4) }));
  const ticket = ledger.entry(3);
  assert.equal(ticket.retired, true);
  remove(`${prefix}control/receipts/${ticket.authorityId}/3/${ticket.operationDigest}.json`);
  const stuck = await publisher.drainOne();
  assert.equal(stuck.state, 'COMMITTED_SYNC_PENDING'); assert.equal(stuck.operationId, id4);
  assert.equal(ledger.status().confirmedGeneration, 3);
  assert.equal(ledger.entry(3).retired, true); checks++;

  // A remote root that disagrees with the pinned metadata stays a gap. The
  // block is sticky by design, so this negative closes the run.
  const live = await root();
  const tampered = { ...JSON.parse(live.bytes.toString()), operationDigest: '0'.repeat(64) };
  assert.equal(await r2.putControl(rootKey, Buffer.from(JSON.stringify(tampered)), live.etag), true);
  await assert.rejects(publisher.checkHead(), /REMOTE_GAP/); checks++;
} finally { storage.close(); }
process.stdout.write(`frozen distribution publisher retirement: ${checks} groups green (retired-head metadata check, payload-free predecessor, fail-closed receipts; no HTTP, R2 production or DELETE proof)\n`);
