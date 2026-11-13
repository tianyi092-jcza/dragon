// 物理刪除（purge）證據 lane：真實 editor gateway／auth／SQLite／私有 FileBucket。
// 只驗「資料庫列是否真的 0 殘留」與邊界（未 fence 409、內置 403、清單不再列出）；
// 不宣稱 R2 位元組已回收（那屬 distribution ledger 的 retired-generation 清理），
// 也不宣稱玩家端 404 以外的雲端行為。不讀寫正式存檔。
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { GameCopyStore } from '../server/gamecopy.js';
import { validateSystemBaseMap } from '../server/systembasemap.js';
import { createPublicationBrowserAuthority } from './fixtures/publication-browser-authority.mjs';
import { createGameReclaimer, reclaimPrivateGame } from '../vps/game-reclaimer.mjs';
import { createEditorService } from '../vps/editor-server.mjs';
import { DIRECTORY_POINTER_KEY, directoryPointerBody } from '../reader/directorypointer.js';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const origin = 'https://owned-editor.invalid';
const own = mkdtempSync(join(tmpdir(), 'dragon-purge-'));
const checks = [], calls = [];

// 內置資料是工作台的 installed source 與量產複製上游：purge 不得觸碰。
const builtinFiles = ['web/content/pinned/world-manifest.txt', 'web/content/pinned/entity-manifest.txt', 'server/pinned/world-manifest.txt', 'server/pinned/entity-manifest.txt'];
const digestOf = path => { try { return sha(readFileSync(path)); } catch { return null; } };
const before = Object.fromEntries(builtinFiles.map(path => [path, digestOf(path)]));

// 本 lane 不上架，但 app 要求同步證明埠：形狀必須正確，方法本身只用來擋誤用。
const unused = () => { throw new Error('purge lane never stages runtime bytes'); };
const stubStager = { stage: unused, verifyStaged: unused };
// 刪除後的 R2 回收（方案 B）：owned in-memory 物件埠，不連任何雲端。
// 這裡求的是路由/埠真的被呼叫、且只清本遊戲，不是真實 R2/S3/TLS 證據。
const reclaimObjects = new Map();
let reclaimRemoves = 0, failReclaim = false;
const storeObject = (key, bytes) => reclaimObjects.set(key, { bytes: Buffer.from(bytes), headers: { etag: '"' + sha(Buffer.from(bytes)) + '"', 'content-type': 'application/json' } });
const reclaimR2 = Object.freeze({
  async get(key, options) {
    assert.ok(options?.maxBytes > 0, '有界讀取是埠合約');
    const value = reclaimObjects.get(key);
    return value ? { bytes: new Uint8Array(value.bytes), headers: { ...value.headers } } : null;
  },
  async putControl(key, bytes, etag) {
    assert.equal(arguments.length, 3, 'CAS 必須顯式帶 etag');
    const prior = reclaimObjects.get(key), current = prior ? prior.headers.etag : null;
    if (etag === null ? current !== null : current !== etag) { return false; }
    storeObject(key, bytes); return true;
  },
  async list(prefix, maxKeys) { assert.equal(maxKeys, 1000); return [...reclaimObjects.keys()].filter(key => key.startsWith(prefix)).sort(); },
  async remove(key) {
    if (failReclaim && reclaimRemoves === 1) throw new Error('INJECTED_DISK_FAILURE');
    reclaimRemoves++; reclaimObjects.delete(key); return 204;
  },
});
const parseOwned = text => { try { return JSON.parse(text); } catch (cause) { assert.fail('owned pointer must stay parseable: ' + cause.message); } };
// 遊戲自己的私有位元組（草稿與資源原件）住在同一個 FileBucket 的 private/<gameId>/ 下：
// 刪除＝徹底清除，所以回收埠也要掃它；installed/ 是共享底層資源，永不在此列。
const { FileBucket } = await import('../vps/file-bucket.mjs');
const purgeBucket = new FileBucket({ root: join(own, 'private-objects') });
const authority = await createPublicationBrowserAuthority({ root: own, origin, runtimeStager: stubStager, nodeService: false, purgeReclaimer: createGameReclaimer({ r2: reclaimR2, objects: purgeBucket }) });
const { storage, sql, gameId, adminToken, adminCsrf, ownerToken, csrfFor } = authority;

