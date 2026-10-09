// Real Root/launcher, owned SQL/R2 and fixed full-copy drafts. No fixture routes or user data.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { request as httpsRequest } from 'node:https';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { startEditorBackend } from './start_editor_backend.mjs';
import { decodeSourceChunks } from '../web/src/content/authoring/sourcejson.js';
import { editChapterResources } from '../web/src/editor/chapterresources.js';
const own = mkdtempSync(join(tmpdir(), 'dragon-private-draft-')), origin = 'https://127.0.0.1:8787';
const initial = randomBytes(24).toString('hex'), password = randomBytes(24).toString('hex'), secret = randomBytes(32).toString('hex');
const sha = b => createHash('sha256').update(b).digest('hex');
function json(b) { try { return JSON.parse(b); } catch (cause) { throw new Error('invalid owned draft test JSON', { cause }); } }
const files = ['server/drafts.js', 'server/worker.js', 'tools/verify_editor_backend_private_draft.mjs'], sourceHashes = Object.fromEntries(files.map(p => [p, sha(readFileSync(p))]));
const configPath = join(own, 'wrangler.jsonc'), doc = json(readFileSync('server/wrangler.jsonc')); doc.main = resolve('server/worker.js');
writeFileSync(configPath, JSON.stringify(doc)); writeFileSync(join(own, '.dev.vars'), 'EDITOR_DEFAULT_PASSWORD=' + JSON.stringify(initial) + '\nEDITOR_REQUEST_KEY=' + JSON.stringify(secret) + '\n', { flag: 'wx', mode: 0o600 });
let server; const calls = [], checks = [];
async function call(path, value, session, extra = {}) {
  const headers = { Origin: origin }; if (session) { headers.Cookie = session.cookie; headers['X-CSRF-Token'] = session.csrf; } Object.assign(headers, extra);
  if (value !== undefined) { headers['Content-Type'] = 'application/json'; headers['Idempotency-Key'] ??= randomUUID(); }
  const r = await new Promise((done, reject) => { const req = httpsRequest(origin + path, { method: value === undefined ? 'GET' : 'POST', headers, rejectUnauthorized: false }, res => { const parts = []; res.on('data', b => parts.push(b)); res.on('error', reject); res.on('end', () => done({ status: res.statusCode, data: json(Buffer.concat(parts).toString()), cookie: res.headers['set-cookie']?.[0]?.split(';')[0] })); }); req.on('error', reject); req.end(value === undefined ? undefined : JSON.stringify(value)); });
  calls.push({ path: path.replace(/\/api\/games\/[^/]+/, '/api/games/<owned-or-negative>'), status: r.status }); return r;
}
async function login(account) { const r = await call('/api/auth/login', { account, password: initial }); assert.equal(r.status, 200); const c = await call('/api/auth/password', { oldPassword: initial, newPassword: password }, { cookie: r.cookie, csrf: r.data.csrf }); assert.equal(c.status, 200); return { cookie: c.cookie, csrf: c.data.csrf, user: c.data.user }; }
function databases(dir) { return readdirSync(dir, { withFileTypes: true }).flatMap(e => { const p = join(dir, e.name); if (e.isDirectory()) return databases(p); if (e.name.endsWith('.sqlite')) return [p]; return []; }); }
function authorityDB() { for (const p of databases(join(own, '.local/metadata'))) { const db = new DatabaseSync(p); if (db.prepare("SELECT name FROM sqlite_master WHERE name='copy_origins'").get()) return db; db.close(); } throw new Error('owned authority DB missing'); }
async function pending(path, key, session, request) {
  let settled = false; const task = request.then(value => { settled = true; return { value }; }, error => { settled = true; return { error }; });
  const queries = []; let observed = false;
  for (let i = 0; i < 100; i++) {
    const r = await call(path + '/operations/' + key, undefined, session); queries.push({ status: r.status, state: r.data.state });
    if (r.status === 200 && r.data.state === 'pending') { assert.equal(r.data.error, null); assert.equal(r.data.status, null); observed = true; break; }
    assert.ok(r.status === 404 || r.status === 200 && ['failed','committed'].includes(r.data.state));
    if (settled) break; // Independent HTTP queries need not observe a transient state.
  }
  return { task, queries, observed };
}
try {
  process.stderr.write('draft: fixed bootstrap/fullcopy\n'); server = await startEditorBackend(configPath, { stageSource: true }); const admin = await login('tianyi');
  assert.equal((await call('/api/admin/accounts', { account: 'draft_author' }, admin)).status, 200); const foreign = await login('draft_author');
  assert.equal((await call('/api/admin/source/install', {}, admin)).status, 200); const source = (await call('/api/admin/source', undefined, admin)).data;
  const op = randomUUID(), created = await call('/api/admin/copies', { registryId: source.definition.registryId, name: '私有原稿', introduction: '原文' }, admin, { 'Idempotency-Key': op }); assert.equal(created.status, 202);
  const copy = await call('/api/admin/copies/' + op + '/run', {}, admin, { 'If-Match': '"1"' }); assert.equal(copy.status, 200, copy.data.error); const gameId = copy.data.gameId, path = '/api/games/' + gameId + '/draft';
  assert.equal((await call(path + '?revision=1')).status, 401); assert.equal((await call(path + '?revision=1', undefined, foreign)).status, 404); assert.equal((await call('/api/games/wolong-builtin/draft?revision=1', undefined, admin)).status, 403);
  assert.equal((await call(path, undefined, admin)).status, 422); assert.equal((await call(path + '?revision=1&revision=1', undefined, admin)).status, 422);
  process.stderr.write('draft: exact private read\n'); const first = await call(path + '?revision=1', undefined, admin); assert.equal(first.status, 200, first.data.error); assert.equal(first.data.chapters.length, 20); assert.deepEqual(first.data.metadata, { name: '私有原稿', introduction: '原文' });
  const chapterId = first.data.chapters[0].chapterId, old = first.data.chapters[0].factions[0]; checks.push('real full-copy origin/R2/shared profile, exact private20chapter read; guest401/foreign404/builtin403/repeated or missing revision reject');
  const noOp = { metadata: first.data.metadata, resourceEdits: [] }, header1 = { 'If-Match': '"1"' };
  const originalSummary = (await call('/api/games', undefined, admin)).data.games[0];
  for (const extra of [{ Origin: 'https://invalid.example', ...header1 }, { 'X-CSRF-Token': 'invalid', ...header1 }]) assert.equal((await call(path + '/save', noOp, admin, extra)).status, 403);
  assert.equal((await call(path + '/save', noOp, admin)).status, 428);
  assert.equal((await call(path + '/save', { ...noOp, source: { valid: true } }, admin, header1)).status, 422);
  assert.equal((await call(path + '/save', { ...noOp, resourceEdits: [{ chapterId, slot: 0, values: { monarch: 0 } }] }, admin, header1)).status, 422);
  assert.equal((await call(path + '/save', { ...noOp, resourceEdits: [{ chapterId, slot: 0, values: { money: null } }] }, admin, header1)).status, 422);
  process.stderr.write('draft: no-op save\n'); const unchanged = await call(path + '/save', noOp, admin, header1); assert.equal(unchanged.status, 200, unchanged.data.error); assert.deepEqual(unchanged.data, originalSummary); checks.push('strict patch only/no raw/map/role/valid DTO, Origin/CSRF/IfMatch; actual no-op keeps revision/modifiedAt unchanged');
  const editedValues = { money: old.money + 100, reserve_cav: old.reserve_cav + 1, reserve_arc: old.reserve_arc + 2, reserve_inf: old.reserve_inf + 3 }, patch = { metadata: { name: '修改稿', introduction: 'É😀' }, resourceEdits: [{ chapterId, slot: 0, values: editedValues }] }, key = randomUUID(), header = { ...header1, 'Idempotency-Key': key };
  process.stderr.write('draft: metadata/four-resource save\n'); const saved = await call(path + '/save', patch, admin, header); assert.equal(saved.status, 200, saved.data.error); assert.equal(saved.data.draftRevision, '2'); assert.deepEqual(saved.data.metadata, patch.metadata); assert.notEqual(saved.data.modifiedAt, originalSummary.modifiedAt);
  assert.deepEqual((await call(path + '/save', patch, admin, header)).data, saved.data); assert.deepEqual((await call(path + '/operations/' + key, undefined, admin)).data, { state: 'committed', result: saved.data });
  assert.equal((await call('/api/admin/accounts', { account: 'wrong_namespace' }, admin, { 'Idempotency-Key': key })).status, 409);
  assert.equal((await call(path + '/save', { ...patch, metadata: { name: '異內容', introduction: '' } }, admin, header)).status, 409);
  const stale = await call(path + '/save', patch, admin, header1); assert.equal(stale.status, 412); assert.deepEqual((await call('/api/games', undefined, admin)).data.games[0], saved.data);
  const after = await call(path + '?revision=2', undefined, admin); assert.equal(after.status, 200, after.data.error); assert.deepEqual(after.data.chapters[0].factions[0], { slot: 0, ...editedValues }); assert.deepEqual((await call(path + '?revision=1', undefined, admin)).data, first.data);
  checks.push('actual atomic revision2 metadata/four-resource writer, immutable revision1, permanent request/result replay and cross-namespace guards, stale412 preserves actual saved state');
  process.stderr.write('draft: persisted source inspection\n'); await server.close(); server = undefined;
  const db = authorityDB(); const roots = db.prepare('SELECT * FROM content_snapshots WHERE game_id=? ORDER BY revision').all(gameId), copyOrigin = db.prepare('SELECT * FROM copy_origins WHERE game_id=?').get(gameId);
  assert.equal(roots.length, 2); assert.equal(db.prepare('SELECT COUNT(*) AS n FROM draft_references WHERE game_id=? AND revision=?').get(gameId, '2').n > 1, true);
  const sizes = new Map([...db.prepare('SELECT sha256,byte_length FROM copy_objects WHERE game_id=?').all(gameId), ...db.prepare('SELECT sha256,byte_length FROM draft_objects WHERE game_id=?').all(gameId)].map(r => [r.sha256, r.byte_length])); db.close();
  const { Miniflare } = await import(pathToFileURL(process.env.MINIFLARE_MODULE).href), inspection = new Miniflare({ modules: true, script: 'export default {fetch(){return new Response("owned read-only inspection")}}', r2Buckets: ['EDITOR_BLOBS'], r2Persist: join(own, '.local/blobs') });
  let baseline, candidate; try { const bucket = await inspection.getR2Bucket('EDITOR_BLOBS'); async function readRoot(rootKey) { const object = await bucket.get(rootKey); assert.ok(object); const bytes = new Uint8Array(await object.arrayBuffer()), digest = rootKey.split('/').at(-1); assert.equal(bytes.length, sizes.get(digest)); assert.equal(sha(bytes), digest); const index = decodeSourceChunks([bytes]), parts = []; for (const part of index.chunks) { const object = await bucket.get('private/' + gameId + '/' + part.sha256); assert.ok(object); const data = new Uint8Array(await object.arrayBuffer()); assert.equal(data.length, part.byteLength); assert.equal(sha(data), part.sha256); parts.push(data); } assert.equal(sha(Buffer.concat(parts)), index.sourceDigest); return decodeSourceChunks(parts); }
    baseline = await readRoot('private/' + gameId + '/' + copyOrigin.baseline_root); candidate = await readRoot(roots[1].root_key);
  } finally { await inspection.dispose(); }
  const expectedGame = editChapterResources({ ...baseline, metadata: patch.metadata }, chapterId, 0, editedValues); assert.deepEqual(candidate, expectedGame); candidate = undefined; baseline = undefined;
  checks.push('independent actual R2 allchunks/canonical full-source comparison to untouched baseline plus shared writer; source IDs/raw other than permitted9bytes/map/other19chapters remain exact; SQL refs real');
  server = await startEditorBackend(configPath); assert.deepEqual((await call(path + '/operations/' + key, undefined, admin)).data.result, saved.data);
  assert.deepEqual((await call(path + '/save', patch, admin, header)).data, saved.data); assert.deepEqual((await call(path + '?revision=1', undefined, admin)).data, first.data);
  checks.push('real launcher restart preserves source/revisions/refs/operation and current session; exact immutable receipt not latest');
  process.stderr.write('draft: concurrent no-op CAS\n'); const noOp2 = { metadata: saved.data.metadata, resourceEdits: [] }, raceKey = randomUUID(), raceHeaders = { 'If-Match': '"2"', 'Idempotency-Key': raceKey };
  const race = await Promise.all([call(path + '/save', noOp2, admin, raceHeaders), call(path + '/save', noOp2, admin, raceHeaders)]); assert.deepEqual(race.map(r => r.status), [200, 200]); assert.deepEqual(race[0].data, saved.data); assert.deepEqual(race[1].data, saved.data);
  checks.push('actual same-key concurrent async prepare/CAS one permanent result; no-op keeps revision/modifiedAt and exact owner');
  process.stderr.write('draft: SQL receipt fault/retry\n'); await server.close(); server = undefined; const fault = authorityDB(); fault.exec("CREATE TRIGGER owned_fail_draft BEFORE INSERT ON content_operations WHEN NEW.method='save' BEGIN SELECT RAISE(ABORT,'owned draft receipt failure'); END;"); fault.close(); server = await startEditorBackend(configPath);
  const failureKey = randomUUID(), failedPatch = { metadata: { name: '重試稿', introduction: '保留原文' }, resourceEdits: [] }, failureHeaders = { 'If-Match': '"2"', 'Idempotency-Key': failureKey };
  assert.equal((await call(path + '/save', failedPatch, admin, failureHeaders)).status, 500); assert.deepEqual((await call('/api/games', undefined, admin)).data.games[0], saved.data);
  assert.equal((await call(path + '/operations/' + failureKey, undefined, admin)).data.state, 'failed');
  await server.close(); server = undefined; const clear = authorityDB(); assert.equal(clear.prepare('SELECT COUNT(*) AS n FROM content_snapshots WHERE game_id=?').get(gameId).n, 2); assert.equal(clear.prepare('SELECT COUNT(*) AS n FROM draft_references WHERE game_id=? AND revision=?').get(gameId, '3').n, 0); clear.exec('DROP TRIGGER owned_fail_draft');
  clear.exec("CREATE TABLE owned_retry_transitions (old_state TEXT,new_state TEXT,error_code TEXT,error_status INTEGER); CREATE TRIGGER owned_retry_transition AFTER UPDATE OF state ON draft_requests WHEN OLD.state='failed' AND NEW.state='pending' BEGIN INSERT INTO owned_retry_transitions VALUES(OLD.state,NEW.state,NEW.error_code,NEW.error_status); END; CREATE TRIGGER owned_require_retry_pending BEFORE UPDATE OF state ON draft_requests WHEN NEW.state='committed' AND (OLD.state<>'pending' OR OLD.error_code IS NOT NULL OR OLD.error_status IS NOT NULL) BEGIN SELECT RAISE(ABORT,'owned retry state not reset'); END;");
  clear.close(); server = await startEditorBackend(configPath);
  const retryObservation = await pending(path, failureKey, admin, call(path + '/save', failedPatch, admin, failureHeaders)), retryTask = await retryObservation.task;
  if (retryTask.error) throw retryTask.error; const retried = retryTask.value; assert.equal(retried.status, 200, retried.data.error); assert.equal(retried.data.draftRevision, '3');
  process.stderr.write(JSON.stringify({ phase: 'owned retry query scheduling', observedPending: retryObservation.observed, queries: retryObservation.queries, requestStatus: retried.status }) + '\n');
  checks.push('actual last receipt INSERT fault rolls back game/revision/name/snapshot/refs; explicit exact-key retry clears errors and transitions failed->pending under owned SQL trigger before committing revision3, without requiring unordered HTTP queries to see the transient state');
  process.stderr.write('draft: fixed service-definition pin\n'); await server.close(); server = undefined;
  const tamper = authorityDB(), definitionDigest = copyOrigin.definition_digest;
  assert.deepEqual(tamper.prepare('SELECT * FROM owned_retry_transitions').all().map(row => ({ ...row })), [{ old_state: 'failed', new_state: 'pending', error_code: null, error_status: null }]); tamper.exec('DROP TRIGGER owned_retry_transition; DROP TRIGGER owned_require_retry_pending; DROP TABLE owned_retry_transitions');
  tamper.prepare('UPDATE installed_sources SET definition_digest=? WHERE registry_id=?').run('0'.repeat(64), copyOrigin.registry_id); tamper.prepare('UPDATE copy_origins SET definition_digest=? WHERE game_id=?').run('0'.repeat(64), gameId); tamper.close(); server = await startEditorBackend(configPath);
  assert.equal((await call(path + '?revision=1', undefined, admin)).status, 409);
  assert.equal((await call(path + '/save', patch, admin, header)).status, 409);
  assert.equal((await call(path + '/operations/' + key, undefined, admin)).status, 409);
  assert.deepEqual((await call('/api/games', undefined, admin)).data.games[0], retried.data);
  await server.close(); server = undefined; const restore = authorityDB(); restore.prepare('UPDATE installed_sources SET definition_digest=? WHERE registry_id=?').run(definitionDigest, copyOrigin.registry_id); restore.prepare('UPDATE copy_origins SET definition_digest=? WHERE game_id=?').run(definitionDigest, gameId); restore.close(); server = await startEditorBackend(configPath);
  checks.push('actual wrong matching catalog+origin SQL definitions cannot replace fixed service definition: read/save/replay409 before source admission, saved state unchanged; owned SQL restored explicitly');
  // Epoch-during-await requires a separately controlled actual read port, not
  // unordered public polling. This public suite does not claim that race yet.
  const logout = await call('/api/auth/logout', {}, admin); assert.equal(logout.status, 200); assert.equal((await call(path + '?revision=1', undefined, admin)).status, 401);
  assert.equal((await call('/api/games/' + gameId + '/validate', {}, foreign)).status, 404); checks.push('private read/write require live session; no new runtime/compiler/Trial/release routes or uploaded whole-source authority');
  for (const [p,h] of Object.entries(sourceHashes)) assert.equal(sha(readFileSync(p)), h);
  process.stdout.write(JSON.stringify({ result: 'PASS-REAL-PRIVATE-FIXED-COPY-DRAFT', checks, calls, sourceHashes, revisions: ['1','2','3'], limits: 'Actual local Root/SQL/R2 fixed-copy private drafts, representation-safe patches only. No playable ranges/whole editor/CloudflareSLA/compile/image/Q69/Trial/release/cleanup or cloud deployment.' }, null, 2)+'\n');
} finally { await server?.close(); }
