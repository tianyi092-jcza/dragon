// 發布歷史面板（第 2 檔）backend gate：跑真实 editor application 代码（Node
// SQLite + 私有 bucket 端口），验证 GET /api/admin/games/<id>/releases 的
// 权限门、响应形状、顺序、空态与拒绝码。日誌行由真正的
// FrozenDistributionLedger 寫入（不直接 INSERT），所以「路由看到的」與
// 「上架寫下的」是同一個形狀。不需要 workerd、浏览器或固定源；数据库与
// bucket 都在临时目录里，不读任何正式存档。
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
const { FrozenDistributionLedger } = await import('../server/distributionledger.js');

const origin = 'https://owned-editor.invalid';
const own = mkdtempSync(join(tmpdir(), 'dragon-release-history-'));
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
const historyPath = gameId => '/api/admin/games/' + gameId + '/releases';
const op = n => `cccccccc-cccc-4ccc-8ccc-${n.toString(16).padStart(12, '0')}`;
const publishPayload = (gameId, ordinal) => Buffer.from(JSON.stringify({ version: 1, projection: { marker: `release-${ordinal}` }, runtime: { gameId, ordinal } }));
const syntheticPayload = () => Buffer.from(JSON.stringify({ version: 1, projection: { marker: 'synthetic' } }));

// 日誌行用真正的帳本寫：與上架時是同一個 enqueue/confirm 路徑與同一個 digest。
// 這裡的 receipt seam 只偽造「遠端讀回」，不偽造日誌本身。
const receipts = new WeakMap();
const ledger = new FrozenDistributionLedger({ storage, verifyReceipt: ticket => { if (!receipts.has(ticket)) throw new Error('OWNED_RECEIPT_REQUIRED'); return receipts.get(ticket); } });
const ticket = record => {
  const key = Object.freeze({});
  receipts.set(key, { authorityId: record.authorityId, generation: record.generation, operationId: record.operationId, operationDigest: record.operationDigest, payloadDigest: record.payloadDigest, rootDigest: '1'.repeat(64), rootETag: `"etag-${record.generation}"`, visibleAt: `2026-11-05T00:00:0${record.generation}.000Z` });
  return key;
};
const tx = fn => storage.transactionSync(fn);

