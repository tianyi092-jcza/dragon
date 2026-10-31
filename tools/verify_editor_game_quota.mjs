// EDITOR_GAME_LIMIT wiring: real Node service (SQLite + private file bucket +
// loopback HTTPS), no browser and no workerd. Proves four things: the env value
// actually reaches AdminFullCopy, the cap counts this owner's committed games,
// an over-cap reserve fails closed with 429 and leaves no request row, and the
// default (unset) stays unlimited. Per-owner isolation is checked with a second
// account that may still reserve while the first is at its cap.
//   node tools/verify_editor_game_quota.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { request as httpsRequest } from 'node:https';
import { openStorage } from '../vps/sqlite-port.mjs';
import { FileBucket } from '../vps/file-bucket.mjs';
import { createEditorService } from '../vps/editor-server.mjs';
import { stageInstalledEditorSource } from './editor_stage_source.mjs';
import { stageInstalledAvailableLibrary } from './editor_stage_library.mjs';
import { createEditorHTTPS } from './editor_local_https.mjs';

const port = Number(process.env.EDITOR_TEST_PORT || 8788);
assert.ok(Number.isInteger(port) && port >= 1024 && port <= 65535, 'valid test port required');
const origin = `https://127.0.0.1:${port}`;
const own = mkdtempSync(join(tmpdir(), 'dragon-game-quota-'));
const sqlitePath = join(own, 'quota.sqlite'), bucketRoot = join(own, 'private');
const bootstrapPassword = randomBytes(24).toString('hex') + 'Aa1!';
const adminPassword = randomBytes(24).toString('hex') + 'Bb2!';
const otherPassword = randomBytes(24).toString('hex') + 'Cc3!';
const requestKey = randomBytes(32).toString('hex');
const checks = [], calls = [];
let service, transport, storage;

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
        const cookie = res.headers['set-cookie']?.[0]?.split(';')[0];
        calls.push({ path, status: res.statusCode });
        done({ status: res.statusCode, data, cookie });
      });
    });
    req.on('error', reject);
    req.end(value === undefined ? undefined : JSON.stringify(value));
  });
}

async function login(account, password) {
  const response = await call('/api/auth/login', { account, password });
  assert.equal(response.status, 200, `login ${account}`);
  assert.ok(response.cookie, 'session cookie required');
  return { cookie: response.cookie, csrf: response.data.csrf };
}

async function changePassword(session, from, to) {
  const response = await call('/api/auth/password', { oldPassword: from, newPassword: to }, session);
  assert.equal(response.status, 200, 'password change');
  return { cookie: response.cookie ?? session.cookie, csrf: response.data.csrf };
}

// Same wiring the VPS supervisor performs: pinned bytes staged into the private
// bucket, then handed to the application through env.
async function boot(gameLimit) {
  const bucket = new FileBucket({ root: bucketRoot });
  const operator = {
    get: key => bucket.get(key),
    put: (key, bytes, conditions) => {
      assert.deepEqual(conditions, { onlyIf: { etagDoesNotMatch: '*' } });
      return bucket.put(key, bytes, { onlyIf: new Headers({ 'If-None-Match': '*' }) });
    },
  };
  const source = await stageInstalledEditorSource(operator);
  const library = await stageInstalledAvailableLibrary(operator);
  storage = openStorage(sqlitePath);
  const env = {
    EDITOR_ORIGIN: origin,
    EDITOR_DEFAULT_PASSWORD: bootstrapPassword,
    EDITOR_REQUEST_KEY: requestKey,
    EDITOR_INSTALLED_SOURCE_ROOT: JSON.stringify(source),
    EDITOR_AVAILABLE_LIBRARY_ROOT: JSON.stringify(library),
    ...(gameLimit === undefined ? {} : { EDITOR_GAME_LIMIT: String(gameLimit) }),
  };
  service = createEditorService({ storage, bucket, env });
  transport = await createEditorHTTPS({ dispatchFetch: (url, init) => service.fetch(new Request(url, init)) }, { port });
}

async function shutdown() {
  try { await transport?.close(); } finally { storage?.close(); transport = undefined; storage = undefined; }
}

