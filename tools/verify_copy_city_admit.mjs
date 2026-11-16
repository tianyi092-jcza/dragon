// B3片3(b)：显式 admit 已放置新城（D6 默认条目，raw-less）＋live 转换＋capture live 化。
// 用法：node --test tools/verify_copy_city_admit.mjs（cwd=web-port）
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { GameCopyStore } from '../server/gamecopy.js';
import { FixedCopyProfile } from '../server/copyprofile.js';
import { createPinnedCopyLoader } from './editor_trusted_copy.mjs';
import { openStorage } from '../vps/sqlite-port.mjs';
import { admitChapterCity, editChapterCity, chapterActiveGaps } from '../web/src/content/authoring/gamesource.js';
import { convertLegacyChapterCities, convertLiveChapterCities } from '../web/src/content/authoring/chaptercityconversion.js';
import { captureCityDefinitions } from '../web/src/content/authoring/cityrecords.js';

const storage = openStorage(':memory:');
storage.sql.exec('CREATE TABLE content_games (game_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL)');
const actor = { id: 'owner-1', must_change: 0, epoch: 1 };
const games = { assertNotDeleting: () => {}, listOwn: () => storage.sql.exec('SELECT game_id FROM content_games').toArray().map(r => ({ gameId: r.game_id })) };
const store = new GameCopyStore({ storage, principal: () => actor, games });
const loader = createPinnedCopyLoader({ allocateEntityId: () => 'op-' + randomUUID() });
const profile = new FixedCopyProfile({ loadCopy: loader });
const { game: pinned } = await profile.capture({ gameId: 'pinned-src', ownerId: 'owner-1' });
const FIRST = pinned.chapterOrder[0];
const CHAPTERS = pinned.chapterOrder.length;

function fresh() {
  const gameId = randomUUID();
  storage.sql.exec('INSERT INTO content_games VALUES(?,?)', gameId, actor.id);
  store.ensureFromGame('tok', gameId, structuredClone(pinned));
  return gameId;
}
const readData = gameId => store.read('tok', gameId).data;
const fails = async (fn, code, status) => {
  try { await fn(); } catch (e) { assert.equal(e.code, code, 'code ' + e.code); assert.equal(e.status, status, 'status'); return; }
  assert.fail('should have thrown ' + code);
};
const FULL_NUMBERS = { max_prod: 4000, prod: 3000, growth: 100, defence: 100, troops: 50, type: 2, view: 1 };
const ADMIT_CAP = 60;
const SIEGE = 'ki-1995:siege:7';
function placed(gameId, cityId, x = 100, y = 50) {
  const d = readData(gameId);
  d.map.placements.push({ id: `placement-${cityId}`, cityId, x, y });
  store.ensureFromGame('tok', gameId, d);
}

test('admit creates D6 entries in every chapter and backfills x/y', async () => {
  const gameId = fresh();
  const w = store.writeModule('tok', gameId, 'cities', { create: { name: '測簽受納城', numbers: FULL_NUMBERS } });
  assert.equal(w.issuedCityId, 'city-192');
  placed(gameId, 'city-192');
  const r = store.writeModule('tok', gameId, 'chapters', { admit: { cityId: 'city-192', troops_cap: ADMIT_CAP, battleMapId: SIEGE } });
  assert.match(r.copyDigest, /^[a-f0-9]{64}$/);
  const data = readData(gameId);
  assert.equal(data.cities['city-192'].x, 100);
  assert.equal(data.cities['city-192'].y, 50);
  for (const chapterId of data.chapterOrder) {
    const st = data.chapters[chapterId];
    assert.equal(st.state.cities.length, 193);
    const row = st.state.cities.find(c => c.idx === 192);
    assert.deepEqual(row, { idx: 192, cityId: 'city-192', name: '測簽受納城', faction: null, governor: null,
      ...FULL_NUMBERS, troops_cap: ADMIT_CAP, x: 100, y: 50, battleMapId: SIEGE,
      attr: 0, _aiCooldown: 0, _strategicLastFaction: 0x18, strategicBorderCount: 0,
      disaster_event: 0, cityCacheByte: 0, neighbourCityIds: [null, null, null, null] });
    assert.deepEqual(st.cities?.['city-192'], { factionId: null, overrides: {} });
    const gaps = chapterActiveGaps(st.state, chapterId).filter(g => JSON.stringify(g).includes('192'));
    assert.deepEqual(gaps, []);
  }
});

