import assert from "node:assert/strict";

const { ORIGINAL_OBJECT, OriginalBattleObjectPool, originalObjectAddress } =
  await import("../web/src/game/battle/originalstate.js");
const { OriginalBattleSpatialMemory } = await import(
  "../web/src/game/battle/originalspatial.js"
);
const { stepOriginalDown, stepOriginalUp } = await import(
  "../web/src/game/battle/originalmovement.js"
);
const { swapOriginalSpatialRecords } = await import(
  "../web/src/game/battle/originalcollision.js"
);

{
  const pool = new OriginalBattleObjectPool();
  const spatial = new OriginalBattleSpatialMemory();
  const address = originalObjectAddress(0, 0, 1);
  pool.write16(address, ORIGINAL_OBJECT.SPATIAL_0C, 0x0123);
  pool.write8(address, ORIGINAL_OBJECT.LEVEL, 0);
  spatial.writeTile(0x123, 0xf8);
  const result = stepOriginalUp(pool, address, { spatial });
  assert.equal(result.committed, true);
  assert.equal(pool.read16(address, ORIGINAL_OBJECT.SPATIAL_0C), 0x1123);
  assert.equal(pool.read8(address, ORIGINAL_OBJECT.LEVEL), 1);
  assert.equal(pool.read8(address, ORIGINAL_OBJECT.HEIGHT), 0x10);
  assert.equal(pool.read8(address, ORIGINAL_OBJECT.DIRECTION), 2);
}

{
  const pool = new OriginalBattleObjectPool();
  const spatial = new OriginalBattleSpatialMemory();
  const address = originalObjectAddress(0, 0, 1);
  pool.write16(address, ORIGINAL_OBJECT.SPATIAL_0C, 0x1123);
  pool.write8(address, ORIGINAL_OBJECT.LEVEL, 1);
  pool.write8(address, ORIGINAL_OBJECT.HEIGHT, 0x10);
  spatial.writeTile(0x123, 0xf9);
  const result = stepOriginalDown(pool, address, { spatial });
  assert.equal(result.committed, true);
  assert.equal(pool.read16(address, ORIGINAL_OBJECT.SPATIAL_0C), 0x0123);
  assert.equal(pool.read8(address, ORIGINAL_OBJECT.LEVEL), 0);
  assert.equal(pool.read8(address, ORIGINAL_OBJECT.HEIGHT), 0);
  assert.equal(pool.read8(address, ORIGINAL_OBJECT.DIRECTION), 2);
}

{
  const pool = new OriginalBattleObjectPool();
  const spatial = new OriginalBattleSpatialMemory();
  const address = originalObjectAddress(0, 0, 1);
  pool.write16(address, ORIGINAL_OBJECT.SPATIAL_0C, 0x0123);
  spatial.writeTile(0x123, 0xf8);
  spatial.write8(0x2123, 0x82);
  let collisionId = null;
  const result = stepOriginalUp(pool, address, {
    spatial,
    collision: (_attacker, id) => {
      collisionId = id;
      return { carry: true };
    },
  });
  assert.equal(collisionId, 2, "B186 masks occupancy bit7");
  assert.equal(result.blocked, true);
  assert.equal(pool.read16(address, ORIGINAL_OBJECT.SPATIAL_0C), 0x0123);
}

{
  const pool = new OriginalBattleObjectPool();
  const spatial = new OriginalBattleSpatialMemory();
  const attacker = originalObjectAddress(0, 0, 1);
  const target = originalObjectAddress(0, 0, 2);
  pool.write16(attacker, ORIGINAL_OBJECT.SPATIAL_0C, 0x0100);
  pool.write16(target, ORIGINAL_OBJECT.SPATIAL_0C, 0x0200);
  spatial.write8(0x0100, 0x11);
  spatial.write8(0x1100, 0x91);
  spatial.write8(0x0200, 0x22);
  spatial.write8(0x1200, 0xa2);
  swapOriginalSpatialRecords(pool, attacker, target, spatial);
  assert.equal(pool.read16(attacker, ORIGINAL_OBJECT.SPATIAL_0C), 0x0200);
  assert.equal(pool.read16(target, ORIGINAL_OBJECT.SPATIAL_0C), 0x0100);
  assert.equal(spatial.read8(0x0100), 0x11);
  assert.equal(spatial.read8(0x0200), 0x22);
  assert.equal(spatial.read8(0x1200), 0x91);
}

process.stdout.write(
  "battle original vertical OK: B0D3/B116 probes + B732 occupancy bytes\n",
);
