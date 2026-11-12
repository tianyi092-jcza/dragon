// copy map 模块：逐命令走 copyprofile 原函数（base-fill／装饰／水域），写后读回＋非法形拒收。
// UI-controller checks only；传输/鉴权另测。地图面板改绑待后续（控制器＋面板）。
// 用法：node --test tools/verify_copy_map_ops.mjs（cwd=web-port）
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { GameCopyStore } from '../server/gamecopy.js';
import { FixedCopyProfile } from '../server/copyprofile.js';
import { createPinnedCopyLoader } from './editor_trusted_copy.mjs';

const gameId = randomUUID();
const loader = createPinnedCopyLoader({ allocateEntityId: () => 'mapops-' + randomUUID() });
const profile = new FixedCopyProfile({ loadCopy: loader });
const { game: frozenSeed } = await profile.capture({ gameId: 'mapops-source', ownerId: 'owner-1' });
const seedGame = { ...structuredClone(frozenSeed), gameId };
const mapData = () => structuredClone(seedGame);

function makeStore() {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE content_games (game_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL)');
  db.prepare('INSERT INTO content_games VALUES(?,?)').run(gameId, 'owner-1');
  const sql = { exec: (q, ...p) => {
    const stmt = db.prepare(String(q));
    if (/^\s*(SELECT|WITH|PRAGMA)\b/i.test(q)) { const rows = stmt.all(...p); return { toArray: () => rows }; }
    stmt.run(...p); return { toArray: () => [] };
  } };
  const storage = { sql, transactionSync: fn => fn() };
  const owner = { id: 'owner-1', must_change: 0, epoch: 1, role: 'author' };
  const games = { assertNotDeleting: () => {}, listOwn: () => [] };
  return new GameCopyStore({ storage, principal: () => owner, games });
}

const failWith = async (fn, status, code) => {
  try { await fn(); } catch (e) { assert.equal(e.status, status); assert.equal(e.code, code); return; }
  assert.fail('expected ' + code);
};
const hex64 = c => c.repeat(64);
const readMap = store => store.read('tok', gameId).data.map;
const readCompDefs = store => store.read('tok', gameId).data.componentDefinitions;

test('base-fill writes tiles and geography', async () => {
  const store = makeStore();
  store.ensureFromGame('tok', gameId, mapData());
  const before = readMap(store).base.terrainRef[2];
  const r = store.writeModule('tok', gameId, 'map', { edits: [{ op: 'base-fill', cells: [0, 1], tile: 5, geography: 2 }] });
  assert.equal(r.gameId, gameId);
  const map = readMap(store);
  assert.equal(map.base.terrainRef[0], 5);
  assert.equal(map.base.terrainRef[1], 5);
  assert.equal(map.base.geography[0], 2);
  assert.equal(map.base.terrainRef[2], before);
});

test('decoration place/translate/remove roundtrip', async () => {
  const store = makeStore();
  store.ensureFromGame('tok', gameId, mapData());
  const mat = Object.keys(readCompDefs(store))[0];
  const id = `${gameId}#decoration-` + hex64('a');
  const before = readMap(store).decorations.length;
  store.writeModule('tok', gameId, 'map', { edits: [{ op: 'decoration-place', instanceId: id, materialId: mat, variantRef: 'original', x: 1, y: 1, waterClass: null }] });
  assert.equal(readMap(store).decorations.length, before + 1);
  store.writeModule('tok', gameId, 'map', { edits: [{ op: 'decoration-translate', memberIds: [id], dx: 1, dy: 0 }] });
  assert.equal(readMap(store).decorations.find(d => d.id === id).x, 2);
  store.writeModule('tok', gameId, 'map', { edits: [{ op: 'decoration-remove', memberIds: [id] }] });
  assert.equal(readMap(store).decorations.length, before);
});

