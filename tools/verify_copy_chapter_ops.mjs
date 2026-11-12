// chapters 模块写：create/copy/delete/rename/setStart/resources，走 gamesource/chapterresources 原函数。
// 用法：node --test tools/verify_copy_chapter_ops.mjs（cwd=web-port）
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
  const data = structuredClone(pinned);
  store.ensureFromGame('tok', gameId, data);
  return gameId;
}
const fails = async (fn, code, status) => {
  try { await fn(); } catch (e) { assert.equal(e.code, code, 'code ' + e.code); assert.equal(e.status, status, 'status'); return; }
  assert.fail('should have thrown ' + code);
};
const readData = gameId => store.read('tok', gameId).data;

test('create blank chapter with name+start, then copy and delete', async () => {
  const gameId = fresh();
  const before = readData(gameId).chapterOrder.length;
  const w = store.writeModule('tok', gameId, 'chapters', { create: { name: '新章', start: { era: 'ad', year: 190, month: 3, day: 5 } } });
  assert.match(w.copyDigest, /^[a-f0-9]{64}$/);
  const data = readData(gameId);
  assert.equal(data.chapterOrder.length, before + 1);
  const id = data.chapterOrder.at(-1);
  assert.equal(data.chapters[id].name, '新章');
  assert.deepEqual(data.chapters[id].state.start, { era: 'ad', year: 190, month: 3, day: 5 });
  const c = store.writeModule('tok', gameId, 'chapters', { copy: { chapterId: FIRST } });
  assert.notEqual(c.copyDigest, w.copyDigest);
  const data2 = readData(gameId);
  assert.equal(data2.chapterOrder.length, before + 2);
  const copyId = data2.chapterOrder.at(-1);
  assert.ok(data2.chapters[copyId].name.endsWith('（副本）'));
  store.writeModule('tok', gameId, 'chapters', { delete: { chapterId: copyId } });
  const data3 = readData(gameId);
  assert.equal(data3.chapterOrder.length, before + 1);
  assert.ok(!data3.chapters[copyId]);
  await fails(() => store.writeModule('tok', gameId, 'chapters', { copy: { chapterId: 'no-such' } }), 'COPY_CHAPTER', 422);
  await fails(() => store.writeModule('tok', gameId, 'chapters', { delete: { chapterId: 'no-such' } }), 'COPY_CHAPTER', 422);
});

test('create validation mirrors draft add-blank limits', async () => {
  const gameId = fresh();
  await fails(() => store.writeModule('tok', gameId, 'chapters', { create: { name: 'x', start: { year: 190, month: 13, day: 1 } } }), 'COPY_CHAPTER', 422);
  await fails(() => store.writeModule('tok', gameId, 'chapters', { create: { name: '一二三四五六七八九十一二三四五六七', start: { year: 190, month: 1, day: 1 } } }), 'COPY_CHAPTER', 422);
  await fails(() => store.writeModule('tok', gameId, 'chapters', {}), 'COPY_PATCH', 422);
  await fails(() => store.writeModule('tok', gameId, 'chapters', { create: { name: 'x', start: { year: 190, month: 1 } } }), 'COPY_CHAPTER', 422);
});

test('rename and setStart follow original helpers (partial merge, year<=9999)', async () => {
  const gameId = fresh();
  store.writeModule('tok', gameId, 'chapters', { rename: { [FIRST]: '改名章' } });
  assert.equal(readData(gameId).chapters[FIRST].name, '改名章');
  await fails(() => store.writeModule('tok', gameId, 'chapters', { rename: { [FIRST]: '一二三四五六七八九十一二三四五六七' } }), 'COPY_CHAPTER', 422);
  store.writeModule('tok', gameId, 'chapters', { setStart: { [FIRST]: { year: 185 } } });
  const start = readData(gameId).chapters[FIRST].state.start;
  assert.equal(start.year, 185);
  assert.equal(start.month, 1);
  await fails(() => store.writeModule('tok', gameId, 'chapters', { setStart: { [FIRST]: { year: 10000 } } }), 'COPY_CHAPTER', 422);
  await fails(() => store.writeModule('tok', gameId, 'chapters', { setStart: { [FIRST]: { era: 'xx' } } }), 'COPY_CHAPTER', 422);
});

