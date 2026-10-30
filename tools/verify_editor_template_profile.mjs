// Actual pinned inputs and authoring projection, NOT a creator HTTP service,
// native initializer, Trial, release or runtime resource admission certificate.
import assert from 'node:assert/strict';
import { createPinnedCopyLoader } from './editor_trusted_copy.mjs';
import { FixedCopyProfile, FIXED_TEMPLATE_PROFILE } from '../server/copyprofile.js';
import { encodeSourceChunks, decodeSourceChunks } from '../web/src/content/authoring/sourcejson.js';
import { addBlankChapter, copyChapterInGame, deleteChapter, renameChapter, chapterSaveGaps, chapterActiveGaps, validateGameSource } from '../web/src/content/authoring/gamesource.js';
const context = { gameId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ownerId: 'owned-template-author' };
let checks = 0, allocations = 0;
assert.throws(() => createPinnedCopyLoader({ kind: 'unknown', readWeb() { throw new Error('must not read'); } }), TypeError); checks++;
const loadCopy = createPinnedCopyLoader({ kind: 'minimal', allocateEntityId() { allocations++; throw new Error('template must not allocate original people'); } });
const profile = new FixedCopyProfile({ loadCopy, profileRevision: FIXED_TEMPLATE_PROFILE });
const captured = await profile.capture(context), base = captured.game, first = base.chapterOrder[0];
assert.equal(base.sourceRef.kind, 'builtin-template');
assert.equal(base.chapterOrder.length, 1);
assert.deepEqual(base.chapters[first], { chapterId: first, name: '第一章', state: { factions: [], generals: [], cities: [] } });
assert.equal(Object.keys(base.cities).length, 192);
assert.deepEqual(base.generals, {}); assert.equal(Object.hasOwn(base, 'sourceRecords'), false);
assert.deepEqual(base.compatibility.slotBindings.generals, {});
assert.deepEqual(base.compatibility.idMap.chapters, {}); assert.equal(allocations, 0);
assert.equal(Object.keys(captured.provenance.inputHashes).length, 41); checks++;
assert.doesNotThrow(() => validateGameSource(base, { draft: true }));
assert.equal(chapterSaveGaps(base.chapters[first].state, first).length, 0);
assert.deepEqual(chapterActiveGaps(base.chapters[first].state, first).map(row => row.code), ['entity-count', 'entity-count', 'chapter-factions']);
assert.throws(() => validateGameSource(base)); checks++;
const candidate = structuredClone(base); candidate.metadata = { name: '中立草稿', introduction: '尚不可玩' };
const proof = profile.verify(captured.capability, candidate);
assert.equal(proof.profileRevision, FIXED_TEMPLATE_PROFILE);
assert.equal(proof.changes.length, 0);
assert.notEqual(proof.sourceDigest, captured.baselineDigest);
assert.throws(() => profile.verify({}, candidate), error => error.code === 'COPY_CAPTURE_REQUIRED'); checks++;
for (const mutate of [
  game => { game.map.width++; },
  game => { game.generals.person = { name: '未授權人物' }; },
  game => { game.chapters[first].state.nativeFactionSlotRaw = []; },
  game => { game.sourceRef.kind = 'builtin-copy'; },
  game => { game.chapters[first].state.factions.push({ idx: 0 }); },
]) {
  const invalid = structuredClone(candidate); mutate(invalid);
  assert.throws(() => profile.verify(captured.capability, invalid), error => error.code === 'COPY_PROTECTED_DELTA');
}
checks++;
const edited = structuredClone(candidate);
renameChapter(edited, first, '新章名');
const second = copyChapterInGame(edited, first), third = addBlankChapter(edited);
deleteChapter(edited, third);
const history = [{ op: 'rename', chapterId: first, name: '新章名' }, { op: 'copy', chapterId: first }, { op: 'add-blank' }, { op: 'delete', chapterId: third }];
const editedProof = profile.verify(captured.capability, edited, history);
assert.equal(edited.chapters[second].name, '新章名（副本）');
assert.deepEqual(edited.chapters[second].state, base.chapters[first].state);
const roundtrip = decodeSourceChunks(encodeSourceChunks(edited));
assert.equal(profile.verify(captured.capability, roundtrip, history).sourceDigest, editedProof.sourceDigest);
assert.equal(base.chapters[first].name, '第一章'); checks++;
const repeated = await profile.capture(context);
assert.equal(repeated.baselineDigest, captured.baselineDigest);
assert.equal(profile.verify(repeated.capability, repeated.game).sourceDigest, captured.baselineDigest);
assert.equal(allocations, 0); checks++;
const full = await createPinnedCopyLoader({ allocateEntityId: (() => { let n = 0; return () => `owned-person-${++n}`; })() })(context);
assert.equal(full.game.sourceRef.kind, 'builtin-copy'); assert.equal(full.game.chapterOrder.length, 20);
assert.ok(full.game.sourceRecords);
assert.deepEqual(base.map, full.game.map);
assert.deepEqual(base.cities, full.game.cities);
assert.deepEqual(base.componentDefinitions, full.game.componentDefinitions);
assert.equal(Object.hasOwn(base, 'compatibilityAssets'), Object.hasOwn(full.game, 'compatibilityAssets'));
assert.deepEqual(Object.getOwnPropertyDescriptor(base, 'compatibilityAssets')?.value, Object.getOwnPropertyDescriptor(full.game, 'compatibilityAssets')?.value);
assert.deepEqual(captured.provenance.inputHashes, full.provenance.inputHashes);
await assert.rejects(new FixedCopyProfile({ loadCopy: async () => full, profileRevision: FIXED_TEMPLATE_PROFILE }).capture(context), error => error.code === 'COPY_TEMPLATE_BASELINE'); checks++;
await assert.rejects(new FixedCopyProfile({ loadCopy: async () => ({ game: base, provenance: captured.provenance }) }).capture(context), error => error.code === 'COPY_PROFILE_BASELINE'); checks++;
process.stdout.write(JSON.stringify({ checks, inputs: 41, chapters: base.chapterOrder.length, scope: 'neutral authoring projection only; HTTP service tested separately; no native initializer/runtime admission' }) + '\n');
