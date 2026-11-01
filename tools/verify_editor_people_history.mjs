// Ordered neutral authoring history only. No HTTP people grant, native
// initialization, runtime permission or production data/profile access.
import assert from 'node:assert/strict';
import { FixedCopyProfile, FIXED_TEMPLATE_PROFILE } from '../server/copyprofile.js';
import { createPinnedCopyLoader } from './editor_trusted_copy.mjs';
import { applyGeneralDefinitionEdit, applyChapterPersonEdit, effectiveChapterPerson, generalDefinitionReferences } from '../web/src/content/authoring/generaldefinitions.js';
import { addBlankChapter, copyChapterInGame, deleteChapter, renameChapter, chapterActiveGaps, validateGameSource } from '../web/src/content/authoring/gamesource.js';
import { setWaterGroupMinimapVisibility } from '../web/src/editor/componenttools.js';
import { composeMapLayers } from '../web/src/content/authoring/maplayers.js';
import { encodeSourceChunks, decodeSourceChunks } from '../web/src/content/authoring/sourcejson.js';
const G = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', id = G + '#general-' + 'a'.repeat(64);
const profile = new FixedCopyProfile({ loadCopy: createPinnedCopyLoader({ kind: 'minimal' }), profileRevision: FIXED_TEMPLATE_PROFILE });
const captured = await profile.capture({ gameId: G, ownerId: 'owned-people-history' });
assert.equal(typeof profile.verifyOrderedTemplate, 'function', 'ordered template history port required');
const base = captured.game, chapterId = base.chapterOrder[0];
const values = { name: '甲', hao: '字', portraitRef: null };
const create = { op: 'create', generalId: id, values }, removeGeneral = { op: 'delete', generalId: id };
const set = (chapter, overrides = {}, included = true) => ({ op: 'set', chapterId: chapter, generalId: id, values: { included, factionId: null, overrides } });
const remove = chapter => ({ op: 'remove', chapterId: chapter, generalId: id });
const step = (chapterEdits = [], generalEdits = [], peopleEdits = []) => ({ chapterEdits, generalEdits, peopleEdits });
// Candidate construction uses the same existing writers as the save pipeline,
// not the verifier under test. Expected copied/overridden values are asserted.
function candidate(steps) {
  let game = structuredClone(base);
  for (const entry of steps) {
    for (const edit of entry.chapterEdits) {
      if (edit.op === 'add-blank') addBlankChapter(game);
      else if (edit.op === 'copy') copyChapterInGame(game, edit.chapterId);
      else if (edit.op === 'delete') deleteChapter(game, edit.chapterId);
      else if (edit.op === 'rename') renameChapter(game, edit.chapterId, edit.name);
      else throw new Error('unsupported fixture chapter edit');
    }
    for (const edit of entry.generalEdits) game = applyGeneralDefinitionEdit(game, edit);
    for (const edit of entry.peopleEdits) game = applyChapterPersonEdit(game, edit);
  }
  return game;
}
const verify = (game, steps) => profile.verifyOrderedTemplate(captured.capability, game, steps);
const refused = (game, steps) => assert.throws(() => verify(game, steps));
let groups = 0;
assert.equal(verify(base, []).sourceDigest, captured.baselineDigest);
assert.throws(() => profile.verifyOrderedTemplate({}, base, []), error => error.code === 'COPY_CAPTURE_REQUIRED');
const renamedMetadata = structuredClone(base); renamedMetadata.metadata = { name: '中立草稿', introduction: '僅資料' };
assert.equal(typeof verify(renamedMetadata, []).sourceDigest, 'string');
const badMetadata = structuredClone(renamedMetadata); badMetadata.metadata.name = ' 未正規化 ';
assert.throws(() => verify(badMetadata, []), error => error.code === 'COPY_METADATA'); groups++;
const start = [step([], [create], [set(chapterId, { name: '章甲' }, false)])], first = candidate(start);
const firstSnapshot = structuredClone(first), startSnapshot = structuredClone(start), baseSnapshot = structuredClone(base);
const proof = verify(first, start);
assert.equal(proof.profileRevision, FIXED_TEMPLATE_PROFILE); assert.notEqual(proof.sourceDigest, captured.baselineDigest);
assert.deepEqual(generalDefinitionReferences(first, id).map(row => [row.chapterId, row.included]), [[chapterId, false]]);
assert.deepEqual(first, firstSnapshot); assert.deepEqual(start, startSnapshot); assert.deepEqual(base, baseSnapshot);
// B5：扁平端口现在重放库层；候选多出的、未记录的人物引用仍 fail-closed。
assert.throws(() => profile.verify(captured.capability, first, [], [create]), error => error.code === 'COPY_PEOPLE_DELTA'); groups++;
const copy = { op: 'copy', chapterId }, copiedStage = candidate([...start, step([copy])]), copyId = copiedStage.chapterOrder.at(-1);
const update = { op: 'update', generalId: id, values: { name: '基表乙', hao: '新字', portraitRef: null } };
const ordered = [...start, step([copy], [], [set(chapterId, { name: '章乙' })]), step([], [update])];
const current = candidate(ordered);
assert.equal(effectiveChapterPerson(current, chapterId, id).values.name, '章乙');
assert.equal(effectiveChapterPerson(current, copyId, id).values.name, '章甲');
assert.equal(effectiveChapterPerson(current, copyId, id).values.hao, '新字');
assert.equal(effectiveChapterPerson(current, copyId, id).included, false);
verify(current, ordered);
// Identical flattened chapter/general/people lists do not imply identical history.
const reordered = [step([], [create], [set(chapterId, { name: '章甲' }, false), set(chapterId, { name: '章乙' })]), step([copy]), step([], [update])];
for (const key of ['chapterEdits', 'generalEdits', 'peopleEdits']) assert.deepEqual(reordered.flatMap(entry => entry[key]), ordered.flatMap(entry => entry[key]));
const differentCopy = candidate(reordered);
assert.equal(effectiveChapterPerson(differentCopy, copyId, id).values.name, '章乙');
verify(differentCopy, reordered); refused(current, reordered); refused(differentCopy, ordered); groups++;
// A reference in an excluded copied chapter remains live until its own removal.
const withoutOriginal = [...ordered, step([], [], [remove(chapterId)])];
const retired = [...withoutOriginal, step([{ op: 'delete', chapterId: copyId }], [removeGeneral])];
const retiredSource = candidate(retired); verify(retiredSource, retired);
assert.deepEqual(retiredSource.generals, {});
assert.deepEqual(retiredSource.chapters[chapterId].people, {});
refused(retiredSource, [...withoutOriginal, step([], [removeGeneral]), step([{ op: 'delete', chapterId: copyId }])]);
refused(retiredSource, [...ordered, step([{ op: 'delete', chapterId: copyId }], [removeGeneral], [remove(chapterId)])]);
// Removing the last reference in a prior step, then deleting, is valid.
const removeAll = [...withoutOriginal, step([], [], [remove(copyId)]), step([], [removeGeneral])];
verify(candidate(removeAll), removeAll); groups++;
const added = candidate([step([{ op: 'add-blank' }])]), newChapterId = added.chapterOrder.at(-1);
const introduced = [step([{ op: 'add-blank' }], [create], [set(newChapterId)])];
verify(candidate(introduced), introduced);
refused(candidate(introduced), [step([], [create], [set(newChapterId)]), step([{ op: 'add-blank' }])]);
refused(first, [step([], [], [set(chapterId)]), step([], [create])]);
const renamed = [...introduced, step([{ op: 'rename', chapterId: newChapterId, name: ' e\u0301 ' }])];
assert.equal(candidate(renamed).chapters[newChapterId].name, 'é'); verify(candidate(renamed), renamed); groups++;
// General IDs cannot be reused, even when an entire create/delete lifetime vanished.
const oldLifetime = [step([], [create]), step([], [removeGeneral])];
assert.equal(verify(candidate(oldLifetime), oldLifetime).sourceDigest, captured.baselineDigest);
refused(candidate([step([], [create])]), [...oldLifetime, step([], [create])]);
refused(base, [...oldLifetime, step([], [create, removeGeneral])]); groups++;
// Chapter ID reuse follows the existing writer, not a candidate provenance field.
const replacement = [...ordered, step([{ op: 'delete', chapterId: copyId }, copy])];
const replacedSource = candidate(replacement); assert.equal(replacedSource.chapterOrder.at(-1), copyId);
assert.equal(effectiveChapterPerson(replacedSource, copyId, id).values.name, '章乙');
verify(replacedSource, replacement); refused(current, replacement);
const descendantSteps = [...ordered, step([{ op: 'copy', chapterId: copyId }, { op: 'delete', chapterId: copyId }])];
const descendant = candidate(descendantSteps), descendantId = descendant.chapterOrder.at(-1);
assert.equal(effectiveChapterPerson(descendant, descendantId, id).values.name, '章甲');
verify(descendant, descendantSteps); groups++;
for (const mutate of [
  game => { game.map.width++; },
  game => { game.compatibility.slotBindings.generals[id] = 0; },
  game => { game.generals[id].force = 1; },
  game => { game.chapters[copyId].state.generals.push({ idx: 0 }); },
  game => { game.chapters[copyId].people[id].included = true; },
  game => { game.chapters[copyId].sourceChapterId = 'invented'; },
  game => { game.chapterOrder = game.chapterOrder.toReversed(); },
  game => { game.chapters[chapterId].people[id].overrides.name = '未記錄'; },
]) { const bad = structuredClone(current); mutate(bad); const snapshot = structuredClone(bad); refused(bad, ordered); assert.deepEqual(bad, snapshot); }
groups++;
for (const bad of [
  null, {}, [null], [{ chapterEdits: [], generalEdits: [] }], [{ ...step(), extra: true }],
  [step([{ op: 'rename', chapterId, name: '任意', hidden: true }])],
  [step([{ op: 'portrait', chapterId, generalIdx: 0, portraitKey: null }])],
  [step([], [{ ...create, generalId: 'foreign' }])],
  [step([], [create], [{ ...set(chapterId), slot: 0 }])],
  [step([], [create], [set(chapterId, { force: 1 })])],
  [step([], [create], [{ ...set(chapterId), values: { included: true, factionId: 'unknown', overrides: {} } }])],
]) refused(first, bad);
let getters = 0;
for (const make of [
  () => Object.defineProperty([step()], '0', { enumerable: true, get() { getters++; return step(); } }),
  () => [Object.defineProperty(step(), 'peopleEdits', { enumerable: true, get() { getters++; return []; } })],
  () => [step([], [Object.defineProperty({ ...create }, 'values', { enumerable: true, get() { getters++; return values; } })])],
  () => { const result = [step()]; result[Symbol('hidden')] = true; return result; },
  () => { const result = [step()]; delete result[0]; return result; },
  () => [step(Object.assign([], { hidden: true }))],
  () => [step([Object.defineProperty(function invalid() {}, 'op', { get() { getters++; return 'delete'; } })])],
  () => [step([], [Object.defineProperty(function invalid() {}, 'op', { get() { getters++; return 'delete'; } })])],
]) refused(first, make());
assert.equal(getters, 0); groups++;
const roundtrip = decodeSourceChunks(encodeSourceChunks(current)), restoredHistory = decodeSourceChunks(encodeSourceChunks(ordered));
assert.equal(verify(roundtrip, restoredHistory).sourceDigest, verify(current, ordered).sourceDigest);
assert.deepEqual(roundtrip.map, base.map); assert.deepEqual(roundtrip.cities, base.cities); assert.deepEqual(roundtrip.compatibility, base.compatibility);
assert.doesNotThrow(() => validateGameSource(roundtrip, { draft: true })); assert.throws(() => validateGameSource(roundtrip));
for (const chapter of Object.values(roundtrip.chapters)) assert.deepEqual(chapterActiveGaps(chapter.state).map(row => row.code), ['entity-count', 'entity-count', 'chapter-factions']);
const full = new FixedCopyProfile({ loadCopy: createPinnedCopyLoader() }), fullCapture = await full.capture({ gameId: G, ownerId: 'owned-people-history' });
assert.throws(() => full.verifyOrderedTemplate(fullCapture.capability, fullCapture.game, []), error => error.code === 'COPY_TEMPLATE_HISTORY_PROFILE');
assert.deepEqual(base, baseSnapshot); groups++;
// Real pinned template: one explicit display flag must not grant map edits.
const water = base.map.waterGroups[0]; assert.ok(water);
const hide = { op: 'water-visibility', groupId: water.id, showOnMinimap: !water.showOnMinimap };
const waterStep = { ...step(), mapEdits: [hide] };
const hidden = setWaterGroupMinimapVisibility(base, water.id, hide.showOnMinimap);
verify(hidden, [waterStep]);
assert.throws(() => verify(hidden, []));
const oldLayers = composeMapLayers(base), newLayers = composeMapLayers(hidden);
assert.deepEqual(newLayers.terrain, oldLayers.terrain);
assert.deepEqual(newLayers.geography, oldLayers.geography);
assert.notDeepEqual(newLayers.minimapGeography, oldLayers.minimapGeography);
assert.deepEqual(hidden.chapters, base.chapters); assert.deepEqual(hidden.map.roads, base.map.roads);
assert.deepEqual(hidden.compatibility, base.compatibility);
const expectedWater = structuredClone(base); expectedWater.map.waterGroups[0].showOnMinimap = hide.showOnMinimap;
assert.deepEqual(hidden, expectedWater); groups++;
const restore = { ...hide, showOnMinimap: water.showOnMinimap };
verify(base, [waterStep, { ...step(), mapEdits: [restore] }]);
verify(decodeSourceChunks(encodeSourceChunks(hidden)), [waterStep]);
for (const edit of [{ ...hide, showOnMinimap: 0 }, { ...hide, groupId: 'missing' }, { ...hide, extra: true }, { ...hide, op: 'move-city' }]) refused(base, [{ ...step(), mapEdits: [edit] }]);
for (const mapEdits of [null, Array(17).fill(hide)]) refused(base, [{ ...step(), mapEdits }]);
const tamperedWater = structuredClone(hidden); tamperedWater.map.waterGroups[0].name = 'unrecorded'; refused(tamperedWater, [waterStep]);
const getterEdit = Object.defineProperty({}, 'op', { enumerable: true, get() { getters++; return 'water-visibility'; } });
refused(base, [{ ...step(), mapEdits: [getterEdit] }]); assert.equal(getters, 0);
assert.deepEqual(base, baseSnapshot); groups++;
process.stdout.write(JSON.stringify({ groups, inputHashes: Object.keys(captured.provenance.inputHashes).length, getters, scope: 'ordered captured neutral content only; no HTTP map-edit grant, native initialization or runtime admission' }) + '\n');
