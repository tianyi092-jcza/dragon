// Internal structural draft admission. Not a compatibility delta, image or runtime certificate.
import { createHash } from 'node:crypto';
import { CanonicalSourceParser, decodeSourceChunks, canonicalSourceTokens } from '../web/src/content/authoring/sourcejson.js';
import { validateGameSource } from '../web/src/content/authoring/gamesource.js';
import { normalizeGameMetadata } from '../web/src/editor/gamemetadata.js';
import { fail, fields } from './security.js';
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function descriptor(value) {
  fields(value, ['sha256', 'byteLength']);
  if (!hex(value.sha256) || !Number.isSafeInteger(value.byteLength) || value.byteLength < 1) fail(422, 'SOURCE_DESCRIPTOR');
  return Object.freeze({ sha256: value.sha256, byteLength: value.byteLength });
}
export class GameSnapshotVerifier {
  #blobs; #maxBytes;
  constructor({ blobs, maxSourceBytes = 64 * 1024 * 1024 }) {
    if (!blobs || typeof blobs.read !== 'function') throw new TypeError('trusted immutable object adapter required');
    if (!Number.isSafeInteger(maxSourceBytes) || maxSourceBytes < 1 || maxSourceBytes > 64 * 1024 * 1024) fail(503, 'SOURCE_POLICY');
    this.#blobs = blobs; this.#maxBytes = maxSourceBytes;
  }
  async verify(tokenHash, input) { return this.#verify(tokenHash, input, false); }
  // Internal stored-source discovery. No expected metadata DTO or allocation scope.
  async verifyStored(tokenHash, input) {
    fields(input, ['gameId', 'source']);
    return this.#verify(tokenHash, input, true);
  }
  async #verify(tokenHash, { gameId, allocation, metadata, source }, stored) {
    const root = descriptor(source);
    if (root.byteLength > 1024 * 1024) fail(413, 'SOURCE_INDEX_TOO_LARGE');
    const scope = { gameId, allocation }, actual = await this.#blobs.read(tokenHash, { ...scope, ...root });
    let index;
    try { index = decodeSourceChunks([actual.bytes]); } catch { fail(422, 'SOURCE_INDEX_JSON'); }
    fields(index, ['schema', 'gameId', 'sourceDigest', 'sourceByteLength', 'chunks', 'dependencies']);
    if (index.schema !== 'dragon-game-source-index-1' || index.gameId !== gameId || !hex(index.sourceDigest) || !Number.isSafeInteger(index.sourceByteLength) || index.sourceByteLength < 1) fail(422, 'SOURCE_INDEX');
    if (index.sourceByteLength > this.#maxBytes) fail(413, 'SOURCE_TOO_LARGE');
    if (!Array.isArray(index.chunks) || !index.chunks.length || index.chunks.length > 4096 || (!stored && (!Array.isArray(index.dependencies) || index.dependencies.length > 1024))) fail(422, 'SOURCE_INDEX');
    const chunks = stored ? [] : index.chunks.map(descriptor);
    if (!stored && (chunks.some(row => row.byteLength > 4 * 1024 * 1024) || chunks.reduce((n, row) => n + row.byteLength, 0) !== index.sourceByteLength)) fail(422, 'SOURCE_CHUNKS');
    const parser = new CanonicalSourceParser(), decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }), digest = createHash('sha256');
    let total = 0;
    // Stored-source discovery retains original per-part error order, not a second parse.
    for (const chunk of (stored ? index.chunks : chunks)) {
      if (stored) {
        fields(chunk, ['sha256', 'byteLength']);
        if (!hex(chunk.sha256) || !Number.isSafeInteger(chunk.byteLength) || chunk.byteLength < 1 || chunk.byteLength > 4 * 1024 * 1024 || (total += chunk.byteLength) > this.#maxBytes) fail(503, 'DRAFT_REFERENCE_CORRUPT');
        chunks.push(Object.freeze({ sha256: chunk.sha256, byteLength: chunk.byteLength }));
      }
      const part = await this.#blobs.read(tokenHash, { ...scope, ...chunk }); digest.update(part.bytes);
      try { parser.feed(decoder.decode(part.bytes, { stream: true })); } catch { fail(422, 'SOURCE_JSON'); }
    }
    let game;
    try { parser.feed(decoder.decode()); game = parser.finish(); } catch { fail(422, 'SOURCE_JSON'); }
    if (stored) {
      if (total !== index.sourceByteLength || !game?.metadata) fail(503, 'SOURCE_STORED_METADATA');
      // Original common-verifier dependency header check followed successful discovery.
      if (!Array.isArray(index.dependencies) || index.dependencies.length > 1024) fail(422, 'SOURCE_INDEX');
    }
    if (digest.digest('hex') !== index.sourceDigest || !game || typeof game !== 'object' || Array.isArray(game) || game.gameId !== gameId) fail(422, 'SOURCE_IDENTITY');
    fields(game.assets, Object.keys(game.assets ?? {}));
    let values, diagnostics;
    try { values = normalizeGameMetadata(game.metadata); diagnostics = validateGameSource(game, { draft: true }); } catch { fail(422, 'SOURCE_STRUCTURE'); }
    if (game.metadata.name !== values.name || game.metadata.introduction !== values.introduction || (!stored && (metadata.name !== values.name || metadata.introduction !== values.introduction))) fail(422, 'SOURCE_METADATA');
    // localModel placeholders, ownerId and sourceRef never grant authority. The Blob
    // port has already checked the actual actor and owning game at every await.
    const assetIds = Object.keys(game.assets ?? {}).sort(), dependencies = index.dependencies;
    if (assetIds.length !== dependencies.length) fail(422, 'SOURCE_DEPENDENCIES');
    for (let i = 0; i < dependencies.length; i++) {
      const asset = dependencies[i]; fields(asset, ['assetId', 'sha256', 'byteLength', 'mediaType', 'role']);
      if (asset.assetId !== assetIds[i] || !/^[A-Za-z0-9_-]{1,128}$/.test(asset.assetId)) fail(422, 'SOURCE_DEPENDENCIES');
      // Do not admit an image by signature/extension. Proper decode/re-encode and
      // trusted shared-package registration are separate, still-closed ports.
      if (asset.mediaType !== 'application/octet-stream' || asset.role !== 'data') fail(503, 'SOURCE_ASSET_NOT_ADMITTED');
      const own = game.assets[asset.assetId]; fields(own, ['assetId', 'sha256', 'byteLength', 'mediaType', 'role']);
      if (own.assetId !== asset.assetId || own.sha256 !== asset.sha256 || own.byteLength !== asset.byteLength || own.mediaType !== asset.mediaType || own.role !== asset.role) fail(422, 'SOURCE_DEPENDENCIES');
      await this.#blobs.read(tokenHash, { ...scope, ...descriptor({ sha256: asset.sha256, byteLength: asset.byteLength }) });
    }
    // Final actual read rechecks authority after dependency I/O; no content cache.
    await this.#blobs.read(tokenHash, { ...scope, ...root });
    const dependencyHash = createHash('sha256');
    for (const token of canonicalSourceTokens({ chunks, dependencies })) dependencyHash.update(token, 'utf8');
    const dependencyDigest = dependencyHash.digest('hex');
    return Object.freeze({ rootKey: actual.key, rootDigest: root.sha256, sourceDigest: index.sourceDigest, dependencyDigest, diagnostics, game });
  }
}
