// Read-only fixed-domain presentation projection. The shared compiler owns the tile plane.
// No DOM, rule/RNG writes or runtime/permission certificate; atlas samples must be opaque.
export const TILE_PIXEL_REVISION = 'fixed-tile-pixels-1-rows';
export const TILE_WINDOW_PIXEL_REVISION = 'fixed-tile-window-1-rows';
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
// Pixel-space rectangle, not tile coordinates or a rule-map resize. Only rows
// inside the window are allocated; the input plane and atlas are captured once.
// MAP-EXT E6: tilesWide is the tile-plane width (default origin 384).
// Origin callers keep exact behavior; extended planes pass compiled.width.
export function createFixedTileWindowRows(plane, atlasRGBA, rectangle, tilesWide = 384) {
  if (!rectangle || ![Object.prototype, null].includes(Object.getPrototypeOf(rectangle))) throw new TypeError('plain pixel rectangle required');
  const descriptors = Object.getOwnPropertyDescriptors(rectangle), keys = Reflect.ownKeys(descriptors);
  if (keys.length !== 4 || ['x', 'y', 'width', 'height'].some(key => !Object.hasOwn(descriptors, key) || !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], 'value') || !Number.isSafeInteger(descriptors[key].value) || Object.is(descriptors[key].value, -0))) throw new TypeError('integer pixel rectangle fields required');
  const { x: { value: x }, y: { value: y }, width: { value: width }, height: { value: height } } = descriptors;
  if (!Number.isInteger(tilesWide) || tilesWide < 384 || tilesWide > 424) throw new RangeError('unsupported tile plane width');
  bytes(plane, plane.length);
  if (!Number.isInteger(plane.length / tilesWide)) throw new TypeError('fixed tile plane length required');
  if (x < 0 || y < 0 || width < 1 || height < 1 || x + width > tilesWide * 16 || y + height > (plane.length / tilesWide) * 16) throw new RangeError('pixel window outside fixed map');
  const layout = bytes(plane, plane.length), atlas = bytes(atlasRGBA, 256 * 256 * 4);
  for (let at = 3; at < atlas.length; at += 4) if (atlas[at] !== 255) throw new RangeError('opaque fixed atlas required');
  return Object.freeze({
    revision: TILE_WINDOW_PIXEL_REVISION, x, y, width, height,
    *[Symbol.iterator]() {
      for (let worldY = y; worldY < y + height; worldY++) {
        const row = new Uint8Array(width * 4), base = (worldY >>> 4) * tilesWide;
        for (let column = 0; column < width;) {
          const worldX = x + column, tile = layout[base + (worldX >>> 4)];
          const count = Math.min(width - column, 16 - (worldX & 15));
          const source = (((tile >>> 4) * 16 + (worldY & 15)) * 256 + (tile & 15) * 16 + (worldX & 15)) * 4;
          row.set(atlas.subarray(source, source + count * 4), column * 4);
          column += count;
        }
        yield row;
      }
    },
  });
}
// MAP-EXT E6: tilesWide is the tile-plane width (default origin 384).
export function createFixedTileRows(plane, atlasRGBA, tilesWide = 384) {
  if (!Number.isInteger(tilesWide) || tilesWide < 384 || tilesWide > 424) throw new RangeError('unsupported tile plane width');
  bytes(plane, plane.length);
  const tilesHigh = plane.length / tilesWide;
  if (!Number.isInteger(tilesHigh)) throw new TypeError('fixed tile plane length required');
  if (tilesHigh < 256 || tilesHigh > 296) throw new RangeError('unsupported tile plane height');
  // Capture immediately, not at the first generator.next()/await.
  const layout = bytes(plane, plane.length), atlas = bytes(atlasRGBA, 256 * 256 * 4);
  for (let at = 3; at < atlas.length; at += 4) if (atlas[at] !== 255) throw new RangeError('opaque fixed atlas required');
  return Object.freeze({
    revision: TILE_PIXEL_REVISION, width: tilesWide * 16, height: tilesHigh * 16,
    *[Symbol.iterator]() {
      for (let y = 0; y < tilesHigh * 16; y++) {
        const row = new Uint8Array(tilesWide * 16 * 4), base = (y >>> 4) * tilesWide, inTileY = y & 15;
        for (let x = 0; x < tilesWide; x++) {
          const tile = layout[base + x], source = (((tile >>> 4) * 16 + inTileY) * 256 + (tile & 15) * 16) * 4;
          row.set(atlas.subarray(source, source + 64), x * 64);
        }
        yield row;
      }
    },
  });
}
