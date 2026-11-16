// C5 index summary: dense slot table plus per-chapter state digests.
// battleMapId bindings are absent from game.cities by schema (C6 authoring
// model work), so no binding table is asserted here.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { BUILTIN_RESOURCES } from '../web/src/content/builtinresources.generated.js';
import { canonicalDigest } from '../web/src/content/authoring/gamesource.js';
import { compileGameSource, compileSourceIndex } from '../web/src/content/authoring/trialcompile.js';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

function synthetic() {
  const cities = [
    { cityId: 'a', runtimeSlot: 0, x: 1, y: 2 },
    { cityId: 'b', runtimeSlot: 1, x: 3, y: 4 },
    { cityId: 'c', runtimeSlot: 2, x: 5, y: 6 },
  ];
  const game = {
    chapterOrder: ['ch1', 'ch2'],
    chapters: {
      ch1: { state: { cities: [{ idx: 0 }], note: 'one' } },
      ch2: { state: { cities: [{ idx: 0 }, { idx: 1 }], note: 'two' } },
    },
  };
  return { cities, game };
}

test('dense slots and chapter states derive a JSON-stable index summary', () => {
  const { cities, game } = synthetic();
  const result = compileSourceIndex(game, cities, sha);
  assert.deepEqual(result.cityIndex, [
    { slot: 0, cityId: 'a', x: 1, y: 2 },
    { slot: 1, cityId: 'b', x: 3, y: 4 },
    { slot: 2, cityId: 'c', x: 5, y: 6 },
  ]);
  assert.deepEqual(Object.keys(result.chapterDigests), ['ch1', 'ch2']);
  assert.equal(result.chapterDigests.ch1, canonicalDigest(game.chapters.ch1.state, sha));
  assert.equal(result.chapterDigests.ch2, canonicalDigest(game.chapters.ch2.state, sha));
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
  const tampered = structuredClone(game);
  tampered.chapters.ch2.state.note = 'changed';
  assert.notEqual(
    compileSourceIndex(tampered, cities, sha).chapterDigests.ch2,
    result.chapterDigests.ch2,
  );
});

test('non-dense slots, missing states and missing hash are rejected', () => {
  const { cities, game } = synthetic();
  assert.throws(() => compileSourceIndex(game, [{ ...cities[0], runtimeSlot: 1 }], sha), /dense/);
  assert.throws(() => compileSourceIndex(game, [{ ...cities[0] }, { ...cities[2] }], sha), /dense/);
  assert.throws(() => compileSourceIndex({ ...game, chapterOrder: ['ch1', 'nope'] }, cities, sha), /missing/);
  assert.throws(() => compileSourceIndex(game, cities, null), /sha256hex/);
});

test('built-in game compilation carries the same index summary', () => {
  const prefix = `content/builtin/compiled/${BUILTIN_RESOURCES.world.revision}/`;
  const source = JSON.parse(readFileSync(new URL(`../web/${prefix}game-source.json`, import.meta.url)));
  const compiled = compileGameSource(source, sha);
  assert.equal(compiled.cityIndex.length, 192);
  assert.deepEqual(compiled.cityIndex.map((entry) => entry.slot),
    Array.from({ length: 192 }, (_, i) => i));
  assert.deepEqual(compiled.cityIndex.map((entry) => entry.cityId).sort(),
    Object.values(source.cities).map((city) => city.cityId).sort());
  for (const entry of compiled.cityIndex) {
    const city = Object.values(source.cities).find((c) => c.cityId === entry.cityId);
    assert.equal(entry.x, city.x);
    assert.equal(entry.y, city.y);
  }
  assert.deepEqual(Object.keys(compiled.chapterDigests), source.chapterOrder);
  for (const chapterId of source.chapterOrder)
    assert.equal(compiled.chapterDigests[chapterId], canonicalDigest(source.chapters[chapterId].state, sha));
  assert.deepEqual(JSON.parse(JSON.stringify({ cityIndex: compiled.cityIndex, chapterDigests: compiled.chapterDigests })),
    { cityIndex: compiled.cityIndex, chapterDigests: compiled.chapterDigests });
});
