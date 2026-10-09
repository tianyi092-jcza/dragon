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
    if (!storage?.sql || typeof principal !== 'function' || typeof operationGuard !== 'function' || typeof requestKey !== 'string' || !/^[a-f0-9]{64}$/.test(requestKey)) throw new TypeError('same SQLite, trusted principal/key guard and server request secret required');
    this.#storage = storage; this.#sql = storage.sql; this.#principal = principal; this.#guard = operationGuard; this.#secret = requestKey;
    // GameMetadataStore initializes both tables in the same transaction domain.
  }
  #one(q, ...v) { return this.#sql.exec(q, ...v).toArray()[0]; }
  #actor(tokenHash) { const actor = this.#principal(tokenHash); if (actor.must_change) fail(403, 'PASSWORD_CHANGE_REQUIRED'); return actor; }
  #target(actor, gameId) {
    if (gameId === 'wolong-builtin') fail(403, 'BUILTIN_PROTECTED');
    if (!uuid(gameId)) fail(422, 'DELETE_GAME_ID');
    const row = this.#one('SELECT * FROM content_games WHERE game_id=?', gameId);
    if (!row || (row.owner_id !== actor.id && actor.role !== 'admin')) fail(404, 'GAME_NOT_FOUND');
    return row;
  }
  #receipt(actor, operation) {
    if (operation.auth_epoch !== actor.epoch) fail(409, 'OPERATION_REVOKED');
    this.#target(actor, operation.game_id);
    const fence = this.#one('SELECT * FROM content_deletion_fences WHERE game_id=?', operation.game_id), result = parse(operation.result_json);
    if (!result || typeof result !== 'object' || Array.isArray(result) || Object.keys(result).sort().join(',') !== 'createdAt,gameId,rowRevision,state') fail(503, 'DELETE_RECEIPT_CORRUPT');
    if (!fence || result.gameId !== operation.game_id || result.state !== 'fenced' || result.rowRevision !== fence.fence_revision || result.createdAt !== fence.created_at || fence.actor_id !== actor.id) fail(503, 'DELETE_RECEIPT_CORRUPT');
    return result;
  }
  begin(tokenHash, operationKey, input) {
    fields(input, ['gameId', 'expectedRowRevision', 'confirmationName']);
    const captured = { gameId: input.gameId, expectedRowRevision: input.expectedRowRevision, confirmationName: input.confirmationName };
    if (!keyOK(operationKey) || !rev(captured.expectedRowRevision) || typeof captured.confirmationName !== 'string' || !captured.confirmationName.isWellFormed() || [...captured.confirmationName].length > 8) fail(422, 'DELETE_INPUT');
    if (captured.gameId === 'wolong-builtin') fail(403, 'BUILTIN_PROTECTED');
    if (!uuid(captured.gameId)) fail(422, 'DELETE_GAME_ID');
    const digest = createHmac('sha256', this.#secret).update(JSON.stringify(['delete-fence-1', captured])).digest('hex');
    return this.#storage.transactionSync(() => {
      const actor = this.#actor(tokenHash); this.#guard(actor.id, operationKey);
      // Engineering metadata and production global namespaces cannot reuse the key.
      for (const table of ['operations', 'content_operations', 'content_reservations']) if (this.#one('SELECT op_key FROM ' + table + ' WHERE actor=? AND op_key=?', actor.id, operationKey)) fail(409, 'IDEMPOTENCY_CONFLICT');
      const old = this.#one('SELECT * FROM content_deletion_operations WHERE actor=? AND op_key=?', actor.id, operationKey);
      if (old) { if (old.request_digest !== digest || old.game_id !== captured.gameId) fail(409, 'IDEMPOTENCY_CONFLICT'); return this.#receipt(actor, old); }
      const row = this.#target(actor, captured.gameId);
      if (this.#one('SELECT game_id FROM content_deletion_fences WHERE game_id=?', row.game_id)) fail(409, 'GAME_DELETING');
      if (row.listed !== 0) fail(409, 'GAME_LISTED');
      if (row.row_revision !== captured.expectedRowRevision) fail(409, 'GAME_CHANGED');
      if (captured.confirmationName !== row.draft_name) fail(409, 'DELETE_CONFIRMATION');
      if (!this.#one('SELECT game_id FROM content_used_ids WHERE game_id=?', row.game_id)) fail(503, 'DELETE_ID_CORRUPT');
      const next = String(BigInt(row.row_revision) + 1n), time = new Date().toISOString();
      const updated = this.#one('UPDATE content_games SET row_revision=? WHERE game_id=? AND row_revision=? AND listed=0 RETURNING game_id', next, row.game_id, row.row_revision);
      if (!updated) fail(409, 'GAME_CHANGED');
      this.#sql.exec('INSERT INTO content_deletion_fences VALUES(?,?,?,?,?,?)', row.game_id, row.owner_id, actor.id, row.row_revision, next, time);
      const result = { gameId: row.game_id, state: 'fenced', rowRevision: next, createdAt: time };
      this.#sql.exec('INSERT INTO content_deletion_operations VALUES(?,?,?,?,?,?)', actor.id, operationKey, digest, actor.epoch, row.game_id, JSON.stringify(result));
      this.#sql.exec('INSERT INTO content_audits VALUES(?,?,?,?,?,?,?)', crypto.randomUUID(), actor.id, 'delete-fence', row.game_id, row.row_revision, next, time);
      return result;
    });
  }
  query(tokenHash, operationKey) {
    if (!keyOK(operationKey)) fail(422, 'DELETE_INPUT');
    const actor = this.#actor(tokenHash), row = this.#one('SELECT * FROM content_deletion_operations WHERE actor=? AND op_key=?', actor.id, operationKey);
    if (!row) fail(404, 'DELETE_OPERATION_NOT_FOUND');
    return this.#receipt(actor, row);
  }
}
