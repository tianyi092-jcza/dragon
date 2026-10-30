// Service-owned fixed Web anchors. Byte provenance only, not a runtime/PNG certificate.
import { createHash } from 'node:crypto';
import { FIXED_COPY_PROFILE } from './copyprofile.js';
import { fail } from './security.js';
import { FIXED_TRIAL_ASSET_PATHS, TRIAL_ASSET_PROFILE } from '../web/src/editor/trialassetpaths.js';
const revision = 'map-2-28805fc52a1c79910a949fb32b242323777c1741245724b8c346fd8e7a567bfe';
const entities = '7e7fad151010a33fd455b81971c8e976c99d2fd265bd6c31625a68326c6de00c';
const sourceDigest = '19ef2ce35a92d4fad10d75610818f8113ff9b711480e45d7a009cd582c7b4d6b';
// The available library stays anchored to the previous source revision: its
// registered manifest (f4ba804b) was built against 086 entities and its
// production registration is out of scope. Source and library revisions are
// therefore tracked separately; the mixed state is recorded, not hidden.
const LIBRARY_BASE_REVISION = 'map-2-47e35876cd32ff3b7eee27da3be95eaa1b52a6d108a6f94c1f5989bc68861d23';
// Shared fixed identity for policy and structural consumers; not a capability.
export const AVAILABLE_LIBRARY_REGISTRY_ID = 'approved-available-library-f4ba804b-1';
const policies = new WeakSet();
export const isInstalledSourcePolicy = value => policies.has(value);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function manifest(bytes, expectedHash, expectedLength) {
  if (!(bytes instanceof Uint8Array) || bytes.length !== expectedLength || digest(bytes) !== expectedHash) fail(503, 'SOURCE_MANIFEST_NOT_PINNED');
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { fail(503, 'SOURCE_MANIFEST_INVALID'); }
}
export function installedSourcePolicy(worldBytes, entityBytes) {
  const worldPrefix = `content/builtin/compiled/${revision}/`, entityPrefix = `content/builtin/authoring/entities-${entities}/`;
  const worldHash = '807e2d3bb6b35965771edf7ff2dee30d19733bd6e63f8cb3bca4267df30a210f';
  const entityHash = '76eaca3e00a0e962c1534e119ed3b19c2dd43462fa7cca9fe7fe4fa33399c093';
  const world = manifest(worldBytes, worldHash, 14268), entity = manifest(entityBytes, entityHash, 775);
  if (world.worldRevision !== revision || world.sourceDigest !== sourceDigest || !Array.isArray(world.assets) || world.assets.length !== 38) fail(503, 'SOURCE_MANIFEST_IDENTITY');
  const roles = [{ path: worldPrefix + 'manifest.json', sha256: worldHash, byteLength: 14268 }, { path: entityPrefix + 'manifest.json', sha256: entityHash, byteLength: 775 }, { path: entityPrefix + 'entity-source.json', sha256: entities, byteLength: 503775 }];
  for (const asset of world.assets) {
    if (typeof asset.path !== 'string' || !/^(?:[A-Za-z0-9_-]+\.(?:json|png|bin)|chapters\/[A-Za-z0-9_-]+\.json)$/.test(asset.path) || asset.url !== worldPrefix + asset.path || !/^[a-f0-9]{64}$/.test(asset.sha256) || !Number.isSafeInteger(asset.byteLength) || asset.byteLength < 1) fail(503, 'SOURCE_MANIFEST_ROLE');
    roles.push({ path: asset.url, sha256: asset.sha256, byteLength: asset.byteLength });
  }
  // The entity manifest's bytes are pinned too; the existing shared entity adapter
  // remains responsible for its decoded model semantics on later copy execution.
  if (!entity || typeof entity !== 'object') fail(503, 'SOURCE_MANIFEST_IDENTITY');
  roles.sort((a, b) => { if (a.path < b.path) return -1; if (a.path > b.path) return 1; return 0; });
  if (new Set(roles.map(row => row.path)).size !== 41) fail(503, 'SOURCE_MANIFEST_ROLE');
  const policy = Object.freeze({ registryId: 'approved-builtin-28805f-entities7e7-1', revision, sourceDigest, profileRevision: FIXED_COPY_PROFILE, roles: Object.freeze(roles.map(Object.freeze)) });
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
  // LIBRARY-REFRESH-2: five reviewed presentation consumers, same fixed roles.
  // The previous manifest is retained under pinned/; its registry is NOT reused.
  const manifestHash = 'f4ba804b84b326ff2d569980127f52d3f6df92ab623d740ad3ab21945840615b';
  const library = manifest(bytes, manifestHash, 93632);
  if (library.schemaVersion !== 1 || library.profile !== TRIAL_ASSET_PROFILE || library.mode !== 'STAGED_AVAILABLE_LIBRARY_NOT_Q69_CLOSURE' || library.baseRevision !== LIBRARY_BASE_REVISION || library.runtimeDataSha256 !== 'f819a1a5bb81d8b915a19e8efbaf6a212d8e4516843513869dc1b939ca1ac3af' || Object.keys(library.resources).sort().join('\n') !== FIXED_TRIAL_ASSET_PATHS.join('\n') || Object.keys(library.supportingFiles).join(',') !== 'font/OFL-Oswald.txt' || Object.keys(library.programHashes).length !== 20 || library.unresolvedReferences.length !== 20) fail(503, 'LIBRARY_MANIFEST_IDENTITY');
  const roles = [{ path: 'available-library-manifest.json', sha256: manifestHash, byteLength: 93632 }];
  for (const [path, row] of Object.entries({ ...library.resources, ...library.supportingFiles })) {
    if (!/^[a-f0-9]{64}$/.test(row.sha256) || !Number.isSafeInteger(row.byteLength) || row.byteLength < 1 || row.blobPath !== 'blobs/' + row.sha256) fail(503, 'LIBRARY_MANIFEST_ROLE');
    roles.push({ path, sha256: row.sha256, byteLength: row.byteLength });
  }
  roles.sort((a, b) => { if (a.path < b.path) return -1; if (a.path > b.path) return 1; return 0; });
  if (roles.length !== 400 || new Set(roles.map(row => row.path)).size !== 400) fail(503, 'LIBRARY_MANIFEST_ROLE');
  const policy = Object.freeze({ registryId: AVAILABLE_LIBRARY_REGISTRY_ID, revision, sourceDigest, profileRevision: TRIAL_ASSET_PROFILE, mode: library.mode, manifestDigest: manifestHash, runtimeDataSha256: library.runtimeDataSha256, programHashes: Object.freeze({ ...library.programHashes }), unresolvedReferences: Object.freeze(library.unresolvedReferences.map(ref => Object.freeze({ ...ref }))), roles: Object.freeze(roles.map(Object.freeze)) });
  policies.add(policy); return policy;
}
