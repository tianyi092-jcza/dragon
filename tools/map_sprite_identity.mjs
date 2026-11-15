// Offline catalog identity only. Never grants placement or merges source definitions.
// Inputs are schema-validated component definitions from the registered source/planner.
export function mapSpriteIdentity(definition) {
  const { id, name, evidenceRef, footprint, anchor, variants, ...semantics } = definition;
  const minX = Math.min(...footprint.map(([x]) => x));
  const minY = Math.min(...footprint.map(([, y]) => y));
  const ordered = rows => rows.toSorted((a, b) => a[1] - b[1] || a[0] - b[0]);
  // Object-key order is irrelevant; array order is preserved except explicit cell sets.
  const canonical = value => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value !== null && typeof value === 'object') return Object.fromEntries(
      Object.keys(value).sort().map(key => [key, canonical(value[key])]),
    );
    return value;
  };
  return JSON.stringify(canonical({
    ...semantics,
    footprint: ordered(footprint.map(([x, y]) => [x - minX, y - minY])),
    anchor: [anchor[0] - minX, anchor[1] - minY],
    variants: Object.fromEntries(Object.entries(variants).map(([key, variant]) => [key, {
      ...variant,
      tiles: ordered(variant.tiles.map(([x, y, byte]) => [x - minX, y - minY, byte])),
    }])),
  }));
}
