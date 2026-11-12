// 物理刪除（purge）：把已 fence 的遊戲從資料庫徹底移除。
// 邊界（用戶決定 2026-11，見 journal §4.8）：
//   - 只處理已建立不可逆柵欄（content_deletion_fences 有列）的遊戲；
//   - wolong-builtin 一律 403（內置遊戲條目不在本管線的職責內）；
//   - 全程單一交易，逐表刪除後複查 0 行，任何一步不符預期整體回滾；
//   - 這裡只動資料庫列。R2 位元組由既有 distribution ledger 的 retired-generation
//     清理機制回收（見 §4.8 待辦），不在這個類別裡假裝已刪。
import { fail } from './security.js';

// 依實際 schema 查出的含 game_id 資料表（32 張，扣除分發帳本三表），子表在前、聚合表在後。
// 漏任何一張都會在 COMMIT 時以 defer_foreign_keys 的 FK 檢查失敗（不會靜默通過）。
const TABLES = Object.freeze([
  'content_used_ids',
  'content_names',
  'content_audits',
  'content_announcements',
  'content_game_validations',
  'content_snapshots',
  'content_releases',
  'game_releases',
  'published_games',
  'published_packs',
  'published_pack_chapters',
  'published_pack_assets',
  'copy_requests',
  'copy_objects',
  'copy_origins',
  // T1–T8 副本单套三表：与 game_copies 同生命周期，物理删除必须一并清零。
  'game_copies',
  'publish_slots',
  'copy_validations',
  'content_http_command_targets',
  'content_http_command_proofs',
  'draft_requests',
  'draft_objects',
  'draft_references',
  'draft_topology_moves',
  'draft_topology_rebuilds',
  'trial_sessions',
  'compile_jobs',
  'fallback_compile_objects',
  'data_compile_objects',
  'image_compile_objects',
  'content_private_writes',
  'content_deletion_operations',
  'content_deletion_job_freezes',
  'content_deletion_draft_freezes',
  'content_games',
  'content_deletion_fences',
]);

const revision = value => typeof value === 'string' && /^[1-9][0-9]{0,63}$/.test(value);

export class GamePurge {
  #storage; #sql; #principal; #distribution;
  constructor({ storage, principal, distribution = () => null }) {
    if (typeof principal !== 'function') throw new Error('principal port required');
    this.#storage = storage; this.#sql = storage.sql; this.#principal = principal;
    // 分發帳本的退役流程（檢查點→清 chunks→收尾）由 ledger 自己擁有；
    // 這裡只當呼叫端，不重寫它的不變量。R2 位元組回收是另一批（見 journal §4.9）。
    this.#distribution = distribution;
  }