// 一個與被刪遊戲「內容完全相同」的遊戲：同一份內容摘要，共用同一組程序包與畫像位元組。
const twinGameId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const sharedDigest = sha(Buffer.from('purge-lane-identical-content'));
const programKey = 'artifacts/programs/' + sha(Buffer.from('purge-lane-shared-program')) + '/program.js';
const entryFor = (id, releaseId) => ({ gameId: id, listed: true,
  release: { releaseId, ordinal: '1.0', revision: '1', sourceDigest: sharedDigest, runtime: { key: `artifacts/${id}/1.0/${releaseId}/runtime-${sharedDigest}.json`, sha256: sharedDigest, byteLength: 32 } },
  directory: { name: 'purge-lane-' + id.slice(0, 4), publishedAt: '2026-11-01T00:00:00.000Z', chapters: [`${id}#chapter-1`] },
  announcements: [] });
const laneAuthority = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const sealed = games => {
  const body = directoryPointerBody({ version: 1, authorityId: laneAuthority, generation: 4, games });
  const digest = sha(Buffer.from(JSON.stringify(body)));
  return Buffer.from(JSON.stringify({ version: 1, authorityId: laneAuthority, generation: 4, digest, games: body.games }));
};
const ownEntry = entryFor(gameId, 'release-purgelane'), twinEntry = entryFor(twinGameId, 'release-twinlane');
const ownPrivateKey = `private/${gameId}/${sha('own-private-bytes')}`;
const twinPrivateKey = `private/${twinGameId}/${sha('twin-private-bytes')}`;
const installedKey = `installed/runtime/${sha('shared-installed-bytes')}`;
for (const key of [ownPrivateKey, twinPrivateKey, installedKey]) await purgeBucket.put(key, new Uint8Array([1, 2, 3, 4]));
const ownKeys = [ownEntry.release.runtime.key, `artifacts/${gameId}/1.0/release-purgelane/manifest.json`];
const twinKeys = [twinEntry.release.runtime.key, `artifacts/${twinGameId}/1.0/release-twinlane/manifest.json`];
for (const key of [...ownKeys, ...twinKeys]) { storeObject(key, 'bytes:' + key); }
storeObject(programKey, 'shared-program-bytes');
storeObject('kao/17.png', 'shared-portrait-bytes');
storeObject(DIRECTORY_POINTER_KEY, sealed([ownEntry, twinEntry].sort((a, b) => a.gameId < b.gameId ? -1 : 1)));

async function post(path, body, { token = adminToken, csrf = adminCsrf, key = `purge-lane-${randomUUID()}` } = {}) {
  const response = await authority.fetch(new Request(origin + path, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: `__Secure-dragon-editor=${token}`, 'X-CSRF-Token': csrf, 'Idempotency-Key': key },
    body: JSON.stringify(body ?? {}),
  }));
  const text = await response.text();
  let value; try { value = JSON.parse(text); } catch { value = text; }
  calls.push({ path, status: response.status });
  return { status: response.status, value };
}

