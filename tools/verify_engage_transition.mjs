import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { LegionSlotBatch } from "../web/src/game/legionscheduler.js";

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
  /this\.app\?\.engagementFx\?\.frameOf\(L\)/,
  "map reads the shared presentation phase, not the rule countdown",
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
assert.doesNotMatch(
  aiSource,
  /engageSfx\(/,
  "rules must not emit a second, speed-bound SFX stream",
);
// The common slot cursor, not advanceEngagement, now owns the byte gate.
const record = { status: 0xa4, moveDelay: 2, movePeriod: 3 };
const batch = () =>
  new LegionSlotBatch({ firstSlot: 0, endSlot: 1, settleDaily: false });
const waiting = batch();
assert.equal(waiting.next(() => record).kind, "tail");
assert.equal(record.moveDelay, 1);
assert.equal(waiting.next(() => record).kind, "done");
const due = batch();
assert.equal(due.next(() => record).kind, "action");
assert.equal(record.moveDelay, 3);
assert.equal(record.status, 0x84);
const resolveAction = aiSource.match(
  /function resolveEngagementAction\(app, A\) \{[\s\S]*?\n\}/,
)?.[0];
assert.ok(resolveAction, "locate only the contact action body");
assert.match(
  resolveAction,
  /if \(legionSlotCounter\(A\) > 1\) return "waiting";/,
);

const mainSource = await fs.readFile(
  new URL("../web/src/main.js", import.meta.url),
  "utf8",
);
const delegatedGate = mainSource.match(
  /  playDelegatedEngage\(legion, onFinish\) \{[\s\S]*?\n  \},/,
)?.[0];
assert.ok(delegatedGate, "locate only the delegated gate method");
assert.match(
  delegatedGate,
  /requestAnimationFrame\(\(\) =>[\s\S]*complete\(\(\) =>[\s\S]*onFinish\(\);[\s\S]*finishDeferredLegionDaily\(/,
  "one RAF resolves the battle before resuming the owned slot batch",
);
assert.doesNotMatch(
  delegatedGate,
  /speaker\.prepareEngageSfx\(\)/,
  "battle resolution must not wait up to one second for AudioContext",
);
assert.doesNotMatch(
  mainSource,
  /playEngageTransition/,
  "the completed rule countdown must not append a second four-frame transition",
);

process.stdout.write(
  "engage transition OK: city-edge shared-phase art + top marker + presentation-owned ID3 + one-RAF settle gate\n",
);
