// Read-only closure check for a frozen operation. No SQL/current-draft lookup,
// uploads, URL fetching, image decoding, compiler admission or game-rule proof.
import { createHash } from 'node:crypto';
import { DISTRIBUTION_PAYLOAD_LIMIT } from '../server/distributionledger.js';
import { projectPublicationCatalog } from '../server/publicationcatalog.js';
import { validateFirstOnlineReference, firstOnlineReceiptKey, receiptVisibleAt } from '../reader/firstonline.js';
import { ASSET_TYPES, MAX_METADATA_BYTES, isGameId, isId, isChapterId, isOrdinal, parseJSON, sameIdentity, validateIndex, validateRuntimeReference } from '../reader/runtimecontract.js';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function check(value) { if (!value) throw new Error('DISTRIBUTION_RESOURCES'); }
function fields(value, required, optional = []) {
  check(plain(value) && required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => required.includes(key) || optional.includes(key)));
}
function iso(value) { check(typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value); }
function entry(value) {
  fields(value, ['gameId', 'releaseId', 'ordinal', 'revision', 'sourceDigest', 'chapters', 'runtime']);
  fields(value.runtime, ['key', 'sha256', 'byteLength']);
  validateRuntimeReference(value, value.runtime);
  check(Array.isArray(value.chapters) && value.chapters.length > 0 && value.chapters.every(chapter => isChapterId(chapter, value.gameId)) && new Set(value.chapters).size === value.chapters.length);
  return value;
}
function projectionEntries(projection, context) {
  fields(projection, ['runtimeVersion', 'directory', 'gameStates', 'announcements', 'releases'], ['generatedAt']);
  check([1, 2].includes(projection.runtimeVersion) && Buffer.byteLength(JSON.stringify(projection)) <= MAX_METADATA_BYTES);
  if (Object.hasOwn(projection, 'generatedAt')) iso(projection.generatedAt);
  for (const key of ['directory', 'gameStates', 'announcements', 'releases']) check(Array.isArray(projection[key]));
  const states = new Map(), releases = new Map(), directory = new Map();
  for (const row of projection.gameStates) {
    fields(row, ['gameId', 'listed'], ['deleted', 'currentRelease']);
    check(isGameId(row.gameId) && typeof row.listed === 'boolean' && (row.deleted === undefined || typeof row.deleted === 'boolean') && !(row.deleted && row.listed) && !states.has(row.gameId));
    if (Object.hasOwn(row, 'currentRelease')) {
      fields(row.currentRelease, ['releaseId', 'ordinal']);
      check(!row.deleted && isId(row.currentRelease.releaseId) && isOrdinal(row.currentRelease.ordinal));
    }
    states.set(row.gameId, row);
  }
  for (const row of projection.releases) {
    fields(row, ['game_id', 'release_id', 'ordinal', 'draft_revision', 'source_digest', 'created_at', 'runtime']);
    check(!releases.has(row.game_id)); iso(row.created_at);
    releases.set(row.game_id, { gameId: row.game_id, releaseId: row.release_id, ordinal: row.ordinal, revision: row.draft_revision, sourceDigest: row.source_digest, runtime: row.runtime });
  }
  const result = [];
  for (const row of projection.directory) {
    fields(row, ['gameId', 'releaseId', 'ordinal', 'revision', 'sourceDigest', 'name', 'publishedAt', 'chapters']);
    const release = releases.get(row.gameId);
    check(release && sameIdentity(row, release) && states.get(row.gameId)?.listed === true && !directory.has(row.gameId) && typeof row.name === 'string');
    const current = states.get(row.gameId).currentRelease;
    check(!current || current.releaseId === row.releaseId && current.ordinal === row.ordinal);
    iso(row.publishedAt); directory.set(row.gameId, row);
    result.push(entry({ ...release, chapters: row.chapters }));
  }
  check(result.length === releases.size && [...states.values()].filter(row => row.listed).length === result.length);
  const announcements = new Set();
  for (const row of projection.announcements) {
    fields(row, ['gameId', 'ordinal', 'name', 'creatorAccount', 'publishedAt', projection.runtimeVersion === 2 ? 'firstOnline' : 'firstOnlineAt']);
    const current = directory.get(row.gameId), key = `${row.gameId}:${row.ordinal}`;
    check(current && isOrdinal(row.ordinal) && BigInt(row.ordinal.slice(2)) <= BigInt(current.ordinal.slice(2)) && !announcements.has(key) && typeof row.name === 'string' && typeof row.creatorAccount === 'string');
    iso(row.publishedAt);
    if (projection.runtimeVersion === 2) {
      validateFirstOnlineReference(row.firstOnline, context);
      check(row.ordinal === current.ordinal || row.firstOnline.generation < context.generation);
    } else iso(row.firstOnlineAt);
    announcements.add(key);
  }
  return { entries: result, states };
}
// Shared structural check only; callers must first verify the index and bytes.
export function manifestRoles(index, manifest) {
  check(manifest?.schemaVersion === 1 && manifest.buildFormat === 'studio-app-2' && manifest.identity?.gameId === index.gameId && manifest.identity?.draftRevision === index.revision && manifest.identity?.sourceDigest === index.sourceDigest && same(manifest.chapters, index.chapters));
  check(Array.isArray(manifest.assets) && Array.isArray(manifest.minimapAssets) && Array.isArray(manifest.portraits));
  const roles = new Set(['manifest', ...index.chapters.map(id => `chapter:${id}`)]);
  const add = value => {
    check(plain(value) && typeof value.assetId === 'string');
    const role = `asset:${value.assetId}`, ref = index.resources[role];
    check(!roles.has(role) && ref && ref.sha256 === value.sha256 && ref.byteLength === value.byteLength);
    roles.add(role); return ref;
  };
  for (const value of [...manifest.assets, ...manifest.minimapAssets]) {
    const ref = add(value);
    check(Object.hasOwn(ASSET_TYPES, value.assetId) && ref.contentType === ASSET_TYPES[value.assetId] && value.url === `/api/trial-asset?game=${encodeURIComponent(index.gameId)}&revision=${index.revision}&digest=${index.sourceDigest}&asset=${value.assetId}`);
  }
  for (const value of manifest.portraits) {
    const ref = add(value);
    check(value.role === 'game-portrait' && value.mime === 'image/png' && value.url === `kao/${value.assetId}.png` && ref.key === value.url && ref.contentType === value.mime);
  }
  check(roles.size === Object.keys(index.resources).length && Object.keys(index.resources).every(role => roles.has(role)));
}
export function createDistributionResourceVerifier({ r2, prefix = '', verifyStaticResources }) {
  if (typeof r2?.get !== 'function' || typeof prefix !== 'string' || !(prefix === '' || /^test\/[A-Za-z0-9_-]{1,100}\/$/.test(prefix)) || verifyStaticResources !== undefined && typeof verifyStaticResources !== 'function') throw new TypeError('trusted read-only ports and publication prefix required');
  // Capture the optional trusted batch port once. Plain legacy ports retain
  // their per-runtime contract; a failed batch never falls back to that port.
  const staticBatch = verifyStaticResources?.batch;
  if (staticBatch !== undefined && typeof staticBatch !== 'function') throw new TypeError('trusted static batch port required');
  return async function verifyResources(record) {
    check(record?.payload instanceof Uint8Array && record.payload.byteLength > 0 && record.payload.byteLength <= DISTRIBUTION_PAYLOAD_LIMIT);
    // Capture before the first await. Neither callers nor ports can replace the
    // selected envelope during verification; cache is scoped to this one call.
    const bytes = Buffer.from(record.payload), kind = record.kind, gameId = record.gameId;
    check(sha(bytes) === record.payloadDigest && ['publish', 'listing', 'restriction', 'delete-fence', 'bootstrap'].includes(kind));
    check(kind === 'bootstrap' ? gameId === null : isGameId(gameId));
    const payload = parseJSON(bytes);
    fields(payload, ['version', 'projection'], ['runtime', 'catalog']); check(payload.version === 1);
    const context = { authorityId: record.authorityId, generation: record.generation };
    if (Object.hasOwn(payload, 'catalog')) check(same(projectPublicationCatalog(payload.catalog, context), payload.projection));
    const { entries, states } = projectionEntries(payload.projection, context);
    if (kind === 'publish') {
      const candidate = entry(payload.runtime);
      check(candidate.gameId === gameId && states.has(gameId) && !states.get(gameId).deleted);
      const current = states.get(gameId).currentRelease;
      check(!current || current.releaseId === candidate.releaseId && current.ordinal === candidate.ordinal);
      const visible = entries.find(value => value.gameId === gameId);
      check(!visible || sameIdentity(visible, candidate) && ['key', 'sha256', 'byteLength'].every(key => visible.runtime[key] === candidate.runtime[key]) && same(visible.chapters, candidate.chapters));
      if (!visible) entries.push(candidate); // Hidden formal releases need bytes too.
    } else check(!Object.hasOwn(payload, 'runtime'));
    const checked = new Map(), receipts = new Map(); let reads = 0;
    if (payload.projection.runtimeVersion === 2) for (const row of payload.projection.announcements) {
      const ref = row.firstOnline;
      if (ref.generation === context.generation) continue; // Resolves only at the actual future root observation.
      const key = firstOnlineReceiptKey(ref, context);
      if (!receipts.has(key)) {
        const stored = await r2.get(prefix + key, { maxBytes: 4096 }); reads++;
        check(stored?.bytes instanceof Uint8Array);
        const types = Object.entries(stored.headers ?? {}).filter(([name]) => name.toLowerCase() === 'content-type');
        check(types.length === 1 && ['application/json', 'application/json; charset=utf-8'].includes(types[0][1]));
        receipts.set(key, Buffer.from(stored.bytes));
      }
      receiptVisibleAt(receipts.get(key), ref, context);
    }
    const signatureOf = ref => JSON.stringify([ref.sha256, ref.byteLength, ref.contentType]);
    async function read(ref) {
      const signature = signatureOf(ref);
      if (checked.has(ref.key)) check(checked.get(ref.key) === signature);
      const stored = await r2.get(prefix + ref.key, { maxBytes: ref.byteLength }); reads++;
      check(stored?.bytes instanceof Uint8Array);
      const content = Buffer.from(stored.bytes);
      const types = Object.entries(stored.headers ?? {}).filter(([key]) => key.toLowerCase() === 'content-type');
      check(types.length === 1 && typeof types[0][1] === 'string' && (types[0][1] === ref.contentType || ref.contentType === 'application/json' && types[0][1] === 'application/json; charset=utf-8'));
      check(content.byteLength === ref.byteLength && sha(content) === ref.sha256);
      if (ref.contentType === 'application/json') parseJSON(content);
      checked.set(ref.key, signature);
      return content;
    }
    async function verify(ref) {
      if (checked.has(ref.key)) check(checked.get(ref.key) === signatureOf(ref));
      else await read(ref);
    }
    const staticManifests = [];
    for (const selected of entries) {
      const indexBytes = await read({ ...selected.runtime, contentType: 'application/json' });
      const index = validateIndex(parseJSON(indexBytes));
      check(sameIdentity(index, selected) && same(index.chapters, selected.chapters));
      const manifest = parseJSON(await read(index.resources.manifest));
      manifestRoles(index, manifest);
      // Actual packs also reference trusted static seasonal art. Until the
      // deployed-program closure port is wired, do not silently bless those
      // references merely because the six generated assets exist in R2.
      if (Object.hasOwn(manifest, 'visualAssets')) {
        if (!verifyStaticResources) throw new Error('DISTRIBUTION_STATIC_NOT_CONFIGURED');
        if (staticBatch) staticManifests.push({ visualAssets: structuredClone(manifest.visualAssets) });
        else await verifyStaticResources(structuredClone({ index, manifest }));
      }
      for (const [role, ref] of Object.entries(index.resources)) if (role !== 'manifest') await verify(ref);
    }
    if (staticManifests.length) await staticBatch({ manifests: staticManifests });
    return Object.freeze({ runtimes: entries.length, objects: checked.size + receipts.size, reads });
  };
}
