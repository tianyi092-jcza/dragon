// Engineering fixtures only. Not a scenario snapshot/release authorization/restore oracle.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createGameSaveStore, GameSaveConflictError } from "../web/src/core/gamesavestore.js";
import { gameSaveKeys, saveJSON, hashSaveText } from "../web/src/core/gamesavecodec.js";
import { gameSaveMemoryIDB } from "./gamesave_mock.mjs";
const paths = ["tools/verify_game_save_store.mjs", "tools/gamesave_mock.mjs", "web/src/core/gamesavecodec.js", "web/src/core/gamesavestore.js"];
const sha = p => createHash("sha256").update(readFileSync(p)).digest("hex"), hashes = Object.fromEntries(paths.map(p => [p, sha(p)]));
let implicitIDB = 0; Object.defineProperty(globalThis, "indexedDB", { configurable: true, get() { implicitIDB++; throw new Error("implicit IDB forbidden"); } });
const checks = []; let negatives = 0;
const input = (gameId = "game-a", slot = 0, marker = 1) => ({ gameId, slot, releaseId: "fixture-release", releaseOrdinal: 10, chapterId: "fixture-chapter", manifestDigest: "a".repeat(64), snapshot: { marker, unknown: [0, 255, null], nested: { preserved: true } } });
const legacy = [["catalog-v2", { format: 2, rows: [{ slot: 0, played: true }] }], ["record:0", { state: { money: 42 } }], ["slots", { slots: [{ slot: 0, state: { legacy: true } }] }]];
const memory = gameSaveMemoryIDB(legacy), create = (id, db = memory, more = {}) => createGameSaveStore({ gameId: id, databaseName: "owned-game-save-fixture", getIndexedDB: () => db.indexedDB, ...more });
const a = create("game-a"), b = create("game-b");
const canonical = '{"a":"漢字","b":[0,null]}'; assert.equal(saveJSON({ b: [0, null], a: "漢字" }), canonical); assert.equal(await hashSaveText(canonical), createHash("sha256").update(canonical).digest("hex"));
assert.equal(await a.get(0), null); assert.deepEqual(await a.list(), []);
const caller = input(), saving = a.put(caller); caller.snapshot.marker = 99;
const first = await saving; assert.equal(first.record.snapshot.marker, 1); first.record.snapshot.marker = 77;
assert.equal((await a.get(0)).record.snapshot.marker, 1); await b.put(input("game-b", 0, 2));
assert.equal((await b.get(0)).record.snapshot.marker, 2); assert.equal((await a.get(0)).record.snapshot.marker, 1);
const read = await a.get(0); read.record.snapshot.unknown[0] = 5; assert.equal((await a.get(0)).record.snapshot.unknown[0], 0);
memory.stats.reads.length = 0; const list = await a.list(); assert.deepEqual(memory.stats.reads, [gameSaveKeys("game-a", 0).catalog]); assert.equal(list[0].releaseOrdinal, 10); list[0].releaseId = "mutated"; assert.equal((await a.list())[0].releaseId, "fixture-release");
for (const id of ["a:b", "a%3Ab", "a/../b", "漢字"] ) await create(id).put(input(id));
assert.notEqual(gameSaveKeys("a:b", 0).catalog, gameSaveKeys("a%3Ab", 0).catalog);
for (const [key, value] of legacy) assert.deepEqual(new Map(memory.records()).get(key), value);
assert.equal(memory.stats.reads.some(key => ["slots", "catalog-v2", "record:0"].includes(key)), false);
checks.push("same-slot game namespaces / encoded delimiter collisions / cloned JSON / summary-only list / legacy untouched and unread");
const conflict = async work => { await assert.rejects(work, GameSaveConflictError); negatives++; };
await conflict(a.put(input()));
const captured = (await a.get(0)).token, races = await Promise.allSettled([a.put(input("game-a", 0, 3), captured), create("game-a").put(input("game-a", 0, 4), captured)]);
assert.equal(races.filter(r => r.status === "fulfilled").length, 1); assert.equal(races.filter(r => r.status === "rejected" && r.reason instanceof GameSaveConflictError).length, 1);
const latest = await a.get(0); assert.equal(latest.record.recordId, captured.recordId); assert.equal(latest.record.writeRevision, 2);
await conflict(a.compareDelete(captured)); assert.deepEqual(await a.get(0), latest); await a.compareDelete(latest.token); assert.equal(await a.get(0), null); assert.equal((await b.get(0)).record.snapshot.marker, 2);
const recreated = await a.put(input("game-a", 0, 8)); assert.equal(recreated.record.writeRevision, 3); assert.notEqual(recreated.record.recordId, latest.record.recordId); await conflict(a.compareDelete(latest.token));
checks.push("competing overwrites one winner / stale delete preserves replacement / atomic own deletion / monotonic recreate ABA");
const fixed = gameSaveMemoryIDB(), fixedStore = create("fixed", fixed, { createRecordId: () => "repeated-fixture-id" });
const fixedOld = await fixedStore.put(input("fixed")); await fixedStore.compareDelete(fixedOld.token); const fixedNew = await fixedStore.put(input("fixed")); assert.equal(fixedOld.record.recordId, fixedNew.record.recordId); assert.equal(fixedNew.record.writeRevision, 2); await conflict(fixedStore.compareDelete(fixedOld.token));
await assert.rejects(fixedStore.put(input("fixed", 1)), /catalog.*identity/); negatives++;
checks.push("even injected repeated recordId cannot revive old token; duplicate active record identity refused");
const beforeBad = memory.records();
for (const [key, value] of [["gameId", "game-b"], ["slot", 1], ["recordId", "other"], ["writeRevision", 999], ["savedReleaseId", "other"], ["bodyDigest", "b".repeat(64)], ["bodyText", "broken JSON"]]) {
  await assert.rejects(a.compareDelete({ ...recreated.token, [key]: value }), TypeError); negatives++;
}
assert.deepEqual(memory.records(), beforeBad);
for (const value of [-1, -0, Infinity, NaN, 1.5, Number.MAX_SAFE_INTEGER + 1, null]) { await assert.rejects(a.get(value), TypeError); negatives++; }
for (const mutation of [v => { v.gameId = "game-b"; }, v => { v.releaseId = ""; }, v => { v.releaseOrdinal = -1; }, v => { v.chapterId = null; }, v => { v.manifestDigest = "invalid"; }, v => { v.snapshot = []; }, v => { v.extra = true; }]) { const v = input(); mutation(v); await assert.rejects(a.put(v), TypeError); negatives++; }
let getterCalls = 0; const accessor = input(); Object.defineProperty(accessor.snapshot, "bad", { enumerable: true, get() { getterCalls++; return 0; } }); await assert.rejects(a.put(accessor), TypeError); negatives++; assert.equal(getterCalls, 0);
for (const value of [undefined, NaN, Infinity, -0, new Uint8Array([1]), new Date(0), () => 0, 1n, Symbol("fixture")]) { const v = input(); v.snapshot.bad = value; await assert.rejects(a.put(v), TypeError); negatives++; }
const cyclic = input(); cyclic.snapshot.self = cyclic.snapshot; await assert.rejects(a.put(cyclic), TypeError); negatives++;
const sparse = input(); sparse.snapshot.array = Array(1); await assert.rejects(a.put(sparse), TypeError); negatives++;
assert.deepEqual(memory.records(), beforeBad);
checks.push("token full identity and digest / invalid headers, lossy JSON, holes, accessors, cycles rejected without save changes");
const rowKey = gameSaveKeys("game-a", 0).record, catalogKey = gameSaveKeys("game-a", 0).catalog;
for (const mutation of [map => { map.get(rowKey).bodyText = map.get(rowKey).bodyText.replace('"marker":8', '"marker":9'); }, map => { map.get(catalogKey).rows[0].releaseId = "wrong"; }, map => { map.get(catalogKey).nextWriteRevision = 1; }, map => { map.delete(rowKey); }, map => { map.delete(catalogKey); }]) {
  const altered = new Map(structuredClone(beforeBad)); mutation(altered); const corrupt = gameSaveMemoryIDB([...altered]); await assert.rejects(create("game-a", corrupt).get(0), /save|catalog/); negatives++; assert.deepEqual(corrupt.records(), [...altered]);
}
checks.push("corrupt body/digest, summary, counter, missing record or catalog fail closed; no repair/clear");
for (const outcome of ["abort", "error"]) for (const failAt of [2, 3, 4]) {
  const failed = gameSaveMemoryIDB(legacy); failed.configure({ outcome, failAt }); await assert.rejects(create("failed", failed).put(input("failed")), /transaction/); negatives++; assert.deepEqual(failed.records(), legacy);
}
const throwing = gameSaveMemoryIDB(legacy); throwing.configure({ throwAt: 3 }); await assert.rejects(create("failed", throwing).put(input("failed")), /request throw/); negatives++; assert.deepEqual(throwing.records(), legacy);
const failingDelete = gameSaveMemoryIDB(); const deleting = create("delete-failure", failingDelete); const oldDelete = await deleting.put(input("delete-failure")), heldDeleteRecords = failingDelete.records(); failingDelete.configure({ failAt: 4 }); await assert.rejects(deleting.compareDelete(oldDelete.token), /transaction/); negatives++; assert.deepEqual(failingDelete.records(), heldDeleteRecords);
checks.push("readwrite abort/error after request success at reads/body/catalog and synchronous request throw; failed delete retains body+summary");
const held = gameSaveMemoryIDB(legacy); held.configure({ holdCommit: true }); let finished = false; const pending = create("held", held).put(input("held")).then(value => { finished = true; return value; });
for (let i = 0; i < 100 && !held.stats.held; i++) await new Promise(resolve => setImmediate(resolve)); assert.equal(held.stats.held, 1); assert.equal(finished, false); assert.deepEqual(held.records(), legacy); held.release(); await pending; assert.equal(finished, true);
await assert.rejects(createGameSaveStore({ gameId: "offline", databaseName: "owned", getIndexedDB: () => null }).get(0), /unavailable/); negatives++;
assert.throws(() => createGameSaveStore({ gameId: "x", databaseName: "owned" }), /explicit/); negatives++;
for (const cause of [null, 0, undefined]) { const store = createGameSaveStore({ gameId: "throwing-adapter", databaseName: "owned", getIndexedDB() { throw cause; } }); assert.equal(await store.get(0).then(() => false, () => true), true); negatives++; }
for (const id of ["", "a\u0000b", "\ud800"]) { assert.throws(() => create(id), TypeError); negatives++; }
checks.push("no success before commit / required explicit adapters / inaccessible DB and malformed opaque identity refused");
assert.equal(implicitIDB, 0); for (const [p, h] of Object.entries(hashes)) assert.equal(sha(p), h);
process.stdout.write(JSON.stringify({ result: "PASS-OPT-IN-GAME-SAVE-STORE-MEMORY", groups: checks.length, negatives, checks, hashes, implicitIDB, limits: "JSON engineering fixtures only; mock serialized; no App/restore/recognized releases/latest/confirmation/delete policy/real user saves" }) + "\n");