test('setStart on a chapter without start stays rejected', async () => {
  const gameId = fresh();
  store.writeModule('tok', gameId, 'chapters', { create: { name: '無曆章' } });
  const id = readData(gameId).chapterOrder.at(-1);
  await fails(() => store.writeModule('tok', gameId, 'chapters', { setStart: { [id]: { year: 200 } } }), 'COPY_CHAPTER', 422);
});

test('faction resources write through the original hex writer', async () => {
  const gameId = fresh();
  const slot = readData(gameId).chapters[FIRST].state.factions[0].idx;
  store.writeModule('tok', gameId, 'chapters', { resources: { [FIRST]: { [slot]: { money: 74001, reserve_cav: 401 } } } });
  const faction = readData(gameId).chapters[FIRST].state.factions.find(f => f.idx === slot);
  assert.equal(faction.money, 74001);
  assert.equal(faction.reserve_cav, 401);
  await fails(() => store.writeModule('tok', gameId, 'chapters', { resources: { [FIRST]: { [slot]: { reserve_cav: 70000 } } } }), 'COPY_CHAPTER', 422);
  await fails(() => store.writeModule('tok', gameId, 'chapters', { resources: { [FIRST]: { 22: { money: 1 } } } }), 'COPY_CHAPTER', 422);
  await fails(() => store.writeModule('tok', gameId, 'chapters', { resources: { 'no-such': { 0: { money: 1 } } } }), 'COPY_CHAPTER', 422);
});

