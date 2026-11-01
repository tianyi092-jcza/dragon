// Authoring definitions and protected deltas; not native initialization,
// chapter inclusion, persistent API authorization, Trial or publication proof.
import assert from 'node:assert/strict';
import { applyGeneralDefinitionEdit, generalLibrarySupported } from '../web/src/content/authoring/generaldefinitions.js';
import { KAO_MANIFEST } from '../web/kao/manifest.js';
import { createPinnedCopyLoader } from './editor_trusted_copy.mjs';
import { FixedCopyProfile, FIXED_TEMPLATE_PROFILE } from '../server/copyprofile.js';
import { encodeSourceChunks, decodeSourceChunks } from '../web/src/content/authoring/sourcejson.js';
import { validateGameSource, chapterActiveGaps } from '../web/src/content/authoring/gamesource.js';
const G = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const id = G + '#general-' + 'a'.repeat(64), id2 = G + '#general-' + 'b'.repeat(64);
const portrait = KAO_MANIFEST.find(row => row.id.startsWith('p'));
assert.ok(portrait);
const values = { name: ' e\u0301 ', hao: '𠮷e\u0301', portraitRef: { assetId: portrait.id, sha256: portrait.sha256 } };
const fixture = () => ({ gameId: G, sourceRef: { kind: 'builtin-template', sourceId: 'wolong-builtin' }, generals: {}, chapters: { chapter: { chapterId: 'chapter', state: { factions: [], generals: [], cities: [] } } }, chapterOrder: ['chapter'], map: { retained: true } });
const create = { op: 'create', generalId: id, values };
let groups = 0;
const base = fixture(), before = structuredClone(base), created = applyGeneralDefinitionEdit(base, create);
assert.deepEqual(base, before);
assert.deepEqual(created.generals[id], { name: 'é', hao: '𠮷é', portraitRef: values.portraitRef });
assert.deepEqual(created.chapters, before.chapters); assert.deepEqual(created.map, before.map);
assert.equal(Object.hasOwn(created.generals[id], 'idx'), false); groups++;
const sameName = applyGeneralDefinitionEdit(created, { ...create, generalId: id2 });
assert.equal(Object.keys(sameName.generals).length, 2);
const changed = applyGeneralDefinitionEdit(sameName, { op: 'update', generalId: id, values: { name: '新名', hao: '', portraitRef: null } });
assert.deepEqual(sameName.generals[id], created.generals[id]);
assert.deepEqual(changed.generals[id2], created.generals[id]);
const deleted = applyGeneralDefinitionEdit(changed, { op: 'delete', generalId: id });
assert.deepEqual(Object.keys(deleted.generals), [id2]); assert.ok(changed.generals[id]); groups++;
for (const edit of [
  { ...create, generalId: OTHER + '#general-' + 'a'.repeat(64) },
  { ...create, generalId: '0' }, { ...create, generalId: '__proto__' },
  { ...create, values: { ...values, idx: 0 } },
  { ...create, values: { ...values, name: ' ' } },
  { ...create, values: { ...values, name: 'bad\ud800' } },
  { ...create, values: { ...values, hao: '\n' } },
  { ...create, values: { ...values, portraitRef: { assetId: portrait.id, sha256: '0'.repeat(64) } } },
  { ...create, values: { ...values, portraitRef: { assetId: '../other', sha256: portrait.sha256 } } },
  { op: 'delete', generalId: id }, { op: 'update', generalId: id, values },
]) { assert.throws(() => applyGeneralDefinitionEdit(base, edit)); assert.deepEqual(base, before); }
assert.throws(() => applyGeneralDefinitionEdit(created, create));
// B5：遊戲自有武將庫對完整副本同樣開放（庫層只管 generals/people）；舊槽位字典仍不被當成庫。
const copyKind = structuredClone(base); copyKind.sourceRef.kind = 'builtin-copy';
assert.equal(generalLibrarySupported(copyKind), true);
assert.deepEqual(applyGeneralDefinitionEdit(copyKind, create).generals[id], { name: 'é', hao: '𠮷é', portraitRef: values.portraitRef });
const slotDictionary = structuredClone(base); slotDictionary.generals = { 0: { slot: 0, name: '舊' } };
assert.equal(generalLibrarySupported(slotDictionary), false);
assert.throws(() => applyGeneralDefinitionEdit(slotDictionary, { ...create, generalId: id2 })); groups++;
for (const mutate of [
  game => { game.chapters.chapter.people = { [id]: { included: true } }; },
  game => { game.chapters.chapter.state.generals.push({ idx: 0 }); },
  game => { game.chapters.chapter.state.extra = id; },
  game => { game.chapters.chapter.state.generals.reference = id; },
]) {
  const unknown = structuredClone(created); mutate(unknown); const unchanged = structuredClone(unknown);
  assert.throws(() => applyGeneralDefinitionEdit(unknown, { op: 'delete', generalId: id }), /references|fields/);
  assert.deepEqual(unknown, unchanged);
}
groups++;
let getters = 0;
for (const make of [
  () => ({ ...create, values: Object.defineProperty({ ...values }, 'name', { enumerable: true, get() { getters++; return 'bad'; } }) }),
  () => ({ ...create, values: { ...values, portraitRef: Object.defineProperty({ ...values.portraitRef }, 'sha256', { enumerable: true, get() { getters++; return portrait.sha256; } }) } }),
]) assert.throws(() => applyGeneralDefinitionEdit(base, make()));
assert.equal(getters, 0); groups++;
const supplied = structuredClone(values), isolated = applyGeneralDefinitionEdit(base, { ...create, values: supplied });
supplied.name = '後改'; supplied.portraitRef.sha256 = '0'.repeat(64);
assert.equal(isolated.generals[id].name, 'é'); assert.equal(isolated.generals[id].portraitRef.sha256, portrait.sha256); groups++;
const profile = new FixedCopyProfile({ loadCopy: createPinnedCopyLoader({ kind: 'minimal' }), profileRevision: FIXED_TEMPLATE_PROFILE });
const captured = await profile.capture({ gameId: G, ownerId: 'owned-definition-author' });
const candidate = applyGeneralDefinitionEdit(captured.game, create), history = [create];
const proof = profile.verify(captured.capability, candidate, [], history);
assert.equal(profile.verify(captured.capability, decodeSourceChunks(encodeSourceChunks(candidate)), [], history).sourceDigest, proof.sourceDigest);
assert.notEqual(proof.sourceDigest, captured.baselineDigest);
assert.throws(() => profile.verify(captured.capability, candidate), error => error.code === 'COPY_PROTECTED_DELTA');
assert.doesNotThrow(() => validateGameSource(candidate, { draft: true }));
assert.throws(() => validateGameSource(candidate));
assert.deepEqual(chapterActiveGaps(candidate.chapters[candidate.chapterOrder[0]].state).map(row => row.code), ['entity-count', 'entity-count', 'chapter-factions']); groups++;
for (const mutate of [
  game => { game.generals[id].name = '未記錄'; },
  game => { game.generals[id].force = 100; },
  game => { game.map.width++; },
  game => { game.compatibility.slotBindings.generals[id] = 0; },
]) {
  const bad = structuredClone(candidate); mutate(bad);
  assert.throws(() => profile.verify(captured.capability, bad, [], history));
}
const updated = applyGeneralDefinitionEdit(candidate, { op: 'update', generalId: id, values: { name: '新名', hao: '', portraitRef: null } });
const updateHistory = [...history, { op: 'update', generalId: id, values: updated.generals[id] }];
assert.equal(typeof profile.verify(captured.capability, updated, [], updateHistory).sourceDigest, 'string');
const removed = applyGeneralDefinitionEdit(updated, { op: 'delete', generalId: id });
const removedHistory = [...updateHistory, { op: 'delete', generalId: id }];
assert.equal(profile.verify(captured.capability, removed, [], removedHistory).sourceDigest, captured.baselineDigest);
assert.throws(() => profile.verify(captured.capability, candidate, [], [...removedHistory, create]), error => error.code === 'COPY_DEFINITION_DELTA'); groups++;
const malformedHistory = Object.defineProperty([create], '0', { enumerable: true, get() { getters++; return create; } });
assert.throws(() => profile.verify(captured.capability, candidate, [], malformedHistory), error => error.code === 'COPY_STRUCTURE');
assert.equal(getters, 0);
assert.throws(() => profile.verify(captured.capability, candidate, [], null), error => error.code === 'COPY_DEFINITION_DELTA'); groups++;
const full = new FixedCopyProfile({ loadCopy: createPinnedCopyLoader() });
const fullCapture = await full.capture({ gameId: G, ownerId: 'owned-definition-author' });
// B5：完整副本的武將庫默認空；庫層命令現对兩種來源開放，但候選必須等於重放結果。
assert.equal(fullCapture.game.chapterOrder.length, 20);
assert.deepEqual(fullCapture.game.generals, {});
assert.equal(typeof full.verify(fullCapture.capability, applyGeneralDefinitionEdit(fullCapture.game, create), [], history).sourceDigest, 'string');
assert.throws(() => full.verify(fullCapture.capability, fullCapture.game, [], history), error => error.code === 'COPY_DEFINITION_DELTA');
// 舊槽位字典仍不是庫：任何定義寫入在該基線上 fail-closed。
const legacy = structuredClone(fullCapture.game); legacy.generals = { 0: { slot: 0, name: '舊' } };
assert.throws(() => full.verify(fullCapture.capability, legacy, [], history), error => error.code === 'COPY_DEFINITION_DELTA');
assert.throws(() => applyGeneralDefinitionEdit(legacy, create), /game-owned general library/); groups++;
process.stdout.write(JSON.stringify({ groups, inputHashes: Object.keys(captured.provenance.inputHashes).length, scope: 'unassigned neutral general definitions only; no API/native/runtime grant' }) + '\n');
