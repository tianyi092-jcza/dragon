// 帳戶物理刪除（測試用）：真 EditorService＋隔離落盤，驗刪除作者／拒絕删管理員與自己。
// 用法：node --test tools/verify_account_delete.mjs（cwd=web-port）
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';

const own = mkdtempSync(join(tmpdir(), 'dragon-account-delete-'));
const origin = 'https://127.0.0.1:18798';
const initial = randomBytes(24).toString('hex') + 'Aa1!';
const changed = randomBytes(24).toString('hex') + 'Aa1!';
const secret = randomBytes(32).toString('hex');

const { openStorage } = await import('../vps/sqlite-port.mjs');
const { FileBucket } = await import('../vps/file-bucket.mjs');
const { createEditorService } = await import('../vps/editor-server.mjs');
const { stageInstalledEditorSource } = await import('./editor_stage_source.mjs');

const storage = openStorage(join(own, 'authority.sqlite'));
const bucket = new FileBucket({ root: join(own, 'private-objects') });
const source = await stageInstalledEditorSource({
  get: key => bucket.get(key),
  put: (key, bytes, _options) => bucket.put(key, bytes, { onlyIf: new Headers({ 'If-None-Match': '*' }) }),
});
const service = createEditorService({ storage, bucket, env: { EDITOR_ORIGIN: origin, EDITOR_DEFAULT_PASSWORD: initial, EDITOR_REQUEST_KEY: secret, EDITOR_INSTALLED_SOURCE_ROOT: JSON.stringify(source) } });

async function call(path, body, session) {
  const headers = { Origin: origin, 'Content-Type': 'application/json' };
  if (body !== undefined) headers['Idempotency-Key'] = randomUUID();
  if (session) { headers.Cookie = session.cookie; headers['X-CSRF-Token'] = session.csrf; }
  const response = await service.fetch(new Request(origin + path, { method: body === undefined ? 'GET' : 'POST', headers, body: body === undefined ? undefined : JSON.stringify(body) }));
  const data = await response.json().catch(() => ({}));
  return { status: response.status, cookie: response.headers.get('set-cookie')?.split(';')[0], data };
}

test('作者帳戶物理刪除，管理員與自己拒絕', async () => {
  const login = await call('/api/auth/login', { account: 'tianyi', password: initial });
  assert.equal(login.status, 200);
  const changedResponse = await call('/api/auth/password', { oldPassword: initial, newPassword: changed }, { cookie: login.cookie, csrf: login.data.csrf });
  assert.equal(changedResponse.status, 200);
  const admin = { cookie: changedResponse.cookie, csrf: changedResponse.data.csrf };
  const created = await call('/api/admin/accounts', { account: 'doomed-author' }, admin);
  assert.equal(created.status, 200);
  const target = created.data.account;
  assert.equal(target.role, 'author');
  const deleted = await call(`/api/admin/accounts/${target.id}/delete`, { expectedVersion: target.version }, admin);
  assert.equal(deleted.status, 200);
  assert.equal(deleted.data.deleted, target.id);
  const listed = await call('/api/admin/accounts', undefined, admin);
  assert.equal(listed.status, 200);
  assert.ok(!listed.data.accounts.some(row => row.id === target.id), 'deleted author is gone');
  // 管理員帳戶拒絕刪除；重複刪除回 404。
  const admins = listed.data.accounts.filter(row => row.role === 'admin');
  assert.ok(admins.length >= 1);
  const refused = await call(`/api/admin/accounts/${admins[0].id}/delete`, { expectedVersion: admins[0].version }, admin);
  assert.equal(refused.status, 403);
  const again = await call(`/api/admin/accounts/${target.id}/delete`, { expectedVersion: 1 }, admin);
  assert.equal(again.status, 404);
  console.log('PASS account physical delete (author only), admin refused.');
});
