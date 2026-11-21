// CITY-CAPACITY-1/C2 transport projection, NOT road derivation or runtime admission.
// citySource is returned by captureCitySource; its identity/coordinates are already
// checked. Source roads retain visual/provenance data outside this runtime slice.
import { ORIGINAL_EXTENT, containsTile } from './mapextent.js';
export function projectStructuredRoadGraph(roads, citySource, extent = ORIGINAL_EXTENT) {
  if (!Array.isArray(roads)) throw new TypeError('road array required');
  const { cityIds, indexByCityId } = citySource.identity;
  const positions = new Map(citySource.placements.map(p => [p.cityId, p]));
  const nodes = cityIds.map((cityId, cityIndex) => {
    const { x, y } = positions.get(cityId);
    return { cityId, cityIndex, x, y, ports: [null, null, null, null] };
  });
  const seenRoads = new Set();
  const edges = Array.from(roads, (road, roadIndex) => {
    if (typeof road?.id !== 'string' || !road.id.length || seenRoads.has(road.id))
      throw new RangeError('invalid or duplicate road identity');
    seenRoads.add(road.id);
    const ends = [road.fromCityId, road.toCityId];
    if (ends.some(id => typeof id !== 'string' || !Object.hasOwn(indexByCityId, id)) || ends[0] === ends[1])
      throw new RangeError(`invalid road endpoints: ${road.id}`);
    const binding = road.nativeBinding;
    if (!Number.isInteger(binding?.weight) || binding.weight < 0 || binding.weight > 255)
      throw new RangeError(`explicit byte road cost required: ${road.id}`);
    if (!Array.isArray(road.geometry) || !road.geometry.length ||
        !Array.isArray(binding.flags) || binding.flags.length !== road.geometry.length)
      throw new RangeError(`complete road points and flags required: ${road.id}`);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const points = Array.from(road.geometry, (point, i) => {
      if (!containsTile(extent, point?.x, point?.y) ||
          !Number.isInteger(binding.flags[i]) || binding.flags[i] < 0 || binding.flags[i] > 255)
        throw new RangeError(`invalid road point/flag: ${road.id}/${i}`);
      minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y);
      return { x: point.x, y: point.y, flags: binding.flags[i] };
    });
    const bounds = { minX, maxX, minY, maxY };
    if (!binding.bounds || Object.entries(bounds).some(([key, value]) => binding.bounds[key] !== value))
      throw new RangeError(`road bounds disagree with points: ${road.id}`);
    if (!Array.isArray(binding.slots) || binding.slots.length !== 2)
      throw new RangeError(`two reciprocal road ports required: ${road.id}`);
    const sides = new Set();
    for (const slot of binding.slots) {
      const side = slot?.side;
      if ((side !== 'source' && side !== 'target') || sides.has(side) ||
          slot.node !== ends[side === 'source' ? 0 : 1] ||
          !Number.isInteger(slot.slot) || slot.slot < 0 || slot.slot > 3)
        throw new RangeError(`invalid reciprocal road port: ${road.id}`);
      sides.add(side);
      const node = nodes[indexByCityId[slot.node]];
      if (node.ports[slot.slot] !== null) throw new RangeError(`road port collision: ${road.id}`);
      node.ports[slot.slot] = { roadIndex, end: side === 'source' ? 'from' : 'to' };
    }
    return { roadId: road.id, fromCityIndex: indexByCityId[ends[0]],
      toCityIndex: indexByCityId[ends[1]], cost: binding.weight, points, bounds };
  });
  if (extent !== ORIGINAL_EXTENT) return { version: 'world-grid-experiment', bounds: { ...extent }, nodes, edges };
  return { version: 3, width: 384, height: 256, nodes, edges };
}
