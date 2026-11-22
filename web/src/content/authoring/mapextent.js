import { componentGroundMask, SEA_GROUND_POLICY } from './mapground.js';
import { componentCells } from '../../editor/componenttools.js';
// World coordinates stay fixed. Only dense plane indices move. Isolated authoring
// experiment; this operation is not registered for persistent editor writes yet.
// MAP-EXT E1: four-side extent core (Web product plan, not DOS mechanism).
// Original domain is x=0..383, y=0..255. West/north use negative world coords.
// Per-side added cells W/E/N/S are integers 0..20; max 424x296.
// New cells are sea base (tile 95, geography 1) per sea-ground contract.
export const ORIGINAL_EXTENT = Object.freeze({ minX: 0, minY: 0, width: 384, height: 256 });
export const ORIGINAL_WIDTH = 384;
export const ORIGINAL_HEIGHT = 256;
export const MAP_EXT_SIDE_MAX = 20;
export const MAP_EXT_MAX_WIDTH = ORIGINAL_WIDTH + MAP_EXT_SIDE_MAX * 2;
export const MAP_EXT_MAX_HEIGHT = ORIGINAL_HEIGHT + MAP_EXT_SIDE_MAX * 2;
export const MAP_EXT_SIDES = Object.freeze(['north', 'south', 'west', 'east']);
function isInt(value) { return Number.isInteger(value); }
export function parseMapSides(bounds) {
  if (!bounds || !isInt(bounds?.minX) || !isInt(bounds?.minY) || !isInt(bounds?.width) || !isInt(bounds?.height))
    throw new TypeError('bounds minX/minY/width/height must be integers');
  const W = -bounds.minX + 0, N = -bounds.minY + 0;
  const E = bounds.minX + bounds.width - ORIGINAL_WIDTH;
  const S = bounds.minY + bounds.height - ORIGINAL_HEIGHT;
  return { W, E, N, S };
}
export function isOriginalBounds(bounds) {
  return bounds?.minX === 0 && bounds?.minY === 0 && bounds?.width === ORIGINAL_WIDTH && bounds?.height === ORIGINAL_HEIGHT;
}
export function isSupportedMapExtent(bounds) {
  if (!bounds || bounds.tileSize !== undefined && bounds.tileSize !== 16) return false;
  if (!isInt(bounds?.minX) || !isInt(bounds?.minY) || !isInt(bounds?.width) || !isInt(bounds?.height)) return false;
  let sides;
  try { sides = parseMapSides(bounds); } catch { return false; }
  const { W, E, N, S } = sides;
  return [W, E, N, S].every(v => isInt(v) && v >= 0 && v <= MAP_EXT_SIDE_MAX) &&
    bounds.width === ORIGINAL_WIDTH + W + E && bounds.height === ORIGINAL_HEIGHT + N + S;
}
export function assertSupportedMapExtent(bounds) {
  if (!isSupportedMapExtent(bounds)) throw new RangeError('unsupported map bounds');
}
export function assertWorldTile(bounds, x, y) {
  if (!containsTile(bounds, x, y)) throw new RangeError(`tile out of bounds: ${x},${y}`);
}
export function worldToDense(bounds, x, y) {
  assertWorldTile(bounds, x, y);
  return (y - bounds.minY) * bounds.width + x - bounds.minX;
}
export function denseToWorld(bounds, i) {
  if (!isInt(i) || i < 0 || i >= bounds.width * bounds.height) throw new RangeError(`dense index out of bounds: ${i}`);
  return { x: bounds.minX + (i % bounds.width), y: bounds.minY + Math.floor(i / bounds.width) };
}
export function isNorthExtension(bounds) {
  return bounds?.width === 384 && bounds.minX === 0 && Number.isInteger(bounds.minY) && bounds.minY >= -20 && bounds.minY < 0 && bounds.height === 256 - bounds.minY;
}
export function containsTile({ minX, minY, width, height }, x, y) {
  return Number.isInteger(x) && Number.isInteger(y) && x >= minX && y >= minY && x < minX + width && y < minY + height;
}
export function extendNorthOneRow(map) {
  return expandMapOneStep(map, 'north');
}
export function expandMapOneStep(map, side) {
  if (!MAP_EXT_SIDES.includes(side)) throw new TypeError(`unknown map side: ${side}`);
  const { bounds, base } = map;
  assertSupportedMapExtent({ ...bounds, tileSize: 16 });
  const sides = parseMapSides(bounds);
  const key = side === 'north' ? 'N' : side === 'south' ? 'S' : side === 'west' ? 'W' : 'E';
  if (sides[key] >= MAP_EXT_SIDE_MAX) throw new RangeError(`${side}側擴展已達 20 格`);
  const oldW = bounds.width, oldH = bounds.height;
  const d = side === 'north' ? { minX: bounds.minX, minY: bounds.minY - 1, width: oldW, height: oldH + 1 }
    : side === 'south' ? { minX: bounds.minX, minY: bounds.minY, width: oldW, height: oldH + 1 }
    : side === 'west' ? { minX: bounds.minX - 1, minY: bounds.minY, width: oldW + 1, height: oldH }
    : { minX: bounds.minX, minY: bounds.minY, width: oldW + 1, height: oldH };
  const newBounds = { ...bounds, ...d };
  const atNew = (x, y) => (y - newBounds.minY) * newBounds.width + x - newBounds.minX;
  const terrainRef = new Array(newBounds.width * newBounds.height).fill(95);
  const geography = new Array(newBounds.width * newBounds.height).fill(1);
  for (let y = bounds.minY; y < bounds.minY + oldH; y++) {
    for (let x = bounds.minX; x < bounds.minX + oldW; x++) {
      const from = (y - bounds.minY) * oldW + x - bounds.minX;
      const to = atNew(x, y);
      terrainRef[to] = base.terrainRef[from];
      geography[to] = base.geography[from];
    }
  }
  const next = { ...map, bounds: newBounds,
    base: { ...base, terrainRef, geography,
      ...(base.unknownUnderlays && { unknownUnderlays: Object.fromEntries(Object.entries(base.unknownUnderlays).map(([i, ref]) => {
        const wx = bounds.minX + (Number(i) % oldW), wy = bounds.minY + Math.floor(Number(i) / oldW);
        return [atNew(wx, wy), ref];
      })) }) } };
  if (Array.isArray(map.waterGroups)) {
    next.waterGroups = map.waterGroups.map(group => ({ ...group,
      baseCells: group.baseCells.map(i => {
        const wx = bounds.minX + (i % oldW), wy = bounds.minY + Math.floor(i / oldW);
        return atNew(wx, wy);
      }) }));
  }
  return next;
}
// 工作台擴圖：底層擴框仍可單獨使用（相容舊的全海實驗）。只讀目前邊線，
// 不延長道路幾何、不複製據點綁定。新增的每一層都是可獨立修改的單格。
export function extendTerrainEdge({ map, componentDefinitions: defs }, side) {
  const next = expandMapOneStep(map, side);
  const { bounds } = map;
  const ox = Number(side === 'east') - Number(side === 'west');
  const oy = Number(side === 'south') - Number(side === 'north');
  const edge = stripCells(bounds, side);
  const [ex, ey] = edge[0];
  // B8..DD 包含道路、橋、水路、城心及城門。其後為據點磚，單獨牆體可延伸。
  const walls = new Set([223, 231, 248, 249, 250, 252, 253]);
  const ordinary = tile => tile != null && (tile < 0xb8 || walls.has(tile));
  const baseCopies = new Map();
  for (const [x,y] of edge) {
    const from = worldToDense(bounds,x,y), to = worldToDense(next.bounds,x+ox,y+oy);
    const tile = map.base.terrainRef[from];
    if (ordinary(tile)) next.base.terrainRef[to] = tile;
    // 舊圖可能沒有可還原的底磚；不複製 unknown 引用，但保留已知地理平面。
    next.base.geography[to] = map.base.geography[from];
    baseCopies.set(from,to);
  }
  const added = [], memberCopies = new Map();
  const ids = new Set([...map.decorations, ...map.placements, ...map.roads.flatMap(r => r.components ?? [])].map(d => d.id));
  let serial = 0;
  for (const instance of map.decorations) {
    const def = defs[instance.definitionRef];
    const tiles = def.variants[instance.variantRef ?? 'original'].tiles;
    // 整組據點素材即使含邊牆也不延伸。
    if (tiles.length > 1 && tiles.every(([, , t]) => t >= 203) && tiles.some(([, , t]) => t <= 211)) continue;
    for (const [dx,dy,tile] of tiles) {
      const x = instance.x + dx - def.anchor[0], y = instance.y + dy - def.anchor[1];
      if ((ox ? x !== ex : y !== ey) || !ordinary(tile)) continue;
      const one = tiles.length === 1;
      const ref = one ? instance.definitionRef : `tile-${tile}`;
      if (!defs[ref]) throw new RangeError(`延伸邊界缺少單格素材：${tile}`);
      let id;
      do { id = `edge-${side}-${ox ? ex+ox : ey+oy}-${serial++}`; } while (ids.has(id));
      const child = { id, definitionRef: ref, variantRef: one ? instance.variantRef ?? 'original' : 'original', x:x+ox, y:y+oy };
      if (one) { child.x += def.anchor[0]-dx; child.y += def.anchor[1]-dy; }
      if (instance.waterClass && (!def.geographyMask || def.geographyMask.some(([u,v]) => u===dx && v===dy))) child.waterClass = instance.waterClass;
      if (map.base.policy === SEA_GROUND_POLICY) child.minimapLand = componentGroundMask(def, instance).some(([u,v]) => u===dx && v===dy);
      added.push(child);
      if (!memberCopies.has(instance.id)) memberCopies.set(instance.id, []);
      memberCopies.get(instance.id).push(id);
    }
  }
  next.decorations = [...map.decorations, ...added];
  if (map.waterGroups) next.waterGroups = next.waterGroups.map((g,i) => ({ ...g,
    baseCells: [...g.baseCells,...map.waterGroups[i].baseCells.filter(c => baseCopies.has(c)).map(c => baseCopies.get(c))],
    memberIds: [...g.memberIds,...g.memberIds.flatMap(id => memberCopies.get(id) ?? [])],
  }));
  return next;
}
export function stripCells(bounds, side) {
  assertSupportedMapExtent({ ...bounds, tileSize: 16 });
  const { minX, minY, width, height } = bounds;
  if (side === 'north') return Array.from({ length: width }, (_, k) => [minX + k, minY]);
  if (side === 'south') return Array.from({ length: width }, (_, k) => [minX + k, minY + height - 1]);
  if (side === 'west') return Array.from({ length: height }, (_, k) => [minX, minY + k]);
  if (side === 'east') return Array.from({ length: height }, (_, k) => [minX + width - 1, minY + k]);
  throw new TypeError(`unknown map side: ${side}`);
}
// MAP-EXT E4: shrink impact plan (shared preview/server). Footprint-exact.
// Decorations/placements/roads intersecting the strip are applied atomically
// (whole-piece removal, city unbind with records kept, road clipping); only
// unrepresentable losses refuse the whole op: unknown underlays in the strip
// and water groups that would be left completely empty.
export function planMapExtentShrink(map, componentDefinitions, side) {
  if (!MAP_EXT_SIDES.includes(side)) throw new TypeError(`unknown map side: ${side}`);
  const bounds = map.bounds ?? map.map?.bounds;
  const defs = componentDefinitions ?? map.componentDefinitions ?? map.map?.componentDefinitions ?? {};
  const source = { map: map.map ?? map, componentDefinitions: defs };
  assertSupportedMapExtent({ ...bounds, tileSize: 16 });
  const sides = parseMapSides(bounds);
  const key = side === 'north' ? 'N' : side === 'south' ? 'S' : side === 'west' ? 'W' : 'E';
  if (sides[key] <= 0) throw new RangeError(`${side}側已無新增格可縮回`);
  const strip = new Set(stripCells(bounds, side).map(([x, y]) => `${x},${y}`));
  const plan = { side, refusals: [], removedDecorations: [], removedPlacements: [], unboundCityIds: [], clippedRoads: [], clippedWater: [] };
  for (const place of source.map.placements ?? []) {
    const cells = [[place.x, place.y]];
    if (place.componentRef) { try { for (const [x, y] of componentCells(source, { ...place, definitionRef: place.componentRef })) cells.push([x, y]); } catch { cells.push([place.x, place.y]); } }
    const hit = cells.find(([x, y]) => strip.has(`${x},${y}`));
    if (hit) {
      plan.removedPlacements.push({ id: place.id, cityId: place.cityId ?? null, x: hit[0], y: hit[1] });
      if (place.cityId) plan.unboundCityIds.push(place.cityId);
    }
  }
  for (const deco of source.map.decorations ?? []) {
    let cells;
    try { cells = componentCells(source, deco); } catch { cells = [[deco.x, deco.y]]; }
    const hit = cells.find(([x, y]) => strip.has(`${x},${y}`));
    if (hit) plan.removedDecorations.push({ id: deco.id, x: hit[0], y: hit[1] });
  }
  for (const road of source.map.roads ?? []) {
    const droppedPoints = (road.geometry ?? []).filter(p => strip.has(`${p.x},${p.y}`)).map(p => ({ x: p.x, y: p.y }));
    const droppedComponents = [];
    for (const comp of road.components ?? []) {
      let cells;
      try { cells = componentCells(source, comp); } catch { cells = [[comp.x, comp.y]]; }
      if (cells.some(([x, y]) => strip.has(`${x},${y}`))) droppedComponents.push(comp.id);
    }
    if (droppedPoints.length || droppedComponents.length)
      plan.clippedRoads.push({ id: road.id, droppedPoints, droppedComponents, dead: (road.geometry ?? []).length - droppedPoints.length < 2 });
  }
  const { minX, minY, width } = bounds;
  const inStrip = (x, y) => strip.has(`${x},${y}`);
  for (const group of source.map.waterGroups ?? []) {
    const droppedCells = (group.baseCells ?? []).filter(i => inStrip(minX + (i % width), minY + Math.floor(i / width)));
    if (droppedCells.length) {
      const keptMembers = (group.memberIds ?? []).length;
      const keptCells = (group.baseCells ?? []).length - droppedCells.length;
      if (!keptMembers && !keptCells) plan.refusals.push({ kind: 'water', id: group.id, reason: 'group would be left empty' });
      else plan.clippedWater.push({ id: group.id, droppedCells });
    }
  }
  for (const key of Object.keys(source.map.base?.unknownUnderlays ?? {})) {
    const i = Number(key);
    if (inStrip(minX + (i % width), minY + Math.floor(i / width))) plan.refusals.push({ kind: 'unknown', cell: i, reason: 'unresolved unknown underlay in the strip' });
  }
  return plan;
}
// Back-compat: hard refusals only (E2-era callers used this for blank checks).
export function mapExtentShrinkBlockers(map, componentDefinitions, side) {
  return planMapExtentShrink(map, componentDefinitions, side).refusals;
}
export function shrinkMapOneStep(map, componentDefinitions, side) {
  const inner = map.map ?? map;
  const { bounds, base } = inner;
  const plan = planMapExtentShrink(map, componentDefinitions, side);
  if (plan.refusals.length) {
    const error = new RangeError(`${side}側裁切帶有 ${plan.refusals.length} 個無法處理的引用，整批拒絕：` +
      plan.refusals.slice(0, 8).map(b => `${b.kind}${b.id ? ` ${b.id}` : ''}${b.cell !== undefined ? ` cell ${b.cell}` : ''}（${b.reason}）`).join('；'));
    error.blockers = plan.refusals;
    error.refusals = plan.refusals;
    throw error;
  }
  const oldW = bounds.width, oldH = bounds.height;
  const d = side === 'north' ? { minX: bounds.minX, minY: bounds.minY + 1, width: oldW, height: oldH - 1 }
    : side === 'south' ? { minX: bounds.minX, minY: bounds.minY, width: oldW, height: oldH - 1 }
    : side === 'west' ? { minX: bounds.minX + 1, minY: bounds.minY, width: oldW - 1, height: oldH }
    : { minX: bounds.minX, minY: bounds.minY, width: oldW - 1, height: oldH };
  const newBounds = { ...bounds, ...d };
  const atNew = (x, y) => (y - newBounds.minY) * newBounds.width + x - newBounds.minX;
  const terrainRef = new Array(newBounds.width * newBounds.height);
  const geography = new Array(newBounds.width * newBounds.height);
  for (let y = newBounds.minY; y < newBounds.minY + newBounds.height; y++) {
    for (let x = newBounds.minX; x < newBounds.minX + newBounds.width; x++) {
      const from = (y - bounds.minY) * oldW + x - bounds.minX;
      const to = atNew(x, y);
      terrainRef[to] = base.terrainRef[from];
      geography[to] = base.geography[from];
    }
  }
  const next = { ...inner, bounds: newBounds,
    base: { ...base, terrainRef, geography,
      ...(base.unknownUnderlays && { unknownUnderlays: Object.fromEntries(Object.entries(base.unknownUnderlays).map(([i, ref]) => {
        const wx = bounds.minX + (Number(i) % oldW), wy = bounds.minY + Math.floor(Number(i) / oldW);
        return [atNew(wx, wy), ref];
      })) }) } };
  // Atomic impact apply: whole-piece decoration removal (with water member
  // cleanup), placement removal with city records kept (unbound repair flow),
  // road geometry/component clipping (no auto-reconnect), water cell clip.
  // Refusals already threw above; this stage cannot partially fail.
  const stripSet = new Set(stripCells(bounds, side).map(([x, y]) => `${x},${y}`));
  const deadDeco = new Set(plan.removedDecorations.map(d => d.id));
  const deadPieces = new Set(plan.removedPlacements.map(p => p.id));
  const droppedWater = new Map(plan.clippedWater.map(c => [c.id, new Set(c.droppedCells)]));
  next.decorations = (inner.decorations ?? []).filter(d => !deadDeco.has(d.id));
  next.placements = (inner.placements ?? []).filter(p => !deadPieces.has(p.id));
  next.roads = (inner.roads ?? []).map(road => {
    const clip = plan.clippedRoads.find(c => c.id === road.id);
    if (!clip) return road;
    const deadPts = new Set(clip.droppedPoints.map(p => `${p.x},${p.y}`));
    const deadComps = new Set(clip.droppedComponents);
    return { ...road,
      geometry: (road.geometry ?? []).filter(p => !deadPts.has(`${p.x},${p.y}`)),
      ...(road.components !== undefined ? { components: road.components.filter(c => !deadComps.has(c.id)) } : null) };
  });
  next.waterGroups = (inner.waterGroups ?? []).map(group => {
    const dropped = droppedWater.get(group.id) ?? new Set();
    return { ...group,
      memberIds: (group.memberIds ?? []).filter(id => !deadDeco.has(id)),
      baseCells: (group.baseCells ?? []).filter(i => !dropped.has(i)).map(i => {
        const wx = bounds.minX + (i % oldW), wy = bounds.minY + Math.floor(i / oldW);
        return atNew(wx, wy);
      }) };
  }).filter(group => (group.memberIds ?? []).length || (group.baseCells ?? []).length);
  return next;
}
