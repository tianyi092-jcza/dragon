// Durable, ordered transport envelopes. No authority/ACL decisions or R2 I/O here.
// The caller owns the SAME outer transaction as its authoritative mutation.
// Receipt verification is a required synchronous trusted capability, not client JSON.
import { createHash, randomUUID } from 'node:crypto';
import { fail } from './security.js';

export const DISTRIBUTION_PAYLOAD_LIMIT = 4 * 1024 * 1024;
export const DISTRIBUTION_CHUNK_BYTES = 128 * 1024;
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;
const iso = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const ordinal = value => typeof value === 'string' && /^1\.(0|[1-9][0-9]*)$/.test(value);
const sha = value => createHash('sha256').update(value).digest('hex');
const kinds = new Set(['publish', 'listing', 'restriction', 'delete-fence', 'bootstrap']);
const blocks = new Set(['REMOTE_AHEAD', 'AUTHORITY_MISMATCH', 'REMOTE_GAP', 'LEGACY_PENDING']);
const requireRecord = condition => { if (!condition) fail(503, 'DISTRIBUTION_LEDGER_CORRUPT'); };
function payloadBytes(value) {
  if (!(value instanceof Uint8Array) || value.byteLength < 1 || value.byteLength > DISTRIBUTION_PAYLOAD_LIMIT) fail(422, 'DISTRIBUTION_PAYLOAD');
  const bytes = Buffer.from(value);
  let parsed;
  try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { fail(422, 'DISTRIBUTION_PAYLOAD'); }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object' || parsed.version !== 1) fail(422, 'DISTRIBUTION_PAYLOAD');
  return { bytes, envelope: parsed };
}
function receiptFields(value, identity, operationDigest) {
  if (!value || typeof value.then === 'function' || value.authorityId !== identity.authorityId || value.generation !== identity.generation || value.operationId !== identity.operationId || value.operationDigest !== operationDigest || value.payloadDigest !== identity.payloadDigest || !digest(value.rootDigest) || typeof value.rootETag !== 'string' || !value.rootETag || value.rootETag.length > 256 || /[\r\n]/.test(value.rootETag) || !iso(value.visibleAt)) fail(503, 'DISTRIBUTION_RECEIPT');
  return { authorityId: value.authorityId, generation: value.generation, operationId: value.operationId, operationDigest: value.operationDigest, payloadDigest: value.payloadDigest, rootDigest: value.rootDigest, rootETag: value.rootETag, visibleAt: value.visibleAt };
}
// The release a publish payload describes is part of that same frozen payload
// (envelope.runtime.ordinal), so the log row needs no second caller-supplied
// identity. Absent runtime means a synthetic/transport-only publish and writes
// no log row; a present but malformed runtime is rejected, never guessed.
function releaseVersionOf(envelope) {
  const runtime = envelope.runtime;
  if (runtime === undefined) return null;
  if (!runtime || typeof runtime !== 'object' || Array.isArray(runtime) || !ordinal(runtime.ordinal)) fail(422, 'DISTRIBUTION_OPERATION');
  return runtime.ordinal;
}
function descriptor(authorityId, row) {
  return { version: 1, authorityId, generation: row.generation, operationId: row.operation_id, kind: row.kind, gameId: row.game_id, payloadDigest: row.payload_digest, previousDigest: row.previous_digest, createdAt: row.created_at };
}
// Product retirement-checkpoint pin (stage-1, kind fixed as retirement-checkpoint
// v1 carrying the stage-0 prototype shape). A checkpoint is a NEW object with its
// own digest, never a reused operation digest; validation is metadata-only.
function checkpointDigestOf(authorityId, generations, anchorDigest) {
  return sha(JSON.stringify({ version: 1, authorityId, retiredGenerations: [...generations].sort((a, b) => a - b), anchorDigest }));
}