// New system singleton is initialized through the real authenticated gateway,
// not injected as a placeholder row. It must survive the later game purge.
const baseMapPath = '/api/admin/base-map';
const getBaseMap = token => authority.fetch(new Request(origin + baseMapPath, { headers: { Cookie: `__Secure-dragon-editor=${token}` } }));
assert.equal((await getBaseMap(ownerToken)).status, 403);
assert.equal((await (await getBaseMap(adminToken)).json()).snapshot, null);
assert.equal((await post(baseMapPath + '/initialize', {}, { token: ownerToken, csrf: await csrfFor(ownerToken) })).status, 403);
assert.equal((await post(baseMapPath + '/initialize', {}, { csrf: '' })).status, 403);
const initializedMap = await post(baseMapPath + '/initialize', {});
assert.equal(initializedMap.status, 200, JSON.stringify(initializedMap.value));
assert.equal(initializedMap.value.snapshot.version, 1);
assert.equal((await post(baseMapPath + '/initialize', {})).value.snapshot.digest, initializedMap.value.snapshot.digest);
checks.push('基礎地圖真實HTTP首次轉換、管理員限制、CSRF與重進不覆寫');
const initialTemplate = initializedMap.value.snapshot.template;
const getAtlas = (query, token = adminToken) => authority.fetch(new Request(origin + baseMapPath + '/atlas?' + query, { headers: { Cookie: `__Secure-dragon-editor=${token}` } }));
assert.equal((await getAtlas('season=spring', ownerToken)).status, 403);
assert.equal((await getAtlas('season=unknown')).status, 422);
assert.equal((await getAtlas('season=spring&season=winter')).status, 422);
assert.equal((await getAtlas('season=spring&path=elsewhere')).status, 422);
for (const season of ['spring', 'summer', 'autumn', 'winter']) {
  const image = await getAtlas('season=' + season);
  assert.equal(image.status, 200);
  assert.equal(image.headers.get('content-type'), 'application/octet-stream');
  const bytes = new Uint8Array(await image.arrayBuffer());
  const descriptor = initialTemplate.content.editorAssets.seasonAtlases[season];
  assert.equal(bytes.byteLength, descriptor.byteLength);
  assert.equal(sha(bytes), descriptor.sha256);
  assert.equal(image.headers.get('x-content-sha256'), descriptor.sha256);
}
checks.push('基礎地圖四季圖集受權讀取、實際長度/SHA、作者及非法查詢拒絕');
// This older isolated fixture deliberately has no mapEditorAssets. Do not
// silently backfill it; add the descriptor only as an explicit test fixture.
const getCopyAtlas = (query, token = ownerToken) => authority.fetch(new Request(origin + `/api/games/${gameId}/copy/map-atlas?${query}`, { headers: { Cookie: `__Secure-dragon-editor=${token}` } }));
const ensureAtlasCopy = await post(`/api/games/${gameId}/copy/ensure`, {}, { token: ownerToken, csrf: await csrfFor(ownerToken) });
assert.equal(ensureAtlasCopy.status, 200, JSON.stringify(ensureAtlasCopy.value));
assert.equal((await getCopyAtlas('season=spring')).status, 409);
const originalCopyRow = sql.exec('SELECT data_json,copy_digest FROM game_copies WHERE game_id=?', gameId).toArray()[0];
const atlasFixture = JSON.parse(originalCopyRow.data_json);
atlasFixture.mapEditorAssets = structuredClone(initialTemplate.content.editorAssets);
const atlasFixtureText = JSON.stringify(atlasFixture);
sql.exec('UPDATE game_copies SET data_json=?,copy_digest=? WHERE game_id=?', atlasFixtureText, sha(atlasFixtureText), gameId);
assert.equal((await getCopyAtlas('season=spring', adminToken)).status, 404, 'non-owner administrator receives the existing hidden-game denial');
assert.equal((await getCopyAtlas('season=invalid')).status, 422);
assert.equal((await getCopyAtlas('season=spring&path=elsewhere')).status, 422);
assert.equal((await getCopyAtlas('season=spring&season=winter')).status, 422);
for (const season of ['spring', 'summer', 'autumn', 'winter']) {
  const image = await getCopyAtlas('season=' + season);
  assert.equal(image.status, 200);
  const bytes = new Uint8Array(await image.arrayBuffer());
  const descriptor = atlasFixture.mapEditorAssets.seasonAtlases[season];
  assert.equal(bytes.byteLength, descriptor.byteLength);
  assert.equal(sha(bytes), descriptor.sha256);
  assert.equal(image.headers.get('x-content-sha256'), descriptor.sha256);
}
sql.exec('UPDATE game_copies SET data_json=?,copy_digest=? WHERE game_id=?', originalCopyRow.data_json, originalCopyRow.copy_digest, gameId);
checks.push('遊戲圖集作者歸屬、四季真實SHA、他人管理員/非法查詢拒絕、舊副本無隱式回填');
const piece = initialTemplate.content.map.decorations.find(item => {
  const definition = initialTemplate.content.componentDefinitions[item.definitionRef];
  return definition.category === 'mountain-pattern' && definition.footprint.length > 1 && definition.footprint.length <= 8;
});
const footprint = initialTemplate.content.componentDefinitions[piece.definitionRef].footprint;
const childIds = footprint.map((_, index) => `system-base-map#decoration-${sha(`http-split-${index}`)}`);
const splitReply = await post(baseMapPath + '/save', { edits: [{ op: 'decoration-split', instanceId: piece.id, childIds }] });
assert.equal(splitReply.status, 200, JSON.stringify(splitReply.value));
assert.equal(splitReply.value.snapshot.version, 2);
const beforeCompiled = validateSystemBaseMap(initialTemplate, sha).compiled;
assert.deepEqual(validateSystemBaseMap(splitReply.value.snapshot.template, sha).compiled.terrainBytes, beforeCompiled.terrainBytes);
assert.ok(splitReply.value.snapshot.template.content.selectionGroups.some(group => childIds.every(id => group.members.some(member => member.id === id))));
const removeEdit = { op: 'decoration-remove', memberIds: childIds };
const refusedEdit = await post(baseMapPath + '/save', { edits: [removeEdit] });
assert.equal(refusedEdit.status, 422);
assert.equal(refusedEdit.value.error, 'BASE_MAP_INVALID');
assert.equal((await (await getBaseMap(adminToken)).json()).snapshot.digest, splitReply.value.snapshot.digest);
assert.equal((await post(baseMapPath + '/save', { edits: [removeEdit] }, { token: ownerToken, csrf: await csrfFor(ownerToken) })).status, 403);
const cells = footprint.map(([dx, dy]) => (piece.y + dy) * 384 + piece.x + dx);
// Explicit test-author byte choice, not a guessed original hidden ground.
const editReply = await post(baseMapPath + '/save', { edits: [removeEdit, { op: 'base-fill', cells, tile: 16, geography: 0 }] });
assert.equal(editReply.status, 200, JSON.stringify(editReply.value));
assert.equal(editReply.value.snapshot.version, 3);
const afterCompiled = validateSystemBaseMap(editReply.value.snapshot.template, sha).compiled;
assert.notDeepEqual(afterCompiled.terrainBytes, beforeCompiled.terrainBytes);
assert.deepEqual(afterCompiled.roadGraph, beforeCompiled.roadGraph);
const templateBeforePurge = sql.exec('SELECT * FROM system_base_map').toArray();
assert.equal((await post(baseMapPath + '/initialize', {})).value.snapshot.digest, editReply.value.snapshot.digest);
checks.push('基礎地圖HTTP拆片維護組引用、unknown拒絕保留舊版、明確補底保存重編與重進不覆寫編輯');

