// Authoring copies only. These fields already belong to the named content schema;
// capacity, identities, roads and unknown compatibility bytes are not editable.
export const CITY_FIELDS = Object.freeze({
  max_prod: 65535, prod: 65535, growth: 255, defence: 255,
  troops: 255, troops_cap: 255,
});
export function editCity(document, index, field, value) {
  if (!Number.isInteger(index) || index < 0 || index >= 192 ||
      !Object.hasOwn(CITY_FIELDS, field) || !Number.isInteger(value) ||
      value < 0 || value > CITY_FIELDS[field]) throw new TypeError('Invalid city edit');
  const copy = structuredClone(document);
  if (copy.state?.cities?.length !== 192 || copy.state.cities[index].idx !== index)
    throw new TypeError('Invalid fixed city table');
  copy.state.cities[index][field] = value;
  return copy;
}
export function editTile(layout, x, y, tile) {
  if (layout.length !== 256 || layout.some((row) => row.length !== 384) ||
      !Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= 384 || y < 0 || y >= 256 ||
      !Number.isInteger(tile) || tile < 0 || tile > 255) throw new TypeError('Invalid tile edit');
  const copy = layout.map((row) => row.slice());
  copy[y][x] = tile;
  return copy;
}
export async function sourceDigest(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
