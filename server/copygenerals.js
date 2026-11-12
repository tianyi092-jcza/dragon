// Web 产品决定：内置章序/槽序首次同名胜出；只转换到目标 copy，不改冻结源。
import { createHash } from 'node:crypto';
import { KAO_MANIFEST } from '../web/kao/manifest.js';
import { fail } from './security.js';
const portraits = new Map(KAO_MANIFEST.map(row => [row.id, row.sha256]));
const abilities = ['force', 'lead', 'politics', 'siege', 'field', 'naval'];

export function builtinGeneralLibrary(source, gameId) {
  const names = new Set(), generals = {};
  for (const chapterId of source.chapterOrder) {
    for (const row of source.chapters[chapterId].state.generals.toSorted((a, b) => a.idx - b.idx)) {
      if (row.idx === 127 || !row.name.trim()) continue;
      const name = row.name.trim().normalize('NFC');
      if (names.has(name)) continue;
      if (!name.isWellFormed() || /[\x00-\x1f\x7f-\x9f]/.test(name)) fail(422, 'COPY_GENERAL_SOURCE');
      const ability = Object.fromEntries(abilities.map(key => {
        const value = row.ability?.[key];
        if (!Number.isInteger(value) || value < 0 || value > 15) fail(422, 'COPY_GENERAL_SOURCE');
        return [key, value];
      }));
      const assetId = String(row.portrait), sha256 = portraits.get(assetId);
      if (!sha256 || !Number.isInteger(row.attr)) fail(422, 'COPY_GENERAL_SOURCE');
      const id = gameId + '#general-' + createHash('sha256').update(name).digest('hex');
      generals[id] = { name, zi: '', hao: '', portraitRef: { assetId, sha256 }, ability, suicideOnCapture: (row.attr & 0x10) !== 0 };
      names.add(name);
    }
  }
  if (!names.size) fail(422, 'COPY_GENERAL_SOURCE_EMPTY');
  return generals;
}

// 章节槽保留所属/职务/原始兼容字节；游戏级具名值由主表投影，不反向导入。
// generalId 是身份；改名不会改变 ID。缺失引用保留给发布门诊断，不隐式免职。
export function projectCopyGenerals(game) {
  for (const chapter of Object.values(game.chapters)) {
    for (const row of chapter.state.generals) {
      const definition = game.generals[row.generalId];
      if (!definition || row.idx === 127) continue;
      row.name = definition.name;
      row.hao = definition.hao;
      if (definition.ability) row.ability = { ...definition.ability };
      row.attr = definition.suicideOnCapture ? row.attr | 0x10 : row.attr & ~0x10;
      if (definition.portraitRef) {
        row.portraitKey = definition.portraitRef.assetId;
        const portrait = Number(definition.portraitRef.assetId);
        if (portrait <= 255) row.portrait = portrait;
      } else {
        delete row.portraitKey;
        row.portrait = 0;
      }
    }
  }
  return game;
}

export function initializeCopyGenerals(source) {
  const game = structuredClone(source);
  if (game.sourceRef.kind !== 'builtin-copy') return game;
  game.generals = builtinGeneralLibrary(source, game.gameId);
  const ids = new Map(Object.entries(game.generals).map(([id, row]) => [row.name, id]));
  for (const chapter of Object.values(game.chapters)) {
    for (const row of chapter.state.generals) {
      if (row.idx !== 127 && row.name.trim()) row.generalId = ids.get(row.name.trim().normalize('NFC'));
    }
  }
  return projectCopyGenerals(game);
}