const TABLES = [ // 與 server/gamepurge.js 一致的 35 张含 game_id 表（分發帳本三表除外）
  'content_used_ids', 'content_names', 'content_audits',
  'content_announcements', 'content_game_validations', 'content_snapshots', 'content_releases', 'game_releases', 'published_games', 'published_packs',
  'published_pack_chapters', 'published_pack_assets', 'copy_requests', 'copy_objects', 'copy_origins',
  'game_copies', 'publish_slots', 'copy_validations',
  'content_http_command_targets', 'content_http_command_proofs', 'draft_requests', 'draft_objects', 'draft_references',
  'draft_topology_moves', 'draft_topology_rebuilds', 'compile_jobs', 'fallback_compile_objects',
  'data_compile_objects', 'image_compile_objects', 'content_private_writes', 'content_deletion_operations',
  'content_deletion_job_freezes', 'content_deletion_draft_freezes',
  'content_games', 'content_deletion_fences',
];
const counts = () => Object.fromEntries(TABLES.map(table => [table, sql.exec(`SELECT COUNT(*) AS n FROM ${table} WHERE game_id=?`, gameId).toArray()[0].n]));
const gameRow = () => sql.exec('SELECT row_revision, draft_name, listed FROM content_games WHERE game_id=?', gameId).toArray()[0];

