// Browser transport only: no storage, engine state, automatic re-admission or
// resource cache. A capability stays in this closure, never in a URL or DTO.
import { ASSET_TYPES, MAX_METADATA_BYTES, MAX_RESOURCE_BYTES, isGameId, isId, isChapterId, isOrdinal, isDigest, parseJSON, sha256, validateIdentity } from './runtimecontract.js';
const jsonType = value => value === 'application/json' || value === 'application/json; charset=utf-8';
const errors = new Set(['GAME_DELETED', 'GAME_NOT_LISTED', 'RELEASE_CHANGED', 'REGISTRY_CHANGED', 'CHAPTER_REQUIRED', 'ADMISSION_INVALID', 'ADMISSION_NOT_CONFIGURED', 'REGISTRY_EMPTY', 'REGISTRY_MISSING', 'REGISTRY_CORRUPT', 'RUNTIME_UNAVAILABLE', 'RUNTIME_CORRUPT', 'GAME_STATE_UNAVAILABLE', 'READER_UNAVAILABLE', 'FILE_FORBIDDEN', 'RELEASE_UNRECOGNIZED', 'RELEASE_HISTORY_UNAVAILABLE']);
export class PlayerReaderError extends Error {
  constructor(code, status = 0) { super(code); this.name = 'PlayerReaderError'; this.code = code; this.status = status; }
}
const fail = (code, status) => { throw new PlayerReaderError(code, status); };
function check(value) { if (!value) fail('PLAYER_RESPONSE_INVALID'); }
function entry(value) {
  try { validateIdentity(value); } catch { fail('PLAYER_RESPONSE_INVALID'); }
  check(typeof value.name === 'string' && typeof value.publishedAt === 'string' && Array.isArray(value.chapters) && value.chapters.length > 0 && value.chapters.every(id => isChapterId(id, value.gameId)) && new Set(value.chapters).size === value.chapters.length);
  return Object.freeze({ gameId: value.gameId, releaseId: value.releaseId, ordinal: value.ordinal, revision: value.revision, sourceDigest: value.sourceDigest, name: value.name, publishedAt: value.publishedAt, chapters: Object.freeze([...value.chapters]) });
}
export function createPlayerReader({ origin, fetch: transport = globalThis.fetch, timeoutMs = 60000 }) {
  let parsed;
  try { parsed = new URL(origin); } catch { throw new TypeError('player HTTPS origin required'); }
  if (parsed.protocol !== 'https:' || parsed.origin !== origin || typeof transport !== 'function' || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000) throw new TypeError('player HTTPS origin, fetch and bounded timeout required');
  async function request(path, params, token, max, guard = () => {}) {
    guard();
    const url = new URL(path, origin);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const controller = new AbortController();
    let timer, reader, bodyComplete = false;
    const cancelReader = () => { if (reader) { try { void reader.cancel().catch(() => {}); } catch { /* Already released/closed. */ } } };
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); cancelReader(); reject(new PlayerReaderError('PLAYER_TIMEOUT')); }, timeoutMs); });
    async function run() {
      const response = await transport(url.href, { method: 'GET', credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', signal: controller.signal, headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (controller.signal.aborted) { try { void response.body?.cancel().catch(() => {}); } catch { /* Closed response. */ } fail('PLAYER_TIMEOUT'); }
      check(response.body && typeof response.body.getReader === 'function');
      reader = response.body.getReader();
      guard();
      check(!response.redirected && (!response.url || response.url === url.href));
      const limit = response.ok ? max : 4096;
      const length = response.headers.get('content-length');
      check(length === null || /^\d+$/.test(length) && Number.isSafeInteger(Number(length)) && Number(length) <= limit);
      const chunks = []; let size = 0;
      for (;;) {
        const next = await reader.read(); guard();
        if (controller.signal.aborted) fail('PLAYER_TIMEOUT');
        if (next.done) { bodyComplete = true; break; }
        check(next.value instanceof Uint8Array && next.value.length > 0 && next.value.length <= limit - size);
        size += next.value.length; chunks.push(next.value);
      }
      check(size > 0);
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      if (!response.ok) {
        let value;
        try { value = parseJSON(bytes); } catch { fail('PLAYER_RESPONSE_INVALID', response.status); }
        check(jsonType(response.headers.get('content-type')));
        // Only the reader's explicit deletion fact is terminal; arbitrary 410s,
        // missing resources and malformed errors are not deletion evidence.
        if (response.status === 410 && value?.error === 'GAME_DELETED' && (value.gameId === undefined || value.gameId === params.game)) fail('GAME_DELETED', 410);
        const code = errors.has(value?.error) && value.error !== 'GAME_DELETED' ? value.error : 'PLAYER_REQUEST_FAILED';
        fail(code, response.status);
      }
      return { bytes, type: response.headers.get('content-type'), digest: response.headers.get('x-content-sha256') };
    }
    try { return await Promise.race([run(), timeout]); }
    catch (error) { if (error instanceof PlayerReaderError) throw error; fail('PLAYER_NETWORK_UNAVAILABLE'); }
    finally {
      clearTimeout(timer);
      // Aborting an already consumed response produces spurious request failures
      // in browsers. Only unfinished I/O needs cancellation (including timeouts).
      if (!bodyComplete) { controller.abort(); cancelReader(); }
      else { try { reader.releaseLock(); } catch { /* Already released. */ } }
    }
  }
  async function json(path, params = {}, guard) {
    const result = await request(path, params, null, MAX_METADATA_BYTES, guard);
    check(jsonType(result.type));
    try { return parseJSON(result.bytes); } catch { fail('PLAYER_RESPONSE_INVALID'); }
  }
  async function registry({ announcementCursor } = {}) {
    const paged = announcementCursor !== undefined;
    if (paged && announcementCursor !== null && (typeof announcementCursor !== 'string' || !announcementCursor || announcementCursor.length > 1024)) throw new TypeError('announcement cursor required');
    const params = {};
    if (paged) {
      params.announcementPage = '1';
      if (announcementCursor !== null) params.cursor = announcementCursor;
    }
    const value = await json('/play-api/v1/registry', params);
    check(Number.isSafeInteger(value?.generation) && value.generation > 0 && isDigest(value.digest) && Array.isArray(value.directory));
    const directory = value.directory.map(entry), listed = new Map();
    for (const row of directory) { check(!listed.has(row.gameId)); listed.set(row.gameId, row.ordinal); }
    let announcements = [], announcementsError = null, announcementPage = null;
    // Announcement corruption is independent of a valid directory (Q36).
    // Whitelist public fields; never turn absent/hidden rows into deletion facts.
    try {
      check(!Object.hasOwn(value, 'announcementsError') && Array.isArray(value.announcements));
      if (paged) {
        const page = value.announcementPage;
        check(page && typeof page.reset === 'boolean' && (page.nextCursor === null || typeof page.nextCursor === 'string' && page.nextCursor.length > 0 && page.nextCursor.length <= 1024 && page.nextCursor !== announcementCursor) && value.announcements.length <= 30);
        announcementPage = Object.freeze({ reset: page.reset, nextCursor: page.nextCursor });
      }
      const seen = new Set();
      for (const row of value.announcements) {
        if (!listed.has(row?.gameId)) continue;
        check(isOrdinal(row.ordinal) && BigInt(row.ordinal.slice(2)) <= BigInt(listed.get(row.gameId).slice(2)));
        const key = row.gameId + ':' + row.ordinal;
        check(!seen.has(key) && ['name', 'creatorAccount', 'publishedAt', 'firstOnlineAt'].every(field => typeof row[field] === 'string'));
        if (paged) check(row.announcementId === key);
        seen.add(key);
        announcements.push(Object.freeze({ ...(paged ? { announcementId: key } : {}), gameId: row.gameId, ordinal: row.ordinal, name: row.name,
          creatorAccount: row.creatorAccount, publishedAt: row.publishedAt, firstOnlineAt: row.firstOnlineAt }));
      }
    } catch { announcements = []; announcementPage = null; announcementsError = 'ANNOUNCEMENTS_UNAVAILABLE'; }
    return Object.freeze({ generation: value.generation, digest: value.digest, directory: Object.freeze(directory),
      announcements: Object.freeze(announcements), announcementsError, ...(paged ? { announcementPage } : {}) });
  }
  async function status(gameId, guard) {
    if (!isGameId(gameId)) throw new TypeError('game ID required');
    const value = await json('/play-api/v1/status', { game: gameId }, guard);
    check(value?.gameId === gameId && typeof value.listed === 'boolean');
    if (value.listed) return Object.freeze({ ...entry(value), listed: true });
    if (value.currentRelease === undefined) return Object.freeze({ gameId, listed: false });
    const current = value.currentRelease;
    check(current && Object.keys(current).length === 2 && isId(current.releaseId) && isOrdinal(current.ordinal));
    return Object.freeze({ gameId, listed: false, currentRelease: Object.freeze({ releaseId: current.releaseId, ordinal: current.ordinal }) });
  }
  // Read-only recognition of an exact formal release. This is neither an old
  // admission capability nor a validity/deletion certificate for a local save.
  async function release({ gameId, releaseId, ordinal }) {
    if (!isGameId(gameId) || !isGameId(releaseId) || !isOrdinal(ordinal)) throw new TypeError('game UUID, release UUID and formal ordinal required');
    const value = await json('/play-api/v1/releases', { game: gameId, release: releaseId, ordinal });
    const saved = entry(value?.saved), current = entry(value?.current);
    check(saved.gameId === gameId && saved.releaseId === releaseId && saved.ordinal === ordinal &&
      current.gameId === gameId && isGameId(current.releaseId) && isDigest(value.saved.manifestDigest));
    const before = BigInt(saved.ordinal.slice(2)), now = BigInt(current.ordinal.slice(2));
    check(before <= now);
    if (before === now) {
      check(['releaseId', 'revision', 'sourceDigest', 'name', 'publishedAt'].every(key => saved[key] === current[key]) &&
        JSON.stringify(saved.chapters) === JSON.stringify(current.chapters));
    } else check(saved.releaseId !== current.releaseId);
    return Object.freeze({ saved: Object.freeze({ ...saved, manifestDigest: value.saved.manifestDigest }), current });
  }
  async function admit({ gameId, ordinal, chapterId }) {
    if (!isGameId(gameId) || !isOrdinal(ordinal) || !isChapterId(chapterId, gameId)) throw new TypeError('current game, ordinal and chapter required');
    const value = await json('/play-api/v1/admissions', { game: gameId, ordinal, chapter: chapterId });
    const selected = entry(value);
    check(selected.gameId === gameId && selected.ordinal === ordinal && value.chapterId === chapterId && selected.chapters.includes(chapterId) && isDigest(value.manifestDigest) && value.fileEndpoint === '/play-api/v1/file' && typeof value.ticket === 'string' && /^[A-Za-z0-9_.-]{1,4096}$/.test(value.ticket));
    const identity = Object.freeze({ ...selected, chapterId, manifestDigest: value.manifestDigest });
    let token = value.ticket, state = 'active';
    function current() {
      if (state === 'deleted') fail('GAME_DELETED', 410);
      if (state === 'outdated') fail('RELEASE_CHANGED', 409);
      if (state !== 'active') fail('PLAYER_SESSION_CLOSED');
    }
    async function observe(action) {
      current();
      try { const result = await action(); current(); return result; }
      catch (error) {
        current();
        if (error instanceof PlayerReaderError && error.code === 'GAME_DELETED' && error.status === 410) { state = 'deleted'; token = null; }
        if (error instanceof PlayerReaderError && error.code === 'RELEASE_CHANGED' && error.status === 409) { state = 'outdated'; token = null; }
        throw error;
      }
    }
    async function read(role) {
      const asset = typeof role === 'string' && role.startsWith('asset:') ? role.slice(6) : null;
      if (role !== 'manifest' && role !== `chapter:${chapterId}` && !(asset && (Object.hasOwn(ASSET_TYPES, asset) || /^p?[0-9]{1,6}$/.test(asset)))) throw new TypeError('admitted resource role required');
      return observe(async () => {
        const result = await request('/play-api/v1/file', { role }, token, role === 'manifest' ? MAX_METADATA_BYTES : MAX_RESOURCE_BYTES, current);
        const type = asset ? ASSET_TYPES[asset] ?? 'image/png' : 'application/json';
        check(type === 'application/json' ? jsonType(result.type) : result.type === type);
        check(isDigest(result.digest) && await sha256(result.bytes) === result.digest);
        if (role === 'manifest') check(result.digest === identity.manifestDigest);
        if (type === 'application/json') { try { parseJSON(result.bytes); } catch { fail('PLAYER_RESPONSE_INVALID'); } }
        current();
        return Object.freeze({ bytes: result.bytes, contentType: type, sha256: result.digest });
      });
    }
    return Object.freeze({ identity, read, status: () => observe(() => status(gameId, current)), state: () => state, close() { if (state === 'active') state = 'closed'; token = null; } });
  }
  return Object.freeze({ registry, admit, status, release });
}
