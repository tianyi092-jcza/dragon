// Original non-save inputs only. Authoring representatives are a Web decision.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { CHAPTER_DIPLOMACY_RELATIONS, chapterDiplomacyRelation, decodeChapterDiplomacy } from '../web/src/editor/chapterdiplomacy.js';
import { CHAPTER_BASE } from '../web/src/content/authoring/chapterbase.generated.js';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');

test('diplomacy dictionary matches KI text and the 7A9A byte classification domain', () => {
  const exe = readFileSync(new URL('../../Dragon/KI.EXE', import.meta.url));
  assert.equal(sha(exe), 'fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868');
  const decoder = new TextDecoder('big5', { fatal: true });
  const labels = Array.from({ length: 7 }, (_, index) => decoder.decode(exe.subarray(0x200 + 0x7844 + index * 7, 0x200 + 0x7848 + index * 7)));
  assert.deepEqual(labels, ['交戰', ...CHAPTER_DIPLOMACY_RELATIONS.map(option => option.label), '－－']);
  // cmp AL,64h; JA unclassified; JB divide; DEC AL (100 folds into last band).
  assert.equal(exe.subarray(0x200 + 0x7aa6, 0x200 + 0x7aae).toString('hex'), '3c6477127202fec8');
  for (const [value, expected] of [[0, 'war'], [127, 'war'], [128, 'worst'], [147, 'worst'], [148, 'dangerous'],
    [167, 'dangerous'], [168, 'ordinary'], [187, 'ordinary'], [188, 'good'], [207, 'good'],
    [208, 'close'], [228, 'close'], [229, 'unknown'], [255, 'unknown']]) assert.equal(chapterDiplomacyRelation(value), expected);
  for (const value of [-1, 256, null, '183', 1.5]) assert.throws(() => chapterDiplomacyRelation(value), /byte required/);
});

test('all five write representatives are exact cells of the approved original template', () => {
  const original = readFileSync(new URL('../../上/SINARIO.DAT', import.meta.url));
  assert.equal(sha(original), '6183b6b2883fb1cd9c6d7c7d0def86049b7707a64d9258836940900a09454d73');
  const pairs = [[0, 4], [4, 5], [0, 1], [0, 3], [0, 17]];
  CHAPTER_DIPLOMACY_RELATIONS.forEach((choice, index) => {
    const [actor, target] = pairs[index];
    assert.equal(choice.value, original[0x680 + actor * 24 + target]);
    assert.equal(chapterDiplomacyRelation(choice.value), choice.id);
  });
  assert.equal(CHAPTER_DIPLOMACY_RELATIONS.find(choice => choice.id === 'ordinary').value, CHAPTER_BASE.ordinaryDiplomacyRaw);
});

test('authoring matrix decoding refuses missing or divergent views without repair', () => {
  const source = { factions: [], diplomacy: [], nativeDiplomacyRaw: CHAPTER_BASE.nativeDiplomacyRaw };
  assert.equal(decodeChapterDiplomacy(source).length, 24);
  for (const invalid of [{ ...source, nativeDiplomacyRaw: undefined }, { ...source, nativeDiplomacyRaw: source.nativeDiplomacyRaw.slice(2) },
    { ...source, factions: [{ idx: 0 }], diplomacy: [[0]] }, { ...source, factions: [{ idx: 1 }], diplomacy: [[255]] }]) {
    const before = structuredClone(invalid);
    assert.throws(() => decodeChapterDiplomacy(invalid), /diplomacy/);
    assert.deepEqual(invalid, before);
  }
});
