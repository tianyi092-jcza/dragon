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
// Game-level base numbers (user 2026-11: 据点基础属性归游戏级，除所属势力外都要有).
// Only fixed attributes live here: prod/troops are engine-evolved runtime values
// and must never be stored as definition data.
// 用户 2026-11 决定按原版证据收紧（C）：20 章 × 192 格对照第 1 章，只有
// max_prod／type／view 完全一致（0 差异）；growth／defence／troops_cap 各章不同
// （growth 2189 格、troops_cap 2328 格、defence 1 格），属章节初始化值，
// 与 AI／经济引擎逐章取值相关，不得拉平到游戏级。
// Authoring metadata only: these are the defaults a chapter inherits; the
// evidence-bound range/encoding checks stay with the native writers.
export const CITY_BASE_NUMBERS = Object.freeze(['max_prod', 'type', 'view']);
export const CITY_CHAPTER_NUMBERS = Object.freeze(['growth', 'defence', 'troops_cap']);
export function cityBaseNumbers(value) {
  const numbers = {};
  for (const name of CITY_BASE_NUMBERS) {
    if (!Object.hasOwn(value, name)) continue;
    const number = value[name];
    if (!Number.isSafeInteger(number) || number < 0 || number > 65535) throw new RangeError('city base number out of range');
    numbers[name] = number;
  }
  return numbers;
}
export function captureCityDefinitions(game) {
  cityRecord(game); cityRecord(game.cities);
  const cities = {}, slots = new Set();
  const allowed = ['cityId', 'runtimeSlot', 'x', 'y', 'name', ...CITY_BASE_NUMBERS];
  for (const [id, value] of Object.entries(game.cities)) {
    const city = cityRecord(value), keys = Object.keys(city);
    if (city.cityId !== id || !id || keys.some(key => !allowed.includes(key)) || !['cityId', 'runtimeSlot', 'x', 'y'].every(key => Object.hasOwn(city, key))) throw new RangeError('city definition fields are not understood');
    cityBaseNumbers(city);
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
