// Pure presentation state: existing editor Vue dependency, no API/store/save I/O.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computed, effectScope, nextTick, ref } from 'vue';
import { usePagination } from '../src/pagination.js';

function fixture(t, items) {
  const scope = effectScope();
  const source = ref(items);
  const pagination = scope.run(() => usePagination(source));
  t.after(() => scope.stop());
  return { source, ...pagination };
}

test('default 25 rows, arbitrary page and partial final page do not mutate source', t => {
  const items = Array.from({ length: 192 }, (_, i) => i + 1);
  const state = fixture(t, items);
  assert.equal(state.pageSize.value, 25);
  assert.equal(state.total.value, 192);
  assert.deepEqual(state.pagedRows.value, items.slice(0, 25));
  state.currentPage.value = 8;
  assert.deepEqual(state.pagedRows.value, items.slice(175));
  assert.equal(state.pagedRows.value.length, 17);
  assert.equal(state.source.value.length, 192);
});

test('changing page size returns to the first page', async t => {
  const state = fixture(t, Array.from({ length: 162 }, (_, i) => i));
  state.currentPage.value = 7;
  state.pageSize.value = 50;
  await nextTick();
  assert.equal(state.currentPage.value, 1);
  assert.equal(state.pagedRows.value.length, 50);
  assert.equal(state.pagedRows.value[0], 0);
});

test('shrinking or clearing results clamps the page, restoration stays valid', async t => {
  const state = fixture(t, Array.from({ length: 192 }, (_, i) => i));
  state.currentPage.value = 8;
  state.source.value = state.source.value.slice(0, 52);
  await nextTick();
  assert.equal(state.currentPage.value, 3);
  assert.deepEqual(state.pagedRows.value, [50, 51]);
  state.source.value = [];
  await nextTick();
  assert.equal(state.currentPage.value, 1);
  assert.equal(state.total.value, 0);
  assert.deepEqual(state.pagedRows.value, []);
  state.source.value = Array.from({ length: 70 }, (_, i) => i);
  await nextTick();
  assert.equal(state.currentPage.value, 1);
  assert.equal(state.pagedRows.value.length, 25);
});

test('pagination slices the complete filtered/sorted result, not the source first', t => {
  const scope = effectScope();
  t.after(() => scope.stop());
  const source = ref(Array.from({ length: 100 }, (_, i) => i));
  const filtered = computed(() => source.value.filter(value => value % 2 === 0).toReversed());
  const state = scope.run(() => usePagination(filtered));
  assert.equal(state.total.value, 50);
  assert.equal(state.pagedRows.value[0], 98);
  state.currentPage.value = 2;
  assert.equal(state.pagedRows.value[0], 48);
  assert.equal(state.pagedRows.value.at(-1), 0);
  assert.equal(source.value[0], 0);
});
