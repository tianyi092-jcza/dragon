// Actual SQLite + metadata/release/pin transactions. Snapshot/principal ports
// are explicit fixtures; not HTTP, compiler, R2 or full publication evidence.
import assert from 'node:assert/strict';
import { openStorage } from '../vps/sqlite-port.mjs';
import { GameMetadataStore } from '../server/metadata.js';
import { ReleaseLedger } from '../server/releases.js';
import { PublishedGames } from '../server/published.js';
import { AdminFullCopy } from '../server/admincopy.js';
import { FIXED_COPY_PROFILE, FIXED_TEMPLATE_PROFILE } from '../server/copyprofile.js';
const storage = openStorage(':memory:'), sql = storage.sql;
const actors = { a: { id: 'a', role: 'author', epoch: 1, must_change: 0 }, b: { id: 'b', role: 'author', epoch: 1, must_change: 0 } };
const principal = token => actors[token];
const digest = 'a'.repeat(64);
let serial = 0, checks = 0;
try {
  sql.exec('CREATE TABLE users(id TEXT PRIMARY KEY)'); sql.exec("INSERT INTO users VALUES('a'),('b')");
  const games = new GameMetadataStore({ storage, principal, verifySnapshot: async ({ gameId }) => ({ rootDigest: digest, sourceDigest: digest, dependencyDigest: digest, rootKey: `private/${gameId}/${digest}` }) });
  const releases = new ReleaseLedger({ storage, principal, games }), pins = new PublishedGames({ storage, principal });
  const copies = new AdminFullCopy({ storage, principal, games, roles: ['author'], profileRevision: FIXED_TEMPLATE_PROFILE,
    catalog: { status: () => ({ definitionDigest: digest, rootDigest: digest }), definition: () => ({ profileRevision: FIXED_COPY_PROFILE, definitionDigest: digest }), loadFull: () => { throw new Error('reservation must not load source'); } },
    blobs: { read: () => { throw new Error('reservation must not read blobs'); }, putImmutable: () => { throw new Error('reservation must not write blobs'); } },
  });
  const reserve = (token, name, key = 'owned-name-reserve-' + ++serial) => copies.reserve(token, key, { registryId: 'owned-registry', name, introduction: '' });
  const snapshot = () => ['content_games', 'content_names', 'content_snapshots', 'content_operations', 'content_reservations', 'content_releases', 'published_games', 'copy_requests', 'copy_origins', 'copy_objects'].map(table => sql.exec(`SELECT * FROM ${table} ORDER BY rowid`).toArray());
  const row = id => sql.exec('SELECT * FROM content_games WHERE game_id=?', id).toArray()[0];
  const names = id => sql.exec('SELECT name FROM content_names WHERE game_id=? ORDER BY name', id).toArray().map(value => value.name);
  async function create(token, name) {
    const allocation = games.allocateGameId(token), gameId = allocation.gameId;
    const prepared = await games.prepareSnapshot(token, { gameId, allocation, draftRevision: '1', metadata: { name, introduction: '原簡介' }, source: {} });
    return games.transaction(token, { key: 'owned-name-create-' + ++serial, method: 'create', target: 'new', digest }, tx => tx.create(allocation, prepared)).gameId;
  }
  async function save(token, gameId, name, introduction = '新簡介') {
    const expected = row(gameId).draft_revision;
    const prepared = await games.prepareSnapshot(token, { gameId, draftRevision: String(BigInt(expected) + 1n), metadata: { name, introduction }, source: {} });
    return games.transaction(token, { key: 'owned-name-save-' + ++serial, method: 'save', target: gameId, digest }, tx => tx.compareAndSwap(gameId, expected, prepared));
  }
  function publish(token, gameId, name, after = () => {}) {
    const draftRevision = row(gameId).draft_revision;
    const candidate = releases.prepare(token, gameId, draftRevision, digest);
    return storage.transactionSync(() => {
      const release = releases.issuePreparedInTxn(token, candidate.ticket);
      const pin = pins.publishInTxn(token, { gameId, name, revision: draftRevision, sourceDigest: digest, chapters: ['chapter'], ordinal: release.ordinal });
      games.setFormalMetadataInTxn(token, { gameId, draftRevision, name: pin.name });
      after(); return pin;
    });
  }
  const a = await create('a', 'Alpha'), b = await create('a', 'Beta');
  const beforePublish = row(a), first = publish('a', a, 'Released');
  assert.deepEqual(names(a), ['Alpha', 'Released']);
  assert.equal(row(a).formal_name, 'Released'); assert.equal(row(a).formal_introduction, '原簡介');
  assert.equal(row(a).modified_at, beforePublish.modified_at); assert.equal(row(a).draft_revision, '1'); checks++;
  await save('a', a, 'Alpha2');
  assert.deepEqual(names(a), ['Alpha2', 'Released']); assert.equal(row(a).formal_introduction, '原簡介'); checks++;
  let before = snapshot();
  await assert.rejects(create('a', 'Released'), error => error.code === 'GAME_NAME_OCCUPIED');
  assert.deepEqual(snapshot(), before); checks++;
  const cross = await create('b', 'Released');
  publish('b', cross, 'Released'); assert.deepEqual(names(cross), ['Released']); checks++;
  before = snapshot();
  assert.throws(() => publish('a', b, 'Released'), error => error.code === 'GAME_NAME_OCCUPIED');
  assert.deepEqual(snapshot(), before, 'conflict rolls back ordinal, pointer, pin and names'); checks++;
  assert.equal(publish('a', b, 'BetaLive').ordinal, '1.0');
  before = snapshot();
  assert.throws(() => publish('a', b, 'NewTitle', () => { throw new Error('owned late failure'); }), /owned late failure/);
  assert.deepEqual(snapshot(), before, 'later failure restores old formal occupancy and release state'); checks++;
  assert.equal(publish('a', a, 'Release2').ordinal, '1.1');
  assert.deepEqual(names(a), ['Alpha2', 'Release2']); assert.equal(row(a).formal_introduction, '新簡介');
  assert.equal(publish('a', b, 'Released').ordinal, '1.1'); assert.equal(first.name, 'Released'); checks++;
  await save('a', a, 'Release2'); publish('a', a, 'Release3');
  assert.deepEqual(names(a), ['Release2', 'Release3'], 'old formal remains occupied when it is also the draft name'); checks++;
  before = snapshot();
  for (const input of [{ gameId: a, draftRevision: '1', name: 'Valid' }, { gameId: a, draftRevision: row(a).draft_revision, name: '123456789' }]) {
    assert.throws(() => storage.transactionSync(() => games.setFormalMetadataInTxn('a', input)), error => ['DRAFT_CHANGED', 'GAME_METADATA'].includes(error.code));
    assert.deepEqual(snapshot(), before);
  }
  assert.throws(() => storage.transactionSync(() => games.setFormalMetadataInTxn('b', { gameId: a, draftRevision: row(a).draft_revision, name: 'Valid' })), error => error.code === 'GAME_NOT_FOUND');
  assert.deepEqual(snapshot(), before); checks++;
  publish('a', a, ' e\u0301 '); assert.equal(row(a).formal_name, 'é');
  assert.deepEqual(names(a), ['Release2', 'é']); checks++;
  // Pre-fix publications have a current pin but no formal metadata/name row.
  publish('a', b, 'OldLive');
  sql.exec('UPDATE content_games SET formal_name=NULL,formal_introduction=NULL WHERE game_id=?', b);
  sql.exec('DELETE FROM content_names WHERE game_id=? AND name=?', b, 'OldLive');
  const legacyPin = sql.exec('SELECT pin_json FROM published_games WHERE game_id=?', b).toArray()[0].pin_json;
  before = snapshot();
  assert.throws(() => reserve('a', 'OldLive'), error => error.code === 'GAME_NAME_OCCUPIED');
  assert.deepEqual(snapshot(), before, 'creation reservation cannot claim a legacy formal name or leave partial rows'); checks++;
  await assert.rejects(create('a', 'OldLive'), error => error.code === 'GAME_NAME_OCCUPIED');
  await assert.rejects(save('a', a, 'OldLive'), error => error.code === 'GAME_NAME_OCCUPIED');
  assert.throws(() => publish('a', a, 'OldLive'), error => error.code === 'GAME_NAME_OCCUPIED');
  assert.deepEqual(snapshot(), before); checks++;
  const otherLegacyName = await create('b', 'OldLive');
  assert.equal(row(otherLegacyName).draft_name, 'OldLive'); checks++;
  await save('a', b, 'Beta2');
  assert.deepEqual(names(b), ['Beta2', 'OldLive']);
  assert.equal(row(b).formal_name, null, 'normal draft edits do not invent old formal metadata');
  assert.equal(sql.exec('SELECT pin_json FROM published_games WHERE game_id=?', b).toArray()[0].pin_json, legacyPin); checks++;
  // Corrupt/missing authority must not be treated as an available name.
  for (const damage of ['missing', 'json', 'owner', 'release']) {
    if (damage === 'missing') sql.exec('DELETE FROM published_games WHERE game_id=?', b);
    else if (damage === 'owner') sql.exec('UPDATE published_games SET owner_id=? WHERE game_id=?', 'b', b);
    else {
      let pin;
      try { pin = JSON.parse(legacyPin); } catch (cause) { throw new Error('invalid owned legacy pin', { cause }); }
      if (damage === 'release') pin.ordinal = '1.999';
      sql.exec('UPDATE published_games SET pin_json=? WHERE game_id=?', damage === 'json' ? '{' : JSON.stringify(pin), b);
    }
    const damaged = snapshot();
    assert.throws(() => reserve('a', 'Unused'), error => error.code === 'GAME_NAME_STATE_UNKNOWN');
    await assert.rejects(create('a', 'Unused'), error => error.code === 'GAME_NAME_STATE_UNKNOWN');
    assert.deepEqual(snapshot(), damaged);
    sql.exec('INSERT OR REPLACE INTO published_games VALUES(?,?,?,?)', b, 'a', legacyPin, 'owned-legacy-time');
  }
  checks++;
  publish('a', b, 'NewLive');
  assert.deepEqual(names(b), ['Beta2', 'NewLive']);
  assert.equal(row(b).formal_name, 'NewLive');
  assert.equal(row(await create('a', 'OldLive')).draft_name, 'OldLive'); checks++;
  const legacyLong = await create('a', 'Legacy');
  const longPin = { ...publish('a', legacyLong, 'Short'), name: 'Legacy published name' };
  const longBytes = JSON.stringify(longPin);
  sql.exec('UPDATE published_games SET pin_json=? WHERE game_id=?', longBytes, legacyLong);
  sql.exec('UPDATE content_games SET formal_name=NULL,formal_introduction=NULL WHERE game_id=?', legacyLong);
  sql.exec('DELETE FROM content_names WHERE game_id=? AND name=?', legacyLong, 'Short');
  await save('a', legacyLong, 'Legacy2');
  assert.deepEqual(names(legacyLong), ['Legacy published name', 'Legacy2']);
  assert.equal(row(legacyLong).formal_name, null);
  assert.equal(sql.exec('SELECT pin_json FROM published_games WHERE game_id=?', legacyLong).toArray()[0].pin_json, longBytes); checks++;
  const reservationKey = 'owned-name-reserve-replay', reservation = reserve('b', ' u\u0308 ', reservationKey);
  assert.deepEqual(reserve('b', 'ü', reservationKey), reservation);
  before = snapshot();
  assert.throws(() => reserve('b', 'ü'), error => error.code === 'GAME_NAME_OCCUPIED');
  assert.throws(() => reserve('b', 'Other', reservationKey), error => error.code === 'IDEMPOTENCY_CONFLICT');
  assert.deepEqual(snapshot(), before); checks++;
  assert.equal(reserve('a', 'ü').state, 'pending'); checks++;
  process.stdout.write(JSON.stringify({ checks, scope: 'SQLite formal/draft name occupancy and publication rollback; explicit snapshot/principal fixtures' }) + '\n');
} finally { storage.close(); }
