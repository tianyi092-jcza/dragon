// CITY-CAPACITY-1: Web resource identities, not strategic city indices.
// 192 is the existing siege RESOURCE library size; field directories are excluded.
// This captures directory metadata only. Navigation/assets retain their own gates.
export function createSiegeMapCatalog(battleMaps) {
  const directory = battleMaps?.directory;
  if (!Array.isArray(directory) || directory.length < 192)
    throw new RangeError('complete siege map directory required');
  const entries = Array.from({ length: 192 }, (_, idx) => {
    const entry = directory[idx];
    if (entry?.idx !== idx || !Number.isInteger(entry.layout) ||
        entry.layout < 0 || entry.layout > 255 || !Number.isInteger(entry.theme) ||
        entry.theme < 0 || entry.theme > 255)
      throw new RangeError(`invalid siege map directory entry: ${idx}`);
    const battleMapId = `ki-1995:siege:${idx}`;
    return [battleMapId, Object.freeze({ battleMapId, idx, layout: entry.layout, theme: entry.theme })];
  });
  return Object.freeze(Object.fromEntries(entries));
}

// catalog is the captured immutable directory. No implicit city-index fallback.
export function resolveSiegeMap(catalog, battleMapId) {
  if (!Object.hasOwn(catalog, battleMapId))
    throw new RangeError(`unknown siege battleMapId: ${String(battleMapId)}`);
  return catalog[battleMapId];
}
