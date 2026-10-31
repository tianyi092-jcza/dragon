// Startup registration of the operator-staged fixed source (option C).
// Proves: the CLI seeds the owner, registers through the real install path with
// an auditable receipt, is idempotent on restart, fails closed when the pinned
// root drifted, and leaves a fresh database able to create a game with no manual
// admin click. Node SQLite + private file bucket + loopback HTTPS, no browser.
//   node tools/verify_pinned_source_registration.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { request as httpsRequest } from 'node:https';
import { openStorage } from '../vps/sqlite-port.mjs';
import { FileBucket } from '../vps/file-bucket.mjs';
import { createEditorService, startEditorServer } from '../vps/editor-server.mjs';
import { registerPinnedSource } from '../vps/register-pinned-source.mjs';
import { stageInstalledEditorSource } from './editor_stage_source.mjs';
import { stageInstalledAvailableLibrary } from './editor_stage_library.mjs';
import { createEditorHTTPS } from './editor_local_https.mjs';

const port = Number(process.env.EDITOR_TEST_PORT || 8789);
assert.ok(Number.isInteger(port) && port >= 1024 && port <= 65535, 'valid test port required');
const origin = `https://127.0.0.1:${port}`;
const own = mkdtempSync(join(tmpdir(), 'dragon-source-registration-'));
const bootstrapPassword = randomBytes(24).toString('hex') + 'Aa1!';
const changedPassword = randomBytes(24).toString('hex') + 'Bb2!';
const requestKey = randomBytes(32).toString('hex');
const checks = [], calls = [];
let storage, transport;

function call(path, value, session, extra = {}) {
  const headers = { Origin: origin, ...extra };
  if (session) { headers.Cookie = session.cookie; headers['X-CSRF-Token'] = session.csrf; }
  if (value !== undefined) { headers['Content-Type'] = 'application/json'; headers['Idempotency-Key'] ??= randomUUID(); }
  return new Promise((done, reject) => {
    const req = httpsRequest(origin + path, { method: value === undefined ? 'GET' : 'POST', headers, rejectUnauthorized: false }, res => {
      const parts = [];
      res.on('data', bytes => parts.push(bytes));
      res.on('error', reject);
      res.on('end', () => {
        let data;
        try { data = JSON.parse(Buffer.concat(parts).toString('utf8')); } catch (error) { reject(new Error(`invalid JSON from ${path} (${res.statusCode})`, { cause: error })); return; }
        calls.push({ path, status: res.statusCode });
        done({ status: res.statusCode, data, cookie: res.headers['set-cookie']?.[0]?.split(';')[0] });
      });
    });
    req.on('error', reject);
    req.end(value === undefined ? undefined : JSON.stringify(value));
  });
}

const one = (query, ...values) => storage.sql.exec(query, ...values).toArray()[0];
const count = query => one(query).n;

