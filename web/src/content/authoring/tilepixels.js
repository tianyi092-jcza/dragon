// Read-only fixed-domain presentation projection. The shared compiler owns the tile plane.
// No DOM, rule/RNG writes or runtime/permission certificate; atlas samples must be opaque.
export const TILE_PIXEL_REVISION = 'fixed-tile-pixels-1-rows';
function bytes(input, length) {
  const prototype = Object.getPrototypeOf(Uint8Array.prototype);
  const get = name => Object.getOwnPropertyDescriptor(prototype, name).get.call(input);
  let buffer, offset;
  try {
    if (get(Symbol.toStringTag) !== 'Uint8Array' || get('byteLength') !== length) throw new TypeError('fixed byte view required');
    buffer = get('buffer'); offset = get('byteOffset');
    Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength').get.call(buffer);
    if (Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'resizable')?.get.call(buffer)) throw new TypeError('fixed buffer required');
  } catch (cause) { throw new TypeError('fixed unshared Uint8Array required', { cause }); }
  return new Uint8Array(new Uint8Array(buffer, offset, length));
}
export function createFixedTileRows(plane, atlasRGBA) {
  // Capture immediately, not at the first generator.next()/await.
  const layout = bytes(plane, 384 * 256), atlas = bytes(atlasRGBA, 256 * 256 * 4);
  for (let at = 3; at < atlas.length; at += 4) if (atlas[at] !== 255) throw new RangeError('opaque fixed atlas required');
  return Object.freeze({
    revision: TILE_PIXEL_REVISION, width: 6144, height: 4096,
    *[Symbol.iterator]() {
      for (let y = 0; y < 4096; y++) {
        const row = new Uint8Array(6144 * 4), base = (y >>> 4) * 384, inTileY = y & 15;
        for (let x = 0; x < 384; x++) {
          const tile = layout[base + x], source = (((tile >>> 4) * 16 + inTileY) * 256 + (tile & 15) * 16) * 4;
          row.set(atlas.subarray(source, source + 64), x * 64);
        }
        yield row;
      }
    },
  });
}