const initial = gameRow();
assert.ok(initial, 'fixture 必須先建立遊戲列');
// T1–T8 副本三表：用真 GameCopyStore 建表（与生产 DDL 逐字节一致），再种一行，证明 purge 一并清零。
new GameCopyStore({ storage, principal: () => ({}), games: { assertNotDeleting() {}, listOwn: () => [] } });
{ const digest = 'a'.repeat(64), now = '2026-11-01T00:00:00.000Z';
  sql.exec('INSERT OR REPLACE INTO game_copies VALUES(?,?,?,?,?)', gameId, 'owner', '{}', digest, now);
  sql.exec("INSERT OR REPLACE INTO publish_slots VALUES(?,?,?,?,?,?,?)", gameId, null, null, digest, 'empty', null, null);
  sql.exec('UPDATE publish_slots SET description=? WHERE game_id=?', '保留刪除入口測試', gameId);
  sql.exec('INSERT OR REPLACE INTO copy_validations VALUES(?,?,?,?,?,?)', gameId, 'passed', digest, '[]', null, now); }
const occupied = counts();
assert.ok(occupied.copy_objects > 0 && occupied.copy_origins > 0, 'fixture 應有 copy 帳本列可被清除');

// ① 邊界：內置一律 403；非 UUID 422；未 fence 的遊戲 409。
{
  const builtin = await post('/api/admin/games/wolong-builtin/purge', { confirmationName: 'x', expectedRowRevision: '1' });
  assert.equal(builtin.status, 403, JSON.stringify(builtin.value)); assert.equal(builtin.value.error, 'BUILTIN_PROTECTED');
  const bad = await post('/api/admin/games/not-a-uuid/purge', { confirmationName: 'x', expectedRowRevision: '1' });
  assert.equal(bad.status, 404, '路由只接受 UUID 與 wolong-builtin，其餘是 404');
  const unfenced = await post(`/api/admin/games/${gameId}/purge`, { confirmationName: initial.draft_name, expectedRowRevision: initial.row_revision });
  assert.equal(unfenced.status, 409); assert.equal(unfenced.value.error, 'GAME_NOT_FENCED');
  assert.deepEqual(counts(), occupied, '被拒絕的請求不得改動任何列');
  checks.push('未 fence、內置與非 UUID 的 purge 都被拒絕且列不變');
}

// ② 作者（非 fence owner 也不是 admin）不能繞過柵欄自己清庫。
{
  const ownerCsrf = await csrfFor(ownerToken);
  const denied = await post(`/api/admin/games/${gameId}/purge`, { confirmationName: initial.draft_name, expectedRowRevision: initial.row_revision }, { token: ownerToken, csrf: ownerCsrf });
  assert.equal(denied.status, 409); assert.equal(denied.value.error, 'GAME_NOT_FENCED');
  checks.push('作者身份在未 fence 時同樣拿不到 purge 能力');
}

// ③ 建立柵欄（作者刪除），確認柵欄成立但列還在。
const fence = await post(`/api/games/${gameId}/deletion`, { gameId, expectedRowRevision: initial.row_revision, confirmationName: initial.draft_name });
assert.equal(fence.status, 200, JSON.stringify(fence.value));
assert.equal(fence.value.state, 'fenced');
assert.equal(counts().content_deletion_fences, 1);
assert.equal(counts().content_games, 1, '柵欄階段不得先行刪列');
checks.push('柵欄成立但資料庫列仍在（物理刪除是獨立一步）');

