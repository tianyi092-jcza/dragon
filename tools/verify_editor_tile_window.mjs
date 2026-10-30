// Read-only pinned Web assets; no DOS SAVE, database, browser or runtime admission.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as tiles from '../web/src/content/authoring/tilepixels.js';
import { decodePNG } from '../server/pngio.js';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
assert.equal(typeof tiles.createFixedTileWindowRows, 'function', 'bounded tile window renderer required');
const manifestBytes = readFileSync('server/pinned/world-manifest.txt');
assert.equal(sha(manifestBytes), 'bde6dfc8a82da5597ef22786e46681c87f2fe21cd55dd23921b32e346efa95e9');
let manifest;
try { manifest = JSON.parse(manifestBytes.toString('utf8')); } catch (cause) { throw new Error('fixed manifest JSON invalid', { cause }); }
const inputs = {};
function asset(name) {
  const row = manifest.assets.find(row => row.path === name); assert.ok(row);
  const path = `web/${row.url}`, data = readFileSync(path);
  assert.equal(data.length, row.byteLength); assert.equal(sha(data), row.sha256); inputs[path] = sha(data); return data;
}
const plane = Uint8Array.from(asset('terrain.bin'));
const windows = [
  { x: 0, y: 0, width: 1, height: 1 }, { x: 15, y: 15, width: 33, height: 35 },
  { x: 3111, y: 2053, width: 257, height: 19 }, { x: 6127, y: 4079, width: 17, height: 17 },
  { x: 0, y: 2047, width: 6144, height: 2 }, { x: 6143, y: 4095, width: 1, height: 1 },
];
let comparisons = 0, getters = 0, groups = 0;
for (const season of ['spring', 'summer', 'autumn', 'winter']) {
  const atlas = decodePNG(asset(`map_atlas_${season}.png`)); assert.equal(atlas.width, 256); assert.equal(atlas.height, 256);
  const needed = new Set(windows.flatMap(rect => Array.from({ length: rect.height }, (_, i) => rect.y + i))), rows = new Map();
  let y = 0; for (const row of tiles.createFixedTileRows(plane, atlas.pixels)) { if (needed.has(y)) rows.set(y, row); y++; }
  assert.equal(y, 4096);
  for (const rect of windows) {
    const output = tiles.createFixedTileWindowRows(plane, atlas.pixels, rect);
    assert.equal(output.revision, tiles.TILE_WINDOW_PIXEL_REVISION); assert.equal(Object.isFrozen(output), true);
    assert.equal(output.width, rect.width); assert.equal(output.height, rect.height); assert.equal(output.x, rect.x); assert.equal(output.y, rect.y);
    let at = 0;
    for (const row of output) { assert.equal(row.byteLength, rect.width * 4); assert.deepEqual(row, rows.get(rect.y + at).slice(rect.x * 4, (rect.x + rect.width) * 4)); at++; comparisons++; }
    assert.equal(at, rect.height);
  }
  const edited = plane.slice(), oldPixel = rows.get(0).subarray(0, 4);
  const editedTile = Array.from({ length: 256 }, (_, i) => i).find(tile => {
    const at = ((tile >>> 4) * 16 * 256 + (tile & 15) * 16) * 4;
    return !atlas.pixels.subarray(at, at + 4).every((byte, index) => byte === oldPixel[index]);
  });
  assert.notEqual(editedTile, undefined); edited[0] = editedTile;
  const editedWindow = [...tiles.createFixedTileWindowRows(edited, atlas.pixels, { x: 0, y: 0, width: 16, height: 16 })];
  let editedRow = 0;
  for (const row of tiles.createFixedTileRows(edited, atlas.pixels)) { assert.deepEqual(editedWindow[editedRow], row.slice(0, 64)); comparisons++; if (++editedRow === 16) break; }
  assert.notDeepEqual(editedWindow[0].slice(0, 4), oldPixel);
  const layout = plane.slice(), pixels = atlas.pixels.slice(), rect = { x: 15, y: 15, width: 33, height: 2 };
  const captured = tiles.createFixedTileWindowRows(layout, pixels, rect);
  layout.fill(0); pixels.fill(0); rect.x = 0; rect.width = 1;
  const first = [...captured]; assert.deepEqual(first[0], rows.get(15).slice(60, 192));
  first[0].fill(0); assert.deepEqual([...captured][0], rows.get(15).slice(60, 192));
  assert.deepEqual(plane, Uint8Array.from(asset('terrain.bin'))); groups++;
}
const opaque = new Uint8Array(256 * 256 * 4); for (let at = 3; at < opaque.length; at += 4) opaque[at] = 255;
const valid = { x: 0, y: 0, width: 1, height: 1 };
for (const rect of [null, [], { ...valid, x: -1 }, { ...valid, x: -0 }, { ...valid, y: 4096 }, { ...valid, width: 0 }, { ...valid, height: 4097 }, { ...valid, x: 6143, width: 2 }, { ...valid, y: 4095, height: 2 }, { ...valid, width: 1.5 }, { ...valid, height: NaN }, { ...valid, extra: 1 }, { x: 0, y: 0, width: 1 }]) assert.throws(() => tiles.createFixedTileWindowRows(plane, opaque, rect));
const accessor = { ...valid }; Object.defineProperty(accessor, 'x', { enumerable: true, get() { getters++; return 0; } });
assert.throws(() => tiles.createFixedTileWindowRows(plane, opaque, accessor)); assert.equal(getters, 0);
for (const data of [[], new Uint8Array(98303), new Uint8Array(new SharedArrayBuffer(98304)), new Uint8Array(new ArrayBuffer(98304, { maxByteLength: 98305 })), new DataView(new ArrayBuffer(98304))]) assert.throws(() => tiles.createFixedTileWindowRows(data, opaque, valid));
opaque[3] = 0; assert.throws(() => tiles.createFixedTileWindowRows(plane, opaque, valid), /opaque/); groups++;
for (const [path, digest] of Object.entries(inputs)) assert.equal(sha(readFileSync(path)), digest);
process.stdout.write(`${JSON.stringify({ groups, comparisons, getters, inputs, scope: 'fixed four-season window pixels equal full-row crops; no canvas, HTTP, author permission or runtime admission' })}\n`);
