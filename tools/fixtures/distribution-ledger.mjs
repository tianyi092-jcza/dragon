// Owned SQLite contracts only; receipt verifier is a fake branded seam, NOT R2 evidence.
import assert from 'node:assert/strict';
import { FrozenDistributionLedger, DISTRIBUTION_CHUNK_BYTES, DISTRIBUTION_PAYLOAD_LIMIT } from '../../server/distributionledger.js';
const AUTHORITY = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const GAME = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OTHER = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const op = n => `cccccccc-cccc-4ccc-8ccc-${n.toString(16).padStart(12, '0')}`;
const payload = value => Buffer.from(JSON.stringify({ version: 1, value }));

export function exerciseDistributionLedger(createStorage) {
  let checks = 0;
  function use(run) {
    const storage = createStorage(), receipts = new WeakMap();
    const verifyReceipt = ticket => { if (!receipts.has(ticket)) throw new Error('OWNED_RECEIPT_REQUIRED'); return receipts.get(ticket); };
    const ledger = new FrozenDistributionLedger({ storage, authorityId: AUTHORITY, verifyReceipt });
    const q = (text, ...values) => storage.sql.exec(text, ...values).toArray();
    const tx = fn => storage.transactionSync(fn);
    const enqueue = (id, kind = 'publish', gameId = GAME, bytes = payload('original')) => tx(() => ledger.enqueueInTxn({ operationId: op(id), kind, gameId, payload: bytes }));
    const ticket = (record, overrides = {}) => {
      const key = Object.freeze({});
      receipts.set(key, { authorityId: record.authorityId, generation: record.generation, operationId: record.operationId, operationDigest: record.operationDigest, payloadDigest: record.payloadDigest, rootDigest: '1'.repeat(64), rootETag: '"owned-etag"', visibleAt: '2026-10-16T00:00:00.000Z', ...overrides });
      return key;
    };
    const snapshot = () => ['content_distribution_state', 'content_distribution_events', 'content_distribution_chunks'].map(table => q(`SELECT * FROM ${table} ORDER BY 1,2`));
    try { run({ storage, receipts, ledger, verifyReceipt, q, tx, enqueue, ticket, snapshot }); checks++; }
    finally { storage.close?.(); }
  }
  use(({ ledger, storage, verifyReceipt }) => {
    assert.deepEqual(ledger.status(), { authorityId: AUTHORITY, tailGeneration: 0, tailDigest: null, confirmedGeneration: 0, confirmedDigest: null, blockedReason: null, enqueuePaused: false });
    assert.equal(ledger.next(), null); assert.equal(ledger.pendingForGame(GAME), false);
    assert.throws(() => new FrozenDistributionLedger({ storage }), /synchronous trusted receipt verifier/);
    assert.throws(() => new FrozenDistributionLedger({ storage, authorityId: OTHER, verifyReceipt }), /DISTRIBUTION_AUTHORITY_CHANGED/);
    let calls = 0;
    assert.throws(() => new FrozenDistributionLedger({ storage, verifyReceipt: async () => { calls++; } }), /synchronous trusted receipt verifier/);
    assert.equal(calls, 0);
  });
  use(({ storage, ledger, verifyReceipt, enqueue, tx }) => {
    const bytes = Buffer.from(' {"version":1,"value":"exact bytes"}\n'), expected = Buffer.from(bytes);
    const first = enqueue(1, 'publish', GAME, bytes); bytes.fill(0);
    assert.equal(first.generation, 1); assert.equal(first.previousDigest, null);
    const again = new FrozenDistributionLedger({ storage, verifyReceipt });
    assert.equal(again.status().authorityId, AUTHORITY);
    assert.deepEqual(Buffer.from(again.next().payload), expected);
    const read = again.next(); read.payload.fill(0);
    assert.deepEqual(Buffer.from(ledger.next().payload), expected);
    const retained = ledger.entry(1); retained.payload.fill(0);
    assert.deepEqual(Buffer.from(ledger.entry(1).payload), expected);
    assert.equal(retained.state, 'pending'); assert.equal(retained.receipt, null);
    assert.throws(() => ledger.entry(0), /DISTRIBUTION_GENERATION/);
    assert.throws(() => ledger.entry(2), /DISTRIBUTION_UNKNOWN/);
    tx(() => ledger.noteAttemptInTxn(op(1))); assert.equal(again.next().attempts, 1);
    assert.throws(() => tx(() => { ledger.noteAttemptInTxn(op(1)); throw new Error('owned rollback'); }), /owned rollback/);
    assert.equal(again.next().attempts, 1);
  });
  use(({ ledger, enqueue, snapshot }) => {
    const first = enqueue(1), before = snapshot();
    assert.deepEqual(enqueue(1), { ...first, deduped: true }); assert.deepEqual(snapshot(), before);
    for (const args of [[1, 'publish', GAME, payload('changed')], [1, 'listing'], [1, 'publish', OTHER]]) {
      assert.throws(() => enqueue(...args), /DISTRIBUTION_OPERATION_CONFLICT/); assert.deepEqual(snapshot(), before);
    }
    assert.throws(() => enqueue(2), /DISTRIBUTION_GAME_PENDING/);
    const second = enqueue(2, 'listing'), third = enqueue(3, 'publish', OTHER);
    assert.equal(second.generation, 2); assert.equal(second.previousDigest, first.operationDigest);
    assert.equal(third.generation, 3); assert.equal(third.previousDigest, second.operationDigest);
    assert.equal(ledger.next().operationId, first.operationId);
  });
  use(({ ledger, enqueue, ticket, tx, snapshot }) => {
    const first = enqueue(1), second = enqueue(2, 'listing'), before = snapshot();
    assert.throws(() => tx(() => ledger.confirmInTxn(op(2), ticket(second))), /DISTRIBUTION_ORDER/);
    assert.throws(() => tx(() => ledger.confirmInTxn(op(1), {})), /OWNED_RECEIPT_REQUIRED/);
    assert.deepEqual(snapshot(), before);
    const proof = ticket(first), done = tx(() => ledger.confirmInTxn(op(1), proof));
    assert.equal(done.deduped, false); assert.equal(ledger.status().confirmedGeneration, 1);
    assert.equal(tx(() => ledger.confirmInTxn(op(1), proof)).deduped, true);
    assert.equal(ledger.next().operationId, op(2));
    tx(() => ledger.confirmInTxn(op(2), ticket(second)));
    assert.equal(ledger.next(), null); assert.equal(ledger.pendingForGame(GAME), false);
    assert.equal(ledger.entry(1).receipt.operationDigest, first.operationDigest);
    assert.equal(ledger.entry(2).receipt.operationDigest, second.operationDigest);
    assert.equal(ledger.entry(2).previousDigest, first.operationDigest);
    assert.equal(enqueue(3).generation, 3);
  });
  for (const override of [{ authorityId: OTHER }, { generation: 2 }, { operationId: op(8) }, { operationDigest: 'f'.repeat(64) }, { payloadDigest: 'f'.repeat(64) }, { rootDigest: ['1'.repeat(64)] }, { rootETag: 'bad\r\nheader' }, { visibleAt: '2026-02-30T00:00:00.000Z' }]) use(({ ledger, enqueue, ticket, tx, snapshot }) => {
    const first = enqueue(1), before = snapshot();
    assert.throws(() => tx(() => ledger.confirmInTxn(op(1), ticket(first, override))), /DISTRIBUTION_RECEIPT/);
    assert.deepEqual(snapshot(), before);
  });
  use(({ ledger, enqueue, ticket, tx, snapshot }) => {
    const first = enqueue(1); tx(() => ledger.confirmInTxn(op(1), ticket(first)));
    const before = snapshot();
    assert.throws(() => tx(() => ledger.confirmInTxn(op(1), ticket(first, { visibleAt: '2026-10-17T00:00:00.000Z' }))), /DISTRIBUTION_RECEIPT_CONFLICT/);
    assert.deepEqual(snapshot(), before);
  });
  for (const trigger of [
    "CREATE TRIGGER owned_failure BEFORE INSERT ON content_distribution_events BEGIN SELECT RAISE(ABORT,'owned event failure'); END",
    "CREATE TRIGGER owned_failure BEFORE INSERT ON content_distribution_chunks WHEN NEW.part=1 BEGIN SELECT RAISE(ABORT,'owned chunk failure'); END",
    "CREATE TRIGGER owned_failure BEFORE UPDATE OF tail_generation ON content_distribution_state BEGIN SELECT RAISE(ABORT,'owned tail failure'); END",
  ]) use(({ ledger, q, tx, enqueue, snapshot }) => {
    enqueue(1); q('CREATE TABLE fixture_authority(value INTEGER NOT NULL)'); q('INSERT INTO fixture_authority VALUES(0)'); q(trigger);
    const before = snapshot();
    assert.throws(() => tx(() => {
      q('UPDATE fixture_authority SET value=1');
      ledger.enqueueInTxn({ operationId: op(2), kind: 'listing', gameId: GAME, payload: payload('x'.repeat(DISTRIBUTION_CHUNK_BYTES)) });
    }), /owned .* failure/);
    assert.deepEqual(snapshot(), before); assert.equal(q('SELECT value FROM fixture_authority')[0].value, 0);
    q('DROP TRIGGER owned_failure');
  });
  for (const trigger of [
    "CREATE TRIGGER owned_failure BEFORE UPDATE OF state ON content_distribution_events BEGIN SELECT RAISE(ABORT,'owned confirmation failure'); END",
    "CREATE TRIGGER owned_failure BEFORE UPDATE OF confirmed_generation ON content_distribution_state BEGIN SELECT RAISE(ABORT,'owned cursor failure'); END",
  ]) use(({ ledger, q, tx, enqueue, ticket, snapshot }) => {
    const first = enqueue(1), proof = ticket(first), before = snapshot(); q(trigger);
    assert.throws(() => tx(() => ledger.confirmInTxn(op(1), proof)), /owned .* failure/);
    assert.deepEqual(snapshot(), before); q('DROP TRIGGER owned_failure');
    assert.equal(tx(() => ledger.confirmInTxn(op(1), proof)).deduped, false);
  });
  for (const damage of [
    "UPDATE content_distribution_chunks SET bytes=x'00'",
    'DELETE FROM content_distribution_chunks',
    'UPDATE content_distribution_chunks SET part=part+1',
    'UPDATE content_distribution_events SET payload_length=payload_length+1',
    "UPDATE content_distribution_events SET operation_digest='ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'",
    'UPDATE content_distribution_state SET tail_generation=tail_generation+1',
  ]) use(({ ledger, q, enqueue }) => {
    enqueue(1); q(damage); assert.throws(() => ledger.next(), /DISTRIBUTION_LEDGER_CORRUPT/);
  });
  use(({ ledger, q, enqueue, ticket, tx }) => {
    const first = enqueue(1); tx(() => ledger.confirmInTxn(op(1), ticket(first)));
    q("UPDATE content_distribution_events SET receipt_json='{}'");
    assert.throws(() => ledger.status(), /DISTRIBUTION_LEDGER_CORRUPT/);
  });
  use(({ ledger, enqueue, snapshot }) => {
    const before = snapshot();
    for (const invalid of [Buffer.from('{'), Buffer.from('null'), Buffer.from('[]'), Buffer.from('{"version":2}'), Uint8Array.from([123, 255, 125]), Buffer.alloc(DISTRIBUTION_PAYLOAD_LIMIT + 1), 'not bytes']) {
      assert.throws(() => enqueue(1, 'publish', GAME, invalid), /DISTRIBUTION_PAYLOAD/); assert.deepEqual(snapshot(), before);
    }
    assert.throws(() => enqueue(1, 'unknown'), /DISTRIBUTION_OPERATION/);
    assert.throws(() => enqueue(1, 'publish', 'wolong-builtin'), /DISTRIBUTION_OPERATION/);
    const boundary = payload('x'.repeat(DISTRIBUTION_PAYLOAD_LIMIT - payload('').length));
    assert.equal(boundary.length, DISTRIBUTION_PAYLOAD_LIMIT);
    enqueue(1, 'publish', GAME, boundary);
    assert.deepEqual(Buffer.from(ledger.next().payload), boundary);
  });
  use(({ ledger, q, enqueue }) => {
    assert.throws(() => q('INSERT INTO content_distribution_chunks(generation,part,bytes) VALUES(99,0,?)', Uint8Array.of(1)), /FOREIGN KEY constraint/);
    enqueue(1, 'bootstrap', null); assert.throws(() => enqueue(2, 'bootstrap', null), /DISTRIBUTION_GENERATION/);
    q('UPDATE content_distribution_events SET attempts=?', Number.MAX_SAFE_INTEGER);
    assert.throws(() => ledger.noteAttemptInTxn(op(1)), /DISTRIBUTION_ORDER/);
  });
  use(({ ledger, enqueue, ticket, tx, snapshot, storage, verifyReceipt }) => {
    const first = enqueue(1), before = snapshot();
    const pending = { gameId: GAME, operationId: op(1), generation: 1, kind: 'publish', state: 'pending', visibleAt: null, releaseDigest: null, recoveryRequired: false };
    assert.deepEqual(ledger.operationStatus(GAME, op(1)), pending);
    assert.throws(() => ledger.operationStatus(OTHER, op(1)), /DISTRIBUTION_UNKNOWN/);
    assert.throws(() => ledger.operationStatus(GAME, op(99)), /DISTRIBUTION_UNKNOWN/);
    assert.throws(() => ledger.operationStatus('bad', op(1)), /DISTRIBUTION_OPERATION/);
    assert.deepEqual(snapshot(), before);
    tx(() => ledger.confirmInTxn(op(1), ticket(first)));
    enqueue(2, 'listing', OTHER);
    const confirmed = { ...pending, state: 'confirmed', visibleAt: '2026-10-16T00:00:00.000Z' };
    assert.deepEqual(ledger.operationStatus(GAME, op(1)), confirmed);
    ledger.block('REMOTE_AHEAD');
    const reopened = new FrozenDistributionLedger({ storage, verifyReceipt });
    assert.deepEqual(reopened.operationStatus(GAME, op(1)), { ...confirmed, recoveryRequired: true });
    assert.equal(reopened.operationStatus(OTHER, op(2)).state, 'pending');
  });
  use(({ storage, enqueue, snapshot, verifyReceipt }) => {
    enqueue(1); const before = snapshot(), queries = [];
    const observed = new FrozenDistributionLedger({ storage: { sql: { exec: (...args) => { queries.push(args[0]); return storage.sql.exec(...args); } }, transactionSync: run => storage.transactionSync(run) }, verifyReceipt });
    queries.length = 0;
    const result = observed.operationStatus(GAME, op(1));
    assert.throws(() => { result.state = 'confirmed'; }, TypeError);
    assert.ok(queries.length > 0 && queries.every(query => /^SELECT\b/.test(query) && !query.includes('content_distribution_chunks')));
    assert.deepEqual(snapshot(), before, 'metadata status performs no payload read or persistent write');
  });
  use(({ ledger, storage, verifyReceipt, enqueue, ticket, tx }) => {
    const first = enqueue(1); ledger.block('REMOTE_AHEAD');
    assert.equal(ledger.block('REMOTE_GAP').blockedReason, 'REMOTE_AHEAD');
    const reopened = new FrozenDistributionLedger({ storage, verifyReceipt });
    assert.equal(reopened.status().blockedReason, 'REMOTE_AHEAD');
    assert.throws(() => reopened.next(), /DISTRIBUTION_RECOVERY_REQUIRED/);
    assert.throws(() => enqueue(2, 'listing'), /DISTRIBUTION_RECOVERY_REQUIRED/);
    assert.throws(() => tx(() => ledger.confirmInTxn(op(1), ticket(first))), /DISTRIBUTION_RECOVERY_REQUIRED/);
    assert.equal(ledger.status().confirmedGeneration, 0);
  });
  return checks;
}
