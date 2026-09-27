// Characterization of Web 0.1.1, NOT independent proof of DOS correctness.
// Reads generated Web assets only; no network, browser/profile or DOS files.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createContentCatalog } from '../web/src/content/catalog.js';
import { createNewGameScenario } from '../web/src/game/world.js';
import { createWorldResources } from '../web/src/game/worldresources.js';
import { prepareScenario, readSavedAssembly } from '../web/src/game/scenarioassembly.js';
import { snapshotState, restoreSnapshotState } from '../web/src/game/savegame.js';
import { OriginalBattleRng } from '../web/src/game/battle/originalrng.js';
import { LegionSlotBatch } from '../web/src/game/legionscheduler.js';

const digest = (value) => createHash('sha256').update(value).digest('hex');
function parse(text) {
  try { return JSON.parse(text); }
  catch (cause) { throw new Error('Invalid baseline JSON', { cause }); }
}
const json = (value) => parse(JSON.stringify(value));
const hashState = (value) => digest(JSON.stringify(value));
const paths = ['content/builtin/catalog.json', 'data.json', 'road_graph.json',
  'mmap_map.bin', 'road_cost.bin', 'road_offset.json'];
const bytes = new Map(await Promise.all(paths.map(async (path) =>
  [path, await readFile(new URL(`../web/${path}`, import.meta.url))])));
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  const value = bytes.get(String(url));
  assert.ok(value, `unexpected baseline resource: ${url}`);
  return { ok: true, json: async () => parse(value.toString()),
    arrayBuffer: async () => Uint8Array.from(value).buffer };
};
let result;
try {
  const content = createContentCatalog(parse(bytes.get(paths[0])), parse(bytes.get(paths[1])));
  const world = createWorldResources();
  const chapters = [];
  for (const chapter of content.chapters) {
    const idx = chapter.legacyScenarioIndex;
    const raw = createNewGameScenario(chapter.template, 0, null);
    const prepared = await prepareScenario({ raw, idx, content, world, mode: 'fresh' });
    const app = { scenario: prepared.scenario, scenarioIdx: idx, content, world,
      clock: { year: 190, month: 1, day: 1, hour: 0, sub: 0 },
      originalRng: new OriginalBattleRng({ ch: 0x12, cl: 0x34, dh: 0x56 }) };
    const saved = json(snapshotState(app, 0, 'baseline'));
    const restored = await prepareScenario({ raw: restoreSnapshotState(saved), idx, content, world,
      mode: 'restore', ...readSavedAssembly(saved) });
    const again = json(snapshotState({ ...app, scenario: restored.scenario }, 0, 'baseline'));
    // Restore currently materializes sidecar defaults into state. Capture both
    // representations rather than silently fixing this pre-existing contract.
    chapters.push({ id: chapter.id, fresh: hashState(raw), snapshot: hashState(saved),
      restored: hashState(again) });
  }
  // Deliberately scripted effects exercise scheduler ordering and RNG consumption;
  // these effects are test inputs, not invented AI or a full-campaign claim.
  const rng = new OriginalBattleRng({ ch: 0x12, cl: 0x34, dh: 0x56 });
  const records = Array.from({ length: 128 }, (_, slot) => ({
    status: slot % 7 === 0 ? 8 : 0xa0, moveDelay: slot % 3, movePeriod: 2,
  }));
  const trace = [];
  for (let batch = 0; batch < 16; batch++) {
    const firstSlot = (batch % 8) * 16;
    const cursor = new LegionSlotBatch({ firstSlot, endSlot: firstSlot + 16, settleDaily: true });
    for (;;) {
      const op = cursor.next((slot) => records[slot]);
      if (op.kind === 'done') break;
      const value = op.kind === 'action' ? rng.nextByte() : null;
      trace.push([batch, op.kind, op.slot, op.record.status, op.record.moveDelay, value, rng.calls]);
      if (op.kind === 'action' && op.slot % 5 === 0) op.record.status = 0;
    }
  }
  result = { schema: 1, referenceCommit: '061e221', rules: 'ki-1995',
    scope: '20 fresh/JSON-restored chapters; scripted slot/RNG trace, not a campaign oracle',
    assets: Object.fromEntries([...bytes].map(([path, value]) => [path, digest(value)])),
    chapters, trace, records, rng: rng.snapshot() };
} finally { globalThis.fetch = originalFetch; }
const fixture = new URL('./fixtures/refactor-baseline-0.1.1.json', import.meta.url);
if (process.argv.includes('--record')) {
  // Explicit one-time capture, refuses to overwrite a frozen reference.
  await writeFile(fixture, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
} else {
  assert.deepEqual(result, parse(await readFile(fixture, 'utf8')));
}
console.log('refactor baseline OK: 20 chapters, JSON round trips, assets, slot/RNG trace');
