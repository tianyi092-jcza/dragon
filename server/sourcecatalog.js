// Durable fixed-source byte registry. NOT an author upload, game grant or runtime report.
import { createHash } from 'node:crypto';
import { canonicalSourceTokens, decodeSourceChunks } from '../web/src/content/authoring/sourcejson.js';
import { isInstalledSourcePolicy } from './sourcecatalogpolicy.js';
import { fail } from './security.js';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function text(value) { let result = ''; try { for (const token of canonicalSourceTokens(value)) result += token; } catch { fail(422, 'SOURCE_DESCRIPTOR'); } if (new TextEncoder().encode(result).length > 1024 * 1024) fail(413, 'SOURCE_INDEX_TOO_LARGE'); return result; }
function capture(value) { const captured = text(value); try { return JSON.parse(captured); } catch { fail(422, 'SOURCE_DESCRIPTOR'); } }
function exact(value, keys) { if (!value || Array.isArray(value) || typeof value !== 'object' || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) fail(422, 'SOURCE_DESCRIPTOR'); }
function descriptor(value, max = 4 * 1024 * 1024) { exact(value, ['sha256', 'byteLength']); if (typeof value.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.sha256) || !Number.isSafeInteger(value.byteLength) || value.byteLength < 1) fail(422, 'SOURCE_DESCRIPTOR'); if (value.byteLength > max) fail(413, 'SOURCE_OBJECT_TOO_LARGE'); }
function summary(row) { return { registryId: row.registry_id, definitionDigest: row.definition_digest, rootDigest: row.root_digest, rootByteLength: row.root_byte_length, rowRevision: row.row_revision, registeredAt: row.registered_at }; }
export class InstalledSourceCatalog {
  #storage; #sql; #bucket; #principal; #policy; #operationGuard; #definitionDigest; #captures = new WeakMap();
  constructor({ storage, bucket, principal, policy, operationGuard }) {
    if (!storage?.sql || typeof bucket?.get !== 'function' || typeof principal !== 'function' || !isInstalledSourcePolicy(policy)) throw new TypeError('actual SQLite/R2/principal and branded pinned policy required');
    if (operationGuard !== undefined && typeof operationGuard !== 'function') throw new TypeError('trusted source operation guard required');
    this.#operationGuard = operationGuard;
    this.#storage = storage; this.#sql = storage.sql; this.#bucket = bucket; this.#principal = principal; this.#policy = policy; this.#definitionDigest = hash(Buffer.from(text(policy)));
    storage.transactionSync(() => {
      this.#sql.exec('CREATE TABLE IF NOT EXISTS installed_sources (registry_id TEXT PRIMARY KEY, definition_digest TEXT NOT NULL, root_digest TEXT NOT NULL, root_byte_length INTEGER NOT NULL, row_revision TEXT NOT NULL, registered_by TEXT NOT NULL REFERENCES users(id), registered_at TEXT NOT NULL)');
      this.#sql.exec('CREATE TABLE IF NOT EXISTS source_operations (actor TEXT NOT NULL, op_key TEXT NOT NULL, request_digest TEXT NOT NULL, auth_epoch INTEGER NOT NULL, registry_id TEXT NOT NULL, result_json TEXT NOT NULL, PRIMARY KEY(actor,op_key))');
    });
  }
  #actor(tokenHash, previous) {
    const actor = this.#principal(tokenHash); if (actor.must_change) fail(403, 'PASSWORD_CHANGE_REQUIRED'); if (actor.role !== 'admin') fail(403, 'FULL_COPY_SOURCE_ADMIN_REQUIRED');
    if (previous && (actor.id !== previous.id || actor.epoch !== previous.epoch)) fail(401, 'SESSION_INVALID'); return actor;
  }
  #id(id) { if (typeof id !== 'string' || id !== this.#policy.registryId) fail(404, 'SOURCE_NOT_REGISTERED'); }
  #one(query, ...params) { return this.#sql.exec(query, ...params).toArray()[0]; }
  #row(id) { const row = this.#one('SELECT * FROM installed_sources WHERE registry_id=?', id); if (!row) fail(404, 'SOURCE_NOT_REGISTERED'); if (row.definition_digest !== this.#definitionDigest) fail(409, 'SOURCE_PROFILE_CHANGED'); return row; }
  #check(tokenHash, actor, registered) {
    this.#actor(tokenHash, actor); if (registered) { const current = this.#row(registered.registry_id); if (text(summary(current)) !== text(summary(registered))) fail(409, 'SOURCE_CHANGED'); }
  }
  async #object(tokenHash, actor, id, part, registered) {
    descriptor(part); this.#check(tokenHash, actor, registered);
    const object = await this.#bucket.get(`installed/${id}/${part.sha256}`);
    try { this.#check(tokenHash, actor, registered); } catch (error) { try { await object?.body?.cancel(); } catch { /* Preserve authority failure. */ } throw error; }
    if (!object) fail(404, 'SOURCE_OBJECT_MISSING');
    if (!object.body || object.size !== part.byteLength) { try { await object.body?.cancel(); } catch { /* Preserve integrity failure. */ } fail(503, 'SOURCE_OBJECT_CORRUPT'); }
    const reader = object.body.getReader(), h = createHash('sha256'), pieces = []; let length = 0;
    try {
      for (;;) { const { done, value } = await reader.read(); this.#check(tokenHash, actor, registered); if (done) break; if (!(value instanceof Uint8Array)) fail(503, 'SOURCE_OBJECT_CORRUPT'); length += value.length; if (length > part.byteLength) fail(503, 'SOURCE_OBJECT_CORRUPT'); h.update(value); pieces.push(value); }
      if (length !== part.byteLength || h.digest('hex') !== part.sha256) fail(503, 'SOURCE_OBJECT_CORRUPT');
    } catch (error) { try { await reader.cancel(); } catch { /* Preserve first error. */ } throw error; } finally { reader.releaseLock(); }
    this.#check(tokenHash, actor, registered); const bytes = new Uint8Array(length); let at = 0; for (const piece of pieces) { bytes.set(piece, at); at += piece.length; } return bytes;
  }
  async #verify(tokenHash, actor, id, root, registered, materialize) {
    descriptor(root, 1024 * 1024); const raw = await this.#object(tokenHash, actor, id, root, registered); let index;
    try { index = decodeSourceChunks([raw]); } catch { fail(422, 'SOURCE_INDEX_JSON'); }
    exact(index, ['schema', 'registryId', 'definitionDigest', 'roles']);
    if (index.schema !== 'dragon-installed-source-index-1' || index.registryId !== id || index.definitionDigest !== this.#definitionDigest || !Array.isArray(index.roles) || index.roles.length !== this.#policy.roles.length) fail(422, 'SOURCE_INDEX_IDENTITY');
    const result = new Map(); let total = 0;
    for (let n = 0; n < index.roles.length; n++) {
      const role = index.roles[n], expected = this.#policy.roles[n]; exact(role, ['path', 'sha256', 'byteLength', 'chunks']);
      if (role.path !== expected.path || role.sha256 !== expected.sha256 || role.byteLength !== expected.byteLength || !Array.isArray(role.chunks) || role.chunks.length < 1 || role.chunks.length > 64) fail(422, 'SOURCE_ROLE_MISMATCH');
      total += role.byteLength; if (total > 64 * 1024 * 1024) fail(413, 'SOURCE_TOTAL_TOO_LARGE');
      let length = 0; for (const part of role.chunks) { descriptor(part); length += part.byteLength; } if (length !== role.byteLength) fail(422, 'SOURCE_ROLE_LENGTH');
      const h = createHash('sha256'), bytes = materialize ? new Uint8Array(length) : null; let at = 0;
      for (const part of role.chunks) { const chunk = await this.#object(tokenHash, actor, id, part, registered); h.update(chunk); if (bytes) bytes.set(chunk, at); at += chunk.length; }
      if (h.digest('hex') !== expected.sha256) fail(503, 'SOURCE_ROLE_CORRUPT'); if (bytes) result.set(role.path, bytes);
    }
    this.#check(tokenHash, actor, registered); return result;
  }
  async install(tokenHash, registryId, input, operationKey) {
    const actor = this.#actor(tokenHash); this.#id(registryId); const root = capture(input); descriptor(root, 1024 * 1024);
    if (typeof operationKey !== 'string' || !/^[a-zA-Z0-9_-]{16,128}$/.test(operationKey)) fail(422, 'SOURCE_OPERATION_KEY');
    const requestDigest = hash(Buffer.from(text({ registryId, root, definitionDigest: this.#definitionDigest })));
    await this.#verify(tokenHash, actor, registryId, root, null, false);
    return this.#storage.transactionSync(() => {
      this.#actor(tokenHash, actor); this.#operationGuard?.(actor, operationKey); const old = this.#one('SELECT * FROM source_operations WHERE actor=? AND op_key=?', actor.id, operationKey);
      if (old) {
        if (old.request_digest !== requestDigest) fail(409, 'IDEMPOTENCY_CONFLICT'); if (old.auth_epoch !== actor.epoch) fail(409, 'OPERATION_REVOKED');
        const current = summary(this.#row(registryId)); let saved;
        try { saved = JSON.parse(old.result_json); } catch { fail(503, 'SOURCE_RECEIPT_CORRUPT'); }
        if (old.registry_id !== registryId || text(saved) !== text(current)) fail(503, 'SOURCE_RECEIPT_CORRUPT'); return current;
      }
      let row = this.#one('SELECT * FROM installed_sources WHERE registry_id=?', registryId);
      if (row && (row.definition_digest !== this.#definitionDigest || row.root_digest !== root.sha256 || row.root_byte_length !== root.byteLength)) fail(409, 'SOURCE_ALREADY_REGISTERED');
      if (!row) { this.#sql.exec("INSERT INTO installed_sources VALUES(?,?,?,?,'1',?,?)", registryId, this.#definitionDigest, root.sha256, root.byteLength, actor.id, new Date().toISOString()); row = this.#row(registryId); }
      const result = summary(row); this.#sql.exec('INSERT INTO source_operations VALUES(?,?,?,?,?,?)', actor.id, operationKey, requestDigest, actor.epoch, registryId, JSON.stringify(result)); return result;
    });
  }
  definition() { return Object.freeze({ registryId: this.#policy.registryId, definitionDigest: this.#definitionDigest, roleCount: this.#policy.roles.length, profileRevision: this.#policy.profileRevision }); }
  status(tokenHash, registryId) { this.#actor(tokenHash); this.#id(registryId); return summary(this.#row(registryId)); }
  async loadFull(tokenHash, registryId) {
    const actor = this.#actor(tokenHash); this.#id(registryId); const row = this.#row(registryId), root = { sha256: row.root_digest, byteLength: row.root_byte_length };
    const roles = await this.#verify(tokenHash, actor, registryId, root, row, true); this.#check(tokenHash, actor, row);
    const result = Object.freeze({ registryId, definitionDigest: this.#definitionDigest, rootDigest: row.root_digest, readWeb: path => { this.#check(tokenHash, actor, row); if (typeof path !== 'string' || !roles.has(path)) fail(404, 'SOURCE_ROLE_NOT_REGISTERED'); return new Uint8Array(roles.get(path)); } });
    this.#captures.set(result, { actor, row }); return result;
  }
  assertCapture(tokenHash, captured) { const known = this.#captures.get(captured); if (!known) fail(403, 'SOURCE_CAPTURE_REQUIRED'); this.#check(tokenHash, known.actor, known.row); return this.definition(); }
}
