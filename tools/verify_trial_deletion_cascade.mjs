// 事项③删除级联功能验证：fence begin 同事务级联 trial_sessions/trial_assets。
// 用 node:sqlite 直连 GameDeletionFence（与生产同类同事务语义），不断言任何原版机制。
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID, randomBytes } from 'node:crypto';
import { format } from 'node:util';
import { GameDeletionFence } from '../server/deletionfence.js';

/** Harness progress goes through tlog (repo convention), not console.log. */
const tlog = (...args) => process.stdout.write(`${format(...args)}\n`);

function makeStorage() {
  const db = new DatabaseSync(':memory:');
  // Eager: node:sqlite runs on prepare().all(); deferring to toArray() would skip writes.
  const sql = { exec: (q, ...v) => { const rows = db.prepare(q).all(...v); return { toArray: () => rows }; } };
  // node:sqlite exposes no transaction() helper: BEGIN/COMMIT/ROLLBACK explicitly.
  const transactionSync = fn => {
    db.exec('BEGIN');
    try { const out = fn(); db.exec('COMMIT'); return out; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  };
  return { sql, transactionSync };
}
const key = () => randomBytes(16).toString('base64url');
const SECRET = randomBytes(32).toString('hex');
const actorOf = id => ({ id, role: 'author', epoch: 1, must_change: 0 });

function baseTables(storage) {
  const e = q => storage.sql.exec(q).toArray();
  e('CREATE TABLE operations (actor TEXT NOT NULL, op_key TEXT NOT NULL, PRIMARY KEY(actor,op_key))');
  e('CREATE TABLE content_operations (actor TEXT NOT NULL, op_key TEXT NOT NULL, PRIMARY KEY(actor,op_key))');
  e('CREATE TABLE content_reservations (actor TEXT NOT NULL, op_key TEXT NOT NULL, PRIMARY KEY(actor,op_key))');
  e('CREATE TABLE content_deletion_operations (actor TEXT NOT NULL, op_key TEXT NOT NULL, request_digest TEXT NOT NULL, auth_epoch INTEGER NOT NULL, game_id TEXT NOT NULL, result_json TEXT NOT NULL, PRIMARY KEY(actor,op_key))');
  e('CREATE TABLE content_deletion_fences (game_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, actor_id TEXT NOT NULL, before_revision TEXT NOT NULL, fence_revision TEXT NOT NULL, created_at TEXT NOT NULL)');
  e('CREATE TABLE content_games (game_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, draft_name TEXT NOT NULL, draft_revision TEXT NOT NULL, row_revision TEXT NOT NULL, listed INTEGER NOT NULL, created_at TEXT NOT NULL, modified_at TEXT NOT NULL)');
  e('CREATE TABLE content_used_ids (game_id TEXT PRIMARY KEY)');
  e('CREATE TABLE content_audits (event_id TEXT PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL, game_id TEXT NOT NULL, before_revision TEXT, after_revision TEXT NOT NULL, created_at TEXT NOT NULL)');
}
function trialTables(storage) {
  const e = q => storage.sql.exec(q).toArray();
  e("CREATE TABLE trial_sessions (trial_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, session_token_hash TEXT NOT NULL, auth_epoch INTEGER NOT NULL, game_id TEXT NOT NULL, draft_revision TEXT NOT NULL, chapter_id TEXT NOT NULL, snapshot_id TEXT NOT NULL, snapshot_digest TEXT NOT NULL, manifest_digest TEXT, state TEXT NOT NULL CHECK(state IN ('active','ended')), end_reason TEXT, created_at TEXT NOT NULL, absolute_until INTEGER NOT NULL)");
  e('CREATE TABLE trial_assets (trial_id TEXT NOT NULL, asset_id TEXT NOT NULL, sha256 TEXT NOT NULL, byte_length INTEGER NOT NULL, bytes BLOB NOT NULL, PRIMARY KEY(trial_id,asset_id))');
}
function addGame(storage, gameId, owner, name) {
  storage.sql.exec('INSERT INTO content_games VALUES(?,?,?,?,?,?,?,?)', gameId, owner, name, '1', '1', 0, new Date().toISOString(), new Date().toISOString());
  storage.sql.exec('INSERT INTO content_used_ids VALUES(?)', gameId);
}
function addTrial(storage, trialId, owner, gameId, active) {
  storage.sql.exec('INSERT INTO trial_sessions VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)', trialId, owner, 'tok', 1, gameId, '1', 'ch', 'snap', 'd'.repeat(64), 'm'.repeat(64), active ? 'active' : 'ended', active ? null : 'explicit', new Date().toISOString(), Date.now() + 3600000);
  if (active) { storage.sql.exec('INSERT INTO trial_assets VALUES(?,?,?,?,?)', trialId, 'manifest', 'a'.repeat(64), 3, Buffer.from('xyz')); }
}
const trialState = (storage, id) => storage.sql.exec('SELECT state, end_reason FROM trial_sessions WHERE trial_id=?', id).toArray()[0];
const assetCount = (storage, id) => storage.sql.exec('SELECT COUNT(*) AS n FROM trial_assets WHERE trial_id=?', id).toArray()[0].n;

// 场景1：同 game 双 active trial＋异 game trial＋已结束 trial → begin 后级联精确
{
  const storage = makeStorage(); baseTables(storage); trialTables(storage);
  const owner = randomUUID(), gameA = randomUUID(), gameB = randomUUID();
  addGame(storage, gameA, owner, 'AB'); addGame(storage, gameB, owner, 'CD');
  const t1 = randomUUID(), t2 = randomUUID(), tOther = randomUUID(), tEnded = randomUUID();
  addTrial(storage, t1, owner, gameA, true); addTrial(storage, t2, owner, gameA, true);
  addTrial(storage, tOther, owner, gameB, true); addTrial(storage, tEnded, owner, gameA, false);
  const fence = new GameDeletionFence({ storage, principal: () => actorOf(owner), operationGuard: () => {}, requestKey: SECRET });
  const r = fence.begin('tok', key(), { gameId: gameA, expectedRowRevision: '1', confirmationName: 'AB' });
  assert.equal(r.state, 'fenced');
  assert.deepEqual([trialState(storage, t1).state, trialState(storage, t1).end_reason], ['ended', 'game-deleting']);
  assert.deepEqual([trialState(storage, t2).state, trialState(storage, t2).end_reason], ['ended', 'game-deleting']);
  assert.equal(assetCount(storage, t1), 0); assert.equal(assetCount(storage, t2), 0);
  assert.equal(trialState(storage, tOther).state, 'active'); assert.equal(assetCount(storage, tOther), 1);
  assert.equal(trialState(storage, tEnded).end_reason, 'explicit');
  // fence 行＋审计行同在（同一事务提交的旁证）
  assert.equal(storage.sql.exec('SELECT COUNT(*) AS n FROM content_deletion_fences WHERE game_id=?', gameA).toArray()[0].n, 1);
  tlog('场景1通过：同事务级联精确（本 game 全清、异 game 不动、已结束行原因不变）');
}
// 场景2：无 trial 表的旧库 → begin 仍成功（存在性守卫）
{
  const storage = makeStorage(); baseTables(storage);
  const owner = randomUUID(), gameA = randomUUID();
  addGame(storage, gameA, owner, 'EF');
  const fence = new GameDeletionFence({ storage, principal: () => actorOf(owner), operationGuard: () => {}, requestKey: SECRET });
  const r = fence.begin('tok', key(), { gameId: gameA, expectedRowRevision: '1', confirmationName: 'EF' });
  assert.equal(r.state, 'fenced');
  tlog('场景2通过：无 trial 表旧库 fence 不受影响');
}
// 场景3：失败路径（确认名错误 409）→ trial 行不动（级联只走成功分支）
{
  const storage = makeStorage(); baseTables(storage); trialTables(storage);
  const owner = randomUUID(), gameA = randomUUID();
  addGame(storage, gameA, owner, 'GH');
  const t1 = randomUUID(); addTrial(storage, t1, owner, gameA, true);
  const fence = new GameDeletionFence({ storage, principal: () => actorOf(owner), operationGuard: () => {}, requestKey: SECRET });
  assert.throws(() => fence.begin('tok', key(), { gameId: gameA, expectedRowRevision: '1', confirmationName: 'WRONG' }), e => e.code === 'DELETE_CONFIRMATION');
  assert.equal(trialState(storage, t1).state, 'active'); assert.equal(assetCount(storage, t1), 1);
  assert.equal(storage.sql.exec('SELECT COUNT(*) AS n FROM content_deletion_fences').toArray()[0].n, 0);
  tlog('场景3通过：失败路径 trial 行与资产原样保留、无 fence 残留');
}
tlog('删除级联三场景全部通过');
