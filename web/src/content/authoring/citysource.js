// CITY-CAPACITY-1: city portion of the new source contract, not GameSource admission.
// Numeric values here are NEW-CHAPTER defaults; never overwrite existing chapter
// values (especially troops_cap). Coordinates belong exclusively to placements.
import { cityRecord, cityName } from './cityrecords.js';
import { compileCityIdentity } from './cityidentity.js';

export function captureCitySource(source, { draft = true } = {}) {
  const { cities, cityOrder, placements } = source;
  const identity = compileCityIdentity(source);
  const placementMetadata = ['id', 'componentRef', 'variantRef', 'importRef'];
  const placementIds = new Set();
  for (const placement of placements) {
    cityRecord(placement);
    if (Object.keys(placement).some(key => !['cityId', 'x', 'y', ...placementMetadata].includes(key)))
      throw new RangeError('unknown placement field');
    for (const key of placementMetadata) {
      if (!Object.hasOwn(placement, key)) continue;
      // maplayers explicitly permits a missing/null componentRef (no stamp).
      if (key === 'componentRef' && placement[key] === null) continue;
      if (typeof placement[key] !== 'string' || !placement[key].length)
        throw new RangeError(`invalid placement ${key}`);
    }
    if (Object.hasOwn(placement, 'id')) {
      if (placementIds.has(placement.id)) throw new RangeError('duplicate placement id');
      placementIds.add(placement.id);
    }
  }
  const limits = {
    max_prod: 65535, prod: 65535, growth: 255, defence: 255,
    troops: 255, troops_cap: 255, type: 15, view: 15,
  };
  const fields = ['cityId', 'name', ...Object.keys(limits), 'battleMapId'];
  const captured = Object.fromEntries(cityOrder.map(cityId => {
    const city = cityRecord(cities[cityId]);
    if (Object.keys(city).some(field => !fields.includes(field)))
      throw new RangeError(`unknown city definition field: ${cityId}`);
    if (Object.hasOwn(city, 'name') && cityName(city.name) !== city.name)
      throw new RangeError(`noncanonical city name: ${cityId}`);
    for (const [field, max] of Object.entries(limits)) {
      if (!Object.hasOwn(city, field)) continue;
      const value = city[field];
      if (!Number.isInteger(value) || value < 0 || value > max)
        throw new RangeError(`invalid city ${field}: ${cityId}`);
    }
    if (Object.hasOwn(city, 'battleMapId') &&
        (typeof city.battleMapId !== 'string' || !city.battleMapId.length))
      throw new RangeError(`invalid battleMapId: ${cityId}`);
    if (city.prod > city.max_prod || city.troops > city.troops_cap)
      throw new RangeError(`city default exceeds its cap: ${cityId}`);
    if (!draft && Object.hasOwn(identity.indexByCityId, cityId) &&
        fields.some(field => !Object.hasOwn(city, field)))
      throw new RangeError(`incomplete placed city definition: ${cityId}`);
    return [cityId, { ...city }];
  }));
  return {
    cities: captured,
    cityOrder: [...cityOrder],
    placements: placements.map(placement => ({ ...placement })),
    identity,
  };
}