test('material capture/rename/remove persists definitions alongside the map', () => {
  const store = makeStore();
  store.ensureFromGame('tok', gameId, mapData());
  const definitionRef = Object.keys(readCompDefs(store))[0];
  const instanceId = `${gameId}#decoration-` + hex64('e');
  const materialId = `${gameId}#material-` + hex64('f');
  store.writeModule('tok', gameId, 'map', { edits: [{ op: 'decoration-place', instanceId, materialId: definitionRef, variantRef: 'original', x: 1, y: 1, waterClass: null }] });
  const before = store.read('tok', gameId).copyDigest;
  const capture = { op: 'material-capture', memberIds: [instanceId], materialId, name: '擷取素材' };
  assert.throws(() => store.writeModule('tok', gameId, 'map', { edits: [capture, { op: 'material-rename', materialId: 'missing', name: '無效' }] }));
  assert.equal(store.read('tok', gameId).copyDigest, before, '失败的命令组不能留下素材定义');
  store.writeModule('tok', gameId, 'map', { edits: [capture] });
  assert.equal(readCompDefs(store)[materialId]?.name, '擷取素材');
  assert.notEqual(store.read('tok', gameId).copyDigest, before);
  store.writeModule('tok', gameId, 'map', { edits: [{ op: 'material-rename', materialId, name: '改名素材' }] });
  assert.equal(readCompDefs(store)[materialId].name, '改名素材');
  store.writeModule('tok', gameId, 'map', { edits: [{ op: 'material-remove', materialId }] });
  assert.equal(Object.hasOwn(readCompDefs(store), materialId), false);
  assert.ok(readMap(store).decorations.some(row => row.id === instanceId));
});

test('water create/visibility/rename roundtrip', async () => {
  const store = makeStore();
  store.ensureFromGame('tok', gameId, mapData());
  const geo = readMap(store).base.geography;
  const cell = geo.findIndex(v => v);
  assert.ok(cell >= 0);
  const gid = `${gameId}#water-` + hex64('b');
  const before = readMap(store).waterGroups.length;
  store.writeModule('tok', gameId, 'map', { edits: [{ op: 'water-create', groupId: gid, memberIds: [], baseCells: [cell], name: '湖', showOnMinimap: true }] });
  assert.equal(readMap(store).waterGroups.length, before + 1);
  const groupOf = store => readMap(store).waterGroups.find(g => g.id === gid);
  store.writeModule('tok', gameId, 'map', { edits: [{ op: 'water-visibility', groupId: gid, showOnMinimap: false }] });
  assert.equal(groupOf(store).showOnMinimap, false);
  store.writeModule('tok', gameId, 'map', { edits: [{ op: 'water-rename', groupId: gid, name: '大湖' }] });
  assert.equal(groupOf(store).name, '大湖');
});

test('malformed map patches rejected without writing', async () => {
  const store = makeStore();
  store.ensureFromGame('tok', gameId, mapData());
  const before = store.read('tok', gameId).copyDigest;
  await failWith(() => store.writeModule('tok', gameId, 'map', { edits: [{ op: 'bogus' }] }), 422, 'COPY_MAP');
  await failWith(() => store.writeModule('tok', gameId, 'map', { edits: [] }), 422, 'COPY_MAP');
  await failWith(() => store.writeModule('tok', gameId, 'map', { map: {} }), 422, 'COPY_MAP');
  await failWith(() => store.writeModule('tok', gameId, 'map', { edits: [{ op: 'base-fill', cells: [0], tile: 1, geography: 1, extra: 1 }] }), 422, 'COPY_MAP_DELTA');
  // writer 域错误（componenttools plain RangeError）按 chapters 同款口径归模块码 COPY_MAP。
  await failWith(() => store.writeModule('tok', gameId, 'map', { edits: [{ op: 'water-create', groupId: `${gameId}#water-` + hex64('c'), memberIds: [], baseCells: [98304], name: 'x', showOnMinimap: true }] }), 422, 'COPY_MAP');
  const readCompDefs2 = readCompDefs;
  const id = `${gameId}#decoration-` + hex64('d');
  const mat = Object.keys(readCompDefs2(store))[0];
  const place = { op: 'decoration-place', instanceId: id, materialId: mat, variantRef: 'original', x: 1, y: 1, waterClass: null };
  store.writeModule('tok', gameId, 'map', { edits: [place] });
  await failWith(() => store.writeModule('tok', gameId, 'map', { edits: [place] }), 422, 'COPY_MAP_DELTA');
  assert.equal(store.read('tok', gameId).copyDigest === before, false);
});
