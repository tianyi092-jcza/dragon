// Durable stage records only. No compiler, runtime certificate or release commit is installed here.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { canonicalSourceTokens } from '../web/src/content/authoring/sourcejson.js';
import { fail, fields } from './security.js';
const digest = text => createHash('sha256').update(text).digest('hex');
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const revision = value => typeof value === 'string' && /^[1-9][0-9]*$/.test(value);
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function canonical(value) {
  let text = '';
  try { for (const token of canonicalSourceTokens(value)) { text += token; if (text.length > 65536) fail(413, 'JOB_RECORD_BUDGET'); } }
  catch (error) { if (error.status) throw error; fail(422, 'JOB_RECORD'); }
  if (new TextEncoder().encode(text).length > 65536) fail(413, 'JOB_RECORD_BUDGET');
  return text;
}
function parse(text) { try { return JSON.parse(text); } catch (cause) { throw new Error('invalid persisted job record', { cause }); } }
function outputs(values) {
  if (!Array.isArray(values) || values.length > 128) fail(422, 'JOB_OUTPUTS');
  const captured = parse(canonical(values)), seen = new Set();
  for (const item of captured) {
    fields(item, ['assetId', 'sha256', 'byteLength']);
    if (typeof item.assetId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(item.assetId) || seen.has(item.assetId) || !hash(item.sha256) || !Number.isSafeInteger(item.byteLength) || item.byteLength < 1 || item.byteLength > 4 * 1024 * 1024) fail(422, 'JOB_OUTPUT');
    seen.add(item.assetId);
  }
  return captured;
}
function summary(row) {
  return { operationId: row.job_id, gameId: row.game_id, draftRevision: row.draft_revision, scope: row.scope,
    compilerRevision: row.compiler_revision, profileRevision: row.profile_revision, state: row.state,
    stage: row.stage_cursor, attempt: row.attempt, rowRevision: row.row_revision,
    checkpoint: parse(row.checkpoint_json), failureCode: row.failure_code, retryable: Boolean(row.retryable),
    createdAt: row.created_at, updatedAt: row.updated_at };
}
export class CompileJobs {
  #storage; #sql; #principal; #metadata; #verify; #compiler; #profile; #stages; #pipeline; #leaseMs; #leases = new WeakSet();
  constructor({ storage, principal, metadata, verifyCheckpoint, compilerRevision, profileRevision,
    stages = ['validate', 'compile', 'assemble'], leaseMs = 60000 }) {
    if (!storage?.sql || typeof principal !== 'function' || typeof metadata?.snapshotReference !== 'function') throw new TypeError('actual SQL, principal and saved snapshot authority required');
    if (![compilerRevision, profileRevision].every(v => typeof v === 'string' && /^[a-zA-Z0-9_.-]{1,128}$/.test(v)) || !Array.isArray(stages) || stages.length < 1 || stages.length > 16 || stages.some(v => typeof v !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(v)) || new Set(stages).size !== stages.length || !Number.isSafeInteger(leaseMs) || leaseMs < 1 || leaseMs > 300000) throw new TypeError('finite trusted pipeline configuration required');
    this.#storage = storage; this.#sql = storage.sql; this.#principal = principal; this.#metadata = metadata; this.#verify = verifyCheckpoint;
    this.#compiler = compilerRevision; this.#profile = profileRevision; this.#stages = Object.freeze([...stages]); this.#leaseMs = leaseMs;
    this.#pipeline = digest(canonical({ compilerRevision, profileRevision, stages: this.#stages }));
    storage.transactionSync(() => {
      this.#sql.exec('CREATE TABLE IF NOT EXISTS compile_jobs (job_id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, auth_epoch INTEGER NOT NULL, game_id TEXT NOT NULL, draft_revision TEXT NOT NULL, root_key TEXT NOT NULL, source_digest TEXT NOT NULL, dependency_digest TEXT NOT NULL, scope TEXT NOT NULL, compiler_revision TEXT NOT NULL, profile_revision TEXT NOT NULL, pipeline_digest TEXT NOT NULL, state TEXT NOT NULL, stage_cursor INTEGER NOT NULL, attempt INTEGER NOT NULL, generation INTEGER NOT NULL, lease_hash TEXT, lease_until INTEGER NOT NULL, row_revision TEXT NOT NULL, checkpoint_json TEXT NOT NULL, failure_code TEXT, retryable INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)');
      this.#sql.exec('CREATE TABLE IF NOT EXISTS compile_operations (actor_id TEXT NOT NULL, op_key TEXT NOT NULL, method TEXT NOT NULL, request_digest TEXT NOT NULL, job_id TEXT NOT NULL, PRIMARY KEY(actor_id,op_key))');
    });
  }
  #one(query, ...args) { return this.#sql.exec(query, ...args).toArray()[0]; }
  #actor(tokenHash) { const actor = this.#principal(tokenHash); if (actor.must_change) fail(403, 'PASSWORD_CHANGE_REQUIRED'); return actor; }
  #owned(tokenHash, id) {
    const actor = this.#actor(tokenHash);
    if (!uuid(id)) fail(422, 'JOB_ID'); // SQL binding must not coerce [realId] into an identity.
    const row = this.#one('SELECT * FROM compile_jobs WHERE job_id=?', id);
    if (!row || row.actor_id !== actor.id) fail(404, 'JOB_NOT_FOUND');
    if (row.auth_epoch !== actor.epoch) fail(409, 'JOB_AUTH_REVOKED');
    const reference = this.#metadata.snapshotReference(tokenHash, row.game_id, row.draft_revision);
    if (reference.rootKey !== row.root_key || reference.sourceDigest !== row.source_digest || reference.dependencyDigest !== row.dependency_digest) fail(409, 'JOB_SNAPSHOT_CHANGED');
    return row;
  }
  #compatible(row) { if (row.compiler_revision !== this.#compiler || row.profile_revision !== this.#profile || row.pipeline_digest !== this.#pipeline) fail(409, 'JOB_PIPELINE_CHANGED'); }
  #cas(row, expected) { if (!revision(expected) || row.row_revision !== expected) fail(409, 'JOB_CHANGED'); }
  #key(key) { if (typeof key !== 'string' || !/^[a-zA-Z0-9_-]{16,128}$/.test(key)) fail(422, 'JOB_OPERATION_KEY'); }
  #operation(actor, key, method, requestDigest) {
    this.#key(key); const old = this.#one('SELECT * FROM compile_operations WHERE actor_id=? AND op_key=?', actor.id, key);
    if (old && (old.method !== method || old.request_digest !== requestDigest)) fail(409, 'IDEMPOTENCY_CONFLICT');
    return old;
  }
  #touch(row, changes) {
    const next = { ...row, ...changes, row_revision: String(BigInt(row.row_revision) + 1n), updated_at: new Date().toISOString() };
    this.#sql.exec('UPDATE compile_jobs SET state=?,stage_cursor=?,attempt=?,generation=?,lease_hash=?,lease_until=?,row_revision=?,checkpoint_json=?,failure_code=?,retryable=?,updated_at=? WHERE job_id=?', next.state, next.stage_cursor, next.attempt, next.generation, next.lease_hash, next.lease_until, next.row_revision, next.checkpoint_json, next.failure_code, next.retryable, next.updated_at, next.job_id);
    return next;
  }
  enqueue(tokenHash, input) {
    input = parse(canonical(input)); fields(input, ['key', 'gameId', 'draftRevision', 'scope']);
    if (!uuid(input.gameId) && input.gameId !== 'wolong-builtin') fail(422, 'JOB_GAME_ID');
    if (input.scope !== 'all' || !revision(input.draftRevision)) fail(422, 'JOB_SCOPE');
    const requestDigest = digest(canonical({ method: 'enqueue', gameId: input.gameId, draftRevision: input.draftRevision, scope: input.scope, pipeline: this.#pipeline }));
    return this.#storage.transactionSync(() => {
      const actor = this.#actor(tokenHash), reference = this.#metadata.snapshotReference(tokenHash, input.gameId, input.draftRevision);
      const old = this.#operation(actor, input.key, 'enqueue', requestDigest); if (old) return summary(this.#owned(tokenHash, old.job_id));
      const time = new Date().toISOString(), id = randomUUID();
      this.#sql.exec('INSERT INTO compile_jobs VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', id, actor.id, actor.epoch, reference.gameId, reference.draftRevision, reference.rootKey, reference.sourceDigest, reference.dependencyDigest, 'all', this.#compiler, this.#profile, this.#pipeline, 'queued', 0, 0, 0, null, 0, '1', '[]', null, 0, time, time);
      this.#sql.exec('INSERT INTO compile_operations VALUES(?,?,?,?,?)', actor.id, input.key, 'enqueue', requestDigest, id); return summary(this.#owned(tokenHash, id));
    });
  }
  query(tokenHash, id) { return summary(this.#owned(tokenHash, id)); }
  // Trusted executor preflight/reverification also checks the actual persisted pipeline.
  assertPipeline(tokenHash, id) { const row = this.#owned(tokenHash, id); this.#compatible(row); return summary(row); }
  claim(tokenHash, id, expectedRevision) {
    const nonce = randomBytes(32).toString('hex'), leaseHash = digest(nonce);
    const row = this.#storage.transactionSync(() => {
      const current = this.#owned(tokenHash, id); this.#compatible(current); this.#cas(current, expectedRevision);
      if (current.state !== 'queued' && !(current.state === 'running' && Date.now() >= current.lease_until)) fail(409, 'JOB_NOT_CLAIMABLE');
      return this.#touch(current, { state: 'running', attempt: current.attempt + 1, generation: current.generation + 1, lease_hash: leaseHash, lease_until: Date.now() + this.#leaseMs });
    });
    const capability = Object.freeze({ id, tokenHash, epoch: row.auth_epoch, actor: row.actor_id, generation: row.generation, leaseHash }); this.#leases.add(capability);
    return { capability, job: summary(row) };
  }
  #lease(tokenHash, capability, expectedRevision) {
    if (!this.#leases.has(capability) || capability.tokenHash !== tokenHash) fail(403, 'JOB_LEASE_REQUIRED');
    const row = this.#owned(tokenHash, capability.id); this.#compatible(row); this.#cas(row, expectedRevision);
    if (row.state !== 'running' || row.generation !== capability.generation || row.lease_hash !== capability.leaseHash || row.auth_epoch !== capability.epoch || row.actor_id !== capability.actor || Date.now() >= row.lease_until) fail(409, 'JOB_LEASE_EXPIRED');
    return row;
  }
  // Service executor guard: brands/SQL expiry/CAS are checked, no DTO lease recovery.
  assertLease(tokenHash, capability, expectedRevision) { return summary(this.#lease(tokenHash, capability, expectedRevision)); }
  heartbeat(tokenHash, capability, expectedRevision) {
    return this.#storage.transactionSync(() => summary(this.#touch(this.#lease(tokenHash, capability, expectedRevision), { lease_until: Date.now() + this.#leaseMs })));
  }
  async checkpoint(tokenHash, capability, input) {
    input = parse(canonical(input)); fields(input, ['expectedRevision', 'stage', 'outputs']);
    const captured = outputs(input.outputs), before = this.#lease(tokenHash, capability, input.expectedRevision);
    if (input.stage !== this.#stages[before.stage_cursor]) fail(409, 'JOB_STAGE');
    if (typeof this.#verify !== 'function') fail(503, 'JOB_OUTPUT_VERIFIER_NOT_READY');
    const previous = parse(before.checkpoint_json), manifest = { operationId: before.job_id, gameId: before.game_id, draftRevision: before.draft_revision, sourceDigest: before.source_digest, dependencyDigest: before.dependency_digest, compilerRevision: before.compiler_revision, profileRevision: before.profile_revision, pipelineDigest: before.pipeline_digest, stage: input.stage, previousDigest: previous.at(-1)?.digest ?? null, outputs: captured };
    const manifestText = canonical(manifest), manifestDigest = digest(manifestText);
    const proof = await this.#verify(Object.freeze({ tokenHash, manifest: parse(manifestText), digest: manifestDigest }));
    if (!proof || proof.digest !== manifestDigest) fail(422, 'JOB_OUTPUT_PROOF');
    return this.#storage.transactionSync(() => {
      const row = this.#lease(tokenHash, capability, input.expectedRevision);
      const records = parse(row.checkpoint_json); records.push({ stage: input.stage, digest: manifestDigest, outputs: captured });
      const done = row.stage_cursor + 1 === this.#stages.length;
      return summary(this.#touch(row, { stage_cursor: row.stage_cursor + 1, checkpoint_json: canonical(records), state: done ? 'ready' : 'running', lease_hash: done ? null : row.lease_hash, lease_until: done ? 0 : Date.now() + this.#leaseMs }));
    });
  }
  fail(tokenHash, capability, input) {
    input = parse(canonical(input)); fields(input, ['expectedRevision', 'code', 'retryable']);
    const { expectedRevision, code, retryable } = input;
    if (typeof code !== 'string' || !/^[A-Z][A-Z0-9_]{1,63}$/.test(code) || typeof retryable !== 'boolean') fail(422, 'JOB_FAILURE');
    return this.#storage.transactionSync(() => summary(this.#touch(this.#lease(tokenHash, capability, expectedRevision), { state: 'failed', failure_code: code, retryable: Number(retryable), lease_hash: null, lease_until: 0 })));
  }
  retry(tokenHash, input) {
    input = parse(canonical(input)); fields(input, ['key', 'operationId', 'expectedRevision']);
    const { key, operationId, expectedRevision } = input;
    if (!uuid(operationId)) fail(422, 'JOB_ID');
    const requestDigest = digest(canonical({ method: 'retry', operationId, expectedRevision, pipeline: this.#pipeline }));
    return this.#storage.transactionSync(() => {
      const actor = this.#actor(tokenHash), old = this.#operation(actor, key, 'retry', requestDigest);
      if (old) return summary(this.#owned(tokenHash, old.job_id));
      const row = this.#owned(tokenHash, operationId); this.#compatible(row); this.#cas(row, expectedRevision);
      if (row.state !== 'failed' || !row.retryable) fail(409, 'JOB_NOT_RETRYABLE');
      const updated = this.#touch(row, { state: 'queued', failure_code: null, retryable: 0 });
      this.#sql.exec('INSERT INTO compile_operations VALUES(?,?,?,?,?)', actor.id, key, 'retry', requestDigest, row.job_id); return summary(updated);
    });
  }
}
