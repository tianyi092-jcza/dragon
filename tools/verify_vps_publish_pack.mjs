// V1 slice 10: REAL PublishedGames + PublishedPacks on VPS ports with a
// REAL installed-source install and a REAL whole-game compile:
// freeze -> registry pin -> anonymous serve -> republish replaces ->
// unpublish/retire -> corruption fail-closed. Usage:
// node tools/verify_vps_publish_pack.mjs
import { register } from 'node:module';
register('../vps/text-loader.mjs', import.meta.url);
const { openStorage } = await import('../vps/sqlite-port.mjs');
const { FileBucket } = await import('../vps/file-bucket.mjs');
const { ImmutableBlobStore } = await import('../server/blobs.js');
const { PrivateWriteJournal } = await import('../server/privatewrites.js');
const { GameMetadataStore } = await import('../server/metadata.js');
const { GameSnapshotVerifier } = await import('../server/snapshots.js');
const { PrivateDrafts } = await import('../server/drafts.js');
const { InstalledSourceCatalog } = await import('../server/sourcecatalog.js');
const { OwnedRuntimeAssets } = await import('../server/runtimeassets.js');
const { installedSourcePolicy } = await import('../server/sourcecatalogpolicy.js');
const { PublishedGames } = await import('../server/published.js');
const { PublishedPacks, RESERVED_ASSET_IDS } = await import('../server/playpacks.js');
const { GamePortraits } = await import('../server/portraits.js');
const { encodeSourceChunks, canonicalSourceTokens } = await import('../web/src/content/authoring/sourcejson.js');
const { compileTrialSource } = await import('../web/src/content/authoring/trialcompile.js');
const { HttpError, fail } = await import('../server/security.js');
const { createPinnedCopyLoader } = await import('./editor_trusted_copy.mjs');
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { KAO_MANIFEST } from '../web/kao/manifest.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

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

const ADMIN = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const OWNER = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const actors = {
  h1: { id: OWNER, role: 'author', epoch: 1, must_change: 0 },
  ha: { id: ADMIN, role: 'admin', epoch: 1, must_change: 0 },
  h2: { id: 'cccccccc-cccc-4ccc-cccc-cccccccccccc', role: 'author', epoch: 1, must_change: 0 },
};
const principal = h => { if (!actors[h]) { fail(401, 'SESSION_INVALID'); } return actors[h]; };
const scratch = mkdtempSync(join(tmpdir(), 'vps-pub-'));
const storage = openStorage(':memory:');
try {
storage.transactionSync(() => {
  storage.sql.exec("CREATE TABLE users (id TEXT PRIMARY KEY, account TEXT UNIQUE NOT NULL, role TEXT NOT NULL, password_hash TEXT NOT NULL, disabled INTEGER NOT NULL, must_change INTEGER NOT NULL, epoch INTEGER NOT NULL, version INTEGER NOT NULL)");
  storage.sql.exec('INSERT INTO users VALUES(?,?,?,?,?,?,?,?)', ADMIN, 'admin_s10', 'admin', '{}', 0, 0, 1, 1);
  storage.sql.exec('INSERT INTO users VALUES(?,?,?,?,?,?,?,?)', OWNER, 'author_s10', 'author', '{}', 0, 0, 1, 1);
  storage.sql.exec('INSERT INTO users VALUES(?,?,?,?,?,?,?,?)', actors.h2.id, 'author2_s10', 'author', '{}', 0, 0, 1, 1);
});
const bucket = new FileBucket({ root: join(scratch, 'data') });
const journal = new PrivateWriteJournal({ storage, bucket });
const authority = () => ({ ownerId: OWNER, epoch: 1 });
const blobs = new ImmutableBlobStore({ bucket: journal, authority, storage });
const verifier = new GameSnapshotVerifier({ blobs });
const games = new GameMetadataStore({ storage, principal,
  verifySnapshot: input => verifier.verify(input.tokenHash, input),
  recoverAllocation: () => { fail(503, 'COPY_NOT_CONFIGURED'); } });

// 1. Real install (admin) for visuals.
const policy = installedSourcePolicy(readFileSync('server/pinned/world-manifest.txt'), readFileSync('server/pinned/entity-manifest.txt'));
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
  const chunks = [];
  for (let at = 0; at < data.length; at += 1048576) { chunks.push(await stageRaw(data.subarray(at, Math.min(at + 1048576, data.length)))); }
  roleEntries.push({ path: role.path, sha256: role.sha256, byteLength: role.byteLength, chunks });
}
const DEF = catalog.definition().definitionDigest;
const srcIndex = { schema: 'dragon-installed-source-index-1', registryId: REG, definitionDigest: DEF, roles: roleEntries };
const srcRoot = await stageRaw(Buffer.concat(encodeSourceChunks(srcIndex)));
await catalog.install('ha', REG, srcRoot, 's10-install-00000001');
check('install', true);

