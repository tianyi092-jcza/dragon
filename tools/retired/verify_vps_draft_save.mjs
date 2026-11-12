// V1 slice 5: end-to-end PrivateDrafts.save/read/captureForCompile with
// REAL classes on VPS ports: pinned builtin baseline (tools/
// editor_trusted_copy.mjs) -> file blobs -> real GameSnapshotVerifier ->
// seeded copy origin -> save x2 -> read/compile/query. Usage:
// node tools/verify_vps_draft_save.mjs
import { mkdtempSync } from 'node:fs';
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
import { FIXED_COPY_PROFILE } from '../server/copyprofile.js';
import { encodeSourceChunks, canonicalSourceTokens } from '../web/src/content/authoring/sourcejson.js';
import { HttpError, fail } from '../server/security.js';
import { createPinnedCopyLoader } from './editor_trusted_copy.mjs';

let passed = 0;
const check = (name, cond) => {
  if (!cond) { console.error(`FAIL ${name}`); process.exitCode = 1; }
  else { passed++; console.log(`ok ${name}`); }
};
const fails = async (name, fn, code, status) => {
  try { await fn(); } catch (e) {
    check(name, e instanceof HttpError && e.code === code && (status === undefined || e.status === status));
    return;
  }
  check(name, false);
};
const OWNER = '33333333-3333-4333-8333-333333333333';
const OTHER = '44444444-4444-4444-8444-444444444444', ADMIN = '55555555-5555-4555-8555-555555555555';
const storage = openStorage(':memory:');
storage.transactionSync(() => {
  storage.sql.exec("CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, account TEXT UNIQUE NOT NULL, role TEXT NOT NULL, password_hash TEXT NOT NULL, disabled INTEGER NOT NULL, must_change INTEGER NOT NULL, epoch INTEGER NOT NULL, version INTEGER NOT NULL, display_name TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '')");
  for (const [id, account, role] of [[OWNER, 'author_s5', 'author'], [OTHER, 'other_s5', 'author'], [ADMIN, 'tianyi', 'admin']]) {
    storage.sql.exec('INSERT INTO users VALUES(?,?,?,?,?,?,?,?,?,?,?,?)', id, account, role, '{}', 0, 0, 1, 1, '', '', '', '');
  }
});
// Explicit principal fixtures: valid distinct accounts, not real login/session proof.
const actors = new Map([['h1', { id: OWNER, role: 'author' }], ['h2', { id: OTHER, role: 'author' }], ['ha', { id: ADMIN, role: 'admin' }]]);
let ownerEpoch = 1;
const principal = h => { const actor = actors.get(h); if (!actor) fail(401, 'SESSION_INVALID'); return { ...actor, epoch: h === 'h1' ? ownerEpoch : 1, must_change: 0 }; };
const bucket = new FileBucket({ root: join(mkdtempSync(join(tmpdir(), 'vps-draft-')), 'data') });
const journal = new PrivateWriteJournal({ storage, bucket });
const authority = (_t, _c) => ({ ownerId: OWNER, epoch: 1 });
const blobs = new ImmutableBlobStore({ bucket: journal, authority, storage });
const verifier = new GameSnapshotVerifier({ blobs });
const games = new GameMetadataStore({ storage, principal,
  verifySnapshot: input => verifier.verify(input.tokenHash, input),
  recoverAllocation: () => { fail(503, 'COPY_NOT_CONFIGURED'); } });
const allocation = games.allocateGameId('h1');
const GAME = allocation.gameId;

// 1. Pinned baseline game + stage all parts + index into blobs.
const loader = createPinnedCopyLoader();
const { game, provenance } = await loader({ gameId: GAME, ownerId: OWNER });
check('pinned baseline', game.chapterOrder.length === 20 && game.gameId === GAME);
const stagePart = async bytes => {
  const put = await blobs.putImmutable('h1', { gameId: GAME, allocation: {}, bytes: new Uint8Array(bytes) });
  return { sha256: put.sha256, byteLength: put.byteLength };
};
const depDigestOf = (chunks, dependencies) => { const h = createHash('sha256'); for (const t of canonicalSourceTokens({ chunks, dependencies })) h.update(t, 'utf8'); return h.digest('hex'); };
const hAll = createHash('sha256'), chunks = [];
for (const part of encodeSourceChunks(game)) { hAll.update(part); chunks.push(await stagePart(part)); }
const sourceDigest = hAll.digest('hex');
const sourceLength = chunks.reduce((n, c) => n + c.byteLength, 0);
const index = { schema: 'dragon-game-source-index-1', gameId: GAME, sourceDigest, sourceByteLength: sourceLength, chunks, dependencies: [] };
const root = await stagePart(Buffer.concat(encodeSourceChunks(index)));
const dependencyDigest = depDigestOf(chunks, []);

