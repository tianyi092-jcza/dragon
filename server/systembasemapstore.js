// System-owned singleton; never keyed by a game ID or stored in private/<gameId>.
import { createHash } from 'node:crypto';
import { fail, HttpError } from './security.js';
import { applyMapWorkspaceEdits } from './mapworkspace.js';
import { canonicalDigest } from '../web/src/content/authoring/gamesource.js';
import { validateSystemBaseMap } from './systembasemap.js';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const MAX_TEMPLATE_BYTES = 64 * 1024 * 1024;

export class SystemBaseMapStore {
  #storage; #sql; #principal; #loadInitial;
  constructor({ storage, principal, loadInitialTemplate }) {
    if (!storage?.sql || typeof storage.transactionSync !== 'function' || typeof principal !== 'function' || typeof loadInitialTemplate !== 'function')
      throw new TypeError('SQLite, principal and trusted initial-template loader required');
    this.#storage = storage; this.#sql = storage.sql; this.#principal = principal; this.#loadInitial = loadInitialTemplate;
    this.#sql.exec('CREATE TABLE IF NOT EXISTS system_base_map (singleton INTEGER PRIMARY KEY CHECK(singleton=1), version INTEGER NOT NULL CHECK(version>0), digest TEXT NOT NULL, template_json TEXT NOT NULL, updated_at TEXT NOT NULL)');
  }
  #admin(tokenHash) {
    const actor = this.#principal(tokenHash);
    if (actor.must_change) fail(403, 'PASSWORD_CHANGE_REQUIRED');
    if (actor.role !== 'admin') fail(403, 'ADMIN_REQUIRED');
    return actor;
  }
  #current() {
    const row = this.#sql.exec('SELECT * FROM system_base_map WHERE singleton=1').toArray()[0];
    if (!row) return null;
    if (!Number.isSafeInteger(row.version) || row.version < 1 || typeof row.template_json !== 'string' || Buffer.byteLength(row.template_json) > MAX_TEMPLATE_BYTES)
      fail(503, 'BASE_MAP_CORRUPT');
    let template;
    try { template = JSON.parse(row.template_json); } catch { fail(503, 'BASE_MAP_CORRUPT'); }
    if (canonicalDigest(template, sha) !== row.digest) fail(503, 'BASE_MAP_CORRUPT');
    return { version: row.version, digest: row.digest, template, updatedAt: row.updated_at };
  }
  read(tokenHash) { this.#admin(tokenHash); return this.#current(); }
  // Internal port for already-authorized creation. No public template read grant.
  capture() {
    const snapshot = this.#current();
    if (!snapshot) fail(409, 'BASE_MAP_NOT_INITIALIZED');
    return snapshot;
  }
  async initialize(tokenHash) {
    this.#admin(tokenHash);
    const current = this.#current();
    if (current) return current;
    // Loader owns source/SHA admission. HTTP supplies no template or source URL.
    const template = await this.#loadInitial(tokenHash);
    this.#admin(tokenHash);
    const { digest } = validateSystemBaseMap(template, sha);
    const text = JSON.stringify(template);
    if (Buffer.byteLength(text) > MAX_TEMPLATE_BYTES) fail(413, 'BASE_MAP_TOO_LARGE');
    return this.#storage.transactionSync(() => {
      this.#admin(tokenHash);
      // A second initialize awaiting the same source must not overwrite edits.
      const installed = this.#current();
      if (installed) return installed;
      this.#sql.exec('INSERT INTO system_base_map VALUES(1,1,?,?,?)', digest, text, new Date().toISOString());
      return this.#current();
    });
  }
  edit(tokenHash, edits) {
    this.#admin(tokenHash);
    if (!Array.isArray(edits) || !edits.length || edits.length > 128) fail(422, 'BASE_MAP_EDITS');
    const current = this.capture();
    try {
      const { gameId, ...content } = applyMapWorkspaceEdits({ gameId: 'system-base-map', ...current.template.content }, edits);
      return this.save(tokenHash, { ...current.template, content });
    } catch (error) {
      // Expected authoring/compiler rejections are actionable, not HTTP 500.
      // No SQL/native exception or stack trace is converted to a success DTO.
      if (error instanceof RangeError || error instanceof TypeError)
        throw new HttpError(422, 'BASE_MAP_INVALID', { problems: [{ message: error.message.slice(0, 512) }] });
      throw error;
    }
  }
  save(tokenHash, template) {
    this.#admin(tokenHash);
    const current = this.capture();
    const { digest } = validateSystemBaseMap(template, sha);
    const text = JSON.stringify(template);
    if (Buffer.byteLength(text) > MAX_TEMPLATE_BYTES) fail(413, 'BASE_MAP_TOO_LARGE');
    // This release edits map content, not the approved immutable asset catalog.
    if (canonicalDigest(template.content.editorAssets, sha) !== canonicalDigest(current.template.content.editorAssets, sha))
      fail(422, 'BASE_MAP_ASSETS_PROTECTED');
    if (canonicalDigest(template.provenance, sha) !== canonicalDigest(current.template.provenance, sha))
      fail(422, 'BASE_MAP_PROVENANCE_PROTECTED');
    if (!Number.isSafeInteger(current.version + 1)) fail(409, 'BASE_MAP_VERSION_EXHAUSTED');
    return this.#storage.transactionSync(() => {
      this.#admin(tokenHash);
      this.#sql.exec('UPDATE system_base_map SET version=?,digest=?,template_json=?,updated_at=? WHERE singleton=1', current.version + 1, digest, text, new Date().toISOString());
      return this.#current();
    });
  }
}
