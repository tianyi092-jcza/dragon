// Actual fixed41Web inputs -> owned R2/SQLite/workerd registry + shared full copy. No public writes.
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { request as httpsRequest } from 'node:https';
import { pathToFileURL } from 'node:url';
import { createEditorHTTPS } from './editor_local_https.mjs';
import { installedSourcePolicy } from '../server/sourcecatalogpolicy.js';
import { InstalledSourceCatalog } from '../server/sourcecatalog.js';
import { canonicalSourceTokens, encodeSourceChunks } from '../web/src/content/authoring/sourcejson.js';
const { Miniflare } = await import(pathToFileURL(process.env.MINIFLARE_MODULE).href);
const d = '.dragon-analysis/editor-phase/backend-source-catalog-session-r1/', own = mkdtempSync(join(tmpdir(), 'dragon-catalog-')), origin = 'https://127.0.0.1:8787';
const initial = randomBytes(24).toString('hex'), password = randomBytes(24).toString('hex'), nextPassword = randomBytes(24).toString('hex'), secret = randomBytes(32).toString('hex');
const sha = b => createHash('sha256').update(b).digest('hex');
function json(text) { try { return JSON.parse(text); } catch (cause) { throw new Error('invalid owned catalog JSON', { cause }); } }
function canonical(value) { return Buffer.concat(encodeSourceChunks(value)); }
const r = 'map-2-47e35876cd32ff3b7eee27da3be95eaa1b52a6d108a6f94c1f5989bc68861d23', e = '086ca8a87e2dafb2b7c9d657a74b70c81b5da3e98776e5d7d8c21dcfc5a982a5';
const world = readFileSync(`web/content/builtin/compiled/${r}/manifest.json`), entities = readFileSync(`web/content/builtin/authoring/entities-${e}/manifest.json`), policy = installedSourcePolicy(world, entities), inputHashes = {};
const definitionDigest = sha(Buffer.from([...canonicalSourceTokens(policy)].join(''))), registryId = policy.registryId;
let getterHits = 0; const fake = { ...policy }; Object.defineProperty(fake, 'roles', { enumerable: true, get() { getterHits++; return policy.roles; } });
assert.throws(() => new InstalledSourceCatalog({ storage: { sql: {} }, bucket: { get() {} }, principal() {}, policy: fake }), /branded/); assert.equal(getterHits, 0);
assert.throws(() => new InstalledSourceCatalog({ storage: { sql: {} }, bucket: { get() {} }, principal() {}, policy: json(canonical(policy)) }), /branded/);
assert.throws(() => installedSourcePolicy(new Uint8Array([1]), entities), error => error.status === 503);
const files = ['server/sourcecatalog.js', 'server/sourcecatalogpolicy.js', 'tools/verify_editor_backend_source_catalog.mjs', d + 'fixture-worker.js', 'tools/editor_trusted_copy.mjs', 'server/copyprofile.js', 'tools/editor_local_https.mjs'];
const sourceHashes = Object.fromEntries(files.map(p => [p, sha(readFileSync(p))])); let mf, front, bucket;
function build() { return new Miniflare({ name: 'catalog-fixture', modules: true, scriptPath: resolve(d + 'fixture-worker.js'), compatibilityDate: '2026-01-01', compatibilityFlags: ['nodejs_compat'], modulesRules: [{ type: 'ESModule', include: ['**/*.js', '**/*.mjs'] }, { type: 'Text', include: ['**/*.html', '**/*.txt', '**/*.css'] }], host: '127.0.0.1', port: 0, https: false, durableObjects: { EDITOR_METADATA: { className: 'CatalogFixture', useSQLite: true } }, durableObjectsPersist: join(own, 'metadata'), r2Buckets: ['EDITOR_BLOBS'], r2Persist: join(own, 'blobs'), bindings: { EDITOR_ORIGIN: origin, EDITOR_DEFAULT_PASSWORD: initial, EDITOR_REQUEST_KEY: secret, EDITOR_ACCOUNT_LIMIT: '50', EDITOR_SOURCE_LIMIT: '100', FIXTURE_WORLD: world.toString('base64'), FIXTURE_ENTITIES: entities.toString('base64') } }); }
async function reopen() { await front?.close(); front = undefined; await mf?.dispose(); mf = build(); await mf.ready; front = await createEditorHTTPS(mf); bucket = await mf.getR2Bucket('EDITOR_BLOBS'); }
const calls = [];
async function call(path, value, session, overrides = {}) {
  const payload = JSON.stringify(value), headers = { 'Content-Type': 'application/json', Origin: origin, 'Idempotency-Key': randomUUID(), 'Content-Length': Buffer.byteLength(payload) }; if (session) { headers.Cookie = session.cookie; headers['X-CSRF-Token'] = session.csrf; } Object.assign(headers, overrides);
  const result = await new Promise((done, reject) => { const request = httpsRequest(origin + path, { method: 'POST', headers, rejectUnauthorized: false, agent: false }, response => { const chunks = []; response.on('data', c => chunks.push(c)); response.on('error', reject); response.on('end', () => done({ status: response.statusCode, data: json(Buffer.concat(chunks).toString()), cookie: response.headers['set-cookie']?.[0]?.split(';')[0] })); }); request.on('error', reject); request.end(payload); }); calls.push({ path, status: result.status }); return result;
}
const fixture = (value, session, overrides) => call('/api/fixture/catalog', value, session, overrides);
async function ok(value, session) { const result = await fixture(value, session); assert.equal(result.status, 200, result.data.error); return result.data; }
async function login(account) { const result = await call('/api/auth/login', { account, password: initial }); assert.equal(result.status, 200); const changed = await call('/api/auth/password', { oldPassword: initial, newPassword: password }, { cookie: result.cookie, csrf: result.data.csrf }); assert.equal(changed.status, 200); return { cookie: changed.cookie, csrf: changed.data.csrf, user: changed.data.user }; }
async function put(bytes) { const part = { sha256: sha(bytes), byteLength: bytes.length }, key = `installed/${registryId}/${part.sha256}`, present = await bucket.get(key); if (present) { const actual = new Uint8Array(await present.arrayBuffer()); assert.equal(actual.length, bytes.length); assert.equal(sha(actual), part.sha256); } else assert.notEqual(await bucket.put(key, bytes, { onlyIf: { etagDoesNotMatch: '*' } }), null); return part; }
const checks = [];
try {
  await reopen(); let admin = await login('tianyi'); assert.equal((await call('/api/admin/accounts', { account: 'author_a' }, admin)).status, 200); const author = await login('author_a');
  const roles = []; let totalBytes = 0;
  for (const role of policy.roles) { const bytes = readFileSync('web/' + role.path); assert.equal(bytes.length, role.byteLength); assert.equal(sha(bytes), role.sha256); inputHashes['web/' + role.path] = sha(bytes); totalBytes += bytes.length; const chunks = []; for (let offset = 0; offset < bytes.length; offset += 1024 * 1024) chunks.push(await put(bytes.subarray(offset, offset + 1024 * 1024))); roles.push({ ...role, chunks }); }
  assert.equal(roles.length, 41); assert.equal(totalBytes, 57943821);
  const index = { schema: 'dragon-installed-source-index-1', registryId, definitionDigest, roles }, root = await put(canonical(index));
  const before = await ok({ action: 'count' }, admin), request = { action: 'install', root, key: randomUUID() };
  assert.equal((await fixture(request, author)).status, 403); assert.equal((await fixture(request, admin, { Origin: 'http://127.0.0.1:8787' })).status, 403); assert.equal((await fixture(request, admin, { 'X-CSRF-Token': 'wrong' })).status, 403); assert.equal((await ok({ action: 'count' }, admin)).reads, before.reads);
  assert.equal((await fixture({ action: 'assert', ticket: { valid: true } }, admin)).status, 403);
  checks.push('actual fixed two manifest anchors mint branded41role policy; DTO/getter/author/Origin/CSRF never register or read R2 before authority');
  await ok({ action: 'fault', enabled: true }, admin); assert.equal((await fixture(request, admin)).status, 500); await ok({ action: 'fault', enabled: false }, admin); assert.equal((await ok({ action: 'count' }, admin)).rows, 0);
  const race = await Promise.all([fixture(request, admin), fixture(request, admin)]); for (const result of race) assert.equal(result.status, 200, result.data.error); assert.deepEqual(race[0].data, race[1].data); assert.equal((await ok({ action: 'count' }, admin)).rows, 1); assert.equal((await ok({ action: 'count' }, admin)).operations, 1); assert.equal((await ok(request, admin)).rootDigest, root.sha256);
  checks.push('actual57,943,821bytes in immutable1MiB R2 chunks fully read/hash, sameSQLite registration/permanent-key race single row+receipt; trigger failure rolls both back');
  const copied = await ok({ action: 'copy' }, admin); assert.equal(copied.chapters, 20); assert.equal(copied.sourceRecords, 2540); assert.equal(copied.inputs, 41); assert.equal((await ok({ action: 'assert', ticket: copied.ticket }, admin)).registryId, registryId); assert.equal((await fixture({ action: 'copy' }, author)).status, 403); assert.equal((await ok({ action: 'read-capture', ticket: copied.ticket, path: roles[0].path }, admin)).byteLength, roles[0].byteLength); assert.equal((await fixture({ action: 'read-capture', ticket: copied.ticket, path: '../escape' }, admin)).status, 404);
  checks.push('materialized actual registered R2 roles feed unchanged shared installed-source/entity/copy loader inside real Worker; twenty chapters2540records, no arbitrary fs or client baseline grant');
  async function rejectedIndex(modified, status = 422) { const badRoot = await put(canonical(modified)); assert.equal((await fixture({ ...request, root: badRoot, key: randomUUID() }, admin)).status, status); }
  await rejectedIndex({ ...index, roles: roles.slice(1) }); await rejectedIndex({ ...index, registryId: 'latest' }); await rejectedIndex({ ...index, definitionDigest: '0'.repeat(64) }); await rejectedIndex({ ...index, roles: roles.toReversed() });
  await rejectedIndex({ ...index, roles: [{ ...roles[0], path: '../escape' }, ...roles.slice(1)] }); await rejectedIndex({ ...index, roles: [{ ...roles[0], chunks: [{ sha256: '0'.repeat(64), byteLength: roles[0].byteLength }] }, ...roles.slice(1)] }, 404);
  assert.equal((await fixture({ ...request, root: { ...root, valid: true } }, admin)).status, 422); assert.equal((await fixture({ ...request, registryId: [registryId] }, admin)).status, 404); assert.equal((await fixture({ ...request, root: { sha256: root.sha256, byteLength: 1024 * 1024 + 1 } }, admin)).status, 413);
  const part = roles[0].chunks[0], key = `installed/${registryId}/${part.sha256}`, original = new Uint8Array(await (await bucket.get(key)).arrayBuffer()); await bucket.put(key, new Uint8Array(original.length)); assert.equal((await fixture({ action: 'copy' }, admin)).status, 503); await bucket.put(key, original);
  checks.push('actual missing/hash-corrupt role objects, bad role order/count/path/profile/root identity/self-valid/array alias and budgets fail closed; stored row not replaced or auto-latest');
  for (const bytes of [Buffer.from('{}\n'), Buffer.from('{"a":1,"a":2}'), new Uint8Array([0xc0, 0x80])]) { const malformed = await put(bytes); assert.equal((await fixture({ ...request, root: malformed, key: randomUUID() }, admin)).status, 422); }
  const wrongBytes = new Uint8Array(firstByteLength()); const wrongPart = await put(wrongBytes);
  await rejectedIndex({ ...index, roles: [{ ...roles[0], chunks: [wrongPart] }, ...roles.slice(1)] }, 503);
  function firstByteLength() { return roles[0].byteLength; }
  await ok({ action: 'receipt-fault', key: request.key, enabled: true }, admin); assert.equal((await fixture(request, admin)).status, 503); await ok({ action: 'receipt-fault', key: request.key, enabled: false }, admin); assert.equal((await ok(request, admin)).rootDigest, root.sha256);
  checks.push('actual noncanonical/duplicate/invalidUTF8 index and individually valid fragment with wrong whole-role digest rejected; corrupted stored validDTO receipt503 not replayed as authority');
  const first = roles[0], firstBytes = readFileSync('web/' + first.path), alternateChunks = [await put(firstBytes.subarray(0, 1)), await put(firstBytes.subarray(1))], alternate = await put(canonical({ ...index, roles: [{ ...first, chunks: alternateChunks }, ...roles.slice(1)] }));
  assert.equal((await fixture({ ...request, root: alternate }, admin)).status, 409); assert.equal((await fixture({ ...request, root: alternate, key: randomUUID() }, admin)).status, 409);
  await ok({ ...request, mutate: true, key: randomUUID() }, admin); assert.equal((await ok({ action: 'status' }, admin)).rootDigest, root.sha256);
  await ok({ action: 'profile-fault', enabled: true }, admin); assert.equal((await fixture({ action: 'copy' }, admin)).status, 409); await ok({ action: 'profile-fault', enabled: false }, admin);
  checks.push('same key/different fully valid index409, immutable registration refuses rebase with fresh key, input captured before await; mismatched persisted profile409 without trusting DTO');
  await reopen(); assert.equal((await ok({ action: 'status' }, admin)).rootDigest, root.sha256); assert.equal((await fixture({ action: 'assert', ticket: copied.ticket }, admin)).status, 403); const fresh = await ok({ action: 'copy' }, admin); assert.equal(fresh.chapters, 20); assert.equal(fresh.inputs, 41);
  checks.push('actual Worker restart retains SQLite registered version and permanent receipts/R2 bytes/sessions; old memory brand lost, explicit trusted-byte recapture restores new content cap');
  const pending = fixture({ ...request, slow: true, key: randomUUID() }, admin); const until = Date.now() + 5000; let busy = false; while (Date.now() < until) { if ((await ok({ action: 'busy' }, admin)).busy) { busy = true; break; } await new Promise(done => setTimeout(done, 20)); } assert.ok(busy);
  const changed = await call('/api/auth/password', { oldPassword: password, newPassword: nextPassword }, admin); assert.equal(changed.status, 200); const renewed = { cookie: changed.cookie, csrf: changed.data.csrf, user: changed.data.user }; assert.equal((await pending).status, 401); assert.equal((await fixture({ action: 'assert', ticket: fresh.ticket }, renewed)).status, 401); assert.equal((await fixture({ action: 'read-capture', ticket: fresh.ticket, path: roles[0].path }, renewed)).status, 401); assert.equal((await fixture(request, renewed)).status, 409); admin = renewed;
  assert.equal((await ok({ action: 'count' }, admin)).rows, 1); assert.equal((await call('/api/games/copy-builtin', {}, admin)).status, 404);
  checks.push('controlled real awaited R2 read + SQLite password epoch recheck aborts registration; new token cannot revive old cap/key or captured readWeb; production copy/save/compile/publish still closed');
  for (const [p, h] of Object.entries({ ...inputHashes, ...sourceHashes })) assert.equal(sha(readFileSync(p)), h, p);
  process.stdout.write(JSON.stringify({ result: 'PASS-REAL-R2-SQLITE-PINNED-SOURCE-CATALOG', checks, calls, roleCount: 41, totalBytes, inputHashes, sourceHashes, getterHits, limits: 'Actual local fixed role byte registry and shared full copy only. Host privileged immutable R2 staging fixture, no ordinary source upload writer/production API, no image decode/runtime/Q69/copy metadata creation or production memory/CPU/SLA.' }, null, 2) + '\n');
} finally { await front?.close(); await mf?.dispose(); }
