// copy map 模块：逐命令走 copyprofile 原函数（base-fill／装饰／水域），写后读回＋非法形拒收。
// UI-controller checks only；传输/鉴权另测。地图面板改绑待后续（控制器＋面板）。
// 用法：node --test tools/verify_copy_map_ops.mjs（cwd=web-port）
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { GameCopyStore } from '../server/gamecopy.js';
import { FixedCopyProfile } from '../server/copyprofile.js';
import { applyMapWorkspaceEdits } from '../server/mapworkspace.js';
import { previewMapEdits } from '../web/src/editor/mapcommands.js';
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

test('browser preview matches authorized writer for supported editing commands', () => {
  let source = mapData();
  const id = suffix => `${gameId}#decoration-${hex64(suffix)}`;
  const materialId = `${gameId}#material-${hex64('f')}`;
  const waterId = suffix => `${gameId}#water-${hex64(suffix)}`;
  const definitionRef = Object.keys(source.componentDefinitions)[0];
  const dryCells = source.map.base.geography.flatMap((value, cell) => value === 0 ? [cell] : []).slice(0, 2);
  const commands = [
    { op: 'base-fill', cells: dryCells, tile: 5, geography: 2 },
    ...['a', 'b'].map((suffix, index) => ({ op: 'decoration-place', instanceId: id(suffix), materialId: definitionRef, variantRef: 'original', x: 1 + index, y: 1, waterClass: null })),
    { op: 'decoration-translate', memberIds: [id('a'), id('b')], dx: 1, dy: 0 },
    { op: 'decoration-reorder', memberIds: [id('a')], direction: -1 },
    { op: 'material-capture', memberIds: [id('a'), id('b')], materialId, name: '預覽素材' },
    { op: 'material-rename', materialId, name: '預覽改名' },
    { op: 'decoration-place', instanceId: id('c'), materialId, variantRef: 'original', x: 10, y: 10, waterClass: null },
    { op: 'decoration-split', instanceId: id('c'), childIds: [id('d'), id('e')] },
    { op: 'decoration-remove', memberIds: [id('a'), id('b'), id('d'), id('e')] },
    { op: 'material-remove', materialId },
    { op: 'water-create', groupId: waterId('a'), memberIds: [], baseCells: dryCells, name: '預覽水組', showOnMinimap: true },
    { op: 'water-split', sourceGroupId: waterId('a'), groupId: waterId('b'), memberIds: [], baseCells: [dryCells[0]], name: '拆分水組' },
    { op: 'water-merge', groupIds: [waterId('a'), waterId('b')], groupId: waterId('c'), name: '合併水組', showOnMinimap: true },
    { op: 'water-rename', groupId: waterId('c'), name: '水組改名' },
    { op: 'water-visibility', groupId: waterId('c'), showOnMinimap: false },
  ];
  for (const edit of commands) {
    if (edit.op === 'decoration-split') source = { ...source, selectionGroups: [{ id: 'preview-group', members: [{ layer: 'decorations', id: id('c') }] }] };
    const preview = previewMapEdits(source, [edit]);
    const saved = applyMapWorkspaceEdits(source, [edit]);
    assert.deepEqual(preview, saved, edit.op);
    source = saved;
  }
  assert.throws(() => previewMapEdits(source, [{ op: 'move-city' }]), /不支援/);
});

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

test('map removal maintains new selection groups without changing cross-layer entities', () => {
  const store = makeStore(), source = mapData();
  const member = { layer: 'decorations', id: source.map.decorations[0].id };
  const city = { layer: 'placements', id: source.map.placements[0].id };
  source.selectionGroups = [{ id: 'mixed', members: [member, city] }, { id: 'only-decoration', members: [member] }];
  store.ensureFromGame('tok', gameId, source);
  store.writeModule('tok', gameId, 'map', { edits: [{ op: 'decoration-remove', memberIds: [member.id] }] });
  const saved = store.read('tok', gameId).data;
  assert.deepEqual(saved.selectionGroups, [{ id: 'mixed', members: [city] }]);
  assert.deepEqual(saved.map.placements, source.map.placements);
  assert.equal(source.selectionGroups.length, 2, 'input remains detached from persisted edits');
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
