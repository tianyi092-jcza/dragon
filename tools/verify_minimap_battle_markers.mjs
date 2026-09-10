import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import {
  MINI_MARKER_STYLES,
  drawMinimapMarker,
  minimapBattleMarkers,
} from "../web/src/render/minimapmarkers.js";

import { EngagementPresentation } from "../web/src/render/engagementpresentation.js";

// Raw visual certificate. No SAVE.DAT access.
const raw = fs.readFileSync("E:/Dragon/Dragon/KI.EXE");
assert.equal(
  createHash("sha256").update(raw).digest("hex"),
  "fffeba985231cda4d636e93d10f598470b1f691d00275e4aa38e285893d43868",
);
const bytes = (va, hex) =>
  assert.equal(
    raw.subarray(va + 0x200, va + 0x200 + hex.length / 2).toString("hex"),
    hex,
  );
bytes(0x2b3c, "800c108a5c0380e303");
bytes(0x2b99, "b43f8a4403a8017402b4fae87231c3");
bytes(0x2ba8, "8024ef2ef606a698047425");
bytes(0x5d47, "b460d3e8");
bytes(0x5d78, "b4f0d3e8");

const sc = {
  cities: [{ idx: 0, x: 100, y: 80 }],
  legions: [
    { slot: 0, target: { idx: 0 }, x: 1, y: 2 }, // ordinary march
    {
      slot: 1,
      _engagement: { kind: "siege", countdown: 11, target: { cityIdx: 0 } },
    },
    {
      slot: 2,
      _engagement: { kind: "field", countdown: 11, target: { x: 40, y: 50 } },
    },
    {
      slot: 3,
      dead: true,
      _engagement: { kind: "siege", countdown: 11, target: { cityIdx: 0 } },
    },
  ],
};
const original = structuredClone(sc);
const fx = new EngagementPresentation();
fx.update(sc, 0);
const markers = () => minimapBattleMarkers(sc, fx);
const first = markers();
assert.deepEqual([...first.keys()], [0, "field:40:50"]);
for (const marker of first.values())
  assert.equal(marker.style, MINI_MARKER_STYLES.selected);
assert.deepEqual(
  sc,
  original,
  "projection must not mutate scenario, routes or countdown",
);
sc.legions[1]._engagement.countdown--;
sc.legions[2]._engagement.countdown--;
assert.deepEqual(
  markers(),
  first,
  "rule countdown no longer determines the visual phase",
);
fx.update(sc, 100);
for (const marker of markers().values())
  assert.equal(marker.style, MINI_MARKER_STYLES.other);
const held = markers();
fx.update(sc, 5000, { paused: true });
assert.deepEqual(markers(), held, "hold freezes shared presentation phase");
sc.legions[1]._engagement = null;
sc.legions[2]._engagement.countdown = 0;
assert.equal(markers().size, 0, "no post-contact timer tail");

const rectangles = [];
const ctx = {
  fillRect(...args) {
    rectangles.push([this.fillStyle, ...args]);
  },
};
for (const style of [MINI_MARKER_STYLES.selected, MINI_MARKER_STYLES.other]) {
  rectangles.length = 0;
  drawMinimapMarker(ctx, 10.4, 20.4, style);
  assert.deepEqual(rectangles, [
    [style.border, 8, 18, 5, 5],
    [style.fill, 9, 19, 3, 3],
  ]);
}
const bar = fs.readFileSync(
  new URL("../web/src/ui/gamebar.js", import.meta.url),
  "utf8",
);
assert.doesNotMatch(bar, /_flashQueue|addMiniBattleFlash|blinkTargets|fxm|fym/);
assert.match(bar, /minimapBattleMarkers\(sc, this\.app\.engagementFx\)/);
process.stdout.write(
  "minimap battle markers OK: raw parity certificate, shared Web phase, selected/other squares, hold/end and read-only projection\n",
);
