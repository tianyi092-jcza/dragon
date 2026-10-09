// Real IDB only in a new Chromium context, new random database; no App/real save/profile.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
const round = process.argv[2]; assert.equal(process.argv.length, 3); assert.match(round ?? "", /^[A-Za-z0-9-]{1,64}$/);
const out = ".dragon-analysis/editor-phase/" + round; mkdirSync(out);
const files = ["tools/verify_game_save_store_browser.mjs", "web/src/core/gamesavecodec.js", "web/src/core/gamesavestore.js"];
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
      if (requested !== name && requested !== name + "-fresh") throw new Error("non-owned database forbidden"); window.__saveOpens.push(requested);
      const opening = open(requested, version);
      opening.addEventListener("success", () => {
        const db = opening.result, transaction = db.transaction.bind(db);
        db.transaction = (...args) => {
          const tx = transaction(...args);
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
      window.freshStore = () => createGameSaveStore({ gameId: "fresh", databaseName: name + "-fresh", getIndexedDB: () => indexedDB });
      window.makeStore = gameId => createGameSaveStore({ gameId, databaseName: name, getIndexedDB: () => indexedDB }); window.a = window.makeStore("game-a"); window.b = window.makeStore("game-b");
      window.input = (gameId = "game-a", slot = 0, marker = 1) => ({ gameId, slot, releaseId: "fixture-release", releaseOrdinal: 10, chapterId: "fixture-chapter", manifestDigest: "a".repeat(64), snapshot: { marker, unknown: [0, 255, null] } });
      window.rawTransaction = (mode, action) => new Promise((resolve, reject) => { const opening = indexedDB.open(name, 1); opening.onupgradeneeded = () => opening.result.createObjectStore("saves"); opening.onerror = () => reject(opening.error); opening.onsuccess = () => { const db = opening.result, tx = db.transaction("saves", mode); let result; tx.oncomplete = () => { db.close(); resolve(result); }; tx.onabort = () => { db.close(); reject(tx.error); }; action(tx.objectStore("saves"), value => { result = value; }); }; });
      window.legacyValues = { "catalog-v2": { format: 2, rows: [{ slot: 0, played: true }] }, "record:0": { state: { marker: "legacy" } }, slots: { slots: [{ slot: 0, state: {} }] } };
      window.legacyRead = () => window.rawTransaction("readonly", (store, done) => { const values = {}; let left = 3; for (const key of Object.keys(window.legacyValues)) { const request = store.get(key); request.onsuccess = () => { values[key] = request.result; if (--left === 0) done(JSON.stringify(values)); }; } });
    }, databaseName);
  }
  const [one, two] = pages;
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
  await one.evaluate(async () => { for (const id of ["a:b", "a%3Ab"]) await window.makeStore(id).put(window.input(id)); });
  assert.deepEqual(await two.evaluate(async () => Promise.all(["a:b", "a%3Ab"].map(async id => (await window.makeStore(id).get(0)).record.gameId))), ["a:b", "a%3Ab"]);
  assert.equal(await two.evaluate(() => window.legacyRead()), legacy); for (const page of pages) assert.ok((await page.evaluate(() => window.__saveOpens)).every(name => name === databaseName || name === databaseName + "-fresh"));
  assert.deepEqual(errors, []); assert.deepEqual(forbidden, []); for (const [p, h] of Object.entries(hashes)) assert.equal(sha(p), h);
  checks.push("actual percent-encoded game namespace distinction / all opened names owned / no outside requests or legacy drift");
  writeFileSync(out + "/receipt.json", JSON.stringify({ result: "PASS-REAL-IDB-OPT-IN-GAME-SAVE-STORE", hashes, checks, errors, forbidden, requests, databaseName, limits: "New context/new database engineering fixture only; no App, complete snapshot, server/latest release, confirmation UI or actual user store. Old keys explicitly seeded fixtures, not old-user migration." }, null, 2), { flag: "wx" });
  process.stdout.write("PASS real isolated IndexedDB game namespaces / two-page CAS / compare-delete / native request-success abort rollback\n");
} catch (error) { writeFileSync(out + "/failure.json", JSON.stringify({ result: "NOT-PASS", error: String(error.stack ?? error), hashes, checks, errors, forbidden }, null, 2), { flag: "wx" }); throw error; }
finally { await browser?.close(); server.closeIdleConnections(); await new Promise(resolve => server.close(resolve)); }
