// B-1: city-move intents live outside the canonical game object; any
// pending intent blocks draft save/publish until reverted. Pure derivation
// (moveCityIntent/brokenRoads) + gate integration on VPS ports. Usage:
// node tools/verify_vps_topology_intent.mjs
import { mkdtempSync } from 'node:fs';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { openStorage } from '../vps/sqlite-port.mjs';
import { FileBucket } from '../vps/file-bucket.mjs';
import { ImmutableBlobStore } from '../server/blobs.js';
import { PrivateWriteJournal } from '../server/privatewrites.js';
import { GameMetadataStore } from '../server/metadata.js';
import { GameSnapshotVerifier } from '../server/snapshots.js';
import { PrivateDrafts } from '../server/drafts.js';
import { DraftTopology, hasPendingMoves } from '../server/topology.js';
import { FIXED_COPY_PROFILE } from '../server/copyprofile.js';
import { moveCityIntent, brokenRoads } from '../web/src/content/authoring/roadedit.js';
import { encodeSourceChunks, canonicalSourceTokens } from '../web/src/content/authoring/sourcejson.js';
import { HttpError, fail } from '../server/security.js';
import { createPinnedCopyLoader } from './editor_trusted_copy.mjs';

let passed = 0;
const check = (name, cond, extra = '') => {
  if (!cond) { console.error(`FAIL ${name} ${extra}`); process.exitCode = 1; }
  else { passed++; console.log(`ok ${name}`); }
};
const fails = async (name, fn, code) => {
  try { await fn(); } catch (e) {
    check(name, e instanceof HttpError && e.code === code, e?.code);
    return;
  }
  check(name, false);
};
const rangeFail = (name, fn) => {
  try { fn(); } catch (e) {
    check(name, e instanceof RangeError && typeof e.code === 'string', e?.code);
    return;
  }
  check(name, false);
};

// (a) Pure derivation against the pinned game shape.
const loader = createPinnedCopyLoader();
const { game: probe } = await loader({ gameId: 'topo-probe', ownerId: 'o' });
const cityId = 'city-000';
const intent = moveCityIntent(probe, cityId, 250, 9);
check('intent validated', intent.cityId === cityId && intent.x === 250 && intent.y === 9);
check('canonical untouched', probe.cities[cityId].x === 257 && probe.cities[cityId].y === 9);
rangeFail('unknown city', () => moveCityIntent(probe, 'city-999', 10, 10));
rangeFail('out of bounds', () => moveCityIntent(probe, cityId, 384, 9));
rangeFail('non-integer', () => moveCityIntent(probe, cityId, 250.5, 9));
rangeFail('no-op move', () => moveCityIntent(probe, cityId, 257, 9));
const broken = brokenRoads(probe, [intent]);
check('broken derived', broken.includes('road-0') && broken.every(id => {
  const r = probe.map.roads.find(r => r.id === id);
  return r.fromCityId === cityId || r.toCityId === cityId;
}));
check('empty moves none broken', brokenRoads(probe, []).length === 0);

// (b) Gate integration: record -> save refused -> clear -> save works.
const OWNER = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaa01', FOREIGN = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaa02', ADMIN = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaa03';
const storage = openStorage(':memory:');
storage.transactionSync(() => {
  storage.sql.exec("CREATE TABLE users (id TEXT PRIMARY KEY, account TEXT UNIQUE NOT NULL, role TEXT NOT NULL, password_hash TEXT NOT NULL, disabled INTEGER NOT NULL, must_change INTEGER NOT NULL, epoch INTEGER NOT NULL, version INTEGER NOT NULL)");
  storage.sql.exec('INSERT INTO users VALUES(?,?,?,?,?,?,?,?)', OWNER, 'author_topo', 'author', '{}', 0, 0, 1, 1);
  storage.sql.exec('INSERT INTO users VALUES(?,?,?,?,?,?,?,?)', FOREIGN, 'other_topo', 'author', '{}', 0, 0, 1, 1);
  storage.sql.exec('INSERT INTO users VALUES(?,?,?,?,?,?,?,?)', ADMIN, 'admin_topo', 'admin', '{}', 0, 0, 1, 1);
});
const principal = h => {
  const id = { h1: OWNER, hf: FOREIGN, ha: ADMIN }[h];
  if (!id) fail(401, 'SESSION_INVALID');
  return { id, role: id === ADMIN ? 'admin' : 'author', epoch: 1, must_change: 0 };
};
const bucket = new FileBucket({ root: join(mkdtempSync(join(tmpdir(), 'vps-topo-')), 'data') });
const journal = new PrivateWriteJournal({ storage, bucket });
const authority = () => ({ ownerId: OWNER, epoch: 1 });
const blobs = new ImmutableBlobStore({ bucket: journal, authority, storage });
const verifier = new GameSnapshotVerifier({ blobs });
const games = new GameMetadataStore({ storage, principal,
  verifySnapshot: input => verifier.verify(input.tokenHash, input),
  recoverAllocation: () => { fail(503, 'COPY_NOT_CONFIGURED'); } });
