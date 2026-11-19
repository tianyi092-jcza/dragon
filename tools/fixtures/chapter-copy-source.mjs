// Explicitly isolated source for CHAPTER-WB's full-copy positive control.
// Never registers a source, writes the builtin tree, or changes production pins.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { installedSourcePolicy, isolatedChapterSourcePolicy } from '../../server/sourcecatalogpolicy.js';
import { readInstalledEditorSource } from '../editor_builtin_source.mjs';
import { copyBuiltinGame, addBlankChapter, renameChapter } from '../../web/src/content/authoring/gamesource.js';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const pathFor = digest => `fixtures/chapter-workbench/${digest}.json`;
const registryFor = digest => `isolated-chapter-wb-${digest}`;

export function buildChapterCopySourceFixture() {
  // This reader validates the actual pinned manifests and all original roles.
  const original = readInstalledEditorSource();
  // Shared capitals now have an explicit first-wins product rule. Exercise
  // every original chapter, still under a separate test registry identity.
  const excluded = [], source = original;
  if (!source.chapters.length) throw new Error('expected fixed-source chapters');
  const bytes = Buffer.from(JSON.stringify({ schema: 'chapter-workbench-source-1',
    baseRegistryId: 'approved-builtin-28805f-entities7e7-1', baseRevision: source.revision,
    excluded, chapterIds: source.chapters.map(chapter => chapter.id) }));
  const sourceDigest = sha(bytes);
  const role = Object.freeze({ path: pathFor(sourceDigest), sha256: sourceDigest, byteLength: bytes.length });
  const basePolicy = installedSourcePolicy(readFileSync(new URL('../../server/pinned/world-manifest.txt', import.meta.url)),
    readFileSync(new URL('../../server/pinned/entity-manifest.txt', import.meta.url)));
  const policy = isolatedChapterSourcePolicy(basePolicy, role), registryId = policy.registryId;
  const readWeb = path => path === role.path ? Buffer.from(bytes) : readFileSync(new URL('../../web/' + path, import.meta.url));
  const createCopyLoader = options => createIsolatedChapterCopyLoader({ ...options, role, registryId });
  return { bytes, registryId, sourceDigest, baseRevision: source.revision, role, basePolicy,
    isolatedSource: Object.freeze({ policy, readWeb, createCopyLoader }),
    chapterIds: source.chapters.map(chapter => chapter.id), excluded };
}

export function createIsolatedChapterCopyLoader({ readWeb, role, registryId, kind = 'full' }) {
  if (typeof readWeb !== 'function' || !['full', 'minimal'].includes(kind)) throw new TypeError('isolated copy reader and projection required');
  if (!/^[a-f0-9]{64}$/.test(role.sha256) || role.path !== pathFor(role.sha256) || registryId !== registryFor(role.sha256) ||
    !Number.isSafeInteger(role.byteLength) || role.byteLength < 1) throw new TypeError('independent fixture identity required');
  const incoming = readWeb(role.path);
  if (!(incoming instanceof Uint8Array)) throw new TypeError('fixture bytes required');
  const bytes = Buffer.from(incoming);
  if (bytes.length !== role.byteLength || sha(bytes) !== role.sha256) throw new Error('isolated source byte identity mismatch');
  const payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (payload.schema !== 'chapter-workbench-source-1' || payload.baseRegistryId !== 'approved-builtin-28805f-entities7e7-1')
    throw new Error('isolated source schema mismatch');
  // The independent manifest references the already pinned base roles instead
  // of duplicating its 40MB map JSON and exceeding the existing 64MiB registry
  // budget. Every referenced byte is still checked by the original reader.
  const original = readInstalledEditorSource(undefined, path => Buffer.from(readWeb(path)));
  if (payload.baseRevision !== original.revision || !Array.isArray(payload.chapterIds) || !payload.chapterIds.length ||
    new Set(payload.chapterIds).size !== payload.chapterIds.length || payload.chapterIds.some(id => !original.chapters.some(chapter => chapter.id === id)))
    throw new Error('isolated chapter manifest references invalid base chapters');
  const source = { ...original, chapters: payload.chapterIds.map(id => original.chapters.find(chapter => chapter.id === id)) };
  return async ({ gameId, ownerId }) => {
    const game = copyBuiltinGame({ gameId, ownerId, kind, source }, sha);
    if (kind === 'minimal') {
      game.metadata.name = '新遊戲';
      renameChapter(game, addBlankChapter(game), '第一章');
    }
    return { game, provenance: { registryId, sourceDigest: role.sha256,
      baseRegistryId: payload.baseRegistryId, baseRevision: payload.baseRevision,
      inputHashes: { [role.path]: role.sha256 }, excludedFromOriginal: payload.excluded,
      limits: 'Isolated independent native-source fixture; copies all its chapters. Not the original twenty-chapter source or production registration.' } };
  };
}
