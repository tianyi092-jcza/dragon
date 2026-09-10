import assert from "node:assert/strict";

import { MapView } from "../web/src/render/mapview.js";

let widthWrites = 0;
let heightWrites = 0;
let backingWidth = 0;
let backingHeight = 0;
const transforms = [];
const ctx = {
  fillRect() {},
  setTransform(...values) {
    transforms.push(values);
  },
};
const canvas = {
  get width() {
    return backingWidth;
  },
  set width(value) {
    widthWrites++;
    backingWidth = value;
  },
  get height() {
    return backingHeight;
  },
  set height(value) {
    heightWrites++;
    backingHeight = value;
  },
  getContext() {
    return ctx;
  },
};

globalThis.innerWidth = 640;
globalThis.innerHeight = 400;
globalThis.devicePixelRatio = 2;
const view = new MapView(canvas, () => null);
view.app = { gameStarted: true };
view.draw();
assert.equal(backingWidth, 1280);
assert.equal(backingHeight, 800);
assert.deepEqual(transforms, [[2, 0, 0, 2, 0, 0]]);
assert.equal(widthWrites, 1);
assert.equal(heightWrites, 1);

view.draw();
assert.equal(
  widthWrites,
  1,
  "unchanged viewport must not reallocate canvas width",
);
assert.equal(
  heightWrites,
  1,
  "unchanged viewport must not reallocate canvas height",
);
assert.equal(transforms.length, 1);

globalThis.innerWidth = 800;
globalThis.innerHeight = 600;
globalThis.devicePixelRatio = 1.5;
view.draw();
assert.equal(backingWidth, 1200);
assert.equal(backingHeight, 900);
assert.deepEqual(transforms.at(-1), [1.5, 0, 0, 1.5, 0, 0]);
assert.equal(widthWrites, 2);
assert.equal(heightWrites, 2);

process.stdout.write(
  "map canvas resize OK: backing store changes only for viewport/DPR changes\n",
);
