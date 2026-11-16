// CITY-CAPACITY-1 C2: detached 487B retreat decision over validated v3 graph.
// Typed position/capital/owner come from the owning runtime boundary. No writes,
// fate execution or v3 admission. 491B costs retain the existing WORD policy.
import { searchStructuredRoadGraph } from './structuredroadsearch.js';

export function findStructuredRetreatCity(graph, {
  position, capitalCityIndex, owner, readCityOwner,
}) {
  if (capitalCityIndex === null) return { status: 'unreachable', reason: 'no-capital' };
  const readOwner = cityIndex => {
    const value = readCityOwner(cityIndex);
    if (!Number.isInteger(value) || value < 0 || value > 255)
      throw new RangeError('unknown retreat city owner byte');
    return value;
  };
  const onRoad = position.kind === 'road';
  let stopB = position.cityIndex, stopC = stopB;
  if (onRoad) {
    const edge = graph.edges[position.roadIndex];
    stopC = edge.fromCityIndex;
    stopB = edge.toCityIndex;
    // 48BB then 48CA: source owner first, target owner second. Do not sort.
    if (readOwner(stopC) !== owner) stopC = stopB;
    if (readOwner(stopB) !== owner) {
      if (stopB === stopC) return { status: 'unreachable', reason: 'foreign-endpoints' };
      stopB = stopC;
    }
  }
  const result = searchStructuredRoadGraph(graph, {
    startCityIndex: capitalCityIndex, stopCityIndices: [stopB, stopC], owner, readCityOwner,
  });
  if (result.status === 'already-there') return result; // 490C: no final owner read.
  // D5 approved Web difference: exhaustion is not a fabricated city offset.
  if (result.status === 'unreachable') return { status: 'unreachable', reason: 'no-route' };
  const edge = graph.edges[result.roadIndex];
  const to = onRoad ? result.direction === -1 : result.direction === 1;
  const cityIndex = to ? edge.toCityIndex : edge.fromCityIndex;
  if (readOwner(cityIndex) !== owner) return { status: 'unreachable', reason: 'foreign-next-city' };
  return { status: 'found', cityIndex };
}
