// 删除游戏之后的 R2 回收（方案 B）。游戏数据按 gameId 物理独立，所以一次删除
// 只有两件事：把在架指针里这个 gameId 的条目移除、把这个前缀下的字节删掉。
// 不读 SQL、不写根、不改代次、不做引用计数；共享的程序包（artifacts/programs/）
// 与画像（kao/）不属于任何单个游戏，一律不碰。
//
// 条目移除与保留墓碑对读者等价：两种情况下读者都答 410 GAME_DELETED（用户 m256
// 决定「指针里查不到就是已删除」），所以这里删条目而不是写墓碑，也不会改变任何
// 仍然在架的游戏的可见字节。
import { createHash } from 'node:crypto';
import { DIRECTORY_POINTER_KEY, DIRECTORY_POINTER_LIMIT, directoryPointerBody, validateDirectoryPointer } from '../reader/directorypointer.js';
import { isGameId, parseJSON, requireValue } from '../reader/runtimecontract.js';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const CAS_ATTEMPTS = 4;
const MAX_SWEEPS = 64;

// The pointer is a CAS object the publication flow owns. Removing one entry must
// therefore read-modify-write against the etag it read, never blind-overwrite a
// concurrent publication. The generation is kept: this is a repair of the
// already committed directory, not a new publication.
function stripEntry(bytes, gameId) {
  const pointer = validateDirectoryPointer(parseJSON(bytes));
  requireValue(sha(Buffer.from(JSON.stringify(directoryPointerBody(pointer)))) === pointer.digest, 'DIRECTORY_CORRUPT');
  const games = pointer.games.filter(entry => entry.gameId !== gameId);
  if (games.length === pointer.games.length) return null;
  const body = directoryPointerBody({ version: 1, authorityId: pointer.authorityId, generation: pointer.generation, games });
  const digest = sha(Buffer.from(JSON.stringify(body)));
  const bytes$ = Buffer.from(JSON.stringify({ version: 1, authorityId: pointer.authorityId, generation: pointer.generation, digest, games: body.games }));
  requireValue(bytes$.length > 0 && bytes$.length <= DIRECTORY_POINTER_LIMIT, 'DIRECTORY_TOO_LARGE');
  return Object.freeze({ bytes: bytes$, digest });
}

export function createGameReclaimer({ r2, prefix = '' }) {
  if (typeof r2?.get !== 'function' || typeof r2?.putControl !== 'function' || typeof r2?.list !== 'function' || typeof r2?.remove !== 'function') throw new TypeError('reclaim requires get/putControl/list/remove ports');
  requireValue(typeof prefix === 'string' && (prefix === '' || /^test\/[A-Za-z0-9_-]{1,100}\/$/.test(prefix)), 'reclaim prefix invalid');
  const pointerKey = prefix + DIRECTORY_POINTER_KEY;

  async function rewritePointer(gameId) {
    for (let attempt = 1; attempt <= CAS_ATTEMPTS; attempt++) {
      const object = await r2.get(pointerKey, { maxBytes: DIRECTORY_POINTER_LIMIT });
      if (object === null) return 'absent';
      requireValue(object.bytes instanceof Uint8Array && object.bytes.byteLength > 0 && object.bytes.byteLength <= DIRECTORY_POINTER_LIMIT, 'DIRECTORY_CORRUPT');
      const next = stripEntry(object.bytes, gameId);
      if (next === null) return 'already-absent';
      const etag = object.headers?.etag ?? object.headers?.Etag ?? null;
      requireValue(typeof etag === 'string' && etag.length > 0, 'DIRECTORY_ETAG');
      // A false result is a lost race, not a failure: the next attempt re-reads
      // whatever the other writer committed and strips from that.
      if (!await r2.putControl(pointerKey, next.bytes, etag)) continue;
      const confirmed = await r2.get(pointerKey, { maxBytes: DIRECTORY_POINTER_LIMIT });
      requireValue(confirmed?.bytes instanceof Uint8Array && Buffer.from(confirmed.bytes).equals(next.bytes), 'DIRECTORY_CONFIRMATION_PENDING');
      return 'removed';
    }
    throw new Error('DIRECTORY_CAS_CONFLICT');
  }

  // Byte reclamation is by prefix only. A game's own runtime, chapters, manifest
  // and generated assets all live under artifacts/<gameId>/; nothing else does.
  async function sweep(gameId) {
    const base = `${prefix}artifacts/${gameId}/`;
    let objects = 0;
    for (let page = 0; page < MAX_SWEEPS; page++) {
      const keys = await r2.list(base, 1000);
      requireValue(Array.isArray(keys) && keys.every(key => typeof key === 'string' && key.startsWith(base)), 'RECLAIM_LIST');
      if (keys.length === 0) return objects;
      for (const key of keys) { await r2.remove(key); objects++; }
    }
    throw new Error('RECLAIM_SWEEP_INCOMPLETE');
  }

  // Pointer first: players lose the game before any byte disappears, so a retry
  // after a partial run never has to answer from a half-deleted runtime.
  return async function reclaimGame(gameId) {
    requireValue(isGameId(gameId), 'PURGE_GAME_ID');
    const pointer = await rewritePointer(gameId);
    return Object.freeze({ gameId, pointer, objects: await sweep(gameId) });
  };
}
