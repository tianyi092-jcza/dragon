// CITY-CAPACITY-1: named chapter city slice -> detached runtime indices.
// citySource is a strict captureCitySource result; graph is a
// projectStructuredRoadGraph result. Neither may change after capture.
// This is NOT Scenario admission, a save restore, or a replacement rule engine.
import { cityRecord } from './cityrecords.js';

export function compileChapterCityState(citySource, chapter, graph) {
  cityRecord(chapter, ['cities', 'factions']);
  const sourceCities = cityRecord(chapter.cities);
  const { cityIds, indexByCityId } = citySource.identity;
  if (Object.keys(sourceCities).length !== cityIds.length ||
      Object.keys(sourceCities).some(id => !Object.hasOwn(indexByCityId, id)))
    throw new RangeError('chapter cities must exactly cover placed identities');
  if (!Array.isArray(chapter.factions) || chapter.factions.length !== 22)
    throw new RangeError('complete physical faction city table required');
  const cityIndex = (id, field) => {
    if (id === null) return null;
    if (typeof id !== 'string' || !Object.hasOwn(indexByCityId, id))
      throw new RangeError(`unresolved or unplaced ${field}: ${String(id)}`);
    return indexByCityId[id];
  };
  const valueLimits = { faction: 21, governor: 127, prod: 65535,
    growth: 255, defence: 255, troops: 255, troops_cap: 255 };
  const initialFields = ['attr', '_aiCooldown', '_strategicLastFaction',
    'strategicBorderCount', 'disaster_event', 'cityCacheByte'];
  const placements = new Map(citySource.placements.map(place => [place.cityId, place]));
  if (graph.nodes.length !== cityIds.length || graph.nodes.some((node, index) => {
    const place = placements.get(cityIds[index]);
    return node.cityId !== cityIds[index] || node.cityIndex !== index || node.x !== place.x || node.y !== place.y;
  })) throw new RangeError('road graph and city source identities/positions disagree');
  const counts = Array(22).fill(0), cityCache = [];
  const cities = cityIds.map((cityId, idx) => {
    const row = cityRecord(sourceCities[cityId], [...Object.keys(valueLimits), 'initializer']);
    const values = Object.fromEntries(Object.entries(valueLimits).map(([field, max]) => {
      const value = row[field];
      if (value === null && (field === 'faction' || field === 'governor')) return [field, null];
      if (!Number.isInteger(value) || value < 0 || value > max)
        throw new RangeError(`invalid chapter city ${field}: ${cityId}`);
      return [field, value];
    }));
    const input = cityRecord(row.initializer, [...initialFields, 'neighbourCityIds']);
    const initial = Object.fromEntries(initialFields.map(field => {
      const value = input[field];
      if (!Number.isInteger(value) || value < 0 || value > 255)
        throw new RangeError(`invalid city initializer ${field}: ${cityId}`);
      return [field, value];
    }));
    if (!Array.isArray(input.neighbourCityIds) || input.neighbourCityIds.length !== 4)
      throw new RangeError(`four ordered city neighbour slots required: ${cityId}`);
    const neighbours = Array.from(input.neighbourCityIds, id => cityIndex(id, 'neighbourCityId'));
    const roadNeighbours = graph.nodes[idx].ports.filter(port => port !== null).map(port => {
      const edge = graph.edges[port.roadIndex];
      return port.end === 'from' ? edge.toCityIndex : edge.fromCityIndex;
    }).sort((a, b) => a - b);
    const strategicNeighbours = neighbours.filter(index => index !== null).sort((a, b) => a - b);
    if (strategicNeighbours.length !== roadNeighbours.length ||
        strategicNeighbours.some((index, slot) => index !== roadNeighbours[slot]))
      throw new RangeError(`strategic neighbours disagree with roads: ${cityId}`);
    // Only compare sorted COPIES. C1C strategic order and road-port order are
    // different authorities (2600/3840 imported rows differ); do not reorder either.
    const { cityCacheByte, ...runtimeInitial } = initial;
    cityCache.push(cityCacheByte);
    if (values.faction !== null) counts[values.faction]++;
    const definition = citySource.cities[cityId], place = placements.get(cityId);
    // Preserve chapter values verbatim, even when different from defaults/caps;
    // import provenance is external, never a fabricated 32-byte city record.
    return { idx, cityId, name: definition.name, x: place.x, y: place.y,
      max_prod: definition.max_prod, type: definition.type, view: definition.view,
      battleMapId: definition.battleMapId, ...values, ...runtimeInitial,
      strategicNeighbours: neighbours };
  });
  const factionCities = Array.from(chapter.factions, (value, factionIndex) => {
    const faction = cityRecord(value, ['factionIndex', 'declared', 'capitalCityId',
      'strategicCityPrimaryId', 'strategicCitySecondaryId', 'nCities']);
    if (faction.factionIndex !== factionIndex || typeof faction.declared !== 'boolean')
      throw new RangeError('invalid physical faction city identity');
    // Source slice counts are derived at authoring/import boundaries, not live
    // F23 checkpoints. A stale source count must not silently become rule state.
    if (faction.nCities !== counts[factionIndex])
      throw new RangeError(`chapter city count disagrees with owners: ${factionIndex}`);
    return { factionIndex, declared: faction.declared,
      capitalCityIndex: cityIndex(faction.capitalCityId, 'capitalCityId'),
      strategicCityPrimaryIndex: cityIndex(faction.strategicCityPrimaryId, 'strategicCityPrimaryId'),
      strategicCitySecondaryIndex: cityIndex(faction.strategicCitySecondaryId, 'strategicCitySecondaryId'),
      nCities: counts[factionIndex] };
  });
  return { cities, factionCities, cityCache };
}
