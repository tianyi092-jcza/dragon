// Main editor authority, isolated SQLite, no production login or elapsed-time sleeps.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { register } from 'node:module';
import { openStorage } from '../vps/sqlite-port.mjs';
register('../vps/text-loader.mjs', import.meta.url);
const { createEditorApplication } = await import('../server/editorapp.js');
const Editor = createEditorApplication(class {}), storage = openStorage(':memory:');
const origin = 'https://editor.invalid', initial = 'Test-Initial-Password1!', changed = 'Test-Changed-Password1!';
const env = { EDITOR_ORIGIN: origin, EDITOR_DEFAULT_PASSWORD: initial, EDITOR_REQUEST_KEY: 'b'.repeat(64) };
const start = mode => new Editor({ storage }, { ...env, EDITOR_SINGLE_USER: mode });
const clock = Date.now;
let now = clock(), app = start('0');
Date.now = () => now;
async function call(path, data, session) {
  const response = await app.fetch(new Request(origin + path, { method: data ? 'POST' : 'GET', headers: {
    ...(session && { Cookie: session.cookie, 'X-CSRF-Token': session.csrf }),
    ...(data && { Origin: origin, 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() }),
  }, body: data && JSON.stringify(data) }));
  const body = await response.json();
  return { status: response.status, cookie: response.headers.get('Set-Cookie')?.split(';')[0], csrf: body.csrf, error: body.error };
}
const login = (password, account = 'tianyi') => call('/api/auth/login', { account, password });
const check = async (session, status) => assert.equal((await call('/api/session', undefined, session)).status, status);
try {
  const legacy = await login(initial); assert.equal(legacy.status, 200);
  now += 31 * 60000;
  app = start('1'); await check(legacy, 401); // Never revive a previously expired token.
  const first = await login(initial); assert.equal(first.status, 200);
  now += 24 * 3600000; await check(first, 403); // Still authenticated, but first-login password change is mandatory.
  const current = await call('/api/auth/password', { oldPassword: initial, newPassword: changed }, first);
  assert.equal(current.status, 200); await check(first, 401);
  app = start('1'); now += 365 * 24 * 3600000; await check(current, 200);
  assert.equal((await call('/api/admin/accounts', { account: 'fixture_author' }, current)).status, 200);
  assert.equal((await call('/api/auth/logout', {}, { ...current, csrf: 'wrong' })).status, 403);
  const author = await login(initial, 'fixture_author'); assert.equal(author.status, 200); await check(current, 401);
  assert.equal((await call('/api/auth/logout', {}, author)).status, 200); await check(author, 401);
  const beforeSwitch = await login(changed); await check(beforeSwitch, 200);
  app = start('0'); await check(beforeSwitch, 401);
  const timed = await login(changed); await check(timed, 200); now += 31 * 60000; await check(timed, 401);
  console.log('PASS: editor login and password rotation survive long idle/restart; authenticated write, CSRF, logout, account switch and timed mode checked');
} finally { Date.now = clock; storage.close(); }
