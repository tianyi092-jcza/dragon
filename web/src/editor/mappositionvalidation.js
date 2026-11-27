// Shared live-preview/save diagnostics. Uses the existing certified road builder;
// never repairs topology, guesses corridors or silently renumbers city slots.
import { hasStructuredMapExtent } from '../content/authoring/mapextent.js';
import { composeMapLayers } from '../content/authoring/maplayers.js';
import { buildRoad } from '../content/authoring/roadedit.js';
import { assertMapConnected, MAX_ROAD_EDGES } from '../content/authoring/mapcompile.js';
import { analyzeRoadChains, isAutoRoadId } from './roadchain.js';

import { uncoveredCellRoads } from '../content/authoring/cellplane.js';

export function mapPositionProblems(source, terrain = composeMapLayers(source, { draft: true }).terrain) {
  const { placements, roads, bounds } = source.map;
  const definitions = source.cities ?? {}, cities = new Map(placements.map(item => [item.cityId, item]));
  const problems = [];
  const cityLabel = id => `${definitions[id]?.name || '未命名據點'}（據點ID：${id ?? '未綁定'}）`;
  const reasons = { 'non-port-endpoint': '道路端點沒有連接到所屬據點城門', 'unknown-endpoint': '道路引用的據點不存在',
    'discontinuous': '道路點列不連續', 'unclassifiable-cell': '道路經過不支持通行的圖塊', 'shared-cell': '道路與另一條道路重疊',
    'shared-segment': '道路與另一條道路共用線段', 'x-crossing': '道路交叉處缺少據點', 'slot-occupied': '據點同一方向已有道路',
    'out-of-bounds': '道路位置超出地圖', 'self-loop': '道路兩端不能是同一據點', 'non-cardinal-endpoint': '道路端點方向不正確',
    // 拖放路磚鏈（只紅不攔，warning）：未连城/分叉/歧义/自环/穿城/超额。
    'ROAD_UNLINKED': '路段沒有連接到雙方據點城門', 'ROAD_JUNCTION': '路段在此分叉；分叉處需要據點，否則請斷開',
    'ROAD_AMBIGUOUS': '路段端點可連接多個據點', 'ROAD_SELF_LOOP': '路段兩端是同一據點', 'ROAD_SPACE': '道路數量已達上限，本段暫不建路' };
  const add = (code, object, message, cells, severity) => problems.push({ ...(severity ? { severity } : null), code, objectId: object.id, x: cells[0]?.[0], y: cells[0]?.[1], cells,
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
  const extended = hasStructuredMapExtent(bounds);
  const ordered = extended ? [] : placements.filter(place => definitions[place.cityId]).slice().sort((a, b) => a.y - b.y || a.x - b.x);
  ordered.forEach((place, index) => {
    if (definitions[place.cityId].runtimeSlot !== index)
      add('CITY_SCAN_ORDER', place, `${cityLabel(place.cityId)}位置改變了據點掃描順序（槽${definitions[place.cityId].runtimeSlot}，目前順序${index}）`, [[place.x, place.y]]);
  });
  const checked = [];
  roads.forEach(road => {
    const related = [road.fromCityId, road.toCityId].map(id => `${cityLabel(id)}${cities.has(id) ? ` (${cities.get(id).x}, ${cities.get(id).y})` : ''}`).join(' ↔ ');
    const cells = road.geometry.map(point => [point.x, point.y]);
    try {
      const derived = buildRoad({ ...road, cities, roads: checked, tiles: (x, y) => terrain[(y - bounds.minY) * bounds.width + x - bounds.minX] }, extended ? bounds : undefined);
      const binding = road.nativeBinding, expected = derived.nativeBinding;
      if (binding && (binding.weight !== expected.weight || binding.flags.length !== expected.flags.length ||
          binding.flags.some((flag, index) => flag !== expected.flags[index]) ||
          ['minX', 'maxX', 'minY', 'maxY'].some(key => binding.bounds[key] !== expected.bounds[key]) ||
          binding.slots.length !== expected.slots.length || binding.slots.some((slot, index) =>
            ['node', 'slot', 'side'].some(key => slot[key] !== expected.slots[index][key]))))
        add('ROAD_BINDING', road, `道路位置與既有方向／路格資料不一致；${related}`, cells);
      checked.push({ ...derived, id: road.id });
    } catch (error) {
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
  // 拖放路磚鏈：已放未連的走廊只標紅（warning），不攔保存；成形的可建路段
  // 参与下方的孤立检查，避免已连通的据点被误标。
  const autoChains = analyzeRoadChains(source, terrain, { maxEdges: MAX_ROAD_EDGES });
  const single = source.map.format === 'cell-map-1';
  if (single) {
    const cells = uncoveredCellRoads(source.map, terrain, [...roads, ...autoChains.derived]);
    if (cells.length) add('ROAD_UNLINKED', {id:'road-cells'}, reasons.ROAD_UNLINKED, cells);
  }
  for (const problem of single ? [] : autoChains.problems) {
    const cells = problem.cells ?? [];
    const anchor = { id: cells[0]?.id ?? `road-chain@${cells[0]?.join?.(',') ?? 'unknown'}` };
    const detail = problem.code === 'ROAD_AMBIGUOUS' ? `（可連：${(problem.cities ?? []).join('、')}）` : problem.code === 'ROAD_THROUGH_CITY' && problem.point ? `（穿越格：${problem.point.x},${problem.point.y}）` : '';
    add(problem.code, anchor, `${reasons[problem.code] ?? problem.code}${detail}${problem.detail ? `；${problem.detail}` : ''}`, cells, 'warning');
  }
  const linkedRoads = [...(single ? roads : roads.filter(r => !isAutoRoadId(source.gameId, r.id))), ...autoChains.derived];
  if (placements.length) {
    try { assertMapConnected({ map: { format:source.map.format, placements, roads: linkedRoads } }); }
    catch (error) {
      if (single) {
        const outside = new Set(error.outsideCityIds);
        for (const road of linkedRoads) if (outside.has(road.fromCityId)) add('MAP_CONNECTION', road, '道路網分為互不相連的區段', road.geometry.map(p=>[p.x,p.y]));
        return problems;
      }
      // Per-road diagnostics above give exact endpoints. Network errors also
      // mark each involved city so an isolated component cannot be overlooked.
      const isolated = placements.filter(place => !linkedRoads.some(road => road.fromCityId === place.cityId || road.toCityId === place.cityId));
      const affected = isolated.length ? isolated : placements;
      affected.forEach(place => add('MAP_CONNECTION', place, `${cityLabel(place.cityId)}${isolated.length ? '沒有連接任何道路' : '所在路網不完整或存在互不相連的路段'}`, [[place.x, place.y]]));
    }
  }
  return problems;
}

export function assertMapPositions(source) {
  const problems = mapPositionProblems(source).filter(problem => problem.severity !== 'warning');
  if (!problems.length) return;
  const error = new RangeError(`保存失敗：${problems[0].message}`);
  error.status = 422;
  error.code = 'MAP_POSITION_INVALID';
  error.detail = { problems: problems.map(({ message }) => ({ message })) };
  throw error;
}
