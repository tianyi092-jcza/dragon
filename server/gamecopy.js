// T1–T8 简化副本：copy 单套 + publish 单槽 + formal 单快照。
// 不做历史回放/整包编解码/draft 链；模块存只拦本模块，发布门全量检验。
// 单写者：新覆盖旧，不做 CAS；鉴权/epoch 不可省；30 分钟节流按 game 计。
import { createHash, randomUUID } from 'node:crypto';
import { validateGameSource, chapterReferenceReport, addBlankChapter, copyChapterInGame, deleteChapter, renameChapter, setChapterStart, editChapterCity, editChapterCityNative, setChapterCityFaction, setFactionCapital, setChapterGeneralFaction, setFactionDiplomat, setCityGovernor, renameGeneral, setMonarch, setStrategist, removeMonarch, disbandFaction } from '../web/src/content/authoring/gamesource.js';
import { setGeneralPortrait } from '../web/src/editor/generalportrait.js';
import { checkGameName } from '../web/src/content/authoring/gamesource.js';
import { bumpOrdinal } from './releases.js';
import { editChapterResources } from '../web/src/editor/chapterresources.js';
import { compileMapSource } from '../web/src/content/authoring/mapcompile.js';
import { COPY_MAP_OPS } from './copyprofile.js';
import { applyMapWorkspaceEdits } from './mapworkspace.js';
import { cityName } from '../web/src/content/authoring/cityrecords.js';
import { KAO_MANIFEST } from '../web/kao/manifest.js';
import { builtinGeneralLibrary, projectCopyGenerals } from './copygenerals.js';
// 共用头像库 ID→SHA（武将库 portraitRef 校验用，与 generaldefinitions 同源）。
const LIBRARY_PORTRAITS = new Map(KAO_MANIFEST.map(row => [row.id, row.sha256]));
// 游戏级武将库能力范围（Web 产品决定 2026-11，非原版机制）：六项统一 0..15。
// 原版专长 0 合法（本书原生记录 358 名至少一项为 0），武力/统率/政治原版为全字节 u8；
// 2026-11 用户裁决：下限 0、上限 15。与 generaldefinitions 库层同口径。
// 章节槽仍 0..max，不在此拦。
const LIBRARY_ABILITY_FIELDS = ['siege', 'field', 'naval', 'force', 'lead', 'politics'];
function generalText(value, required) {
  if (typeof value !== 'string' || !value.isWellFormed()) fail(422, 'COPY_GENERAL');
  const text = required ? value.trim().normalize('NFC') : value.normalize('NFC');
  if (required && !text) fail(422, 'COPY_GENERAL');
  if ([...text].some(c => { const n = c.codePointAt(0); return n < 32 || n >= 127 && n <= 159; })) fail(422, 'COPY_GENERAL');
  return text;
}
import { fail, fields } from './security.js';

const uuid = v => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const hex = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const iso = v => typeof v === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
const sha = b => createHash('sha256').update(b).digest('hex');
const SUBMIT_COOLDOWN_MS = 30 * 60 * 1000;
const MODULES = ['metadata', 'cities', 'generals', 'chapters', 'map'];
const MAX_COPY_BYTES = 64 * 1024 * 1024;

function codePoints(s) { return [...s].length; }

function checkDescription(value) {
  if (typeof value !== 'string' || !value.isWellFormed()) fail(422, 'PUBLISH_DESCRIPTION');
  const trimmed = value.trim();
  if (codePoints(trimmed) < 1 || codePoints(trimmed) > 2000) fail(422, 'PUBLISH_DESCRIPTION');
  if ([...trimmed].some(c => { const n = c.codePointAt(0); return n < 32 && n !== 10 && n !== 13 || n >= 127 && n <= 159; })) fail(422, 'PUBLISH_DESCRIPTION');
  return trimmed.normalize('NFC');
}

