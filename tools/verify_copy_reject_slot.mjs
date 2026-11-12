// 管理员驳回 submitted 槽位（真实内存 SQLite，不开浏览器/DOS 存档）。
// 口径：仅 admin 可驳回；非 submitted → 409；驳回只清槽状态（票提交时已核销，说明保留备查）；驳回后作者重验可再交。
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { GameCopyStore } from '../server/gamecopy.js';
import { FixedCopyProfile } from '../server/copyprofile.js';
import { createPinnedCopyLoader } from './editor_trusted_copy.mjs';

function makeStore() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE content_games (game_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, current_release_id TEXT, listed INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE content_releases (game_id TEXT NOT NULL, release_id TEXT NOT NULL, ordinal TEXT NOT NULL, draft_revision TEXT, source_digest TEXT, created_at TEXT, PRIMARY KEY(game_id,ordinal))`);
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

const gameId = randomUUID();
const loader = createPinnedCopyLoader({ allocateEntityId: () => 'reject-slot-' + randomUUID() });
const profile = new FixedCopyProfile({ loadCopy: loader });
const { game } = await profile.capture({ gameId: 'reject-slot-source', ownerId: 'owner-1' });

const failWith = async (fn, status, code) => {
  try { await fn(); } catch (e) { assert.equal(e.status, status); assert.equal(e.code, code); return; }
  assert.fail('expected ' + code);
};

test('管理员驳回 submitted 槽位并放行作者重验再交', async () => {
  const { store, db } = makeStore();
  db.prepare('INSERT INTO content_games VALUES(?,?,?,?)').run(gameId, 'owner-1', null, 0);
  store.ensureFromGame('owner', gameId, game);
  const v1 = store.validateWhole('owner', gameId);
  assert.equal(v1.state, 'passed');
  store.submit('owner', gameId, { ticket: v1.ticket, description: '首版说明' });
  // 作者无权驳回。
  await failWith(() => store.rejectSlot('owner', gameId), 403, 'ADMIN_REQUIRED');
  // 未提交的槽驳回 → 409（另起一局保持 submitted 不动）。
  const otherId = randomUUID();
  db.prepare('INSERT INTO content_games VALUES(?,?,?,?)').run(otherId, 'owner-1', null, 0);
  store.ensureFromGame('owner', otherId, game);
  await failWith(() => store.rejectSlot('admin', otherId), 409, 'SLOT_NOT_SUBMITTED');
  // 管理员驳回：槽回 empty，说明保留备查，作者重验可再交。
  assert.deepEqual(store.rejectSlot('admin', gameId), { gameId, state: 'empty' });
  const slot = db.prepare('SELECT * FROM publish_slots WHERE game_id=?').get(gameId);
  assert.equal(slot.state, 'empty');
  assert.equal(slot.description, '首版说明');
  assert.equal(slot.submitted_at, null);
  const v2 = store.validateWhole('owner', gameId);
  assert.equal(v2.state, 'passed');
  const s2 = store.submit('owner', gameId, { ticket: v2.ticket, description: '修改后重交' });
  assert.equal(s2.state, 'submitted');
  // 无 copy 行 → 404；内置 → 403。
  await failWith(() => store.rejectSlot('admin', randomUUID()), 404, 'COPY_NOT_FOUND');
  await failWith(() => store.rejectSlot('admin', 'wolong-builtin'), 403, 'BUILTIN_PROTECTED');
});
