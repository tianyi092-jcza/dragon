// Permanent HTTP publish results in the existing content operation namespace.
// No R2 confirmation, release allocation or schema ownership lives here.
import { createHash } from 'node:crypto';
import { checkGameName } from '../web/src/content/authoring/gamesource.js';
import { isGameId, isRevision, isOrdinal, isDigest, MAX_METADATA_BYTES } from '../reader/runtimecontract.js';
import { fail, fields } from './security.js';

const keyPattern = /^[A-Za-z0-9_-]{16,128}$/;
const iso = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const sameKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join(',') === keys;

export class PublishOperations {
  #storage; #sql; #principal; #games; #guard; #tickets = new WeakMap();
  constructor({ storage, principal, games, operationGuard }) {
    if (!storage?.sql || typeof storage.transactionSync !== 'function' || typeof principal !== 'function' || typeof games?.assertNotDeleting !== 'function' || typeof operationGuard !== 'function') {
      throw new TypeError('same SQLite, current principal, deletion and namespace guards required');
    }
    this.#storage = storage; this.#sql = storage.sql; this.#principal = principal; this.#games = games; this.#guard = operationGuard;
  }
  #one(query, ...values) { return this.#sql.exec(query, ...values).toArray()[0]; }
  #authority(tokenHash, operation) {
    const actor = this.#principal(tokenHash);
    if (actor.must_change) { fail(403, 'PASSWORD_CHANGE_REQUIRED'); }
    if (operation.actor !== undefined && (operation.actor !== actor.id || operation.epoch !== actor.epoch)) { fail(401, 'SESSION_INVALID'); }
    this.#guard(actor.id, operation.key);
    const row = this.#one('SELECT * FROM content_games WHERE game_id=?', operation.gameId);
    if (!row || row.owner_id !== actor.id) { fail(404, 'GAME_NOT_FOUND'); }
    this.#games.assertNotDeleting(operation.gameId);
    return { actor, row };
  }
  #receipt(value, operation) {
    if (!sameKeys(value, 'gameId,pin,releaseId,version') || value.version !== 1 || value.gameId !== operation.gameId || !isGameId(value.releaseId)) { fail(503, 'PUBLISH_RECEIPT_CORRUPT'); }
    const pin = value.pin;
    // These are source IDs, not path segments: real copied chapters contain '#'.
    // Keep the published pin contract; URL/key encoding belongs to transport.
    if (!sameKeys(pin, 'chapters,gameId,name,ordinal,publishedAt,revision,sourceDigest') || pin.gameId !== operation.gameId || pin.name !== operation.name || !isRevision(pin.revision) || !isOrdinal(pin.ordinal) || !isDigest(pin.sourceDigest) || !iso(pin.publishedAt) || !Array.isArray(pin.chapters) || !pin.chapters.length || !pin.chapters.every(id => typeof id === 'string' && id.length > 0) || new Set(pin.chapters).size !== pin.chapters.length) { fail(503, 'PUBLISH_RECEIPT_CORRUPT'); }
    return Object.freeze({ version: 1, gameId: value.gameId, releaseId: value.releaseId, pin: Object.freeze({ gameId: pin.gameId, name: pin.name, revision: pin.revision, sourceDigest: pin.sourceDigest, chapters: Object.freeze([...pin.chapters]), publishedAt: pin.publishedAt, ordinal: pin.ordinal }) });
  }
  #replay(actor, operation) {
    const old = this.#one('SELECT * FROM content_operations WHERE actor=? AND op_key=?', actor.id, operation.key);
    const reserved = this.#one('SELECT * FROM content_reservations WHERE actor=? AND op_key=?', actor.id, operation.key);
    for (const row of [reserved, old]) {
      if (!row) { continue; }
      if (row.method !== 'publish' || row.target !== operation.gameId || row.request_digest !== operation.digest) { fail(409, 'IDEMPOTENCY_CONFLICT'); }
      if (row.auth_epoch !== actor.epoch) { fail(409, 'OPERATION_REVOKED'); }
    }
    // This producer writes both rows in its final transaction, never a lone reservation.
    if (Boolean(old) !== Boolean(reserved)) { fail(503, 'PUBLISH_RECEIPT_CORRUPT'); }
    if (!old) { return null; }
    if (typeof old.result_json !== 'string' || Buffer.byteLength(old.result_json) > MAX_METADATA_BYTES) { fail(503, 'PUBLISH_RECEIPT_CORRUPT'); }
    let parsed;
    try { parsed = JSON.parse(old.result_json); } catch { fail(503, 'PUBLISH_RECEIPT_CORRUPT'); }
    const receipt = this.#receipt(parsed, operation);
    if (JSON.stringify(receipt) !== old.result_json || receipt.pin.publishedAt !== old.created_at) { fail(503, 'PUBLISH_RECEIPT_CORRUPT'); }
    return receipt;
  }
  // Owner-scoped read of a permanent local result, not a visibility claim.
  // It remains valid after later releases are pruned, but not after revocation
  // or a deletion fence. No attempt is made to reconstruct a request body.
  query(tokenHash, input) {
    fields(input, ['key', 'gameId']);
    if (typeof input.key !== 'string' || !keyPattern.test(input.key)) { fail(422, 'IDEMPOTENCY_KEY'); }
    if (input.gameId === 'wolong-builtin') { fail(403, 'BUILTIN_PROTECTED'); }
    if (!isGameId(input.gameId)) { fail(422, 'PUBLISH_GAME_ID'); }
    return this.#storage.transactionSync(() => {
      const operation = { key: input.key, gameId: input.gameId };
      const { actor } = this.#authority(tokenHash, operation);
      const old = this.#one('SELECT * FROM content_operations WHERE actor=? AND op_key=?', actor.id, input.key);
      if (!old) {
        if (this.#one('SELECT op_key FROM content_reservations WHERE actor=? AND op_key=?', actor.id, input.key)) { fail(503, 'PUBLISH_RECEIPT_CORRUPT'); }
        fail(404, 'PUBLISH_OPERATION_NOT_FOUND');
      }
      if (old.method !== 'publish' || old.target !== input.gameId) { fail(404, 'PUBLISH_OPERATION_NOT_FOUND'); }
      if (old.auth_epoch !== actor.epoch) { fail(409, 'OPERATION_REVOKED'); }
      if (!isDigest(old.request_digest) || typeof old.result_json !== 'string' || Buffer.byteLength(old.result_json) > MAX_METADATA_BYTES) { fail(503, 'PUBLISH_RECEIPT_CORRUPT'); }
      let parsed, name;
      try { parsed = JSON.parse(old.result_json); name = checkGameName(parsed?.pin?.name, 40); }
      catch { fail(503, 'PUBLISH_RECEIPT_CORRUPT'); }
      if (!name || name !== parsed?.pin?.name) { fail(503, 'PUBLISH_RECEIPT_CORRUPT'); }
      return this.#replay(actor, { ...operation, name, digest: old.request_digest });
    });
  }
  capture(tokenHash, input) {
    fields(input, ['key', 'gameId', 'name']);
    if (typeof input.key !== 'string' || !keyPattern.test(input.key)) { fail(422, 'IDEMPOTENCY_KEY'); }
    if (input.gameId === 'wolong-builtin') { fail(403, 'BUILTIN_PROTECTED'); }
    if (!isGameId(input.gameId)) { fail(422, 'PUBLISH_GAME_ID'); }
    let name;
    try { name = checkGameName(typeof input.name === 'string' ? input.name.normalize('NFC') : input.name, 40); } catch { fail(422, 'PUBLISH_NAME'); }
    if (!name) { fail(422, 'PUBLISH_NAME'); }
    // Bind the exact request, not a digest recomputed from a later draft.
    const operation = { key: input.key, gameId: input.gameId, name, digest: createHash('sha256').update(JSON.stringify(['publish', input.gameId, input.name])).digest('hex') };
    return this.#storage.transactionSync(() => {
      const { actor, row } = this.#authority(tokenHash, operation), replay = this.#replay(actor, operation);
      if (replay) { return Object.freeze({ replay, ticket: null }); }
      // Keep permanent pre-limit results replayable, but never issue a new
      // ticket outside the approved eight-code-point name contract.
      try { checkGameName(name, 8); } catch { fail(422, 'PUBLISH_NAME'); }
      if (!isRevision(row.draft_revision) || !isRevision(row.row_revision) || row.current_release_id !== null && !isGameId(row.current_release_id)) { fail(503, 'PUBLISH_AUTHORITY_CORRUPT'); }
      const ticket = Object.freeze({});
      this.#tickets.set(ticket, Object.freeze({ ...operation, actor: actor.id, epoch: actor.epoch, draftRevision: row.draft_revision, rowRevision: row.row_revision, releaseId: row.current_release_id }));
      return Object.freeze({ replay: null, ticket });
    });
  }
  // Read-only guard for asynchronous preparation. A concurrent identical
  // commit returns its permanent receipt BEFORE captured-row stale checks.
  // This is neither a reservation nor permission to skip the final commit gate.
  inspect(tokenHash, ticket) {
    const operation = this.#tickets.get(ticket);
    if (!operation) { fail(409, 'PUBLISH_OPERATION_TICKET'); }
    return this.#storage.transactionSync(() => {
      const { actor, row } = this.#authority(tokenHash, operation), replay = this.#replay(actor, operation);
      if (replay) { return replay; }
      if (row.draft_revision !== operation.draftRevision || row.row_revision !== operation.rowRevision || row.current_release_id !== operation.releaseId) { fail(409, 'PUBLISH_STALE'); }
      return null;
    });
  }
  commit(tokenHash, ticket, callback) {
    const operation = this.#tickets.get(ticket);
    if (!operation) { fail(409, 'PUBLISH_OPERATION_TICKET'); }
    if (typeof callback !== 'function' || callback.constructor?.name === 'AsyncFunction') { fail(500, 'SYNC_TRANSACTION_REQUIRED'); }
    return this.#storage.transactionSync(() => {
      const { actor, row } = this.#authority(tokenHash, operation), replay = this.#replay(actor, operation);
      // A concurrent identical request wins once; replay before stale/CAS checks.
      if (replay) { return replay; }
      if (row.draft_revision !== operation.draftRevision || row.row_revision !== operation.rowRevision || row.current_release_id !== operation.releaseId) { fail(409, 'PUBLISH_STALE'); }
      this.#sql.exec('INSERT INTO content_reservations VALUES(?,?,?,?,?,?)', actor.id, operation.key, 'publish', operation.gameId, operation.digest, actor.epoch);
      const value = callback();
      if (!value || value.then) { fail(500, 'SYNC_TRANSACTION_RESULT'); }
      const receipt = this.#receipt(value, operation);
      if (receipt.pin.revision !== operation.draftRevision) { fail(500, 'PUBLISH_OPERATION_RESULT'); }
      const committed = this.#one('SELECT g.owner_id AS game_owner,g.current_release_id,p.owner_id AS pin_owner,p.pin_json,r.release_id,r.draft_revision,r.source_digest FROM content_games g JOIN published_games p ON p.game_id=g.game_id JOIN content_releases r ON r.game_id=g.game_id WHERE g.game_id=? AND r.ordinal=?', operation.gameId, receipt.pin.ordinal);
      if (!committed || committed.game_owner !== actor.id || committed.pin_owner !== actor.id || committed.current_release_id !== receipt.releaseId || committed.release_id !== receipt.releaseId || committed.draft_revision !== receipt.pin.revision || committed.source_digest !== receipt.pin.sourceDigest || committed.pin_json !== JSON.stringify(receipt.pin)) { fail(500, 'PUBLISH_OPERATION_RESULT'); }
      const serialized = JSON.stringify(receipt);
      if (Buffer.byteLength(serialized) > MAX_METADATA_BYTES) { fail(413, 'PUBLISH_RECEIPT_BUDGET'); }
      this.#sql.exec('INSERT INTO content_operations VALUES(?,?,?,?,?,?,?,?)', actor.id, operation.key, 'publish', operation.gameId, operation.digest, actor.epoch, serialized, receipt.pin.publishedAt);
      return receipt;
    });
  }
}