// 2. Seed admin-copy completion rows (what AdminFullCopy.execute persists).
const REG = provenance.registryId, DEF = 'd'.repeat(64), CAT = 'c'.repeat(64);
storage.transactionSync(() => {
  storage.sql.exec('CREATE TABLE IF NOT EXISTS copy_objects (game_id TEXT NOT NULL, sha256 TEXT NOT NULL, byte_length INTEGER NOT NULL, state TEXT NOT NULL, PRIMARY KEY(game_id,sha256))');
  storage.sql.exec('CREATE TABLE IF NOT EXISTS copy_origins (game_id TEXT PRIMARY KEY, registry_id TEXT NOT NULL, definition_digest TEXT NOT NULL, catalog_root TEXT NOT NULL, profile_revision TEXT NOT NULL, baseline_root TEXT NOT NULL, baseline_length INTEGER NOT NULL, baseline_digest TEXT NOT NULL, source_digest TEXT NOT NULL, dependency_digest TEXT NOT NULL)');
  storage.sql.exec('CREATE TABLE IF NOT EXISTS installed_sources (registry_id TEXT PRIMARY KEY, definition_digest TEXT NOT NULL, root_digest TEXT NOT NULL, root_byte_length INTEGER NOT NULL, row_revision TEXT NOT NULL, registered_by TEXT NOT NULL, registered_at TEXT NOT NULL)');
  storage.sql.exec("INSERT INTO copy_objects VALUES(?,?,?,?)", GAME, root.sha256, root.byteLength, 'committed');
  storage.sql.exec('INSERT INTO copy_origins VALUES(?,?,?,?,?,?,?,?,?,?)', GAME, REG, DEF, CAT, FIXED_COPY_PROFILE, root.sha256, root.byteLength, sourceDigest, sourceDigest, dependencyDigest);
  storage.sql.exec('INSERT INTO installed_sources VALUES(?,?,?,?,?,?,?)', REG, DEF, CAT, 1, '1', OWNER, new Date().toISOString());
});
const definition = () => ({ registryId: REG, profileRevision: FIXED_COPY_PROFILE, definitionDigest: DEF });
let draftReads = 0, draftPuts = 0, revokeAfterRead = false, revokeAfterPut = false, revokedPut = null, fenceAfterRead = false;
let readFailure = null, secondRootFailure = null, sourceAfterRead = false;
const draftBlobs = {
  async read(...args) {
    draftReads++; const result = await blobs.read(...args);
    // Controlled principal-port transition after actual file read, not password API coverage.
    if (revokeAfterRead) { revokeAfterRead = false; ownerEpoch++; storage.sql.exec('UPDATE users SET epoch=? WHERE id=?', ownerEpoch, OWNER); }
    if (fenceAfterRead) {
      fenceAfterRead = false;
      storage.sql.exec('INSERT INTO content_deletion_fences VALUES(?,?,?,?,?,?)', GAME, OWNER, OWNER, '1', '2', new Date().toISOString());
    }
    if (sourceAfterRead) {
      sourceAfterRead = false;
      storage.sql.exec('UPDATE installed_sources SET root_digest=? WHERE registry_id=?', 'e'.repeat(64), REG);
    }
    if (readFailure) throw readFailure;
    if (secondRootFailure && args[1].sha256 === secondRootFailure.sha256 && ++secondRootFailure.seen === 2) {
      if (secondRootFailure.transition === 'epoch') {
        ownerEpoch++; storage.sql.exec('UPDATE users SET epoch=? WHERE id=?', ownerEpoch, OWNER);
      } else if (secondRootFailure.transition === 'fence') {
        storage.sql.exec('INSERT INTO content_deletion_fences VALUES(?,?,?,?,?,?)', GAME, OWNER, OWNER, '1', '2', new Date().toISOString());
      } else if (secondRootFailure.transition === 'source') {
        storage.sql.exec('UPDATE installed_sources SET root_digest=? WHERE registry_id=?', 'e'.repeat(64), REG);
      }
      throw secondRootFailure.error;
    }
    return result;
  },
  async putImmutable(...args) {
    draftPuts++; const result = await blobs.putImmutable(...args);
    // Revoke only after the real immutable write/readback has returned.
    if (revokeAfterPut) { revokeAfterPut = false; revokedPut = result; ownerEpoch++; storage.sql.exec('UPDATE users SET epoch=? WHERE id=?', ownerEpoch, OWNER); }
    return result;
  },
};
const drafts = new PrivateDrafts({ storage, principal, games, blobs: draftBlobs, definition, operationGuard: () => {} });
check('wiring', !!drafts);