export class FrozenDistributionLedger {
  #storage; #sql; #verifyReceipt;
  constructor({ storage, authorityId, verifyReceipt }) {
    if (!storage?.sql || typeof storage.transactionSync !== 'function' || typeof verifyReceipt !== 'function' || verifyReceipt.constructor?.name === 'AsyncFunction') throw new TypeError('same SQLite and synchronous trusted receipt verifier required');
    if (authorityId !== undefined && !uuid(authorityId)) throw new TypeError('authority UUID required');
    this.#storage = storage; this.#sql = storage.sql; this.#verifyReceipt = verifyReceipt;
    storage.transactionSync(() => {
      this.#sql.exec("CREATE TABLE IF NOT EXISTS content_distribution_state (singleton INTEGER PRIMARY KEY CHECK(singleton=1), authority_id TEXT NOT NULL, tail_generation INTEGER NOT NULL CHECK(tail_generation>=0), tail_digest TEXT, confirmed_generation INTEGER NOT NULL CHECK(confirmed_generation>=0), confirmed_digest TEXT, blocked_reason TEXT, version INTEGER NOT NULL CHECK(version=1))");
      this.#sql.exec("CREATE TABLE IF NOT EXISTS content_distribution_events (generation INTEGER PRIMARY KEY CHECK(generation>0), operation_id TEXT NOT NULL UNIQUE, kind TEXT NOT NULL, game_id TEXT, previous_digest TEXT, operation_digest TEXT NOT NULL, payload_digest TEXT NOT NULL, payload_length INTEGER NOT NULL, chunk_count INTEGER NOT NULL, created_at TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('pending','confirmed')), attempts INTEGER NOT NULL CHECK(attempts>=0), confirmed_at TEXT, receipt_json TEXT)");
      this.#sql.exec("CREATE TABLE IF NOT EXISTS content_distribution_chunks (generation INTEGER NOT NULL REFERENCES content_distribution_events(generation), part INTEGER NOT NULL CHECK(part>=0), bytes BLOB NOT NULL, PRIMARY KEY(generation,part))");
      this.#sql.exec("CREATE TABLE IF NOT EXISTS content_distribution_checkpoints (checkpoint_digest TEXT PRIMARY KEY, authority_id TEXT NOT NULL, retired_generations TEXT NOT NULL, anchor_digest TEXT NOT NULL, created_at TEXT NOT NULL)");
      this.#sql.exec("CREATE TABLE IF NOT EXISTS content_distribution_cleanup (checkpoint_digest TEXT PRIMARY KEY, retired_generations TEXT NOT NULL, deleted_generations TEXT NOT NULL DEFAULT '[]', state TEXT NOT NULL CHECK(state IN ('in-progress','completed')), started_at TEXT NOT NULL, completed_at TEXT)");
      this.#sql.exec("CREATE TABLE IF NOT EXISTS content_distribution_enqueue_barrier (singleton INTEGER PRIMARY KEY CHECK(singleton=1), paused INTEGER NOT NULL CHECK(paused IN (0,1)))");
      // 發布日誌（A 路線）：每次上架一条，digest 就是該代次的 operation digest。
      // 只記錄、不參與 ledger 的尾/確認代次不變量，也不是任何可見性證明。
      this.#sql.exec("CREATE TABLE IF NOT EXISTS game_releases (game_id TEXT NOT NULL, version TEXT NOT NULL, digest TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('pending','confirmed')), published_at TEXT, PRIMARY KEY(game_id,version))");
      if (!this.#one('SELECT singleton FROM content_distribution_enqueue_barrier WHERE singleton=1')) this.#sql.exec('INSERT INTO content_distribution_enqueue_barrier(singleton,paused) VALUES(1,0)');
      const existing = this.#one('SELECT authority_id FROM content_distribution_state WHERE singleton=1');
      if (existing && authorityId !== undefined && existing.authority_id !== authorityId) fail(503, 'DISTRIBUTION_AUTHORITY_CHANGED');
      if (!existing) this.#sql.exec('INSERT INTO content_distribution_state(singleton,authority_id,tail_generation,tail_digest,confirmed_generation,confirmed_digest,blocked_reason,version) VALUES(1,?,0,NULL,0,NULL,NULL,1)', authorityId ?? randomUUID());
      this.#state();
    });
  }
  #one(query, ...values) { return this.#sql.exec(query, ...values).toArray()[0]; }
  #barrierPaused() {
    const barrier = this.#one('SELECT paused FROM content_distribution_enqueue_barrier WHERE singleton=1');
    requireRecord(barrier && (barrier.paused === 0 || barrier.paused === 1));
    return barrier.paused === 1;
  }
  // Latest pin covering a generation, or null. Pins are unioned; the newest
  // covering pin names the checkpointDigest of the retired credential.
  #retiredPin(generation) {
    const pins = this.#sql.exec('SELECT checkpoint_digest, retired_generations FROM content_distribution_checkpoints ORDER BY rowid DESC').toArray();
    for (const pin of pins) {
      let generations;
      try { generations = JSON.parse(pin.retired_generations); } catch { fail(503, 'DISTRIBUTION_LEDGER_CORRUPT'); }
      requireRecord(Array.isArray(generations));
      if (generations.includes(generation)) return pin.checkpoint_digest;
    }
    return null;
  }
  #metadata(row, state) {
    requireRecord(row && Number.isSafeInteger(row.generation) && row.generation > 0 && uuid(row.operation_id) && kinds.has(row.kind));
    requireRecord(row.kind === 'bootstrap' ? row.game_id === null && row.generation === 1 : uuid(row.game_id));
    requireRecord((row.generation === 1 ? row.previous_digest === null : digest(row.previous_digest)) && digest(row.operation_digest) && digest(row.payload_digest));
    requireRecord(Number.isSafeInteger(row.payload_length) && row.payload_length > 0 && row.payload_length <= DISTRIBUTION_PAYLOAD_LIMIT && row.chunk_count === Math.ceil(row.payload_length / DISTRIBUTION_CHUNK_BYTES));
    requireRecord(iso(row.created_at) && ['pending', 'confirmed'].includes(row.state) && integer(row.attempts));
    requireRecord(row.generation <= state.tail_generation && (row.state === 'confirmed') === (row.generation <= state.confirmed_generation));
    requireRecord(row.state === 'pending' ? row.confirmed_at === null && row.receipt_json === null : iso(row.confirmed_at) && typeof row.receipt_json === 'string');
    const value = descriptor(state.authority_id, row);
    requireRecord(sha(JSON.stringify(value)) === row.operation_digest);
    if (row.state === 'confirmed') {
      try { requireRecord(JSON.stringify(receiptFields(JSON.parse(row.receipt_json), value, row.operation_digest)) === row.receipt_json); }
      catch { fail(503, 'DISTRIBUTION_LEDGER_CORRUPT'); }
    }
    return value;
  }
  #state() {
    const state = this.#one('SELECT * FROM content_distribution_state WHERE singleton=1');
    requireRecord(state && state.version === 1 && uuid(state.authority_id) && integer(state.tail_generation) && integer(state.confirmed_generation) && state.confirmed_generation <= state.tail_generation);
    requireRecord(state.tail_generation === 0 ? state.tail_digest === null : digest(state.tail_digest));
    requireRecord(state.confirmed_generation === 0 ? state.confirmed_digest === null : digest(state.confirmed_digest));
    requireRecord(state.blocked_reason === null || blocks.has(state.blocked_reason));
    const extent = this.#one('SELECT COUNT(*) AS n,MIN(generation) AS lo,MAX(generation) AS hi FROM content_distribution_events');
    requireRecord(extent.n === state.tail_generation && (state.tail_generation === 0 ? extent.lo === null && extent.hi === null : extent.lo === 1 && extent.hi === state.tail_generation));
    for (const [generation, hash, confirmed] of [[state.tail_generation, state.tail_digest, false], [state.confirmed_generation, state.confirmed_digest, true]]) if (generation > 0) {
      const row = this.#one('SELECT * FROM content_distribution_events WHERE generation=?', generation);
      this.#metadata(row, state); requireRecord(row.operation_digest === hash && (!confirmed || row.state === 'confirmed'));
    }
    return state;
  }
  status() {
    return this.#storage.transactionSync(() => {
      const s = this.#state();
      return Object.freeze({ authorityId: s.authority_id, tailGeneration: s.tail_generation, tailDigest: s.tail_digest, confirmedGeneration: s.confirmed_generation, confirmedDigest: s.confirmed_digest, blockedReason: s.blocked_reason, enqueuePaused: this.#barrierPaused() });
    });
  }
  // Metadata-only observation of one exact operation. Callers own ACL checks.
  // Confirmed means a historical root/readback was confirmed, NOT that this
  // game is currently listed or that this operation is still the remote head.
  operationStatus(gameId, operationId) {
    if (!uuid(gameId) || !uuid(operationId)) fail(422, 'DISTRIBUTION_OPERATION');
    return this.#storage.transactionSync(() => {
      const state = this.#state();
      const row = this.#one('SELECT * FROM content_distribution_events WHERE operation_id=? AND game_id=?', operationId, gameId);
      if (!row) fail(404, 'DISTRIBUTION_UNKNOWN');
      this.#metadata(row, state);
      let receipt = null;
      if (row.receipt_json !== null) {
        try { receipt = JSON.parse(row.receipt_json); }
        catch { fail(503, 'DISTRIBUTION_LEDGER_CORRUPT'); }
      }
      return Object.freeze({ gameId, operationId, generation: row.generation, kind: row.kind, state: row.state, visibleAt: receipt?.visibleAt ?? null, releaseDigest: row.kind === 'publish' ? this.#releaseDigestOf(row.game_id, row.operation_digest) : null, recoveryRequired: state.blocked_reason !== null });
    });
  }
  // publish 對應的 release 身分：用同一個 operation digest 精確匹對。listing／
  // restriction 等不想發布 release 的事件回 null——該代次的 release 身分寫在
  // 管理回執裡（提交時定格），不隨後來的新 release 遷移。
  #releaseDigestOf(gameId, operationDigest) {
    const log = this.#one('SELECT digest FROM game_releases WHERE game_id=? AND digest=?', gameId, operationDigest);
    return log ? log.digest : null;
  }
  // 運维/管理側發佈日誌（唯讀）：每次上架一条，最新的在最後。
  releaseLog(gameId) {
    if (!uuid(gameId)) fail(422, 'DISTRIBUTION_GAME');
    return this.#storage.transactionSync(() => this.#state() && Object.freeze(this.#sql.exec('SELECT game_id,version,digest,state,published_at FROM game_releases WHERE game_id=? ORDER BY rowid', gameId).toArray().map(row => Object.freeze({ gameId: row.game_id, version: row.version, digest: row.digest, state: row.state, publishedAt: row.published_at }))));
  }
  // No automatic unblock API: a remote-ahead/foreign/missing root needs recovery.
  block(reason) {
    if (!blocks.has(reason)) fail(422, 'DISTRIBUTION_BLOCK_REASON');
    return this.#storage.transactionSync(() => {
      this.#state(); this.#sql.exec('UPDATE content_distribution_state SET blocked_reason=COALESCE(blocked_reason,?) WHERE singleton=1', reason);
      return this.status();
    });
  }
  pendingForGame(gameId) {
    if (!uuid(gameId)) fail(422, 'DISTRIBUTION_GAME');
    return this.#storage.transactionSync(() => { this.#state(); return !!this.#one("SELECT generation FROM content_distribution_events WHERE game_id=? AND state='pending' LIMIT 1", gameId); });
  }
  // Short global distribution barrier (stage-1, approved semantics): pause NEW
  // enqueue only. Reads, next(), confirm and recovery locks are unchanged;
  // failures keep REMOTE_AHEAD/REMOTE_GAP behavior, no new auto-unlock.
  pauseEnqueue() {
    return this.#storage.transactionSync(() => {
      this.#state(); this.#sql.exec('UPDATE content_distribution_enqueue_barrier SET paused=1 WHERE singleton=1');
      return this.status();
    });
  }
  resumeEnqueue() {
    return this.#storage.transactionSync(() => {
      this.#state(); this.#sql.exec('UPDATE content_distribution_enqueue_barrier SET paused=0 WHERE singleton=1');
      return this.status();
    });
  }
  // Pin a retirement checkpoint over CONFIRMED history only. Retired
  // generations keep their metadata chain; chunks may be cleaned later.
  // Ambient transaction required, same as enqueueInTxn.
  retireCheckpointInTxn({ retiredGenerations, anchorDigest }) {
    if (!Array.isArray(retiredGenerations) || retiredGenerations.length < 1 || !retiredGenerations.every(g => Number.isSafeInteger(g) && g >= 1) || new Set(retiredGenerations).size !== retiredGenerations.length || !digest(anchorDigest)) fail(422, 'DISTRIBUTION_CHECKPOINT');
    const state = this.#state(), generations = [...retiredGenerations].sort((a, b) => a - b);
    // A recovery lock blocks retirement too: remote-ahead/foreign/missing must
    // keep existing locks, never retire around them. Barrier pause alone does
    // not block checkpointing (the pin is written during the barrier).
    if (state.blocked_reason !== null) fail(503, 'DISTRIBUTION_RECOVERY_REQUIRED');
    if (generations.some(g => g > state.confirmed_generation)) fail(409, 'DISTRIBUTION_NOT_CONFIRMED');
    if (!this.#one('SELECT generation FROM content_distribution_events WHERE operation_digest=?', anchorDigest)) fail(409, 'DISTRIBUTION_CHECKPOINT_CONFLICT');
    const checkpointDigest = checkpointDigestOf(state.authority_id, generations, anchorDigest);
    if (this.#one('SELECT generation FROM content_distribution_events WHERE operation_digest=?', checkpointDigest) || this.#one('SELECT checkpoint_digest FROM content_distribution_checkpoints WHERE checkpoint_digest=?', checkpointDigest)) fail(409, 'DISTRIBUTION_CHECKPOINT_CONFLICT');
    const createdAt = new Date().toISOString();
    this.#sql.exec('INSERT INTO content_distribution_checkpoints(checkpoint_digest,authority_id,retired_generations,anchor_digest,created_at) VALUES(?,?,?,?,?)', checkpointDigest, state.authority_id, JSON.stringify(generations), anchorDigest, createdAt);
    return Object.freeze({ kind: 'retirement-checkpoint', version: 1, authorityId: state.authority_id, retiredGenerations: Object.freeze(generations), anchorDigest, checkpointDigest, createdAt });
  }
  // Execute retired-payload cleanup with durable progress. Chunks of retired
  // generations are deleted; metadata rows and pins are never touched.
  // Idempotent per generation: repeated or overlapping calls converge on the
  // union. No barrier gate here (retired generations are immutable); the
  // production procedure still runs cleanup under the barrier. Ambient txn.
  cleanRetiredChunksInTxn({ checkpointDigest, generations }) {
    if (!digest(checkpointDigest) || !Array.isArray(generations) || generations.length < 1 || !generations.every(g => Number.isSafeInteger(g) && g >= 1) || new Set(generations).size !== generations.length) fail(422, 'DISTRIBUTION_CLEANUP');
    void this.#state(); // Validate the full chain before mutating retired history.
    const pin = this.#one('SELECT retired_generations FROM content_distribution_checkpoints WHERE checkpoint_digest=?', checkpointDigest);
    if (!pin) fail(404, 'DISTRIBUTION_CHECKPOINT');
    let retired;
    try { retired = JSON.parse(pin.retired_generations); } catch { fail(503, 'DISTRIBUTION_LEDGER_CORRUPT'); }
    const targets = [...generations].sort((a, b) => a - b);
    if (targets.some(g => !retired.includes(g))) fail(409, 'DISTRIBUTION_NOT_RETIRED');
    let row = this.#one('SELECT deleted_generations, state, started_at FROM content_distribution_cleanup WHERE checkpoint_digest=?', checkpointDigest);
    if (!row) {
      const startedAt = new Date().toISOString();
      this.#sql.exec("INSERT INTO content_distribution_cleanup(checkpoint_digest,retired_generations,deleted_generations,state,started_at,completed_at) VALUES(?,?,'[]','in-progress',?,NULL)", checkpointDigest, JSON.stringify(retired), startedAt);
      row = { deleted_generations: '[]', state: 'in-progress', started_at: startedAt };
    }
    let deleted;
    try { deleted = JSON.parse(row.deleted_generations); } catch { fail(503, 'DISTRIBUTION_LEDGER_CORRUPT'); }
    for (const generation of targets) this.#sql.exec('DELETE FROM content_distribution_chunks WHERE generation=?', generation);
    const union = [...new Set([...deleted, ...targets])].sort((a, b) => a - b);
    this.#sql.exec('UPDATE content_distribution_cleanup SET deleted_generations=? WHERE checkpoint_digest=?', JSON.stringify(union), checkpointDigest);
    const remaining = retired.filter(g => !union.includes(g));
    return Object.freeze({ checkpointDigest, retiredGenerations: Object.freeze([...retired]), deletedGenerations: Object.freeze(union), remainingGenerations: Object.freeze(remaining), state: row.state, startedAt: row.started_at });
  }
  // Close out a cleanup: verify every retired generation is actually missing
  // (readback, not trust) while every retained generation keeps full chunks
  // and all retired metadata rows survive. Mid-failure stays in-progress;
  // a damaged retained body fails loud as corruption, never as complete.
  completeRetiredCleanupInTxn({ checkpointDigest }) {
    if (!digest(checkpointDigest)) fail(422, 'DISTRIBUTION_CLEANUP');
    void this.#state(); // Validate the full chain before closing out retired history.
    const pin = this.#one('SELECT retired_generations FROM content_distribution_checkpoints WHERE checkpoint_digest=?', checkpointDigest);
    if (!pin) fail(404, 'DISTRIBUTION_CHECKPOINT');
    let retired;
    try { retired = JSON.parse(pin.retired_generations); } catch { fail(503, 'DISTRIBUTION_LEDGER_CORRUPT'); }
    const row = this.#one('SELECT state, started_at FROM content_distribution_cleanup WHERE checkpoint_digest=?', checkpointDigest);
    if (!row) fail(409, 'DISTRIBUTION_CLEANUP_INCOMPLETE');
    for (const generation of retired) {
      const missing = this.#one('SELECT COUNT(*) AS n FROM content_distribution_chunks WHERE generation=?', generation);
      if (missing.n !== 0) fail(409, 'DISTRIBUTION_CLEANUP_INCOMPLETE');
      if (!this.#one('SELECT generation FROM content_distribution_events WHERE generation=?', generation)) fail(503, 'DISTRIBUTION_LEDGER_CORRUPT');
    }
    const live = this.#sql.exec('SELECT generation, chunk_count FROM content_distribution_events').toArray();
    // Retained means retired by no pin at all: generations retired under other
    // pins are exempt here (their own completion covers them), everything else
    // must keep full chunks or the close-out fails loud as corruption.
    const everyPin = this.#sql.exec('SELECT retired_generations FROM content_distribution_checkpoints').toArray();
    const globallyRetired = new Set();
    for (const other of everyPin) {
      let covered;
      try { covered = JSON.parse(other.retired_generations); } catch { fail(503, 'DISTRIBUTION_LEDGER_CORRUPT'); }
      requireRecord(Array.isArray(covered));
      for (const generation of covered) globallyRetired.add(generation);
    }
    let verifiedRetained = 0;
    for (const event of live) {
      if (globallyRetired.has(event.generation)) continue;
      const kept = this.#one('SELECT COUNT(*) AS n FROM content_distribution_chunks WHERE generation=?', event.generation);
      requireRecord(kept.n === event.chunk_count);
      verifiedRetained++;
    }
    const completedAt = new Date().toISOString();
    this.#sql.exec("UPDATE content_distribution_cleanup SET state='completed',completed_at=? WHERE checkpoint_digest=?", completedAt, checkpointDigest);
    return Object.freeze({ checkpointDigest, retiredGenerations: Object.freeze([...retired]), verifiedRetired: retired.length, verifiedRetained, completedAt });
  }
  // Ambient transaction required to join release/pin/ordinal/current snapshot.
  enqueueInTxn({ operationId, kind, gameId = null, payload }) {
    if (!uuid(operationId) || !kinds.has(kind) || (kind === 'bootstrap' ? gameId !== null : !uuid(gameId))) fail(422, 'DISTRIBUTION_OPERATION');
    const parsed = payloadBytes(payload), bytes = parsed.bytes, payloadDigest = sha(bytes), state = this.#state();
    const releaseVersion = kind === 'publish' ? releaseVersionOf(parsed.envelope) : null;
    if (state.blocked_reason !== null) fail(503, 'DISTRIBUTION_RECOVERY_REQUIRED');
    if (this.#barrierPaused()) fail(503, 'DISTRIBUTION_ENQUEUE_PAUSED');
    const prior = this.#one('SELECT * FROM content_distribution_events WHERE operation_id=?', operationId);
    if (prior) {
      const identity = this.#metadata(prior, state);
      if (prior.kind !== kind || prior.game_id !== gameId || prior.payload_digest !== payloadDigest) fail(409, 'DISTRIBUTION_OPERATION_CONFLICT');
      const pin = this.#retiredPin(prior.generation);
      if (pin) return Object.freeze({ ...identity, operationDigest: prior.operation_digest, deduped: true, retired: true, checkpointDigest: pin });
      this.#payload(prior);
      return Object.freeze({ ...identity, operationDigest: prior.operation_digest, deduped: true });
    }
    if (kind === 'publish' && this.#one("SELECT generation FROM content_distribution_events WHERE game_id=? AND state='pending' LIMIT 1", gameId)) fail(409, 'DISTRIBUTION_GAME_PENDING');
    if (state.tail_generation >= Number.MAX_SAFE_INTEGER || kind === 'bootstrap' && state.tail_generation !== 0) fail(409, 'DISTRIBUTION_GENERATION');
    const row = { generation: state.tail_generation + 1, operation_id: operationId, kind, game_id: gameId, previous_digest: state.tail_digest, payload_digest: payloadDigest, created_at: new Date().toISOString() };
    const identity = descriptor(state.authority_id, row), operationDigest = sha(JSON.stringify(identity));
    const count = Math.ceil(bytes.length / DISTRIBUTION_CHUNK_BYTES);
    if (releaseVersion !== null) {
      // One release, one durable log row. A different operation claiming the same
      // (game,version) is a replay/identity conflict, never a silent overwrite.
      const logged = this.#one('SELECT digest,state,published_at FROM game_releases WHERE game_id=? AND version=?', gameId, releaseVersion);
      if (logged) requireRecord(logged.digest === operationDigest && logged.state === 'pending' && logged.published_at === null);
      else this.#sql.exec("INSERT INTO game_releases(game_id,version,digest,state,published_at) VALUES(?,?,?,'pending',NULL)", gameId, releaseVersion, operationDigest);
    }
    this.#sql.exec("INSERT INTO content_distribution_events(generation,operation_id,kind,game_id,previous_digest,operation_digest,payload_digest,payload_length,chunk_count,created_at,state,attempts,confirmed_at,receipt_json) VALUES(?,?,?,?,?,?,?,?,?,?,'pending',0,NULL,NULL)", row.generation, operationId, kind, gameId, state.tail_digest, operationDigest, payloadDigest, bytes.length, count, row.created_at);
    for (let part = 0; part < count; part++) this.#sql.exec('INSERT INTO content_distribution_chunks(generation,part,bytes) VALUES(?,?,?)', row.generation, part, new Uint8Array(bytes.subarray(part * DISTRIBUTION_CHUNK_BYTES, (part + 1) * DISTRIBUTION_CHUNK_BYTES)));
    this.#sql.exec('UPDATE content_distribution_state SET tail_generation=?,tail_digest=? WHERE singleton=1 AND tail_generation=? AND tail_digest IS ?', row.generation, operationDigest, state.tail_generation, state.tail_digest);
    requireRecord(this.#one('SELECT changes() AS n').n === 1);
    return Object.freeze({ ...identity, operationDigest, deduped: false });
  }
  #payload(row) {
    const parts = this.#sql.exec('SELECT part,bytes FROM content_distribution_chunks WHERE generation=? ORDER BY part', row.generation).toArray();
    requireRecord(parts.length === row.chunk_count);
    const buffers = parts.map((part, i) => {
      requireRecord(part.part === i && (part.bytes instanceof ArrayBuffer || part.bytes instanceof Uint8Array));
      const bytes = Buffer.from(part.bytes);
      requireRecord(bytes.length === Math.min(DISTRIBUTION_CHUNK_BYTES, row.payload_length - i * DISTRIBUTION_CHUNK_BYTES));
      return bytes;
    });
    const bytes = Buffer.concat(buffers);
    requireRecord(bytes.length === row.payload_length && sha(bytes) === row.payload_digest);
    try { payloadBytes(bytes); } catch { fail(503, 'DISTRIBUTION_LEDGER_CORRUPT'); }
    return new Uint8Array(bytes);
  }
  next() {
    return this.#storage.transactionSync(() => {
      const state = this.#state();
      if (state.blocked_reason !== null) fail(503, 'DISTRIBUTION_RECOVERY_REQUIRED');
      if (state.confirmed_generation === state.tail_generation) return null;
      const row = this.#one('SELECT * FROM content_distribution_events WHERE generation=?', state.confirmed_generation + 1);
      const identity = this.#metadata(row, state);
      requireRecord(row.state === 'pending' && row.previous_digest === state.confirmed_digest);
      return Object.freeze({ ...identity, operationDigest: row.operation_digest, attempts: row.attempts, payload: this.#payload(row) });
    });
  }
  // Read an exact retained operation for head reconciliation, not a current-game
  // reconstruction. Read-only inspection remains available under a recovery lock.
  entry(generation) {
    if (!Number.isSafeInteger(generation) || generation < 1) fail(422, 'DISTRIBUTION_GENERATION');
    return this.#storage.transactionSync(() => {
      const state = this.#state(), row = this.#one('SELECT * FROM content_distribution_events WHERE generation=?', generation);
      if (!row) fail(404, 'DISTRIBUTION_UNKNOWN');
      const identity = this.#metadata(row, state);
      if (generation > 1) {
        const prior = this.#one('SELECT * FROM content_distribution_events WHERE generation=?', generation - 1);
        this.#metadata(prior, state); requireRecord(row.previous_digest === prior.operation_digest);
      }
      let receipt = null;
      if (row.receipt_json !== null) {
        try { receipt = Object.freeze(JSON.parse(row.receipt_json)); }
        catch { fail(503, 'DISTRIBUTION_LEDGER_CORRUPT'); }
      }
      // Retired generations return the minimal identity credential from
      // metadata only. Chunks are never touched; a missing body must not
      // fail this branch. Retained generations keep the strict chunk path.
      const pin = this.#retiredPin(generation);
      if (pin) return Object.freeze({ ...identity, operationDigest: row.operation_digest, attempts: row.attempts, state: row.state, receipt, retired: true, checkpointDigest: pin });
      return Object.freeze({ ...identity, operationDigest: row.operation_digest, attempts: row.attempts, state: row.state, receipt, payload: this.#payload(row) });
    });
  }
  noteAttemptInTxn(operationId) {
    const next = this.next();
    if (!next || next.operationId !== operationId || next.attempts >= Number.MAX_SAFE_INTEGER) fail(409, 'DISTRIBUTION_ORDER');
    this.#sql.exec('UPDATE content_distribution_events SET attempts=attempts+1 WHERE operation_id=?', operationId);
  }
  confirmInTxn(operationId, receipt) {
    const state = this.#state(), row = this.#one('SELECT * FROM content_distribution_events WHERE operation_id=?', operationId);
    if (!row) fail(404, 'DISTRIBUTION_UNKNOWN');
    const identity = this.#metadata(row, state);
    // The verifier must authenticate a server-owned readback capability. Merely
    // parsing receipt fields is not sufficient and no default verifier exists.
    const value = this.#verifyReceipt(receipt, Object.freeze({ ...identity, operationDigest: row.operation_digest }));
    const saved = receiptFields(value, identity, row.operation_digest);
    const text = JSON.stringify(saved);
    if (row.state === 'confirmed') {
      if (row.receipt_json !== text) fail(409, 'DISTRIBUTION_RECEIPT_CONFLICT');
      return Object.freeze({ ...saved, deduped: true });
    }
    if (state.blocked_reason !== null) fail(503, 'DISTRIBUTION_RECOVERY_REQUIRED');
    if (row.generation !== state.confirmed_generation + 1 || row.previous_digest !== state.confirmed_digest) fail(409, 'DISTRIBUTION_ORDER');
    this.#payload(row);
    this.#sql.exec("UPDATE content_distribution_events SET state='confirmed',confirmed_at=?,receipt_json=? WHERE operation_id=? AND state='pending'", new Date().toISOString(), text, operationId);
    requireRecord(this.#one('SELECT changes() AS n').n === 1);
    this.#sql.exec('UPDATE content_distribution_state SET confirmed_generation=?,confirmed_digest=? WHERE singleton=1 AND confirmed_generation=? AND confirmed_digest IS ?', row.generation, row.operation_digest, state.confirmed_generation, state.confirmed_digest);
    requireRecord(this.#one('SELECT changes() AS n').n === 1);
    // The log row follows its publishing generation: confirmed only here, and
    // only with the readback time the receipt itself carries.
    const logged = row.kind === 'publish' ? this.#one("SELECT state FROM game_releases WHERE game_id=? AND digest=?", row.game_id, row.operation_digest) : null;
    if (logged) {
      requireRecord(logged.state === 'pending');
      this.#sql.exec("UPDATE game_releases SET state='confirmed',published_at=? WHERE game_id=? AND digest=? AND state='pending'", saved.visibleAt, row.game_id, row.operation_digest);
      requireRecord(this.#one('SELECT changes() AS n').n === 1);
    }
    return Object.freeze({ ...saved, deduped: false });
  }
}
