// CITY-CAPACITY-1 §9.3: pure authoring identity projection, not runtime admission.
// Owns center identity/coordinates; the caller owns source schema, footprints,
// chapter references and rule inputs. Bounds stay 384x256 (Web product contract).
// Not wired into the fixed-v1 compiler until the whole new contract is ready.
export function compileCityIdentity({ cities, cityOrder, placements }) {
  if (!cities || typeof cities !== 'object' || Array.isArray(cities) ||
      !Array.isArray(cityOrder) || !Array.isArray(placements)) {
    throw new TypeError('city dictionary, order and placements required');
  }
  const ids = Object.keys(cities);
  if (ids.length !== cityOrder.length) throw new RangeError('cityOrder must cover every city');
  const ordered = new Set();
  for (const cityId of cityOrder) {
    if (typeof cityId !== 'string' || !cityId.length || ordered.has(cityId) ||
        !Object.hasOwn(cities, cityId) || cities[cityId]?.cityId !== cityId) {
      throw new RangeError('invalid or duplicate cityOrder identity');
    }
    ordered.add(cityId);
  }
  const placed = new Set(), centers = new Set();
  for (const placement of placements) {
    const cityId = placement?.cityId;
    if (!ordered.has(cityId) || placed.has(cityId)) {
      throw new RangeError('unknown or multiply placed city identity');
    }
    const { x, y } = placement;
    if (!Number.isInteger(x) || x < 0 || x >= 384 ||
        !Number.isInteger(y) || y < 0 || y >= 256) {
      throw new RangeError(`city placement outside 384x256: ${cityId}`);
    }
    const cell = y * 384 + x;
    if (centers.has(cell)) throw new RangeError(`duplicate city center: ${cityId}`);
    centers.add(cell);
    placed.add(cityId);
  }
  // Neither dictionary insertion order, placement order, name nor old slot wins.
  const cityIds = cityOrder.filter(cityId => placed.has(cityId));
  const indexByCityId = Object.fromEntries(cityIds.map((cityId, index) => [cityId, index]));
  return Object.freeze({
    cityIds: Object.freeze(cityIds),
    indexByCityId: Object.freeze(indexByCityId),
  });
}
