// 據點圖片自管庫（Web 产品决定 2026-11）：store 單元＋catalog 控制器＋HTTP 路由。
// 用法：node --test tools/verify_city_pictures.mjs（cwd=web-port）
import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { register } from 'node:module';
register('../vps/text-loader.mjs', import.meta.url);
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { request } from 'node:https';
import { encodePNG } from '../server/pngio.js';
import { CityPictureStore, bindCityPictureStorage, hasCityPictureView,
  CITY_PICTURE_BUILTIN_COUNT, CITY_PICTURE_MAX_VIEW } from '../server/citypicturestore.js';
import { cityViewGaps } from '../server/trials.js';
const { collectCustomCityPictureEntries } = await import('../server/playpacks.js');

function makeSql() {
  const db = new DatabaseSync(':memory:');
  return { exec: (q, ...p) => {
    const stmt = db.prepare(String(q));
    if (/^\s*(SELECT|WITH|PRAGMA)\b/i.test(q)) { const rows = stmt.all(...p); return { toArray: () => rows }; }
    stmt.run(...p); return { toArray: () => [] };
  } };
}
const storageOf = sql => ({ sql, transactionSync: fn => fn() });
function pngBase64(width, height) {
  const pixels = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    pixels[i * 4] = i % 251; pixels[i * 4 + 1] = (i * 7) % 251; pixels[i * 4 + 2] = (i * 13) % 251; pixels[i * 4 + 3] = 255;
  }
  return Buffer.from(encodePNG(pixels, width, height, 4)).toString('base64');
}
const failSync = (fn, code) => {
  try { fn(); } catch (error) { assert.equal(error.code ?? error.message, code, String(error && (error.stack || error))); return; }
  assert.fail('expected ' + code);
};

test('store：內建只認 0..14，自管分配／等比壓縮／空洞複用／上限拒收', () => {
  const store = new CityPictureStore({ storage: storageOf(makeSql()) });
  assert.equal(CITY_PICTURE_BUILTIN_COUNT, 15);
  assert.equal(store.list().length, 0);
  for (let view = 0; view < 15; view++) assert.equal(store.has(view), true);
  assert.equal(store.has(15), false);
  assert.equal(store.has(-1), false);
  assert.equal(store.has(256), false);
  // 未綁定時 fail-closed：16 不認。
  assert.equal(hasCityPictureView(16), false);
  const created = store.add(pngBase64(192, 192));
  assert.equal(created.view, 15);
  assert.deepEqual([created.width, created.height], [192, 192]);
  const scaled = store.add(pngBase64(100, 50));
  assert.equal(scaled.view, 16);
  assert.deepEqual([scaled.width, scaled.height], [192, 96]);
  assert.equal(store.has(15), true);
  assert.equal(store.get(15).width, 192);
  assert.equal(store.get(999), null);
  failSync(() => store.add(Buffer.from('not a png').toString('base64')), 'CITY_PICTURE_FORMAT');
  failSync(() => store.add(Buffer.alloc(400 * 1024 + 1).toString('base64')), 'CITY_PICTURE_UPLOAD');
  failSync(() => store.add('!!!'), 'CITY_PICTURE_UPLOAD');
  failSync(() => store.replace(3, pngBase64(192, 192)), 'CITY_PICTURE_BUILTIN');
  failSync(() => store.remove(3), 'CITY_PICTURE_BUILTIN');
  failSync(() => store.replace(17, pngBase64(192, 192)), 'CITY_PICTURE_NOT_FOUND');
  failSync(() => store.remove(17), 'CITY_PICTURE_NOT_FOUND');
  const replaced = store.replace(16, pngBase64(64, 64));
  assert.deepEqual([replaced.width, replaced.height], [192, 192]);
  assert.deepEqual(store.remove(15), { view: 15 });
  assert.equal(store.has(15), false);
  // 空洞優先複用：下一個仍是 15。
  assert.equal(store.add(pngBase64(192, 192)).view, 15);
});

