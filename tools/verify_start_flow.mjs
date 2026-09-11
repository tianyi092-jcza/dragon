import assert from "node:assert/strict";
import { runStartFlow } from "../web/src/app/startflow.js";

async function verify(sequence, initialAction) {
  const expected = sequence.slice();
  const steps = Object.fromEntries(
    [
      "chooseAction",
      "chooseChapter",
      "chooseFaction",
      "chooseAdvisor",
      "chooseSave",
      "beginNewGame",
      "beginSavedGame",
    ].map((name) => [
      name,
      async (...args) => {
        const next = expected.shift();
        assert.ok(next, `unexpected step: ${name}`);
        assert.equal(name, next[0]);
        assert.deepEqual(args, next[1]);
        return next[2];
      },
    ]),
  );
  await runStartFlow(steps, initialAction);
  assert.equal(expected.length, 0);
}

const custom = { name: "测试", hao: "军师", portrait: 3 };
await verify([
  ["chooseAction", [], 0],
  ["chooseChapter", [], 16],
  ["chooseFaction", [16], 0],
  ["chooseAdvisor", [16, 0], undefined],
  ["chooseFaction", [16], 2],
  ["chooseAdvisor", [16, 2], custom],
  ["beginNewGame", [16, 2, custom]],
]);
await verify(
  [
    ["chooseChapter", [], -1],
    ["chooseAction", [], 0],
    ["chooseChapter", [], 17],
    ["chooseFaction", [17], -1],
    // 保留旧Web外层循环的返回边界，不按旧注释改成直接重开章节框。
    ["chooseAction", [], 0],
    ["chooseChapter", [], 18],
    ["chooseFaction", [18], 0],
    ["chooseAdvisor", [18, 0], null],
    ["beginNewGame", [18, 0, null]],
  ],
  0,
);
await verify(
  [
    ["chooseSave", [], -1],
    ["chooseAction", [], 1],
    ["chooseSave", [], 3],
    ["beginSavedGame", [3]],
  ],
  1,
);
const failure = new Error("enter failed");
await assert.rejects(
  runStartFlow(
    {
      chooseSave: async () => 0,
      beginSavedGame: async () => {
        throw failure;
      },
    },
    1,
  ),
  (error) => error === failure,
);
process.stdout.write(
  "start flow OK: selection, legacy indices, cancel boundaries, default/custom advisors, await/error propagation\n",
);
