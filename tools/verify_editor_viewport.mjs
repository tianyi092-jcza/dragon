// Pure editor geometry. No files/network/game state or guessed rule values.
import assert from "node:assert/strict";
import { clampViewport, screenToWorld, worldToScreen, zoomAt, fitViewport, panViewport, edgePanDelta, ZOOM_MIN, ZOOM_MAX } from "../web/src/editor/viewport.js";
const world = { width: 6144, height: 4096 }, size = { width: 704, height: 573 };
const view = { x: 2000, y: 1000, zoom: 1 }, snapshot = JSON.stringify({ world, size, view });
const random = Math.random, now = Date.now; Math.random = () => { throw new Error("no ambient RNG"); }; Date.now = () => { throw new Error("no wall-clock read in geometry"); };
let checks = 0;
try {
  for (const zoom of [ZOOM_MIN, 0.125, 0.25, 0.5, 1, 2, ZOOM_MAX]) for (const point of [[0, 0], [350, 280], [6144, 4096]]) {
    const v = { ...view, zoom }, screen = worldToScreen(v, ...point), back = screenToWorld(v, ...screen);
    assert.ok(back.every((x, i) => Math.abs(x - point[i]) < 1e-8)); checks++;
  }
  const anchor = [350, 280], zoomed = zoomAt(view, 2, anchor, size, world);
  assert.deepEqual(screenToWorld(zoomed, ...anchor), screenToWorld(view, ...anchor)); checks++;
  assert.deepEqual(zoomAt(zoomed, 1, anchor, size, world), view); checks++;
  const atEnd = clampViewport({ x: 999999, y: 999999, zoom: 1 }, size, world);
  assert.equal(atEnd.x, world.width - size.width); assert.equal(atEnd.y, world.height - size.height); checks++;
  const fit = fitViewport(size, world); assert.ok(fit.zoom >= ZOOM_MIN && fit.zoom <= ZOOM_MAX);
  const left = worldToScreen(fit, 0, 0), right = worldToScreen(fit, world.width, world.height);
  assert.ok(left[0] >= -1e-8 && left[1] >= -1e-8 && right[0] <= size.width + 1e-8 && right[1] <= size.height + 1e-8); checks++;
  assert.deepEqual(panViewport(fit, 123, -456, size, world), fit); checks++;
  assert.deepEqual(edgePanDelta([352, 286], size, 10000), [0, 0]); checks++;
  assert.deepEqual(edgePanDelta([-99, -99], size, 10000), [-32, -32]); checks++;
  assert.deepEqual(edgePanDelta([99999, 99999], size, 10000), [32, 32]); checks++;
  assert.deepEqual(edgePanDelta([10, 10], size, -1), [0, 0]); checks++;
  assert.equal(panViewport(view, 100, 0, size, world).x, 2100);
  assert.equal(panViewport({ ...view, zoom: 2 }, 100, 0, size, world).x, 2050); checks++;
  for (const action of [() => zoomAt(view, NaN, anchor, size, world), () => zoomAt(view, 0, anchor, size, world),
    () => clampViewport({ ...view, zoom: Infinity }, size, world), () => fitViewport({ width: 0, height: 10 }, world),
    () => panViewport(view, Infinity, 0, size, world), () => edgePanDelta([NaN, 0], size, 16)]) assert.throws(action, RangeError);
  assert.equal(JSON.stringify({ world, size, view }), snapshot);
} finally { Math.random = random; Date.now = now; }
process.stdout.write(JSON.stringify({ result: "PASS-SCOPED", checks, negativeControls: 6, coverage: "editor geometry only; no engine expansion, runtime rule or account claim" }) + "\n");