// 2. Game assembly bound to the real definition.
const allocation = games.allocateGameId('h1');
const GAME = allocation.gameId;
const { game } = await createPinnedCopyLoader()({ gameId: GAME, ownerId: OWNER });
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
const installed = { rootDigest: srcRoot.sha256 };
storage.transactionSync(() => {
  storage.sql.exec('CREATE TABLE IF NOT EXISTS copy_objects (game_id TEXT NOT NULL, sha256 TEXT NOT NULL, byte_length INTEGER NOT NULL, state TEXT NOT NULL, PRIMARY KEY(game_id,sha256))');
  storage.sql.exec('CREATE TABLE IF NOT EXISTS copy_origins (game_id TEXT PRIMARY KEY, registry_id TEXT NOT NULL, definition_digest TEXT NOT NULL, catalog_root TEXT NOT NULL, profile_revision TEXT NOT NULL, baseline_root TEXT NOT NULL, baseline_length INTEGER NOT NULL, baseline_digest TEXT NOT NULL, source_digest TEXT NOT NULL, dependency_digest TEXT NOT NULL)');
  storage.sql.exec('INSERT INTO copy_objects VALUES(?,?,?,?)', GAME, gRoot.sha256, gRoot.byteLength, 'committed');
  storage.sql.exec('INSERT INTO copy_origins VALUES(?,?,?,?,?,?,?,?,?,?)', GAME, REG, DEF, installed.rootDigest, policy.profileRevision, gRoot.sha256, gRoot.byteLength, sourceDigest, sourceDigest, depDigestOf(chunks, []));
});
const drafts = new PrivateDrafts({ storage, principal, games, blobs, definition: () => catalog.definition(), operationGuard: () => {} });
const snap1 = await games.prepareSnapshot('h1', { gameId: GAME, draftRevision: '1', metadata: { ...game.metadata }, source: { sha256: gRoot.sha256, byteLength: gRoot.byteLength }, allocation });
games.transaction('h1', { key: 's10-create-00000001', method: 'create', target: 'new', digest: 'd'.repeat(64) }, api => api.create(allocation, snap1));
await drafts.save('h1', GAME, '1', 's10-save-0000000001', 'e'.repeat(64), { metadata: { ...game.metadata }, resourceEdits: [], chapterEdits: [] });

