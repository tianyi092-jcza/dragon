// Internal, read-only reference diagnostic. NOT an ownership certificate,
// public API, provider inventory, complete reference closure or cleanup permit.
import { createHash } from 'node:crypto';
import { manifestRoles } from './distribution-resources.mjs';
import { captureStaticVisualReferences } from './static-resources.mjs';
import { MAX_METADATA_BYTES, isGameId, isId, isOrdinal, parseJSON, validateIndex, validateRuntimeReference } from '../reader/runtimecontract.js';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const INDEX_KEYS = ['version', 'gameId', 'releaseId', 'ordinal', 'revision', 'sourceDigest', 'chapters', 'resources'];
function check(value) { if (!value) throw new Error('DELETE_RUNTIME_REFERENCE_INVALID'); }
function fields(value, keys) {
  check(value !== null && typeof value === 'object' && !Array.isArray(value));
  check(Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)));
}
function bounded(value, maximum) { check(Number.isSafeInteger(value) && value > 0 && value <= maximum); }
async function readCheckedObject(r2, prefix, ref) {
  const stored = await r2.get(prefix + ref.key, { maxBytes: ref.byteLength });
  check(stored?.bytes instanceof Uint8Array);
  const bytes = Buffer.from(stored.bytes), types = Object.entries(stored.headers ?? {}).filter(([key]) => key.toLowerCase() === 'content-type');
  check(types.length === 1 && (types[0][1] === ref.contentType || ref.contentType === 'application/json' && types[0][1] === 'application/json; charset=utf-8'));
  check(bytes.byteLength === ref.byteLength && digest(bytes) === ref.sha256);
  return bytes;
}
function captureRuntimeReference(gameId, ref) {
  check(isGameId(gameId)); fields(ref, ['key', 'sha256', 'byteLength']);
  const { key, sha256, byteLength } = ref;
  check(typeof key === 'string' && typeof sha256 === 'string' && /^[a-f0-9]{64}$/.test(sha256));
  bounded(byteLength, MAX_METADATA_BYTES);
  const parts = key.split('/');
  check(parts.length === 5 && parts[0] === 'artifacts' && parts[1] === gameId && isOrdinal(parts[2]) && isId(parts[3]) && parts[4] === `runtime-${sha256}.json`);
  return { key, sha256, byteLength };
}
export async function inspectRuntimeObjectReferences(options) {
  return inspectRuntimeReferences(options);
}
// Only the cross-game collector can retain these already-verified indexes;
// there is no public caller-supplied index cache or validation bypass.
async function inspectRuntimeReferences({ r2, gameId, runtimeReferences, prefix = '', maxRuntimes = 1000, maxReferences = 50000, verifyBodies = false, maxBodyBytes = 268435456 }, retainedIndexes = null) {
  const indexDetails = retainedIndexes ?? (verifyBodies ? new Map() : null);
  check(typeof r2?.get === 'function' && isGameId(gameId));
  check(typeof prefix === 'string' && (prefix === '' || /^test\/[A-Za-z0-9_-]{1,100}\/$/.test(prefix)));
  bounded(maxRuntimes, 1000); bounded(maxReferences, 100000);
  check(typeof verifyBodies === 'boolean'); bounded(maxBodyBytes, 1073741824);
  check(Array.isArray(runtimeReferences) && runtimeReferences.length <= maxRuntimes);
  // Capture and check EVERY fetch address before the first I/O; an invalid later
  // entry must not cause reads of earlier entries or arbitrary private paths.
  const captured = runtimeReferences.map(ref => captureRuntimeReference(gameId, ref));
  check(Object.keys(captured).length === captured.length); // No sparse input.
  if (verifyBodies && [...new Map(captured.map(ref => [ref.key, ref.byteLength])).values()].reduce((sum, size) => sum + size, 0) > maxBodyBytes) throw new Error('DELETE_RUNTIME_BODY_BUDGET');
  const readChecked = ref => readCheckedObject(r2, prefix, ref);
  const objects = new Map(), indexes = new Map(), staticVisuals = new Map(); let references = 0;
  const add = (role, ref, indexKey) => {
    if (++references > maxReferences) throw new Error('DELETE_RUNTIME_REFERENCE_BUDGET');
    const signature = JSON.stringify([ref.sha256, ref.byteLength, ref.contentType]);
    const prior = objects.get(ref.key);
    check(!prior || prior.signature === signature);
    const row = prior ?? { signature, key: ref.key, sha256: ref.sha256, byteLength: ref.byteLength, contentType: ref.contentType, sharedLibrary: ref.key.startsWith('kao/'), references: [] };
    row.references.push({ indexKey, role }); objects.set(ref.key, row);
  };
  for (const ref of captured) {
    if (indexes.has(ref.key)) { check(indexes.get(ref.key) === JSON.stringify(ref)); continue; }
    const bytes = await readChecked({ ...ref, contentType: 'application/json' });
    const index = parseJSON(bytes);
    // Unknown fields/duplicate-key JSON cannot hide extra reference families.
    check(Buffer.from(JSON.stringify(index)).equals(bytes));
    fields(index, Object.hasOwn(index, 'chapterIndex') ? [...INDEX_KEYS, 'chapterIndex'] : INDEX_KEYS);
    validateIndex(index); validateRuntimeReference(index, ref); check(index.gameId === gameId);
    add('runtime-index', { ...ref, contentType: 'application/json' }, ref.key);
    for (const [role, asset] of Object.entries(index.resources)) {
      fields(asset, ['key', 'sha256', 'byteLength', 'contentType']);
      add(role, asset, ref.key);
    }
    indexes.set(ref.key, JSON.stringify(ref));
    indexDetails?.set(ref.key, index);
  }
  let verifiedBodyBytes = 0;
  if (verifyBodies) {
    const total = [...objects.values()].reduce((sum, row) => sum + row.byteLength, 0);
    if (total > maxBodyBytes) throw new Error('DELETE_RUNTIME_BODY_BUDGET');
    // Index bodies were checked already. Shared objects are read once per call;
    // no cross-call cache can disguise a missing or changed provider object.
    for (const row of objects.values()) if (!indexes.has(row.key)) {
      const bytes = await readChecked(row);
      verifyManifestBindings(row, bytes, indexDetails, staticVisuals, () => {
        if (++references > maxReferences) throw new Error('DELETE_RUNTIME_REFERENCE_BUDGET');
      });
    }
    verifiedBodyBytes = total;
  }
  return {
    gameId, scannedRuntimes: indexes.size, verifiedBodyBytes,
    staticVisualReferences: verifyBodies ? [...staticVisuals.values()] : null,
    staticProgramBindingProven: false, staticResourceBodiesVerified: false,
    objects: [...objects.values()].map(({ signature: _signature, ...row }) => row),
    // Optional body checks prove only these observed bytes, not extra manifest/
    // static, SQL, legacy, backup or cross-game references or atomic provider
    // stability. Even private paths are not certified exclusively owned.
    resourceBodiesVerified: verifyBodies, manifestBindingsVerified: verifyBodies, exclusiveOwnershipProven: false,
    deleteAllowed: false, physicalCleanupProven: false,
  };
}

