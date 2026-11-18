// Shared live-preview/save diagnostics. Uses the existing certified road builder;
// never repairs topology, guesses corridors or silently renumbers city slots.
import { composeMapLayers } from '../content/authoring/maplayers.js';
import { buildRoad } from '../content/authoring/roadedit.js';
import { assertMapConnected } from '../content/authoring/mapcompile.js';

export function mapPositionProblems(source, terrain = composeMapLayers(source, { draft: true }).terrain) {
  const { placements, roads, bounds } = source.map;
  const definitions = source.cities ?? {}, cities = new Map(placements.map(item => [item.cityId, item]));
  const problems = [];
  const cityLabel = id => `${definitions[id]?.name || '未命名據點'}（據點ID：${id ?? '未綁定'}）`;
  const add = (code, object, message, cells) => problems.push({ code, objectId: object.id, x: cells[0]?.[0], y: cells[0]?.[1], cells,
    message: `${message}；物件ID：${object.id}；位置 ${cells.slice(0, 2).map(([x, y]) => `(${x}, ${y})`).join('、')}，請檢查。` });
  const occupied = new Map();
  placements.forEach(place => {
    const key = `${place.x},${place.y}`, old = occupied.get(key);
    occupied.set(key, place);
    if (old) add('CITY_OVERLAP', place, `${cityLabel(place.cityId)}與${cityLabel(old.cityId)}（物件ID：${old.id}）位置重疊`, [[place.x, place.y]]);
    if (!place.cityId || !definitions[place.cityId]) add('CITY_UNBOUND', place, `${cityLabel(place.cityId)}尚未綁定有效據點資料`, [[place.x, place.y]]);
    if (place.x < bounds.minX || place.y < bounds.minY || place.x >= bounds.minX + bounds.width || place.y >= bounds.minY + bounds.height)
      add('CITY_BOUNDS', place, `${cityLabel(place.cityId)}位置超出地圖`, [[place.x, place.y]]);
    const tile = terrain[(place.y - bounds.minY) * bounds.width + place.x - bounds.minX];
    if (!(tile >= 0xcb && tile < 0xd4)) add('CITY_NODE', place, `${cityLabel(place.cityId)}中心格被覆蓋或不是有效據點圖塊`, [[place.x, place.y]]);
  });
  // Native node ordering is still the supported dense-slot contract. Crossing
  // it is editable but explicitly marked, not hidden by rewriting chapter IDs.
  const ordered = placements.filter(place => definitions[place.cityId]).slice().sort((a, b) => a.y - b.y || a.x - b.x);
  ordered.forEach((place, index) => {
    if (definitions[place.cityId].runtimeSlot !== index)
      add('CITY_SCAN_ORDER', place, `${cityLabel(place.cityId)}位置改變了據點掃描順序（槽${definitions[place.cityId].runtimeSlot}，目前順序${index}）`, [[place.x, place.y]]);
  });
  const checked = [];
  roads.forEach(road => {
    const related = [road.fromCityId, road.toCityId].map(id => `${cityLabel(id)}${cities.has(id) ? ` (${cities.get(id).x}, ${cities.get(id).y})` : ''}`).join(' ↔ ');
    const cells = road.geometry.map(point => [point.x, point.y]);
    try {
      const derived = buildRoad({ ...road, cities, roads: checked, tiles: (x, y) => terrain[(y - bounds.minY) * bounds.width + x - bounds.minX] });
      const binding = road.nativeBinding, expected = derived.nativeBinding;
      if (binding && (binding.weight !== expected.weight || binding.flags.length !== expected.flags.length ||
          binding.flags.some((flag, index) => flag !== expected.flags[index]) ||
          ['minX', 'maxX', 'minY', 'maxY'].some(key => binding.bounds[key] !== expected.bounds[key]) ||
          binding.slots.length !== expected.slots.length || binding.slots.some((slot, index) =>
            ['node', 'slot', 'side'].some(key => slot[key] !== expected.slots[index][key]))))
        add('ROAD_BINDING', road, `道路位置與既有方向／路格資料不一致；${related}`, cells);
      checked.push({ ...derived, id: road.id });
    } catch (error) {
      const reasons = { 'non-port-endpoint': '道路端點沒有連接到所屬據點城門', 'unknown-endpoint': '道路引用的據點不存在',
        'discontinuous': '道路點列不連續', 'unclassifiable-cell': '道路經過不支持通行的圖塊', 'shared-cell': '道路與另一條道路重疊',
        'shared-segment': '道路與另一條道路共用線段', 'x-crossing': '道路交叉處缺少據點', 'slot-occupied': '據點同一方向已有道路',
        'out-of-bounds': '道路位置超出地圖', 'self-loop': '道路兩端不能是同一據點', 'non-cardinal-endpoint': '道路端點方向不正確' };
      const other = error.entities?.with ?? error.entities?.by;
      let affected = cells;
      if (error.code === 'non-port-endpoint') {
        const tail = error.message.startsWith('to end');
        const point = tail ? road.geometry.at(-1) : road.geometry[0];
        const city = cities.get(tail ? road.toCityId : road.fromCityId);
        affected = [[point.x, point.y], [city.x, city.y]];
      } else if (['out-of-bounds', 'discontinuous', 'unclassifiable-cell'].includes(error.code)) {
        const point = road.geometry[error.entities.index];
        affected = [[point.x, point.y]];
      } else if (error.code === 'shared-cell') {
        const occupied = new Set(source.map.roads.find(item => item.id === other).geometry.map(point => `${point.x},${point.y}`));
        affected = cells.filter(cell => occupied.has(cell.join(',')));
      }
      add(error.code ?? 'ROAD_POSITION', road, `${reasons[error.code] ?? error.message}${other ? `（另一道路ID：${other}）` : ''}；${related}`, affected);
      // Include failed edges in overlap/slot checks for subsequent objects too.
      checked.push(road);
    }
  });
  if (placements.length) {
    try { assertMapConnected({ map: source.map }); }
    catch {
      // Per-road diagnostics above give exact endpoints. Network errors also
      // mark each involved city so an isolated component cannot be overlooked.
      const isolated = placements.filter(place => !roads.some(road => road.fromCityId === place.cityId || road.toCityId === place.cityId));
      const affected = isolated.length ? isolated : placements;
      affected.forEach(place => add('MAP_CONNECTION', place, `${cityLabel(place.cityId)}${isolated.length ? '沒有連接任何道路' : '所在路網不完整或存在互不相連的路段'}`, [[place.x, place.y]]));
    }
  }
  return problems;
}

export function assertMapPositions(source) {
  const problems = mapPositionProblems(source);
  if (!problems.length) return;
  const error = new RangeError(`保存失敗：${problems[0].message}`);
  error.status = 422;
  error.code = 'MAP_POSITION_INVALID';
  error.detail = { problems: problems.map(({ message }) => ({ message })) };
  throw error;
}
