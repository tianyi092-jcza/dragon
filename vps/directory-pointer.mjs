// Node 侧：把一份已冻结的 projection 整形成游戏级目录指针，并用 CAS 写入 R2。
// 只搬运与整形：不读 SQL、不取当前时间、不补默认值。指针按 gameId 分条，
// 因此删除一个游戏只是从 games 移除该条，不需要引用计数或退役账本。
import { createHash } from 'node:crypto';
import { DIRECTORY_POINTER_KEY, DIRECTORY_POINTER_LIMIT, directoryPointerBody, validateDirectoryPointer } from '../reader/directorypointer.js';
import { isChapterId, requireValue, sameIdentity } from '../reader/runtimecontract.js';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');

// Faithful reshaping: every game the frozen projection knows keeps its state, so
// a tombstone still answers GAME_DELETED; listed games carry their own directory.
export function directoryPointerFromProjection(projection, { authorityId, generation }) {
  requireValue(projection && Array.isArray(projection.directory) && Array.isArray(projection.gameStates) && Array.isArray(projection.releases) && Array.isArray(projection.announcements), 'DIRECTORY_PROJECTION');
  const states = new Map(), releases = new Map(), visible = new Map(), announced = new Map();
  for (const row of projection.gameStates) { requireValue(!states.has(row.gameId), 'DIRECTORY_PROJECTION'); states.set(row.gameId, row); }
  for (const row of projection.releases) { requireValue(!releases.has(row.game_id), 'DIRECTORY_PROJECTION'); releases.set(row.game_id, row); }
  for (const row of projection.directory) { requireValue(!visible.has(row.gameId), 'DIRECTORY_PROJECTION'); visible.set(row.gameId, row); }
  for (const row of projection.announcements) {
    const list = announced.get(row.gameId) ?? [];
    requireValue(Array.isArray(list), 'DIRECTORY_PROJECTION');
    list.push({ ordinal: row.ordinal, name: row.name, creatorAccount: row.creatorAccount, publishedAt: row.publishedAt, firstOnline: { ...row.firstOnline } });
    announced.set(row.gameId, list);
  }
  // Never invent or drop a game: the state list is the complete authority view,
  // the directory and announcements must be strict subsets of it.
  for (const gameId of [...visible.keys(), ...releases.keys(), ...announced.keys()]) requireValue(states.has(gameId), 'DIRECTORY_PROJECTION');
  const games = [...states.keys()].sort().map(gameId => {
    const state = states.get(gameId), row = visible.get(gameId);
    requireValue(typeof state.listed === 'boolean' && (state.deleted === undefined || state.deleted === true) && !(state.deleted === true && state.listed), 'DIRECTORY_PROJECTION');
    const entry = { gameId, listed: state.listed };
    if (state.deleted === true) entry.deleted = true;
    if (state.currentRelease !== undefined) entry.currentRelease = { releaseId: state.currentRelease.releaseId, ordinal: state.currentRelease.ordinal };
    if (!state.listed) {
      requireValue(row === undefined && !releases.has(gameId) && !announced.has(gameId), 'DIRECTORY_PROJECTION');
      return entry;
    }
    const release = releases.get(gameId);
    requireValue(row && release, 'DIRECTORY_PROJECTION');
    requireValue(sameIdentity(row, { gameId, releaseId: release.release_id, ordinal: release.ordinal, revision: release.draft_revision, sourceDigest: release.source_digest }), 'DIRECTORY_PROJECTION');
    if (state.currentRelease !== undefined) requireValue(state.currentRelease.releaseId === release.release_id && state.currentRelease.ordinal === release.ordinal, 'DIRECTORY_PROJECTION');
    requireValue(typeof row.name === 'string' && row.name.length > 0 && typeof row.publishedAt === 'string', 'DIRECTORY_PROJECTION');
    requireValue(Array.isArray(row.chapters) && row.chapters.length > 0 && row.chapters.every(chapter => isChapterId(chapter, gameId)) && new Set(row.chapters).size === row.chapters.length, 'DIRECTORY_PROJECTION');
    entry.release = { releaseId: release.release_id, ordinal: release.ordinal, revision: release.draft_revision, sourceDigest: release.source_digest, runtime: { key: release.runtime.key, sha256: release.runtime.sha256, byteLength: release.runtime.byteLength } };
    entry.directory = { name: row.name, publishedAt: row.publishedAt, chapters: [...row.chapters] };
    entry.announcements = (announced.get(gameId) ?? []).sort((a, b) => {
      if (a.ordinal === b.ordinal) return 0;
      return BigInt(a.ordinal.slice(2)) < BigInt(b.ordinal.slice(2)) ? -1 : 1;
    });
    return entry;
  });
  const body = directoryPointerBody({ version: 1, authorityId, generation, games });
  const bodyBytes = Buffer.from(JSON.stringify(body));
  requireValue(bodyBytes.length > 0 && bodyBytes.length <= DIRECTORY_POINTER_LIMIT, 'DIRECTORY_TOO_LARGE');
  const digest = sha(bodyBytes);
  // 写入的是带 digest 的信封；digest 覆盖的是不带 digest 的同一份 body。
  const pointer = validateDirectoryPointer({ version: 1, authorityId, generation, digest, games: body.games });
  const bytes = Buffer.from(JSON.stringify(pointer));
  requireValue(bytes.length <= DIRECTORY_POINTER_LIMIT, 'DIRECTORY_TOO_LARGE');
  return Object.freeze({ pointer, bytes, digest, bodyBytes });
}

// The pointer carries no generation counter of its own: it is bound to the root
// generation it describes, so a stale pointer is detectable rather than merged.
// A failed CAS is not a failed publish; the caller decides the recovery order.
export async function writeDirectoryPointer(r2, prefix, { bytes, digest }) {
  requireValue(typeof prefix === 'string' && (prefix === '' || /^test\/[A-Za-z0-9_-]{1,100}\/$/.test(prefix)), 'directory prefix invalid');
  const key = prefix + DIRECTORY_POINTER_KEY;
  const prior = await r2.get(key, { maxBytes: DIRECTORY_POINTER_LIMIT });
  if (prior !== null) {
    const stored = Buffer.from(prior.bytes);
    if (stored.equals(Buffer.from(bytes))) { return Object.freeze({ key, digest, written: false }); }
    requireValue(stored.length > 0 && stored.length <= DIRECTORY_POINTER_LIMIT, 'DIRECTORY_CORRUPT');
  }
  const etag = prior === null ? null : prior.headers?.etag ?? prior.headers?.Etag ?? null;
  requireValue(prior === null || typeof etag === 'string' && etag.length > 0, 'DIRECTORY_ETAG');
  const committed = await r2.putControl(key, bytes, etag);
  // A false result or a lost response is an unknown visibility, never a rollback.
  if (!committed) { throw new Error('DIRECTORY_CAS_CONFLICT'); }
  const confirmed = await r2.get(key, { maxBytes: DIRECTORY_POINTER_LIMIT });
  if (!confirmed || !Buffer.from(confirmed.bytes).equals(Buffer.from(bytes))) { throw new Error('DIRECTORY_CONFIRMATION_PENDING'); }
  return Object.freeze({ key, digest, written: true });
}
