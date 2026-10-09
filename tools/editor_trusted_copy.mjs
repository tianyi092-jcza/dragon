// Offline/service bootstrap adapter, NOT a Worker filesystem or author-supplied registry.
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { BUILTIN_RELEASE } from '../web/src/content/builtinrelease.generated.js';
import { readInstalledEditorSource } from './editor_builtin_source.mjs';
import { readInstalledEntitySource } from './editor_entity_source.mjs';
import { copyBuiltinGame } from '../web/src/content/authoring/gamesource.js';
import { copyEntitySourceRecords } from '../web/src/editor/entitycopy.js';
const revision = 'map-2-47e35876cd32ff3b7eee27da3be95eaa1b52a6d108a6f94c1f5989bc68861d23';
const sourceDigest = '87742af76b54a13711541eefbb2dd2066ba06d30602027b9bfcf9ae43bf9f2b1';
const manifestSha = 'bde6dfc8a82da5597ef22786e46681c87f2fe21cd55dd23921b32e346efa95e9';
const manifestLength = 21714, prefix = `content/builtin/compiled/${revision}/`;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function json(bytes) { try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch (cause) { throw new TypeError('invalid pinned Web manifest', { cause }); } }
export function createPinnedCopyLoader({ readWeb = path => readFileSync(new URL('../web/' + path, import.meta.url)), allocateEntityId = randomUUID } = {}) {
  if (typeof readWeb !== 'function' || typeof allocateEntityId !== 'function') throw new TypeError('trusted bootstrap adapters required');
  // Updating the default module is NOT automatic registration or rebasing of captures.
  if (BUILTIN_RELEASE.resources.world.revision !== revision || BUILTIN_RELEASE.resources.sourceDigest !== sourceDigest) throw new RangeError('unregistered builtin source revision');
  const snapshot = new Map(), expected = new Map();
  function capture(path) {
    if (!expected.has(path)) throw new RangeError('unregistered builtin URL');
    if (!snapshot.has(path)) {
      const incoming = readWeb(path); if (!(incoming instanceof Uint8Array)) throw new TypeError('actual Web bytes required');
      const bytes = Buffer.from(incoming), descriptor = expected.get(path);
      if (bytes.length !== descriptor.byteLength || sha(bytes) !== descriptor.sha256) throw new RangeError('pinned builtin asset mismatch');
      snapshot.set(path, bytes);
    }
    return Buffer.from(snapshot.get(path)); // Never expose the captured byte storage.
  }
  expected.set(prefix + 'manifest.json', { sha256: manifestSha, byteLength: manifestLength });
  const manifest = json(capture(prefix + 'manifest.json'));
  if (manifest.worldRevision !== revision || manifest.sourceDigest !== sourceDigest || manifest.assets.length !== 38) throw new RangeError('pinned builtin manifest identity');
  for (const entry of manifest.assets) {
    if (!/^(?:[A-Za-z0-9_-]+\.(?:json|png|bin)|chapters\/[A-Za-z0-9_-]+\.json)$/.test(entry.path) || entry.url !== prefix + entry.path || expected.has(entry.url)) throw new RangeError('pinned builtin manifest path');
    expected.set(entry.url, { sha256: entry.sha256, byteLength: entry.byteLength });
  }
  const entities = BUILTIN_RELEASE.entitySource, entityDigest = '086ca8a87e2dafb2b7c9d657a74b70c81b5da3e98776e5d7d8c21dcfc5a982a5';
  const entityPrefix = `content/builtin/authoring/entities-${entityDigest}/`;
  if (entities.manifestURL !== entityPrefix + 'manifest.json' || entities.resourceURL !== entityPrefix + 'entity-source.json' || entities.manifestSha256 !== '7bb405d03ca4feee2967bda0dc45d9538076a7b301d36b3e41ead6372362decd' || entities.manifestByteLength !== 854 || entities.resource.sha256 !== entityDigest || entities.resource.byteLength !== 503775 || entities.runtimeDataSha256 !== 'f819a1a5bb81d8b915a19e8efbaf6a212d8e4516843513869dc1b939ca1ac3af') throw new RangeError('unregistered entity source tuple');
  expected.set(entities.manifestURL, { sha256: entities.manifestSha256, byteLength: entities.manifestByteLength });
  expected.set(entities.resourceURL, entities.resource);
  // This existing shared adapter checks actual39 roles/compiled native bytes/20 chapters.
  const source = readInstalledEditorSource(BUILTIN_RELEASE.resources, capture);
  let boundBundle;
  return async context => {
    if (!context || typeof context.gameId !== 'string' || typeof context.ownerId !== 'string' || !context.ownerId || context.ownerId.length > 128) throw new TypeError('captured service context required');
    const gameId = context.gameId, ownerId = context.ownerId;
    // Selected inputs already captured, fixed entity tuple never follows latest.
    boundBundle ??= readInstalledEntitySource(capture);
    const bundle = await boundBundle;
    const game = copyBuiltinGame({ gameId, ownerId, kind: 'full', source }, sha);
    game.sourceRecords = copyEntitySourceRecords(game, source, bundle, entities, allocateEntityId);
    return { game, provenance: { registryId: 'approved-builtin-47e358-entities086-1', revision, sourceDigest, manifestSha256: manifestSha,
      entityManifestSha256: entities.manifestSha256, entityResourceSha256: entities.resource.sha256,
      inputHashes: Object.fromEntries([...snapshot].map(([path, bytes]) => [path, sha(bytes)])),
      limits: 'Pinned actual Web inputs/shared copy projection only. Bootstrap adapter, not live authenticated copy API, persistent registry, portrait/runtime/Q69 or original-initializer certificate.' } };
  };
}
