// Existing Web module only: a deletion fact is the reader's explicit 410, never
// a directory miss, and local saves are removed per verified slot. No browser,
// no real IndexedDB, no user saves and no network.
import assert from 'node:assert/strict';
import { GAME_DELETED_SAVE_NOTICE, confirmGameDeleted, discardLocalSaves, isGameDeletedFailure } from '../web/src/player/playerdeletedgame.js';
const failure = (code, status) => Object.assign(new Error(code), { code, status });
let checks = 0;
assert.equal(GAME_DELETED_SAVE_NOTICE, '該遊戲已被刪除，存檔不可用，是否刪除？');checks++;
assert.equal(isGameDeletedFailure(failure('GAME_DELETED', 410)), true);
for (const other of [failure('GAME_DELETED', 0), failure('PLAYER_REQUEST_FAILED', 410), failure('RELEASE_CHANGED', 409),
  Object.assign(new Error('deleted'), { code: 'GAME_DELETED' }), new Error('deleted'), null, undefined, 'GAME_DELETED']) {
  assert.equal(isGameDeletedFailure(other), false, String(other?.code ?? other));
}
checks++;
{
  const listed = { status: async () => ({ listed: true }) };
  assert.equal(await confirmGameDeleted({ reader: listed, gameId: 'g' }), false, 'a listed game is never deleted');
  const unlisted = { status: async () => ({ listed: false }) };
  assert.equal(await confirmGameDeleted({ reader: unlisted, gameId: 'g' }), false, 'unlisted is not deleted');
  const deleted = { status: async () => { throw failure('GAME_DELETED', 410); } };
  assert.equal(await confirmGameDeleted({ reader: deleted, gameId: 'g' }), true);checks++;
  for (const error of [failure('PLAYER_REQUEST_FAILED', 410), failure('RUNTIME_UNAVAILABLE', 503), new Error('offline')]) {
    await assert.rejects(() => confirmGameDeleted({ reader: { status: async () => { throw error; } }, gameId: 'g' }), value => value === error);
  }checks++;
  await assert.rejects(() => confirmGameDeleted({ reader: listed, gameId: '' }), TypeError);
  await assert.rejects(() => confirmGameDeleted({ reader: {}, gameId: 'g' }), TypeError);checks++;
}
function store({ rows, bodies }) {
  const state = { deletes: [], gets: [] };
  return { state, gameId: 'g',
    async list() { return rows(); },
    async get(slot) { state.gets.push(slot); const body = bodies[slot]; if (body instanceof Error) throw body; return body ?? null; },
    async compareDelete(token) { if (token.slot === 9) throw new Error('catalog changed'); state.deletes.push(token.slot); return true; },
  };
}
{
  const rows = [{ slot: 0, bodyDigest: 'a' }, { slot: 1, bodyDigest: 'b' }];
  const port = store({ rows: () => rows, bodies: { 0: { token: { slot: 0, bodyDigest: 'a' } }, 1: { token: { slot: 1, bodyDigest: 'b' } } } });
  assert.deepEqual(await discardLocalSaves({ store: port }), { deleted: 2, kept: 0 });
  assert.deepEqual(port.state.deletes, [0, 1]);checks++;
}
{
  // Every unverifiable row is retained: no body, a mismatched summary, a body
  // that no longer matches its catalog row, an aborted compare-delete, a
  // non-slot row. Only the verified row is deleted.
  const rows = [{ slot: 0, bodyDigest: 'a' }, { slot: 1, bodyDigest: 'b' }, { slot: 2, bodyDigest: 'c' },
    { slot: 3, bodyDigest: 'd' }, { slot: 4, bodyDigest: 'e' }, { slot: 9, bodyDigest: 'f' }, { slot: -1, bodyDigest: 'g' }, {}];
  const port = store({ rows: () => rows, bodies: { 0: { token: { slot: 0, bodyDigest: 'a' } }, 1: null,
    2: { token: { slot: 2, bodyDigest: 'other' } }, 3: new Error('save changed'), 4: { token: { slot: 4, bodyDigest: 'e' } },
    9: { token: { slot: 9, bodyDigest: 'f' } } } });
  assert.deepEqual(await discardLocalSaves({ store: port }), { deleted: 2, kept: 5 });
  assert.deepEqual(port.state.deletes, [0, 4]);
  assert.equal(port.state.gets.includes(-1), false, 'a non-slot row is never read');
  assert.equal(port.state.gets.includes(7), false);checks++;
}
{
  const port = store({ rows: () => { throw new Error('catalog unavailable'); }, bodies: {} });
  await assert.rejects(() => discardLocalSaves({ store: port }), /catalog unavailable/);checks++;
  const rows = [{ slot: 0, bodyDigest: 'a' }];
  assert.deepEqual(await discardLocalSaves({ store: store({ rows: () => rows, bodies: { 0: null } }) }), { deleted: 0, kept: 0 });checks++;
}
for (const bad of [{}, { list: async () => [] }, { list: async () => [], get: async () => null },
  { list: async () => [], get: async () => null, compareDelete: async () => true, gameId: 'g' }]) {
  if (bad.compareDelete) assert.deepEqual(await discardLocalSaves({ store: bad }), { deleted: 0, kept: 0 });
  else await assert.rejects(() => discardLocalSaves({ store: bad }), TypeError);
}
await assert.rejects(() => discardLocalSaves({ store: { list: async () => null, get: async () => null, compareDelete: async () => true } }), TypeError);checks++;
process.stdout.write(JSON.stringify({ checks, scope: 'Actual Web player deletion policy module: explicit 410 fact only, directory miss/unlisted/other failures never delete, per-slot verified compare-delete with every unverifiable row retained. No browser prompt, real IndexedDB, user save, network or production reader.' }) + '\n');
