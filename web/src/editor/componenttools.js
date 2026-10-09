// Web author operations in the existing byte-stamp profile, not DOS formulas.
// Copy-on-write transactions: failures leave caller state/selection untouched.
import { composeMapLayers, BYTE_STAMP_RECIPE, WATER_CLASSES } from "../content/authoring/maplayers.js";
const fail = (message) => { throw new RangeError(message); };
const text = (value) => {
  if (typeof value !== "string" || !value.trim() || [...value].length > 64 || /[\u0000-\u001f\u007f]/u.test(value)) fail("名稱須為1至64字且無控制字元");
  return value.trim();
};
function transaction(source, change) {
  const next = { ...source, componentDefinitions: { ...source.componentDefinitions }, map: { ...source.map,
    decorations: source.map.decorations.slice(), waterGroups: structuredClone(source.map.waterGroups ?? []),
    base: { ...source.map.base, terrainRef: source.map.base.terrainRef.slice(), geography: source.map.base.geography.slice(),
      unknownUnderlays: { ...source.map.base.unknownUnderlays } } } };
  change(next);
  composeMapLayers(next, { draft: true });
  return next;
}
export function componentCells(source, instance) {
  const def = source.componentDefinitions[instance?.definitionRef];
  if (!def) fail("組件定義不存在");
  return def.footprint.map(([dx, dy]) => [instance.x + dx - def.anchor[0], instance.y + dy - def.anchor[1]]);
}
export function hitDecoration(source, x, y) {
  return source.map.decorations.findLastIndex((d) => componentCells(source, d).some(([cx, cy]) => cx === x && cy === y));
}
// Display-only snapshot. Rebuild after author changes; preserve last matching footprint,
// not bounding boxes, geography, visibility or rule terrain. Maps never escape.
export function createDecorationPicker(source) {
  const rows = new Map();
  for (const [index, instance] of source.map.decorations.entries()) {
    for (const [x, y] of componentCells(source, instance)) {
      if (Number.isNaN(x) || Number.isNaN(y)) continue; // === never matches NaN.
      let row = rows.get(y);
      if (!row) { row = new Map(); rows.set(y, row); }
      row.set(x, index);
    }
  }
  return Object.freeze({ pick(x, y) { return rows.get(y)?.get(x) ?? -1; } });
}
// Rectangle selection includes every intersecting instance, even below another one.
// Keep array order and real footprint holes; do not use the top-only point picker.
export function decorationIdsInRect(source, left, right, top, bottom) {
  const ids = [];
  for (const instance of source.map.decorations) {
    const def = source.componentDefinitions[instance?.definitionRef];
    if (!def) fail("組件定義不存在");
    if (def.footprint.some(([dx, dy]) => {
      const x = instance.x + dx - def.anchor[0], y = instance.y + dy - def.anchor[1];
      return x >= left && x <= right && y >= top && y <= bottom;
    })) ids.push(instance.id);
  }
  return ids;
}
function unique(values) { if (!Array.isArray(values) || new Set(values).size !== values.length) fail("選取包含重複項目"); return values; }
function groupParts(source, memberIds, baseCells) {
  unique(memberIds); unique(baseCells);
  if (!memberIds.length && !baseCells.length) fail("請先選取水域組件或基礎水格");
  const instances = new Map([...source.map.decorations, ...source.map.roads.flatMap((r) => r.components ?? [])].map((d) => [d.id, d]));
  for (const id of memberIds) if (!Object.hasOwn(WATER_CLASSES, instances.get(id)?.waterClass)) fail("只能組合明確標注的水域組件");
  for (const cell of baseCells) if (!Number.isInteger(cell) || cell < 0 || cell >= 384 * 256 || !source.map.base.geography[cell]) fail("只能選取已有明確水域的基礎格");
}
function newGroup(source, id, name, memberIds, baseCells, visible) {
  if (typeof id !== "string" || !id || source.map.waterGroups.some((g) => g.id === id)) fail("新組合身份重複或缺失");
  if (typeof visible !== "boolean") fail("請明確選擇新組合的小地圖顯示狀態");
  return { id, name: text(name), memberIds: [...memberIds], baseCells: [...baseCells], showOnMinimap: visible,
    groupingProvenance: "explicit author group edit, not original object reconstruction" };
}
export function createWaterGroup(source, memberIds, baseCells, id, name, visible = true) {
  groupParts(source, memberIds, baseCells);
  return transaction(source, (next) => {
    const group = newGroup(next, id, name, memberIds, baseCells, visible), ids = new Set(memberIds), cells = new Set(baseCells);
    next.map.waterGroups = next.map.waterGroups.map((g) => ({ ...g, memberIds: g.memberIds.filter((v) => !ids.has(v)), baseCells: g.baseCells.filter((v) => !cells.has(v)) }))
      .filter((g) => g.memberIds.length || g.baseCells.length);
    next.map.waterGroups.push(group);
  });
}
export function splitWaterGroup(source, groupId, memberIds, baseCells, id, name) {
  const old = source.map.waterGroups.find((g) => g.id === groupId);
  if (!old || memberIds.some((v) => !old.memberIds.includes(v)) || baseCells.some((v) => !old.baseCells.includes(v))) fail("拆分選取不屬於目前組合");
  if (memberIds.length + baseCells.length >= old.memberIds.length + old.baseCells.length) fail("拆分後須保留至少一個原組合成員");
  return createWaterGroup(source, memberIds, baseCells, id, name, old.showOnMinimap);
}
export function mergeWaterGroups(source, groupIds, id, name, visible) {
  if (typeof visible !== "boolean") fail("請明確選擇合併組合的小地圖顯示狀態");
  unique(groupIds); if (groupIds.length < 2) fail("合併至少需要兩個組合");
  const groups = groupIds.map((gid) => source.map.waterGroups.find((g) => g.id === gid));
  if (groups.some((g) => !g)) fail("合併引用不存在的組合");
  return createWaterGroup(source, groups.flatMap((g) => g.memberIds), groups.flatMap((g) => g.baseCells), id, name, visible);
}
export function captureComponent(source, memberIds, id, name) {
  unique(memberIds); if (!memberIds.length) fail("請先選取裝飾組件");
  if (!id || Object.hasOwn(source.componentDefinitions, id)) fail("新素材身份重複或缺失");
  const selected = new Set(memberIds), instances = source.map.decorations.filter((d) => selected.has(d.id));
  if (instances.length !== memberIds.length) fail("素材擷取只接受裝飾層的完整實例");
  const cells = new Map(), water = new Set(), classes = new Set();
  for (const instance of instances) {
    const def = source.componentDefinitions[instance.definitionRef];
    if (def.ruleRecipeRef !== BYTE_STAMP_RECIPE) fail("未支持的素材規則綁定");
    const mask = new Set((def.geographyMask ?? def.footprint).map((p) => p.join(",")));
    for (const [dx, dy, tile] of def.variants[instance.variantRef ?? "original"].tiles) {
      const x = instance.x + dx - def.anchor[0], y = instance.y + dy - def.anchor[1], key = `${x},${y}`;
      cells.set(key, [x, y, tile]);
      if (instance.waterClass && mask.has(`${dx},${dy}`)) { water.add(key); classes.add(instance.waterClass); }
    }
  }
  if (cells.size > 256) fail("本地素材擷取最多256格；不支援整圖包裝為素材");
  if (classes.size > 1) fail("單一素材只接受一種明確水域類別，請分開擷取");
  const all = [...cells.values()], x0 = Math.min(...all.map((p) => p[0])), y0 = Math.min(...all.map((p) => p[1]));
  const tiles = all.map(([x, y, tile]) => [x - x0, y - y0, tile]);
  const def = { id, name: text(name), revision: "author-byte-stamp-1", category: "author-multicell", anchor: [0, 0],
    footprint: tiles.map(([x, y]) => [x, y]), visualRef: "MMAP.MDL:indexed-footprint", ruleRecipeRef: BYTE_STAMP_RECIPE,
    variants: { original: { tiles } },
    captureProvenance: { memberIds: [...memberIds], sourceRevision: source.localModel?.draftRevision ?? "unsaved" } };
  if (classes.size) {
    def.authorWaterClass = [...classes][0];
    def.geographyMask = [...water].map((key) => { const [x, y] = key.split(",").map(Number); return [x - x0, y - y0]; });
  }
  return transaction(source, (next) => { next.componentDefinitions[id] = def; });
}
export function placeComponent(source, definitionRef, x, y, id, waterClass, variantRef = "original") {
  const def = source.componentDefinitions[definitionRef]; if (!def) fail("素材不存在");
  if (!Number.isInteger(x) || !Number.isInteger(y)) fail("落點須為整數圖格");
  if (source.map.decorations.some((d) => d.id === id)) fail("組件身份重複");
  return transaction(source, (next) => {
    const instance = { id, definitionRef, variantRef, x, y };
    if (waterClass) { if (!Object.hasOwn(WATER_CLASSES, waterClass)) fail("無效水域類別"); instance.waterClass = waterClass; }
    // Check the full footprint before writing, never clip at map borders.
    for (const [cx, cy] of componentCells(next, instance)) if (cx < 0 || cx >= 384 || cy < 0 || cy >= 256) fail("素材占用範圍超出固定地圖；未提交");
    next.map.decorations.push(instance);
    if (waterClass) next.map.waterGroups.push(newGroup(next, "group-" + id, def.name ?? "新水域組合", [id], [], true));
  });
}
// Only decorations: never move cities, road stamps, topology or hidden base.
export function translateDecorations(source, ids, dx, dy) {
  unique(ids);
  if (!ids.length || !Number.isInteger(dx) || !Number.isInteger(dy) || dx === 0 && dy === 0) fail("請選取完整裝飾並輸入非零整數圖格位移");
  const selected = new Set(ids), instances = source.map.decorations.filter((d) => selected.has(d.id));
  if (instances.length !== ids.length) fail("批量平移引用不存在的裝飾");
  for (const d of instances) for (const [x, y] of componentCells(source, d))
    if (x + dx < 0 || x + dx >= 384 || y + dy < 0 || y + dy >= 256) fail("整批占用範圍超界；全部未提交");
  return transaction(source, (next) => { next.map.decorations = next.map.decorations.map((d) => selected.has(d.id) ? { ...d, x: d.x + dx, y: d.y + dy } : d); });
}
// Q61 author order only: one adjacent unselected neighbour per selected block.
export function reorderDecorations(source, ids, direction) {
  unique(ids);
  if (!ids.length || direction !== 1 && direction !== -1) fail("請選取完整裝飾並指定上移或下移");
  const selected = new Set(ids), decorations = source.map.decorations;
  if (decorations.filter((d) => selected.has(d.id)).length !== ids.length) fail("調序引用不存在的裝飾");
  composeMapLayers(source, { draft: true });
  const order = decorations.slice();
  const start = direction === 1 ? order.length - 2 : 1, end = direction === 1 ? -1 : order.length;
  let moved = false;
  for (let i = start; i !== end; i -= direction) {
    const j = i + direction;
    if (selected.has(order[i].id) && !selected.has(order[j].id)) {
      [order[i], order[j]] = [order[j], order[i]]; moved = true;
    }
  }
  if (!moved) return source;
  return transaction(source, (next) => { next.map.decorations = order; });
}
export function splitDecoration(source, instanceId, childIds) {
  unique(childIds);
  const index = source.map.decorations.findIndex((d) => d.id === instanceId), instance = source.map.decorations[index];
  if (!instance) fail("只能拆分存在的裝飾實例");
  const def = source.componentDefinitions[instance.definitionRef];
  if (def.ruleRecipeRef !== BYTE_STAMP_RECIPE || def.visualRef !== "MMAP.MDL:indexed-footprint") fail("只可拆分已支持的明確多格原圖塊配方");
  composeMapLayers(source, { draft: true });
  const tiles = def.variants[instance.variantRef ?? "original"].tiles;
  if (tiles.length < 2 || tiles.length > 256 || childIds.length !== tiles.length) fail("請選取2至256格的完整裝飾；子實例身份須覆蓋全部格");
  const existing = new Set([...source.map.decorations, ...source.map.roads.flatMap((r) => r.components ?? []), ...source.map.placements].map((d) => d.id));
  if (childIds.some((id) => typeof id !== "string" || !id || existing.has(id))) fail("子實例身份缺失或已被使用");
  const mask = new Set((def.geographyMask ?? def.footprint).map((p) => p.join(",")));
  const atoms = new Map();
  for (const [id, entry] of Object.entries(source.componentDefinitions)) {
    if (entry.ruleRecipeRef === BYTE_STAMP_RECIPE && JSON.stringify(entry.footprint) === "[[0,0]]" && JSON.stringify(entry.anchor) === "[0,0]" &&
        (entry.geographyMask === undefined || JSON.stringify(entry.geographyMask) === "[[0,0]]")) {
      const tuple = entry.variants?.original?.tiles;
      if (tuple?.length === 1 && tuple[0][0] === 0 && tuple[0][1] === 0) atoms.set(tuple[0][2], id);
    }
  }
  const children = tiles.map(([dx, dy, tile], i) => {
    const definitionRef = atoms.get(tile); if (!definitionRef) fail("缺少受信單格原圖塊；不猜建配方");
    const child = { ...instance, id: childIds[i], definitionRef, variantRef: "original",
      x: instance.x + dx - def.anchor[0], y: instance.y + dy - def.anchor[1],
      splitProvenance: { instanceId, definitionRef: instance.definitionRef, variantRef: instance.variantRef ?? "original", localCell: [dx, dy] } };
    if (!mask.has(`${dx},${dy}`)) delete child.waterClass;
    return child;
  });
  return transaction(source, (next) => {
    next.map.decorations.splice(index, 1, ...children);
    next.map.waterGroups = next.map.waterGroups.map((g) => ({ ...g, memberIds: g.memberIds.flatMap((id) => id === instanceId ? children.filter((d) => d.waterClass).map((d) => d.id) : [id]) }))
      .filter((g) => g.memberIds.length || g.baseCells.length);
    for (const child of children) {
      const at = child.y * 384 + child.x, record = next.map.base.unknownUnderlays[at];
      if (record?.coveringInstanceId === instanceId) next.map.base.unknownUnderlays[at] = { ...record,
        priorCoveringInstanceId: record.priorCoveringInstanceId ?? instanceId, coveringInstanceId: child.id };
    }
  });
}
export function materialReferences(source, id, map = source.map) {
  return [...map.decorations.filter((d) => d.definitionRef === id).map((d) => `裝飾:${d.id}`),
    ...map.roads.flatMap((r) => (r.components ?? []).filter((d) => d.definitionRef === id).map((d) => `道路:${r.id}/${d.id}`)),
    ...map.placements.filter((p) => p.componentRef === id).map((p) => `據點:${p.id}`)];
}
function authorMaterial(def) { return def?.category === "author-multicell" && def.revision === "author-byte-stamp-1"; }
export function renameMaterial(source, id, name) {
  if (!authorMaterial(source.componentDefinitions[id])) fail("原圖塊配方唯讀；只能更名作者素材");
  return transaction(source, (next) => { next.componentDefinitions[id] = { ...next.componentDefinitions[id], name: text(name) }; });
}
export function removeMaterial(source, id) {
  if (!authorMaterial(source.componentDefinitions[id])) fail("原圖塊配方唯讀；只能移除作者素材");
  const refs = materialReferences(source, id); if (refs.length) fail("素材仍被引用：" + refs.join("、"));
  return transaction(source, (next) => { delete next.componentDefinitions[id]; });
}
export function fillBase(source, cells, tile, geography) {
  unique(cells); if (!cells.length) fail("請先選取基礎格或待補底組件");
  if (!Number.isInteger(tile) || tile < 0 || tile > 255 || !Number.isInteger(geography) || geography < 0 || geography > 3) fail("替換圖塊／地理值不在明確支持域");
  for (const cell of cells) if (!Number.isInteger(cell) || cell < 0 || cell >= 384 * 256) fail("補底格超出固定地圖");
  return transaction(source, (next) => {
    const targets = new Set(cells);
    next.map.waterGroups = next.map.waterGroups.map((g) => ({ ...g, baseCells: g.baseCells.filter((v) => !targets.has(v)) })).filter((g) => g.memberIds.length || g.baseCells.length);
    for (const cell of cells) { next.map.base.terrainRef[cell] = tile; next.map.base.geography[cell] = geography; delete next.map.base.unknownUnderlays[cell]; }
  });
}
// Structural gate: immutable recipes; author names and unused entries only.
export function validateLibraryAdditions(source, definitions, map = source.map) {
  if (!definitions || Object.getPrototypeOf(definitions) !== Object.prototype || Object.keys(definitions).length > 1024) fail("素材庫結構／數量不合法");
  for (const [id, old] of Object.entries(source.componentDefinitions)) {
    if (JSON.stringify(old) === JSON.stringify(definitions[id])) continue;
    if (!authorMaterial(old)) fail("現有原圖塊定義不可覆寫或刪除");
    if (!Object.hasOwn(definitions, id)) {
      const refs = materialReferences(source, id, map); if (refs.length) fail("素材仍被引用：" + refs.join("、"));
    } else {
      const name = text(definitions[id]?.name);
      if (name !== definitions[id].name || JSON.stringify({ ...old, name }) !== JSON.stringify(definitions[id])) fail("現有素材配方不可覆寫；只允許更名");
    }
  }
  for (const [id, def] of Object.entries(definitions)) {
    if (Object.hasOwn(source.componentDefinitions, id)) continue;
    if (!def || def.id !== id || typeof def.name !== "string" || !Array.isArray(def.footprint) || !def.footprint.length || def.footprint.length > 256) fail("新增素材定義不合法");
    text(def.name);
    if (def.ruleRecipeRef !== BYTE_STAMP_RECIPE || def.visualRef !== "MMAP.MDL:indexed-footprint") fail("新增素材只能綁定已支持的原圖塊配方");
    if (def.authorWaterClass && !Object.hasOwn(WATER_CLASSES, def.authorWaterClass)) fail("新增素材水域類別不合法");
    // A temporary isolated preview validates all variants through the SAME composer.
    for (const variantRef of Object.keys(def.variants ?? {})) {
      const x = def.anchor?.[0] - Math.min(...def.footprint.map((p) => p[0])), y = def.anchor?.[1] - Math.min(...def.footprint.map((p) => p[1]));
      composeMapLayers({ ...source, componentDefinitions: definitions, map: { ...source.map, waterGroups: [], decorations: [{ id: "library-validation", definitionRef: id, variantRef, x, y }], roads: [], placements: [] } }, { draft: true });
    }
    if (!Object.hasOwn(def.variants ?? {}, "original")) fail("新增素材缺原始變體");
  }
}