test('store：填滿 15..255 後分配拒收', () => {
  const sql = makeSql(), store = new CityPictureStore({ storage: storageOf(sql) });
  const tiny = Buffer.from(encodePNG(new Uint8Array([1, 2, 3, 255]), 1, 1, 4));
  for (let view = 15; view <= 255; view++) {
    sql.exec('INSERT INTO city_pictures VALUES(?,?,?,?,?,?,?)', view, tiny, 'a'.repeat(64), tiny.length, 192, 192, '2026-01-01');
  }
  assert.equal(store.list().length, 241);
  failSync(() => store.allocate(), 'CITY_PICTURE_EXHAUSTED');
  void CITY_PICTURE_MAX_VIEW;
});

test('准入共用：綁定後自管圖放行，未綁定前僅內建', () => {
  const store = new CityPictureStore({ storage: storageOf(makeSql()) });
  assert.equal(hasCityPictureView(0), true);
  assert.equal(hasCityPictureView(14), true);
  assert.equal(hasCityPictureView(15), false);
  assert.equal(hasCityPictureView(300), false);
  bindCityPictureStorage(storageOf(makeSql()));
  assert.equal(hasCityPictureView(20), false);
  void store;
});

test('trials 發布門：預設凍結集；呼叫方可傳自管已知集', () => {
  const cities = [{ idx: 1, view: 0 }, { idx: 2, view: 20 }];
  const gaps = cityViewGaps(cities);
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].value, 20);
  assert.deepEqual(cityViewGaps(cities, new Set([0, 20])), []);
  assert.deepEqual(cityViewGaps([{ idx: 1, view: 0 }]), []);
});

test('發包凍結：只收錄引用到的自管圖並排序去重，缺圖即壞引用', () => {
  const pic = view => ({ sha256: 'd'.repeat(64), byteLength: 100 + view, bytes: Buffer.from([view]) });
  const states = {
    a: { cities: [{ idx: 1, view: 0 }, { idx: 2, view: 20 }, { idx: 3, view: 15 }] },
    b: { cities: [{ idx: 9, view: 20 }, { idx: 10, view: 300 }] },
  };
  const rows = collectCustomCityPictureEntries(states, pic);
  assert.deepEqual(rows.map(row => row.view), [15, 20]);
  assert.deepEqual(rows[0], Object.freeze({ view: 15, assetId: 'city-picture-15', sha256: 'd'.repeat(64), byteLength: 115, role: 'game-city-picture', mime: 'image/png', bytes: Buffer.from([15]) }));
  assert.deepEqual(collectCustomCityPictureEntries(states, null), []);
  assert.deepEqual(collectCustomCityPictureEntries({}, pic), []);
  failSync(() => collectCustomCityPictureEntries(states, view => (view === 20 ? null : pic(view))), 'PLAY_CITY_VIEW_MISSING');
});

// ---- catalog 控制器（server/public/catalog.txt） ----
const catalogSource = readFileSync('server/public/catalog.txt', 'utf8');
const { installLibraryRegistration } = await import('data:text/javascript;base64,' + Buffer.from(catalogSource).toString('base64'));
const kyoRow = id => ({ path: `grf/kyo_${String(id).padStart(2, '0')}.png`, byteLength: 2000 + id, sha256: 'b'.repeat(63) + String(id % 10), category: 'city-picture', url: `/city-picture/${id}.png`, width: 192, height: 192 });
function catalogSetup(actor, hook) {
  let model = null;
  const ui = installLibraryRegistration({
    api: async (path, body) => hook(path, body),
    authority: () => actor, isBusy: () => false,
    publish: value => { model = value; },
    work: async fn => { try { return await fn(); } finally { ui.render(); } },
  });
  ui.setIdentity(actor);
  return { ui, get model() { return model; } };
}
const adminActor = { user: { id: 'admin', role: 'admin', version: 2, mustChangePassword: false } };
const authorActor = { user: { id: 'author', role: 'author', version: 2, mustChangePassword: false } };
function resourceReply(extra = []) {
  return { mode: 'BUILTIN_READONLY', registryId: 'approved-available-library-f4ba804b-1', resources: [
    { path: 'kao/0.png', byteLength: 100, sha256: 'a'.repeat(64), category: 'portrait' },
    kyoRow(0),
    ...extra,
  ] };
}