  // 退役本遊戲的 distribution generations：先打檢查點、再清 chunks、最後核驗收尾。
  // 三步都在刪資料庫列「之前」做完，帳本才看得到完整鏈；失敗只降級，不推翻已刪事實。
  #retire(generations, anchorDigest) {
    const ledger = this.#distribution();
    if (generations.length === 0) return Object.freeze({ state: 'not-applicable', generations: 0 });
    if (!ledger || typeof ledger.retireCheckpointInTxn !== 'function') return Object.freeze({ state: 'pending', code: 'LEDGER_UNAVAILABLE', generations: generations.length });
    try {
      const checkpoint = this.#storage.transactionSync(() => ledger.retireCheckpointInTxn({ retiredGenerations: generations, anchorDigest }));
      const cleaned = this.#storage.transactionSync(() => ledger.cleanRetiredChunksInTxn({ checkpointDigest: checkpoint.checkpointDigest, generations }));
      const closed = this.#storage.transactionSync(() => ledger.completeRetiredCleanupInTxn({ checkpointDigest: checkpoint.checkpointDigest }));
      return Object.freeze({ state: 'completed', checkpointDigest: checkpoint.checkpointDigest, generations: closed.retiredGenerations.length, deletedGenerations: cleaned.deletedGenerations.length });
    } catch (error) {
      return Object.freeze({ state: 'pending', code: String((error && (error.code || error.message)) || error || 'RETIREMENT_FAILED'), generations: generations.length });
    }
  }

  #one(text, ...values) { return this.#sql.exec(text, ...values).toArray()[0]; }

  #actor(tokenHash) {
    const who = this.#principal(tokenHash);
    if (!who || !['admin', 'author'].includes(who.role) || who.mustChangePassword) fail(403, 'PURGE_FORBIDDEN');
    return who;
  }

  purge(tokenHash, gameId, value) {
    if (gameId === 'wolong-builtin') { fail(403, 'BUILTIN_PROTECTED'); }
    if (!/^[a-f0-9-]{36}$/.test(gameId)) { fail(422, 'PURGE_GAME_ID'); }
    const actor = this.#actor(tokenHash);
    const confirmationName = value?.confirmationName, expectedRowRevision = value?.expectedRowRevision;
    if (typeof confirmationName !== 'string' || !revision(expectedRowRevision)) { fail(422, 'PURGE_INPUT'); }
    // 帳本位置必須在刪列前取：events 表不在 purge 範圍，但它們就是退役的選擇依據。
    const generations = this.#sql.exec('SELECT generation FROM content_distribution_events WHERE game_id=? ORDER BY generation', gameId).toArray().map(row => Number(row.generation));
    const anchorDigest = this.#one('SELECT operation_digest FROM content_distribution_events WHERE game_id=? ORDER BY generation DESC LIMIT 1', gameId)?.operation_digest ?? null;
    const retirement = generations.length === 0 ? Object.freeze({ state: 'not-applicable', generations: 0 }) : this.#retire(generations, anchorDigest);
    return this.#storage.transactionSync(() => {
      // 刪除順序不等於 FK 圖的拓樸順序，且最終每張表都是 0 行：把 FK 檢查延到 commit，
      // 任何真實殘留都會在 commit 時失敗（不會被吞掉）。
      this.#sql.exec('PRAGMA defer_foreign_keys=ON');
      const fence = this.#one('SELECT game_id,owner_id,actor_id,fence_revision FROM content_deletion_fences WHERE game_id=?', gameId);
      // 只有已經建立不可逆柵欄的遊戲才談得上「徹底刪除」。
      if (!fence) { fail(409, 'GAME_NOT_FENCED'); }
      if (actor.role !== 'admin' && actor.id !== fence.owner_id) { fail(403, 'PURGE_FORBIDDEN'); }
      const row = this.#one('SELECT game_id,draft_name,row_revision,listed FROM content_games WHERE game_id=?', gameId);
      if (!row) { fail(404, 'GAME_NOT_FOUND'); }
      if (row.draft_name !== confirmationName) { fail(409, 'PURGE_CONFIRMATION'); }
      if (row.row_revision !== expectedRowRevision) { fail(409, 'PURGE_STALE'); }
      if (Number(row.listed) === 1) { fail(409, 'PURGE_LISTED'); }
      // 分發帳本（events／outbox／chunks／checkpoints／cleanup）不在這裡刪：它是 R2 位元組與
      // 可見性的 system of record，退休要經過 retireCheckpointInTxn 的確認+清理兩段，
      // 直接刪列會讓 ledger 的整體不變量（DISTRIBUTION_LEDGER_CORRUPT）失效。
      // storage.sql.exec 回的是資料列游標（沒有 .changes），所以用 DELETE…RETURNING 直接數。
      // 增量建表的库可能还没有新表：不存在即无可删，跳过（回执 tables 计数如实反映实际触及的表）。
      const existing = new Set(this.#sql.exec("SELECT name FROM sqlite_master WHERE type='table'").toArray().map(r => r.name));
      const tables = TABLES.filter(t => existing.has(t));
      const removed = {};
      for (const table of tables) {
        removed[table] = this.#sql.exec(`DELETE FROM ${table} WHERE game_id=? RETURNING game_id`, gameId).toArray().length;
      }
      // 複查：任何一張表還有這個 gameId 的列就是沒刪乾淨，整批回滾；
      // 回执带上残留表名，调用方才能指出是哪一组范围没清掉。
      const leftover = [];
      for (const table of tables) {
        const left = Number(this.#one(`SELECT COUNT(*) AS n FROM ${table} WHERE game_id=?`, gameId)?.n);
        if (left !== 0) { leftover.push(table); }
      }
      if (leftover.length) { fail(503, 'PURGE_INCOMPLETE', { tables: leftover }); }
      if (removed.content_games !== 1) { fail(503, 'PURGE_INCOMPLETE'); }
      if (removed.content_deletion_fences !== 1) { fail(503, 'PURGE_INCOMPLETE'); }
      return Object.freeze({ version: 1, gameId, state: 'purged', removed: Object.freeze({ ...removed }), tables: tables.length, purgedAt: new Date().toISOString(), retirement });
    });
  }
}
