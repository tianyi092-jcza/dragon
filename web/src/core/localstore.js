const DATABASE_NAME = "wolong-web";
const DATABASE_VERSION = 1;
const STORE_NAME = "saves";
const SAVE_KEY = "slots";

function clone(value) {
  return structuredClone(value);
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error("IndexedDB is unavailable"));
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME))
        database.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("cannot open IndexedDB"));
  });
}

async function withStore(mode, action) {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);
      let result;
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("IndexedDB transaction failed"));
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
      try {
        result = action(store);
      } catch (error) {
        transaction.abort();
        reject(error);
      }
    });
  } finally {
    database.close();
  }
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

export function emptySaveSlots() {
  return {
    schema: 1,
    slots: [0, 1, 2, 3].map((slot) => ({
      slot,
      label: "",
      played: false,
      scenario_idx: null,
      state: null,
      webMeta: null,
    })),
  };
}

function normalizeSaveSlots(value) {
  const source = Array.isArray(value?.slots) ? value.slots : [];
  return {
    schema: 1,
    slots: [0, 1, 2, 3].map((slot) => {
      const saved = source.find((candidate) => candidate?.slot === slot);
      return saved
        ? { ...saved, slot, played: Boolean(saved.played) }
        : emptySaveSlots().slots[slot];
    }),
  };
}

export async function loadLocalSaveSlots() {
  const record = await withStore("readonly", (store) =>
    requestResult(store.get(SAVE_KEY)),
  );
  return normalizeSaveSlots(record);
}

export async function saveLocalSaveSlots(saves) {
  const normalized = normalizeSaveSlots(saves);
  await withStore("readwrite", (store) =>
    store.put(clone(normalized), SAVE_KEY),
  );
  return normalized;
}
