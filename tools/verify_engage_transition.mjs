import assert from "node:assert/strict";

const {
  ENGAGE_TRANSITION_FRAMES,
  engageTransitionFrame,
  playEngageTransition,
} = await import("../web/src/game/engagetransition.js");

assert.deepEqual(ENGAGE_TRANSITION_FRAMES, [0, 1, 2, 3]);
assert.deepEqual(
  [0, 99, 100, 199, 200, 299, 300, 399, 400].map((elapsed) =>
    engageTransitionFrame(elapsed, 100),
  ),
  [0, 0, 1, 1, 2, 2, 3, 3, null],
);

let nextId = 0;
const queue = new Map();
const requestFrame = (callback) => {
  const id = ++nextId;
  queue.set(id, callback);
  return id;
};
const cancelFrame = (id) => queue.delete(id);
const step = (timestamp) => {
  const current = [...queue.values()];
  queue.clear();
  for (const callback of current) callback(timestamp);
};

const frames = [];
let finishes = 0;
let prepared = false;
let releasePrepare;
const app = {
  clock: { hold: false },
  gamebar: {
    _clockHoldRequested: false,
    syncClock() {
      app.clock.hold = this._clockHoldRequested;
    },
  },
  view: {
    draw() {
      if (app.engageTransition?.active) {
        const frame = app.engageTransition.frame;
        if (frames.at(-1) !== frame) frames.push(frame);
      }
    },
  },
};
const legion = { leader: "委任將" };
assert.equal(
  playEngageTransition(app, legion, () => finishes++, {
    requestFrame,
    cancelFrame,
    frameMs: 100,
    prepare: () =>
      new Promise((resolve) => {
        releasePrepare = () => {
          prepared = true;
          resolve();
        };
      }),
  }),
  true,
);
assert.equal(app.clock.hold, true);
assert.equal(queue.size, 0, "RAF does not begin before engage images are ready");
await Promise.resolve();
assert.equal(typeof releasePrepare, "function");
assert.equal(
  playEngageTransition(app, legion, () => finishes++, {
    requestFrame,
    cancelFrame,
  }),
  false,
  "app-level gate rejects a second battle transition",
);
releasePrepare();
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(prepared, true);
assert.equal(queue.size, 1);
// 延迟 RAF 也只能每次推进一相，不能从0直接跳到3或结束。
for (const timestamp of [0, 350, 500, 900, 1200]) step(timestamp);
assert.equal(finishes, 1);
assert.equal(app.engageTransition, null);
assert.equal(app.clock.hold, false);
assert.deepEqual(frames, [0, 1, 2, 3]);

// once guard：完成后重复调用旧finish不重复结算。
assert.equal(
  playEngageTransition(app, legion, () => finishes++, {
    requestFrame,
    cancelFrame,
  }),
  true,
);
const finish = app.engageTransition.finish;
finish();
finish();
assert.equal(finishes, 2);
assert.equal(app.clock.hold, false);

process.stdout.write(
  "engage transition OK: preload + exact 0,1,2,3 under delayed RAF + once gate\n",
);
