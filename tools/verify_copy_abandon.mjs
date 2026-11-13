// 複製遊戲失敗不得留下任何東西（用戶回報：上一次沒複製成功，資料還在，重複用同名被擋）。
// 邊界：只動這筆操作自己的未完成狀態 —— 歸還名稱、把半成品物件標成 abandoned、
// 終止狀態記成 failed；仍持租約的執行中請求與已 committed 的副本一律不動。
// 這裡用真實 in-memory SQLite 與 vps/sqlite-port，不啟 workerd、不碰 R2。
import { openStorage } from '../vps/sqlite-port.mjs';
import { AdminFullCopy } from '../server/admincopy.js';
import { FIXED_COPY_PROFILE, FIXED_TEMPLATE_PROFILE } from '../server/copyprofile.js';
import { HttpError, fail } from '../server/security.js';

let passed = 0;
const check = (name, cond, extra = '') => {
  if (cond) { passed++; console.log(`ok ${name}`); return; }
  console.error(`FAIL ${name} ${extra}`); process.exitCode = 1;
};
const fails = async (name, fn, code) => {
  try { await fn(); } catch (error) { check(name, error instanceof HttpError && error.code === code, error?.code); return true; }
  check(name, false, 'no failure'); return false;
};

const storage = openStorage(':memory:');
storage.transactionSync(() => {
  storage.sql.exec("CREATE TABLE users (id TEXT PRIMARY KEY, account TEXT UNIQUE NOT NULL, role TEXT NOT NULL, password_hash TEXT NOT NULL, disabled INTEGER NOT NULL, must_change INTEGER NOT NULL, epoch INTEGER NOT NULL, version INTEGER NOT NULL, display_name TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '')");
  storage.sql.exec('CREATE TABLE content_games (game_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, formal_name TEXT, draft_name TEXT NOT NULL, draft_revision TEXT NOT NULL, row_revision TEXT NOT NULL, listed INTEGER NOT NULL DEFAULT 0)');
  storage.sql.exec('CREATE TABLE content_used_ids (game_id TEXT PRIMARY KEY)');
  storage.sql.exec('CREATE TABLE content_names (owner_id TEXT NOT NULL, name TEXT COLLATE BINARY NOT NULL, game_id TEXT NOT NULL, PRIMARY KEY(owner_id,name))');
  storage.sql.exec('CREATE TABLE content_reservations (actor TEXT NOT NULL, op_key TEXT NOT NULL, method TEXT NOT NULL, target TEXT NOT NULL, request_digest TEXT NOT NULL, auth_epoch INTEGER NOT NULL, PRIMARY KEY(actor,op_key))');
  storage.sql.exec('CREATE TABLE content_operations (actor TEXT NOT NULL, op_key TEXT NOT NULL, method TEXT NOT NULL, target TEXT NOT NULL, request_digest TEXT NOT NULL, auth_epoch INTEGER NOT NULL, result_json TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(actor,op_key))');
  storage.sql.exec("INSERT INTO users VALUES('u9','tianyi','admin','{}',0,0,1,1,'','','','')");
});
const actors = { ha: { id: 'u9', role: 'admin', epoch: 1, must_change: 0 } };
const principal = hash => { if (!actors[hash]) fail(401, 'SESSION_INVALID'); return actors[hash]; };
const PINNED = 'approved-builtin-47e358-entities086-1';
const catalog = {
  status: (_hash, id) => { if (id !== PINNED) fail(404, 'SOURCE_NOT_REGISTERED'); return { definitionDigest: 'd'.repeat(64), rootDigest: 'e'.repeat(64) }; },
  definition: () => ({ registryId: PINNED, profileRevision: FIXED_COPY_PROFILE }),
  // 執行時才失敗：這正是「上次沒複製成功」的形狀。
  loadFull: () => fail(503, 'COPY_NOT_CONFIGURED'),
};
const gamesStub = {
  // These failures happen before current-copy installation.
  assertNotDeleting: () => fail(503, 'UNEXPECTED_COPY_STORE_CALL'),
  listOwn: () => fail(503, 'UNEXPECTED_COPY_STORE_CALL'),
  recoverGameId: () => fail(503, 'COPY_NOT_CONFIGURED'),
  assertNameAvailableInTxn(token, name) {
    if (storage.sql.exec('SELECT game_id FROM content_names WHERE owner_id=? AND name=?', principal(token).id, name).toArray().length) fail(409, 'GAME_NAME_OCCUPIED');
  },
};
const blobsStub = { putImmutable: () => fail(503, 'COPY_NOT_CONFIGURED'), read: () => fail(503, 'COPY_NOT_CONFIGURED') };
const copies = new AdminFullCopy({ storage, principal, catalog, games: gamesStub, blobs: blobsStub, roles: ['admin'], profileRevision: FIXED_COPY_PROFILE });
const key = (seed, length = 16) => seed.padEnd(length, '0');
const COLUMNS = '(actor,op_key,request_digest,auth_epoch,game_id,registry_id,definition_digest,catalog_root,profile_revision,metadata_json,state,generation,lease_hash,lease_until,row_revision,created_at,result_json)';
const one = (query, ...values) => storage.sql.exec(query, ...values).toArray()[0];
const count = (query, ...values) => Number(one(query, ...values)?.n ?? 0);
const reserve = (name, opKey) => copies.reserve('ha', opKey, { registryId: PINNED, name, introduction: '' });

