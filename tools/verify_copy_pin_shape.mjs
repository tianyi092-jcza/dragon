// pin 双形读契约（方案 B）：旧数字修订 pin 无说明仍可读（description null，不静默补）
// 新 ordinal 修订 pin 必须带说明原文，缺字段 500 PUBLISH_CORRUPT。
// 用法：node --test tools/verify_copy_pin_shape.mjs（cwd=web-port）
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { PublishedGames } from '../server/published.js';

function makeStore() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, account TEXT NOT NULL);
    CREATE TABLE content_games (game_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, listed INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE published_games (game_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, pin_json TEXT NOT NULL, updated_at TEXT NOT NULL)`);
  const sql = { exec: (q, ...p) => {
    const stmt = db.prepare(String(q));
    if (/^\s*(SELECT|WITH|PRAGMA)\b/i.test(q)) { const rows = stmt.all(...p); return { toArray: () => rows }; }
    stmt.run(...p); return { toArray: () => [] };
  } };
  const storage = { sql, transactionSync: fn => fn() };
  const store = new PublishedGames({ storage, principal: () => ({ id: 'x', must_change: 0 }) });
  return { store, db };
}
const put = (db, gameId, pin) => {
  db.prepare('INSERT OR IGNORE INTO users VALUES(?,?)').run('owner-1', '作者');
  db.prepare('INSERT OR IGNORE INTO content_games (game_id, owner_id, listed) VALUES(?,?,1)').run(gameId, 'owner-1');
  db.prepare('INSERT INTO published_games VALUES(?,?,?,?)').run(gameId, 'owner-1', JSON.stringify(pin), '2026-01-02T03:04:05.000Z');
};

test('旧数字 pin 无说明仍可读，新 ordinal pin 缺说明则 500', async () => {
  const { store, db } = makeStore();
  const legacyId = randomUUID(), copyId = randomUUID(), badId = randomUUID();
  put(db, legacyId, { gameId: legacyId, name: '旧', revision: '3', sourceDigest: 'a'.repeat(64), chapters: ['c1'], publishedAt: '2026-01-01T00:00:00.000Z', ordinal: '1.2' });
  put(db, copyId, { gameId: copyId, name: '新', revision: '1.0', sourceDigest: 'b'.repeat(64), chapters: ['c1'], publishedAt: '2026-01-02T03:04:05.000Z', ordinal: '1.0', description: '首版说明' });
  const rows = store.list();
  assert.equal(rows.find(r => r.gameId === legacyId).description, null);
  assert.equal(rows.find(r => r.gameId === copyId).description, '首版说明');
  put(db, badId, { gameId: badId, name: '坏', revision: '1.1', sourceDigest: 'c'.repeat(64), chapters: ['c1'], publishedAt: '2026-01-02T03:04:05.000Z', ordinal: '1.1' });
  assert.throws(() => store.list(), e => e.code === 'PUBLISH_CORRUPT');
});
