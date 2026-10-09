// Owned fixed-imported single-chapter compilation/cache API, no real stores.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { startEditorServer, EDITOR_CHAPTER_BUILD_FORMAT } from "./editor_server.mjs";
import { TRIAL_COMPILER_REVISION } from "../web/src/content/authoring/trialcompile.js";
import { createTrialEnvironment } from "../web/src/content/authoring/trialruntime.js";
import { canonicalDigest } from "../web/src/content/authoring/gamesource.js";
const store = mkdtempSync(join(tmpdir(), "dragon-chapter-api-")), server = await startEditorServer(0, store), origin = `http://127.0.0.1:${server.address().port}`;
process.stderr.write("OWNED STORE " + store + "\n");
const sha = b => createHash("sha256").update(b).digest("hex");
let refusals = 0;
async function call(path, body, expected = 200) {
  const init = { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json", connection: "close" }, signal: AbortSignal.timeout(120000) };
  if (body !== undefined) init.body = JSON.stringify(body);
  process.stderr.write("BEGIN " + path + "\n");
  const r = await fetch(origin + path, init);
  process.stderr.write("END " + path + " HTTP " + r.status + "\n");
  assert.equal(r.status, expected, path); const data = await r.json(); if (expected !== 200) refusals++; return data;
}
function parse(b) { try { return JSON.parse(b.toString()); } catch (cause) { throw new Error("invalid owned chapter fixture", { cause }); } }
try {
  const gameId = "chapter-api";
  await call("/api/copy", { gameId, ownerId: "local", kind: "full" });
  const draft = await call("/api/draft?game=" + gameId), [first, bad, second] = draft.chapterOrder;
  const whole = await call("/api/compile", { gameId });
  const path = join(store, gameId, "gamesource.json");
  draft.chapters[bad].state = {}; draft.localModel.draftRevision = "2";
  writeFileSync(path, JSON.stringify(draft)); const savedBytes = readFileSync(path);
  await call("/api/compile", { gameId, expectedRevision: "2" }, 400);
  const request = id => ({ gameId, expectedRevision: "2", scope: { kind: "chapter", chapterId: id } });
  const a = await call("/api/compile", request(first)), b = await call("/api/compile", request(second));
  assert.equal(a.buildFormat, EDITOR_CHAPTER_BUILD_FORMAT); assert.equal(a.scope.savedSourceDigest, canonicalDigest(draft, sha));
  assert.equal(a.identity.savedSourceDigest, a.scope.savedSourceDigest); assert.equal(a.scope.selectedSourceDigest, a.identity.sourceDigest);
  assert.deepEqual(a.chapters, [first]); assert.deepEqual(b.chapters, [second]); assert.notEqual(a.identity.trialSnapshotId, b.identity.trialSnapshotId);
  for (const m of [a, b]) for (const asset of [...m.assets, ...m.minimapAssets]) {
    const old = [...whole.assets, ...whole.minimapAssets].find(v => v.assetId === asset.assetId); assert.equal(asset.sha256, old.sha256);
    const r = await fetch(origin + asset.url, { headers: { connection: "close" } }); assert.equal(r.status, 200); assert.equal(sha(Buffer.from(await r.arrayBuffer())), asset.sha256);
    assert.ok(asset.url.includes("&scope=chapter&chapter="));
  }
  const query = (id, rev = "2") => new URLSearchParams({ game: gameId, revision: rev, chapter: id, scope: "chapter" });
  const pack = await call("/api/trial-pack?" + query(first));
  assert.deepEqual(pack.chapter, draft.chapters[first].state); const env = createTrialEnvironment(pack, { fullApp: true }); assert.equal(env.identity.savedSourceDigest, a.scope.savedSourceDigest);
  assert.deepEqual(await call("/api/compile", request(first)), a);
  await call("/api/compile", request(bad), 400);
  await call("/api/compile", { ...request(first), expectedRevision: "1" }, 400);
  await call("/api/compile", request("missing"), 400);
  await call("/api/compile", { gameId, scope: { kind: "all", chapterId: first } }, 400);
  await call("/api/compile", { gameId, scope: { kind: "chapter", chapterId: first, unknown: 1 } }, 400);
  await call("/api/trial-pack?" + query(first).toString().replace("scope=chapter", "scope=other"), undefined, 400);
  await call("/api/trial-pack?" + new URLSearchParams({ game: gameId, revision: "2", chapter: first }), undefined, 400); // no whole2 fallback
  await call(a.assets[0].url.replace(a.identity.sourceDigest, b.identity.sourceDigest), undefined, 400);
  await call(a.assets[0].url.replace(encodeURIComponent(first), "missing"), undefined, 400);
  for (const mutate of [p => { p.manifest.scope.savedSourceDigest = "0".repeat(64); }, p => { p.manifest.scope.chapterId = second; }, p => { p.manifest.assets[0].url = whole.assets[0].url; }, p => { p.manifest.minimapAssets[0].url = b.minimapAssets[0].url; }]) {
    const copy = structuredClone(pack); mutate(copy); assert.throws(() => createTrialEnvironment(copy, { fullApp: true })); refusals++;
  }
  const dir = join(store, gameId, "build", "2", TRIAL_COMPILER_REVISION, EDITOR_CHAPTER_BUILD_FORMAT, sha(first));
  for (const [file, mutate] of [["manifest.json", value => { value.scope.savedSourceDigest = "0".repeat(64); }], ["manifest.json", value => { value.assets[0].url = whole.assets[0].url; }], ["saved-source.json", value => { value.metadata.name = "Altered"; }]]) {
    const target = join(dir, file), bytes = readFileSync(target), value = parse(bytes); mutate(value); writeFileSync(target, JSON.stringify(value));
    try { await call("/api/trial-pack?" + query(first), undefined, 400); } finally { writeFileSync(target, bytes); }
  }
  const altered = structuredClone(draft); altered.metadata.name = "Delta"; writeFileSync(path, JSON.stringify(altered));
  try { await call("/api/compile", request(first), 400); assert.deepEqual(await call("/api/trial-pack?" + query(first)), pack); } finally { writeFileSync(path, savedBytes); }
  const shared = structuredClone(draft); shared.map.bounds.width = 385; shared.localModel.draftRevision = "3"; writeFileSync(path, JSON.stringify(shared));
  try { await call("/api/compile", { ...request(first), expectedRevision: "3" }, 400); } finally { writeFileSync(path, savedBytes); }
  await call("/api/metadata", { gameId, expectedRevision: "2", metadata: { name: "Scoped", introduction: "" } });
  assert.deepEqual(await call("/api/trial-pack?" + query(first)), pack); // never latest draft
  const newer = await call("/api/compile", { gameId, expectedRevision: "3", scope: { kind: "chapter", chapterId: first } });
  assert.notEqual(newer.identity.trialSnapshotId, a.identity.trialSnapshotId);
  assert.deepEqual(await call("/api/trial-pack?" + query(first, "3")), { ...pack, manifest: newer });
  process.stdout.write(JSON.stringify({ result: "PASS-FIXED-CHAPTER-SERVICE", refusals, scopes: [a.identity, b.identity, newer.identity], fullCompilationStillBlocked: true, selectedStateUnchanged: true,
    limitations: "local fixed imported scope/cache and shared compiler only; no new initializer/general library/complete asset closure/auth/publication" }) + "\n");
} finally { process.stderr.write("CLOSING OWNED SERVER\n"); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); rmSync(store, { recursive: true, force: true }); }