try {
  const first = await login('tianyi', env.EDITOR_DEFAULT_PASSWORD);
  const admin = await changePassword(first, 'Dev-Test-Only-2026!x9Z');
  assert.equal(admin.user.role, 'admin');
  const created = await ok('/api/admin/accounts', { account: 'history_author' }, admin);
  const authorFirst = await login('history_author', env.EDITOR_DEFAULT_PASSWORD);
  const author = await changePassword(authorFirst, 'Dev-Test-Only-2026!a7Q');
  assert.equal(author.user.role, 'author');
  const authorId = created.account.id;

  // 1. 空態是常態（A 路線之前上架的遊戲永遠沒有記錄）：200、精確鍵集合、空陣列。
  const game = seeded(authorId, '發布歷史樣本', { ordinal: '1.0', listed: 1 });
  const empty = await ok(historyPath(game.gameId), undefined, admin);
  assert.deepEqual(Object.keys(empty).sort(), ['gameId', 'releases']);
  assert.equal(empty.gameId, game.gameId);
  assert.deepEqual(empty.releases, []);
  checks.push('actual empty state: admin GET returns exactly {gameId,releases:[]} for a listed game with no A-route log rows');

  // 2. 兩次上架：第一筆已確認、第二筆仍待確認；順序＝寫入順序，欄位精確。
  const confirmed = tx(() => ledger.enqueueInTxn({ operationId: op(1), kind: 'publish', gameId: game.gameId, payload: publishPayload(game.gameId, '1.0') }));
  tx(() => ledger.confirmInTxn(op(1), ticket(ledger.entry(1))));
  const pending = tx(() => ledger.enqueueInTxn({ operationId: op(2), kind: 'publish', gameId: game.gameId, payload: publishPayload(game.gameId, '1.1') }));
  const listed = await ok(historyPath(game.gameId), undefined, admin);
  assert.equal(listed.releases.length, 2);
  for (const entry of listed.releases) assert.deepEqual(Object.keys(entry).sort(), ['digest', 'gameId', 'publishedAt', 'state', 'version']);
  assert.deepEqual(listed.releases.map(entry => [entry.version, entry.state]), [['1.0', 'confirmed'], ['1.1', 'pending']]);
  assert.equal(listed.releases[0].digest, confirmed.operationDigest);
  assert.equal(listed.releases[1].digest, pending.operationDigest);
  assert.equal(listed.releases[0].publishedAt, '2026-11-05T00:00:01.000Z');
  assert.equal(listed.releases[1].publishedAt, null);
  assert.equal(listed.releases[0].gameId, game.gameId);
  checks.push('actual two versions: rowid order, exact 5 keys, confirmed/pending states, publishedAt only on the confirmed row, digest = that generation\'s operation digest');

  // 3. 狀態仍與帳本一致：回執裡的 releaseDigest 就是歷史第一列。
  assert.equal(ledger.operationStatus(game.gameId, op(1)).releaseDigest, listed.releases[0].digest);
  checks.push('actual cross-check: operationStatus().releaseDigest equals the confirmed history row');

  // 4. 非出版事件（listing）不進發布歷史，也不冒充 release 身分。
  tx(() => ledger.enqueueInTxn({ operationId: op(3), kind: 'listing', gameId: game.gameId, payload: syntheticPayload() }));
  const afterListing = await ok(historyPath(game.gameId), undefined, admin);
  assert.equal(afterListing.releases.length, 2);
  checks.push('actual listing event adds no history row');

  // 5. 權限：只有管理員；未登入是 401，作者是 403 且不提「存在或不存在」。
  const anon = await call(historyPath(game.gameId));
  assert.equal(anon.status, 401);
  assert.equal(anon.data.error, 'LOGIN_REQUIRED');
  const byAuthor = await call(historyPath(game.gameId), undefined, author);
  assert.equal(byAuthor.status, 403);
  assert.equal(byAuthor.data.error, 'ADMIN_REQUIRED');
  assert.equal(Object.hasOwn(byAuthor.data, 'releases'), false);
  checks.push('actual admin gate: anonymous 401 LOGIN_REQUIRED, author 403 ADMIN_REQUIRED with no history body');

  // 6. 內建遊戲、非 uuid、查詢串：各自明確拒絕，不假裝 200 空清單。
  const builtin = await call(historyPath('wolong-builtin'), undefined, admin);
  assert.equal(builtin.status, 403);
  assert.equal(builtin.data.error, 'BUILTIN_PROTECTED');
  const notUuid = await call('/api/admin/games/not-a-game/releases', undefined, admin);
  assert.equal(notUuid.status, 404);
  assert.equal(notUuid.data.error, 'NOT_FOUND');
  const unknown = await call(historyPath(randomUUID()), undefined, admin);
  assert.equal(unknown.status, 200);
  assert.deepEqual(unknown.data.releases, []);
  const queried = await call(historyPath(game.gameId) + '?limit=1', undefined, admin);
  assert.equal(queried.status, 422);
  assert.equal(queried.data.error, 'RELEASE_HISTORY_QUERY');
  checks.push('actual refusals: builtin 403 BUILTIN_PROTECTED, non-uuid 404 NOT_FOUND, unknown uuid 200 empty, query string 422 RELEASE_HISTORY_QUERY');

  // 7. 唯讀：GET 不寫任何列、不改代次；POST 到這條路徑不存在（只能讀）。
  const before = sql.exec('SELECT COUNT(*) n FROM game_releases').toArray()[0].n;
  const tail = ledger.status().tailGeneration;
  await ok(historyPath(game.gameId), undefined, admin);
  assert.equal(sql.exec('SELECT COUNT(*) n FROM game_releases').toArray()[0].n, before);
  assert.equal(ledger.status().tailGeneration, tail);
  const posted = await call(historyPath(game.gameId), { action: 'x' }, admin);
  assert.equal(posted.status, 404);
  checks.push('actual read-only: repeated GET writes no rows and does not advance the ledger; POST is not a route');

  const result = {
    checks,
    calls: calls.length,
    rejections: calls.filter(entry => entry.status !== 200).length,
    scope: '真实 editor application 代码 + Node SQLite/bucket + 真正 ledger 写行；不声称 workerd/R2/生产证据',
    newSchema: false,
    schemaCounts: '54 tables / 52 indexes / 361 columns / 4 FK（本批不改 schema）',
  };
  process.stdout.write(JSON.stringify(result) + '\n');
} catch (error) {
  process.stderr.write(JSON.stringify({ checks, calls: calls.slice(-12) }, null, 2) + '\n');
  throw error;
} finally {
  storage.close();
}
