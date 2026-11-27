// Cell bytes are the only material authority; rule geography is not a second tile layer.
import { isSupportedMapExtent } from './mapextent.js';
import { SEA_BASE_TILE } from './mapground.js';
export const EMPTY_CELL = 256;
export function cellKind(tile) {
  if (!Number.isInteger(tile) || tile < 0 || tile > EMPTY_CELL) throw new RangeError('invalid cell material');
  if (tile === EMPTY_CELL) return 'empty';
  if (tile >= 0xcb && tile <= 0xd3) return 'city';
  if ((tile >= 0xb8 && tile <= 0xca && tile !== 0xbe) || (tile >= 0xd4 && tile <= 0xdd)) return 'road';
  return 'decor';
}
// A clear can erase any material. Classify it against the original plane, not the empty result.
export function cellEditsTouchNetwork(map, edits) {
  if (edits.some(e => ['cell-stamp','city-bind','city-unbind'].includes(e.op))) return true;
  if (!edits.some(e => e.op === 'cell-clear' || e.op === 'cell-transfer')) return false;
  if (map.format !== 'cell-map-1') return true; // conversion plus a clear
  const { width, height, minX, minY } = map.bounds;
  const plane = new DataView(decode(map.cellsLE, width * height * 2).buffer);
  return edits.some(e => (e.op === 'cell-clear' || e.op === 'cell-transfer') && e.points.some(({x,y}) => {
    const kind = cellKind(plane.getUint16(((y-minY)*width+x-minX)*2,true));
    return kind === 'road' || kind === 'city';
  }));
}

// On a committed map each corridor cell must belong to a certified edge. A city may have unused gates.
export function uncoveredCellRoads(map, terrain, roads = map.roads) {
  const { width, minX, minY } = map.bounds;
  const index = (x,y) => (y-minY)*width + x-minX;
  const covered = new Uint8Array(terrain.length);
  for (const road of roads) for (const {x,y} of road.geometry) covered[index(x,y)] = 1;
  for (const p of map.placements) for (const d of [-2,-1,1,2]) for (const [x,y] of [[p.x+d,p.y],[p.x,p.y+d]]) {
    if (x<minX || x>=minX+width || y<minY || y>=minY+map.bounds.height) continue;
    const i=index(x,y); if (terrain[i]>=0xd4 && terrain[i]<=0xdd) covered[i]=1;
  }
  const cells=[];
  terrain.forEach((tile,i)=>{if (!covered[i] && cellKind(tile)==='road') cells.push([minX+i%width,minY+Math.floor(i/width)]);});
  return cells;
}

export function encode(bytes) {
  let text = '';
  for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(text);
}
export function decode(text, length) {
  if (typeof text !== 'string' || text.length !== 4 * Math.ceil(length / 3)) throw new RangeError('invalid cell plane length');
  const bytes = Uint8Array.from(atob(text), c => c.charCodeAt(0));
  if (bytes.length !== length || encode(bytes) !== text) throw new RangeError('invalid cell plane encoding');
  return bytes;
}
export function composeCellPlane(map, draft = false) {
  if (!isSupportedMapExtent(map.bounds) || Object.keys(map).sort().join(',') !== 'bounds,cellsLE,format,geographyBits,placements,roads' || map.format !== 'cell-map-1') throw new RangeError('invalid cell map or legacy overlays');
  const {width,height,minX,minY} = map.bounds, count = width * height;
  const cells = new DataView(decode(map.cellsLE,count*2).buffer), rules = decode(map.geographyBits,count);
  const terrain = new Array(count), geography = new Uint8Array(count), minimapGeography = new Uint8Array(count), centers = new Set();
  const index = ({x,y}) => {
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < minX || y < minY || x >= minX+width || y >= minY+height) throw new RangeError(`cell out of bounds (${x},${y})`);
    return (y-minY)*width+x-minX;
  };
  for (const p of map.placements) {
    const i=index(p);
    if (p.componentRef !== undefined || centers.has(i) || (!p.cityId && !(draft && p.cityId === null))) throw new RangeError(`duplicate, layered or unbound city (${p.x},${p.y})`);
    centers.add(i);
  }
  for (let i=0;i<count;i++) {
    const tile=cells.getUint16(i*2,true);
    if ((cellKind(tile)==='city') !== centers.has(i) || rules[i]>15) throw new RangeError(`city binding or geography conflict (${minX+i%width},${minY+Math.floor(i/width)})`);
    terrain[i]=tile===EMPTY_CELL?SEA_BASE_TILE:tile; geography[i]=rules[i]&3; minimapGeography[i]=rules[i]>>2;
  }
  for (const r of map.roads) {
    if ('components' in r) throw new RangeError('cell map cannot contain visual overlays');
    for (const p of r.geometry) if (cellKind(terrain[index(p)])!=='road') throw new RangeError(`road ${r.id} crosses non-road cell (${p.x},${p.y})`);
  }
  return {terrain,geography,minimapGeography,diagnostics:[]};
}
