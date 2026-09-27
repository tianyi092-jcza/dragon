import { assertSaveId, nextSaveId, normalizeSaveSlots, summarizeSave } from './savecatalog.js';

// v1 store retained. New records use disjoint keys and an atomic small catalog.
// First write copies the old four-slot bundle in the same transaction; it never
// deletes that bundle. No database clearing or access outside this origin.
export function createIndexedDbSaveBackend({
  getIndexedDB = () => globalThis.indexedDB,
  databaseName = 'wolong-web',
} = {}) {
  const storeName = 'saves';
  const catalogKey = 'catalog-v2';
  const recordKey = (slot) => `record:${assertSaveId(slot)}`;
  function openDatabase() {
    return new Promise((resolve, reject) => {
      const indexedDB = getIndexedDB();
      if (!indexedDB) return reject(new Error('IndexedDB is unavailable'));
      const request = indexedDB.open(databaseName, 1);
      let blocked = false;
      request.onblocked = () => {
        blocked = true;
        reject(new Error('IndexedDB open blocked; close other tabs and retry'));
      };
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName);
      };
      request.onsuccess = () => {
        const db = request.result;
        if (blocked) { db.close(); return; }
        db.onversionchange = () => db.close();
        resolve(db);
      };
      request.onerror = () => reject(request.error ?? new Error('cannot open IndexedDB'));
    });
  }
  async function transaction(mode, action) {
    const db = await openDatabase();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        let value;
        tx.oncomplete = () => resolve(value);
        tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
        tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
        const fail = (error) => { tx.abort(); reject(error); };
        // Every callback executes inside the active transaction, never across await.
        const get = (key, callback) => {
          const request = store.get(key);
          request.onsuccess = () => {
            try { callback(request.result); } catch (error) { fail(error); }
          };
        };
        try { action(store, get, (result) => { value = result; }); }
        catch (error) { fail(error); }
      });
    } finally { db.close(); }
  }
  function catalog(get, callback) {
    get(catalogKey, (index) => {
      if (index?.format === 2) callback(index.rows, null);
      else get('slots', (legacy) => {
        const slots = normalizeSaveSlots(legacy).slots;
        callback(slots.map(summarizeSave), slots);
      });
    });
  }
  function writeRecords(records, allocate = false) {
    // Clone before the first await: callers cannot alter an in-flight write.
    const copies = structuredClone(records);
    for (const saved of copies) assertSaveId(saved?.slot);
    return transaction('readwrite', (store, get, done) => {
      catalog(get, (rows, legacy) => {
        if (legacy) for (const saved of legacy) store.put(saved, recordKey(saved.slot));
        const summaries = new Map(rows.map((row) => [row.slot, row]));
        if (allocate) copies[0].slot = nextSaveId(rows);
        for (const saved of copies) {
          store.put(saved, recordKey(saved.slot));
          summaries.set(saved.slot, summarizeSave(saved));
        }
        store.put({ format: 2, rows: [...summaries.values()].sort((a, b) => a.slot - b.slot) }, catalogKey);
        done(allocate ? copies[0] : undefined);
      });
    });
  }
  return Object.freeze({
    list() {
      return transaction('readonly', (_store, get, done) =>
        catalog(get, (rows) => done(rows)));
    },
    readOne(slot) {
      assertSaveId(slot);
      return transaction('readonly', (_store, get, done) => {
        catalog(get, (_rows, legacy) => {
          if (legacy) done(legacy.find((saved) => saved.slot === slot) ?? null);
          else get(recordKey(slot), (saved) => done(saved ?? null));
        });
      });
    },
    read() {
      return transaction('readonly', (_store, get, done) => {
        catalog(get, (rows, legacy) => {
          if (legacy) { done({ schema: 1, slots: legacy }); return; }
          const slots = [];
          done({ schema: 1, slots });
          for (const row of rows) get(recordKey(row.slot), (saved) => {
            if (!saved) throw new Error(`Missing save record ${row.slot}`);
            slots.push(saved);
          });
        });
      });
    },
    createOne(saved) { return writeRecords([{ ...saved, slot: 0 }], true); },
    writeOne(saved) { return writeRecords([saved]); },
    write(record) { return writeRecords(normalizeSaveSlots(record).slots); },
  });
}