// 3. Portrait (shared library, B) + freeze + pin + serve.
const portraits = new GamePortraits({ reservedIds: RESERVED_ASSET_IDS });
check('portrait manifest projection', portraits.list().length === KAO_MANIFEST.length && portraits.list().every((row, i) => row.assetId === KAO_MANIFEST[i].id && row.sha256 === KAO_MANIFEST[i].sha256 && row.byteLength === KAO_MANIFEST[i].bytes) && portraits.get('0').mime === 'image/png');
const runtimeAssets = new OwnedRuntimeAssets({ storage, bucket, principal, games, policy, kind: 'visuals' });
const packs = new PublishedPacks({ storage, principal, runtimeAssets, portraits });
const registry = new PublishedGames({ storage, principal });
const compiled = compileTrialSource(game, bytes => createHash('sha256').update(bytes).digest('hex'));
const reference = games.snapshotReference('h1', GAME, '1');
await fails('full-copy source remains admin-only', async () => catalog.loadFull('h1', REG), 'FULL_COPY_SOURCE_ADMIN_REQUIRED');
// Internal prepared-state corruption must not be filtered into a smaller,
// apparently complete portrait manifest. No package is committed on rejection.
for (const field of ['portrait', 'portraitKey', 'generals']) {
  const corrupt = structuredClone(game), state = corrupt.chapters[corrupt.chapterOrder[0]].state;
  if (field === 'generals') state.generals = null;
  else state.generals[0][field] = false;
  await fails(`malformed ${field} cannot disappear from dependency collection`, () => packs.prepare('h1', { game: corrupt, reference, compiled }), 'PLAY_PORTRAIT_CORRUPT');
}
for (const field of ['ordinary255', 'override255', 'last-chapter255']) {
  const updated = structuredClone(game);
  const chapterId = field === 'last-chapter255' ? updated.chapterOrder.at(-1) : updated.chapterOrder[0];
  const general = updated.chapters[chapterId].state.generals[0];
  if (field === 'override255') general.portraitKey = '255';
  else general.portrait = 255;
  // Explicit prepare-port candidates, not persisted copy/formal migrations.
  const candidate = compileTrialSource(updated, bytes => createHash('sha256').update(bytes).digest('hex'));
  check(`${field} still reaches the separate asset boundary`, candidate.sourceDigest !== compiled.sourceDigest);
  const prepared = await packs.prepare('h1', { game: updated, reference, compiled: candidate });
  const snapshot = JSON.parse(packs.snapshotPrepared('h1', prepared).pack.manifest_json);
  check(`${field} retains shared 255 with the manifest SHA`, snapshot.portraits.some(row => row.assetId === '255' && row.sha256 === portraits.get('255').sha256));
  check(`${field} preparation installs no publication rows`, ['published_packs', 'published_pack_chapters', 'published_pack_assets'].every(table => storage.sql.exec(`SELECT COUNT(*) AS n FROM ${table}`).toArray()[0].n === 0));
}
{
  const missing = structuredClone(game);
  missing.chapters[missing.chapterOrder[0]].state.generals[0].portraitKey = '621';
  const candidate = compileTrialSource(missing, bytes => createHash('sha256').update(bytes).digest('hex'));
  await fails('missing shared portrait still rejects preparation', () => packs.prepare('h1', { game: missing, reference, compiled: candidate }), 'PORTRAIT_NOT_FOUND');
}
for (const chapterId of [game.chapterOrder[0], game.chapterOrder.at(-1)]) {
  const corrupt = structuredClone(game);
  corrupt.chapters[chapterId].state.cities[0].view = 255;
  const candidate = compileTrialSource(corrupt, bytes => createHash('sha256').update(bytes).digest('hex'));
  check(`missing city view compiles structurally in ${chapterId}`, candidate.sourceDigest !== compiled.sourceDigest);
  await fails(`missing city view rejects pack preparation in ${chapterId}`, () => packs.prepare('h1', { game: corrupt, reference, compiled: candidate }), 'PLAY_CITY_VIEW_MISSING');
  check(`missing city view installs no rows in ${chapterId}`, ['published_packs', 'published_pack_chapters', 'published_pack_assets'].every(table => storage.sql.exec(`SELECT COUNT(*) AS n FROM ${table}`).toArray()[0].n === 0));
}
const manifest = await packs.buildAndStore('h1', { game, reference, compiled });
check('freeze manifest', manifest.chapters.length === 20 && manifest.portraits.every(p => p.url.startsWith('kao/')) && manifest.identity.sourceDigest === sourceDigest);
const pin = registry.publish('h1', { gameId: GAME, name: 'S10發布', revision: '1', sourceDigest, chapters: [...game.chapterOrder], ordinal: '1.0' });
check('pin', pin.revision === '1' && typeof pin.publishedAt === 'string' && pin.ordinal === '1.0');
check('unlisted release hidden', !registry.list().some(p => p.gameId === GAME));
games.setListed('ha', GAME, true, games.listOwn('h1').find(row => row.gameId === GAME).rowRevision);
check('registry list after admin listing', registry.list().some(p => p.gameId === GAME));
const pack = packs.pack(GAME);
check('pack default chapter', pack.chapterId === game.chapterOrder[0] && pack.manifest.identity.draftRevision === '1');
check('pack explicit', packs.pack(GAME, '1', game.chapterOrder[3]).chapterId === game.chapterOrder[3]);
const terrain = packs.asset(GAME, '1', sourceDigest, 'terrain');
check('asset terrain', terrain.bytes.length > 0 && terrain.mime === 'application/octet-stream');
const mini = packs.asset(GAME, '1', sourceDigest, 'minimapBase');
check('asset minimap mime', mini.mime === 'image/png');
await fails('portrait not embedded', async () => packs.asset(GAME, '1', sourceDigest, 'elder'), 'PLAY_ASSET');
await fails('old rev 409', async () => packs.pack(GAME, '0'), 'PLAY_SNAPSHOT_CHANGED');
await fails('digest mismatch 409', async () => packs.asset(GAME, '1', 'f'.repeat(64), 'terrain'), 'PLAY_SNAPSHOT_CHANGED');
await fails('cross-owner unpublish 403', async () => registry.unpublish('h2', GAME), 'PUBLISH_OWNER');
await fails('bad name 422', async () => registry.publish('h1', { gameId: GAME, name: '   ', revision: '1', sourceDigest, chapters: ['c'], ordinal: '1.0' }), 'PUBLISH_NAME');