// 模块存只拦本模块内（T4）：非空/范围/长度/本模块唯一；跨模块一律推迟到发布门。
function checkModule(module, patch, data, gameId) {
  if (!MODULES.includes(module)) fail(422, 'COPY_MODULE');
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) fail(422, 'COPY_PATCH');
  if (module === 'metadata') {
    fields(patch, ['name', 'introduction']);
    for (const t of [patch.name, patch.introduction]) {
      if (typeof t !== 'string' || !t.isWellFormed() || [...t].some(c => { const n = c.codePointAt(0); return n < 32 || n >= 127 && n <= 159; })) fail(422, 'COPY_METADATA');
    }
    if (codePoints(patch.name.trim()) < 1 || codePoints(patch.name.trim()) > 8) fail(422, 'COPY_METADATA');
    if (codePoints(patch.introduction) > 1024) fail(422, 'COPY_METADATA');
    return { name: patch.name.normalize('NFC'), introduction: patch.introduction.normalize('NFC') };
  }
  if (module === 'cities') {
    // patch: {rename?: {cityId: name}, numbers?: {cityId: {max_prod/prod/growth/defence/troops/type/view}}}
    const out = {};
    if (patch.rename !== undefined) {
      if (!patch.rename || typeof patch.rename !== 'object' || Array.isArray(patch.rename)) fail(422, 'COPY_CITY');
      const seen = new Set(Object.values(data.cities ?? {}).map(c => c.name));
      for (const [cityId, name] of Object.entries(patch.rename)) {
        if (typeof cityId !== 'string' || !cityId.length || cityId.length > 256) fail(422, 'COPY_CITY');
        let cleaned; try { cleaned = cityName(name); } catch { fail(422, 'COPY_CITY'); }
        if (codePoints(cleaned) < 1 || codePoints(cleaned) > 12) fail(422, 'COPY_CITY');
        const old = data.cities?.[cityId]?.name;
        if (old !== undefined) seen.delete(old);
        if (seen.has(cleaned)) fail(409, 'COPY_CITY_NAME_TAKEN');
        seen.add(cleaned);
        out[`rename:${cityId}`] = cleaned;
      }
    }
    if (patch.numbers !== undefined) {
      if (!patch.numbers || typeof patch.numbers !== 'object' || Array.isArray(patch.numbers)) fail(422, 'COPY_CITY');
      for (const [cityId, values] of Object.entries(patch.numbers)) {
        if (typeof cityId !== 'string' || !data.cities?.[cityId]) fail(422, 'COPY_CITY');
        if (!values || typeof values !== 'object' || Array.isArray(values)) fail(422, 'COPY_CITY');
        for (const [k, n] of Object.entries(values)) {
          if (!['max_prod', 'prod', 'growth', 'defence', 'troops', 'type', 'view'].includes(k)) fail(422, 'COPY_CITY');
          if (!Number.isSafeInteger(n) || n < 0 || n > 65535) fail(422, 'COPY_CITY');
        }
        out[`numbers:${cityId}`] = { ...values };
      }
    }
    if (!Object.keys(out).length) fail(422, 'COPY_PATCH');
    return out;
  }
  if (module === 'generals') {
    // patch: {upsert?: {generalId: {name?, hao?, portraitRef?, suicideOnCapture?, ability?}}, remove?: [generalId]}
    // upsert 只改库（父表）既有条目，不新增（首版无增删）；章节槽不动，与 draft 库路径同规则。
    // 姓名非空 NFC＋库内唯一，能力六项整数 0..15，自杀旗布尔，头像对 KAO 清单。
    const lib = data.generals && typeof data.generals === 'object' && !Array.isArray(data.generals) ? data.generals : null;
    if (!lib) fail(422, 'COPY_GENERAL');
    const out = {};
    if (patch.upsert !== undefined) {
      if (!patch.upsert || typeof patch.upsert !== 'object' || Array.isArray(patch.upsert)) fail(422, 'COPY_GENERAL');
      const cleaned = {};
      for (const [id, v] of Object.entries(patch.upsert)) {
        if (typeof id !== 'string' || !id.length || id.length > 256 || !Object.hasOwn(lib, id)) fail(422, 'COPY_GENERAL');
        if (!v || typeof v !== 'object' || Array.isArray(v)) fail(422, 'COPY_GENERAL');
        const keys = Object.keys(v);
        if (!keys.length || keys.some(k => !['name', 'zi', 'hao', 'portraitRef', 'suicideOnCapture', 'ability'].includes(k))) fail(422, 'COPY_GENERAL');
        const row = {};
        if (v.name !== undefined) row.name = generalText(v.name, true);
        if (v.zi !== undefined) row.zi = generalText(v.zi, false);
        if (v.hao !== undefined) row.hao = generalText(v.hao, false);
        if (v.portraitRef !== undefined) {
          if (v.portraitRef !== null) {
            if (!v.portraitRef || typeof v.portraitRef !== 'object' || Array.isArray(v.portraitRef) ||
                typeof v.portraitRef.assetId !== 'string' || typeof v.portraitRef.sha256 !== 'string' ||
                LIBRARY_PORTRAITS.get(v.portraitRef.assetId) !== v.portraitRef.sha256) fail(422, 'COPY_GENERAL');
            row.portraitRef = { assetId: v.portraitRef.assetId, sha256: v.portraitRef.sha256 };
          } else row.portraitRef = null;
        }
        if (v.suicideOnCapture !== undefined) {
          if (typeof v.suicideOnCapture !== 'boolean') fail(422, 'COPY_GENERAL');
          row.suicideOnCapture = v.suicideOnCapture;
        }
        if (v.ability !== undefined) {
          if (!v.ability || typeof v.ability !== 'object' || Array.isArray(v.ability)) fail(422, 'COPY_GENERAL');
          const given = Object.keys(v.ability);
          if (!given.length || given.some(k => !LIBRARY_ABILITY_FIELDS.includes(k))) fail(422, 'COPY_GENERAL');
          // 只校验本次给的字段（部分合并），范围 0..15：原版专长 0 合法，
          // 导入及作者改动的字段均按用户确认的 0..15 编辑域校验。
          const ability = {};
          for (const k of given) {
            const n = v.ability[k];
            if (!Number.isInteger(n) || Object.is(n, -0) || n < 0 || n > 15) fail(422, 'COPY_GENERAL');
            ability[k] = n;
          }
          row.ability = ability;
        }
        cleaned[id] = row;
      }
      // 合并后全库姓名唯一（同补丁多改名一起算）。
      const names = new Map(Object.entries(lib).map(([id, g]) => [id, typeof g?.name === 'string' ? g.name : null]));
      for (const [id, row] of Object.entries(cleaned)) if (row.name !== undefined) names.set(id, row.name);
      const seen = new Set();
      for (const name of names.values()) {
        if (typeof name !== 'string' || !name) fail(422, 'COPY_GENERAL');
        if (seen.has(name)) fail(422, 'COPY_GENERAL');
        seen.add(name);
      }
      out.upsert = cleaned;
    }
    if (patch.remove !== undefined) {
      if (!Array.isArray(patch.remove) || !patch.remove.length || new Set(patch.remove).size !== patch.remove.length) fail(422, 'COPY_GENERAL');
      for (const id of patch.remove) if (typeof id !== 'string' || !id.length || id.length > 256) fail(422, 'COPY_GENERAL');
      out.remove = [...patch.remove];
    }
    // import：把本游戏原生槽里的武将记录播成库条目（显式动作，不随读取自动写）。
    // 只带姓名／字／原图／专长／自杀旗；ID 由姓名哈希确定，重导同一姓名得同一 ID。
    if (patch.import !== undefined) {
      if (!Array.isArray(patch.import) || !patch.import.length || patch.import.length > 999) fail(422, 'COPY_GENERAL');
      if (typeof gameId !== 'string' || !gameId) fail(422, 'COPY_GENERAL');
      const known = new Set(Object.values(lib).map(g => g?.name));
      out.import = patch.import.map(v => {
        if (!v || typeof v !== 'object' || Array.isArray(v)) fail(422, 'COPY_GENERAL');
        const keys = Object.keys(v);
        // 字／号不来自原生记录（原版 6 字节“字号/称呼”多数等于姓名）：导入留空，
        // 只人工填写；号只有极少数武将有。
        if (!keys.length || keys.some(k => !['name', 'portrait', 'suicideOnCapture', 'ability'].includes(k))) fail(422, 'COPY_GENERAL');
        const name = generalText(v.name, true);
        if (known.has(name)) fail(422, 'COPY_GENERAL');
        known.add(name);
        const row = { generalId: `${gameId}#general-${sha(name)}`, name, zi: '', hao: '', portraitRef: null, suicideOnCapture: false };
        if (v.portrait !== undefined) {
          // 原图只认共用头像库命中的 ID；未命中（或0）留空，不造假字节。
          if (!Number.isInteger(v.portrait) || Object.is(v.portrait, -0) || v.portrait < 0 || v.portrait > 255) fail(422, 'COPY_GENERAL');
          const digest = v.portrait === 0 ? undefined : LIBRARY_PORTRAITS.get(String(v.portrait));
          if (digest !== undefined) row.portraitRef = { assetId: String(v.portrait), sha256: digest };
        }
        if (v.suicideOnCapture !== undefined) {
          if (typeof v.suicideOnCapture !== 'boolean') fail(422, 'COPY_GENERAL');
          row.suicideOnCapture = v.suicideOnCapture;
        }
        if (v.ability !== undefined) {
          if (!v.ability || typeof v.ability !== 'object' || Array.isArray(v.ability)) fail(422, 'COPY_GENERAL');
          const ability = {};
          for (const k of LIBRARY_ABILITY_FIELDS) {
            const n = v.ability[k];
            if (!Number.isInteger(n) || Object.is(n, -0) || n < 0 || n > 15) fail(422, 'COPY_GENERAL');
            ability[k] = n;
          }
          row.ability = ability;
        }
        return row;
      });
    }
    if (out.upsert === undefined && out.remove === undefined && out.import === undefined) fail(422, 'COPY_PATCH');
    return out;
  }
  if (module === 'chapters') {
    // patch: {setStart?, rename?, create?, copy?, delete?, resources?}——与 draft 章节 op 同语义（T4 只拦本模块）。
    // create/copy/delete/create-resources 走 gamesource/chapterresources 原函数，不另立公式。
    const chapterId = v => typeof v === 'string' && v.length && v.length <= 256;
    if (patch.rename !== undefined) {
      if (!patch.rename || typeof patch.rename !== 'object' || Array.isArray(patch.rename)) fail(422, 'COPY_CHAPTER');
      for (const [id, name] of Object.entries(patch.rename)) {
        if (!chapterId(id)) fail(422, 'COPY_CHAPTER');
        if (typeof name !== 'string' || !name.trim() || codePoints(name.trim()) > 16) fail(422, 'COPY_CHAPTER');
      }
    }
    if (patch.setStart !== undefined) {
      // 部分合并 + 年≤9999 与 draft start-date 一致，由 setChapterStart 原函数再验。
      if (!patch.setStart || typeof patch.setStart !== 'object' || Array.isArray(patch.setStart)) fail(422, 'COPY_CHAPTER');
      for (const [id, s] of Object.entries(patch.setStart)) {
        if (!chapterId(id)) fail(422, 'COPY_CHAPTER');
        if (!s || typeof s !== 'object' || Array.isArray(s)) fail(422, 'COPY_CHAPTER');
      }
    }
    if (patch.create !== undefined) {
      // 与 draft add-blank 同限：名≤1024 原字符；start 含年代时 year 1..9999、month 1..12、day 1..31、era bc|ad。
      if (!patch.create || typeof patch.create !== 'object' || Array.isArray(patch.create)) fail(422, 'COPY_CHAPTER');
      if (patch.create.name !== undefined && (typeof patch.create.name !== 'string' || !patch.create.name.trim() || patch.create.name.length > 1024)) fail(422, 'COPY_CHAPTER');
      if (patch.create.start !== undefined) {
        const s = patch.create.start;
        if (!s || typeof s !== 'object' || Array.isArray(s)) fail(422, 'COPY_CHAPTER');
        const keys = Object.keys(s);
        if (!keys.length || keys.some(k => !['era', 'year', 'month', 'day'].includes(k))) fail(422, 'COPY_CHAPTER');
        for (const [k, max] of [['year', 9999], ['month', 12], ['day', 31]]) {
          if (!Number.isInteger(s[k]) || Object.is(s[k], -0) || s[k] < 1 || s[k] > max) fail(422, 'COPY_CHAPTER');
        }
        if (s.era !== undefined && !['bc', 'ad'].includes(s.era)) fail(422, 'COPY_CHAPTER');
      }
      if (typeof data.gameId !== 'string' || !data.gameId) fail(422, 'COPY_CHAPTER');
    }
    if (patch.copy !== undefined) {
      if (!patch.copy || typeof patch.copy !== 'object' || Array.isArray(patch.copy) || !chapterId(patch.copy.chapterId)) fail(422, 'COPY_CHAPTER');
      if (typeof data.gameId !== 'string' || !data.gameId) fail(422, 'COPY_CHAPTER');
    }
    if (patch.delete !== undefined) {
      if (!patch.delete || typeof patch.delete !== 'object' || Array.isArray(patch.delete) || !chapterId(patch.delete.chapterId)) fail(422, 'COPY_CHAPTER');
    }
    if (patch.resources !== undefined) {
      // {chapterId: {slot: values}}——slot 为原生派系 idx；值域 money -8388608..8388607、三预备兵 0..65535。
      if (!patch.resources || typeof patch.resources !== 'object' || Array.isArray(patch.resources)) fail(422, 'COPY_CHAPTER');
      for (const [id, slots] of Object.entries(patch.resources)) {
        if (!chapterId(id)) fail(422, 'COPY_CHAPTER');
        if (!slots || typeof slots !== 'object' || Array.isArray(slots)) fail(422, 'COPY_CHAPTER');
        for (const [slotKey, values] of Object.entries(slots)) {
          if (!/^(0|[1-9][0-9]*)$/.test(slotKey)) fail(422, 'COPY_CHAPTER');
          const slot = Number(slotKey);
          if (slot > 21) fail(422, 'COPY_CHAPTER');
          if (!values || typeof values !== 'object' || Array.isArray(values)) fail(422, 'COPY_CHAPTER');
          const names = Object.keys(values);
          if (!names.length || names.some(n => !['money', 'reserve_cav', 'reserve_arc', 'reserve_inf'].includes(n))) fail(422, 'COPY_CHAPTER');
          for (const n of names) {
            const v = values[n], min = n === 'money' ? -8388608 : 0, max = n === 'money' ? 8388607 : 65535;
            if (typeof v !== 'number' || !Number.isInteger(v) || Object.is(v, -0) || v < min || v > max) fail(422, 'COPY_CHAPTER');
          }
        }
      }
    }
    if (patch.edits !== undefined) {
      // 与 draft chapterEdits 同形同限（ChaptersPanel 七 op：city/city-native/city-faction/set-capital/general-faction/city-governor/set-diplomat）。
      if (!Array.isArray(patch.edits) || !patch.edits.length) fail(422, 'COPY_CHAPTER');
      const keysOf = (o, ks) => Object.keys(o).sort().join(',') === ks;
      for (const edit of patch.edits) {
        if (!edit || typeof edit !== 'object' || Array.isArray(edit)) fail(422, 'COPY_CHAPTER');
        if (edit.op === 'city' || edit.op === 'city-native') {
          if (!keysOf(edit, 'chapterId,cityIdx,op,values') || !chapterId(edit.chapterId)) fail(422, 'COPY_CHAPTER');
          if (!Number.isSafeInteger(edit.cityIdx) || edit.cityIdx < 0) fail(422, 'COPY_CHAPTER');
          if (!edit.values || typeof edit.values !== 'object' || Array.isArray(edit.values)) fail(422, 'COPY_CHAPTER');
          const ks = Object.keys(edit.values);
          if (!ks.length || ks.some(k => !['troops', 'prod', 'growth', 'defence'].includes(k))) fail(422, 'COPY_CHAPTER');
          for (const k of ks) if (typeof edit.values[k] !== 'number' || !Number.isInteger(edit.values[k]) || Object.is(edit.values[k], -0)) fail(422, 'COPY_CHAPTER');
        }
        else if (edit.op === 'city-faction') {
          if (!keysOf(edit, 'chapterId,cityIdx,factionId,op') || !chapterId(edit.chapterId)) fail(422, 'COPY_CHAPTER');
          if (!Number.isSafeInteger(edit.cityIdx) || edit.cityIdx < 0 || edit.cityIdx > 191) fail(422, 'COPY_CHAPTER');
          if (edit.factionId !== null && (!Number.isInteger(edit.factionId) || edit.factionId < 0 || edit.factionId > 255)) fail(422, 'COPY_CHAPTER');
        }
        else if (edit.op === 'set-capital') {
          if (!keysOf(edit, 'chapterId,cityIdx,factionIdx,op') || !chapterId(edit.chapterId)) fail(422, 'COPY_CHAPTER');
          if (!Number.isInteger(edit.factionIdx) || edit.factionIdx < 0 || edit.factionIdx > 21) fail(422, 'COPY_CHAPTER');
          if (!Number.isSafeInteger(edit.cityIdx) || edit.cityIdx < 0 || edit.cityIdx > 191) fail(422, 'COPY_CHAPTER');
        }
        else if (edit.op === 'general-faction') {
          if (!keysOf(edit, 'chapterId,factionId,generalIdx,op') || !chapterId(edit.chapterId)) fail(422, 'COPY_CHAPTER');
          if (!Number.isInteger(edit.generalIdx) || edit.generalIdx < 0 || edit.generalIdx > 127) fail(422, 'COPY_CHAPTER');
          if (edit.factionId !== null && (!Number.isInteger(edit.factionId) || edit.factionId < 0 || edit.factionId > 255)) fail(422, 'COPY_CHAPTER');
        }
        else if (edit.op === 'city-governor') {
          if (!keysOf(edit, 'chapterId,cityIdx,generalIdx,op') || !chapterId(edit.chapterId)) fail(422, 'COPY_CHAPTER');
          if (!Number.isInteger(edit.cityIdx) || edit.cityIdx < 0 || edit.cityIdx > 191) fail(422, 'COPY_CHAPTER');
          if (edit.generalIdx !== null && (!Number.isInteger(edit.generalIdx) || edit.generalIdx < 0 || edit.generalIdx > 127)) fail(422, 'COPY_CHAPTER');
        }
        else if (edit.op === 'set-diplomat') {
          if (!keysOf(edit, 'chapterId,factionIdx,generalIdx,op') || !chapterId(edit.chapterId)) fail(422, 'COPY_CHAPTER');
          if (!Number.isInteger(edit.factionIdx) || edit.factionIdx < 0 || edit.factionIdx > 21) fail(422, 'COPY_CHAPTER');
          if (edit.generalIdx !== null && (!Number.isInteger(edit.generalIdx) || edit.generalIdx < 0 || edit.generalIdx > 127)) fail(422, 'COPY_CHAPTER');
        }
        else if (edit.op === 'rename-general') {
          if (!keysOf(edit, 'chapterId,generalIdx,op,values') || !chapterId(edit.chapterId)) fail(422, 'COPY_CHAPTER');
          if (!Number.isInteger(edit.generalIdx) || edit.generalIdx < 0 || edit.generalIdx > 127) fail(422, 'COPY_CHAPTER');
          if (!edit.values || typeof edit.values !== 'object' || Array.isArray(edit.values)) fail(422, 'COPY_CHAPTER');
          const ks = Object.keys(edit.values);
          if (!ks.length || ks.some(k => !['name', 'hao'].includes(k))) fail(422, 'COPY_CHAPTER');
        }
        else if (edit.op === 'portrait') {
          if (!keysOf(edit, 'chapterId,generalIdx,op,portraitKey') || !chapterId(edit.chapterId)) fail(422, 'COPY_CHAPTER');
          if (!Number.isInteger(edit.generalIdx) || edit.generalIdx < 0 || edit.generalIdx > 127) fail(422, 'COPY_CHAPTER');
          if (edit.portraitKey !== null && typeof edit.portraitKey !== 'string') fail(422, 'COPY_CHAPTER');
        }
        else if (edit.op === 'set-monarch') {
          if (!keysOf(edit, 'chapterId,factionIdx,generalIdx,op') || !chapterId(edit.chapterId)) fail(422, 'COPY_CHAPTER');
          if (!Number.isInteger(edit.factionIdx) || edit.factionIdx < 0 || edit.factionIdx > 21) fail(422, 'COPY_CHAPTER');
          if (!Number.isInteger(edit.generalIdx) || edit.generalIdx < 0 || edit.generalIdx > 127) fail(422, 'COPY_CHAPTER');
        }
        else if (edit.op === 'set-strategist') {
          if (!keysOf(edit, 'chapterId,factionIdx,generalIdx,op') || !chapterId(edit.chapterId)) fail(422, 'COPY_CHAPTER');
          if (!Number.isInteger(edit.factionIdx) || edit.factionIdx < 0 || edit.factionIdx > 21) fail(422, 'COPY_CHAPTER');
          if (edit.generalIdx !== null && (!Number.isInteger(edit.generalIdx) || edit.generalIdx < 0 || edit.generalIdx > 127)) fail(422, 'COPY_CHAPTER');
        }
        else if (edit.op === 'remove-monarch') {
          if (!keysOf(edit, 'chapterId,factionIdx,op,resolution') || !chapterId(edit.chapterId)) fail(422, 'COPY_CHAPTER');
          if (!Number.isInteger(edit.factionIdx) || edit.factionIdx < 0 || edit.factionIdx > 21) fail(422, 'COPY_CHAPTER');
          if (!edit.resolution || typeof edit.resolution !== 'object' || Array.isArray(edit.resolution)) fail(422, 'COPY_CHAPTER');
        }
        else if (edit.op === 'disband-faction') {
          if (!keysOf(edit, 'chapterId,confirm,factionIdx,op') || !chapterId(edit.chapterId)) fail(422, 'COPY_CHAPTER');
          if (!Number.isInteger(edit.factionIdx) || edit.factionIdx < 0 || edit.factionIdx > 21) fail(422, 'COPY_CHAPTER');
          if (edit.confirm !== true) fail(422, 'COPY_CHAPTER');
        }
        else fail(422, 'COPY_CHAPTER');
      }
    }
    if (patch.rename === undefined && patch.setStart === undefined && patch.create === undefined && patch.copy === undefined && patch.delete === undefined && patch.resources === undefined && patch.edits === undefined) fail(422, 'COPY_PATCH');
    return patch;
  }
  // map 模块：只接受 {edits} 逐命令补丁，走 copyprofile 原函数（与 capture 回放同一口径）；
  // 深层形状由 applyCopyMapEdits 再验（COPY_MAP_DELTA），整包替换已废止。
  if (module === 'map') {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch) || Object.keys(patch).sort().join(',') !== 'edits') fail(422, 'COPY_MAP');
    if (!Array.isArray(patch.edits) || !patch.edits.length) fail(422, 'COPY_MAP');
    for (const edit of patch.edits) {
      if (!edit || typeof edit !== 'object' || Array.isArray(edit) || !COPY_MAP_OPS.includes(edit.op)) fail(422, 'COPY_MAP');
    }
    return patch;
  }
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) fail(422, 'COPY_PATCH');
  return patch;
}

