// Owner-bound reads of pinned runtime roles. This is NOT a full-copy source
// capability: administrator install/status/loadFull remain in sourcecatalog.js.
// No schema, writes, arbitrary bucket keys, or unregistered source fallbacks.
import { createHash } from 'node:crypto';
import { canonicalSourceTokens, decodeSourceChunks } from '../web/src/content/authoring/sourcejson.js';
import { isInstalledSourcePolicy } from './sourcecatalogpolicy.js';
import { fail } from './security.js';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const rowFields = ['registry_id', 'definition_digest', 'root_digest', 'root_byte_length', 'row_revision', 'registered_by', 'registered_at'];
function exact(value, keys) {
  if (!value || Array.isArray(value) || typeof value !== 'object' || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) fail(503, 'SOURCE_RUNTIME_INDEX');
}
function part(value, max = 4 * 1024 * 1024) {
  exact(value, ['sha256', 'byteLength']);
  if (!hex(value.sha256) || !Number.isSafeInteger(value.byteLength) || value.byteLength < 1 || value.byteLength > max) fail(503, 'SOURCE_RUNTIME_INDEX');
}
export class OwnedRuntimeAssets {
  #sql; #bucket; #principal; #games; #policy; #allowed; #definition; #captures = new WeakMap();
  constructor({ storage, bucket, principal, games, policy, kind }) {
    if (!storage?.sql || typeof bucket?.get !== 'function' || typeof principal !== 'function' || typeof games?.snapshotReference !== 'function' || !isInstalledSourcePolicy(policy)) throw new TypeError('trusted owned runtime asset ports required');
    const paths = [];
    if (kind === 'visuals' && policy.roles.length === 41) {
      const prefix = `content/builtin/compiled/${policy.revision}/`;
      paths.push(`${prefix}manifest.json`);
      for (const stem of ['map_atlas_', 'map_tiles_']) for (const season of ['spring', 'summer', 'autumn', 'winter']) paths.push(`${prefix}${stem}${season}.png`);
    } else throw new TypeError('fixed visual runtime role policy required');
    if (paths.some(path => !policy.roles.some(role => role.path === path))) throw new TypeError('missing pinned runtime role');
    this.#sql = storage.sql; this.#bucket = bucket; this.#principal = principal; this.#games = games; this.#policy = policy;
    this.#allowed = new Set(paths);
    this.#definition = Object.freeze({ registryId: policy.registryId, definitionDigest: sha(Buffer.from([...canonicalSourceTokens(policy)].join(''))), roleCount: policy.roles.length, profileRevision: policy.profileRevision });
  }
  definition() { return this.#definition; }
  #one(query, ...values) { return this.#sql.exec(query, ...values).toArray()[0]; }
  #row() {
    const row = this.#one('SELECT * FROM installed_sources WHERE registry_id=?', this.#policy.registryId);
    if (!row) fail(404, 'SOURCE_NOT_REGISTERED');
    if (row.definition_digest !== this.#definition.definitionDigest) fail(409, 'SOURCE_PROFILE_CHANGED');
    part({ sha256: row.root_digest, byteLength: row.root_byte_length }, 1024 * 1024);
    return row;
  }
  #assert(tokenHash, context) {
    const actor = this.#principal(tokenHash);
    if (actor.must_change) fail(403, 'PASSWORD_CHANGE_REQUIRED');
    if (actor.id !== context.actor.id || actor.epoch !== context.actor.epoch) fail(401, 'SESSION_INVALID');
    const ref = context.reference;
    // The real game port checks owner and permanent deletion fence; admin is
    // not a cross-owner bypass. Current revision is a separate explicit gate.
    const current = this.#games.snapshotReference(tokenHash, ref.gameId, ref.draftRevision);
    const game = this.#one('SELECT draft_revision FROM content_games WHERE game_id=?', ref.gameId);
    if (game?.draft_revision !== ref.draftRevision || current.rootKey !== ref.rootKey || current.sourceDigest !== ref.sourceDigest || current.dependencyDigest !== ref.dependencyDigest) fail(409, 'SOURCE_RUNTIME_CHANGED');
    const row = this.#row();
    if (rowFields.some(field => row[field] !== context.row[field])) fail(409, 'SOURCE_CHANGED');
    const origin = this.#one('SELECT * FROM copy_origins WHERE game_id=?', ref.gameId);
    if (!origin || origin.registry_id !== row.registry_id || origin.definition_digest !== row.definition_digest || origin.catalog_root !== row.root_digest || origin.profile_revision !== this.#policy.profileRevision) fail(409, 'SOURCE_RUNTIME_CHANGED');
  }
  async #read(tokenHash, context, descriptor) {
    part(descriptor); this.#assert(tokenHash, context);
    let object;
    try { object = await this.#bucket.get(`installed/${this.#policy.registryId}/${descriptor.sha256}`); }
    catch (error) { this.#assert(tokenHash, context); throw error; }
    try { this.#assert(tokenHash, context); }
    catch (error) { try { await object?.body?.cancel(); } catch { /* Preserve authority failure. */ } throw error; }
    if (!object) fail(404, 'SOURCE_OBJECT_MISSING');
    if (!object.body || object.size !== descriptor.byteLength) {
      try { await object.body?.cancel(); } catch { /* Preserve integrity failure. */ }
      fail(503, 'SOURCE_OBJECT_CORRUPT');
    }
    const reader = object.body.getReader(), pieces = [], digest = createHash('sha256');
    let length = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read(); this.#assert(tokenHash, context);
        if (done) break;
        if (!(value instanceof Uint8Array)) fail(503, 'SOURCE_OBJECT_CORRUPT');
        length += value.length;
        if (length > descriptor.byteLength) fail(503, 'SOURCE_OBJECT_CORRUPT');
        const bytes = Uint8Array.from(value); digest.update(bytes); pieces.push(bytes);
      }
      if (length !== descriptor.byteLength || digest.digest('hex') !== descriptor.sha256) fail(503, 'SOURCE_OBJECT_CORRUPT');
    } catch (error) {
      try { await reader.cancel(); } catch { /* Cancellation must not replace the read failure. */ }
      this.#assert(tokenHash, context);
      throw error;
    }
    finally { reader.releaseLock(); }
    this.#assert(tokenHash, context);
    const result = new Uint8Array(length); let at = 0;
    for (const bytes of pieces) { result.set(bytes, at); at += bytes.length; }
    return result;
  }
  async capture(tokenHash, reference, paths) {
    if (!Array.isArray(paths) || paths.length < 1 || paths.length > this.#allowed.size || new Set(paths).size !== paths.length || paths.some(path => typeof path !== 'string' || !this.#allowed.has(path))) fail(403, 'SOURCE_RUNTIME_ROLE');
    const wanted = new Set(paths);
    if (!reference || typeof reference.rootKey !== 'string' || !hex(reference.sourceDigest)) fail(422, 'SOURCE_RUNTIME_BINDING');
    const actor = this.#principal(tokenHash);
    if (actor.must_change) fail(403, 'PASSWORD_CHANGE_REQUIRED');
    const current = this.#games.snapshotReference(tokenHash, reference.gameId, reference.draftRevision);
    if (current.rootKey !== reference.rootKey || current.sourceDigest !== reference.sourceDigest) fail(409, 'SOURCE_RUNTIME_CHANGED');
    const context = { actor: { id: actor.id, epoch: actor.epoch }, reference: { ...current }, row: this.#row() };
    this.#assert(tokenHash, context);
    const raw = await this.#read(tokenHash, context, { sha256: context.row.root_digest, byteLength: context.row.root_byte_length });
    let index;
    try { index = decodeSourceChunks([raw]); } catch { fail(503, 'SOURCE_RUNTIME_INDEX'); }
    exact(index, ['schema', 'registryId', 'definitionDigest', 'roles']);
    if (index.schema !== 'dragon-installed-source-index-1' || index.registryId !== this.#policy.registryId || index.definitionDigest !== this.#definition.definitionDigest || !Array.isArray(index.roles) || index.roles.length !== this.#policy.roles.length) fail(503, 'SOURCE_RUNTIME_INDEX');
    let total = 0;
    for (let n = 0; n < index.roles.length; n++) {
      const role = index.roles[n], expected = this.#policy.roles[n];
      exact(role, ['path', 'sha256', 'byteLength', 'chunks']);
      if (role.path !== expected.path || role.sha256 !== expected.sha256 || role.byteLength !== expected.byteLength || !Array.isArray(role.chunks) || role.chunks.length < 1 || role.chunks.length > 64) fail(503, 'SOURCE_RUNTIME_INDEX');
      total += role.byteLength;
      if (total > 64 * 1024 * 1024) fail(503, 'SOURCE_RUNTIME_INDEX');
      let length = 0;
      for (const chunk of role.chunks) { part(chunk); length += chunk.byteLength; }
      if (length !== role.byteLength) fail(503, 'SOURCE_RUNTIME_INDEX');
    }
    const roles = new Map();
    for (const role of index.roles) {
      if (!wanted.has(role.path)) continue;
      if (role.byteLength > 25 * 1024 * 1024) fail(413, 'SOURCE_RUNTIME_TOO_LARGE');
      const bytes = new Uint8Array(role.byteLength); let at = 0;
      for (const descriptor of role.chunks) { const chunk = await this.#read(tokenHash, context, descriptor); bytes.set(chunk, at); at += chunk.length; }
      if (sha(bytes) !== role.sha256) fail(503, 'SOURCE_ROLE_CORRUPT');
      roles.set(role.path, bytes);
    }
    this.#assert(tokenHash, context);
    const result = Object.freeze({ registryId: index.registryId, definitionDigest: index.definitionDigest, rootDigest: context.row.root_digest, readWeb: path => {
      this.#assert(tokenHash, context);
      if (!roles.has(path)) fail(403, 'SOURCE_RUNTIME_ROLE');
      return Uint8Array.from(roles.get(path));
    } });
    this.#captures.set(result, context);
    return result;
  }
  assertCapture(tokenHash, capture) {
    const context = this.#captures.get(capture);
    if (!context) fail(403, 'SOURCE_CAPTURE_REQUIRED');
    this.#assert(tokenHash, context);
    return this.#definition;
  }
}
