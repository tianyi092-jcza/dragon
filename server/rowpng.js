// Bounded standard PNG row I/O, not a game source/Job/runtime capability.
// One row + native backpressure queues; never materialize the uncompressed whole image.
import { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createDeflate, crc32 } from 'node:zlib';
export const ROW_PNG_REVISION = 'png-rgba8-rows-1';
export class RowPNGError extends Error { constructor(code) { super(code); this.name = 'RowPNGError'; this.code = code; } }
const fail = code => { throw new RowPNGError(code); };
function copyRow(input, expected) {
  const prototype = Object.getPrototypeOf(Uint8Array.prototype), get = name => Object.getOwnPropertyDescriptor(prototype, name).get.call(input);
  let buffer, offset;
  try {
    if (get(Symbol.toStringTag) !== 'Uint8Array' || get('byteLength') !== expected) fail('ROW_PNG_ROW');
    buffer = get('buffer'); offset = get('byteOffset');
    Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength').get.call(buffer);
    if (Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'resizable')?.get.call(buffer)) fail('ROW_PNG_ROW');
  } catch { fail('ROW_PNG_ROW'); }
  const row = Buffer.alloc(expected + 1); row.set(new Uint8Array(buffer, offset, expected), 1); return row;
}
function chunk(type, body) {
  const value = Buffer.alloc(body.length + 12); value.writeUInt32BE(body.length); value.write(type, 4, 'ascii'); value.set(body, 8); value.writeUInt32BE(crc32(value.subarray(4, value.length - 4)), value.length - 4); return value;
}
export async function encodeRowPNG(rows, width, height) {
  if (!Number.isSafeInteger(width) || width < 1 || width > 6144 || !Number.isSafeInteger(height) || height < 1 || height > 4096 || width * height > 6144 * 4096) fail('ROW_PNG_DIMENSIONS');
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const parts = [Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header)]; let length = 33, count = 0;
  function append(part) { length += part.length; if (length > 16 * 1024 * 1024) fail('ROW_PNG_OUTPUT_BUDGET'); parts.push(part); }
  const input = Readable.from((async function* () {
    for await (const row of rows) {
      if (++count > height) fail('ROW_PNG_ROW_COUNT');
      yield copyRow(row, width * 4);
    }
    if (count !== height) fail('ROW_PNG_ROW_COUNT');
  })(), { objectMode: false, highWaterMark: 32768 });
  const compressor = createDeflate({ level: 6, chunkSize: 65536 });
  const output = new Writable({ highWaterMark: 65536, write(value, _encoding, next) {
    try { append(chunk('IDAT', value)); next(); } catch (error) { next(error); }
  } });
  try {
    await pipeline(input, compressor, output);
    append(chunk('IEND', Buffer.alloc(0))); return Buffer.concat(parts, length);
  } finally {
    input.destroy(); compressor.destroy(); output.destroy();
  }
}
