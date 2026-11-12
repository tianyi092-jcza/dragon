// 本批 Web 产品合同：受信固定源→copy 主表；纯内存 SQLite，不访问存档。
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createPinnedCopyLoader } from './editor_trusted_copy.mjs';
import { initializeCopyGenerals, builtinGeneralLibrary } from '../server/copygenerals.js';
import { GameCopyStore } from '../server/gamecopy.js';
import { openStorage } from '../vps/sqlite-port.mjs';

const gameId = randomUUID();
const { game: source } = await createPinnedCopyLoader()({ gameId, ownerId: 'author' });
const pristine = JSON.stringify(source);
const converted = initializeCopyGenerals(source);

test('真实20章首次同名整条优先；父表466名、2540槽关联，冻结源未修改', () => {
  assert.equal(JSON.stringify(source), pristine);
  assert.equal(converted.chapterOrder.length, 20);
  assert.equal(Object.keys(converted.generals).length, 466);
  assert.equal(Object.keys(converted.cities).length, 192);
  const expected = new Map();
  for (const chapterId of source.chapterOrder) {
    for (const row of source.chapters[chapterId].state.generals.toSorted((a, b) => a.idx - b.idx)) {
      const name = row.name.trim().normalize('NFC');
      if (row.idx !== 127 && name && !expected.has(name)) expected.set(name, row);
    }
  }
  for (const row of Object.values(converted.generals)) {
    const first = expected.get(row.name);
    assert.equal(row.zi, ''); assert.equal(row.hao, '');
    assert.deepEqual(row.ability, first.ability);
    assert.equal(row.suicideOnCapture, Boolean(first.attr & 16));
    assert.equal(row.portraitRef.assetId, String(first.portrait));
  }
  let linked = 0;
  for (const chapterId of source.chapterOrder) {
    for (const row of converted.chapters[chapterId].state.generals) {
      const old = source.chapters[chapterId].state.generals.find(g => g.idx === row.idx);
      if (row.idx === 127) { assert.deepEqual(row, old); continue; }
      const definition = converted.generals[row.generalId];
      assert.ok(definition); linked++;
      assert.deepEqual(row.ability, definition.ability);
      assert.equal(row.attr & ~16, old.attr & ~16);
      const omit = new Set(['generalId', 'name', 'hao', 'portrait', 'portraitKey', 'ability', 'attr']);
      const other = g => Object.fromEntries(Object.entries(g).filter(([key]) => !omit.has(key)));
      assert.deepEqual(other(row), other(old));
    }
  }
  assert.equal(linked, 2540);
});

test('名字规范化首次优先，0和255为普通画像；非法来源拒绝', () => {
  const row = source.chapters[source.chapterOrder[0]].state.generals[0];
  const fixture = { chapterOrder: ['z', 'a'], chapters: {
    z: { state: { generals: [{ ...row, idx: 1, name: ' 甲 ', portrait: 0 }, { ...row, idx: 0, name: '甲', portrait: 255 }] } },
    a: { state: { generals: [{ ...row, name: '甲', portrait: 8 }] } },
  } };
  const [first] = Object.values(builtinGeneralLibrary(fixture, gameId));
  assert.equal(first.name, '甲'); assert.equal(first.portraitRef.assetId, '255');
  fixture.chapters.z.state.generals[1].portrait = 0;
  assert.equal(Object.values(builtinGeneralLibrary(fixture, gameId))[0].portraitRef.assetId, '0');
  fixture.chapters.z.state.generals[1].ability = { ...row.ability, force: 16 };
  assert.throws(() => builtinGeneralLibrary(fixture, gameId), { code: 'COPY_GENERAL_SOURCE' });
});

test('改名身份稳定、跨章投影，覆盖失败旧库不变；孤立引用留发布门，游戏隔离', () => {
  const storage = openStorage(':memory:');
  try {
    storage.sql.exec('CREATE TABLE content_games (game_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL)');
    storage.sql.exec('INSERT INTO content_games VALUES(?,?)', gameId, 'author');
    const otherId = randomUUID();
    storage.sql.exec('INSERT INTO content_games VALUES(?,?)', otherId, 'other');
    const store = new GameCopyStore({ storage, principal: id => ({ id, epoch: 1, must_change: 0, role: 'author' }), games: { assertNotDeleting() {}, listOwn() { return []; } } });
    store.ensureFromGame('author', gameId, converted);
    store.ensureFromGame('other', otherId, { ...converted, gameId: otherId });
    const otherBefore = store.read('other', otherId);
    const id = Object.keys(converted.generals)[0];
    store.writeModule('author', gameId, 'generals', { upsert: { [id]: { name: '測試唯一改名', suicideOnCapture: true } } });
    const changed = store.read('author', gameId);
    assert.equal(changed.data.generals[id].name, '測試唯一改名');
    for (const row of Object.values(changed.data.chapters).flatMap(ch => ch.state.generals).filter(g => g.generalId === id)) {
      assert.equal(row.name, '測試唯一改名'); assert.equal(row.attr & 16, 16);
    }
    const chapterId = converted.chapterOrder[0];
    const generalIdx = converted.chapters[chapterId].state.generals.find(g => g.generalId === id).idx;
    assert.throws(() => store.writeModule('author', gameId, 'chapters', { edits: [{ op: 'rename-general', chapterId, generalIdx, values: { name: '章級覆蓋' } }] }), { code: 'COPY_GENERAL_SHARED_FIELD' });
    assert.throws(() => store.writeModule('author', gameId, 'chapters', { edits: [{ op: 'portrait', chapterId, generalIdx, portraitKey: '2' }] }), { code: 'COPY_GENERAL_SHARED_FIELD' });
    assert.throws(() => store.replaceGenerals('other', gameId, source));
    assert.throws(() => store.replaceGenerals('author', gameId, { chapterOrder: [], chapters: {} }), { code: 'COPY_GENERAL_SOURCE_EMPTY' });
    assert.deepEqual(store.read('author', gameId), changed);
    storage.sql.exec("CREATE TRIGGER fail_replace BEFORE UPDATE ON game_copies BEGIN SELECT RAISE(ABORT, 'injected write failure'); END");
    assert.throws(() => store.replaceGenerals('author', gameId, source), /injected write failure/);
    assert.deepEqual(store.read('author', gameId), changed);
    storage.sql.exec('DROP TRIGGER fail_replace');
    store.replaceGenerals('author', gameId, source);
    assert.deepEqual(store.read('author', gameId).data.generals, converted.generals);
    store.writeModule('author', gameId, 'generals', { remove: [id] });
    const deleted = store.read('author', gameId).data;
    assert.ok(Object.values(deleted.chapters).some(ch => ch.state.generals.some(g => g.generalId === id)));
    assert.ok(store.validateWhole('author', gameId).problems.some(p => p.code === 'CHAPTER_GENERAL_MISSING'));
    assert.deepEqual(store.read('other', otherId), otherBefore);
  } finally { storage.close(); }
});
