// Owned SQLite/files + loopback HTTP only. Real shared application, not auth
// sidecar mocks. No installed source, cloud, DOS data, or browser profile IO.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { openStorage } from '../vps/sqlite-port.mjs';
import { FileBucket } from '../vps/file-bucket.mjs';
import { startEditorServer } from '../vps/editor-server.mjs';
import { GameDeletionJobFreeze } from '../server/deletionjobfreeze.js';
import { GameDeletionDraftFreeze } from '../server/deletiondraftfreeze.js';
import { assertDeletionDefinitions } from '../server/deletiondefinitions.js';
const own = mkdtempSync(join(tmpdir(), 'dragon-editor-http-'));
const db = join(own, 'authority.db');
const env = {
  EDITOR_ORIGIN: 'https://owned-editor.invalid',
  EDITOR_REQUEST_KEY: randomBytes(32).toString('hex'),
  EDITOR_DEFAULT_PASSWORD: 'Owned initial password 123!',
};
const frozenPublication = process.argv.includes('--frozen-publication');
assert.ok(process.argv.slice(2).every(arg => arg === '--frozen-publication'), 'unknown test option');
const runtimeStager = frozenPublication ? { async stage() { throw new Error('unexpected HTTP test staging'); }, verifyStaged() { throw new Error('unexpected HTTP test staging proof'); } } : undefined;
const changedPassword = 'Owned changed password 456!';
let storage, server, n = 0;
const check = label => { n++; process.stdout.write(`ok ${label}\n`); };
function http(path, { method = 'GET', value, raw, headers = {}, chunked = false } = {}) {
  return new Promise((resolve, reject) => {
    const bytes = raw ?? (value === undefined ? undefined : JSON.stringify(value));
    const req = request({ hostname: '127.0.0.1', port: server.address.port, path, method, headers: {
      Host: 'owned-editor.invalid', ...(method === 'POST' ? { Origin: env.EDITOR_ORIGIN, 'Content-Type': 'application/json' } : {}),
      ...(bytes !== undefined && !chunked ? { 'Content-Length': Buffer.byteLength(bytes) } : {}), ...headers,
    } }, res => {
      const chunks = [];
      res.on('data', bytes => chunks.push(bytes)); res.on('error', reject);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString('utf8') }));
    });
    req.setTimeout(15000, () => req.destroy(new Error('owned HTTP timeout')));
    req.on('error', reject);
    if (chunked && bytes !== undefined) { req.write(bytes.slice(0, 100)); req.end(bytes.slice(100)); }
    else req.end(bytes);
  });
}
function json(result) { try { return JSON.parse(result.text); } catch { throw new Error('owned reply is not JSON'); } }
function auth(result) {
  assert.equal(result.status, 200, result.text);
  assert.equal(result.headers['set-cookie'].length, 1);
  const cookie = result.headers['set-cookie'][0];
  assert.match(cookie, /; Path=\/api; Secure; HttpOnly; SameSite=Strict$/);
  return { Cookie: cookie.split(';')[0], 'X-CSRF-Token': json(result).csrf };
}
async function start() {
  storage = openStorage(db);
  server = await startEditorServer({ storage, bucket: new FileBucket({ root: join(own, 'private') }), env, runtimeStager, frozenPublication, port: 0 });
}
try {
  await start();
  const page = await http('/');
  assert.equal(page.status, 200); assert.match(page.headers['content-type'], /text\/html/);
  assert.match(page.headers['content-security-policy'], /script-src 'self'/);
  const client = await http('/client.js');
  assert.equal(client.status, 200);
  const modules = [...client.text.matchAll(/^import .* from '(\/[^']+\.js)';$/gm)].map(match => match[1]);
  assert.deepEqual([...modules].sort(), ['/catalog.js','/draft.js','/general.js','/library.js','/management.js','/mapview.js','/publish.js','/review.js','/shell-ui.js','/stage-assets.js','/stage.js','/stronghold.js'],
    'client.js imports exactly the shipped controller modules (management-editor renders review.js)');
  for (const path of ['/client.js', ...modules]) {
    const asset = await http(path);
    assert.equal(asset.status, 200, path);
    assert.match(asset.headers['content-type'], /^text\/javascript/);
    assert.equal(asset.headers['cache-control'], 'no-store');
    assert.equal(asset.headers['x-content-type-options'], 'nosniff');
    const name = path === '/stage-assets.js' ? 'stageassets.txt' : path.slice(1).replace('.js', '.txt');
    assert.equal(asset.text, readFileSync('server/public/' + name, 'utf8'), path);
  }
  assert.equal((await http('/style.css')).status, 200);
  const shellCss = await http('/shell-ui.css');
  assert.equal(shellCss.status, 200);
  assert.match(shellCss.headers['content-type'], /^text\/css/);
  assert.equal(shellCss.text, readFileSync('server/public/shell-ui.css', 'utf8'));
  const licenses = await http('/shell-ui-licenses.txt');
  assert.equal(licenses.status, 200);
  assert.match(licenses.headers['content-type'], /^text\/plain/);
  assert.equal(licenses.text, readFileSync('server/public/shell-ui-licenses.txt', 'utf8'));
  check('shared management shell and text assets');
  assert.equal(json(await http('/api/health')).initialized, false);
  assert.equal((await http('/server/security.js')).status, 404);
  assert.equal((await http('/api/session')).status, 401);
  assert.equal((await http('/api/health', { headers: { Host: 'attacker.invalid' } })).status, 403);
  assert.equal((await http('/api/health', { method: 'DELETE' })).status, 404);
  check('host, method, private filesystem and anonymous session boundaries');
  const loginValue = { account: 'tianyi', password: env.EDITOR_DEFAULT_PASSWORD };
  assert.equal((await http('/api/auth/login', { method: 'POST', value: loginValue, headers: { Origin: 'https://attacker.invalid' } })).status, 403);
  assert.equal((await http('/api/auth/login', { method: 'POST', raw: '{' })).status, 422);
  assert.equal((await http('/api/auth/login', { method: 'POST', raw: 'x'.repeat(16385) })).status, 413);
  assert.equal((await http('/api/auth/login', { method: 'POST', raw: 'x'.repeat(16385), chunked: true })).status, 413);
  check('cross-origin, malformed and oversized/chunked input rejected with complete HTTP replies');
  const login = await http('/api/auth/login', { method: 'POST', value: loginValue, headers: { 'Idempotency-Key': randomUUID(), 'CF-Connecting-IP': 'spoof-one', 'X-Editor-Source': 'spoof-two' } });
  let session = auth(login);
  assert.equal(json(login).user.mustChangePassword, true);
  assert.equal((await http('/api/games', { headers: session })).status, 403);
  check('real initial admin and password-change gate');
  assert.equal((await http('/api/auth/password', { method: 'POST', value: { oldPassword: env.EDITOR_DEFAULT_PASSWORD, newPassword: changedPassword }, headers: { ...session, 'X-CSRF-Token': 'wrong', 'Idempotency-Key': randomUUID() } })).status, 403);
  const priorCookie = session.Cookie;
  session = auth(await http('/api/auth/password', { method: 'POST', value: { oldPassword: env.EDITOR_DEFAULT_PASSWORD, newPassword: changedPassword }, headers: { ...session, 'Idempotency-Key': randomUUID() } }));
  assert.equal((await http('/api/session', { headers: { Cookie: priorCookie } })).status, 401);
  assert.deepEqual(json(await http('/api/games', { headers: session })).games, []);
  check('CSRF, password mutation, epoch revocation and authenticated game route');
  assert.equal((await http('/api/trial/web/src/game/clock.js')).status, 401);
  const engine = await http('/api/trial/web/src/game/clock.js', { headers: session });
  assert.equal(engine.status, 200); assert.match(engine.text, /MAX_TICKS_PER_FRAME/);
  assert.match(engine.headers['x-content-sha256'], /^[a-f0-9]{64}$/);
  assert.equal((await http('/api/trial/web/server/security.js', { headers: session })).status, 404);
  check('same generated Trial engine through authenticated role route; no arbitrary file reads');
  const key = randomUUID(), create = () => http('/api/admin/accounts', { method: 'POST', value: { account: 'owned-author' }, headers: { ...session, 'Idempotency-Key': key } });
  const made = await create(), replay = await create();
  assert.equal(made.status, 200, made.text); assert.deepEqual(json(replay), json(made));
  assert.equal(json(await http('/api/admin/accounts', { headers: session })).accounts.length, 2);
  check('shared account creation and sealed idempotent replay');
  // A second spoofed proxy identity must still hit the SAME socket-rate bucket.
  assert.equal((await http('/api/auth/login', { method: 'POST', value: { account: 'not-present', password: env.EDITOR_DEFAULT_PASSWORD }, headers: { 'Idempotency-Key': randomUUID(), 'CF-Connecting-IP': 'different-spoof', 'X-Forwarded-For': 'another-spoof' } })).status, 401);
  assert.equal(storage.sql.exec("SELECT bucket FROM login_rates WHERE bucket LIKE 'source:%'").toArray().length, 1);
  check('client-supplied proxy/source headers cannot split rate identities');
  const options = { storage, principal: () => { throw new Error('unused owned principal'); }, requestKey: env.EDITOR_REQUEST_KEY };
  new GameDeletionJobFreeze(options); new GameDeletionDraftFreeze(options);
  const facts = assertDeletionDefinitions(storage.sql);
  assert.equal(facts.tablesVerified, 53); assert.equal(facts.indexesVerified, 51);
  assert.equal(facts.foreignKeyDeclarationsVerified, 4);
  check('real Node application has exact additive frozen SQLite declarations and constraints');
  await server.close(); server = null; storage.close(); storage = null;
  await start();
  assert.equal((await http('/api/session', { headers: session })).status, 200);
  assert.equal(json(await http('/api/admin/accounts', { headers: session })).accounts.length, 2);
  assert.equal((await http('/api/trial/web/src/game/clock.js', { headers: session })).status, 200);
  check('service reopen preserves users/session/authority without reseeding or separate auth DB');
  const logout = await http('/api/auth/logout', { method: 'POST', value: {}, headers: { ...session, 'Idempotency-Key': randomUUID() } });
  assert.equal(logout.status, 200); assert.match(logout.headers['set-cookie'][0], /Max-Age=0/);
  assert.equal((await http('/api/session', { headers: session })).status, 401);
  check('logout persists and retires the same authoritative session');
  for (const [path, legacyStatus] of [['/play', 200], ['/api/published-games', 200], ['/api/announcements', 200], ['/api/trial-pack', 422], ['/api/trial-asset', 422], ['/api/play/web/src/game/clock.js', 200]]) {
    const reply = await http(path);
    assert.equal(reply.status, frozenPublication ? 503 : legacyStatus, path);
    if (frozenPublication) {
      assert.deepEqual(json(reply), { error: 'PLAY_READER_REQUIRED' });
      assert.equal(reply.headers['cache-control'], 'no-store');
      assert.equal(reply.headers.location, undefined);
    }
  }
  check('frozen service closes old anonymous player surface; legacy mode retained');
  process.stdout.write(`VPS editor HTTP: ${n} groups green (frozenPublication=${frozenPublication})\n`);
} finally {
  await server?.close(); storage?.close();
  rmSync(own, { recursive: true, force: true });
}
