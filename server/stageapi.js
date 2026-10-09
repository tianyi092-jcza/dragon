// Authenticated stage-artifact orchestration, never runtime or release admission.
import { createHash } from 'node:crypto';
import { encodeSourceChunks } from '../web/src/content/authoring/sourcejson.js';
import { fields, fail, HttpError } from './security.js';
import { HttpCommandTargets } from './commandtargets.js';
const canonical = value => Buffer.concat(encodeSourceChunks(value)).toString('utf8'), sha = value => createHash('sha256').update(value).digest('hex');
const purposes = Object.freeze(['data', 'images', 'fallback-spring', 'fallback-summer', 'fallback-autumn', 'fallback-winter']);
const uid = '[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}', route = new RegExp('^/api/games/(' + uid + '|wolong-builtin)/stage-jobs/(' + purposes.join('|') + ')(?:/(' + uid + ')(?:/(run|retry|artifacts/([A-Za-z0-9_-]{1,128})))?)?$');
export class StageJobsAPI {
  #storage; #sql; #principal; #services; #blobs; #guard; #targets; #issued = new WeakMap();
  constructor({ storage, principal, services, blobs, operationGuard, requestKey }) {
    if (!storage?.sql || typeof principal !== 'function' || !purposes.every(p => ['enqueue', 'query', 'execute', 'retry'].every(m => typeof services?.[p]?.[m] === 'function')) || typeof blobs?.read !== 'function' || typeof operationGuard !== 'function') throw new TypeError('actual stage services, principal, storage and guard required');
    this.#storage = storage; this.#sql = storage.sql; this.#principal = principal; this.#services = Object.freeze(Object.fromEntries(purposes.map(p => [p, services[p]]))); this.#blobs = blobs; this.#guard = operationGuard;
    this.#targets = new HttpCommandTargets(storage, requestKey);
    storage.transactionSync(() => this.#sql.exec('CREATE TABLE IF NOT EXISTS stage_http_commands (actor TEXT NOT NULL, op_key TEXT NOT NULL, request_digest TEXT NOT NULL, auth_epoch INTEGER NOT NULL, PRIMARY KEY(actor,op_key))'));
  }
  match(path) { const m = route.exec(path); return m ? Object.freeze({ gameId: m[1], purpose: m[2], id: m[3], action: m[4], assetId: m[5] }) : null; }
  #job(tokenHash, path) { const job = this.#services[path.purpose].query(tokenHash, path.id); if (job.gameId !== path.gameId) fail(404, 'JOB_NOT_FOUND'); return job; }
  #dto(job, purpose) { return { admission: 'stage-only', purpose, job }; }
  #issue(tokenHash, purpose, job, result) {
    this.#issued.set(result, { tokenHash, purpose, gameId: job.gameId, id: job.operationId, job: canonical(job), body: canonical(this.#dto(job, purpose)) });
    this.assertCurrent(tokenHash, { purpose, gameId: job.gameId, id: job.operationId }, result); return result;
  }
  // Per-response association only. Actual token/SQL snapshot/pipeline and bytes remain authoritative.
  assertCurrent(tokenHash, path, result) {
    const issued = this.#issued.get(result);
    if (!issued || issued.tokenHash !== tokenHash || issued.purpose !== path.purpose || issued.gameId !== path.gameId || path.id && issued.id !== path.id) fail(403, 'STAGE_RESPONSE_REQUIRED');
    this.#principal(tokenHash); const job = this.#job(tokenHash, { ...path, id: issued.id });
    if (canonical(job) !== issued.job) fail(409, 'JOB_CHANGED');
    if (result.artifact) {
      const output = job.checkpoint.flatMap(record => record.outputs).find(record => record.assetId === result.artifact.assetId);
      if (!output || result.artifact.sha256 !== output.sha256 || result.artifact.bytes.length !== output.byteLength || sha(result.artifact.bytes) !== output.sha256) fail(503, 'STAGE_OUTPUT_CORRUPT');
    } else if (canonical(result.body ?? result) !== issued.body) fail(503, 'STAGE_RESPONSE_CORRUPT');
    // Internal current Job only; caller still rechecks actual snapshot and issued
    // response after its callbacks. This DTO is never an authorization grant.
    return job;
  }
  async read(tokenHash, path) {
    if (!path.id || path.action && !path.assetId) fail(404, 'NOT_FOUND');
    const service = this.#services[path.purpose], job = this.#job(tokenHash, path);
    if (!path.assetId) return this.#issue(tokenHash, path.purpose, job, { body: this.#dto(job, path.purpose) });
    if (job.state !== 'ready') fail(409, 'JOB_NOT_READY');
    // Rebuild from the exact source and reverify every persisted output, not a DTO grant.
    const checked = await service.execute(tokenHash, path.id, job.rowRevision);
    if (canonical(checked) !== canonical(job)) fail(409, 'JOB_CHANGED');
    const output = checked.checkpoint.flatMap(record => record.outputs).find(record => record.assetId === path.assetId); if (!output) fail(404, 'OUTPUT_NOT_FOUND');
    const actual = await this.#blobs.read(tokenHash, { gameId: checked.gameId, sha256: output.sha256, byteLength: output.byteLength });
    if (actual.bytes.length !== output.byteLength || sha(actual.bytes) !== output.sha256) fail(503, 'STAGE_OUTPUT_CORRUPT');
    if (canonical(this.#job(tokenHash, path)) !== canonical(checked)) fail(409, 'JOB_CHANGED');
    return this.#issue(tokenHash, path.purpose, checked, { artifact: { bytes: actual.bytes, assetId: output.assetId, sha256: output.sha256 } });
  }
  #command(tokenHash, path, key, expectedRevision) {
    const digest = sha(Buffer.from(canonical({ gameId: path.gameId, purpose: path.purpose, operationId: path.id, action: path.action, expectedRevision })));
    return this.#storage.transactionSync(() => {
      const actor = this.#principal(tokenHash); this.#guard(actor.id, key);
      const old = this.#sql.exec('SELECT * FROM stage_http_commands WHERE actor=? AND op_key=?', actor.id, key).toArray()[0];
      if (old && old.request_digest !== digest) fail(409, 'IDEMPOTENCY_CONFLICT'); if (old && old.auth_epoch !== actor.epoch) fail(409, 'OPERATION_REVOKED');
      if (!old) this.#sql.exec('INSERT INTO stage_http_commands VALUES(?,?,?,?)', actor.id, key, digest, actor.epoch);
      this.#targets.record('stage', actor.id, key, path.id);
      return Boolean(old);
    });
  }
  async write(tokenHash, path, value, key, ifMatch) {
    const service = this.#services[path.purpose];
    if (!path.id) { fields(value, ['draftRevision', 'scope']); const job = service.enqueue(tokenHash, { gameId: path.gameId, draftRevision: value.draftRevision, scope: value.scope, key }); const checked = this.#job(tokenHash, { ...path, id: job.operationId }); if (checked.draftRevision !== value.draftRevision) fail(409, 'JOB_SNAPSHOT_CHANGED'); return this.#issue(tokenHash, path.purpose, checked, this.#dto(checked, path.purpose)); }
    if (!['run', 'retry'].includes(path.action)) fail(404, 'NOT_FOUND'); fields(value, []);
    const expected = /^"([1-9][0-9]{0,63})"$/.exec(ifMatch ?? '')?.[1]; if (!expected) fail(428, 'IF_MATCH_REQUIRED');
    const current = this.#job(tokenHash, path);
    if (path.action === 'retry') { try { const retried = service.retry(tokenHash, { operationId: path.id, expectedRevision: expected, key }); return this.#issue(tokenHash, path.purpose, retried, this.#dto(retried, path.purpose)); } catch (error) { if (error instanceof HttpError && error.code === 'JOB_CHANGED') fail(412, 'JOB_CHANGED'); throw error; } }
    const replay = this.#command(tokenHash, path, key, expected);
    if (current.rowRevision !== expected && !(replay && current.state === 'ready')) fail(412, 'JOB_CHANGED');
    // A matched terminal request binding permits a verified read of current immutable
    // stage facts. It does not prove that this HTTP command performed the writes.
    try { const executed = await service.execute(tokenHash, path.id, current.rowRevision); return this.#issue(tokenHash, path.purpose, executed, this.#dto(executed, path.purpose)); } catch (error) { if (error instanceof HttpError && error.code === 'JOB_CHANGED') fail(412, 'JOB_CHANGED'); throw error; }
  }
}
