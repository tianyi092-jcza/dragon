// Private fixed-copy drafts only. Representation-safe resource edits are not runtime admission.
import { createHash } from 'node:crypto';
import { canonicalSourceTokens, encodeSourceChunks, decodeSourceChunks, CanonicalSourceParser } from '../web/src/content/authoring/sourcejson.js';
import { normalizeGameMetadata } from '../web/src/editor/gamemetadata.js';
import { addBlankChapter, assignChapterGeneral, clearChapterGeneral, copyChapterInGame, moveChapter, deleteChapter, renameChapter, renameGeneral, setMonarch, setStrategist, removeMonarch, disbandFaction, createFaction, editChapterCity, editChapterCityNative, cityReferences, generalChapterReferences, setChapterStart, setChapterCityFaction, setFactionCapital, setChapterGeneralFaction, setGeneralActive, setGeneralStatus, setFactionDiplomat, setCityGovernor, chapterReferenceReport } from '../web/src/content/authoring/gamesource.js';
import { chapterGapReport } from './chaptergapreport.js';
import { applyGeneralDefinitionEdit, applyChapterPersonEdit, generalDefinitionChangeImpact, chapterPeopleProjection, generalLibrarySupported } from '../web/src/content/authoring/generaldefinitions.js';
import { setCityDefinitionName, setCityDefinitionNumbers, applyChapterCityEdit, chapterCitiesProjection, cityDefinitionChangeImpact } from '../web/src/content/authoring/citydefinitions.js';
import { CITY_BASE_NUMBERS, cityName } from '../web/src/content/authoring/cityrecords.js';
import { setGeneralPortrait } from '../web/src/editor/generalportrait.js';
import { componentCells, decorationIdsInRect, fillBase, placeComponent, splitDecoration, removeDecorations, translateDecorations, reorderDecorations, captureComponent, renameMaterial, removeMaterial, materialReferences, createWaterGroup, splitWaterGroup, mergeWaterGroups, renameWaterGroup, setWaterGroupMinimapVisibility } from '../web/src/editor/componenttools.js';
import { compileMapSource } from '../web/src/content/authoring/mapcompile.js';
import { WATER_CLASSES, BYTE_STAMP_RECIPE, composeMapLayers } from '../web/src/content/authoring/maplayers.js';
import { composeMapDisplayLayers } from '../web/src/editor/mapdisplay.js';
import { renderMinimapPixels, MINIMAP_SIZES, MINIMAP_STYLE_REVISION } from '../web/src/content/authoring/minimap.js';
import { editChapterResources } from '../web/src/editor/chapterresources.js';
import { FixedCopyProfile, FIXED_COPY_PROFILE, FIXED_TEMPLATE_PROFILE } from './copyprofile.js';
import { GameSnapshotVerifier } from './snapshots.js';
import { decodePNG } from './pngio.js';
import { hasPendingMoves } from './topology.js';
import { fail, fields, HttpError } from './security.js';
const uuid = v => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const hex = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const revision = v => typeof v === 'string' && /^[1-9][0-9]{0,63}$/.test(v);
const hash = b => createHash('sha256').update(b).digest('hex');
function parsed(text) { try { return JSON.parse(text); } catch { fail(503, 'DRAFT_RECORD_CORRUPT'); } }
function capture(input) {
  let text = ''; try { for (const token of canonicalSourceTokens(input)) { text += token; if (Buffer.byteLength(text) > 16384) fail(413, 'DRAFT_REQUEST_TOO_LARGE'); } } catch (error) { if (error instanceof HttpError) throw error; fail(422, 'DRAFT_REQUEST'); }
  const value = parsed(text);
  if (!value || Array.isArray(value) || typeof value !== 'object' || !Object.hasOwn(value, 'metadata') || !Object.hasOwn(value, 'resourceEdits') || Object.keys(value).some(key => key !== 'metadata' && key !== 'resourceEdits' && key !== 'chapterEdits' && key !== 'generalEdits' && key !== 'peopleEdits' && key !== 'mapEdits' && key !== 'cityEdits' && key !== 'chapterCityEdits')) fail(422, 'REQUEST_FIELDS');
  fields(value.metadata, ['name', 'introduction']);
  for (const t of [value.metadata.name, value.metadata.introduction]) if (typeof t !== 'string' || [...t].some(c => { const n = c.codePointAt(0); return n < 32 || n >= 127 && n <= 159; })) fail(422, 'GAME_METADATA');
  try { value.metadata = normalizeGameMetadata(value.metadata); } catch { fail(422, 'GAME_METADATA'); }
  if (!Array.isArray(value.resourceEdits) || value.resourceEdits.length > 32) fail(422, 'DRAFT_RESOURCE_EDITS');
  // §4.5 chapter edits: bounded op list, applied in order before verification.
  if (value.chapterEdits === undefined) value.chapterEdits = [];
  if (!Array.isArray(value.chapterEdits) || value.chapterEdits.length > 16) fail(422, 'DRAFT_CHAPTER_EDITS');
  for (const edit of value.chapterEdits) {
    if (!edit || typeof edit !== 'object' || Array.isArray(edit)) fail(422, 'DRAFT_CHAPTER_EDITS');
    // §5 章節創作：add-blank 可攜章名與開始年代（一併產生章節態）；舊請求僅 op。
    if (edit.op === 'add-blank') {
      const keys = Object.keys(edit).sort().join(',');
      if (keys !== 'op' && keys !== 'name,op,start') fail(422, 'DRAFT_CHAPTER_EDITS');
      if (Object.hasOwn(edit, 'name') && (typeof edit.name !== 'string' || !edit.name.trim() || edit.name.length > 1024)) fail(422, 'DRAFT_CHAPTER_EDITS');
      if (Object.hasOwn(edit, 'start')) {
        const start = edit.start, startKeys = start && typeof start === 'object' && !Array.isArray(start) ? Object.keys(start) : null;
        if (!startKeys?.length || startKeys.some(key => !['era', 'year', 'month', 'day'].includes(key))) fail(422, 'DRAFT_CHAPTER_EDITS');
        for (const [key, max] of [['year', 9999], ['month', 12], ['day', 31]]) if (!Number.isInteger(start[key]) || Object.is(start[key], -0) || start[key] < 1 || start[key] > max) fail(422, 'DRAFT_CHAPTER_EDITS');
        if (start.era !== undefined && !['bc', 'ad'].includes(start.era)) fail(422, 'DRAFT_CHAPTER_EDITS');
      }
    }
    else if (edit.op === 'copy' || edit.op === 'delete') { fields(edit, ['op', 'chapterId']); if (typeof edit.chapterId !== 'string' || !edit.chapterId.length || edit.chapterId.length > 256) fail(422, 'DRAFT_CHAPTER_EDITS'); }
    else if (edit.op === 'rename') { fields(edit, ['op', 'chapterId', 'name']); if (typeof edit.chapterId !== 'string' || !edit.chapterId.length || edit.chapterId.length > 256 || typeof edit.name !== 'string') fail(422, 'DRAFT_CHAPTER_EDITS'); }
    else if (edit.op === 'rename-general') { fields(edit, ['op', 'chapterId', 'generalIdx', 'values']); if (typeof edit.chapterId !== 'string' || !edit.chapterId.length || edit.chapterId.length > 256 || !Number.isInteger(edit.generalIdx) || edit.generalIdx < 0 || edit.generalIdx > 127 || !edit.values || typeof edit.values !== 'object' || Array.isArray(edit.values)) fail(422, 'DRAFT_CHAPTER_EDITS'); }
    else if (edit.op === 'portrait') { fields(edit, ['op', 'chapterId', 'generalIdx', 'portraitKey']); if (typeof edit.chapterId !== 'string' || !edit.chapterId.length || edit.chapterId.length > 256 || !Number.isInteger(edit.generalIdx) || edit.generalIdx < 0 || edit.generalIdx > 127 || (edit.portraitKey !== null && typeof edit.portraitKey !== 'string')) fail(422, 'DRAFT_CHAPTER_EDITS'); }
    else if (edit.op === 'create-faction') { fields(edit, ['op', 'chapterId', 'monarchIdx']); if (typeof edit.chapterId !== 'string' || !edit.chapterId.length || edit.chapterId.length > 256 || !Number.isInteger(edit.monarchIdx) || edit.monarchIdx < 0 || edit.monarchIdx > 127) fail(422, 'DRAFT_CHAPTER_EDITS'); }
    else if (edit.op === 'set-monarch') { fields(edit, ['op', 'chapterId', 'factionIdx', 'generalIdx']); if (typeof edit.chapterId !== 'string' || !edit.chapterId.length || edit.chapterId.length > 256 || !Number.isInteger(edit.factionIdx) || !Number.isInteger(edit.generalIdx) || edit.generalIdx < 0 || edit.generalIdx > 127) fail(422, 'DRAFT_CHAPTER_EDITS'); }
    else if (edit.op === 'set-strategist') { fields(edit, ['op', 'chapterId', 'factionIdx', 'generalIdx']); if (typeof edit.chapterId !== 'string' || !edit.chapterId.length || edit.chapterId.length > 256 || !Number.isInteger(edit.factionIdx) || (edit.generalIdx !== null && (!Number.isInteger(edit.generalIdx) || edit.generalIdx < 0 || edit.generalIdx > 127))) fail(422, 'DRAFT_CHAPTER_EDITS'); }
    else if (edit.op === 'remove-monarch') { fields(edit, ['op', 'chapterId', 'factionIdx', 'resolution']); if (typeof edit.chapterId !== 'string' || !edit.chapterId.length || edit.chapterId.length > 256 || !Number.isInteger(edit.factionIdx) || !edit.resolution || typeof edit.resolution !== 'object' || Array.isArray(edit.resolution)) fail(422, 'DRAFT_CHAPTER_EDITS'); }
    else if (edit.op === 'disband-faction') { fields(edit, ['op', 'chapterId', 'factionIdx', 'confirm']); if (typeof edit.chapterId !== 'string' || !edit.chapterId.length || edit.chapterId.length > 256 || !Number.isInteger(edit.factionIdx) || edit.confirm !== true) fail(422, 'DRAFT_CHAPTER_EDITS'); }
    else if (edit.op === 'city' || edit.op === 'city-native') { fields(edit, ['op', 'chapterId', 'cityIdx', 'values']); if (typeof edit.chapterId !== 'string' || !edit.chapterId.length || edit.chapterId.length > 256 || !Number.isSafeInteger(edit.cityIdx) || edit.cityIdx < 0 || !edit.values || typeof edit.values !== 'object' || Array.isArray(edit.values)) fail(422, 'DRAFT_CHAPTER_EDITS'); const cityKeys = Object.keys(edit.values); if (!cityKeys.length || cityKeys.some(k => (k !== 'troops' && k !== 'prod') || typeof edit.values[k] !== 'number' || !Number.isInteger(edit.values[k]) || Object.is(edit.values[k], -0))) fail(422, 'DRAFT_CHAPTER_EDITS'); }
    // §7 chapter attributes: named field plus its fixed native slot byte.
    else if (edit.op === 'start-date') { fields(edit, ['op', 'chapterId', 'values']); if (typeof edit.chapterId !== 'string' || !edit.chapterId.length || edit.chapterId.length > 256 || !edit.values || typeof edit.values !== 'object' || Array.isArray(edit.values)) fail(422, 'DRAFT_CHAPTER_EDITS'); const keys = Object.keys(edit.values); if (!keys.length || keys.some(k => k !== 'era' && k !== 'year' && k !== 'month' && k !== 'day')) fail(422, 'DRAFT_CHAPTER_EDITS'); }
    else if (edit.op === 'city-faction') { fields(edit, ['op', 'chapterId', 'cityIdx', 'factionId']); if (typeof edit.chapterId !== 'string' || !edit.chapterId.length || edit.chapterId.length > 256 || !Number.isSafeInteger(edit.cityIdx) || edit.cityIdx < 0 || edit.cityIdx > 191 || edit.factionId !== null && (!Number.isInteger(edit.factionId) || edit.factionId < 0 || edit.factionId > 255)) fail(422, 'DRAFT_CHAPTER_EDITS'); }
    else if (edit.op === 'set-capital') { fields(edit, ['op', 'chapterId', 'factionIdx', 'cityIdx']); if (typeof edit.chapterId !== 'string' || !edit.chapterId.length || edit.chapterId.length > 256 || !Number.isInteger(edit.factionIdx) || edit.factionIdx < 0 || edit.factionIdx > 21 || !Number.isSafeInteger(edit.cityIdx) || edit.cityIdx < 0 || edit.cityIdx > 191) fail(422, 'DRAFT_CHAPTER_EDITS'); }
    else if (edit.op === 'general-faction') { fields(edit, ['op', 'chapterId', 'generalIdx', 'factionId']); if (typeof edit.chapterId !== 'string' || !edit.chapterId.length || edit.chapterId.length > 256 || !Number.isInteger(edit.generalIdx) || edit.generalIdx < 0 || edit.generalIdx > 127 || edit.factionId !== null && (!Number.isInteger(edit.factionId) || edit.factionId < 0 || edit.factionId > 255)) fail(422, 'DRAFT_CHAPTER_EDITS'); }
    else if (edit.op === 'general-active') { fields(edit, ['op', 'chapterId', 'generalIdx', 'active']); if (typeof edit.chapterId !== 'string' || !edit.chapterId.length || edit.chapterId.length > 256 || !Number.isInteger(edit.generalIdx) || edit.generalIdx < 0 || edit.generalIdx > 127 || typeof edit.active !== 'boolean') fail(422, 'DRAFT_CHAPTER_EDITS'); }
    else if (edit.op === 'general-status') { fields(edit, ['op', 'chapterId', 'generalIdx', 'status']); if (typeof edit.chapterId !== 'string' || !edit.chapterId.length || edit.chapterId.length > 256 || !Number.isInteger(edit.generalIdx) || edit.generalIdx < 0 || edit.generalIdx > 127 || !Number.isInteger(edit.status) || Object.is(edit.status, -0) || edit.status < 0 || edit.status > 4) fail(422, 'DRAFT_CHAPTER_EDITS'); }
    // 序号＝chapterOrder 位置（2026-11 用户裁决：允许重排）。
    else if (edit.op === 'chapter-reorder') {
      fields(edit, ['op', 'chapterId', 'toIndex']);
      if (typeof edit.chapterId !== 'string' || !edit.chapterId.length || edit.chapterId.length > 256 || !Number.isInteger(edit.toIndex) || Object.is(edit.toIndex, -0) || edit.toIndex < 0 || edit.toIndex > 4096) fail(422, 'DRAFT_CHAPTER_EDITS');
    }
    // 武将指派／取消出场：身份由 generalId 承载，槽位由写入器取本章最小空槽。
    else if (edit.op === 'general-assign') {
      fields(edit, ['op', 'chapterId', 'values']);
      if (typeof edit.chapterId !== 'string' || !edit.chapterId.length || edit.chapterId.length > 256 || !edit.values || typeof edit.values !== 'object' || Array.isArray(edit.values)) fail(422, 'DRAFT_CHAPTER_EDITS');
      const keys = Object.keys(edit.values);
      if (keys.some(k => !['generalId', 'name', 'hao', 'portrait', 'ability'].includes(k))) fail(422, 'DRAFT_CHAPTER_EDITS');
      const { generalId, name, hao, portrait, ability } = edit.values;
      if (typeof generalId !== 'string' || !generalId.length || generalId.length > 128) fail(422, 'DRAFT_CHAPTER_EDITS');
      if (typeof name !== 'string' || !name.trim() || name.length > 64) fail(422, 'DRAFT_CHAPTER_EDITS');
      if (hao !== undefined && (typeof hao !== 'string' || hao.length > 64)) fail(422, 'DRAFT_CHAPTER_EDITS');
      if (!Number.isInteger(portrait) || Object.is(portrait, -0) || portrait < 0 || portrait > 255) fail(422, 'DRAFT_CHAPTER_EDITS');
      if (ability !== undefined) {
        if (!ability || typeof ability !== 'object' || Array.isArray(ability)) fail(422, 'DRAFT_CHAPTER_EDITS');
        const abilityKeys = ['siege', 'field', 'naval', 'force', 'lead', 'politics'];
        if (Object.keys(ability).length !== abilityKeys.length || abilityKeys.some(k => !Number.isInteger(ability[k]) || Object.is(ability[k], -0) || ability[k] < 0 || ability[k] > 255)) fail(422, 'DRAFT_CHAPTER_EDITS');
      }
    }
    else if (edit.op === 'general-clear') { fields(edit, ['op', 'chapterId', 'generalId']); if (typeof edit.chapterId !== 'string' || !edit.chapterId.length || edit.chapterId.length > 256 || typeof edit.generalId !== 'string' || !edit.generalId.length || edit.generalId.length > 128) fail(422, 'DRAFT_CHAPTER_EDITS'); }
    else if (edit.op === 'city-governor') { fields(edit, ['op', 'chapterId', 'cityIdx', 'generalIdx']); if (typeof edit.chapterId !== 'string' || !edit.chapterId.length || edit.chapterId.length > 256 || !Number.isInteger(edit.cityIdx) || edit.cityIdx < 0 || edit.cityIdx > 191 || (edit.generalIdx !== null && (!Number.isInteger(edit.generalIdx) || edit.generalIdx < 0 || edit.generalIdx > 127))) fail(422, 'DRAFT_CHAPTER_EDITS'); }
    else if (edit.op === 'set-diplomat') { fields(edit, ['op', 'chapterId', 'factionIdx', 'generalIdx']); if (typeof edit.chapterId !== 'string' || !edit.chapterId.length || edit.chapterId.length > 256 || !Number.isInteger(edit.factionIdx) || edit.factionIdx < 0 || edit.factionIdx > 21 || (edit.generalIdx !== null && (!Number.isInteger(edit.generalIdx) || edit.generalIdx < 0 || edit.generalIdx > 127))) fail(422, 'DRAFT_CHAPTER_EDITS'); }
    else fail(422, 'DRAFT_CHAPTER_EDITS');
  }
  // Preserve absence for old request_json receipts. New definitions are not
  // chapter/runtime slots, and clients cannot allocate a create ID.
  if (Object.hasOwn(value, 'generalEdits')) {
    if (!Array.isArray(value.generalEdits) || value.generalEdits.length > 16) fail(422, 'DRAFT_GENERAL_EDITS');
    for (const edit of value.generalEdits) {
      if (!edit || typeof edit !== 'object' || Array.isArray(edit)) fail(422, 'DRAFT_GENERAL_EDITS');
      if (edit.op === 'create') fields(edit, ['op', 'values']);
      else if (edit.op === 'update') {
        fields(edit, Object.hasOwn(edit, 'confirmedImpacts') ? ['op', 'generalId', 'values', 'confirmedImpacts'] : ['op', 'generalId', 'values']);
        if (Object.hasOwn(edit, 'confirmedImpacts')) {
          if (!Array.isArray(edit.confirmedImpacts)) fail(422, 'DRAFT_GENERAL_IMPACTS');
          const chapters = new Set();
          for (const impact of edit.confirmedImpacts) {
            fields(impact, ['chapterId', 'fields']);
            if (typeof impact.chapterId !== 'string' || !impact.chapterId.length || impact.chapterId.length > 256 || chapters.has(impact.chapterId) || !Array.isArray(impact.fields) || !impact.fields.length || impact.fields.length > 4 || new Set(impact.fields).size !== impact.fields.length || impact.fields.some(key => !['name', 'hao', 'portraitRef', 'ability'].includes(key))) fail(422, 'DRAFT_GENERAL_IMPACTS');
            chapters.add(impact.chapterId);
          }
        }
      }
      else if (edit.op === 'delete') fields(edit, ['op', 'generalId']);
      else fail(422, 'DRAFT_GENERAL_EDITS');
      if (edit.op !== 'create' && (typeof edit.generalId !== 'string' || edit.generalId.length > 256)) fail(422, 'DRAFT_GENERAL_EDITS');
      if (edit.op !== 'delete') fields(edit.values, ['name', 'hao', 'portraitRef']);
    }
  }
  // Optional for legacy request-byte stability. Values remain authoring data;
  // the shared writer verifies neutral scope, references and field semantics.
  if (Object.hasOwn(value, 'peopleEdits')) {
    if (!Array.isArray(value.peopleEdits) || value.peopleEdits.length > 16) fail(422, 'DRAFT_PEOPLE_EDITS');
    for (const edit of value.peopleEdits) {
      if (!edit || typeof edit !== 'object' || Array.isArray(edit)) fail(422, 'DRAFT_PEOPLE_EDITS');
      if (edit.op === 'set') { fields(edit, ['op', 'chapterId', 'generalId', 'values']); fields(edit.values, ['included', 'factionId', 'overrides']); }
      else if (edit.op === 'remove') fields(edit, ['op', 'chapterId', 'generalId']);
      else fail(422, 'DRAFT_PEOPLE_EDITS');
      if ([edit.chapterId, edit.generalId].some(id => typeof id !== 'string' || !id.length || id.length > 256)) fail(422, 'DRAFT_PEOPLE_EDITS');
    }
  }
  // Keep absent optional fields absent in stored legacy request bodies.
  if (Object.hasOwn(value, 'mapEdits')) {
    if (!Array.isArray(value.mapEdits) || value.mapEdits.length > 16) fail(422, 'DRAFT_MAP_EDITS');
    for (const edit of value.mapEdits) {
      if (edit?.op === 'water-visibility') {
        fields(edit, ['op', 'groupId', 'showOnMinimap']);
        if (typeof edit.showOnMinimap !== 'boolean') fail(422, 'DRAFT_MAP_EDITS');
      } else if (edit?.op === 'water-rename') {
        fields(edit, ['op', 'groupId', 'name']);
        if (typeof edit.name !== 'string') fail(422, 'DRAFT_MAP_EDITS');
      } else if (edit?.op === 'water-create') {
        fields(edit, ['op', 'memberIds', 'baseCells', 'name', 'showOnMinimap']);
        if (typeof edit.name !== 'string' || typeof edit.showOnMinimap !== 'boolean' || !Array.isArray(edit.memberIds) || !Array.isArray(edit.baseCells) || edit.memberIds.length + edit.baseCells.length === 0 || new Set(edit.memberIds).size !== edit.memberIds.length || new Set(edit.baseCells).size !== edit.baseCells.length || edit.memberIds.some(id => typeof id !== 'string' || !id.length || id.length > 256) || edit.baseCells.some(cell => !Number.isSafeInteger(cell) || cell < 0 || cell >= 384 * 256 || Object.is(cell, -0))) fail(422, 'DRAFT_MAP_EDITS');
      } else if (edit?.op === 'water-merge') {
        fields(edit, ['op', 'groupIds', 'name', 'showOnMinimap']);
        if (!Array.isArray(edit.groupIds) || edit.groupIds.length < 2 || new Set(edit.groupIds).size !== edit.groupIds.length || edit.groupIds.some(id => typeof id !== 'string' || !id.length || id.length > 256) || typeof edit.name !== 'string' || typeof edit.showOnMinimap !== 'boolean') fail(422, 'DRAFT_MAP_EDITS');
      } else if (edit?.op === 'water-split') {
        fields(edit, ['op', 'sourceGroupId', 'memberIds', 'baseCells', 'name']);
        if (typeof edit.sourceGroupId !== 'string' || !edit.sourceGroupId.length || edit.sourceGroupId.length > 256 || typeof edit.name !== 'string' || !Array.isArray(edit.memberIds) || !Array.isArray(edit.baseCells) || edit.memberIds.length + edit.baseCells.length === 0 || new Set(edit.memberIds).size !== edit.memberIds.length || new Set(edit.baseCells).size !== edit.baseCells.length || edit.memberIds.some(id => typeof id !== 'string' || !id.length || id.length > 256) || edit.baseCells.some(cell => !Number.isSafeInteger(cell) || cell < 0 || Object.is(cell, -0))) fail(422, 'DRAFT_MAP_EDITS');
      } else if (edit?.op === 'base-fill') {
        fields(edit, ['op', 'cells', 'tile', 'geography']);
        if (!Array.isArray(edit.cells) || !edit.cells.length || new Set(edit.cells).size !== edit.cells.length || edit.cells.some(cell => !Number.isSafeInteger(cell) || Object.is(cell, -0) || cell < 0 || cell >= 384 * 256) || !Number.isSafeInteger(edit.tile) || Object.is(edit.tile, -0) || edit.tile < 0 || edit.tile > 255 || !Number.isSafeInteger(edit.geography) || Object.is(edit.geography, -0) || edit.geography < 0 || edit.geography > 3) fail(422, 'DRAFT_MAP_EDITS');
      } else if (edit?.op === 'decoration-split') {
        fields(edit, ['op', 'instanceId', 'childCount']);
        if (typeof edit.instanceId !== 'string' || !edit.instanceId.length || edit.instanceId.length > 256 || !Number.isSafeInteger(edit.childCount) || edit.childCount < 2 || edit.childCount > 256) fail(422, 'DRAFT_MAP_EDITS');
      } else if (edit?.op === 'decoration-place') {
        fields(edit, ['op', 'materialId', 'variantRef', 'x', 'y', 'waterClass']);
        if ([edit.materialId, edit.variantRef].some(id => typeof id !== 'string' || !id.length || id.length > 256) || !Number.isSafeInteger(edit.x) || !Number.isSafeInteger(edit.y) || Object.is(edit.x, -0) || Object.is(edit.y, -0) || edit.waterClass !== null && (typeof edit.waterClass !== 'string' || !edit.waterClass.length || edit.waterClass.length > 256)) fail(422, 'DRAFT_MAP_EDITS');
      } else if (edit?.op === 'decoration-remove') {
        fields(edit, ['op', 'memberIds']);
        if (!Array.isArray(edit.memberIds) || !edit.memberIds.length || new Set(edit.memberIds).size !== edit.memberIds.length || edit.memberIds.some(id => typeof id !== 'string' || !id.length || id.length > 256)) fail(422, 'DRAFT_MAP_EDITS');
      } else if (edit?.op === 'decoration-reorder') {
        fields(edit, ['op', 'memberIds', 'direction']);
        if (!Array.isArray(edit.memberIds) || !edit.memberIds.length || new Set(edit.memberIds).size !== edit.memberIds.length || edit.memberIds.some(id => typeof id !== 'string' || !id.length || id.length > 256) || edit.direction !== 1 && edit.direction !== -1) fail(422, 'DRAFT_MAP_EDITS');
      } else if (edit?.op === 'decoration-translate') {
        fields(edit, ['op', 'memberIds', 'dx', 'dy']);
        if (!Array.isArray(edit.memberIds) || !edit.memberIds.length || new Set(edit.memberIds).size !== edit.memberIds.length || edit.memberIds.some(id => typeof id !== 'string' || !id.length || id.length > 256) || !Number.isSafeInteger(edit.dx) || !Number.isSafeInteger(edit.dy) || Object.is(edit.dx, -0) || Object.is(edit.dy, -0) || edit.dx === 0 && edit.dy === 0) fail(422, 'DRAFT_MAP_EDITS');
      } else if (edit?.op === 'material-capture') {
        fields(edit, ['op', 'memberIds', 'name']);
        if (!Array.isArray(edit.memberIds) || !edit.memberIds.length || new Set(edit.memberIds).size !== edit.memberIds.length || edit.memberIds.some(id => typeof id !== 'string' || !id.length || id.length > 256) || typeof edit.name !== 'string') fail(422, 'DRAFT_MAP_EDITS');
      } else if (edit?.op === 'material-rename' || edit?.op === 'material-remove') {
        fields(edit, edit.op === 'material-rename' ? ['op', 'materialId', 'name'] : ['op', 'materialId']);
        if (typeof edit.materialId !== 'string' || !edit.materialId.length || edit.materialId.length > 256 || edit.op === 'material-rename' && typeof edit.name !== 'string') fail(422, 'DRAFT_MAP_EDITS');
      } else fail(422, 'DRAFT_MAP_EDITS');
      if (['water-visibility', 'water-rename'].includes(edit.op) && (typeof edit.groupId !== 'string' || !edit.groupId.length || edit.groupId.length > 256)) fail(422, 'DRAFT_MAP_EDITS');
    }
  }
  if (Object.hasOwn(value, 'cityEdits')) {
    if (!Array.isArray(value.cityEdits) || value.cityEdits.length > 16) fail(422, 'DRAFT_CITY_EDITS');
    for (const edit of value.cityEdits) {
      if (!edit || typeof edit !== 'object' || Array.isArray(edit)) fail(422, 'DRAFT_CITY_EDITS');
      const renameShape = Object.hasOwn(edit, 'confirmedImpacts') ? 'cityId,confirmedImpacts,name,op' : 'cityId,name,op';
      if (edit.op === 'numbers') fields(edit, ['op', 'cityId', 'values']);
      else try { fields(edit, renameShape.split(',')); } catch { fail(422, 'DRAFT_CITY_EDITS'); }
      if (Object.hasOwn(edit, 'confirmedImpacts')) {
        if (!Array.isArray(edit.confirmedImpacts)) fail(422, 'DRAFT_CITY_IMPACTS');
        const chapters = new Set();
        for (const impact of edit.confirmedImpacts) {
          fields(impact, ['chapterId', 'fields']);
          if (typeof impact.chapterId !== 'string' || !impact.chapterId.length || impact.chapterId.length > 256 || chapters.has(impact.chapterId) || !Array.isArray(impact.fields) || impact.fields.length !== 1 || impact.fields[0] !== 'name') fail(422, 'DRAFT_CITY_IMPACTS');
          chapters.add(impact.chapterId);
        }
      }
      if (typeof edit.cityId !== 'string' || !edit.cityId.length || edit.cityId.length > 256) fail(422, 'DRAFT_CITY_EDITS');
      // 遊戲級據點數值：只收投影裡存在的三項，整數 0..65535（與 cityrecords 同一上限）。
      if (edit.op === 'numbers') {
        if (!edit.values || typeof edit.values !== 'object' || Array.isArray(edit.values)) fail(422, 'DRAFT_CITY_EDITS');
        const keys = Object.keys(edit.values);
        if (!keys.length || keys.some(key => !CITY_BASE_NUMBERS.includes(key) || !Number.isSafeInteger(edit.values[key]) || edit.values[key] < 0 || edit.values[key] > 65535)) fail(422, 'DRAFT_CITY_EDITS');
      } else if (edit.op !== 'rename' || typeof edit.name !== 'string') fail(422, 'DRAFT_CITY_EDITS');
      else {
        // 據點名稱：1–12 個 Unicode 碼點，NFKC 之外的份量不變；超長不截斷。
        let cleaned;
        try { cleaned = cityName(edit.name); } catch { fail(422, 'DRAFT_CITY_EDITS'); }
        const points = [...cleaned].length;
        if (points < 1 || points > 12) fail(422, 'DRAFT_CITY_EDITS');
      }
    }
  }
  if (Object.hasOwn(value, 'chapterCityEdits')) {
    if (!Array.isArray(value.chapterCityEdits) || value.chapterCityEdits.length > 16) fail(422, 'DRAFT_CHAPTER_CITY_EDITS');
    for (const edit of value.chapterCityEdits) {
      if (edit?.op === 'set') { fields(edit, ['op', 'chapterId', 'cityId', 'values']); fields(edit.values, ['factionId', 'overrides']); }
      else if (edit?.op === 'remove') fields(edit, ['op', 'chapterId', 'cityId']);
      else fail(422, 'DRAFT_CHAPTER_CITY_EDITS');
      if ([edit.chapterId, edit.cityId].some(id => typeof id !== 'string' || !id.length || id.length > 256)) fail(422, 'DRAFT_CHAPTER_CITY_EDITS');
    }
  }
  const seen = new Set();
  for (const edit of value.resourceEdits) {
    fields(edit, ['chapterId', 'slot', 'values']);
    if (typeof edit.chapterId !== 'string' || !edit.chapterId.length || edit.chapterId.length > 256 || !Number.isSafeInteger(edit.slot) || edit.slot < 0 || edit.slot > 21) fail(422, 'DRAFT_RESOURCE_EDITS');
    const k = `${edit.chapterId}:${edit.slot}`; if (seen.has(k)) fail(422, 'DRAFT_RESOURCE_EDITS'); seen.add(k);
    if (!edit.values || Array.isArray(edit.values)) fail(422, 'DRAFT_RESOURCE_EDITS');
    const keys = Object.keys(edit.values); if (!keys.length || keys.some(k => !['money', 'reserve_cav', 'reserve_arc', 'reserve_inf'].includes(k) || !Number.isSafeInteger(edit.values[k]) || Object.is(edit.values[k], -0))) fail(422, 'DRAFT_RESOURCE_EDITS');
  }
  return value;
}
// An identity, not a capability: ownership, epoch, source/profile and CAS are
// checked independently. Original operation identity gives retries the same ID
// without changing old request bodies or adding another persistent allocator.
function resolveGeneralEdits(gameId, actorId, operationKey, edits = []) {
  return edits.map((edit, index) => {
    if (edit.op === 'create') return { ...edit, generalId: `${gameId}#general-${hash(JSON.stringify(['dragon-general-definition-1', gameId, actorId, operationKey, index]))}` };
    if (edit.op === 'update') return { op: edit.op, generalId: edit.generalId, values: edit.values };
    return edit;
  });
}
function resolveCityEdits(edits = []) {
  return edits.map(({ op, cityId, name, values }) => (op === 'numbers' ? { op, cityId, values } : { op, cityId, name }));
}
function resolveMapEdits(gameId, actorId, operationKey, edits = []) {
  return edits.map((edit, index) => {
    // Count is only an assertion: the common writer requires the exact variant
    // tile count. Every child identity is server-derived, also during replay.
    if (edit.op === 'decoration-split') return { op: edit.op, instanceId: edit.instanceId, childIds: Array.from({ length: edit.childCount }, (_, childIndex) => `${gameId}#decoration-${hash(JSON.stringify(['dragon-decoration-child-1', gameId, actorId, operationKey, index, childIndex]))}`) };
    if (edit.op === 'decoration-place') return { ...edit, instanceId: `${gameId}#decoration-${hash(JSON.stringify(['dragon-decoration-instance-1', gameId, actorId, operationKey, index]))}` };
    if (edit.op === 'material-capture') return { ...edit, materialId: `${gameId}#material-${hash(JSON.stringify(['dragon-material-definition-1', gameId, actorId, operationKey, index]))}` };
    if (['water-create', 'water-merge', 'water-split'].includes(edit.op)) return { ...edit, groupId: `${gameId}#water-${hash(JSON.stringify(['dragon-water-group-1', gameId, actorId, operationKey, index]))}` };
    return edit;
  });
}
export class PrivateDrafts {
  #storage; #sql; #principal; #games; #blobs; #definition; #guard; #verifier; #atlas;
  constructor({ storage, principal, games, blobs, definition, operationGuard, atlas }) {
    if (!storage?.sql || typeof principal !== 'function' || typeof games?.prepareSnapshot !== 'function' || typeof blobs?.read !== 'function' || typeof definition !== 'function' || typeof operationGuard !== 'function') throw new TypeError('actual draft stores and trusted service ports required');
    if (atlas !== undefined && typeof atlas !== 'function') throw new TypeError('trusted fixed atlas port required');
    this.#atlas = atlas;
    this.#storage = storage; this.#sql = storage.sql; this.#principal = principal; this.#games = games; this.#blobs = blobs; this.#definition = definition; this.#guard = operationGuard; this.#verifier = new GameSnapshotVerifier({ blobs });
    storage.transactionSync(() => {
      this.#sql.exec('CREATE TABLE IF NOT EXISTS draft_requests (actor TEXT NOT NULL, op_key TEXT NOT NULL, request_digest TEXT NOT NULL, auth_epoch INTEGER NOT NULL, game_id TEXT NOT NULL, expected_revision TEXT NOT NULL, request_json TEXT NOT NULL, state TEXT NOT NULL, result_json TEXT, error_code TEXT, error_status INTEGER, source_digest TEXT, dependency_digest TEXT, root_key TEXT, result_revision TEXT, created_at TEXT NOT NULL, completed_at TEXT, PRIMARY KEY(actor,op_key))');
      this.#sql.exec('CREATE TABLE IF NOT EXISTS draft_objects (actor TEXT NOT NULL, op_key TEXT NOT NULL, game_id TEXT NOT NULL, sha256 TEXT NOT NULL, byte_length INTEGER NOT NULL, state TEXT NOT NULL, PRIMARY KEY(actor,op_key,sha256))');
      this.#sql.exec('CREATE TABLE IF NOT EXISTS draft_references (game_id TEXT NOT NULL, revision TEXT NOT NULL, sha256 TEXT NOT NULL, byte_length INTEGER NOT NULL, PRIMARY KEY(game_id,revision,sha256))');
    });
  }
  #one(q, ...v) { return this.#sql.exec(q, ...v).toArray()[0]; }
  #owned(tokenHash, gameId, prior) {
    const actor = this.#principal(tokenHash); if (actor.must_change) fail(403, 'PASSWORD_CHANGE_REQUIRED');
    if (prior && (prior.id !== actor.id || prior.epoch !== actor.epoch)) fail(401, 'SESSION_INVALID');
    if (gameId === 'wolong-builtin') fail(403, 'BUILTIN_PROTECTED'); if (!uuid(gameId)) fail(422, 'DRAFT_GAME_ID');
    const row = this.#one('SELECT * FROM content_games WHERE game_id=?', gameId); if (!row || row.owner_id !== actor.id) fail(404, 'GAME_NOT_FOUND');
    this.#games.assertNotDeleting(gameId);
    return { actor, row };
  }
  #origin(tokenHash, gameId, actor) {
    this.#owned(tokenHash, gameId, actor);
    const origin = this.#one('SELECT * FROM copy_origins WHERE game_id=?', gameId), def = this.#definition();
    if (!origin) fail(503, 'DRAFT_PROFILE_NOT_READY');
    const registered = this.#one('SELECT * FROM installed_sources WHERE registry_id=?', origin.registry_id);
    if (!registered || origin.registry_id !== def.registryId || ![FIXED_COPY_PROFILE, FIXED_TEMPLATE_PROFILE].includes(origin.profile_revision) || def.profileRevision !== FIXED_COPY_PROFILE || def.definitionDigest !== origin.definition_digest || registered.definition_digest !== origin.definition_digest || registered.root_digest !== origin.catalog_root || !hex(origin.baseline_root) || !hex(origin.baseline_digest) || !Number.isSafeInteger(origin.baseline_length)) fail(409, 'DRAFT_SOURCE_CHANGED');
    return origin;
  }
  #descriptor(gameId, reference) {
    const prefix = `private/${gameId}/`, digest = reference.rootKey?.slice(prefix.length);
    if (typeof reference.rootKey !== 'string' || !reference.rootKey.startsWith(prefix) || !hex(digest)) fail(503, 'DRAFT_REFERENCE_CORRUPT');
    const object = this.#one("SELECT byte_length FROM copy_objects WHERE game_id=? AND sha256=? AND state='committed'", gameId, digest) ?? this.#one("SELECT byte_length FROM draft_objects WHERE game_id=? AND sha256=? AND state='committed'", gameId, digest);
    if (!object || !Number.isSafeInteger(object.byte_length)) fail(503, 'DRAFT_REFERENCE_CORRUPT');
    return { sha256: digest, byteLength: object.byte_length };
  }
  // Both resolved bytes and failed reads cross the same authority boundary.
  async #readBlob(tokenHash, gameId, descriptor, actor) {
    let actual;
    try { actual = await this.#blobs.read(tokenHash, { gameId, ...descriptor }); }
    catch (error) { this.#origin(tokenHash, gameId, actor); throw error; }
    this.#owned(tokenHash, gameId, actor);
    return actual;
  }
  async #load(tokenHash, gameId, requested, actor, single = false) {
    if (!revision(requested)) fail(422, 'DRAFT_REVISION');
    const reference = this.#games.snapshotReference(tokenHash, gameId, requested), root = this.#descriptor(gameId, reference);
    // Metadata lives in the canonical source, never copied from the latest draft.
    const index = await this.#readBlob(tokenHash, gameId, root, actor);
    let sourceIndex; try { sourceIndex = decodeSourceChunks([index.bytes]); } catch { fail(503, 'DRAFT_REFERENCE_CORRUPT'); }
    // Streaming verifier reads and checks every actual part. Metadata must first be
    // discovered from those bytes, without using the current row for an old revision.
    const proof = await (single ? this.#readSourceStored(tokenHash, gameId, root, sourceIndex, actor) : this.#readSource(tokenHash, gameId, root, sourceIndex, actor));
    if (proof.sourceDigest !== reference.sourceDigest || proof.dependencyDigest !== reference.dependencyDigest) fail(503, 'DRAFT_REFERENCE_CORRUPT');
    return { reference, root, proof };
  }
  async #readSource(tokenHash, gameId, root, index, actor) {
    // Decode once to extract metadata; then use the unchanged common verifier. All
    // parts are bounded and hashed by BlobStore, and total has an explicit budget.
    fields(index, ['schema', 'gameId', 'sourceDigest', 'sourceByteLength', 'chunks', 'dependencies']);
    if (index.schema !== 'dragon-game-source-index-1' || index.gameId !== gameId || !hex(index.sourceDigest)) fail(503, 'DRAFT_REFERENCE_CORRUPT');
    if (!Array.isArray(index?.chunks) || !index.chunks.length || index.chunks.length > 4096 || !Number.isSafeInteger(index.sourceByteLength) || index.sourceByteLength < 1 || index.sourceByteLength > 64 * 1024 * 1024) fail(503, 'DRAFT_REFERENCE_CORRUPT');
    const parser = new CanonicalSourceParser(), decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }); let total = 0;
    for (const part of index.chunks) {
      fields(part, ['sha256', 'byteLength']);
      if (!hex(part.sha256) || !Number.isSafeInteger(part.byteLength) || part.byteLength < 1 || part.byteLength > 4 * 1024 * 1024) fail(503, 'DRAFT_REFERENCE_CORRUPT');
      total += part.byteLength;
      if (total > 64 * 1024 * 1024) fail(503, 'DRAFT_REFERENCE_CORRUPT');
      const actual = await this.#readBlob(tokenHash, gameId, part, actor);
      try { parser.feed(decoder.decode(actual.bytes, { stream: true })); } catch { fail(503, 'DRAFT_REFERENCE_CORRUPT'); }
    }
    let game; try { parser.feed(decoder.decode()); game = parser.finish(); } catch { fail(503, 'DRAFT_REFERENCE_CORRUPT'); }
    if (total !== index.sourceByteLength || !game?.metadata) fail(503, 'DRAFT_REFERENCE_CORRUPT');
    const metadata = game.metadata; game = undefined;
    let proof;
    try { proof = await this.#verifier.verify(tokenHash, { gameId, metadata, source: root }); }
    catch (error) { this.#origin(tokenHash, gameId, actor); throw error; }
    this.#owned(tokenHash, gameId, actor); return proof;
  }
  async #profile(tokenHash, gameId, actor, single = false) {
    const origin = this.#origin(tokenHash, gameId, actor), root = { sha256: origin.baseline_root, byteLength: origin.baseline_length };
    const actual = await this.#readBlob(tokenHash, gameId, root, actor);
    let index;
    try { index = decodeSourceChunks([actual.bytes]); } catch { fail(503, 'DRAFT_BASELINE_CORRUPT'); }
    const proof = await (single ? this.#readSourceStored(tokenHash, gameId, root, index, actor) : this.#readSource(tokenHash, gameId, root, index, actor));
    if (proof.sourceDigest !== origin.baseline_digest) fail(503, 'DRAFT_BASELINE_CORRUPT');
    const profile = new FixedCopyProfile({ profileRevision: origin.profile_revision, loadCopy: async () => ({ game: proof.game, provenance: { registryId: origin.registry_id, definitionDigest: origin.definition_digest, rootDigest: origin.catalog_root } }) }), captured = await profile.capture({ gameId, ownerId: actor.id });
    this.#owned(tokenHash, gameId, actor); this.#origin(tokenHash, gameId, actor); if (single) this.#sameOrigin(tokenHash, gameId, actor, origin); return { profile, captured };
  }
  // Compiler-only stored discovery; legacy read/save retain the original path.
  #sameOrigin(tokenHash, gameId, actor, origin) {
    const current = this.#origin(tokenHash, gameId, actor);
    for (const key of ['registry_id','profile_revision','catalog_root','definition_digest','baseline_root','baseline_length','baseline_digest']) if (current[key] !== origin[key]) fail(409, 'DRAFT_SOURCE_CHANGED');
  }
  async #readSourceStored(tokenHash, gameId, root, index, actor) {
    fields(index, ['schema','gameId','sourceDigest','sourceByteLength','chunks','dependencies']);
    if (index.schema !== 'dragon-game-source-index-1' || index.gameId !== gameId || !hex(index.sourceDigest)) fail(503,'DRAFT_REFERENCE_CORRUPT');
    if (!Array.isArray(index.chunks) || !index.chunks.length || index.chunks.length > 4096 || !Number.isSafeInteger(index.sourceByteLength) || index.sourceByteLength < 1 || index.sourceByteLength > 64*1024*1024) fail(503,'DRAFT_REFERENCE_CORRUPT');
    const origin = this.#origin(tokenHash, gameId, actor);
    const guarded = { read: async (t, input) => { const actual = await this.#readBlob(t,gameId,input,actor); this.#sameOrigin(tokenHash,gameId,actor,origin); return actual; } };
    try { const proof = await new GameSnapshotVerifier({blobs:guarded}).verifyStored(tokenHash,{gameId,source:root}); this.#owned(tokenHash,gameId,actor); this.#sameOrigin(tokenHash,gameId,actor,origin); return proof; }
    catch (error) { this.#sameOrigin(tokenHash,gameId,actor,origin); if (error instanceof HttpError && ['SOURCE_JSON','SOURCE_STORED_METADATA'].includes(error.code)) fail(503,'DRAFT_REFERENCE_CORRUPT'); throw error; }
  }
  // Trusted in-process compiler port only; never returned by an HTTP route.
  // Revision-chain allowlist: every committed save verified its own edits at
  // commit time; read/compile replay the cumulative list so the profile can
  // tell authorized chapter edits apart from corruption. Rows are ordered by
  // result revision; compare-and-swap guarantees one applied save per step.
  #editHistory(gameId, requested) {
    let wanted;
    try { wanted = BigInt(requested); } catch { fail(422, 'DRAFT_REVISION'); }
    const rows = this.#sql.exec("SELECT actor, op_key, request_json, expected_revision, result_revision FROM draft_requests WHERE game_id=? AND state='committed'", gameId).toArray();
    const steps = [];
    for (const row of rows) {
      if (!revision(row.result_revision) || !revision(row.expected_revision)) fail(503, 'DRAFT_HISTORY_CORRUPT');
      const rev = BigInt(row.result_revision), expected = BigInt(row.expected_revision);
      if (rev > wanted) continue;
      if (rev !== expected && rev !== expected + 1n) fail(503, 'DRAFT_HISTORY_CORRUPT');
      let body;
      try {
        const stored = JSON.parse(row.request_json);
        if (!Array.isArray(stored?.chapterEdits)) fail(503, 'DRAFT_HISTORY_CORRUPT');
        body = capture(stored);
      } catch { fail(503, 'DRAFT_HISTORY_CORRUPT'); }
      if (typeof row.actor !== 'string' || !row.actor || typeof row.op_key !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(row.op_key)) fail(503, 'DRAFT_HISTORY_CORRUPT');
      steps.push({ rev, expected, chapters: body.chapterEdits, definitions: resolveGeneralEdits(gameId, row.actor, row.op_key, body.generalEdits), people: body.peopleEdits ?? [], map: resolveMapEdits(gameId, row.actor, row.op_key, body.mapEdits), cities: resolveCityEdits(body.cityEdits), chapterCities: body.chapterCityEdits ?? [] });
    }
    // A previously failed future-revision request may be retried as a no-op.
    // Its earlier rowid must not place it before the save that created that revision.
    steps.sort((a, b) => {
      if (a.rev !== b.rev) return a.rev < b.rev ? -1 : 1;
      if (a.expected !== b.expected) return a.expected < b.expected ? -1 : 1;
      return 0;
    });
    return { chapters: steps.flatMap(entry => entry.chapters), definitions: steps.flatMap(entry => entry.definitions),
      steps: steps.map(entry => ({ chapterEdits: entry.chapters, generalEdits: entry.definitions, peopleEdits: entry.people, mapEdits: entry.map, cityEdits: entry.cities, chapterCityEdits: entry.chapterCities })) };
  }
  #verifyHistory(profile, captured, candidate, history) {
    // The source kind comes from the captured, profile-checked trusted baseline,
    // never the request/candidate. Full copies cannot hide people in history.
    if (captured.game.sourceRef.kind === 'builtin-template') return profile.verifyOrderedTemplate(captured.capability, candidate, history.steps);
    // B5: the game-level general library belongs to every game-owned source, so
    // its person references are no longer a template-only command. A baseline
    // without a game-owned library（旧槽位字典）仍拒绝，不把字典当庫。
    if (history.steps.some(step => step.peopleEdits.length) && !generalLibrarySupported(captured.game)) fail(422, 'DRAFT_PEOPLE_PROFILE');
    if (history.steps.some(step => step.cityEdits.length)) fail(422, 'DRAFT_CITY_PROFILE');
    if (history.steps.some(step => step.chapterCityEdits.length)) fail(422, 'DRAFT_CHAPTER_CITY_PROFILE');
    return profile.verify(captured.capability, candidate, history.chapters, history.definitions, history.steps.flatMap(step => step.mapEdits), history.steps.flatMap(step => step.peopleEdits));
  }
  async captureForCompile(tokenHash, gameId, requested) {
    const { actor } = this.#owned(tokenHash, gameId); this.#origin(tokenHash, gameId, actor);
    const loaded = await this.#load(tokenHash, gameId, requested, actor, true), { profile, captured } = await this.#profile(tokenHash, gameId, actor, true);
    const history = this.#editHistory(gameId, requested);
    const content = this.#verifyHistory(profile, captured, loaded.proof.game, history);
    this.#origin(tokenHash, gameId, actor);
    const reference = this.#games.snapshotReference(tokenHash, gameId, requested);
    if (reference.rootKey !== loaded.reference.rootKey || reference.sourceDigest !== loaded.reference.sourceDigest || reference.dependencyDigest !== loaded.reference.dependencyDigest || content.sourceDigest !== reference.sourceDigest) fail(503, 'DRAFT_REFERENCE_CORRUPT');
    return Object.freeze({ game: loaded.proof.game, reference: Object.freeze({ ...reference }), ownerId: actor.id, authEpoch: actor.epoch, profileRevision: content.profileRevision });
  }
  // B8 全章匯總校驗（上架前的唯讀入口）：與 publish 共用同一 captureForCompile，
  // 所以 revision／sourceDigest／profile 口徑與上架門完全一致；不改資料、不寫收據、
  // 不授予 Trial 或發布資格，只回「哪些章因基礎資料缺失而引用不到」。
  async chapterReferences(tokenHash, gameId, requested) {
    const { game, reference } = await this.captureForCompile(tokenHash, gameId, requested);
    return { version: 1, gameId, draftRevision: reference.draftRevision, sourceDigest: reference.sourceDigest,
      chapterCount: (game.chapterOrder ?? []).length, chapters: chapterReferenceReport(game) };
  }
  // Display-only projection of an authenticated immutable revision, not Trial
  // compilation/admission. Never fetch latest or persist a preview artifact.
  // Small tile-space display window. Keep uncovered cells null; never convert
  // a draft diagnostic into a runnable byte plane or fetch a newer revision.
  async readMapWindow(tokenHash, gameId, requested, rectangle, layerMask) {
    const { actor } = this.#owned(tokenHash, gameId);
    fields(rectangle, ['x', 'y', 'width', 'height']);
    const { x, y, width, height } = rectangle;
    if ([x, y, width, height].some(value => !Number.isSafeInteger(value) || Object.is(value, -0)) || x < 0 || y < 0 || width < 1 || height < 1 || width > 32 || height > 32 || x + width > 384 || y + height > 256) fail(422, 'DRAFT_MAP_WINDOW');
    return this.#readMapProjection(tokenHash, gameId, requested, rectangle, layerMask, layerMask === undefined ? 'dragon-draft-map-window-1' : 'dragon-draft-map-layer-window-1', actor);
  }
  async readMapScene(tokenHash, gameId, requested, layerMask) {
    const { actor } = this.#owned(tokenHash, gameId);
    return this.#readMapProjection(tokenHash, gameId, requested, { x: 0, y: 0, width: 384, height: 256 }, layerMask, 'dragon-draft-map-scene-1', actor);
  }
  async #readMapProjection(tokenHash, gameId, requested, rectangle, layerMask, format, actor) {
    if (layerMask !== undefined && (typeof layerMask !== 'string' || !/^[01]{4}$/.test(layerMask))) fail(422, 'DRAFT_MAP_LAYERS');
    const visibleLayers = layerMask === undefined ? null : Object.fromEntries(['base','decor','roads','cities'].map((name, index) => [name, layerMask[index] === '1']));
    const { x, y, width, height } = rectangle;
    const { game, reference } = await this.captureForCompile(tokenHash, gameId, requested);
    this.#owned(tokenHash, gameId, actor); this.#origin(tokenHash, gameId, actor);
    if (game.map.bounds.width !== 384 || game.map.bounds.height !== 256) fail(422, 'DRAFT_MAP_WINDOW');
    let composed;
    try { composed = visibleLayers ? composeMapDisplayLayers(game, visibleLayers) : composeMapLayers(game, { draft: true }); } catch { fail(422, 'DRAFT_MAP_PREVIEW_UNSUPPORTED'); }
    if (!visibleLayers && composed.diagnostics.some(row => row.code !== 'UNKNOWN_UNDERLAY')) fail(422, 'DRAFT_MAP_PREVIEW_UNSUPPORTED');
    const plane = visibleLayers ? composed.tiles : composed.terrain;
    const tiles = Array.from({ length: height }, (_, row) => plane.slice((y + row) * 384 + x, (y + row) * 384 + x + width)).flat();
    this.#owned(tokenHash, gameId, actor); this.#origin(tokenHash, gameId, actor);
    const result = { format, gameId, draftRevision: requested, sourceDigest: reference.sourceDigest,
      worldWidth: 384, worldHeight: 256, tileSize: 16, x, y, width, height, tiles, admission: 'display-only' };
    if (visibleLayers) result.visibleLayers = visibleLayers;
    return result;
  }
  // Complete footprint intersection, not the topmost pixel picker. Read-only
  // IDs in source draw order; selection never grants a later write or runtime use.
  async readDecorationSelection(tokenHash, gameId, requested, rectangle) {
    const { actor } = this.#owned(tokenHash, gameId), origin = this.#origin(tokenHash, gameId, actor);
    fields(rectangle, ['x', 'y', 'width', 'height']);
    const { x, y, width, height } = rectangle;
    if ([x, y, width, height].some(value => !Number.isSafeInteger(value) || Object.is(value, -0)) || x < 0 || y < 0 || width < 1 || height < 1 || x + width > 384 || y + height > 256) fail(422, 'DRAFT_DECORATION_SELECTION');
    const { game, reference } = await this.captureForCompile(tokenHash, gameId, requested);
    this.#sameOrigin(tokenHash, gameId, actor, origin);
    if (game.map.bounds.width !== 384 || game.map.bounds.height !== 256) fail(422, 'DRAFT_DECORATION_SELECTION');
    let instanceIds;
    try { instanceIds = decorationIdsInRect(game, x, x + width - 1, y, y + height - 1); } catch { fail(422, 'DRAFT_DECORATION_SELECTION_UNSUPPORTED'); }
    this.#sameOrigin(tokenHash, gameId, actor, origin);
    return { format: 'dragon-draft-decoration-selection-1', gameId, draftRevision: requested, sourceDigest: reference.sourceDigest,
      worldWidth: 384, worldHeight: 256, tileSize: 16, x, y, width, height, instanceIds, admission: 'display-only' };
  }
  async readMapAtlas(tokenHash, gameId, requested, season) {
    const { actor } = this.#owned(tokenHash, gameId), origin = this.#origin(tokenHash, gameId, actor);
    if (!['spring', 'summer', 'autumn', 'winter'].includes(season)) fail(422, 'DRAFT_MAP_ATLAS');
    if (!this.#atlas) fail(503, 'DRAFT_ATLAS_NOT_CONFIGURED');
    const captured = await this.captureForCompile(tokenHash, gameId, requested);
    this.#sameOrigin(tokenHash, gameId, actor, origin);
    let asset;
    try { asset = await this.#atlas(tokenHash, origin.registry_id, season); }
    catch (error) { this.#sameOrigin(tokenHash, gameId, actor, origin); throw error; }
    this.#sameOrigin(tokenHash, gameId, actor, origin);
    if (asset.registryId !== origin.registry_id || asset.definitionDigest !== origin.definition_digest || asset.rootDigest !== origin.catalog_root) fail(409, 'DRAFT_SOURCE_CHANGED');
    if (!(asset.bytes instanceof Uint8Array) || !hex(asset.sha256) || hash(asset.bytes) !== asset.sha256) fail(503, 'DRAFT_ATLAS_CORRUPT');
    let image;
    try { image = decodePNG(asset.bytes); } catch { fail(422, 'DRAFT_ATLAS_UNSUPPORTED'); }
    if (image.width !== 256 || image.height !== 256 || image.pixels.length !== 256 * 256 * 4 || image.pixels.some((value, index) => index % 4 === 3 && value !== 255)) fail(422, 'DRAFT_ATLAS_UNSUPPORTED');
    const result = { format: 'dragon-draft-map-atlas-1', gameId, draftRevision: requested, sourceDigest: captured.reference.sourceDigest,
      season, width: 256, height: 256, tileSize: 16, pixelFormat: 'rgba8', assetSha256: asset.sha256,
      pixelsSha256: hash(image.pixels), pixelsHex: Buffer.from(image.pixels).toString('hex'), admission: 'display-only' };
    this.#sameOrigin(tokenHash, gameId, actor, origin);
    return result;
  }
  async readMinimap(tokenHash, gameId, requested) {
    const { actor } = this.#owned(tokenHash, gameId);
    const captured = await this.captureForCompile(tokenHash, gameId, requested);
    this.#owned(tokenHash, gameId, actor); this.#origin(tokenHash, gameId, actor);
    const { game, reference } = captured;
    const map = compileMapSource({ schemaVersion: 1, map: game.map, componentDefinitions: game.componentDefinitions });
    const { w: width, h: height } = MINIMAP_SIZES.large, textureSeed = 1;
    const { pixels } = renderMinimapPixels(map.minimapGeography, map.roadMask, map.width, map.height, width, height, textureSeed);
    const result = { format: 'dragon-draft-minimap-1', gameId, draftRevision: requested, sourceDigest: reference.sourceDigest,
      styleRevision: MINIMAP_STYLE_REVISION, textureSeed, width, height, pixelFormat: 'rgb8',
      pixelsSha256: hash(pixels), pixelsHex: Buffer.from(pixels).toString('hex') };
    this.#owned(tokenHash, gameId, actor); this.#origin(tokenHash, gameId, actor);
    return result;
  }
  async read(tokenHash, gameId, requested) {
    const { actor } = this.#owned(tokenHash, gameId); this.#origin(tokenHash, gameId, actor);
    const loaded = await this.#load(tokenHash, gameId, requested, actor), { profile, captured } = await this.#profile(tokenHash, gameId, actor);
    const history = this.#editHistory(gameId, requested);
    const content = this.#verifyHistory(profile, captured, loaded.proof.game, history); this.#origin(tokenHash, gameId, actor);
    // B5 武將庫：是否為遊戲自有庫看真實資料形狀，不看 profile 名稱。
    const library = generalLibrarySupported(loaded.proof.game);
    return { gameId, draftRevision: requested, sourceDigest: loaded.reference.sourceDigest, profileRevision: content.profileRevision, metadata: loaded.proof.game.metadata,
      chapters: loaded.proof.game.chapterOrder.map(id => { const st = loaded.proof.game.chapters[id].state; return { chapterId: id, name: loaded.proof.game.chapters[id].name ?? '', startDate: st.start ? { year: st.start.year, month: st.start.month, day: st.start.day, era: st.start.era ?? null } : null, factions: st.factions.map(f => ({ slot: f.idx, idx: f.idx, monarch_idx: f.monarch_idx, advisor_idx: f.advisor_idx ?? null, diplomat_idx: f.diplomat_idx ?? null, capital: f.capital, money: f.money, reserve_cav: f.reserve_cav, reserve_arc: f.reserve_arc, reserve_inf: f.reserve_inf })), generals: st.generals.map(g => ({ idx: g.idx, name: g.name, hao: g.hao, sourceRecordId: loaded.proof.game.sourceRecords?.bindings?.[id]?.slotMap?.[g.idx] ?? null, portrait: g.portrait ?? null, portraitKey: g.portraitKey ?? null, ability: g.ability ? { ...g.ability } : null, specialtyLowBits: g.specialty_low_bits ?? null, faction: g.faction ?? null, references: generalChapterReferences(loaded.proof.game, id, g.idx) })), cities: st.cities.map(c => ({ idx: c.idx, name: c.name, typeCode: c.type ?? null, faction: c.faction ?? null, governor: c.governor ?? null, troops: c.troops ?? null, prod: c.prod ?? null, troopsCap: c.troops_cap ?? null, maxProd: c.max_prod ?? null, growth: c.growth ?? null, defence: c.defence ?? null })), gaps: chapterGapReport(st, id) }; }),
      cityDefinitions: content.profileRevision === FIXED_TEMPLATE_PROFILE ? Object.entries(loaded.proof.game.cities).map(([cityId, definition]) => ({ cityId, name: definition.name ?? null, runtimeSlot: definition.runtimeSlot, x: definition.x, y: definition.y, max_prod: definition.max_prod ?? null, type: definition.type ?? null, view: definition.view ?? null })) : null,
      chapterCities: content.profileRevision === FIXED_TEMPLATE_PROFILE ? chapterCitiesProjection(loaded.proof.game) : null,
      generalDefinitions: library ? Object.entries(loaded.proof.game.generals).map(([generalId, definition]) => ({ generalId, ...structuredClone(definition) })) : null,
      ...(library ? chapterPeopleProjection(loaded.proof.game) : { generalReferences: null, chapterPeople: null }),
      waterGroups: loaded.proof.game.map.waterGroups.map(group => {
        let name = null;
        if (typeof group.name === 'string') name = group.name;
        return { groupId: group.id, name, showOnMinimap: group.showOnMinimap, memberCount: group.memberIds.length, baseCellCount: group.baseCells.length };
      }),
      waterGroupMembers: loaded.proof.game.map.waterGroups.map(group => ({ groupId: group.id, memberIds: [...group.memberIds], baseCells: [...group.baseCells] })),
      // Same explicit classification domain as groupParts, not visible pixels
      // or only ungrouped members. Creating a group can transfer existing ones.
      waterCreateCandidates: {
        memberIds: [...loaded.proof.game.map.decorations, ...loaded.proof.game.map.roads.flatMap(road => road.components ?? [])]
          .filter(instance => Object.hasOwn(WATER_CLASSES, instance.waterClass)).map(instance => instance.id),
        baseCells: loaded.proof.game.map.base.geography.flatMap((geography, cell) => geography ? [cell] : []),
      },
      // Saved base layer only, before decoration/road/city composition. Null
      // remains unknown; exposing this projection does not unlock editing.
      baseTerrain: { width: loaded.proof.game.map.bounds.width, height: loaded.proof.game.map.bounds.height,
        tiles: [...loaded.proof.game.map.base.terrainRef], geography: [...loaded.proof.game.map.base.geography],
        unknownCells: Object.keys(loaded.proof.game.map.base.unknownUnderlays).map(Number) },
      // A count candidate only, not permission or a guarantee that atom recipes
      // and the complete draft will pass the shared split writer.
      decorationSplitCandidates: loaded.proof.game.map.decorations.map(instance => {
        const definition = loaded.proof.game.componentDefinitions[instance.definitionRef];
        const tiles = definition?.variants?.[instance.variantRef ?? 'original']?.tiles;
        let childCount = null;
        if (definition?.ruleRecipeRef === BYTE_STAMP_RECIPE && definition.visualRef === 'MMAP.MDL:indexed-footprint' && Array.isArray(tiles) && tiles.length >= 2 && tiles.length <= 256) childCount = tiles.length;
        return { instanceId: instance.id, childCount };
      }),
      materialPlacement: { materials: Object.entries(loaded.proof.game.componentDefinitions).map(([materialId, definition]) => ({ materialId, variantRefs: Object.keys(definition.variants), offsets: componentCells(loaded.proof.game, { definitionRef: materialId, x: 0, y: 0 }),
        visualVariants: Object.entries(definition.variants).map(([variantRef, variant]) => {
          const supported = definition.ruleRecipeRef === BYTE_STAMP_RECIPE && (definition.visualRef === 'MMAP.MDL:indexed-footprint' || variant.tiles.length === 1 && definition.visualRef === `MMAP.MDL:tile-${variant.tiles[0][2]}`);
          return { variantRef, tiles: supported ? variant.tiles.map(([x, y, tile]) => [x - definition.anchor[0], y - definition.anchor[1], tile]) : null };
        }) })), waterClasses: [null, ...Object.keys(WATER_CLASSES)] },
      materialDefinitions: Object.entries(loaded.proof.game.componentDefinitions).map(([materialId, definition]) => ({
        materialId, name: definition.name ?? null, cellCount: definition.footprint.length,
        authorEditable: definition.category === 'author-multicell' && definition.revision === 'author-byte-stamp-1',
        references: materialReferences(loaded.proof.game, materialId),
      })),
      decorationInstances: loaded.proof.game.map.decorations.map(instance => ({ instanceId: instance.id, materialId: instance.definitionRef, variantRef: instance.variantRef ?? 'original', x: instance.x, y: instance.y })),
      strongholds: Object.keys(loaded.proof.game.cities ?? {}).map(cityId => cityReferences(loaded.proof.game, cityId)),
      map: { placements: (loaded.proof.game.map?.placements ?? []).length, roads: (loaded.proof.game.map?.roads ?? []).map(road => ({ id: road.id, fromCityId: road.fromCityId, toCityId: road.toCityId, travelKind: road.travelKind ?? null, geometry: road.geometry ?? [] })) },
      limits: content.limits };
  }
  #request(tokenHash, gameId, operationKey, actor) {
    this.#owned(tokenHash, gameId, actor);
    if (typeof operationKey !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(operationKey)) fail(422, 'IDEMPOTENCY_KEY');
    const row = this.#one('SELECT * FROM draft_requests WHERE actor=? AND op_key=?', actor.id, operationKey);
    if (!row || row.game_id !== gameId) fail(404, 'DRAFT_OPERATION_NOT_FOUND'); if (row.auth_epoch !== actor.epoch) fail(409, 'OPERATION_REVOKED'); return row;
  }
  #receipt(tokenHash, row) {
    const result = parsed(row.result_json), old = this.#one('SELECT * FROM content_operations WHERE actor=? AND op_key=?', row.actor, row.op_key), ref = this.#games.snapshotReference(tokenHash, row.game_id, row.result_revision);
    if (!old || old.request_digest !== row.request_digest || old.auth_epoch !== row.auth_epoch || old.method !== 'save' || old.target !== row.game_id || old.result_json !== row.result_json || result.gameId !== row.game_id || result.draftRevision !== row.result_revision || ![row.expected_revision, String(BigInt(row.expected_revision) + 1n)].includes(result.draftRevision) || ref.rootKey !== row.root_key || ref.sourceDigest !== row.source_digest || ref.dependencyDigest !== row.dependency_digest) fail(503, 'DRAFT_RECEIPT_CORRUPT');
    return result;
  }
  query(tokenHash, gameId, operationKey) {
    const { actor } = this.#owned(tokenHash, gameId); this.#origin(tokenHash, gameId, actor);
    const row = this.#request(tokenHash, gameId, operationKey, actor);
    if (row.state === 'committed') return { state: row.state, result: this.#receipt(tokenHash, row) };
    return { gameId, state: row.state, expectedRevision: row.expected_revision, error: row.error_code, status: row.error_status };
  }
  async #put(tokenHash, actor, row, bytes) {
    const digest = hash(bytes); this.#storage.transactionSync(() => {
      this.#request(tokenHash, row.game_id, row.op_key, actor);
      const old = this.#one('SELECT * FROM draft_objects WHERE actor=? AND op_key=? AND sha256=?', actor.id, row.op_key, digest); if (old && old.byte_length !== bytes.length) fail(503, 'DRAFT_OBJECT_CONFLICT');
      this.#sql.exec("INSERT OR IGNORE INTO draft_objects VALUES(?,?,?,?,?,'intent')", actor.id, row.op_key, row.game_id, digest, bytes.length);
    });
    const stored = await this.#blobs.putImmutable(tokenHash, { gameId: row.game_id, bytes }); this.#owned(tokenHash, row.game_id, actor);
    this.#storage.transactionSync(() => { this.#request(tokenHash, row.game_id, row.op_key, actor); this.#sql.exec("UPDATE draft_objects SET state='verified' WHERE actor=? AND op_key=? AND sha256=? AND state='intent'", actor.id, row.op_key, digest); });
    return { sha256: stored.sha256, byteLength: stored.byteLength };
  }
  async #write(tokenHash, actor, row, game) {
    const chunks = [], parts = encodeSourceChunks(game), h = createHash('sha256'); let length = 0;
    for (const part of parts) { length += part.length; h.update(part); chunks.push(await this.#put(tokenHash, actor, row, part)); }
    const index = { schema: 'dragon-game-source-index-1', gameId: row.game_id, sourceDigest: h.digest('hex'), sourceByteLength: length, chunks, dependencies: [] };
    return this.#put(tokenHash, actor, row, Buffer.concat(encodeSourceChunks(index)));
  }
  async save(tokenHash, gameId, expected, operationKey, operationDigest, input) {
    const { actor, row: gameRow } = this.#owned(tokenHash, gameId); this.#origin(tokenHash, gameId, actor);
    if (hasPendingMoves(this.#storage, gameId)) fail(422, 'DRAFT_TOPOLOGY_BROKEN');
    if (!revision(expected) || !hex(operationDigest)) fail(422, 'DRAFT_OPERATION');
    const value = capture(input), capturedJSON = JSON.stringify(value);
    this.#storage.transactionSync(() => {
      this.#owned(tokenHash, gameId, actor); this.#guard(actor.id, operationKey);
      const old = this.#one('SELECT * FROM draft_requests WHERE actor=? AND op_key=?', actor.id, operationKey);
      if (old) { if (old.game_id !== gameId || old.expected_revision !== expected || old.request_digest !== operationDigest || old.request_json !== capturedJSON) fail(409, 'IDEMPOTENCY_CONFLICT'); this.#request(tokenHash, gameId, operationKey, actor); if (old.state === 'failed') this.#sql.exec("UPDATE draft_requests SET state='pending',error_code=NULL,error_status=NULL WHERE actor=? AND op_key=? AND state='failed'", actor.id, operationKey); }
      else this.#sql.exec("INSERT INTO draft_requests VALUES(?,?,?,?,?,?,?,'pending',NULL,NULL,NULL,NULL,NULL,NULL,NULL,?,NULL)", actor.id, operationKey, operationDigest, actor.epoch, gameId, expected, capturedJSON, new Date().toISOString());
    });
    const row = this.#request(tokenHash, gameId, operationKey, actor);
    if (row.state === 'committed') return this.#receipt(tokenHash, row);
    try {
      if (gameRow.draft_revision !== expected) fail(412, 'DRAFT_CHANGED');
      const loaded = await this.#load(tokenHash, gameId, expected, actor), { profile, captured } = await this.#profile(tokenHash, gameId, actor);
      const history = this.#editHistory(gameId, expected);
      this.#verifyHistory(profile, captured, loaded.proof.game, history);
      const generalEdits = resolveGeneralEdits(gameId, actor.id, operationKey, value.generalEdits);
      let candidate = { ...loaded.proof.game, metadata: value.metadata };
      for (const edit of value.resourceEdits) { try { candidate = editChapterResources(candidate, edit.chapterId, edit.slot, edit.values); } catch { fail(422, 'DRAFT_RESOURCE_DELTA'); } }
      // §4.5 chapter edits apply before verification (save-gate gaps refuse).
      for (const edit of value.chapterEdits) {
        try {
          if (edit.op === 'add-blank') addBlankChapter(candidate, { name: edit.name, start: edit.start });
          else if (edit.op === 'copy') copyChapterInGame(candidate, edit.chapterId);
          else if (edit.op === 'delete') deleteChapter(candidate, edit.chapterId);
          else if (edit.op === 'rename') renameChapter(candidate, edit.chapterId, edit.name);
          else if (edit.op === 'rename-general') renameGeneral(candidate, edit.chapterId, edit.generalIdx, edit.values);
          else if (edit.op === 'portrait') candidate = setGeneralPortrait(candidate, edit.chapterId, edit.generalIdx, edit.portraitKey);
          else if (edit.op === 'set-monarch') setMonarch(candidate, edit.chapterId, edit.factionIdx, edit.generalIdx);
          else if (edit.op === 'create-faction') createFaction(candidate, edit.chapterId, { monarchIdx: edit.monarchIdx });
          else if (edit.op === 'set-strategist') setStrategist(candidate, edit.chapterId, edit.factionIdx, edit.generalIdx);
          else if (edit.op === 'remove-monarch') removeMonarch(candidate, edit.chapterId, edit.factionIdx, edit.resolution);
          else if (edit.op === 'city') candidate = editChapterCity(candidate, edit.chapterId, edit.cityIdx, edit.values);
          else if (edit.op === 'city-native') candidate = editChapterCityNative(candidate, edit.chapterId, edit.cityIdx, edit.values);
          else if (edit.op === 'start-date') setChapterStart(candidate, edit.chapterId, edit.values);
          else if (edit.op === 'city-faction') setChapterCityFaction(candidate, edit.chapterId, edit.cityIdx, edit.factionId);
          else if (edit.op === 'set-capital') setFactionCapital(candidate, edit.chapterId, edit.factionIdx, edit.cityIdx);
          else if (edit.op === 'general-faction') setChapterGeneralFaction(candidate, edit.chapterId, edit.generalIdx, edit.factionId);
          else if (edit.op === 'general-active') setGeneralActive(candidate, edit.chapterId, edit.generalIdx, edit.active);
          else if (edit.op === 'general-status') setGeneralStatus(candidate, edit.chapterId, edit.generalIdx, edit.status);
          else if (edit.op === 'general-assign') assignChapterGeneral(candidate, edit.chapterId, edit.values);
          else if (edit.op === 'general-clear') clearChapterGeneral(candidate, edit.chapterId, edit.generalId);
          else if (edit.op === 'chapter-reorder') moveChapter(candidate, edit.chapterId, edit.toIndex);
          else if (edit.op === 'set-diplomat') setFactionDiplomat(candidate, edit.chapterId, edit.factionIdx, edit.generalIdx);
          else if (edit.op === 'city-governor') setCityGovernor(candidate, edit.chapterId, edit.cityIdx, edit.generalIdx);
          else disbandFaction(candidate, edit.chapterId, edit.factionIdx);
        } catch { fail(422, 'DRAFT_CHAPTER_EDIT'); }
      }
      for (const [index, edit] of generalEdits.entries()) {
        try {
          if (edit.op === 'update') {
            const { affectedChapters } = generalDefinitionChangeImpact(candidate, edit.generalId, edit.values);
            const acknowledgment = value.generalEdits[index].confirmedImpacts;
            if (affectedChapters.length && acknowledgment === undefined) fail(409, 'DRAFT_GENERAL_IMPACT_REQUIRED');
            if (acknowledgment !== undefined && JSON.stringify(acknowledgment) !== JSON.stringify(affectedChapters)) fail(409, 'DRAFT_GENERAL_IMPACT_CHANGED');
          }
          candidate = applyGeneralDefinitionEdit(candidate, edit);
        } catch (error) { if (error instanceof HttpError) throw error; fail(422, 'DRAFT_GENERAL_EDIT'); }
      }
      const peopleEdits = value.peopleEdits ?? [];
      for (const edit of peopleEdits) {
        try { candidate = applyChapterPersonEdit(candidate, edit); }
        catch { fail(422, 'DRAFT_PEOPLE_EDIT'); }
      }
      const mapEdits = resolveMapEdits(gameId, actor.id, operationKey, value.mapEdits);
      if (mapEdits.length && !['builtin-template', 'builtin-copy'].includes(captured.game.sourceRef.kind)) fail(422, 'DRAFT_MAP_PROFILE');
      for (const edit of mapEdits) {
        try {
          if (edit.op === 'base-fill') candidate = fillBase(candidate, edit.cells, edit.tile, edit.geography);
          else if (edit.op === 'decoration-split') candidate = splitDecoration(candidate, edit.instanceId, edit.childIds);
          else if (edit.op === 'decoration-place') candidate = placeComponent(candidate, edit.materialId, edit.x, edit.y, edit.instanceId, edit.waterClass, edit.variantRef);
          else if (edit.op === 'decoration-remove') candidate = removeDecorations(candidate, edit.memberIds);
          else if (edit.op === 'decoration-reorder') candidate = reorderDecorations(candidate, edit.memberIds, edit.direction);
          else if (edit.op === 'decoration-translate') candidate = translateDecorations(candidate, edit.memberIds, edit.dx, edit.dy);
          else if (edit.op === 'material-capture') candidate = captureComponent(candidate, edit.memberIds, edit.materialId, edit.name);
          else if (edit.op === 'material-rename') candidate = renameMaterial(candidate, edit.materialId, edit.name);
          else if (edit.op === 'material-remove') candidate = removeMaterial(candidate, edit.materialId);
          else if (edit.op === 'water-rename') candidate = renameWaterGroup(candidate, edit.groupId, edit.name);
          else if (edit.op === 'water-create') {
            candidate = createWaterGroup(candidate, edit.memberIds, edit.baseCells, edit.groupId, edit.name, edit.showOnMinimap);
            candidate = renameWaterGroup(candidate, edit.groupId, edit.name);
          } else if (edit.op === 'water-merge') {
            candidate = mergeWaterGroups(candidate, edit.groupIds, edit.groupId, edit.name, edit.showOnMinimap);
            candidate = renameWaterGroup(candidate, edit.groupId, edit.name);
          } else if (edit.op === 'water-split') {
            candidate = splitWaterGroup(candidate, edit.sourceGroupId, edit.memberIds, edit.baseCells, edit.groupId, edit.name);
            candidate = renameWaterGroup(candidate, edit.groupId, edit.name);
          } else candidate = setWaterGroupMinimapVisibility(candidate, edit.groupId, edit.showOnMinimap);
        }
        catch { fail(422, 'DRAFT_MAP_EDIT'); }
      }
      const cityEdits = resolveCityEdits(value.cityEdits);
      if (cityEdits.length && captured.game.sourceRef.kind !== 'builtin-template') fail(422, 'DRAFT_CITY_PROFILE');
      for (const [index, edit] of cityEdits.entries()) {
        try {
          if (edit.op === 'numbers') { candidate = setCityDefinitionNumbers(candidate, edit.cityId, edit.values); continue; }
          if (edit.op === 'numbers') { candidate = setCityDefinitionNumbers(candidate, edit.cityId, edit.values); continue; }
          const name = cityName(edit.name);
          // 名稱在遊戲內唯一（用戶 2026-11 決定）；同名不代表同一據點的原先说明已被取代。
          if (Object.entries(candidate.cities).some(([id, city]) => id !== edit.cityId && city.name === name)) fail(409, 'DRAFT_CITY_NAME_TAKEN');
          const { affectedChapters } = cityDefinitionChangeImpact(candidate, edit.cityId, name);
          const acknowledgment = value.cityEdits[index].confirmedImpacts;
          if (affectedChapters.length && acknowledgment === undefined) fail(409, 'DRAFT_CITY_IMPACT_REQUIRED');
          if (acknowledgment !== undefined && JSON.stringify(acknowledgment) !== JSON.stringify(affectedChapters)) fail(409, 'DRAFT_CITY_IMPACT_CHANGED');
          candidate = setCityDefinitionName(candidate, edit.cityId, name);
        } catch (error) { if (error instanceof HttpError) throw error; fail(422, 'DRAFT_CITY_EDIT'); }
      }
      const chapterCityEdits = value.chapterCityEdits ?? [];
      if (chapterCityEdits.length && captured.game.sourceRef.kind !== 'builtin-template') fail(422, 'DRAFT_CHAPTER_CITY_PROFILE');
      for (const edit of chapterCityEdits) {
        try { candidate = applyChapterCityEdit(candidate, edit); }
        catch { fail(422, 'DRAFT_CHAPTER_CITY_EDIT'); }
      }
      const proof = this.#verifyHistory(profile, captured, candidate, {
        chapters: [...history.chapters, ...value.chapterEdits], definitions: [...history.definitions, ...generalEdits],
        steps: [...history.steps, { chapterEdits: value.chapterEdits, generalEdits, peopleEdits, mapEdits, cityEdits, chapterCityEdits }],
      }); this.#origin(tokenHash, gameId, actor);
      const source = proof.sourceDigest === loaded.reference.sourceDigest ? loaded.root : await this.#write(tokenHash, actor, row, candidate);
      const next = String(BigInt(expected) + 1n), prepared = await this.#games.prepareSnapshot(tokenHash, { gameId, draftRevision: next, metadata: value.metadata, source });
      const result = this.#storage.transactionSync(() => {
        this.#owned(tokenHash, gameId, actor); this.#origin(tokenHash, gameId, actor); this.#guard(actor.id, operationKey);
        const current = this.#request(tokenHash, gameId, operationKey, actor); if (current.state === 'committed') return this.#receipt(tokenHash, current);
        return this.#games.transaction(tokenHash, { key: operationKey, method: 'save', target: gameId, digest: operationDigest }, tx => {
          let saved; try { saved = tx.compareAndSwap(gameId, expected, prepared); } catch (error) { if (error instanceof HttpError && error.code === 'DRAFT_CHANGED') fail(412, 'DRAFT_CHANGED'); throw error; }
          const reference = this.#games.snapshotReference(tokenHash, gameId, saved.draftRevision);
          if (saved.draftRevision === next) {
            const objects = this.#sql.exec('SELECT * FROM draft_objects WHERE actor=? AND op_key=?', actor.id, operationKey).toArray();
            if (objects.some(o => o.state !== 'verified' && o.state !== 'committed')) fail(503, 'DRAFT_OBJECT_NOT_VERIFIED');
            for (const object of objects) this.#sql.exec('INSERT OR IGNORE INTO draft_references VALUES(?,?,?,?)', gameId, next, object.sha256, object.byte_length);
            this.#sql.exec("UPDATE draft_objects SET state='committed' WHERE actor=? AND op_key=?", actor.id, operationKey);
          }
          this.#sql.exec("UPDATE draft_requests SET state='committed',result_json=?,error_code=NULL,error_status=NULL,source_digest=?,dependency_digest=?,root_key=?,result_revision=?,completed_at=? WHERE actor=? AND op_key=?", JSON.stringify(saved), reference.sourceDigest, reference.dependencyDigest, reference.rootKey, reference.draftRevision, new Date().toISOString(), actor.id, operationKey);
          return saved;
        });
      });
      return result;
    } catch (error) {
      // Record only while the original authority still exists, never replace the
      // primary error or alter game data on a failed operation.
      try { this.#storage.transactionSync(() => { this.#request(tokenHash, gameId, operationKey, actor); this.#sql.exec("UPDATE draft_requests SET state='failed',error_code=?,error_status=? WHERE actor=? AND op_key=? AND state<>'committed'", error instanceof HttpError ? error.code : 'INTERNAL_ERROR', error instanceof HttpError ? error.status : 500, actor.id, operationKey); }); } catch { /* Keep the authority/integrity error. */ }
      throw error;
    }
  }
}
