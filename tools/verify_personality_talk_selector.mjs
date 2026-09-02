import assert from "node:assert/strict";

const strings = Array.from({ length: 1023 }, (_, index) => [`TALK${index}`]);
globalThis.fetch = async () => ({ json: async () => ({ strings }) });

const { personalityTalkIndex, quoteForIndex } = await import(
  "../web/src/game/talk.js"
);

const baseFor = (selector) => 0x196 + (selector - 0x196) * 8;
for (const selector of [0x198, 0x199, 0x19a, 0x1a4, 0x1a6, 0x1a7]) {
  assert.equal(
    personalityTalkIndex(selector, { idx: 99, talk_idx: 0 }),
    baseFor(selector),
  );
  assert.equal(
    personalityTalkIndex(selector, { idx: 99, talk_idx: 7 }),
    baseFor(selector) + 7,
  );
}
assert.equal(personalityTalkIndex(0x195, { talk_idx: 2 }), null);
assert.equal(
  personalityTalkIndex(0x19a, { idx: 4 }),
  baseFor(0x19a) + 4,
  "missing +1E falls back to general index modulo eight",
);
assert.deepEqual(await quoteForIndex(baseFor(0x1a7) + 3), {
  lines: [`TALK${baseFor(0x1a7) + 3}`],
  text: `TALK${baseFor(0x1a7) + 3}`,
});

process.stdout.write(
  "personality TALK selector OK: 0x075B expands selector windows by +1E\n",
);