const allocation = games.allocateGameId('h1');
const GAME = allocation.gameId;
const { game } = await loader({ gameId: GAME, ownerId: OWNER });
const stageGame = async bytes => {
  const put = await blobs.putImmutable('h1', { gameId: GAME, allocation: {}, bytes: new Uint8Array(bytes) });
  return { sha256: put.sha256, byteLength: put.byteLength };
};
const depDigestOf = (chunks, dependencies) => { const h = createHash('sha256'); for (const t of canonicalSourceTokens({ chunks, dependencies })) h.update(t, 'utf8'); return h.digest('hex'); };
const hAll = createHash('sha256'), chunks = [];
for (const part of encodeSourceChunks(game)) { hAll.update(part); chunks.push(await stageGame(part)); }
const sourceDigest = hAll.digest('hex');
const gIndex = { schema: 'dragon-game-source-index-1', gameId: GAME, sourceDigest, sourceByteLength: chunks.reduce((n, c) => n + c.byteLength, 0), chunks, dependencies: [] };
const gRoot = await stageGame(Buffer.concat(encodeSourceChunks(gIndex)));
const REG = 'test-reg-topo-1', DEF = 'd'.repeat(64), CAT = 'c'.repeat(64);
storage.transactionSync(() => {
  storage.sql.exec('CREATE TABLE IF NOT EXISTS copy_objects (game_id TEXT NOT NULL, sha256 TEXT NOT NULL, byte_length INTEGER NOT NULL, state TEXT NOT NULL, PRIMARY KEY(game_id,sha256))');
  storage.sql.exec('CREATE TABLE IF NOT EXISTS copy_origins (game_id TEXT PRIMARY KEY, registry_id TEXT NOT NULL, definition_digest TEXT NOT NULL, catalog_root TEXT NOT NULL, profile_revision TEXT NOT NULL, baseline_root TEXT NOT NULL, baseline_length INTEGER NOT NULL, baseline_digest TEXT NOT NULL, source_digest TEXT NOT NULL, dependency_digest TEXT NOT NULL)');
  storage.sql.exec('CREATE TABLE IF NOT EXISTS installed_sources (registry_id TEXT PRIMARY KEY, definition_digest TEXT NOT NULL, root_digest TEXT NOT NULL, root_byte_length INTEGER NOT NULL, row_revision TEXT NOT NULL, registered_by TEXT NOT NULL, registered_at TEXT NOT NULL)');
  storage.sql.exec('INSERT INTO copy_objects VALUES(?,?,?,?)', GAME, gRoot.sha256, gRoot.byteLength, 'committed');
  storage.sql.exec('INSERT INTO copy_origins VALUES(?,?,?,?,?,?,?,?,?,?)', GAME, REG, DEF, CAT, FIXED_COPY_PROFILE, gRoot.sha256, gRoot.byteLength, sourceDigest, sourceDigest, depDigestOf(chunks, []));
  storage.sql.exec('INSERT INTO installed_sources VALUES(?,?,?,?,?,?,?)', REG, DEF, CAT, 1, '1', OWNER, new Date().toISOString());
});
const drafts = new PrivateDrafts({ storage, principal, games, blobs, definition: () => ({ registryId: REG, profileRevision: FIXED_COPY_PROFILE, definitionDigest: DEF }), operationGuard: () => {} });
const snap1 = await games.prepareSnapshot('h1', { gameId: GAME, draftRevision: '1', metadata: { ...game.metadata }, source: { sha256: gRoot.sha256, byteLength: gRoot.byteLength }, allocation });
games.transaction('h1', { key: 'topo-create-00000001', method: 'create', target: 'new', digest: 'd'.repeat(64) }, api => api.create(allocation, snap1));
const topo = new DraftTopology({ storage, principal, games });
const input1 = { metadata: { ...game.metadata }, resourceEdits: [], chapterEdits: [] };
const rec = topo.record('h1', game, { cityId: 'city-000', x: 250, y: 9 });
check('intent recorded', rec.x === 250 && topo.list('h1', GAME).length === 1 && hasPendingMoves(storage, GAME));
await fails('save blocked 422', async () => drafts.save('h1', GAME, '1', 'topo-save-0000000001', 'e'.repeat(64), input1), 'DRAFT_TOPOLOGY_BROKEN');
check('clear one', topo.clear('h1', GAME, 'city-000') === 1 && !hasPendingMoves(storage, GAME));
const saved = await drafts.save('h1', GAME, '1', 'topo-save-0000000002', 'e'.repeat(64), input1);
check('save works after clear', saved.draftRevision === '1');
await fails('invalid principal record 401', async () => topo.record('hx', game, { cityId: 'city-000', x: 250, y: 9 }), 'SESSION_INVALID');