function applyModule(data, module, checked) {
  const next = structuredClone(data);
  if (module === 'metadata') { next.metadata = { ...next.metadata, ...checked }; return next; }
  if (module === 'cities') {
    for (const [k, v] of Object.entries(checked)) {
      const [op, cityId] = k.split(/:(.*)/);
      if (op === 'rename') next.cities[cityId].name = v;
      else Object.assign(next.cities[cityId], v);
    }
    return next;
  }
  if (module === 'generals') {
    next.generals ??= {};
    if (checked.upsert) for (const [id, v] of Object.entries(checked.upsert)) {
      const merged = { ...(next.generals[id] ?? {}), ...v };
      // 专长部分更新只合并给出的字段，不抹掉未涉及的项。
      if (v.ability) merged.ability = { ...(next.generals[id]?.ability ?? {}), ...v.ability };
      next.generals[id] = merged;
    }
    if (checked.import) for (const { generalId, ...row } of checked.import) next.generals[generalId] = row;
    if (checked.remove) for (const id of checked.remove) delete next.generals[id];
    return projectCopyGenerals(next);
  }
  if (module === 'chapters') {
    let next = structuredClone(data);
    try {
      if (checked.create) addBlankChapter(next, checked.create);
      if (checked.copy) copyChapterInGame(next, checked.copy.chapterId);
      if (checked.delete) deleteChapter(next, checked.delete.chapterId);
      if (checked.rename) for (const [id, name] of Object.entries(checked.rename)) renameChapter(next, id, name);
      if (checked.setStart) for (const [id, s] of Object.entries(checked.setStart)) setChapterStart(next, id, s);
      // editChapterCity/editChapterCityNative/setGeneralPortrait 为纯函数（返回新包），其余原函数就地改写。
      if (checked.edits) for (const edit of checked.edits) {
        if (edit.op === 'city') next = editChapterCity(next, edit.chapterId, edit.cityIdx, edit.values);
        else if (edit.op === 'city-native') next = editChapterCityNative(next, edit.chapterId, edit.cityIdx, edit.values);
        else if (edit.op === 'city-faction') setChapterCityFaction(next, edit.chapterId, edit.cityIdx, edit.factionId);
        else if (edit.op === 'set-capital') setFactionCapital(next, edit.chapterId, edit.factionIdx, edit.cityIdx);
        else if (edit.op === 'general-faction') setChapterGeneralFaction(next, edit.chapterId, edit.generalIdx, edit.factionId);
        else if (edit.op === 'set-diplomat') setFactionDiplomat(next, edit.chapterId, edit.factionIdx, edit.generalIdx);
        else if (edit.op === 'city-governor') setCityGovernor(next, edit.chapterId, edit.cityIdx, edit.generalIdx);
        else if (edit.op === 'rename-general') renameGeneral(next, edit.chapterId, edit.generalIdx, edit.values);
        else if (edit.op === 'portrait') next = setGeneralPortrait(next, edit.chapterId, edit.generalIdx, edit.portraitKey);
        else if (edit.op === 'set-monarch') setMonarch(next, edit.chapterId, edit.factionIdx, edit.generalIdx);
        else if (edit.op === 'set-strategist') setStrategist(next, edit.chapterId, edit.factionIdx, edit.generalIdx);
        else if (edit.op === 'remove-monarch') removeMonarch(next, edit.chapterId, edit.factionIdx, edit.resolution);
        else if (edit.op === 'disband-faction') disbandFaction(next, edit.chapterId, edit.factionIdx);
      }
      if (checked.resources) for (const [chapterId, slots] of Object.entries(checked.resources)) {
        for (const [slotKey, values] of Object.entries(slots)) next = editChapterResources(next, chapterId, Number(slotKey), values);
      }
    } catch (e) { if (e?.status) throw e; fail(422, 'COPY_CHAPTER'); }
    return next;
  }
  // map：逐命令走 copyprofile 原函数；深层形状由 applyCopyMapEdits 再验。
  if (module === 'map') {
    try {
      // 素材命令也会返回 componentDefinitions；不能只保存 map 而丢掉定义库。
      return applyMapWorkspaceEdits(next, checked.edits);
    } catch (e) { if (e?.status) throw e; fail(422, 'COPY_MAP'); }
  }
  return next;
}