// 3. Create rev1 through the real snapshot verifier.
const snap1 = await games.prepareSnapshot('h1', { gameId: GAME, draftRevision: '1', metadata: { ...game.metadata }, source: { sha256: root.sha256, byteLength: root.byteLength }, allocation });
const created = games.transaction('h1', { key: 's5-create-00000001', method: 'create', target: 'new', digest: 'd'.repeat(64) }, api => api.create(allocation, snap1));
check('create rev1 real-verify', created.draftRevision === '1');

// 4. No-op save returns the CURRENT revision without rewriting (production
// semantics: identical content is not a new revision).
const input1 = { metadata: { ...game.metadata }, resourceEdits: [], chapterEdits: [] };
const saved1 = await drafts.save('h1', GAME, '1', 's5-save-0000000001', 'e'.repeat(64), input1);
check('save no-op stays rev1', saved1.draftRevision === '1');

// 5. Resource edit save -> rev2 with new digests.
const read1 = await drafts.read('h1', GAME, '1');
const ch0 = read1.chapters[0], f0 = ch0.factions[0];
const input2 = { metadata: { ...game.metadata }, resourceEdits: [{ chapterId: ch0.chapterId, slot: 0, values: { money: f0.money + 1, reserve_cav: f0.reserve_cav + 1, reserve_arc: f0.reserve_arc + 1, reserve_inf: f0.reserve_inf + 1 } }], chapterEdits: [] };
const saved2 = await drafts.save('h1', GAME, '1', 's5-save-0000000002', 'e'.repeat(64), input2);
check('save edit rev2', saved2.draftRevision === '2');
const read2 = await drafts.read('h1', GAME, '2');
check('edit visible', read2.chapters[0].factions[0].money === f0.money + 1);
check('digests move', read2.sourceDigest !== read1.sourceDigest);

// 6. Gates: stale, bad input, idempotent replay, receipt, cross-author.
await fails('stale expected 412', async () => drafts.save('h1', GAME, '1', 's5-save-0000000003', 'e'.repeat(64), input1), 'DRAFT_CHANGED');
await fails('bad input 422', async () => drafts.save('h1', GAME, '2', 's5-save-0000000004', 'e'.repeat(64), { metadata: { name: 'x' } }), 'REQUEST_FIELDS');
const replay = await drafts.save('h1', GAME, '1', 's5-save-0000000001', 'e'.repeat(64), input1);
check('save replay rev1', replay.draftRevision === '1');
const q = drafts.query('h1', GAME, 's5-save-0000000002');
check('query committed receipt', q.state === 'committed' && q.result.draftRevision === '2');
const compiled = await drafts.captureForCompile('h1', GAME, '2');
check('capture compile', compiled.game.chapterOrder.length === 20 && compiled.reference.draftRevision === '2' && compiled.ownerId === OWNER);
await fails('invalid token 401 (not cross-author proof)', async () => drafts.read('hx', GAME, '2'), 'SESSION_INVALID', 401);

