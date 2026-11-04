// 游戏级目录指针（方案 B 的「在架指针」）。R2 上与某个游戏相关的最小对象：
// 每个 gameId 一条 entry，游戏数据按 gameId 物理分条，删除游戏 = 从 games 移除该条。
// 这是传输契约，不是权限、历史或可见性证明：章节/素材字节仍按 runtime index 的
// sha256 逐字节校验，准入仍走 admission ticket。
import { isChapterId, isDigest, isGameId, isId, isOrdinal, requireValue, validateRuntimeReference } from './runtimecontract.js';
import { validateFirstOnlineReference } from './firstonline.js';

export const DIRECTORY_POINTER_KEY = 'control/directory.json';
export const DIRECTORY_POINTER_LIMIT = 4096 * 1024;
const OPTIONAL = ['deleted', 'currentRelease', 'release', 'directory', 'announcements'];
const check = value => requireValue(value, 'REGISTRY_CORRUPT');

function exact(value, required, optional = []) {
  check(value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => required.includes(key) || optional.includes(key)) && required.every(key => Object.hasOwn(value, key)));
  return value;
}
function iso(value) {
  check(typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value);
  return value;
}
function identityOf(entry) { return { gameId: entry.gameId, releaseId: entry.release.releaseId, ordinal: entry.release.ordinal, revision: entry.release.revision, sourceDigest: entry.release.sourceDigest }; }

// One entry per game. A listed game carries its own directory (name, chapter order)
// and its runtime index reference; anything else carries no game content at all.
function validateEntry(entry) {
  exact(entry, ['gameId', 'listed'], OPTIONAL);
  check(isGameId(entry.gameId) && typeof entry.listed === 'boolean');
  check(!(entry.deleted !== undefined && entry.listed));
  if (entry.deleted !== undefined) check(entry.deleted === true);
  if (entry.currentRelease !== undefined) {
    exact(entry.currentRelease, ['releaseId', 'ordinal']);
    check(isId(entry.currentRelease.releaseId) && isOrdinal(entry.currentRelease.ordinal));
  }
  if (!entry.listed) {
    // Unlisted games expose no directory and no runtime; the reader answers an
    // outage, never a guess. Only a tombstone may remain for 410 GAME_DELETED.
    check(entry.release === undefined && entry.directory === undefined && entry.announcements === undefined);
    check(!entry.currentRelease || !entry.deleted);
    return entry;
  }
  // currentRelease is optional exactly as in the reader view: when it is absent the
  // release carried by the entry is the running one. When present it must agree.
  check(!entry.deleted && entry.release !== undefined && entry.directory !== undefined && entry.announcements !== undefined);
  exact(entry.release, ['releaseId', 'ordinal', 'revision', 'sourceDigest', 'runtime']);
  exact(entry.release.runtime, ['key', 'sha256', 'byteLength']);
  validateRuntimeReference(identityOf(entry), entry.release.runtime);
  if (entry.currentRelease !== undefined) check(entry.currentRelease.releaseId === entry.release.releaseId && entry.currentRelease.ordinal === entry.release.ordinal);
  exact(entry.directory, ['name', 'publishedAt', 'chapters']);
  check(typeof entry.directory.name === 'string' && entry.directory.name.length > 0);
  iso(entry.directory.publishedAt);
  const chapters = entry.directory.chapters;
  check(Array.isArray(chapters) && chapters.length > 0 && chapters.every(chapter => isChapterId(chapter, entry.gameId)) && new Set(chapters).size === chapters.length);
  check(Array.isArray(entry.announcements) && entry.announcements.length <= 1024);
  return entry;
}

function validateGames(games) {
  check(Array.isArray(games) && games.length <= 4096);
  let previous = null;
  for (const entry of games) {
    validateEntry(entry);
    // Canonical order: strict ascending gameId. Not an array index or a timestamp.
    check(previous === null || previous < entry.gameId);
    previous = entry.gameId;
  }
  return games;
}