export class GameCopyStore {
  #storage; #sql; #principal; #games;
  constructor({ storage, principal, games }) {
    if (!storage?.sql || typeof principal !== 'function' || typeof games?.assertNotDeleting !== 'function' || typeof games?.listOwn !== 'function') {
      throw new TypeError('actual SQLite, principal and game directory required');
    }
    this.#storage = storage; this.#sql = storage.sql; this.#principal = principal; this.#games = games;
    storage.transactionSync(() => {
      this.#sql.exec('CREATE TABLE IF NOT EXISTS game_copies (game_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, data_json TEXT NOT NULL, copy_digest TEXT NOT NULL, updated_at TEXT NOT NULL)');
      this.#sql.exec("CREATE TABLE IF NOT EXISTS publish_slots (game_id TEXT PRIMARY KEY, ticket TEXT, description TEXT, validation_digest TEXT, state TEXT NOT NULL CHECK(state IN ('empty','ready','submitted','approved')), submitted_at TEXT, validated_at TEXT)");
      this.#sql.exec("CREATE TABLE IF NOT EXISTS copy_validations (game_id TEXT PRIMARY KEY, state TEXT NOT NULL CHECK(state IN ('passed','failed')), copy_digest TEXT NOT NULL, problems_json TEXT NOT NULL, ticket TEXT, checked_at TEXT NOT NULL)");
    });
  }
  #one(q, ...v) { return this.#sql.exec(q, ...v).toArray()[0]; }
  #actor(tokenHash) {
    const actor = this.#principal(tokenHash);
    if (actor.must_change) fail(403, 'PASSWORD_CHANGE_REQUIRED');
    return actor;
  }
  #owned(tokenHash, gameId) {
    const actor = this.#actor(tokenHash);
    if (gameId === 'wolong-builtin') fail(403, 'BUILTIN_PROTECTED');
    if (!uuid(gameId)) fail(422, 'COPY_GAME_ID');
    const row = this.#one('SELECT * FROM content_games WHERE game_id=?', gameId);
    if (!row || row.owner_id !== actor.id) fail(404, 'GAME_NOT_FOUND');
    this.#games.assertNotDeleting(gameId);
    return { actor, row };
  }
  #parse(dataJson) {
    if (typeof dataJson !== 'string' || Buffer.byteLength(dataJson) > MAX_COPY_BYTES) fail(503, 'COPY_CORRUPT');
    try {
      const data = JSON.parse(dataJson);
      if (!data || typeof data !== 'object' || Array.isArray(data)) fail(503, 'COPY_CORRUPT');
      return data;
    } catch { fail(503, 'COPY_CORRUPT'); }
  }
  ensureFromGame(tokenHash, gameId, data) {
    const { actor } = this.#owned(tokenHash, gameId);
    if (!data || typeof data !== 'object' || Array.isArray(data)) fail(422, 'COPY_DATA');
    const text = JSON.stringify(data);
    if (Buffer.byteLength(text) > MAX_COPY_BYTES) fail(413, 'COPY_TOO_LARGE');
    const now = new Date().toISOString();
    this.#storage.transactionSync(() => {
      this.#owned(tokenHash, gameId);
      this.#sql.exec('INSERT INTO game_copies VALUES(?,?,?,?,?) ON CONFLICT(game_id) DO UPDATE SET data_json=excluded.data_json, copy_digest=excluded.copy_digest, updated_at=excluded.updated_at', gameId, actor.id, text, sha(text), now);
      this.#sql.exec("INSERT OR IGNORE INTO publish_slots VALUES(?,'empty',NULL,NULL,'empty',NULL,NULL)", gameId);
    });
    return this.read(tokenHash, gameId);
  }
  // 迁移/首建只种一次：已有行直接返回，不覆盖作者已改内容（B4 幂等）。
  seedFromGame(tokenHash, gameId, data) {
    this.#owned(tokenHash, gameId);
    if (this.#one('SELECT game_id FROM game_copies WHERE game_id=?', gameId)) return this.read(tokenHash, gameId);
    return this.ensureFromGame(tokenHash, gameId, data);
  }
  read(tokenHash, gameId) {
    this.#owned(tokenHash, gameId);
    const row = this.#one('SELECT * FROM game_copies WHERE game_id=?', gameId);
    if (!row || typeof row.data_json !== 'string' || !hex(row.copy_digest) || !iso(row.updated_at)) fail(404, 'COPY_NOT_FOUND');
    const data = this.#parse(row.data_json);
    if (sha(row.data_json) !== row.copy_digest) fail(503, 'COPY_CORRUPT');
    return Object.freeze({ gameId, copyDigest: row.copy_digest, updatedAt: row.updated_at, data });
  }
  // T1 单写者：直接覆盖，不做 CAS/修订比对；同时作废旧检验票。
  writeModule(tokenHash, gameId, module, patch) {
    const { actor } = this.#owned(tokenHash, gameId);
    const row = this.#one('SELECT * FROM game_copies WHERE game_id=?', gameId);
    if (!row) fail(404, 'COPY_NOT_FOUND');
    const data = this.#parse(row.data_json);
    const checked = checkModule(module, patch, data, gameId);
    if (module === 'chapters') {
      for (const edit of checked.edits ?? []) {
        if (edit.op !== 'rename-general' && edit.op !== 'portrait') continue;
        const generalId = data.chapters[edit.chapterId]?.state.generals.find(row => row.idx === edit.generalIdx)?.generalId;
        if (generalId && Object.hasOwn(data.generals, generalId)) fail(422, 'COPY_GENERAL_SHARED_FIELD');
      }
    }
    let next;
    try { next = applyModule(data, module, checked); }
    catch (e) { if (e?.status) throw e; fail(422, 'COPY_PATCH'); }
    return this.#writeData(tokenHash, gameId, actor, next);
  }
  // 仅服务端已认证内置来源可调用；HTTP 不接受客户端传入整库。
  replaceGenerals(tokenHash, gameId, source) {
    const { actor } = this.#owned(tokenHash, gameId);
    const data = this.read(tokenHash, gameId).data;
    data.generals = builtinGeneralLibrary(source, gameId);
    return this.#writeData(tokenHash, gameId, actor, projectCopyGenerals(data));
  }
  #writeData(tokenHash, gameId, actor, next) {
    const text = JSON.stringify(next);
    if (Buffer.byteLength(text) > MAX_COPY_BYTES) fail(413, 'COPY_TOO_LARGE');
    const now = new Date().toISOString(), digest = sha(text);
    this.#storage.transactionSync(() => {
      this.#owned(tokenHash, gameId);
      this.#sql.exec('UPDATE game_copies SET data_json=?, copy_digest=?, updated_at=? WHERE game_id=? AND owner_id=?', text, digest, now, gameId, actor.id);
      // 检验票失效：copy 变了就必须重验（改没改都需重验由提交侧再查）。
      this.#sql.exec('DELETE FROM copy_validations WHERE game_id=?', gameId);
      this.#sql.exec("UPDATE publish_slots SET ticket=NULL, validation_digest=NULL, state='empty' WHERE game_id=? AND state='ready'", gameId);
    });
    return Object.freeze({ gameId, copyDigest: digest, updatedAt: now });
  }
  // T2/D1 发布门：整包全量验，低频允许慢。problems 为逐章清单，供上架页红字列出。
  validateWhole(tokenHash, gameId) {
    const { actor } = this.#owned(tokenHash, gameId);
    void actor;
    const row = this.#one('SELECT * FROM game_copies WHERE game_id=?', gameId);
    if (!row) fail(404, 'COPY_NOT_FOUND');
    const data = this.#parse(row.data_json), digest = row.copy_digest;
    let problems = [];
    try {
      for (const [chapterId, chapter] of Object.entries(data.chapters)) {
        for (const row of chapter.state.generals) {
          if (row.generalId && !Object.hasOwn(data.generals, row.generalId)) problems.push({ chapterId, code: 'CHAPTER_GENERAL_MISSING', detail: row.generalId });
        }
      }
      const report = chapterReferenceReport(data);
      for (const ch of report ?? []) {
        if (ch?.missing?.length || ch?.gaps?.length) problems.push({ chapterId: ch.chapterId ?? ch.id ?? '?', code: 'CHAPTER_REFERENCE', detail: JSON.stringify(ch.missing ?? ch.gaps ?? ch).slice(0, 500) });
      }
      validateGameSource(data, { draft: true });
      compileMapSource({ schemaVersion: 1, map: data.map, componentDefinitions: data.componentDefinitions });
    } catch (e) {
      problems.push({ chapterId: '-', code: e?.code ?? 'VALIDATION_FAILED', detail: String(e?.message ?? e).slice(0, 500) });
    }
    const state = problems.length ? 'failed' : 'passed';
    if (Buffer.byteLength(JSON.stringify(problems)) > 262144) fail(422, 'VALIDATION_REPORT_TOO_LARGE');
    const now = new Date().toISOString();
    const ticket = state === 'passed' ? randomUUID() : null;
    this.#storage.transactionSync(() => {
      this.#owned(tokenHash, gameId);
      this.#sql.exec('INSERT INTO copy_validations VALUES(?,?,?,?,?,?) ON CONFLICT(game_id) DO UPDATE SET state=excluded.state, copy_digest=excluded.copy_digest, problems_json=excluded.problems_json, ticket=excluded.ticket, checked_at=excluded.checked_at', gameId, state, digest, JSON.stringify(problems), ticket, now);
      if (state === 'passed') {
        this.#sql.exec("INSERT INTO publish_slots VALUES(?,?,?,?,?,?,?) ON CONFLICT(game_id) DO UPDATE SET ticket=excluded.ticket, validation_digest=excluded.validation_digest, state='ready', validated_at=excluded.validated_at", gameId, ticket, null, digest, 'ready', null, now);
      }
    });
    return Object.freeze({ gameId, state, copyDigest: digest, ticket, problems: Object.freeze(problems), checkedAt: now });
  }
  readValidation(tokenHash, gameId) {
    this.#owned(tokenHash, gameId);
    const copy = this.#one('SELECT copy_digest FROM game_copies WHERE game_id=?', gameId);
    const v = this.#one('SELECT * FROM copy_validations WHERE game_id=?', gameId);
    if (!v) return Object.freeze({ state: 'unvalidated', copyDigest: copy?.copy_digest ?? null });
    let problems = [];
    try { problems = JSON.parse(v.problems_json); } catch { fail(503, 'VALIDATION_CORRUPT'); }
    const fresh = copy && v.copy_digest === copy.copy_digest;
    return Object.freeze({ state: fresh ? v.state : 'stale', copyDigest: copy?.copy_digest ?? null, validationDigest: v.copy_digest, ticket: fresh ? v.ticket : null, problems: Object.freeze(problems), checkedAt: v.checked_at });
  }
  // T2/T5：说明必填 + 票一次性 + 30 分钟节流 + 单槽覆盖。
  submit(tokenHash, gameId, { ticket, description }) {
    const text = checkDescription(description);
    if (typeof ticket !== 'string' || !uuid(ticket)) fail(422, 'VALIDATION_TICKET');
    return this.#storage.transactionSync(() => {
      const { actor } = this.#owned(tokenHash, gameId);
      void actor;
      const copy = this.#one('SELECT * FROM game_copies WHERE game_id=?', gameId);
      if (!copy) fail(404, 'COPY_NOT_FOUND');
      const v = this.#one('SELECT * FROM copy_validations WHERE game_id=?', gameId);
      if (!v || v.state !== 'passed' || v.ticket !== ticket || v.copy_digest !== copy.copy_digest) fail(409, 'VALIDATION_STALE');
      const slot = this.#one('SELECT * FROM publish_slots WHERE game_id=?', gameId);
      const now = Date.now(), nowIso = new Date(now).toISOString();
      if (slot?.submitted_at && iso(slot.submitted_at) && now - Date.parse(slot.submitted_at) < SUBMIT_COOLDOWN_MS) {
        const remain = Math.ceil((SUBMIT_COOLDOWN_MS - (now - Date.parse(slot.submitted_at))) / 60000);
        fail(429, 'PUBLISH_TOO_SOON', { remainMinutes: remain });
      }
      // 核销票据 + 单槽覆盖（后到覆盖前到）。
      this.#sql.exec('UPDATE copy_validations SET ticket=NULL WHERE game_id=?', gameId);
      this.#sql.exec("INSERT INTO publish_slots VALUES(?,?,?,?,?,?,?) ON CONFLICT(game_id) DO UPDATE SET ticket=NULL, description=excluded.description, validation_digest=excluded.validation_digest, state='submitted', submitted_at=excluded.submitted_at, validated_at=excluded.validated_at", gameId, null, text, copy.copy_digest, 'submitted', nowIso, v.checked_at);
      return Object.freeze({ gameId, state: 'submitted', copyDigest: copy.copy_digest, description: text, submittedAt: nowIso });
    });
  }
  // 管理员驳回：submitted → empty（票提交时已核销，无需再清；说明保留备查）。
  // 同意链路待独立发版修订编号裁决（用户已延期），驳回不写 formal、无需编号。
  rejectSlot(tokenHash, gameId) {
    const actor = this.#actor(tokenHash);
    if (actor.role !== 'admin') fail(403, 'ADMIN_REQUIRED');
    if (gameId === 'wolong-builtin') fail(403, 'BUILTIN_PROTECTED');
    if (!uuid(gameId)) fail(422, 'COPY_GAME_ID');
    this.#games.assertNotDeleting(gameId);
    return this.#storage.transactionSync(() => {
      const copy = this.#one('SELECT game_id FROM game_copies WHERE game_id=?', gameId);
      if (!copy) fail(404, 'COPY_NOT_FOUND');
      const slot = this.#one('SELECT * FROM publish_slots WHERE game_id=?', gameId);
      if (!slot || slot.state !== 'submitted') fail(409, 'SLOT_NOT_SUBMITTED');
      this.#sql.exec("UPDATE publish_slots SET ticket=NULL, validation_digest=NULL, state='empty', submitted_at=NULL WHERE game_id=?", gameId);
      return Object.freeze({ gameId, state: 'empty' });
    });
  }
  submission(tokenHash, gameId) {
    const { row } = this.#owned(tokenHash, gameId);
    const copy = this.#one('SELECT copy_digest, updated_at FROM game_copies WHERE game_id=?', gameId);
    const v = this.#one('SELECT * FROM copy_validations WHERE game_id=?', gameId);
    const slot = this.#one('SELECT * FROM publish_slots WHERE game_id=?', gameId);
    const release = this.#one('SELECT ordinal FROM content_releases WHERE game_id=? AND release_id=?', gameId, row.current_release_id);
    const version = release?.ordinal ?? null;
    const nextVersion = version === null ? '1.0' : version.slice(0, version.lastIndexOf('.') + 1) + String(BigInt(version.slice(version.lastIndexOf('.') + 1)) + 1n);
    let problems = [];
    if (v?.problems_json) { try { problems = JSON.parse(v.problems_json); } catch { fail(503, 'VALIDATION_CORRUPT'); } }
    const fresh = Boolean(copy && v && v.state === 'passed' && v.copy_digest === copy.copy_digest && slot?.state === 'ready' && slot?.ticket);
    const submitted = slot?.state === 'submitted';
    let blockedReason = null;
    if (submitted) blockedReason = '已提交待审核；需重新检验通过才会再次解禁上架申请。';
    else if (!copy) blockedReason = '尚无副本，请先新建游戏。';
    else if (!v || v.copy_digest !== copy.copy_digest) blockedReason = '副本已变更，请重新检验。';
    else if (v.state !== 'passed') blockedReason = '检验未通过，请依红字修正后重新检验。';
    else if (slot?.state === 'approved' && version) blockedReason = `版本 ${version} 已上架；如需新版，修改内容后重新检验。`;
    else if (slot?.submitted_at && Date.now() - Date.parse(slot.submitted_at) < SUBMIT_COOLDOWN_MS) {
      const remain = Math.ceil((SUBMIT_COOLDOWN_MS - (Date.now() - Date.parse(slot.submitted_at))) / 60000);
      blockedReason = `提交太频繁，请 ${remain} 分钟后再试。`;
    }
    return Object.freeze({
      gameId, state: row.current_release_id ? (Number(row.listed) === 1 ? 'listed' : 'pending') : 'draft',
      version, nextVersion, copyDigest: copy?.copy_digest ?? null, copyUpdatedAt: copy?.updated_at ?? null,
      validation: v ? { state: v.state, checkedAt: v.checked_at, problems: Object.freeze(problems) } : null,
      slot: slot ? { state: slot.state, description: slot.description, submittedAt: slot.submitted_at, validatedAt: slot.validated_at } : null,
      publishEnabled: fresh && !submitted && !blockedReason, blockedReason,
    });
  }
  // 管理员全局管理列表：提交过申请的游戏保留一行，审核资格仍只认 submitted。
  // ready/empty 可能是审核后重新校验/驳回；description 保留提交记录（驳回会清 submitted_at）。
  reviewQueue(tokenHash) {
    const actor = this.#actor(tokenHash);
    if (actor.role !== 'admin') fail(403, 'ADMIN_REQUIRED');
    const slots = this.#sql.exec('SELECT * FROM publish_slots WHERE description IS NOT NULL ORDER BY submitted_at, game_id').toArray();
    return Object.freeze(slots.map(slot => {
      const g = this.#one('SELECT g.*,u.account FROM content_games g JOIN users u ON u.id=g.owner_id WHERE g.game_id=?', slot.game_id);
      if (!g) fail(503, 'REVIEW_QUEUE_CORRUPT');
      const v = this.#one('SELECT state,checked_at FROM copy_validations WHERE game_id=?', slot.game_id);
      const release = this.#one('SELECT ordinal FROM content_releases WHERE game_id=? AND release_id=?', slot.game_id, g.current_release_id);
      const version = release?.ordinal ?? null;
      return Object.freeze({ gameId: slot.game_id, name: g.draft_name, author: g.account,
        description: slot.description, submittedAt: slot.submitted_at, validatedAt: slot.validated_at,
        state: slot.state, listed: g.listed === 1,
        validation: v ? { state: v.state, checkedAt: v.checked_at } : null,
        version, nextVersion: version === null ? '1.0' : version.slice(0, version.lastIndexOf('.') + 1) + String(BigInt(version.slice(version.lastIndexOf('.') + 1)) + 1n),
        rowRevision: g.row_revision, createdAt: g.created_at });
    }));
  }
  // 方案 B 同意链路（用户裁决）：slot submitted → formal 覆盖 + ordinal+1 → approved。
  // 同意预检（只读，供路由在事务外准备 pack；真正的新鲜度由 approveSlot 在事务内复核）。
  approvePreview(tokenHash, gameId) {
    const actor = this.#actor(tokenHash);
    if (actor.role !== 'admin') fail(403, 'ADMIN_REQUIRED');
    if (gameId === 'wolong-builtin') fail(403, 'BUILTIN_PROTECTED');
    if (!uuid(gameId)) fail(422, 'COPY_GAME_ID');
    this.#games.assertNotDeleting(gameId);
    const copy = this.#one('SELECT * FROM game_copies WHERE game_id=?', gameId);
    if (!copy) fail(404, 'COPY_NOT_FOUND');
    const slot = this.#one('SELECT * FROM publish_slots WHERE game_id=?', gameId);
    if (!slot || slot.state !== 'submitted') fail(409, 'SLOT_NOT_SUBMITTED');
    const v = this.#one('SELECT * FROM copy_validations WHERE game_id=?', gameId);
    if (!v || v.state !== 'passed' || v.copy_digest !== copy.copy_digest) fail(409, 'VALIDATION_STALE');
    const g = this.#one('SELECT next_ordinal FROM content_games WHERE game_id=?', gameId);
    if (!g) fail(404, 'GAME_NOT_FOUND');
    if (g.next_ordinal !== '0' && !/^[0-9]+(\.[0-9]+)+$/.test(g.next_ordinal)) fail(503, 'RELEASE_STATE_CORRUPT');
    return Object.freeze({ gameId, data: this.#parse(copy.data_json), copyDigest: copy.copy_digest, nextVersion: bumpOrdinal(g.next_ordinal) });
  }
  // 序号在同一事务内按 next_ordinal 配发（CAS，失败不耗号）；修订号即 ordinal，
  // content_releases.draft_revision 列写 ordinal（旧管线删除时随表清理）。
  // 包安装由调用方注入（生产：prepare 后的 installPreparedInTxn；测试：桩），
  // 在同一事务内执行；任何一步失败整体回滚，不写无包 formal。
  approveSlot(tokenHash, gameId, installPack) {
    const actor = this.#actor(tokenHash);
    if (actor.role !== 'admin') fail(403, 'ADMIN_REQUIRED');
    if (gameId === 'wolong-builtin') fail(403, 'BUILTIN_PROTECTED');
    if (!uuid(gameId)) fail(422, 'COPY_GAME_ID');
    if (typeof installPack !== 'function') throw new TypeError('approveSlot requires installPack callback');
    this.#games.assertNotDeleting(gameId);
    return this.#storage.transactionSync(() => {
      const copy = this.#one('SELECT * FROM game_copies WHERE game_id=?', gameId);
      if (!copy) fail(404, 'COPY_NOT_FOUND');
      const slot = this.#one('SELECT * FROM publish_slots WHERE game_id=?', gameId);
      if (!slot || slot.state !== 'submitted') fail(409, 'SLOT_NOT_SUBMITTED');
      const v = this.#one('SELECT * FROM copy_validations WHERE game_id=?', gameId);
      if (!v || v.state !== 'passed' || v.copy_digest !== copy.copy_digest) fail(409, 'VALIDATION_STALE');
      const data = this.#parse(copy.data_json);
      const g = this.#one('SELECT owner_id, next_ordinal, row_revision, draft_name, restricted FROM content_games WHERE game_id=?', gameId);
      if (!g) fail(404, 'GAME_NOT_FOUND');
      if (g.next_ordinal !== '0' && !/^[0-9]+(\.[0-9]+)+$/.test(g.next_ordinal)) fail(503, 'RELEASE_STATE_CORRUPT');
      if (Number(g.restricted) !== 0) fail(409, 'LISTING_RESTRICTED');
      const ordinal = bumpOrdinal(g.next_ordinal);
      const releaseId = randomUUID(), now = new Date().toISOString();
      const moved = this.#one('UPDATE content_games SET next_ordinal=?, current_release_id=? WHERE game_id=? AND next_ordinal=? RETURNING game_id', ordinal, releaseId, gameId, g.next_ordinal);
      if (!moved) fail(409, 'APPROVE_CONFLICT');
      this.#sql.exec('INSERT INTO content_releases VALUES(?,?,?,?,?,?)', gameId, releaseId, ordinal, ordinal, copy.copy_digest, now);
      const pin = { gameId, name: data.metadata.name, revision: ordinal, sourceDigest: copy.copy_digest, chapters: [...data.chapterOrder], publishedAt: now, ordinal, description: slot.description };
      this.#sql.exec('INSERT OR REPLACE INTO published_games VALUES(?,?,?,?)', gameId, g.owner_id, JSON.stringify(pin), now);
      // 同意即公开（审查确认框承诺的「成為公開版本」）：listed=1 与 formal 同一事务。
      // 旧上架/下架链在 copy 流程已不走，不在此置位就没有其它入口能让玩家看到。
      this.#sql.exec('UPDATE content_games SET listed=1 WHERE game_id=?', gameId);
      // 管理员负责审批，但名称查重／登记仍属于游戏作者，与 metadata 的所有者名域一致。
      const legacyNames = new Map();
      for (const game of this.#sql.exec('SELECT game_id,current_release_id FROM content_games WHERE owner_id=? AND current_release_id IS NOT NULL AND formal_name IS NULL', g.owner_id).toArray()) {
        let row, pinRow, legacyName;
        try {
          row = this.#one('SELECT r.ordinal,r.draft_revision,r.source_digest,p.owner_id,p.pin_json FROM content_releases r LEFT JOIN published_games p ON p.game_id=r.game_id WHERE r.game_id=? AND r.release_id=?', game.game_id, game.current_release_id);
          pinRow = JSON.parse(row?.pin_json);
          legacyName = checkGameName(pinRow?.name, 40);
        } catch { fail(503, 'GAME_NAME_STATE_UNKNOWN'); }
        if (!uuid(game.current_release_id) || row?.owner_id !== g.owner_id || !legacyName || legacyName !== pinRow.name || pinRow.gameId !== game.game_id || pinRow.ordinal !== row.ordinal || pinRow.revision !== row.draft_revision || pinRow.sourceDigest !== row.source_digest || !(typeof row.draft_revision === 'string' && (/^[1-9][0-9]*$/.test(row.draft_revision) || /^1\.(0|[1-9][0-9]{0,30})$/.test(row.draft_revision))) || !/^[a-f0-9]{64}$/.test(row.source_digest)) fail(503, 'GAME_NAME_STATE_UNKNOWN');
        legacyNames.set(game.game_id, legacyName);
      }
      const names = [...new Set([g.draft_name, data.metadata.name, legacyNames.get(gameId) ?? null].filter(name => name !== null))];
      for (const [otherGame, name] of legacyNames) if (otherGame !== gameId && names.includes(name)) fail(409, 'GAME_NAME_OCCUPIED');
      for (const name of names) { const taken = this.#one('SELECT game_id FROM content_names WHERE owner_id=? AND name=?', g.owner_id, name); if (taken && taken.game_id !== gameId) fail(409, 'GAME_NAME_OCCUPIED'); }
      this.#sql.exec('UPDATE content_games SET formal_name=?, formal_introduction=? WHERE game_id=?', data.metadata.name, data.metadata.introduction, gameId);
      this.#sql.exec('DELETE FROM content_names WHERE game_id=?', gameId);
      for (const name of names) this.#sql.exec('INSERT INTO content_names VALUES(?,?,?)', g.owner_id, name, gameId);
      this.#sql.exec('DELETE FROM content_releases WHERE game_id=? AND release_id<>?', gameId, releaseId);
      this.#sql.exec("UPDATE publish_slots SET ticket=NULL, state='approved', submitted_at=NULL WHERE game_id=? AND state='submitted'", gameId);
      installPack();
      return Object.freeze({ gameId, state: 'approved', ordinal, copyDigest: copy.copy_digest, releaseId, description: slot.description, approvedAt: now });
    });
  }
}
