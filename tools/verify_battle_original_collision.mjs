import assert from "node:assert/strict";

const {
  ORIGINAL_OBJECT,
  OriginalBattleObjectPool,
  createOriginalBattleRegisters,
  originalObjectAddress,
} = await import("../web/src/game/battle/originalstate.js");
const {
  decodeOriginalCollisionId,
  encodeOriginalCollisionAddress,
  resolveOriginalClassZeroDamage,
  resolveOriginalClassedDamage,
  resolveOriginalCollision,
} = await import("../web/src/game/battle/originalcollision.js");

class ScriptedRng {
  constructor(bytes = []) {
    this.bytes = [...bytes];
    this.calls = 0;
  }

  nextByte() {
    assert.ok(this.bytes.length, "unexpected original RNG call");
    this.calls++;
    return this.bytes.shift();
  }
}

const attacker = originalObjectAddress(0, 0, 0);
const ally = originalObjectAddress(0, 0, 1);
const enemy = originalObjectAddress(1, 0, 0);
assert.equal(encodeOriginalCollisionAddress(attacker), 1);
assert.equal(encodeOriginalCollisionAddress(enemy), 0x31);
assert.equal(decodeOriginalCollisionId(0x31), enemy);
assert.equal(decodeOriginalCollisionId(0x61), 0xc00);

function activePair({ targetClass = 1, targetHp = 100 } = {}) {
  const pool = new OriginalBattleObjectPool();
  pool.write8(attacker, ORIGINAL_OBJECT.FLAGS, 0x80);
  pool.write8(attacker, ORIGINAL_OBJECT.CLASS, 1);
  pool.write8(attacker, ORIGINAL_OBJECT.STATE, 0xff);
  pool.write8(attacker, ORIGINAL_OBJECT.POWER, 20);
  pool.write8(attacker, ORIGINAL_OBJECT.CURRENT_COMMAND, 1);
  pool.write8(enemy, ORIGINAL_OBJECT.FLAGS, 0x90);
  pool.write8(enemy, ORIGINAL_OBJECT.CLASS, targetClass);
  pool.write8(enemy, ORIGINAL_OBJECT.STATE, 0x03);
  pool.write8(enemy, ORIGINAL_OBJECT.HP, targetHp);
  pool.write8(enemy, ORIGINAL_OBJECT.CURRENT_COMMAND, 1);
  pool.write8(enemy, ORIGINAL_OBJECT.PENDING_COMMAND, 2);
  return pool;
}

{
  const pool = activePair();
  const rng = new ScriptedRng([0]);
  const result = resolveOriginalClassedDamage(
    pool,
    rng,
    { d31e: 1 },
    attacker,
    enemy,
  );
  assert.equal(result.hit, false);
  assert.equal(result.events[0].originalId, 8);
  assert.equal(result.events[0].roll, 20);
  assert.equal(rng.calls, 1);
  assert.equal(pool.read8(enemy, ORIGINAL_OBJECT.HP), 100);
  assert.equal(pool.read8(attacker, ORIGINAL_OBJECT.STATE), 9);
}

{
  const pool = activePair({ targetHp: 100 });
  pool.write8(attacker, ORIGINAL_OBJECT.POWER, 0);
  const rng = new ScriptedRng([70]);
  const result = resolveOriginalClassedDamage(
    pool,
    rng,
    { d31e: 2 },
    attacker,
    enemy,
  );
  assert.equal(result.hit, true);
  assert.equal(result.damage, 0x40);
  assert.equal(result.hpAfter, 36);
  assert.equal(rng.calls, 1);
}

{
  const pool = activePair({ targetHp: 90 });
  pool.write8(attacker, ORIGINAL_OBJECT.POWER, 10);
  pool.write8(attacker, ORIGINAL_OBJECT.CURRENT_COMMAND, 2);
  const rng = new ScriptedRng([100]);
  const result = resolveOriginalClassedDamage(
    pool,
    rng,
    { d31e: 1 },
    attacker,
    enemy,
  );
  assert.equal(result.hit, true);
  assert.equal(result.damage, 210);
  assert.equal(result.killed, true);
  assert.equal(result.hpAfter, 0);
  assert.equal(rng.calls, 1);
  assert.equal(pool.read8(enemy, ORIGINAL_OBJECT.FLAGS), 0x11);
  assert.equal(pool.read8(enemy, ORIGINAL_OBJECT.KIND), 4);
  assert.equal(pool.read8(enemy, ORIGINAL_OBJECT.STATE), 0x11);
  assert.equal(pool.read8(enemy, ORIGINAL_OBJECT.FIELD_13), 8);
  assert.equal(pool.read8(enemy, ORIGINAL_OBJECT.CURRENT_COMMAND), 2);
  assert.equal(pool.read8(enemy, ORIGINAL_OBJECT.PENDING_COMMAND), 5);
  assert.deepEqual(
    result.events.map((event) => event.type),
    ["collision-classed-hit", "unit-disabled"],
  );
}

{
  const pool = activePair({ targetClass: 0, targetHp: 20 });
  pool.write8(attacker, ORIGINAL_OBJECT.POWER, 40);
  pool.write8(enemy, ORIGINAL_OBJECT.CURRENT_COMMAND, 0);
  const rng = new ScriptedRng();
  const early = resolveOriginalClassZeroDamage(pool, rng, attacker, enemy);
  assert.equal(early.hit, false);
  assert.equal(early.events[0].originalId, 7);
  assert.equal(early.events[0].reason, "target-command");
  assert.equal(rng.calls, 0);
}