// ③′ 重试栅栏（上次 purge 失败回滚后）：不同键同意图不再 409 GAME_DELETING，
// 直接返回既有回执且不写新行，调用方可拿回执里的新修订继续 purge。
{
  const retry = await post(`/api/games/${gameId}/deletion`, { gameId, expectedRowRevision: initial.row_revision, confirmationName: initial.draft_name });
  assert.equal(retry.status, 200, JSON.stringify(retry.value));
  assert.equal(retry.value.state, 'fenced');
  assert.equal(retry.value.rowRevision, fence.value.rowRevision);
  assert.equal(counts().content_deletion_fences, 1, '重试不得重复建栅');
  checks.push('已栅栏游戏重复建栅返回既有回执（可继续 purge），不抛 GAME_DELETING');
}

// ④ 名稱／修訂不符要被拒；正確輸入才清除。
{
  const wrongName = await post(`/api/admin/games/${gameId}/purge`, { confirmationName: '不是這個名字', expectedRowRevision: fence.value.rowRevision });
  assert.equal(wrongName.status, 409); assert.equal(wrongName.value.error, 'PURGE_CONFIRMATION');
  const staleRevision = await post(`/api/admin/games/${gameId}/purge`, { confirmationName: initial.draft_name, expectedRowRevision: '1' });
  assert.equal(staleRevision.status, 409); assert.equal(staleRevision.value.error, 'PURGE_STALE');
  assert.equal(counts().content_games, 1);
  checks.push('名稱與 rowRevision 不符都被拒，且列未被部分刪除');
}

// 缺少回收器必須在刪庫前拒絕（同一 owned authority，固定測試 key，非真實環境）。
const unconfigured = createEditorService({ storage, bucket: purgeBucket, env: { EDITOR_ORIGIN: origin, EDITOR_REQUEST_KEY: 'c'.repeat(64), EDITOR_DEFAULT_PASSWORD: authority.password }, runtimeStager: stubStager, frozenPublication: true });
const unavailable = await unconfigured.fetch(new Request(`${origin}/api/admin/games/${gameId}/purge`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: `__Secure-dragon-editor=${adminToken}`, 'X-CSRF-Token': adminCsrf, 'Idempotency-Key': `unconfigured-${randomUUID()}` }, body: JSON.stringify({ confirmationName: initial.draft_name, expectedRowRevision: fence.value.rowRevision }) }));
assert.equal(unavailable.status, 503);
assert.equal((await unavailable.json()).error, 'RECLAIMER_UNCONFIGURED');
assert.equal(counts().content_games, 1);
assert.ok(await purgeBucket.get(ownPrivateKey));
checks.push('回收器未裝配時刪除拒絕，庫行／檔案保持可重試');

// 真正刪掉一個分發檔案後失敗：庫行／fence 仍在，重試完成剩餘清理。
assert.equal(reclaimRemoves, 0, '核權、名稱與修訂拒絕不得碰檔案');
failReclaim = true;
const failedReclaim = await post(`/api/admin/games/${gameId}/purge`, { confirmationName: initial.draft_name, expectedRowRevision: fence.value.rowRevision });
assert.equal(failedReclaim.status, 503);
assert.equal(failedReclaim.value.error, 'RECLAIM_FAILED');
assert.equal(reclaimRemoves, 1);
assert.equal(counts().content_games, 1, '回收失敗不能先刪庫行');
assert.equal(counts().content_deletion_fences, 1, '保留不可逆 fence 供重試');
assert.ok(await purgeBucket.get(ownPrivateKey));
const retryRows = authority.app.gameCopies.reviewQueue(sha(Buffer.from(adminToken)));
assert.ok(retryRows.some(row => row.gameId === gameId && row.rowRevision === fence.value.rowRevision), '回收失敗後管理列表保留正確修訂的刪除入口');
failReclaim = false;
checks.push('檔案部分清除後失敗保留庫行／fence，原修訂可重試，不產生無主檔案');

