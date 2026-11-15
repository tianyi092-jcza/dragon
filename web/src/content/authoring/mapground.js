// Web product model: ocean underlay + ground silhouettes. NOT native movement,
// battle or DOS object classification. MMAP bytes still compose unchanged.
// Explicit ground contributors from the approved ground catalog (v41), excluding
// sea tile 95 inside coastal recipes. UI category edits never change this table.
export const SEA_GROUND_POLICY = 'sea-ground-1';
export const SEA_BASE_TILE = 95;
const groundTiles = new Set([
  0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
  22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 39, 40, 41,
  42, 43, 46, 47, 48, 49, 50, 51, 52, 53, 56, 57, 58, 59, 61, 62, 63, 65, 66,
  67, 68, 69, 70, 71, 73, 74, 75, 76, 77, 78, 79, 81, 82, 83, 84, 85, 86, 87,
  168, 176, 177, 178, 179, 182, 183,
]);
// Masks are semantic content, not names/categories. Capturing overlapping
// decorations must retain lower ground even when the visible top byte is a mountain.
export function componentGroundMask(def, instance) {
  const tiles = def.variants[instance.variantRef ?? 'original'].tiles;
  if (instance.minimapLand !== undefined) return instance.minimapLand ? tiles.map(([x, y]) => [x, y]) : [];
  if (def.minimapLandMask !== undefined) return def.minimapLandMask;
  if (instance.waterClass || def.authorWaterClass) return [];
  return tiles.filter(([, , tile]) => groundTiles.has(tile)).map(([x, y]) => [x, y]);
}