function verifyManifestBindings(row, bytes, indexDetails, staticVisuals, consumeReference) {
  const references = row.references.filter(ref => ref.role === 'manifest');
  if (!references.length) return;
  const manifest = parseJSON(bytes);
  const visuals = Object.hasOwn(manifest, 'visualAssets') ? captureStaticVisualReferences(manifest) : [];
  for (const ref of references) {
    const index = indexDetails.get(ref.indexKey);
    manifestRoles(index, manifest);
    for (const visual of visuals) {
      consumeReference();
      // A path alone is NOT a physical object identity: different program
      // archives may bind it to different bytes. Keep descriptor variants.
      const signature = JSON.stringify([visual.path, visual.sha256, visual.byteLength]);
      const value = staticVisuals.get(signature) ?? { path: visual.path, sha256: visual.sha256, byteLength: visual.byteLength, references: [] };
      value.references.push({ gameId: index.gameId, indexKey: ref.indexKey, role: visual.role });
      staticVisuals.set(signature, value);
    }
  }
}

// Observed cross-game index references only. Caller-supplied coverage, even an
// empty list, never certifies the complete ledger/SQL/provider/backup universe.
export async function inspectCatalogObjectReferences({ r2, catalogRuntimeReferences, prefix = '', maxRuntimes = 1000, maxReferences = 50000, verifyBodies = false, maxBodyBytes = 268435456 }) {
  check(typeof r2?.get === 'function');
  check(typeof prefix === 'string' && (prefix === '' || /^test\/[A-Za-z0-9_-]{1,100}\/$/.test(prefix)));
  bounded(maxRuntimes, 1000); bounded(maxReferences, 100000);
  check(typeof verifyBodies === 'boolean'); bounded(maxBodyBytes, 1073741824);
  check(Array.isArray(catalogRuntimeReferences) && catalogRuntimeReferences.length <= maxRuntimes);
  const games = new Map(), indexes = new Map();
  // Entire input is captured and validated before the first provider read.
  for (const row of catalogRuntimeReferences) {
    fields(row, ['gameId', 'key', 'sha256', 'byteLength']);
    const gameId = row.gameId, ref = captureRuntimeReference(gameId, { key: row.key, sha256: row.sha256, byteLength: row.byteLength });
    const old = indexes.get(ref.key);
    check(!old || old.gameId === gameId && old.sha256 === ref.sha256 && old.byteLength === ref.byteLength);
    if (old) continue;
    indexes.set(ref.key, { gameId, ...ref });
    if (!games.has(gameId)) games.set(gameId, []);
    games.get(gameId).push(ref);
  }
  if (verifyBodies && [...indexes.values()].reduce((sum, ref) => sum + ref.byteLength, 0) > maxBodyBytes) throw new Error('DELETE_RUNTIME_BODY_BUDGET');
  const objects = new Map(), staticVisuals = new Map(), indexDetails = verifyBodies ? new Map() : null; let referenceCount = 0;
  for (const [gameId, runtimeReferences] of games) {
    if (referenceCount >= maxReferences) throw new Error('DELETE_RUNTIME_REFERENCE_BUDGET');
    const report = await inspectRuntimeReferences({ r2, gameId, runtimeReferences, prefix, maxRuntimes, maxReferences: maxReferences - referenceCount }, indexDetails);
    for (const row of report.objects) {
      referenceCount += row.references.length;
      const signature = JSON.stringify([row.sha256, row.byteLength, row.contentType]), old = objects.get(row.key);
      check(!old || old.signature === signature);
      const merged = old ?? { signature, key: row.key, sha256: row.sha256, byteLength: row.byteLength, contentType: row.contentType, sharedLibrary: row.sharedLibrary, gameIds: [], references: [] };
      merged.gameIds.push(gameId);
      for (const ref of row.references) merged.references.push({ gameId, ...ref });
      objects.set(row.key, merged);
    }
  }
  let verifiedBodyBytes = 0;
  if (verifyBodies) {
    const total = [...objects.values()].reduce((sum, row) => sum + row.byteLength, 0);
    if (total > maxBodyBytes) throw new Error('DELETE_RUNTIME_BODY_BUDGET');
    // Indexes were already verified. One global map means a shared object is
    // fetched once across all games/versions, with no persistent body cache.
    for (const row of objects.values()) if (!indexes.has(row.key)) {
      const bytes = await readCheckedObject(r2, prefix, row);
      verifyManifestBindings(row, bytes, indexDetails, staticVisuals, () => {
        if (++referenceCount > maxReferences) throw new Error('DELETE_RUNTIME_REFERENCE_BUDGET');
      });
    }
    verifiedBodyBytes = total;
  }
  return {
    scannedGames: games.size, scannedRuntimes: indexes.size, verifiedBodyBytes,
    staticVisualReferences: verifyBodies ? [...staticVisuals.values()] : null,
    staticProgramBindingProven: false, staticResourceBodiesVerified: false,
    objects: [...objects.values()].map(({ signature: _signature, ...row }) => ({ ...row, sharedAcrossGames: row.gameIds.length > 1 })),
    resourceBodiesVerified: verifyBodies, manifestBindingsVerified: verifyBodies, catalogCoverageProven: false,
    exclusiveOwnershipProven: false, deleteAllowed: false, physicalCleanupProven: false,
  };
}