const purged = await post(`/api/admin/games/${gameId}/purge`, { confirmationName: initial.draft_name, expectedRowRevision: fence.value.rowRevision });
assert.equal(purged.status, 200, JSON.stringify(purged.value));
const receipt = purged.value;
assert.equal(receipt.version, 1); assert.equal(receipt.state, 'purged'); assert.equal(receipt.gameId, gameId);
assert.equal(receipt.tables, TABLES.length);
assert.equal(receipt.removed.content_games, 1);
assert.equal(receipt.removed.content_deletion_fences, 1);
assert.match(receipt.purgedAt, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
assert.ok(['completed', 'not-applicable', 'pending'].includes(receipt.retirement?.state), '回執必須回報帳本退役狀態：' + JSON.stringify(receipt.retirement));

// ④′ R2 回收：回執必須說 completed，指針不含該 gameId，本遊戲前綴 0 位元組，
// 而內容完全相同的另一個遊戲與共享程序包／畫像一個位元組都不能少。
{
  assert.equal(receipt.reclamation?.state, 'completed', '回執必須回報 R2 回收完成：' + JSON.stringify(receipt.reclamation));
  assert.equal(receipt.reclamation.pointer, 'already-absent');
  assert.equal(receipt.reclamation.objects, ownKeys.length - 1, '重試只刪剩餘物件');
  assert.equal(reclaimRemoves, ownKeys.length);
  // 私有位元組：本遊戲清空、另一個遊戲與共享 installed 一個位元組都不動。
  // 複製與編譯階段本身就會寫入數十個私有位元組（生產實測 49 檔／46 MB），所以這裡
  // 驗「全部清空＋至少含本 lane 種下的那一筆」，而不是一個寫死的檔數。
  assert.ok(receipt.reclamation.privateObjects >= 1, '回執必須報出私有位元組回收檔數：' + JSON.stringify(receipt.reclamation));
  assert.deepEqual((await purgeBucket.list({ prefix: `private/${gameId}/` })).objects, [], '本遊戲的私有前綴不得留位元組');
  assert.equal(await purgeBucket.get(ownPrivateKey), null, '本遊戲的私有位元組必須刪除');
  assert.ok(await purgeBucket.get(twinPrivateKey), '另一個遊戲的私有位元組不得被連帶刪除');
  assert.ok(await purgeBucket.get(installedKey), '共享 installed 底層資源永不刪');
  const stored = reclaimObjects.get(DIRECTORY_POINTER_KEY);
  assert.ok(stored, '在架指針必須还存在（只是少了一條）');
  assert.equal(stored.bytes.toString().includes(gameId), false, '在架指針不得再含已刪遊戲的 gameId');
  const pointer = parseOwned(stored.bytes.toString());
  assert.equal(pointer.generation, 4, '回收是已提交目錄的修補，不得推進代次');
  assert.deepEqual(pointer.games.map(entry => entry.gameId), [twinGameId]);
  assert.equal(pointer.games[0].release.runtime.key, twinEntry.release.runtime.key);
  assert.deepEqual([...reclaimObjects.keys()].filter(key => key.startsWith(`artifacts/${gameId}/`)), [], '本遊戲前綴必須 0 位元組');
  assert.deepEqual([...reclaimObjects.keys()].filter(key => key.startsWith(`artifacts/${twinGameId}/`)).sort(), [...twinKeys].sort(), '同內容的另一個遊戲位元組不得被連帶刪除');
  assert.equal(reclaimObjects.get(programKey).bytes.toString(), 'shared-program-bytes', '共享程序包不得被刪');
  assert.equal(reclaimObjects.get('kao/17.png').bytes.toString(), 'shared-portrait-bytes', '共享畫像不得被刪');
  checks.push('purge 回執回報 R2 回收 completed：指針刪掉本遊戲條目、本遊戲前綴 0 位元組');
  checks.push('內容完全相同的另一個遊戲、共享程序包與畫像逐位元組不動（刪 A 不影響 B）');
  checks.push('回收是修補而非新發布：指針代次不變，且只寫一次 CAS');
}

const after = counts();
const residue = Object.entries(after).filter(([, n]) => n !== 0);
assert.deepEqual(residue, [], '物理刪除後 31 張表都必須 0 行');
assert.equal(gameRow(), undefined, 'content_games 不能留下任何列');
checks.push(`purge 回執宣告 ${receipt.tables} 張表；實查 ${TABLES.length} 張全部 0 行`);

// ⑤ 重複 purge：柵欄已不存在，必須是明確 409 而不是假成功。
{
  const again = await post(`/api/admin/games/${gameId}/purge`, { confirmationName: initial.draft_name, expectedRowRevision: fence.value.rowRevision });
  assert.equal(again.status, 409); assert.equal(again.value.error, 'GAME_NOT_FENCED');
  assert.deepEqual(counts(), after);
  checks.push('重複 purge 是 409，不是第二次「成功」');
}

// ⑥ 已刪除的遊戲不再出現在上架清單（作者視角），也不再能被管理操作。
{
  const response = await authority.fetch(new Request(origin + '/api/games/submissions', { headers: { Cookie: `__Secure-dragon-editor=${ownerToken}` } }));
  assert.equal(response.status, 200);
  const value = await response.json();
  assert.equal((value.games ?? []).some(row => row.gameId === gameId), false, '清單不得再列出已刪除的遊戲');
  const manage = await authority.fetch(new Request(origin + `/api/games/${gameId}/listing`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: `__Secure-dragon-editor=${adminToken}`, 'X-CSRF-Token': adminCsrf, 'Idempotency-Key': `purge-lane-after-${randomUUID()}`, 'If-Match': '"1"' },
    body: JSON.stringify({ action: 'unlist' }),
  }));
  assert.equal(manage.status, 404, '刪除後的管理操作必須是 404 GAME_NOT_FOUND');
  checks.push('清單不再列出，管理操作回 404');
}

