// Stable first-level ownership, keyed by catalog identity rather than mutable
// secondary labels/order. This is navigation metadata, never road admission.
const roads = new Set([
  'bridge-vertical-184-v1', 'bridge-horizontal-185-v1',
  'road-ne-196-v1', 'road-nw-197-v1', 'road-se-198-v1', 'road-sw-199-v1',
  'road-horizontal-200-v1', 'road-vertical-201-v1',
  'bridge-bank-north-186-v1', 'bridge-bank-south-187-v1', 'bridge-bank-west-188-v1', 'bridge-bank-east-189-v1',
  'bridge-bank-horizontal-a-192-v1', 'bridge-bank-vertical-a-193-v1',
  'bridge-bank-horizontal-b-194-v1', 'bridge-bank-vertical-b-195-v1',
  'road-blue-pattern-191-v1', 'road-blue-pattern-202-v1',
]);
const cities = new Set([
  'roof-red-203-v1', 'roof-blue-204-v1', 'roof-yellow-205-v1',
  'gate-horizontal-red-206-v1', 'gate-horizontal-blue-207-v1', 'gate-horizontal-yellow-208-v1',
  'gate-vertical-red-209-v1', 'gate-vertical-blue-210-v1', 'gate-vertical-yellow-211-v1',
  'city-interior-axis-254-v1', 'city-interior-diagonal-255-v1', 'city-gate-cap-251-v1',
  'city-boundary-212-v1', 'city-boundary-213-v1', 'city-boundary-214-v1', 'city-boundary-215-v1',
  'city-boundary-216-v1', 'city-boundary-217-v1', 'city-boundary-218-v1', 'city-boundary-219-v1',
  'city-boundary-220-v1', 'city-boundary-221-v1',
  'city-corner-east-top-2-v1', 'city-corner-east-bottom-2-v1',
  'city-corner-south-left-2-v1', 'city-corner-south-right-2-v1',
  'city-edge-north-3-v1', 'city-edge-south-3-v1', 'city-edge-west-3-v1', 'city-edge-east-3-v1',
]);
export function catalogLayer(itemId) {
  if (itemId === 'sea-base-95-v1') return 'base';
  if (roads.has(itemId)) return 'roads';
  if (cities.has(itemId)) return 'cities';
  return 'decor';
}
