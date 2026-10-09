// Actual default Root, owned local SQLite/R2 and engineering credentials only.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { request as httpsRequest } from 'node:https';
import { startEditorBackend } from './start_editor_backend.mjs';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function json(text) { try { return JSON.parse(text); } catch (cause) { throw new Error('owned library response/config JSON invalid', { cause }); } }
const own = mkdtempSync(join(tmpdir(), 'dragon-available-library-')), configPath = join(own, 'worker.json'), doc = json(readFileSync('server/wrangler.jsonc', 'utf8'));
doc.main = resolve('server/worker.js'); doc.name = 'library-owned-' + randomUUID();
const initial = randomBytes(24).toString('hex'), password = randomBytes(24).toString('hex');
writeFileSync(configPath, JSON.stringify(doc), { flag: 'wx' });
writeFileSync(join(own, '.dev.vars'), 'EDITOR_DEFAULT_PASSWORD=' + JSON.stringify(initial) + '\nEDITOR_REQUEST_KEY=' + JSON.stringify(randomBytes(32).toString('hex')) + '\n', { flag: 'wx', mode: 0o600 });
const paths = ['server/worker.js', 'server/sourcecatalog.js', 'server/sourcecatalogpolicy.js', 'server/available-library.txt', 'tools/editor_stage_library.mjs', 'tools/start_editor_backend.mjs', 'tools/verify_editor_backend_available_library.mjs'];
const sourceHashes = Object.fromEntries(paths.map(path => [path, sha(readFileSync(path))])), calls = [], checks = [];
let server;
async function call(path, body, session, key = randomUUID(), overrides = {}) {
  const headers = { Origin: server.url.origin, 'Idempotency-Key': key, Connection: 'close', ...overrides };
  if (session) { headers.Cookie = session.cookie; headers['X-CSRF-Token'] = session.csrf; }
  const encoded = body === undefined ? null : JSON.stringify(body); if (encoded !== null) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(encoded); }
  const reply = await new Promise((done, reject) => {
    const request = httpsRequest(new URL(path, server.url), { method: body === undefined ? 'GET' : 'POST', headers, rejectUnauthorized: false, agent: false }, response => {
      const pieces = []; response.on('data', bytes => pieces.push(bytes)); response.on('error', reject); response.on('end', () => done({ status: response.statusCode, data: json(Buffer.concat(pieces).toString()), cookie: response.headers['set-cookie']?.[0]?.split(';')[0] }));
    }); request.on('error', reject); request.end(encoded);
  }); calls.push({ path, status: reply.status }); return reply;
}
async function login(account) {
  const logged = await call('/api/auth/login', { account, password: initial }); assert.equal(logged.status, 200);
  const changed = await call('/api/auth/password', { oldPassword: initial, newPassword: password }, { cookie: logged.cookie, csrf: logged.data.csrf }); assert.equal(changed.status, 200);
  return { cookie: changed.cookie, csrf: changed.data.csrf, user: changed.data.user };
}
try {
  server = await startEditorBackend(configPath, { stageSource: true, stageLibrary: true });
  const admin = await login('tianyi'), before = await call('/api/admin/library', undefined, admin);
  assert.equal(before.status, 200); assert.equal(before.data.registered, null); assert.equal(before.data.definition.roleCount, 400); assert.equal(before.data.unresolvedReferences, 20); assert.equal(before.data.mode, 'STAGED_AVAILABLE_LIBRARY_NOT_Q69_CLOSURE');
  const sourceBefore = await call('/api/admin/source', undefined, admin); assert.equal(sourceBefore.status, 200); assert.equal(sourceBefore.data.definition.roleCount, 41); assert.notEqual(before.data.definition.registryId, sourceBefore.data.definition.registryId);
  checks.push('actual default Root and explicit operator bootstrap400 roles; distinct unchanged source41, not implicit SQL approval or runtime');
  assert.equal((await call('/api/admin/library', undefined)).status, 401);
  assert.equal((await call('/api/admin/accounts', { account: 'library_author' }, admin)).status, 200); const author = await login('library_author');
  assert.equal((await call('/api/admin/library', undefined, author)).status, 403); assert.equal((await call('/api/admin/library/install', {}, author)).status, 403);
  assert.equal((await call('/api/admin/library', undefined, admin, randomUUID(), { Origin: 'http://127.0.0.1:8787' })).status, 403);
  assert.equal((await call('/api/admin/library?latest=1', undefined, admin)).status, 422);
  checks.push('actual anonymous/author/Origin/query gates reject; no administrative capture granted by asset SHA or profile');
  const key = randomUUID(), installed = await call('/api/admin/library/install', {}, admin, key); assert.equal(installed.status, 200, installed.data.error); assert.equal(installed.data.rootDigest, before.data.staged.root.sha256); assert.equal(installed.data.mode, before.data.mode);
  const replay = await call('/api/admin/library/install', {}, admin, key); assert.equal(replay.status, 200); assert.deepEqual(replay.data, installed.data);
  const status = await call('/api/admin/library', undefined, admin); assert.equal(status.data.registered.rootDigest, installed.data.rootDigest);
  assert.equal((await call('/api/admin/library/install', { root: before.data.staged.root, valid: true }, admin)).status, 422);
  assert.equal((await call('/api/admin/source/install', {}, admin, key)).status, 409);
  assert.equal((await call('/api/games', undefined, admin)).data.games.length, 0);
  checks.push('all actual R2 bytes verified before SQLite registration; permanent exact replay; same key other registry409 and no game/draft/modifiedAt writes');
  await server.close(); server = undefined;
  server = await startEditorBackend(configPath);
  assert.equal((await call('/api/admin/library', undefined, admin)).data.registered.rootDigest, installed.data.rootDigest);
  assert.equal((await call('/api/admin/library/install', {}, admin, key)).status, 200);
  assert.equal((await call('/api/admin/source', undefined, admin)).data.registered, null);
  checks.push('real launcher/Worker restart retains SQL/R2 and separate descriptor without re-staging, same-key replay re-verifies actual bytes');
  const changed = await call('/api/auth/password', { oldPassword: password, newPassword: randomBytes(24).toString('hex') }, admin); assert.equal(changed.status, 200);
  assert.equal((await call('/api/admin/library', undefined, admin)).status, 401);
  const fresh = { cookie: changed.cookie, csrf: changed.data.csrf };
  assert.equal((await call('/api/admin/library/install', {}, fresh, key)).status, 409);
  assert.equal((await call('/api/admin/library/install', {}, fresh)).status, 200);
  assert.equal((await call('/api/admin/library/assets/kao/255.png', undefined, fresh)).status, 404);
  checks.push('actual password epoch revokes cookie/permanent old key; fresh explicit registration not aliasing missing255 or adding asset/trial permission');
  for (const [path, digest] of Object.entries(sourceHashes)) assert.equal(sha(readFileSync(path)), digest);
  process.stdout.write(JSON.stringify({ result: 'PASS-ACTUAL-DEFAULT-ROOT-AVAILABLE-LIBRARY-NOT-RUNTIME', checks, calls, sourceHashes, roles: 400, unresolved: 20, limits: 'Current byte library register only. No RuntimeManifest, Trial, ordinary author template, image/audio decode, all consumers or cloud SLA.' }, null, 2) + '\n');
} finally { await server?.close(); }