// ⑦ 內置資料與別人的遊戲沒有被連帶刪除。
{
  const others = sql.exec('SELECT COUNT(*) AS n FROM content_games').toArray()[0].n;
  assert.equal(others, 0, 'fixture 只有這一份遊戲，刪完應為 0');
  const afterDigests = Object.fromEntries(builtinFiles.map(path => [path, digestOf(path)]));
  assert.deepEqual(afterDigests, before, 'web/content/builtin 與 server/pinned 的位元組不得被 purge 改動');
  assert.equal(sql.exec("SELECT COUNT(*) AS n FROM users").toArray()[0].n, 2, '帳號不得被連帶刪除');
  assert.deepEqual(sql.exec('SELECT * FROM system_base_map').toArray(), templateBeforePurge, '系統基礎地圖完整正文/摘要/版本不受遊戲刪除影響');
  assert.equal((await (await getBaseMap(adminToken)).json()).snapshot.digest, editReply.value.snapshot.digest);
  checks.push('installed source／pinned manifest／帳號／系統基礎地圖都未被觸碰');
}

storage.close();
// 開發入口無公開分發桶時復用私有回收；一樣確認自己清空、共享與他遊戲不變。
const localBucket = new FileBucket({ root: join(own, 'local-only') });
for (const key of [ownPrivateKey, twinPrivateKey, installedKey]) await localBucket.put(key, new Uint8Array([7]));
assert.equal(await reclaimPrivateGame(localBucket, gameId), 1);
assert.deepEqual((await localBucket.list({ prefix: `private/${gameId}/` })).objects, []);
assert.ok(await localBucket.get(twinPrivateKey));
assert.ok(await localBucket.get(installedKey));
assert.equal(await reclaimPrivateGame(localBucket, gameId), 0);
checks.push('開發服務共用私有回收：目標清空、重試冪等、共享與他遊戲保留');

const result = { checks, calls: calls.length, purgedTables: receipt.tables, removed: receipt.removed, sources: { 'server/gamepurge.js': sha(readFileSync('server/gamepurge.js')), 'server/editorapp.js': sha(readFileSync('server/editorapp.js')) }, scope: 'real editor gateway/auth/SQLite/FileBucket + owned in-memory R2 object port; database-row purge and per-game R2 reclamation — no real S3/R2/TLS deployment, no distribution-ledger retirement path, no player-side play-through' };
process.stdout.write(`${JSON.stringify(result)}` + '\n');