// 1. 基線：同名第二次 reserve 被擋（bug 的表現）。
const first = reserve('失敗副本', key('a1'));
check('同名第二次 reserve 在第一次尚未結束時被擋', await fails('occupied', () => reserve('失敗副本', key('a2')), 'GAME_NAME_OCCUPIED'));

// 2. 真的跑失敗（claim 後 execute 丟錯）＝立刻歸還名稱、狀態記 failed。
const cap = copies.claim('ha', key('a1'), first.rowRevision);
storage.transactionSync(() => storage.sql.exec("INSERT INTO copy_objects VALUES(?,?,?,'verified')", first.gameId, 'f'.repeat(64), 1024));
await fails('failed-run', () => copies.execute('ha', cap), 'COPY_NOT_CONFIGURED');
const failedRow = one('SELECT * FROM copy_requests WHERE op_key=?', key('a1'));
check('執行失敗的操作被標成 failed 並釋放租約', failedRow.state === 'failed' && failedRow.lease_hash === null && failedRow.lease_until === 0, JSON.stringify({ state: failedRow.state, lease: failedRow.lease_hash }));
check('失敗操作歸還名稱（content_names 已無此列）', count('SELECT COUNT(*) AS n FROM content_names WHERE game_id=?', first.gameId) === 0);
check('失敗操作的半成品物件被標成 abandoned', count("SELECT COUNT(*) AS n FROM copy_objects WHERE game_id=? AND state='abandoned'", first.gameId) === 1);
const retry = reserve('失敗副本', key('a3'));
check('同名重試成功且拿到新的 gameId', retry.gameId !== first.gameId && retry.state === 'pending');
check('名稱列指向新操作', one('SELECT game_id FROM content_names WHERE owner_id=? AND name=?', 'u9', '失敗副本')?.game_id === retry.gameId);

// 3. 從未 claim 的 pending 死列（分頁關了）超過 30 秒寬限期也會被收回。
storage.transactionSync(() => {
  storage.sql.exec('INSERT INTO content_names VALUES(?,?,?)', 'u9', '中斷副本', 'eeeeeeee-eeee-4eee-aeee-eeeeeeeeeeee');
  storage.sql.exec("INSERT INTO copy_requests"+COLUMNS+" VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", 'u9', key('b1'), 'b'.repeat(64), 1, 'eeeeeeee-eeee-4eee-aeee-eeeeeeeeeeee', PINNED, 'd'.repeat(64), 'e'.repeat(64), FIXED_COPY_PROFILE, JSON.stringify({ version: 1, metadata: { name: '中斷副本', introduction: '' } }), 'pending', 0, null, 0, '1', new Date(Date.now() - 60000).toISOString(), null);
});
const afterSweep = reserve('中斷副本', key('b2'));
check('中斷的 pending 列被清掃並歸還名稱', afterSweep.gameId !== 'eeeeeeee-eeee-4eee-aeee-eeeeeeeeeeee' && one("SELECT state FROM copy_requests WHERE op_key=?", key('b1')).state === 'failed');

// 4. 仍持租約的執行中請求不得被新 reserve 收回。
copies.claim('ha', key('b2'), afterSweep.rowRevision);
check('仍在執行（租約未過）的同名 reserve 依然被擋', await fails('live-running', () => reserve('中斷副本', key('b3')), 'GAME_NAME_OCCUPIED'));
check('執行中的列沒有被清掃動到', one('SELECT state FROM copy_requests WHERE op_key=?', key('b2')).state === 'running');

// 5. 已 committed 的副本不受清掃影響（名稱與列都保留）。
storage.transactionSync(() => {
  storage.sql.exec("UPDATE copy_requests SET state='committed',lease_hash=NULL,lease_until=0 WHERE op_key=?", key('b2'));
  storage.sql.exec('INSERT INTO content_names VALUES(?,?,?)', 'u9', '已建成副本', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc');
  storage.sql.exec("INSERT INTO copy_requests"+COLUMNS+" VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", 'u9', key('c1'), 'c'.repeat(64), 1, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', PINNED, 'd'.repeat(64), 'e'.repeat(64), FIXED_COPY_PROFILE, JSON.stringify({ version: 1, metadata: { name: '已建成副本', introduction: '' } }), 'committed', 1, null, 0, '2', new Date(Date.now() - 3600000).toISOString(), null);
});
reserve('不相干的新名字', key('c2'));
check('已 committed 的副本與名稱不被清掃', one("SELECT state FROM copy_requests WHERE op_key=?", key('c1')).state === 'committed' && count("SELECT COUNT(*) AS n FROM content_names WHERE name='已建成副本'") === 1);
check('模板 profile 的實例仍然受角色門約束', (() => {
  try { new AdminFullCopy({ storage, principal, catalog, games: gamesStub, blobs: blobsStub, roles: ['author'], profileRevision: FIXED_TEMPLATE_PROFILE }).reserve('ha', key('z1'), { registryId: PINNED, name: '越權', introduction: '' }); return false; }
  catch (error) { return error instanceof HttpError && error.code === 'FULL_COPY_ADMIN_REQUIRED'; }
})());

console.log(JSON.stringify({ result: 'PASS-COPY-ABANDON', checks: passed }));
