// Service-owned fixed Web anchors. Byte provenance only, not a runtime/PNG certificate.
import { createHash } from 'node:crypto';
import { FIXED_COPY_PROFILE } from './copyprofile.js';
import { fail } from './security.js';
import { FIXED_TRIAL_ASSET_PATHS, TRIAL_ASSET_PROFILE } from '../web/src/editor/trialassetpaths.js';
const revision = 'map-2-47e35876cd32ff3b7eee27da3be95eaa1b52a6d108a6f94c1f5989bc68861d23';
const entities = '086ca8a87e2dafb2b7c9d657a74b70c81b5da3e98776e5d7d8c21dcfc5a982a5';
const sourceDigest = '87742af76b54a13711541eefbb2dd2066ba06d30602027b9bfcf9ae43bf9f2b1';
const policies = new WeakSet();
export const isInstalledSourcePolicy = value => policies.has(value);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function manifest(bytes, expectedHash, expectedLength) {
  if (!(bytes instanceof Uint8Array) || bytes.length !== expectedLength || digest(bytes) !== expectedHash) fail(503, 'SOURCE_MANIFEST_NOT_PINNED');
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { fail(503, 'SOURCE_MANIFEST_INVALID'); }
}
export function installedSourcePolicy(worldBytes, entityBytes) {
  const worldPrefix = `content/builtin/compiled/${revision}/`, entityPrefix = `content/builtin/authoring/entities-${entities}/`;
  const worldHash = 'bde6dfc8a82da5597ef22786e46681c87f2fe21cd55dd23921b32e346efa95e9';
  const entityHash = '7bb405d03ca4feee2967bda0dc45d9538076a7b301d36b3e41ead6372362decd';
  const world = manifest(worldBytes, worldHash, 21714), entity = manifest(entityBytes, entityHash, 854);
  if (world.worldRevision !== revision || world.sourceDigest !== sourceDigest || !Array.isArray(world.assets) || world.assets.length !== 38) fail(503, 'SOURCE_MANIFEST_IDENTITY');
  const roles = [{ path: worldPrefix + 'manifest.json', sha256: worldHash, byteLength: 21714 }, { path: entityPrefix + 'manifest.json', sha256: entityHash, byteLength: 854 }, { path: entityPrefix + 'entity-source.json', sha256: entities, byteLength: 503775 }];
  for (const asset of world.assets) {
    if (typeof asset.path !== 'string' || !/^(?:[A-Za-z0-9_-]+\.(?:json|png|bin)|chapters\/[A-Za-z0-9_-]+\.json)$/.test(asset.path) || asset.url !== worldPrefix + asset.path || !/^[a-f0-9]{64}$/.test(asset.sha256) || !Number.isSafeInteger(asset.byteLength) || asset.byteLength < 1) fail(503, 'SOURCE_MANIFEST_ROLE');
    roles.push({ path: asset.url, sha256: asset.sha256, byteLength: asset.byteLength });
  }
  // The entity manifest's bytes are pinned too; the existing shared entity adapter
  // remains responsible for its decoded model semantics on later copy execution.
  if (!entity || typeof entity !== 'object') fail(503, 'SOURCE_MANIFEST_IDENTITY');
  roles.sort((a, b) => { if (a.path < b.path) return -1; if (a.path > b.path) return 1; return 0; });
  if (new Set(roles.map(row => row.path)).size !== 41) fail(503, 'SOURCE_MANIFEST_ROLE');
  const policy = Object.freeze({ registryId: 'approved-builtin-47e358-entities086-1', revision, sourceDigest, profileRevision: FIXED_COPY_PROFILE, roles: Object.freeze(roles.map(Object.freeze)) });
  policies.add(policy); return policy;
}

// A separate fixed byte registry, NEVER a full-copy source or runtime capability.
// Consumer fingerprints are current captures, not an all-consumer closure claim.
export function installedAvailableLibraryPolicy(input) {
  const typed = Object.getPrototypeOf(Uint8Array.prototype);
  const get = name => Object.getOwnPropertyDescriptor(typed, name).get;
  let buffer, length, offset;
  try {
    if (get(Symbol.toStringTag).call(input) !== 'Uint8Array') throw new TypeError('byte view required');
    buffer = get('buffer').call(input); length = get('byteLength').call(input); offset = get('byteOffset').call(input);
    Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength').get.call(buffer); // Reject shared/resizable views without invoking own getters.
    const resizable = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'resizable')?.get;
    if (resizable?.call(buffer)) throw new TypeError('fixed buffer required');
  } catch { fail(503, 'LIBRARY_MANIFEST_NOT_PINNED'); }
  if (length !== 93632) fail(503, 'LIBRARY_MANIFEST_NOT_PINNED');
  const bytes = new Uint8Array(length); bytes.set(new Uint8Array(buffer, offset, length));
  const manifestHash = '6bee39d9d8b7665b1ae63a000e424335ad4ae8cf51622e3fa15e135a390317e3';
  const library = manifest(bytes, manifestHash, 93632);
  if (library.schemaVersion !== 1 || library.profile !== TRIAL_ASSET_PROFILE || library.mode !== 'STAGED_AVAILABLE_LIBRARY_NOT_Q69_CLOSURE' || library.baseRevision !== revision || library.runtimeDataSha256 !== 'f819a1a5bb81d8b915a19e8efbaf6a212d8e4516843513869dc1b939ca1ac3af' || Object.keys(library.resources).sort().join('\n') !== FIXED_TRIAL_ASSET_PATHS.join('\n') || Object.keys(library.supportingFiles).join(',') !== 'font/OFL-Oswald.txt' || Object.keys(library.programHashes).length !== 20 || library.unresolvedReferences.length !== 20) fail(503, 'LIBRARY_MANIFEST_IDENTITY');
  const roles = [{ path: 'available-library-manifest.json', sha256: manifestHash, byteLength: 93632 }];
  for (const [path, row] of Object.entries({ ...library.resources, ...library.supportingFiles })) {
    if (!/^[a-f0-9]{64}$/.test(row.sha256) || !Number.isSafeInteger(row.byteLength) || row.byteLength < 1 || row.blobPath !== 'blobs/' + row.sha256) fail(503, 'LIBRARY_MANIFEST_ROLE');
    roles.push({ path, sha256: row.sha256, byteLength: row.byteLength });
  }
  roles.sort((a, b) => { if (a.path < b.path) return -1; if (a.path > b.path) return 1; return 0; });
  if (roles.length !== 400 || new Set(roles.map(row => row.path)).size !== 400) fail(503, 'LIBRARY_MANIFEST_ROLE');
  const policy = Object.freeze({ registryId: 'approved-available-library-76cdf28-1', revision, sourceDigest, profileRevision: TRIAL_ASSET_PROFILE, mode: library.mode, manifestDigest: manifestHash, runtimeDataSha256: library.runtimeDataSha256, programHashes: Object.freeze({ ...library.programHashes }), unresolvedReferences: Object.freeze(library.unresolvedReferences.map(ref => Object.freeze({ ...ref }))), roles: Object.freeze(roles.map(Object.freeze)) });
  policies.add(policy); return policy;
}
