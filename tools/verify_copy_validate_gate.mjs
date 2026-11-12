// T2/T5 检验–上架状态机（内存库）：未验禁用 → 通过解禁一次 → 提交再禁用 → 改后重验再解禁。
// blockedReason 必须人话，不贴原始键/摘要。
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { GameCopyStore } from '../server/gamecopy.js';
import { FixedCopyProfile } from '../server/copyprofile.js';
import { createPinnedCopyLoader } from './editor_trusted_copy.mjs';

function makeStore(gameId) {
  const tables = { content_games: new Map(), game_copies: new Map(), publish_slots: new Map(), copy_validations: new Map() };
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
        Object.assign(tables.game_copies.get(game_id), { data_json, copy_digest, updated_at });
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
        const row = tables.copy_validations.get(params[0]);
        if (row) row.ticket = null;
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
  const games = { assertNotDeleting: () => {}, listOwn: () => [...tables.content_games.keys()].map(id => ({ gameId: id })) };
  const store = new GameCopyStore({ storage, principal: () => actor, games });
  return { store, tables };
}

const gameId = randomUUID();
const loader = createPinnedCopyLoader({ allocateEntityId: () => 'validate-gate-' + randomUUID() });
const profile = new FixedCopyProfile({ loadCopy: loader });
const { game } = await profile.capture({ gameId: 'validate-gate-source', ownerId: 'owner-1' });

const checkHuman = s => {
  assert.ok(s.blockedReason && typeof s.blockedReason === 'string' && s.blockedReason.length >= 4, 'blockedReason 必须人话');
  for (const leak of ['COPY_', 'VALIDATION_', 'PUBLISH_TOO_SOON', 'sha256']) {
    assert.ok(!s.blockedReason.includes(leak), 'blockedReason 不贴原始键: ' + leak);
  }
  if (s.copyDigest) assert.ok(!s.blockedReason.includes(s.copyDigest), 'blockedReason 不贴摘要');
};

test('检验–上架状态机往返', async () => {
  const { store, tables } = makeStore(gameId);
  store.ensureFromGame('tok', gameId, game);
  // 未验禁用。
  const s0 = store.submission('tok', gameId);
  assert.equal(s0.publishEnabled, false);
  checkHuman(s0);
  // 通过解禁一次。
  const v1 = store.validateWhole('tok', gameId);
  assert.equal(v1.state, 'passed');
  const s1 = store.submission('tok', gameId);
  assert.equal(s1.publishEnabled, true);
  assert.equal(s1.blockedReason, null);
  // 提交再禁用。
  store.submit('tok', gameId, { ticket: v1.ticket, description: '第一版\n说明' });
  const s2 = store.submission('tok', gameId);
  assert.equal(s2.publishEnabled, false);
  checkHuman(s2);
  // 改后（元数据覆盖写）必须重验。
  // 改后（元数据覆盖写）必须重验；节流键仍在，需越过 30 分钟再验才解禁。
  store.writeModule('tok', gameId, 'metadata', { name: game.name ?? '改名', introduction: '改简介' });
  const s3 = store.submission('tok', gameId);
  assert.equal(s3.publishEnabled, false);
  checkHuman(s3);
  tables.publish_slots.get(gameId).submitted_at = new Date(Date.now() - 31 * 60 * 1000).toISOString();
  // 重验再解禁。
  const v2 = store.validateWhole('tok', gameId);
  assert.equal(v2.state, 'passed');
  const s4 = store.submission('tok', gameId);
  assert.equal(s4.publishEnabled, true);
  assert.equal(s4.blockedReason, null);
});
