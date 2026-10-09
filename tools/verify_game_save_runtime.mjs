// Direct native strategic callee trace, NOT App/Clock/hour/month/battle certification.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gameSaveFixture } from './gamesavefixture.mjs';
import { gameSaveMemoryIDB } from './gamesave_mock.mjs';
import { aiTick } from '../web/src/game/ai.js';
import { snapshotState, admitSavedScenario, restoreSnapshotState } from '../web/src/game/savegame.js';
import { prepareScenario } from '../web/src/game/scenarioassembly.js';
import { Clock } from '../web/src/game/clock.js';
import { createOriginalBattleRng } from '../web/src/game/battle/originalrng.js';
import { saveJSON } from '../web/src/core/gamesavecodec.js';
import { createGameSaveStore } from '../web/src/core/gamesavestore.js';
import { createGameSaveExchange } from '../web/src/core/gamesaveexchange.js';
const root = new URL('../', import.meta.url), hash = bytes => createHash('sha256').update(bytes).digest('hex'), toolHashes = {};
// Bounded lexical static-relative import inventory, not indirect-call/dependency closure proof.
function inventory(path) {
  if (Object.hasOwn(toolHashes, path)) return;
  assert.match(path, /^(web\/src|tools)\/[^:]+\.m?js$/);
  const bytes = readFileSync(new URL(path, root)); toolHashes[path] = hash(bytes);
  for (const match of bytes.toString('utf8').matchAll(/\bfrom\s*['"](\.[^'"]+)['"]/g)) {
    const next = new URL(match[1], new URL(path, root)); assert.ok(next.href.startsWith(new URL('web/src/', root).href) || next.href.startsWith(new URL('tools/', root).href));
    inventory(decodeURIComponent(next.href.slice(root.href.length)));
  }
}
inventory('tools/verify_game_save_runtime.mjs');
function attach(app) {
  app.gamebar = { syncClock() { if (app._strategicCityRequest || app._strategicBattleFailure || app._legionSlotBatch) app.clock.hold = true; },
    enqueueTalkMessage() { throw new Error('Trace reached real UI return boundary; cannot fake completion'); } };
  return app;
}
function steps(app) {
  const trace = [];
  for (let tick = 0; tick < 8; tick++) {
    const cityIndex = app.scenario._cityTickCursor ?? 0, legionBatchStart = app.scenario._legionBatchCursor ?? 0;
    const outcome = aiTick(app, { cityIndex, legionBatchStart, hour: app.clock.hour, runFactionTick: false });
    assert.equal(outcome, 'returned'); assert.equal(app._strategicBattleFailure ?? null, null);
    assert.equal(app._strategicCityRequest ?? null, null); assert.equal(app._legionSlotBatch ?? null, null);
    trace.push({ cityIndex, legionBatchStart, rngCalls: app.originalRng.snapshot().calls });
  }
  return trace;
}
function equalRecovered(a, b) {
  // Runtime sidecar is authoritative; public applyWebMeta may materialize its explicit
  // fields into state on restore. Do NOT alter inputs or discard arbitrary differences.
  assert.equal(hash(saveJSON(a.webMeta)), hash(saveJSON(b.webMeta)), 'full sidecar/RNG/capability divergence');
  try { assert.deepEqual(restoreSnapshotState(a), restoreSnapshotState(b)); }
  catch { throw new Error('Full common recovered state diverged'); }
  for (const field of ['slot', 'label', 'played', 'scenario_idx']) assert.equal(a[field], b[field]);
}
const fixture = gameSaveFixture(), fetchBefore = globalThis.fetch, idbBefore = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
let implicitIDB = 0, negativeControls = 0; const checks = [];
globalThis.fetch = fixture.fetch; Object.defineProperty(globalThis, 'indexedDB', { configurable: true, get() { implicitIDB++; throw new Error('native IDB forbidden'); } });
try {
  for (let idx = 0; idx < 20; idx++) {
    const { app } = await fixture.snapshot(idx); attach(app); const initialRng = app.originalRng.snapshot(), initial = saveJSON(snapshotState(app, 0, '有限運行入口'));
    const prefix = steps(app), saved = snapshotState(app, 0, '有限運行入口'), text = saveJSON(saved); assert.notEqual(text, initial); assert.ok(app.originalRng.snapshot().calls > initialRng.calls);
    assert.equal(app.scenario._cityTickCursor, 8); assert.equal(app.scenario._legionBatchCursor, 0); assert.equal(app.clock.strategicTickSerial, 0);
    const gameId = 'runtime-engineering-' + idx, memory = gameSaveMemoryIDB(), store = createGameSaveStore({ gameId, databaseName: 'owned-runtime-memory', getIndexedDB: () => memory.indexedDB, createRecordId: () => gameId });
    const identity = { gameId, releaseId: 'fixture-not-published', releaseOrdinal: 0, chapterId: app.content.chapter(idx).id, manifestDigest: fixture.manifestDigest };
    await store.put({ ...identity, slot: 0, snapshot: saved }); const got = await store.get(0); assert.deepEqual(got.record.snapshot, saved);
    const exchange = createGameSaveExchange({ identity, context: fixture.context() }), backup = await exchange.encode(got.record), decoded = await exchange.decode(backup);
    assert.deepEqual(decoded.input.snapshot, saved); assert.equal(saveJSON(snapshotState(app, 0, saved.label)), text);
    const context = fixture.context(), admitted = admitSavedScenario(decoded.input.snapshot, context), ready = await prepareScenario({ ...admitted, ...context, mode: 'restore' });
    const date = saved.state.save_date, clock = new Clock({ startYear: date.year, startMonth: date.month, startDay: date.day }); clock.sub = saved.state.save_sub; clock.hour = saved.state.save_hour;
    const cold = attach({ ...context, scenario: ready.scenario, scenarioIdx: idx, clock, originalRng: createOriginalBattleRng({ ch: 9, cl: 8, dh: 7 }).restore(saved.webMeta.originalRng) });
    const coldCaptured = snapshotState(cold, 0, saved.label); equalRecovered(coldCaptured, saved);
    const sourceBeforeContinuation = structuredClone(memory.records()), hotTrace = steps(app), coldTrace = steps(cold); assert.deepEqual(coldTrace, hotTrace);
    const hot = snapshotState(app, 0, saved.label), resumed = snapshotState(cold, 0, saved.label); equalRecovered(resumed, hot);
    assert.equal(app.scenario._cityTickCursor, 16); assert.equal(cold.scenario._cityTickCursor, 16);
    assert.deepEqual(cold.originalRng.snapshot(), app.originalRng.snapshot()); assert.deepEqual(memory.records(), sourceBeforeContinuation); assert.deepEqual(memory.stats.deletes, []);
    assert.equal(clock.strategicTickSerial, 0); assert.equal(app.clock.strategicTickSerial, 0);
    const failureRng = app.originalRng.snapshot();
    const report = console.error, reports = []; // Only this deliberately invalid call; restore even on error.
    console.error = (...args) => reports.push(args);
    try { assert.equal(aiTick(app, { cityIndex: 192, legionBatchStart: 0, hour: app.clock.hour, runFactionTick: false }), 'failed'); }
    finally { console.error = report; }
    assert.equal(reports.length, 1); assert.equal(reports[0][0], '[wolong] strategic update failed; clock held');
    assert.ok(reports[0][1] instanceof RangeError); assert.equal(reports[0][1].message, 'Uncovered city cursor at 3EFD');
    assert.ok(app._strategicBattleFailure); assert.equal(app.clock.hold, true); assert.throws(() => snapshotState(app, 0, saved.label)); negativeControls++;
    assert.deepEqual(app.originalRng.snapshot(), failureRng); assert.deepEqual(memory.records(), sourceBeforeContinuation);
    checks.push({ idx, prefix, continuation: hotTrace, capturedSha: hash(text), continuedSha: hash(saveJSON(hot)), fullCommonRecoveredStateAndSidecarRngEqual: true, storedCapturedRecordUnchanged: true, invalidCityCursorHoldAndSaveRefused: true });
  }
} finally { globalThis.fetch = fetchBefore; if (idbBefore) Object.defineProperty(globalThis, 'indexedDB', idbBefore); else delete globalThis.indexedDB; }
assert.equal(implicitIDB, 0); assert.equal(negativeControls, 20); fixture.verify(); for (const [path, digest] of Object.entries(toolHashes)) assert.equal(hash(readFileSync(new URL(path, root))), digest, path);
process.stdout.write(JSON.stringify({ result: 'PASS-DIRECT-STRATEGIC-TRACE-SAVE-CONTINUATION', chapters: 20, stepsBeforeSave: 8, pairedStepsAfterRestore: 8, negativeControls, implicitIDB, inputHashes: fixture.inputHashes, toolHashes, checks,
  limits: 'Current20 engineering fresh scenario only. Direct production aiTick same city/batch/hour arguments, no full App initialization/diplomacy/actual Clock advancement/hour/month/active legion/battle/message return/CPU equivalence. Clock serial remains0 intentionally; rule callee does consume RNG and modify native state. Tuple not formal release evidence, no native storage/UI/install/delete. Full restored semantics and full sidecar equal, not raw resnapshot byte equality: existing applyWebMeta materializes explicit runtime-sidecar fields. Original captured JSON preserved. Lexical import inventory not all indirect consumers.' }, null, 2) + '\n');
