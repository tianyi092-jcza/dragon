// Web authoring format, not a DOS structure. Row-major: 0..255 = material, 256 = empty.
// Persist little-endian explicitly. Painted sea (95) is not an empty cell.
import { isSupportedMapExtent } from './mapextent.js';
import { composeMapLayers, WATER_CLASSES } from './maplayers.js';
import { assertMapConnected, compileMapSource } from './mapcompile.js';
import { buildRoad } from './roadedit.js';
import { componentGroundMask, SEA_BASE_TILE, SEA_GROUND_POLICY } from './mapground.js';

import { projectMovedCity } from '../../editor/mapobjectmove.js';
import { cellKind, EMPTY_CELL, encode, decode } from './cellplane.js';
export { cellKind, EMPTY_CELL };

// Private canvas/controller port. Cells and the rule plane stay decoded across gestures.
// Ordinary painting never changes a road or a binding; the dedicated road/city workflow owns those.
export function openCellDecorEditor(map, definitions) {
  if (map.format !== 'cell-map-1' || !isSupportedMapExtent(map.bounds)) throw new RangeError('unsupported cell map');
  const { width, height, minX, minY } = map.bounds, count = width * height;
  const bytes = decode(map.cellsLE, count * 2), cells = new DataView(bytes.buffer), rules = decode(map.geographyBits, count);
  const index = (x,y) => {
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < minX || x >= minX+width || y < minY || y >= minY+height) throw new RangeError(`cell out of bounds (${x},${y})`);
    return (y-minY)*width+x-minX;
  };
  let undo = new Map();
  return {
    transfer(points,dx,dy,copy) {
      if (!Number.isSafeInteger(dx) || !Number.isSafeInteger(dy) || typeof copy !== 'boolean') throw new RangeError('invalid cell transfer');
      const moving = new Set(points.map(({x,y}) => index(x,y)));
      const stamps = points.map(({x,y}) => {
        const src=index(x,y), dst=index(x+dx,y+dy), tile=cells.getUint16(src*2,true);
        const kind=cellKind(tile);
        if (kind==='empty' || (copy && kind!=='decor')) throw new RangeError('空格不可搬移，道路與據點只能移動、不能複製。');
        if ((copy || !moving.has(dst)) && !['empty','decor'].includes(cellKind(cells.getUint16(dst*2,true)))) throw new RangeError(`不可覆蓋未選取的道路或據點 (${x+dx},${y+dy})`);
        return {src,dst,tile,rule:rules[src]};
      });
      if (!copy) for (const {src} of stamps) {cells.setUint16(src*2,EMPTY_CELL,true); rules[src]=5;}
      for (const {dst,tile,rule} of stamps) {cells.setUint16(dst*2,tile,true);rules[dst]=rule;}
    },
    stamp(x,y,tile) {
      const i=index(x,y), prev=cellKind(cells.getUint16(i*2,true));
      if (prev==='road' || prev==='city') throw new RangeError(`（${x}, ${y}）已有道路或據點，請先清除。`);
      if (definitions[`tile-${tile}`]?.variants?.original?.tiles?.[0]?.[2]!==tile) throw new RangeError(`素材庫沒有圖塊 ${tile}。`);
      cells.setUint16(i*2,tile,true); // As with legacy road/center stamps, preserve the cell's geography.
    },
    materialAt(x,y) { return cells.getUint16(index(x,y)*2,true); },
    clear(x,y) { const i=index(x,y); cells.setUint16(i*2,EMPTY_CELL,true); rules[i]=5; },
    paint(points, tile) {
      if (!['decor', 'empty'].includes(cellKind(tile))) throw new RangeError('road or city needs its own edit');
      let rule = 5; // bare sea: rule geography 1 / minimap geography 1
      if (tile !== EMPTY_CELL) {
        const def = definitions[`tile-${tile}`];
        if (def?.variants?.original?.tiles?.length !== 1 || def.variants.original.tiles[0][2] !== tile) throw new RangeError(`missing atomic material ${tile}`);
        const water = def.authorWaterClass == null ? 1 : WATER_CLASSES[def.authorWaterClass];
        if (water === undefined) throw new RangeError('invalid water class');
        rule = water | (componentGroundMask(def, { variantRef: 'original' }).length ? 0 : 4);
      }
      const changed = new Map();
      for (const { x, y } of points) {
        if (!Number.isInteger(x) || !Number.isInteger(y) || x < minX || x >= minX + width || y < minY || y >= minY + height) throw new RangeError(`cell out of bounds (${x},${y})`);
        const i = (y - minY) * width + x - minX, previous = cells.getUint16(i * 2, true);
        if (!['decor', 'empty'].includes(cellKind(previous))) throw new RangeError(`not a decoration cell (${x},${y})`);
        if (previous !== tile) changed.set(i, [previous, rules[i]]);
      }
      if (!changed.size) return 0;
      for (const i of changed.keys()) { cells.setUint16(i * 2, tile, true); rules[i] = rule; }
      undo = changed; return changed.size;
    },
    undo() { for (const [i, [tile, rule]] of undo) { cells.setUint16(i * 2, tile, true); rules[i] = rule; } undo.clear(); },
    snapshot() { return { ...map, cellsLE: encode(bytes), geographyBits: encode(rules) }; },
  };
}