// Shape only. The digest is checked by the caller, which owns its hash primitive.
export function validateDirectoryPointer(value) {
  exact(value, ['version', 'authorityId', 'generation', 'digest', 'games']);
  check(value.version === 1 && isGameId(value.authorityId) && isDigest(value.digest));
  check(Number.isSafeInteger(value.generation) && value.generation > 0);
  const games = validateGames(value.games);
  for (const entry of games) {
    if (!entry.listed) continue;
    const ordinals = new Set();
    for (const row of entry.announcements) {
      exact(row, ['ordinal', 'name', 'creatorAccount', 'publishedAt', 'firstOnline']);
      check(isOrdinal(row.ordinal) && BigInt(row.ordinal.slice(2)) <= BigInt(entry.release.ordinal.slice(2)) && !ordinals.has(row.ordinal));
      ordinals.add(row.ordinal);
      check(typeof row.name === 'string' && typeof row.creatorAccount === 'string');
      iso(row.publishedAt);
      validateFirstOnlineReference(row.firstOnline, { authorityId: value.authorityId, generation: value.generation });
    }
  }
  return value;
}

// The exact bytes whose sha256 is pointer.digest. Field order is part of it.
// Accepts an envelope without a digest so the writer can hash what it just built.
export function directoryPointerBody(value) {
  exact(value, ['version', 'authorityId', 'generation', 'games'], ['digest']);
  check(value.version === 1 && isGameId(value.authorityId) && Number.isSafeInteger(value.generation) && value.generation > 0);
  return { version: value.version, authorityId: value.authorityId, generation: value.generation, games: validateGames(value.games).map(entry => {
    const body = { gameId: entry.gameId, listed: entry.listed };
    if (entry.deleted !== undefined) body.deleted = true;
    if (entry.currentRelease !== undefined) body.currentRelease = { releaseId: entry.currentRelease.releaseId, ordinal: entry.currentRelease.ordinal };
    if (entry.release !== undefined) body.release = { releaseId: entry.release.releaseId, ordinal: entry.release.ordinal, revision: entry.release.revision, sourceDigest: entry.release.sourceDigest, runtime: { key: entry.release.runtime.key, sha256: entry.release.runtime.sha256, byteLength: entry.release.runtime.byteLength } };
    if (entry.directory !== undefined) body.directory = { name: entry.directory.name, publishedAt: entry.directory.publishedAt, chapters: [...entry.directory.chapters] };
    if (entry.announcements !== undefined) body.announcements = entry.announcements.map(row => ({ ordinal: row.ordinal, name: row.name, creatorAccount: row.creatorAccount, publishedAt: row.publishedAt, firstOnline: { ...row.firstOnline } }));
    return body;
  }) };
}

// Reader-side materialization into the same view the legacy projection produced.
// No announcement receipt is resolved here: firstOnline references stay unresolved.
export function directoryState(value) {
  const states = new Map(), directory = [], releases = new Map(), announcementRows = [];
  for (const entry of validateDirectoryPointer(value).games) {
    states.set(entry.gameId, { gameId: entry.gameId, listed: entry.listed,
      ...(entry.deleted !== undefined ? { deleted: true } : {}),
      ...(entry.currentRelease !== undefined ? { currentRelease: { releaseId: entry.currentRelease.releaseId, ordinal: entry.currentRelease.ordinal } } : {}) });
    if (!entry.listed) continue;
    const identity = identityOf(entry);
    releases.set(entry.gameId, { ...identity, runtime: { ...entry.release.runtime } });
    directory.push({ gameId: entry.gameId, name: entry.directory.name, releaseId: identity.releaseId, ordinal: identity.ordinal, revision: identity.revision, sourceDigest: identity.sourceDigest, publishedAt: entry.directory.publishedAt, chapters: [...entry.directory.chapters] });
    for (const row of entry.announcements) announcementRows.push({ gameId: entry.gameId, ordinal: row.ordinal, name: row.name, creatorAccount: row.creatorAccount, publishedAt: row.publishedAt, firstOnline: { ...row.firstOnline } });
  }
  return { states, directory, releases, announcementRows };
}