try {
  const bucketRoot = join(own, 'private');
  const bucket = new FileBucket({ root: bucketRoot });
  const operator = {
    get: key => bucket.get(key),
    put: (key, bytes, conditions) => {
      assert.deepEqual(conditions, { onlyIf: { etagDoesNotMatch: '*' } });
      return bucket.put(key, bytes, { onlyIf: new Headers({ 'If-None-Match': '*' }) });
    },
  };
  const source = await stageInstalledEditorSource(operator);
  await stageInstalledAvailableLibrary(operator);
  const env = {
    EDITOR_ORIGIN: origin,
    EDITOR_DEFAULT_PASSWORD: bootstrapPassword,
    EDITOR_REQUEST_KEY: requestKey,
    EDITOR_INSTALLED_SOURCE_ROOT: JSON.stringify(source),
  };

  storage = openStorage(join(own, 'registration.sqlite'));
  // Production order: the application creates the schema, then the startup step
  // registers, then the port opens.
  createEditorService({ storage, bucket, env });
  assert.equal(count('SELECT COUNT(*) AS n FROM users'), 0, 'fresh database has no account yet');
  assert.equal(count('SELECT COUNT(*) AS n FROM installed_sources'), 0, 'fresh database has no source row');

  const registered = await registerPinnedSource({ storage, bucket, env });
  assert.equal(registered.status, 'registered');
  const owner = one("SELECT * FROM users WHERE account='tianyi'");
  assert.equal(owner.role, 'admin');
  assert.equal(owner.must_change, 1, 'seeded owner still must change password');
  assert.equal(owner.disabled, 0);
  const row = one('SELECT * FROM installed_sources WHERE registry_id=?', source.registryId);
  assert.equal(row.registered_by, owner.id, 'registration actor is the seeded admin');
  assert.equal(row.root_digest, source.root.sha256);
  const receipts = storage.sql.exec('SELECT actor,op_key FROM source_operations WHERE registry_id=?', source.registryId).toArray();
  assert.equal(receipts.length, 1, 'exactly one auditable receipt');
  assert.equal(receipts[0].actor, owner.id);
  checks.push({ check: 'registeredWithReceipt', status: registered.status, receipts: receipts.length, opKey: receipts[0].op_key });

  const replay = await registerPinnedSource({ storage, bucket, env });
  assert.equal(replay.status, 'already-registered', 'restart is idempotent');
  assert.equal(count('SELECT COUNT(*) AS n FROM source_operations'), 1, 'restart adds no receipt');
  checks.push({ check: 'idempotentRestart', status: replay.status, receipts: count('SELECT COUNT(*) AS n FROM source_operations') });

  // Drifted pinned root must fail closed instead of overwriting the registration.
  const drifted = 'f'.repeat(64);
  storage.sql.exec('UPDATE installed_sources SET root_digest=? WHERE registry_id=?', drifted, source.registryId);
  let conflict = null;
  try { await registerPinnedSource({ storage, bucket, env }); } catch (error) { conflict = error.message; }
  assert.equal(conflict, 'SOURCE_REGISTRATION_CONFLICT', 'drifted root fails closed');
  storage.sql.exec('UPDATE installed_sources SET root_digest=? WHERE registry_id=?', source.root.sha256, source.registryId);
  checks.push({ check: 'driftedRootFailsClosed', error: conflict });

  // End to end: with the registration in place and no manual install call, a
  // freshly seeded admin can log in and create a game.
  const service = createEditorService({ storage, bucket, env });
  transport = await createEditorHTTPS({ dispatchFetch: (url, init) => service.fetch(new Request(url, init)) }, { port });
  const login = await call('/api/auth/login', { account: 'tianyi', password: bootstrapPassword });
  assert.equal(login.status, 200);
  assert.equal(login.data.user.mustChangePassword, true, 'default password still forces a change');
  const session = { cookie: login.cookie, csrf: login.data.csrf };
  const changed = await call('/api/auth/password', { oldPassword: bootstrapPassword, newPassword: changedPassword }, session);
  assert.equal(changed.status, 200);
  const admin = { cookie: changed.cookie ?? session.cookie, csrf: changed.data.csrf };
  const reserved = await call('/api/games', { name: '開箱甲', introduction: '' }, admin);
  assert.equal(reserved.status, 202, `新建遊戲 must not need a manual install: ${JSON.stringify(reserved.data)}`);
  const cancelled = await call(`/api/games/create/${reserved.data.gameId}`, undefined, admin);
  assert.equal(cancelled.status, 404, 'game row is not created by reserve alone');
  const pending = one("SELECT op_key FROM copy_requests WHERE game_id=? AND state='pending'", reserved.data.gameId);
  const cancel = await call(`/api/games/create/${pending.op_key}/cancel`, {}, admin, { 'If-Match': `"${reserved.data.rowRevision}"` });
  assert.equal(cancel.status, 200);
  assert.equal(count('SELECT COUNT(*) AS n FROM content_games'), 0, 'cancelled reservation leaves no game');
  checks.push({ check: 'freshDeployCanCreateGame', reserve: reserved.status, cancel: cancel.status });

  // The production seam: startEditorServer runs the optional startup step after
  // the schema exists and before the port opens.
  const prepared = [];
  const server = await startEditorServer({ storage, bucket, env, port: port + 1,
    prepare: ({ storage: sql, bucket: objects, env: given }) => { prepared.push([typeof sql?.sql?.exec, typeof objects?.get, given === env]); } });
  assert.deepEqual(prepared, [['function', 'function', true]], 'startup step ran once with the real ports');
  await server.close();
  checks.push({ check: 'serverRunsStartupStep', prepared: prepared.length });

  process.stdout.write(JSON.stringify({ result: 'PASS-PINNED-SOURCE-REGISTRATION', platform: 'Node SQLite/FileBucket + owned HTTPS', checks, calls }, null, 2) + '\n');
} catch (error) {
  process.stderr.write(JSON.stringify({ result: 'FAIL', error: error?.message, stack: error?.stack, checks, calls }, null, 2) + '\n');
  process.exitCode = 1;
} finally {
  try { await transport?.close(); } finally { storage?.close(); }
  rmSync(own, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
