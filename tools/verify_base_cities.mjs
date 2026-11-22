// 系統基礎據點：saveCities 部分寫入、replaceCities 整份覆蓋、單複製門。
// 用法：node --test tools/verify_base_cities.mjs（cwd=web-port）
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { BUILTIN_RESOURCES } from '../web/src/content/builtinresources.generated.js';
import { readInstalledEditorSource } from './editor_builtin_source.mjs';
import { convertInstalledSystemBaseMap } from './system_base_map_conversion.mjs';
import { SystemBaseMapStore } from '../server/systembasemapstore.js';
import { AdminFullCopy } from '../server/admincopy.js';
import { FIXED_COPY_PROFILE, FIXED_TEMPLATE_PROFILE } from '../server/copyprofile.js';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const source = readInstalledEditorSource();
const { template } = convertInstalledSystemBaseMap(source, BUILTIN_RESOURCES.sourceDigest);

function makeSql() {
  const db = new DatabaseSync(':memory:');
  return { exec: (q, ...p) => {
    const stmt = db.prepare(String(q));
    if (/^\s*(SELECT|WITH|PRAGMA)\b/i.test(q)) { const rows = stmt.all(...p); return { toArray: () => rows }; }
    stmt.run(...p); return { toArray: () => [] };
  } };
}
const run = (db, q, ...p) => db.prepare(q).run(...p);
const admin = { id: 'admin-1', role: 'admin', must_change: 0, epoch: 1 };
const author = { id: 'author-1', role: 'author', must_change: 0, epoch: 1 };

function makeBaseStore() {
  const sql = makeSql();
  const storage = { sql, transactionSync: fn => fn() };
  return new SystemBaseMapStore({ storage, principal: () => admin, loadInitialTemplate: async () => JSON.parse(JSON.stringify(template)) });
}
const failWith = (fn, status, code) => {
  try { fn(); } catch (e) { assert.equal(e.status, status, 'status for ' + code); assert.equal(e.code, code); return; }
  assert.fail('expected ' + code);
};
function firstCityOn(store) {
  const snapshot = store.read('tok');
  const id = Object.keys(snapshot.template.content.cities).sort()[0];
  return { id, row: snapshot.template.content.cities[id] };
}

test('saveCities patches names and numbers with version bump', async () => {
  const store = makeBaseStore();
  await store.initialize('tok');
  const v0 = store.read('tok');
  const { id, row } = firstCityOn(store);
  const out = store.saveCities('tok', { rename: { [id]: '測試城' }, numbers: { [id]: { max_prod: row.max_prod + 1 } } });
  assert.equal(out.version, v0.version + 1);
  assert.notEqual(out.digest, v0.digest);
  const after = store.read('tok');
  assert.equal(after.template.content.cities[id].name, '測試城');
  assert.equal(after.template.content.cities[id].max_prod, row.max_prod + 1);
  // 其它城不动。
  assert.equal(Object.keys(after.template.content.cities).length, Object.keys(v0.template.content.cities).length);
});

test('saveCities rejects bad patches and non-admin', async () => {
  const sql = makeSql();
  const storage = { sql, transactionSync: fn => fn() };
  const store = new SystemBaseMapStore({ storage, principal: () => admin, loadInitialTemplate: async () => JSON.parse(JSON.stringify(template)) });
  await store.initialize('tok');
  const { id } = firstCityOn(store);
  const otherId = Object.keys(store.read('tok').template.content.cities).sort()[1];
  const otherName = store.read('tok').template.content.cities[otherId].name;
  failWith(() => store.saveCities('tok', {}), 422, 'BASE_CITIES_PATCH');
  failWith(() => store.saveCities('tok', { rename: { [id]: otherName } }), 409, 'BASE_CITY_NAME_TAKEN');
  failWith(() => store.saveCities('tok', { rename: { 'no-such-city': '新城' } }), 422, 'BASE_CITY');
  failWith(() => store.saveCities('tok', { numbers: { [id]: { max_prod: 70000 } } }), 422, 'BASE_CITY');
  failWith(() => store.saveCities('tok', { numbers: { [id]: { troops: -1 } } }), 422, 'BASE_CITY');
  const locked = new SystemBaseMapStore({ storage, principal: () => author, loadInitialTemplate: async () => JSON.parse(JSON.stringify(template)) });
  failWith(() => locked.saveCities('tok', { rename: { [id]: '越權城' } }), 403, 'ADMIN_REQUIRED');
  failWith(() => locked.replaceCities('tok', store.read('tok').template.content.cities), 403, 'ADMIN_REQUIRED');
});

test('saveCities patches battlefield and troopcap with range gates', async () => {
  const store = makeBaseStore();
  await store.initialize('tok');
  const { id } = firstCityOn(store);
  failWith(() => store.saveCities('tok', { numbers: { [id]: { type: 3 } }, battlefield: { [id]: 'ki-1995:siege:7' } }), 422, 'BASE_CITY');
  const out = store.saveCities('tok', { numbers: { [id]: { type: 2 } }, battlefield: { [id]: 'ki-1995:siege:7' }, troopcap: { [id]: 60 } });
  assert.equal(out.version, store.read('tok').version);
  const after = store.read('tok');
  assert.equal(after.template.content.cities[id].battleMapId, 'ki-1995:siege:7');
  assert.equal(after.template.content.cities[id].troops_cap, 60);
  failWith(() => store.saveCities('tok', { battlefield: { [id]: 'ki-1995:siege:192' } }), 422, 'BASE_CITY');
  failWith(() => store.saveCities('tok', { troopcap: { [id]: 256 } }), 422, 'BASE_CITY');
  failWith(() => store.saveCities('tok', { troopcap: { [id]: -1 } }), 422, 'BASE_CITY');
  failWith(() => store.saveCities('tok', { troopcap: { 'no-such-city': 10 } }), 422, 'BASE_CITY');
});

