import assert from "node:assert/strict";

const { ORIGINAL_OBJECT, OriginalBattleObjectPool, originalObjectAddress } =
  await import("../web/src/game/battle/originalstate.js");
const { ORIGINAL_EFFECT, OriginalBattleEffectPool, originalEffectAddress } =
  await import("../web/src/game/battle/originaleffects.js");
const { executeOriginalAttackByClass, executeOriginalLowClassAttack } =
  await import("../web/src/game/battle/originalattack.js");

function setup(classValue) {
  const pool = new OriginalBattleObjectPool();
  const effects = new OriginalBattleEffectPool();
  const attacker = originalObjectAddress(0, 0, 1);
  const target = originalObjectAddress(1, 0, 1);
  pool.write8(attacker, ORIGINAL_OBJECT.FLAGS, 0x88);
  pool.write8(attacker, ORIGINAL_OBJECT.CLASS, classValue);
  pool.write8(attacker, ORIGINAL_OBJECT.ANCHOR_X, 20);
  pool.write8(attacker, ORIGINAL_OBJECT.ANCHOR_Y, 20);
  pool.write8(attacker, ORIGINAL_OBJECT.LEVEL, 1);
  pool.write16(attacker, ORIGINAL_OBJECT.SPATIAL_0C, 0x0514);
  pool.write16(attacker, ORIGINAL_OBJECT.SPATIAL_0E, 0x0614);
  pool.write8(attacker, ORIGINAL_OBJECT.POSITION_X, 20);
  pool.write8(attacker, ORIGINAL_OBJECT.POSITION_Y, 20);
  pool.write8(attacker, ORIGINAL_OBJECT.POSITION_LEVEL, 1);
  pool.write16(attacker, ORIGINAL_OBJECT.TARGET_POINTER, target);
  pool.write8(target, ORIGINAL_OBJECT.FLAGS, 0x80);
  pool.write8(target, ORIGINAL_OBJECT.ANCHOR_X, 25);
  pool.write8(target, ORIGINAL_OBJECT.ANCHOR_Y, 22);
  pool.write8(target, ORIGINAL_OBJECT.LEVEL, 2);
  pool.write8(target, ORIGINAL_OBJECT.HEIGHT, 0);
  return { pool, effects, attacker, target };
}

{
  const { pool, attacker, target } = setup(0x10);
  const result = executeOriginalLowClassAttack(pool, attacker);
  assert.equal(result.rngCalls, 0);
  assert.equal(pool.read8(attacker, ORIGINAL_OBJECT.FLAGS) & 8, 0);
  assert.deepEqual(
    [
      pool.read8(attacker, ORIGINAL_OBJECT.TARGET_X),
      pool.read8(attacker, ORIGINAL_OBJECT.TARGET_Y),
      pool.read8(attacker, ORIGINAL_OBJECT.POSITION_LEVEL),
    ],
    [25, 22, pool.read8(target, ORIGINAL_OBJECT.LEVEL)],
  );
}

{
  const { pool, effects, attacker } = setup(0x24);
  let calls = 0;
  const rng = {
    nextByte() {
      calls++;
      return 0x03;
    },
  };
  const result = executeOriginalAttackByClass(pool, attacker, { effects, rng });
  assert.equal(calls, 1);
  assert.equal(result.spawned, true);
  const effect = originalEffectAddress(attacker);
  assert.equal(effects.read8(effect, ORIGINAL_EFFECT.FLAGS), 0xc0);
  assert.equal(
    effects.read16(effect, ORIGINAL_EFFECT.SOURCE_POINTER),
    attacker,
  );
  assert.equal(effects.read8(effect, ORIGINAL_EFFECT.CLASS), 0x1c);
  assert.equal(pool.read8(attacker, ORIGINAL_OBJECT.FIELD_13), 8);

  pool.write8(attacker, ORIGINAL_OBJECT.FIELD_13, 0);
  const busy = executeOriginalAttackByClass(pool, attacker, { effects, rng });
  assert.equal(
    calls,
    2,
    "AD2D consumes RNG before discovering a busy B8AA slot",
  );
  assert.equal(busy.spawned, false);
  assert.equal(pool.read8(attacker, ORIGINAL_OBJECT.FIELD_13), 0);
}

{
  const { pool, effects, attacker, target } = setup(0x30);
  pool.write8(attacker, ORIGINAL_OBJECT.HEIGHT, 0x10);
  pool.write8(target, ORIGINAL_OBJECT.HEIGHT, 0);
  pool.write8(attacker, ORIGINAL_OBJECT.ANCHOR_X, 24);
  const result = executeOriginalAttackByClass(pool, attacker, {
    effects,
    rng: { nextByte: () => assert.fail("AD7F must not consume RNG") },
  });
  assert.equal(result.spawned, true);
  const effect = originalEffectAddress(attacker);
  assert.equal(effects.read8(effect, ORIGINAL_EFFECT.CLASS), 0x20);
  assert.equal(effects.read16(effect, ORIGINAL_EFFECT.PARAMETER), 0xff00);
  assert.equal(pool.read8(attacker, ORIGINAL_OBJECT.FIELD_13), 6);
}

process.stdout.write(
  "battle original attack OK: ABD2/ABFF/AC55 + AD2D/AD7F + fixed B8AA slots\n",
);
