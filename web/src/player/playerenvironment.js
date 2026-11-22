// Trusted loadPlayerPack output -> the existing engine's catalog/world/new-game
// adapters. No Trial binding, built-in URL fallback, storage or App installation.
import { createContentCatalog } from '../content/catalog.js';
import { createWorldResources } from '../game/worldresources.js';
import { createNewGameScenario } from '../game/world.js';
import { bindPortraitOverrides, buildPortraitOverrides } from '../core/assets.js';
import { TRIAL_COMPILER_REVISION } from '../content/authoring/trialcompile.js';
import { validateIdentity } from './runtimecontract.js';

export function createPlayerEnvironment(pack, { playerFaction, northExperiment = false, mapExtent = false } = {}) {
  if (typeof pack?.assertCurrent !== 'function') throw new TypeError('loaded player pack required');
  const current = pack.assertCurrent.bind(pack);
  current();
  const identity = pack.identity, manifest = pack.manifest;
  validateIdentity(identity);
  // CITY-CAPACITY-1 C6(c) (user-authorized): dual formal-pack triplets.
  // v2 (schema 1 / studio-app-2) and v3 (schema 2 / studio-app-3) only.
  // MAP-EXT E6: mapExtent 接受任一受支持侧；northExperiment 仍仅北向。
  const allowGrid = northExperiment === true || mapExtent === true;
  const triplet = manifest?.schemaVersion === 1 && manifest.buildFormat === 'studio-app-2' ? 2
    : manifest?.schemaVersion === 2 && manifest.buildFormat === 'studio-app-3' ? 3 : allowGrid && manifest?.schemaVersion === 3 && manifest.buildFormat === 'studio-world-grid-1' ? 4 : 0;
  if (manifest?.compilerRevision !== TRIAL_COMPILER_REVISION || triplet === 0 ||
      manifest.identity?.gameId !== identity.gameId || manifest.identity.sourceDigest !== identity.sourceDigest ||
      manifest.identity.draftRevision !== identity.revision || !manifest.chapters?.includes(identity.chapterId) ||
      !pack.chapter || !Number.isInteger(playerFaction) || !pack.chapter.factions?.some(f => f.idx === playerFaction && f.retired !== true)) {
    throw new TypeError('matching formal pack and explicit player faction required');
  }
  function url(role) {
    const value = pack.resourceURLs?.[role];
    if (typeof value !== 'string' || !value.startsWith('blob:')) throw new TypeError('missing owned player resource');
    return value;
  }
  const assets = Object.fromEntries(['terrain', 'roadGraph', 'roadCost', 'roadOffset'].map(id => [id, url('asset:' + id)]));
  for (const group of ['seasons', 'seasonAtlases']) {
    assets[group] = Object.fromEntries(['spring', 'summer', 'autumn', 'winter'].map(season => [season, url(group + ':' + season)]));
  }
  assets.minimap = { base: url('asset:minimapBase'), large: url('asset:minimapLarge') };
  const portraits = manifest.portraits.map(entry => ({ ...entry, url: url('asset:' + entry.assetId) }));
  const base = createContentCatalog({ schemaVersion: 1, rules: 'ki-1995', id: identity.gameId,
    revision: identity.sourceDigest, chapters: [{ id: identity.chapterId, legacyScenarioIndex: 0, official: false }] },
  { scenarios: [pack.chapter] });
  // Content/world revisions remain dependency digests. Publication is a separate
  // identity: publishing the SAME saved draft again must not admit old saves.
  const publication = Object.freeze({ releaseId: identity.releaseId, ordinal: identity.ordinal });
  const chapter = Object.freeze({ ...base.chapter(0), reference: Object.freeze({ ...base.chapter(0).reference, publication }) });
  const content = Object.freeze({ ...base, chapters: Object.freeze([chapter]),
    chapter(indexOrId) { return indexOrId === 0 || indexOrId === chapter.id ? chapter : null; },
    resolveReference(reference) {
      current();
      if (reference?.publication?.releaseId !== publication.releaseId || reference.publication.ordinal !== publication.ordinal) return null;
      return base.resolveReference(reference) ? chapter : null;
    },
  });
  const world = createWorldResources({ ...manifest.world, assets }, { assertCurrent: current, northExperiment: triplet === 4 && northExperiment === true, mapExtent: triplet === 4 && mapExtent === true });
  bindPortraitOverrides(world, buildPortraitOverrides(pack.chapter.generals, portraits));
  const raw = createNewGameScenario(pack.chapter, playerFaction);
  current();
  // Deliberately no persistent:true, private binding, session ticket or save store.
  // The caller retains ownership of the pack and must close it on final exit.
  return Object.freeze({ raw, content, world, player: playerFaction, identity, assertCurrent: current });
}
