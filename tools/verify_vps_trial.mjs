// V1 slice 9: REAL TrialSessions issue/commit/serve/end on VPS ports with
// a REAL installed-source install (41 pinned roles verified) and the S5
// draft assembly. Usage: node tools/verify_vps_trial.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { openStorage } from '../vps/sqlite-port.mjs';
import { FileBucket } from '../vps/file-bucket.mjs';
import { ImmutableBlobStore } from '../server/blobs.js';
import { PrivateWriteJournal } from '../server/privatewrites.js';
import { GameMetadataStore } from '../server/metadata.js';
import { GameSnapshotVerifier } from '../server/snapshots.js';
import { PrivateDrafts } from '../server/drafts.js';
import { InstalledSourceCatalog } from '../server/sourcecatalog.js';
import { OwnedRuntimeAssets } from '../server/runtimeassets.js';
import { installedSourcePolicy } from '../server/sourcecatalogpolicy.js';
import { FIXED_COPY_PROFILE } from '../server/copyprofile.js';
import { TrialSessions } from '../server/trials.js';
import { encodeSourceChunks, canonicalSourceTokens } from '../web/src/content/authoring/sourcejson.js';
import { canonicalDigest } from '../web/src/content/authoring/gamesource.js';
import { HttpError, fail } from '../server/security.js';
import { createPinnedCopyLoader } from './editor_trusted_copy.mjs';

let passed = 0;
const check = (name, cond, extra = '') => {
  // pi-lens-ignore: no-console-except-error-js
  if (!cond) { console.error(`FAIL ${name} ${extra}`); process.exitCode = 1; }
  // pi-lens-ignore: no-console-except-error-js
  else { passed++; console.log(`ok ${name}`); }
};
const fails = async (name, fn, code) => {
  try { await fn(); } catch (e) {
    check(name, e instanceof HttpError && e.code === code, e?.code);
    return;
  }
  check(name, false);
};

const ADMIN = '77777777-7777-4777-8777-777777777777';
const OWNER = '88888888-8888-4888-8888-888888888888';
const OTHER = '99999999-9999-4999-8999-999999999999';
const ABSOLUTE = Date.now() + 8 * 3600000;
const actors = {
  ha: { id: ADMIN, role: 'admin', epoch: 1, must_change: 0, absolute_until: ABSOLUTE },
  h1: { id: OWNER, role: 'author', epoch: 1, must_change: 0, absolute_until: ABSOLUTE },
  h2: { id: OTHER, role: 'author', epoch: 1, must_change: 0, absolute_until: ABSOLUTE },
};
// Separate install administrator and game author. Runtime visual reads are
// owner-bound; this must not grant the author full-copy source access.