{
  const pool = activePair({ targetClass: 0, targetHp: 4 });
  pool.write8(attacker, ORIGINAL_OBJECT.POWER, 40);
  const rng = new ScriptedRng([0x18]);
  const result = resolveOriginalClassZeroDamage(pool, rng, attacker, enemy);
  assert.equal(result.hit, true);
  assert.equal(result.damage, 5);
  assert.equal(result.hpAfter, 1, "B6BC must never reduce target HP below one");
  assert.equal(result.killed, false);
  assert.equal(rng.calls, 1);
  assert.equal(result.events[0].originalId, 6);
}

{
  const pool = activePair({ targetClass: 0, targetHp: 20 });
  pool.write8(attacker, ORIGINAL_OBJECT.POWER, 40);
  pool.write8(enemy, ORIGINAL_OBJECT.POWER, 20);
  const successRng = new ScriptedRng([0x19, 19]);
  assert.equal(
    resolveOriginalClassZeroDamage(pool, successRng, attacker, enemy).hit,
    true,
  );
  assert.equal(successRng.calls, 2);

  const failedPool = activePair({ targetClass: 0, targetHp: 20 });
  failedPool.write8(attacker, ORIGINAL_OBJECT.POWER, 40);
  failedPool.write8(enemy, ORIGINAL_OBJECT.POWER, 20);
  const failRng = new ScriptedRng([0x19, 20]);
  const failed = resolveOriginalClassZeroDamage(
    failedPool,
    failRng,
    attacker,
    enemy,
  );
  assert.equal(failed.hit, false, "contest comparison is strict");
  assert.equal(failed.events[0].reason, "contest");
  assert.equal(failRng.calls, 2);
}

{
  const pool = activePair();
  const rng = new ScriptedRng([100]);
  const result = resolveOriginalCollision(
    pool,
    rng,
    { ...createOriginalBattleRegisters(), d31e: 1 },
    attacker,
    encodeOriginalCollisionAddress(enemy),
  );
  assert.equal(result.category, "enemy-contact");
  assert.equal(result.carry, false);
  assert.equal(rng.calls, 1);
}

{
  const pool = new OriginalBattleObjectPool();
  pool.write8(attacker, ORIGINAL_OBJECT.CLASS, 1);
  pool.write8(attacker, ORIGINAL_OBJECT.CURRENT_COMMAND, 1);
  pool.write8(ally, ORIGINAL_OBJECT.CLASS, 0);
  const result = resolveOriginalCollision(
    pool,
    new ScriptedRng(),
    createOriginalBattleRegisters(),
    attacker,
    encodeOriginalCollisionAddress(ally),
  );
  assert.equal(result.category, "friendly-blocked");
  assert.equal(result.carry, true);
}

{
  const pool = new OriginalBattleObjectPool();
  pool.write8(attacker, ORIGINAL_OBJECT.CLASS, 0x13);
  pool.write8(attacker, ORIGINAL_OBJECT.CURRENT_COMMAND, 1);
  pool.write8(attacker, ORIGINAL_OBJECT.ANCHOR_X, 1);
  pool.write8(attacker, ORIGINAL_OBJECT.HEIGHT, 2);
  pool.write8(ally, ORIGINAL_OBJECT.FLAGS, 0x80);
  pool.write8(ally, ORIGINAL_OBJECT.CLASS, 0x13);
  pool.write8(ally, ORIGINAL_OBJECT.CURRENT_COMMAND, 1);
  pool.write8(ally, ORIGINAL_OBJECT.ANCHOR_X, 9);
  pool.write8(ally, ORIGINAL_OBJECT.HEIGHT, 3);
  const result = resolveOriginalCollision(
    pool,
    new ScriptedRng(),
    createOriginalBattleRegisters(),
    attacker,
    encodeOriginalCollisionAddress(ally),
  );
  assert.equal(result.category, "friendly-swap");
  assert.equal(result.carry, false);
  assert.equal(pool.read8(attacker, ORIGINAL_OBJECT.ANCHOR_X), 9);
  assert.equal(pool.read8(ally, ORIGINAL_OBJECT.ANCHOR_X), 1);
  assert.equal(pool.read8(ally, ORIGINAL_OBJECT.FLAGS), 0xc0);
}

{
  const pool = activePair();
  const rng = new ScriptedRng();
  let callbackAddress = null;
  const result = resolveOriginalCollision(
    pool,
    rng,
    createOriginalBattleRegisters(),
    attacker,
    encodeOriginalCollisionAddress(0xc00),
    {
      resolveMapObject({ targetAddress }) {
        callbackAddress = targetAddress;
        return { events: [{ type: "wall-contact" }] };
      },
    },
  );
  assert.equal(result.category, "map-object");
  assert.equal(callbackAddress, 0xc00);
  assert.equal(rng.calls, 0);
  assert.deepEqual(result.events, [{ type: "wall-contact" }]);
}

process.stdout.write(
  "battle original collision OK: B533/B618/B6BC branches + exact RNG calls\n",
);
