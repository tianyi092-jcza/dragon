// T1–T8 copy 全链路 HTTP 回放：真 EditorService + 落盘 SQLite，零浏览器。
// 新建→ensure(幂等)→读→模块存→检验→填说明提交→复投拒收→越权/参数拒收。
// 用法：node tools/verify_copy_http_roundtrip.mjs（cwd=web-port）
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { request as httpsRequest } from 'node:https';

const port = Number(process.env.EDITOR_TEST_PORT ?? 18787);
assert.ok(Number.isInteger(port) && port >= 1024 && port <= 65535);
const own = mkdtempSync(join(tmpdir(), 'dragon-copy-http-'));
const origin = 'https://127.0.0.1:' + port;
const initial = randomBytes(24).toString('hex') + 'Aa1!';
const password = randomBytes(24).toString('hex') + 'Aa1!';
const secret = randomBytes(32).toString('hex');

const json = bytes => { try { return JSON.parse(bytes); } catch (cause) { throw new Error('invalid JSON: ' + String(bytes).slice(0, 200), { cause }); } };
const config = json(readFileSync('server/wrangler.jsonc'));
config.main = resolve('server/worker.js');
config.dev.port = port;
config.vars.EDITOR_ORIGIN = origin;
writeFileSync(join(own, 'wrangler.jsonc'), JSON.stringify(config));
writeFileSync(join(own, '.dev.vars'), 'EDITOR_DEFAULT_PASSWORD=' + JSON.stringify(initial) + '\nEDITOR_REQUEST_KEY=' + JSON.stringify(secret) + '\n', { flag: 'wx', mode: 0o600 });

