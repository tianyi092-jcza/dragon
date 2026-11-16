// CITY-CAPACITY-1/D1: approved Web scheduling, not a DOS city-count formula.
// One fixed 192-phase cycle visits every placed city once in cityOrder order.
export function cityPhaseRange(phase, cityCount) {
  if (!Number.isInteger(phase) || phase < 0 || phase >= 192)
    throw new RangeError('Invalid city update phase');
  if (!Number.isInteger(cityCount) || cityCount < 0 || cityCount > 384 * 256)
    throw new RangeError('Invalid city count for the fixed map');
  return {
    start: Math.floor(phase * cityCount / 192),
    end: Math.floor((phase + 1) * cityCount / 192),
    nextPhase: (phase + 1) % 192,
  };
}
