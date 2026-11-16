// B3 cities.create：服务端签发測簽城甲（append-only city-NNN，未放置储备无 x/y）。
// 用法：node --test tools/verify_copy_city_create.mjs（cwd=web-port）
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

function fresh(data = pinned) {
  const gameId = randomUUID();
  storage.sql.exec('INSERT INTO content_games VALUES(?,?)', gameId, actor.id);
  store.ensureFromGame('tok', gameId, structuredClone(data));
  return gameId;
}
const readData = gameId => store.read('tok', gameId).data;
const fails = async (fn, code, status) => {
  try { await fn(); } catch (e) { assert.equal(e.code, code, 'code ' + e.code); assert.equal(e.status, status, 'status'); return; }
  assert.fail('should have thrown ' + code);
};

test('create issues city-192 with dense slot and no placement coords', async () => {
  const gameId = fresh();
  const before = Object.keys(readData(gameId).cities).length;
  assert.equal(before, 192);
  const w = store.writeModule('tok', gameId, 'cities', { create: { name: '測簽城甲', numbers: { max_prod: 4000, type: 2, view: 1 } } });
  assert.equal(w.issuedCityId, 'city-192');
  assert.match(w.copyDigest, /^[a-f0-9]{64}$/);
  const row = readData(gameId).cities['city-192'];
  assert.deepEqual(row, { cityId: 'city-192', runtimeSlot: 192, name: '測簽城甲', max_prod: 4000, type: 2, view: 1 });
  assert.ok(!('x' in row) && !('y' in row));
});

test('second create is monotonic and rename/numbers still work', async () => {
  const gameId = fresh();
  store.writeModule('tok', gameId, 'cities', { create: { name: '測簽城甲' } });
  const w = store.writeModule('tok', gameId, 'cities', { create: { name: '測簽城乙' } });
  assert.equal(w.issuedCityId, 'city-193');
  assert.equal(readData(gameId).cities['city-193'].runtimeSlot, 193);
  const r = store.writeModule('tok', gameId, 'cities', { rename: { 'city-192': '測簽改名' }, numbers: { 'city-192': { prod: 51 } } });
  assert.equal(r.issuedCityId, undefined);
  assert.equal(readData(gameId).cities['city-192'].name, '測簽改名');
});

test('create rejects duplicates, bad input and the 512 cap', async () => {
  const gameId = fresh();
  const taken = readData(gameId).cities['city-000'].name;
  await fails(() => store.writeModule('tok', gameId, 'cities', { create: { name: taken } }), 'COPY_CITY_NAME_TAKEN', 409);
  await fails(() => store.writeModule('tok', gameId, 'cities', { create: { name: '' } }), 'COPY_CITY', 422);
  await fails(() => store.writeModule('tok', gameId, 'cities', { create: { name: '名'.repeat(13) } }), 'COPY_CITY', 422);
  await fails(() => store.writeModule('tok', gameId, 'cities', { create: { name: '測簽好名', numbers: { prod: 70000 } } }), 'COPY_CITY', 422);
  await fails(() => store.writeModule('tok', gameId, 'cities', { create: { name: '測簽好名', numbers: { nope: 1 } } }), 'COPY_CITY', 422);
  await fails(() => store.writeModule('tok', gameId, 'cities', { create: [] }), 'COPY_CITY', 422);
  await fails(() => store.writeModule('tok', gameId, 'cities', {}), 'COPY_PATCH', 422);
  // 512 上限：直种满槽再签发。
  const full = structuredClone(pinned);
  for (let i = 192; i < 512; i++) full.cities[`city-${String(i).padStart(3, '0')}`] = { cityId: `city-${String(i).padStart(3, '0')}`, runtimeSlot: i, name: `測簽填槽${i}` };
  const fullId = fresh(full);
  assert.equal(Object.keys(readData(fullId).cities).length, 512);
  await fails(() => store.writeModule('tok', fullId, 'cities', { create: { name: '測簽超限' } }), 'COPY_CITY', 422);
});
