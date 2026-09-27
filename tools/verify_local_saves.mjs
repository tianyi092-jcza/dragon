import assert from 'node:assert/strict';
import { memoryIndexedDB } from './savebackend_mock.mjs';
globalThis.indexedDB = memoryIndexedDB().indexedDB;
const { emptySaveSlots, loadLocalSaveSlots, saveLocalSaveSlots } = await import('../web/src/core/localstore.js');
const empty = await loadLocalSaveSlots();
assert.deepEqual(empty, emptySaveSlots());
const changed = structuredClone(empty);
changed.slots[2] = {
  slot: 2, label: '本機存檔', played: true, scenario_idx: 3,
  state: { save_date: { year: 190, month: 2, day: 3 } },
  webMeta: { originalRng: { seed: 7 } },
};
await saveLocalSaveSlots(changed);
changed.slots[2].label = 'mutated after write';
const restored = await loadLocalSaveSlots();
assert.equal(restored.slots[2].label, '本機存檔');
assert.equal(restored.slots[2].scenario_idx, 3);
assert.deepEqual(restored.slots[2].webMeta.originalRng, { seed: 7 });
assert.equal(restored.slots.filter((slot) => slot.played).length, 1);
process.stdout.write('local saves OK: isolated IndexedDB protocol round trip\n');
