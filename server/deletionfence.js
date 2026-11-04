// Same-DO persistent fence only. NO physical-delete API, cleanup capability or completed-deletion receipt.
import { createHmac } from 'node:crypto';
import { fail, fields } from './security.js';
const uuid = x => typeof x === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(x);
const rev = x => typeof x === 'string' && /^[1-9][0-9]{0,63}$/.test(x);
const keyOK = x => typeof x === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(x);
function parse(text) { try { return JSON.parse(text); } catch { fail(503, 'DELETE_RECEIPT_CORRUPT'); } }
export class GameDeletionFence {
  #storage; #sql; #principal; #guard; #secret;
  constructor({ storage, principal, operationGuard, requestKey }) {
    if (!storage?.sql || typeof principal !== 'function' || typeof operationGuard !== 'function' || typeof requestKey !== 'string' || !/^[a-f0-9]{64}$/.test(requestKey)) { throw new TypeError('same SQLite, trusted principal/key guard and server request secret required'); }
    this.#storage = storage; this.#sql = storage.sql; this.#principal = principal; this.#guard = operationGuard; this.#secret = requestKey;
    // GameMetadataStore initializes both tables in the same transaction domain.
  }
  #one(q, ...v) { return this.#sql.exec(q, ...v).toArray()[0]; }
  #actor(tokenHash) { const actor = this.#principal(tokenHash); if (actor.must_change) { fail(403, 'PASSWORD_CHANGE_REQUIRED');  }return actor; }
  #checkFenceIdempotency(actor, operationKey, digest, captured) {
    // Engineering metadata and production global namespaces cannot reuse the key.
    for (const table of ['operations', 'content_operations', 'content_reservations']) { if (this.#one(`SELECT op_key FROM ${table} WHERE actor=? AND op_key=?`, actor.id, operationKey)) { fail(409, 'IDEMPOTENCY_CONFLICT'); } }
    const old = this.#one('SELECT * FROM content_deletion_operations WHERE actor=? AND op_key=?', actor.id, operationKey);
    if (!old) { return null; }
    if (old.request_digest !== digest || old.game_id !== captured.gameId) { fail(409, 'IDEMPOTENCY_CONFLICT'); }
    return this.#receipt(actor, old);
  }
  #assertFenceable(actor, captured) {
    const row = this.#target(actor, captured.gameId);
    if (this.#one('SELECT game_id FROM content_deletion_fences WHERE game_id=?', row.game_id)) { fail(409, 'GAME_DELETING'); }
    if (row.row_revision !== captured.expectedRowRevision) { fail(409, 'GAME_CHANGED'); }
    if (captured.confirmationName !== row.draft_name) { fail(409, 'DELETE_CONFIRMATION'); }
    if (!this.#one('SELECT game_id FROM content_used_ids WHERE game_id=?', row.game_id)) { fail(503, 'DELETE_ID_CORRUPT'); }
    return row;
  }
  #cascadeTrialsForGame(gameId) {
    // Trial cascade: eagerly end active trials of this game and drop their derived
    // assets. Reason/table/column contract mirrors TrialSessions.#close in
    // server/trials.js (lazy 'game-deleting' path); tables may not exist on DBs
    // created before trials, hence the sqlite_master guard — absence means no trials.
    const trialTables = new Set(this.#sql.exec("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('trial_sessions','trial_assets')").toArray().map(entry => entry.name));
    if (trialTables.has('trial_sessions') && trialTables.has('trial_assets')) {
      this.#sql.exec("UPDATE trial_sessions SET state='ended', end_reason='game-deleting' WHERE game_id=? AND state='active'", gameId);
      this.#sql.exec('DELETE FROM trial_assets WHERE trial_id IN (SELECT trial_id FROM trial_sessions WHERE game_id=?)', gameId);
    }
  }
  #cascadePublishForGame(gameId) {
    // Publish cascade: a fenced (deleted) game must not stay listed or
    // servable. Mirrors the trial cascade above; tables may not exist on DBs
    // created before the publish registry, hence the sqlite_master guard.
    const tables = new Set(this.#sql.exec("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('published_games','published_packs','published_pack_assets','published_pack_chapters','game_portraits')").toArray().map(entry => entry.name));
    if (tables.has('published_games')) { this.#sql.exec('DELETE FROM published_games WHERE game_id=?', gameId); }
    if (tables.has('game_portraits')) { this.#sql.exec('DELETE FROM game_portraits WHERE game_id=?', gameId); }
    if (tables.has('published_packs')) { this.#sql.exec('DELETE FROM published_packs WHERE game_id=?', gameId); }
    if (tables.has('published_pack_assets')) { this.#sql.exec('DELETE FROM published_pack_assets WHERE game_id=?', gameId); }
    if (tables.has('published_pack_chapters')) { this.#sql.exec('DELETE FROM published_pack_chapters WHERE game_id=?', gameId); }
  }
  #target(actor, gameId) {
    if (gameId === 'wolong-builtin') { fail(403, 'BUILTIN_PROTECTED'); }
    if (!uuid(gameId)) { fail(422, 'DELETE_GAME_ID'); }
    const row = this.#one('SELECT * FROM content_games WHERE game_id=?', gameId);
    if (!row || (row.owner_id !== actor.id && actor.role !== 'admin')) { fail(404, 'GAME_NOT_FOUND'); }
    return row;
  }
  #decoded(operation) {
    const value = parse(operation.result_json);
    if (!value || typeof value !== 'object' || Array.isArray(value)) { fail(503, 'DELETE_RECEIPT_CORRUPT'); }
    if (!Object.hasOwn(value, 'version')) { return { result: value, distribution: undefined }; }
    const ref = value.distribution, logged = value.version === 2;
    if ((value.version !== 1 && value.version !== 2) || Object.keys(value).sort().join(',') !== 'distribution,result,version' || !ref || Array.isArray(ref) || Object.keys(ref).sort().join(',') !== (logged ? 'generation,operationId,releaseDigest' : 'generation,operationId') || !uuid(ref.operationId) || !Number.isSafeInteger(ref.generation) || ref.generation < 1 || (logged && ref.releaseDigest !== null && !/^[a-f0-9]{64}$/.test(ref.releaseDigest)) || JSON.stringify({ version: value.version, result: value.result, distribution: ref }) !== operation.result_json) { fail(503, 'DELETE_RECEIPT_CORRUPT'); }
    this.#distribution(operation.game_id, ref);
    return { result: value.result, distribution: Object.freeze({ ...ref }) };
  }
  #distribution(gameId, ref) {
    const event = this.#one('SELECT game_id,kind,generation FROM content_distribution_events WHERE operation_id=?', ref.operationId);
    if (!event || event.game_id !== gameId || event.kind !== 'delete-fence' || event.generation !== ref.generation) { fail(503, 'DELETE_DISTRIBUTION_CORRUPT'); }
  }
  #receipt(actor, operation) {
    if (operation.auth_epoch !== actor.epoch) { fail(409, 'OPERATION_REVOKED'); }
    this.#target(actor, operation.game_id);
    const fence = this.#one('SELECT * FROM content_deletion_fences WHERE game_id=?', operation.game_id), { result } = this.#decoded(operation);
    if (!result || typeof result !== 'object' || Array.isArray(result) || Object.keys(result).sort().join(',') !== 'createdAt,gameId,rowRevision,state') { fail(503, 'DELETE_RECEIPT_CORRUPT'); }
    if (!fence || result.gameId !== operation.game_id || result.state !== 'fenced' || result.rowRevision !== fence.fence_revision || result.createdAt !== fence.created_at || fence.actor_id !== actor.id) { fail(503, 'DELETE_RECEIPT_CORRUPT'); }
    return result;
  }
  // Minimal deletion confirmation metadata, not access to another author's draft.
  previewForAdmin(tokenHash, gameId) {
    return this.#storage.transactionSync(() => {
      const actor = this.#actor(tokenHash);
      if (actor.role !== 'admin') { fail(403, 'ADMIN_REQUIRED'); }
      const row = this.#target(actor, gameId);
      this.#assertFenceable(actor, { gameId, expectedRowRevision: row.row_revision, confirmationName: row.draft_name });
      if (!rev(row.row_revision) || typeof row.draft_name !== 'string' || !row.draft_name.isWellFormed() || [...row.draft_name].length > 8) { fail(503, 'DELETE_METADATA_CORRUPT'); }
      return Object.freeze({ gameId, rowRevision: row.row_revision, confirmationName: row.draft_name });
    });
  }
  begin(tokenHash, operationKey, input, recordDistribution) {
    if (recordDistribution !== undefined && (typeof recordDistribution !== 'function' || recordDistribution.constructor?.name === 'AsyncFunction')) { throw new TypeError('synchronous trusted deletion distribution callback required'); }
    fields(input, ['gameId', 'expectedRowRevision', 'confirmationName']);
    const captured = { gameId: input.gameId, expectedRowRevision: input.expectedRowRevision, confirmationName: input.confirmationName };
    if (!keyOK(operationKey) || !rev(captured.expectedRowRevision) || typeof captured.confirmationName !== 'string' || !captured.confirmationName.isWellFormed() || [...captured.confirmationName].length > 8) { fail(422, 'DELETE_INPUT'); }
    if (captured.gameId === 'wolong-builtin') { fail(403, 'BUILTIN_PROTECTED'); }
    if (!uuid(captured.gameId)) { fail(422, 'DELETE_GAME_ID'); }
    const digest = createHmac('sha256', this.#secret).update(JSON.stringify(['delete-fence-1', captured])).digest('hex');
    return this.#storage.transactionSync(() => {
      const actor = this.#actor(tokenHash); this.#guard(actor.id, operationKey);
      const replayed = this.#checkFenceIdempotency(actor, operationKey, digest, captured);
      if (replayed) { return replayed; }
      const row = this.#assertFenceable(actor, captured);
      const next = String(BigInt(row.row_revision) + 1n), time = new Date().toISOString();
      const updated = this.#one('UPDATE content_games SET row_revision=?, listed=0 WHERE game_id=? AND row_revision=? RETURNING game_id', next, row.game_id, row.row_revision);
      if (!updated) { fail(409, 'GAME_CHANGED'); }
      this.#sql.exec('INSERT INTO content_deletion_fences VALUES(?,?,?,?,?,?)', row.game_id, row.owner_id, actor.id, row.row_revision, next, time);
      this.#cascadeTrialsForGame(row.game_id);
      this.#cascadePublishForGame(row.game_id);
      const result = { gameId: row.game_id, state: 'fenced', rowRevision: next, createdAt: time };
      let text = JSON.stringify(result);
      if (recordDistribution !== undefined) {
        const record = recordDistribution();
        if (record && typeof record.then === 'function') { throw new TypeError('synchronous deletion distribution result required'); }
        if (!record || record.deduped !== false || record.gameId !== row.game_id || record.kind !== 'delete-fence' || !uuid(record.operationId) || !Number.isSafeInteger(record.generation) || record.generation < 1) { fail(503, 'DELETE_DISTRIBUTION_CORRUPT'); }
        const distribution = { operationId: record.operationId, generation: record.generation };
        this.#distribution(row.game_id, distribution);
        text = JSON.stringify({ version: 1, result, distribution });
      }
      this.#sql.exec('INSERT INTO content_deletion_operations VALUES(?,?,?,?,?,?)', actor.id, operationKey, digest, actor.epoch, row.game_id, text);
      this.#sql.exec('INSERT INTO content_audits VALUES(?,?,?,?,?,?,?)', crypto.randomUUID(), actor.id, 'delete-fence', row.game_id, row.row_revision, next, time);
      const current = this.#actor(tokenHash);
      if (current.id !== actor.id || current.epoch !== actor.epoch || current.role !== actor.role) { fail(401, 'SESSION_INVALID'); }
      this.#guard(current.id, operationKey);
      const finalRow = this.#target(current, row.game_id);
      if (finalRow.owner_id !== row.owner_id || finalRow.row_revision !== next || finalRow.listed !== 0) { fail(503, 'DELETE_RECEIPT_CORRUPT'); }      return this.#receipt(current, this.#one('SELECT * FROM content_deletion_operations WHERE actor=? AND op_key=?', actor.id, operationKey));
    });
  }
  query(tokenHash, operationKey) {
    if (!keyOK(operationKey)) { fail(422, 'DELETE_INPUT'); }
    return this.#storage.transactionSync(() => {
      const actor = this.#actor(tokenHash);
      this.#guard(actor.id, operationKey);
      const row = this.#one('SELECT * FROM content_deletion_operations WHERE actor=? AND op_key=?', actor.id, operationKey);
      if (!row) { fail(404, 'DELETE_OPERATION_NOT_FOUND'); }
      return this.#receipt(actor, row);
    });
  }
  queryDistribution(tokenHash, operationKey, gameId) {
    return this.#storage.transactionSync(() => {
      const result = this.query(tokenHash, operationKey);
      if (result.gameId !== gameId) { fail(404, 'DELETE_OPERATION_NOT_FOUND'); }
      const actor = this.#actor(tokenHash), row = this.#one('SELECT * FROM content_deletion_operations WHERE actor=? AND op_key=?', actor.id, operationKey);
      const { distribution } = this.#decoded(row);
      if (distribution === undefined) { fail(503, 'DISTRIBUTION_STATUS_UNAVAILABLE'); }
      return Object.freeze({ result, distribution });
    });
  }
}