// Valid foreign principals must be rejected before reads, puts or operation reservation.
const beforeIO = [draftReads, draftPuts];
const beforeRequests = JSON.stringify(storage.sql.exec('SELECT * FROM draft_requests ORDER BY actor,op_key').toArray());
const beforeGame = JSON.stringify(storage.sql.exec('SELECT * FROM content_games WHERE game_id=?', GAME).toArray());
for (const [token, label] of [['h2', 'other author'], ['ha', 'administrator']]) {
  await fails(`${label} cannot read owner draft`, () => drafts.read(token, GAME, '2'), 'GAME_NOT_FOUND', 404);
  await fails(`${label} cannot save owner draft`, () => drafts.save(token, GAME, '2', 's5-foreign-save-01', 'f'.repeat(64), input1), 'GAME_NOT_FOUND', 404);
  await fails(`${label} cannot query owner receipt`, async () => drafts.query(token, GAME, 's5-save-0000000002'), 'GAME_NOT_FOUND', 404);
  await fails(`${label} cannot capture owner draft for compile`, () => drafts.captureForCompile(token, GAME, '2'), 'GAME_NOT_FOUND', 404);
}
check('foreign authority causes zero draft blob IO', draftReads === beforeIO[0] && draftPuts === beforeIO[1]);
check('foreign saves reserve no operation and change no game', JSON.stringify(storage.sql.exec('SELECT * FROM draft_requests ORDER BY actor,op_key').toArray()) === beforeRequests && JSON.stringify(storage.sql.exec('SELECT * FROM content_games WHERE game_id=?', GAME).toArray()) === beforeGame);

const revokedKey = 's5-revoked-save-01';
revokeAfterRead = true;
await fails('epoch change after actual read rejects original save', () => drafts.save('h1', GAME, '2', revokedKey, 'f'.repeat(64), input1), 'SESSION_INVALID', 401);
check('revoked save stops after first read without puts or game change', ownerEpoch === 2 && draftReads === beforeIO[0] + 1 && draftPuts === beforeIO[1] && JSON.stringify(storage.sql.exec('SELECT * FROM content_games WHERE game_id=?', GAME).toArray()) === beforeGame);
await fails('new epoch cannot query old operation', async () => drafts.query('h1', GAME, revokedKey), 'OPERATION_REVOKED', 409);
await fails('new epoch cannot retry old key', () => drafts.save('h1', GAME, '2', revokedKey, 'f'.repeat(64), input1), 'OPERATION_REVOKED', 409);
const revoked = storage.sql.exec('SELECT * FROM draft_requests WHERE actor=? AND op_key=?', OWNER, revokedKey).toArray()[0];
check('old request remains uncommitted and is not revived', revoked.state === 'pending' && revoked.auth_epoch === 1 && revoked.result_json === null && draftReads === beforeIO[0] + 1 && draftPuts === beforeIO[1]);

// Distinct boundary: a completed object write is not permission to commit a revision.
const putRevokedKey = 's5-put-revoked-01', beforePutCount = draftPuts;
const putInput = { ...input1, metadata: { ...input1.metadata, introduction: '寫後撤權' } };
const referenceRows = () => JSON.stringify(storage.sql.exec('SELECT * FROM draft_references ORDER BY game_id,revision,sha256').toArray());
const beforeReferences = referenceRows();
revokeAfterPut = true;
await fails('epoch change after immutable write/readback rejects save', () => drafts.save('h1', GAME, '2', putRevokedKey, 'a'.repeat(64), putInput), 'SESSION_INVALID', 401);
const putRequest = storage.sql.exec('SELECT * FROM draft_requests WHERE actor=? AND op_key=?', OWNER, putRevokedKey).toArray()[0];
const putObjects = storage.sql.exec('SELECT * FROM draft_objects WHERE actor=? AND op_key=?', OWNER, putRevokedKey).toArray();
check('post-write revocation keeps intent, no receipt or revision references', ownerEpoch === 3 && draftPuts === beforePutCount + 1 && revokedPut !== null && putRequest.state === 'pending' && putRequest.auth_epoch === 2 && putRequest.result_json === null && putObjects.length === 1 && putObjects[0].state === 'intent' && putObjects[0].sha256 === revokedPut.sha256 && referenceRows() === beforeReferences && JSON.stringify(storage.sql.exec('SELECT * FROM content_games WHERE game_id=?', GAME).toArray()) === beforeGame);
await fails('new epoch cannot query post-write revoked operation', async () => drafts.query('h1', GAME, putRevokedKey), 'OPERATION_REVOKED', 409);
const postPutReads = draftReads;
await fails('new epoch cannot retry post-write revoked operation', () => drafts.save('h1', GAME, '2', putRevokedKey, 'a'.repeat(64), putInput), 'OPERATION_REVOKED', 409);
check('revoked retry performs no further blob IO', draftReads === postPutReads && draftPuts === beforePutCount + 1);
const saved3 = await drafts.save('h1', GAME, '2', 's5-new-epoch-0001', 'b'.repeat(64), putInput);
check('fresh key under current epoch can save normally', saved3.draftRevision === '3' && drafts.query('h1', GAME, 's5-new-epoch-0001').state === 'committed');
await fails('successful new key does not revive revoked receipt', async () => drafts.query('h1', GAME, putRevokedKey), 'OPERATION_REVOKED', 409);

