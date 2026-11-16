// CITY-CAPACITY-1 C2: detached 47BB selection over a validated structured graph.
// The runtime boundary owns typed position/target/owner/command inputs. Position
// is a RULE cursor, not inferred XY: first-point contact can precede an XY write.
// No legion/occupancy/RNG writes, fate execution or v3 runtime admission here.
import { searchStructuredRoadGraph } from './structuredroadsearch.js';

export function selectStructuredRoad(graph, {
  position, targetCityIndex, owner, command, readCityOwner,
}) {
  const onRoad = position.kind === 'road';
  const currentEdge = onRoad ? graph.edges[position.roadIndex] : null;
  // 47CD: B is target-side endpoint, C is source-side endpoint; do not sort.
  const stops = onRoad
    ? [currentEdge.toCityIndex, currentEdge.fromCityIndex]
    : [position.cityIndex];
  if (stops.includes(targetCityIndex)) {
    if (!onRoad) return { status: 'already-there' };
    return {
      status: 'selected',
      position: { ...position, direction: targetCityIndex === currentEdge.toCityIndex ? 1 : -1 },
      hasEnteredRoad: true,
    };
  }
  const result = searchStructuredRoadGraph(graph, {
    startCityIndex: targetCityIndex, stopCityIndices: stops, owner, readCityOwner,
  });
  // D5: exhausted is not road zero, and not an automatic 291A invocation.
  if (result.status === 'unreachable') return result;
  // Retain the old cost-domain branch until the wider fee policy is approved.
  // Caller must handle this distinct result; merely querying never executes it.
  if (result.costWord >= 0x8000 && command >= 0x0a)
    return { status: 'fate-required', owner, costWord: result.costWord };
  if (onRoad) {
    return {
      status: 'selected', costWord: result.costWord,
      position: { ...position, direction: result.cityIndex === currentEdge.toCityIndex ? 1 : -1 },
      hasEnteredRoad: true,
    };
  }
  const edge = graph.edges[result.roadIndex];
  return {
    status: 'selected', costWord: result.costWord,
    position: { kind: 'road', roadIndex: result.roadIndex,
      pointIndex: result.direction === 1 ? 0 : edge.points.length - 1,
      direction: result.direction },
    hasEnteredRoad: false,
  };
}
