// N3-2: city op end-to-end. (a) FixedCopyProfile accepts a city edit only
// with its op in history, else COPY_PROTECTED_DELTA. (b) Full draft save
// round-trip with a city op on VPS ports. Usage:
// node tools/verify_vps_city_save.mjs
import { mkdtempSync, mkdirSync, cpSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { editChapterResources } from '../web/src/editor/chapterresources.js';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { openStorage } from '../vps/sqlite-port.mjs';
import { FileBucket } from '../vps/file-bucket.mjs';
import { ImmutableBlobStore } from '../server/blobs.js';
import { PrivateWriteJournal } from '../server/privatewrites.js';
import { GameMetadataStore } from '../server/metadata.js';
import { GameSnapshotVerifier } from '../server/snapshots.js';
import { PrivateDrafts } from '../server/drafts.js';
import { FixedCopyProfile, FIXED_COPY_PROFILE } from '../server/copyprofile.js';
import { editChapterCity, disbandFaction, setMonarch, copyChapterInGame, deleteChapter, renameChapter, renameGeneral } from '../web/src/content/authoring/gamesource.js';
import { encodeSourceChunks, canonicalSourceTokens } from '../web/src/content/authoring/sourcejson.js';
import { HttpError, fail } from '../server/security.js';
import { createPinnedCopyLoader } from './editor_trusted_copy.mjs';

const nativeOnly = process.argv[2] === '--native-only';
assert.ok(process.argv.length === 2 || nativeOnly && process.argv.length === 3);
const tracked = ['server/drafts.js', 'server/copyprofile.js', 'server/metadata.js', 'server/snapshots.js', 'server/privatewrites.js', 'vps/sqlite-port.mjs', 'vps/file-bucket.mjs', 'web/src/content/authoring/gamesource.js', 'tools/editor_trusted_copy.mjs', 'tools/verify_vps_city_save.mjs'];
const sourceHashes = Object.fromEntries(tracked.map(path => [path, createHash('sha256').update(readFileSync(path)).digest('hex')]));
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

// (a) Profile level, no backend.
const loader = createPinnedCopyLoader();
const { game: baseGame } = await loader({ gameId: 'city-prof', ownerId: 'o' });
const profile = new FixedCopyProfile({ loadCopy: async () => ({ game: baseGame, provenance: { registryId: 'x' } }) });
const captured = await profile.capture({ gameId: 'city-prof', ownerId: 'o' });
const ch0 = baseGame.chapterOrder[0];
const rec0 = baseGame.chapters[ch0].state.cities[0];
const op = { op: 'city', chapterId: ch0, cityIdx: rec0.idx, values: { troops: rec0.troops - 1 } };
const candidate = editChapterCity(baseGame, ch0, rec0.idx, { troops: rec0.troops - 1 });
const proof = profile.verify(captured.capability, candidate, [op]);
check('profile accepts city op', proof.sourceDigest !== captured.baselineDigest);
await fails('profile rejects unlisted edit', async () => profile.verify(captured.capability, candidate, []), 'COPY_PROTECTED_DELTA');
await fails('profile rejects bad keys', async () => profile.verify(captured.capability, candidate, [{ op: 'city', chapterId: ch0, cityIdx: rec0.idx, values: { owner: 1 } }]), 'COPY_PROTECTED_DELTA');

// (b) Save round-trip on VPS ports.
const OWNER = '99999999-9999-4999-8999-999999999999';
const scratch = mkdtempSync(join(tmpdir(), 'vps-city-'));
const sourceDirectory = join(scratch, 'source');
mkdirSync(sourceDirectory);
const storage = openStorage(join(sourceDirectory, 'editor.sqlite'));
storage.transactionSync(() => {
  storage.sql.exec("CREATE TABLE users (id TEXT PRIMARY KEY, account TEXT UNIQUE NOT NULL, role TEXT NOT NULL, password_hash TEXT NOT NULL, disabled INTEGER NOT NULL, must_change INTEGER NOT NULL, epoch INTEGER NOT NULL, version INTEGER NOT NULL)");
  storage.sql.exec('INSERT INTO users VALUES(?,?,?,?,?,?,?,?)', OWNER, 'author_city', 'author', '{}', 0, 0, 1, 1);
});
const principal = h => { if (h !== 'h1') { fail(401, 'SESSION_INVALID'); } return { id: OWNER, role: 'author', epoch: 1, must_change: 0 }; };
const bucket = new FileBucket({ root: join(sourceDirectory, 'data') });
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
const REG = 'test-reg-city-1', DEF = 'd'.repeat(64), CAT = 'c'.repeat(64);
storage.transactionSync(() => {
  storage.sql.exec('CREATE TABLE IF NOT EXISTS copy_objects (game_id TEXT NOT NULL, sha256 TEXT NOT NULL, byte_length INTEGER NOT NULL, state TEXT NOT NULL, PRIMARY KEY(game_id,sha256))');
  storage.sql.exec('CREATE TABLE IF NOT EXISTS copy_origins (game_id TEXT PRIMARY KEY, registry_id TEXT NOT NULL, definition_digest TEXT NOT NULL, catalog_root TEXT NOT NULL, profile_revision TEXT NOT NULL, baseline_root TEXT NOT NULL, baseline_length INTEGER NOT NULL, baseline_digest TEXT NOT NULL, source_digest TEXT NOT NULL, dependency_digest TEXT NOT NULL)');
  storage.sql.exec('CREATE TABLE IF NOT EXISTS installed_sources (registry_id TEXT PRIMARY KEY, definition_digest TEXT NOT NULL, root_digest TEXT NOT NULL, root_byte_length INTEGER NOT NULL, row_revision TEXT NOT NULL, registered_by TEXT NOT NULL, registered_at TEXT NOT NULL)');
  storage.sql.exec('INSERT INTO installed_sources VALUES(?,?,?,?,?,?,?)', REG, DEF, CAT, 1, '1', OWNER, new Date().toISOString());
  storage.sql.exec('INSERT INTO copy_objects VALUES(?,?,?,?)', GAME, gRoot.sha256, gRoot.byteLength, 'committed');
  storage.sql.exec('INSERT INTO copy_origins VALUES(?,?,?,?,?,?,?,?,?,?)', GAME, REG, DEF, CAT, FIXED_COPY_PROFILE, gRoot.sha256, gRoot.byteLength, sourceDigest, sourceDigest, depDigestOf(chunks, []));
});
const definition = () => ({ registryId: REG, profileRevision: FIXED_COPY_PROFILE, definitionDigest: DEF });
const drafts = new PrivateDrafts({ storage, principal, games, blobs, definition, operationGuard: () => {} });
const snap1 = await games.prepareSnapshot('h1', { gameId: GAME, draftRevision: '1', metadata: { ...game.metadata }, source: { sha256: gRoot.sha256, byteLength: gRoot.byteLength }, allocation });
games.transaction('h1', { key: 'city-create-00000001', method: 'create', target: 'new', digest: 'd'.repeat(64) }, api => api.create(allocation, snap1));

const createdSummary = games.listOwn('h1')[0];
check('server creation timestamps equal canonical UTC', createdSummary.createdAt === createdSummary.modifiedAt && new Date(createdSummary.createdAt).toISOString() === createdSummary.createdAt);
const gch = game.chapterOrder[0];
const grec = game.chapters[gch].state.cities[0];
const cityOp = { op: 'city', chapterId: gch, cityIdx: grec.idx, values: { troops: grec.troops - 2, prod: grec.prod - 50 } };
const saved = await drafts.save('h1', GAME, '1', 'city-save-0000000001', 'e'.repeat(64),
  { metadata: { ...game.metadata }, resourceEdits: [], chapterEdits: [cityOp] });
check('city save rev2', saved.draftRevision === '2');
const modifiedSummary = games.listOwn('h1')[0];
check('saved list timestamp preserves creation and uses canonical UTC', modifiedSummary.createdAt === createdSummary.createdAt && new Date(modifiedSummary.modifiedAt).toISOString() === modifiedSummary.modifiedAt && modifiedSummary.draftRevision === '2');
const readGame = (await drafts.captureForCompile('h1', GAME, '2')).game;
const gotCity = readGame.chapters[gch].state.cities.find(c => c.idx === grec.idx);
check('city values visible', gotCity.troops === grec.troops - 2 && gotCity.prod === grec.prod - 50);
if (nativeOnly) {
  const nativeOp = { op: 'city-native', chapterId: gch, cityIdx: grec.idx, values: { prod: grec.prod - 256 } };
  const body = { metadata: { ...game.metadata }, resourceEdits: [], chapterEdits: [nativeOp] };
  const key = 'city-native-save-0001', digest = '9'.repeat(64);
  check('legacy save retains initial static table', JSON.stringify(readGame.chapters[gch].state.nativeCityRecordRaw) === JSON.stringify(game.chapters[gch].state.nativeCityRecordRaw));
  const nativeSaved = await drafts.save('h1', GAME, '2', key, digest, body);
  check('native save commits revision3', nativeSaved.draftRevision === '3');
  const current = (await drafts.captureForCompile('h1', GAME, '3')).game;
  const actual = current.chapters[gch].state.cities.find(c => c.idx === grec.idx);
  const nativeRaw = current.chapters[gch].state.nativeCityRecordRaw[grec.idx];
  check('native prod agrees with named and per-city raw', actual.prod === grec.prod - 256 && nativeRaw.slice(28, 32) === actual.raw.slice(28, 32));
  check('unrequested legacy troop difference stays explicit', actual.troops === gotCity.troops && nativeRaw.slice(38, 40) === grec.raw.slice(38, 40));
  const expected = editChapterCity(readGame, gch, grec.idx, nativeOp.values);
  const oldStatic = readGame.chapters[gch].state.nativeCityRecordRaw[grec.idx];
  expected.chapters[gch].state.nativeCityRecordRaw[grec.idx] = `${oldStatic.slice(0, 28)}${actual.raw.slice(28, 32)}${oldStatic.slice(32)}`;
  assert.deepEqual(current, expected);
  check('all unrelated fields and chapters preserved', true);
  const originalRow = storage.sql.exec('SELECT request_json FROM draft_requests WHERE actor=? AND op_key=?', OWNER, 'city-save-0000000001').toArray()[0];
  const nativeRow = storage.sql.exec('SELECT request_json FROM draft_requests WHERE actor=? AND op_key=?', OWNER, key).toArray()[0];
  let storedHistory;
  try { storedHistory = [JSON.parse(originalRow.request_json), JSON.parse(nativeRow.request_json)]; }
  catch (cause) { throw new Error('owned persisted city history is invalid JSON', { cause }); }
  check('stored operations keep distinct history names', storedHistory[0].chapterEdits[0].op === 'city' && storedHistory[1].chapterEdits[0].op === 'city-native');
  const objectCount = () => storage.sql.exec('SELECT COUNT(*) AS n FROM draft_objects').toArray()[0].n;
  const beforeReplay = objectCount();
  assert.deepEqual(await drafts.save('h1', GAME, '2', key, digest, body), nativeSaved);
  check('committed original-key replay does not write objects', objectCount() === beforeReplay);
  const queried = drafts.query('h1', GAME, key);
  check('query returns original committed revision', queried.state === 'committed' && queried.result.draftRevision === '3');
  await fails('same key cannot change native to legacy', () => drafts.save('h1', GAME, '2', key, digest, { ...body, chapterEdits: [{ ...nativeOp, op: 'city' }] }), 'IDEMPOTENCY_CONFLICT');
  await fails('stale native CAS rejected', () => drafts.save('h1', GAME, '2', 'city-native-stale-001', digest, body), 'DRAFT_CHANGED');
  await fails('native does not open defence', () => drafts.save('h1', GAME, '3', 'city-native-field-001', digest, { ...body, chapterEdits: [{ ...nativeOp, values: { defence: 1 } }] }), 'DRAFT_CHAPTER_EDITS');
  await fails('native does not open growth', () => drafts.save('h1', GAME, '3', 'city-native-field-002', digest, { ...body, chapterEdits: [{ ...nativeOp, values: { growth: 100 } }] }), 'DRAFT_CHAPTER_EDITS');
  const conditionDTO = await drafts.read('h1', GAME, '3');
  assert.equal(conditionDTO.chapters.flatMap(chapter => chapter.cities).length, 3840);
  for (const chapter of conditionDTO.chapters) for (const city of chapter.cities) {
    const source = current.chapters[chapter.chapterId].state.cities.find(row => row.idx === city.idx);
    assert.deepEqual([city.growth, city.defence], [source.growth, source.defence]);
    assert.equal(city.typeCode, source.type ?? null);
    assert.deepEqual([city.faction, city.governor], [source.faction ?? null, source.governor ?? null]);
  }
  check('read-only condition projection matches all 3840 source cities', true);
  check('read-only type codes match all 3840 exact saved source cities', true);
  check('read-only faction and governor values match all 3840 exact saved source cities', true);
  assert.equal(conditionDTO.chapters.length, 20);
  for (const chapter of conditionDTO.chapters) assert.deepEqual(chapter.startDate, current.chapters[chapter.chapterId].state.start);
  check('read-only chapter start dates match all 20 exact saved chapter sources', true);
  assert.equal(conditionDTO.chapters.flatMap(chapter => chapter.generals).length, 2560);
  for (const chapter of conditionDTO.chapters) for (const general of chapter.generals) {
    const source = current.chapters[chapter.chapterId].state.generals.find(row => row.idx === general.idx);
    assert.deepEqual([general.portrait, general.portraitKey], [source.portrait ?? null, source.portraitKey ?? null]);
    assert.deepEqual(general.ability, source.ability ?? null);
    assert.equal(general.specialtyLowBits, source.specialty_low_bits ?? null);
  }
  check('readonly original portraits and overrides match all 2560 saved general slots', true);
  check('readonly abilities and unknown specialty low bits match all 2560 saved general slots', true);
  check('rejected requests and condition read do not stage objects', objectCount() === beforeReplay);
  assert.deepEqual((await drafts.captureForCompile('h1', GAME, '2')).game, readGame);
  check('legacy revision remains exactly readable', true);
  for (const [path, hash] of Object.entries(sourceHashes)) assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'), hash);
  storage.close(); rmSync(scratch, { recursive: true, force: true });
  assert.equal(process.exitCode ?? 0, 0);
  process.stdout.write(`${JSON.stringify({ result: 'PASS-CITY-NATIVE-VPS-PORTS', checks: passed, sourceHashes, scope: 'Owned file SQLite/FileBucket and real draft service; seeded principal/origin ports, not HTTP/login/browser or template initialization.' })}\n`);
} else {
const readDTO = await drafts.read('h1', GAME, '2');
const sourceIds = readDTO.chapters.flatMap(c => c.generals.filter(g => g.idx !== 127).map(g => g.sourceRecordId));
check('2540 independent source record IDs project from verified chapter bindings', sourceIds.length === 2540 && new Set(sourceIds).size === 2540 && readDTO.chapters.every(c => c.generals.every(g => g.idx === 127 ? g.sourceRecordId === null : g.sourceRecordId === game.sourceRecords.bindings[c.chapterId].slotMap[g.idx])));
const readCap = readDTO.chapters.find(c => c.chapterId === gch).cities.find(c => c.idx === grec.idx);
check('read projection caps', readCap.troopsCap === grec.troops_cap && readCap.maxProd === grec.max_prod);
check('all strongholds expose bounded reference arrays', readDTO.strongholds.length === 192 && readDTO.strongholds.every(row => Array.isArray(row.references)));
const cityRefs = readDTO.strongholds.find(row => row.runtimeSlot === grec.idx).references;
const capitals = game.chapterOrder.flatMap(chapterId => game.chapters[chapterId].state.factions.filter(f => f.capital === grec.idx).map(f => ({ chapterId, factionIdx: f.idx })));
check('capital reference DTO matches all actual chapter fields', cityRefs.filter(row => row.code === 'CITY_CAPITAL_REF').length === capitals.length && capitals.every(ref => cityRefs.some(row => row.chapterId === ref.chapterId && row.code === 'CITY_CAPITAL_REF' && row.detail === `勢力 #${ref.factionIdx} 首都`)));
await fails('city over cap 422', async () => drafts.save('h1', GAME, '2', 'city-save-0000000002', 'e'.repeat(64),
  { metadata: { ...game.metadata }, resourceEdits: [], chapterEdits: [{ op: 'city', chapterId: gch, cityIdx: grec.idx, values: { troops: grec.troops_cap + 1 } }] }), 'DRAFT_CHAPTER_EDIT');
await fails('city bad shape 422', async () => drafts.save('h1', GAME, '2', 'city-save-0000000003', 'e'.repeat(64),
  { metadata: { ...game.metadata }, resourceEdits: [], chapterEdits: [{ op: 'city', chapterId: gch, cityIdx: grec.idx, values: { owner: 1 } }] }), 'DRAFT_CHAPTER_EDITS');

check('read-only and rejected writes do not change list timestamps', games.listOwn('h1')[0].modifiedAt === modifiedSummary.modifiedAt);

// Repeated operations must preserve the other authorized raw field while the
// full persisted history is verified on every save and exact-revision read.
const saved3 = await drafts.save('h1', GAME, '2', 'city-save-0000000004', 'f'.repeat(64),
  { metadata: { ...game.metadata }, resourceEdits: [], chapterEdits: [{ op: 'city', chapterId: gch, cityIdx: grec.idx, values: { troops: grec.troops } }] });
check('second city save rev3', saved3.draftRevision === '3');
const city3 = (await drafts.captureForCompile('h1', GAME, '3')).game.chapters[gch].state.cities.find(c => c.idx === grec.idx);
const expected3 = editChapterCity(game, gch, grec.idx, { prod: grec.prod - 50 }).chapters[gch].state.cities.find(c => c.idx === grec.idx);
check('second city raw preserves prior production edit', city3.raw === expected3.raw && city3.troops === grec.troops && city3.prod === grec.prod - 50);
const saved4 = await drafts.save('h1', GAME, '3', 'city-save-0000000005', 'a'.repeat(64),
  { metadata: { ...game.metadata }, resourceEdits: [], chapterEdits: [{ op: 'city', chapterId: gch, cityIdx: grec.idx, values: { prod: grec.prod } }] });
check('third city save rev4', saved4.draftRevision === '4');
const city4 = (await drafts.captureForCompile('h1', GAME, '4')).game.chapters[gch].state.cities.find(c => c.idx === grec.idx);
check('third city raw returns exactly to baseline', city4.raw === grec.raw && city4.troops === grec.troops && city4.prod === grec.prod);

const saved5 = await drafts.save('h1', GAME, '4', 'city-save-0000000006', 'b'.repeat(64),
  { metadata: { ...game.metadata }, resourceEdits: [], chapterEdits: [{ op: 'copy', chapterId: gch }] });
check('copy saved as rev5', saved5.draftRevision === '5');
const copy5 = (await drafts.captureForCompile('h1', GAME, '5')).game;
const copiedChapterId = copy5.chapterOrder.at(-1);
check('copy independent chapter ID', copiedChapterId !== gch && copy5.chapterOrder.length === game.chapterOrder.length + 1);
const saved6 = await drafts.save('h1', GAME, '5', 'city-save-0000000007', 'c'.repeat(64),
  { metadata: { ...game.metadata }, resourceEdits: [], chapterEdits: [
    { op: 'city', chapterId: copiedChapterId, cityIdx: grec.idx, values: { troops: grec.troops - 1 } },
    { op: 'rename-general', chapterId: copiedChapterId, generalIdx: 0, values: { name: '副本武將', hao: '副本字' } },
  ] });
check('copied entity edits saved as rev6', saved6.draftRevision === '6');
const copy6 = (await drafts.captureForCompile('h1', GAME, '6')).game;
check('copied city and general edits persisted', copy6.chapters[copiedChapterId].state.cities.find(c => c.idx === grec.idx).troops === grec.troops - 1 && copy6.chapters[copiedChapterId].state.generals[0].name === '副本武將' && copy6.chapters[copiedChapterId].state.generals[0].hao === '副本字');
check('source chapter stays unchanged', [...canonicalSourceTokens(copy6.chapters[gch])].join('') === [...canonicalSourceTokens(copy5.chapters[gch])].join(''));

const saved7 = await drafts.save('h1', GAME, '6', 'city-save-0000000008', 'd'.repeat(64),
  { metadata: { ...game.metadata }, resourceEdits: [], chapterEdits: [{ op: 'copy', chapterId: copiedChapterId }] });
check('edited source copy saved as rev7', saved7.draftRevision === '7');
const copy7 = (await drafts.captureForCompile('h1', GAME, '7')).game, descendantId = copy7.chapterOrder.at(-1);
check('descendant preserves complete edited source state', descendantId !== copiedChapterId && [...canonicalSourceTokens(copy7.chapters[descendantId].state)].join('') === [...canonicalSourceTokens(copy6.chapters[copiedChapterId].state)].join(''));
const saved8 = await drafts.save('h1', GAME, '7', 'city-save-0000000009', 'e'.repeat(64),
  { metadata: { ...game.metadata }, resourceEdits: [], chapterEdits: [
    { op: 'city', chapterId: copiedChapterId, cityIdx: grec.idx, values: { troops: grec.troops } },
    { op: 'rename-general', chapterId: copiedChapterId, generalIdx: 0, values: { name: '後續改名' } },
  ] });
check('later source edits saved as rev8', saved8.draftRevision === '8');
const copy8 = (await drafts.captureForCompile('h1', GAME, '8')).game;
check('later source edits do not change descendant', [...canonicalSourceTokens(copy8.chapters[descendantId])].join('') === [...canonicalSourceTokens(copy7.chapters[descendantId])].join('') && copy8.chapters[copiedChapterId].state.generals[0].name === '後續改名');
// Quiesced owned-directory restore: no live SQL file copying, production
// backup input, authentication assertion, remote root or deletion-policy claim.
const beforeRestore = await drafts.read('h1', GAME, '8');
check('copied chapters without source bindings do not borrow original identity', [copiedChapterId, descendantId].every(id => beforeRestore.chapters.find(c => c.chapterId === id).generals.every(g => g.sourceRecordId === null)));
const beforeReference = games.snapshotReference('h1', GAME, '8');
const beforeReceipt = drafts.query('h1', GAME, 'city-save-0000000009');
storage.close();
function treeDigest(root) {
  const hash = createHash('sha256');
  function visit(directory, prefix = '') {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const name = prefix + entry.name, path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path, name + '/');
      else if (entry.isFile()) hash.update(name + '\0').update(readFileSync(path));
      else throw new Error('owned restore fixture must not contain links');
    }
  }
  visit(root); return hash.digest('hex');
}
const originalDigest = treeDigest(sourceDirectory), restoredDirectory = join(scratch, 'restored');
cpSync(sourceDirectory, restoredDirectory, { recursive: true, errorOnExist: true, force: false });
check('quiesced copied SQL and objects match byte-for-byte', treeDigest(restoredDirectory) === originalDigest);
function openRestored(directory) {
  const store = openStorage(join(directory, 'editor.sqlite'));
  const objects = new FileBucket({ root: join(directory, 'data') });
  const writes = new PrivateWriteJournal({ storage: store, bucket: objects });
  const immutable = new ImmutableBlobStore({ bucket: writes, authority, storage: store });
  const snapshots = new GameSnapshotVerifier({ blobs: immutable });
  const metadata = new GameMetadataStore({ storage: store, principal, verifySnapshot: input => snapshots.verify(input.tokenHash, input), recoverAllocation: () => { fail(503, 'COPY_NOT_CONFIGURED'); } });
  const service = new PrivateDrafts({ storage: store, principal, games: metadata, blobs: immutable, definition, operationGuard: () => {} });
  return { store, metadata, service };
}
const restored = openRestored(restoredDirectory);
try {
  check('restored SQLite integrity', restored.store.sql.exec('PRAGMA integrity_check').toArray()[0].integrity_check === 'ok');
  check('restored draft projection exact', JSON.stringify(await restored.service.read('h1', GAME, '8')) === JSON.stringify(beforeRestore));
  check('restored snapshot binding exact', JSON.stringify(restored.metadata.snapshotReference('h1', GAME, '8')) === JSON.stringify(beforeReference));
  check('restored committed operation receipt exact', JSON.stringify(restored.service.query('h1', GAME, 'city-save-0000000009')) === JSON.stringify(beforeReceipt));
  const saved9 = await restored.service.save('h1', GAME, '8', 'restore-save-00000001', 'f'.repeat(64), { metadata: { ...copy8.metadata, introduction: '恢復驗證' }, resourceEdits: [], chapterEdits: [] });
  check('restored service can save next CAS revision', saved9.draftRevision === '9');
  const restored9 = await restored.service.read('h1', GAME, '9');
  check('restored save preserves all chapter projections', restored9.metadata.introduction === '恢復驗證' && JSON.stringify(restored9.chapters) === JSON.stringify(beforeRestore.chapters));
} finally { restored.store.close(); }
const reopened = openRestored(restoredDirectory);
try {
  check('restored save survives a second service construction', (await reopened.service.read('h1', GAME, '9')).metadata.introduction === '恢復驗證');
  await fails('restored stale CAS still refuses writes', () => reopened.service.save('h1', GAME, '8', 'restore-stale-0000001', 'a'.repeat(64), { metadata: { ...copy8.metadata }, resourceEdits: [], chapterEdits: [] }), 'DRAFT_CHANGED');
  const advisorFaction = copy8.chapters[gch].state.factions.find(row => Number.isInteger(row.advisor_idx));
  if (!advisorFaction) throw new Error('owned fixture requires an existing advisor');
  const advisorEdits = [
    { op: 'set-strategist', chapterId: gch, factionIdx: advisorFaction.idx, generalIdx: null },
    { op: 'copy', chapterId: gch },
    { op: 'set-strategist', chapterId: gch, factionIdx: advisorFaction.idx, generalIdx: advisorFaction.advisor_idx },
  ];
  const saved10 = await reopened.service.save('h1', GAME, '9', 'restore-advisor-copy-01', 'b'.repeat(64), { metadata: { ...copy8.metadata, introduction: '恢復驗證' }, resourceEdits: [], chapterEdits: advisorEdits });
  check('advisor edit and captured copy commit as rev10', saved10.draftRevision === '10');
  const advisor10 = (await reopened.service.captureForCompile('h1', GAME, '10')).game;
  const expectedState = structuredClone(copy8.chapters[gch].state);
  expectedState.factions.find(row => row.idx === advisorFaction.idx).advisor_idx = null;
  check('copy retains complete state at advisor-edit time', [...canonicalSourceTokens(advisor10.chapters[advisor10.chapterOrder.at(-1)].state)].join('') === [...canonicalSourceTokens(expectedState)].join(''));
  check('restoring source advisor does not alter captured copy', [...canonicalSourceTokens(advisor10.chapters[gch])].join('') === [...canonicalSourceTokens(copy8.chapters[gch])].join(''));
  const roleChapter = advisor10.chapterOrder.at(-1), roleState = advisor10.chapters[roleChapter].state;
  const removedFaction = roleState.factions[0], receivingFaction = roleState.factions[1];
  const roleEdits = [
    { op: 'disband-faction', chapterId: roleChapter, factionIdx: removedFaction.idx, confirm: true },
    { op: 'set-monarch', chapterId: roleChapter, factionIdx: receivingFaction.idx, generalIdx: removedFaction.monarch_idx },
    { op: 'copy', chapterId: roleChapter },
  ];
  const expectedRoles = structuredClone(advisor10);
  disbandFaction(expectedRoles, roleChapter, removedFaction.idx);
  setMonarch(expectedRoles, roleChapter, receivingFaction.idx, removedFaction.monarch_idx);
  const saved11 = await reopened.service.save('h1', GAME, '10', 'restore-copied-roles-01', 'c'.repeat(64), { metadata: { ...copy8.metadata, introduction: '恢復驗證' }, resourceEdits: [], chapterEdits: roleEdits });
  check('copied chapter role edits and descendant commit as rev11', saved11.draftRevision === '11');
  const roles11 = (await reopened.service.captureForCompile('h1', GAME, '11')).game;
  const canonical = value => [...canonicalSourceTokens(value)].join('');
  check('copied role state and descendant preserve exact writer output', canonical(roles11.chapters[roleChapter].state) === canonical(expectedRoles.chapters[roleChapter].state) && canonical(roles11.chapters[roles11.chapterOrder.at(-1)].state) === canonical(expectedRoles.chapters[roleChapter].state));
  check('copied role edits leave every other chapter unchanged', advisor10.chapterOrder.filter(chapterId => chapterId !== roleChapter).every(chapterId => canonical(roles11.chapters[chapterId]) === canonical(advisor10.chapters[chapterId])));
  const temporaryId = copyChapterInGame(structuredClone(roles11), gch);
  const transientEdits = [
    { op: 'copy', chapterId: gch },
    { op: 'disband-faction', chapterId: temporaryId, factionIdx: removedFaction.idx, confirm: true },
    { op: 'set-monarch', chapterId: temporaryId, factionIdx: receivingFaction.idx, generalIdx: removedFaction.monarch_idx },
    { op: 'delete', chapterId: temporaryId },
  ];
  const reference11 = reopened.metadata.snapshotReference('h1', GAME, '11');
  const unchanged11 = await reopened.service.save('h1', GAME, '11', 'restore-role-delete-01', 'd'.repeat(64), { metadata: { ...copy8.metadata, introduction: '恢復驗證' }, resourceEdits: [], chapterEdits: transientEdits });
  const transientReceipt = reopened.service.query('h1', GAME, 'restore-role-delete-01');
  check('temporary copied role deletion acknowledges unchanged revision', unchanged11.draftRevision === '11' && transientReceipt.state === 'committed' && transientReceipt.result.draftRevision === '11');
  check('temporary role deletion retains exact source identity', reopened.metadata.snapshotReference('h1', GAME, '11').sourceDigest === reference11.sourceDigest);
  check('temporary role deletion changes no surviving source content', canonical((await reopened.service.captureForCompile('h1', GAME, '11')).game) === canonical(roles11));
  const expectedTitles = structuredClone(roles11);
  renameChapter(expectedTitles, gch, '來源改名');
  const titledCopy = copyChapterInGame(expectedTitles, gch);
  renameChapter(expectedTitles, titledCopy, '副本改名');
  const titledDescendant = copyChapterInGame(expectedTitles, titledCopy);
  const titleEdits = [{ op: 'rename', chapterId: gch, name: '來源改名' }, { op: 'copy', chapterId: gch }, { op: 'rename', chapterId: titledCopy, name: '副本改名' }, { op: 'copy', chapterId: titledCopy }];
  const savedTitles = await reopened.service.save('h1', GAME, '11', 'restore-copy-titles-01', 'f'.repeat(64), { metadata: { ...copy8.metadata, introduction: '恢復驗證' }, resourceEdits: [], chapterEdits: titleEdits });
  check('rename and copy lineage commits as rev12', savedTitles.draftRevision === '12');
  const titles12 = (await reopened.service.captureForCompile('h1', GAME, '12')).game;
  check('captured copy title follows actual renamed source', titles12.chapters[titledDescendant].name === '副本改名（副本）' && titles12.chapters[titledDescendant].sourceChapterId === expectedTitles.chapters[titledDescendant].sourceChapterId);
  check('rename and copy preserve exact complete expected source', canonical(titles12) === canonical(expectedTitles));
  const discardId = copyChapterInGame(structuredClone(titles12), gch);
  const discardFaction = titles12.chapters[gch].state.factions[0].idx;
  const discardEdits = [
    { op: 'copy', chapterId: gch },
    { op: 'set-strategist', chapterId: discardId, factionIdx: discardFaction, generalIdx: null },
    { op: 'portrait', chapterId: discardId, generalIdx: 0, portraitKey: '1' },
    { op: 'delete', chapterId: discardId },
  ];
  const reference12 = reopened.metadata.snapshotReference('h1', GAME, '12');
  const discarded = await reopened.service.save('h1', GAME, '12', 'restore-discard-fields-01', 'a'.repeat(64), { metadata: titles12.metadata, resourceEdits: [], chapterEdits: discardEdits });
  const discardedReceipt = reopened.service.query('h1', GAME, 'restore-discard-fields-01');
  check('discarded advisor and portrait edits acknowledge unchanged revision', discarded.draftRevision === '12' && discardedReceipt.state === 'committed' && discardedReceipt.result.draftRevision === '12');
  check('discarded field edits preserve full snapshot reference', canonical(reopened.metadata.snapshotReference('h1', GAME, '12')) === canonical(reference12));
  check('discarded field edits change no surviving source', canonical((await reopened.service.captureForCompile('h1', GAME, '12')).game) === canonical(titles12));
  const invalidDiscard = discardEdits.map(edit => edit.op === 'portrait' ? { ...edit, portraitKey: '../bad' } : edit);
  await fails('deletion cannot hide an invalid portrait operation', () => reopened.service.save('h1', GAME, '12', 'restore-discard-invalid-01', 'b'.repeat(64), { metadata: titles12.metadata, resourceEdits: [], chapterEdits: invalidDiscard }), 'DRAFT_CHAPTER_EDIT');
  check('rejected discard records failure without changing source', reopened.service.query('h1', GAME, 'restore-discard-invalid-01').state === 'failed' && canonical((await reopened.service.captureForCompile('h1', GAME, '12')).game) === canonical(titles12));
  const expectedDetached = structuredClone(titles12);
  deleteChapter(expectedDetached, roleChapter);
  const detached = await reopened.service.save('h1', GAME, '12', 'restore-dependent-delete-01', 'e'.repeat(64), { metadata: titles12.metadata, resourceEdits: [], chapterEdits: [{ op: 'delete', chapterId: roleChapter }] });
  check('delete copied source with retained descendant commits rev13', detached.draftRevision === '13');
  const detached13 = (await reopened.service.captureForCompile('h1', GAME, '13')).game;
  check('deleting copied source preserves exact independent descendants and other data', canonical(detached13) === canonical(expectedDetached));
  check('deleting copied source retains immutable prior snapshot', canonical((await reopened.service.captureForCompile('h1', GAME, '12')).game) === canonical(titles12));
  const compactChapter = roles11.chapterOrder.at(-1);
  const compactState = detached13.chapters[compactChapter].state, survivor = compactState.factions[0];
  assert.notEqual(survivor.idx, 0);
  const compactDTO = await reopened.service.read('h1', GAME, '13');
  check('compacted public resource rows retain native slot identity', compactDTO.chapters.find(row => row.chapterId === compactChapter).factions.every((row, index) => row.slot === compactState.factions[index].idx));
  const resourceValues = { money: survivor.money + 1, reserve_inf: survivor.reserve_inf + 1 };
  const expectedResources = editChapterResources(detached13, compactChapter, survivor.idx, resourceValues);
  const resource14 = await reopened.service.save('h1', GAME, '13', 'restore-compacted-resource-01', 'f'.repeat(64), { metadata: detached13.metadata, resourceEdits: [{ chapterId: compactChapter, slot: survivor.idx, values: resourceValues }], chapterEdits: [] });
  check('compacted faction resource save commits rev14', resource14.draftRevision === '14');
  check('compacted resource save changes only expected named and native fields', canonical((await reopened.service.captureForCompile('h1', GAME, '14')).game) === canonical(expectedResources));
  await fails('removed faction native slot is not editable through resource API', () => reopened.service.save('h1', GAME, '14', 'restore-removed-resource-01', 'a'.repeat(64), { metadata: detached13.metadata, resourceEdits: [{ chapterId: compactChapter, slot: removedFaction.idx, values: { money: 1 } }], chapterEdits: [] }), 'DRAFT_RESOURCE_DELTA');
  const fundedFaction = expectedResources.chapters[gch].state.factions[0];
  const funding = { money: fundedFaction.money + 1, reserve_cav: fundedFaction.reserve_cav + 1 };
  const expectedFunded = editChapterResources(expectedResources, gch, fundedFaction.idx, funding);
  disbandFaction(expectedFunded, gch, fundedFaction.idx);
  const funded15 = await reopened.service.save('h1', GAME, '14', 'restore-funded-disband-01', 'b'.repeat(64), { metadata: expectedResources.metadata, resourceEdits: [{ chapterId: gch, slot: fundedFaction.idx, values: funding }], chapterEdits: [{ op: 'disband-faction', chapterId: gch, factionIdx: fundedFaction.idx, confirm: true }] });
  check('resource edit followed by disband commits rev15', funded15.draftRevision === '15');
  check('funded disband preserves exact existing writer output and other chapters', canonical((await reopened.service.captureForCompile('h1', GAME, '15')).game) === canonical(expectedFunded));
  check('funded disband preserves immutable prior source', canonical((await reopened.service.captureForCompile('h1', GAME, '14')).game) === canonical(expectedResources));
  const expectedReuse = structuredClone(expectedFunded), reuseEdits = [];
  const reuseSource = expectedReuse.chapterOrder[1], replacementSource = expectedReuse.chapterOrder[2];
  const appendCopy = chapterId => { const copiedId = copyChapterInGame(expectedReuse, chapterId); reuseEdits.push({ op: 'copy', chapterId }); return copiedId; };
  const reuseParent = appendCopy(reuseSource), reuseChild = appendCopy(reuseParent);
  renameGeneral(expectedReuse, reuseChild, 0, { name: '舊輪武將' });
  reuseEdits.push({ op: 'rename-general', chapterId: reuseChild, generalIdx: 0, values: { name: '舊輪武將' } });
  const retainedLeaf = appendCopy(reuseChild);
  for (const chapterId of [reuseParent, reuseChild]) { deleteChapter(expectedReuse, chapterId); reuseEdits.push({ op: 'delete', chapterId }); }
  const replacementId = appendCopy(replacementSource);
  // Earlier service cases left gaps: the allocator may reuse either deleted
  // ancestor, not necessarily the child chosen by the pristine model fixture.
  assert.ok([reuseParent, reuseChild].includes(replacementId)); assert.ok(reuseEdits.length <= 16);
  const reused16 = await reopened.service.save('h1', GAME, '15', 'restore-copy-generation-01', 'c'.repeat(64), { metadata: expectedFunded.metadata, resourceEdits: [], chapterEdits: reuseEdits });
  check('deleted copy generation can be replaced at same ID in rev16', reused16.draftRevision === '16');
  const reuse16 = (await reopened.service.captureForCompile('h1', GAME, '16')).game;
  check('reused ID preserves full expected source and old-generation descendant', canonical(reuse16) === canonical(expectedReuse) && reuse16.chapters[retainedLeaf].state.generals[0].name === '舊輪武將');
  check('copy generation replacement preserves immutable rev15', canonical((await reopened.service.captureForCompile('h1', GAME, '15')).game) === canonical(expectedFunded));
  const expectedFundedCopy = structuredClone(reuse16);
  const fundedCopyId = copyChapterInGame(expectedFundedCopy, gch);
  const fundedCopy17 = await reopened.service.save('h1', GAME, '16', 'restore-funded-disband-copy-01', 'd'.repeat(64), { metadata: reuse16.metadata, resourceEdits: [], chapterEdits: [{ op: 'copy', chapterId: gch }] });
  check('copy of previously funded and disbanded faction chapter commits rev17', fundedCopy17.draftRevision === '17');
  const copied17 = (await reopened.service.captureForCompile('h1', GAME, '17')).game;
  check('funded disband copy preserves entire source and original native resources', canonical(copied17) === canonical(expectedFundedCopy) && canonical(copied17.chapters[fundedCopyId].state) === canonical(reuse16.chapters[gch].state));
  check('funded disband copy leaves prior revision immutable', canonical((await reopened.service.captureForCompile('h1', GAME, '16')).game) === canonical(reuse16));
} finally { reopened.store.close(); }
check('restore writes leave original SQL and object tree untouched', treeDigest(sourceDirectory) === originalDigest);
const incompleteDirectory = join(scratch, 'incomplete');
mkdirSync(incompleteDirectory);
cpSync(join(sourceDirectory, 'editor.sqlite'), join(incompleteDirectory, 'editor.sqlite'));
const incomplete = openRestored(incompleteDirectory);
try {
  let rejected = false;
  try { await incomplete.service.read('h1', GAME, '8'); } catch (error) { rejected = error instanceof HttpError; }
  check('database-only restore cannot fabricate a readable draft', rejected);
} finally { incomplete.store.close(); }
rmSync(scratch, { recursive: true, force: true });
console.log(`passed ${passed} checks`);
}
