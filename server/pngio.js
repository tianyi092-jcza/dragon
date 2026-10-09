// Bounded raw-sample PNG I/O adapter. No DOM, color-management, identity or runtime grant.
import { inflateSync, deflateSync } from 'node:zlib';
export const PNG_IO_REVISION = 'png-io-2-noninterlaced8-indexed124';
const MAX_BYTES = 16 * 1024 * 1024, MAX_PIXELS = 4 * 1024 * 1024;
const signature = Buffer.from('89504e470d0a1a0a', 'hex');
const typed = Object.getPrototypeOf(Uint8Array.prototype), getter = name => Object.getOwnPropertyDescriptor(typed, name).get;
const bufferGetter = getter('buffer'), offsetGetter = getter('byteOffset'), lengthGetter = getter('byteLength'), tagGetter = getter(Symbol.toStringTag);
const arrayLength = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength').get;
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ c >>> 1 : c >>> 1; crcTable[n] = c >>> 0; }
export class PNGError extends Error { constructor(code) { super(code); this.name = 'PNGError'; this.code = code; } }
const fail = code => { throw new PNGError(code); };
function capture(value) {
  let buffer, offset, length;
  try { if (!ArrayBuffer.isView(value) || tagGetter.call(value) !== 'Uint8Array') fail('PNG_INPUT_TYPE'); buffer = bufferGetter.call(value); offset = offsetGetter.call(value); length = lengthGetter.call(value); arrayLength.call(buffer); }
  catch { fail('PNG_INPUT_TYPE'); }
  if (!length || length > MAX_BYTES) fail('PNG_BYTE_BUDGET');
  const copy = new Uint8Array(length); copy.set(new Uint8Array(buffer, offset, length)); return Buffer.from(copy.buffer);
}
function dimensions(width, height) { if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 8192 || height > 8192 || width * height > MAX_PIXELS) fail('PNG_PIXEL_BUDGET'); }
function crc(bytes) { let c = 0xffffffff; for (const value of bytes) c = crcTable[(c ^ value) & 255] ^ c >>> 8; return (c ^ 0xffffffff) >>> 0; }
function chunk(type, body) { const result = Buffer.alloc(body.length + 12); result.writeUInt32BE(body.length); result.write(type, 4, 4, 'ascii'); result.set(body, 8); result.writeUInt32BE(crc(result.subarray(4, result.length - 4)), result.length - 4); return result; }
function paeth(a, b, c) { const p = a + b - c, x = Math.abs(p - a), y = Math.abs(p - b), z = Math.abs(p - c); if (x <= y && x <= z) return a; return y <= z ? b : c; }
export function decodePNG(value) {
  const input = capture(value); if (input.length < 33 || !input.subarray(0, 8).equals(signature)) fail('PNG_SIGNATURE');
  let at = 8, count = 0, width, height, type, depth, channels, palette, transparency, sawData = false, dataClosed = false, ended = false; const compressed = [];
  while (at < input.length) {
    if (++count > 4096) fail('PNG_CHUNK_BUDGET'); if (input.length - at < 12) fail('PNG_TRUNCATED');
    const length = input.readUInt32BE(at), end = at + length + 12; if (end > input.length) fail('PNG_TRUNCATED');
    const kind = input.toString('ascii', at + 4, at + 8), body = input.subarray(at + 8, end - 4);
    if (!/^[A-Za-z]{2}[A-Z][A-Za-z]$/.test(kind) || input.subarray(at + 4, at + 8).some(b => b > 127)) fail('PNG_CHUNK_TYPE');
    if (crc(input.subarray(at + 4, end - 4)) !== input.readUInt32BE(end - 4)) fail('PNG_CRC');
    if (count === 1 && kind !== 'IHDR') fail('PNG_CHUNK_ORDER');
    if (sawData && kind !== 'IDAT') dataClosed = true;
    if (kind === 'IHDR') {
      if (count !== 1 || length !== 13) fail('PNG_IHDR'); width = body.readUInt32BE(0); height = body.readUInt32BE(4); dimensions(width, height); type = body[9]; depth = body[8];
      if (!(depth === 8 || type === 3 && [1, 2, 4].includes(depth)) || ![0, 2, 3, 4, 6].includes(type) || body[10] || body[11] || body[12]) fail('PNG_UNSUPPORTED_FORMAT'); channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
    } else if (kind === 'PLTE') {
      if (sawData || palette || transparency || type === 0 || type === 4 || !length || length > 768 || type === 3 && length / 3 > 2 ** depth || length % 3) fail('PNG_PALETTE'); palette = body;
    } else if (kind === 'tRNS') {
      if (sawData || transparency || type === 4 || type === 6) fail('PNG_TRANSPARENCY');
      if (type === 3) { if (!palette || !length || length > palette.length / 3) fail('PNG_TRANSPARENCY'); }
      else if (length !== (type === 0 ? 2 : 6) || Array.from({ length: length / 2 }, (_, i) => body.readUInt16BE(i * 2)).some(n => n > 255)) fail('PNG_TRANSPARENCY');
      transparency = body;
    } else if (kind === 'IDAT') {
      if (dataClosed || type === 3 && !palette) fail('PNG_CHUNK_ORDER'); sawData = true; compressed.push(body);
    } else if (kind === 'IEND') {
      if (length || !sawData || end !== input.length) fail('PNG_IEND'); ended = true; at = end; break;
    } else {
      if (kind[0] === kind[0].toUpperCase()) fail('PNG_UNKNOWN_CRITICAL');
      // Animation and unsupported color profiles cannot silently become one plain image.
      if (['acTL', 'fcTL', 'fdAT', 'iCCP', 'gAMA', 'cHRM', 'cICP', 'mDCV', 'cLLI'].includes(kind)) fail('PNG_UNSUPPORTED_METADATA');
    }
    at = end;
  }
  if (!ended) fail('PNG_IEND'); const encoded = Buffer.concat(compressed), stride = Math.ceil(width * channels * depth / 8), expected = (stride + 1) * height; if (!encoded.length) fail('PNG_DEFLATE');
  let inflated; try { const result = inflateSync(encoded, { info: true, maxOutputLength: expected }); if (result.engine.bytesWritten !== encoded.length) fail('PNG_DEFLATE_TRAILING'); inflated = result.buffer; }
  catch (error) { if (error instanceof PNGError) throw error; fail('PNG_DEFLATE'); }
  if (inflated.length !== expected) fail('PNG_SCANLINE_LENGTH');
  const pixels = new Uint8Array(width * height * 4), prior = new Uint8Array(stride), row = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const base = y * (stride + 1), filter = inflated[base]; if (filter > 4) fail('PNG_FILTER');
    for (let x = 0; x < stride; x++) { const left = x >= channels ? row[x - channels] : 0, up = prior[x], corner = x >= channels ? prior[x - channels] : 0; let prediction = 0; if (filter === 1) prediction = left; else if (filter === 2) prediction = up; else if (filter === 3) prediction = Math.floor((left + up) / 2); else if (filter === 4) prediction = paeth(left, up, corner); row[x] = (inflated[base + 1 + x] + prediction) & 255; }
    for (let x = 0; x < width; x++) {
      const from = x * channels, to = (y * width + x) * 4; let r, g, b, alpha = 255;
      if (type === 3) { const bitOffset = x * depth, index = (row[bitOffset >>> 3] >>> (8 - depth - (bitOffset & 7))) & ((1 << depth) - 1); if (index * 3 >= palette.length) fail('PNG_PALETTE_INDEX'); r = palette[index * 3]; g = palette[index * 3 + 1]; b = palette[index * 3 + 2]; alpha = transparency?.[index] ?? 255; }
      else if (type === 0 || type === 4) { r = g = b = row[from]; if (type === 4) alpha = row[from + 1]; else if (transparency && r === transparency.readUInt16BE(0)) alpha = 0; }
      else { r = row[from]; g = row[from + 1]; b = row[from + 2]; if (type === 6) alpha = row[from + 3]; else if (transparency && r === transparency.readUInt16BE(0) && g === transparency.readUInt16BE(2) && b === transparency.readUInt16BE(4)) alpha = 0; }
      pixels[to] = r; pixels[to + 1] = g; pixels[to + 2] = b; pixels[to + 3] = alpha;
    }
    prior.set(row);
  }
  return { width, height, pixels };
}
export function encodePNG(value, width, height, channels = 4) {
  dimensions(width, height); if (channels !== 3 && channels !== 4) fail('PNG_INPUT_CHANNELS'); const pixels = capture(value); if (pixels.length !== width * height * channels) fail('PNG_PIXEL_LENGTH');
  const stride = width * channels, raw = Buffer.alloc((stride + 1) * height), header = Buffer.alloc(13);
  for (let y = 0; y < height; y++) raw.set(pixels.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = channels === 3 ? 2 : 6;
  const result = Buffer.concat([signature, chunk('IHDR', header), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]); if (result.length > MAX_BYTES) fail('PNG_BYTE_BUDGET'); return result;
}
