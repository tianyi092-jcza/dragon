import assert from "node:assert/strict";

const databases = new Map();

function makeRequest(run) {
  const request = {};
  queueMicrotask(() => {
    try {
      request.result = run();
      request.onsuccess?.();
    } catch (error) {
      request.error = error;
      request.onerror?.();
    }
  });
  return request;
}

globalThis.indexedDB = {
  open(name) {
    const request = {};
    queueMicrotask(() => {
      let database = databases.get(name);
      const created = !database;
      if (!database) {
        const stores = new Map();
        database = {
          objectStoreNames: { contains: (store) => stores.has(store) },
          createObjectStore(store) {
            stores.set(store, new Map());
          },
          transaction(store) {
            const transaction = {};
            const entries = stores.get(store);
            transaction.objectStore = () => ({
              get: (key) => makeRequest(() => entries.get(key)),
              put: (value, key) => {
                entries.set(key, structuredClone(value));
                return makeRequest(() => key);
              },
            });
            queueMicrotask(() => transaction.oncomplete?.());
            return transaction;
          },
          close() {},
        };
        databases.set(name, database);
      }
      request.result = database;
      if (created) request.onupgradeneeded?.();
      request.onsuccess?.();
    });
    return request;
  },
};

const { emptySaveSlots, loadLocalSaveSlots, saveLocalSaveSlots } = await import(
  "../web/src/core/localstore.js"
);

const empty = await loadLocalSaveSlots();
assert.deepEqual(empty, emptySaveSlots());
const changed = structuredClone(empty);
changed.slots[2] = {
  slot: 2,
  label: "本機存檔",
  played: true,
  scenario_idx: 3,
  state: { save_date: { year: 190, month: 2, day: 3 } },
  webMeta: { originalRng: { seed: 7 } },
};
await saveLocalSaveSlots(changed);
changed.slots[2].label = "mutated after write";
const restored = await loadLocalSaveSlots();
assert.equal(restored.slots[2].label, "本機存檔");
assert.equal(restored.slots[2].scenario_idx, 3);
assert.deepEqual(restored.slots[2].webMeta.originalRng, { seed: 7 });
assert.equal(restored.slots.filter((slot) => slot.played).length, 1);
process.stdout.write(
  "local saves OK: IndexedDB round trip preserves four slots\n",
);