test('catalog：據點圖片自成一類、相冊直讀 url、管理員可管作者禁管', async () => {
  const custom = { path: 'city-picture/15.png', byteLength: 1500, sha256: 'c'.repeat(64), category: 'city-picture', url: '/city-picture/15.png', width: 192, height: 96 };
  const calls = [];
  const hook = async (path, body) => { calls.push({ path, body }); return resourceReply([custom]); };
  const admin = catalogSetup(adminActor, hook);
  await admin.ui.actions.load();
  assert.deepEqual(admin.model.categories.map(item => item.id), ['portrait', 'image', 'city-picture', 'audio', 'font', 'data']);
  assert.equal(admin.model.canManage, true);
  admin.ui.actions.selectCategory('city-picture');
  assert.equal(admin.model.category, 'city-picture');
  assert.equal(admin.model.rows.length, 2);
  const customRow = admin.model.rows.find(row => row.path === 'city-picture/15.png');
  assert.equal(customRow.url, '/city-picture/15.png');
  assert.deepEqual([customRow.width, customRow.height], [192, 96]);
  const kyoRowOut = admin.model.rows.find(row => row.path === 'grf/kyo_00.png');
  assert.equal(kyoRowOut.url, '/city-picture/0.png');
  assert.deepEqual([kyoRowOut.width, kyoRowOut.height], [192, 192]);
  const author = catalogSetup(authorActor, hook);
  await author.ui.actions.load();
  assert.equal(author.model.canManage, false);
  await assert.rejects(author.ui.actions.uploadCityPicture('data:image/png;base64,' + pngBase64(8, 8)), /只有管理員/);
  // 新增走 POST／action create；成功後重讀並報完成。
  calls.length = 0;
  await admin.ui.actions.uploadCityPicture('data:image/png;base64,' + pngBase64(8, 8));
  const posted = calls.find(call => call.path === '/api/city-pictures');
  assert.deepEqual(Object.keys(posted.body).sort(), ['action', 'png']);
  assert.equal(posted.body.action, 'create');
  assert.match(admin.model.message, /已保存/);
  await admin.ui.actions.replaceCityPicture(15, 'data:image/png;base64,' + pngBase64(8, 8));
  const replaced = [...calls].reverse().find(call => call.path === '/api/city-pictures');
  assert.equal(replaced.body.action, 'replace');
  assert.equal(replaced.body.view, 15);
  await admin.ui.actions.deleteCityPicture(15);
  const deleted = [...calls].reverse().find(call => call.path === '/api/city-pictures');
  assert.equal(deleted.body.action, 'delete');
  assert.match(admin.model.message, /顯示為空/);
  await admin.ui.actions.uploadCityPicture('data:image/jpeg;base64,AAAA');
  assert.match(admin.model.message, /只接受 PNG/);
});

test('catalog：壞條目 fail-closed（自管缺 url／館藏帶 url／尺寸非法）', async () => {
  const bad = async extra => {
    const setup = catalogSetup(adminActor, async () => resourceReply(extra));
    await assert.rejects(setup.ui.actions.load(), /資源條目無效/);
  };
  await bad([{ path: 'city-picture/15.png', byteLength: 9, sha256: 'c'.repeat(64), category: 'city-picture', width: 192, height: 96 }]);
  await bad([{ path: 'grf/kyo_00.png', byteLength: 9, sha256: 'b'.repeat(64), category: 'image', url: '/city-picture/15.png' }]);
  await bad([{ path: 'city-picture/15.png', byteLength: 9, sha256: 'c'.repeat(64), category: 'city-picture', url: '/city-picture/9999.png', width: 192, height: 96 }]);
});

