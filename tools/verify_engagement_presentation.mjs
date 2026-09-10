// User-approved presentation only; original rule-countdown proof stays in verify_engagement_poll.
import assert from "node:assert/strict";
import {
  EngagementPresentation,
  ENGAGEMENT_FRAME_MS,
  ENGAGEMENT_SOUND_MS,
} from "../web/src/render/engagementpresentation.js";
import { Clock } from "../web/src/game/clock.js";
assert.equal(ENGAGEMENT_FRAME_MS, 100);
assert.equal(ENGAGEMENT_SOUND_MS, 200);
const contact = () => ({
  faction: 0,
  x: 1,
  y: 2,
  _engagement: { kind: "field", countdown: 11, target: { x: 3, y: 4 } },
});
const runs = [];
for (let speed = 0; speed < 5; speed++) {
  const army = contact();
  const scenario = { legions: [army] };
  const before = structuredClone(scenario);
  const pulses = [];
  const frames = [];
  let now = 0;
  const fx = new EngagementPresentation({
    playSound: () => {
      pulses.push([now, fx.frameOf(army)]);
      return true;
    },
  });
  const clock = new Clock({ startYear: 190, startMonth: 1 });
  clock.strategicSpeed = speed;
  for (now = 0; now <= 1000; now += 10) {
    clock.advanceFrame(10);
    fx.update(scenario, now);
    if (now % 100 === 0) frames.push(fx.frameOf(army));
  }
  assert.deepEqual(
    scenario,
    before,
    "presentation does not change routes/countdown/data",
  );
  assert.deepEqual(pulses, [
    [0, 3],
    [200, 1],
    [400, 3],
    [600, 1],
    [800, 3],
    [1000, 1],
  ]);
  runs.push({ frames, pulses });
}
for (const run of runs)
  assert.deepEqual(
    run,
    runs[0],
    "all five strategy speeds share identical visual/audio timestamps",
  );

const a = contact(),
  b = contact();
const scenario = { legions: [a] };
let plays = 0,
  stops = 0;
const fx = new EngagementPresentation({
  playSound: () => {
    plays++;
  },
  stopSound: () => {
    stops++;
  },
});
fx.update(scenario, 0);
assert.equal(plays, 1, "first visible contact starts sound immediately");
fx.update(scenario, 100);
assert.equal(fx.frameOf(a), 2);
a._engagement = { ...a._engagement, countdown: 2, target: { x: 30, y: 40 } };
scenario.legions.push(b);
fx.update(scenario, 150);
assert.equal(
  fx.frameOf(a),
  2,
  "road-poll replacement cannot reset visual phase",
);
assert.equal(fx.frameOf(b), 2, "simultaneous contacts share the same clock");
assert.equal(plays, 1, "new contacts cannot multiply shared-channel frequency");
fx.update(scenario, 200);
assert.equal(plays, 2);
fx.update(scenario, 250, { paused: true });
assert.equal(stops, 1);
const frozen = fx.frameOf(a);
fx.update(scenario, 9000, { paused: true });
assert.equal(fx.frameOf(a), frozen);
assert.equal(stops, 1);
fx.update(scenario, 9000);
assert.equal(plays, 2, "no backlog or re-key when resuming mid-beat");
fx.update(scenario, 9200);
assert.equal(plays, 3);
fx.update(scenario, 14200);
assert.equal(plays, 4, "a delayed RAF emits only one current pulse");
a._engagement = null;
assert.equal(fx.frameOf(a), null, "clear is visible before next update");
fx.update(scenario, 14201);
assert.equal(stops, 1, "another contact still owns the shared sound");
b.dead = true;
fx.update(scenario, 14202);
assert.equal(stops, 2, "last contact stops current sound and queued successor");
assert.equal(fx.frameOf(b), null);
scenario.legions = [contact()];
fx.update(scenario, 15000, { paused: true });
assert.equal(plays, 4);
fx.update(scenario, 16000);
assert.equal(plays, 5, "first contact created while held starts on release");
fx.update(scenario, 16001, { enabled: false });
assert.equal(
  stops,
  3,
  "tactical/title/runtime-disable removes audio and images together",
);
assert.equal(fx.contacts.size, 0);
fx.update(scenario, 17000);
fx.pause(); // visibilitychange before RAF suspension
fx.update(scenario, 100000);
assert.equal(fx.elapsed, 0, "hidden time is not elapsed presentation time");

let ready = false,
  audible = 0;
const failed = new EngagementPresentation({
  playSound: () => {
    if (!ready) return false;
    audible++;
    return true;
  },
  stopSound: () => {
    throw new Error("closed context fixture");
  },
});
failed.update(scenario, 0);
ready = true;
failed.update(scenario, 100);
assert.equal(audible, 0);
failed.update(scenario, 200);
assert.equal(audible, 1, "unready audio retries only at the next live beat");
assert.doesNotThrow(() => failed.reset());
for (const mode of ["false", "throw"]) {
  let attempts = 0,
    cleanup = 0;
  const interrupted = new EngagementPresentation({
    playSound: () => {
      if (++attempts === 1) return true;
      if (mode === "throw") throw new Error("interrupted audio fixture");
      return false;
    },
    stopSound: () => {
      cleanup++;
    },
  });
  interrupted.update(scenario, 0);
  assert.doesNotThrow(() => interrupted.update(scenario, 200));
  interrupted.reset();
  assert.equal(
    cleanup,
    1,
    "a failed re-trigger cannot lose cleanup ownership of the older sound",
  );
}
process.stdout.write(
  "engagement presentation OK: fixed100ms/200ms, five speeds, first/last sync, holds/hidden, multi-contact, no rule writes or backlog\n",
);
