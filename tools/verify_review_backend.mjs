// B3 上架審核 backend gate：跑真实 editor application 代码（同一 DO 代码，Node
// SQLite + 私有 bucket 端口），验证跨创作者清单、「已駁回」推导、拒絕/同意/
// 任何状态删除的实际守卫与副作用。不需要 workerd、浏览器或固定源，也不读
// 任何正式存档；数据库与 bucket 都在临时目录里。
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { register } from 'node:module';
register('../vps/text-loader.mjs', import.meta.url);
const { openStorage } = await import('../vps/sqlite-port.mjs');
const { FileBucket } = await import('../vps/file-bucket.mjs');
const { createEditorService } = await import('../vps/editor-server.mjs');

const origin = 'https://owned-editor.invalid';
const own = mkdtempSync(join(tmpdir(), 'dragon-review-backend-'));
mkdirSync(join(own, 'private'), { recursive: true });
const bucket = new FileBucket({ root: join(own, 'private') });
const storage = openStorage(join(own, 'editor.sqlite'));
const sql = storage.sql;
const env = {
  EDITOR_ORIGIN: origin,
  EDITOR_DEFAULT_PASSWORD: 'Dev-Test-Only-2026!',
  EDITOR_REQUEST_KEY: randomBytes(32).toString('hex'),
  EDITOR_RATE_MS: '1000',
  EDITOR_ACCOUNT_LIMIT: '10',
  EDITOR_SOURCE_LIMIT: '30',
};
const service = createEditorService({ storage, bucket, env });
const checks = [], calls = [];
const time = () => new Date().toISOString();

async function call(path, value, session, extra = {}) {
  const headers = new Headers();
  if (value !== undefined) {
    headers.set('Origin', origin);
    headers.set('Content-Type', 'application/json');
    headers.set('Idempotency-Key', extra.key ?? randomUUID());
    if (session) headers.set('X-CSRF-Token', session.csrf);
  }
  if (session) headers.set('Cookie', session.cookie);
  for (const [name, text] of Object.entries(extra.headers ?? {})) headers.set(name, text);
  if (extra.csrf !== undefined) headers.set('X-CSRF-Token', extra.csrf);
  const response = await service.fetch(new Request(origin + path, { method: value === undefined ? 'GET' : 'POST', headers, body: value === undefined ? undefined : JSON.stringify(value) }));
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('真实服务必须回 JSON：' + path); }
  calls.push({ path, status: response.status });
  const cookie = response.headers.get('set-cookie')?.split(';')[0];
  return { status: response.status, data, cookie };
}
async function ok(path, value, session, extra) {
  const result = await call(path, value, session, extra);
  assert.equal(result.status, 200, path + ' → ' + JSON.stringify(result.data));
  return result.data;
}
async function login(account, password) {
  const result = await call('/api/auth/login', { account, password });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  return { cookie: result.cookie, csrf: result.data.csrf, user: result.data.user };
}
async function changePassword(session, next) {
  const result = await call('/api/auth/password', { oldPassword: env.EDITOR_DEFAULT_PASSWORD, newPassword: next }, session);
  assert.equal(result.status, 200, JSON.stringify(result.data));
  return { cookie: result.cookie, csrf: result.data.csrf, user: result.data.user };
}
// 直接落库的“已提交版本”：content_games + release + published pin/pack 一致，
// 这样 listing 的 assertListableInTxn 才能在真实代码里通过。
function seeded(ownerId, name, { ordinal = '1.0', listed = 0 } = {}) {
  const gameId = randomUUID(), releaseId = randomUUID(), created = time(), sourceDigest = 'd'.repeat(64);
  sql.exec('INSERT INTO content_used_ids VALUES(?)', gameId);
  sql.exec("INSERT INTO content_games(game_id,owner_id,draft_name,draft_introduction,formal_name,formal_introduction,draft_revision,row_revision,current_release_id,next_ordinal,listed,restricted,created_at,modified_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,0,?,?)", gameId, ownerId, name, name + ' 的說明', name, name + ' 的說明', '1', '1', releaseId, '1.1', listed, created, created);
  sql.exec('INSERT INTO content_releases VALUES(?,?,?,?,?,?)', gameId, releaseId, ordinal, '1', sourceDigest, created);
  const pin = { gameId, name, revision: '1', sourceDigest, chapters: [gameId + '#chapter-1'], publishedAt: created, ordinal };
  sql.exec('INSERT INTO published_games VALUES(?,?,?,?)', gameId, ownerId, JSON.stringify(pin), created);
  sql.exec('INSERT OR REPLACE INTO published_packs VALUES(?,?,?,?,?)', gameId, '1', sourceDigest, JSON.stringify({ revision: '1', sourceDigest }), created);
  return { gameId, releaseId, ordinal, createdAt: created };
}
function draft(ownerId, name) {
  const gameId = randomUUID(), created = time();
  sql.exec('INSERT INTO content_used_ids VALUES(?)', gameId);
  sql.exec("INSERT INTO content_games(game_id,owner_id,draft_name,draft_introduction,formal_name,formal_introduction,draft_revision,row_revision,current_release_id,next_ordinal,listed,restricted,created_at,modified_at) VALUES(?,?,?,?,NULL,NULL,?,?,NULL,?,0,0,?,?)", gameId, ownerId, name, '', '1', '1', '1.0', created, created);
  return { gameId, createdAt: created };
}
const reviewRows = async session => (await ok('/api/admin/reviews', undefined, session)).games;
const rowOf = async (session, gameId) => (await reviewRows(session)).find(entry => entry.gameId === gameId);
const rowRevision = gameId => sql.exec('SELECT row_revision,listed,restricted FROM content_games WHERE game_id=?', gameId).toArray()[0];
const registry = () => sql.exec('SELECT revision FROM content_registry WHERE id=1').toArray()[0].revision;
const audits = gameId => sql.exec('SELECT action,before_revision,after_revision FROM content_audits WHERE game_id=? ORDER BY rowid', gameId).toArray().map(entry => ({ ...entry }));
const rejectPath = gameId => '/api/admin/games/' + gameId + '/review';
const listingPath = gameId => '/api/games/' + gameId + '/listing';
const deletionPath = gameId => '/api/games/' + gameId + '/deletion';
async function rejection(invoke, status, error) {
  const hook = sql.exec('SELECT COUNT(*) n FROM content_audits').toArray()[0].n;
  const result = await invoke();
  assert.equal(result.status, status, JSON.stringify(result.data));
  assert.equal(result.data.error, error);
  assert.equal(sql.exec('SELECT COUNT(*) n FROM content_audits').toArray()[0].n, hook, '被拒绝的请求不得写 audit');
}

