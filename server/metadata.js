// Same DO SQLite authority. References alone are NOT blob/compile/runtime admission.
import { normalizeGameMetadata } from '../web/src/editor/gamemetadata.js';
import { fail, fields } from './security.js';
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const revision = value => typeof value === 'string' && /^[1-9][0-9]*$/.test(value);
function metadata(input) {
  fields(input, ['name', 'introduction']);
  for (const text of [input.name, input.introduction]) {
    if (typeof text !== 'string' || !text.isWellFormed() || [...text].some(ch => { const n = ch.codePointAt(0); return n < 32 || n >= 127 && n <= 159; })) fail(422, 'GAME_METADATA');
  }
  try { return Object.freeze(normalizeGameMetadata(input)); } catch { fail(422, 'GAME_METADATA'); }
}
function summary(row) {
  return { gameId: row.game_id, ownerId: row.owner_id, metadata: { name: row.draft_name, introduction: row.draft_introduction }, draftRevision: row.draft_revision, rowRevision: row.row_revision, currentReleaseId: row.current_release_id, nextOrdinal: row.next_ordinal, listed: Boolean(row.listed), restricted: Boolean(row.restricted), createdAt: row.created_at, modifiedAt: row.modified_at };
}
export class GameMetadataStore {
  #storage; #sql; #principal; #verifySnapshot; #recoverAllocation; #recovered = new WeakMap(); #allocations = new WeakSet(); #prepared = new WeakSet();
  constructor({ storage, principal, verifySnapshot, recoverAllocation }) {
    if (!storage?.sql || typeof principal !== 'function') throw new TypeError('actual SQLite and trusted principal required');
    this.#storage = storage; this.#sql = storage.sql; this.#principal = principal; this.#verifySnapshot = verifySnapshot; this.#recoverAllocation = recoverAllocation;
    storage.transactionSync(() => {
      this.#sql.exec('CREATE TABLE IF NOT EXISTS content_schema (version INTEGER PRIMARY KEY CHECK(version=1))');
      this.#sql.exec('INSERT OR IGNORE INTO content_schema VALUES(1)');
      this.#sql.exec('CREATE TABLE IF NOT EXISTS content_used_ids (game_id TEXT PRIMARY KEY)');
      this.#sql.exec("CREATE TABLE IF NOT EXISTS content_games (game_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), draft_name TEXT NOT NULL, draft_introduction TEXT NOT NULL, formal_name TEXT, formal_introduction TEXT, draft_revision TEXT NOT NULL, row_revision TEXT NOT NULL, current_release_id TEXT, next_ordinal TEXT NOT NULL, listed INTEGER NOT NULL CHECK(listed IN(0,1)), restricted INTEGER NOT NULL CHECK(restricted IN(0,1)), created_at TEXT NOT NULL, modified_at TEXT NOT NULL)");
      this.#sql.exec('CREATE TABLE IF NOT EXISTS content_snapshots (game_id TEXT NOT NULL, revision TEXT NOT NULL, root_key TEXT NOT NULL, source_digest TEXT NOT NULL, dependency_digest TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(game_id,revision))');
      this.#sql.exec('CREATE TABLE IF NOT EXISTS content_names (owner_id TEXT NOT NULL, name TEXT COLLATE BINARY NOT NULL, game_id TEXT NOT NULL, PRIMARY KEY(owner_id,name))');
      this.#sql.exec('CREATE TABLE IF NOT EXISTS content_reservations (actor TEXT NOT NULL, op_key TEXT NOT NULL, method TEXT NOT NULL, target TEXT NOT NULL, request_digest TEXT NOT NULL, auth_epoch INTEGER NOT NULL, PRIMARY KEY(actor,op_key))');
      this.#sql.exec('CREATE TABLE IF NOT EXISTS content_operations (actor TEXT NOT NULL, op_key TEXT NOT NULL, method TEXT NOT NULL, target TEXT NOT NULL, request_digest TEXT NOT NULL, auth_epoch INTEGER NOT NULL, result_json TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(actor,op_key))');
      this.#sql.exec('CREATE TABLE IF NOT EXISTS content_audits (event_id TEXT PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL, game_id TEXT NOT NULL, before_revision TEXT, after_revision TEXT NOT NULL, created_at TEXT NOT NULL)');
      this.#sql.exec('CREATE TABLE IF NOT EXISTS content_deletion_fences (game_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, actor_id TEXT NOT NULL, before_revision TEXT NOT NULL, fence_revision TEXT NOT NULL, created_at TEXT NOT NULL)');
      this.#sql.exec('CREATE TABLE IF NOT EXISTS content_deletion_operations (actor TEXT NOT NULL, op_key TEXT NOT NULL, request_digest TEXT NOT NULL, auth_epoch INTEGER NOT NULL, game_id TEXT NOT NULL, result_json TEXT NOT NULL, PRIMARY KEY(actor,op_key))');
    });
  }
  #one(query, ...values) { return this.#sql.exec(query, ...values).toArray()[0]; }
  #actor(tokenHash) {
    const actor = this.#principal(tokenHash);
    if (actor.must_change) fail(403, 'PASSWORD_CHANGE_REQUIRED');
    return actor;
  }
  // Internal central state guard: a durable fence is NOT completed physical deletion.
  assertNotDeleting(gameId) {
    if (gameId === 'wolong-builtin') fail(403, 'BUILTIN_PROTECTED');
    if (!uuid(gameId)) fail(422, 'GAME_ID');
    if (this.#one('SELECT game_id FROM content_deletion_fences WHERE game_id=?', gameId)) fail(409, 'GAME_DELETING');
  }
  #owned(actor, gameId) {
    if (gameId === 'wolong-builtin') fail(403, 'BUILTIN_PROTECTED');
    const row = this.#one('SELECT * FROM content_games WHERE game_id=?', gameId);
    if (!row || row.owner_id !== actor.id) fail(404, 'GAME_NOT_FOUND');
    this.assertNotDeleting(gameId);
    return row;
  }
  blobAuthority(tokenHash, { gameId, allocation }) {
    const actor = this.#actor(tokenHash);
    if (gameId === 'wolong-builtin') fail(403, 'BUILTIN_PROTECTED');
    if (!uuid(gameId)) fail(422, 'BLOB_GAME_ID');
    if (this.#recovered.has(allocation)) this.#allocation(tokenHash, actor, allocation);
    if (this.#one('SELECT game_id FROM content_games WHERE game_id=?', gameId)) this.#owned(actor, gameId);
    else if (this.#one('SELECT game_id FROM content_used_ids WHERE game_id=?', gameId) || !this.#allocation(tokenHash, actor, allocation) || allocation.gameId !== gameId) fail(404, 'GAME_NOT_FOUND');
    return Object.freeze({ ownerId: actor.id, epoch: actor.epoch });
  }
  #allocation(tokenHash, actor, allocation) {
    if (!this.#allocations.has(allocation) || allocation.ownerId !== actor.id || allocation.epoch !== actor.epoch) return false;
    const ticket = this.#recovered.get(allocation);
    if (ticket) { const current = this.#recoverAllocation(tokenHash, ticket); if (current.gameId !== allocation.gameId || current.ownerId !== actor.id || current.epoch !== actor.epoch) fail(401, 'SESSION_INVALID'); }
    return true;
  }
  recoverGameId(tokenHash, ticket) {
    const actor = this.#actor(tokenHash); if (typeof this.#recoverAllocation !== 'function') fail(503, 'ALLOCATION_RECOVERY_NOT_READY');
    // Only a service port which rechecks a private branded SQL lease may recover.
    const known = this.#recoverAllocation(tokenHash, ticket);
    if (!known || !uuid(known.gameId) || known.ownerId !== actor.id || known.epoch !== actor.epoch || this.#one('SELECT game_id FROM content_used_ids WHERE game_id=?', known.gameId)) fail(422, 'SERVER_GAME_ID_REQUIRED');
    const allocation = Object.freeze({ gameId: known.gameId, ownerId: actor.id, epoch: actor.epoch });
    this.#allocations.add(allocation); this.#recovered.set(allocation, ticket); return allocation;
  }
  allocateGameId(tokenHash) {
    const actor = this.#actor(tokenHash), result = Object.freeze({ gameId: crypto.randomUUID(), ownerId: actor.id, epoch: actor.epoch });
    this.#allocations.add(result); return result;
  }
  async prepareSnapshot(tokenHash, { gameId, draftRevision, metadata: input, source, allocation }) {
    const actor = this.#actor(tokenHash), values = metadata(input);
    if (!uuid(gameId) || !revision(draftRevision)) fail(422, 'SNAPSHOT_IDENTITY');
    if (this.#recovered.has(allocation)) this.#allocation(tokenHash, actor, allocation);
    const existing = this.#one('SELECT game_id FROM content_games WHERE game_id=?', gameId);
    if (existing) this.#owned(actor, gameId);
    else if (!this.#allocation(tokenHash, actor, allocation) || allocation.gameId !== gameId) fail(404, 'GAME_NOT_FOUND');
    this.assertNotDeleting(gameId);
    if (typeof this.#verifySnapshot !== 'function') fail(503, 'SNAPSHOT_VERIFIER_NOT_READY');
    // Server-only I/O port must read back immutable bytes and validate source/dependencies.
    // An author-supplied digest or {valid:true} is never this capability.
    const verified = await this.#verifySnapshot({ gameId, draftRevision, metadata: values, source, tokenHash, allocation });
    const current = this.#actor(tokenHash); if (current.id !== actor.id || current.epoch !== actor.epoch) fail(401, 'SESSION_INVALID');
    this.blobAuthority(tokenHash, { gameId, allocation });
    const rootDigest = verified?.rootDigest ?? verified?.sourceDigest;
    if (!verified || !/^[a-f0-9]{64}$/.test(rootDigest) || !/^[a-f0-9]{64}$/.test(verified.sourceDigest) || !/^[a-f0-9]{64}$/.test(verified.dependencyDigest) || typeof verified.rootKey !== 'string' || verified.rootKey !== `private/${gameId}/${rootDigest}`) fail(422, 'SNAPSHOT_PROOF');
    const result = Object.freeze({ gameId, draftRevision, metadata: values, ownerId: actor.id, epoch: actor.epoch, rootKey: verified.rootKey, sourceDigest: verified.sourceDigest, dependencyDigest: verified.dependencyDigest });
    this.#prepared.add(result); return result;
  }
  listOwn(tokenHash) {
    const actor = this.#actor(tokenHash);
    return this.#sql.exec('SELECT * FROM content_games WHERE owner_id=? ORDER BY created_at,game_id', actor.id).toArray().map(summary);
  }
  managementSummaries(tokenHash) {
    const actor = this.#actor(tokenHash); if (actor.role !== 'admin') fail(403, 'ADMIN_REQUIRED');
    return this.#sql.exec('SELECT g.*,u.account FROM content_games g JOIN users u ON u.id=g.owner_id ORDER BY g.created_at,g.game_id').toArray().map(row => ({ gameId: row.game_id, creatorAccount: row.account, name: row.formal_name, introduction: row.formal_introduction, currentReleaseId: row.current_release_id, listed: Boolean(row.listed), restricted: Boolean(row.restricted), rowRevision: row.row_revision, createdAt: row.created_at, modifiedAt: row.modified_at }));
  }
  snapshotReference(tokenHash, gameId, draftRevision) {
    const actor = this.#actor(tokenHash); this.#owned(actor, gameId);
    if (!revision(draftRevision)) fail(422, 'DRAFT_REVISION');
    const row = this.#one('SELECT * FROM content_snapshots WHERE game_id=? AND revision=?', gameId, draftRevision);
    if (!row) fail(404, 'SNAPSHOT_NOT_FOUND');
    return { gameId: row.game_id, draftRevision: row.revision, rootKey: row.root_key, sourceDigest: row.source_digest, dependencyDigest: row.dependency_digest, createdAt: row.created_at };
  }
  transaction(tokenHash, operation, callback) {
    fields(operation, ['key', 'method', 'target', 'digest']);
    if (!/^[a-zA-Z0-9_-]{16,128}$/.test(operation.key) || !/^[a-f0-9]{64}$/.test(operation.digest) || !['create', 'save'].includes(operation.method) || typeof operation.target !== 'string') fail(422, 'CONTENT_OPERATION');
    if (typeof callback !== 'function' || callback.constructor.name === 'AsyncFunction') fail(500, 'SYNC_TRANSACTION_REQUIRED');
    return this.#storage.transactionSync(() => {
      // No await in this transaction; commit authority is read NOW, not from a DTO.
      const actor = this.#actor(tokenHash), old = this.#one('SELECT * FROM content_operations WHERE actor=? AND op_key=?', actor.id, operation.key);
      const reserved = this.#one('SELECT * FROM content_reservations WHERE actor=? AND op_key=?', actor.id, operation.key);
      if (reserved && (reserved.method !== operation.method || reserved.target !== operation.target || reserved.request_digest !== operation.digest)) fail(409, 'IDEMPOTENCY_CONFLICT');
      if (reserved && reserved.auth_epoch !== actor.epoch) fail(409, 'OPERATION_REVOKED');
      if (old) {
        if (old.method !== operation.method || old.target !== operation.target || old.request_digest !== operation.digest) fail(409, 'IDEMPOTENCY_CONFLICT');
        if (old.auth_epoch !== actor.epoch) fail(409, 'OPERATION_REVOKED');
        // Recheck ownership even for replay; deletion may later scrub this receipt.
        const parsed = this.#parse(old.result_json); this.#owned(actor, parsed.gameId); return parsed;
      }
      let active = true, mutations = 0;
      const check = () => { if (!active || ++mutations !== 1) fail(500, 'TRANSACTION_SCOPE'); };
      const api = Object.freeze({
        create: (allocation, snapshot) => { check(); if (operation.method !== 'create' || operation.target !== 'new') fail(422, 'CONTENT_OPERATION_TARGET'); return this.#create(tokenHash, actor, allocation, snapshot); },
        compareAndSwap: (gameId, expectedRevision, snapshot) => { check(); if (operation.method !== 'save' || operation.target !== gameId) fail(422, 'CONTENT_OPERATION_TARGET'); return this.#save(actor, gameId, expectedRevision, snapshot); },
      });
      try {
        const result = callback(api);
        if (mutations !== 1 || result?.then || !result || typeof result.gameId !== 'string') fail(500, 'SYNC_TRANSACTION_RESULT');
        const persisted = summary(this.#owned(actor, result.gameId));
        if (JSON.stringify(persisted) !== JSON.stringify(result)) fail(500, 'TRANSACTION_RESULT');
        this.#sql.exec('INSERT INTO content_operations VALUES(?,?,?,?,?,?,?,?)', actor.id, operation.key, operation.method, operation.target, operation.digest, actor.epoch, JSON.stringify(persisted), new Date().toISOString());
        return persisted;
      } finally { active = false; }
    });
  }
  #parse(text) { try { return JSON.parse(text); } catch (cause) { throw new Error('invalid persisted content receipt', { cause }); } }
  #snapshot(actor, prepared, gameId, draftRevision) {
    if (!this.#prepared.has(prepared) || prepared.gameId !== gameId || prepared.draftRevision !== draftRevision || prepared.ownerId !== actor.id || prepared.epoch !== actor.epoch) fail(422, 'PREPARED_SNAPSHOT_REQUIRED');
  }
  #names(actor, gameId, draftName, formalName) {
    const names = [...new Set([draftName, formalName].filter(name => name !== null))];
    for (const name of names) { const row = this.#one('SELECT game_id FROM content_names WHERE owner_id=? AND name=?', actor.id, name); if (row && row.game_id !== gameId) fail(409, 'GAME_NAME_OCCUPIED'); }
    this.#sql.exec('DELETE FROM content_names WHERE game_id=?', gameId);
    for (const name of names) this.#sql.exec('INSERT INTO content_names VALUES(?,?,?)', actor.id, name, gameId);
  }
  #insertSnapshot(prepared, time) { this.#sql.exec('INSERT INTO content_snapshots VALUES(?,?,?,?,?,?)', prepared.gameId, prepared.draftRevision, prepared.rootKey, prepared.sourceDigest, prepared.dependencyDigest, time); }
  #audit(actor, action, gameId, before, after, time) { this.#sql.exec('INSERT INTO content_audits VALUES(?,?,?,?,?,?,?)', crypto.randomUUID(), actor.id, action, gameId, before, after, time); }
  #create(tokenHash, actor, allocation, prepared) {
    if (!this.#allocation(tokenHash, actor, allocation)) fail(422, 'SERVER_GAME_ID_REQUIRED');
    const id = allocation.gameId; this.assertNotDeleting(id); this.#snapshot(actor, prepared, id, '1');
    if (this.#one('SELECT game_id FROM content_used_ids WHERE game_id=?', id)) fail(409, 'GAME_ID_USED');
    const time = new Date().toISOString(); this.#names(actor, id, prepared.metadata.name, null);
    this.#sql.exec('INSERT INTO content_used_ids VALUES(?)', id);
    this.#sql.exec('INSERT INTO content_games VALUES(?,?,?,?,NULL,NULL,?,?,NULL,?,0,0,?,?)', id, actor.id, prepared.metadata.name, prepared.metadata.introduction, '1', '1', '0', time, time);
    this.#insertSnapshot(prepared, time); this.#audit(actor, 'create', id, null, '1', time);
    return summary(this.#owned(actor, id));
  }
  #save(actor, gameId, expectedRevision, prepared) {
    const row = this.#owned(actor, gameId);
    if (!revision(expectedRevision) || row.draft_revision !== expectedRevision) fail(409, 'DRAFT_CHANGED');
    const next = String(BigInt(expectedRevision) + 1n); this.#snapshot(actor, prepared, gameId, next);
    const current = this.#one('SELECT * FROM content_snapshots WHERE game_id=? AND revision=?', gameId, expectedRevision);
    if (current.source_digest === prepared.sourceDigest && current.dependency_digest === prepared.dependencyDigest && row.draft_name === prepared.metadata.name && row.draft_introduction === prepared.metadata.introduction) return summary(row);
    this.#names(actor, gameId, prepared.metadata.name, row.formal_name);
    const time = new Date().toISOString(), nextRow = String(BigInt(row.row_revision) + 1n);
    this.#sql.exec('UPDATE content_games SET draft_name=?,draft_introduction=?,draft_revision=?,row_revision=?,modified_at=? WHERE game_id=?', prepared.metadata.name, prepared.metadata.introduction, next, nextRow, time, gameId);
    this.#insertSnapshot(prepared, time); this.#audit(actor, 'save', gameId, expectedRevision, next, time);
    return summary(this.#owned(actor, gameId));
  }
}
