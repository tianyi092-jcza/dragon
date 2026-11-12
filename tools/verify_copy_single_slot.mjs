// T1–T8 单槽/节流/说明必填/票一次性（内存库，不开 SQLite/浏览器/DOS 存档）。
// 口径：后到覆盖前到；30 分钟节流按 game 计；说明必填多行 1..2000；票提交即核销。
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { GameCopyStore } from '../server/gamecopy.js';
import { FixedCopyProfile } from '../server/copyprofile.js';
import { createPinnedCopyLoader } from './editor_trusted_copy.mjs';

function makeStore() {
  const tables = { content_games: new Map(), game_copies: new Map(), publish_slots: new Map(), copy_validations: new Map(), content_releases: new Map() };
  tables.content_games.set(gameId, { game_id: gameId, owner_id: 'owner-1', current_release_id: null, listed: 0 });
  const sql = {
    exec(query, ...params) {
      const q = String(query);
      if (q.startsWith('CREATE TABLE')) return { toArray: () => [] };
      if (q.includes('FROM content_games')) {
        const row = tables.content_games.get(params[0]);
        return { toArray: () => (row ? [row] : []) };
      }
      if (q.includes('INSERT INTO game_copies')) {
        const [game_id, owner_id, data_json, copy_digest, updated_at] = params;
        tables.game_copies.set(game_id, { game_id, owner_id, data_json, copy_digest, updated_at });
        return { toArray: () => [] };
      }
      if (q.includes('INSERT OR IGNORE INTO publish_slots')) {
        const [game_id] = params;
        if (!tables.publish_slots.has(game_id)) tables.publish_slots.set(game_id, { game_id, ticket: null, description: null, validation_digest: null, state: 'empty', submitted_at: null, validated_at: null });
        return { toArray: () => [] };
      }
      if (q.includes('FROM game_copies')) {
        const row = tables.game_copies.get(params[0]);
        return { toArray: () => (row ? [row] : []) };
      }
      if (q.includes('UPDATE game_copies SET data_json')) {
        const [data_json, copy_digest, updated_at, game_id] = params;
        const row = tables.game_copies.get(game_id);
        row.data_json = data_json; row.copy_digest = copy_digest; row.updated_at = updated_at;
        return { toArray: () => [] };
      }
      if (q.includes('FROM copy_validations')) {
        const row = tables.copy_validations.get(params[0]);
        return { toArray: () => (row ? [row] : []) };
      }
      if (q.includes('DELETE FROM copy_validations')) {
        tables.copy_validations.delete(params[0]);
        return { toArray: () => [] };
      }
      if (q.includes("state='empty' WHERE game_id")) {
        const row = tables.publish_slots.get(params[0]);
        if (row?.state === 'ready') { row.ticket = null; row.validation_digest = null; row.state = 'empty'; }
        return { toArray: () => [] };
      }
      if (q.includes('INSERT INTO copy_validations')) {
        const [game_id, state, copy_digest, problems_json, ticket, checked_at] = params;
        tables.copy_validations.set(game_id, { game_id, state, copy_digest, problems_json, ticket, checked_at });
        return { toArray: () => [] };
      }
      if (q.includes('UPDATE copy_validations SET ticket=NULL')) {
        tables.copy_validations.get(params[0]).ticket = null;
        return { toArray: () => [] };
      }
      if (q.includes('FROM publish_slots')) {
        const row = tables.publish_slots.get(params[0]);
        return { toArray: () => (row ? [row] : []) };
      }
      if (q.includes('INSERT INTO publish_slots')) {
        const [game_id, ticket, description, validation_digest, state, submitted_at, validated_at] = params;
        const prev = tables.publish_slots.get(game_id) ?? {};
        if (q.includes("'submitted'")) tables.publish_slots.set(game_id, { game_id, ticket, description, validation_digest, state, submitted_at, validated_at });
        else tables.publish_slots.set(game_id, { ...prev, game_id, ticket, validation_digest, state, validated_at });
        return { toArray: () => [] };
      }
      if (q.includes('FROM content_releases')) return { toArray: () => [] };
      throw new Error('unmocked sql: ' + q.slice(0, 80));
    },
  };
  const storage = { sql, transactionSync: fn => fn() };
  const actor = { id: 'owner-1', must_change: 0, epoch: 1 };
  const games = { assertNotDeleting: () => {}, listOwn: () => [...tables.content_games.keys()].map(gameId => ({ gameId })) };
  const store = new GameCopyStore({ storage, principal: () => actor, games });
  return { store, tables, actor };
}

const gameId = randomUUID();
const loader = createPinnedCopyLoader({ allocateEntityId: () => 'single-slot-' + randomUUID() });
const profile = new FixedCopyProfile({ loadCopy: loader });
const { game } = await profile.capture({ gameId: 'single-slot-source', ownerId: 'owner-1' });

const failWith = async (fn, status, code) => {
  try { await fn(); } catch (e) { assert.equal(e.status, status); assert.equal(e.code, code); return e; }
  assert.fail('expected ' + code);
};

test('单槽覆盖 + 票一次性 + 说明必填 + 30分钟节流', async () => {
  const { store, tables } = makeStore();
  tables.content_games.set(gameId, { game_id: gameId, owner_id: 'owner-1', current_release_id: null, listed: 0 });
  store.ensureFromGame('tok', gameId, game);
  const v1 = store.validateWhole('tok', gameId);
  assert.equal(v1.state, 'passed');
  assert.ok(v1.ticket);
  // 说明必填：空白说明拒绝。
  await failWith(() => store.submit('tok', gameId, { ticket: v1.ticket, description: '   \n ' }), 422, 'PUBLISH_DESCRIPTION');
  const s1 = store.submit('tok', gameId, { ticket: v1.ticket, description: '首版\n多行说明' });
  assert.equal(s1.state, 'submitted');
  // 票一次性：同一票再用即便换说明也 409。
  await failWith(() => store.submit('tok', gameId, { ticket: v1.ticket, description: '第二版' }), 409, 'VALIDATION_STALE');
  // 节流：重验拿新票后立即再交 → 429（单槽仍保留第一次说明）。
  const v2 = store.validateWhole('tok', gameId);
  await failWith(() => store.submit('tok', gameId, { ticket: v2.ticket, description: '第二版' }), 429, 'PUBLISH_TOO_SOON');
  assert.equal(tables.publish_slots.get(gameId).description, '首版\n多行说明');
  // 31 分钟后重交：后到覆盖前到。
  const slot = tables.publish_slots.get(gameId);
  slot.submitted_at = new Date(Date.now() - 31 * 60 * 1000).toISOString();
  const v3 = store.validateWhole('tok', gameId);
  const s2 = store.submit('tok', gameId, { ticket: v3.ticket, description: '第二版说明' });
  assert.equal(s2.description, '第二版说明');
  assert.equal(tables.publish_slots.get(gameId).description, '第二版说明');
});
