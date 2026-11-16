// CITY-CAPACITY-1 C1/D6: chapter CITY SLICE only, never a runtime snapshot.
// Imported chapter values are preserved, not replaced by new-chapter defaults.
import { decodeFactionSlot } from '../../game/nativefactions.js';

export function convertLegacyChapterCities(game, legacyBindings) {
  if (game?.schemaVersion !== 1 || !Array.isArray(game.chapterOrder) ||
      !game.chapters || typeof game.chapters !== 'object' || Array.isArray(game.chapters) ||
      Object.keys(game.chapters).length !== game.chapterOrder.length)
    throw new RangeError('complete legacy chapter source required');
  if (!Array.isArray(legacyBindings) || legacyBindings.length !== 192)
    throw new RangeError('complete legacy city bindings required');
  const cityIds = new Map(), ids = new Set();
  for (const binding of legacyBindings) {
    if (!binding || !Number.isInteger(binding.runtimeSlot) || binding.runtimeSlot < 0 || binding.runtimeSlot >= 192 ||
        cityIds.has(binding.runtimeSlot) || typeof binding.cityId !== 'string' || !binding.cityId.length || ids.has(binding.cityId))
      throw new RangeError('invalid legacy city binding');
    cityIds.set(binding.runtimeSlot, binding.cityId);
    ids.add(binding.cityId);
  }
  const countChanges = [], seenChapters = new Set();
  const chapters = Object.fromEntries(game.chapterOrder.map(chapterId => {
    if (typeof chapterId !== 'string' || seenChapters.has(chapterId) || !Object.hasOwn(game.chapters, chapterId))
      throw new RangeError('invalid legacy chapter order');
    seenChapters.add(chapterId);
    const state = game.chapters[chapterId]?.state;
    if (!Array.isArray(state?.cities) || state.cities.length !== 192 || !Array.isArray(state.factions))
      throw new RangeError(`incomplete chapter city/faction tables: ${chapterId}`);
    const duplicateRaw = state.nativeCityRecordRaw;
    if (Object.hasOwn(state, 'nativeCityRecordRaw') &&
        (!Array.isArray(duplicateRaw) || duplicateRaw.length !== 192))
      throw new RangeError(`invalid duplicate city raw table: ${chapterId}`);
    const seenCities = new Set(), counts = new Map();
    const cities = Object.fromEntries(state.cities.map(city => {
      if (!city || !cityIds.has(city.idx) || seenCities.has(city.idx))
        throw new RangeError(`invalid chapter city slot: ${chapterId}`);
      seenCities.add(city.idx);
      const values = {};
      for (const [field, max] of Object.entries({ faction: 21, governor: 127,
        prod: 65535, growth: 255, defence: 255, troops: 255, troops_cap: 255 })) {
        const value = city[field];
        if (value === null && (field === 'faction' || field === 'governor')) {
          values[field] = null;
          continue;
        }
        if (!Number.isInteger(value) || value < 0 || value > max)
          throw new RangeError(`invalid chapter city ${field}: ${chapterId}/${city.idx}`);
        values[field] = value;
      }
      const raw = city.raw;
      if (typeof raw !== 'string' || !/^[0-9a-f]{64}$/i.test(raw))
        throw new RangeError(`missing complete city initializer source: ${chapterId}/${city.idx}`);
      if (duplicateRaw && (typeof duplicateRaw[city.idx] !== 'string' || duplicateRaw[city.idx].toLowerCase() !== raw.toLowerCase()))
        throw new RangeError(`city raw sources disagree: ${chapterId}/${city.idx}`);
      const bytes = Uint8Array.from({ length: 32 }, (_, i) => Number.parseInt(raw.slice(i * 2, i * 2 + 2), 16));
      // Same inputs as scenariocitycache's fresh loader, but city references
      // become IDs. Preserve every slot, C00 bit and anomalous border count.
      const neighbourCityIds = Array.from(bytes.slice(0x1c), index => {
        if (index === 255) return null;
        if (!cityIds.has(index)) throw new RangeError(`unresolved initializer neighbour: ${chapterId}/${city.idx}`);
        return cityIds.get(index);
      });
      const initializer = { attr: bytes[0], _aiCooldown: bytes[0x17],
        _strategicLastFaction: bytes[0x1a], strategicBorderCount: bytes[0x1b],
        disaster_event: bytes[0x15], cityCacheByte: bytes[0x18] };
      for (const [field, value] of Object.entries(initializer)) {
        if (Object.hasOwn(city, field) && city[field] !== value)
          throw new RangeError(`named/raw initializer ${field} disagree: ${chapterId}/${city.idx}`);
      }
      if (Object.hasOwn(city, 'strategicNeighbours') &&
          (!Array.isArray(city.strategicNeighbours) || city.strategicNeighbours.length !== 4 ||
           Array.from(city.strategicNeighbours).some((value, i) => value !== bytes[0x1c + i])))
        throw new RangeError(`named/raw neighbours disagree: ${chapterId}/${city.idx}`);
      if (values.faction !== null) counts.set(values.faction, (counts.get(values.faction) ?? 0) + 1);
      return [cityIds.get(city.idx), { ...values, initializer: { ...initializer, neighbourCityIds } }];
    }));
    if (state.factions.length > 22 || !Array.isArray(state.nativeFactionSlotRaw) || state.nativeFactionSlotRaw.length !== 22)
      throw new RangeError(`complete physical faction source required: ${chapterId}`);
    for (const [index, faction] of state.factions.entries()) {
      if (!faction || faction.idx !== index || !Number.isInteger(faction.n_cities) || faction.n_cities < 0 || faction.n_cities > 255)
        throw new RangeError(`invalid declared chapter faction: ${chapterId}`);
    }
    const factions = Array.from(state.nativeFactionSlotRaw, (raw, index) => {
      const faction = decodeFactionSlot(raw, index), declared = state.factions[index];
      const references = {};
      for (const [from, to] of [['capital', 'capitalCityId'],
        ['strategic_city_primary', 'strategicCityPrimaryId'], ['strategic_city_secondary', 'strategicCitySecondaryId']]) {
        const value = faction[from];
        if (declared && Object.hasOwn(declared, from) &&
            (declared[from] === 255 ? null : declared[from]) !== value)
          throw new RangeError(`declared/raw ${from} disagree: ${chapterId}/${index}`);
        if (value === null) references[to] = null;
        else if (cityIds.has(value)) references[to] = cityIds.get(value);
        else throw new RangeError(`unresolved ${from}: ${chapterId}/${faction.idx}`);
      }
      const nCities = counts.get(faction.idx) ?? 0;
      if (nCities !== faction.n_cities || (declared && declared.n_cities !== nCities))
        countChanges.push({ chapterId, factionIndex: faction.idx, before: faction.n_cities,
          declaredBefore: declared?.n_cities ?? null, after: nCities });
      return { factionIndex: faction.idx, declared: declared !== undefined, ...references, nCities };
    });
    return [chapterId, { cities, factions }];
  }));
  return { chapters, countChanges };
}
// B3片3(b)：live 版转换——raw 行沿 legacy 派生（含重复表核对与具名交叉核对），
// raw-less（admit 新城）读具名 initializer（attr 等 6 个 u8＋四槽 neighbourCityIds）。
// 不造 32B 记录；输出键形与 legacy 一致，直供 compileChapterCityState。
const NAMED_INITIALIZER_FIELDS = Object.freeze(['attr', '_aiCooldown', '_strategicLastFaction',
  'strategicBorderCount', 'disaster_event', 'cityCacheByte']);