// (c) B-2 rebuild recording + status display (gate stays red).
const rec2 = topo.record('h1', game, { cityId: 'city-000', x: 250, y: 9 });
void rec2;
const road0 = game.map.roads.find(r => r.fromCityId === 'city-000' || r.toCityId === 'city-000');
const geo = [{ x: 250, y: 9 }, { x: 249, y: 9 }, { x: 249, y: 10 }];
const rb = topo.rebuild('h1', game, { roadId: road0.id, geometry: geo, travelKind: road0.travelKind });
check('rebuild recorded', rb.roadId === road0.id && rb.points === 3);
const st = topo.status('h1', game, GAME);
check('status display', st.blocked === true && st.broken.includes(road0.id) && st.rebuilt.includes(road0.id) && !st.uncovered.includes(road0.id));
await fails('save still blocked', async () => drafts.save('h1', GAME, '1', 'topo-save-0000000003', 'e'.repeat(64), input1), 'DRAFT_TOPOLOGY_BROKEN');
check('clear rebuild', topo.clearRebuild('h1', GAME, road0.id) === 1);
check('uncovered back', topo.status('h1', game, GAME).uncovered.includes(road0.id));
await fails('bad geometry 422', async () => topo.rebuild('h1', game, { roadId: road0.id, geometry: [{ x: 0, y: 0 }], travelKind: 'land' }), 'TOPOLOGY_GEOMETRY');
await fails('bad kind 422', async () => topo.rebuild('h1', game, { roadId: road0.id, geometry: geo, travelKind: 'air' }), 'TOPOLOGY_TRAVEL_KIND');
await fails('unknown road 404', async () => topo.rebuild('h1', game, { roadId: 'road-zzz', geometry: geo, travelKind: 'land' }), 'TOPOLOGY_ROAD_NOT_FOUND');

// A durable fence must freeze both intent tables, including clear operations.
// This is an explicit SQLite fence fixture, not a physical deletion transaction.
topo.rebuild('h1', game, { roadId: road0.id, geometry: geo, travelKind: road0.travelKind });
const snapshot = () => ['draft_topology_moves', 'draft_topology_rebuilds', 'content_games'].map(table => storage.sql.exec(`SELECT * FROM ${table} ORDER BY rowid`).toArray());
const frozen = snapshot(), gameDigest = createHash('sha256').update(JSON.stringify(game)).digest('hex');
storage.sql.exec('INSERT INTO content_deletion_fences VALUES(?,?,?,?,?,?)', GAME, OWNER, OWNER, '1', '2', new Date().toISOString());
for (const [name, operation] of [
  ['record', token => topo.record(token, game, { cityId: 'city-000', x: 251, y: 9 })],
  ['rebuild', token => topo.rebuild(token, game, { roadId: road0.id, geometry: geo, travelKind: 'water' })],
  ['clear one', token => topo.clear(token, GAME, 'city-000')],
  ['clear all', token => topo.clear(token, GAME)],
  ['clear rebuild', token => topo.clearRebuild(token, GAME, road0.id)],
  ['list', token => topo.list(token, GAME)],
  ['list rebuilds', token => topo.listRebuilds(token, GAME)],
  ['status', token => topo.status(token, game, GAME)],
]) {
  assert.throws(() => operation('h1'), error => error instanceof HttpError && error.code === 'GAME_DELETING', name);
  for (const token of ['hf', 'ha']) assert.throws(() => operation(token), error => error instanceof HttpError && error.code === 'GAME_NOT_FOUND', `${name}: foreign author/admin`);
  assert.deepEqual(snapshot(), frozen);
  check(`fenced ${name} rejected without changing either intent table or game metadata`, true);
}
assert.equal(createHash('sha256').update(JSON.stringify(game)).digest('hex'), gameDigest);
assert.equal(hasPendingMoves(storage, GAME), true);
assert.equal(storage.sql.exec('SELECT * FROM content_deletion_fences WHERE game_id=?', GAME).toArray().length, 1);
check('fence and pending gate retained; captured source unchanged', true);
console.log(`passed ${passed} checks`);
