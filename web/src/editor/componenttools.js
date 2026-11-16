// Web author operations in the existing byte-stamp profile, not DOS formulas.
// Copy-on-write transactions: failures leave caller state/selection untouched.
import { composeMapLayers, BYTE_STAMP_RECIPE, WATER_CLASSES } from "../content/authoring/maplayers.js";
import { SEA_GROUND_POLICY, SEA_BASE_TILE, componentGroundMask } from '../content/authoring/mapground.js';
const fail = (message) => { throw new RangeError(message); };
const text = (value) => {
  if (typeof value !== "string" || !value.trim() || [...value].length > 64 || /[\u0000-\u001f\u007f]/u.test(value)) fail("名稱須為1至64字且無控制字元");
  return value.trim();
};
// Shared occupancy scan: decorations (full footprints), road components
// and placements. Used by placement precheck and gate-removal precheck.
export function occupiedCells(source) {
  const occupied = new Set();
  const map = source?.map;
  if (!map || typeof map !== "object") fail("地圖來源缺失");
  for (const decoration of map.decorations ?? []) {
    for (const [x, y] of componentCells(source, decoration)) occupied.add(`${x},${y}`);
  }
  for (const road of map.roads ?? []) {
    for (const component of road.components ?? []) {
      for (const [x, y] of componentCells(source, component)) occupied.add(`${x},${y}`);
    }
  }
  for (const placement of map.placements ?? []) {
    if (Number.isInteger(placement?.x) && Number.isInteger(placement?.y))
      occupied.add(`${placement.x},${placement.y}`);
  }
  return occupied;
}
function transaction(source, change) {
  const next = { ...source, componentDefinitions: { ...source.componentDefinitions }, map: { ...source.map,
    decorations: source.map.decorations.slice(), waterGroups: structuredClone(source.map.waterGroups ?? []),
    base: { ...source.map.base, terrainRef: source.map.base.terrainRef.slice(), geography: source.map.base.geography.slice(),
      unknownUnderlays: { ...source.map.base.unknownUnderlays } } } };
  change(next);
  composeMapLayers(next, { draft: true });
  return next;
}
// Explicit, reversible workspace edit; never run on pinned/imported source in place.
// Existing authored base bytes become bottom decorations; unknown underlay becomes
// the approved ocean default, not an inferred original terrain classification.
export function enableSeaGroundBase(source) {
  composeMapLayers(source, { draft: true });
  if (source.map.base.policy === SEA_GROUND_POLICY) return source;
  return transaction(source, next => {
    const ids = new Set([...source.map.decorations, ...source.map.roads.flatMap(road => road.components ?? []), ...source.map.placements].map(item => item.id));
    const underlays = source.map.base.terrainRef.flatMap((tile, cell) => {
      if (tile === null || tile === SEA_BASE_TILE) return [];
      const definitionRef = `tile-${tile}`, def = source.componentDefinitions[definitionRef];
      if (!def || def.ruleRecipeRef !== BYTE_STAMP_RECIPE || JSON.stringify(def.anchor) !== '[0,0]' ||
          JSON.stringify(def.footprint) !== '[[0,0]]' || JSON.stringify(def.variants?.original?.tiles) !== `[[0,0,${tile}]]`)
        fail('保留舊基底需要匹配的原子配方');
      const id = `sea-ground-underlay-${cell}`;
      if (ids.has(id)) fail('海域基底轉換身份衝突');
      return [{ id, definitionRef, variantRef: 'original', x: cell % 384, y: Math.floor(cell / 384) }];
    });
    // Retain even sea-looking historical stamps: they may cover authored ground.
    // Removing them merely because they look like the base would change native bytes.
    next.map.decorations = [...underlays, ...source.map.decorations];
    next.map.waterGroups = next.map.waterGroups.map(group => ({ ...group, baseCells: [] })).filter(group => group.memberIds.length);
    next.map.base = { ...next.map.base, policy: SEA_GROUND_POLICY, terrainRef: Array(384 * 256).fill(SEA_BASE_TILE),
      geography: Array(384 * 256).fill(1), unknownUnderlays: {} };
  });
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
// Content display flag, not workspace visibility or a rule-terrain edit.
export function setWaterGroupMinimapVisibility(source, groupId, visible) {
  if (typeof groupId !== "string" || !groupId || typeof visible !== "boolean") fail("水域組合身份及顯示狀態無效");
  const groups = source?.map?.waterGroups;
  if (!Array.isArray(groups)) fail("水域組合資料未配置");
  const matches = groups.filter(group => group?.id === groupId);
  if (matches.length !== 1 || typeof matches[0].showOnMinimap !== "boolean") fail("水域組合身份或原顯示狀態無效");
  return transaction(source, next => {
    next.map.waterGroups.find(group => group.id === groupId).showOnMinimap = visible;
  });
}
// Author-facing label only. Do not replace the stable group identity or members.
export function renameWaterGroup(source, groupId, name) {
  if (typeof groupId !== "string" || !groupId || typeof name !== "string" || [...name].some(char => {
    const code = char.codePointAt(0);
    return code >= 128 && code <= 159 || code >= 0xd800 && code <= 0xdfff;
  })) fail("水域組合身份或名稱字元無效");
  const label = text(name), groups = source?.map?.waterGroups;
  if (!Array.isArray(groups) || groups.filter(group => group?.id === groupId).length !== 1) fail("水域組合身份不存在或重複");
  return transaction(source, next => {
    next.map.waterGroups.find(group => group.id === groupId).name = label;
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
  const cells = new Map(), water = new Set(), classes = new Set(), land = new Set();
  for (const instance of instances) {
    const def = source.componentDefinitions[instance.definitionRef];
    if (def.ruleRecipeRef !== BYTE_STAMP_RECIPE) fail("未支持的素材規則綁定");
    const mask = new Set((def.geographyMask ?? def.footprint).map((p) => p.join(",")));
    const ground = new Set(componentGroundMask(def, instance).map(point => point.join(',')));
    for (const [dx, dy, tile] of def.variants[instance.variantRef ?? "original"].tiles) {
      const x = instance.x + dx - def.anchor[0], y = instance.y + dy - def.anchor[1], key = `${x},${y}`;
      cells.set(key, [x, y, tile]);
      if (ground.has(`${dx},${dy}`)) land.add(key);
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
  if (source.map.base.policy === SEA_GROUND_POLICY) {
    const landMask = [...land].map(key => { const [x, y] = key.split(',').map(Number); return [x - x0, y - y0]; });
    // Omit redundant masks so existing exact recipe reuse remains valid.
    const normal = new Set(componentGroundMask(def, { variantRef: 'original' }).map(point => point.join(',')));
    if (normal.size !== landMask.length || landMask.some(point => !normal.has(point.join(',')))) def.minimapLandMask = landMask;
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
export function placeCityGroup(source, materialized) {
  const cityId = materialized?.cityId;
  if (typeof cityId !== "string" || !cityId) fail("據點身份缺失");
  const decorations = materialized?.decorations, ports = materialized?.ports, group = materialized?.group;
  if (!Array.isArray(decorations) || !decorations.length) fail("據點裝飾描述缺失");
  if (!Array.isArray(ports)) fail("據點門端口描述缺失");
  if (!group || group.id !== `city-group-${cityId}` || !Array.isArray(group.members) || !group.members.length) fail("據點成組描述缺失");
  const taken = new Set([...source.map.decorations, ...source.map.roads.flatMap((road) => road.components ?? []), ...source.map.placements].map((item) => item.id));
  const batch = new Set();
  for (const deco of decorations) {
    if (typeof deco?.instanceId !== "string" || !deco.instanceId || taken.has(deco.instanceId) || batch.has(deco.instanceId)) fail("裝飾身份重複或缺失");
    batch.add(deco.instanceId);
    const tile = /^tile-(\d+)$/.exec(deco.materialId ?? "");
    const def = source.componentDefinitions[deco.materialId];
    if (!def || !tile || Number(tile[1]) > 255 || def.ruleRecipeRef !== BYTE_STAMP_RECIPE || JSON.stringify(def.anchor) !== "[0,0]" ||
        JSON.stringify(def.footprint) !== "[[0,0]]" || JSON.stringify(def.variants?.original?.tiles) !== `[[0,0,${tile[1]}]]`) fail(`裝飾素材不存在或非原子單格：${deco.materialId}`);
    if (!Number.isInteger(deco.x) || !Number.isInteger(deco.y) || deco.x < 0 || deco.y < 0 || deco.x >= 384 || deco.y >= 256) fail("裝飾落點須為地圖內整數圖格");
    if (deco.variantRef !== "original") fail("據點裝飾只接受原尺寸變體");
  }
  const portTaken = new Set((source.cityGatePorts ?? []).map((port) => port?.portId));
  const portBatch = new Set();
  ports.forEach((port, gateIndex) => {
    if (!port || port.portId !== `${cityId}:${gateIndex}` || port.cityId !== cityId || port.gateIndex !== gateIndex) fail("門端口身份不符");
    if (portTaken.has(port.portId) || portBatch.has(port.portId)) fail("門端口身份重複");
    portBatch.add(port.portId);
    if (!Number.isInteger(port.x) || !Number.isInteger(port.y) || port.x < 0 || port.y < 0 || port.x >= 384 || port.y >= 256) fail("門端口須為地圖內整數圖格");
  });
  const groups = source.selectionGroups ?? [];
  if (groups.some((row) => row?.id === group.id)) fail("據點成組身份重複");
  if (group.members.some((member) => member?.layer !== "decorations" || !batch.has(member.id))) fail("據點成組只含本次裝飾");
  // Ports are metadata only: no road geometry is created here. Copy-model
  // city rows, chapter coverage and battleMapId bindings are NOT written.
  return transaction(source, (next) => {
    for (const deco of decorations) next.map.decorations.push({ id: deco.instanceId, definitionRef: deco.materialId, variantRef: "original", x: deco.x, y: deco.y });
    next.cityGatePorts = [...(source.cityGatePorts ?? []), ...ports.map((port) => ({ ...port }))];
    next.selectionGroups = [...(source.selectionGroups ?? []), { id: group.id, members: group.members.map((member) => ({ ...member })) }];
  });
}
// Q39 over-boundary preview: which cells WOULD exceed on the proposed move.
// Pure read, no mutation, same input gates as translateDecorations.
export function previewTranslateOutOfBounds(source, ids, dx, dy) {
  unique(ids);
  if (!ids.length || !Number.isInteger(dx) || !Number.isInteger(dy) || dx === 0 && dy === 0) fail("請選取完整裝飾並輸入非零整數圖格位移");
  const selected = new Set(ids), instances = source.map.decorations.filter((d) => selected.has(d.id));
  if (instances.length !== ids.length) fail("批量平移引用不存在的裝飾");
  const cells = [];
  for (const d of instances) for (const [x, y] of componentCells(source, d))
    if (x + dx < 0 || x + dx >= 384 || y + dy < 0 || y + dy >= 256) cells.push([x + dx, y + dy]);
  return Object.freeze({ count: cells.length, cells: Object.freeze(cells.map(pair => Object.freeze(pair))) });
}
// Q39 expansion confirmation: the map stays 384x256 (admission §4: capacity
// is not a width switch). Confirming expansion is therefore always refused
// with the capacity reason; unconfigured bounds block publish at freeze.
export function requestMapExpansion() {
  fail("MAP_EXPANSION_CLOSED：地圖固定 384x256，不開放擴邊；容量原證未閉合");
}
// C7-G disassembly (§4.2): unlink the city group only. Decorations stay
// as independent parts, gate port metadata stays, and no copy-model,
// chapter or road record is touched. Unknown groups fail closed.
export function disbandCityGroup(source, cityId) {
  if (typeof cityId !== "string" || !cityId) fail("據點身份缺失");
  const groupId = `city-group-${cityId}`;
  if (!(source.selectionGroups ?? []).some((row) => row?.id === groupId)) fail("據點成組不存在");
  return transaction(source, (next) => {
    next.selectionGroups = (source.selectionGroups ?? []).filter((row) => row?.id !== groupId);
  });
}
// C7-H gate deletion (§4.3 contract): remove one gate port after the road
// reference precheck, replacing the gate cell with an atomic wall tile.
// The wall decoration stays ungrouped; the selection group keeps its other
// members. Copy-model rows, chapter coverage and battleMapId are NOT written.
export function removeCityGate(source, { cityId, gateIndex, wallMaterialId, wallInstanceId } = {}) {
  if (typeof cityId !== "string" || !cityId) fail("據點身份缺失");
  if (!Number.isInteger(gateIndex) || gateIndex < 0) fail("門索引須為非負整數");
  const portId = `${cityId}:${gateIndex}`;
  const port = (source.cityGatePorts ?? []).find((row) => row?.portId === portId);
  if (!port || port.cityId !== cityId || port.gateIndex !== gateIndex) fail("門端口不存在");
  if (!Number.isInteger(port.x) || !Number.isInteger(port.y)) fail("門端口座標異常");
  // Roads reference cities, not ports: any road touching the city blocks
  // gate deletion until unlinked via road tools. Roads themselves untouched.
  const refs = (source.map?.roads ?? []).filter((road) => road?.fromCityId === cityId || road?.toCityId === cityId).map((road) => road.id);
  if (refs.length) fail(`門所屬據點仍有道路引用，須先經道路工具解綁：${refs.join("、")}`);
  if (typeof wallInstanceId !== "string" || !wallInstanceId) fail("牆體身份缺失");
  const taken = new Set([...source.map.decorations, ...source.map.roads.flatMap((road) => road.components ?? []), ...source.map.placements].map((item) => item.id));
  if (taken.has(wallInstanceId)) fail("牆體身份重複");
  const tile = /^tile-(\d+)$/.exec(wallMaterialId ?? "");
  const def = source.componentDefinitions[wallMaterialId];
  if (!def || !tile || Number(tile[1]) > 255 || def.ruleRecipeRef !== BYTE_STAMP_RECIPE || JSON.stringify(def.anchor) !== "[0,0]" ||
      JSON.stringify(def.footprint) !== "[[0,0]]" || JSON.stringify(def.variants?.original?.tiles) !== `[[0,0,${tile[1]}]]`) fail(`牆體素材不存在或非原子單格：${wallMaterialId}`);
  if (occupiedCells(source).has(`${port.x},${port.y}`)) fail(`門格已被佔用：${port.x},${port.y}`);
  return transaction(source, (next) => {
    next.cityGatePorts = (source.cityGatePorts ?? []).filter((row) => row?.portId !== portId);
    next.map.decorations.push({ id: wallInstanceId, definitionRef: wallMaterialId, variantRef: "original", x: port.x, y: port.y });
  });
}
// Remove complete decoration instances only. Keep unknown-underlay provenance:
// exposing it is a draft diagnostic, never permission to invent a replacement.
export function removeDecorations(source, ids) {
  unique(ids);
  const selected = new Set(ids);
  if (!ids.length || source.map.decorations.filter(row => selected.has(row.id)).length !== ids.length) fail("請選取存在的完整裝飾實例");
  return transaction(source, next => {
    next.map.decorations = next.map.decorations.filter(row => !selected.has(row.id));
    next.map.waterGroups = next.map.waterGroups.map(group => ({ ...group, memberIds: group.memberIds.filter(id => !selected.has(id)) }))
      .filter(group => group.memberIds.length || group.baseCells.length);
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
// Web author order only: one neighbour per selected block, or a stable partition
// to the decoration layer's top/bottom. Never cross into roads/cities/base.
export function reorderDecorations(source, ids, direction) {
  unique(ids);
  if (!ids.length || ![1, -1, 'top', 'bottom'].includes(direction)) fail("請選取完整裝飾並指定上移、下移、置頂或置底");
  const selected = new Set(ids), decorations = source.map.decorations;
  if (decorations.filter((d) => selected.has(d.id)).length !== ids.length) fail("調序引用不存在的裝飾");
  composeMapLayers(source, { draft: true });
  if (direction === 'top' || direction === 'bottom') {
    const members = decorations.filter(row => selected.has(row.id));
    const others = decorations.filter(row => !selected.has(row.id));
    const order = direction === 'top' ? [...others, ...members] : [...members, ...others];
    if (order.every((row, index) => row === decorations[index])) return source;
    return transaction(source, next => { next.map.decorations = order; });
  }
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
  // Source JSON canonicalization reorders object keys. Pick equivalent atoms
  // in stable ID order so live saves and captured-history replay agree.
  for (const id of Object.keys(source.componentDefinitions).sort()) {
    const entry = source.componentDefinitions[id];
    if (entry.ruleRecipeRef === BYTE_STAMP_RECIPE && JSON.stringify(entry.footprint) === "[[0,0]]" && JSON.stringify(entry.anchor) === "[0,0]" &&
        (entry.geographyMask === undefined || JSON.stringify(entry.geographyMask) === "[[0,0]]")) {
      const tuple = entry.variants?.original?.tiles;
      if (tuple?.length === 1 && tuple[0][0] === 0 && tuple[0][1] === 0) atoms.set(tuple[0][2], id);
    }
  }
  const ground = new Set(componentGroundMask(def, instance).map(point => point.join(',')));
  const children = tiles.map(([dx, dy, tile], i) => {
    const definitionRef = atoms.get(tile); if (!definitionRef) fail("缺少受信單格原圖塊；不猜建配方");
    const child = { ...instance, id: childIds[i], definitionRef, variantRef: "original",
      x: instance.x + dx - def.anchor[0], y: instance.y + dy - def.anchor[1],
      splitProvenance: { instanceId, definitionRef: instance.definitionRef, variantRef: instance.variantRef ?? "original", localCell: [dx, dy] } };
    if (!mask.has(`${dx},${dy}`)) delete child.waterClass;
    if (source.map.base.policy === SEA_GROUND_POLICY) child.minimapLand = ground.has(`${dx},${dy}`);
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
  if (source.map.base.policy === SEA_GROUND_POLICY) fail('海域基底固定；請以裝飾層地面素材編輯陸地');
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
export function validateLibraryAdditions(source, definitions, map = source.map, definitionLimit = 1024) {
  if (!definitions || Object.getPrototypeOf(definitions) !== Object.prototype || Object.keys(definitions).length > definitionLimit) fail("素材庫結構／數量不合法");
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