// The same small commands are previewed locally and replayed on the authoritative source.
export function applyCellPaints(source, edits) {
  if (!edits.length) return source;
  const brush = openCellDecorEditor(source.map, source.componentDefinitions);
  let {roads, placements} = source.map, cities = source.cities;
  const moved = new Map();
  for (const edit of edits) {
    const keys = Object.keys(edit).sort().join(',');
    if (edit.op==='cell-stamp') {
      const {tile,x,y,pieceId}=edit, kind=cellKind(tile);
      if (kind==='city' && keys==='op,pieceId,tile,x,y') {
        const prefix=`${source.gameId}#city-piece-`;
        if (typeof pieceId!=='string' || !pieceId.startsWith(prefix) || !/^[a-f0-9]{64}$/.test(pieceId.slice(prefix.length)) || placements.some(p=>p.id===pieceId)) throw new RangeError('據點中心識別無效或重複');
        placements=[...placements,{id:pieceId,cityId:null,x,y}];
      } else if (kind!=='road' || keys!=='op,tile,x,y') throw new RangeError('道路或據點圖塊無效');
      brush.stamp(x,y,tile); continue;
    }
    if (edit.op === 'city-bind' || edit.op === 'city-unbind') {
      const bind = edit.op === 'city-bind', p = placements.find(v=>v.id===edit.pieceId);
      if (keys !== (bind?'cityId,op,pieceId':'op,pieceId') || !p || cellKind(brush.materialAt(p.x,p.y))!=='city') throw new RangeError('據點中心不存在');
      const id = bind ? edit.cityId : p.cityId;
      if (typeof id !== 'string' || !id || !Object.hasOwn(cities,id) || (bind && (p.cityId || placements.some(v=>v.cityId===id)))) throw new RangeError('據點無法綁定或已在其他格綁定');
      if (!bind && roads.some(r=>r.fromCityId===id || r.toCityId===id)) throw new RangeError('請先解除相連道路再解綁據點');
      placements=placements.map(v=>v===p?{...v,cityId:bind?id:null}:v);
      const city={...cities[id],x:bind?p.x:0,y:bind?p.y:0};
      if (!bind && (!source.gameId || source.gameId==='system-base-map')) {delete city.x; delete city.y;}
      cities={...cities,[id]:city}; continue;
    }
    if (!Array.isArray(edit.points) || !edit.points.length || edit.points.length > source.map.bounds.width * source.map.bounds.height || edit.points.some(p => !p || Object.keys(p).sort().join(',') !== 'x,y')) throw new RangeError('invalid cell points');
    if (edit.op==='cell-transfer' && keys==='copy,dx,dy,op,points') {
      const network = new Set(edit.points.filter(({x,y})=>['road','city'].includes(cellKind(brush.materialAt(x,y)))).map(p=>`${p.x},${p.y}`));
      brush.transfer(edit.points,edit.dx,edit.dy,edit.copy);
      if (network.size) {
        const incident=new Set();
        placements=placements.map(p=>{
          if (!network.has(`${p.x},${p.y}`)) return p;
          const next={...p,x:p.x+edit.dx,y:p.y+edit.dy};
          if (p.cityId) {incident.add(p.cityId);moved.set(p.cityId,next);}
          return next;
        });
        roads=roads.filter(r=>!incident.has(r.fromCityId) && !incident.has(r.toCityId) && !r.geometry.some(p=>network.has(`${p.x},${p.y}`)));
      }
    }
    else if (edit.op==='cell-clear' && keys==='op,points') {
      const cleared = new Set(edit.points.map(({x,y})=>`${x},${y}`));
      const at = p=>cleared.has(`${p.x},${p.y}`);
      if (placements.some(p=>at(p) && p.cityId)) throw new RangeError('請先解綁據點，再清除中心格');
      if (placements.some(at)) placements=placements.filter(p=>!at(p));
      if (edit.points.some(({x,y})=>cellKind(brush.materialAt(x,y))==='road')) roads=roads.filter(r=>!r.geometry.some(at));
      for (const {x,y} of edit.points) brush.clear(x,y);
    } else if (edit.op==='cell-paint' && keys==='op,points,tile') brush.paint(edit.points, edit.tile);
    else throw new RangeError('invalid cell edit command');
  }
  const next={ ...source, ...(cities && {cities}), map: {...brush.snapshot(), roads, placements} };
  for (const [cityId,place] of moved) if (placements.some(p=>p.cityId===cityId && p.id===place.id)) projectMovedCity(next,place);
  return next;
}

