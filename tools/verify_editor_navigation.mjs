// Fixed two-source fingerprints + pure in-memory local routing/DTO; no network/SAVE/profile.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { editorNavigationURL, editorNavigationChoice, editableNavigationGames } from "../web/src/editor/navigation.js";
const paths = ["tools/verify_editor_navigation.mjs", "web/src/editor/navigation.js"], sha = b => createHash("sha256").update(b).digest("hex");
const hashes = Object.fromEntries(paths.map(p => [p, sha(readFileSync(p))]));
let idb = 0, checks = 0, negatives = 0;
Object.defineProperty(globalThis, "indexedDB", { configurable: true, get() { idb++; throw new Error("formal IDB forbidden"); } });
function check(fn) { fn(); checks++; }
check(() => { assert.equal(editorNavigationURL("games"), "/"); for (const key of ["map", "sources"]) assert.throws(() => editorNavigationURL(key)); });
check(() => { for (const [key, path] of [["games","/"],["map","/studio"],["sources","/entities"]]) {
  const id = "own game?chapter=x&game=y/#漢字", url = editorNavigationURL(key, id);
  assert.equal(url.split("?")[0], path); const query = new URLSearchParams(url.slice(url.indexOf("?")+1)); assert.equal(query.get("game"), id); assert.deepEqual([...query.keys()], ["game"]);
  assert.equal(editorNavigationChoice(key, id, id), null); assert.equal(editorNavigationChoice(key, "other", id), url);
} });
check(() => { const records = [{ gameId:"own", editable:true, metadata:{name:"<img src=x>"} },{gameId:"readonly",editable:false},{gameId:"broken",editable:true,error:"bad"},{gameId:"no-claim"}];
  const original = JSON.stringify(records), list = editableNavigationGames(records); assert.deepEqual(list,[{gameId:"own",name:"<img src=x>"}]); assert.ok(Object.isFrozen(list)&&Object.isFrozen(list[0])); assert.equal(JSON.stringify(records), original);
  assert.deepEqual(editableNavigationGames([{gameId:"fallback",editable:true,metadata:{name:42}}]),[{gameId:"fallback",name:"fallback"}]);
});
for (const fn of [() => editorNavigationURL("https://invalid.example"),() => editorNavigationURL("__proto__","own"),() => editorNavigationURL("map",""),() => editorNavigationURL("map",42),() => editorNavigationURL("map","x".repeat(257)),() => editorNavigationChoice("map","own",null),() => editableNavigationGames(null),() => editableNavigationGames([null]),() => editableNavigationGames([{gameId:null}]),() => editableNavigationGames([{gameId:42}]),() => editableNavigationGames([{gameId:"same",editable:false},{gameId:"same",editable:true}])]) { assert.throws(fn); negatives++; }
check(() => { assert.equal(idb,0); for(const[p,h]of Object.entries(hashes))assert.equal(sha(readFileSync(p)),h); });
delete globalThis.indexedDB;
process.stdout.write(JSON.stringify({result:"PASS-LOCAL-EDITOR-NAVIGATION-PURE",checks,negatives,idbAccesses:idb,hashes,limits:"Pure local paths/DTO only, no DOM/source loading/auth or permission certification"})+"\n");
