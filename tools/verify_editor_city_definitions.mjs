// Authoring metadata only; actual pinned inputs are not an initializer certificate.
import assert from 'node:assert/strict';
import test from 'node:test';
import { setCityDefinitionName, applyChapterCityEdit } from '../web/src/content/authoring/citydefinitions.js';
import { chapterActiveGaps } from '../web/src/content/authoring/gamesource.js';
import { encodeSourceChunks, decodeSourceChunks } from '../web/src/content/authoring/sourcejson.js';
import { createPinnedCopyLoader } from './editor_trusted_copy.mjs';
import { FixedCopyProfile, FIXED_TEMPLATE_PROFILE } from '../server/copyprofile.js';
const G = '11111111-1111-4111-8111-111111111111';
function fixture() {
  return { gameId: G, sourceRef: { kind: 'builtin-template', sourceId: 'wolong-builtin' }, generals: {},
    cities: { 'city-0': { cityId: 'city-0', runtimeSlot: 0, x: 2, y: 3 }, 'city-1': { cityId: 'city-1', runtimeSlot: 1, x: 8, y: 9 } },
    chapterOrder: ['first'], chapters: { first: { chapterId: 'first', name: '章', state: { factions: [], generals: [], cities: [] } } } };
}
test('explicit canonical name only, stable identity and source unchanged; no inferred name or raw encoding', () => {
  const game = fixture(), before = structuredClone(game);
  const next = setCityDefinitionName(game, 'city-0', ' e\u0301𠀀 ');
  assert.equal(next.cities['city-0'].name, 'é𠀀'); assert.equal(Object.hasOwn(next.cities['city-1'], 'name'), false);
  const expected = structuredClone(game); expected.cities['city-0'].name = 'é𠀀'; assert.deepEqual(next, expected); assert.deepEqual(game, before);
  const sameNames = setCityDefinitionName(next, 'city-1', 'é𠀀'); assert.notEqual(sameNames.cities['city-0'].cityId, sameNames.cities['city-1'].cityId);
  assert.deepEqual(decodeSourceChunks(encodeSourceChunks(sameNames)), sameNames);
  assert.deepEqual(setCityDefinitionName(next, 'city-0', ' é𠀀 '), next);
  next.cities['city-1'].x = 99; assert.equal(game.cities['city-1'].x, 8);
});
test('invalid text, missing identity and unsupported chapter/native scope refuse without mutation', () => {
  const game = fixture(), before = structuredClone(game);
  for (const value of [null, undefined, 1, '', '   ', '\u0000', 'a\u007f', 'a\u0085', 'a\ud800']) assert.throws(() => setCityDefinitionName(game, 'city-0', value));
  for (const id of ['unknown', '__proto__', null]) assert.throws(() => setCityDefinitionName(game, id, '名'));
  // `sourceRef.kind = 'builtin-copy'` 是合法状态（generaldefinitions.js:67 同时接受两种 builtin kind，
  // 目标形态是工作台统一发布），不再列为拒绝用例；保留确实非法的 gameId／范围变异。
  for (const mutate of [g => { g.gameId = 'wolong-builtin'; }, g => { g.chapters.first.state.cities.push({ idx: 0 }); }, g => { g.chapters.first.cities = { unknown: { factionId: null, overrides: {} } }; }, g => { g.cities['city-1'].runtimeSlot = 0; }, g => { g.cities['city-1'].x = 384; }, g => { g.cities['city-0'].force = 9; }, g => { g.cities['city-0'].name = ' e\u0301 '; }]) {
    const bad = structuredClone(game); mutate(bad); const copy = structuredClone(bad); assert.throws(() => setCityDefinitionName(bad, 'city-0', '名')); assert.deepEqual(bad, copy);
  }
  assert.deepEqual(game, before);
});
test('descriptor checks do not invoke getters; no hidden fields or prototype writes', () => {
  let reads = 0;
  for (const where of ['root', 'cities', 'city']) {
    const bad = fixture(); let object = bad;
    if (where === 'cities') object = bad.cities;
    else if (where === 'city') object = bad.cities['city-0'];
    Object.defineProperty(object, 'extra', { enumerable: true, get() { reads++; return 1; } });
    assert.throws(() => setCityDefinitionName(bad, 'city-0', '名'));
  }
  const hidden = fixture(); Object.defineProperty(hidden.cities['city-0'], 'hidden', { value: 1 }); assert.throws(() => setCityDefinitionName(hidden, 'city-0', '名'));
  const symbol = fixture(); symbol.cities[Symbol('bad')] = 1; assert.throws(() => setCityDefinitionName(symbol, 'city-0', '名'));
  const own = fixture(); Object.defineProperty(own.cities, '__proto__', { value: { cityId: '__proto__', runtimeSlot: 2, x: 4, y: 5 }, enumerable: true });
  const result = setCityDefinitionName(own, '__proto__', '名'); assert.equal(Object.getPrototypeOf(result.cities), Object.prototype); assert.equal(Object.hasOwn(result.cities, '__proto__'), true); assert.equal(result.cities.__proto__.name, '名');
  assert.equal(reads, 0);
});
test('actual fixed template retains all 192 bindings/map/chapters and still denies unrecorded content writes', async () => {
  const context = { gameId: G, ownerId: 'owned-fixture' };
  const loaded = await createPinnedCopyLoader({ kind: 'minimal' })(context), game = loaded.game;
  assert.equal(Object.keys(loaded.provenance.inputHashes).length, 41);
  assert.equal(Object.keys(game.cities).length, 192);
  const id = Object.keys(game.cities)[0], before = encodeSourceChunks(game);
  const named = setCityDefinitionName(game, id, '作者據點');
  assert.equal(named.cities[id].name, '作者據點'); assert.deepEqual(named.map, game.map); assert.deepEqual(named.chapters, game.chapters); assert.deepEqual(named.compatibility, game.compatibility);
  for (const key of Object.keys(game.cities)) { const row = { ...named.cities[key] }; delete row.name; assert.deepEqual(row, game.cities[key]); }
  assert.deepEqual(encodeSourceChunks(game), before);
  assert.deepEqual(chapterActiveGaps(named.chapters[named.chapterOrder[0]].state), chapterActiveGaps(game.chapters[game.chapterOrder[0]].state));
  const profile = new FixedCopyProfile({ profileRevision: FIXED_TEMPLATE_PROFILE, loadCopy: async () => loaded });
  const captured = await profile.capture(context);
  profile.verifyOrderedTemplate(captured.capability, game, []);
  profile.verify(captured.capability, game, [], []);
  assert.throws(() => profile.verifyOrderedTemplate(captured.capability, named, []), error => error.code === 'COPY_PROTECTED_DELTA');
  assert.throws(() => profile.verify(captured.capability, named, [], []), error => error.code === 'COPY_PROTECTED_DELTA');
  const step = cityEdits => ({ chapterEdits: [], generalEdits: [], peopleEdits: [], cityEdits });
  const edit = { op: 'rename', cityId: id, name: '作者據點' };
  profile.verifyOrderedTemplate(captured.capability, named, [step([edit])]);
  const configured = applyChapterCityEdit(named, { op: 'set', chapterId: named.chapterOrder[0], cityId: id, values: { factionId: null, overrides: {} } });
  // D1（用户 2026-11）：新章创建即 materialize 全部据点引用为中立，因此重复写入同一中立值是
  // 幂等而不是"未记录写入"，有序模板校验应当接受。
  assert.equal(Object.keys(configured.chapters[named.chapterOrder[0]].cities).length, Object.keys(named.cities).length);
  profile.verifyOrderedTemplate(captured.capability, configured, [step([edit])]);
  // 真正改变内容、且没有对应历史步骤的章节据点操作仍必须拒绝（fail-closed 覆盖保留）。
  const removed = applyChapterCityEdit(configured, { op: 'remove', chapterId: named.chapterOrder[0], cityId: id });
  assert.throws(() => profile.verifyOrderedTemplate(captured.capability, removed, [step([edit])]), error => error.code === 'COPY_PROTECTED_DELTA');
  profile.verifyOrderedTemplate(captured.capability, decodeSourceChunks(encodeSourceChunks(named)), [step([edit])]);
  const later = setCityDefinitionName(named, id, '後續名稱');
  profile.verifyOrderedTemplate(captured.capability, later, [step([edit]), step([{ ...edit, name: '後續名稱' }])]);
  assert.throws(() => profile.verifyOrderedTemplate(captured.capability, later, [step([{ ...edit, name: '後續名稱' }]), step([edit])]), error => error.code === 'COPY_PROTECTED_DELTA');
  for (const changes of [{ x: 3 }, { runtimeSlot: 1 }, { extra: 1 }]) {
    const bad = structuredClone(named); Object.assign(bad.cities[id], changes);
    assert.throws(() => profile.verifyOrderedTemplate(captured.capability, bad, [step([edit])]));
  }
  let getters = 0;
  const accessor = { ...edit }; Object.defineProperty(accessor, 'name', { enumerable: true, get() { getters++; return '作者據點'; } });
  const fn = () => {}; Object.defineProperty(fn, 'op', { get() { getters++; return 'rename'; } });
  const sparse = []; sparse.length = 1;
  for (const edits of [null, [accessor], [fn], sparse, Array(17).fill(edit), [{ ...edit, op: 'move' }], [{ ...edit, cityId: 'missing' }], [{ ...edit, name: '' }], [{ ...edit, x: 4 }]]) {
    assert.throws(() => profile.verifyOrderedTemplate(captured.capability, named, [step(edits)]));
  }
  assert.equal(getters, 0);
  profile.verifyOrderedTemplate(captured.capability, game, [step([])]);
  assert.deepEqual(encodeSourceChunks(game), before);
  // Current fixed chapter names disagree at ten slots: importing the first
  // chapter as a universal city name would silently discard source distinctions.
  const full = await createPinnedCopyLoader()(context), names = new Map();
  for (const chapterId of full.game.chapterOrder) for (const city of full.game.chapters[chapterId].state.cities) {
    if (!names.has(city.idx)) names.set(city.idx, new Set()); names.get(city.idx).add(city.name);
  }
  assert.equal(names.size, 192); assert.equal([...names.values()].filter(values => values.size > 1).length, 10);
  assert.deepEqual([...names.get(0)], ['北平', '北京']);
});
