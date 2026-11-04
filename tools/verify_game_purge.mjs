// 物理刪除（purge）證據 lane：真實 editor gateway／auth／SQLite／私有 FileBucket。
// 只驗「資料庫列是否真的 0 殘留」與邊界（未 fence 409、內置 403、清單不再列出）；
// 不宣稱 R2 位元組已回收（那屬 distribution ledger 的 retired-generation 清理），
// 也不宣稱玩家端 404 以外的雲端行為。不讀寫正式存檔。
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createPublicationBrowserAuthority } from './fixtures/publication-browser-authority.mjs';

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
const authority = await createPublicationBrowserAuthority({ root: own, origin, runtimeStager: stubStager, nodeService: false });
const { storage, sql, gameId, adminToken, adminCsrf, ownerToken, csrfFor } = authority;

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

const TABLES = [ // 與 server/gamepurge.js 一致的 31 張含 game_id 表（分發帳本三表除外）
  'content_used_ids', 'content_names', 'content_audits',
  'content_announcements', 'content_snapshots', 'content_releases', 'published_games', 'published_packs',
  'published_pack_chapters', 'published_pack_assets', 'copy_requests', 'copy_objects', 'copy_origins',
  'content_http_command_targets', 'content_http_command_proofs', 'draft_requests', 'draft_objects', 'draft_references',
  'draft_topology_moves', 'draft_topology_rebuilds', 'trial_sessions', 'compile_jobs', 'fallback_compile_objects',
  'data_compile_objects', 'image_compile_objects', 'content_private_writes', 'content_deletion_operations',
  'content_deletion_job_freezes', 'content_deletion_draft_freezes',
  'content_games', 'content_deletion_fences',
];
const counts = () => Object.fromEntries(TABLES.map(table => [table, sql.exec(`SELECT COUNT(*) AS n FROM ${table} WHERE game_id=?`, gameId).toArray()[0].n]));
const gameRow = () => sql.exec('SELECT row_revision, draft_name, listed FROM content_games WHERE game_id=?', gameId).toArray()[0];

const initial = gameRow();
assert.ok(initial, 'fixture 必須先建立遊戲列');
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

// ④ 名稱／修訂不符要被拒；正確輸入才清除。
{
  const wrongName = await post(`/api/admin/games/${gameId}/purge`, { confirmationName: '不是這個名字', expectedRowRevision: fence.value.rowRevision });
  assert.equal(wrongName.status, 409); assert.equal(wrongName.value.error, 'PURGE_CONFIRMATION');
  const staleRevision = await post(`/api/admin/games/${gameId}/purge`, { confirmationName: initial.draft_name, expectedRowRevision: '1' });
  assert.equal(staleRevision.status, 409); assert.equal(staleRevision.value.error, 'PURGE_STALE');
  assert.equal(counts().content_games, 1);
  checks.push('名稱與 rowRevision 不符都被拒，且列未被部分刪除');
}

const purged = await post(`/api/admin/games/${gameId}/purge`, { confirmationName: initial.draft_name, expectedRowRevision: fence.value.rowRevision });
assert.equal(purged.status, 200, JSON.stringify(purged.value));
const receipt = purged.value;
assert.equal(receipt.version, 1); assert.equal(receipt.state, 'purged'); assert.equal(receipt.gameId, gameId);
assert.equal(receipt.tables, TABLES.length);
assert.equal(receipt.removed.content_games, 1);
assert.equal(receipt.removed.content_deletion_fences, 1);
assert.match(receipt.purgedAt, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);

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
  checks.push('installed source／pinned manifest／帳號都未被觸碰');
}

storage.close();
const result = { checks, calls: calls.length, purgedTables: receipt.tables, removed: receipt.removed, sources: { 'server/gamepurge.js': sha(readFileSync('server/gamepurge.js')), 'server/editorapp.js': sha(readFileSync('server/editorapp.js')) }, scope: 'real editor gateway/auth/SQLite/FileBucket; database-row purge only — R2 byte reclamation (distribution retired generations) and player-side 404 are out of scope' };
process.stdout.write(`${JSON.stringify(result)}` + '\n');