// ---- HTTP 路由：真實 HTTPS＋鑑權＋隔離 SQLite ----
import { openStorage } from '../vps/sqlite-port.mjs';
import { FileBucket } from '../vps/file-bucket.mjs';
import { createEditorService } from '../vps/editor-server.mjs';
import { createEditorHTTPS } from './editor_local_https.mjs';
const port = Number(process.env.EDITOR_TEST_PORT ?? 18797);
const origin = `https://127.0.0.1:${port}`;
const own = mkdtempSync(join(tmpdir(), 'dragon-city-picture-http-'));
const initial = randomBytes(24).toString('hex') + 'Aa1!';
const password = randomBytes(24).toString('hex') + 'Aa1!';
const storage = openStorage(join(own, 'authority.sqlite'));
const bucket = new FileBucket({ root: join(own, 'objects') });
const config = JSON.parse(readFileSync('server/wrangler.jsonc', 'utf8'));
const service = createEditorService({ storage, bucket, env: { ...config.vars, EDITOR_ORIGIN: origin, EDITOR_DEFAULT_PASSWORD: initial, EDITOR_REQUEST_KEY: randomBytes(32).toString('hex') } });
const transport = await createEditorHTTPS({ dispatchFetch: (url, init) => service.fetch(new Request(url, init)) }, { port });
function call(path, body, session) {
  const headers = { Origin: origin, ...(session ? { Cookie: session.cookie, 'X-CSRF-Token': session.csrf } : {}) };
  if (body !== undefined) { headers['Content-Type'] = 'application/json'; headers['Idempotency-Key'] ??= randomUUID(); }
  return new Promise((done, reject) => {
    const req = request(origin + path, { method: body === undefined ? 'GET' : 'POST', headers, rejectUnauthorized: false, agent: false }, response => {
      const parts = [];
      response.on('data', part => parts.push(part)); response.on('error', reject);
      response.on('end', () => {
        const bytes = Buffer.concat(parts);
        let data = null;
        try { data = JSON.parse(bytes.toString('utf8')); } catch {}
        done({ status: response.statusCode, headers: response.headers, cookie: response.headers['set-cookie']?.[0]?.split(';')[0], bytes, data });
      });
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

test('HTTP：管理員新增／替換／刪除＋作者禁寫＋匿名禁讀＋空洞複用', async t => {
  t.after(() => transport.close());
  const login = await call('/api/auth/login', { account: 'tianyi', password: initial });
  assert.equal(login.status, 200);
  const changed = await call('/api/auth/password', { oldPassword: initial, newPassword: password }, { cookie: login.cookie, csrf: login.data.csrf });
  assert.equal(changed.status, 200);
  const admin = { cookie: changed.cookie, csrf: changed.data.csrf };
  await call('/api/admin/accounts', { account: 'pic_author' }, admin);
  const authorLogin = await call('/api/auth/login', { account: 'pic_author', password: initial });
  const authorChanged = await call('/api/auth/password', { oldPassword: initial, newPassword: password }, { cookie: authorLogin.cookie, csrf: authorLogin.data.csrf });
  const author = { cookie: authorChanged.cookie, csrf: authorChanged.data.csrf };
  // 匿名禁讀。
  await failWith('/api/city-pictures', undefined, null, 401, 'LOGIN_REQUIRED');
  // 作者可讀（空）、禁寫。
  assert.deepEqual((await call('/api/city-pictures', undefined, author)).data, { pictures: [] });
  await failWith('/api/city-pictures', { action: 'create', png: pngBase64(8, 8) }, author, 403, 'ADMIN_REQUIRED');
  // 內建圖直讀凍結位元組。
  const builtin = await call('/city-picture/0.png');
  assert.equal(builtin.status, 200);
  assert.equal(builtin.headers['content-type'], 'image/png');
  assert.ok(builtin.bytes.length > 1000);
  // 非法上傳一律 422：非 PNG、超 400K、壞形狀。
  await failWith('/api/city-pictures', { action: 'create', png: Buffer.from('hello').toString('base64') }, admin, 422, 'CITY_PICTURE_FORMAT');
  await failWith('/api/city-pictures', { action: 'create', png: Buffer.alloc(400 * 1024 + 1).toString('base64') }, admin, 422, 'CITY_PICTURE_UPLOAD');
  await failWith('/api/city-pictures', { action: 'create', png: '!!!' }, admin, 422, 'CITY_PICTURE_UPLOAD');
  await failWith('/api/city-pictures', { action: 'frobnicate', png: pngBase64(8, 8) }, admin, 422, 'CITY_PICTURE_ACTION');
  // 新增 8x8→壓 192x192，view 15；再一張 100x50→192x96，view 16。
  const first = await call('/api/city-pictures', { action: 'create', png: pngBase64(8, 8) }, admin);
  assert.equal(first.status, 200);
  assert.deepEqual([first.data.picture.view, first.data.picture.width, first.data.picture.height], [15, 192, 192]);
  const second = await call('/api/city-pictures', { action: 'create', png: pngBase64(100, 50) }, admin);
  assert.equal(second.data.picture.view, 16);
  assert.deepEqual([second.data.picture.width, second.data.picture.height], [192, 96]);
  const list = await call('/api/city-pictures', undefined, author);
  assert.equal(list.data.pictures.length, 2);
  // 自管圖位元組可讀；命中 sha 走 immutable，未帶走 no-store；壞 sha 拒收。
  const custom = await call('/city-picture/15.png');
  assert.equal(custom.status, 200);
  assert.equal(custom.headers['content-type'], 'image/png');
  assert.equal(custom.headers['cache-control'], 'no-store');
  const sha = first.data.picture.sha256;
  const pinned = await call(`/city-picture/15.png?sha=${sha}`);
  assert.equal(pinned.status, 200);
  assert.match(pinned.headers['cache-control'] ?? '', /immutable/);
  assert.equal(pinned.headers['x-content-sha256'], sha);
  await failWith('/city-picture/15.png?sha=xyz', undefined, admin, 422, 'CITY_PICTURE_QUERY');
  const stale = await call(`/city-picture/15.png?sha=${'0'.repeat(64)}`);
  assert.equal(stale.status, 200);
  assert.equal(stale.headers['cache-control'], 'no-store');
  await failWith('/api/city-pictures', { action: 'replace', view: 3, png: pngBase64(8, 8) }, admin, 422, 'CITY_PICTURE_BUILTIN');
  await failWith('/api/city-pictures', { action: 'replace', view: 16, png: pngBase64(8, 8) }, author, 403, 'ADMIN_REQUIRED');
  const replaced = await call('/api/city-pictures', { action: 'replace', view: 16, png: pngBase64(8, 8) }, admin);
  assert.deepEqual([replaced.data.picture.view, replaced.data.picture.width], [16, 192]);
  // 內建禁刪；刪除 15 後讀圖 404、清單剩 16；再新增複用 15。
  await failWith('/api/city-pictures', { action: 'delete', view: 0 }, admin, 422, 'CITY_PICTURE_BUILTIN');
  assert.deepEqual((await call('/api/city-pictures', { action: 'delete', view: 15 }, admin)).data, { removed: { view: 15 } });
  assert.equal((await call('/city-picture/15.png')).status, 404);
  assert.deepEqual((await call('/api/city-pictures', undefined, author)).data.pictures.map(row => row.view), [16]);
  const reused = await call('/api/city-pictures', { action: 'create', png: pngBase64(8, 8) }, admin);
  assert.equal(reused.data.picture.view, 15);
});
