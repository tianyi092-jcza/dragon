// 落子回填：定义缺城兵上限的，取首章同城行做默认值；已有不覆盖，无首章行不动。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { GameCopyStore } from '../server/gamecopy.js';
import { createPinnedCopyLoader } from './editor_trusted_copy.mjs';
import { openStorage } from '../vps/sqlite-port.mjs';
import { backfillDefinitionTroopCaps } from '../web/src/content/authoring/gamesource.js';

const storage = openStorage(':memory:');
storage.sql.exec('CREATE TABLE content_games (game_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL)');
const actor = { id: 'owner-1', must_change: 0, epoch: 1 };
const games = { assertNotDeleting: () => {}, listOwn: () => storage.sql.exec('SELECT game_id FROM content_games').toArray().map(r => ({ gameId: r.gameId })) };
const store = new GameCopyStore({ storage, principal: () => actor, games });
const loader = createPinnedCopyLoader({ allocateEntityId: () => 'op-' + randomUUID() });

function fresh(gameId, game) {
  storage.sql.exec('INSERT INTO content_games VALUES(?,?)', gameId, actor.id);
  game.gameId = gameId;
  return store.seedFromGame('tok', gameId, game);
}

test('seed backfills missing definition troop caps from the first chapter', async () => {
  const { game } = await loader({ gameId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', ownerId: 'isolated' });
  const firstId = game.chapterOrder[0];
  const ids = Object.keys(game.cities).slice(0, 3);
  const expected = {};
  for (const id of ids) {
    expected[id] = game.chapters[firstId].state.cities.find(r => r.idx === game.cities[id].runtimeSlot)?.troops_cap ?? null;
    delete game.cities[id].troops_cap;
  }
  const keepId = ids[0];
  game.cities[keepId].troops_cap = 42;
  const gameId = randomUUID();
  fresh(gameId, game);
  const data = store.read('tok', gameId).data;
  assert.equal(data.cities[keepId].troops_cap, 42);
  for (const id of ids.slice(1)) assert.equal(data.cities[id].troops_cap, expected[id]);
});

test('seed leaves cities without a first-chapter row untouched', async () => {
  const { game } = await loader({ gameId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', ownerId: 'isolated' });
  game.cities['city-extra'] = { cityId: 'city-extra', runtimeSlot: 999, name: '編外城' };
  const gameId = randomUUID();
  fresh(gameId, game);
  assert.ok(!Object.hasOwn(store.read('tok', gameId).data.cities['city-extra'], 'troops_cap'));
});

test('backfill unit: keeps existing, fills missing, ignores bad rows', () => {
  const game = {
    chapterOrder: ['ch1', 'ch2'],
    cities: {
      a: { cityId: 'a', runtimeSlot: 0, troops_cap: 10 },
      b: { cityId: 'b', runtimeSlot: 1 },
      c: { cityId: 'c', runtimeSlot: 2 },
      d: { cityId: 'd', runtimeSlot: 3 },
    },
    chapters: {
      ch1: { state: { cities: [{ idx: 0, troops_cap: 11 }, { idx: 1, troops_cap: 22 }, { idx: 3, troops_cap: 300 }] } },
      ch2: { state: { cities: [{ idx: 1, troops_cap: 99 }] } },
    },
  };
  assert.equal(backfillDefinitionTroopCaps(game), 1);
  assert.equal(game.cities.a.troops_cap, 10);
  assert.equal(game.cities.b.troops_cap, 22);
  assert.ok(!Object.hasOwn(game.cities.c, 'troops_cap'));
  assert.ok(!Object.hasOwn(game.cities.d, 'troops_cap'));
});
