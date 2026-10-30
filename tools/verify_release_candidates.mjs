// Real owned SQLite; principal and game creation are explicit test seams.
// Candidate identities are not compilation, preupload or remote visibility proof.
import assert from 'node:assert/strict';
import { openStorage } from '../vps/sqlite-port.mjs';
import { GameMetadataStore } from '../server/metadata.js';
import { ReleaseLedger } from '../server/releases.js';
import { fail } from '../server/security.js';
const G = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', D = 'b'.repeat(64);
let passed = 0;
const rejects = (fn, code) => assert.throws(fn, error => error?.code === code);
function fixture() {
  const storage = openStorage(':memory:');
  const sql = storage.sql;
  sql.exec('CREATE TABLE users (id TEXT PRIMARY KEY, account TEXT UNIQUE NOT NULL, role TEXT NOT NULL, password_hash TEXT NOT NULL, disabled INTEGER NOT NULL, must_change INTEGER NOT NULL, epoch INTEGER NOT NULL, version INTEGER NOT NULL)');
  sql.exec('INSERT INTO users VALUES(?,?,?,?,?,?,?,?)', 'u1', 'author_c', 'author', '{}', 0, 0, 1, 1);
  sql.exec('INSERT INTO users VALUES(?,?,?,?,?,?,?,?)', 'u2', 'other_c', 'author', '{}', 0, 0, 1, 1);
  const actor = { id: 'u1', role: 'author', epoch: 1, must_change: 0 };
  let active = true;
  const principal = token => { if (!active || token !== 'owned') fail(401, 'SESSION_INVALID'); return { ...actor }; };
  const games = new GameMetadataStore({ storage, principal, recoverAllocation: () => fail(503, 'COPY_NOT_CONFIGURED') });
  sql.exec('INSERT INTO content_games VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)', G, 'u1', 'Candidate', '', null, null, '5', '3', null, '0', 0, 0, 't', 't');
  const ledger = new ReleaseLedger({ storage, principal, games });
  const prepare = () => ledger.prepare('owned', G, '5', D);
  const issue = candidate => storage.transactionSync(() => ledger.issuePreparedInTxn('owned', candidate.ticket));
  const state = () => JSON.stringify({ games: sql.exec('SELECT * FROM content_games').toArray(), releases: sql.exec('SELECT * FROM content_releases').toArray() });
  return { storage, sql, actor, principal, games, ledger, prepare, issue, state, disable: () => { active = false; } };
}
function group(name, fn) {
  const f = fixture();
  try { fn(f); passed++; console.log(`ok ${name}`); }
  finally { f.storage.close(); }
}
for (const mode of ['prepared', 'legacy']) group(`${mode} release records event time without changing content modification time`, f => {
  const contentTime = '2001-02-03T04:05:06.007Z';
  f.sql.exec('UPDATE content_games SET created_at=?,modified_at=? WHERE game_id=?', contentTime, contentTime, G);
  const issued = mode === 'prepared' ? f.issue(f.prepare()) : f.ledger.issue('owned', G, '5', D);
  const summary = f.games.listOwn('owned')[0];
  assert.equal(summary.createdAt, contentTime); assert.equal(summary.modifiedAt, contentTime);
  assert.equal(new Date(issued.createdAt).toISOString(), issued.createdAt);
  assert.equal(f.ledger.current('owned', G).createdAt, issued.createdAt);
  assert.notEqual(issued.createdAt, contentTime);
});
group('legacy listing helper preserves content timestamps through list, unlist and rollback', f => {
  const before = f.games.listOwn('owned')[0];
  const listed = f.storage.transactionSync(() => f.games.setListedInTxn('owned', G, true, before.rowRevision));
  assert.equal(listed.changed, true); assert.equal(listed.summary.modifiedAt, before.modifiedAt);
  const afterList = f.state();
  assert.throws(() => f.storage.transactionSync(() => { f.games.setListedInTxn('owned', G, false, listed.summary.rowRevision); throw new Error('late listing failure'); }), /late listing failure/);
  assert.equal(f.state(), afterList);
  const unlisted = f.storage.transactionSync(() => f.games.setListedInTxn('owned', G, false, listed.summary.rowRevision));
  assert.equal(unlisted.summary.modifiedAt, before.modifiedAt); assert.equal(unlisted.summary.createdAt, before.createdAt);
});
group('preparation writes nothing and isolates same-ordinal candidates', f => {
  const before = f.state(), a = f.prepare(), b = f.prepare();
  assert.equal(f.state(), before); assert.equal(a.identity.ordinal, '1.0');
  assert.equal(b.identity.ordinal, a.identity.ordinal); assert.notEqual(a.identity.releaseId, b.identity.releaseId);
  assert.deepEqual(Object.keys(a.ticket), []); assert.ok(Object.isFrozen(a.ticket)); assert.ok(Object.isFrozen(a.identity));
  assert.equal(a.identity.gameId, G); assert.equal(a.identity.draftRevision, '5'); assert.equal(a.identity.sourceDigest, D);
  assert.equal(a.identity.createdAt, undefined);
});
group('forged and cross-instance capabilities refused', f => {
  const a = f.prepare(), other = new ReleaseLedger({ storage: f.storage, principal: f.principal, games: f.games });
  rejects(() => f.ledger.issuePreparedInTxn('owned', a.identity), 'RELEASE_PREPARED');
  rejects(() => other.issuePreparedInTxn('owned', a.ticket), 'RELEASE_PREPARED');
  rejects(() => f.ledger.issuePreparedInTxn('owned', null), 'RELEASE_PREPARED');
});
group('candidate identity cannot be replaced by caller', f => {
  const a = f.prepare(); assert.throws(() => { a.identity.releaseId = G; }, TypeError);
  assert.throws(() => { a.ticket = {}; }, TypeError);
  assert.equal(f.issue(a).releaseId, a.identity.releaseId);
});
group('commit uses exact prepared identity, stale peer and reused ticket fail', f => {
  const a = f.prepare(), b = f.prepare(), issued = f.issue(a);
  assert.deepEqual({ ...issued, createdAt: undefined }, { ...a.identity, createdAt: undefined });
  assert.equal(new Date(issued.createdAt).toISOString(), issued.createdAt);
  assert.equal(f.ledger.current('owned', G).releaseId, a.identity.releaseId);
  rejects(() => f.issue(a), 'RELEASE_CONFLICT'); rejects(() => f.issue(b), 'RELEASE_CONFLICT');
  const next = f.prepare(); assert.equal(next.identity.ordinal, '1.1'); assert.notEqual(next.identity.releaseId, a.identity.releaseId);
});
group('outer rollback preserves the same staged candidate for retry', f => {
  const a = f.prepare(), before = f.state();
  assert.throws(() => f.storage.transactionSync(() => {
    f.ledger.issuePreparedInTxn('owned', a.ticket);
    f.sql.exec("UPDATE content_games SET formal_name='changed' WHERE game_id=?", G);
    throw Error('owned late fault');
  }), /owned late fault/);
  assert.equal(f.state(), before); assert.equal(f.issue(a).releaseId, a.identity.releaseId);
});
group('release insert fault rolls back counter and retry keeps identity', f => {
  const a = f.prepare(), before = f.state();
  f.sql.exec("CREATE TRIGGER owned_insert_fault BEFORE INSERT ON content_releases BEGIN SELECT RAISE(ABORT,'owned insert'); END");
  assert.throws(() => f.issue(a), /owned insert/); assert.equal(f.state(), before);
  f.sql.exec('DROP TRIGGER owned_insert_fault'); assert.equal(f.issue(a).releaseId, a.identity.releaseId);
});
group('ignored compare-and-swap cannot insert a release', f => {
  const a = f.prepare(), before = f.state();
  f.sql.exec('CREATE TRIGGER owned_update_ignore BEFORE UPDATE ON content_games BEGIN SELECT RAISE(IGNORE); END');
  rejects(() => f.issue(a), 'RELEASE_CONFLICT'); assert.equal(f.state(), before);
  f.sql.exec('DROP TRIGGER owned_update_ignore'); assert.equal(f.issue(a).releaseId, a.identity.releaseId);
});
for (const [field, value] of [['draft_revision', '6'], ['row_revision', '4'], ['current_release_id', 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'], ['next_ordinal', '1.0']]) {
  group(`captured ${field} change invalidates candidate`, f => {
    const a = f.prepare(); f.sql.exec(`UPDATE content_games SET ${field}=? WHERE game_id=?`, value, G);
    const before = f.state(); rejects(() => f.issue(a), 'RELEASE_CONFLICT'); assert.equal(f.state(), before);
  });
}
group('ownership change is not publication authority', f => {
  const a = f.prepare(); f.sql.exec('UPDATE content_games SET owner_id=? WHERE game_id=?', 'u2', G);
  rejects(() => f.issue(a), 'GAME_NOT_FOUND');
});
group('epoch change invalidates capability', f => {
  const a = f.prepare(); f.actor.epoch++; rejects(() => f.issue(a), 'SESSION_INVALID');
});
group('password and session gates rechecked', f => {
  const a = f.prepare(); f.actor.must_change = 1;
  rejects(f.prepare, 'PASSWORD_CHANGE_REQUIRED'); rejects(() => f.issue(a), 'PASSWORD_CHANGE_REQUIRED');
  f.actor.must_change = 0; f.disable(); rejects(() => f.issue(a), 'SESSION_INVALID');
});
group('deletion fence checked before capture and commit', f => {
  const a = f.prepare();
  f.sql.exec('INSERT INTO content_deletion_fences VALUES(?,?,?,?,?,?)', G, 'u1', 'u1', '3', '4', new Date().toISOString());
  rejects(f.prepare, 'GAME_DELETING'); rejects(() => f.issue(a), 'GAME_DELETING');
});
group('invalid identities and stale input draft refused without writes', f => {
  const before = f.state();
  rejects(() => f.ledger.prepare('owned', 'wolong-builtin', '5', D), 'BUILTIN_PROTECTED');
  rejects(() => f.ledger.prepare('owned', G, '6', D), 'RELEASE_CONFLICT');
  for (const revision of ['0', '01', '1'.repeat(32), null]) rejects(() => f.ledger.prepare('owned', G, revision, D), 'RELEASE_REVISION');
  rejects(() => f.ledger.prepare('owned', G, '5', 'bad'), 'RELEASE_DIGEST');
  assert.equal(f.state(), before);
});
for (const [field, value] of [['draft_revision', '01'], ['row_revision', '0'], ['next_ordinal', 'garbage'], ['current_release_id', 'not-an-id']]) {
  group(`corrupt ${field} fails closed`, f => {
    f.sql.exec(`UPDATE content_games SET ${field}=? WHERE game_id=?`, value, G);
    rejects(f.prepare, 'RELEASE_STATE_CORRUPT');
  });
}
group('ordinal nine-to-ten and bound overflow', f => {
  f.sql.exec("UPDATE content_games SET next_ordinal='1.9' WHERE game_id=?", G);
  assert.equal(f.issue(f.prepare()).ordinal, '1.10');
  f.sql.exec('UPDATE content_games SET next_ordinal=? WHERE game_id=?', `1.${'9'.repeat(31)}`, G);
  const before = f.state(); rejects(f.prepare, 'RELEASE_STATE_CORRUPT'); assert.equal(f.state(), before);
});
console.log(`passed ${passed} release-candidate groups (owned SQLite; no R2/HTTP/compiler proof)`);
