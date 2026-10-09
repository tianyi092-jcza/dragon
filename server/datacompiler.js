// Internal data-only execution. No image/runtime certificate, public admission or release.
import { createHash } from 'node:crypto';
import { compileGameSource, TRIAL_COMPILER_REVISION } from '../web/src/content/authoring/trialcompile.js';
import { encodeSourceChunks, canonicalSourceTokens } from '../web/src/content/authoring/sourcejson.js';
import { FIXED_COPY_PROFILE } from './copyprofile.js';
import { CompileJobs } from './jobs.js';
import { fail, HttpError } from './security.js';
export const DATA_COMPILER_REVISION = TRIAL_COMPILER_REVISION + '-server-data-1';
const stages = ['validate', 'compile-data'], sha = bytes => createHash('sha256').update(bytes).digest('hex');
const bytes = value => Buffer.concat(encodeSourceChunks(value));
const canonical = value => bytes(value).toString('utf8');
const pipeline = sha(bytes({ compilerRevision: DATA_COMPILER_REVISION, profileRevision: FIXED_COPY_PROFILE, stages }));
const missing = ['image-decode', 'pixel-png-output', 'complete-runtime-dependencies', 'runtime-admission'];
function requestInput(value) {
  let text = ''; try { for (const token of canonicalSourceTokens(value)) { text += token; if (Buffer.byteLength(text) > 65536) fail(413, 'JOB_RECORD_BUDGET'); } return JSON.parse(text); }
  catch (error) { if (error instanceof HttpError) throw error; fail(422, 'JOB_RECORD'); }
}
export class FixedCopyDataCompiler {
  #storage; #sql; #principal; #drafts; #blobs; #guard; #jobs; #plans = new Map();
  constructor({ storage, principal, games, drafts, blobs, operationGuard }) {
    if (!storage?.sql || typeof principal !== 'function' || typeof drafts?.captureForCompile !== 'function' || typeof blobs?.putImmutable !== 'function' || typeof blobs?.read !== 'function' || typeof operationGuard !== 'function') throw new TypeError('actual stores, private snapshot loader and service guard required');
    this.#storage = storage; this.#sql = storage.sql; this.#principal = principal; this.#drafts = drafts; this.#blobs = blobs; this.#guard = operationGuard;
    this.#jobs = new CompileJobs({ storage, principal, metadata: games, compilerRevision: DATA_COMPILER_REVISION, profileRevision: FIXED_COPY_PROFILE, stages, leaseMs: 300000, verifyCheckpoint: context => this.#verify(context) });
    storage.transactionSync(() => this.#sql.exec("CREATE TABLE IF NOT EXISTS data_compile_objects (actor_id TEXT NOT NULL, operation_id TEXT NOT NULL, game_id TEXT NOT NULL, sha256 TEXT NOT NULL, byte_length INTEGER NOT NULL, state TEXT NOT NULL, PRIMARY KEY(operation_id,sha256))"));
  }
  enqueue(tokenHash, input) {
    input = requestInput(input);
    return this.#storage.transactionSync(() => { const actor = this.#principal(tokenHash); this.#guard(actor.id, input?.key); return this.#jobs.enqueue(tokenHash, input); });
  }
  query(tokenHash, id) { const job = this.#jobs.assertPipeline(tokenHash, id); this.#compatible(job); return job; }
  retry(tokenHash, input) {
    input = requestInput(input);
    return this.#storage.transactionSync(() => { const actor = this.#principal(tokenHash); this.#guard(actor.id, input?.key); return this.#jobs.retry(tokenHash, input); });
  }
  #compatible(job) { if (job.compilerRevision !== DATA_COMPILER_REVISION || job.profileRevision !== FIXED_COPY_PROFILE || job.scope !== 'all') fail(409, 'JOB_PIPELINE_CHANGED'); }
  #plan(job, snapshot, tokenHash) {
    if (snapshot.ownerId !== this.#principal(tokenHash).id || snapshot.authEpoch !== this.#principal(tokenHash).epoch || snapshot.profileRevision !== FIXED_COPY_PROFILE || snapshot.reference.gameId !== job.gameId || snapshot.reference.draftRevision !== job.draftRevision) fail(409, 'JOB_SNAPSHOT_CHANGED');
    let compiled; try { compiled = compileGameSource(snapshot.game, sha); } catch { fail(422, 'DATA_COMPILE_UNSUPPORTED'); }
    if (compiled.sourceDigest !== snapshot.reference.sourceDigest || compiled.compatibilityAssetMode !== 'source-explicit') fail(422, 'DATA_SOURCE_BINDING');
    const binding = { schema: 'dragon-data-compilation-1', operationId: job.operationId, gameId: job.gameId, draftRevision: job.draftRevision, scope: 'all', sourceDigest: snapshot.reference.sourceDigest, dependencyDigest: snapshot.reference.dependencyDigest, compilerRevision: DATA_COMPILER_REVISION, profileRevision: FIXED_COPY_PROFILE, pipelineDigest: pipeline, admission: 'data-only', missing };
    const output = [];
    const binary = (id, value) => { const captured = Uint8Array.from(value); if (!captured.length) fail(422, 'DATA_EMPTY_OUTPUT'); for (let at = 0, part = 0; at < captured.length; at += 4 * 1024 * 1024, part++) output.push({ assetId: id + '_' + part, bytes: captured.slice(at, at + 4 * 1024 * 1024) }); };
    const json = (id, value) => binary(id, bytes(value));
    json('binding', binding); binary('terrain', compiled.terrainBytes); binary('geography', compiled.geography); binary('minimap_geography', compiled.minimapGeography); binary('road_mask', compiled.roadMask); binary('road_cost', compiled.roadCost); binary('road_offset', compiled.roadOffsetBytes); json('roads', compiled.roadGraph);
    snapshot.game.chapterOrder.forEach((id, index) => json('chapter_' + index, { chapterId: id, definition: snapshot.game.chapters[id] }));
    if (output.length > 127) fail(413, 'DATA_OUTPUT_BUDGET');
    const report = { assetId: 'source_report', bytes: bytes({ ...binding, gate: 'fixed-copy-source-structure', chapterCount: snapshot.game.chapterOrder.length, width: compiled.width, height: compiled.height, diagnostics: [] }) };
    for (const item of [report, ...output]) { item.sha256 = sha(item.bytes); item.byteLength = item.bytes.length; }
    return { tokenHash, binding, items: [[report], output] };
  }
  #descriptors(items) { return items.map(({ assetId, sha256, byteLength }) => ({ assetId, sha256, byteLength })); }
  #manifest(plan, stage, previousDigest) { return { operationId: plan.binding.operationId, gameId: plan.binding.gameId, draftRevision: plan.binding.draftRevision, sourceDigest: plan.binding.sourceDigest, dependencyDigest: plan.binding.dependencyDigest, compilerRevision: DATA_COMPILER_REVISION, profileRevision: FIXED_COPY_PROFILE, pipelineDigest: pipeline, stage: stages[stage], previousDigest, outputs: this.#descriptors(plan.items[stage]) }; }
  async #verify({ tokenHash, manifest, digest }) {
    const plan = this.#plans.get(manifest.operationId), stage = stages.indexOf(manifest.stage);
    if (!plan || plan.tokenHash !== tokenHash || stage < 0) fail(503, 'DATA_EXECUTION_PROOF_REQUIRED');
    const previous = stage === 0 ? null : sha(bytes(this.#manifest(plan, 0, null))), expected = this.#manifest(plan, stage, previous);
    if (canonical(manifest) !== canonical(expected) || digest !== sha(bytes(expected))) fail(422, 'DATA_CHECKPOINT_BINDING');
    for (const item of plan.items[stage]) { const actual = await this.#blobs.read(tokenHash, { gameId: plan.binding.gameId, sha256: item.sha256, byteLength: item.byteLength }); if (sha(actual.bytes) !== item.sha256 || actual.bytes.length !== item.byteLength) fail(422, 'DATA_OUTPUT_BYTES'); }
    this.query(tokenHash, manifest.operationId); return Object.freeze({ digest });
  }
  async #existing(plan, job) {
    if (!Array.isArray(job.checkpoint) || job.checkpoint.length !== job.stage || job.stage > stages.length) fail(503, 'DATA_CHECKPOINT_CORRUPT');
    let previous = null;
    for (let stage = 0; stage < job.stage; stage++) {
      const record = job.checkpoint[stage], manifest = this.#manifest(plan, stage, previous), digest = sha(bytes(manifest));
      if (record.stage !== stages[stage] || record.digest !== digest || canonical(record.outputs) !== canonical(manifest.outputs)) fail(503, 'DATA_CHECKPOINT_CORRUPT');
      await this.#verify({ tokenHash: plan.tokenHash, manifest, digest }); previous = digest;
    }
  }
  async execute(tokenHash, id, expectedRevision) {
    let job = this.query(tokenHash, id);
    if (job.rowRevision !== expectedRevision) fail(409, 'JOB_CHANGED');
    let capability, plan;
    if (job.state !== 'ready') { const claim = this.#jobs.claim(tokenHash, id, expectedRevision); capability = claim.capability; job = claim.job; }
    try {
      const snapshot = await this.#drafts.captureForCompile(tokenHash, job.gameId, job.draftRevision);
      if (capability) job = this.#jobs.heartbeat(tokenHash, capability, job.rowRevision);
      plan = this.#plan(job, snapshot, tokenHash); this.#plans.set(id, plan); await this.#existing(plan, job);
      if (job.state === 'ready') { const current = this.query(tokenHash, id); if (canonical(current) !== canonical(job)) fail(409, 'JOB_CHANGED'); return current; }
      for (let stage = job.stage; stage < stages.length; stage++) {
        for (const item of plan.items[stage]) {
          this.#storage.transactionSync(() => {
            this.#jobs.assertLease(tokenHash, capability, job.rowRevision);
            const old = this.#sql.exec('SELECT * FROM data_compile_objects WHERE operation_id=? AND sha256=?', id, item.sha256).toArray()[0];
            if (old && (old.actor_id !== snapshot.ownerId || old.game_id !== job.gameId || old.byte_length !== item.byteLength)) fail(503, 'DATA_OBJECT_CONFLICT');
            this.#sql.exec("INSERT OR IGNORE INTO data_compile_objects VALUES(?,?,?,?,?,'intent')", snapshot.ownerId, id, job.gameId, item.sha256, item.byteLength);
          });
          const actual = await this.#blobs.putImmutable(tokenHash, { gameId: job.gameId, bytes: item.bytes });
          this.#storage.transactionSync(() => { this.#jobs.assertLease(tokenHash, capability, job.rowRevision); if (actual.sha256 !== item.sha256 || actual.byteLength !== item.byteLength) fail(422, 'DATA_OUTPUT_BYTES'); this.#sql.exec("UPDATE data_compile_objects SET state='verified' WHERE operation_id=? AND sha256=?", id, item.sha256); });
          job = this.#jobs.heartbeat(tokenHash, capability, job.rowRevision);
        }
        job = await this.#jobs.checkpoint(tokenHash, capability, { expectedRevision: job.rowRevision, stage: stages[stage], outputs: this.#descriptors(plan.items[stage]) });
      }
      return job;
    } catch (error) {
      if (capability) { try { this.#jobs.fail(tokenHash, capability, { expectedRevision: job.rowRevision, code: error instanceof HttpError ? error.code : 'DATA_COMPILE_FAILED', retryable: !(error instanceof HttpError && error.status === 422) }); } catch { /* Revoked/expired authority must not overwrite the primary failure. */ } }
      throw error;
    } finally { if (this.#plans.get(id) === plan) this.#plans.delete(id); }
  }
}
