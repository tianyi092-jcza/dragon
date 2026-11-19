// Real in-memory SQLite row-link checks; not source-byte or deletion-authority proof.
import assert from 'node:assert/strict';
import test from 'node:test';
import { openStorage } from '../vps/sqlite-port.mjs';
import { inspectCopyOriginLinks } from '../server/deletioncopyorigins.js';

const gameId = '10000000-0000-4000-8000-000000000001';
const receipt = { gameId, draftRevision: '1', sourceDigest: 'f'.repeat(64), baselineDigest: 'e'.repeat(64) };
const chapterConversion = {
  version: 1,
  labels: [{ chapterId: gameId + '#chapter-1', sourceNumber: null, sourceName: '舊章', number: '一', name: '新章' }],
  capitals: [{ chapterId: gameId + '#chapter-1', cityIdx: 0, cityName: '洛陽', before: null, after: 0 }],
};
function fixture(t) {
  const storage = openStorage(':memory:'); t.after(() => storage.close());
  const sql = storage.sql;
  sql.exec('CREATE TABLE copy_requests(game_id TEXT,actor TEXT,registry_id TEXT,definition_digest TEXT,catalog_root TEXT,profile_revision TEXT,state TEXT,result_json TEXT)');
  sql.exec('CREATE TABLE copy_origins(game_id TEXT,registry_id TEXT,definition_digest TEXT,catalog_root TEXT,profile_revision TEXT,baseline_root TEXT,baseline_digest TEXT,source_digest TEXT,dependency_digest TEXT,baseline_length INTEGER)');
  sql.exec('CREATE TABLE content_games(game_id TEXT,owner_id TEXT)');
  sql.exec('CREATE TABLE installed_sources(registry_id TEXT,definition_digest TEXT,root_digest TEXT)');
  sql.exec('CREATE TABLE content_snapshots(game_id TEXT,revision TEXT,source_digest TEXT,dependency_digest TEXT)');
  sql.exec('CREATE TABLE copy_objects(game_id TEXT,sha256 TEXT,byte_length INTEGER,state TEXT)');
  sql.exec('INSERT INTO copy_requests VALUES(?,?,?,?,?,?,?,?)', gameId, 'author', 'registry', 'a'.repeat(64), 'b'.repeat(64), 'profile', 'committed', JSON.stringify(receipt));
  sql.exec('INSERT INTO copy_origins VALUES(?,?,?,?,?,?,?,?,?,?)', gameId, 'registry', 'a'.repeat(64), 'b'.repeat(64), 'profile', 'd'.repeat(64), receipt.baselineDigest, receipt.sourceDigest, '1'.repeat(64), 1000);
  sql.exec('INSERT INTO content_games VALUES(?,?)', gameId, 'author');
  sql.exec('INSERT INTO installed_sources VALUES(?,?,?)', 'registry', 'a'.repeat(64), 'b'.repeat(64));
  sql.exec('INSERT INTO content_snapshots VALUES(?,?,?,?)', gameId, '1', receipt.sourceDigest, '1'.repeat(64));
  sql.exec('INSERT INTO copy_objects VALUES(?,?,?,?)', gameId, 'd'.repeat(64), 1000, 'committed');
  return sql;
}

test('copy SQL links accept old and conversion receipts without writing rows', t => {
  const sql = fixture(t);
  for (const value of [receipt, { ...receipt, chapterConversion }]) {
    sql.exec('UPDATE copy_requests SET result_json=?', JSON.stringify(value));
    const before = sql.exec('SELECT * FROM copy_requests').toArray();
    assert.deepEqual(inspectCopyOriginLinks(sql, gameId), { copyOriginLinksVerified: true, copyReceiptLinksVerified: true });
    assert.deepEqual(sql.exec('SELECT * FROM copy_requests').toArray(), before);
  }
});

test('conversion metadata cannot weaken the four identity fields or admit unknown receipt fields', t => {
  const sql = fixture(t);
  for (const patch of [
    { gameId: '20000000-0000-4000-8000-000000000002' }, { draftRevision: '2' },
    { sourceDigest: '0'.repeat(64) }, { baselineDigest: '0'.repeat(64) }, { unexpected: true },
    { chapterConversion: null }, { chapterConversion: { ...chapterConversion, version: 2 } },
    { chapterConversion: { ...chapterConversion, labels: [null] } },
    { chapterConversion: { ...chapterConversion, capitals: [{ ...chapterConversion.capitals[0], after: '0' }] } },
  ]) {
    sql.exec('UPDATE copy_requests SET result_json=?', JSON.stringify({ ...receipt, chapterConversion, ...patch }));
    assert.throws(() => inspectCopyOriginLinks(sql, gameId), error => error.status === 503 && error.code === 'DELETE_COPY_RECEIPT_ROWS');
  }
});

test('conversion receipts keep the existing byte budget and SQL provenance checks', t => {
  const sql = fixture(t);
  sql.exec('UPDATE copy_requests SET result_json=?', JSON.stringify({ ...receipt, chapterConversion: { ...chapterConversion,
    labels: [{ ...chapterConversion.labels[0], sourceName: 'x'.repeat(8192) }] } }));
  assert.throws(() => inspectCopyOriginLinks(sql, gameId), error => error.status === 503 && error.code === 'DELETE_COPY_ORIGIN_BUDGET');
  sql.exec('UPDATE copy_requests SET result_json=?,catalog_root=?', JSON.stringify({ ...receipt, chapterConversion }), '0'.repeat(64));
  assert.throws(() => inspectCopyOriginLinks(sql, gameId), error => error.status === 503 && error.code === 'DELETE_COPY_ORIGIN_ROWS');
});
