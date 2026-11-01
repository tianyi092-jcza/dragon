// Content-only internal capability. NEVER a principal, persistent author grant or runtime certificate.
import { createHash } from 'node:crypto';
import { canonicalSourceTokens } from '../web/src/content/authoring/sourcejson.js';
import { normalizeGameMetadata } from '../web/src/editor/gamemetadata.js';
import { editChapterResources, readFactionResources } from '../web/src/editor/chapterresources.js';
import { setGeneralPortrait } from '../web/src/editor/generalportrait.js';
import { fillBase, placeComponent, splitDecoration, removeDecorations, translateDecorations, reorderDecorations, captureComponent, renameMaterial, removeMaterial, validateLibraryAdditions, createWaterGroup, splitWaterGroup, mergeWaterGroups, renameWaterGroup, setWaterGroupMinimapVisibility } from '../web/src/editor/componenttools.js';
import { applyGeneralDefinitionEdit, applyChapterPersonEdit } from '../web/src/content/authoring/generaldefinitions.js';
import { setCityDefinitionName, applyChapterCityEdit } from '../web/src/content/authoring/citydefinitions.js';
import { addBlankChapter, copyChapterInGame, deleteChapter, editChapterCity, editChapterCityNative, renameChapter, renameGeneral, setStrategist, setMonarch, removeMonarch, disbandFaction, createFaction, setChapterStart, setChapterCityFaction, setFactionCapital, setChapterGeneralFaction, setGeneralActive, setGeneralStatus, setFactionDiplomat } from '../web/src/content/authoring/gamesource.js';
import { fail } from './security.js';
const resourceNames = Object.freeze(['money', 'reserve_cav', 'reserve_arc', 'reserve_inf']);
export const FIXED_COPY_PROFILE = 'fixed-copy-resources-1';
export const FIXED_TEMPLATE_PROFILE = 'fixed-template-authoring-1';
// Chapter-attribute writes a newly created chapter accepts (2026-11 user scope:
// 年代／势力（君主＋首都）／据点所属／武将所属／职务). Everything else stays fail-closed.
const BLANK_CHAPTER_WRITES = Object.freeze(['start-date', 'create-faction', 'set-monarch', 'city-faction', 'set-capital', 'general-faction', 'general-active', 'general-status', 'set-diplomat']);
function view(value) {
  if (!value || typeof value !== 'object') fail(422, 'COPY_STRUCTURE');
  const array = Array.isArray(value), proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null && !(array && proto === Array.prototype)) fail(422, 'COPY_STRUCTURE');
  const descriptors = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(descriptors);
  for (const key of keys) {
    const d = descriptors[key];
    if (typeof key !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(key) || !Object.hasOwn(d, 'value') || (!d.enumerable && !(array && key === 'length'))) fail(422, 'COPY_STRUCTURE');
  }
  if (array && (keys.length !== value.length + 1 || keys.some(key => key !== 'length' && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length)))) fail(422, 'COPY_STRUCTURE');
  return descriptors;
}
function value(object, key) { const d = view(object)[key]; if (!d) fail(422, 'COPY_STRUCTURE'); return d.value; }
// History reversal clones the entire candidate. Validate its descriptors first
// so structuredClone cannot execute an accessor hidden below the root checks.
function checkCloneDescriptors(root) {
  const ancestors = new Set();
  function visit(item, depth) {
    if (depth > 64) fail(422, 'COPY_STRUCTURE'); // Same depth bound as sourcejson.
    if (item === null || typeof item !== 'object') return;
    if (ancestors.has(item)) fail(422, 'COPY_STRUCTURE');
    const descriptors = view(item);
    ancestors.add(item);
    for (const [key, field] of Object.entries(descriptors)) {
      if (Array.isArray(item) && key === 'length') continue;
      visit(field.value, depth + 1);
    }
    ancestors.delete(item);
  }
  visit(root, 0);
}
function capturedInstanceIds(source) {
  return new Set([...source.map.decorations, ...source.map.roads.flatMap(road => road.components ?? []), ...source.map.placements].map(instance => instance.id));
}
function applyCapturedMapEdit(source, edit, usedGroupIds, usedMaterialIds, usedInstanceIds) {
  const descriptors = view(edit); // Reject getters/functions before reading op.
  if (edit.op === 'base-fill') {
    const keys = ['op', 'cells', 'tile', 'geography'];
    if (Array.isArray(edit) || Object.keys(descriptors).length !== keys.length || keys.some(key => !Object.hasOwn(descriptors, key))) fail(422, 'COPY_MAP_DELTA');
    view(edit.cells);
    if (!Array.isArray(edit.cells) || edit.cells.some(cell => !Number.isSafeInteger(cell) || Object.is(cell, -0)) || !Number.isSafeInteger(edit.tile) || Object.is(edit.tile, -0) || !Number.isSafeInteger(edit.geography) || Object.is(edit.geography, -0)) fail(422, 'COPY_MAP_DELTA');
    return fillBase(source, edit.cells, edit.tile, edit.geography);
  }
  if (edit.op === 'decoration-split') {
    const keys = ['op', 'instanceId', 'childIds'];
    if (!usedInstanceIds || Array.isArray(edit) || Object.keys(descriptors).length !== keys.length || keys.some(key => !Object.hasOwn(descriptors, key))) fail(422, 'COPY_MAP_DELTA');
    view(edit.childIds);
    const prefix = `${source.gameId}#decoration-`;
    if (typeof edit.instanceId !== 'string' || !Array.isArray(edit.childIds) || edit.childIds.length < 2 || edit.childIds.length > 256 || new Set(edit.childIds).size !== edit.childIds.length || edit.childIds.some(id => typeof id !== 'string' || !id.startsWith(prefix) || !/^[a-f0-9]{64}$/.test(id.slice(prefix.length)) || usedInstanceIds.has(id))) fail(422, 'COPY_MAP_DELTA');
    // The shared writer owns atom recipes, masks, water membership and exact
    // unknown-underlay covering references. Removed parent IDs stay reserved.
    const next = splitDecoration(source, edit.instanceId, edit.childIds);
    for (const id of edit.childIds) usedInstanceIds.add(id);
    return next;
  }
  if (edit.op === 'decoration-place') {
    const keys = ['op', 'instanceId', 'materialId', 'variantRef', 'x', 'y', 'waterClass'];
    if (!usedInstanceIds || Array.isArray(edit) || Object.keys(descriptors).length !== keys.length || keys.some(key => !Object.hasOwn(descriptors, key))) fail(422, 'COPY_MAP_DELTA');
    const prefix = `${source.gameId}#decoration-`;
    if (typeof edit.instanceId !== 'string' || !edit.instanceId.startsWith(prefix) || !/^[a-f0-9]{64}$/.test(edit.instanceId.slice(prefix.length)) || usedInstanceIds.has(edit.instanceId)) fail(422, 'COPY_MAP_DELTA');
    if (typeof edit.materialId !== 'string' || typeof edit.variantRef !== 'string' || !edit.variantRef || !Number.isSafeInteger(edit.x) || !Number.isSafeInteger(edit.y) || Object.is(edit.x, -0) || Object.is(edit.y, -0) || edit.waterClass !== null && (typeof edit.waterClass !== 'string' || !edit.waterClass)) fail(422, 'COPY_MAP_DELTA');
    // The common writer owns footprint, classification and group creation.
    // Track its generated group identity as well as all instance identities.
    const groupId = `group-${edit.instanceId}`;
    if (edit.waterClass !== null && usedGroupIds.has(groupId)) fail(422, 'COPY_MAP_DELTA');
    const next = placeComponent(source, edit.materialId, edit.x, edit.y, edit.instanceId, edit.waterClass, edit.variantRef);
    usedInstanceIds.add(edit.instanceId);
    if (edit.waterClass !== null) usedGroupIds.add(groupId);
    return next;
  }
  if (edit.op === 'decoration-remove') {
    const keys = ['op', 'memberIds'];
    if (Array.isArray(edit) || Object.keys(descriptors).length !== keys.length || keys.some(key => !Object.hasOwn(descriptors, key))) fail(422, 'COPY_MAP_DELTA');
    view(edit.memberIds);
    if (!Array.isArray(edit.memberIds) || edit.memberIds.some(id => typeof id !== 'string')) fail(422, 'COPY_MAP_DELTA');
    // Identity ledgers deliberately retain removed instance/group IDs.
    return removeDecorations(source, edit.memberIds);
  }
  if (edit.op === 'decoration-reorder') {
    const keys = ['op', 'memberIds', 'direction'];
    if (Array.isArray(edit) || Object.keys(descriptors).length !== keys.length || keys.some(key => !Object.hasOwn(descriptors, key))) fail(422, 'COPY_MAP_DELTA');
    view(edit.memberIds);
    if (!Array.isArray(edit.memberIds) || edit.memberIds.some(id => typeof id !== 'string') || edit.direction !== 1 && edit.direction !== -1) fail(422, 'COPY_MAP_DELTA');
    return reorderDecorations(source, edit.memberIds, edit.direction);
  }
  if (edit.op === 'decoration-translate') {
    const keys = ['op', 'memberIds', 'dx', 'dy'];
    if (Array.isArray(edit) || Object.keys(descriptors).length !== keys.length || keys.some(key => !Object.hasOwn(descriptors, key))) fail(422, 'COPY_MAP_DELTA');
    view(edit.memberIds);
    if (!Array.isArray(edit.memberIds) || edit.memberIds.some(id => typeof id !== 'string') || !Number.isSafeInteger(edit.dx) || !Number.isSafeInteger(edit.dy) || Object.is(edit.dx, -0) || Object.is(edit.dy, -0)) fail(422, 'COPY_MAP_DELTA');
    return translateDecorations(source, edit.memberIds, edit.dx, edit.dy);
  }
  if (['material-capture', 'material-rename', 'material-remove'].includes(edit.op)) {
    // Only trusted history replay supplies this identity ledger.
    // This does not enable an HTTP command.
    if (!usedMaterialIds) fail(422, 'COPY_MAP_PROFILE');
    let keys = ['op', 'materialId'];
    if (edit.op === 'material-capture') keys = [...keys, 'memberIds', 'name'];
    else if (edit.op === 'material-rename') keys.push('name');
    if (Array.isArray(edit) || Object.keys(descriptors).length !== keys.length || keys.some(key => !Object.hasOwn(descriptors, key))) fail(422, 'COPY_MAP_DELTA');
    const prefix = `${source.gameId}#material-`;
    if (typeof edit.materialId !== 'string' || !edit.materialId.startsWith(prefix) || !/^[a-f0-9]{64}$/.test(edit.materialId.slice(prefix.length))) fail(422, 'COPY_MAP_DELTA');
    let next;
    if (edit.op === 'material-capture') {
      if (usedMaterialIds.has(edit.materialId)) fail(422, 'COPY_MAP_DELTA');
      view(edit.memberIds);
      if (!Array.isArray(edit.memberIds) || edit.memberIds.some(id => typeof id !== 'string')) fail(422, 'COPY_MAP_DELTA');
      next = captureComponent(source, edit.memberIds, edit.materialId, edit.name);
    } else if (edit.op === 'material-rename') next = renameMaterial(source, edit.materialId, edit.name);
    else next = removeMaterial(source, edit.materialId);
    validateLibraryAdditions(source, next.componentDefinitions, next.map);
    if (edit.op === 'material-capture') usedMaterialIds.add(edit.materialId);
    return next;
  }
  if (edit.op === 'water-create') {
    const keys = ['op', 'groupId', 'memberIds', 'baseCells', 'name', 'showOnMinimap'];
    if (Array.isArray(edit) || Object.keys(descriptors).length !== keys.length || keys.some(key => !Object.hasOwn(descriptors, key))) fail(422, 'COPY_MAP_DELTA');
    const prefix = `${source.gameId}#water-`;
    if (typeof edit.groupId !== 'string' || !edit.groupId.startsWith(prefix) || !/^[a-f0-9]{64}$/.test(edit.groupId.slice(prefix.length)) || usedGroupIds.has(edit.groupId)) fail(422, 'COPY_MAP_DELTA');
    view(edit.memberIds); view(edit.baseCells);
    if (!Array.isArray(edit.memberIds) || !Array.isArray(edit.baseCells) || edit.memberIds.some(id => typeof id !== 'string') || edit.baseCells.some(cell => !Number.isSafeInteger(cell) || Object.is(cell, -0)) || typeof edit.showOnMinimap !== 'boolean') fail(422, 'COPY_MAP_DELTA');
    const changed = createWaterGroup(source, edit.memberIds, edit.baseCells, edit.groupId, edit.name, edit.showOnMinimap);
    const next = renameWaterGroup(changed, edit.groupId, edit.name);
    usedGroupIds.add(edit.groupId);
    return next;
  }
  if (edit.op === 'water-merge' || edit.op === 'water-split') {
    const splitting = edit.op === 'water-split';
    const keys = splitting ? ['op', 'sourceGroupId', 'groupId', 'memberIds', 'baseCells', 'name'] : ['op', 'groupIds', 'groupId', 'name', 'showOnMinimap'];
    if (Array.isArray(edit) || Object.keys(descriptors).length !== keys.length || keys.some(key => !Object.hasOwn(descriptors, key))) fail(422, 'COPY_MAP_DELTA');
    const waterPrefix = `${source.gameId}#water-`;
    if (typeof edit.groupId !== 'string' || !edit.groupId.startsWith(waterPrefix) || !/^[a-f0-9]{64}$/.test(edit.groupId.slice(waterPrefix.length)) || usedGroupIds.has(edit.groupId)) fail(422, 'COPY_MAP_DELTA');
    let changed;
    if (splitting) {
      view(edit.memberIds); view(edit.baseCells);
      if (typeof edit.sourceGroupId !== 'string' || !Array.isArray(edit.memberIds) || !Array.isArray(edit.baseCells) || edit.memberIds.some(id => typeof id !== 'string') || edit.baseCells.some(cell => !Number.isSafeInteger(cell))) fail(422, 'COPY_MAP_DELTA');
      changed = splitWaterGroup(source, edit.sourceGroupId, edit.memberIds, edit.baseCells, edit.groupId, edit.name);
    } else {
      view(edit.groupIds);
      if (!Array.isArray(edit.groupIds) || edit.groupIds.some(id => typeof id !== 'string')) fail(422, 'COPY_MAP_DELTA');
      changed = mergeWaterGroups(source, edit.groupIds, edit.groupId, edit.name, edit.showOnMinimap);
    }
    // Use the existing label writer's Unicode/control checks as well.
    const next = renameWaterGroup(changed, edit.groupId, edit.name);
    usedGroupIds.add(edit.groupId);
    return next;
  }
  let field;
  if (edit.op === 'water-visibility') field = 'showOnMinimap';
  else if (edit.op === 'water-rename') field = 'name';
  else fail(422, 'COPY_MAP_DELTA');
  if (Array.isArray(edit) || Object.keys(descriptors).length !== 3 || ['op', 'groupId', field].some(key => !Object.hasOwn(descriptors, key))) fail(422, 'COPY_MAP_DELTA');
  if (field === 'name') return renameWaterGroup(source, edit.groupId, edit.name);
  return setWaterGroupMinimapVisibility(source, edit.groupId, edit.showOnMinimap);
}
function digest(game) { const h = createHash('sha256'); for (const token of canonicalSourceTokens(game)) h.update(token, 'utf8'); return h.digest('hex'); }
// Chapter-edit allowlist (§4.5/B4a–B4c): the save pipeline applies validated
// ops before verification. Revert each applied op (reverse order) against
// baseline values on a clone; the final compare then proves nothing else
// changed. Resource fields (money/reserves) are never touched here, so the
// resource path below keeps working. Any structural surprise fails closed.
// B5 general library: compare the replayed library and every chapter person
// reference exactly, then normalize this comparison clone back to the pinned
// shape so the protected native comparison stays untouched. A chapter with no
// reference must not gain an empty `people` key.
function normalizeLibraryRoots(baseline, reverted, libraryRoots) {
  try { compare(libraryRoots.generals, value(reverted, 'generals'), new WeakMap()); }
  catch { fail(422, 'COPY_DEFINITION_DELTA'); }
  const chapters = value(reverted, 'chapters');
  for (const chapterId of Object.keys(chapters)) {
    const expected = libraryRoots.people.get(chapterId), chapter = value(chapters, chapterId);
    if (expected === undefined ? Object.hasOwn(chapter, 'people') : !Object.hasOwn(chapter, 'people')) fail(422, 'COPY_PEOPLE_DELTA');
    if (expected !== undefined) { try { compare(expected, value(chapter, 'people'), new WeakMap()); } catch { fail(422, 'COPY_PEOPLE_DELTA'); } }
    const pinned = baseline.chapters?.[chapterId];
    if (pinned && Object.hasOwn(pinned, 'people')) chapter.people = structuredClone(pinned.people);
    else delete chapter.people;
  }
  reverted.generals = structuredClone(baseline.generals);
}
// 新增章節的未編輯內容（Web 作者層）：帶 start 的 add-blank 會一併產生章節態，
// 「未經編輯的空白章」不再是空殼。期望值一律由同一個 writer 產生（含據點中立引用），
// 否則形狀稍有差異就會誤判為越權內容。舊歷史（僅 op）只差沒有章節態。
function blankChapterExpectation(baseline, chapterId, edit) {
  const shell = { gameId: baseline.gameId, sourceRef: baseline.sourceRef, cities: baseline.cities, chapters: {}, chapterOrder: [] };
  const generated = addBlankChapter(shell, edit?.start === undefined ? {} : { name: edit.name, start: edit.start });
  const expected = shell.chapters[generated];
  expected.chapterId = chapterId;
  return expected;
}
function revertAppliedChapterEdits(baseline, candidate, applied, libraryRoots = null) {
  let edits = Array.isArray(applied) ? applied : [];
  if (!edits.length) {
    // No chapter edit: only the B5 library roots need normalizing, so the
    // verified structure is cloned once before it is touched.
    if (!libraryRoots) return candidate;
    const only = structuredClone(candidate);
    normalizeLibraryRoots(baseline, only, libraryRoots);
    return only;
  }
  // Replay only the structural identity/order on a content-free projection.
  // Reversal below must not erase unauthorized ordering or generated-ID edits.
  // Reuse the authoring writers rather than invent another ID allocation rule.
  const createdNames = new Map(), copyOrigins = new Map(), lifetimes = new Map(), cancelled = new Set();
  // add-blank 產生的章節 id → 其原始命令（判斷是舊空殼還是帶章節態的新章）。
  const blankEdits = new Map();
  // Capture existing authoring writers at the instant of a copy.
  // Never derive this authority from the candidate or its provenance fields.
  const lineage = new Map(Object.entries(baseline.chapters)), copyBases = new Map(), nativeCities = new Map();
  // 每條命令的操作前快照（引用，不複製）：還原與「先驗後還原」都必須以它為基準，
  // 不能拿固定基線冒充——同一批裡先前的命令（如解散勢力）已經改變過狀態。
  const preOp = new Map();
  const structure = { gameId: baseline.gameId, chapterOrder: [...baseline.chapterOrder],
    chapters: Object.fromEntries(baseline.chapterOrder.map(chapterId => [chapterId, { chapterId }])) };
  try {
    for (const [index, edit] of edits.entries()) {
      const lifetime = lifetimes.get(edit?.chapterId);
      if (edit?.op === 'add-blank' || edit?.op === 'copy') {
        // Descendants capture an independent trusted snapshot below. A later
        // deletion or ID reuse must not turn that historical source into a
        // permanent dependency on the replacement chapter.
        if (edit.op === 'copy') {
          const source = lineage.get(edit.chapterId);
          if (!source) fail(422, 'COPY_PROTECTED_DELTA');
          const display = { chapterId: edit.chapterId };
          for (const key of ['name', 'sourceChapterId']) if (Object.hasOwn(source, key)) display[key] = source[key];
          structure.chapters[edit.chapterId] = display;
        }
        const id = edit.op === 'add-blank' ? addBlankChapter(structure) : copyChapterInGame(structure, edit.chapterId);
        createdNames.set(id, { name: structure.chapters[id].name });
        if (edit.op === 'add-blank') blankEdits.set(id, edit);
        nativeCities.delete(id);
        if (edit.op === 'copy') {
          copyOrigins.set(id, copyOrigins.get(edit.chapterId) ?? edit.chapterId);
          const source = lineage.get(edit.chapterId);
          if (!source) fail(422, 'COPY_PROTECTED_DELTA');
          const copied = { ...source, ...structure.chapters[id] };
          copyBases.set(id, copied); lineage.set(id, copied);
        } else {
          copyOrigins.delete(id); copyBases.delete(id);
          lineage.set(id, edit.start === undefined
            ? { chapterId: id, name: '新章节', state: { factions: [], generals: [], cities: [] } }
            : blankChapterExpectation(baseline, id, edit));
        }
        lifetimes.set(id, { indices: [index], blocked: false, kind: edit.op });
      } else if (edit?.op === 'delete') {
        deleteChapter(structure, edit.chapterId);
        lineage.delete(edit.chapterId);
        nativeCities.delete(edit.chapterId);
        if (lifetime && !lifetime.blocked) {
          for (const prior of lifetime.indices) cancelled.add(prior);
          cancelled.add(index);
        }
        lifetimes.delete(edit.chapterId);
      } else if (lifetime) {
        if (edit?.op === 'rename' || ['rename-general', 'city', 'city-native', 'portrait', 'set-strategist', 'set-monarch', 'remove-monarch', 'disband-faction', 'create-faction', 'start-date', 'city-faction', 'set-capital', 'general-faction', 'general-active', 'general-status', 'set-diplomat'].includes(edit?.op) && (lifetime.kind === 'copy' || BLANK_CHAPTER_WRITES.includes(edit.op))) lifetime.indices.push(index);
        else lifetime.blocked = true; // Unknown operations stay fail-closed.
      }
      if (['rename', 'rename-general', 'city', 'city-native', 'portrait', 'set-strategist', 'set-monarch', 'remove-monarch', 'disband-faction', 'create-faction', 'start-date', 'city-faction', 'set-capital', 'general-faction', 'general-active', 'general-status', 'set-diplomat'].includes(edit?.op)) {
        const chapter = lineage.get(edit.chapterId);
        if (!chapter) fail(422, 'COPY_PROTECTED_DELTA');
        preOp.set(index, chapter);
        let shell = { gameId: baseline.gameId, sourceRef: baseline.sourceRef, chapterOrder: [edit.chapterId], chapters: { [edit.chapterId]: structuredClone(chapter) } };
        if (edit.op === 'rename') renameChapter(shell, edit.chapterId, edit.name);
        else if (edit.op === 'rename-general') renameGeneral(shell, edit.chapterId, edit.generalIdx, edit.values);
        else if (edit.op === 'portrait') shell = setGeneralPortrait(shell, edit.chapterId, edit.generalIdx, edit.portraitKey);
        else if (edit.op === 'set-strategist') setStrategist(shell, edit.chapterId, edit.factionIdx, edit.generalIdx);
        else if (edit.op === 'set-monarch') setMonarch(shell, edit.chapterId, edit.factionIdx, edit.generalIdx);
        else if (edit.op === 'remove-monarch') removeMonarch(shell, edit.chapterId, edit.factionIdx, edit.resolution);
        else if (edit.op === 'disband-faction') disbandFaction(shell, edit.chapterId, edit.factionIdx);
        else if (edit.op === 'create-faction') createFaction(shell, edit.chapterId, { monarchIdx: edit.monarchIdx });
        else if (edit.op === 'start-date') setChapterStart(shell, edit.chapterId, edit.values);
        else if (edit.op === 'city-faction') setChapterCityFaction(shell, edit.chapterId, edit.cityIdx, edit.factionId);
        else if (edit.op === 'set-capital') setFactionCapital(shell, edit.chapterId, edit.factionIdx, edit.cityIdx);
        else if (edit.op === 'general-faction') setChapterGeneralFaction(shell, edit.chapterId, edit.generalIdx, edit.factionId);
        else if (edit.op === 'general-active') setGeneralActive(shell, edit.chapterId, edit.generalIdx, edit.active);
        else if (edit.op === 'general-status') setGeneralStatus(shell, edit.chapterId, edit.generalIdx, edit.status);
        else if (edit.op === 'set-diplomat') setFactionDiplomat(shell, edit.chapterId, edit.factionIdx, edit.generalIdx);
        else if (edit.op === 'city-native') {
          shell = editChapterCityNative(shell, edit.chapterId, edit.cityIdx, edit.values);
          if (!nativeCities.has(edit.chapterId)) nativeCities.set(edit.chapterId, new Set());
          nativeCities.get(edit.chapterId).add(edit.cityIdx);
        } else shell = editChapterCity(shell, edit.chapterId, edit.cityIdx, edit.values);
        lineage.set(edit.chapterId, shell.chapters[edit.chapterId]);
      }
    }
    compare(structure.chapterOrder, value(candidate, 'chapterOrder'), new WeakMap());
  } catch { fail(422, 'COPY_PROTECTED_DELTA'); }
  // A deleted creation lifetime's permitted edits disappear from reversal.
  // All writers were already replayed and descendant copy bases captured;
  // cancellation cannot hide invalid operations or alter those snapshots.
  // Exact final structure was checked using ALL operations.
  edits = edits.filter((_, index) => !cancelled.has(index));
  checkCloneDescriptors(candidate);
  const reverted = structuredClone(candidate);
  const clone = (v) => structuredClone(v);
  const revChapters = reverted.chapters, restoredCopies = new Set();
  if (!revChapters || typeof revChapters !== 'object' || Array.isArray(revChapters)) fail(422, 'COPY_PROTECTED_DELTA');
  if (libraryRoots) normalizeLibraryRoots(baseline, reverted, libraryRoots);
  const baseChapter = (id) => {
    // Chapters created inside this history have no pinned baseline entry. Their
    // trusted creation-time snapshot is the revert base (never a copy of the
    // candidate), so recorded authoring writes can be reversed exactly. `lineage`
    // is NOT that snapshot: every replayed write overwrites it with the
    // post-edit state, so a blank chapter must be rebuilt from its creation
    // command by the same writer that created it.
    const c = baseline.chapters?.[id] ?? copyBases.get(id) ??
      (blankEdits.has(id) ? blankChapterExpectation(baseline, id, blankEdits.get(id)) : lineage.get(id));
    if (!c || typeof c !== 'object' || c.chapterId !== id) fail(422, 'COPY_PROTECTED_DELTA');
    return c;
  };
  const revChapter = (id) => {
    const c = revChapters[id];
    if (!c || typeof c !== 'object' || c.chapterId !== id) fail(422, 'COPY_PROTECTED_DELTA');
    return c;
  };
  const revGeneral = (chapter, idx) => {
    const list = chapter.state?.generals;
    if (!Array.isArray(list)) fail(422, 'COPY_PROTECTED_DELTA');
    const rec = list.find(g => g?.idx === idx);
    if (!rec || typeof rec !== 'object') fail(422, 'COPY_PROTECTED_DELTA');
    return rec;
  };
  const revFaction = (chapter, idx) => {
    const list = chapter.state?.factions;
    if (!Array.isArray(list)) fail(422, 'COPY_PROTECTED_DELTA');
    const rec = list.find(f => f?.idx === idx);
    if (!rec || typeof rec !== 'object') fail(422, 'COPY_PROTECTED_DELTA');
    return rec;
  };
  // Entity field baselines follow only structurally replayed copy operations.
  // Candidate sourceChapterId is display provenance, never authorization.
  const baseGeneral = (chapterId, idx) => {
    const list = (copyBases.get(chapterId) ?? baseChapter(chapterId)).state?.generals;
    const rec = Array.isArray(list) ? list.find(g => g?.idx === idx) : null;
    if (!rec || typeof rec !== 'object') fail(422, 'COPY_PROTECTED_DELTA');
    return rec;
  };
  const revCity = (chapter, idx) => {
    const list = chapter.state?.cities;
    if (!Array.isArray(list)) fail(422, 'COPY_PROTECTED_DELTA');
    const rec = list.find(c => c?.idx === idx);
    if (!rec || typeof rec !== 'object') fail(422, 'COPY_PROTECTED_DELTA');
    return rec;
  };
  const baseCity = (chapterId, idx) => {
    const list = (copyBases.get(chapterId) ?? baseChapter(chapterId)).state?.cities;
    const rec = Array.isArray(list) ? list.find(c => c?.idx === idx) : null;
    if (!rec || typeof rec !== 'object') fail(422, 'COPY_PROTECTED_DELTA');
    return rec;
  };
  // Reconstruct with the existing writer before restoring anything: copying
  // the whole baseline raw would hide corruption in unrelated city bytes.
  const revertCityFields = (chapterId, idx, keys) => {
    const rec = revCity(revChapter(chapterId), idx), base = baseCity(chapterId, idx);
    const shell = { gameId: baseline.gameId, sourceRef: baseline.sourceRef, chapterOrder: [chapterId], chapters: { [chapterId]: { chapterId, state: { cities: [base] } } } };
    const encodedRaw = () => {
      try { return editChapterCity(shell, chapterId, idx, { troops: rec.troops, prod: rec.prod }).chapters[chapterId].state.cities[0].raw; }
      catch { fail(422, 'COPY_PROTECTED_DELTA'); }
    };
    if (rec.raw !== encodedRaw()) fail(422, 'COPY_PROTECTED_DELTA');
    for (const key of keys) rec[key] = clone(base[key]);
    // Keep the other allowed field in sync for earlier operations in history.
    rec.raw = encodedRaw();
  };
  // New native writes have a distinct history identity. Verify their complete
  // final table and named/raw fields against trusted ordered replay (including
  // later legacy writes), then normalize only the comparison clone to its
  // pinned or copy-time table. Deleted/reused lifetimes are tracked separately.
  for (const [chapterId, indices] of nativeCities) {
    const chapter = revChapter(chapterId), expected = lineage.get(chapterId);
    compare(expected.state.nativeCityRecordRaw, chapter.state.nativeCityRecordRaw, new WeakMap());
    for (const idx of indices) {
      const rec = revCity(chapter, idx), target = revCity(expected, idx);
      for (const key of ['troops', 'prod', 'raw']) compare(target[key], rec[key], new WeakMap());
    }
    const origin = copyBases.get(chapterId) ?? baseChapter(chapterId);
    chapter.state.nativeCityRecordRaw = clone(origin.state.nativeCityRecordRaw);
  }
  // Narrow field restore for one general / one faction post. `origin` is the
  // state as of just before the operation (per-op snapshot), so an earlier op in
  // the same batch cannot be mistaken for baseline content.
  const originState = (chapterId, origin) => origin ?? copyBases.get(chapterId) ?? baseChapter(chapterId);
  const revertGeneralFields = (chapterId, idx, keys, origin = null) => {
    const rec = revGeneral(revChapter(chapterId), idx);
    const source = originState(chapterId, origin);
    const base = (source.state?.generals ?? []).find(g => g?.idx === idx) ?? baseGeneral(chapterId, idx);
    for (const key of keys) {
      if (base[key] === undefined) { delete rec[key]; }
      else rec[key] = clone(base[key]);
    }
  };
  // 盲還原會把未申報的改動一併吸收（與 create-faction 的驗證口徑對齊）。
  // 一組欄位必須整體等於「操作前快照＋同一 writer」或整體等於操作前快照，
  // 否則就是第三種值：拒。已被後續回退還原的欄位屬於第二種，因此重複操作仍可回放。
  const revertGeneralWrite = (chapterId, generalIdx, keys, write, origin = null) => {
    const source = originState(chapterId, origin);
    const base = (source.state?.generals ?? []).find(g => g?.idx === generalIdx) ?? baseGeneral(chapterId, generalIdx);
    const rec = revGeneral(revChapter(chapterId), generalIdx);
    const shell = { gameId: baseline.gameId, sourceRef: baseline.sourceRef, chapterOrder: [chapterId],
      chapters: { [chapterId]: { chapterId, state: { generals: [clone(base)], factions: clone(source.state?.factions ?? []) } } } };
    try { write(shell); } catch { fail(422, 'COPY_PROTECTED_DELTA'); }
    const expected = shell.chapters[chapterId].state.generals[0];
    const matches = ref => keys.every(key => rec[key] === ref[key]);
    if (!matches(expected) && !matches(base)) fail(422, 'COPY_PROTECTED_DELTA');
    revertGeneralFields(chapterId, generalIdx, keys, origin);
  };
  // Chapter attribute edits (§7) move one named field together with its fixed
  // native slot byte, so the reversal has to restore both. Byte offsets follow
  // nativefactions.decodeSlot (faction) and the city record +01 owner byte.
  const slotByte = (raw, offset) => typeof raw === 'string' ? Number.parseInt(raw.slice(offset * 2, offset * 2 + 2), 16) : null;
  const restoreByte = (raw, offset, value) => raw.slice(0, offset * 2) + value.toString(16).padStart(2, '0') + raw.slice(offset * 2 + 2);
  const revertFactionByte = (chapterId, factionIdx, offset, origin = null) => {
    const chapter = revChapter(chapterId), faction = revFaction(chapter, factionIdx);
    const base = originState(chapterId, origin);
    const record = base.state?.factions?.find(f => f?.idx === factionIdx);
    if (!record || typeof record !== 'object') fail(422, 'COPY_PROTECTED_DELTA');
    if (typeof faction.raw === 'string' && typeof record.raw === 'string') {
      const byte = slotByte(record.raw, offset);
      if (byte === null) fail(422, 'COPY_PROTECTED_DELTA');
      faction.raw = restoreByte(faction.raw, offset, byte);
    }
    const table = chapter.state?.nativeFactionSlotRaw, baseTable = base.state?.nativeFactionSlotRaw;
    if (!Array.isArray(table) || !Array.isArray(baseTable) || table[factionIdx] === undefined) return;
    const byte = slotByte(baseTable[factionIdx], offset);
    if (byte === null || typeof table[factionIdx] !== 'string') fail(422, 'COPY_PROTECTED_DELTA');
    table[factionIdx] = restoreByte(table[factionIdx], offset, byte);
  };
  const FACTION_POST_BYTES = { monarch_idx: 1, advisor_idx: 2, capital: 3, diplomat_idx: 0x2a };
  // 同一段历史里新建的势力在原始快照中不存在：它的职务引用由 create-faction 自己写入，
  // 回放按逆序会把整条记录删掉，所以这些 op 不需要（也不能）从快照里找原值。
  // 建立時快照裡不存在的勢力＝本歷史新建的：它的記錄由 create-faction 自己的回退
  // 整條比對（含後續已申報的 set-capital），所以這裡刻意不看操作前快照。
  const baseHasFaction = (chapterId, factionIdx) => {
    const base = originState(chapterId);
    return (base.state?.factions ?? []).some(f => f?.idx === factionIdx);
  };
  // 先驗後還原（與 create-faction／武將寫入同口徑）：命令擁有的宣告欄位、該勢力
  // 記錄自身的原生位元組、以及 22 槽表的同位元組，都必須整體落在「操作前快照
  // ＋同一 writer」或整體落在操作前快照上。第三種值一律拒，否則盲還原會把未申報
  // 的改動一併吸收（宣告了但沒生效也無法區分）。
  const revertFactionWrite = (chapterId, factionIdx, keys, write, generalIdxs = [], membership = null, origin = null) => {
    const source = originState(chapterId, origin);
    const base = source.state?.factions?.find(f => f?.idx === factionIdx);
    if (!base || typeof base !== 'object') fail(422, 'COPY_PROTECTED_DELTA');
    const chapter = revChapter(chapterId), faction = revFaction(chapter, factionIdx), baseTable = source.state?.nativeFactionSlotRaw;
    const shell = { gameId: baseline.gameId, sourceRef: baseline.sourceRef, chapterOrder: [chapterId],
      chapters: { [chapterId]: { chapterId, state: { factions: [clone(base)], nativeFactionSlotRaw: clone(baseTable),
        cities: clone(source.state?.cities ?? []),
        generals: generalIdxs.map(idx => clone((source.state?.generals ?? []).find(g => g?.idx === idx) ?? baseGeneral(chapterId, idx))) } } } };
    try { write(shell); } catch { fail(422, 'COPY_PROTECTED_DELTA'); }
    const expected = shell.chapters[chapterId].state.factions[0], expectedTable = shell.chapters[chapterId].state.nativeFactionSlotRaw;
    const offsets = keys.map(key => FACTION_POST_BYTES[key]);
    const sameBytes = (left, right) => typeof left !== 'string' || typeof right !== 'string'
      ? left === right : offsets.every(offset => left.slice(offset * 2, offset * 2 + 2) === right.slice(offset * 2, offset * 2 + 2));
    const table = chapter.state?.nativeFactionSlotRaw;
    const matches = (record, tableSource) => keys.every(key => (faction[key] ?? null) === (record[key] ?? null))
      && sameBytes(faction.raw, record.raw)
      && (!Array.isArray(table) || sameBytes(table[factionIdx], tableSource?.[factionIdx]));
    if (!matches(expected, expectedTable) && !matches(base, baseTable)) fail(422, 'COPY_PROTECTED_DELTA');
    // 君主同時把該武將納入勢力，那一欄也要落在期望值或原值上。
    if (membership !== null) {
      const general = revGeneral(chapter, membership);
      const baseFaction = (source.state?.generals ?? []).find(g => g?.idx === membership)?.faction ?? null;
      const expectedFaction = shell.chapters[chapterId].state.generals[0]?.faction ?? null;
      if ((general.faction ?? null) !== expectedFaction && (general.faction ?? null) !== baseFaction) fail(422, 'COPY_PROTECTED_DELTA');
    }
    for (const key of keys) { if (base[key] === undefined) { delete faction[key]; } else { faction[key] = clone(base[key]); } }
    for (const offset of offsets) revertFactionByte(chapterId, factionIdx, offset, origin);
    if (membership !== null) revertGeneralFields(chapterId, membership, ['faction'], origin);
  };
  // 所屬勢力變更：只擁有 general.faction 一欄，但要先驗後還原——同一 writer 在
  // 操作前快照上重建期望值，並用快照的勢力宣告讓 factionValue 照常把關。
  const revertGeneralFaction = (chapterId, generalIdx, factionId, origin = null) => {
    const source = originState(chapterId, origin);
    const base = (source.state?.generals ?? []).find(g => g?.idx === generalIdx) ?? baseGeneral(chapterId, generalIdx);
    const rec = revGeneral(revChapter(chapterId), generalIdx);
    const shell = { gameId: baseline.gameId, sourceRef: baseline.sourceRef, chapterOrder: [chapterId],
      chapters: { [chapterId]: { chapterId, state: { generals: [clone(base)], factions: clone(source.state?.factions ?? []) } } } };
    try { setChapterGeneralFaction(shell, chapterId, generalIdx, factionId); } catch { fail(422, 'COPY_PROTECTED_DELTA'); }
    const expected = shell.chapters[chapterId].state.generals[0].faction ?? null, baseFaction = base.faction ?? null;
    if ((rec.faction ?? null) !== expected && (rec.faction ?? null) !== baseFaction) fail(422, 'COPY_PROTECTED_DELTA');
    revertGeneralFields(chapterId, generalIdx, ['faction'], origin);
  };
  // Restore one city's chapter affiliation and its owner byte. +1A (old owner)
  // is original content and is never touched.
  const revertCityFaction = (chapterId, idx, factionId, origin = null) => {
    const source = originState(chapterId, origin);
    const base = (source.state?.cities ?? []).find(c => c?.idx === idx) ?? baseCity(chapterId, idx);
    const chapter = revChapter(chapterId), rec = revCity(chapter, idx);
    // 先驗後還原：城記錄 +01 與兩份原生位元組必須整體落在「操作前快照＋同一
    // writer」或整體落在操作前快照上，否則拒——盲還原會吸收未申報的改屬。
    const shell = { gameId: baseline.gameId, sourceRef: baseline.sourceRef, chapterOrder: [chapterId],
      chapters: { [chapterId]: { chapterId, state: { cities: [clone(base)], factions: clone(source.state?.factions ?? []) } } } };
    try { setChapterCityFaction(shell, chapterId, idx, factionId); } catch { fail(422, 'COPY_PROTECTED_DELTA'); }
    const expected = shell.chapters[chapterId].state.cities[0];
    const table = chapter.state?.nativeCityRecordRaw, baseTable = source.state?.nativeCityRecordRaw;
    const matches = (ref, refTable) => (rec.faction ?? null) === (ref.faction ?? null)
      && (typeof rec.raw !== 'string' || typeof ref.raw !== 'string' ? rec.raw === ref.raw : rec.raw.slice(2, 4) === ref.raw.slice(2, 4))
      && (!Array.isArray(table) || typeof table[idx] !== 'string' || typeof refTable?.[idx] !== 'string' ? table?.[idx] === refTable?.[idx] : table[idx].slice(2, 4) === refTable[idx].slice(2, 4));
    if (!matches(expected, shell.chapters[chapterId].state.nativeCityRecordRaw) && !matches(base, baseTable)) fail(422, 'COPY_PROTECTED_DELTA');
    rec.faction = clone(base.faction ?? null);
    const byte = base.faction === null || base.faction === undefined ? 0x18 : base.faction;
    if (typeof base.raw === 'string' && slotByte(base.raw, 1) !== byte) fail(422, 'COPY_PROTECTED_DELTA');
    if (typeof rec.raw === 'string') rec.raw = restoreByte(rec.raw, 1, byte);
    if (Array.isArray(table) && typeof table[idx] === 'string') table[idx] = restoreByte(table[idx], 1, byte);
  };
  // Disband revert: re-add the faction record (resource fields overlaid from
  // the candidate so same-batch resource edits keep flowing) and restore
  // only this faction's cleared membership from baseline. Never overwrite
  // unrelated affiliations: that would conceal an unauthorized transfer.
  const revertDisband = (chapterId, factionIdx, origin = null) => {
    const chapter = revChapter(chapterId);
    const base = originState(chapterId, origin);
    const record = base.state?.factions?.find(f => f?.idx === factionIdx);
    if (!record || typeof record !== 'object') fail(422, 'COPY_PROTECTED_DELTA');
    if (!chapter.state.factions.some(f => f?.idx === factionIdx)) {
      // Insert before the first present follower in baseline order (baseline
      // index is wrong when history already removed earlier factions).
      const order = (base.state?.factions ?? []).map(f => f?.idx);
      const after = order.slice(order.indexOf(factionIdx) + 1);
      const at = chapter.state.factions.findIndex(f => after.includes(f?.idx));
      // Resource edits made while this faction was public survive in the
      // native slot. Reconstruct only the four permitted fields, never copy
      // arbitrary native bytes into the protected baseline record.
      let restored;
      try {
        const values = readFactionResources(chapter.state.nativeFactionSlotRaw?.[factionIdx]);
        const shell = { gameId: baseline.gameId, sourceRef: baseline.sourceRef, chapterOrder: [chapterId], chapters: { [chapterId]: { chapterId, state: { factions: [record], nativeFactionSlotRaw: base.state.nativeFactionSlotRaw } } } };
        restored = editChapterResources(shell, chapterId, factionIdx, values).chapters[chapterId].state.factions[0];
      } catch { fail(422, 'COPY_PROTECTED_DELTA'); }
      if (at < 0) chapter.state.factions.push(clone(restored));
      else chapter.state.factions.splice(at, 0, clone(restored));
      // 先驗後還原：固定槽位元組必須整組等於「操作前快照＋期間保留的四項資源值」。
      // 相等才復原（讓後續命令看到一致的記錄與位元組），否則就是未申報的改動。
      const table = chapter.state.nativeFactionSlotRaw;
      if (Array.isArray(table) && typeof table[factionIdx] === 'string' && typeof restored.raw === 'string') {
        if (table[factionIdx] !== restored.raw) fail(422, 'COPY_PROTECTED_DELTA');
        table[factionIdx] = clone(restored.raw);
      }
    }
    const baseGenerals = new Map((base.state?.generals ?? []).map(g => [g?.idx, g]));
    for (const g of chapter.state?.generals ?? []) {
      const b = baseGenerals.get(g?.idx);
      if (b?.faction === factionIdx && g.faction === null) g.faction = clone(b.faction);
    }
    const baseCities = new Map((base.state?.cities ?? []).map(c => [c?.idx, c]));
    for (const c of chapter.state?.cities ?? []) {
      const b = baseCities.get(c?.idx);
      if (b?.faction === factionIdx && c.faction === null) {
        c.faction = clone(b.faction);
        // Disband wrote the neutral owner byte; restore this faction's byte.
        if (typeof b.raw === 'string' && typeof c.raw === 'string') c.raw = restoreByte(c.raw, 1, slotByte(b.raw, 1));
        const table = chapter.state?.nativeCityRecordRaw;
        if (Array.isArray(table) && typeof table[c.idx] === 'string') table[c.idx] = restoreByte(table[c.idx], 1, slotByte(b.raw, 1));
      }
    }
  };
  // 建势力回退：移除该命令新增的势力槽，把被纳入的君主放回自由身分，并在原始快照
  // 没有固定槽表时一并删掉（否则与 pristine 空白章不再相等）。势力槽只能接在末尾，
  // 所以反序回放时每次移除「快照里没有的最大 idx」就是该命令建的那一个。
  const revertCreateFaction = (chapterId, monarchIdx) => {
    const chapter = revChapter(chapterId);
    const base = copyBases.get(chapterId) ?? baseChapter(chapterId);
    const factions = chapter.state?.factions;
    if (!Array.isArray(factions)) fail(422, 'COPY_PROTECTED_DELTA');
    const known = new Set((base.state?.factions ?? []).map(f => f?.idx));
    const created = factions.filter(f => !known.has(f?.idx));
    if (created.length !== 1) fail(422, 'COPY_PROTECTED_DELTA');
    const factionIdx = created[0].idx;
    if (created[0].monarch_idx !== monarchIdx) fail(422, 'COPY_PROTECTED_DELTA');
    // 期望值由同一个 writer 在建立时快照上重建，只叠加已申报的 set-capital；
    // 逐栏比较（含原生槽位元组）后才移除，避免未申报的改动被「整条删掉」吸收。
    const shell = { gameId: baseline.gameId, sourceRef: baseline.sourceRef, chapterOrder: [chapterId], chapters: { [chapterId]: structuredClone(base) } };
    createFaction(shell, chapterId, { monarchIdx });
    for (const edit of edits) if (edit?.op === 'set-capital' && edit.chapterId === chapterId && edit.factionIdx === factionIdx) setFactionCapital(shell, chapterId, factionIdx, edit.cityIdx);
    compare(shell.chapters[chapterId].state.factions[0], created[0], new WeakMap());
    compare(shell.chapters[chapterId].state.nativeFactionSlotRaw[factionIdx], chapter.state?.nativeFactionSlotRaw?.[factionIdx], new WeakMap());
    const generals = chapter.state?.generals ?? [];
    if (generals.some(g => g?.faction === factionIdx && g.idx !== monarchIdx)) fail(422, 'COPY_PROTECTED_DELTA');
    if ((chapter.state?.cities ?? []).some(c => c?.faction === factionIdx)) fail(422, 'COPY_PROTECTED_DELTA');
    factions.splice(factions.findIndex(f => f?.idx === factionIdx), 1);
    const baseGenerals = new Map((base.state?.generals ?? []).map(g => [g?.idx, g]));
    const monarch = generals.find(g => g?.idx === monarchIdx);
    if (monarch) monarch.faction = clone(baseGenerals.get(monarchIdx)?.faction ?? null);
    if (!Object.hasOwn(base.state ?? {}, 'nativeFactionSlotRaw')) delete chapter.state.nativeFactionSlotRaw;
    if (Object.hasOwn(base.state ?? {}, 'n_factions')) chapter.state.n_factions = base.state.n_factions;
    else if (Object.hasOwn(chapter.state ?? {}, 'n_factions')) delete chapter.state.n_factions;
  };
  for (let i = edits.length - 1; i >= 0; i--) {
    const edit = edits[i];
    if (!edit || typeof edit !== 'object') fail(422, 'COPY_PROTECTED_DELTA');
    const { op, chapterId } = edit;
    if (op !== 'add-blank' && (typeof chapterId !== 'string' || !chapterId)) fail(422, 'COPY_PROTECTED_DELTA');
    if (op === 'rename') {
      // Newly created chapters have no pinned baseline entry. Their name
      // restore is bounded by the exact structural writer history above;
      // the full blank/copy content checks below are still mandatory.
      const base = createdNames.get(chapterId) ?? baseChapter(chapterId), chapter = revChapter(chapterId);
      if (Object.hasOwn(base, 'name')) chapter.name = base.name;
      else delete chapter.name;
    } else if (op === 'rename-general') {
      const keys = Object.keys(edit.values ?? {});
      if (!keys.length || keys.some(k => k !== 'name' && k !== 'hao')) fail(422, 'COPY_PROTECTED_DELTA');
      revertGeneralFields(chapterId, edit.generalIdx, keys);
    } else if (op === 'city' || op === 'city-native') {
      const keys = Object.keys(edit.values ?? {});
      if (!keys.length || keys.some(k => k !== 'troops' && k !== 'prod')) fail(422, 'COPY_PROTECTED_DELTA');
      if (!Number.isSafeInteger(edit.cityIdx) || edit.cityIdx < 0) fail(422, 'COPY_PROTECTED_DELTA');
      revertCityFields(chapterId, edit.cityIdx, keys);
    } else if (op === 'portrait') {
      const rec = revGeneral(revChapter(chapterId), edit.generalIdx);
      const base = baseGeneral(chapterId, edit.generalIdx);
      if (base.portraitKey === undefined) { delete rec.portraitKey; }
      else rec.portraitKey = clone(base.portraitKey);
    } else if (op === 'set-monarch') {
      if (baseHasFaction(chapterId, edit.factionIdx)) revertFactionWrite(chapterId, edit.factionIdx, ['monarch_idx'],
        shell => setMonarch(shell, chapterId, edit.factionIdx, edit.generalIdx), [edit.generalIdx], edit.generalIdx, preOp.get(i));
    } else if (op === 'set-strategist') {
      if (baseHasFaction(chapterId, edit.factionIdx)) revertFactionWrite(chapterId, edit.factionIdx, ['advisor_idx'],
        shell => setStrategist(shell, chapterId, edit.factionIdx, edit.generalIdx), edit.generalIdx === null ? [] : [edit.generalIdx], null, preOp.get(i));
    } else if (op === 'set-diplomat') {
      if (baseHasFaction(chapterId, edit.factionIdx)) revertFactionWrite(chapterId, edit.factionIdx, ['diplomat_idx'],
        shell => setFactionDiplomat(shell, chapterId, edit.factionIdx, edit.generalIdx), edit.generalIdx === null ? [] : [edit.generalIdx], null, preOp.get(i));
    } else if (op === 'set-capital') {
      if (baseHasFaction(chapterId, edit.factionIdx)) revertFactionWrite(chapterId, edit.factionIdx, ['capital'],
        shell => setFactionCapital(shell, chapterId, edit.factionIdx, edit.cityIdx), [], null, preOp.get(i));
    } else if (op === 'city-faction') {
      if (!Number.isSafeInteger(edit.cityIdx) || edit.cityIdx < 0 || edit.cityIdx > 191 || !('factionId' in edit)) fail(422, 'COPY_PROTECTED_DELTA');
      revertCityFaction(chapterId, edit.cityIdx, edit.factionId, preOp.get(i));
    } else if (op === 'general-faction') {
      if (!Number.isInteger(edit.generalIdx) || edit.generalIdx < 0 || edit.generalIdx > 127 || !('factionId' in edit)) fail(422, 'COPY_PROTECTED_DELTA');
      revertGeneralFaction(chapterId, edit.generalIdx, edit.factionId, preOp.get(i));
    } else if (op === 'general-active') {
      // 登場旗標是 attr 的 bit7，作者層視圖 active 同步回退；兩者永遠成對。
      if (typeof edit.active !== 'boolean') fail(422, 'COPY_PROTECTED_DELTA');
      revertGeneralWrite(chapterId, edit.generalIdx, ['attr', 'active'], shell => setGeneralActive(shell, chapterId, edit.generalIdx, edit.active), preOp.get(i));
    } else if (op === 'general-status') {
      if (!Number.isInteger(edit.status)) fail(422, 'COPY_PROTECTED_DELTA');
      revertGeneralWrite(chapterId, edit.generalIdx, ['status'], shell => setGeneralStatus(shell, chapterId, edit.generalIdx, edit.status), preOp.get(i));
    } else if (op === 'start-date') {
      const keys = Object.keys(edit.values ?? {});
      if (!keys.length || keys.some(k => k !== 'era' && k !== 'year' && k !== 'month' && k !== 'day')) fail(422, 'COPY_PROTECTED_DELTA');
      const rec = revChapter(chapterId).state?.start, base = (copyBases.get(chapterId) ?? baseChapter(chapterId)).state?.start;
      if (!rec || typeof rec !== 'object' || !base || typeof base !== 'object') fail(422, 'COPY_PROTECTED_DELTA');
      for (const key of keys) {
        if (base[key] === undefined) delete rec[key];
        else rec[key] = clone(base[key]);
      }
    } else if (op === 'remove-monarch') {
      const resolution = edit.resolution;
      if (!resolution || typeof resolution !== 'object') fail(422, 'COPY_PROTECTED_DELTA');
      if (resolution.disband === true) { revertDisband(chapterId, edit.factionIdx, preOp.get(i)); }
      else {
        if (!Number.isInteger(resolution.successor)) fail(422, 'COPY_PROTECTED_DELTA');
        revertFactionWrite(chapterId, edit.factionIdx, ['monarch_idx'],
          shell => setMonarch(shell, chapterId, edit.factionIdx, resolution.successor), [resolution.successor], resolution.successor, preOp.get(i));
      }
    } else if (op === 'disband-faction') {
      revertDisband(chapterId, edit.factionIdx, preOp.get(i));
    } else if (op === 'create-faction') {
      if (!Number.isInteger(edit.monarchIdx) || edit.monarchIdx < 0 || edit.monarchIdx > 127) fail(422, 'COPY_PROTECTED_DELTA');
      revertCreateFaction(chapterId, edit.monarchIdx);
    } else if (op === 'delete') {
      // Restore only the comparison clone. A descendant owns its captured
      // copy-time content; deleting its source must not remove that snapshot.
      if (revChapters[chapterId] !== undefined) fail(422, 'COPY_PROTECTED_DELTA');
      const copied = copyBases.get(chapterId);
      revChapters[chapterId] = clone(copied ?? baseChapter(chapterId));
      if (copied) restoredCopies.add(chapterId);
    } else if (op !== 'add-blank' && op !== 'copy') {
      fail(422, 'COPY_PROTECTED_DELTA');
    }
  }
  reverted.chapterOrder = [...(baseline.chapterOrder ?? [])].concat((reverted.chapterOrder ?? []).filter(id => !(baseline.chapterOrder ?? []).includes(id)), [...restoredCopies]);
  // Added chapters (generated ids): each must be a pristine blank or a
  // pristine copy of its source; then remove them for the final compare.
  const baseOrder = new Set(baseline.chapterOrder ?? []);
  const added = (reverted.chapterOrder ?? []).filter(id => !baseOrder.has(id));
  const structural = edits.filter(e => e && (e.op === 'add-blank' || e.op === 'copy'));
  if (added.length !== structural.length) fail(422, 'COPY_PROTECTED_DELTA');
  let blanksRemaining = structural.filter(e => e.op === 'add-blank').length;
  for (const id of added) {
    const chapter = revChapters[id];
    let isBlank = false;
    if (blanksRemaining > 0) {
      try {
        compare(blankChapterExpectation(baseline, id, blankEdits.get(id)), chapter, new WeakMap());
        isBlank = true;
        blanksRemaining--;
      } catch { /* Not the exact authorized empty authoring structure. */ }
    }
    if (!isBlank) {
      const capturedCopy = copyBases.get(id);
      if (!capturedCopy || chapter.name !== createdNames.get(id)?.name || chapter.sourceChapterId !== capturedCopy.sourceChapterId) fail(422, 'COPY_PROTECTED_DELTA');
      // Each generated ID belongs to its own replayed copy source. Matching
      // any source in history would admit swapped sibling chapter contents.
      const origin = copyOrigins.get(id);
      const copies = typeof origin === 'string' ? [{ chapterId: origin }] : [];
      const matched = copies.some(e => {
        let base;
        try { base = copyBases.get(id) ?? baseChapter(e.chapterId); } catch { return false; }
        // Order-insensitive: snapshot roundtrip sorts keys, baseline keeps
        // loader insertion order; reuse the structural compare instead of
        // stringify so key order can never false-fail.
        const { chapterId: _a, name: _b, sourceChapterId: _c, ...rest } = chapter;
        const { chapterId: _d, name: _e, sourceChapterId: _f, ...baseRest } = base;
        // Exact copies need no resource rewrite. In particular, a captured
        // disband may leave non-dense faction IDs; preserve that authorized
        // source verbatim rather than treating it as a new resource edit.
        try { compare(baseRest, rest, new WeakMap()); return true; } catch { /* Check only the existing resource exception below. */ }
        try {
          // A copied chapter may already contain authorized resource edits.
          // Reconstruct only those bytes with the same writer as normal saves;
          // never ignore raw arrays or accept arbitrary state differences.
          const replacements = new WeakMap(), oldState = baseRest.state, state = rest.state;
          const factions = value(state, 'factions'); view(factions);
          if (!Array.isArray(factions) || factions.length !== oldState.factions.length) return false;
          let shell = { gameId: baseline.gameId, sourceRef: baseline.sourceRef, chapterOrder: [e.chapterId], chapters: { [e.chapterId]: { chapterId: e.chapterId, state: { factions: oldState.factions, nativeFactionSlotRaw: oldState.nativeFactionSlotRaw } } } };
          for (let slot = 0; slot < oldState.factions.length; slot++) {
            const row = value(factions, String(slot));
            const requested = Object.fromEntries(resourceNames.map(name => [name, value(row, name)]));
            shell = editChapterResources(shell, e.chapterId, oldState.factions[slot].idx, requested);
          }
          // A resource edit may precede removal of its public faction. The
          // copy still carries that original native slot. Reconstruct only
          // the same four resource fields, using a trusted original record
          // solely for comparison; never add it back to the actual draft.
          let native = shell.chapters[e.chapterId].state.nativeFactionSlotRaw;
          const retained = new Set(oldState.factions.map(row => row.idx));
          for (const original of baseChapter(e.chapterId).state.factions) {
            if (retained.has(original.idx)) continue;
            const requested = readFactionResources(state.nativeFactionSlotRaw?.[original.idx]);
            const removedShell = { gameId: baseline.gameId, sourceRef: baseline.sourceRef, chapterOrder: [e.chapterId], chapters: { [e.chapterId]: { chapterId: e.chapterId, state: { factions: [original], nativeFactionSlotRaw: native } } } };
            native = editChapterResources(removedShell, e.chapterId, original.idx, requested).chapters[e.chapterId].state.nativeFactionSlotRaw;
          }
          replacements.set(oldState.factions, shell.chapters[e.chapterId].state.factions);
          replacements.set(oldState.nativeFactionSlotRaw, native);
          compare(baseRest, rest, replacements); return true;
        } catch { return false; }
      });
      if (!matched) fail(422, 'COPY_PROTECTED_DELTA');
    }
    delete revChapters[id];
    reverted.chapterOrder = reverted.chapterOrder.filter(entry => entry !== id);
  }
  if (blanksRemaining !== 0) fail(422, 'COPY_PROTECTED_DELTA');
  return reverted;
}
function freezeGraph(root) {
  const pending = [root], seen = new WeakSet();
  while (pending.length) { const node = pending.pop(); if (!node || typeof node !== 'object' || seen.has(node)) continue; seen.add(node); for (const d of Object.values(view(node))) if (d.value && typeof d.value === 'object') pending.push(d.value); Object.freeze(node); }
  return root;
}
function compare(expected, candidate, replacements) {
  const stack = [[expected, candidate, 0]];
  while (stack.length) {
    let [a, b, depth] = stack.pop(); if (a && typeof a === 'object' && replacements.has(a)) a = replacements.get(a);
    if (Object.is(a, b)) continue;
    if (depth > 64 || !a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) fail(422, 'COPY_PROTECTED_DELTA');
    const ad = view(a), bd = view(b), ak = Object.keys(ad).sort(), bk = Object.keys(bd).sort();
    if (ak.length !== bk.length || ak.some((key, i) => key !== bk[i])) fail(422, 'COPY_PROTECTED_DELTA');
    for (const key of ak) stack.push([ad[key].value, bd[key].value, depth + 1]);
  }
}
// A neutral chapter copy captures its people at that instant. Flattening
// chapter/definition/people histories separately loses this ordering and can
// erase an intermediate reference. Only trusted stored request steps enter here.
function replayTemplateHistory(baseline, steps) {
  checkCloneDescriptors(steps);
  if (!Array.isArray(steps)) fail(422, 'COPY_TEMPLATE_HISTORY');
  const exact = (record, keys) => {
    const descriptors = view(record);
    if (Array.isArray(record) || Object.keys(descriptors).length !== keys.length || keys.some(key => !Object.hasOwn(descriptors, key))) fail(422, 'COPY_TEMPLATE_HISTORY');
  };
  let expected = structuredClone(baseline);
  const usedIds = new Set(Object.keys(baseline.generals));
  const usedGroupIds = new Set(baseline.map.waterGroups.map(group => group.id));
  const usedMaterialIds = new Set(Object.keys(baseline.componentDefinitions));
  const usedInstanceIds = capturedInstanceIds(baseline);
  try {
    for (const step of steps) {
      const descriptors = view(step), keys = ['chapterEdits', 'generalEdits', 'peopleEdits'];
      for (const key of ['mapEdits', 'cityEdits', 'chapterCityEdits']) if (Object.hasOwn(descriptors, key)) keys.push(key);
      exact(step, keys);
      const mapEdits = Object.hasOwn(descriptors, 'mapEdits') ? step.mapEdits : [];
      const cityEdits = Object.hasOwn(descriptors, 'cityEdits') ? step.cityEdits : [];
      const chapterCityEdits = Object.hasOwn(descriptors, 'chapterCityEdits') ? step.chapterCityEdits : [];
      for (const edits of [step.chapterEdits, step.generalEdits, step.peopleEdits, mapEdits, cityEdits, chapterCityEdits]) {
        if (!Array.isArray(edits) || edits.length > 16) fail(422, 'COPY_TEMPLATE_HISTORY');
      }
      // Ordered steps: chapters, definitions, people, map, city names, then chapter cities.
      // A trusted history field does not by itself enable an HTTP command.
      for (const edit of step.chapterEdits) {
        view(edit); // Reject non-records before reading op (including functions).
        if (edit.op === 'add-blank') {
          const editKeys = Object.keys(view(edit)).sort().join(',');
          if (editKeys !== 'op' && editKeys !== 'name,op,start') fail(422, 'COPY_TEMPLATE_HISTORY');
          addBlankChapter(expected, { name: edit.name, start: edit.start });
        }
        else if (edit.op === 'copy' || edit.op === 'delete') {
          exact(edit, ['op', 'chapterId']);
          if (edit.op === 'copy') copyChapterInGame(expected, edit.chapterId);
          else deleteChapter(expected, edit.chapterId);
        } else if (edit.op === 'rename') {
          exact(edit, ['op', 'chapterId', 'name']); renameChapter(expected, edit.chapterId, edit.name);
        } else if (edit.op === 'create-faction') {
          // 势力（君主＋首都）是 2026-11 用户批准的章節屬性范围；其余原生位元组仍 closed。
          exact(edit, ['op', 'chapterId', 'monarchIdx']); createFaction(expected, edit.chapterId, { monarchIdx: edit.monarchIdx });
        } else if (edit.op === 'set-monarch') {
          exact(edit, ['op', 'chapterId', 'factionIdx', 'generalIdx']); setMonarch(expected, edit.chapterId, edit.factionIdx, edit.generalIdx);
        } else if (edit.op === 'set-capital') {
          exact(edit, ['op', 'chapterId', 'factionIdx', 'cityIdx']); setFactionCapital(expected, edit.chapterId, edit.factionIdx, edit.cityIdx);
        } else if (edit.op === 'general-active') {
          // 登场旗標＝attr bit7，与身份同为已批准的章節属性；其余原生位元组仍 closed。
          exact(edit, ['op', 'chapterId', 'generalIdx', 'active']); setGeneralActive(expected, edit.chapterId, edit.generalIdx, edit.active);
        } else if (edit.op === 'general-status') {
          exact(edit, ['op', 'chapterId', 'generalIdx', 'status']); setGeneralStatus(expected, edit.chapterId, edit.generalIdx, edit.status);
        } else fail(422, 'COPY_TEMPLATE_HISTORY'); // Native fields remain closed.
      }
      for (const edit of step.generalEdits) {
        view(edit);
        if (edit.op === 'create' && usedIds.has(edit.generalId)) fail(422, 'COPY_TEMPLATE_HISTORY');
        expected = applyGeneralDefinitionEdit(expected, edit);
        if (edit.op === 'create') usedIds.add(edit.generalId);
      }
      for (const edit of step.peopleEdits) expected = applyChapterPersonEdit(expected, edit);
      for (const edit of mapEdits) expected = applyCapturedMapEdit(expected, edit, usedGroupIds, usedMaterialIds, usedInstanceIds);
      for (const edit of cityEdits) {
        exact(edit, ['op', 'cityId', 'name']);
        if (edit.op !== 'rename') fail(422, 'COPY_TEMPLATE_HISTORY');
        expected = setCityDefinitionName(expected, edit.cityId, edit.name);
      }
      for (const edit of chapterCityEdits) expected = applyChapterCityEdit(expected, edit);
    }
  } catch { fail(422, 'COPY_TEMPLATE_HISTORY'); }
  return expected;
}
export class FixedCopyProfile {
  #load; #profileRevision; #captures = new WeakMap();
  constructor({ loadCopy, profileRevision = FIXED_COPY_PROFILE }) {
    if (typeof loadCopy !== 'function' || ![FIXED_COPY_PROFILE, FIXED_TEMPLATE_PROFILE].includes(profileRevision)) throw new TypeError('service-owned pinned copy loader and profile required');
    this.#load = loadCopy; this.#profileRevision = profileRevision;
  }
  async capture(context) {
    // Constructor port is trusted code, not an HTTP descriptor/APPROVED marker.
    const loaded = await this.#load(context), baseline = loaded.game;
    if (this.#profileRevision === FIXED_TEMPLATE_PROFILE && baseline.sourceRef?.kind !== 'builtin-template') fail(422, 'COPY_TEMPLATE_BASELINE');
    if (this.#profileRevision === FIXED_COPY_PROFILE && baseline.sourceRef?.kind !== 'builtin-copy') fail(422, 'COPY_PROFILE_BASELINE');
    const baselineDigest = digest(baseline); freezeGraph(baseline);
    const capability = Object.freeze({});
    const provenance = freezeGraph(structuredClone(loaded.provenance));
    this.#captures.set(capability, { baseline, baselineDigest, provenance });
    return Object.freeze({ capability, game: baseline, baselineDigest, provenance });
  }
  // Separate from the legacy full-copy reversal path. This is a content-only
  // port, not permission to accept additional commands at an HTTP boundary.
  verifyOrderedTemplate(capability, candidate, steps) {
    const captured = this.#captures.get(capability); if (!captured) fail(403, 'COPY_CAPTURE_REQUIRED');
    if (this.#profileRevision !== FIXED_TEMPLATE_PROFILE) fail(422, 'COPY_TEMPLATE_HISTORY_PROFILE');
    const { baseline, baselineDigest, provenance } = captured;
    const expected = replayTemplateHistory(baseline, steps);
    checkCloneDescriptors(candidate);
    const metadata = value(candidate, 'metadata'); view(metadata);
    let normalized; try { normalized = normalizeGameMetadata(metadata); } catch { fail(422, 'COPY_METADATA'); }
    if (metadata.name !== normalized.name || metadata.introduction !== normalized.introduction) fail(422, 'COPY_METADATA');
    const replacements = new WeakMap([[expected.metadata, normalized]]);
    compare(expected, candidate, replacements);
    const sourceDigest = digest(candidate);
    return Object.freeze({ profileRevision: this.#profileRevision, baselineDigest, sourceDigest, provenance, changes: Object.freeze([]), limits: 'Captured neutral authoring history only; no native initialization, runtime, principal or persistent grant.' });
  }
  verify(capability, candidate, appliedEdits = [], definitionEdits = [], mapEdits = [], peopleEdits = []) {
    const captured = this.#captures.get(capability); if (!captured) fail(403, 'COPY_CAPTURE_REQUIRED');
    const { baseline, baselineDigest, provenance } = captured, replacements = new WeakMap(), changes = [];
    // These operations commute with legacy chapter/resource writers: none
    // changes water groups, decorations, component definitions or base fields.
    // Replay against the pinned baseline; replace only these verified
    // roots, then compare the entire source including all untouched fields.
    if (!Array.isArray(mapEdits)) fail(422, 'COPY_MAP_DELTA');
    checkCloneDescriptors(mapEdits);
    if (mapEdits.length) {
      if (this.#profileRevision !== FIXED_COPY_PROFILE) fail(422, 'COPY_MAP_PROFILE');
      let expected = baseline;
      const usedGroupIds = new Set(baseline.map.waterGroups.map(group => group.id));
      const usedMaterialIds = new Set(Object.keys(baseline.componentDefinitions));
      const usedInstanceIds = capturedInstanceIds(baseline);
      try {
        for (const edit of mapEdits) expected = applyCapturedMapEdit(expected, edit, usedGroupIds, usedMaterialIds, usedInstanceIds);
      } catch { fail(422, 'COPY_MAP_DELTA'); }
      replacements.set(baseline.map.waterGroups, expected.map.waterGroups);
      replacements.set(baseline.map.decorations, expected.map.decorations);
      replacements.set(baseline.map.base.unknownUnderlays, expected.map.base.unknownUnderlays);
      replacements.set(baseline.map.base.terrainRef, expected.map.base.terrainRef);
      replacements.set(baseline.map.base.geography, expected.map.base.geography);
      replacements.set(baseline.componentDefinitions, expected.componentDefinitions);
    }
    if (!Array.isArray(definitionEdits)) fail(422, 'COPY_DEFINITION_DELTA');
    checkCloneDescriptors(definitionEdits);
    if (!Array.isArray(peopleEdits)) fail(422, 'COPY_PEOPLE_DELTA');
    checkCloneDescriptors(peopleEdits);
    // B5 general library: the game-level definition library and its chapter
    // person references are the authoring layer's own roots. They are replayed
    // from the pinned baseline and compared exactly; the native 128-slot records
    // below stay protected. A baseline without a game-owned library (legacy
    // slot dictionary) is rejected by the shared writer, never reinterpreted.
    let library = null;
    if (definitionEdits.length || peopleEdits.length) {
      let expected = structuredClone(baseline);
      const usedIds = new Set(Object.keys(baseline.generals ?? {}));
      try {
        for (const edit of definitionEdits) {
          // A deleted person's identity cannot be assigned to a new person.
          if (edit.op === 'create' && usedIds.has(edit.generalId)) throw new RangeError('general identity already used');
          expected = applyGeneralDefinitionEdit(expected, edit);
          if (edit.op === 'create') usedIds.add(edit.generalId);
        }
        for (const edit of peopleEdits) expected = applyChapterPersonEdit(expected, edit);
      } catch { fail(422, definitionEdits.length ? 'COPY_DEFINITION_DELTA' : 'COPY_PEOPLE_DELTA'); }
      library = { generals: expected.generals, people: new Map(Object.entries(expected.chapters).map(([chapterId, chapter]) => [chapterId, chapter.people])) };
    }
    // No getters execute: validate descriptors before reading any candidate field.
    const metadata = value(candidate, 'metadata'); view(metadata);
    let normalized; try { normalized = normalizeGameMetadata(metadata); } catch { fail(422, 'COPY_METADATA'); }
    if (metadata.name !== normalized.name || metadata.introduction !== normalized.introduction) fail(422, 'COPY_METADATA');
    replacements.set(baseline.metadata, normalized);
    const chapters = value(candidate, 'chapters'); view(chapters);
    const reverted = revertAppliedChapterEdits(baseline, candidate, appliedEdits, library);
    const revertedChapters = value(reverted, 'chapters'); view(revertedChapters);
    for (const chapterId of baseline.chapterOrder) {
      const oldState = baseline.chapters[chapterId].state, state = value(value(revertedChapters, chapterId), 'state');
      const factions = value(state, 'factions'); view(factions);
      if (!Array.isArray(factions) || factions.length !== oldState.factions.length) fail(422, 'COPY_PROTECTED_DELTA');
      let shell = { gameId: baseline.gameId, sourceRef: baseline.sourceRef, chapterOrder: [chapterId], chapters: { [chapterId]: { chapterId, state: { factions: oldState.factions, nativeFactionSlotRaw: oldState.nativeFactionSlotRaw } } } };
      for (let slot = 0; slot < oldState.factions.length; slot++) {
        const row = value(factions, String(slot)), requested = Object.fromEntries(resourceNames.map(name => [name, value(row, name)]));
        try { shell = editChapterResources(shell, chapterId, oldState.factions[slot].idx, requested); } catch { fail(422, 'COPY_RESOURCE_DELTA'); }
        const names = resourceNames.filter(name => requested[name] !== oldState.factions[slot][name]);
        if (names.length) changes.push(Object.freeze({ chapterId, slot: oldState.factions[slot].idx, fields: Object.freeze(names) }));
      }
      replacements.set(oldState.factions, shell.chapters[chapterId].state.factions);
      // An authoring-only blank has no native records. Do not invent them or
      // put undefined into a WeakMap; the final shape comparison stays exact.
      if (oldState.nativeFactionSlotRaw !== undefined) replacements.set(oldState.nativeFactionSlotRaw, shell.chapters[chapterId].state.nativeFactionSlotRaw);
    }
    compare(baseline, reverted, replacements);
    const sourceDigest = digest(candidate); // Strict canonical JSON after protected delta checks.
    return Object.freeze({ profileRevision: this.#profileRevision, baselineDigest, sourceDigest, provenance, changes: Object.freeze(changes), limits: this.#profileRevision === FIXED_TEMPLATE_PROFILE ? 'Captured neutral template and recorded unassigned general definitions only; no native initialization, runtime, principal or persistent grant.' : 'Content-only captured full-copy profile; signed24/u16 representation not playable-input admission. Only recorded water-group names, visibility and explicit-member merges; no other map/newchapter/role/image/runtime permission, principal or persistent grant.' });
  }
}
