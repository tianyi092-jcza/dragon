// 共享據點投影／一次性遷移（用户 2026-11 决定）：名稱以父表為準；父表缺的
// prod/growth/defence/troops 從當前遊戲第一章同槽記錄回填一次。
// 存檔年代早於這條合同的遊戲（生產基線 = 舊 copyBuiltinGame 輸出）在讀取時按現行
// 合同呈現，任何一次無改動保存都會把投影寫成新修訂，之後發佈／試運行一致。
// 只用真實類別與 VPS ports；不含原生初始化、發布上線或 UI。
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
import { readInstalledEditorSource } from './editor_builtin_source.mjs';
import { BUILTIN_RELEASE } from '../web/src/content/builtinrelease.generated.js';

let passed = 0;
const check = (name, cond) => {
  if (!cond) { console.error(`FAIL ${name}`); process.exitCode = 1; }
  else { passed++; console.log(`ok ${name}`); }
};
const OWNER = '33333333-3333-4333-8333-333333333333';
const storage = openStorage(':memory:');
storage.transactionSync(() => {
  storage.sql.exec("CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, account TEXT UNIQUE NOT NULL, role TEXT NOT NULL, password_hash TEXT NOT NULL, disabled INTEGER NOT NULL, must_change INTEGER NOT NULL, epoch INTEGER NOT NULL, version INTEGER NOT NULL, display_name TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '')");
  storage.sql.exec('INSERT INTO users VALUES(?,?,?,?,?,?,?,?,?,?,?,?)', OWNER, 'author_migrate', 'author', '{}', 0, 0, 1, 1, '', '', '', '');
});
const principal = h => { if (h !== 'h1') fail(401, 'SESSION_INVALID'); return { id: OWNER, role: 'author', epoch: 1, must_change: 0 }; };
const bucket = new FileBucket({ root: join(mkdtempSync(join(tmpdir(), 'shared-city-')), 'data') });
const journal = new PrivateWriteJournal({ storage, bucket });
const authority = () => ({ ownerId: OWNER, epoch: 1 });
const blobs = new ImmutableBlobStore({ bucket: journal, authority, storage });
const verifier = new GameSnapshotVerifier({ blobs });
const games = new GameMetadataStore({ storage, principal,
  verifySnapshot: input => verifier.verify(input.tokenHash, input),
  recoverAllocation: () => { fail(503, 'COPY_NOT_CONFIGURED'); } });
const allocation = games.allocateGameId('h1'), GAME = allocation.gameId;

// 1. 現行導入結果（已投影）＋反推成舊版存檔：章節名稱回到原版逐章異名，
//    父表刪掉四項默認值——即生產庫 rev1 的真實形狀。
const { game, provenance } = await createPinnedCopyLoader()({ gameId: GAME, ownerId: OWNER });
const raw = readInstalledEditorSource(BUILTIN_RELEASE.resources);
const rawNames = new Map(raw.chapters.map(chapter => [chapter.id, new Map(chapter.state.cities.map(city => [city.idx, city.name]))]));
const legacy = structuredClone(game);
for (const key of Object.keys(legacy.cities)) for (const field of ['prod', 'growth', 'defence', 'troops']) delete legacy.cities[key][field];
let legacyMismatches = 0;
for (const chapterId of legacy.chapterOrder) {
  const chapter = legacy.chapters[chapterId], sourceNames = rawNames.get(chapter.sourceChapterId);
  for (const city of chapter.state.cities) { city.name = sourceNames.get(city.idx); legacyMismatches++; }
}
// 每個章節記錄都被還原成原版名稱，但只有 70 處真的與父表不同。
{
  const bySlot = [...Object.values(legacy.cities)].sort((a, b) => a.runtimeSlot - b.runtimeSlot);
  legacyMismatches = 0;
  for (const chapterId of legacy.chapterOrder) for (const [index, city] of legacy.chapters[chapterId].state.cities.entries()) if (city.name !== bySlot[index].name) legacyMismatches++;
}
check('legacy fixture has the production 70 name differences', legacyMismatches === 70);
check('legacy fixture lacks the four parent defaults', Object.values(legacy.cities).every(c => !['prod','growth','defence','troops'].some(f => Object.hasOwn(c, f))));

