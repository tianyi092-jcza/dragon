// Internal full-copy transaction. No client-selected target, author upload or runtime/release grant.
import { createHash } from 'node:crypto';
import { canonicalSourceTokens, encodeSourceChunks } from '../web/src/content/authoring/sourcejson.js';
import { normalizeGameMetadata } from '../web/src/editor/gamemetadata.js';
import { createPinnedCopyLoader } from '../tools/editor_trusted_copy.mjs';
import { FixedCopyProfile, FIXED_COPY_PROFILE } from './copyprofile.js';
import { GameSnapshotVerifier } from './snapshots.js';
import { fail } from './security.js';
const hash = value => createHash('sha256').update(value).digest('hex');
function text(value) { let s = ''; try { for (const token of canonicalSourceTokens(value)) { s += token; if (s.length > 8192) fail(413, 'COPY_REQUEST_TOO_LARGE'); } } catch (error) { if (error.status) throw error; fail(422, 'COPY_REQUEST'); } return s; }
function parsed(s) { try { return JSON.parse(s); } catch { fail(503, 'COPY_RECORD_CORRUPT'); } }
function request(input) {
  const data = parsed(text(input));
  if (!data || Array.isArray(data) || Object.keys(data).sort().join(',') !== 'introduction,name,registryId' || typeof data.registryId !== 'string') fail(422, 'COPY_REQUEST');
  for (const v of [data.name, data.introduction]) if (typeof v !== 'string' || [...v].some(c => { const n = c.codePointAt(0); return n < 32 || n >= 127 && n <= 159; })) fail(422, 'COPY_METADATA');
  let metadata; try { metadata = normalizeGameMetadata({ name: data.name, introduction: data.introduction }); } catch { fail(422, 'COPY_METADATA'); }
  return { registryId: data.registryId, metadata };
}
function key(value) { if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(value)) fail(422, 'COPY_OPERATION_KEY'); }
export class AdminFullCopy {
  #storage; #sql; #principal; #catalog; #games; #blobs; #verifier; #leaseMs; #caps = new WeakMap(); #executing = new WeakSet();
  constructor({ storage, principal, catalog, games, blobs, leaseMs = 60000 }) {
    if (!storage?.sql || typeof principal !== 'function' || typeof catalog?.loadFull !== 'function' || typeof games?.recoverGameId !== 'function' || typeof blobs?.putImmutable !== 'function') throw new TypeError('actual same-domain stores and principal required');
    if (!Number.isSafeInteger(leaseMs) || leaseMs < 1 || leaseMs > 300000) fail(503, 'COPY_LEASE_POLICY');
    this.#storage = storage; this.#sql = storage.sql; this.#principal = principal; this.#catalog = catalog; this.#games = games; this.#blobs = blobs; this.#leaseMs = leaseMs; this.#verifier = new GameSnapshotVerifier({ blobs });
    storage.transactionSync(() => {
      this.#sql.exec('CREATE TABLE IF NOT EXISTS copy_requests (actor TEXT NOT NULL, op_key TEXT NOT NULL, request_digest TEXT NOT NULL, auth_epoch INTEGER NOT NULL, game_id TEXT NOT NULL UNIQUE, registry_id TEXT NOT NULL, definition_digest TEXT NOT NULL, catalog_root TEXT NOT NULL, profile_revision TEXT NOT NULL, metadata_json TEXT NOT NULL, state TEXT NOT NULL, generation INTEGER NOT NULL, lease_hash TEXT, lease_until INTEGER NOT NULL, row_revision TEXT NOT NULL, created_at TEXT NOT NULL, result_json TEXT, PRIMARY KEY(actor,op_key))');
      this.#sql.exec('CREATE TABLE IF NOT EXISTS copy_objects (game_id TEXT NOT NULL, sha256 TEXT NOT NULL, byte_length INTEGER NOT NULL, state TEXT NOT NULL, PRIMARY KEY(game_id,sha256))');
      this.#sql.exec('CREATE TABLE IF NOT EXISTS copy_origins (game_id TEXT PRIMARY KEY, registry_id TEXT NOT NULL, definition_digest TEXT NOT NULL, catalog_root TEXT NOT NULL, profile_revision TEXT NOT NULL, baseline_root TEXT NOT NULL, baseline_length INTEGER NOT NULL, baseline_digest TEXT NOT NULL, source_digest TEXT NOT NULL, dependency_digest TEXT NOT NULL)');
    });
  }
  #one(q, ...values) { return this.#sql.exec(q, ...values).toArray()[0]; }
  #actor(tokenHash, prior) { const actor = this.#principal(tokenHash); if (actor.must_change) fail(403, 'PASSWORD_CHANGE_REQUIRED'); if (actor.role !== 'admin') fail(403, 'FULL_COPY_ADMIN_REQUIRED'); if (prior && (actor.id !== prior.id || actor.epoch !== prior.epoch)) fail(401, 'SESSION_INVALID'); return actor; }
  #row(actor, operationKey) { key(operationKey); const row = this.#one('SELECT * FROM copy_requests WHERE actor=? AND op_key=?', actor.id, operationKey); if (!row) fail(404, 'COPY_NOT_FOUND'); if (row.auth_epoch !== actor.epoch) fail(409, 'COPY_OPERATION_REVOKED'); return row; }
  #source(tokenHash, row) { const source = this.#catalog.status(tokenHash, row.registry_id), definition = this.#catalog.definition(); if (source.definitionDigest !== row.definition_digest || source.rootDigest !== row.catalog_root || definition.profileRevision !== row.profile_revision) fail(409, 'COPY_SOURCE_CHANGED'); }
  #summary(row) { return { gameId: row.game_id, state: row.state, rowRevision: row.row_revision, generation: row.generation, leaseUntil: row.lease_until, registryId: row.registry_id }; }
  reserve(tokenHash, operationKey, input) {
    const actor = this.#actor(tokenHash), values = request(input); key(operationKey);
    const source = this.#catalog.status(tokenHash, values.registryId), definition = this.#catalog.definition();
    const digest = hash(Buffer.from(text({ values, source, profile: FIXED_COPY_PROFILE })));
    return this.#storage.transactionSync(() => {
      this.#actor(tokenHash, actor); const old = this.#one('SELECT * FROM copy_requests WHERE actor=? AND op_key=?', actor.id, operationKey);
      if (old) { if (old.request_digest !== digest) fail(409, 'IDEMPOTENCY_CONFLICT'); this.#row(actor, operationKey); this.#source(tokenHash, old); return this.#summary(old); }
      if (this.#one('SELECT op_key FROM content_operations WHERE actor=? AND op_key=?', actor.id, operationKey) || this.#one('SELECT op_key FROM content_reservations WHERE actor=? AND op_key=?', actor.id, operationKey)) fail(409, 'IDEMPOTENCY_CONFLICT');
      if (this.#one('SELECT game_id FROM content_names WHERE owner_id=? AND name=?', actor.id, values.metadata.name)) fail(409, 'GAME_NAME_OCCUPIED');
      const id = crypto.randomUUID(); if (this.#one('SELECT game_id FROM content_used_ids WHERE game_id=?', id)) fail(409, 'GAME_ID_USED');
      this.#sql.exec('INSERT INTO content_reservations VALUES(?,?,?,?,?,?)', actor.id, operationKey, 'create', 'new', digest, actor.epoch);
      this.#sql.exec('INSERT INTO content_names VALUES(?,?,?)', actor.id, values.metadata.name, id);
      this.#sql.exec("INSERT INTO copy_requests VALUES(?,?,?,?,?,?,?,?,?,?,'pending',0,NULL,0,'1',?,NULL)", actor.id, operationKey, digest, actor.epoch, id, values.registryId, source.definitionDigest, source.rootDigest, definition.profileRevision, text(values.metadata), new Date().toISOString());
      return this.#summary(this.#row(actor, operationKey));
    });
  }
  query(tokenHash, operationKey) { const actor = this.#actor(tokenHash), row = this.#row(actor, operationKey); this.#source(tokenHash, row); if (row.state === 'committed') return this.#result(tokenHash, row); return this.#summary(row); }
  #result(tokenHash, row) {
    const result = parsed(row.result_json), origin = this.#one('SELECT * FROM copy_origins WHERE game_id=?', row.game_id), snapshot = this.#games.snapshotReference(tokenHash, row.game_id, '1');
    if (!origin || typeof origin.baseline_digest !== 'string') fail(503, 'COPY_RECEIPT_CORRUPT');
    if (text(result) !== text({ gameId: row.game_id, draftRevision: '1', sourceDigest: snapshot.sourceDigest, baselineDigest: origin.baseline_digest }) || origin?.source_digest !== snapshot.sourceDigest || origin.registry_id !== row.registry_id || origin.catalog_root !== row.catalog_root) fail(503, 'COPY_RECEIPT_CORRUPT'); return result;
  }
  claim(tokenHash, operationKey, expectedRevision) {
    const actor = this.#actor(tokenHash); return this.#storage.transactionSync(() => {
      const row = this.#row(actor, operationKey); this.#source(tokenHash, row);
      if (typeof expectedRevision !== 'string' || expectedRevision !== row.row_revision) fail(409, 'COPY_CHANGED');
      if (!(row.state === 'pending' || row.state === 'running' && row.lease_until <= Date.now())) fail(409, 'COPY_NOT_CLAIMABLE');
      const nonce = new Uint8Array(32); crypto.getRandomValues(nonce); const leaseHash = hash(nonce), generation = row.generation + 1;
      this.#sql.exec("UPDATE copy_requests SET state='running',generation=?,lease_hash=?,lease_until=?,row_revision=? WHERE actor=? AND op_key=?", generation, leaseHash, Date.now() + this.#leaseMs, String(BigInt(row.row_revision) + 1n), actor.id, operationKey);
      const cap = Object.freeze({}); this.#caps.set(cap, { actor, operationKey, generation, leaseHash }); return cap;
    });
  }
  #lease(tokenHash, cap) { const known = this.#caps.get(cap); if (!known) fail(403, 'COPY_LEASE_REQUIRED'); const actor = this.#actor(tokenHash, known.actor), row = this.#row(actor, known.operationKey); if (row.state !== 'running' || row.generation !== known.generation || row.lease_hash !== known.leaseHash || row.lease_until <= Date.now()) fail(409, 'COPY_LEASE_LOST'); this.#source(tokenHash, row); return { actor, row }; }
  resolveAllocation(tokenHash, cap) { const { actor, row } = this.#lease(tokenHash, cap); return Object.freeze({ gameId: row.game_id, ownerId: actor.id, epoch: actor.epoch }); }
  heartbeat(tokenHash, cap) { return this.#storage.transactionSync(() => { const { actor, row } = this.#lease(tokenHash, cap); this.#sql.exec('UPDATE copy_requests SET lease_until=?,row_revision=? WHERE actor=? AND op_key=?', Date.now() + this.#leaseMs, String(BigInt(row.row_revision) + 1n), actor.id, row.op_key); return this.#summary(this.#row(actor, row.op_key)); }); }
  cancel(tokenHash, operationKey, expectedRevision) { const actor = this.#actor(tokenHash); return this.#storage.transactionSync(() => { key(operationKey); const row = this.#one('SELECT * FROM copy_requests WHERE actor=? AND op_key=?', actor.id, operationKey); if (!row || row.row_revision !== expectedRevision || !['pending', 'running'].includes(row.state)) fail(409, 'COPY_CHANGED'); this.#sql.exec("UPDATE copy_requests SET state='canceled',lease_hash=NULL,lease_until=0,row_revision=? WHERE actor=? AND op_key=?", String(BigInt(row.row_revision) + 1n), actor.id, operationKey); this.#sql.exec('DELETE FROM content_names WHERE game_id=?', row.game_id); this.#sql.exec("UPDATE copy_objects SET state='abandoned' WHERE game_id=?", row.game_id); return this.#summary(this.#one('SELECT * FROM copy_requests WHERE actor=? AND op_key=?', actor.id, operationKey)); }); }
  async #put(tokenHash, cap, allocation, bytes) {
    const digest = hash(bytes); this.#storage.transactionSync(() => { const { row } = this.#lease(tokenHash, cap), old = this.#one('SELECT * FROM copy_objects WHERE game_id=? AND sha256=?', row.game_id, digest); if (old && old.byte_length !== bytes.length) fail(503, 'COPY_OBJECT_CONFLICT'); this.#sql.exec("INSERT OR IGNORE INTO copy_objects VALUES(?,?,?,'intent')", row.game_id, digest, bytes.length); });
    const stored = await this.#blobs.putImmutable(tokenHash, { gameId: allocation.gameId, allocation, bytes });
    this.#storage.transactionSync(() => { this.#lease(tokenHash, cap); this.#sql.exec("UPDATE copy_objects SET state='verified' WHERE game_id=? AND sha256=?", allocation.gameId, digest); });
    return { sha256: stored.sha256, byteLength: stored.byteLength };
  }
  async #write(tokenHash, cap, allocation, game) {
    const chunks = [], parts = encodeSourceChunks(game), h = createHash('sha256'); let length = 0;
    for (const part of parts) { h.update(part); length += part.length; chunks.push(await this.#put(tokenHash, cap, allocation, part)); }
    const index = { schema: 'dragon-game-source-index-1', gameId: game.gameId, sourceDigest: h.digest('hex'), sourceByteLength: length, chunks, dependencies: [] };
    return this.#put(tokenHash, cap, allocation, Buffer.concat(encodeSourceChunks(index)));
  }
  async execute(tokenHash, cap) {
    this.#lease(tokenHash, cap); if (this.#executing.has(cap)) fail(409, 'COPY_ALREADY_RUNNING'); this.#executing.add(cap);
    try { return await this.#execute(tokenHash, cap); } finally { this.#executing.delete(cap); }
  }
  async #execute(tokenHash, cap) {
    const { actor, row } = this.#lease(tokenHash, cap), allocation = this.#games.recoverGameId(tokenHash, cap);
    const source = await this.#catalog.loadFull(tokenHash, row.registry_id); this.#lease(tokenHash, cap); this.#catalog.assertCapture(tokenHash, source);
    let record = 0; const profile = new FixedCopyProfile({ loadCopy: createPinnedCopyLoader({ readWeb: source.readWeb, allocateEntityId: () => row.game_id + ':source-record:' + ++record }) });
    const captured = await profile.capture({ gameId: row.game_id, ownerId: actor.id }); this.#lease(tokenHash, cap); this.#catalog.assertCapture(tokenHash, source);
    const candidate = { ...captured.game, metadata: parsed(row.metadata_json) }; profile.verify(captured.capability, candidate);
    const baseline = await this.#write(tokenHash, cap, allocation, captured.game), saved = await this.#write(tokenHash, cap, allocation, candidate);
    const baselineProof = await this.#verifier.verify(tokenHash, { gameId: row.game_id, allocation, metadata: captured.game.metadata, source: baseline });
    if (profile.verify(captured.capability, baselineProof.game).sourceDigest !== captured.baselineDigest) fail(422, 'COPY_BASELINE_PROOF');
    const checked = await this.#verifier.verify(tokenHash, { gameId: row.game_id, allocation, metadata: candidate.metadata, source: saved }), proof = profile.verify(captured.capability, checked.game);
    this.#lease(tokenHash, cap); this.#catalog.assertCapture(tokenHash, source);
    const prepared = await this.#games.prepareSnapshot(tokenHash, { gameId: row.game_id, draftRevision: '1', metadata: candidate.metadata, source: saved, allocation }); this.#lease(tokenHash, cap);
    this.#games.transaction(tokenHash, { key: row.op_key, method: 'create', target: 'new', digest: row.request_digest }, tx => {
      const now = this.#lease(tokenHash, cap); this.#catalog.assertCapture(tokenHash, source);
      const pending = this.#one("SELECT sha256 FROM copy_objects WHERE game_id=? AND state<>'verified'", row.game_id); if (pending) fail(503, 'COPY_OBJECT_NOT_VERIFIED');
      const result = tx.create(allocation, prepared);
      this.#sql.exec('INSERT INTO copy_origins VALUES(?,?,?,?,?,?,?,?,?,?)', row.game_id, row.registry_id, row.definition_digest, row.catalog_root, row.profile_revision, baseline.sha256, baseline.byteLength, captured.baselineDigest, proof.sourceDigest, checked.dependencyDigest);
      const receipt = { gameId: row.game_id, draftRevision: '1', sourceDigest: proof.sourceDigest, baselineDigest: captured.baselineDigest };
      this.#sql.exec("UPDATE copy_objects SET state='committed' WHERE game_id=?", row.game_id);
      this.#sql.exec("UPDATE copy_requests SET state='committed',lease_hash=NULL,lease_until=0,row_revision=?,result_json=? WHERE actor=? AND op_key=?", String(BigInt(now.row.row_revision) + 1n), text(receipt), actor.id, row.op_key);
      return result;
    });
    return this.query(tokenHash, row.op_key);
  }
}
