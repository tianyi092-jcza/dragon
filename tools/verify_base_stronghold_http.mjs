// 基礎據點：真實 HTTPS/鑑權/隔離 SQLite；不碰使用者資料與 SAVE.DAT。
// API：讀取／改名＋數值／拒絕門／直推／新建播種；瀏覽器：管理員模組顯隱、加載、行內編輯保存。
// 用法：node --test tools/verify_base_stronghold_http.mjs（cwd=web-port）
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { request } from 'node:https';
import { createRequire } from 'node:module';
const requireModule = createRequire(import.meta.url);
import { openStorage } from '../vps/sqlite-port.mjs';
import { FileBucket } from '../vps/file-bucket.mjs';
import { createEditorService } from '../vps/editor-server.mjs';
import { createEditorHTTPS } from './editor_local_https.mjs';
import { stageInstalledEditorSource } from './editor_stage_source.mjs';

const port = Number(process.env.EDITOR_TEST_PORT ?? 18793);
const origin = `https://127.0.0.1:${port}`;
const own = mkdtempSync(join(tmpdir(), 'dragon-base-city-http-'));
const initial = randomBytes(24).toString('hex') + 'Aa1!', password = randomBytes(24).toString('hex') + 'Aa1!';
const storage = openStorage(join(own, 'authority.sqlite'));
const bucket = new FileBucket({ root: join(own, 'objects') });
const source = await stageInstalledEditorSource({ get: key => bucket.get(key), put: (key, bytes) => bucket.put(key, bytes, { onlyIf: new Headers({ 'If-None-Match': '*' }) }) });
const config = JSON.parse(readFileSync('server/wrangler.jsonc', 'utf8'));
const service = createEditorService({ storage, bucket, env: { ...config.vars, EDITOR_ORIGIN: origin, EDITOR_DEFAULT_PASSWORD: initial, EDITOR_REQUEST_KEY: randomBytes(32).toString('hex'), EDITOR_INSTALLED_SOURCE_ROOT: JSON.stringify(source) } });
const transport = await createEditorHTTPS({ dispatchFetch: (url, init) => service.fetch(new Request(url, init)) }, { port });
function call(path, body, session, extra = {}) {
  const headers = { Origin: origin, ...(session ? { Cookie: session.cookie, 'X-CSRF-Token': session.csrf } : {}), ...extra };
  if (body !== undefined) { headers['Content-Type'] = 'application/json'; headers['Idempotency-Key'] ??= randomUUID(); }
  return new Promise((done, reject) => {
    const req = request(origin + path, { method: body === undefined ? 'GET' : 'POST', headers, rejectUnauthorized: false, agent: false }, response => {
      const parts = [];
      response.on('data', part => parts.push(part)); response.on('error', reject);
      response.on('end', () => done({ status: response.statusCode, cookie: response.headers['set-cookie']?.[0]?.split(';')[0], data: JSON.parse(Buffer.concat(parts).toString('utf8')) }));
    });
    req.setTimeout(240000, () => req.destroy(new Error('HTTP timeout: ' + path)));
    req.on('error', cause => reject(new Error(`HTTP ${path}: ${cause.message}`, { cause }))); req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}
const failWith = async (path, body, session, status, code) => {
  const reply = await call(path, body, session);
  assert.equal(reply.status, status, path);
  assert.equal(reply.data.error, code, path + ' ' + JSON.stringify(reply.data));
};

test('基礎據點：讀寫、拒絕門、直推、新建播種', async () => {
  try {
    const login = await call('/api/auth/login', { account: 'tianyi', password: initial });
    assert.equal(login.status, 200);
    const changed = await call('/api/auth/password', { oldPassword: initial, newPassword: password }, { cookie: login.cookie, csrf: login.data.csrf });
    assert.equal(changed.status, 200);
    const admin = { cookie: changed.cookie, csrf: changed.data.csrf };
    assert.equal((await call('/api/admin/source/install', {}, admin)).status, 200);
    assert.equal((await call('/api/admin/accounts', { account: 'base_author' }, admin)).status, 200);
    const authorLogin = await call('/api/auth/login', { account: 'base_author', password: initial });
    assert.equal(authorLogin.status, 200);
    const authorChanged = await call('/api/auth/password', { oldPassword: initial, newPassword: password }, { cookie: authorLogin.cookie, csrf: authorLogin.data.csrf });
    assert.equal(authorChanged.status, 200);
    const author = { cookie: authorChanged.cookie, csrf: authorChanged.data.csrf };
    // 作者无权读写系统基。
    await failWith('/api/admin/base-cities', undefined, author, 403, 'ADMIN_REQUIRED');
    await failWith('/api/admin/base-cities', { cities: { rename: {} } }, author, 403, 'ADMIN_REQUIRED');
    // 未初始化前讀到空快照。
    const blank = await call('/api/admin/base-cities', undefined, admin);
    assert.equal(blank.status, 200);
    assert.equal(blank.data.snapshot, null);
    assert.equal(blank.data.blessed, null);
    assert.equal((await call('/api/admin/base-map/initialize', {}, admin)).status, 200);
    const empty = await call('/api/admin/base-cities', undefined, admin);
    assert.equal(empty.status, 200);
    assert.equal(empty.data.blessed, null);
    assert.equal(empty.data.snapshot.version, 1);
    const total = Object.keys(empty.data.snapshot.cities).length;
    assert.ok(total >= 192, 'base carries its city definitions, got ' + total);
    const firstId = Object.keys(empty.data.snapshot.cities).sort()[0];
    const first = empty.data.snapshot.cities[firstId];
    // 改名＋數值。
    const saved = await call('/api/admin/base-cities', { cities: { rename: { [firstId]: '基準首城' }, numbers: { [firstId]: { max_prod: first.max_prod + 1 } } } }, admin);
    assert.equal(saved.status, 200);
    assert.equal(saved.data.snapshot.version, 2);
    assert.equal(saved.data.snapshot.cities[firstId].name, '基準首城');
    // 拒絕門。
    await failWith('/api/admin/base-cities', { cities: {} }, admin, 422, 'BASE_CITIES_PATCH');
    await failWith('/api/admin/base-cities', { cities: { rename: { 'no-such': 'x' } } }, admin, 422, 'BASE_CITY');
    const otherId = Object.keys(empty.data.snapshot.cities).sort()[1];
    const otherName = empty.data.snapshot.cities[otherId].name;
    await failWith('/api/admin/base-cities', { cities: { rename: { [firstId]: otherName } } }, admin, 409, 'BASE_CITY_NAME_TAKEN');
    await failWith('/api/admin/base-cities', { cities: { numbers: { [firstId]: { max_prod: 70000 } } } }, admin, 422, 'BASE_CITY');
    await failWith('/api/admin/base-cities', { cities: { numbers: { [firstId]: { troops: -1 } } } }, admin, 422, 'BASE_CITY');
    // 新建遊戲從系統基播種（含剛才的改名）。
    const key = randomUUID();
    assert.equal((await call('/api/games', { name: '播種甲', introduction: 'seed' }, admin, { 'Idempotency-Key': key })).status, 202);
    const created = await call(`/api/games/create/${key}/run`, {}, admin, { 'If-Match': '"1"' });
    assert.equal(created.status, 200, JSON.stringify(created.data));
    const gameId = created.data.gameId;
    const copy = (await call(`/api/games/${gameId}/copy`, undefined, admin)).data;
    assert.equal(copy.data.cities[firstId].name, '基準首城', 'new game seeds cities from the system base');
    // 改遊戲級據點再直推回系統基。
    const cityId = Object.keys(copy.data.cities).sort()[0];
    assert.equal((await call(`/api/games/${gameId}/copy`, { module: 'cities', patch: { rename: { [cityId]: '直推城' } } }, admin)).status, 200);
    const promoted = await call('/api/admin/base-cities/promote', { gameId }, admin);
    assert.equal(promoted.status, 200);
    assert.equal(promoted.data.snapshot.cities[cityId].name, '直推城');
    assert.equal(promoted.data.snapshot.version, 3);
    // 再建遊戲吃到直推後的基。
    const key2 = randomUUID();
    assert.equal((await call('/api/games', { name: '播種乙', introduction: 'seed2' }, admin, { 'Idempotency-Key': key2 })).status, 202);
    const created2 = await call(`/api/games/create/${key2}/run`, {}, admin, { 'If-Match': '"1"' });
    assert.equal(created2.status, 200);
    const copy2 = (await call(`/api/games/${created2.data.gameId}/copy`, undefined, admin)).data;
    assert.equal(copy2.data.cities[cityId].name, '直推城', 'second game seeds the promoted base');
    console.log('PASS base stronghold API: read/write/refusals/promote/seed');
    // 瀏覽器：管理員模組可見、加載、行內改名保存、直推确认后基准行更新。
    const { chromium } = requireModule(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } });
      const equals = admin.cookie.indexOf('=');
      await context.addCookies([{ name: admin.cookie.slice(0, equals), value: admin.cookie.slice(equals + 1), url: origin, secure: true, httpOnly: true, sameSite: 'Strict' }]);
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push('pageerror: ' + e.message));
      page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
      page.on('requestfailed', r => errors.push('requestfailed: ' + r.url()));
      page.on('dialog', dialog => dialog.accept());
      const idle = () => page.waitForFunction(() => document.querySelector('.workbench')?.getAttribute('aria-busy') === 'false');
      await page.goto(origin);
      await idle();
      await page.locator('#menu [data-view="base-stronghold-editor"]').click();
      await idle();
      const panel = page.locator('#base-stronghold-editor');
      await panel.waitFor();
      await panel.locator('#base-stronghold-load').click();
      await idle();
      await panel.locator('#base-stronghold-table .el-table__row').first().waitFor();
      assert.ok((await panel.locator('#base-stronghold-status').textContent()).includes(String(total)));
      assert.ok((await panel.locator('#base-stronghold-blessed').textContent()).includes('未設定'));
      const row = panel.locator('#base-stronghold-table .el-table__row').first();
      await row.locator('[data-action="edit"]').click();
      await row.locator('[data-input="name"]').fill('界面改名');
      await row.locator('[data-action="save"]').click();
      await idle();
      assert.ok((await panel.locator('#base-stronghold-status').textContent()).includes('已保存'));
      console.log('PASS base stronghold browser: module, load, inline edit');
      assert.deepEqual(errors, [], 'no page/console/network errors');
    } finally { await browser.close(); }
  } finally {
    await transport.close(); storage.close();
  }
});
