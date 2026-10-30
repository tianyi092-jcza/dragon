// Real SQLite + metadata/release/pin stores. Principal/namespace are explicit
// test ports: this is NOT an HTTP, compiler, R2 or complete publication proof.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { openStorage } from '../vps/sqlite-port.mjs';
import { PublishOperations } from '../server/publishoperations.js';
import { GameMetadataStore } from '../server/metadata.js';
import { ReleaseLedger } from '../server/releases.js';
import { PublishedGames } from '../server/published.js';
const G = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', OTHER = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
let groups = 0;
function fixture() {
  const storage = openStorage(':memory:'), sql = storage.sql;
  const actor = { id: 'owner', role: 'author', epoch: 1, must_change: 0 };
  const principal = token => { assert.equal(token, 'owned-token'); return actor; };
  sql.exec('CREATE TABLE users (id TEXT PRIMARY KEY)'); sql.exec("INSERT INTO users VALUES('owner')");
  const games = new GameMetadataStore({ storage, principal });
  sql.exec('INSERT INTO content_games VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)', G, 'owner', 'Owned', '', null, null, '1', '1', null, '0', 0, 0, 't', 't');
  const releases = new ReleaseLedger({ storage, principal, games }), pins = new PublishedGames({ storage, principal });
  let guardFailure = false, calls = 0;
  const make = () => new PublishOperations({ storage, principal, games, operationGuard: (owner, key) => { assert.equal(owner, actor.id); assert.match(key, /^[\w-]{16,128}$/); if (guardFailure) { throw new Error('owned namespace conflict'); } } });
  const ops = make(), input = { key: 'owned-publish-key-01', gameId: G, name: 'Owned' };
  const snapshot = () => ['content_games', 'content_operations', 'content_reservations', 'content_releases', 'published_games'].map(table => sql.exec(`SELECT * FROM ${table} ORDER BY rowid`).toArray());
  const produce = () => {
    calls++;
    const issued = releases.issueInTxn('owned-token', G, '1', 'a'.repeat(64));
    const pin = pins.publishInTxn('owned-token', { gameId: G, name: 'Owned', revision: '1', sourceDigest: 'a'.repeat(64), chapters: [`${G}#c1`], ordinal: issued.ordinal });
    releases.pruneExceptInTxn('owned-token', G, issued.releaseId);
    return { version: 1, gameId: G, releaseId: issued.releaseId, pin };
  };
  return { storage, sql, actor, ops, pins, make, input, snapshot, produce, calls: () => calls, blockNamespace: () => { guardFailure = true; } };
}
function check(fn) { const f = fixture(); try { fn(f); groups++; } finally { f.storage.close(); } }
const code = expected => error => error.code === expected;
const capture = f => f.ops.capture('owned-token', f.input).ticket;
const commit = (f, ticket = capture(f)) => f.ops.commit('owned-token', ticket, f.produce);
check(f => {
  const before = f.snapshot();
  for (const name of ['123456789', '𠀀'.repeat(9), 'é'.repeat(9)]) {
    assert.throws(() => f.ops.capture('owned-token', { ...f.input, name }), code('PUBLISH_NAME'));
    assert.throws(() => f.pins.publish('owned-token', { gameId: G, name, revision: '1', sourceDigest: 'a'.repeat(64), chapters: ['c1'], ordinal: '1.0' }), code('PUBLISH_NAME'));
  }
  assert.deepEqual(f.snapshot(), before);
  for (const name of ['  12345678  ', '𠀀'.repeat(8), 'e\u0301'.repeat(8)]) {
    assert.ok(f.ops.capture('owned-token', { ...f.input, name }).ticket);
    const pin = f.pins.publish('owned-token', { gameId: G, name, revision: '1', sourceDigest: 'a'.repeat(64), chapters: ['c1'], ordinal: '1.0' });
    assert.equal(pin.name, name.trim().normalize('NFC'));
  }
});
check(f => {
  // Seed the former legal wire format, not a new long-name publication.
  const receipt = structuredClone(commit(f)), name = 'Legacy publication';
  receipt.pin.name = name;
  const digest = createHash('sha256').update(JSON.stringify(['publish', G, name])).digest('hex');
  f.sql.exec('UPDATE content_operations SET result_json=?,request_digest=?', JSON.stringify(receipt), digest);
  f.sql.exec('UPDATE content_reservations SET request_digest=?', digest);
  const before = f.snapshot();
  assert.deepEqual(f.ops.query('owned-token', { key: f.input.key, gameId: G }), receipt);
  assert.deepEqual(f.ops.capture('owned-token', { ...f.input, name }).replay, receipt);
  assert.throws(() => f.ops.capture('owned-token', { ...f.input, key: 'new-long-publish-key', name }), code('PUBLISH_NAME'));
  assert.deepEqual(f.snapshot(), before);
});
check(f => {
  const before = f.snapshot(), a = capture(f), b = capture(f);
  assert.equal(f.ops.inspect('owned-token', a), null);
  assert.equal(f.ops.inspect('owned-token', b), null);
  assert.deepEqual(f.snapshot(), before, 'capture and inspect perform no persistent reservation or release write');
  const first = commit(f, a), saved = f.snapshot();
  assert.equal(first.pin.ordinal, '1.0'); assert.equal(f.calls(), 1);
  assert.deepEqual(f.ops.inspect('owned-token', a), first);
  assert.deepEqual(f.ops.inspect('owned-token', b), first);
  assert.deepEqual(commit(f, b), first); assert.equal(f.calls(), 1); assert.deepEqual(f.snapshot(), saved);
  assert.deepEqual(f.ops.capture('owned-token', f.input), { ticket: null, replay: first });
  const rebuilt = f.make(); assert.deepEqual(rebuilt.capture('owned-token', f.input).replay, first);
  assert.throws(() => rebuilt.inspect('owned-token', a), code('PUBLISH_OPERATION_TICKET'));
  assert.throws(() => f.ops.inspect('owned-token', {}), code('PUBLISH_OPERATION_TICKET'));
  assert.throws(() => rebuilt.commit('owned-token', a, f.produce), code('PUBLISH_OPERATION_TICKET'));
});
check(f => {
  const first = commit(f), nextInput = { ...f.input, key: 'owned-publish-key-02' };
  const second = f.ops.commit('owned-token', f.ops.capture('owned-token', nextInput).ticket, f.produce);
  assert.equal(second.pin.ordinal, '1.1'); assert.notEqual(second.releaseId, first.releaseId);
  assert.equal(f.sql.exec('SELECT * FROM content_releases').toArray().length, 1);
  f.sql.exec("UPDATE content_games SET draft_revision='2',row_revision='3'");
  assert.deepEqual(f.ops.capture('owned-token', f.input).replay, first, 'replay survives old release pruning and later draft changes');
});
for (const table of ['content_reservations', 'content_releases', 'published_games', 'content_operations']) check(f => {
  const ticket = capture(f), before = f.snapshot();
  f.sql.exec(`CREATE TEMP TRIGGER owned_abort BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT,'owned transaction fault'); END`);
  try { assert.throws(() => commit(f, ticket), /owned transaction fault/); } finally { f.sql.exec('DROP TRIGGER owned_abort'); }
  assert.deepEqual(f.snapshot(), before, table);
  assert.equal(commit(f, ticket).pin.ordinal, '1.0', 'rollback consumes neither key nor ordinal');
});
for (const statement of ["UPDATE content_games SET draft_revision='2'", "UPDATE content_games SET row_revision='2'", `UPDATE content_games SET current_release_id='${OTHER}'`]) check(f => {
  const ticket = capture(f); f.sql.exec(statement); const before = f.snapshot();
  assert.throws(() => f.ops.inspect('owned-token', ticket), code('PUBLISH_STALE'));
  assert.throws(() => commit(f, ticket), code('PUBLISH_STALE')); assert.equal(f.calls(), 0); assert.deepEqual(f.snapshot(), before);
});
check(f => { const ticket = capture(f); f.actor.epoch++; assert.throws(() => f.ops.inspect('owned-token', ticket), code('SESSION_INVALID')); assert.throws(() => commit(f, ticket), code('SESSION_INVALID')); assert.equal(f.calls(), 0); });
check(f => { commit(f); f.actor.epoch++; assert.throws(() => f.ops.capture('owned-token', f.input), code('OPERATION_REVOKED')); });
check(f => { const ticket = capture(f); f.actor.must_change = 1; assert.throws(() => f.ops.inspect('owned-token', ticket), code('PASSWORD_CHANGE_REQUIRED')); assert.throws(() => commit(f, ticket), code('PASSWORD_CHANGE_REQUIRED')); });
check(f => { const ticket = capture(f); f.actor.id = 'other'; assert.throws(() => commit(f, ticket), code('SESSION_INVALID')); assert.throws(() => f.ops.capture('owned-token', f.input), code('GAME_NOT_FOUND')); });
check(f => { const ticket = capture(f); f.blockNamespace(); assert.throws(() => f.ops.inspect('owned-token', ticket), /owned namespace conflict/); assert.throws(() => commit(f, ticket), /owned namespace conflict/); assert.equal(f.calls(), 0); });
check(f => {
  const ticket = capture(f);
  f.sql.exec('INSERT INTO content_deletion_fences VALUES(?,?,?,?,?,?)', G, 'owner', 'owner', '1', '2', '2030-01-01T00:00:00.000Z');
  assert.throws(() => f.ops.inspect('owned-token', ticket), code('GAME_DELETING'));
  assert.throws(() => commit(f, ticket), code('GAME_DELETING')); assert.equal(f.calls(), 0);
});
check(f => { commit(f); for (const name of ['Other', ' Owned ']) assert.throws(() => f.ops.capture('owned-token', { ...f.input, name }), code('IDEMPOTENCY_CONFLICT')); });
check(f => {
  const ticket = capture(f), before = f.snapshot();
  assert.throws(() => f.ops.commit('owned-token', {}, f.produce), code('PUBLISH_OPERATION_TICKET'));
  assert.throws(() => f.ops.commit('owned-token', ticket, async () => f.produce()), code('SYNC_TRANSACTION_REQUIRED'));
  assert.equal(f.calls(), 0); assert.deepEqual(f.snapshot(), before);
  assert.throws(() => f.ops.commit('owned-token', ticket, () => { f.produce(); return { then() {} }; }), code('SYNC_TRANSACTION_RESULT'));
  assert.deepEqual(f.snapshot(), before);
});
check(f => {
  const before = f.snapshot();
  assert.throws(() => f.ops.commit('owned-token', capture(f), () => ({ ...f.produce(), releaseId: OTHER })), code('PUBLISH_OPERATION_RESULT'));
  assert.deepEqual(f.snapshot(), before);
});
for (const statement of ["DELETE FROM content_reservations", "DELETE FROM content_operations", "UPDATE content_operations SET result_json='{}'", "UPDATE content_operations SET created_at='wrong'"]) check(f => {
  commit(f); f.sql.exec(statement); const before = f.snapshot();
  assert.throws(() => f.ops.capture('owned-token', f.input), code('PUBLISH_RECEIPT_CORRUPT')); assert.deepEqual(f.snapshot(), before);
});
check(f => { commit(f); f.sql.exec("UPDATE content_reservations SET method='save'"); assert.throws(() => f.ops.capture('owned-token', f.input), code('IDEMPOTENCY_CONFLICT')); });
check(f => {
  for (const [override, error] of [[{ key: 'short' }, 'IDEMPOTENCY_KEY'], [{ gameId: 'wolong-builtin' }, 'BUILTIN_PROTECTED'], [{ gameId: 'bad' }, 'PUBLISH_GAME_ID'], [{ name: '' }, 'PUBLISH_NAME'], [{ name: '  ' }, 'PUBLISH_NAME'], [{ name: 3 }, 'PUBLISH_NAME']]) {
    assert.throws(() => f.ops.capture('owned-token', { ...f.input, ...override }), code(error));
  }
  assert.equal(f.calls(), 0);
});
check(f => {
  const ticket = capture(f), first = commit(f, ticket);
  f.sql.exec("UPDATE content_games SET draft_revision='2',row_revision='3'");
  const before = f.snapshot();
  assert.deepEqual(f.ops.inspect('owned-token', ticket), first, 'old result wins before stale checks');
  assert.deepEqual(f.snapshot(), before);
  f.actor.must_change = 1;
  assert.throws(() => f.ops.inspect('owned-token', ticket), code('PASSWORD_CHANGE_REQUIRED'), 'replay still requires current authority');
});
const query = f => f.ops.query('owned-token', { gameId: G, key: f.input.key });
check(f => {
  assert.throws(() => query(f), code('PUBLISH_OPERATION_NOT_FOUND'));
  const first = commit(f);
  f.ops.commit('owned-token', f.ops.capture('owned-token', { ...f.input, key: 'owned-publish-key-02' }).ticket, f.produce);
  f.sql.exec("UPDATE content_games SET draft_revision='2',row_revision='3'");
  const before = f.snapshot();
  assert.deepEqual(query(f), first);
  assert.deepEqual(f.make().query('owned-token', { gameId: G, key: f.input.key }), first);
  assert.deepEqual(f.snapshot(), before);
  assert.throws(() => f.ops.query('owned-token', { gameId: OTHER, key: f.input.key }), code('GAME_NOT_FOUND'));
  assert.throws(() => f.ops.query('owned-token', { gameId: G, key: 'short' }), code('IDEMPOTENCY_KEY'));
});
check(f => { commit(f); f.actor.epoch++; assert.throws(() => query(f), code('OPERATION_REVOKED')); });
check(f => { commit(f); f.actor.must_change = 1; assert.throws(() => query(f), code('PASSWORD_CHANGE_REQUIRED')); });
check(f => { commit(f); f.actor.id = 'other'; assert.throws(() => query(f), code('GAME_NOT_FOUND')); });
check(f => { commit(f); f.blockNamespace(); assert.throws(() => query(f), /owned namespace conflict/); });
check(f => {
  commit(f); f.sql.exec('INSERT INTO content_deletion_fences VALUES(?,?,?,?,?,?)', G, 'owner', 'owner', '1', '2', '2030-01-01T00:00:00.000Z');
  assert.throws(() => query(f), code('GAME_DELETING'));
});
for (const statement of ["DELETE FROM content_reservations", "DELETE FROM content_operations", "UPDATE content_operations SET result_json='{'", "UPDATE content_operations SET request_digest='bad'", "UPDATE content_operations SET created_at='bad'"]) check(f => {
  commit(f); f.sql.exec(statement); const before = f.snapshot();
  assert.throws(() => query(f), code('PUBLISH_RECEIPT_CORRUPT')); assert.deepEqual(f.snapshot(), before);
});
check(f => {
  const receipt = commit(f);
  for (const name of ['', 3, ' Owned ']) {
    const damaged = structuredClone(receipt); damaged.pin.name = name;
    f.sql.exec('UPDATE content_operations SET result_json=?', JSON.stringify(damaged));
    assert.throws(() => query(f), code('PUBLISH_RECEIPT_CORRUPT'));
  }
});
process.stdout.write(JSON.stringify({ groups, scope: 'real SQLite release/pin/permanent result transactions; principal and namespace seams, not HTTP/R2/compiler proof' }) + '\n');
