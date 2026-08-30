import assert from "node:assert/strict";

const { ORIGINAL_OBJECT, OriginalBattleObjectPool, originalObjectAddress } =
  await import("../web/src/game/battle/originalstate.js");
const {
  ORIGINAL_EFFECT,
  OriginalBattleEffectPool,
  originalEffectAddress,
  spawnOriginalAttackEffect,
} = await import("../web/src/game/battle/originaleffects.js");
const { OriginalBattleSpatialMemory } = await import(
  "../web/src/game/battle/originalspatial.js"
);
const { updateOriginalAttackEffects } = await import(
  "../web/src/game/battle/originaleffectframe.js"
);

const objects = new OriginalBattleObjectPool();
const effects = new OriginalBattleEffectPool();
const spatial = new OriginalBattleSpatialMemory();
const source = originalObjectAddress(0, 0, 1);
const target = originalObjectAddress(1, 0, 1);
objects.write8(source, ORIGINAL_OBJECT.FLAGS, 0x80);
objects.write8(source, ORIGINAL_OBJECT.ANCHOR_X, 10);
objects.write8(source, ORIGINAL_OBJECT.ANCHOR_Y, 10);
objects.write8(source, ORIGINAL_OBJECT.LEVEL, 0);
objects.write8(target, ORIGINAL_OBJECT.FLAGS, 0x80);
objects.write8(target, ORIGINAL_OBJECT.CLASS, 1);
objects.write8(target, ORIGINAL_OBJECT.HP, 40);
objects.write8(target, ORIGINAL_OBJECT.CURRENT_COMMAND, 1);
objects.write8(target, ORIGINAL_OBJECT.PENDING_COMMAND, 1);
const effectAddress = originalEffectAddress(source);
assert.equal(
  spawnOriginalAttackEffect(objects, effects, source, {
    parameter: 0,
    direction: 2,
    effectClass: 0x1c,
    code: 0x211,
  }).spawned,
  true,
);
const current = effects.read16(effectAddress, ORIGINAL_EFFECT.POSITION_X);
spatial.write8(current, (target >> 5) + 1);
const events = [];
const frame = updateOriginalAttackEffects(objects, effects, spatial, {
  events,
});
assert.equal(frame.length, 1);
assert.equal(objects.read8(target, ORIGINAL_OBJECT.HP), 12);
assert.equal(objects.read8(target, ORIGINAL_OBJECT.PENDING_COMMAND), 5);
assert.equal(events[0].type, "effect-hit");
assert.equal(effects.read8(effectAddress, ORIGINAL_EFFECT.FLAGS), 0);

const aliasedSource = originalObjectAddress(0, 2, 1);
assert.equal(
  originalEffectAddress(aliasedSource),
  effectAddress,
  "B8AA source&0x1E0 aliases sources separated by 0x200",
);

process.stdout.write(
  "battle original effect frame OK: B941/B97E/BA2E/BAB7 zero-RNG lifecycle\n",
);
