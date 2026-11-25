// Independent map-template validation. No persistence, authority or game creation.
// Web policy only; native admission remains the shared compiler's responsibility.
import { syncRoadEndpoints } from './copyprofile.js';
import { isAutoRoadId } from '../web/src/editor/roadchain.js';
import { canonicalDigest, admitChapterCity, applySharedCityData, validateGameSource, GAME_RULE_PROFILE, GAMESOURCE_SCHEMA } from '../web/src/content/authoring/gamesource.js';
import { compileGameSource } from '../web/src/content/authoring/trialcompile.js';
import { assertMapConnected } from '../web/src/content/authoring/mapcompile.js';
import { CITY_BASE_NUMBERS, CITY_NUMBER_LIMITS } from '../web/src/content/authoring/cityrecords.js';

export const SYSTEM_BASE_MAP_SCHEMA = 'system-base-map-1';
export const SYSTEM_BASE_MAP_PROFILE = 'ki-fixed-map-384x256-192-1';

// 轻量形状校验：复制提交前先确认新游戏据点能进系统基，避免游戏已建、系统基没刷新的半截状态。
// 与模板校验同口径（名＋七项数值），不要求 x/y（未落子储备允许缺坐标）。
export function assertSystemBaseCities(cities) {
  if (!cities || typeof cities !== 'object' || Array.isArray(cities) || !Object.keys(cities).length)
    throw new RangeError('system base requires a non-empty city map');
  for (const [cityId, city] of Object.entries(cities)) {
    if (!city || typeof city !== 'object' || Array.isArray(city)) throw new RangeError(`system base city ${cityId} requires a record`);
    if (typeof city.name !== 'string' || !city.name.trim()) throw new RangeError(`system base city ${cityId} requires a name`);
    if (city.region !== undefined && (typeof city.region !== 'string' || [...city.region].length > 6)) throw new RangeError(`system base city ${cityId} requires region up to 6 chars`);
    if (city.battleMapId !== undefined) {
      const siege = /^ki-1995:siege:(\d{1,3})$/.exec(city.battleMapId ?? '');
      if (!siege || Number(siege[1]) > 191) throw new RangeError(`system base city ${cityId} requires a shared siege battleMapId`);
    }
    if (city.troops_cap !== undefined && (!Number.isInteger(city.troops_cap) || city.troops_cap < 0 || city.troops_cap > 255))
      throw new RangeError(`system base city ${cityId} requires troops_cap 0..255`);
    for (const field of CITY_BASE_NUMBERS) {
      if (field === 'view' && city.view === undefined) continue;
      if (!Number.isSafeInteger(city[field]) || city[field] < 0 || city[field] > CITY_NUMBER_LIMITS[field])
        throw new RangeError(`system base city ${cityId} requires valid ${field}`);
    }
  }
}

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
  assertMapConnected({ schemaVersion: 1, map: content.map, componentDefinitions: content.componentDefinitions ?? {} });
  // 建檔未落子的尾端儲備保留在模板；只有地圖上的據點參與路網編譯。
  const placed = new Set(content.map.placements.map(p => p.cityId));
  const entries = Object.entries(content.cities).sort((a,b) => a[1].runtimeSlot - b[1].runtimeSlot);
  if (entries.length > 512 || entries.some(([id, city], slot) => city.cityId !== id || city.runtimeSlot !== slot))
    throw new RangeError('invalid template city identities');
  const mapCities = Object.fromEntries(entries.filter(([id, city]) => {
    if (placed.has(id)) return true;
    if (city.x != null || city.y != null || !city.battleMapId || city.troops_cap == null)
      throw new RangeError('invalid unplaced template city');
    return false;
  }));
  const compiled = compileGameSource({ schemaVersion: GAMESOURCE_SCHEMA, gameId: 'system-base-map-check',
    ruleProfile: GAME_RULE_PROFILE, sourceRef: { kind: 'system-base-map-check', sourceId: 'system-base-map', revision: digest, digest },
    map: content.map, componentDefinitions: content.componentDefinitions, cities: mapCities,
    compatibilityAssets: content.compatibilityAssets, chapters: {}, chapterOrder: [],
    localModel: { draftRevision: '1' } }, sha256hex, { mapExtent: true });
  Object.values(content.cities).forEach(city => {
    if (typeof city.name !== 'string' || !city.name.trim()) throw new RangeError('template city name required');
    if (city.region !== undefined && (typeof city.region !== 'string' || [...city.region].length > 6)) throw new RangeError(`template city ${city.cityId} requires region up to 6 chars`);
    if (city.troops_cap !== undefined && (!Number.isInteger(city.troops_cap) || city.troops_cap < 0 || city.troops_cap > 255))
      throw new RangeError(`template city ${city.cityId} requires troops_cap 0..255`);
    CITY_BASE_NUMBERS.forEach(field => {
      if (field === 'view' && city.view === undefined) return;
      if (!Number.isSafeInteger(city[field]) || city[field] < 0 || city[field] > CITY_NUMBER_LIMITS[field])
        throw new RangeError(`template city ${city.cityId} requires valid ${field}`);
    });
  });
  const instanceIds = [...content.map.decorations, ...content.map.placements,
    ...content.map.roads.flatMap(road => road.components ?? [])].map(item => item.id);
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
  return { digest, compiled, mapCities };
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
  if (next.sourceRef.kind === 'builtin-template') validateGameSource(next, { draft: true, mapExtent: true });
  else {
    // Template additions become neutral chapter cities; original slots and
    // unplaced reserves keep their prior meanings. Use the same admission
    // and endpoint conversion as a road built inside the game workspace.
    const oldSlots = new Set(Object.values(game.cities).map(city => city.runtimeSlot));
    for (const city of Object.values(checked.mapCities).sort((a,b) => a.runtimeSlot-b.runtimeSlot)) {
      if (!oldSlots.has(city.runtimeSlot)) admitChapterCity(next, city.cityId, city.troops_cap, city.battleMapId, next.map.bounds);
    }
    for (const road of next.map.roads) {
      if (isAutoRoadId('system-base-map', road.id)) syncRoadEndpoints(next, road.fromCityId, road.toCityId);
    }
    // The editable copy retains unplaced reserves. Validate imported chapters
    // against the same placed-city projection as the template road graph.
    compileGameSource({ ...next, cities: checked.mapCities }, sha256hex, { mapExtent: true });
  }
  return next;
}
