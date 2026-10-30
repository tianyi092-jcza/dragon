// Read-only publication worker. Never deploy the old prefix-only file API.
// Signed capabilities remain bound to the current formal release. Updating a
// game invalidates older capabilities; missing state is NOT physical deletion.
import { issueAdmission, verifyAdmission } from './admission.js';
import { validatePublicationRoot, publicationRootArchiveKey } from './publicationroot.js';
import { validateFirstOnlineReference, firstOnlineReceiptKey, rootVisibleAt, receiptVisibleAt } from './firstonline.js';
import { MAX_METADATA_BYTES, isGameId, isId, isChapterId, isOrdinal, parseJSON, requireValue, sameIdentity, sha256, validateIndex, validateRuntimeReference } from './runtimecontract.js';
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' } });
class ReadError extends Error {
  constructor(code, status) { super(code); this.status = status; }
}
function stop(code, status = 503) { throw new ReadError(code, status); }
async function bytesFrom(object, max, code) {
  if (!object || !Number.isSafeInteger(object.size) || object.size < 1 || object.size > max) { stop(code); }
  const bytes = new Uint8Array(await object.arrayBuffer());
  if (bytes.length !== object.size) { stop(code); }
  return bytes;
}
async function readChecked(env, ref) {
  const bytes = await bytesFrom(await env.PUBLISH_BUCKET.get(ref.key), ref.byteLength, 'RUNTIME_UNAVAILABLE');
  if (bytes.length !== ref.byteLength || await sha256(bytes) !== ref.sha256) { stop('RUNTIME_CORRUPT'); }
  return bytes;
}
const releaseIdentity = row => ({ gameId: row.game_id, releaseId: row.release_id, ordinal: row.ordinal, revision: row.draft_revision, sourceDigest: row.source_digest });
async function snapshot(env, archived = null) {
  const object = archived ?? await env.PUBLISH_BUCKET.get('control/current.json');
  if (!object) { stop('REGISTRY_EMPTY'); }
  const rootBytes = await bytesFrom(object, 4096, 'REGISTRY_CORRUPT');
  const control = validatePublicationRoot(parseJSON(rootBytes));
  const rootDigest = await sha256(rootBytes);
  const bytes = await bytesFrom(await env.PUBLISH_BUCKET.get(`projections/${control.generation}/${control.digest}/projection.json`), MAX_METADATA_BYTES, 'REGISTRY_MISSING');
  requireValue(await sha256(bytes) === control.digest, 'REGISTRY_CORRUPT');
  const projection = parseJSON(bytes);
  requireValue((projection?.runtimeVersion === 1 || projection?.runtimeVersion === 2 && control.version === 2) && Array.isArray(projection.directory) && Array.isArray(projection.gameStates) && Array.isArray(projection.releases), 'REGISTRY_CORRUPT');
  const states = new Map();
  for (const row of projection.gameStates) {
    requireValue(isGameId(row?.gameId) && typeof row.listed === 'boolean' && (row.deleted === undefined || typeof row.deleted === 'boolean') && !(row.deleted && row.listed) && !states.has(row.gameId), 'REGISTRY_CORRUPT');
    if (row.currentRelease !== undefined) {
      const current = row.currentRelease;
      requireValue(!row.deleted && current && Object.keys(current).length === 2 && isId(current.releaseId) && isOrdinal(current.ordinal), 'REGISTRY_CORRUPT');
    }
    states.set(row.gameId, row);
  }
  const releaseMap = new Map();
  for (const row of projection.releases) {
    const identity = releaseIdentity(row);
    validateRuntimeReference(identity, row.runtime);
    requireValue(!releaseMap.has(identity.gameId), 'REGISTRY_CORRUPT');
    releaseMap.set(identity.gameId, { ...identity, runtime: row.runtime });
  }
  const directory = [], ids = new Set();
  for (const row of projection.directory) {
    const release = releaseMap.get(row?.gameId);
    requireValue(release && sameIdentity(row, release) && states.get(row.gameId)?.listed === true && !states.get(row.gameId)?.deleted && !ids.has(row.gameId), 'REGISTRY_CORRUPT');
    requireValue(typeof row.name === 'string' && typeof row.publishedAt === 'string' && Array.isArray(row.chapters) && row.chapters.length > 0 && row.chapters.every(chapter => isChapterId(chapter, row.gameId)) && new Set(row.chapters).size === row.chapters.length, 'REGISTRY_CORRUPT');
    const current = states.get(row.gameId).currentRelease;
    requireValue(!current || current.releaseId === row.releaseId && current.ordinal === row.ordinal, 'REGISTRY_CORRUPT');
    ids.add(row.gameId);
    directory.push({ gameId: row.gameId, name: row.name, releaseId: row.releaseId, ordinal: row.ordinal, revision: row.revision, sourceDigest: row.sourceDigest, publishedAt: row.publishedAt, chapters: row.chapters });
  }
  requireValue(directory.length === releaseMap.size, 'REGISTRY_CORRUPT');
  return { control, rootDigest, states, directory, releases: releaseMap, announcementRows: projection.announcements, runtimeVersion: projection.runtimeVersion, uploaded: object.uploaded };
}
async function registry(env, state, params) {
  const result = { generation: state.control.generation, digest: state.control.digest, directory: state.directory };
  // Q36: announcements are not an admission or running-resource dependency.
  // Keep a failed announcement result distinct from a valid empty list. The
  // root/projection/directory checks above still fail the entire registry.
  try {
    requireValue(Array.isArray(state.announcementRows), 'ANNOUNCEMENTS_UNAVAILABLE');
    const ids = new Map(state.directory.map(row => [row.gameId, row.ordinal]));
    const announcements = [], receipts = new Map(), seen = new Set();
    for (const row of state.announcementRows.filter(value => ids.has(value?.gameId))) {
      const announcementKey = `${row.gameId}:${row.ordinal}`;
      requireValue(isOrdinal(row.ordinal) && BigInt(row.ordinal.slice(2)) <= BigInt(ids.get(row.gameId).slice(2)) && !seen.has(announcementKey) && ['name', 'creatorAccount', 'publishedAt'].every(key => typeof row[key] === 'string'), 'ANNOUNCEMENTS_UNAVAILABLE');
      seen.add(announcementKey);
      let firstOnlineAt = row.firstOnlineAt;
      if (state.runtimeVersion === 2) {
        requireValue(!Object.hasOwn(row, 'firstOnlineAt'), 'ANNOUNCEMENTS_UNAVAILABLE');
        const ref = validateFirstOnlineReference(row.firstOnline, state.control);
        if (ref.generation === state.control.generation) {
          requireValue(row.ordinal === ids.get(row.gameId), 'ANNOUNCEMENTS_UNAVAILABLE');
          firstOnlineAt = rootVisibleAt(state.uploaded);
        } else {
          const key = firstOnlineReceiptKey(ref, state.control);
          if (!receipts.has(key)) {
            const object = await env.PUBLISH_BUCKET.get(key);
            requireValue(['application/json', 'application/json; charset=utf-8'].includes(object?.httpMetadata?.contentType), 'ANNOUNCEMENTS_UNAVAILABLE');
            receipts.set(key, await bytesFrom(object, 4096, 'ANNOUNCEMENTS_UNAVAILABLE'));
          }
          firstOnlineAt = receiptVisibleAt(receipts.get(key), ref, state.control);
        }
      }
      requireValue(typeof firstOnlineAt === 'string', 'ANNOUNCEMENTS_UNAVAILABLE');
      announcements.push({ gameId: row.gameId, ordinal: row.ordinal, name: row.name, creatorAccount: row.creatorAccount, publishedAt: row.publishedAt, firstOnlineAt });
    }
    if (!params.has('announcementPage')) return json({ ...result, announcements });
    requireValue(params.getAll('announcementPage').length === 1 && params.get('announcementPage') === '1' && params.getAll('cursor').length <= 1 && [...params.keys()].every(key => ['announcementPage', 'cursor'].includes(key)), 'ANNOUNCEMENTS_UNAVAILABLE');
    // Frozen projections have no SQL row ID. The already-unique public pair is
    // a stable transport identity, not an array index or a new source entity.
    const ordered = announcements.map(row => {
      requireValue(new Date(row.firstOnlineAt).toISOString() === row.firstOnlineAt, 'ANNOUNCEMENTS_UNAVAILABLE');
      return { ...row, announcementId: `${row.gameId}:${row.ordinal}` };
    }).sort((a, b) => {
      if (a.firstOnlineAt !== b.firstOnlineAt) return a.firstOnlineAt < b.firstOnlineAt ? 1 : -1;
      if (a.announcementId === b.announcementId) return 0;
      return a.announcementId < b.announcementId ? 1 : -1;
    });
    let start = 0, reset = false;
    if (params.has('cursor')) {
      const raw = params.get('cursor');
      requireValue(raw.length <= 1024, 'ANNOUNCEMENTS_UNAVAILABLE');
      const cursor = JSON.parse(raw);
      requireValue(cursor && Object.keys(cursor).length === 4 && Number.isSafeInteger(cursor.generation) && cursor.generation > 0 && typeof cursor.digest === 'string' && /^[a-f0-9]{64}$/.test(cursor.digest) && typeof cursor.time === 'string' && typeof cursor.id === 'string', 'ANNOUNCEMENTS_UNAVAILABLE');
      reset = cursor.generation !== result.generation || cursor.digest !== result.digest;
      if (!reset) {
        const index = ordered.findIndex(row => row.firstOnlineAt === cursor.time && row.announcementId === cursor.id);
        requireValue(index !== -1, 'ANNOUNCEMENTS_UNAVAILABLE');
        start = index + 1;
      }
    }
    const page = ordered.slice(start, start + 30), last = page.at(-1);
    const nextCursor = start + page.length < ordered.length ? JSON.stringify({ generation: result.generation, digest: result.digest, time: last.firstOnlineAt, id: last.announcementId }) : null;
    return json({ ...result, announcements: page, announcementPage: { reset, nextCursor } });
  } catch {
    return json({ ...result, announcements: [], announcementsError: 'ANNOUNCEMENTS_UNAVAILABLE' });
  }
}
function checkRunningState(state, gameId, identity = null) {
  const row = state.states.get(gameId);
  if (row?.deleted === true) { stop('GAME_DELETED', 410); }
  // Unknown/missing state is an outage, not deletion or permission to guess.
  if (!row) { stop('GAME_STATE_UNAVAILABLE'); }
  if (identity) {
    const current = row.currentRelease ?? state.releases.get(gameId);
    if (!current) stop('GAME_STATE_UNAVAILABLE');
    if (current.releaseId !== identity.releaseId || current.ordinal !== identity.ordinal) stop('RELEASE_CHANGED', 409);
  }
}
async function runtimeIndex(env, identity, ref) {
  validateRuntimeReference(identity, ref);
  const index = validateIndex(parseJSON(await readChecked(env, ref)));
  requireValue(sameIdentity(index, identity), 'RUNTIME_CORRUPT');
  return index;
}
async function admit(url, env) {
  const gameId = url.searchParams.get('game'), ordinal = url.searchParams.get('ordinal'), chapterId = url.searchParams.get('chapter');
  if (!isGameId(gameId) || !isOrdinal(ordinal) || !isChapterId(chapterId, gameId)) { stop('ADMISSION_INPUT', 422); }
  const state = await snapshot(env);
  if (state.states.get(gameId)?.deleted) { stop('GAME_DELETED', 410); }
  const entry = state.directory.find(row => row.gameId === gameId);
  if (!entry) { stop('GAME_NOT_LISTED', 403); }
  if (entry.ordinal !== ordinal) { stop('RELEASE_CHANGED', 409); }
  if (!entry.chapters.includes(chapterId)) { stop('CHAPTER_REQUIRED', 422); }
  const release = state.releases.get(gameId), index = await runtimeIndex(env, release, release.runtime);
  requireValue(JSON.stringify(index.chapters) === JSON.stringify(entry.chapters), 'RUNTIME_CORRUPT');
  const ticket = await issueAdmission(env, url.origin, release, chapterId, release.runtime);
  // Admission linearizes at this final root observation, not before an await
  // that can race update/unlisting. No ticket is returned for a stale selection.
  const current = await snapshot(env);
  if (current.rootDigest !== state.rootDigest) { stop('REGISTRY_CHANGED', 409); }
  return json({ ...entry, chapterId, manifestDigest: index.resources.manifest.sha256, ticket, fileEndpoint: '/play-api/v1/file' });
}
// Metadata recognition, never an old-game admission or local deletion grant.
// The private bucket's candidate files alone are insufficient: a historical
// first-online reference must reach an observed receipt and its exact root.
async function releaseHistory(url, env) {
  const keys = ['game', 'release', 'ordinal'];
  if ([...url.searchParams.keys()].some(key => !keys.includes(key)) || keys.some(key => url.searchParams.getAll(key).length !== 1)) stop('RELEASE_INPUT', 422);
  const gameId = url.searchParams.get('game'), releaseId = url.searchParams.get('release'), ordinal = url.searchParams.get('ordinal');
  if (!isGameId(gameId) || !isGameId(releaseId) || !isOrdinal(ordinal)) stop('RELEASE_INPUT', 422);
  const state = await snapshot(env);
  checkRunningState(state, gameId);
  const current = state.directory.find(row => row.gameId === gameId);
  if (!current) stop('GAME_NOT_LISTED', 403);
  let source = state;
  if (ordinal !== current.ordinal) {
    if (BigInt(ordinal.slice(2)) >= BigInt(current.ordinal.slice(2))) stop('RELEASE_UNRECOGNIZED', 404);
    if (state.runtimeVersion !== 2 || state.control.version !== 2) stop('RELEASE_HISTORY_UNAVAILABLE');
    requireValue(Array.isArray(state.announcementRows), 'RELEASE_HISTORY_UNAVAILABLE');
    const rows = state.announcementRows.filter(row => row?.gameId === gameId && row.ordinal === ordinal);
    if (!rows.length) stop('RELEASE_UNRECOGNIZED', 404);
    requireValue(rows.length === 1, 'RELEASE_HISTORY_UNAVAILABLE');
    const ref = validateFirstOnlineReference(rows[0].firstOnline, state.control);
    requireValue(ref.generation < state.control.generation, 'RELEASE_HISTORY_UNAVAILABLE');
    const receiptObject = await env.PUBLISH_BUCKET.get(firstOnlineReceiptKey(ref, state.control));
    requireValue(['application/json', 'application/json; charset=utf-8'].includes(receiptObject?.httpMetadata?.contentType), 'RELEASE_HISTORY_UNAVAILABLE');
    const receiptBytes = await bytesFrom(receiptObject, 4096, 'RELEASE_HISTORY_UNAVAILABLE');
    receiptVisibleAt(receiptBytes, ref, state.control);
    const object = await env.PUBLISH_BUCKET.get(publicationRootArchiveKey({ ...ref, authorityId: state.control.authorityId }));
    requireValue(['application/json', 'application/json; charset=utf-8'].includes(object?.httpMetadata?.contentType), 'RELEASE_HISTORY_UNAVAILABLE');
    const bytes = await bytesFrom(object, 4096, 'RELEASE_HISTORY_UNAVAILABLE');
    requireValue(await sha256(bytes) === parseJSON(receiptBytes).rootDigest, 'RELEASE_HISTORY_UNAVAILABLE');
    const root = validatePublicationRoot(parseJSON(bytes));
    requireValue(root.version === 2 && root.authorityId === state.control.authorityId && ['generation', 'operationId', 'operationDigest', 'payloadDigest'].every(key => root[key] === ref[key]), 'RELEASE_HISTORY_UNAVAILABLE');
    source = await snapshot(env, { size: bytes.length, arrayBuffer: async () => bytes.buffer });
  }
  const entry = source.directory.find(row => row.gameId === gameId);
  if (!entry || entry.releaseId !== releaseId || entry.ordinal !== ordinal) stop('RELEASE_UNRECOGNIZED', 404);
  const release = source.releases.get(gameId), index = await runtimeIndex(env, release, release.runtime);
  requireValue(JSON.stringify(index.chapters) === JSON.stringify(entry.chapters), 'RUNTIME_CORRUPT');
  const latest = await snapshot(env);
  checkRunningState(latest, gameId);
  if (!latest.directory.some(row => row.gameId === gameId)) stop('GAME_NOT_LISTED', 403);
  if (latest.rootDigest !== state.rootDigest) stop('REGISTRY_CHANGED', 409);
  return json({ saved: { ...entry, manifestDigest: index.resources.manifest.sha256 }, current });
}
async function file(request, url, env) {
  if ([...url.searchParams.keys()].some(key => key !== 'role') || url.searchParams.getAll('role').length !== 1) { stop('FILE_FORBIDDEN', 403); }
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ') || authorization.length > 4103) { stop('ADMISSION_INVALID', 403); }
  const claims = await verifyAdmission(env, url.origin, authorization.slice(7));
  checkRunningState(await snapshot(env), claims.gameId, claims);
  const index = await runtimeIndex(env, claims, claims.runtime), role = url.searchParams.get('role');
  if (!role || !Object.hasOwn(index.resources, role) || (role.startsWith('chapter:') && role !== `chapter:${claims.chapterId}`)) { stop('FILE_FORBIDDEN', 403); }
  const ref = index.resources[role], bytes = await readChecked(env, ref);
  if (ref.contentType === 'application/json') { parseJSON(bytes); }
  // Neither an update nor deletion observed after I/O may leak late bytes.
  checkRunningState(await snapshot(env), claims.gameId, claims);
  return new Response(bytes, { headers: { ...headers, 'Content-Type': ref.contentType, 'X-Content-SHA256': ref.sha256 } });
}
export default {
  async fetch(request, env) {
    try {
      let url;
      try { url = new URL(request.url); } catch { return json({ error: 'NOT_FOUND' }, 404); }
      if (request.method !== 'GET') { return json({ error: 'NOT_FOUND' }, 404); }
      if (!['/play-api/v1/registry', '/play-api/v1/status', '/play-api/v1/admissions', '/play-api/v1/file', '/play-api/v1/releases'].includes(url.pathname)) { return json({ error: 'NOT_FOUND' }, 404); }
      if (url.pathname === '/play-api/v1/file') { return await file(request, url, env); }
      if (url.pathname === '/play-api/v1/admissions') { return await admit(url, env); }
      if (url.pathname === '/play-api/v1/releases') { return await releaseHistory(url, env); }
      const state = await snapshot(env);
      if (url.pathname === '/play-api/v1/registry') { return await registry(env, state, url.searchParams); }
      const gameId = url.searchParams.get('game');
      if (!isGameId(gameId)) { return json({ error: 'GAME_REQUIRED' }, 422); }
      if (state.states.get(gameId)?.deleted) { return json({ error: 'GAME_DELETED', gameId }, 410); }
      const entry = state.directory.find(row => row.gameId === gameId);
      if (entry) return json({ ...entry, listed: true });
      const result = { gameId, listed: false }, currentRelease = state.states.get(gameId)?.currentRelease;
      if (currentRelease) result.currentRelease = currentRelease;
      return json(result);
    } catch (error) {
      if (error instanceof ReadError) { return json({ error: error.message }, error.status); }
      if (error?.message === 'ADMISSION_INVALID') { return json({ error: 'ADMISSION_INVALID' }, 403); }
      const code = ['ADMISSION_NOT_CONFIGURED', 'REGISTRY_CORRUPT', 'RUNTIME_CORRUPT', 'RELEASE_HISTORY_UNAVAILABLE'].includes(error?.message) ? error.message : 'READER_UNAVAILABLE';
      return json({ error: code }, 503);
    }
  },
};
