// Explicit read-only discovery for local save management. Summaries are NOT
// loadability, current-version, deletion or migration authority. No body reads.
import { gameSaveKeys, saveCatalog, saveIdentity } from './gamesavecodec.js';

export function readGameSaveCatalogs({ databaseName, getIndexedDB, maxKeys = 100000, maxCatalogs = 1000, maxRows = 50000 }) {
  saveIdentity(databaseName);
  if (typeof getIndexedDB !== 'function') throw new TypeError('explicit IndexedDB adapter required');
  for (const [value, limit] of [[maxKeys, 100000], [maxCatalogs, 1000], [maxRows, 50000]]) {
    if (!Number.isSafeInteger(value) || value < 1 || value > limit) throw new TypeError('bounded catalog inspection required');
  }
  return new Promise((resolve, reject) => {
    let database, opening, settled = false, absent = false, failure;
    let keys = 0, rows = 0, otherKeyCount = 0;
    const catalogs = [];
    const finish = error => {
      if (settled) return;
      settled = true; database?.close();
      if (error) reject(error);
      else resolve({ catalogs: catalogs.sort((a, b) => {
        if (a.gameId < b.gameId) return -1;
        if (a.gameId > b.gameId) return 1;
        return 0;
      }), otherKeyCount, bodiesRead: false });
    };
    try { opening = getIndexedDB().open(databaseName); }
    catch (error) { finish(error); return; }
    opening.onblocked = () => finish(new Error('save database open blocked'));
    // Inspecting an absent database must not create a durable database/schema.
    opening.onupgradeneeded = () => { absent = true; opening.transaction.abort(); };
    opening.onerror = () => finish(absent ? undefined : opening.error ?? new Error('save database open failed'));
    opening.onsuccess = () => {
      database = opening.result;
      if (settled) { database.close(); return; }
      if (database.version !== 1 || !database.objectStoreNames.contains('saves')) {
        finish(new Error('save database schema unknown')); return;
      }
      let tx;
      const abort = error => { failure = error; try { tx.abort(); } catch { finish(error); } };
      try {
        tx = database.transaction('saves', 'readonly');
        tx.oncomplete = () => finish(failure);
        tx.onabort = () => finish(failure ?? tx.error ?? new Error('save catalog inspection aborted'));
        tx.onerror = () => { failure ??= tx.error ?? new Error('save catalog inspection failed'); };
        const store = tx.objectStore('saves'), cursor = store.openKeyCursor();
        cursor.onerror = () => abort(cursor.error ?? new Error('save key inspection failed'));
        cursor.onsuccess = () => {
          try {
            const item = cursor.result;
            if (!item) return;
            if (++keys > maxKeys) throw new Error('save catalog key budget exceeded');
            let gameId = null;
            if (typeof item.key === 'string' && item.key.startsWith('game:') && item.key.endsWith(':catalog-v3')) {
              try {
                const candidate = decodeURIComponent(item.key.slice(5, -11));
                if (gameSaveKeys(candidate, 0).catalog === item.key) gameId = candidate;
              } catch { /* Noncanonical/unknown keys remain untouched. */ }
            }
            if (gameId === null) { otherKeyCount++; item.continue(); return; }
            if (catalogs.length >= maxCatalogs) throw new Error('save catalog count budget exceeded');
            const request = store.get(item.key);
            request.onerror = () => abort(request.error ?? new Error('save catalog read failed'));
            request.onsuccess = () => {
              try {
                let summary = null;
                try {
                  if (request.result === undefined) throw new TypeError('missing catalog value');
                  summary = saveCatalog(request.result, gameId);
                } catch { /* Corrupt summary is not absence, update or delete permission. */ }
                if (summary) {
                  rows += summary.rows.length;
                  if (rows > maxRows) throw new Error('save catalog row budget exceeded');
                }
                catalogs.push({ gameId, state: summary ? 'summary-only' : 'corrupt-summary', rows: summary ? structuredClone(summary.rows) : [] });
                item.continue();
              } catch (error) { abort(error); }
            };
          } catch (error) { abort(error); }
        };
      } catch (error) { if (tx) abort(error); else finish(error); }
    };
  });
}
