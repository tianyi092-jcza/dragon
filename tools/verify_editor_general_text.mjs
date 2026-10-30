// Authoring text transaction checks; not a certificate for original game fields.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renameGeneral, renameChapter } from '../web/src/content/authoring/gamesource.js';
const fixture = () => ({ chapterOrder: ['first', 'second'], chapters: {
  first: { chapterId: 'first', state: { generals: [{ idx: 0, name: '原名', hao: '原字', raw: 'unchanged' }] } },
  second: { chapterId: 'second', state: { generals: [{ idx: 0, name: '他章', hao: '' }] } },
} });
test('invalid later text field leaves the entire source unchanged in either key order', () => {
  for (const values of [{ name: '新名', hao: '\n' }, { hao: '新字', name: ' ' }, { name: '新名', hao: 0 }]) {
    const game = fixture(), before = structuredClone(game);
    assert.throws(() => renameGeneral(game, 'first', 0, values), RangeError);
    assert.deepEqual(game, before);
  }
});
test('valid text commits normalized fields only to the selected chapter record', () => {
  const game = fixture(), other = structuredClone(game.chapters.second);
  renameGeneral(game, 'first', 0, { name: ' e\u0301 ', hao: 'e\u0301' });
  assert.deepEqual(game.chapters.first.state.generals[0], { idx: 0, name: 'é', hao: 'é', raw: 'unchanged' });
  assert.deepEqual(game.chapters.second, other);
  renameGeneral(game, 'first', 0, { hao: '' });
  assert.equal(game.chapters.first.state.generals[0].hao, '');
  assert.equal(game.chapters.first.state.generals[0].name, 'é');
});
test('general text rejects unpaired surrogates atomically but preserves supplementary characters', () => {
  for (const bad of ['\ud800', '\udfff', '前\ud800後', '\udc00\ud800']) {
    for (const values of [{ name: '新名', hao: bad }, { hao: '新字', name: bad }]) {
      const game = fixture(), before = structuredClone(game);
      assert.throws(() => renameGeneral(game, 'first', 0, values), RangeError);
      assert.deepEqual(game, before);
    }
  }
  const game = fixture();
  renameGeneral(game, 'first', 0, { name: ' 𠀀 ', hao: '𠮷e\u0301' });
  assert.equal(game.chapters.first.state.generals[0].name, '𠀀');
  assert.equal(game.chapters.first.state.generals[0].hao, '𠮷é');
});
test('chapter rename normalizes before checking the existing display budget', () => {
  const game = fixture(), before = structuredClone(game);
  renameChapter(game, 'first', ' e\u0301 '.trim().repeat(40));
  assert.equal(game.chapters.first.name, 'é'.repeat(40));
  assert.deepEqual(game.chapters.first.state, before.chapters.first.state);
  assert.deepEqual(game.chapters.second, before.chapters.second);
  assert.deepEqual(game.chapterOrder, before.chapterOrder);
  renameChapter(game, 'first', ' 章e\u0301 ');
  assert.equal(game.chapters.first.name, '章é');
});
test('invalid chapter text is rejected without changing source', () => {
  for (const name of [' ', 'é'.repeat(41), '章\n名', '\ud800', 1, null]) {
    const game = fixture(), before = structuredClone(game);
    assert.throws(() => renameChapter(game, 'first', name), RangeError);
    assert.deepEqual(game, before);
  }
});
test('unknown fields and references cannot partially change source', () => {
  for (const [chapter, idx, values] of [['first', 0, { name: '新名', force: 255 }], ['missing', 0, { name: '新名' }], ['first', 1, { name: '新名' }]]) {
    const game = fixture(), before = structuredClone(game);
    assert.throws(() => renameGeneral(game, chapter, idx, values), RangeError);
    assert.deepEqual(game, before);
  }
});
