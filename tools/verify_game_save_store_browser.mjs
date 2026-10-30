// Real IDB only in a new Chromium context, new random database; no App/real save/profile.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
const round = process.argv[2]; assert.equal(process.argv.length, 3); assert.match(round ?? "", /^[A-Za-z0-9-]{1,64}$/);
const out = ".dragon-analysis/editor-phase/" + round; mkdirSync(out);
const files = ["tools/verify_game_save_store_browser.mjs", "web/src/core/gamesavecodec.js", "web/src/core/gamesavestore.js", "web/src/core/gamesavecatalogs.js", "web/src/player/playercatalog.js"];
const sha = p => createHash("sha256").update(readFileSync(p)).digest("hex"), hashes = Object.fromEntries(files.map(p => [p, sha(p)]));
const fixture = "/__game-save-fixture", sourceURLs = new Map(files.slice(1).map(p => [p.replace(/^web/, ""), readFileSync(p)]));
const html = '<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><title>隔離存檔倉儲夾具（非遊戲）</title><p>只檢查本地事務，不代表版本授權或完整存檔。</p>';
const server = createServer((req, res) => {
  if (req.method === "GET" && req.url === fixture) { res.writeHead(200, { "content-type": "text/html;charset=utf-8", "cache-control": "no-store" }); res.end(html); }
  else if (req.method === "GET" && sourceURLs.has(req.url)) { res.writeHead(200, { "content-type": "text/javascript;charset=utf-8", "cache-control": "no-store" }); res.end(sourceURLs.get(req.url)); }
  else { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); const origin = `http://127.0.0.1:${server.address().port}`;
const databaseName = "owned-game-save-" + randomUUID(), errors = [], forbidden = [], requests = [], checks = []; let browser;
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "C:/Users/fczll/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright");
const env = {}; for (const key of ["SystemRoot", "WINDIR", "COMSPEC", "PATH", "PATHEXT", "TEMP", "TMP", "USERPROFILE", "LOCALAPPDATA", "APPDATA", "HOMEDRIVE", "HOMEPATH"]) if (process.env[key] !== undefined) env[key] = process.env[key];
try {
  browser = await chromium.launch({ headless: true, env }); const context = await browser.newContext();
  await context.addInitScript(name => {
    window.__saveOpens = []; const open = indexedDB.open.bind(indexedDB);
    indexedDB.open = (requested, version) => {
      if (![name, ...['-fresh', '-future', '-missing-store', '-empty-schema'].map(suffix => name + suffix)].includes(requested)) throw new Error("non-owned database forbidden"); window.__saveOpens.push(requested);
      const opening = open(requested, version);
      opening.addEventListener("success", () => {
        const db = opening.result, transaction = db.transaction.bind(db);
        db.transaction = (...args) => {
          if (window.__catalogScan) window.__catalogTransactions.push([...args]);
          const tx = transaction(...args);
          if (window.__catalogScan) {
            if (args[1] !== 'readonly') throw new Error('catalog inspection attempted write');
            const store = tx.objectStore('saves'), get = store.get.bind(store);
            store.openCursor = () => { throw new Error('body cursor forbidden'); };
            store.get = key => {
              if (typeof key !== 'string' || !key.endsWith(':catalog-v3')) throw new Error('body read forbidden');
              window.__catalogGets.push(key);
              const request = get(key);
              if (window.__abortCatalogRead) {
                window.__abortCatalogRead = false;
                request.addEventListener('success', () => tx.abort(), { once: true });
              }
              return request;
            };
            tx.objectStore = () => store;
          }
          if (args[1] === "readwrite" && window.__abortKind) {
            const kind = window.__abortKind; window.__abortKind = null;
            const store = tx.objectStore("saves"), operation = store[kind].bind(store);
            store[kind] = (...values) => { const request = operation(...values); request.addEventListener("success", () => tx.abort(), { once: true }); return request; };
            tx.objectStore = () => store;
          } return tx;
        };
      }); return opening;
    };
  }, databaseName);
  await context.route("**/*", route => { const url = new URL(route.request().url()); requests.push(url.href);
    if (url.origin !== origin || ![fixture, ...sourceURLs.keys()].includes(url.pathname) || url.search) { forbidden.push(url.href); return route.abort(); } return route.continue(); });
  const pages = [await context.newPage(), await context.newPage()];
  for (const page of pages) { page.on("pageerror", error => errors.push(String(error))); page.on("console", message => { if (message.type() === "error") errors.push(message.text()); }); await page.goto(origin + fixture);
    await page.evaluate(async name => {
      const { createGameSaveStore } = await import("/src/core/gamesavestore.js");
      const { readGameSaveCatalogs } = await import('/src/core/gamesavecatalogs.js');
      window.inspectCatalogs = async (options = {}, suffix = '') => {
        window.__catalogGets = []; window.__catalogTransactions = []; window.__catalogScan = true;
        try { return await readGameSaveCatalogs({ databaseName: name + suffix, getIndexedDB: () => indexedDB, ...options }); }
        finally { window.__catalogScan = false; }
      };
      window.freshStore = () => createGameSaveStore({ gameId: "fresh", databaseName: name + "-fresh", getIndexedDB: () => indexedDB });
      window.makeStore = gameId => createGameSaveStore({ gameId, databaseName: name, getIndexedDB: () => indexedDB }); window.a = window.makeStore("game-a"); window.b = window.makeStore("game-b");
      window.input = (gameId = "game-a", slot = 0, marker = 1) => ({ gameId, slot, releaseId: "fixture-release", releaseOrdinal: 10, chapterId: "fixture-chapter", manifestDigest: "a".repeat(64), snapshot: { marker, unknown: [0, 255, null] } });
      window.rawTransaction = (mode, action) => new Promise((resolve, reject) => { const opening = indexedDB.open(name, 1); opening.onupgradeneeded = () => opening.result.createObjectStore("saves"); opening.onerror = () => reject(opening.error); opening.onsuccess = () => { const db = opening.result, tx = db.transaction("saves", mode); let result; tx.oncomplete = () => { db.close(); resolve(result); }; tx.onabort = () => { db.close(); reject(tx.error); }; action(tx.objectStore("saves"), value => { result = value; }); }; });
      window.legacyValues = { "catalog-v2": { format: 2, rows: [{ slot: 0, played: true }] }, "record:0": { state: { marker: "legacy" } }, slots: { slots: [{ slot: 0, state: {} }] } };
      window.legacyRead = () => window.rawTransaction("readonly", (store, done) => { const values = {}; let left = 3; for (const key of Object.keys(window.legacyValues)) { const request = store.get(key); request.onsuccess = () => { values[key] = request.result; if (--left === 0) done(JSON.stringify(values)); }; } });
    }, databaseName);
  }
  const [one, two] = pages;
  assert.deepEqual(await one.evaluate(() => window.inspectCatalogs({}, '-fresh')), { catalogs: [], otherKeyCount: 0, bodiesRead: false });
  assert.equal(await one.evaluate(async name => (await indexedDB.databases()).some(row => row.name === name + '-fresh'), databaseName), false);
  checks.push('explicit inspection of absent database aborts schema creation; no persistent database');
  for (const [suffix, version, saves, opaque] of [['-future', 2, true, true], ['-missing-store', 1, false, true], ['-empty-schema', 3, false, false]]) {
    const result = await one.evaluate(async ({ name, suffix, version, saves, opaque }) => {
      const open = () => new Promise((resolve, reject) => {
        const request = indexedDB.open(name + suffix, version);
        request.onupgradeneeded = () => {
          if (saves) request.result.createObjectStore('saves').put({ untouched: [0, 255, null] }, 'game:future:catalog-v3');
          if (opaque) {
            const store = request.result.createObjectStore('opaque', { keyPath: 'id' });
            store.createIndex('by-kind', 'kind', { unique: true });
            store.put({ id: 'owned-key', kind: 'unknown', bytes: new Uint8Array([0, 255, 127]) });
          }
        };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
      const snapshot = async () => {
        const db = await open(), names = [...db.objectStoreNames], result = { version: db.version, stores: [] };
        if (!names.length) { db.close(); return result; }
        return new Promise((resolve, reject) => {
          const tx = db.transaction(names, 'readonly');
          tx.oncomplete = () => { db.close(); resolve(result); };
          tx.onabort = () => { db.close(); reject(tx.error); };
          for (const name of names) {
            const store = tx.objectStore(name);
            const row = { name, keyPath: store.keyPath, autoIncrement: store.autoIncrement, indexes: [...store.indexNames].map(name => {
              const index = store.index(name); return { name, keyPath: index.keyPath, unique: index.unique, multiEntry: index.multiEntry };
            }) };
            result.stores.push(row);
            const keys = store.getAllKeys(), values = store.getAll();
            keys.onsuccess = () => { row.keys = keys.result; };
            values.onsuccess = () => { row.values = values.result; };
          }
        });
      };
      const before = JSON.stringify(await snapshot());
      let outcome;
      try { await window.inspectCatalogs({}, suffix); outcome = 'unsafe-success'; }
      catch (error) { outcome = error.message; }
      const reads = [...window.__catalogGets], transactions = [...window.__catalogTransactions];
      return { before, after: JSON.stringify(await snapshot()), outcome, reads, transactions };
    }, { name: databaseName, suffix, version, saves, opaque });
    assert.equal(result.outcome, 'save database schema unknown');
    assert.equal(result.after, result.before);
    assert.deepEqual(result.reads, []); assert.deepEqual(result.transactions, []);
    checks.push(`unknown native database schema ${suffix}: no inspection transaction, migration or data/schema change`);
  }
  const fresh = await one.evaluate(async () => { const store = window.freshStore(); await store.put(window.input("fresh")); return (await store.get(0)).record.writeRevision; }); assert.equal(fresh, 1);
  assert.equal(await two.evaluate(async () => (await window.freshStore().get(0)).record.snapshot.marker), 1);
  checks.push("factory creates actual new v1/saves schema without fixture seeding; second page sees same complete record");
  await one.evaluate(() => window.rawTransaction("readwrite", (store, done) => { for (const [key, value] of Object.entries(window.legacyValues)) store.put(value, key); done(true); }));
  const legacy = await one.evaluate(() => window.legacyRead());
  const saved = await one.evaluate(async () => { const input = window.input(); const pending = window.a.put(input); input.snapshot.marker = 99; return (await pending).record.snapshot.marker; }); assert.equal(saved, 1);
  await two.evaluate(() => window.b.put(window.input("game-b", 0, 2)));
  assert.deepEqual(await one.evaluate(async () => [(await window.a.get(0)).record.snapshot.marker, (await window.b.get(0)).record.snapshot.marker]), [1, 2]);
  assert.equal(await one.evaluate(() => window.legacyRead()), legacy);
  checks.push("real v1/saves game-a/game-b slot0 / cloned candidate / explicit old keys byte stable in same owned DB");
  for (const page of pages) await page.evaluate(async () => { window.old = (await window.a.get(0)).token; });
  const races = await Promise.all(pages.map((page, i) => page.evaluate(async marker => { try { await window.a.put(window.input("game-a", 0, marker), window.old); return "fulfilled"; } catch (error) { return error.name; } }, i + 3)));
  assert.deepEqual(races.slice().sort(), ["GameSaveConflictError", "fulfilled"].sort());
  const latest = await one.evaluate(async () => { window.latest = await window.a.get(0); return { id: window.latest.record.recordId, rev: window.latest.record.writeRevision, marker: window.latest.record.snapshot.marker }; }); assert.equal(latest.rev, 2); assert.ok([3, 4].includes(latest.marker));
  checks.push("two real pages same-store competing saved expectation: one successful overwrite, one typed conflict; no lost overwrite");
  assert.equal(await two.evaluate(async () => { try { await window.a.compareDelete(window.old); return "unsafe"; } catch (error) { return error.name; } }), "GameSaveConflictError");
  assert.equal(await one.evaluate(async () => (await window.a.get(0)).record.snapshot.marker), latest.marker);
  assert.equal(await one.evaluate(async () => { try { await window.b.compareDelete(window.old); return "unsafe"; } catch (error) { return error.name; } }), "TypeError");
  await one.evaluate(() => window.a.compareDelete(window.latest.token)); assert.equal(await two.evaluate(() => window.a.get(0)), null);
  const created = await two.evaluate(async () => { const saved = await window.a.put(window.input("game-a", 0, 8)); return { id: saved.record.recordId, rev: saved.record.writeRevision }; }); assert.equal(created.rev, 3); assert.notEqual(created.id, latest.id);
  assert.equal(await one.evaluate(async () => { try { await window.a.compareDelete(window.latest.token); return "unsafe"; } catch (error) { return error.name; } }), "GameSaveConflictError");
  assert.equal(await one.evaluate(async () => (await window.b.get(0)).record.snapshot.marker), 2);
  checks.push("stale/cross-game delete rejected / exact local delete leaves other game / recreated slot rejects ABA token");
  const beforeFault = await one.evaluate(() => window.a.list());
  assert.match(await one.evaluate(async () => { window.__abortKind = "put"; try { await window.a.put(window.input("game-a", 1)); return "unsafe"; } catch (error) { return error.message; } }), /abort|transaction/i);
  assert.equal(await two.evaluate(() => window.a.get(1)), null); assert.deepEqual(await two.evaluate(() => window.a.list()), beforeFault);
  const deleteToken = await one.evaluate(async () => (await window.a.get(0)).token);
  assert.match(await one.evaluate(async token => { window.__abortKind = "delete"; try { await window.a.compareDelete(token); return "unsafe"; } catch (error) { return error.message; } }, deleteToken), /abort|transaction/i);
  assert.deepEqual(await two.evaluate(async () => (await window.a.get(0)).token), deleteToken); assert.deepEqual(await two.evaluate(() => window.a.list()), beforeFault);
  checks.push("native abort after put/delete request success rolls back body+summary; rejected Promise, original token retained");
  assert.match(await one.evaluate(async () => {
    window.__abortKind = 'delete';
    try { await window.a.put({ ...window.input('game-a', 1), releaseId: 'fixture-next', releaseOrdinal: 11 }, null, { discardOlderReleases: true }); return 'unsafe'; }
    catch (error) { return error.message; }
  }), /abort|transaction/i);
  assert.deepEqual(await two.evaluate(async () => (await window.a.get(0)).token), deleteToken);
  assert.equal(await two.evaluate(() => window.a.get(1)), null);
  await one.evaluate(() => window.a.put({ ...window.input('game-a', 1), releaseId: 'fixture-next', releaseOrdinal: 11 }, null, { discardOlderReleases: true }));
  assert.deepEqual(await two.evaluate(async () => [(await window.a.get(0)), (await window.a.get(1)).record.releaseOrdinal, (await window.b.get(0)).record.snapshot.marker]), [null, 11, 2]);
  checks.push('native new-version save plus old-version removal is atomic even after delete-success abort; other game stays intact');
  await one.evaluate(async () => { for (const id of ["a:b", "a%3Ab"]) await window.makeStore(id).put(window.input(id)); });
  assert.deepEqual(await two.evaluate(async () => Promise.all(["a:b", "a%3Ab"].map(async id => (await window.makeStore(id).get(0)).record.gameId))), ["a:b", "a%3Ab"]);
  const catalogReport = await one.evaluate(() => window.inspectCatalogs());
  assert.deepEqual(catalogReport.catalogs.map(row => row.gameId), ['a%3Ab', 'a:b', 'game-a', 'game-b']);
  assert.ok(catalogReport.catalogs.every(row => row.state === 'summary-only' && row.rows.length === 1));
  assert.equal(catalogReport.bodiesRead, false);
  assert.equal(await one.evaluate(() => window.__catalogGets.some(key => key.includes(':record:'))), false);
  checks.push('game catalogs discoverable independently of remote listing; only canonical summary values read');
  await one.evaluate(() => window.rawTransaction('readwrite', (store, done) => {
    store.put({ format: 3, gameId: 'broken', rows: 'invalid' }, 'game:broken:catalog-v3');
    store.put(undefined, 'game:missing:catalog-v3');
    store.put({ private: 'unknown alias' }, 'game:game%2Da:catalog-v3'); done(true);
  }));
  const allRaw = () => one.evaluate(() => window.rawTransaction('readonly', (store, done) => {
    const values = store.getAll(); values.onsuccess = () => { const keys = store.getAllKeys(); keys.onsuccess = () => done(JSON.stringify([keys.result, values.result])); };
  }));
  const beforeInspection = await allRaw(), corrupt = await one.evaluate(() => window.inspectCatalogs());
  assert.deepEqual(corrupt.catalogs.filter(row => row.state === 'corrupt-summary').map(row => row.gameId), ['broken', 'missing']);
  assert.equal(await one.evaluate(() => window.__catalogGets.includes('game:game%2Da:catalog-v3')), false);
  assert.equal(await allRaw(), beforeInspection);
  checks.push('corrupt/undefined catalogs reported, noncanonical aliases untouched, every owned raw value unchanged');
  assert.match(await one.evaluate(async () => {
    window.__abortCatalogRead = true;
    try { await window.inspectCatalogs(); return 'unsafe-success'; }
    catch (error) { return error.message; }
  }), /abort|inactive|transaction/i);
  assert.equal(await one.evaluate(() => window.__abortCatalogRead), false);
  assert.equal(await allRaw(), beforeInspection);
  assert.deepEqual(await one.evaluate(() => window.inspectCatalogs()), corrupt);
  checks.push('native abort after successful summary GET returns no partial report; all data unchanged and fresh retry succeeds');
  for (const limits of [{ maxKeys: 1 }, { maxCatalogs: 1 }, { maxRows: 1 }]) {
    assert.match(await one.evaluate(async limits => { try { await window.inspectCatalogs(limits); return 'unsafe'; } catch (error) { return error.message; } }, limits), /budget exceeded/);
  }
  assert.equal(await allRaw(), beforeInspection);
  assert.equal(await two.evaluate(() => window.legacyRead()), legacy);
  checks.push('key/catalog/row budgets abort without returning partial results or changing any bytes');
  assert.equal(await one.evaluate(async () => {
    let opens = 0;
    try { await window.inspectCatalogs({ maxKeys: 0, getIndexedDB: () => { opens++; throw new Error('must not open'); } }); }
    catch (error) { return error instanceof TypeError && opens === 0; }
    return false;
  }), true);
  checks.push('invalid inspection budget rejected before requesting IndexedDB');
  await one.evaluate(async () => {
    await window.makeStore('<img src=x>').put(window.input('<img src=x>'));
    const { mountPlayerCatalog } = await import('/src/player/playercatalog.js');
    window.__localReads = 0; window.__localMode = 'normal'; window.__outsideClicks = 0;
    document.addEventListener('click', () => { window.__outsideClicks++; });
    window.__localView = mountPlayerCatalog({ root: document.body, reader: { async registry() { throw new Error('owned offline registry'); } }, readLocalCatalogs: () => {
      window.__localReads++;
      if (window.__localMode === 'fail') throw new Error('owned unavailable IDB');
      if (window.__localMode === 'hold') return new Promise(resolve => { window.__releaseLocal = async () => resolve(await window.inspectCatalogs()); });
      return window.inspectCatalogs();
    } });
    await window.__localView.refresh();
  });
  const beforeUI = await allRaw(), localButton = one.getByRole('button', { name: '不可用存檔管理', exact: true });
  assert.equal(await one.evaluate(() => window.__localReads), 0);
  await localButton.click();
  const localDialog = one.getByRole('dialog', { name: '不可用存檔管理', exact: true });
  await one.waitForFunction(() => document.querySelector('[role=dialog]')?.textContent.includes('遊戲ID：missing'));
  assert.equal(await one.evaluate(() => window.__localView.selection()), null);
  assert.match(await localDialog.textContent(), /槽2.*版本序號：11/);
  assert.match(await localDialog.textContent(), /目錄損壞或不完整/);
  assert.match(await localDialog.textContent(), /遊戲ID：<img src=x>/);
  assert.equal(await localDialog.locator('img,script,a').count(), 0);
  assert.equal(await localDialog.locator('button').count(), 1);
  const outsideClicks = await one.evaluate(() => window.__outsideClicks);
  await localDialog.getByRole('heading', { name: '不可用存檔管理（只讀檢視）' }).click();
  assert.equal(await one.evaluate(() => window.__outsideClicks), outsideClicks);
  assert.equal(await allRaw(), beforeUI);
  checks.push('independent native local catalog UI works with offline registry, escapes identifiers, blocks underlying selection, reads no bodies and writes nothing');
  await one.evaluate(() => { window.__localMode = 'fail'; });
  await localDialog.getByRole('button').click();
  await one.waitForFunction(() => document.querySelector('[role=dialog]')?.textContent.includes('不能判定為沒有存檔'));
  assert.equal(await allRaw(), beforeUI);
  await one.evaluate(() => { window.__localMode = 'normal'; });
  await localDialog.getByRole('button').click();
  await one.waitForFunction(() => document.querySelector('[role=dialog]')?.textContent.includes('遊戲ID：missing'));
  await localDialog.click({ button: 'right' });
  assert.equal(await localDialog.count(), 0);
  assert.equal(await one.evaluate(() => window.__localView.selection().kind), 'builtin');
  checks.push('failed local inspection stays unknown and preserves data; explicit retry succeeds and right-click returns without a close/delete/load button');
  await one.evaluate(() => { window.__localMode = 'hold'; });
  await localButton.click();
  await one.waitForFunction(() => typeof window.__releaseLocal === 'function');
  await localDialog.click({ button: 'right' });
  await one.evaluate(async () => { await window.__releaseLocal(); window.__releaseLocal = null; });
  assert.equal(await localDialog.count(), 0);
  await localButton.click();
  await one.evaluate(async () => { window.__localView.close(); await window.__releaseLocal(); });
  assert.equal(await one.locator('.player-catalog,[role=dialog]').count(), 0);
  assert.equal(await allRaw(), beforeUI);
  checks.push('late inspection after right-click or owning view disposal cannot reopen a panel or mutate any local key');
  assert.equal(await two.evaluate(() => window.legacyRead()), legacy); for (const page of pages) assert.ok((await page.evaluate(() => window.__saveOpens)).every(name => [databaseName, ...['-fresh', '-future', '-missing-store', '-empty-schema'].map(suffix => databaseName + suffix)].includes(name)));
  assert.deepEqual(errors, []); assert.deepEqual(forbidden, []); for (const [p, h] of Object.entries(hashes)) assert.equal(sha(p), h);
  checks.push("actual percent-encoded game namespace distinction / all opened names owned / no outside requests or legacy drift");
  writeFileSync(out + "/receipt.json", JSON.stringify({ result: "PASS-REAL-IDB-OPT-IN-GAME-SAVE-STORE", hashes, checks, errors, forbidden, requests, databaseName, limits: "New context/new database engineering fixture only; no App, complete snapshot, server/latest release, confirmation UI or actual user store. Old keys explicitly seeded fixtures, not old-user migration." }, null, 2), { flag: "wx" });
  process.stdout.write("PASS real isolated IndexedDB game namespaces / two-page CAS / compare-delete / native request-success abort rollback\n");
} catch (error) { writeFileSync(out + "/failure.json", JSON.stringify({ result: "NOT-PASS", error: String(error.stack ?? error), hashes, checks, errors, forbidden }, null, 2), { flag: "wx" }); throw error; }
finally { await browser?.close(); server.closeIdleConnections(); await new Promise(resolve => server.close(resolve)); }