// Revoke after the real prepared capability returns, immediately before save's
// final transaction. Do not substitute a forged verification result.
const preparedKey = 's5-prepared-revoked-01';
const preparedInput = { ...input1, metadata: { ...input1.metadata, introduction: '核後撤權' } };
const beforeCommitGame = JSON.stringify(storage.sql.exec('SELECT * FROM content_games WHERE game_id=?', GAME).toArray());
const beforeCommitReferences = referenceRows(), prepareSnapshot = games.prepareSnapshot.bind(games);
let preparedCalls = 0;
games.prepareSnapshot = async (...args) => {
  const prepared = await prepareSnapshot(...args);
  preparedCalls++; ownerEpoch++; storage.sql.exec('UPDATE users SET epoch=? WHERE id=?', ownerEpoch, OWNER);
  return prepared;
};
try {
  await fails('epoch change after real prepare rejects final transaction', () => drafts.save('h1', GAME, '3', preparedKey, 'c'.repeat(64), preparedInput), 'SESSION_INVALID', 401);
} finally { games.prepareSnapshot = prepareSnapshot; }
const preparedRequest = storage.sql.exec('SELECT * FROM draft_requests WHERE actor=? AND op_key=?', OWNER, preparedKey).toArray()[0];
const preparedObjects = storage.sql.exec('SELECT * FROM draft_objects WHERE actor=? AND op_key=?', OWNER, preparedKey).toArray();
check('verified objects do not authorize revoked final commit', preparedCalls === 1 && ownerEpoch === 4 && preparedRequest.state === 'pending' && preparedRequest.auth_epoch === 3 && preparedRequest.result_json === null && preparedObjects.length > 0 && preparedObjects.every(row => row.state === 'verified') && referenceRows() === beforeCommitReferences && JSON.stringify(storage.sql.exec('SELECT * FROM content_games WHERE game_id=?', GAME).toArray()) === beforeCommitGame);
await fails('new epoch cannot query prepared revoked operation', async () => drafts.query('h1', GAME, preparedKey), 'OPERATION_REVOKED', 409);
const beforePreparedRetry = [draftReads, draftPuts];
await fails('new epoch cannot retry prepared revoked operation', () => drafts.save('h1', GAME, '3', preparedKey, 'c'.repeat(64), preparedInput), 'OPERATION_REVOKED', 409);
check('prepared revoked retry has no blob IO', draftReads === beforePreparedRetry[0] && draftPuts === beforePreparedRetry[1]);
const saved4 = await drafts.save('h1', GAME, '3', 's5-after-prepare-01', 'd'.repeat(64), preparedInput);
check('fresh key after prepared revocation commits revision4', saved4.draftRevision === '4' && drafts.query('h1', GAME, 's5-after-prepare-01').state === 'committed');
await fails('new commit leaves prepared revoked key retired', async () => drafts.query('h1', GAME, preparedKey), 'OPERATION_REVOKED', 409);

