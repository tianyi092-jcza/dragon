// B3片2：章节城市引用 cityId 键控（边界解析为槽位）＋191→511。
// 用法：node --test tools/verify_copy_city_chapter_ref.mjs（cwd=web-port）
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { GameCopyStore } from '../server/gamecopy.js';
import { FixedCopyProfile } from '../server/copyprofile.js';
import { createPinnedCopyLoader } from './editor_trusted_copy.mjs';
import { openStorage } from '../vps/sqlite-port.mjs';

const storage = openStorage(':memory:');
storage.sql.exec('CREATE TABLE content_games (game_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL)');
const actor = { id: 'owner-1', must_change: 0, epoch: 1 };
const games = { assertNotDeleting: () => {}, listOwn: () => storage.sql.exec('SELECT game_id FROM content_games').toArray().map(r => ({ gameId: r.game_id })) };
const store = new GameCopyStore({ storage, principal: () => actor, games });
const loader = createPinnedCopyLoader({ allocateEntityId: () => 'op-' + randomUUID() });
const profile = new FixedCopyProfile({ loadCopy: loader });
const { game: pinned } = await profile.capture({ gameId: 'pinned-src', ownerId: 'owner-1' });
const FIRST = pinned.chapterOrder[0];

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
const freeGeneral = (st, cond) => {
  const occupied = new Set();
  for (const f of st.factions) for (const k of ['monarch_idx', 'advisor_idx', 'diplomat_idx']) if (f[k] !== null && f[k] !== undefined) occupied.add(f[k]);
  for (const c of st.cities) if (c.governor !== null && c.governor !== undefined) occupied.add(c.governor);
  return st.generals.find(g => g.idx < 127 && !occupied.has(g.idx) && cond(g));
};

test('cityId resolves for the five city ops on existing slots', async () => {
  const gameId = fresh();
  const st = readData(gameId).chapters[FIRST].state;
  const city0 = st.cities.find(c => c.idx === 0);
  const gov = freeGeneral(st, g => g.faction === city0.faction && g.active === true);
  assert.ok(gov, 'need an active post-free general in the city faction');
  store.writeModule('tok', gameId, 'chapters', { edits: [
    { op: 'city', chapterId: FIRST, cityId: 'city-000', values: { troops: city0.troops + 1 } },
    { op: 'set-capital', chapterId: FIRST, factionIdx: 0, cityId: 'city-000' },
    { op: 'city-governor', chapterId: FIRST, cityId: 'city-000', generalIdx: gov.idx },
    { op: 'city-faction', chapterId: FIRST, cityId: 'city-001', factionId: null },
  ]});
  const after = readData(gameId).chapters[FIRST].state;
  assert.equal(after.cities.find(c => c.idx === 0).troops, city0.troops + 1);
  assert.equal(after.factions.find(f => f.idx === 0).capital, 0);
  assert.equal(after.cities.find(c => c.idx === 0).governor, gov.idx);
  assert.equal(after.cities.find(c => c.idx === 1).faction, null);
});

test('cityId misuse fails closed; legacy idx caps lifted to 511 but guarded by entries', async () => {
  const gameId = fresh();
  await fails(() => store.writeModule('tok', gameId, 'chapters', { edits: [
    { op: 'city-faction', chapterId: FIRST, cityIdx: 0, cityId: 'city-000', factionId: null },
  ] }), 'COPY_CHAPTER', 422);
  await fails(() => store.writeModule('tok', gameId, 'chapters', { edits: [
    { op: 'city-faction', chapterId: FIRST, cityId: 'city-404', factionId: null },
  ] }), 'COPY_CHAPTER', 422);
  await fails(() => store.writeModule('tok', gameId, 'chapters', { edits: [
    { op: 'city-faction', chapterId: FIRST, cityId: 0, factionId: null },
  ] }), 'COPY_CHAPTER', 422);
  // 槽位存在但章节无条目：校验放行、应用层 fail-closed（COPY_CHAPTER；片3建条目后才可配）。
  await fails(() => store.writeModule('tok', gameId, 'chapters', { edits: [
    { op: 'city-faction', chapterId: FIRST, cityIdx: 511, factionId: null },
  ] }), 'COPY_CHAPTER', 422);
  // 新签发城（无章节条目）经 cityId 解析后同样在应用层拒收。
  const w = store.writeModule('tok', gameId, 'cities', { create: { name: '測簽片二城' } });
  assert.equal(w.issuedCityId, 'city-192');
  await fails(() => store.writeModule('tok', gameId, 'chapters', { edits: [
    { op: 'city-faction', chapterId: FIRST, cityId: 'city-192', factionId: null },
  ] }), 'COPY_CHAPTER', 422);
});
