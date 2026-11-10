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
// 用户 2026-11 决定（原版字段表）：父表保存 名称／坐标／最大生产力／当前生产力／
// 上升值／防灾值／城兵／类型；其中 当前生产力・上升值・防灾值・城兵 是给章节新建时
// 用的默认值，一次性从当前游戏第一章的据点记录取回（缺失允许作者自填），章节自身
// 演化后的取值仍留章内，不拉平到游戏级。
// 原版证据：20 章 × 192 格对照第 1 章，max_prod／type／view 0 差异；
// growth／defence／troops_cap 各章不同，因此那三项只作默认值，不做一致性校验。
// Authoring metadata only: the evidence-bound range/encoding checks stay with the
// native writers.
export const CITY_BASE_NUMBERS = Object.freeze(['max_prod', 'prod', 'growth', 'defence', 'troops', 'type', 'view']);
// 只有這三項在原版 20 章 × 192 格對照中 0 差異，導入時可要求「章節無關常量」；
// prod／growth／defence／troops 逐章演化，只能取第一章作默認值，不得拉平。
export const CITY_SHARED_INVARIANTS = Object.freeze(['max_prod', 'type', 'view']);
export const CITY_CHAPTER_NUMBERS = Object.freeze(['growth', 'defence', 'troops_cap']);
// 原版偏移：0x0c–0x0d 最大生产力（字）、0x0e–0x0f 当前生产力（字）、0x10 上升值、
// 0x11 防灾值、0x12 城兵、0x17 高 4 位外观／低 4 位类型。
export const CITY_NUMBER_LIMITS = Object.freeze({ max_prod: 0xffff, prod: 0xffff, growth: 0xff, defence: 0xff, troops: 0xff, type: 0xff, view: 0xff });
export function cityBaseNumbers(value) {
  const numbers = {};
  for (const name of CITY_BASE_NUMBERS) {
    if (!Object.hasOwn(value, name)) continue;
    const number = value[name];
    if (!Number.isSafeInteger(number) || number < 0 || number > CITY_NUMBER_LIMITS[name]) throw new RangeError('city base number out of range');
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
