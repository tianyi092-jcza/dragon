// Web authoring definitions and chapter references only. No native slots,
// rule fields, initial records or runtime admission are created here.
import { KAO_MANIFEST } from '../../../kao/manifest.js';
import { BUILTIN_GAME_ID } from './gamesource.js';
import { captureChapterCities } from './cityrecords.js';

const portraits = new Map(KAO_MANIFEST.map(row => [row.id, row.sha256]));
function plain(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new TypeError('plain authoring record required');
  const descriptors = Object.getOwnPropertyDescriptors(value), names = Reflect.ownKeys(descriptors);
  if (names.some(key => typeof key !== 'string' || !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], 'value')) || keys && (names.length !== keys.length || keys.some(key => !Object.hasOwn(descriptors, key)))) throw new TypeError('authoring record fields required');
  return value;
}
function text(value) {
  if (typeof value !== 'string') throw new TypeError('general text required');
  for (const character of value) {
    const point = character.codePointAt(0);
    if (point < 32 || point >= 127 && point <= 159 || point >= 0xd800 && point <= 0xdfff) throw new RangeError('invalid general text');
  }
  return value.normalize('NFC');
}
const definitionFields = ['name', 'hao', 'portraitRef'];
function fieldValue(key, value) {
  if (key === 'name') {
    const name = text(value).trim();
    if (!name) throw new RangeError('general name required');
    return name;
  }
  if (key === 'hao') return text(value);
  if (value === null) return null;
  plain(value, ['assetId', 'sha256']);
  const { assetId, sha256 } = value;
  if (typeof assetId !== 'string' || typeof sha256 !== 'string' || portraits.get(assetId) !== sha256) throw new RangeError('shared portrait ID and SHA required');
  return { assetId, sha256 };
}
function definition(values) {
  plain(values, definitionFields);
  return Object.fromEntries(definitionFields.map(key => [key, fieldValue(key, values[key])]));
}
function identity(gameId, generalId) {
  const prefix = gameId + '#general-';
  if (typeof generalId !== 'string' || !generalId.startsWith(prefix) || !/^[a-f0-9]{64}$/.test(generalId.slice(prefix.length))) throw new RangeError('game-owned general identity required');
}
function person(values, saved = false) {
  plain(values, ['included', 'factionId', 'overrides']); plain(values.overrides);
  // Faction/appearance/native initialization are separate, still unopened domains.
  if (typeof values.included !== 'boolean' || values.factionId !== null) throw new RangeError('neutral chapter person required');
  const overrides = {};
  for (const key of Object.keys(values.overrides)) {
    if (!definitionFields.includes(key)) throw new RangeError('chapter override field required');
    const value = fieldValue(key, values.overrides[key]);
    if (saved && key !== 'portraitRef' && value !== values.overrides[key]) throw new RangeError('saved chapter override must be canonical');
    overrides[key] = value;
  }
  return { included: values.included, factionId: null, overrides };
}
function captureScope(game) {
  plain(game); plain(game.sourceRef); plain(game.generals); plain(game.chapters);
  if (typeof game.gameId !== 'string' || !game.gameId || game.gameId === BUILTIN_GAME_ID || game.sourceRef.kind !== 'builtin-template' || game.sourceRef.sourceId !== BUILTIN_GAME_ID) throw new RangeError('neutral authoring template required');
  const generals = {};
  for (const [id, value] of Object.entries(game.generals)) {
    identity(game.gameId, id);
    const captured = definition(value);
    if (captured.name !== value.name || captured.hao !== value.hao) throw new RangeError('saved general text must be canonical');
    generals[id] = captured;
  }
  const order = game.chapterOrder;
  if (!Array.isArray(order) || Object.getPrototypeOf(order) !== Array.prototype) throw new RangeError('chapter order required');
  const descriptors = Object.getOwnPropertyDescriptors(order), keys = Reflect.ownKeys(descriptors);
  if (keys.length !== order.length + 1 || keys.some(key => key !== 'length' && (typeof key !== 'string' || !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= order.length || !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], 'value')))) throw new RangeError('dense chapter order required');
  if (order.length !== Object.keys(game.chapters).length || new Set(order).size !== order.length) throw new RangeError('complete unique chapter order required');
  const chapters = new Map();
  for (const chapterId of order) {
    if (typeof chapterId !== 'string' || !chapterId || !Object.hasOwn(game.chapters, chapterId)) throw new RangeError('chapter identity required');
    const chapter = plain(game.chapters[chapterId]);
    if (chapter.chapterId !== chapterId || Object.keys(chapter).some(key => !['chapterId', 'sourceChapterId', 'name', 'state', 'people', 'cities'].includes(key)) || ['name', 'sourceChapterId'].some(key => Object.hasOwn(chapter, key) && typeof chapter[key] !== 'string')) throw new RangeError('chapter references are not understood');
    plain(chapter.state, ['factions', 'generals', 'cities']);
    if (['factions', 'generals', 'cities'].some(key => {
      const rows = chapter.state[key];
      return !Array.isArray(rows) || Object.getPrototypeOf(rows) !== Array.prototype || rows.length !== 0 || Reflect.ownKeys(rows).length !== 1;
    })) throw new RangeError('chapter references are not understood');
    captureChapterCities(game, chapter);
    const people = {};
    if (Object.hasOwn(chapter, 'people')) {
      plain(chapter.people);
      for (const [id, value] of Object.entries(chapter.people)) {
        identity(game.gameId, id);
        if (!Object.hasOwn(generals, id)) throw new RangeError('chapter person references unknown definition');
        people[id] = person(value, true);
      }
    }
    chapters.set(chapterId, { chapter, people });
  }
  return { generals, chapters };
}
function existingGeneral(game, scope, generalId) {
  identity(game.gameId, generalId);
  if (!Object.hasOwn(scope.generals, generalId)) throw new RangeError('general definition identity conflict');
}
function inheritance(record) {
  return {
    inheritedFields: definitionFields.filter(key => !Object.hasOwn(record.overrides, key)),
    overriddenFields: definitionFields.filter(key => Object.hasOwn(record.overrides, key)),
  };
}
function references(scope, generalId) {
  const result = [];
  for (const [chapterId, { people }] of scope.chapters) {
    if (Object.hasOwn(people, generalId)) result.push({ chapterId, included: people[generalId].included, ...inheritance(people[generalId]) });
  }
  return result;
}
// Complete only for the explicitly understood neutral authoring schema. Unknown
// references throw rather than returning an empty/partial deletion clearance.
export function generalDefinitionReferences(game, generalId) {
  const scope = captureScope(game); existingGeneral(game, scope, generalId);
  return references(scope, generalId);
}
export function effectiveChapterPerson(game, chapterId, generalId) {
  const scope = captureScope(game); existingGeneral(game, scope, generalId);
  const chapter = scope.chapters.get(chapterId);
  if (!chapter || !Object.hasOwn(chapter.people, generalId)) throw new RangeError('chapter person is not configured');
  const record = chapter.people[generalId];
  return { generalId, included: record.included, factionId: record.factionId, values: { ...scope.generals[generalId], ...record.overrides }, ...inheritance(record) };
}
// Exact affected fields for an update, after the same normalization used by
// the writer. included=false is still a live authoring reference.
export function generalDefinitionChangeImpact(game, generalId, values) {
  const scope = captureScope(game); existingGeneral(game, scope, generalId);
  const next = definition(values), previous = scope.generals[generalId];
  const changedFields = definitionFields.filter(key => JSON.stringify(previous[key]) !== JSON.stringify(next[key]));
  const affectedChapters = references(scope, generalId).map(row => ({
    chapterId: row.chapterId, fields: row.inheritedFields.filter(key => changedFields.includes(key)),
  })).filter(row => row.fields.length);
  return { changedFields, affectedChapters };
}
// Capture/validate the complete neutral scope once; no native-slot conversion.
// Each DTO row owns its values, overrides and field lists, including portraits.
export function chapterPeopleProjection(game) {
  const scope = captureScope(game), byGeneral = new Map(Object.keys(scope.generals).map(id => [id, []]));
  const chapterPeople = [];
  for (const [chapterId, { people }] of scope.chapters) {
    const rows = [];
    for (const [generalId, record] of Object.entries(people)) {
      byGeneral.get(generalId).push({ chapterId, included: record.included, ...inheritance(record) });
      rows.push({ generalId, included: record.included, factionId: record.factionId,
        overrides: structuredClone(record.overrides), values: structuredClone({ ...scope.generals[generalId], ...record.overrides }), ...inheritance(record) });
    }
    chapterPeople.push({ chapterId, people: rows });
  }
  return { generalReferences: [...byGeneral].map(([generalId, chapters]) => ({ generalId, chapters })), chapterPeople };
}
export function applyGeneralDefinitionEdit(game, edit) {
  plain(edit);
  if (!['create', 'update', 'delete'].includes(edit.op)) throw new RangeError('general definition operation required');
  plain(edit, edit.op === 'delete' ? ['op', 'generalId'] : ['op', 'generalId', 'values']);
  const scope = captureScope(game), { generals } = scope;
  identity(game.gameId, edit.generalId);
  const exists = Object.hasOwn(generals, edit.generalId);
  if (edit.op === 'create' ? exists : !exists) throw new RangeError('general definition identity conflict');
  if (edit.op === 'delete') {
    if (references(scope, edit.generalId).length) throw new RangeError('general definition is referenced by chapters');
    delete generals[edit.generalId];
  } else generals[edit.generalId] = definition(edit.values);
  return { ...game, generals };
}
export function applyChapterPersonEdit(game, edit) {
  plain(edit);
  if (edit.op !== 'set' && edit.op !== 'remove') throw new RangeError('chapter person operation required');
  plain(edit, edit.op === 'set' ? ['op', 'chapterId', 'generalId', 'values'] : ['op', 'chapterId', 'generalId']);
  const scope = captureScope(game); existingGeneral(game, scope, edit.generalId);
  const selected = scope.chapters.get(edit.chapterId);
  if (!selected) throw new RangeError('chapter identity required');
  const { chapter, people } = selected;
  if (edit.op === 'remove') {
    if (!Object.hasOwn(people, edit.generalId)) throw new RangeError('chapter person is not configured');
    delete people[edit.generalId];
  } else people[edit.generalId] = person(edit.values);
  return { ...game, chapters: { ...game.chapters, [edit.chapterId]: { ...chapter, people } } };
}
