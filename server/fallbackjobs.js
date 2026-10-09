// One service-configured season, actual saved source and durable outputs; NOT runtime admission.
import { createHash } from 'node:crypto';
import { encodeSourceChunks, canonicalSourceTokens } from '../web/src/content/authoring/sourcejson.js';
import { CompileJobs } from './jobs.js';
import { FALLBACK_IMAGE_REVISION } from './copyimages.js';
import { PNG_IO_REVISION } from './pngio.js';
import { ROW_PNG_REVISION } from './rowpng.js';
import { TILE_PIXEL_REVISION } from '../web/src/content/authoring/tilepixels.js';
import { FIXED_COPY_PROFILE } from './copyprofile.js';
import { HttpError, fail } from './security.js';
const stages = ['validate-fallback', 'store-fallback'], bytes = value => Buffer.concat(encodeSourceChunks(value)), sha = value => createHash('sha256').update(value).digest('hex'), canonical = value => bytes(value).toString('utf8');
function input(value) { let text = ''; try { for (const token of canonicalSourceTokens(value)) { text += token; if (Buffer.byteLength(text) > 65536) fail(413, 'JOB_RECORD_BUDGET'); } return JSON.parse(text); } catch (error) { if (error instanceof HttpError) throw error; fail(422, 'JOB_RECORD'); } }
export class FixedCopyFallbackJobs {
  #storage; #sql; #principal; #games; #images; #blobs; #guard; #jobs; #plans = new Map(); #season; #compiler; #pipeline;
  constructor({ storage, principal, games, images, blobs, operationGuard, season }) {
    if (!storage?.sql || typeof principal !== 'function' || typeof games?.snapshotReference !== 'function' || typeof images?.captureFallback !== 'function' || typeof images?.assert !== 'function' || typeof blobs?.putImmutable !== 'function' || typeof blobs?.read !== 'function' || typeof operationGuard !== 'function' || !['spring', 'summer', 'autumn', 'winter'].includes(season)) throw new TypeError('actual stores, trusted fallback planner and fixed season required');
    this.#storage = storage; this.#sql = storage.sql; this.#principal = principal; this.#games = games; this.#images = images; this.#blobs = blobs; this.#guard = operationGuard; this.#season = season;
    const io = sha(bytes({ PNG_IO_REVISION, ROW_PNG_REVISION, TILE_PIXEL_REVISION })).slice(0, 16);
    this.#compiler = FALLBACK_IMAGE_REVISION + '-' + season + '-' + io + '-job-1';
    this.#pipeline = sha(bytes({ compilerRevision: this.#compiler, profileRevision: FIXED_COPY_PROFILE, stages }));
    this.#jobs = new CompileJobs({ storage, principal, metadata: games, compilerRevision: this.#compiler, profileRevision: FIXED_COPY_PROFILE, stages, leaseMs: 300000, verifyCheckpoint: context => this.#verify(context) });
    storage.transactionSync(() => this.#sql.exec("CREATE TABLE IF NOT EXISTS fallback_compile_objects (actor_id TEXT NOT NULL, operation_id TEXT NOT NULL, game_id TEXT NOT NULL, sha256 TEXT NOT NULL, byte_length INTEGER NOT NULL, state TEXT NOT NULL, PRIMARY KEY(operation_id,sha256))"));
  }
  #actor(tokenHash) { const actor = this.#principal(tokenHash); if (actor.must_change) fail(403, 'PASSWORD_CHANGE_REQUIRED'); if (actor.role !== 'admin') fail(403, 'FULL_COPY_SOURCE_ADMIN_REQUIRED'); return actor; }
  enqueue(tokenHash, value) { value = input(value); return this.#storage.transactionSync(() => { const actor = this.#actor(tokenHash); this.#guard(actor.id, value?.key); const job = this.#jobs.enqueue(tokenHash, value); return this.query(tokenHash, job.operationId); }); }
  query(tokenHash, id) { this.#actor(tokenHash); const job = this.#jobs.assertPipeline(tokenHash, id); if (job.scope !== 'all') fail(409, 'JOB_PIPELINE_CHANGED'); return job; }
  retry(tokenHash, value) { value = input(value); return this.#storage.transactionSync(() => { const actor = this.#actor(tokenHash); this.#guard(actor.id, value?.key); const job = this.#jobs.retry(tokenHash, value); return this.query(tokenHash, job.operationId); }); }
  #plan(tokenHash, job, imagePlan) {
    const report = this.#images.assert(tokenHash, imagePlan), reference = this.#games.snapshotReference(tokenHash, job.gameId, job.draftRevision);
    if (report.gameId !== job.gameId || report.draftRevision !== job.draftRevision || report.sourceDigest !== reference.sourceDigest || report.dependencyDigest !== reference.dependencyDigest || report.compilerRevision !== FALLBACK_IMAGE_REVISION || report.season !== this.#season || report.pngRevision !== PNG_IO_REVISION || report.rowPNGRevision !== ROW_PNG_REVISION || report.tilePixelRevision !== TILE_PIXEL_REVISION || report.admission !== 'single-season-fallback-only' || imagePlan.outputs.length !== 1 || imagePlan.outputs[0].assetId !== 'fallback_' + this.#season) fail(409, 'FALLBACK_JOB_SOURCE_CHANGED');
    const binding = { schema: 'dragon-fallback-job-1', operationId: job.operationId, gameId: job.gameId, draftRevision: job.draftRevision, sourceDigest: reference.sourceDigest, dependencyDigest: reference.dependencyDigest, compilerRevision: this.#compiler, profileRevision: FIXED_COPY_PROFILE, pipelineDigest: this.#pipeline, season: this.#season, admission: 'single-season-stage-outputs-only', sourceReport: report };
    const reportBytes = bytes(binding), items = [[{ assetId: 'fallback_report', bytes: Uint8Array.from(reportBytes), sha256: sha(reportBytes), byteLength: reportBytes.length }], imagePlan.outputs.map(output => ({ assetId: output.assetId, bytes: Uint8Array.from(output.bytes), sha256: output.sha256, byteLength: output.byteLength }))];
    if (items.flat().some(item => item.byteLength < 1 || item.byteLength > 4 * 1024 * 1024 || sha(item.bytes) !== item.sha256)) fail(422, 'FALLBACK_JOB_OUTPUT');
    return { tokenHash, imagePlan, binding, items };
  }
  #descriptors(items) { return items.map(({ assetId, sha256, byteLength }) => ({ assetId, sha256, byteLength })); }
  #manifest(plan, stage, previousDigest) { return { operationId: plan.binding.operationId, gameId: plan.binding.gameId, draftRevision: plan.binding.draftRevision, sourceDigest: plan.binding.sourceDigest, dependencyDigest: plan.binding.dependencyDigest, compilerRevision: this.#compiler, profileRevision: FIXED_COPY_PROFILE, pipelineDigest: this.#pipeline, stage: stages[stage], previousDigest, outputs: this.#descriptors(plan.items[stage]) }; }
  async #verify({ tokenHash, manifest, digest }) {
    const plan = this.#plans.get(manifest.operationId), stage = stages.indexOf(manifest.stage); if (!plan || plan.tokenHash !== tokenHash || stage < 0) fail(503, 'FALLBACK_JOB_PROOF_REQUIRED');
    this.#images.assert(tokenHash, plan.imagePlan); const previous = stage === 0 ? null : sha(bytes(this.#manifest(plan, 0, null))), expected = this.#manifest(plan, stage, previous);
    if (canonical(manifest) !== canonical(expected) || digest !== sha(bytes(expected))) fail(422, 'FALLBACK_JOB_CHECKPOINT_BINDING');
    for (const item of plan.items[stage]) { const actual = await this.#blobs.read(tokenHash, { gameId: plan.binding.gameId, sha256: item.sha256, byteLength: item.byteLength }); if (sha(actual.bytes) !== item.sha256 || actual.bytes.length !== item.byteLength) fail(422, 'FALLBACK_JOB_OUTPUT_BYTES'); this.#images.assert(tokenHash, plan.imagePlan); }
    this.query(tokenHash, manifest.operationId); return Object.freeze({ digest });
  }
  async #existing(plan, job) {
    if (!Array.isArray(job.checkpoint) || job.checkpoint.length !== job.stage || job.stage > stages.length) fail(503, 'FALLBACK_JOB_CHECKPOINT_CORRUPT');
    let previous = null;
    for (let stage = 0; stage < job.stage; stage++) { const record = job.checkpoint[stage], manifest = this.#manifest(plan, stage, previous), digest = sha(bytes(manifest)); if (record.stage !== stages[stage] || record.digest !== digest || canonical(record.outputs) !== canonical(manifest.outputs)) fail(503, 'FALLBACK_JOB_CHECKPOINT_CORRUPT'); await this.#verify({ tokenHash: plan.tokenHash, manifest, digest }); previous = digest; }
  }
  async execute(tokenHash, id, expectedRevision) {
    let job = this.query(tokenHash, id); if (job.rowRevision !== expectedRevision) fail(409, 'JOB_CHANGED'); let capability, plan;
    if (job.state !== 'ready') { const claim = this.#jobs.claim(tokenHash, id, expectedRevision); capability = claim.capability; job = claim.job; }
    const guard = () => { if (capability) this.#jobs.assertLease(tokenHash, capability, job.rowRevision); else if (canonical(this.query(tokenHash, id)) !== canonical(job)) fail(409, 'JOB_CHANGED'); };
    try {
      const imagePlan = await this.#images.captureFallback(tokenHash, job.gameId, job.draftRevision, this.#season, guard); guard(); if (capability) job = this.#jobs.heartbeat(tokenHash, capability, job.rowRevision);
      plan = this.#plan(tokenHash, job, imagePlan); this.#plans.set(id, plan); await this.#existing(plan, job);
      if (job.state === 'ready') { guard(); return this.query(tokenHash, id); }
      for (let stage = job.stage; stage < stages.length; stage++) {
        for (const item of plan.items[stage]) {
          this.#storage.transactionSync(() => { guard(); this.#images.assert(tokenHash, imagePlan); const old = this.#sql.exec('SELECT * FROM fallback_compile_objects WHERE operation_id=? AND sha256=?', id, item.sha256).toArray()[0]; if (old && (old.actor_id !== this.#actor(tokenHash).id || old.game_id !== job.gameId || old.byte_length !== item.byteLength)) fail(503, 'FALLBACK_JOB_OBJECT_CONFLICT'); this.#sql.exec("INSERT OR IGNORE INTO fallback_compile_objects VALUES(?,?,?,?,?,'intent')", this.#actor(tokenHash).id, id, job.gameId, item.sha256, item.byteLength); });
          const actual = await this.#blobs.putImmutable(tokenHash, { gameId: job.gameId, bytes: item.bytes });
          this.#storage.transactionSync(() => { guard(); this.#images.assert(tokenHash, imagePlan); if (actual.sha256 !== item.sha256 || actual.byteLength !== item.byteLength) fail(422, 'FALLBACK_JOB_OUTPUT_BYTES'); this.#sql.exec("UPDATE fallback_compile_objects SET state='verified' WHERE operation_id=? AND sha256=?", id, item.sha256); }); job = this.#jobs.heartbeat(tokenHash, capability, job.rowRevision);
        }
        job = await this.#jobs.checkpoint(tokenHash, capability, { expectedRevision: job.rowRevision, stage: stages[stage], outputs: this.#descriptors(plan.items[stage]) });
      }
      return job;
    } catch (error) { if (capability) { try { this.#jobs.fail(tokenHash, capability, { expectedRevision: job.rowRevision, code: error instanceof HttpError ? error.code : 'FALLBACK_JOB_FAILED', retryable: !(error instanceof HttpError && error.status === 422) }); } catch { /* Stale authority cannot alter the row. */ } } throw error; }
    finally { if (this.#plans.get(id) === plan) this.#plans.delete(id); }
  }
}
