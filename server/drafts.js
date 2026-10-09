// Private fixed-copy drafts only. Representation-safe resource edits are not runtime admission.
import { createHash } from 'node:crypto';
import { canonicalSourceTokens, encodeSourceChunks, decodeSourceChunks, CanonicalSourceParser } from '../web/src/content/authoring/sourcejson.js';
import { normalizeGameMetadata } from '../web/src/editor/gamemetadata.js';
import { editChapterResources } from '../web/src/editor/chapterresources.js';
import { FixedCopyProfile, FIXED_COPY_PROFILE } from './copyprofile.js';
import { GameSnapshotVerifier } from './snapshots.js';
import { fail, fields, HttpError } from './security.js';
const uuid = v => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const hex = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const revision = v => typeof v === 'string' && /^[1-9][0-9]{0,63}$/.test(v);
const hash = b => createHash('sha256').update(b).digest('hex');
function parsed(text) { try { return JSON.parse(text); } catch { fail(503, 'DRAFT_RECORD_CORRUPT'); } }
function capture(input) {
  let text = ''; try { for (const token of canonicalSourceTokens(input)) { text += token; if (Buffer.byteLength(text) > 16384) fail(413, 'DRAFT_REQUEST_TOO_LARGE'); } } catch (error) { if (error instanceof HttpError) throw error; fail(422, 'DRAFT_REQUEST'); }
  const value = parsed(text); fields(value, ['metadata', 'resourceEdits']); fields(value.metadata, ['name', 'introduction']);
  for (const t of [value.metadata.name, value.metadata.introduction]) if (typeof t !== 'string' || [...t].some(c => { const n = c.codePointAt(0); return n < 32 || n >= 127 && n <= 159; })) fail(422, 'GAME_METADATA');
  try { value.metadata = normalizeGameMetadata(value.metadata); } catch { fail(422, 'GAME_METADATA'); }
  if (!Array.isArray(value.resourceEdits) || value.resourceEdits.length > 32) fail(422, 'DRAFT_RESOURCE_EDITS');
  const seen = new Set();
  for (const edit of value.resourceEdits) {
    fields(edit, ['chapterId', 'slot', 'values']);
    if (typeof edit.chapterId !== 'string' || !edit.chapterId.length || edit.chapterId.length > 256 || !Number.isSafeInteger(edit.slot) || edit.slot < 0 || edit.slot > 21) fail(422, 'DRAFT_RESOURCE_EDITS');
    const k = edit.chapterId + ':' + edit.slot; if (seen.has(k)) fail(422, 'DRAFT_RESOURCE_EDITS'); seen.add(k);
    if (!edit.values || Array.isArray(edit.values)) fail(422, 'DRAFT_RESOURCE_EDITS');
    const keys = Object.keys(edit.values); if (!keys.length || keys.some(k => !['money', 'reserve_cav', 'reserve_arc', 'reserve_inf'].includes(k) || !Number.isSafeInteger(edit.values[k]) || Object.is(edit.values[k], -0))) fail(422, 'DRAFT_RESOURCE_EDITS');
  }
  return value;
}
export class PrivateDrafts {
  #storage; #sql; #principal; #games; #blobs; #definition; #guard; #verifier;
  constructor({ storage, principal, games, blobs, definition, operationGuard }) {
    if (!storage?.sql || typeof principal !== 'function' || typeof games?.prepareSnapshot !== 'function' || typeof blobs?.read !== 'function' || typeof definition !== 'function' || typeof operationGuard !== 'function') throw new TypeError('actual draft stores and trusted service ports required');
    this.#storage = storage; this.#sql = storage.sql; this.#principal = principal; this.#games = games; this.#blobs = blobs; this.#definition = definition; this.#guard = operationGuard; this.#verifier = new GameSnapshotVerifier({ blobs });
    storage.transactionSync(() => {
      this.#sql.exec('CREATE TABLE IF NOT EXISTS draft_requests (actor TEXT NOT NULL, op_key TEXT NOT NULL, request_digest TEXT NOT NULL, auth_epoch INTEGER NOT NULL, game_id TEXT NOT NULL, expected_revision TEXT NOT NULL, request_json TEXT NOT NULL, state TEXT NOT NULL, result_json TEXT, error_code TEXT, error_status INTEGER, source_digest TEXT, dependency_digest TEXT, root_key TEXT, result_revision TEXT, created_at TEXT NOT NULL, completed_at TEXT, PRIMARY KEY(actor,op_key))');
      this.#sql.exec('CREATE TABLE IF NOT EXISTS draft_objects (actor TEXT NOT NULL, op_key TEXT NOT NULL, game_id TEXT NOT NULL, sha256 TEXT NOT NULL, byte_length INTEGER NOT NULL, state TEXT NOT NULL, PRIMARY KEY(actor,op_key,sha256))');
      this.#sql.exec('CREATE TABLE IF NOT EXISTS draft_references (game_id TEXT NOT NULL, revision TEXT NOT NULL, sha256 TEXT NOT NULL, byte_length INTEGER NOT NULL, PRIMARY KEY(game_id,revision,sha256))');
    });
  }
  #one(q, ...v) { return this.#sql.exec(q, ...v).toArray()[0]; }
  #owned(tokenHash, gameId, prior) {
    const actor = this.#principal(tokenHash); if (actor.must_change) fail(403, 'PASSWORD_CHANGE_REQUIRED');
    if (prior && (prior.id !== actor.id || prior.epoch !== actor.epoch)) fail(401, 'SESSION_INVALID');
    if (gameId === 'wolong-builtin') fail(403, 'BUILTIN_PROTECTED'); if (!uuid(gameId)) fail(422, 'DRAFT_GAME_ID');
    const row = this.#one('SELECT * FROM content_games WHERE game_id=?', gameId); if (!row || row.owner_id !== actor.id) fail(404, 'GAME_NOT_FOUND');
    this.#games.assertNotDeleting(gameId);
    return { actor, row };
  }
  #origin(tokenHash, gameId, actor) {
    this.#owned(tokenHash, gameId, actor);
    const origin = this.#one('SELECT * FROM copy_origins WHERE game_id=?', gameId), def = this.#definition();
    if (!origin) fail(503, 'DRAFT_PROFILE_NOT_READY');
    const registered = this.#one('SELECT * FROM installed_sources WHERE registry_id=?', origin.registry_id);
    if (!registered || origin.registry_id !== def.registryId || origin.profile_revision !== FIXED_COPY_PROFILE || def.profileRevision !== origin.profile_revision || def.definitionDigest !== origin.definition_digest || registered.definition_digest !== origin.definition_digest || registered.root_digest !== origin.catalog_root || !hex(origin.baseline_root) || !hex(origin.baseline_digest) || !Number.isSafeInteger(origin.baseline_length)) fail(409, 'DRAFT_SOURCE_CHANGED');
    return origin;
  }
  #descriptor(gameId, reference) {
    const prefix = 'private/' + gameId + '/', digest = reference.rootKey?.slice(prefix.length);
    if (typeof reference.rootKey !== 'string' || !reference.rootKey.startsWith(prefix) || !hex(digest)) fail(503, 'DRAFT_REFERENCE_CORRUPT');
    const object = this.#one("SELECT byte_length FROM copy_objects WHERE game_id=? AND sha256=? AND state='committed'", gameId, digest) ?? this.#one("SELECT byte_length FROM draft_objects WHERE game_id=? AND sha256=? AND state='committed'", gameId, digest);
    if (!object || !Number.isSafeInteger(object.byte_length)) fail(503, 'DRAFT_REFERENCE_CORRUPT');
    return { sha256: digest, byteLength: object.byte_length };
  }
  async #load(tokenHash, gameId, requested, actor, single = false) {
    if (!revision(requested)) fail(422, 'DRAFT_REVISION');
    const reference = this.#games.snapshotReference(tokenHash, gameId, requested), root = this.#descriptor(gameId, reference);
    // Metadata lives in the canonical source, never copied from the latest draft.
    const index = await this.#blobs.read(tokenHash, { gameId, ...root }); this.#owned(tokenHash, gameId, actor);
    let sourceIndex; try { sourceIndex = decodeSourceChunks([index.bytes]); } catch { fail(503, 'DRAFT_REFERENCE_CORRUPT'); }
    // Streaming verifier reads and checks every actual part. Metadata must first be
    // discovered from those bytes, without using the current row for an old revision.
    const proof = await (single ? this.#readSourceStored(tokenHash, gameId, root, sourceIndex, actor) : this.#readSource(tokenHash, gameId, root, sourceIndex, actor));
    if (proof.sourceDigest !== reference.sourceDigest || proof.dependencyDigest !== reference.dependencyDigest) fail(503, 'DRAFT_REFERENCE_CORRUPT');
    return { reference, root, proof };
  }
  async #readSource(tokenHash, gameId, root, index, actor) {
    // Decode once to extract metadata; then use the unchanged common verifier. All
    // parts are bounded and hashed by BlobStore, and total has an explicit budget.
    fields(index, ['schema', 'gameId', 'sourceDigest', 'sourceByteLength', 'chunks', 'dependencies']);
    if (index.schema !== 'dragon-game-source-index-1' || index.gameId !== gameId || !hex(index.sourceDigest)) fail(503, 'DRAFT_REFERENCE_CORRUPT');
    if (!Array.isArray(index?.chunks) || !index.chunks.length || index.chunks.length > 4096 || !Number.isSafeInteger(index.sourceByteLength) || index.sourceByteLength < 1 || index.sourceByteLength > 64 * 1024 * 1024) fail(503, 'DRAFT_REFERENCE_CORRUPT');
    const parser = new CanonicalSourceParser(), decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }); let total = 0;
    for (const part of index.chunks) {
      fields(part, ['sha256', 'byteLength']);
      if (!hex(part.sha256) || !Number.isSafeInteger(part.byteLength) || part.byteLength < 1 || part.byteLength > 4 * 1024 * 1024 || (total += part.byteLength) > 64 * 1024 * 1024) fail(503, 'DRAFT_REFERENCE_CORRUPT');
      const actual = await this.#blobs.read(tokenHash, { gameId, ...part }); this.#owned(tokenHash, gameId, actor);
      try { parser.feed(decoder.decode(actual.bytes, { stream: true })); } catch { fail(503, 'DRAFT_REFERENCE_CORRUPT'); }
    }
    let game; try { parser.feed(decoder.decode()); game = parser.finish(); } catch { fail(503, 'DRAFT_REFERENCE_CORRUPT'); }
    if (total !== index.sourceByteLength || !game?.metadata) fail(503, 'DRAFT_REFERENCE_CORRUPT');
    const metadata = game.metadata; game = undefined;
    const proof = await this.#verifier.verify(tokenHash, { gameId, metadata, source: root }); this.#owned(tokenHash, gameId, actor); return proof;
  }
  async #profile(tokenHash, gameId, actor, single = false) {
    const origin = this.#origin(tokenHash, gameId, actor), root = { sha256: origin.baseline_root, byteLength: origin.baseline_length };
    const actual = await this.#blobs.read(tokenHash, { gameId, ...root }); this.#owned(tokenHash, gameId, actor);
    let index;
    try { index = decodeSourceChunks([actual.bytes]); } catch { fail(503, 'DRAFT_BASELINE_CORRUPT'); }
    const proof = await (single ? this.#readSourceStored(tokenHash, gameId, root, index, actor) : this.#readSource(tokenHash, gameId, root, index, actor));
    if (proof.sourceDigest !== origin.baseline_digest) fail(503, 'DRAFT_BASELINE_CORRUPT');
    const profile = new FixedCopyProfile({ loadCopy: async () => ({ game: proof.game, provenance: { registryId: origin.registry_id, definitionDigest: origin.definition_digest, rootDigest: origin.catalog_root } }) }), captured = await profile.capture({ gameId, ownerId: actor.id });
    this.#owned(tokenHash, gameId, actor); this.#origin(tokenHash, gameId, actor); if (single) this.#sameOrigin(tokenHash, gameId, actor, origin); return { profile, captured };
  }
  // Compiler-only stored discovery; legacy read/save retain the original path.
  #sameOrigin(tokenHash, gameId, actor, origin) {
    const current = this.#origin(tokenHash, gameId, actor);
    for (const key of ['registry_id','profile_revision','catalog_root','definition_digest','baseline_root','baseline_length','baseline_digest']) if (current[key] !== origin[key]) fail(409, 'DRAFT_SOURCE_CHANGED');
  }
  async #readSourceStored(tokenHash, gameId, root, index, actor) {
    fields(index, ['schema','gameId','sourceDigest','sourceByteLength','chunks','dependencies']);
    if (index.schema !== 'dragon-game-source-index-1' || index.gameId !== gameId || !hex(index.sourceDigest)) fail(503,'DRAFT_REFERENCE_CORRUPT');
    if (!Array.isArray(index.chunks) || !index.chunks.length || index.chunks.length > 4096 || !Number.isSafeInteger(index.sourceByteLength) || index.sourceByteLength < 1 || index.sourceByteLength > 64*1024*1024) fail(503,'DRAFT_REFERENCE_CORRUPT');
    const origin = this.#origin(tokenHash, gameId, actor);
    const guarded = { read: async (t, input) => { const actual = await this.#blobs.read(t,input); this.#owned(tokenHash,gameId,actor); this.#sameOrigin(tokenHash,gameId,actor,origin); return actual; } };
    try { const proof = await new GameSnapshotVerifier({blobs:guarded}).verifyStored(tokenHash,{gameId,source:root}); this.#owned(tokenHash,gameId,actor); this.#sameOrigin(tokenHash,gameId,actor,origin); return proof; }
    catch (error) { if (error instanceof HttpError && ['SOURCE_JSON','SOURCE_STORED_METADATA'].includes(error.code)) fail(503,'DRAFT_REFERENCE_CORRUPT'); throw error; }
  }
  // Trusted in-process compiler port only; never returned by an HTTP route.
  async captureForCompile(tokenHash, gameId, requested) {
    const { actor } = this.#owned(tokenHash, gameId); this.#origin(tokenHash, gameId, actor);
    const loaded = await this.#load(tokenHash, gameId, requested, actor, true), { profile, captured } = await this.#profile(tokenHash, gameId, actor, true);
    const content = profile.verify(captured.capability, loaded.proof.game);
    this.#origin(tokenHash, gameId, actor);
    const reference = this.#games.snapshotReference(tokenHash, gameId, requested);
    if (reference.rootKey !== loaded.reference.rootKey || reference.sourceDigest !== loaded.reference.sourceDigest || reference.dependencyDigest !== loaded.reference.dependencyDigest || content.sourceDigest !== reference.sourceDigest) fail(503, 'DRAFT_REFERENCE_CORRUPT');
    return Object.freeze({ game: loaded.proof.game, reference: Object.freeze({ ...reference }), ownerId: actor.id, authEpoch: actor.epoch, profileRevision: FIXED_COPY_PROFILE });
  }
  async read(tokenHash, gameId, requested) {
    const { actor } = this.#owned(tokenHash, gameId); this.#origin(tokenHash, gameId, actor);
    const loaded = await this.#load(tokenHash, gameId, requested, actor), { profile, captured } = await this.#profile(tokenHash, gameId, actor);
    profile.verify(captured.capability, loaded.proof.game); this.#origin(tokenHash, gameId, actor);
    return { gameId, draftRevision: requested, sourceDigest: loaded.reference.sourceDigest, profileRevision: FIXED_COPY_PROFILE, metadata: loaded.proof.game.metadata,
      chapters: loaded.proof.game.chapterOrder.map(id => ({ chapterId: id, name: loaded.proof.game.chapters[id].name ?? '', factions: loaded.proof.game.chapters[id].state.factions.map((f, slot) => ({ slot, money: f.money, reserve_cav: f.reserve_cav, reserve_arc: f.reserve_arc, reserve_inf: f.reserve_inf })) })),
      limits: 'Fixed-copy draft metadata/four-resource representation only; not playable range or runtime/Trial/Release admission.' };
  }
  #request(tokenHash, gameId, operationKey, actor) {
    this.#owned(tokenHash, gameId, actor);
    if (typeof operationKey !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(operationKey)) fail(422, 'IDEMPOTENCY_KEY');
    const row = this.#one('SELECT * FROM draft_requests WHERE actor=? AND op_key=?', actor.id, operationKey);
    if (!row || row.game_id !== gameId) fail(404, 'DRAFT_OPERATION_NOT_FOUND'); if (row.auth_epoch !== actor.epoch) fail(409, 'OPERATION_REVOKED'); return row;
  }
  #receipt(tokenHash, row) {
    const result = parsed(row.result_json), old = this.#one('SELECT * FROM content_operations WHERE actor=? AND op_key=?', row.actor, row.op_key), ref = this.#games.snapshotReference(tokenHash, row.game_id, row.result_revision);
    if (!old || old.request_digest !== row.request_digest || old.auth_epoch !== row.auth_epoch || old.method !== 'save' || old.target !== row.game_id || old.result_json !== row.result_json || result.gameId !== row.game_id || result.draftRevision !== row.result_revision || ![row.expected_revision, String(BigInt(row.expected_revision) + 1n)].includes(result.draftRevision) || ref.rootKey !== row.root_key || ref.sourceDigest !== row.source_digest || ref.dependencyDigest !== row.dependency_digest) fail(503, 'DRAFT_RECEIPT_CORRUPT');
    return result;
  }
  query(tokenHash, gameId, operationKey) {
    const { actor } = this.#owned(tokenHash, gameId); this.#origin(tokenHash, gameId, actor);
    const row = this.#request(tokenHash, gameId, operationKey, actor);
    if (row.state === 'committed') return { state: row.state, result: this.#receipt(tokenHash, row) };
    return { gameId, state: row.state, expectedRevision: row.expected_revision, error: row.error_code, status: row.error_status };
  }
  async #put(tokenHash, actor, row, bytes) {
    const digest = hash(bytes); this.#storage.transactionSync(() => {
      this.#request(tokenHash, row.game_id, row.op_key, actor);
      const old = this.#one('SELECT * FROM draft_objects WHERE actor=? AND op_key=? AND sha256=?', actor.id, row.op_key, digest); if (old && old.byte_length !== bytes.length) fail(503, 'DRAFT_OBJECT_CONFLICT');
      this.#sql.exec("INSERT OR IGNORE INTO draft_objects VALUES(?,?,?,?,?,'intent')", actor.id, row.op_key, row.game_id, digest, bytes.length);
    });
    const stored = await this.#blobs.putImmutable(tokenHash, { gameId: row.game_id, bytes }); this.#owned(tokenHash, row.game_id, actor);
    this.#storage.transactionSync(() => { this.#request(tokenHash, row.game_id, row.op_key, actor); this.#sql.exec("UPDATE draft_objects SET state='verified' WHERE actor=? AND op_key=? AND sha256=? AND state='intent'", actor.id, row.op_key, digest); });
    return { sha256: stored.sha256, byteLength: stored.byteLength };
  }
  async #write(tokenHash, actor, row, game) {
    const chunks = [], parts = encodeSourceChunks(game), h = createHash('sha256'); let length = 0;
    for (const part of parts) { length += part.length; h.update(part); chunks.push(await this.#put(tokenHash, actor, row, part)); }
    const index = { schema: 'dragon-game-source-index-1', gameId: row.game_id, sourceDigest: h.digest('hex'), sourceByteLength: length, chunks, dependencies: [] };
    return this.#put(tokenHash, actor, row, Buffer.concat(encodeSourceChunks(index)));
  }
  async save(tokenHash, gameId, expected, operationKey, operationDigest, input) {
    const { actor, row: gameRow } = this.#owned(tokenHash, gameId); this.#origin(tokenHash, gameId, actor);
    if (!revision(expected) || !hex(operationDigest)) fail(422, 'DRAFT_OPERATION');
    const value = capture(input), capturedJSON = JSON.stringify(value);
    this.#storage.transactionSync(() => {
      this.#owned(tokenHash, gameId, actor); this.#guard(actor.id, operationKey);
      const old = this.#one('SELECT * FROM draft_requests WHERE actor=? AND op_key=?', actor.id, operationKey);
      if (old) { if (old.game_id !== gameId || old.expected_revision !== expected || old.request_digest !== operationDigest || old.request_json !== capturedJSON) fail(409, 'IDEMPOTENCY_CONFLICT'); this.#request(tokenHash, gameId, operationKey, actor); if (old.state === 'failed') this.#sql.exec("UPDATE draft_requests SET state='pending',error_code=NULL,error_status=NULL WHERE actor=? AND op_key=? AND state='failed'", actor.id, operationKey); }
      else this.#sql.exec("INSERT INTO draft_requests VALUES(?,?,?,?,?,?,?,'pending',NULL,NULL,NULL,NULL,NULL,NULL,NULL,?,NULL)", actor.id, operationKey, operationDigest, actor.epoch, gameId, expected, capturedJSON, new Date().toISOString());
    });
    const row = this.#request(tokenHash, gameId, operationKey, actor);
    if (row.state === 'committed') return this.#receipt(tokenHash, row);
    try {
      if (gameRow.draft_revision !== expected) fail(412, 'DRAFT_CHANGED');
      const loaded = await this.#load(tokenHash, gameId, expected, actor), { profile, captured } = await this.#profile(tokenHash, gameId, actor);
      profile.verify(captured.capability, loaded.proof.game);
      let candidate = { ...loaded.proof.game, metadata: value.metadata };
      for (const edit of value.resourceEdits) { try { candidate = editChapterResources(candidate, edit.chapterId, edit.slot, edit.values); } catch { fail(422, 'DRAFT_RESOURCE_DELTA'); } }
      const proof = profile.verify(captured.capability, candidate); this.#origin(tokenHash, gameId, actor);
      const source = proof.sourceDigest === loaded.reference.sourceDigest ? loaded.root : await this.#write(tokenHash, actor, row, candidate);
      const next = String(BigInt(expected) + 1n), prepared = await this.#games.prepareSnapshot(tokenHash, { gameId, draftRevision: next, metadata: value.metadata, source });
      const result = this.#storage.transactionSync(() => {
        this.#owned(tokenHash, gameId, actor); this.#origin(tokenHash, gameId, actor); this.#guard(actor.id, operationKey);
        const current = this.#request(tokenHash, gameId, operationKey, actor); if (current.state === 'committed') return this.#receipt(tokenHash, current);
        return this.#games.transaction(tokenHash, { key: operationKey, method: 'save', target: gameId, digest: operationDigest }, tx => {
          let saved; try { saved = tx.compareAndSwap(gameId, expected, prepared); } catch (error) { if (error instanceof HttpError && error.code === 'DRAFT_CHANGED') fail(412, 'DRAFT_CHANGED'); throw error; }
          const reference = this.#games.snapshotReference(tokenHash, gameId, saved.draftRevision);
          if (saved.draftRevision === next) {
            const objects = this.#sql.exec('SELECT * FROM draft_objects WHERE actor=? AND op_key=?', actor.id, operationKey).toArray();
            if (objects.some(o => o.state !== 'verified' && o.state !== 'committed')) fail(503, 'DRAFT_OBJECT_NOT_VERIFIED');
            for (const object of objects) this.#sql.exec('INSERT OR IGNORE INTO draft_references VALUES(?,?,?,?)', gameId, next, object.sha256, object.byte_length);
            this.#sql.exec("UPDATE draft_objects SET state='committed' WHERE actor=? AND op_key=?", actor.id, operationKey);
          }
          this.#sql.exec("UPDATE draft_requests SET state='committed',result_json=?,error_code=NULL,error_status=NULL,source_digest=?,dependency_digest=?,root_key=?,result_revision=?,completed_at=? WHERE actor=? AND op_key=?", JSON.stringify(saved), reference.sourceDigest, reference.dependencyDigest, reference.rootKey, reference.draftRevision, new Date().toISOString(), actor.id, operationKey);
          return saved;
        });
      });
      return result;
    } catch (error) {
      // Record only while the original authority still exists, never replace the
      // primary error or alter game data on a failed operation.
      try { this.#storage.transactionSync(() => { this.#request(tokenHash, gameId, operationKey, actor); this.#sql.exec("UPDATE draft_requests SET state='failed',error_code=?,error_status=? WHERE actor=? AND op_key=? AND state<>'committed'", error instanceof HttpError ? error.code : 'INTERNAL_ERROR', error instanceof HttpError ? error.status : 500, actor.id, operationKey); }); } catch { /* Keep the authority/integrity error. */ }
      throw error;
    }
  }
}