// 2. 把舊版存檔當成 rev1 與 copy origin。
const stagePart = async bytes => {
  const put = await blobs.putImmutable('h1', { gameId: GAME, allocation: {}, bytes: new Uint8Array(bytes) });
  return { sha256: put.sha256, byteLength: put.byteLength };
};
const depDigestOf = (parts, dependencies) => { const h = createHash('sha256'); for (const t of canonicalSourceTokens({ chunks: parts, dependencies })) h.update(t, 'utf8'); return h.digest('hex'); };
const hAll = createHash('sha256'), chunks = [];
for (const part of encodeSourceChunks(legacy)) { hAll.update(part); chunks.push(await stagePart(part)); }
const legacyDigest = hAll.digest('hex');
const index = { schema: 'dragon-game-source-index-1', gameId: GAME, sourceDigest: legacyDigest, sourceByteLength: chunks.reduce((n, c) => n + c.byteLength, 0), chunks, dependencies: [] };
const root = await stagePart(Buffer.concat(encodeSourceChunks(index)));
const REG = provenance.registryId, DEF = 'd'.repeat(64), CAT = 'c'.repeat(64);
storage.transactionSync(() => {
  storage.sql.exec('CREATE TABLE IF NOT EXISTS copy_objects (game_id TEXT NOT NULL, sha256 TEXT NOT NULL, byte_length INTEGER NOT NULL, state TEXT NOT NULL, PRIMARY KEY(game_id,sha256))');
  storage.sql.exec('CREATE TABLE IF NOT EXISTS copy_origins (game_id TEXT PRIMARY KEY, registry_id TEXT NOT NULL, definition_digest TEXT NOT NULL, catalog_root TEXT NOT NULL, profile_revision TEXT NOT NULL, baseline_root TEXT NOT NULL, baseline_length INTEGER NOT NULL, baseline_digest TEXT NOT NULL, source_digest TEXT NOT NULL, dependency_digest TEXT NOT NULL)');
  storage.sql.exec('CREATE TABLE IF NOT EXISTS installed_sources (registry_id TEXT PRIMARY KEY, definition_digest TEXT NOT NULL, root_digest TEXT NOT NULL, root_byte_length INTEGER NOT NULL, row_revision TEXT NOT NULL, registered_by TEXT NOT NULL, registered_at TEXT NOT NULL)');
  storage.sql.exec("INSERT INTO copy_objects VALUES(?,?,?,?)", GAME, root.sha256, root.byteLength, 'committed');
  storage.sql.exec('INSERT INTO copy_origins VALUES(?,?,?,?,?,?,?,?,?,?)', GAME, REG, DEF, CAT, FIXED_COPY_PROFILE, root.sha256, root.byteLength, legacyDigest, legacyDigest, depDigestOf(chunks, []));
  storage.sql.exec('INSERT INTO installed_sources VALUES(?,?,?,?,?,?,?)', REG, DEF, CAT, 1, '1', OWNER, new Date().toISOString());
});
const definition = () => ({ registryId: REG, profileRevision: FIXED_COPY_PROFILE, definitionDigest: DEF });
const drafts = new PrivateDrafts({ storage, principal, games, blobs, definition, operationGuard: () => {} });
const snap1 = await games.prepareSnapshot('h1', { gameId: GAME, draftRevision: '1', metadata: { ...legacy.metadata }, source: { sha256: root.sha256, byteLength: root.byteLength }, allocation });
games.transaction('h1', { key: 'migrate-create-0001', method: 'create', target: 'new', digest: 'd'.repeat(64) }, api => api.create(allocation, snap1));

// 3. 讀取（不改資料）就按父表名稱與四項默認值呈現。
const read1 = await drafts.read('h1', GAME, '1');
const mismatchOf = dto => {
  const byIdx = new Map(dto.cityDefinitions.map(c => [c.runtimeSlot, c]));
  let mismatches = 0;
  for (const chapter of dto.chapters) for (const city of chapter.cities) if (city.name !== byIdx.get(city.idx).name) mismatches++;
  return mismatches;
};
check('legacy read projects parent names', mismatchOf(read1) === 0);
check('legacy read backfills four defaults', read1.cityDefinitions.every(c => ['prod','growth','defence','troops'].every(f => Number.isSafeInteger(c[f]))));
check('read still reports the stored legacy digest', read1.sourceDigest === legacyDigest);

// 4. 無改動保存 = 一次性遷移：寫出新修訂，digest 隨投影收斂。
const saved = await drafts.save('h1', GAME, '1', 'migrate-save-0001', 'e'.repeat(64), { metadata: { ...legacy.metadata }, resourceEdits: [], chapterEdits: [] });
check('no-op save writes the migration revision', saved.draftRevision === '2');
check('migration digest differs from legacy', saved.sourceDigest !== legacyDigest);
const read2 = await drafts.read('h1', GAME, '2');
check('migrated revision keeps parent names', mismatchOf(read2) === 0);
check('migrated revision keeps four defaults', read2.cityDefinitions.every(c => ['prod','growth','defence','troops'].every(f => Number.isSafeInteger(c[f]))));

// 5. 遷移後發佈／試運行入口可用，且內容就是投影後資料。
const compiled = await drafts.captureForCompile('h1', GAME, '2');
check('publish capture accepts the migrated revision', compiled.reference.draftRevision === '2' && compiled.game.chapterOrder.length === 20);
const bySlot = [...Object.values(compiled.game.cities)].sort((a, b) => a.runtimeSlot - b.runtimeSlot);
let compiledMismatches = 0;
for (const chapterId of compiled.game.chapterOrder) for (const [i, city] of compiled.game.chapters[chapterId].state.cities.entries()) if (city.name !== bySlot[i].name) compiledMismatches++;
check('publish content carries parent names', compiledMismatches === 0);
check('publish content keeps original raw city bytes', compiled.game.chapterOrder.every(id => compiled.game.chapters[id].state.nativeCityRecordRaw.length === 192));

// 6. 投影冪等：再保存一次不產生新修訂。
const again = await drafts.save('h1', GAME, '2', 'migrate-save-0002', 'f'.repeat(64), { metadata: { ...legacy.metadata }, resourceEdits: [], chapterEdits: [] });
check('projection is idempotent (no-op save stays rev2)', again.draftRevision === '2');

// 7. 新增章節仍從父表名稱／默認值 materialize。
const created = await drafts.save('h1', GAME, '2', 'migrate-save-0003', 'a'.repeat(64), { metadata: { ...legacy.metadata }, resourceEdits: [], chapterEdits: [{ op: 'add-blank', name: '新章', start: { era: 'ad', year: 200, month: 1, day: 1 } }] });
check('new chapter saves as rev3', created.draftRevision === '3');
const read3 = await drafts.read('h1', GAME, '3');
const fresh = read3.chapters.at(-1);
check('new chapter cities use parent names', fresh.cities.every(city => city.name === read3.cityDefinitions.find(d => d.runtimeSlot === city.idx).name));

process.stdout.write(`shared-city migration lane passed ${passed} checks\n`);
