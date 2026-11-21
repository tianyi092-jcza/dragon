// World coordinates stay fixed. Only dense plane indices move. Isolated authoring
// experiment; this operation is not registered for persistent editor writes yet.
export const ORIGINAL_EXTENT = Object.freeze({ minX: 0, minY: 0, width: 384, height: 256 });
export function isNorthExtension(bounds) {
  return bounds?.width === 384 && bounds.minX === 0 && Number.isInteger(bounds.minY) && bounds.minY >= -20 && bounds.minY < 0 && bounds.height === 256 - bounds.minY;
}
export function containsTile({ minX, minY, width, height }, x, y) {
  return Number.isInteger(x) && Number.isInteger(y) && x >= minX && y >= minY && x < minX + width && y < minY + height;
}
export function extendNorthOneRow(map) {
  const { bounds, base } = map;
  if (bounds.minY <= -20) throw new RangeError('北側擴展已達 20 行');
  const width = bounds.width;
  return { ...map, bounds: { ...bounds, minY: bounds.minY - 1, height: bounds.height + 1 },
    base: { ...base, terrainRef: Array(width).fill(95).concat(base.terrainRef), geography: Array(width).fill(1).concat(base.geography),
      ...(base.unknownUnderlays && { unknownUnderlays: Object.fromEntries(Object.entries(base.unknownUnderlays).map(([i, ref]) => [Number(i) + width, ref])) }) },
    waterGroups: (map.waterGroups ?? []).map(group => ({ ...group, baseCells: group.baseCells.map(i => i + width) })) };
}