test('admit fails closed when unplaced, incomplete, unknown, or malformed', async () => {
  const gameId = fresh();
  store.writeModule('tok', gameId, 'cities', { create: { name: '測簽未放城', numbers: FULL_NUMBERS } });
  await fails(() => store.writeModule('tok', gameId, 'chapters', { admit: { cityId: 'city-192', troops_cap: ADMIT_CAP, battleMapId: SIEGE } }), 'COPY_CHAPTER', 422);
  store.writeModule('tok', gameId, 'cities', { create: { name: '測簽缺數城' } });
  placed(gameId, 'city-193', 110, 60);
  await fails(() => store.writeModule('tok', gameId, 'chapters', { admit: { cityId: 'city-193', troops_cap: ADMIT_CAP, battleMapId: SIEGE } }), 'COPY_CHAPTER', 422);
  await fails(() => store.writeModule('tok', gameId, 'chapters', { admit: { cityId: 'city-404', troops_cap: ADMIT_CAP, battleMapId: SIEGE } }), 'COPY_CHAPTER', 422);
  await fails(() => store.writeModule('tok', gameId, 'chapters', { admit: [] }), 'COPY_CHAPTER', 422);
  await fails(() => store.writeModule('tok', gameId, 'chapters', { admit: { cityId: 'city-192' } }), 'COPY_CHAPTER', 422);
  await fails(() => store.writeModule('tok', gameId, 'chapters', { admit: { cityId: 'city-192', troops_cap: ADMIT_CAP } }), 'COPY_CHAPTER', 422);
  await fails(() => store.writeModule('tok', gameId, 'chapters', { admit: { cityId: 'city-192', troops_cap: ADMIT_CAP, battleMapId: 'ki-1995:siege:192' } }), 'COPY_CHAPTER', 422);
  await fails(() => store.writeModule('tok', gameId, 'chapters', { admit: { cityId: 'city-192', troops_cap: ADMIT_CAP, battleMapId: 'nope' } }), 'COPY_CHAPTER', 422);
  await fails(() => store.writeModule('tok', gameId, 'chapters', { admit: { cityId: 'city-192', troops_cap: 256, battleMapId: SIEGE } }), 'COPY_CHAPTER', 422);
  await fails(() => store.writeModule('tok', gameId, 'chapters', { admit: { cityId: 'city-192', troops_cap: ADMIT_CAP, battleMapId: SIEGE, extra: 1 } }), 'COPY_CHAPTER', 422);
  await fails(() => store.writeModule('tok', gameId, 'chapters', {}), 'COPY_PATCH', 422);
  // 未 admit 前章节仍无 192 条目：cityId 解析后应用层拒收。
  placed(gameId, 'city-192', 100, 50);
  await fails(() => store.writeModule('tok', gameId, 'chapters', { edits: [
    { op: 'city-faction', chapterId: FIRST, cityId: 'city-192', factionId: null },
  ] }), 'COPY_CHAPTER', 422);
});

test('live conversion matches legacy on builtin and covers the admitted city', async () => {
  const bindings192 = Object.values(pinned.cities).map(c => ({ runtimeSlot: c.runtimeSlot, cityId: c.cityId }));
  const legacy = convertLegacyChapterCities(structuredClone(pinned), bindings192);
  const live = convertLiveChapterCities(structuredClone(pinned), bindings192);
  assert.deepEqual(live, legacy);
  const gameId = fresh();
  store.writeModule('tok', gameId, 'cities', { create: { name: '測簽轉換城', numbers: FULL_NUMBERS } });
  placed(gameId, 'city-192', 120, 70);
  store.writeModule('tok', gameId, 'chapters', { admit: { cityId: 'city-192', troops_cap: ADMIT_CAP, battleMapId: SIEGE } });
  const data = readData(gameId);
  const bindings = Object.values(data.cities).map(c => ({ runtimeSlot: c.runtimeSlot, cityId: c.cityId }));
  const out = convertLiveChapterCities(data, bindings);
  assert.equal(Object.keys(out.chapters[FIRST].cities).length, 193);
  assert.deepEqual(out.chapters[FIRST].cities['city-192'], { faction: null, governor: null,
    prod: 3000, growth: 100, defence: 100, troops: 50, troops_cap: ADMIT_CAP,
    initializer: { attr: 0, _aiCooldown: 0, _strategicLastFaction: 0x18, strategicBorderCount: 0,
      disaster_event: 0, cityCacheByte: 0, neighbourCityIds: [null, null, null, null] } });
  const broken = structuredClone(data);
  delete broken.chapters[FIRST].state.cities.find(c => c.idx === 192).attr;
  assert.throws(() => convertLiveChapterCities(broken, bindings), /missing named city initializer attr/);
});

test('chapter value edits work raw-less on admitted entries', async () => {
  const gameId = fresh();
  store.writeModule('tok', gameId, 'cities', { create: { name: '測簽改值城', numbers: FULL_NUMBERS } });
  placed(gameId, 'city-192', 130, 80);
  store.writeModule('tok', gameId, 'chapters', { admit: { cityId: 'city-192', troops_cap: ADMIT_CAP, battleMapId: SIEGE } });
  const data = readData(gameId);
  const next = editChapterCity(data, FIRST, 192, { troops: 51 });
  const row = next.chapters[FIRST].state.cities.find(c => c.idx === 192);
  assert.equal(row.troops, 51);
  assert.ok(!('raw' in row));
  // 服务端整包同路：cityIdx 直写 192。
  store.writeModule('tok', gameId, 'chapters', { edits: [{ op: 'city', chapterId: FIRST, cityIdx: 192, values: { prod: 3001 } }] });
  assert.equal(readData(gameId).chapters[FIRST].state.cities.find(c => c.idx === 192).prod, 3001);
});

test('captureCityDefinitions goes live; unplaced reserves still fail', async () => {
  const gameId = fresh();
  store.writeModule('tok', gameId, 'cities', { create: { name: '測簽儲備城', numbers: FULL_NUMBERS } });
  assert.throws(() => captureCityDefinitions(readData(gameId)), /city definition fields are not understood/);
  placed(gameId, 'city-192', 140, 90);
  store.writeModule('tok', gameId, 'chapters', { admit: { cityId: 'city-192', troops_cap: ADMIT_CAP, battleMapId: SIEGE } });
  const defs = captureCityDefinitions(readData(gameId));
  assert.equal(Object.keys(defs).length, 193);
  assert.equal(defs['city-192'].runtimeSlot, 192);
});
