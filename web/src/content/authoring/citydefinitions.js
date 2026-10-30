// Web authoring metadata only. No city creation, native name encoding,
// movement, slot allocation or playable initialization is performed here.
import { chapterPeopleProjection } from './generaldefinitions.js';
import { cityRecord, cityName, captureCityDefinitions, captureChapterCities } from './cityrecords.js';

function scope(game) {
  chapterPeopleProjection(game);
  return captureCityDefinitions(game);
}
function existing(cities, cityId) {
  if (typeof cityId !== 'string' || !Object.hasOwn(cities, cityId)) throw new RangeError('existing city identity required');
}
export function setCityDefinitionName(game, cityId, name) {
  const cities = scope(game); existing(cities, cityId);
  cities[cityId].name = cityName(name);
  return { ...game, cities };
}
// Explicitly configured neutral chapter references, not implicit initialization
// of every map city. Missing name remains unknown; no first-chapter fallback.
export function chapterCitiesProjection(game) {
  const definitions = scope(game);
  return game.chapterOrder.map(chapterId => ({ chapterId,
    cities: Object.keys(captureChapterCities(game, game.chapters[chapterId])).map(cityId => ({
      cityId, factionId: null, values: { name: definitions[cityId].name ?? null }, overrides: {}, inheritedFields: ['name'], overriddenFields: [],
    })),
  }));
}
export function cityDefinitionChangeImpact(game, cityId, name) {
  const chapters = chapterCitiesProjection(game); existing(game.cities, cityId);
  const changedFields = game.cities[cityId].name === cityName(name) ? [] : ['name'];
  return { changedFields, affectedChapters: chapters.filter(row => changedFields.length && row.cities.some(city => city.cityId === cityId)).map(row => ({ chapterId: row.chapterId, fields: ['name'] })) };
}
export function applyChapterCityEdit(game, edit) {
  cityRecord(edit);
  if (edit.op !== 'set' && edit.op !== 'remove') throw new RangeError('chapter city operation required');
  cityRecord(edit, edit.op === 'set' ? ['op', 'chapterId', 'cityId', 'values'] : ['op', 'chapterId', 'cityId']);
  const definitions = scope(game); existing(definitions, edit.cityId);
  if (typeof edit.chapterId !== 'string' || !Object.hasOwn(game.chapters, edit.chapterId)) throw new RangeError('chapter identity required');
  const chapter = game.chapters[edit.chapterId], cities = captureChapterCities(game, chapter);
  if (edit.op === 'remove') {
    if (!Object.hasOwn(cities, edit.cityId)) throw new RangeError('chapter city is not configured');
    delete cities[edit.cityId];
  } else {
    const captured = captureChapterCities(game, { cities: { [edit.cityId]: edit.values } });
    Object.defineProperty(cities, edit.cityId, { value: captured[edit.cityId], enumerable: true, writable: true, configurable: true });
  }
  return { ...game, chapters: { ...game.chapters, [edit.chapterId]: { ...chapter, cities } } };
}
