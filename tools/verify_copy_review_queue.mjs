// 管理员待审队列：仅 submitted 槽，附作者/说明原文/版本预告（真实内存 SQLite）。
// 口径：非 admin 403；空队列 []；驳回后离队；作者名取 owner 账号。
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
    CREATE TABLE content_games (game_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, draft_name TEXT, row_revision TEXT NOT NULL DEFAULT '1', created_at TEXT NOT NULL DEFAULT '2026-01-01T00:00:00.000Z', current_release_id TEXT, listed INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE content_releases (game_id TEXT NOT NULL, release_id TEXT NOT NULL, ordinal TEXT NOT NULL, draft_revision TEXT, source_digest TEXT, created_at TEXT, PRIMARY KEY(game_id,ordinal))`);
  db.prepare('INSERT INTO users VALUES(?,?)').run('owner-1', '作者甲');
  db.prepare('INSERT INTO users VALUES(?,?)').run('admin-1', '管理');
  const sql = { exec: (q, ...p) => {
    const stmt = db.prepare(String(q));
    if (/^\s*(SELECT|WITH|PRAGMA)\b/i.test(q)) { const rows = stmt.all(...p); return { toArray: () => rows }; }
    stmt.run(...p); return { toArray: () => [] };
  } };
  const storage = { sql, transactionSync: fn => fn() };
  const owner = { id: 'owner-1', must_change: 0, epoch: 1, role: 'author' };
  const admin = { id: 'admin-1', must_change: 0, epoch: 1, role: 'admin' };
  const games = { assertNotDeleting: () => {}, listOwn: () => [] };
  const store = new GameCopyStore({ storage, principal: tok => (tok === 'admin' ? admin : owner), games });
  return { store, db };
}

const loader = createPinnedCopyLoader({ allocateEntityId: () => 'review-queue-' + randomUUID() });
const profile = new FixedCopyProfile({ loadCopy: loader });
const { game } = await profile.capture({ gameId: 'review-queue-source', ownerId: 'owner-1' });

const failWith = async (fn, status, code) => {
  try { await fn(); } catch (e) { assert.equal(e.status, status); assert.equal(e.code, code); return; }
  assert.fail('expected ' + code);
};

test('待审队列仅列 submitted 并附说明原文，驳回后离队', async () => {
  const { store, db } = makeStore();
  const [a, b] = [randomUUID(), randomUUID()];
  for (const [id, name] of [[a, '甲 game'], [b, '乙 game']]) {
    db.prepare('INSERT INTO content_games (game_id, owner_id, draft_name) VALUES(?,?,?)').run(id, 'owner-1', name);
    store.ensureFromGame('owner', id, game);
  }
  assert.deepEqual(store.reviewQueue('admin'), []);
  await failWith(() => store.reviewQueue('owner'), 403, 'ADMIN_REQUIRED');
  for (const [id, text] of [[a, '甲说明'], [b, '乙说明']]) {
    const v = store.validateWhole('owner', id);
    store.submit('owner', id, { ticket: v.ticket, description: text });
  }
  const queue = store.reviewQueue('admin');
  assert.equal(queue.length, 2);
  assert.deepEqual(queue.map(r => [r.name, r.author, r.description, r.version, r.nextVersion]), [['甲 game', '作者甲', '甲说明', null, '1.0'], ['乙 game', '作者甲', '乙说明', null, '1.0']]);
  assert.ok(queue.every(r => r.validation?.state === 'passed' && typeof r.submittedAt === 'string' && typeof r.rowRevision === 'string'));
  store.rejectSlot('admin', a);
  assert.deepEqual(store.reviewQueue('admin').map(r => r.gameId), [b]);
});
