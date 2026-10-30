// Named authoring-field diagnostics, not original mechanisms or deletion admission.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyChapterCityEdit } from '../web/src/content/authoring/citydefinitions.js';
import { cityReferences, checkCityDeletable, copyChapterInGame } from '../web/src/content/authoring/gamesource.js';
const fixture = () => ({ cities: { home: { cityId: 'home', runtimeSlot: 3, x: 10, y: 20 } },
  map: { placements: [{ cityId: 'home' }], roads: [{ id: 'r', fromCityId: 'home', toCityId: 'other' }] },
  chapterOrder: ['a', 'b'], chapters: {
    a: { state: { cities: [{ idx: 3, faction: 0, governor: 0 }], factions: [{ idx: 0, capital: 3 }] } },
    b: { state: { cities: [{ idx: 7 }, { idx: 8 }, { idx: 9 }, { idx: 10 }], factions: [{ idx: 2, capital: 3 }] } },
  } });
test('slot lookup and named roles include zero; broken capital reference remains visible', () => {
  const game = fixture(), before = structuredClone(game), refs = cityReferences(game, 'home');
  assert.deepEqual(refs.chapters, ['a']); assert.deepEqual(refs.roads, ['r']); assert.equal(refs.placed, true);
  assert.deepEqual(refs.references, [
    { chapterId: 'a', code: 'CITY_FACTION_REF', detail: '所屬勢力：#0' },
    { chapterId: 'a', code: 'CITY_GOVERNOR_REF', detail: '太守武將：#0' },
    { chapterId: 'a', code: 'CITY_CAPITAL_REF', detail: '勢力 #0 首都' },
    { chapterId: 'b', code: 'CITY_CAPITAL_REF', detail: '勢力 #2 首都' },
  ]);
  assert.deepEqual(game, before);
});
test('null roles produce no invented reference and diagnostic never grants deletion', () => {
  const game = fixture(); game.chapters.a.state.cities[0].faction = null; game.chapters.a.state.cities[0].governor = null;
  const result = checkCityDeletable(game, 'home'); assert.equal(result.deletable, false);
  assert.equal(result.blockers.filter(row => row.code === 'CITY_CAPITAL_REF').length, 2);
  assert.equal(result.blockers.some(row => row.code === 'CITY_GOVERNOR_REF'), false);
  assert.equal(result.blockers.at(-1).code, 'CITY_COUNT_LOCKED');
});
test('unknown definition rejects', () => { assert.throws(() => cityReferences(fixture(), 'missing'), RangeError); });
const neutral = () => ({ gameId: '11111111-1111-4111-8111-111111111111', sourceRef: { kind: 'builtin-template', sourceId: 'wolong-builtin' }, generals: {},
  cities: { home: { cityId: 'home', runtimeSlot: 3, x: 10, y: 20 } }, map: { placements: [], roads: [] },
  chapterOrder: ['a'], chapters: { a: { chapterId: 'a', state: { factions: [], generals: [], cities: [] } } } });
test('explicit neutral reference follows copy and remove without native rows or deletion admission', () => {
  const base = neutral(), before = structuredClone(base);
  let game = applyChapterCityEdit(base, { op: 'set', chapterId: 'a', cityId: 'home', values: { factionId: null, overrides: {} } });
  // The legacy chapter-copy writer mutates its input, including chapterOrder.
  game = structuredClone(game);
  const child = copyChapterInGame(game, 'a');
  assert.deepEqual(cityReferences(game, 'home').chapters, ['a', child]);
  assert.deepEqual(cityReferences(game, 'home').references.map(row => [row.chapterId, row.code]), [['a', 'CITY_AUTHORING_REF'], [child, 'CITY_AUTHORING_REF']]);
  game = applyChapterCityEdit(game, { op: 'remove', chapterId: 'a', cityId: 'home' });
  assert.deepEqual(cityReferences(game, 'home').chapters, [child]);
  const result = checkCityDeletable(game, 'home'); assert.equal(result.deletable, false);
  assert.deepEqual(result.blockers.map(row => row.code), ['CITY_CHAPTER_REF', 'CITY_AUTHORING_REF', 'CITY_COUNT_LOCKED']);
  game = applyChapterCityEdit(game, { op: 'remove', chapterId: child, cityId: 'home' });
  assert.deepEqual(cityReferences(game, 'home').chapters, []); assert.equal(checkCityDeletable(game, 'home').deletable, false);
  assert.deepEqual(base, before); assert.deepEqual(game.chapters[child].state.cities, []);
});
test('native and explicit references in the same chapter are counted once, roles remain visible', () => {
  const game = fixture(); game.chapters.a.cities = { home: { factionId: null, overrides: {} } };
  const before = structuredClone(game), refs = cityReferences(game, 'home');
  assert.deepEqual(refs.chapters, ['a']);
  assert.equal(refs.references.filter(row => row.code === 'CITY_AUTHORING_REF').length, 1);
  assert.equal(refs.references.filter(row => row.code === 'CITY_CAPITAL_REF').length, 2);
  assert.deepEqual(game, before);
});
test('unknown authoring shapes cannot silently produce an empty reference report', () => {
  for (const cities of [null, [], { missing: { factionId: null, overrides: {} } }, { home: { factionId: 'f', overrides: {} } }, { home: { factionId: null, overrides: { name: 'unsafe' } } }]) {
    const game = neutral(); game.chapters.a.cities = cities;
    assert.throws(() => cityReferences(game, 'home')); assert.throws(() => checkCityDeletable(game, 'home'));
  }
  const game = neutral(); let getters = 0;
  Object.defineProperty(game.chapters.a, 'cities', { enumerable: true, get() { getters++; return {}; } });
  assert.throws(() => cityReferences(game, 'home')); assert.equal(getters, 0);
});
