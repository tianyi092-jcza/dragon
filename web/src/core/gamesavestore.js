// Explicit opt-in local store. No default IDB access, legacy migration, App installation,
// scenario validation or trusted current-release decision. Delete is a local CAS primitive.
import { saveIdentity, saveInteger, saveDigest, saveObject, saveJSON, saveInput, saveRecord, saveSummary,
  saveCatalog, saveToken, checkSaveToken, gameSaveKeys, hashSaveText } from "./gamesavecodec.js";
export class GameSaveConflictError extends Error { constructor() { super("game save changed; reread required"); this.name = "GameSaveConflictError"; } }
export function createGameSaveStore({ gameId, databaseName, getIndexedDB, createRecordId = () => globalThis.crypto.randomUUID() }) {
  saveIdentity(gameId); saveIdentity(databaseName);
  if (typeof getIndexedDB !== "function" || typeof createRecordId !== "function") throw new TypeError("explicit save adapters required");
  const catalogKey = gameSaveKeys(gameId, 0).catalog;
  function transaction(mode, action) {
    return new Promise((resolve, reject) => {
      let database, settled = false, failure, result;
      const finish = (...errors) => { if (settled) return; settled = true; database?.close(); if (errors.length) reject(errors[0]); else resolve(result); };
      let opening;
      try { const indexedDB = getIndexedDB(); if (!indexedDB) throw new Error("IndexedDB unavailable"); opening = indexedDB.open(databaseName, 1); }
      catch (error) { finish(error); return; }
      opening.onerror = () => finish(opening.error ?? new Error("save database open failed"));
      opening.onblocked = () => finish(new Error("save database open blocked"));
      opening.onupgradeneeded = () => { const db = opening.result; if (!db.objectStoreNames.contains("saves")) db.createObjectStore("saves"); };
      opening.onsuccess = () => {
        database = opening.result; if (settled) { database.close(); return; }
        let tx;
        const abort = error => { failure = error; try { tx.abort(); } catch { finish(error); } };
        try {
          tx = database.transaction("saves", mode);
          tx.oncomplete = () => { if (failure !== undefined) finish(failure); else finish(); }; tx.onabort = () => finish(failure ?? tx.error ?? new Error("save transaction aborted"));
          tx.onerror = () => { failure ??= tx.error ?? new Error("save transaction failed"); };
          const request = (req, success = () => {}) => {
            req.onerror = () => abort(req.error ?? new Error("save request failed"));
            req.onsuccess = () => { try { success(req.result); } catch (error) { abort(error); } };
          };
          action(tx.objectStore("saves"), request, value => { result = value; });
        } catch (error) { if (tx) abort(error); else finish(error); }
      };
    });
  }
  function readPair(store, request, slot, done) {
    const raw = {}; let remaining = 2;
    const received = (key, value) => { raw[key] = value; if (--remaining === 0) done(raw); };
    request(store.get(catalogKey), value => received("catalog", value));
    request(store.get(gameSaveKeys(gameId, slot).record), value => received("pair", value));
  }
  function compare(catalog, pair, slot, expected) {
    const row = catalog.rows.find(value => value.slot === slot);
    if (expected === null) { if (pair !== undefined || row) throw new GameSaveConflictError(); return; }
    if (!row || pair === undefined) throw new GameSaveConflictError();
    saveObject(pair, ["bodyText", "bodyDigest"]); saveDigest(pair.bodyDigest);
    const record = saveRecord(expected.bodyText, gameId);
    if (pair.bodyText !== expected.bodyText || pair.bodyDigest !== expected.bodyDigest || saveJSON(row) !== saveJSON(saveSummary(record, expected.bodyDigest))) throw new GameSaveConflictError();
  }
  async function verifiedToken(value) {
    const expected = checkSaveToken(value, gameId);
    if (await hashSaveText(expected.bodyText) !== expected.bodyDigest) throw new TypeError("save token digest mismatch"); return expected;
  }
  async function get(slot) {
    saveInteger(slot);
    const raw = await transaction("readonly", (store, request, done) => readPair(store, request, slot, done));
    const catalog = saveCatalog(raw.catalog, gameId);
    if (raw.pair === undefined) { if (catalog.rows.some(row => row.slot === slot)) throw new TypeError("save body missing"); return null; }
    saveObject(raw.pair, ["bodyText", "bodyDigest"]); saveDigest(raw.pair.bodyDigest);
    const record = saveRecord(raw.pair.bodyText, gameId);
    if (record.slot !== slot || await hashSaveText(raw.pair.bodyText) !== raw.pair.bodyDigest) throw new TypeError("save body identity/digest mismatch");
    const token = saveToken(record, raw.pair.bodyText, raw.pair.bodyDigest); compare(catalog, raw.pair, slot, token);
    return { record, token };
  }
  async function list() {
    const catalog = await transaction("readonly", (store, request, done) => request(store.get(catalogKey), value => done(saveCatalog(value, gameId))));
    return catalog.rows; // Summary only; not a validity/loadability certificate.
  }
  async function put(value, expected = null) {
    const input = saveInput(value, gameId); // Capture caller-owned snapshot and expectation synchronously.
    const captured = expected === null ? null : checkSaveToken(expected, gameId);
    if (captured !== null && captured.slot !== input.slot) throw new TypeError("save token slot mismatch");
    if (captured !== null) await verifiedToken(captured);
    const before = await transaction("readonly", (store, request, done) => readPair(store, request, input.slot, done));
    const catalog = saveCatalog(before.catalog, gameId); compare(catalog, before.pair, input.slot, captured);
    if (catalog.nextWriteRevision === Number.MAX_SAFE_INTEGER) throw new RangeError("save revision exhausted");
    const record = { format: 3, ...input, recordId: captured?.recordId ?? saveIdentity(createRecordId()), writeRevision: catalog.nextWriteRevision };
    const bodyText = saveJSON(record), bodyDigest = await hashSaveText(bodyText), row = saveSummary(record, bodyDigest);
    const nextCatalog = { format: 3, gameId, nextWriteRevision: catalog.nextWriteRevision + 1,
      rows: [...catalog.rows.filter(value => value.slot !== input.slot), row].sort((a, b) => a.slot - b.slot) };
    saveCatalog(nextCatalog, gameId);
    return transaction("readwrite", (store, request, done) => readPair(store, request, input.slot, raw => {
      const current = saveCatalog(raw.catalog, gameId);
      if (saveJSON(current) !== saveJSON(catalog)) throw new GameSaveConflictError();
      compare(current, raw.pair, input.slot, captured);
      request(store.put({ bodyText, bodyDigest }, gameSaveKeys(gameId, input.slot).record)); request(store.put(nextCatalog, catalogKey));
      done({ record, token: saveToken(record, bodyText, bodyDigest) });
    }));
  }
  async function compareDelete(value) {
    const expected = await verifiedToken(value); // No network/await inside the transaction.
    return transaction("readwrite", (store, request, done) => readPair(store, request, expected.slot, raw => {
      const catalog = saveCatalog(raw.catalog, gameId); compare(catalog, raw.pair, expected.slot, expected);
      request(store.delete(gameSaveKeys(gameId, expected.slot).record));
      request(store.put({ ...catalog, rows: catalog.rows.filter(row => row.slot !== expected.slot) }, catalogKey));
      done(true); // Promise resolves only after transaction complete, never request success.
    }));
  }
  return Object.freeze({ gameId, list, get, put, compareDelete });
}
