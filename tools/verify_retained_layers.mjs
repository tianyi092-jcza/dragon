import assert from 'node:assert/strict';
import { RetainedLayers } from '../web/src/render/retainedlayers.js';
// Scheduling/state test; real pixels, DPR, alpha/text and resize are covered in browser.
let fontLoaded;
const doc = { fonts: { addEventListener(_, fn) { fontLoaded = fn; } }, createElement() { return canvas(64, 64); } };
function canvas(width, height) {
  const c = { width, height, ownerDocument: doc };
  const stack = [], calls = [];
  const ctx = { canvas: c, fillStyle: '#000', globalAlpha: 1, globalCompositeOperation: 'source-over',
    save() { stack.push([this.fillStyle, this.globalAlpha, this.globalCompositeOperation]); },
    restore() { [this.fillStyle, this.globalAlpha, this.globalCompositeOperation] = stack.pop(); },
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    setTransform() {}, getLineDash: () => [], setLineDash() {},
    fillRect(...args) { calls.push(args); }, drawImage() {},
  };
  c.getContext = () => ctx; return c;
}
const main = canvas(64, 64), layers = new RetainedLayers(main), ctx = main.getContext('2d');
function draw({ object = 1, pointer = 1, scene = true } = {}) {
  const out = layers.begin(ctx);
  layers.layer('terrain', { immutableSources: true }); out.fillStyle = '#000'; out.fillRect(0, 0, 64, 64);
  if (scene) {
    layers.layer('objects'); out.fillStyle = '#fff'; out.fillRect(object, 2, 3, 4);
    layers.layer('environment');
    layers.layer('ui');
    layers.layer('cursor', { cursor: true }); out.fillRect(pointer, 3, 1, 1);
  }
  layers.finish();
}
for (let i = 0; i < 5; i++) draw();
const before = structuredClone(layers.stats);
draw(); assert.equal(layers.stats.presents, before.presents);
draw({ pointer: 2 });
assert.equal(layers.stats.rasterized.objects, before.rasterized.objects);
assert.equal(layers.stats.rasterized.terrain, before.rasterized.terrain);
draw({ scene: false }); const noScene = layers.stats.presents;
draw(); assert.ok(layers.stats.presents > noScene, 'return to previous scenario cannot reuse missing layers');
fontLoaded(); const fontCount = layers.stats.rasterized.terrain;
draw(); assert.ok(layers.stats.rasterized.terrain > fontCount);
for (let object = 2; object < 8; object++) draw({ object });
assert.ok(layers.stats.direct > 0, 'continuous movement falls back to direct drawing');
for (let i = 0; i < 40; i++) draw();
const settled = layers.stats.presents; draw(); assert.equal(layers.stats.presents, settled);
main.width = main.height = 4096;
assert.equal(layers.begin(ctx), ctx); assert.equal(layers.entries.size, 0, 'large viewport releases buffers');
process.stdout.write('retained layers OK: reuse, cursor-only, scene boundaries, fonts, moving fallback, memory cap\n');