const principal = h => { if (!actors[h]) { fail(401, 'SESSION_INVALID'); } return actors[h]; };
const scratch = mkdtempSync(join(tmpdir(), 'vps-trial-'));
const storage = openStorage(':memory:');
try {
storage.transactionSync(() => {
  storage.sql.exec("CREATE TABLE users (id TEXT PRIMARY KEY, account TEXT UNIQUE NOT NULL, role TEXT NOT NULL, password_hash TEXT NOT NULL, disabled INTEGER NOT NULL, must_change INTEGER NOT NULL, epoch INTEGER NOT NULL, version INTEGER NOT NULL)");
  storage.sql.exec('INSERT INTO users VALUES(?,?,?,?,?,?,?,?)', ADMIN, 'admin_s9', 'admin', '{}', 0, 0, 1, 1);
  storage.sql.exec('INSERT INTO users VALUES(?,?,?,?,?,?,?,?)', OWNER, 'author_s9', 'author', '{}', 0, 0, 1, 1);
  storage.sql.exec('INSERT INTO users VALUES(?,?,?,?,?,?,?,?)', OTHER, 'other_s9', 'author', '{}', 0, 0, 1, 1);
});
const root = join(scratch, 'data');
const bucket = new FileBucket({ root });
const journal = new PrivateWriteJournal({ storage, bucket });
const authority = () => ({ ownerId: OWNER, epoch: 1 });
const blobs = new ImmutableBlobStore({ bucket: journal, authority, storage });
const verifier = new GameSnapshotVerifier({ blobs });
const games = new GameMetadataStore({ storage, principal,
  verifySnapshot: input => verifier.verify(input.tokenHash, input),
  recoverAllocation: () => { fail(503, 'COPY_NOT_CONFIGURED'); } });

// 1. Real policy + real install of all 41 roles into the file bucket.
const policy = installedSourcePolicy(
  readFileSync('server/pinned/world-manifest.txt'),
  readFileSync('server/pinned/entity-manifest.txt'));
check('policy 41 roles', policy.roles.length === 41 && policy.registryId === 'approved-builtin-28805f-entities7e7-1');
const catalog = new InstalledSourceCatalog({ storage, bucket, principal, policy, operationGuard: () => {} });
const REG = policy.registryId;
const stageRaw = async bytes => {
  const data = new Uint8Array(bytes);
  const key = `installed/${REG}/${createHash('sha256').update(data).digest('hex')}`;
  if (!await bucket.get(key)) { await bucket.put(key, data, {}); }
  return { sha256: key.slice(key.lastIndexOf('/') + 1), byteLength: data.length };
};
const roleEntries = [];
for (const role of policy.roles) {
  const data = new Uint8Array(readFileSync(join('web', role.path)));
  if (data.length !== role.byteLength) { throw new Error(`pinned bytes mismatch ${role.path}`); }
  const chunks = [];
  for (let at = 0; at < data.length; at += 1048576) {
    chunks.push(await stageRaw(data.subarray(at, Math.min(at + 1048576, data.length))));
  }
  roleEntries.push({ path: role.path, sha256: role.sha256, byteLength: role.byteLength, chunks });
}
const DEF = catalog.definition().definitionDigest;
const srcIndex = { schema: 'dragon-installed-source-index-1', registryId: REG, definitionDigest: DEF, roles: roleEntries };
const srcRoot = await stageRaw(Buffer.concat(encodeSourceChunks(srcIndex)));
const installed = await catalog.install('ha', REG, srcRoot, 's9-install-00000001');
check('install registered', installed.registryId === REG && installed.rootDigest === srcRoot.sha256);

// 2. S5 game assembly, origin bound to the real catalog definition.
const allocation = games.allocateGameId('h1');
const GAME = allocation.gameId;
const loader = createPinnedCopyLoader();
const { game } = await loader({ gameId: GAME, ownerId: OWNER });
const depDigestOf = (chunks, dependencies) => { const h = createHash('sha256'); for (const t of canonicalSourceTokens({ chunks, dependencies })) h.update(t, 'utf8'); return h.digest('hex'); };
const stageGame = async bytes => {
  const put = await blobs.putImmutable('h1', { gameId: GAME, allocation: {}, bytes: new Uint8Array(bytes) });
  return { sha256: put.sha256, byteLength: put.byteLength };
};
const hAll = createHash('sha256'), chunks = [];
for (const part of encodeSourceChunks(game)) { hAll.update(part); chunks.push(await stageGame(part)); }
const sourceDigest = hAll.digest('hex');
const gIndex = { schema: 'dragon-game-source-index-1', gameId: GAME, sourceDigest, sourceByteLength: chunks.reduce((n, c) => n + c.byteLength, 0), chunks, dependencies: [] };
const gRoot = await stageGame(Buffer.concat(encodeSourceChunks(gIndex)));
storage.transactionSync(() => {
  storage.sql.exec('CREATE TABLE IF NOT EXISTS copy_objects (game_id TEXT NOT NULL, sha256 TEXT NOT NULL, byte_length INTEGER NOT NULL, state TEXT NOT NULL, PRIMARY KEY(game_id,sha256))');
  storage.sql.exec('CREATE TABLE IF NOT EXISTS copy_origins (game_id TEXT PRIMARY KEY, registry_id TEXT NOT NULL, definition_digest TEXT NOT NULL, catalog_root TEXT NOT NULL, profile_revision TEXT NOT NULL, baseline_root TEXT NOT NULL, baseline_length INTEGER NOT NULL, baseline_digest TEXT NOT NULL, source_digest TEXT NOT NULL, dependency_digest TEXT NOT NULL)');
  storage.sql.exec('INSERT INTO copy_objects VALUES(?,?,?,?)', GAME, gRoot.sha256, gRoot.byteLength, 'committed');
  storage.sql.exec('INSERT INTO copy_origins VALUES(?,?,?,?,?,?,?,?,?,?)', GAME, REG, DEF, installed.rootDigest, FIXED_COPY_PROFILE, gRoot.sha256, gRoot.byteLength, sourceDigest, sourceDigest, depDigestOf(chunks, []));
});
const drafts = new PrivateDrafts({ storage, principal, games, blobs, definition: () => catalog.definition(), operationGuard: () => {} });
const snap1 = await games.prepareSnapshot('h1', { gameId: GAME, draftRevision: '1', metadata: { ...game.metadata }, source: { sha256: gRoot.sha256, byteLength: gRoot.byteLength }, allocation });
games.transaction('h1', { key: 's9-create-00000001', method: 'create', target: 'new', digest: 'd'.repeat(64) }, api => api.create(allocation, snap1));
await drafts.save('h1', GAME, '1', 's9-save-0000000001', 'e'.repeat(64), { metadata: { ...game.metadata }, resourceEdits: [], chapterEdits: [] });
check('game ready', true);

// 3. Trial issue/commit/serve/end.
const runtimeAssets = new OwnedRuntimeAssets({ storage, bucket, principal, games, policy, kind: 'visuals' });
const trials = new TrialSessions({ storage, principal, games, drafts, runtimeAssets, policy });
check('construct', !!trials);
const chapterId = game.chapterOrder[0];
// Explicit capture/reference fixtures isolate preflight ordering, not authority
// or persistence of these invalid candidates. The positive lane below uses the
// actual capture, installed visual bytes and real Trial commit/serve path.
const originalDigest = canonicalDigest(game, text => createHash('sha256').update(text).digest('hex'));
const originalReference = games.snapshotReference('h1', GAME, '1');
const untouched = JSON.stringify(['trial_sessions', 'trial_assets', 'content_games'].map(table => storage.sql.exec(`SELECT * FROM ${table}`).toArray()));
for (const kind of ['portrait-byte', 'city-view', 'portrait-override']) {
  const candidate = structuredClone(game), state = candidate.chapters[chapterId].state;
  if (kind === 'portrait-byte') state.generals[0].portrait = 621;
  else if (kind === 'city-view') state.cities[0].view = 255;
  else state.generals[0].portraitKey = '621';
  const digest = canonicalDigest(candidate, text => createHash('sha256').update(text).digest('hex'));
  const reference = { ...originalReference, sourceDigest: digest };
  let visualCaptures = 0;
  const rejected = new TrialSessions({ storage, principal, policy,
    games: {
      assertNotDeleting: id => games.assertNotDeleting(id),
      snapshotReference(token, id, revision) { games.snapshotReference(token, id, revision); return reference; },
    },
    drafts: { async captureForCompile() { return { ownerId: OWNER, authEpoch: actors.h1.epoch, profileRevision: FIXED_COPY_PROFILE, reference, game: candidate }; } },
    runtimeAssets: {
      definition: () => runtimeAssets.definition(),
      async capture() { visualCaptures++; throw new Error('invalid chapter reached visual capture'); },
    },
  });
  await fails(`${kind} preflight rejection`, () => rejected.issue('h1', GAME, '1', chapterId), kind === 'portrait-override' ? 'PORTRAIT_NOT_FOUND' : 'TRIAL_CHAPTER_ASSET_MISSING');
  check(`${kind} rejects without visuals or Trial rows`, visualCaptures === 0 && untouched === JSON.stringify(['trial_sessions', 'trial_assets', 'content_games'].map(table => storage.sql.exec(`SELECT * FROM ${table}`).toArray())));
  check(`${kind} preserves captured candidate and original source`, canonicalDigest(candidate, text => createHash('sha256').update(text).digest('hex')) === digest && canonicalDigest(game, text => createHash('sha256').update(text).digest('hex')) === originalDigest);
}
const issued = await trials.issue('h1', GAME, '1', chapterId);
check('issue active', issued.trial.state === 'active' && issued.trial.chapterId === chapterId && issued.derived.length > 0);
{
  // Same explicit capture/reference fixture as above, now with an unrelated
  // bad chapter. Shared map/visuals are unchanged; delegate their reads using
  // the actual saved reference, not the fixture's synthetic source digest.
  const captured = await drafts.captureForCompile('h1', GAME, '1');
  // Match the persisted JSON's key order for the byte comparison, rather than
  // the loader object's insertion order; their canonical source is identical.
  check('captured source equals loader and preserves serialized chapter', canonicalDigest(captured.game, text => createHash('sha256').update(text).digest('hex')) === originalDigest && Buffer.from(JSON.stringify(captured.game.chapters[chapterId].state)).equals(issued.derived.find(row => row.assetId === 'chapter').bytes));
  const candidate = structuredClone(captured.game), badChapter = game.chapterOrder.at(-1);
  candidate.chapters[badChapter].state.generals[0].portrait = 621;
  const digest = canonicalDigest(candidate, text => createHash('sha256').update(text).digest('hex'));
  const reference = { ...originalReference, sourceDigest: digest };
  let visualCaptures = 0;
  const scoped = new TrialSessions({ storage, principal, policy,
    games: {
      assertNotDeleting: id => games.assertNotDeleting(id),
      snapshotReference(token, id, revision) { games.snapshotReference(token, id, revision); return reference; },
    },
    drafts: { async captureForCompile() { return { ownerId: OWNER, authEpoch: actors.h1.epoch, profileRevision: FIXED_COPY_PROFILE, reference, game: candidate }; } },
    runtimeAssets: {
      definition: () => runtimeAssets.definition(),
      async capture(token, _reference, paths) { visualCaptures++; return runtimeAssets.capture(token, originalReference, paths); },
    },
  });
  const selected = await scoped.issue('h1', GAME, '1', chapterId);
  const manifest = JSON.parse(selected.derived.find(row => row.assetId === 'manifest').bytes.toString('utf8'));
  check('unrelated bad chapter does not block selected Trial', selected.trial.state === 'active' && selected.trial.chapterId === chapterId && visualCaptures === 1);
  check('selected chapter and six derived payloads retain exact bytes', selected.derived.filter(row => row.assetId !== 'manifest').length === 7 && selected.derived.filter(row => row.assetId !== 'manifest').every(row => row.bytes.equals(issued.derived.find(original => original.assetId === row.assetId).bytes)), JSON.stringify(selected.derived.filter(row => row.assetId !== 'manifest').map(row => ({ assetId: row.assetId, equal: row.bytes.equals(issued.derived.find(original => original.assetId === row.assetId).bytes) }))));
  check('single chapter manifest binds fixture source and original selected digest', JSON.stringify(manifest.chapters) === JSON.stringify([chapterId]) && manifest.scope.savedSourceDigest === digest && manifest.scope.selectedSourceDigest === issued.trial.manifestDigest);
  await fails('selecting the bad chapter still refuses', () => scoped.issue('h1', GAME, '1', badChapter), 'TRIAL_CHAPTER_ASSET_MISSING');
  check('bad selection adds no visual read or rows and preserves sources', visualCaptures === 1 && untouched === JSON.stringify(['trial_sessions', 'trial_assets', 'content_games'].map(table => storage.sql.exec(`SELECT * FROM ${table}`).toArray())) && canonicalDigest(candidate, text => createHash('sha256').update(text).digest('hex')) === digest && canonicalDigest(game, text => createHash('sha256').update(text).digest('hex')) === originalDigest);
}
storage.transactionSync(() => trials.commit('h1', issued.trial, issued.derived));
// The application owns the outer transaction around commit and its receipt.
// Here exercise real SQLite aborts at every asset insert, retaining an already
// committed Trial. This does not cover HTTP receipt sealing/remember failures.
{
  const interrupted = await trials.issue('h1', GAME, '1', chapterId);
  const before = JSON.stringify(['trial_sessions', 'trial_assets', 'content_games'].map(table => storage.sql.exec(`SELECT * FROM ${table}`).toArray()));
  const derivedBefore = interrupted.derived.map(item => createHash('sha256').update(item.bytes).digest('hex'));
  for (const assetId of ['manifest', 'chapter', 'terrain', 'roadGraph', 'roadCost', 'roadOffset', 'minimapBase', 'minimapLarge']) {
    storage.sql.exec(`CREATE TEMP TRIGGER owned_trial_insert_failure BEFORE INSERT ON trial_assets WHEN NEW.asset_id='${assetId}' BEGIN SELECT RAISE(ABORT, 'OWNED_TRIAL_INSERT_FAILURE'); END`);
    assert.throws(() => storage.transactionSync(() => trials.commit('h1', interrupted.trial, interrupted.derived)), /OWNED_TRIAL_INSERT_FAILURE/);
    storage.sql.exec('DROP TRIGGER owned_trial_insert_failure');
    check(`${assetId} failure rolls back new Trial and preserves existing rows`, before === JSON.stringify(['trial_sessions', 'trial_assets', 'content_games'].map(table => storage.sql.exec(`SELECT * FROM ${table}`).toArray())));
  }
  storage.transactionSync(() => trials.commit('h1', interrupted.trial, interrupted.derived));
  const stored = storage.sql.exec('SELECT * FROM trial_assets WHERE trial_id=?', interrupted.trial.trialId).toArray();
  check('same issued Trial commits after all eight aborted attempts', trials.status('h1', interrupted.trial.trialId).state === 'active' && stored.length === 8 && stored.every(row => {
    const item = interrupted.derived.find(entry => entry.assetId === row.asset_id);
    return item && row.sha256 === item.sha256 && row.byte_length === item.byteLength && Buffer.from(row.bytes).equals(item.bytes);
  }));
  check('aborted commits retain derived buffers and the older Trial remains active', interrupted.derived.every((item, index) => createHash('sha256').update(item.bytes).digest('hex') === derivedBefore[index]) && trials.status('h1', issued.trial.trialId).state === 'active');
  trials.endCommit('h1', interrupted.trial.trialId, trials.endPreview('h1', interrupted.trial.trialId));
}
const st = trials.status('h1', issued.trial.trialId);
check('status active', st.state === 'active' && st.trialId === issued.trial.trialId);
const pack = trials.pack('h1', issued.trial.trialId);
check('pack manifest+chapter', pack.manifest.schemaVersion === 1 && pack.chapterId === chapterId && pack.binding.trialId === issued.trial.trialId);
const terrain = trials.asset('h1', issued.trial.trialId, 'terrain');
check('asset terrain', terrain.byteLength > 0 && terrain.sha256.length === 64);
await fails('unknown asset 404', async () => trials.asset('h1', issued.trial.trialId, 'nope'), 'TRIAL_ASSET_NOT_FOUND');
await fails('bad chapter 422', async () => trials.issue('h1', GAME, '1', ''), 'TRIAL_CHAPTER');
await fails('unknown trial 401', async () => trials.status('h1', randomUUID()), 'TRIAL_INVALID');

// 4. Portrait from shared manifest (B, no upload): manifest id resolves with kao URL.
const served = trials.asset('h1', issued.trial.trialId, '0');
check('portrait serve', served.mime === 'image/png' && served.url === 'kao/0.png' && served.sha256.length === 64);
await fails('portrait malformed id 422', async () => trials.asset('h1', issued.trial.trialId, 'no-such-id'), 'TRIAL_ASSET_ID');
await fails('portrait unknown 404', async () => trials.asset('h1', issued.trial.trialId, '999999'), 'TRIAL_ASSET_NOT_FOUND');

// A prepared Trial stays on its explicit snapshot while a real draft save
// advances the current revision. No capture/reference substitute in this lane.
{
  const prepared = await trials.issue('h1', GAME, '1', chapterId);
  const beforeRows = JSON.stringify(['trial_sessions', 'trial_assets'].map(table => storage.sql.exec(`SELECT * FROM ${table}`).toArray()));
  const money = game.chapters[chapterId].state.factions[0].money;
  assert.ok(Number.isInteger(money) && money < 8388607);
  const advanced = await drafts.save('h1', GAME, '1', 's9-advance-00000001', 'f'.repeat(64), {
    metadata: { ...game.metadata }, resourceEdits: [{ chapterId, slot: 0, values: { money: money + 1 } }], chapterEdits: [],
  });
  const currentReference = games.snapshotReference('h1', GAME, '2');
  assert.deepEqual(games.snapshotReference('h1', GAME, '1'), originalReference);
  check('real resource save advances to distinct revision2 without replacing reference1', advanced.draftRevision === '2' && currentReference.sourceDigest !== originalReference.sourceDigest && currentReference.rootKey !== originalReference.rootKey);
  check('draft advancement does not change existing Trial rows or bytes', beforeRows === JSON.stringify(['trial_sessions', 'trial_assets'].map(table => storage.sql.exec(`SELECT * FROM ${table}`).toArray())));
  storage.transactionSync(() => trials.commit('h1', prepared.trial, prepared.derived));
  const preparedPack = trials.pack('h1', prepared.trial.trialId);
  const stored = storage.sql.exec('SELECT * FROM trial_assets WHERE trial_id=?', prepared.trial.trialId).toArray();
  check('prepared revision1 commits after revision2 with all eight original assets', preparedPack.binding.draftRevision === '1' && preparedPack.binding.snapshotDigest === originalReference.sourceDigest && stored.length === 8 && stored.every(row => {
    const asset = prepared.derived.find(item => item.assetId === row.asset_id);
    return asset && row.sha256 === asset.sha256 && row.byte_length === asset.byteLength && Buffer.from(row.bytes).equals(asset.bytes);
  }));
  const fresh = await trials.issue('h1', GAME, '2', chapterId);
  storage.transactionSync(() => trials.commit('h1', fresh.trial, fresh.derived));
  const freshPack = trials.pack('h1', fresh.trial.trialId), captured2 = await drafts.captureForCompile('h1', GAME, '2');
  assert.deepEqual(preparedPack.chapter, pack.chapter);
  assert.deepEqual(freshPack.chapter, captured2.game.chapters[chapterId].state);
  check('explicit revision2 Trial has new chapter money and new snapshot binding only', preparedPack.chapter.factions[0].money === money && freshPack.chapter.factions[0].money === money + 1 && freshPack.binding.draftRevision === '2' && freshPack.binding.snapshotDigest === currentReference.sourceDigest && freshPack.binding.manifestDigest !== preparedPack.binding.manifestDigest);
  assert.deepEqual(trials.pack('h1', issued.trial.trialId), pack);
  const unchangedAssets = fresh.derived.filter(item => !['manifest', 'chapter'].includes(item.assetId));
  check('resource-only edit preserves six map assets and the already-running Trial pack', unchangedAssets.length === 6 && unchangedAssets.every(item => item.bytes.equals(prepared.derived.find(old => old.assetId === item.assetId).bytes)));
  const beforeHistoricalIssue = JSON.stringify(['trial_sessions', 'trial_assets'].map(table => storage.sql.exec(`SELECT * FROM ${table}`).toArray()));
  // A new visual capture has a separate current-revision gate; preserving an
  // already prepared Trial does not authorize a new historical capture.
  await assert.rejects(() => trials.issue('h1', GAME, '1', chapterId), error => error instanceof HttpError && error.status === 409 && error.code === 'SOURCE_RUNTIME_CHANGED');
  check('new historical issue refuses without following latest or inserting Trial rows', beforeHistoricalIssue === JSON.stringify(['trial_sessions', 'trial_assets'].map(table => storage.sql.exec(`SELECT * FROM ${table}`).toArray())));
  const captured1 = await drafts.captureForCompile('h1', GAME, '1');
  assert.equal(canonicalDigest(captured1.game, text => createHash('sha256').update(text).digest('hex')), originalDigest);
  assert.equal(canonicalDigest(game, text => createHash('sha256').update(text).digest('hex')), originalDigest);
  for (const pending of [prepared, fresh]) {
    const end = trials.endPreview('h1', pending.trial.trialId);
    storage.transactionSync(() => trials.endCommit('h1', pending.trial.trialId, end));
    assert.equal(trials.status('h1', pending.trial.trialId).state, 'ended');
  }
  check('old source remains immutable and ending new Trials preserves the original active Trial', trials.status('h1', issued.trial.trialId).state === 'active' && games.snapshotReference('h1', GAME, '2').sourceDigest === currentReference.sourceDigest);
}

// 5. End + epoch revocation.
const pv = trials.endPreview('h1', issued.trial.trialId);
check('endPreview explicit', pv.state === 'ended' && pv.endReason === 'explicit');
const fin = trials.endCommit('h1', issued.trial.trialId, pv);
check('endCommit ended', fin.state === 'ended');
await fails('serve after end 401', async () => trials.pack('h1', issued.trial.trialId), 'TRIAL_INVALID');
await fails('author trial issue 404 (ownership first)', async () => trials.issue('h2', GAME, '1', chapterId), 'GAME_NOT_FOUND');
await fails('author full-copy source remains forbidden', async () => catalog.loadFull('h1', REG), 'FULL_COPY_SOURCE_ADMIN_REQUIRED');
actors.h1.epoch = 2;
await fails('epoch revoked 401', async () => trials.status('h1', issued.trial.trialId), 'TRIAL_INVALID');
actors.h1.epoch = 1;

process.stdout.write(`passed ${passed} checks\n`);
} finally { storage.close(); rmSync(scratch, { recursive: true, force: true }); }