// One full create: reserve then run, exactly what the single button issues.
async function createGame(session, name) {
  const key = randomUUID();
  const reserved = await call('/api/games', { name, introduction: '' }, session, { 'Idempotency-Key': key });
  assert.equal(reserved.status, 202, `reserve ${name}: ${JSON.stringify(reserved.data)}`);
  const ran = await call(`/api/games/create/${key}/run`, {}, session, { 'If-Match': `"${reserved.data.rowRevision}"` });
  assert.equal(ran.status, 200, `run ${name}`);
  return { key, gameId: ran.data.gameId };
}

try {
  process.stderr.write('quota: boot with EDITOR_GAME_LIMIT=1\n');
  await boot(1);
  const admin = await changePassword(await login('tianyi', bootstrapPassword), bootstrapPassword, adminPassword);
  const installed = await call('/api/admin/source/install', {}, admin, { 'Idempotency-Key': randomUUID() });
  assert.equal(installed.status, 200, 'staged source registration');

  const first = await createGame(admin, '配額甲');
  checks.push({ check: 'firstGameAllowed', gameId: first.gameId });

  // Cap reached: the second reserve must fail closed and leave nothing behind.
  const blockedKey = randomUUID();
  const blocked = await call('/api/games', { name: '配額乙', introduction: '' }, admin, { 'Idempotency-Key': blockedKey });
  assert.equal(blocked.status, 429, 'second reserve must exceed the owner cap');
  assert.equal(blocked.data.error, 'GAME_QUOTA_EXCEEDED');
  assert.equal((await call(`/api/games/create/${blockedKey}`, undefined, admin)).status, 404, 'rejected reserve leaves no request row');
  const listed = await call('/api/games', undefined, admin);
  assert.equal(listed.status, 200);
  assert.equal(listed.data.games.length, 1, 'rejected reserve created no game');
  checks.push({ check: 'overCapRejected', status: blocked.status, error: blocked.data.error, gamesAfter: listed.data.games.length });

  // Per-owner: another account is not blocked by the first owner's cap.
  const created = await call('/api/admin/accounts', { account: 'quota_other' }, admin, { 'Idempotency-Key': randomUUID() });
  assert.equal(created.status, 200, 'second account created');
  const other = await changePassword(await login('quota_other', bootstrapPassword), bootstrapPassword, otherPassword);
  const otherKey = randomUUID();
  const otherReserve = await call('/api/games', { name: '配額丙', introduction: '' }, other, { 'Idempotency-Key': otherKey });
  assert.equal(otherReserve.status, 202, 'another owner is unaffected by the first owner cap');
  const otherCancel = await call(`/api/games/create/${otherKey}/cancel`, {}, other, { 'If-Match': `"${otherReserve.data.rowRevision}"` });
  assert.equal(otherCancel.status, 200, 'second account reservation cancelled');
  checks.push({ check: 'perOwnerCap', otherReserve: otherReserve.status, otherCancel: otherCancel.status });

  // Default unset = unlimited: same storage, same session, one more game passes.
  await shutdown();
  process.stderr.write('quota: reboot without EDITOR_GAME_LIMIT\n');
  await boot(undefined);
  const admin2 = { cookie: admin.cookie, csrf: admin.csrf };
  const second = await createGame(admin2, '配額丁');
  const after = await call('/api/games', undefined, admin2);
  assert.equal(after.status, 200);
  assert.equal(after.data.games.length, 2, 'default (unset) stays unlimited');
  checks.push({ check: 'unlimitedByDefault', secondGameId: second.gameId, games: after.data.games.length });

  // A malformed value must fail closed at construction, never silently unlimited.
  await shutdown();
  let policyFailure = null;
  try { await boot('three'); } catch (error) { policyFailure = error?.code ?? error?.message ?? String(error); }
  assert.equal(policyFailure, 'COPY_QUOTA_POLICY', 'malformed EDITOR_GAME_LIMIT fails closed');
  checks.push({ check: 'malformedFailsClosed', code: policyFailure });

  process.stdout.write(JSON.stringify({ result: 'PASS-EDITOR-GAME-QUOTA', platform: 'Node SQLite/FileBucket + owned HTTPS', checks, calls }, null, 2) + '\n');
} catch (error) {
  process.stderr.write(JSON.stringify({ result: 'FAIL', error: error?.message, stack: error?.stack, checks, calls }, null, 2) + '\n');
  process.exitCode = 1;
} finally {
  await shutdown();
  rmSync(own, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
