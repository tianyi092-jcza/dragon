// Web authoring only: move explicit objects, never guess ownership from pixels.
// Invalid connections remain editable; the shared position check blocks saving.
import { componentCells } from './componenttools.js';

export function mapObjectParts(source, layer, id) {
  if (layer === 'roads') {
    const road = source.map.roads.find(item => item.id === id);
    if (!road) throw new RangeError(`道路 ID ${id} 不存在`);
    const stamps = road.components ?? [];
    const cells = [...road.geometry.map(point => [point.x, point.y]), ...stamps.flatMap(item => componentCells(source, item))];
    return { road, decorations: [], placements: [], stamps, cells: [...new Map(cells.map(cell => [cell.join(','), cell])).values()] };
  }
  const place = source.map.placements.find(item => item.id === id);
  if (!place) throw new RangeError(`據點圖塊 ID ${id} 不存在`);
  const group = source.selectionGroups?.find(item => item.id === `city-group-${place.cityId}`);
  const ids = new Set((group?.members ?? []).filter(member => member.layer === 'decorations').map(member => member.id));
  const decorations = source.map.decorations.filter(item => ids.has(item.id));
  const stamps = [...decorations, { ...place, definitionRef: place.componentRef }];
  return { place, decorations, placements: [place], stamps, cells: stamps.flatMap(item => componentCells(source, item)) };
}

export function translateMapObject(source, layer, id, dx, dy) {
  if (!['roads', 'cities'].includes(layer) || typeof id !== 'string' || !Number.isSafeInteger(dx) || !Number.isSafeInteger(dy) || (!dx && !dy))
    throw new RangeError('移動需要道路／據點ID及非零整數位移');
  const parts = mapObjectParts(source, layer, id), { minX, minY, width, height } = source.map.bounds;
  const cells = parts.cells;
  if (cells.some(([x, y]) => x + dx < minX || x + dx >= minX + width || y + dy < minY || y + dy >= minY + height))
    throw new RangeError(`${layer === 'roads' ? '道路' : '據點'} ID ${id} 移動後超出地圖範圍，請檢查位置`);
  const move = item => ({ ...item, x: item.x + dx, y: item.y + dy });
  const next = { ...source, map: { ...source.map } };
  if (parts.road) {
    const road = parts.road;
    const moved = { ...road, geometry: road.geometry.map(move), components: parts.stamps.map(move) };
    if (road.nativeBinding) {
      const bounds = road.nativeBinding.bounds;
      moved.nativeBinding = { ...road.nativeBinding, bounds: { minX: bounds.minX + dx, maxX: bounds.maxX + dx, minY: bounds.minY + dy, maxY: bounds.maxY + dy } };
    }
    next.map.roads = source.map.roads.map(item => item.id === id ? moved : item);
    return next;
  }
  const place = move(parts.place), cityId = place.cityId;
  next.map.placements = source.map.placements.map(item => item.id === id ? place : item);
  const ids = new Set(parts.decorations.map(item => item.id));
  next.map.decorations = source.map.decorations.map(item => ids.has(item.id) ? move(item) : item);
  if (source.cityGatePorts) next.cityGatePorts = source.cityGatePorts.map(port => port.cityId === cityId ? move(port) : port);
  const definition = source.cities?.[cityId];
  if (!definition) return next; // Unbound pieces have no city/chapter record yet.
  next.cities = { ...source.cities, [cityId]: { ...definition, x: place.x, y: place.y } };
  // Existing city record contract: little-endian u16 X/Y at +08/+0A.
  // Only coordinates change; slot identities, owners and neighbours remain intact.
  const coordinates = [place.x & 255, place.x >> 8, place.y & 255, place.y >> 8].map(byte => byte.toString(16).padStart(2, '0')).join('');
  if (source.chapters) next.chapters = Object.fromEntries(Object.entries(source.chapters).map(([chapterId, chapter]) => {
    const state = chapter.state;
    const record = state.cities.find(item => item.idx === definition.runtimeSlot);
    if (!record) return [chapterId, chapter];
    const moved = { ...record, x: place.x, y: place.y };
    if (record.raw) moved.raw = record.raw.slice(0, 16) + coordinates + record.raw.slice(24);
    const nextState = { ...state, cities: state.cities.map(item => item === record ? moved : item) };
    if (state.nativeCityRecordRaw) nextState.nativeCityRecordRaw = state.nativeCityRecordRaw.map((raw, index) => index === definition.runtimeSlot && raw ? raw.slice(0, 16) + coordinates + raw.slice(24) : raw);
    return [chapterId, { ...chapter, state: nextState }];
  }));
  return next;
}
