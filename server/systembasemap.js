// Independent map-template validation. No persistence, authority or game creation.
// Web policy only; native admission remains the shared compiler's responsibility.
import { canonicalDigest, applySharedCityData, validateGameSource, GAME_RULE_PROFILE, GAMESOURCE_SCHEMA } from '../web/src/content/authoring/gamesource.js';
import { compileGameSource } from '../web/src/content/authoring/trialcompile.js';
import { CITY_BASE_NUMBERS, CITY_NUMBER_LIMITS } from '../web/src/content/authoring/cityrecords.js';

export const SYSTEM_BASE_MAP_SCHEMA = 'system-base-map-1';
export const SYSTEM_BASE_MAP_PROFILE = 'ki-fixed-map-384x256-192-1';

export function validateSystemBaseMap(template, sha256hex) {
  if (template?.schema !== SYSTEM_BASE_MAP_SCHEMA || template.supportProfile !== SYSTEM_BASE_MAP_PROFILE)
    throw new RangeError('unsupported system base map schema/profile');
  if (Object.keys(template).sort().join(',') !== 'content,provenance,schema,supportProfile')
    throw new RangeError('system base map root must contain only template data');
  const digest = canonicalDigest(template, sha256hex);
  const { provenance, content } = template;
  if (typeof provenance?.sourceRevision !== 'string' || !provenance.sourceRevision ||
      !/^[a-f0-9]{64}$/.test(provenance.sourceDigest ?? '') || provenance.policy !== 'web-piece-policy-1')
    throw new RangeError('system base map requires conversion provenance');
  if (!content?.compatibilityAssets || !Array.isArray(content.selectionGroups))
    throw new RangeError('system base map requires explicit compatibility assets and selection groups');
  if (Object.keys(content).sort().join(',') !== 'cities,compatibilityAssets,componentDefinitions,editorAssets,map,selectionGroups')
    throw new RangeError('system base map content must not contain chapter/person/game state');
  // Private compiler projection, NOT a stored game, a publish ticket or a new
  // permitted sourceRef kind in the legacy fixed-copy profile.
  const compiled = compileGameSource({ schemaVersion: GAMESOURCE_SCHEMA, gameId: 'system-base-map-check',
    ruleProfile: GAME_RULE_PROFILE, sourceRef: { kind: 'system-base-map-check', sourceId: 'system-base-map', revision: digest, digest },
    map: content.map, componentDefinitions: content.componentDefinitions, cities: content.cities,
    compatibilityAssets: content.compatibilityAssets, chapters: {}, chapterOrder: [],
    localModel: { draftRevision: '1' } }, sha256hex);
  Object.values(content.cities).forEach(city => {
    if (typeof city.name !== 'string' || !city.name.trim()) throw new RangeError('template city name required');
    CITY_BASE_NUMBERS.forEach(field => {
      if (!Number.isSafeInteger(city[field]) || city[field] < 0 || city[field] > CITY_NUMBER_LIMITS[field])
        throw new RangeError(`template city ${city.cityId} requires valid ${field}`);
    });
  });
  const instanceIds = [...content.map.decorations, ...content.map.placements,
    ...content.map.roads.flatMap(road => road.components)].map(item => item.id);
  if (instanceIds.some(id => typeof id !== 'string' || !id) || new Set(instanceIds).size !== instanceIds.length)
    throw new RangeError('invalid/duplicate template instance identity');
  const layers = new Map([
    ['decorations', new Set(content.map.decorations.map(item => item.id))],
    ['roads', new Set(content.map.roads.map(item => item.id))],
    ['placements', new Set(content.map.placements.map(item => item.id))],
  ]);
  const groupIds = new Set();
  content.selectionGroups.forEach(group => {
    if (typeof group.id !== 'string' || !group.id || groupIds.has(group.id) || !Array.isArray(group.members) || !group.members.length)
      throw new RangeError('invalid/duplicate/empty system base map selection group');
    groupIds.add(group.id);
    const seen = new Set();
    group.members.forEach(member => {
      const key = `${member.layer}:${member.id}`;
      if (!layers.get(member.layer)?.has(member.id) || seen.has(key))
        throw new RangeError(`missing/duplicate selection member: ${key}`);
      seen.add(key);
    });
  });
  // Immutable image descriptors are carried by value. The storage boundary
  // must additionally bind these descriptors to trusted, present bytes.
  const assets = content.editorAssets;
  if (!assets?.springAtlas || !assets.seasonAtlases || !assets.seasons)
    throw new RangeError('system base map requires editor atlas/season descriptors');
  [assets.springAtlas, ...['spring', 'summer', 'autumn', 'winter'].flatMap(season => [assets.seasonAtlases[season], assets.seasons[season]])].forEach(asset => {
    if (typeof asset?.url !== 'string' || !asset.url || !/^[a-f0-9]{64}$/.test(asset.sha256 ?? '') ||
        !Number.isSafeInteger(asset.byteLength) || asset.byteLength < 1)
      throw new RangeError('invalid system base map resource descriptor');
  });
  return { digest, compiled };
}

// Creation boundary: one persisted snapshot, no read of a moving "latest" pointer.
// Does not write the legacy fixed baseline or grant storage/HTTP authority.
export function instantiateSystemBaseMap(game, snapshot, sha256hex) {
  if (!Number.isSafeInteger(snapshot?.version) || snapshot.version < 1)
    throw new RangeError('system base map snapshot version required');
  const checked = validateSystemBaseMap(snapshot.template, sha256hex);
  if (snapshot.digest !== checked.digest) throw new RangeError('system base map snapshot digest mismatch');
  const next = structuredClone(game);
  const content = structuredClone(snapshot.template.content);
  next.map = content.map;
  next.componentDefinitions = content.componentDefinitions;
  next.cities = content.cities;
  next.compatibilityAssets = content.compatibilityAssets;
  next.selectionGroups = content.selectionGroups;
  next.mapEditorAssets = content.editorAssets;
  next.mapOrigin = { schema: snapshot.template.schema, supportProfile: snapshot.template.supportProfile,
    version: snapshot.version, digest: snapshot.digest };
  // sourceRef remains historical entity-source provenance for existing readers.
  // It is not the map's authority; mapOrigin records that independent lineage.
  next.compatibility.slotBindings.cities = Object.fromEntries(Object.values(next.cities).map(city => [city.cityId, city.runtimeSlot]));
  applySharedCityData(next);
  // Real imported chapters must agree with the template's native nodes/roads.
  // Reject mismatch; never restore the old map or silently rewrite adjacency.
  // The certified minimal profile creates an intentionally unfinished blank
  // chapter. Its map has already passed full template compilation above, but
  // missing people/factions are draft authoring, not a playable chapter yet.
  if (next.sourceRef.kind === 'builtin-template') validateGameSource(next, { draft: true });
  else compileGameSource(next, sha256hex);
  return next;
}
