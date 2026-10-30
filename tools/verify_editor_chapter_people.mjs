// Approved authoring references/inheritance only: no native initialization,
// API/UI permission, slot allocation, Trial or publication admission.
import assert from 'node:assert/strict';
import * as authoring from '../web/src/content/authoring/generaldefinitions.js';
import { KAO_MANIFEST } from '../web/kao/manifest.js';
import { createPinnedCopyLoader } from './editor_trusted_copy.mjs';
import { FixedCopyProfile, FIXED_TEMPLATE_PROFILE } from '../server/copyprofile.js';
import { chapterActiveGaps, copyChapterInGame, deleteChapter, validateGameSource } from '../web/src/content/authoring/gamesource.js';
import { encodeSourceChunks, decodeSourceChunks } from '../web/src/content/authoring/sourcejson.js';
const { applyGeneralDefinitionEdit, applyChapterPersonEdit, generalDefinitionReferences, effectiveChapterPerson, generalDefinitionChangeImpact, chapterPeopleProjection } = authoring;
for (const fn of [applyChapterPersonEdit, generalDefinitionReferences, effectiveChapterPerson, generalDefinitionChangeImpact, chapterPeopleProjection]) assert.equal(typeof fn, 'function', 'chapter people authoring port required');
const G = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const id = G + '#general-' + 'a'.repeat(64), id2 = G + '#general-' + 'b'.repeat(64);
const image = KAO_MANIFEST.find(row => row.id.startsWith('p'));
assert.ok(image);
const portraitRef = { assetId: image.id, sha256: image.sha256 };
const definition = { name: '甲', hao: '字', portraitRef };
const create = { op: 'create', generalId: id, values: definition };
const fixture = () => ({ gameId: G, sourceRef: { kind: 'builtin-template', sourceId: 'wolong-builtin' }, generals: {}, chapters: Object.fromEntries(['one', 'two'].map(chapterId => [chapterId, { chapterId, state: { factions: [], generals: [], cities: [] } }])), chapterOrder: ['one', 'two'], map: { retained: true } });
const bind = (chapterId, overrides = {}, included = true, generalId = id) => ({ op: 'set', chapterId, generalId, values: { included, factionId: null, overrides } });
let groups = 0;
const base = applyGeneralDefinitionEdit(fixture(), create), before = structuredClone(base);
const first = applyChapterPersonEdit(base, bind('one'));
assert.deepEqual(base, before);
assert.deepEqual(first.chapters.one.people[id], { included: true, factionId: null, overrides: {} });
assert.deepEqual(first.chapters.one.state, before.chapters.one.state);
assert.deepEqual(first.generals, before.generals); assert.deepEqual(first.map, before.map);
assert.equal(Object.hasOwn(first, 'slotMap'), false);
assert.deepEqual(effectiveChapterPerson(first, 'one', id), { generalId: id, included: true, factionId: null, values: definition, inheritedFields: ['name', 'hao', 'portraitRef'], overriddenFields: [] });
assert.deepEqual(generalDefinitionReferences(base, id), []); groups++;
const second = applyChapterPersonEdit(first, bind('two', { name: ' e\u0301 ', hao: '𠮷e\u0301', portraitRef: null }, false));
assert.deepEqual(second.chapters.two.people[id].overrides, { name: 'é', hao: '𠮷é', portraitRef: null });
assert.deepEqual(generalDefinitionReferences(second, id), [
  { chapterId: 'one', included: true, inheritedFields: ['name', 'hao', 'portraitRef'], overriddenFields: [] },
  { chapterId: 'two', included: false, inheritedFields: [], overriddenFields: ['name', 'hao', 'portraitRef'] },
]);
assert.throws(() => applyGeneralDefinitionEdit(second, { op: 'delete', generalId: id }), /referenced/);
const nextBase = applyGeneralDefinitionEdit(second, { op: 'update', generalId: id, values: { name: '新甲', hao: '新字', portraitRef } });
assert.deepEqual(effectiveChapterPerson(nextBase, 'one', id).values, { name: '新甲', hao: '新字', portraitRef });
assert.deepEqual(effectiveChapterPerson(nextBase, 'two', id).values, { name: 'é', hao: '𠮷é', portraitRef: null });
assert.deepEqual(effectiveChapterPerson(second, 'one', id).values, definition); groups++;
// Deleting override keys restores inheritance from the current definition;
// null clears only portraitRef and never means inheritance.
const restored = applyChapterPersonEdit(nextBase, bind('two', { portraitRef: null }, false));
assert.deepEqual(effectiveChapterPerson(restored, 'two', id), { generalId: id, included: false, factionId: null, values: { name: '新甲', hao: '新字', portraitRef: null }, inheritedFields: ['name', 'hao'], overriddenFields: ['portraitRef'] });
const inherited = applyChapterPersonEdit(restored, bind('two', {}, false));
assert.deepEqual(effectiveChapterPerson(inherited, 'two', id).values, nextBase.generals[id]);
assert.deepEqual(inherited.chapters.two.people[id].overrides, {}); groups++;
const sibling = applyGeneralDefinitionEdit(inherited, { ...create, generalId: id2 });
const withSibling = applyChapterPersonEdit(sibling, bind('one', {}, true, id2));
const removedOne = applyChapterPersonEdit(withSibling, { op: 'remove', chapterId: 'one', generalId: id });
assert.deepEqual(generalDefinitionReferences(removedOne, id).map(row => [row.chapterId, row.included]), [['two', false]]);
assert.throws(() => applyGeneralDefinitionEdit(removedOne, { op: 'delete', generalId: id }), /referenced/);
const removedBoth = applyChapterPersonEdit(removedOne, { op: 'remove', chapterId: 'two', generalId: id });
const deleted = applyGeneralDefinitionEdit(removedBoth, { op: 'delete', generalId: id });
assert.deepEqual(Object.keys(deleted.generals), [id2]);
assert.deepEqual(generalDefinitionReferences(deleted, id2).map(row => row.chapterId), ['one']);
assert.ok(removedBoth.generals[id]); assert.ok(withSibling.chapters.one.people[id]); groups++;
const owned = structuredClone(second), copiedId = copyChapterInGame(owned, 'one');
assert.deepEqual(generalDefinitionReferences(owned, id).map(row => row.chapterId), ['one', 'two', copiedId]);
owned.chapters[copiedId].people[id].overrides.name = '副本專用';
assert.equal(Object.hasOwn(owned.chapters.one.people[id].overrides, 'name'), false);
deleteChapter(owned, copiedId);
assert.deepEqual(generalDefinitionReferences(owned, id), generalDefinitionReferences(second, id));
assert.deepEqual(decodeSourceChunks(encodeSourceChunks(second)), second); groups++;
const inputs = bind('one', { portraitRef: { ...portraitRef } }), inputSnapshot = structuredClone(inputs);
const isolated = applyChapterPersonEdit(base, inputs);
inputs.values.overrides.portraitRef.sha256 = '0'.repeat(64);
assert.deepEqual(isolated.chapters.one.people[id].overrides, inputSnapshot.values.overrides);
const report = effectiveChapterPerson(isolated, 'one', id), refs = generalDefinitionReferences(isolated, id);
report.values.portraitRef.sha256 = '0'.repeat(64); report.inheritedFields.push('fake'); refs[0].overriddenFields.length = 0;
assert.equal(effectiveChapterPerson(isolated, 'one', id).values.portraitRef.sha256, portraitRef.sha256);
assert.deepEqual(generalDefinitionReferences(isolated, id)[0].overriddenFields, ['portraitRef']); groups++;
for (const edit of [
  { ...bind('missing') }, { ...bind('one'), generalId: id2 },
  { ...bind('one'), generalId: OTHER + '#general-' + 'a'.repeat(64) },
  { ...bind('one'), generalId: '__proto__' }, { ...bind('one'), slot: 0 },
  { ...bind('one'), values: { included: 1, factionId: null, overrides: {} } },
  { ...bind('one'), values: { included: true, factionId: 'faction', overrides: {} } },
  { ...bind('one'), values: { included: true, factionId: null, overrides: {}, appearance: {} } },
  bind('one', { force: 100 }), bind('one', { name: null }), bind('one', { hao: null }),
  bind('one', { name: ' ' }), bind('one', { name: 'bad\ud800' }), bind('one', { hao: '\n' }),
  bind('one', { portraitRef: { assetId: image.id, sha256: '0'.repeat(64) } }),
  { op: 'remove', chapterId: 'two', generalId: id },
  { op: 'remove', chapterId: 'one', generalId: id, values: {} },
]) { assert.throws(() => applyChapterPersonEdit(base, edit)); assert.deepEqual(base, before); }
assert.throws(() => effectiveChapterPerson(base, 'one', id), /not configured/);
assert.throws(() => generalDefinitionReferences(base, id2), /identity/); groups++;
for (const mutate of [
  game => { game.chapters.one.extra = id; },
  game => { game.chapters.one.state.generals.push({ idx: 0 }); },
  game => { game.chapters.one.state.cities.reference = id; },
  game => { game.chapters.one.people[id].overrides.force = 1; },
  game => { game.chapters.one.people[id].overrides.name = ' unnormalized '; },
  game => { game.chapters.one.people[id].factionId = 'unknown'; },
  game => { game.chapters.one.people[id2] = { included: false, factionId: null, overrides: {} }; },
  game => { game.chapters.one.chapterId = 'two'; },
  game => { game.chapters.one.name = { unknownReference: id }; },
  game => { game.chapters.one.sourceChapterId = { unknownReference: id }; },
  game => { game.chapterOrder.push('one'); },
  game => { game.chapterOrder.pop(); },
  game => { game.chapterOrder.push('missing'); },
  game => { delete game.chapterOrder[0]; },
  game => { game.chapterOrder.reference = 'one'; },
  game => { game.sourceRef.kind = 'builtin-copy'; },
]) {
  const invalid = structuredClone(first); mutate(invalid); const snapshot = structuredClone(invalid);
  for (const action of [() => generalDefinitionReferences(invalid, id), () => effectiveChapterPerson(invalid, 'one', id), () => applyChapterPersonEdit(invalid, bind('one')), () => applyGeneralDefinitionEdit(invalid, { op: 'delete', generalId: id })]) assert.throws(action);
  assert.deepEqual(invalid, snapshot);
}
groups++;
let getters = 0;
for (const location of ['person', 'overrides', 'portrait', 'order']) {
  const invalid = structuredClone(first), trap = { enumerable: true, get() { getters++; throw new Error('getter must never execute'); } };
  if (location === 'person') Object.defineProperty(invalid.chapters.one.people[id], 'included', trap);
  if (location === 'overrides') Object.defineProperty(invalid.chapters.one.people[id].overrides, 'name', trap);
  if (location === 'portrait') { invalid.chapters.one.people[id].overrides.portraitRef = { ...portraitRef }; Object.defineProperty(invalid.chapters.one.people[id].overrides.portraitRef, 'sha256', trap); }
  if (location === 'order') Object.defineProperty(invalid.chapterOrder, '0', trap);
  assert.throws(() => generalDefinitionReferences(invalid, id));
}
for (const decorate of [value => Object.defineProperty(value, 'hidden', { value: true }), value => { value[Symbol('reference')] = id; }, value => Object.setPrototypeOf(value, { inherited: id })]) {
  const invalid = bind('one'); decorate(invalid.values.overrides);
  assert.throws(() => applyChapterPersonEdit(base, invalid));
}
assert.equal(getters, 0); groups++;
// The UI report is a projection, not another stored authority. A non-included
// configuration still inherits fields, while explicit overrides stay protected.
const impactSource = applyChapterPersonEdit(second, bind('two', { name: '章名', portraitRef: null }, false));
assert.deepEqual(generalDefinitionChangeImpact(impactSource, id, { name: '新甲', hao: '新字', portraitRef: null }), {
  changedFields: ['name', 'hao', 'portraitRef'], affectedChapters: [
    { chapterId: 'one', fields: ['name', 'hao', 'portraitRef'] }, { chapterId: 'two', fields: ['hao'] },
  ],
});
const canonical = applyGeneralDefinitionEdit(impactSource, { op: 'update', generalId: id, values: { ...definition, name: 'é' } });
assert.deepEqual(generalDefinitionChangeImpact(canonical, id, { ...definition, name: ' e\u0301 ' }), { changedFields: [], affectedChapters: [] });
assert.deepEqual(generalDefinitionChangeImpact(base, id, { ...definition, name: '未引用' }), { changedFields: ['name'], affectedChapters: [] }); groups++;
const projection = chapterPeopleProjection(impactSource);
assert.deepEqual(projection.generalReferences, [{ generalId: id, chapters: generalDefinitionReferences(impactSource, id) }]);
assert.deepEqual(projection.chapterPeople.map(row => row.chapterId), ['one', 'two']);
for (const row of projection.chapterPeople) {
  assert.equal(row.people.length, 1);
  assert.deepEqual(row.people[0], { ...effectiveChapterPerson(impactSource, row.chapterId, id), overrides: impactSource.chapters[row.chapterId].people[id].overrides });
}
const twoInherited = applyChapterPersonEdit(first, bind('two', { portraitRef: { ...portraitRef } }));
const isolatedProjection = chapterPeopleProjection(twoInherited);
isolatedProjection.chapterPeople[1].people[0].overrides.portraitRef.sha256 = '0'.repeat(64);
assert.equal(isolatedProjection.chapterPeople[1].people[0].values.portraitRef.sha256, portraitRef.sha256);
isolatedProjection.chapterPeople[0].people[0].values.portraitRef.sha256 = '0'.repeat(64);
assert.equal(isolatedProjection.chapterPeople[1].people[0].values.portraitRef.sha256, portraitRef.sha256);
isolatedProjection.generalReferences[0].chapters[0].inheritedFields.length = 0;
assert.deepEqual(isolatedProjection.chapterPeople[0].people[0].inheritedFields, ['name', 'hao', 'portraitRef']);
assert.deepEqual(chapterPeopleProjection(twoInherited).chapterPeople[0].people[0].values.portraitRef, portraitRef); groups++;
const badImpactValues = { ...definition };
Object.defineProperty(badImpactValues, 'name', { enumerable: true, get() { getters++; throw new Error('must not read impact getter'); } });
assert.throws(() => generalDefinitionChangeImpact(first, id, badImpactValues));
assert.throws(() => generalDefinitionChangeImpact(first, id2, definition));
const badProjection = structuredClone(first); badProjection.chapters.one.people[id].overrides.extra = 'unknown';
assert.throws(() => chapterPeopleProjection(badProjection));
assert.deepEqual(chapterPeopleProjection(base).chapterPeople, [{ chapterId: 'one', people: [] }, { chapterId: 'two', people: [] }]);
assert.equal(getters, 0); groups++;
// A real pinned template establishes protected-map/empty-state boundaries.
// The legacy flat-history port still cannot authorize people. The separate
// ordered content port is covered by verify_editor_people_history.mjs.
const profile = new FixedCopyProfile({ loadCopy: createPinnedCopyLoader({ kind: 'minimal' }), profileRevision: FIXED_TEMPLATE_PROFILE });
const captured = await profile.capture({ gameId: G, ownerId: 'owned-chapter-people' });
const defined = applyGeneralDefinitionEdit(captured.game, create), chapterId = defined.chapterOrder[0];
const candidate = applyChapterPersonEdit(defined, bind(chapterId));
assert.doesNotThrow(() => validateGameSource(candidate, { draft: true }));
assert.throws(() => validateGameSource(candidate));
assert.deepEqual(chapterActiveGaps(candidate.chapters[chapterId].state).map(row => row.code), ['entity-count', 'entity-count', 'chapter-factions']);
assert.deepEqual(candidate.map, captured.game.map); assert.deepEqual(candidate.cities, captured.game.cities);
assert.deepEqual(candidate.compatibility, captured.game.compatibility);
assert.deepEqual(candidate.chapters[chapterId].state, captured.game.chapters[chapterId].state);
assert.throws(() => profile.verify(captured.capability, candidate, [], [create]), error => error.code === 'COPY_PROTECTED_DELTA');
assert.throws(() => profile.verify(captured.capability, candidate, [], [create, bind(chapterId)]), error => error.code === 'COPY_DEFINITION_DELTA');
assert.equal(typeof profile.verify(captured.capability, defined, [], [create]).sourceDigest, 'string'); groups++;
process.stdout.write(JSON.stringify({ groups, inputHashes: Object.keys(captured.provenance.inputHashes).length, getters, scope: 'neutral chapter people content/inheritance/reference and impact projections; legacy flat-history denial, no HTTP or native initialization proof' }) + '\n');
