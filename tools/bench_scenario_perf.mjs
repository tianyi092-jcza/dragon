// VPERF scenario level: assembly (compile + fresh cache init/synthesize) and
// monthly settlement timings at 192 / 193 (real admitted city) / 257
// (synthetic scaling probe, M257(e) pattern). No product code, no saves,
// no network. Prints machine + timings + heap. Timings are machine-specific
// records, not budgets or pass/fail gates.
import os from 'node:os';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { BUILTIN_RESOURCES } from '../web/src/content/builtinresources.generated.js';
import { compileGameSource } from '../web/src/content/authoring/trialcompile.js';
import { initializeScenarioCityNativeInputs, synthesizeScenarioCityCache } from '../web/src/game/navigation/scenariocitycache.js';
import { initializeLegionSlotState } from '../web/src/game/legionphase.js';
import { initializeNativeFactionSlots } from '../web/src/game/nativefactions.js';
import { initializeNativeLegionSlotsFromZeroChapter } from '../web/src/game/nativelegions.js';
import { initializeNativeMonthlyPolicy } from '../web/src/game/nativemonthlypolicy.js';
import { monthlySettlement } from '../web/src/game/economy.js';
import { GameCopyStore } from '../server/gamecopy.js';
import { FixedCopyProfile } from '../server/copyprofile.js';
import { createPinnedCopyLoader } from './editor_trusted_copy.mjs';
import { openStorage } from '../vps/sqlite-port.mjs';

const sha = b => createHash('sha256').update(b).digest('hex');
const time = (label, fn) => {
  const t0 = process.hrtime.bigint();
  const out = fn();
  console.log(`${label}: ${(Number(process.hrtime.bigint() - t0) / 1e6).toFixed(2)}ms`);
  return out;
};
const heap = label => console.log(`${label} heap: ${(process.memoryUsage().heapUsed / 2 ** 20).toFixed(1)}MiB`);
console.log(`machine: ${os.cpus()[0].model} x${os.cpus().length}, ${(os.totalmem() / 2 ** 30).toFixed(1)}GiB, ${process.platform} ${process.version}`);

// A: full source compile at 192.
const rev = BUILTIN_RESOURCES.world.revision;
const builtin = JSON.parse(fs.readFileSync(new URL(`../web/content/builtin/compiled/${rev}/game-source.json`, import.meta.url), 'utf8'));
time('compileGameSource (192 cities)', () => compileGameSource(builtin, sha));
heap('after compile');

// B: fresh cache init + synthesize at 192 / 193 (real admit) / 257 (probe).
const ch0 = builtin.chapterOrder[0];
const rows192 = structuredClone(builtin.chapters[ch0].state.cities);
const recs192 = builtin.chapters[ch0].state.nativeCityRecordRaw;
const cacheBench = (label, cities, records, expectCalls) => {
  const scenario = { cities: structuredClone(cities), nativeCityRecordRaw: records };
  time(`${label} cache init`, () => initializeScenarioCityNativeInputs(scenario));
  const synth = time(`${label} cache synthesize`, () => synthesizeScenarioCityCache(scenario));
  assert.equal(synth.spans[0].hex.length, scenario.cities.length * 2);
  void expectCalls;
};
cacheBench('192', rows192, recs192);

const storage = openStorage(':memory:');
storage.sql.exec('CREATE TABLE content_games (game_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL)');
const actor = { id: 'owner-1', must_change: 0, epoch: 1 };
const store = new GameCopyStore({ storage, principal: () => actor, games: { assertNotDeleting: () => {}, listOwn: () => [] } });
const profile = new FixedCopyProfile({ loadCopy: createPinnedCopyLoader({ allocateEntityId: () => 'op-' + randomUUID() }) });
const { game: pinned } = await profile.capture({ gameId: 'pinned-src', ownerId: actor.id });
const gameId = randomUUID();
storage.sql.exec('INSERT INTO content_games VALUES(?,?)', gameId, actor.id);
store.ensureFromGame('tok', gameId, structuredClone(pinned));
store.writeModule('tok', gameId, 'cities', { create: { name: '效能新城', numbers: { max_prod: 4000, prod: 3000, growth: 100, defence: 100, troops: 50, type: 2, view: 1 } } });
{
  const d = store.read('tok', gameId).data;
  d.map.placements.push({ id: 'placement-city-192', cityId: 'city-192', x: 191, y: 252 });
  store.ensureFromGame('tok', gameId, d);
}
store.writeModule('tok', gameId, 'chapters', { admit: { cityId: 'city-192', troops_cap: 60, battleMapId: 'ki-1995:siege:7' } });
const data193 = store.read('tok', gameId).data;
const firstChapter = data193.chapterOrder[0];
const rows193 = data193.chapters[firstChapter].state.cities;
const recs193 = data193.chapters[firstChapter].state.nativeCityRecordRaw;
assert.equal(rows193.length, 193);
cacheBench('193 (real admit)', rows193, recs193);
heap('after 193 cache');

const rows257 = structuredClone(rows193);
const template = rows193.find(r => r.idx === 192);
for (let slot = 193; slot < 257; slot++)
  rows257.push({ ...structuredClone(template), idx: slot, cityId: `city-probe-${slot}`, x: 100 + (slot % 50), y: 200 });
cacheBench('257 (synthetic probe)', rows257, recs193);
heap('after 257 cache');

// C: monthly settlement at 192 / 193 / 257 (M257(e) pattern).
const fixtureData = JSON.parse(fs.readFileSync(new URL('../web/data.json', import.meta.url), 'utf8'));
const sequence = () => { let calls = 0; return { get calls() { return calls; }, nextByte() { return (calls++ * 73 + 19) & 0xff; } }; };
const fixture = extra => {
  const sc = structuredClone(fixtureData.scenarios[16]);
  sc.player_faction = 17;
  initializeNativeFactionSlots(sc);
  initializeNativeMonthlyPolicy(sc);
  sc.legions = [];
  initializeLegionSlotState(sc);
  initializeNativeLegionSlotsFromZeroChapter(sc);
  sc.nativePlayerFactionPointer = 17 * 0x40;
  for (const faction of sc.nativeFactionSlots.records) if (faction.idx !== 13) { faction.attr &= 0x7f; faction.active = false; }
  const faction = sc.nativeFactionSlots.records[13];
  faction.attr |= 0x80; faction.active = true;
  for (let slot = 192; slot < 192 + extra; slot++)
    sc.cities.push({ idx: slot, x: 100, y: 100, faction: 13, prod: 600, growth: 100, max_prod: 200 });
  return sc;
};
for (const extra of [0, 1, 65]) {
  const rng = sequence();
  time(`monthlySettlement (${192 + extra} cities)`, () => monthlySettlement(fixture(extra), null, rng));
  assert.equal(rng.calls, 192 + extra);
  console.log(`  rng calls: ${rng.calls}`);
}
heap('after monthly');
console.log('VPERF-SCENARIO-RECORDED');
