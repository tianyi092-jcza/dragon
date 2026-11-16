// CITY-CAPACITY-1 C1: pure conversion of the CITY SOURCE SLICE only.
// No files, source mutations, GameSource-version changes or runtime admission.
import { captureCityDefinitions } from './cityrecords.js';
import { captureCitySource } from './citysource.js';

export function convertLegacyCitySource(game, { defaultChapterId, battleMapIds }) {
  if (game.schemaVersion !== 1) throw new RangeError('legacy GameSource schema 1 required');
  const definitions = Object.values(captureCityDefinitions(game))
    .sort((a, b) => a.runtimeSlot - b.runtimeSlot);
  if (definitions.length !== 192 || definitions.some((city, index) => city.runtimeSlot !== index))
    throw new RangeError('complete legacy city slot table required');
  if (!Array.isArray(game.chapterOrder) || !game.chapterOrder.includes(defaultChapterId))
    throw new RangeError('explicit default chapter identity required');
  const chapterCities = game.chapters?.[defaultChapterId]?.state?.cities;
  if (!Array.isArray(chapterCities) || chapterCities.length !== 192)
    throw new RangeError('complete default chapter city table required');
  const caps = new Map();
  for (const city of chapterCities) {
    if (!city || !Number.isInteger(city.idx) || city.idx < 0 || city.idx >= 192 || caps.has(city.idx) ||
        !Number.isInteger(city.troops_cap) || city.troops_cap < 0 || city.troops_cap > 255)
      throw new RangeError('invalid default chapter city identity or troop cap');
    caps.set(city.idx, city.troops_cap);
  }
  if (!Array.isArray(battleMapIds) || battleMapIds.length !== 192)
    throw new RangeError('explicit legacy battle map bindings required');
  for (const id of battleMapIds) {
    if (typeof id !== 'string' || !id.length)
      throw new RangeError('invalid legacy battle map identity');
  }
  const placements = game.map?.placements;
  if (!Array.isArray(placements) || placements.length !== 192)
    throw new RangeError('complete legacy placements required');
  const byId = new Map(definitions.map(city => [city.cityId, city]));
  for (const placement of placements) {
    const definition = byId.get(placement?.cityId);
    if (!definition || definition.x !== placement.x || definition.y !== placement.y)
      throw new RangeError('legacy placement and definition disagree');
  }
  const cities = Object.fromEntries(definitions.map(({ runtimeSlot, x, y, ...city }) => [city.cityId, {
    ...city,
    troops_cap: caps.get(runtimeSlot),
    battleMapId: battleMapIds[runtimeSlot],
  }]));
  const citySource = captureCitySource({
    cities,
    cityOrder: definitions.map(city => city.cityId),
    placements,
  }, { draft: false });
  return {
    citySource,
    defaultChapterId,
    legacyBindings: definitions.map(({ cityId, runtimeSlot, x, y }) => ({ cityId, runtimeSlot, x, y })),
  };
}
