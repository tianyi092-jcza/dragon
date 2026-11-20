// 据点删除：落子绑定／道路引用／章节实质引用逐项拒绝，中性行随删清理。
// 用法：node --test tools/verify_copy_city_delete.mjs（cwd=web-port）
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { GameCopyStore } from '../server/gamecopy.js';

const gameId = '33333333-3333-4333-8333-333333333333';
function city(id, slot, name, extra = {}) {
  return { cityId: id, runtimeSlot: slot, x: 10 + slot, y: 20, name, max_prod: 100, prod: 10, growth: 1, defence: 1, troops: 5, troops_cap: 100, type: 2, view: 1, ...extra };
}
function data() {
  return {
    gameId, metadata: { name: '刪城測試', introduction: 'x' },
    cities: {
      'city-0': city('city-0', 0, '綁定城'),
      'city-1': city('city-1', 1, '道路城'),
      'city-2': city('city-2', 2, '章節城'),
      'city-3': city('city-3', 3, '乾淨城'),
    },
    map: {
      placements: [{ id: 'place-0', cityId: 'city-0', x: 10, y: 20 }, { id: 'place-9', cityId: null, x: 1, y: 1 }],
      roads: [{ id: 'road-1', fromCityId: 'city-1', toCityId: 'city-0', geometry: 'x', components: [] }],
    },
    chapterOrder: ['ch1'],
    chapters: {
      ch1: {
        chapterId: 'ch1', name: '第一章',
        cities: {
          'city-0': { factionId: null, overrides: {} },
          'city-1': { factionId: null, overrides: {} },
          'city-2': { factionId: 0, overrides: {} },
          'city-3': { factionId: null, overrides: {} },
        },
        state: { factions: [{ idx: 0 }], generals: [], cities: [] },
      },
    },
    generals: {},
  };
}
function makeStore(seed) {
  const db = new DatabaseSync(':memory:');
  const sql = { exec: (q, ...p) => {
    const stmt = db.prepare(String(q));
    if (/^\s*(SELECT|WITH|PRAGMA)\b/i.test(q)) { const rows = stmt.all(...p); return { toArray: () => rows }; }
    stmt.run(...p); return { toArray: () => [] };
  } };
  const storage = { sql, transactionSync: fn => fn() };
  db.exec('CREATE TABLE content_games (game_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL)');
  const games = { assertNotDeleting: () => {}, listOwn: () => [] };
  const store = new GameCopyStore({ storage, principal: () => ({ id: 'owner-1', role: 'author', must_change: 0, epoch: 1 }), games });
  db.exec(`INSERT INTO content_games VALUES('${gameId}', 'owner-1')`);
  store.ensureFromGame('tok', gameId, seed ?? data());
  return store;
}
const failWith = (fn, status, code) => {
  try { fn(); } catch (e) { assert.equal(e.status, status, 'status for ' + code); assert.equal(e.code, code); return e; }
  assert.fail('expected ' + code);
};

test('bound on map is refused first', () => {
  const store = makeStore();
  const error = failWith(() => store.writeModule('tok', gameId, 'cities', { remove: ['city-0'] }), 422, 'COPY_CITY_PLACED');
  assert.ok(Array.isArray(error.detail?.blockers) && error.detail.blockers.length > 0);
});

test('road endpoint is refused', () => {
  const seed = data();
  seed.map.placements = seed.map.placements.filter(p => p.cityId !== 'city-1');
  const store = makeStore(seed);
  // city-1 无落子但仍被道路引用。
  failWith(() => store.writeModule('tok', gameId, 'cities', { remove: ['city-1'] }), 422, 'COPY_CITY_ROADED');
});

test('chapter substantive reference is refused', () => {
  const seed = data();
  seed.map.placements = seed.map.placements.filter(p => p.cityId !== 'city-2');
  const store = makeStore(seed);
  failWith(() => store.writeModule('tok', gameId, 'cities', { remove: ['city-2'] }), 422, 'COPY_CITY_CHAPTER');
});

test('clean city deletes with neutral chapter rows cleaned', () => {
  const seed = data();
  seed.map.placements = seed.map.placements.filter(p => p.cityId !== 'city-3');
  const store = makeStore(seed);
  store.writeModule('tok', gameId, 'cities', { remove: ['city-3'] });
  const after = store.read('tok', gameId).data;
  assert.equal(after.cities['city-3'], undefined);
  assert.equal(after.chapters.ch1.cities['city-3'], undefined, 'neutral authoring rows are cleaned');
  assert.ok(after.cities['city-0'], 'other cities untouched');
});

test('malformed remove is refused', () => {
  const store = makeStore();
  failWith(() => store.writeModule('tok', gameId, 'cities', { remove: [] }), 422, 'COPY_CITY');
  failWith(() => store.writeModule('tok', gameId, 'cities', { remove: ['no-such-city'] }), 422, 'COPY_CITY');
  failWith(() => store.writeModule('tok', gameId, 'cities', { remove: 'city-3' }), 422, 'COPY_CITY');
});
