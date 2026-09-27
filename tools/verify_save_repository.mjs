// Pure memory and injected IndexedDB protocol mock; never touches real saves.
import assert from 'node:assert/strict';
import { createSaveRepository, emptySaveSlots } from '../web/src/core/saverepository.js';
import { createIndexedDbSaveBackend } from '../web/src/core/indexeddbsavebackend.js';
import { memoryIndexedDB } from './savebackend_mock.mjs';

let stored;
let fail = false;
let commit;
const repo = createSaveRepository({
  async read() { return stored; },
  async write(value) {
    await new Promise((resolve) => { commit = resolve; });
    if (fail) throw new Error('injected abort');
    stored = value;
  },
});
assert.deepEqual(await repo.load(), emptySaveSlots());
const input = emptySaveSlots();
input.slots[2] = { ...input.slots[2], played: true, state: { money: 42 }, webMeta: { rng: [7] } };
let finished = false;
const pending = repo.save(input).then((value) => { finished = true; return value; });
input.slots[2].state.money = 99;
assert.equal(finished, false);
commit();
const saved = await pending;
assert.equal(saved.slots[2].state.money, 42);
saved.slots[2].state.money = 123;
const loaded = await repo.load();
assert.equal(loaded.slots[2].state.money, 42);
loaded.slots[2].webMeta.rng[0] = 11;
assert.equal((await repo.load()).slots[2].webMeta.rng[0], 7);
fail = true;
const rejected = assert.rejects(repo.save(input), /injected abort/);
commit();
await rejected;
assert.equal((await repo.load()).slots[2].state.money, 42);

// Request success followed by transaction abort must NEVER report save success.
for (const outcome of ['complete', 'abort', 'error', 'throw']) {
  const mock = memoryIndexedDB({ outcome });
  const backend = createIndexedDbSaveBackend({ databaseName: 'isolated-test', getIndexedDB: () => mock.indexedDB });
  const writing = backend.write(emptySaveSlots());
  if (outcome === 'complete') await writing;
  else await assert.rejects(writing, /transaction|put failed/);
  assert.equal(mock.stats.closed, 1);
  assert.equal(mock.stats.requestSucceeded, true);
  if (outcome !== 'complete') assert.deepEqual(mock.records(), []);
}
await assert.rejects(createIndexedDbSaveBackend({ getIndexedDB: () => null }).read(), /unavailable/);
// More than four independent records, summary-only reads, no whole-bundle writes.
const memory = memoryIndexedDB({ initial: [['slots', input]] });
const catalog = createSaveRepository(createIndexedDbSaveBackend({ getIndexedDB: () => memory.indexedDB }));
assert.equal((await catalog.get(2)).state.money, 99);
for (let slot = 4; slot < 40; slot++)
  await catalog.put({ slot, played: true, label: `test-${slot}`, state: { value: slot } });
assert.equal((await catalog.load()).slots.length, 40);
memory.stats.reads.length = 0;
assert.equal((await catalog.list()).length, 40);
assert.deepEqual(memory.stats.reads, ['catalog-v2']);
memory.stats.writes.length = 0;
await catalog.put({ slot: 17, played: true, state: { value: 'changed' } });
assert.deepEqual(memory.stats.writes, ['record:17', 'catalog-v2']);
assert.equal((await catalog.get(18)).state.value, 18);
assert.equal((await catalog.get(17)).state.value, 'changed');
assert.equal((await catalog.add({ slot: 0, played: true, state: {} })).slot, 40);
assert.equal((await catalog.get(2)).state.money, 99);
await assert.rejects(catalog.put({ slot: -1 }), /identity/);
console.log('save repository OK: ownership, many saves, independent records/summaries, atomic commits and failures');