// Offline migration. Without a policy, only an explicitly uniform sea-tile base is admitted;
// a buried unknown or a different base requires its own conversion, not an inferred ocean.
export function convertCellMap(source) {
  const { map } = source, { width, height, minX, minY } = map.bounds;
  if (!isSupportedMapExtent(map.bounds)) throw new RangeError('unsupported map extent');
  if (map.base.policy !== SEA_GROUND_POLICY && (map.base.policy !== undefined || map.base.terrainRef.some(tile => tile !== SEA_BASE_TILE))) throw new RangeError('legacy base is not explicitly uniform sea; separate conversion required');
  // Strict legacy composition rejects unknown recipes and uncovered unknown cells.
  const { terrain, geography, minimapGeography } = composeMapLayers(source);
  const covered = new Uint8Array(width * height);
  for (const stamp of [...map.decorations, ...map.roads.flatMap(r => r.components ?? []), ...map.placements.filter(p => p.componentRef).map(p => ({ ...p, definitionRef: p.componentRef }))]) {
    const def = source.componentDefinitions[stamp.definitionRef];
    for (const [dx, dy] of def.footprint) covered[(stamp.y + dy - def.anchor[1] - minY) * width + stamp.x + dx - def.anchor[0] - minX] = 1;
  }
  const packed = new Uint8Array(covered.length * 2), rules = new Uint8Array(covered.length);
  const view = new DataView(packed.buffer);
  for (let i = 0; i < covered.length; i++) {
    view.setUint16(i * 2, covered[i] ? terrain[i] : EMPTY_CELL, true);
    // These are rule values, not extra materials or an image under a road.
    rules[i] = geography[i] | (minimapGeography[i] << 2);
  }
  return { format: 'cell-map-1', bounds: { ...map.bounds }, cellsLE: encode(packed), geographyBits: encode(rules),
    placements: map.placements.map(({ id, cityId, x, y }) => ({ id, cityId, x, y })),
    roads: map.roads.map(({ components, ...road }) => structuredClone(road)) };
}

// One-way edit of a workspace source. Only original atomic definitions are used by the brush.
export function convertCellWorkspace(source) {
  const map = convertCellMap(source);
  compileCellMap(map);
  return { ...source, map, selectionGroups: [], componentDefinitions: Object.fromEntries(Object.entries(source.componentDefinitions).filter(([id]) => /^tile-\d+$/.test(id))) };
}

// Read the persisted bytes, ensure each center and each path coordinate has the right kind,
// and feed the existing port, continuous-path and connected-network checks (no new pathfinder).
export function compileCellMap(map) {
  if (map.format !== 'cell-map-1') throw new RangeError('unsupported cell map');
  const source = { schemaVersion: 1, map }, compiled = compileMapSource(source, { mapExtent: true });
  const { width, minX, minY } = map.bounds;
  const cities = new Map(map.placements.map(p => [p.cityId, p])), checked = [];
  const tiles = (x, y) => compiled.terrainBytes[(y - minY) * width + x - minX];
  for (const r of map.roads) checked.push({ ...buildRoad({ ...r, cities, roads: checked, tiles }, map.bounds), id: r.id });
  assertMapConnected(source);
  return compiled;
}
