import assert from "node:assert/strict";
import fs from "node:fs/promises";

const {
  ENGAGE_TRANSITION_FRAMES,
  ENGAGE_TRANSITION_FRAME_MS,
  engageTransitionFrame,
} = await import("../web/src/game/engagetransition.js");

assert.deepEqual(ENGAGE_TRANSITION_FRAMES, [0, 1, 2, 3]);
assert.equal(ENGAGE_TRANSITION_FRAME_MS, 165);
assert.deepEqual(
  [0, 99, 100, 199, 200, 299, 300, 399, 400].map((elapsed) =>
    engageTransitionFrame(elapsed, 100),
  ),
  [0, 0, 1, 1, 2, 2, 3, 3, null],
);

const mapSource = await fs.readFile(
  new URL("../web/src/render/mapview.js", import.meta.url),
  "utf8",
);
const animationDraw = mapSource.indexOf(
  "this._drawEngagement(ctx, pos.sx, pos.sy, engageFrame);",
);
const markerDraw = mapSource.indexOf(
  "this._drawMarchingIcon(ctx, lx, ly, markerStyle, renderPos.frame);",
);
assert.ok(animationDraw >= 0 && markerDraw > animationDraw);
assert.match(
  mapSource,
  /L\._engagement\?\.countdown/,
  "rule countdown must expose the engagement image from first contact",
);
assert.doesNotMatch(
  mapSource,
  /transition\.target\.(?:x|y)/,
  "engagement graphics must use the attacker's city-edge coordinates, not the target city",
);

const aiSource = await fs.readFile(
  new URL("../web/src/game/ai.js", import.meta.url),
  "utf8",
);
assert.match(
  aiSource,
  /function startEngagement[\s\S]*A\._engagement = \{[\s\S]*engageSfxBurst\(\);/,
  "five sounds must be queued when contact begins, alongside the first visible frame",
);

const mainSource = await fs.readFile(
  new URL("../web/src/main.js", import.meta.url),
  "utf8",
);
assert.match(
  mainSource,
  /playDelegatedEngage\(legion, onFinish\)[\s\S]*requestAnimationFrame\(\(\) => finish\(\)\)/,
  "delegated resolution keeps only a one-RAF serialization gate",
);
assert.doesNotMatch(
  mainSource,
  /playDelegatedEngage[\s\S]*speaker\.prepareEngageSfx\(\)/,
  "battle resolution must not wait up to one second for AudioContext",
);
assert.doesNotMatch(
  mainSource,
  /playEngageTransition/,
  "the completed rule countdown must not append a second four-frame transition",
);

process.stdout.write(
  "engage transition OK: immediate city-edge countdown art + top marker + five-sound cue + one-RAF settle gate\n",
);
