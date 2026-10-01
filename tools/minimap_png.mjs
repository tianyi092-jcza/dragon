// Node PNG IO adapter only; pixels come from the shared pure minimap renderer.
import assert from "node:assert/strict";
import { deflateSync, crc32 } from "node:zlib";
function chunk(type, bytes) {
  const value = Buffer.concat([Buffer.from(type), bytes]), length = Buffer.alloc(4), checksum = Buffer.alloc(4);
  length.writeUInt32BE(bytes.length); checksum.writeUInt32BE(crc32(value));
  return Buffer.concat([length, value, checksum]);
}
export function encodeMinimapPNG(pixels, width, height) {
  assert.ok(Number.isInteger(width) && width > 0 && width <= 250);
  assert.ok(Number.isInteger(height) && height > 0 && height <= 167);
  assert.equal(pixels.length, width * height * 3);
  const raw = Buffer.alloc(height * (width * 3 + 1)), header = Buffer.alloc(13);
  for (let y = 0; y < height; y++) Buffer.from(pixels.subarray(y * width * 3, (y + 1) * width * 3)).copy(raw, y * (width * 3 + 1) + 1);
  header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
