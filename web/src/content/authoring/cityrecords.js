// Web authoring records only; no native initialization or slot conversion.
export function cityRecord(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new TypeError('plain city definition required');
  const descriptors = Object.getOwnPropertyDescriptors(value), names = Reflect.ownKeys(descriptors);
  if (names.some(key => typeof key !== 'string' || !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], 'value')) || keys && (names.length !== keys.length || keys.some(key => !Object.hasOwn(descriptors, key)))) throw new TypeError('city data fields required');
  return value;
}
export function cityName(value) {
  if (typeof value !== 'string') throw new TypeError('city name required');
  for (const char of value) {
    const point = char.codePointAt(0);
    if (point < 32 || point >= 127 && point <= 159 || point >= 0xd800 && point <= 0xdfff) throw new RangeError('invalid city name');
  }
  const name = value.normalize('NFC').trim();
  if (!name) throw new RangeError('city name required');
  return name;
}
export function captureCityDefinitions(game) {
  cityRecord(game); cityRecord(game.cities);
  const cities = {}, slots = new Set();
  for (const [id, value] of Object.entries(game.cities)) {
    const city = cityRecord(value), keys = Object.keys(city);
    if (city.cityId !== id || !id || keys.some(key => !['cityId', 'runtimeSlot', 'x', 'y', 'name'].includes(key)) || !['cityId', 'runtimeSlot', 'x', 'y'].every(key => Object.hasOwn(city, key))) throw new RangeError('city definition fields are not understood');
    if (!Number.isInteger(city.runtimeSlot) || city.runtimeSlot < 0 || city.runtimeSlot >= 192 || slots.has(city.runtimeSlot) || !Number.isInteger(city.x) || city.x < 0 || city.x >= 384 || !Number.isInteger(city.y) || city.y < 0 || city.y >= 256) throw new RangeError('fixed city binding required');
    if (Object.hasOwn(city, 'name') && cityName(city.name) !== city.name) throw new RangeError('saved city name must be canonical');
    slots.add(city.runtimeSlot);
    Object.defineProperty(cities, id, { value: { ...city }, enumerable: true, writable: true, configurable: true });
  }
  return cities;
}
export function captureChapterCities(game, chapter) {
  cityRecord(chapter);
  if (!Object.hasOwn(chapter, 'cities')) return {};
  const definitions = captureCityDefinitions(game);
  cityRecord(chapter.cities);
  return Object.fromEntries(Object.entries(chapter.cities).map(([cityId, value]) => {
    if (!Object.hasOwn(definitions, cityId)) throw new RangeError('chapter city references unknown definition');
    cityRecord(value, ['factionId', 'overrides']); cityRecord(value.overrides, []);
    // Only explicit neutral authoring references. Name is game-wide; numerical
    // overrides, faction assignment and governor initialization remain closed.
    if (value.factionId !== null) throw new RangeError('neutral chapter city required');
    return [cityId, { factionId: null, overrides: {} }];
  }));
}