test('chapter edits: city numbers, faction, capital, governor, diplomat', async () => {
  const gameId = fresh();
  const st = readData(gameId).chapters[FIRST].state;
  const city0 = st.cities.find(c => c.idx === 0);
  const occupied = new Set();
  for (const f of st.factions) for (const k of ['monarch_idx', 'advisor_idx', 'diplomat_idx']) if (f[k] !== null && f[k] !== undefined) occupied.add(f[k]);
  for (const c of st.cities) if (c.governor !== null && c.governor !== undefined) occupied.add(c.governor);
  const free = g => g.idx < 127 && !occupied.has(g.idx);
  const gov = st.generals.find(g => g.faction === city0.faction && g.active === true && free(g));
  assert.ok(gov, 'need an active post-free general in the city faction');
  const diplo = st.generals.find(g => g.faction === 0 && free(g) && g.idx !== gov.idx);
  assert.ok(diplo, 'need a post-free general in faction 0');
  const mover = st.generals.find(g => free(g) && g.faction !== 0 && g.faction !== null);
  assert.ok(mover, 'need a post-free general outside faction 0');
  store.writeModule('tok', gameId, 'chapters', { edits: [
    { op: 'city-native', chapterId: FIRST, cityIdx: 0, values: { troops: city0.troops + 1 } },
    { op: 'set-capital', chapterId: FIRST, factionIdx: 0, cityIdx: 0 },
    { op: 'general-faction', chapterId: FIRST, generalIdx: mover.idx, factionId: 0 },
    { op: 'set-diplomat', chapterId: FIRST, factionIdx: 0, generalIdx: diplo.idx },
    { op: 'city-governor', chapterId: FIRST, cityIdx: 0, generalIdx: gov.idx },
    { op: 'city-faction', chapterId: FIRST, cityIdx: 1, factionId: null },
  ]});
  const after = readData(gameId).chapters[FIRST].state;
  assert.equal(after.cities.find(c => c.idx === 0).troops, city0.troops + 1);
  assert.equal(after.factions.find(f => f.idx === 0).capital, 0);
  assert.equal(after.generals.find(g => g.idx === mover.idx).faction, 0);
  assert.equal(after.factions.find(f => f.idx === 0).diplomat_idx, diplo.idx);
  assert.equal(after.cities.find(c => c.idx === 0).governor, gov.idx);
  assert.equal(after.cities.find(c => c.idx === 1).faction, null);
});
test('chapter edits reject malformed ops and apply atomically', async () => {
  const gameId = fresh();
  const before = readData(gameId);
  await fails(() => store.writeModule('tok', gameId, 'chapters', { edits: [{ op: 'bogus', chapterId: FIRST }] }), 'COPY_CHAPTER', 422);
  await fails(() => store.writeModule('tok', gameId, 'chapters', { edits: [] }), 'COPY_CHAPTER', 422);
  await fails(() => store.writeModule('tok', gameId, 'chapters', { edits: [{ op: 'city-native', chapterId: FIRST, cityIdx: -1, values: { troops: 1 } }] }), 'COPY_CHAPTER', 422);
  await fails(() => store.writeModule('tok', gameId, 'chapters', { edits: [{ op: 'city-faction', chapterId: FIRST, cityIdx: 0, factionId: 256 }] }), 'COPY_CHAPTER', 422);
  await fails(() => store.writeModule('tok', gameId, 'chapters', { edits: [{ op: 'set-diplomat', chapterId: FIRST, factionIdx: 0, generalIdx: 128 }] }), 'COPY_CHAPTER', 422);
  await fails(() => store.writeModule('tok', gameId, 'chapters', { edits: [{ op: 'city-governor', chapterId: FIRST, cityIdx: 0, generalIdx: 1, extra: 1 }] }), 'COPY_CHAPTER', 422);
  await fails(() => store.writeModule('tok', gameId, 'chapters', { rename: { [FIRST]: '不应留' }, edits: [{ op: 'bogus', chapterId: FIRST }] }), 'COPY_CHAPTER', 422);
  assert.deepEqual(readData(gameId), before);
});
test('chapter edits: rename-general and portrait write through original helpers', async () => {
  const gameId = fresh();
  const st = readData(gameId).chapters[FIRST].state;
  const target = st.generals.find(g => g.idx < 127);
  assert.ok(target);
  store.writeModule('tok', gameId, 'chapters', { edits: [{ op: 'rename-general', chapterId: FIRST, generalIdx: target.idx, values: { name: '改名測', hao: '字測' } }] });
  const renamed = readData(gameId).chapters[FIRST].state.generals.find(g => g.idx === target.idx);
  assert.equal(renamed.name, '改名測');
  assert.equal(renamed.hao, '字測');
  store.writeModule('tok', gameId, 'chapters', { edits: [{ op: 'portrait', chapterId: FIRST, generalIdx: target.idx, portraitKey: 'p7' }] });
  assert.equal(readData(gameId).chapters[FIRST].state.generals.find(g => g.idx === target.idx).portraitKey, 'p7');
  store.writeModule('tok', gameId, 'chapters', { edits: [{ op: 'portrait', chapterId: FIRST, generalIdx: target.idx, portraitKey: null }] });
  assert.ok(!('portraitKey' in readData(gameId).chapters[FIRST].state.generals.find(g => g.idx === target.idx)));
  await fails(() => store.writeModule('tok', gameId, 'chapters', { edits: [{ op: 'rename-general', chapterId: FIRST, generalIdx: target.idx, values: { name: 'x', ability: 1 } }] }), 'COPY_CHAPTER', 422);
  await fails(() => store.writeModule('tok', gameId, 'chapters', { edits: [{ op: 'rename-general', chapterId: FIRST, generalIdx: 128, values: { name: 'x' } }] }), 'COPY_CHAPTER', 422);
  await fails(() => store.writeModule('tok', gameId, 'chapters', { edits: [{ op: 'portrait', chapterId: FIRST, generalIdx: target.idx, portraitKey: 123 }] }), 'COPY_CHAPTER', 422);
  await fails(() => store.writeModule('tok', gameId, 'chapters', { edits: [{ op: 'portrait', chapterId: FIRST, generalIdx: target.idx, portraitKey: 'bad key!' }] }), 'COPY_CHAPTER', 422);
});
test('chapter edits: strategist/monarch posts, succession and disband', async () => {
  const gameId = fresh();
  const st = readData(gameId).chapters[FIRST].state;
  const occupied = new Set();
  for (const f of st.factions) for (const k of ['monarch_idx', 'advisor_idx', 'diplomat_idx']) if (f[k] !== null && f[k] !== undefined) occupied.add(f[k]);
  for (const c of st.cities) if (c.governor !== null && c.governor !== undefined) occupied.add(c.governor);
  const free = g => g.idx < 127 && !occupied.has(g.idx);
  const incomer = st.generals.find(g => free(g) && g.faction !== 2 && g.faction !== null && g.appear_months === 0 && g.status !== 4 && g.captive_flag !== 0);
  assert.ok(incomer, 'need a post-free active general to move into faction 2');
  const lord = st.generals.find(g => free(g) && g.faction === null);
  assert.ok(lord, 'need a post-free free general for monarch');
  const heir = st.generals.find(g => free(g) && g.faction === null && g.idx !== lord.idx);
  assert.ok(heir, 'need a second post-free free general for succession');
  store.writeModule('tok', gameId, 'chapters', { edits: [
    { op: 'general-faction', chapterId: FIRST, generalIdx: incomer.idx, factionId: 2 },
    { op: 'set-strategist', chapterId: FIRST, factionIdx: 2, generalIdx: incomer.idx },
    { op: 'set-monarch', chapterId: FIRST, factionIdx: 3, generalIdx: lord.idx },
  ]});
  const mid = readData(gameId).chapters[FIRST].state;
  assert.equal(mid.factions.find(f => f.idx === 2).advisor_idx, incomer.idx);
  assert.equal(mid.factions.find(f => f.idx === 3).monarch_idx, lord.idx);
  assert.equal(mid.generals.find(g => g.idx === lord.idx).faction, 3);
  store.writeModule('tok', gameId, 'chapters', { edits: [
    { op: 'remove-monarch', chapterId: FIRST, factionIdx: 0, resolution: { successor: heir.idx } },
    { op: 'set-strategist', chapterId: FIRST, factionIdx: 2, generalIdx: null },
    { op: 'disband-faction', chapterId: FIRST, factionIdx: 15, confirm: true },
  ]});
  const after = readData(gameId).chapters[FIRST].state;
  assert.equal(after.factions.find(f => f.idx === 0).monarch_idx, heir.idx);
  assert.equal(after.generals.find(g => g.idx === heir.idx).faction, 0);
  assert.equal(after.factions.find(f => f.idx === 2).advisor_idx, null);
  assert.ok(!after.factions.some(f => f.idx === 15));
  await fails(() => store.writeModule('tok', gameId, 'chapters', { edits: [{ op: 'set-monarch', chapterId: FIRST, factionIdx: 22, generalIdx: lord.idx }] }), 'COPY_CHAPTER', 422);
  await fails(() => store.writeModule('tok', gameId, 'chapters', { edits: [{ op: 'set-strategist', chapterId: FIRST, factionIdx: 2, generalIdx: 128 }] }), 'COPY_CHAPTER', 422);
  await fails(() => store.writeModule('tok', gameId, 'chapters', { edits: [{ op: 'remove-monarch', chapterId: FIRST, factionIdx: 0, resolution: 'x' }] }), 'COPY_CHAPTER', 422);
  await fails(() => store.writeModule('tok', gameId, 'chapters', { edits: [{ op: 'disband-faction', chapterId: FIRST, factionIdx: 15, confirm: false }] }), 'COPY_CHAPTER', 422);
  await fails(() => store.writeModule('tok', gameId, 'chapters', { edits: [{ op: 'disband-faction', chapterId: FIRST, factionIdx: 99, confirm: true }] }), 'COPY_CHAPTER', 422);
});
test('rename-only change keeps the publish gate green', async () => {
  const gameId = fresh();
  store.writeModule('tok', gameId, 'chapters', { rename: { [FIRST]: '門禁章' } });
  const v = store.validateWhole('tok', gameId);
  assert.equal(v.state, 'passed');
});
