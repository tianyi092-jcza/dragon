import assert from "node:assert/strict";

const { SOUND_PROFILES, setSoundType } = await import(
  "../web/src/core/speaker.js"
);
assert.equal(SOUND_PROFILES.length, 4);
assert.equal(new Set(SOUND_PROFILES.map((p) => p.frequency)).size, 4);
assert.equal(new Set(SOUND_PROFILES.map((p) => p.wave)).size >= 3, true);
assert.equal(setSoundType(2), 2);
assert.equal(setSoundType(99), 4);
console.log("four distinct sound profiles configured");