// 4. Republish replaces; unpublish/retire close reads.
const read1 = await drafts.read('h1', GAME, '1');
const f0 = read1.chapters[0].factions[0];
await drafts.save('h1', GAME, '1', 's10-save-0000000002', 'e'.repeat(64), { metadata: { ...game.metadata }, resourceEdits: [{ chapterId: read1.chapters[0].chapterId, slot: 0, values: { money: f0.money + 2, reserve_cav: f0.reserve_cav, reserve_arc: f0.reserve_arc, reserve_inf: f0.reserve_inf } }], chapterEdits: [] });
await fails('stale draft visual capture refused', async () => packs.prepare('h1', { game, reference, compiled }), 'SOURCE_RUNTIME_CHANGED');
check('stale preparation preserves live pack', packs.pack(GAME).manifest.identity.draftRevision === '1');
const game2 = (await drafts.captureForCompile('h1', GAME, '2')).game;
const compiled2 = compileTrialSource(game2, bytes => createHash('sha256').update(bytes).digest('hex'));
const ref2 = games.snapshotReference('h1', GAME, '2');
await packs.buildAndStore('h1', { game: game2, reference: ref2, compiled: compiled2 });
registry.publish('h1', { gameId: GAME, name: 'S10發布', revision: '2', sourceDigest: ref2.sourceDigest, chapters: [...game2.chapterOrder], ordinal: '1.1' });
check('republish rev2', packs.pack(GAME).manifest.identity.draftRevision === '2');
await fails('stale rev gone 409', async () => packs.pack(GAME, '1'), 'PLAY_SNAPSHOT_CHANGED');
check('unpublish missing idempotent', registry.unpublish('h1', 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa').unpublished === true);
packs.retire(GAME);
registry.unpublish('h1', GAME);
await fails('retired pack 404', async () => packs.pack(GAME), 'PLAY_UNPUBLISHED');
check('builtin unpublish noop', registry.unpublish('h1', 'wolong-builtin').unpublished === true);
await fails('builtin pack 404', async () => packs.pack('wolong-builtin'), 'PLAY_UNPUBLISHED');

// 5. Corruption fail-closed (terminal states on purpose).
storage.sql.exec("UPDATE published_games SET pin_json='{' WHERE game_id=?", GAME);
registry.publish('h1', { gameId: GAME, name: 'S10發布', revision: '2', sourceDigest: ref2.sourceDigest, chapters: [...game2.chapterOrder], ordinal: '1.1' });
storage.sql.exec("UPDATE published_games SET pin_json='{' WHERE game_id=?", GAME);
// Q25: list() 只读 listed=1，先上架再验 corrupt pin。
storage.sql.exec('UPDATE content_games SET listed=1 WHERE game_id=?', GAME);
await fails('corrupt pin 500', async () => registry.list(), 'PUBLISH_CORRUPT');
storage.sql.exec('DELETE FROM published_games WHERE game_id=?', GAME);

process.stdout.write(`passed ${passed} checks\n`);
} finally { storage.close(); rmSync(scratch, { recursive: true, force: true }); }
