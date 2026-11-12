// B2 同意链路（方案B）：submitted → formal 覆盖 + ordinal+1 → approved，原子提交。
// 真实内存 SQLite（真事务回滚）＋固定种子；包安装用注入桩（生产接 prepare 后的 installer）。
// 用法：node --test tools/verify_copy_approve_slot.mjs（cwd=web-port）
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { GameCopyStore } from '../server/gamecopy.js';
import { FixedCopyProfile } from '../server/copyprofile.js';
import { createPinnedCopyLoader } from './editor_trusted_copy.mjs';

function makeStore() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, account TEXT NOT NULL);
    CREATE TABLE content_games (game_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, draft_name TEXT NOT NULL, formal_name TEXT, formal_introduction TEXT, next_ordinal TEXT NOT NULL DEFAULT '0', row_revision TEXT NOT NULL DEFAULT '1', current_release_id TEXT, created_at TEXT NOT NULL DEFAULT '2026-01-01T00:00:00.000Z', listed INTEGER NOT NULL DEFAULT 0, restricted INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE content_releases (game_id TEXT NOT NULL, release_id TEXT NOT NULL, ordinal TEXT NOT NULL, draft_revision TEXT NOT NULL, source_digest TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(game_id,ordinal));
    CREATE TABLE published_games (game_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, pin_json TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE content_names (owner_id TEXT NOT NULL, name TEXT NOT NULL, game_id TEXT NOT NULL, PRIMARY KEY(owner_id,name))`);
  db.prepare('INSERT INTO users VALUES(?,?)').run('owner-1', '作者甲');
  db.prepare('INSERT INTO users VALUES(?,?)').run('admin-1', '管理');
  const sql = { exec: (q, ...p) => {
    const stmt = db.prepare(String(q));
    if (/^\s*(SELECT|WITH|PRAGMA)\b/i.test(q) || /\bRETURNING\b/i.test(q)) { const rows = stmt.all(...p); return { toArray: () => rows }; }
    stmt.run(...p); return { toArray: () => [] };
  } };
  const storage = { sql, transactionSync: fn => { db.exec('BEGIN'); try { const out = fn(); db.exec('COMMIT'); return out; } catch (e) { db.exec('ROLLBACK'); throw e; } } };
  const owner = { id: 'owner-1', must_change: 0, epoch: 1, role: 'author' };
  const admin = { id: 'admin-1', must_change: 0, epoch: 1, role: 'admin' };
  const games = { assertNotDeleting: () => {}, listOwn: () => [] };
  const store = new GameCopyStore({ storage, principal: tok => (tok === 'admin' ? admin : owner), games });
  return { store, db };
}

const gameId = randomUUID();
const loader = createPinnedCopyLoader({ allocateEntityId: () => 'approve-slot-' + randomUUID() });
const profile = new FixedCopyProfile({ loadCopy: loader });
const { game: frozenSeed } = await profile.capture({ gameId: 'approve-slot-source', ownerId: 'owner-1' });
const seedGame = { ...structuredClone(frozenSeed), gameId, metadata: { name: '測圖', introduction: '介' } };

const failWith = async (fn, status, code) => {
  try { await fn(); } catch (e) { assert.equal(e.status, status); assert.equal(e.code, code); return; }
  assert.fail('expected ' + code);
};
const submitFlow = store => {
  store.ensureFromGame('owner', gameId, structuredClone(seedGame));
  const v = store.validateWhole('owner', gameId);
  assert.equal(v.state, 'passed');
  const s = store.submit('owner', gameId, { ticket: v.ticket, description: '首版说明' });
  assert.equal(s.state, 'submitted');
};

test('同意：槽 approved＋序号配发＋正式覆盖＋包安装同事务', async () => {
  const { store, db } = makeStore();
  db.prepare('INSERT INTO content_games (game_id, owner_id, draft_name) VALUES(?,?,?)').run(gameId, 'owner-1', '稿名');
  submitFlow(store);
  let installed = 0;
  const r = store.approveSlot('admin', gameId, () => { installed++; });
  assert.equal(installed, 1);
  assert.deepEqual([r.state, r.ordinal], ['approved', '1.0']);
  const slot = db.prepare('SELECT * FROM publish_slots WHERE game_id=?').get(gameId);
  assert.equal(slot.state, 'approved');
  const rel = db.prepare('SELECT * FROM content_releases WHERE game_id=?').all(gameId);
  assert.equal(rel.length, 1);
  assert.deepEqual([rel[0].ordinal, rel[0].draft_revision, rel[0].source_digest], ['1.0', '1.0', r.copyDigest]);
  const pinRow = db.prepare('SELECT pin_json FROM published_games WHERE game_id=?').get(gameId);
  assert.ok(pinRow);
  let pin;
  try { pin = JSON.parse(pinRow.pin_json); } catch { assert.fail('pin_json corrupt'); }
  assert.deepEqual([pin.revision, pin.ordinal, pin.description, pin.name], ['1.0', '1.0', '首版说明', '測圖']);
  assert.ok(Array.isArray(pin.chapters));
  const g = db.prepare('SELECT * FROM content_games WHERE game_id=?').get(gameId);
  assert.equal(g.current_release_id, r.releaseId);
  assert.equal(g.next_ordinal, '1.0');
  assert.equal(g.formal_name, '測圖');
  assert.equal(g.listed, 1, '同意即公开：玩家目录按 listed 出正式版');
  assert.deepEqual(db.prepare('SELECT owner_id,name FROM content_names WHERE game_id=? ORDER BY name').all(gameId).map(row => ({ ...row })), [
    { owner_id: 'owner-1', name: '測圖' }, { owner_id: 'owner-1', name: '稿名' },
  ], '名称登记属于作者，不能转移到审批管理员名下');
  // 同一槽不重批；作者重验可再交开启下一版。
  await failWith(() => store.approveSlot('admin', gameId, () => {}), 409, 'SLOT_NOT_SUBMITTED');
  const v2 = store.validateWhole('owner', gameId);
  store.submit('owner', gameId, { ticket: v2.ticket, description: '第二版' });
  const r2 = store.approveSlot('admin', gameId, () => {});
  assert.equal(r2.ordinal, '1.1');
  assert.equal(db.prepare('SELECT next_ordinal FROM content_games WHERE game_id=?').get(gameId).next_ordinal, '1.1');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM content_releases WHERE game_id=?').get(gameId).n, 1);
});

test('同意按作者名域查重，冲突整体回滚且不安装包', async () => {
  const { store, db } = makeStore();
  db.prepare('INSERT INTO content_games (game_id, owner_id, draft_name) VALUES(?,?,?)').run(gameId, 'owner-1', '稿名');
  db.prepare('INSERT INTO content_names VALUES(?,?,?)').run('owner-1', '測圖', randomUUID());
  submitFlow(store);
  await failWith(() => store.approveSlot('admin', gameId, () => { assert.fail('conflict must not install'); }), 409, 'GAME_NAME_OCCUPIED');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM content_releases').get().n, 0);
  assert.equal(db.prepare('SELECT state FROM publish_slots WHERE game_id=?').get(gameId).state, 'submitted');
  assert.equal(db.prepare('SELECT next_ordinal FROM content_games WHERE game_id=?').get(gameId).next_ordinal, '0');
});

test('同意门禁：非 admin／未提交／过期检验／无包安装器一律不写 formal', async () => {
  const { store, db } = makeStore();
  db.prepare('INSERT INTO content_games (game_id, owner_id, draft_name) VALUES(?,?,?)').run(gameId, 'owner-1', '稿名');
  store.ensureFromGame('owner', gameId, structuredClone(seedGame));
  await failWith(() => store.approveSlot('owner', gameId, () => {}), 403, 'ADMIN_REQUIRED');
  await failWith(() => store.approveSlot('admin', gameId, () => {}), 409, 'SLOT_NOT_SUBMITTED');
  submitFlow(store);
  // 拨回首次提交时间，避开 30 分钟节流（节流本身由 single_slot 覆盖）。
  db.prepare('UPDATE publish_slots SET submitted_at=? WHERE game_id=?').run(new Date(Date.now() - 31 * 60000).toISOString(), gameId);
  await assert.rejects(async () => store.approveSlot('admin', gameId, null), TypeError);
  // 检验过期（副本变更后）：409 且 formal 为空。
  store.writeModule('owner', gameId, 'metadata', { name: '改名', introduction: '' });
  await failWith(() => store.approveSlot('admin', gameId, () => {}), 409, 'VALIDATION_STALE');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM content_releases WHERE game_id=?').get(gameId).n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM published_games WHERE game_id=?').get(gameId).n, 0);
  // 包安装失败：整体回滚，槽仍为 submitted，序号未耗。
  const v = store.validateWhole('owner', gameId);
  store.submit('owner', gameId, { ticket: v.ticket, description: '重验后' });
  const before = db.prepare('SELECT next_ordinal FROM content_games WHERE game_id=?').get(gameId).next_ordinal;
  await assert.rejects(async () => store.approveSlot('admin', gameId, () => { throw Object.assign(new Error('pack down'), { status: 503, code: 'PLAY_NOT_CONFIGURED' }); }), /pack down/);
  assert.equal(db.prepare('SELECT state FROM publish_slots WHERE game_id=?').get(gameId).state, 'submitted');
  assert.equal(db.prepare('SELECT next_ordinal FROM content_games WHERE game_id=?').get(gameId).next_ordinal, before);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM content_releases WHERE game_id=?').get(gameId).n, 0);
  // 受限游戏：同意即拒绝上架，不写 formal、不耗序号、不改 listed
  //（review.txt 有该人话映射，旧门同码；此时槽为已提交＋新鲜检验，正好走到该门）。
  db.prepare('UPDATE content_games SET restricted=1 WHERE game_id=?').run(gameId);
  await failWith(() => store.approveSlot('admin', gameId, () => { throw new Error('must not install'); }), 409, 'LISTING_RESTRICTED');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM content_releases WHERE game_id=?').get(gameId).n, 0);
  assert.equal(db.prepare('SELECT listed FROM content_games WHERE game_id=?').get(gameId).listed, 0);
  db.prepare('UPDATE content_games SET restricted=0 WHERE game_id=?').run(gameId);
});
