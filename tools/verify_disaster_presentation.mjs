import assert from 'node:assert/strict';
import { DisasterPresentation, preloadDisasterObjectImages } from '../web/src/render/disasterpresentation.js';
const images = [];
globalThis.Image = class { constructor() { images.push(this); } set src(value) { this.url = value; } };
try {
  let ready = 0;
  const loading = preloadDisasterObjectImages(() => ready++);
  assert.equal(images.length, 16);
  for (const image of images) image.onload();
  await loading;
  assert.equal(ready, 16);
  const player = new DisasterPresentation();
  const camera = Object.freeze({ x: -10, y: -20, scale: 1 });
  const viewport = { width: 1024, height: 768 };
  const draws = [], ctx = { drawImage(...args) { draws.push(args); } };
  const object = (group, frame, extra = {}) => Object.freeze({ active: true, group, frame, x: 10, y: 20, timer: 1, interval: 16, ...extra });
  for (let frame = 0; frame < 8; frame++) {
    const slots = Array(17).fill(null);
    slots[0] = object(1, frame);
    slots[2] = object(2, frame);
    slots[3] = object(1, frame, { active: false });
    slots[15] = object(2, frame, { x: 500 }); // culled
    slots[16] = object(1, frame); // fixed capacity, not drawn
    const sc = Object.freeze({ disasterMapObjects: Object.freeze(slots) });
    const before = JSON.stringify(sc);
    draws.length = 0;
    player.draw(ctx, sc, camera, 16, viewport);
    assert.equal(draws.length, 2);
    assert.equal(draws[0][0].url, `grf/disaster/fire_frame_${frame}.png`);
    assert.equal(draws[1][0].url, `grf/disaster/riot_frame_${frame}.png`);
    assert.deepEqual(draws[0].slice(1), [118, 268, 80, 80]);
    const first = draws.slice(); draws.length = 0;
    player.draw(ctx, sc, camera, 16, viewport);
    assert.deepEqual(draws, first, 'repeated drawing never advances a phase');
    assert.equal(JSON.stringify(sc), before);
  }
  draws.length = 0;
  player.draw(ctx, { disasterMapObjects: [] }, camera, 16, viewport);
  assert.equal(draws.length, 0, 'removal/scenario replacement has no retained tail');
  const slots = Array(16).fill(null); slots[15] = object(2, 1); slots[0] = object(1, 1);
  player.draw(ctx, { disasterMapObjects: slots }, camera, 16, viewport);
  assert.ok(draws[0][0].url.includes('fire')); assert.ok(draws[1][0].url.includes('riot'));
  assert.equal(images.length, 16, 'no per-draw loads');
  process.stdout.write('disaster presentation OK: eight original phases, slot order/capacity, immutable inputs, immediate removal, repeatability\n');
} finally { delete globalThis.Image; }