async function call(path, body, session, extra = {}) {
  const headers = { Origin: origin, ...extra };
  if (session) { headers.Cookie = session.cookie; headers['X-CSRF-Token'] = session.csrf; }
  if (body !== undefined) { headers['Content-Type'] = 'application/json'; headers['Idempotency-Key'] ??= randomUUID(); }
  const response = await new Promise((done, reject) => {
    const req = httpsRequest(origin + path, { method: body === undefined ? 'GET' : 'POST', headers, rejectUnauthorized: false }, res => {
      const parts = [];
      res.on('data', b => parts.push(b));
      res.on('error', reject);
      res.on('end', () => done({ status: res.statusCode, cookie: res.headers['set-cookie']?.[0]?.split(';')[0], data: json(Buffer.concat(parts).toString()) }));
    });
    req.setTimeout(240000, () => req.destroy(new Error('timeout: ' + path)));
    req.on('error', reject);
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
  return response;
}

const { openStorage } = await import('../vps/sqlite-port.mjs');
const { FileBucket } = await import('../vps/file-bucket.mjs');
const { createEditorService } = await import('../vps/editor-server.mjs');
const { createEditorHTTPS } = await import('./editor_local_https.mjs');
const { stageInstalledEditorSource } = await import('./editor_stage_source.mjs');

const storage = openStorage(join(own, 'authority.sqlite'));
const bucket = new FileBucket({ root: join(own, 'private-objects') });
const source = await stageInstalledEditorSource({
  get: key => bucket.get(key),
  put: (key, bytes, _options) => bucket.put(key, bytes, { onlyIf: new Headers({ 'If-None-Match': '*' }) }),
});
const service = createEditorService({ storage, bucket, env: { ...config.vars, EDITOR_DEFAULT_PASSWORD: initial, EDITOR_REQUEST_KEY: secret, EDITOR_INSTALLED_SOURCE_ROOT: JSON.stringify(source) } });
const transport = await createEditorHTTPS({ dispatchFetch: (url, init) => service.fetch(new Request(url, init)) }, { port });
const close = async () => { try { await transport.close(); } finally { storage.close(); } };

test('copy 全链路：建游戏→ensure幂等→模块存→检验→提交→状态机', async () => {
  try {
  const login = await call('/api/auth/login', { account: 'tianyi', password: initial });
  assert.equal(login.status, 200);
  const changed = await call('/api/auth/password', { oldPassword: initial, newPassword: password }, { cookie: login.cookie, csrf: login.data.csrf });
  assert.equal(changed.status, 200);
  const admin = { cookie: changed.cookie, csrf: changed.data.csrf };

  assert.equal((await call('/api/admin/source/install', {}, admin)).status, 200);
  const installed = await call('/api/admin/source', undefined, admin);
  assert.equal(installed.status, 200);
  const copyKey = randomUUID();
  const copy = await call('/api/admin/copies', { registryId: installed.data.definition.registryId, name: '链路', introduction: 'HTTP回放' }, admin, { 'Idempotency-Key': copyKey });
  assert.equal(copy.status, 202);
  const run = await call('/api/admin/copies/' + copyKey + '/run', {}, admin, { 'If-Match': '"1"' });
  assert.equal(run.status, 200);
  const gameId = run.data.gameId;
  assert.match(gameId, /^[a-f0-9-]{36}$/);

  // ensure 幂等：两次同摘要。
  const e1 = await call(`/api/games/${gameId}/copy/ensure`, {}, admin);
  assert.equal(e1.status, 200, JSON.stringify(e1.data).slice(0, 300));
  const e2 = await call(`/api/games/${gameId}/copy/ensure`, {}, admin);
  assert.equal(e2.status, 200);
  assert.equal(e2.data.copyDigest, e1.data.copyDigest);
  assert.match(e1.data.copyDigest, /^[a-f0-9]{64}$/);

  const got = await call(`/api/games/${gameId}/copy`, undefined, admin);
  assert.equal(got.status, 200);
  assert.equal(got.data.copyDigest, e1.data.copyDigest);

  // 模块存：只改 metadata，摘要必变。
  const w = await call(`/api/games/${gameId}/copy`, { module: 'metadata', patch: { name: '链路改名', introduction: 'HTTP回放改后' } }, admin);
  assert.equal(w.status, 200, JSON.stringify(w.data).slice(0, 300));
  assert.notEqual(w.data.copyDigest, e1.data.copyDigest);

  // 未验禁用，人话阻断。
  const s0 = await call(`/api/games/${gameId}/copy/submission`, undefined, admin);
  assert.equal(s0.status, 200);
  assert.equal(s0.data.publishEnabled, false);
  assert.ok(s0.data.blockedReason?.includes('重新检验'));

  // 整包检验：受信源须通过。
  const v = await call(`/api/games/${gameId}/copy/validate`, {}, admin);
  assert.equal(v.status, 200, JSON.stringify(v.data).slice(0, 500));
  assert.equal(v.data.state, 'passed');
  assert.ok(typeof v.data.ticket === 'string' && v.data.ticket.length >= 32);

  const s1 = await call(`/api/games/${gameId}/copy/submission`, undefined, admin);
  assert.equal(s1.status, 200);
  assert.equal(s1.data.publishEnabled, true);
  assert.equal(s1.data.blockedReason, null);
  assert.equal(s1.data.nextVersion, '1.0');

  // 提交：说明必填，票一次性。
  const sub = await call(`/api/games/${gameId}/copy/submission`, { ticket: v.data.ticket, description: '首版说明\n第二行' }, admin);
  assert.equal(sub.status, 200, JSON.stringify(sub.data).slice(0, 300));
  assert.equal(sub.data.state, 'submitted');

  const s2 = await call(`/api/games/${gameId}/copy/submission`, undefined, admin);
  assert.equal(s2.data.publishEnabled, false);
  assert.ok(s2.data.blockedReason?.includes('待审核'));

  const replay = await call(`/api/games/${gameId}/copy/submission`, { ticket: v.data.ticket, description: '复投' }, admin);
  assert.equal(replay.status, 409);
  assert.equal(replay.data.error, 'VALIDATION_STALE');

  // 越权与参数门。
  const anon = await call(`/api/games/${gameId}/copy`, undefined, undefined);
  assert.equal(anon.status, 401);
  const missing = await call('/api/games/00000000-0000-4000-8000-000000000000/copy', undefined, admin);
  assert.equal(missing.status, 404);
  const badModule = await call(`/api/games/${gameId}/copy`, { module: 'nope', patch: {} }, admin);
  assert.equal(badModule.status, 422);
  assert.equal(badModule.data.error, 'COPY_MODULE');
  const badTicket = await call(`/api/games/${gameId}/copy/submission`, { ticket: 'x', description: '说明' }, admin);
  assert.equal(badTicket.status, 422);

  // 同意：走真实 prepare（compile＋季节图＋画像＋manifest），此前该路径从未被覆盖
  // （approve-slot 单测用注入桩代替了包安装），copy 引用无 rootKey 曾在此 422。
  const ok = await call(`/api/games/${gameId}/copy/approve`, {}, admin);
  assert.equal(ok.status, 200, JSON.stringify(ok.data).slice(0, 500));
  assert.equal(ok.data.state, 'approved');
  assert.equal(ok.data.ordinal, '1.0');
  const s3 = await call(`/api/games/${gameId}/copy/submission`, undefined, admin);
  assert.equal(s3.status, 200);
  assert.equal(s3.data.slot.state, 'approved');
  assert.equal(s3.data.version, '1.0');
  assert.equal(s3.data.nextVersion, '1.1');
  } finally { await close(); }
});