try {
  const first = await login('tianyi', env.EDITOR_DEFAULT_PASSWORD);
  const admin = await changePassword(first, 'Dev-Test-Only-2026!x9Z');
  assert.equal(admin.user.role, 'admin');
  const created = await ok('/api/admin/accounts', { account: 'review_author' }, admin);
  const authorFirst = await login('review_author', env.EDITOR_DEFAULT_PASSWORD);
  const author = await changePassword(authorFirst, 'Dev-Test-Only-2026!a7Q');
  assert.equal(author.user.role, 'author');
  const authorId = created.account.id;

  // 1. 清单：只有管理员、跨创作者、字段与「已驳回」推导。
  const pending = seeded(authorId, '待審核樣本');
  const noRelease = draft(authorId, '純草稿樣本');
  const listed = seeded(authorId, '已上架樣本', { ordinal: '1.0', listed: 1 });
  let rows = await reviewRows(admin);
  assert.equal(rows.length, 3);
  const pendingRow = rows.find(entry => entry.gameId === pending.gameId);
  assert.deepEqual(Object.keys(pendingRow).sort(), ['author', 'createdAt', 'gameId', 'introduction', 'name', 'rejected', 'rowRevision', 'state', 'stateTime', 'version']);
  assert.equal(pendingRow.author, 'review_author');
  assert.equal(pendingRow.name, '待審核樣本');
  assert.equal(pendingRow.state, 'pending');
  assert.equal(pendingRow.version, '1.0');
  assert.equal(pendingRow.rejected, false);
  assert.equal(pendingRow.stateTime, pending.createdAt);
  assert.equal(rows.find(entry => entry.gameId === noRelease.gameId).state, 'draft');
  assert.equal(rows.find(entry => entry.gameId === noRelease.gameId).version, null);
  assert.equal(rows.find(entry => entry.gameId === listed.gameId).state, 'listed');
  assert.equal(rows.find(entry => entry.gameId === listed.gameId).rejected, false);
  await rejection(() => call('/api/admin/reviews', undefined, author), 403, 'ADMIN_REQUIRED');
  await rejection(() => call('/api/admin/reviews'), 401, 'LOGIN_REQUIRED');
  checks.push('actual cross-creator review list: admin only, draft/pending/listed derivation, rejected=false, 6 columns + author, no draft bodies');

  // 2. 拒絕：合法回执、同键重放、换键 GAME_CHANGED、已驳回精确推导。
  const before = rowRevision(pending.gameId), registryBefore = registry();
  const rejectKey = randomUUID();
  const rejected = await ok(rejectPath(pending.gameId), { action: 'reject', expectedRowRevision: before.row_revision }, admin, { key: rejectKey });
  assert.deepEqual(Object.keys(rejected).sort(), ['action', 'gameId', 'ordinal', 'rejectedAt', 'rowRevision']);
  assert.equal(rejected.action, 'reject');
  assert.equal(rejected.gameId, pending.gameId);
  assert.equal(rejected.ordinal, '1.0');
  assert.equal(rejected.rowRevision, String(BigInt(before.row_revision) + 1n));
  assert.match(rejected.rejectedAt, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
  const after = rowRevision(pending.gameId);
  assert.equal(after.row_revision, rejected.rowRevision);
  assert.equal(after.listed, 0, '拒絕不得改變上架狀態');
  assert.equal(registry(), registryBefore, '拒絕不產生公開變更，不推 registry');
  assert.deepEqual(audits(pending.gameId).filter(entry => entry.action === 'admin-reject'), [{ action: 'admin-reject', before_revision: '1.0', after_revision: rejected.rowRevision }]);
  assert.deepEqual(await ok(rejectPath(pending.gameId), { action: 'reject', expectedRowRevision: before.row_revision }, admin, { key: rejectKey }), rejected, '同键必须重放原回执');
  assert.equal(rowRevision(pending.gameId).row_revision, rejected.rowRevision, '重放不得再加 revision');
  await rejection(() => call(rejectPath(pending.gameId), { action: 'reject', expectedRowRevision: rejected.rowRevision }, admin, { key: rejectKey }), 409, 'IDEMPOTENCY_CONFLICT');
  await rejection(() => call(rejectPath(pending.gameId), { action: 'reject', expectedRowRevision: before.row_revision }, admin), 409, 'GAME_CHANGED');
  rows = await reviewRows(admin);
  const rejectedRow = rows.find(entry => entry.gameId === pending.gameId);
  assert.equal(rejectedRow.rejected, true);
  assert.equal(rejectedRow.state, 'pending');
  assert.equal(rejectedRow.stateTime, pending.createdAt, '状态时间仍是本次提交时间');
  assert.equal(await rowOf(admin, noRelease.gameId).then(entry => entry.rejected), false, '草稿不得被标成已驳回');
  checks.push('actual 拒絕: receipt {gameId,action,ordinal,rowRevision,rejectedAt}, row_revision +1 only, listed/registry untouched, audit(before_revision=ordinal), same-key replay, new key GAME_CHANGED, rejected=true only for that ordinal');

  // 3. 拒絕守卫：角色/内置/草稿/已上架/删除中/字段。
  await rejection(() => call(rejectPath(pending.gameId), { action: 'reject', expectedRowRevision: rejected.rowRevision }, author), 403, 'ADMIN_REQUIRED');
  await rejection(() => call(rejectPath('wolong-builtin'), { action: 'reject', expectedRowRevision: '1' }, admin), 403, 'BUILTIN_PROTECTED');
  await rejection(() => call(rejectPath(noRelease.gameId), { action: 'reject', expectedRowRevision: '1' }, admin), 409, 'REVIEW_NOT_SUBMITTED');
  await rejection(() => call(rejectPath(listed.gameId), { action: 'reject', expectedRowRevision: '1' }, admin), 409, 'REVIEW_LISTED');
  await rejection(() => call(rejectPath(pending.gameId), { action: 'list', expectedRowRevision: rejected.rowRevision }, admin), 422, 'REVIEW_ACTION');
  await rejection(() => call(rejectPath(pending.gameId), { action: 'reject', expectedRowRevision: rejected.rowRevision, extra: 1 }, admin), 422, 'REQUEST_FIELDS');
  await rejection(() => call(rejectPath(randomUUID()), { action: 'reject', expectedRowRevision: '1' }, admin), 404, 'GAME_NOT_FOUND');
  await rejection(() => call(rejectPath(pending.gameId), { action: 'reject', expectedRowRevision: '9' }, admin), 409, 'GAME_CHANGED');
  checks.push('actual guards: ADMIN_REQUIRED/BUILTIN_PROTECTED/REVIEW_NOT_SUBMITTED/REVIEW_LISTED/REVIEW_ACTION/strict fields/unknown game/CAS, no audit written');

  // 4. 同意上架复用 admin listing：已驳回仍可同意，标记随新状态消失。
  const registryListed = registry();
  const listedNow = await ok(listingPath(pending.gameId), { action: 'list', expectedRowRevision: rejected.rowRevision }, admin, { revision: rejected.rowRevision });
  assert.equal(listedNow.listed, true);
  assert.equal(listedNow.gameId, pending.gameId);
  assert.ok(registry() > registryListed, '同意上架必须推 registry revision');
  rows = await reviewRows(admin);
  const approved = rows.find(entry => entry.gameId === pending.gameId);
  assert.equal(approved.state, 'listed');
  assert.equal(approved.rejected, false);
  assert.equal(approved.version, '1.0');
  assert.match(approved.stateTime, /^\d{4}-\d\d-\d\dT/);
  assert.equal((await ok(listingPath(pending.gameId), { action: 'list', expectedRowRevision: listedNow.rowRevision }, admin, { revision: listedNow.rowRevision })).listed, true, '重复同意不改变状态');
  checks.push('actual 同意上架 reuses admin listing (announcement/registry/distribution path): pending→listed, rejected flag clears, listed state time from admin-list audit');

  // 5. 任何状态可删：已上架、待上架、草稿都建立删除栅栏并消失于清单。
  const registryDeleted = registry();
  const deleted = await ok(deletionPath(pending.gameId), { gameId: pending.gameId, expectedRowRevision: listedNow.rowRevision, confirmationName: '待審核樣本' }, author);
  assert.equal(deleted.state, 'fenced');
  const fenced = rowRevision(pending.gameId);
  assert.equal(fenced.listed, 0, '删除已上架游戏必须同时撤下 listed');
  assert.equal(sql.exec('SELECT COUNT(*) n FROM content_deletion_fences WHERE game_id=?', pending.gameId).toArray()[0].n, 1);
  assert.ok(registry() > registryDeleted, '删除已上架游戏必须推 registry revision 让玩家端重读目录');
  assert.equal(sql.exec('SELECT COUNT(*) n FROM published_games WHERE game_id=?', pending.gameId).toArray()[0].n, 0, '删除必须级联撤下已发布 pin');
  rows = await reviewRows(admin);
  assert.equal(rows.some(entry => entry.gameId === pending.gameId), false, '已删游戏不再出现在审核清单');
  assert.equal((await ok(deletionPath(listed.gameId), { gameId: listed.gameId, expectedRowRevision: '1', confirmationName: '已上架樣本' }, admin)).state, 'fenced');
  assert.equal(rowRevision(listed.gameId).listed, 0);
  const draftFence = await ok(deletionPath(noRelease.gameId), { gameId: noRelease.gameId, expectedRowRevision: '1', confirmationName: '純草稿樣本' }, author);
  assert.equal(draftFence.state, 'fenced');
  await rejection(() => call(rejectPath(pending.gameId), { action: 'reject', expectedRowRevision: fenced.row_revision }, admin), 409, 'GAME_DELETING');
  // 物理删除失败后必须可重取同一栅栏回执继续 purge，不重写栅栏或推进目录。
  const registryBeforeRetry = registry();
  assert.deepEqual(await ok(deletionPath(noRelease.gameId), { gameId: noRelease.gameId, expectedRowRevision: '2', confirmationName: '純草稿樣本' }, author), draftFence);
  assert.equal(rowRevision(noRelease.gameId).row_revision, draftFence.rowRevision);
  assert.equal(registry(), registryBeforeRetry);
  checks.push('actual any-state delete (§6): listed/pending/draft all fenced, listed→0, publish pin/pack cascaded, registry bumped for the listed one, fenced games vanish from review list and refuse further review');

  // 6. 作者侧清单也带 rejected（B3 作者需要看到已驳回）。
  const authorPending = seeded(authorId, '作者樣本');
  await ok(rejectPath(authorPending.gameId), { action: 'reject', expectedRowRevision: '1' }, admin);
  const submissions = (await ok('/api/games/submissions', undefined, author)).games;
  const mine = submissions.find(entry => entry.gameId === authorPending.gameId);
  assert.equal(mine.rejected, true);
  assert.equal(mine.state, 'pending');
  assert.equal(mine.version, '1.0');
  checks.push('actual author-side submissions carry the same rejected derivation; no second stored state');

  const result = {
    checks,
    calls: calls.length,
    rejections: calls.filter(entry => entry.status !== 200).length,
    scope: '真实 editor application 代码 + Node SQLite/bucket；不声称 workerd/R2/分发可见性；不读正式存档',
    newSchema: false,
  };
  process.stdout.write(JSON.stringify(result) + '\n');
} catch (error) {
  process.stderr.write(JSON.stringify({ checks, calls: calls.slice(-12) }, null, 2) + '\n');
  throw error;
} finally {
  storage.close();
}