test('replaceCities swaps the whole set', async () => {
  const store = makeBaseStore();
  await store.initialize('tok');
  const v0 = store.read('tok');
  const cities = JSON.parse(JSON.stringify(v0.template.content.cities));
  const ids = Object.keys(cities).sort();
  cities[ids[0]].name = '首城改名';
  cities[ids[0]].prod = 7;
  const out = store.replaceCities('tok', cities);
  assert.equal(out.version, v0.version + 1);
  const after = store.read('tok');
  assert.equal(after.template.content.cities[ids[0]].name, '首城改名');
  assert.equal(after.template.content.cities[ids[0]].prod, 7);
  failWith(() => store.replaceCities('tok', {}), 422, 'BASE_CITIES');
  failWith(() => store.replaceCities('tok', { [ids[0]]: { ...cities[ids[0]], name: '' } }), 422, 'BASE_CITIES_INVALID');
});

function makeCopies() {
  const db = new DatabaseSync(':memory:');
  const sql = { exec: (q, ...p) => {
    const stmt = db.prepare(String(q));
    if (/^\s*(SELECT|WITH|PRAGMA)\b/i.test(q)) { const rows = stmt.all(...p); return { toArray: () => rows }; }
    stmt.run(...p); return { toArray: () => [] };
  } };
  const storage = { sql, transactionSync: fn => fn() };
  sql.exec('CREATE TABLE content_games (game_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL)');
  sql.exec('CREATE TABLE content_names (actor TEXT NOT NULL, name TEXT NOT NULL, game_id TEXT NOT NULL)');
  sql.exec('CREATE TABLE content_used_ids (game_id TEXT PRIMARY KEY)');
  sql.exec('CREATE TABLE content_reservations (actor TEXT NOT NULL, op_key TEXT NOT NULL, method TEXT NOT NULL, target TEXT NOT NULL, digest TEXT NOT NULL, epoch INTEGER NOT NULL)');
  sql.exec('CREATE TABLE content_operations (actor TEXT NOT NULL, op_key TEXT NOT NULL)');
  const catalog = {
    loadFull: async () => { throw new Error('no-load'); },
    status: () => ({ definitionDigest: 'd'.repeat(64), rootDigest: 'r'.repeat(64) }),
    definition: () => ({ profileRevision: FIXED_COPY_PROFILE }),
  };
  const games = {
    recoverGameId: () => { throw new Error('no-execute'); },
    assertNameAvailableInTxn: () => {},
    assertNotDeleting: () => {},
    listOwn: () => [],
    snapshotReference: () => { throw new Error('no-query'); },
  };
  const blobs = { putImmutable: async () => { throw new Error('no-put'); }, read: async () => { throw new Error('no-read'); } };
  const opts = { storage, principal: () => admin, catalog, games, blobs, leaseMs: 60000,
    captureBaseMap: () => { throw new Error('no-base'); }, createCopyLoader: () => { throw new Error('no-loader'); } };
  return { copies: new AdminFullCopy(opts), db };
}

test('single-copy gate blocks a new full copy only while a blessed game exists', () => {
  const { copies, db } = makeCopies();
  // 失败行不占位。
  run(db, "INSERT INTO copy_requests VALUES(?,?,?,?,?,?,?,?,?,?,'failed',0,NULL,0,'1',?,NULL)",
    'admin-1', 'old-op', 'x', 1, 'dead-game', 'reg', 'd'.repeat(64), 'r'.repeat(64), FIXED_COPY_PROFILE, '{}', new Date().toISOString());
  assert.equal(copies.blessed('tok'), null);
  // 进行中的预留不挡新预留（并发常态，以提交先后为准）。
  copies.reserve('tok', 'op-one-000000000001', { registryId: 'reg', name: '甲遊戲', introduction: '首個' });
  copies.reserve('tok', 'op-two-000000000002', { registryId: 'reg', name: '乙遊戲', introduction: '第二' });
  // 同 key 幂等恢复不受门影响。
  copies.reserve('tok', 'op-one-000000000001', { registryId: 'reg', name: '甲遊戲', introduction: '首個' });
});

test('blessed derives from the surviving committed copy', () => {
  const { copies, db } = makeCopies();
  run(db, 'INSERT INTO content_games VALUES(?,?)', 'game-blessed', 'admin-1');
  run(db, "INSERT INTO copy_requests VALUES(?,?,?,?,?,?,?,?,?,?,'committed',1,NULL,0,'2',?,?)",
    'admin-1', 'op-done-00000000001', 'x', 1, 'game-blessed', 'reg', 'd'.repeat(64), 'r'.repeat(64), FIXED_COPY_PROFILE, '{"name":"基準遊戲"}', new Date().toISOString(),
    JSON.stringify({ gameId: 'game-blessed', draftRevision: '1' }));
  assert.deepEqual(copies.blessed('tok'), { gameId: 'game-blessed', name: '基準遊戲', createdAt: copies.blessed('tok').createdAt });
  assert.throws(() => copies.reserve('tok', 'op-new-000000000003', { registryId: 'reg', name: '新遊戲', introduction: 'x' }), /COPY_SINGLETON_EXISTS/);
  // 删除游戏后让位。
  run(db, 'DELETE FROM content_games WHERE game_id=?', 'game-blessed');
  assert.equal(copies.blessed('tok'), null);
  copies.reserve('tok', 'op-new-000000000003', { registryId: 'reg', name: '新遊戲', introduction: 'x' });
});