export function convertLiveChapterCities(game, liveBindings) {
  if (game?.schemaVersion !== 1 || !Array.isArray(game.chapterOrder) ||
      !game.chapters || typeof game.chapters !== 'object' || Array.isArray(game.chapters) ||
      Object.keys(game.chapters).length !== game.chapterOrder.length)
    throw new RangeError('complete live chapter source required');
  if (!Array.isArray(liveBindings) || !liveBindings.length || liveBindings.length > 512)
    throw new RangeError('complete live city bindings required');
  const cityIds = new Map(), ids = new Set();
  for (const binding of liveBindings) {
    if (!binding || !Number.isInteger(binding.runtimeSlot) || binding.runtimeSlot < 0 || binding.runtimeSlot >= 512 ||
        cityIds.has(binding.runtimeSlot) || typeof binding.cityId !== 'string' || !binding.cityId.length || ids.has(binding.cityId))
      throw new RangeError('invalid live city binding');
    cityIds.set(binding.runtimeSlot, binding.cityId);
    ids.add(binding.cityId);
  }
  const countChanges = [], seenChapters = new Set();
  const chapters = Object.fromEntries(game.chapterOrder.map(chapterId => {
    if (typeof chapterId !== 'string' || seenChapters.has(chapterId) || !Object.hasOwn(game.chapters, chapterId))
      throw new RangeError('invalid live chapter order');
    seenChapters.add(chapterId);
    const state = game.chapters[chapterId]?.state;
    if (!Array.isArray(state?.cities) || !Array.isArray(state?.factions))
      throw new RangeError(`incomplete chapter city/faction tables: ${chapterId}`);
    const duplicateRaw = state.nativeCityRecordRaw;
    if (Object.hasOwn(state, 'nativeCityRecordRaw') && !Array.isArray(duplicateRaw))
      throw new RangeError(`invalid duplicate city raw table: ${chapterId}`);
    const seenCities = new Set(), counts = new Map();
    const cities = Object.fromEntries(state.cities.map(city => {
      if (!city || !cityIds.has(city.idx) || seenCities.has(city.idx))
        throw new RangeError(`invalid chapter city slot: ${chapterId}`);
      seenCities.add(city.idx);
      const values = {};
      for (const [field, max] of Object.entries({ faction: 21, governor: 127,
        prod: 65535, growth: 255, defence: 255, troops: 255, troops_cap: 255 })) {
        const value = city[field];
        if (value === null && (field === 'faction' || field === 'governor')) {
          values[field] = null;
          continue;
        }
        if (!Number.isInteger(value) || value < 0 || value > max)
          throw new RangeError(`invalid chapter city ${field}: ${chapterId}/${city.idx}`);
        values[field] = value;
      }
      let initializer, neighbourCityIds;
      if (typeof city.raw === 'string') {
        if (!/^[0-9a-f]{64}$/i.test(city.raw))
          throw new RangeError(`missing complete city initializer source: ${chapterId}/${city.idx}`);
        if (duplicateRaw && (typeof duplicateRaw[city.idx] !== 'string' || duplicateRaw[city.idx].toLowerCase() !== city.raw.toLowerCase()))
          throw new RangeError(`city raw sources disagree: ${chapterId}/${city.idx}`);
        const bytes = Uint8Array.from({ length: 32 }, (_, i) => Number.parseInt(city.raw.slice(i * 2, i * 2 + 2), 16));
        neighbourCityIds = Array.from(bytes.slice(0x1c), index => {
          if (index === 255) return null;
          if (!cityIds.has(index)) throw new RangeError(`unresolved initializer neighbour: ${chapterId}/${city.idx}`);
          return cityIds.get(index);
        });
        initializer = { attr: bytes[0], _aiCooldown: bytes[0x17],
          _strategicLastFaction: bytes[0x1a], strategicBorderCount: bytes[0x1b],
          disaster_event: bytes[0x15], cityCacheByte: bytes[0x18] };
        for (const [field, value] of Object.entries(initializer)) {
          if (Object.hasOwn(city, field) && city[field] !== value)
            throw new RangeError(`named/raw initializer ${field} disagree: ${chapterId}/${city.idx}`);
        }
        if (Object.hasOwn(city, 'strategicNeighbours') &&
            (!Array.isArray(city.strategicNeighbours) || city.strategicNeighbours.length !== 4 ||
             Array.from(city.strategicNeighbours).some((value, i) => value !== bytes[0x1c + i])))
          throw new RangeError(`named/raw neighbours disagree: ${chapterId}/${city.idx}`);
      } else {
        initializer = {};
        for (const field of NAMED_INITIALIZER_FIELDS) {
          const value = city[field];
          if (!Number.isInteger(value) || value < 0 || value > 255)
            throw new RangeError(`missing named city initializer ${field}: ${chapterId}/${city.idx}`);
          initializer[field] = value;
        }
        if (!Array.isArray(city.neighbourCityIds) || city.neighbourCityIds.length !== 4)
          throw new RangeError(`four ordered city neighbour slots required: ${chapterId}/${city.idx}`);
        neighbourCityIds = city.neighbourCityIds.map(id => {
          if (id === null) return null;
          if (typeof id !== 'string' || !ids.has(id)) throw new RangeError(`unresolved initializer neighbour: ${chapterId}/${city.idx}`);
          return id;
        });
      }
      if (values.faction !== null) counts.set(values.faction, (counts.get(values.faction) ?? 0) + 1);
      return [cityIds.get(city.idx), { ...values, initializer: { ...initializer, neighbourCityIds } }];
    }));
    if (state.factions.length > 22 || !Array.isArray(state.nativeFactionSlotRaw) || state.nativeFactionSlotRaw.length !== 22)
      throw new RangeError(`complete physical faction source required: ${chapterId}`);
    for (const [index, faction] of state.factions.entries()) {
      if (!faction || faction.idx !== index || !Number.isInteger(faction.n_cities) || faction.n_cities < 0 || faction.n_cities > 255)
        throw new RangeError(`invalid declared chapter faction: ${chapterId}`);
    }
    const factions = Array.from(state.nativeFactionSlotRaw, (raw, index) => {
      const faction = decodeFactionSlot(raw, index), declared = state.factions[index];
      const references = {};
      for (const [from, to] of [['capital', 'capitalCityId'],
        ['strategic_city_primary', 'strategicCityPrimaryId'], ['strategic_city_secondary', 'strategicCitySecondaryId']]) {
        const value = faction[from];
        if (declared && Object.hasOwn(declared, from) &&
            (declared[from] === 255 ? null : declared[from]) !== value)
          throw new RangeError(`declared/raw ${from} disagree: ${chapterId}/${index}`);
        if (value === null) references[to] = null;
        else if (cityIds.has(value)) references[to] = cityIds.get(value);
        else throw new RangeError(`unresolved ${from}: ${chapterId}/${faction.idx}`);
      }
      const nCities = counts.get(faction.idx) ?? 0;
      if (nCities !== faction.n_cities || (declared && declared.n_cities !== nCities))
        countChanges.push({ chapterId, factionIndex: faction.idx, before: faction.n_cities,
          declaredBefore: declared?.n_cities ?? null, after: nCities });
      return { factionIndex: faction.idx, declared: declared !== undefined, ...references, nCities };
    });
    return [chapterId, { cities, factions }];
  }));
  return { chapters, countChanges };
}
