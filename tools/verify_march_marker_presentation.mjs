import assert from "node:assert/strict";
import { MapView, preloadMarchMarkerImages } from "../web/src/render/mapview.js";

const view = new MapView({ getContext: () => ({}) }, () => null);
view.app = { clock: { strategicTickSerial: 0 } };
for (const period of [2, 3]) {
  // 2808 checks X first even when a displayed diagonal has a larger Y delta.
  for (const [dx, dy, expected] of [[1,0,1],[-1,0,0],[0,1,3],[0,-1,2],
    [1,2,1],[-1,2,0],[1,-2,1],[-1,-2,0]]) {
    for (const nextFrame of [0, 1, 2, 3, 4]) {
      const army = Object.freeze({ prevX: 100, prevY: 100, x: 100 + dx, y: 100 + dy,
        movePeriod: period, _renderMoveSerial: 0, _markerFrame: nextFrame });
      for (let tick = 0; tick < 8 * period; tick++) {
        view.app.clock.strategicTickSerial = tick;
        const pos = view.getLegionRenderPos(army, 0);
        assert.equal(pos.frame, expected, "mid-segment direction must not use next-point/arrival frame");
        assert.ok(pos.curT < 1);
        assert.equal(pos.wxp, (100 + dx * pos.curT) * 16 + 8);
        assert.equal(pos.wyp, (100 + dy * pos.curT) * 16 + 8);
      }
      view.app.clock.strategicTickSerial = 8 * period;
      const end = view.getLegionRenderPos(army, 0);
      assert.equal(end.frame, nextFrame);
      assert.deepEqual([end.wxp, end.wyp], view.cityPixel(army));
      // Turning, then clearing prev at rest must not shift the shared anchor.
      assert.deepEqual(view.legionPixel({ ...army, prevX: army.x, prevY: army.y }),
        [end.wxp, end.wyp]);
    }
  }
}
// Delayed asset loads used to return null on first directional draw.
const images = [];
globalThis.Image = class {
  constructor() { images.push(this); }
  set src(value) { this.url = value; }
};
let ready = false;
const pending = preloadMarchMarkerImages().then(() => { ready = true; });
assert.equal(images.length, 120);
for (const image of images.slice(0, -1)) image.onload();
await Promise.resolve();
assert.equal(ready, false, "ready barrier includes the last direction");
images.at(-1).onload();
await pending;
let drawn = 0;
for (let style = 0; style < 24; style++) for (let frame = 0; frame < 5; frame++) {
  view._drawMarchingIcon({ drawImage(image, x, y) {
    assert.equal(image.url, `grf/march_markers/style_${String(style).padStart(2, "0")}_frame_${frame}.png`);
    assert.deepEqual([x, y], [92, 92], "all 120 frames share one 16x16 origin");
    drawn++;
  } }, 100, 100, style, frame);
}
assert.equal(drawn, 120, "all first draws are nonblank after asset barrier");
assert.equal(images.length, 120, "changing directions creates no new loads");
delete globalThis.Image;
process.stdout.write("march marker presentation OK: tile-center anchors, X-first diagonals, both periods, turn/arrival boundaries, delayed image readiness\n");
