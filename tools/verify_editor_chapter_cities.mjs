// Isolated authoring records; no DOS files, database or browser storage.
import assert from 'node:assert/strict';
import test from 'node:test';
import { applyChapterCityEdit, chapterCitiesProjection, cityDefinitionChangeImpact, setCityDefinitionName } from '../web/src/content/authoring/citydefinitions.js';
import { chapterPeopleProjection, applyGeneralDefinitionEdit } from '../web/src/content/authoring/generaldefinitions.js';
import { copyChapterInGame, chapterActiveGaps } from '../web/src/content/authoring/gamesource.js';
import { encodeSourceChunks, decodeSourceChunks } from '../web/src/content/authoring/sourcejson.js';
const G = '11111111-1111-4111-8111-111111111111';
const fixture = () => ({ gameId: G, sourceRef: { kind: 'builtin-template', sourceId: 'wolong-builtin' }, generals: {},
  cities: { a: { cityId: 'a', runtimeSlot: 0, x: 2, y: 3 }, b: { cityId: 'b', runtimeSlot: 1, x: 4, y: 5, name: '同名' } },
  chapterOrder: ['one', 'two'], chapters: Object.fromEntries(['one', 'two'].map(chapterId => [chapterId, { chapterId, state: { factions: [], generals: [], cities: [] } }])) });
const edit = (cityId = 'a', chapterId = 'one') => ({ op: 'set', cityId, chapterId, values: { factionId: null, overrides: {} } });

test('explicit reference, missing name and shared base change; no implicit native records', () => {
  const game = fixture(), before = structuredClone(game);
  assert.deepEqual(chapterCitiesProjection(game).map(row => row.cities), [[], []]);
  const configured = applyChapterCityEdit(game, edit());
  assert.equal(chapterCitiesProjection(configured)[0].cities[0].values.name, null);
  assert.deepEqual(cityDefinitionChangeImpact(configured, 'a', ' e\u0301𠀀 '), { changedFields: ['name'], affectedChapters: [{ chapterId: 'one', fields: ['name'] }] });
  const named = setCityDefinitionName(configured, 'a', ' e\u0301𠀀 ');
  assert.equal(chapterCitiesProjection(named)[0].cities[0].values.name, 'é𠀀');
  assert.deepEqual(cityDefinitionChangeImpact(named, 'a', 'é𠀀'), { changedFields: [], affectedChapters: [] });
  assert.deepEqual(named.chapters, configured.chapters);
  assert.deepEqual(chapterActiveGaps(named.chapters.one.state), chapterActiveGaps(game.chapters.one.state));
  assert.deepEqual(game, before);
  assert.deepEqual(decodeSourceChunks(encodeSourceChunks(named)), named);
});
test('remove only explicit configuration, keep definition and other chapter; projections own records', () => {
  const game = applyChapterCityEdit(applyChapterCityEdit(fixture(), edit()), edit('a', 'two'));
  const projected = chapterCitiesProjection(game); projected[0].cities[0].values.name = 'bad'; projected[0].cities[0].inheritedFields.length = 0;
  assert.equal(chapterCitiesProjection(game)[0].cities[0].values.name, null);
  const removed = applyChapterCityEdit(game, { op: 'remove', cityId: 'a', chapterId: 'one' });
  assert.deepEqual(removed.chapters.one.cities, {}); assert.deepEqual(removed.chapters.two, game.chapters.two); assert.deepEqual(removed.cities, game.cities);
  assert.deepEqual(cityDefinitionChangeImpact(removed, 'a', '名').affectedChapters, [{ chapterId: 'two', fields: ['name'] }]);
  assert.throws(() => applyChapterCityEdit(removed, { op: 'remove', cityId: 'a', chapterId: 'one' }));
});
test('person operations coexist without clearing city references; chapter copy captures references', () => {
  let game = applyChapterCityEdit(fixture(), edit());
  const id = G + '#general-' + 'a'.repeat(64);
  game = applyGeneralDefinitionEdit(game, { op: 'create', generalId: id, values: { name: '將', hao: '', portraitRef: null } });
  assert.equal(chapterPeopleProjection(game).chapterPeople.length, 2);
  const before = structuredClone(game.chapters.one.cities);
  const copied = copyChapterInGame(game, 'one');
  assert.deepEqual(game.chapters[copied].cities, before);
  game.chapters[copied].cities.a.overrides = { unexpected: 1 };
  assert.deepEqual(game.chapters.one.cities, before);
  assert.throws(() => chapterCitiesProjection(game));
});
test('unknown roles, overrides, IDs and operations refuse atomically, including unrelated chapter', () => {
  const game = fixture(), before = structuredClone(game);
  for (const value of [null, {}, { factionId: null }, { factionId: 'f', overrides: {} }, { factionId: 255, overrides: {} }, { factionId: null, overrides: { name: '章名' } }, { factionId: null, overrides: { troops: 0 } }, { factionId: null, overrides: {}, governor: null }]) assert.throws(() => applyChapterCityEdit(game, { ...edit(), values: value }));
  for (const change of [{ op: 'move' }, { chapterId: 'missing' }, { cityId: 'missing' }, { x: 1 }]) assert.throws(() => applyChapterCityEdit(game, { ...edit(), ...change }));
  // 2026-11 裁定（journal §47.2）：`builtin-copy` 与 `builtin-template` 都是合法来源种类
  // （`generaldefinitions.js#captureScope`），因此“改成 builtin-copy 应被拒”的旧用例已过期。
  // 这里换成真正的失闭环：**未知**来源种类仍必须被拒。
  for (const mutate of [g => { g.sourceRef.kind = 'builtin-unknown'; }, g => { g.chapters.two.state.cities.push({ idx: 0 }); }, g => { g.chapters.two.cities = { missing: { factionId: null, overrides: {} } }; }, g => { g.cities.b.runtimeSlot = 0; }]) {
    const bad = structuredClone(game); mutate(bad); const prior = structuredClone(bad);
    assert.throws(() => applyChapterCityEdit(bad, edit())); assert.throws(() => chapterCitiesProjection(bad)); assert.deepEqual(bad, prior);
  }
  assert.deepEqual(game, before);
});
test('descriptor checks reject getters at all new record levels without invoking them', () => {
  let calls = 0;
  for (const where of ['edit', 'values', 'overrides', 'chapter', 'cities', 'reference']) {
    const game = applyChapterCityEdit(fixture(), edit()), operation = edit();
    const targets = { edit: operation, values: operation.values, overrides: operation.values.overrides, chapter: game.chapters.two, cities: game.chapters.one.cities, reference: game.chapters.one.cities.a };
    Object.defineProperty(targets[where], 'extra', { enumerable: true, get() { calls++; return 1; } });
    assert.throws(() => applyChapterCityEdit(game, operation));
  }
  assert.equal(calls, 0);
  const game = fixture(); Object.defineProperty(game.cities, '__proto__', { value: { cityId: '__proto__', runtimeSlot: 2, x: 7, y: 8 }, enumerable: true });
  const result = applyChapterCityEdit(game, edit('__proto__'));
  assert.equal(Object.getPrototypeOf(result.chapters.one.cities), Object.prototype);
  assert.equal(Object.hasOwn(result.chapters.one.cities, '__proto__'), true);
  // The codec independently forbids reserved source keys; safe object handling
  // does not grant persistence to such an identity.
  assert.throws(() => encodeSourceChunks(result), /source key/);
});
