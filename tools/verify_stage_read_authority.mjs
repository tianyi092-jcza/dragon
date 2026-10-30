// StageJobsAPI orchestration only: real in-memory SQLite, explicit service/IO fixtures.
// No HTTP/authentication backend, compiler, filesystem objects, network or user saves.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { StageJobsAPI } from '../server/stageapi.js';
import { HttpError } from '../server/security.js';
import { openStorage } from '../vps/sqlite-port.mjs';

const storage = openStorage(':memory:');
const token = 'a'.repeat(64), gameId = '11111111-1111-4111-8111-111111111111';
const id = '22222222-2222-4222-8222-222222222222';
const bytes = Buffer.from('owned-stage-output');
const output = { assetId: 'terrain_0', sha256: createHash('sha256').update(bytes).digest('hex'), byteLength: bytes.length };
const baseline = { gameId, operationId: id, rowRevision: '1', state: 'ready', checkpoint: [{ outputs: [output] }] };
const path = { gameId, id, purpose: 'data', action: 'artifacts/terrain_0', assetId: 'terrain_0' };
let job, refusal, point, transition, ioFailure, executions, reads;
const principal = value => { assert.equal(value, token); if (refusal) throw refusal; return { id: 'owned', epoch: 1 }; };
const failAt = async location => {
  await Promise.resolve();
  if (point !== location) return;
  transition();
  throw ioFailure;
};
const service = {
  query(value, operation) { principal(value); assert.equal(operation, id); return structuredClone(job); },
  async execute(value, operation, revision) {
    principal(value); assert.equal(operation, id); assert.equal(revision, '1'); executions++;
    await failAt('execute'); return structuredClone(job);
  },
  enqueue() { throw new Error('unexpected enqueue'); },
  retry() { throw new Error('unexpected retry'); },
};
const api = new StageJobsAPI({ storage, principal, requestKey: 'b'.repeat(64), operationGuard() { throw new Error('unexpected write guard'); },
  services: Object.fromEntries(['data', 'images', 'fallback-spring', 'fallback-summer', 'fallback-autumn', 'fallback-winter'].map(purpose => [purpose, service])),
  blobs: { async read(value, descriptor) { principal(value); assert.deepEqual(descriptor, { gameId, sha256: output.sha256, byteLength: output.byteLength }); reads++; await failAt('blob'); return { bytes }; } },
});
const tables = ['stage_http_commands', 'content_http_command_targets', 'content_http_command_proofs'];
const rows = () => tables.map(table => storage.sql.exec(`SELECT * FROM ${table} ORDER BY rowid`).toArray());
let groups = 0;
try {
  for (const location of ['execute', 'blob']) {
    for (const condition of ['unchanged', 'session', 'owner', 'fence', 'snapshot', 'job']) {
      job = structuredClone(baseline); refusal = null; point = location; executions = reads = 0;
      ioFailure = new Error('owned IO failure');
      const expected = { session: [401, 'SESSION_INVALID'], owner: [404, 'GAME_NOT_FOUND'], fence: [409, 'GAME_DELETING'], snapshot: [409, 'JOB_SNAPSHOT_CHANGED'] }[condition];
      transition = () => { if (expected) refusal = new HttpError(...expected); if (condition === 'job') job.rowRevision = '2'; };
      const before = rows();
      await assert.rejects(api.read(token, path), error => {
        if (expected) return error === refusal;
        if (condition === 'job') return error instanceof HttpError && error.status === 409 && error.code === 'JOB_CHANGED';
        return error === ioFailure;
      }, `${location}/${condition}`);
      assert.equal(executions, 1); assert.equal(reads, location === 'blob' ? 1 : 0);
      assert.deepEqual(rows(), before);
      groups++;
    }
  }
  job = structuredClone(baseline); refusal = null; point = null; executions = reads = 0;
  const before = rows(), result = await api.read(token, path);
  assert.deepEqual(result.artifact, { bytes, assetId: output.assetId, sha256: output.sha256 });
  assert.deepEqual(api.assertCurrent(token, path, result), baseline);
  assert.equal(executions, 1); assert.equal(reads, 1); assert.deepEqual(rows(), before); groups++;
  process.stdout.write(JSON.stringify({ result: 'PASS-STAGE-READ-AUTHORITY-CONTRACT', groups,
    scope: 'StageJobsAPI read orchestration, explicit query/execute/blob fixtures and in-memory SQLite; no real login, HTTP, compiler, provider or full stage proof' }) + '\n');
} finally { storage.close(); }