// An explicit SQL fence fixture after a real root read, not a deletion workflow.
// Each case starts unfenced; only this owned fixture row is removed afterward.
const readSurfaces = [
  ['draft DTO', () => drafts.read('h1', GAME, '4')],
  ['compile capture', () => drafts.captureForCompile('h1', GAME, '4')],
  ['map window', () => drafts.readMapWindow('h1', GAME, '4', { x: 0, y: 0, width: 1, height: 1 }, '1111')],
  ['map scene', () => drafts.readMapScene('h1', GAME, '4', '1111')],
  ['minimap', () => drafts.readMinimap('h1', GAME, '4')],
  ['decoration selection', () => drafts.readDecorationSelection('h1', GAME, '4', { x: 0, y: 0, width: 1, height: 1 })],
];
const contentRows = () => JSON.stringify(['content_games', 'content_snapshots', 'draft_requests', 'draft_objects', 'draft_references', 'copy_origins', 'copy_objects'].map(table => [table, storage.sql.exec(`SELECT * FROM ${table} ORDER BY rowid`).toArray()]));
const beforeFenceContent = contentRows();
for (const [label, read] of readSurfaces) {
  const reads = draftReads, puts = draftPuts;
  fenceAfterRead = true;
  try {
    await fails(`${label} refuses fence after actual root read`, read, 'GAME_DELETING', 409);
    check(`${label} stops at first read with no writes or content changes`, !fenceAfterRead && draftReads === reads + 1 && draftPuts === puts && contentRows() === beforeFenceContent);
    await fails(`${label} next request refuses before IO`, read, 'GAME_DELETING', 409);
    check(`${label} retains fence and performs no additional IO`, draftReads === reads + 1 && draftPuts === puts && storage.sql.exec('SELECT game_id FROM content_deletion_fences WHERE game_id=?', GAME).toArray().length === 1);
  } finally {
    fenceAfterRead = false;
    storage.sql.exec('DELETE FROM content_deletion_fences WHERE game_id=?', GAME);
  }
}
// A failed read must not hide revocation/fencing; valid authority keeps the
// original I/O error, without converting it into a successful empty result.
for (const [label, read] of readSurfaces) {
  for (const transition of ['unchanged', 'epoch', 'fence', 'source']) {
    const reads = draftReads, puts = draftPuts, originalEpoch = ownerEpoch;
    const before = contentRows(), error = new Error('owned failed draft read');
    readFailure = error;
    revokeAfterRead = transition === 'epoch'; fenceAfterRead = transition === 'fence'; sourceAfterRead = transition === 'source';
    try {
      if (transition === 'unchanged') {
        let caught;
        try { await read(); } catch (failure) { caught = failure; }
        check(`${label} keeps unchanged-authority IO error`, caught === error);
      } else {
        const expected = { epoch: ['SESSION_INVALID', 401], fence: ['GAME_DELETING', 409], source: ['DRAFT_SOURCE_CHANGED', 409] }[transition];
        await fails(`${label} failed read still checks ${transition}`, read, expected[0], expected[1]);
      }
      check(`${label} failed ${transition} read stops without writes`, draftReads === reads + 1 && draftPuts === puts && contentRows() === before);
    } finally {
      readFailure = null; revokeAfterRead = false; fenceAfterRead = false; sourceAfterRead = false;
      storage.sql.exec('UPDATE installed_sources SET root_digest=? WHERE registry_id=?', CAT, REG);
      ownerEpoch = originalEpoch; storage.sql.exec('UPDATE users SET epoch=? WHERE id=?', ownerEpoch, OWNER);
      storage.sql.exec('DELETE FROM content_deletion_fences WHERE game_id=?', GAME);
    }
  }
}
// Reach the verifier's second read of the same exact revision root, after
// initial index discovery. Do not substitute a prepared proof or latest root.
const revision4Root = games.snapshotReference('h1', GAME, '4').rootKey.split('/').at(-1);
for (const [label, read] of readSurfaces) {
  for (const transition of ['unchanged', 'epoch', 'fence', 'source']) {
    const reads = draftReads, puts = draftPuts, epoch = ownerEpoch, content = contentRows();
    const error = new Error('owned verifier root failure');
    secondRootFailure = { sha256: revision4Root, seen: 0, transition, error };
    try {
      if (transition === 'unchanged') {
        let caught;
        try { await read(); } catch (failure) { caught = failure; }
        check(`${label} verifier keeps original IO error`, caught === error);
      } else {
        const expected = { epoch: ['SESSION_INVALID', 401], fence: ['GAME_DELETING', 409], source: ['DRAFT_SOURCE_CHANGED', 409] }[transition];
        await fails(`${label} verifier failure checks ${transition}`, read, expected[0], expected[1]);
      }
      check(`${label} reached second root without writes`, secondRootFailure.seen === 2 && draftReads > reads + 1 && draftPuts === puts && contentRows() === content);
    } finally {
      secondRootFailure = null; ownerEpoch = epoch;
      storage.sql.exec('UPDATE installed_sources SET root_digest=? WHERE registry_id=?', CAT, REG);
      storage.sql.exec('UPDATE users SET epoch=? WHERE id=?', ownerEpoch, OWNER);
      storage.sql.exec('DELETE FROM content_deletion_fences WHERE game_id=?', GAME);
    }
  }
}
// Distinct await boundary: let the real source/profile capture finish first,
// then fence at the injected atlas port. Null is deliberately not an image:
// the authority gate must reject before inspecting or decoding its payload.
let atlasCalls = 0, atlasTransition = 'resolved-fence';
const atlasFailure = new Error('owned failed atlas read');
const atlasDrafts = new PrivateDrafts({ storage, principal, games, blobs: draftBlobs, definition, operationGuard: () => {},
  atlas: async (token, registryId, season) => {
    atlasCalls++;
    check('atlas port receives captured owner/source/season', token === 'h1' && registryId === REG && season === 'spring');
    if (atlasTransition === 'resolved-fence' || atlasTransition === 'fence') {
      storage.sql.exec('INSERT INTO content_deletion_fences VALUES(?,?,?,?,?,?)', GAME, OWNER, OWNER, '1', '2', new Date().toISOString());
    } else if (atlasTransition === 'epoch') {
      ownerEpoch++; storage.sql.exec('UPDATE users SET epoch=? WHERE id=?', ownerEpoch, OWNER);
    } else if (atlasTransition === 'source') {
      storage.sql.exec('UPDATE installed_sources SET root_digest=? WHERE registry_id=?', 'e'.repeat(64), REG);
    }
    if (atlasTransition !== 'resolved-fence') throw atlasFailure;
    return null;
  },
});
const beforeAtlasContent = contentRows(), beforeAtlasReads = draftReads, beforeAtlasPuts = draftPuts;
try {
  await fails('atlas refuses fence after completed source capture', () => atlasDrafts.readMapAtlas('h1', GAME, '4', 'spring'), 'GAME_DELETING', 409);
  check('atlas refusal preserves content and writes nothing', atlasCalls === 1 && draftReads > beforeAtlasReads && draftPuts === beforeAtlasPuts && contentRows() === beforeAtlasContent);
  const afterAtlasReads = draftReads;
  await fails('fenced atlas retry rejects before source or atlas IO', () => atlasDrafts.readMapAtlas('h1', GAME, '4', 'spring'), 'GAME_DELETING', 409);
  check('atlas retry retains fixture fence without more IO', atlasCalls === 1 && draftReads === afterAtlasReads && draftPuts === beforeAtlasPuts && storage.sql.exec('SELECT game_id FROM content_deletion_fences WHERE game_id=?', GAME).toArray().length === 1);
} finally {
  storage.sql.exec('DELETE FROM content_deletion_fences WHERE game_id=?', GAME);
}
for (const transition of ['unchanged', 'epoch', 'fence', 'source']) {
  const calls = atlasCalls, reads = draftReads, puts = draftPuts, epoch = ownerEpoch;
  const content = contentRows();
  atlasTransition = transition;
  try {
    const read = () => atlasDrafts.readMapAtlas('h1', GAME, '4', 'spring');
    if (transition === 'unchanged') {
      let caught;
      try { await read(); } catch (error) { caught = error; }
      check('valid atlas authority preserves original IO failure', caught === atlasFailure);
    } else {
      const expected = { epoch: ['SESSION_INVALID', 401], fence: ['GAME_DELETING', 409], source: ['DRAFT_SOURCE_CHANGED', 409] }[transition];
      await fails(`failed atlas still checks ${transition}`, read, expected[0], expected[1]);
    }
    check(`failed atlas ${transition} preserves content and writes nothing`, atlasCalls === calls + 1 && draftReads > reads && draftPuts === puts && contentRows() === content);
  } finally {
    ownerEpoch = epoch; storage.sql.exec('UPDATE users SET epoch=? WHERE id=?', ownerEpoch, OWNER);
    storage.sql.exec('DELETE FROM content_deletion_fences WHERE game_id=?', GAME);
    storage.sql.exec('UPDATE installed_sources SET root_digest=? WHERE registry_id=?', CAT, REG);
  }
}
console.log(`passed ${passed} checks`);
