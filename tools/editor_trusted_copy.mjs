// Offline/service bootstrap adapter, NOT a Worker filesystem or author-supplied registry.
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { BUILTIN_RELEASE } from '../web/src/content/builtinrelease.generated.js';
import { readInstalledEditorSource } from './editor_builtin_source.mjs';
import { readInstalledEntitySource } from './editor_entity_source.mjs';
import { addBlankChapter, copyBuiltinGame, renameChapter } from '../web/src/content/authoring/gamesource.js';
import { copyEntitySourceRecords } from '../web/src/editor/entitycopy.js';
const revision = 'map-2-28805fc52a1c79910a949fb32b242323777c1741245724b8c346fd8e7a567bfe';
const sourceDigest = '19ef2ce35a92d4fad10d75610818f8113ff9b711480e45d7a009cd582c7b4d6b';
const manifestSha = '807e2d3bb6b35965771edf7ff2dee30d19733bd6e63f8cb3bca4267df30a210f';
const manifestLength = 14268, prefix = `content/builtin/compiled/${revision}/`;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function json(bytes) { try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch (cause) { throw new TypeError('invalid pinned Web manifest', { cause }); } }
export function createPinnedCopyLoader({ readWeb = path => readFileSync(new URL('../web/' + path, import.meta.url)), allocateEntityId = randomUUID, kind = 'full' } = {}) {
  if (kind !== 'full' && kind !== 'minimal') throw new TypeError('trusted copy projection required');
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
  const entities = BUILTIN_RELEASE.entitySource, entityDigest = '7e7fad151010a33fd455b81971c8e976c99d2fd265bd6c31625a68326c6de00c';
  const entityPrefix = `content/builtin/authoring/entities-${entityDigest}/`;
  if (entities.manifestURL !== entityPrefix + 'manifest.json' || entities.resourceURL !== entityPrefix + 'entity-source.json' || entities.manifestSha256 !== '76eaca3e00a0e962c1534e119ed3b19c2dd43462fa7cca9fe7fe4fa33399c093' || entities.manifestByteLength !== 775 || entities.resource.sha256 !== entityDigest || entities.resource.byteLength !== 503775 || entities.runtimeDataSha256 !== '537e6af3e18c0f4b736c6c0b7f4cb4d2fa7c50a3b6470a86e1267afdced1b213') throw new RangeError('unregistered entity source tuple');
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
    const game = copyBuiltinGame({ gameId, ownerId, kind, source }, sha);
    if (kind === 'full') game.sourceRecords = copyEntitySourceRecords(game, source, bundle, entities, allocateEntityId);
    else {
      // Authoring structure only: no original people/factions/chapter records,
      // native defaults or playable initialization are supplied by this branch.
      game.metadata.name = '新遊戲';
      renameChapter(game, addBlankChapter(game), '第一章');
    }
    return { game, provenance: { registryId: 'approved-builtin-28805f-entities7e7-1', revision, sourceDigest, manifestSha256: manifestSha,
      entityManifestSha256: entities.manifestSha256, entityResourceSha256: entities.resource.sha256,
      inputHashes: Object.fromEntries([...snapshot].map(([path, bytes]) => [path, sha(bytes)])),
      limits: 'Pinned actual Web inputs/shared copy projection only. Bootstrap adapter, not live authenticated copy API, persistent registry, portrait/runtime/Q69 or original-initializer certificate.' } };
  };
}
