// Only two fixed sources, in-memory browser/compile doubles, no IO/network/rules.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { launchListTrial } from "../web/src/editor/listtrial.js";
const paths = ["tools/verify_editor_list_trial.mjs", "web/src/editor/listtrial.js"];
const hashes = () => Object.fromEntries(paths.map((p) => [p, createHash("sha256").update(readFileSync(p)).digest("hex")]));
const before = hashes(); let checks = 0, negatives = 0, idb = 0;
Object.defineProperty(globalThis, "indexedDB", { configurable: true, get() { idb++; throw new Error("formal IDB forbidden"); } });
const binding = { gameId: "local", draftRevision: "9007199254740993", chapterId: "local#章?&" };
function manifest() { return { identity: { gameId: binding.gameId, draftRevision: binding.draftRevision }, scope: { kind: "chapter", chapterId: binding.chapterId }, chapters: [binding.chapterId], visualAssets: {} }; }
function child() { return { closed: false, opener: {}, locations: [], closeCount: 0, location: { replace(url) { this.owner.locations.push(url); } }, close() { this.closeCount++; this.closed = true; } }; }
function windowFixture() { const win = child(); win.location.owner = win; return win; }
let resolve; const win = windowFixture(), calls = [], order = [];
const input = { ...binding };
const pending = launchListTrial(input, { openWindow: (...args) => { order.push("open"); assert.deepEqual(args, ["/trial-wait", "_blank"]); return win; }, compile: (body) => { order.push("compile"); calls.push(body); return new Promise((r) => { resolve = r; }); } });
assert.deepEqual(order, ["open", "compile"]); assert.equal(win.opener, null); assert.deepEqual(calls, [{ gameId: binding.gameId, expectedRevision: binding.draftRevision, scope: { kind: "chapter", chapterId: binding.chapterId } }]); checks++;
input.gameId = "later"; input.chapterId = "later"; input.draftRevision = "1"; resolve(manifest());
assert.deepEqual(await pending, { result: "opened", ...binding }); const target = new URL(win.locations[0], "https://owned.invalid");
assert.equal(target.origin, "https://owned.invalid"); assert.equal(target.pathname, "/trial-app"); assert.deepEqual(Object.fromEntries(target.searchParams), { game: binding.gameId, revision: binding.draftRevision, chapter: binding.chapterId, scope: "chapter" }); assert.equal(win.closeCount, 0); checks++;
assert.deepEqual(await launchListTrial(binding, { openWindow: () => null, compile: () => { throw new Error("must not compile blocked popup"); } }), { result: "blocked" }); checks++;
for (const mutate of [
  (m) => { m.identity.gameId = "other"; }, (m) => { m.identity.draftRevision = "1"; }, (m) => { m.identity.draftRevision = Number(binding.draftRevision); },
  (m) => { m.scope.kind = "whole"; }, (m) => { m.scope.chapterId = "other"; }, (m) => { delete m.scope; },
  (m) => { m.chapters = ["other"]; }, (m) => { m.chapters.push("other"); }, (m) => { m.visualAssets = null; },
]) { const w = windowFixture(), m = manifest(); mutate(m); await assert.rejects(launchListTrial(binding, { openWindow: () => w, compile: async () => m })); assert.deepEqual(w.locations, []); assert.equal(w.closeCount, 1); negatives++; }
for (const bad of [null, { ...binding, gameId: "" }, { ...binding, chapterId: "" }, { ...binding, draftRevision: 1 }, { ...binding, draftRevision: "0" }, { ...binding, draftRevision: "01" }]) {
  await assert.rejects(launchListTrial(bad, { openWindow: () => { throw new Error("must not open invalid binding"); }, compile: async () => manifest() }), TypeError); negatives++;
}
for (const reason of [new Error("stale compile revision"), new Error("transport failed")]) { const w = windowFixture(); await assert.rejects(launchListTrial(binding, { openWindow: () => w, compile: async () => { throw reason; } }), (e) => e === reason); assert.equal(w.closeCount, 1); checks++; }
const closed = windowFixture(); closed.closed = true; await assert.rejects(launchListTrial(binding, { openWindow: () => closed, compile: async () => manifest() }), /已關閉/); assert.equal(closed.closeCount, 0); assert.deepEqual(closed.locations, []); checks++;
const cleanupFails = windowFixture(), original = new Error("compile failed"); cleanupFails.close = () => { throw new Error("cleanup failed"); };
await assert.rejects(launchListTrial(binding, { openWindow: () => cleanupFails, compile: async () => { throw original; } }), (e) => e === original); checks++;
assert.equal(idb, 0); assert.deepEqual(hashes(), before);
process.stdout.write(JSON.stringify({ result: "PASS-LOCAL-LIST-TRIAL-LAUNCHER", checks, negatives, idb, hashes: before, limits: "Client fixed binding/gesture/cleanup only, not authentication/full manifest/asset closure/native-close guarantee" }) + "\n");
