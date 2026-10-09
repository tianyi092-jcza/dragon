// Actual local workerd + R2 + SQLite; isolated current Web source, no DOS/user data.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { request as httpsRequest } from 'node:https';
import { fork } from 'node:child_process';
import { Worker } from 'node:worker_threads';
import { createInterface } from 'node:readline';
import { encodeSourceChunks } from '../web/src/content/authoring/sourcejson.js';
import { createEditorHTTPS } from './editor_local_https.mjs';
const { Miniflare, Log, LogLevel } = await import(pathToFileURL(process.env.MINIFLARE_MODULE).href);
class SafeRuntimeLog extends Log { logWithLevel(level, message) { if (level > LogLevel.WARN && !/exception|Error writing response body/i.test(message)) return; console.error('runtime-event', JSON.stringify({ level, afterResponse: /request stream after response|response has been sent/i.test(message), ioContext: /context|on behalf of|different request/i.test(message), terminated: /terminated/i.test(message), timeout: /timeout/i.test(message), disturbed: /disturbed|locked|unusable/i.test(message), premature: /premature/i.test(message), sha: createHash('sha256').update(String(message)).digest('hex'), memory: /memory|heap|oom/i.test(message), stream: /stream|cancel|disconnect|socket/i.test(message), exception: /exception|error/i.test(message) })); } }
const d = '.dragon-analysis/editor-phase/backend-snapshot-session-r1/', own = mkdtempSync(join(tmpdir(), 'dragon-snapshots-')), origin = 'https://127.0.0.1:8787';
const initial = randomBytes(24).toString('hex'), password = randomBytes(24).toString('hex'), secret = randomBytes(32).toString('hex');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = bytes => { try { return JSON.parse(bytes); } catch (cause) { throw new Error('invalid owned test JSON', { cause }); } };
const files = ['server/worker.js', 'server/metadata.js', 'server/blobs.js', 'server/snapshots.js', 'server/security.js', 'web/src/content/authoring/sourcejson.js', 'tools/verify_editor_backend_snapshots.mjs', 'tools/editor_local_https.mjs', d + 'fixture-worker.js'];
const sourceHashes = Object.fromEntries(files.map(p => [p, sha(readFileSync(p))]));
let mf, bucket, activity, frontend;
async function maintainAllocation(gameId, session) {
  const env = {};
  for (const k of ['SystemRoot', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'ComSpec', 'PATH', 'Path', 'PATHEXT', 'TEMP', 'TMP', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA', 'HOMEDRIVE', 'HOMEPATH']) if (process.env[k] !== undefined) env[k] = process.env[k];
  const child = fork(resolve(d + 'allocation-activity.mjs'), [], { env, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  let failure; const closed = new Promise(done => child.once('exit', done));
  const ready = new Promise((done, reject) => { child.once('error', reject); child.on('message', m => { if (m.error) { failure = m.error; reject(new Error(m.error)); } else if (m.ready) done(); }); child.once('exit', () => reject(new Error('owned activity exited before ready'))); });
  child.send({ gameId, cookie: session.cookie, csrf: session.csrf });
  const handle = { assertHealthy() { assert.equal(failure, undefined); }, async stop() { if (child.connected) child.send({ stop: true }); await closed; } };
  activity = handle; await ready; return handle;
}
const build = () => new Miniflare({ log: new SafeRuntimeLog(LogLevel.DEBUG), verbose: true, structuredWorkerdLogs: true, handleRuntimeStdio(stdout, stderr) { for (const input of [stdout, stderr]) createInterface({ input }).on('line', line => { if (!/error|exception|failed/i.test(line)) return; console.error('native-event', JSON.stringify({ sha: sha(line), afterResponse: /request stream after response|response has been sent/i.test(line), memory: /memory|heap|oom/i.test(line), canceled: /cancel/i.test(line), ioContext: /on behalf of|different request/i.test(line), win64: /64.*WSARecv|WSARecv.*64/i.test(line), locations: [...line.matchAll(/[a-zA-Z0-9_-]+\.c\+\+:\d+/g)].map(m => m[0]).slice(0, 3) })); }); }, name: 'snapshot-fixture', modules: true, scriptPath: resolve(d + 'fixture-worker.js'), compatibilityDate: '2026-01-01', compatibilityFlags: ['nodejs_compat'], modulesRules: [{ type: 'ESModule', include: ['**/*.js'] }, { type: 'Text', include: ['**/*.html', '**/*.txt', '**/*.css'] }], host: '127.0.0.1', port: 0, https: false, durableObjects: { EDITOR_METADATA: { className: 'SnapshotFixture', useSQLite: true } }, durableObjectsPersist: join(own, 'metadata'), r2Buckets: ['EDITOR_BLOBS'], r2Persist: join(own, 'blobs'), bindings: { EDITOR_ORIGIN: origin, EDITOR_DEFAULT_PASSWORD: initial, EDITOR_REQUEST_KEY: secret, EDITOR_ACCOUNT_LIMIT: '50', EDITOR_SOURCE_LIMIT: '100' } });
const calls = [];
async function call(path, value, session, overrides = {}) {
  const started = Date.now(); console.error('request-start', path, value?.action ?? 'auth');
  assert.match((await mf.ready).origin, /^http:\/\/127\.0\.0\.1:[0-9]+$/); const headers = { 'Content-Type': 'application/json', Origin: origin, 'Idempotency-Key': randomUUID(), Connection: 'keep-alive' };
  if (session) { headers.Cookie = session.cookie; headers['X-CSRF-Token'] = session.csrf; }
  Object.assign(headers, overrides);
  const payload = JSON.stringify(value); headers['Content-Length'] = Buffer.byteLength(payload);
  const r = await new Promise((done, reject) => { const req = httpsRequest(origin + path, { method: 'POST', headers, rejectUnauthorized: false, agent: false }, res => { const chunks = []; res.on('data', b => chunks.push(b)); res.on('error', error => { console.error('response-aborted', JSON.stringify({ elapsed: Date.now() - started, status: res.statusCode, bytes: chunks.reduce((n,p)=>n+p.length,0), reused: req.reusedSocket, connection: res.headers.connection, length: res.headers['content-length'], encoding: res.headers['transfer-encoding'] })); reject(error); }); res.on('end', () => done({ status: res.statusCode, cookie: res.headers['set-cookie']?.[0]?.split(';')[0], data: json(Buffer.concat(chunks).toString()) })); }); req.on('error', reject); req.end(payload); });
  calls.push({ path, status: r.status }); console.error('request-end', path, r.status, Date.now() - started); return r;
}
const fixture = (value, session) => call('/api/fixture/snapshots', value, session);
async function login(account) { const r = await call('/api/auth/login', { account, password: initial }); assert.equal(r.status, 200); const s = { cookie: r.cookie, csrf: r.data.csrf }; const changed = await call('/api/auth/password', { oldPassword: initial, newPassword: password }, s); assert.equal(changed.status, 200); return { cookie: changed.cookie, csrf: changed.data.csrf, user: changed.data.user }; }
async function put(gameId, bytes) {
  const descriptor = { sha256: sha(bytes), byteLength: bytes.length }, key = `private/${gameId}/${descriptor.sha256}`;
  // Host-only fixture staging: actual read/hash before reusing already seeded bytes.
  // No overwrite, signature/etag trust, permission fallback or production adapter change.
  const existing = await bucket.get(key);
  if (existing) { const actual = new Uint8Array(await existing.arrayBuffer()); assert.equal(actual.length, bytes.length); assert.equal(sha(actual), descriptor.sha256); return descriptor; }
  const inserted = await bucket.put(key, bytes, { onlyIf: { etagDoesNotMatch: '*' } });
  assert.notEqual(inserted, null, 'unexpected owned fixture staging conflict'); return descriptor;
}
async function encodeCaptured(game) {
  const worker = new Worker(pathToFileURL(resolve(d + 'encode-worker.mjs')));
  try {
    const result = new Promise((done, reject) => { worker.once('error', reject); worker.once('message', message => message.error ? reject(new Error(message.error)) : done(message.parts)); worker.once('exit', code => { if (code !== 0) reject(new Error('owned encoding worker exited')); }); });
    worker.postMessage(game); // Structured clone captures before the first await.
    return await result;
  } finally { await worker.terminate(); }
}
async function stage(game, dependencies = []) {
  const parts = await encodeCaptured(game), h = createHash('sha256'), chunks = [];
  for (const part of parts) { h.update(part); chunks.push(await put(game.gameId, part)); }
  const index = { schema: 'dragon-game-source-index-1', gameId: game.gameId, sourceDigest: h.digest('hex'), sourceByteLength: parts.reduce((n, p) => n + p.length, 0), chunks, dependencies };
  const root = await put(game.gameId, Buffer.concat(encodeSourceChunks(index))); return { root, index };
}
const checks = []; const sourcePath = 'web/content/builtin/compiled/map-2-47e35876cd32ff3b7eee27da3be95eaa1b52a6d108a6f94c1f5989bc68861d23/game-source.json', input = readFileSync(sourcePath), inputSha = sha(input);
try {
  mf = build(); await mf.ready; frontend = await createEditorHTTPS(mf); bucket = await mf.getR2Bucket('EDITOR_BLOBS');
  const admin = await login('tianyi'); assert.equal((await call('/api/admin/accounts', { account: 'author_a' }, admin)).status, 200); assert.equal((await call('/api/admin/accounts', { account: 'author_b' }, admin)).status, 200);
  const a = await login('author_a'), b = await login('author_b'), allocated = await fixture({ action: 'allocate' }, a); assert.equal(allocated.status, 200); const gameId = allocated.data.gameId;
  assert.equal((await call('/api/fixture/snapshots', { action: 'allocation-status', gameId }, a, { Host: 'other.invalid' })).status, 400);
  assert.equal((await call('/api/fixture/snapshots', { action: 'allocation-status', gameId }, a, { Origin: 'http://127.0.0.1:8787' })).status, 403);
  assert.equal((await call('/api/fixture/snapshots', { action: 'allocation-status', gameId }, a, { 'X-CSRF-Token': 'wrong' })).status, 403);
  assert.equal((await call('/api/fixture/snapshots', { action: 'allocation-status', gameId, padding: 'x'.repeat(17000) }, a)).status, 413);
  assert.equal((await call('/api/fixture/snapshots', { action: 'allocation-status', gameId }, a, { 'X-Forwarded-Host': 'other.invalid', 'X-Forwarded-Proto': 'http' })).status, 200);
  checks.push('actual local NodeTLS entrance keeps Host/Origin/CSRF/body budget and cannot redirect identity through forwarded headers; no global TLS trust change');
  const game = json(input); game.gameId = gameId; game.metadata = { name: '源驗收', introduction: '' }; // Placeholder owner is deliberately not a principal.
  // A separate owned process keeps the actual authenticated allocation alive while
  // synchronous host encoding blocks this event loop. Not persisted authority/DTO repair.
  await maintainAllocation(gameId, a);
  console.error('stage-current-start');
  const staged = await stage(game), request = { action: 'create', gameId, metadata: game.metadata, source: staged.root };
  console.error('stage-current-end');
  activity.assertHealthy(); assert.equal((await fixture({ action: 'allocation-status', gameId }, a)).data.retained, true);
  activity.assertHealthy(); await activity.stop(); activity = undefined;
  const good = await fixture(request, a); assert.equal(good.status, 200, good.data.error + ':' + good.data.probeLocation); assert.equal(good.data.result.ownerId, a.user.id); assert.equal(good.data.sourceDigest, staged.index.sourceDigest);
  const reference = await fixture({ action: 'reference', gameId, revision: '1' }, a); assert.equal(reference.status, 200); assert.equal(reference.data.rootKey, `private/${gameId}/${staged.root.sha256}`); assert.notEqual(staged.root.sha256, staged.index.sourceDigest); checks.push('actual full43MB current GameSource through immutable1MiB R2 chunks, canonical streamed JSON/shared draft validation and SQL commit with distinct physical/logical digests');
  for (const s of [b, admin]) { assert.equal((await fixture({ ...request, action: 'prepare' }, s)).status, 404); assert.equal((await fixture({ action: 'reference', gameId, revision: '1' }, s)).status, 404); }
  assert.equal((await fixture({ ...request, action: 'prepare', gameId: 'wolong-builtin' }, admin)).status, 422); assert.equal((await fixture({ ...request, action: 'prepare', metadata: { name: '別名', introduction: '' } }, a)).status, 422); assert.equal((await fixture({ ...request, action: 'prepare', source: { ...staged.root, valid: true } }, a)).status, 422); checks.push('actual principal/owner pre-I/O, no admin cross-author right, immutable metadata/root identity and no validDTO capability');
  async function badIndex(change, expected = 422) { const index = { ...staged.index, ...change }, root = await put(gameId, Buffer.concat(encodeSourceChunks(index))); assert.equal((await fixture({ ...request, action: 'prepare', source: root }, a)).status, expected); }
  await badIndex({ sourceDigest: '0'.repeat(64) }); await badIndex({ gameId: randomUUID() }); await badIndex({ sourceByteLength: 64 * 1024 * 1024 + 1 }, 413); await badIndex({ chunks: [] }); await badIndex({ chunks: [{ sha256: '0'.repeat(64), byteLength: 1 }], sourceByteLength: 1 }, 404); await badIndex({ chunks: [{ ...staged.index.chunks[0], sha256: '../escape' }] }); checks.push('root/index/full-source hash/identity, chunk lengths/order/key and source budget fail closed; missing resource not deletion');
  for (const text of ['{"a":1,"a":2}', '{"a":"\\ud800"}', '{}\n', '{"a":-0}']) { const bytes = new TextEncoder().encode(text), chunk = await put(gameId, bytes); await badIndex({ chunks: [chunk], sourceDigest: sha(bytes), sourceByteLength: bytes.length }); }
  const broken = { ...game, map: null }; const rejected = await stage(broken); assert.equal((await fixture({ ...request, action: 'prepare', source: rejected.root }, a)).status, 422); checks.push('actual R2 bytes reject duplicate keys/lone surrogate/noncanonical/lossy number and common structural failure; hash alone is not acceptance');
  const bytes = new Uint8Array([42]), asset = { assetId: 'data_a', sha256: sha(bytes), byteLength: 1, mediaType: 'application/octet-stream', role: 'data' }; await put(gameId, bytes); game.assets = { data_a: asset };
  const dependency = await stage(game, [asset]); const depGood = await fixture({ ...request, action: 'prepare', source: dependency.root }, a); assert.equal(depGood.status, 200, depGood.data.error);
  const incomplete = await stage(game, []); assert.equal((await fixture({ ...request, action: 'prepare', source: incomplete.root }, a)).status, 422);
  const image = { ...asset, mediaType: 'image/png', role: 'portrait' }; game.assets = { data_a: image }; const unsupported = await stage(game, [image]); assert.equal((await fixture({ ...request, action: 'prepare', source: unsupported.root }, a)).status, 503);
  checks.push('actual opaque dependency bytes and full asset manifest match; omitted dependency rejected; uninstalled image/decode port503, not signature-only fake admission');
  const uncommitted = await fixture({ action: 'allocate' }, a); assert.equal(uncommitted.status, 200);
  await frontend.close(); frontend = undefined; await mf.dispose(); mf = undefined;
  mf = build(); await mf.ready; frontend = await createEditorHTTPS(mf); bucket = await mf.getR2Bucket('EDITOR_BLOBS');
  const lost = await fixture({ ...request, action: 'prepare', gameId: uncommitted.data.gameId }, a); assert.equal(lost.status, 404); assert.equal(lost.data.error, 'GAME_NOT_FOUND');
  const restored = await fixture({ ...request, action: 'prepare' }, a); assert.equal(restored.status, 200, restored.data.error); assert.equal(restored.data.sourceDigest, staged.index.sourceDigest); assert.equal((await fixture({ action: 'reference', gameId, revision: '1' }, a)).data.rootKey, reference.data.rootKey); checks.push('real workerd restart retains R2 root/fragments and immutable SQL source reference/session; no processMap persistence');
  assert.equal((await call('/api/games/' + gameId + '/draft', { source: staged.root }, a)).status, 404); checks.push('production save/upload/compiler/publish routes remain closed pending delta/resource/runtime gates');
  assert.equal(sha(readFileSync(sourcePath)), inputSha); for (const [p, h] of Object.entries(sourceHashes)) assert.equal(sha(readFileSync(p)), h);
  console.log(JSON.stringify({ result: 'PASS-REAL-R2-GAMESOURCE-SNAPSHOT-STRUCTURE', checks, calls, originalBytes: input.length, canonicalBytes: staged.index.sourceByteLength, chunks: staged.index.chunks.length, fixtureElapsed: good.data.elapsed, inputSha, sourceHashes, limits: 'Real local structural draft proof only, no whole runtime/compatibility-delta/image/trusted shared-package/Q69 closure or productionSLA; no public content writes/deploy/cloudresourcecreation.' }, null, 2));
} finally { await activity?.stop(); await frontend?.close(); await mf?.dispose(); }
