// Owned fixed-imported single-chapter compilation/cache API, no real stores.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { startEditorServer, EDITOR_CHAPTER_BUILD_FORMAT } from "./editor_server.mjs";
import { TRIAL_COMPILER_REVISION } from "../web/src/content/authoring/trialcompile.js";
import { createTrialEnvironment } from "../web/src/content/authoring/trialruntime.js";
import { canonicalDigest, disbandFaction } from "../web/src/content/authoring/gamesource.js";
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
  const originalBadState = structuredClone(draft.chapters[bad].state);
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
  // Q40 product gate: complete native records with ONLY the faction list empty.
  // A bad unrelated chapter must still not contaminate selected-chapter scope.
  const noFactions = await call('/api/draft?game=' + gameId);
  noFactions.chapters[bad].state = structuredClone(originalBadState); noFactions.chapters[bad].state.factions = [];
  noFactions.localModel.draftRevision = '4';
  const noFactionBytes = Buffer.from(JSON.stringify(noFactions)); writeFileSync(path, noFactionBytes);
  for (const body of [{gameId,expectedRevision:'4'}, {gameId,expectedRevision:'4',scope:{kind:'chapter',chapterId:bad}}]) {
    const refusal = await call('/api/compile', body, 400);
    assert.match(JSON.stringify(refusal), /factions must include at least one entry/);
  }
  const healthy = await call('/api/compile', {gameId,expectedRevision:'4',scope:{kind:'chapter',chapterId:first}});
  assert.deepEqual(healthy.chapters, [first]);
  for (const asset of [...healthy.assets, ...healthy.minimapAssets]) {
    assert.equal(asset.sha256, [...whole.assets, ...whole.minimapAssets].find(value => value.assetId === asset.assetId).sha256);
  }
  assert.deepEqual(readFileSync(path), noFactionBytes, 'compile refusal/success must not initialize or rewrite the draft');
  const validationScopes = [];
  for (const [index, [field, value, max]] of [['force', -1, 255], ['force', 0.5, 255], ['force', 256, 255], ['siege', 16, 15], ['faction', 22, null], ['faction', 'duplicate', null], ['native-advisor', null, null], ['native-raw', null, null], ['native-order', null, null], ['native-resource', 'money', null], ['native-resource', 'reserve_cav', null], ['native-resource', 'reserve_arc', null], ['native-resource', 'reserve_inf', null], ['native-tail-disband', null, null]].entries()) {
    const invalid = structuredClone(noFactions), revision = String(5 + index);
    invalid.chapters[bad].state = structuredClone(originalBadState);
    const state = invalid.chapters[bad].state;
    assert.ok(state.factions.length > 0, 'field negative must not fail the empty-faction gate first');
    let expectedError;
    if (field === 'faction') {
      if (value === 'duplicate') state.factions.push(structuredClone(state.factions[0]));
      else state.factions[0].idx = value;
      expectedError = 'faction idx must be unique 0..21';
    } else if (field === 'native-advisor') {
      const faction = state.factions[0]; faction.advisor_idx = faction.advisor_idx === null ? 0 : null;
      expectedError = `faction slot ${faction.idx} advisor_idx differs from native source`;
    } else if (field === 'native-resource') {
      const faction = state.factions[0]; faction[value] = faction[value] === 0 ? 1 : 0;
      expectedError = `faction slot ${faction.idx} ${value} differs from native source`;
    } else if (field === 'native-order') {
      assert.ok(state.factions.length > 1);
      [state.factions[0], state.factions[1]] = [state.factions[1], state.factions[0]];
      expectedError = 'native view order required';
    } else if (field === 'native-tail-disband') {
      const declared = state.n_factions, raw = [...state.nativeFactionSlotRaw];
      disbandFaction(invalid, bad, state.factions.at(-1).idx);
      assert.equal(state.n_factions, declared);
      assert.equal(state.factions.length, declared - 1);
      assert.deepEqual(state.nativeFactionSlotRaw, raw);
      expectedError = 'declared faction count differs from public view length';
    } else if (field === 'native-raw') {
      state.nativeFactionSlotRaw = [];
      expectedError = 'native faction source must contain 22 valid fixed slots';
    } else {
      state.generals[0].ability[field] = value;
      expectedError = `${field} must be an integer in 0..${max}`;
    }
    invalid.localModel.draftRevision = revision;
    const bytes = Buffer.from(JSON.stringify(invalid)); writeFileSync(path, bytes);
    for (const body of [{ gameId, expectedRevision: revision }, { gameId, expectedRevision: revision, scope: { kind: 'chapter', chapterId: bad } }]) {
      const refusal = await call('/api/compile', body, 400);
      assert.ok(JSON.stringify(refusal).includes(expectedError));
      assert.deepEqual(readFileSync(path), bytes, 'field rejection must not clamp or rewrite source');
    }
    const selected = await call('/api/compile', { gameId, expectedRevision: revision, scope: { kind: 'chapter', chapterId: first } });
    assert.deepEqual(selected.chapters, [first]);
    assert.equal(selected.scope.savedSourceDigest, canonicalDigest(invalid, sha));
    for (const asset of [...selected.assets, ...selected.minimapAssets]) {
      assert.equal(asset.sha256, [...whole.assets, ...whole.minimapAssets].find(old => old.assetId === asset.assetId).sha256);
    }
    const selectedPack = await call('/api/trial-pack?' + query(first, revision));
    assert.deepEqual(selectedPack.chapter, invalid.chapters[first].state);
    assert.deepEqual(readFileSync(path), bytes);
    assert.deepEqual(await call('/api/trial-pack?' + query(first)), pack, 'old immutable pack is not replaced by current invalid source');
    validationScopes.push(selected.identity);
  }
  process.stdout.write(JSON.stringify({ result: "PASS-FIXED-CHAPTER-SERVICE", refusals, scopes: [a.identity, b.identity, newer.identity, healthy.identity, ...validationScopes], factionIdentityRejected: true, factionNativeConsistencyRejected: true, tailDisbandCountRejected: true, abilityRepresentationRejected: true, emptyFactionRejected: true, fullCompilationStillBlocked: true, selectedStateUnchanged: true,
    limitations: "local fixed imported scope/cache and shared compiler only; no new initializer/general library/complete asset closure/auth/publication" }) + "\n");
} finally { process.stderr.write("CLOSING OWNED SERVER\n"); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); rmSync(store, { recursive: true, force: true }); }
