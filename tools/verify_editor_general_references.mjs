// Read-only source diagnostics, not native role rules or deletion admission.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generalChapterReferences, checkGeneralDeletable } from '../web/src/content/authoring/gamesource.js';
const fixture = () => ({ chapterOrder: ['first', 'second'], chapters: {
  first: { chapterId: 'first', state: {
    generals: [{ idx: 5, name: '甲', faction: 2, join_faction: 3, appear_months: 0 }],
    factions: [{ idx: 2, monarch_idx: 5, advisor_idx: 6 }, { idx: 3, monarch_idx: 7, advisor_idx: 5 }],
    cities: [{ idx: 8, governor: 5 }, { idx: 9, governor: 6 }],
  } },
  second: { chapterId: 'second', state: { generals: [{ idx: 5, name: '乙', faction: null, join_faction: null }], factions: [], cities: [] } },
} });
test('report lists exact chapter roles, affiliation and explicit appearance fields without mutation', () => {
  const game = fixture(), before = structuredClone(game);
  const refs = generalChapterReferences(game, 'first', 5);
  assert.deepEqual(refs.map(r => r.code), ['GENERAL_CHAPTER_REF', 'GENERAL_MONARCH_REF', 'GENERAL_ADVISOR_REF', 'GENERAL_GOVERNOR_REF', 'GENERAL_FACTION_REF', 'GENERAL_JOIN_REF', 'GENERAL_APPEARANCE_STATE']);
  assert.match(refs[1].detail, /#2/); assert.match(refs[2].detail, /#3/); assert.match(refs[3].detail, /#8/);
  assert.match(refs.at(-1).detail, /0$/);
  refs[0].detail = 'tampered'; assert.deepEqual(game, before);
});
test('same slot in another chapter is not merged into the selected person', () => {
  const refs = generalChapterReferences(fixture(), 'second', 5);
  assert.deepEqual(refs, [{ code: 'GENERAL_CHAPTER_REF', detail: '章節 second／武將槽 #5' }]);
});
test('deletion diagnostic retains the capacity lock and qualifies references by chapter', () => {
  const game = fixture(), before = structuredClone(game), report = checkGeneralDeletable(game, 5);
  assert.equal(report.deletable, false);
  assert.equal(report.blockers.at(-1).code, 'GENERAL_COUNT_LOCKED');
  assert.equal(report.blockers.filter(r => r.chapterId === 'second').length, 1);
  assert.ok(report.blockers.some(r => r.chapterId === 'first' && r.code === 'GENERAL_GOVERNOR_REF'));
  assert.deepEqual(game, before);
});
test('unknown chapter or slot rejects rather than claiming no references', () => {
  assert.throws(() => generalChapterReferences(fixture(), 'missing', 5), RangeError);
  assert.throws(() => generalChapterReferences(fixture(), 'first', 99), RangeError);
});
