// Owned local files + loopback service; same production Trial fresh / JSON restore.
// No native IDB/DOS/SAVE/profile/external network or rules/Clock advancement.
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { startEditorServer } from "./editor_server.mjs";
import { createTrialEnvironment, prepareTrialScenario } from "../web/src/content/authoring/trialruntime.js";
import { prepareScenario, snapshotScenarioAssembly } from "../web/src/game/scenarioassembly.js";
import { snapshotState, admitSavedScenario, restoreSnapshotState } from "../web/src/game/savegame.js";
import { Clock } from "../web/src/game/clock.js";
import { createOriginalBattleRng } from "../web/src/game/battle/originalrng.js";
const sha = bytes => createHash("sha256").update(bytes).digest("hex"), store = mkdtempSync(join(tmpdir(), "chapter-resources-"));
const originalFetch = globalThis.fetch, priorIDB = Object.getOwnPropertyDescriptor(globalThis, "indexedDB"); let implicitIDB = 0, negatives = 0, release;
Object.defineProperty(globalThis, "indexedDB", { configurable: true, get() { implicitIDB++; throw new Error("IDB forbidden"); } });
const server = await startEditorServer(0, store), base = `http://127.0.0.1:${server.address().port}`, allowed = new Set(), requests = [], checks = [];
const fields = ["money", "reserve_cav", "reserve_arc", "reserve_inf"];
async function call(path, body, expected = 200) {
  const response = await originalFetch(base + path, { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json", connection: "close" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json(); if (expected === null) return { status: response.status, data };
  assert.equal(response.status, expected, path + ": " + JSON.stringify(data).slice(0, 180)); return data;
}
function assetFetch(pack, pause = async () => {}) {
  for (const asset of pack.manifest.assets) allowed.add(asset.url);
  globalThis.fetch = async input => {
    const url = String(input); assert.ok(allowed.has(url), url); requests.push(url); await pause(url);
    const response = await originalFetch(base + url, { headers: { connection: "close" } }); assert.equal(response.status, 200); return response;
  };
}
const draftURL = "/api/draft?game=resource-api", disk = () => readFileSync(join(store, "resource-api", "gamesource.json"));
const scope = chapterId => ({ kind: "chapter", chapterId }), packURL = (revision, chapter, scoped = true) => "/api/trial-pack?" + new URLSearchParams({ game: "resource-api", revision, chapter, ...(scoped ? { scope: "chapter" } : {}) });
try {
  await call("/api/copy", { gameId: "resource-api", ownerId: "fixture-not-auth", kind: "full" });
  let saved = await call(draftURL), revision = saved.localModel.draftRevision;
  const first = saved.chapterOrder[0]; await call("/api/compile", { gameId: saved.gameId, expectedRevision: revision, scope: scope(first) });
  const oldPack = await call(packURL(revision, first)), oldText = JSON.stringify(oldPack), oldFile = readFileSync(join(store, "resource-api", "build", revision, oldPack.manifest.compilerRevision, "studio-chapter-1", sha(first), "snapshot.json"));
  // Install the observation gate before this process's first production asset load.
  let started; const waiting = new Promise(resolve => { started = resolve; }), gate = new Promise(resolve => { release = resolve; });
  assetFetch(oldPack, async url => { if (url.includes("asset=roadGraph")) { started(); await gate; } });
  const delayed = prepareTrialScenario(oldPack); await waiting;
  for (const chapterId of saved.chapterOrder) {
    const before = await call(draftURL), row = before.chapters[chapterId].state.factions[0], values = Object.fromEntries(fields.map(name => [name, row[name] + 1]));
    const result = await call("/api/chapter-resources", { gameId: saved.gameId, expectedRevision: revision, chapterId, slot: 0, values });
    assert.equal(result.changed, true); revision = result.draftRevision; saved = await call(draftURL);
    if (chapterId === first) {
      release(); release = undefined; const late = await delayed;
      for (const name of fields) assert.equal(late.scenario.factions[0][name], oldPack.chapter.factions[0][name]);
    }
    assert.equal(saved.sourceRef.digest, before.sourceRef.digest); assert.deepEqual(saved.sourceRecords, before.sourceRecords); assert.deepEqual(saved.map, before.map);
    for (const other of saved.chapterOrder) if (other !== chapterId) assert.deepEqual(saved.chapters[other], before.chapters[other]);
  }
  // Compile the exact full saved revision once. Fetch its four immutable native blobs
  // once with independent SHA/length checks; all20 independent worlds consume those bytes.
  await call("/api/compile", { gameId: saved.gameId, expectedRevision: revision });
  const firstPack = await call(packURL(revision, first, false)), nativeBytes = new Map(), assetHashes = {}, memoryRequests = [];
  for (const asset of firstPack.manifest.assets) {
    const response = await originalFetch(base + asset.url, { headers: { connection: "close" } }); assert.equal(response.status, 200);
    const bytes = Buffer.from(await response.arrayBuffer()); assert.equal(bytes.length, asset.byteLength); assert.equal(sha(bytes), asset.sha256);
    nativeBytes.set(asset.url, bytes); assetHashes[asset.url] = sha(bytes); requests.push(asset.url);
  }
  globalThis.fetch = async input => { const url = String(input); assert.ok(nativeBytes.has(url), url); memoryRequests.push(url); return new Response(nativeBytes.get(url)); };
  for (const chapterId of saved.chapterOrder) {
    const pack = chapterId === first ? firstPack : await call(packURL(revision, chapterId, false)), values = saved.chapters[chapterId].state.factions[0];
    assert.deepEqual(pack.manifest, firstPack.manifest); assert.deepEqual(pack.chapter, saved.chapters[chapterId].state);
    const fresh = await prepareTrialScenario(pack), sc = fresh.scenario;
    assert.equal(sc.factions[0], sc.nativeFactionSlots.records[0]); for (const name of fields) assert.equal(sc.factions[0][name], values[name]);
    const clock = new Clock({ startYear: sc.start.year, startMonth: sc.start.month, startDay: sc.start.day }), rng = createOriginalBattleRng({ ch: 1, cl: 2, dh: 3 });
    const app = { ...fresh, scenarioIdx: 0, clock, originalRng: rng, data: { scenarios: [pack.chapter] } }, rngBefore = rng.snapshot(), snapshot = snapshotState(app, 0, "工程資源夾具");
    const text = JSON.stringify(snapshot); let json; try { json = JSON.parse(text); } catch (cause) { throw new Error("invalid owned snapshot JSON", { cause }); }
    const cold = createTrialEnvironment(pack), admitted = admitSavedScenario(json, { data: app.data, content: cold.content, world: cold.world });
    const restored = await prepareScenario({ ...admitted, content: cold.content, world: cold.world, mode: "restore" });
    assert.equal(restored.scenario.factions[0], restored.scenario.nativeFactionSlots.records[0]); for (const name of fields) assert.equal(restored.scenario.factions[0][name], values[name]);
    // Public restore materializes already-saved sidecar fields (e.g. _extinctionHandled).
    assert.deepEqual(restored.scenario.nativeFactionSlots, restoreSnapshotState(json).nativeFactionSlots); assert.deepEqual(restored.scenario.nativeLegionSlots, sc.nativeLegionSlots);
    const coldSnapshot = snapshotState({ ...app, scenario: restored.scenario, content: cold.content, world: cold.world }, 0, snapshot.label);
    assert.deepEqual(coldSnapshot.webMeta, snapshot.webMeta); assert.deepEqual(restoreSnapshotState(coldSnapshot), restoreSnapshotState(json));
    assert.deepEqual(snapshotScenarioAssembly({ ...app, scenario: restored.scenario, world: cold.world, content: cold.content }), snapshotScenarioAssembly(app));
    assert.deepEqual(rng.snapshot(), rngBefore); assert.equal(clock.strategicTickSerial, 0);
    checks.push({ chapterId, revision, result: "SAVED-COMPILED-FRESH-JSON-COLD-RESOURCES", fixedTableAliases: true });
  }
  const noopBefore = disk(), currentRow = saved.chapters[first].state.factions[0];
  const noop = await call("/api/chapter-resources", { gameId: saved.gameId, expectedRevision: revision, chapterId: first, slot: 0, values: { money: currentRow.money } });
  assert.equal(noop.changed, false); assert.equal(noop.draftRevision, revision); assert.deepEqual(disk(), noopBefore);
  const valid = { gameId: saved.gameId, expectedRevision: revision, chapterId: first, slot: 0, values: { money: currentRow.money + 1 } };
  for (const patch of [{ expectedRevision: "1" }, { chapterId: "missing" }, { slot: 22 }, { values: {} }, { values: { capital: 0 } }, { values: { money: null } }, { values: { reserve_cav: 65536 } }, { values: { money: 0x800000 } }, { extra: true }]) {
    const before = disk(); await call("/api/chapter-resources", { ...valid, ...patch }, 400); negatives++; assert.deepEqual(disk(), before);
  }
  await call("/api/copy", { gameId: "resource-minimal", kind: "minimal" });
  await call("/api/chapter-resources", { ...valid, gameId: "resource-minimal", expectedRevision: "1" }, 400); negatives++;
  await call("/api/chapter-resources", { ...valid, gameId: "wolong-builtin" }, 400); negatives++;
  // Single-process competing writes: exactly one captured revision wins, no automatic retry.
  const results = await Promise.all([call("/api/chapter-resources", valid, null), call("/api/chapter-resources", { ...valid, values: { money: currentRow.money + 2 } }, null)]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 400]); assert.equal(results.find(result => result.status === 200).data.changed, true);
  negatives++;
  assert.equal(JSON.stringify(oldPack), oldText); assert.deepEqual(readFileSync(join(store, "resource-api", "build", "1", oldPack.manifest.compilerRevision, "studio-chapter-1", sha(first), "snapshot.json")), oldFile);
  assert.deepEqual(await call(packURL("1", first)), oldPack); assert.equal(implicitIDB, 0);
  const toolHashes = Object.fromEntries(["tools/verify_editor_chapter_resources_api.mjs", "tools/editor_server.mjs", "web/src/editor/chapterresources.js", "web/src/content/authoring/trialcompile.js", "web/src/content/authoring/trialruntime.js", "web/src/game/nativefactions.js"].map(path => [path, sha(readFileSync(new URL("../" + path, import.meta.url)))]));
  process.stdout.write(JSON.stringify({ result: "PASS-LOCAL-CHAPTER-RESOURCE-API", chapters: 20, negatives, checks, implicitIDB, oldImmutableSnapshot: true, noOpDiskUnchanged: true, requests, memoryRequests, assetHashes, toolHashes, limits: "Only existing full-copy chapters and current slot0 edits; no UI/auth/durable CAS/formal release/high-value rule domain/role initialization/full campaign. Actual fresh and JSON restore, 0ticks, no IDB." }, null, 2) + "\n");
} finally { release?.(); globalThis.fetch = originalFetch; if (priorIDB) Object.defineProperty(globalThis, "indexedDB", priorIDB); else delete globalThis.indexedDB; await new Promise(resolve => server.close(resolve)); }
