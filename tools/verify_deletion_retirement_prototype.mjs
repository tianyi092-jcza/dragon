// Stage-0 retirement prototype: explicit retain/retire branches over an owned
// in-memory SQLite ledger. Fixture-only; no product code, DDL, lock, receipt
// format, barrier or DELETE ability. Retired reads return a minimal identity
// credential from metadata only; retained reads keep the original body path.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { openStorage } from '../vps/sqlite-port.mjs';
import { FrozenDistributionLedger } from '../server/distributionledger.js';
import { createRetirementPrototypeReader } from './fixtures/retirement-prototype.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const GAME_A = randomUUID(), GAME_B = randomUUID();
const storage = openStorage(':memory:');
const ledger = new FrozenDistributionLedger({ storage, verifyReceipt() { throw new Error('no receipt capability'); } });
const payload = marker => Buffer.from(JSON.stringify({ version: 1, marker }));
const enqueue = (gameId, marker) => {
  const operationId = randomUUID();
  let identity;
  storage.transactionSync(() => { identity = ledger.enqueueInTxn({ operationId, kind: 'listing', gameId, payload: payload(marker) }); });
  return { operationId, identity };
};
const first = enqueue(GAME_A, 'retire-me'), second = enqueue(GAME_B, 'protect-me'), third = enqueue(GAME_A, 'retain-me');
assert.equal(ledger.status().tailGeneration, 3);
const authorityId = ledger.status().authorityId;
const anchorDigest = ledger.entry(3).operationDigest;
const checkpointBody = { version: 1, authorityId, retiredGenerations: [1], anchorDigest };
const checkpoint = { ...checkpointBody, checkpointDigest: sha(JSON.stringify(checkpointBody)) };
const reader = createRetirementPrototypeReader({ storage, ledger, checkpoint });
const snapshot = () => ['content_distribution_state', 'content_distribution_events', 'content_distribution_chunks'].map(table => storage.sql.exec(`SELECT * FROM ${table} ORDER BY rowid`).toArray());
let checks = 0;
try {
  // Retired generation with intact body: minimal credential, metadata only.
  const before = snapshot();
  const credential = reader.read(1);
  assert.equal(credential.generation, 1); assert.equal(credential.retired, true);
  assert.equal(credential.checkpointDigest, checkpoint.checkpointDigest);
  assert.equal(credential.operationId, first.identity.operationId);
  assert.equal(credential.operationDigest, first.identity.operationDigest);
  assert.equal(credential.previousDigest, first.identity.previousDigest);
  assert.equal(credential.gameId, GAME_A); assert.equal(credential.kind, 'listing');
  assert.ok(!('payload' in credential));
  assert.deepEqual(snapshot(), before); checks++;
  // Remove the retired body: retire branch still returns the same credential,
  // proving it never depended on chunks. The retained path on the same state
  // still fails, so a missing body is never silently treated as retired.
  const saved = storage.sql.exec('SELECT rowid AS saved_rowid,* FROM content_distribution_chunks WHERE generation=1 ORDER BY part').toArray();
  storage.sql.exec('DELETE FROM content_distribution_chunks WHERE generation=1');
  try {
    assert.deepEqual(reader.read(1), credential);
    // Intentionally mutated here (generation-1 chunks deleted); no snapshot check.
    assert.throws(() => reader.readRetained(1), error => error.code === 'DISTRIBUTION_LEDGER_CORRUPT');
    assert.throws(() => ledger.entry(1), error => error.code === 'DISTRIBUTION_LEDGER_CORRUPT');
    assert.throws(() => ledger.next(), error => error.code === 'DISTRIBUTION_LEDGER_CORRUPT');
    assert.throws(() => storage.transactionSync(() => ledger.enqueueInTxn({ operationId: first.operationId, kind: 'listing', gameId: GAME_A, payload: payload('retire-me') })), error => error.code === 'DISTRIBUTION_LEDGER_CORRUPT');
    checks++;
  } finally {
    for (const row of saved) storage.sql.exec('INSERT INTO content_distribution_chunks(rowid,generation,part,bytes) VALUES(?,?,?,?)', row.saved_rowid, row.generation, row.part, row.bytes);
  }
  assert.deepEqual(snapshot(), before);
  assert.deepEqual(reader.read(1), credential); checks++;
  // The retire branch refuses non-retired generations explicitly and never
  // falls through to a retained read; the protected game is unaffected.
  assert.throws(() => reader.read(2), error => error.code === 'RETIREMENT_PROTOTYPE_NOT_RETIRED');
  assert.throws(() => reader.read(99), error => error.code === 'RETIREMENT_PROTOTYPE_NOT_RETIRED' || error.code === 'DISTRIBUTION_UNKNOWN');
  const live = reader.readRetained(2);
  assert.equal(live.gameId, GAME_B); assert.equal(JSON.parse(Buffer.from(live.payload).toString()).marker, 'protect-me');
  assert.equal(reader.readRetained(3).operationDigest, third.identity.operationDigest);
  assert.deepEqual(snapshot(), before); checks++;
  // Old-key idempotent replay on a retained generation still dedupes: the
  // prototype changes no ledger idempotency contract.
  let replay;
  storage.transactionSync(() => { replay = ledger.enqueueInTxn({ operationId: second.operationId, kind: 'listing', gameId: GAME_B, payload: payload('protect-me') }); });
  assert.equal(replay.deduped, true); assert.equal(replay.operationDigest, second.identity.operationDigest);
  assert.deepEqual(snapshot(), before); checks++;
  // Tampered checkpoints are rejected: unknown generation, empty set,
  // foreign authority, unknown anchor, or a reused operation digest.
  const bad = [
    { ...checkpointBody, retiredGenerations: [99] },
    { ...checkpointBody, retiredGenerations: [] },
    { ...checkpointBody, authorityId: randomUUID() },
    { ...checkpointBody, anchorDigest: '0'.repeat(64) },
  ];
  // A well-formed checkpoint retiring a different generation is honored (the
  // retired set is data, not hard-coded): generation 2 reads retired here.
  const altBody = { ...checkpointBody, retiredGenerations: [2] };
  const alt = createRetirementPrototypeReader({ storage, ledger,
    checkpoint: { ...altBody, checkpointDigest: sha(JSON.stringify(altBody)) } });
  assert.equal(alt.read(2).retired, true); assert.equal(alt.read(2).gameId, GAME_B);
  assert.throws(() => alt.read(1), error => error.code === 'RETIREMENT_PROTOTYPE_NOT_RETIRED');
  assert.deepEqual(snapshot(), before); checks++;
  for (const body of bad) {
    assert.throws(() => createRetirementPrototypeReader({ storage, ledger,
      checkpoint: { ...body, checkpointDigest: sha(JSON.stringify(body)) } }), error => error.code === 'RETIREMENT_PROTOTYPE_CHECKPOINT');
  }
  assert.throws(() => createRetirementPrototypeReader({ storage, ledger, checkpoint: { ...checkpointBody, checkpointDigest: first.identity.operationDigest } }),
    error => error.code === 'RETIREMENT_PROTOTYPE_CHECKPOINT');
  assert.deepEqual(snapshot(), before); checks++;
  process.stdout.write(JSON.stringify({ checks, scope: 'owned SQLite ledger with explicit prototype retain/retire branches; retired reads are metadata-only minimal credentials, retained bodies keep corrupt rejection, checkpoint integrity enforced' }) + '\n');
} finally { storage.close(); }
