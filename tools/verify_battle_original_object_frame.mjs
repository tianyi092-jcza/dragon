import assert from "node:assert/strict";

const {
  ORIGINAL_OBJECT,
  OriginalBattleObjectPool,
  createOriginalBattleRegisters,
  originalObjectAddress,
} = await import("../web/src/game/battle/originalstate.js");
const { OriginalBattleSpatialMemory } = await import(
  "../web/src/game/battle/originalspatial.js"
);
const { OriginalBattleTempRecords, createOriginalBattleSideTemp } =
  await import("../web/src/game/battle/originalinit.js");
const {
  finalizeOriginalBattleObject,
  reviveOriginalBattleObject,
  updateOriginalInactiveObject,
} = await import("../web/src/game/battle/originalobjectframe.js");

function tempsWith(remaining) {
  return new OriginalBattleTempRecords([
    createOriginalBattleSideTemp({
      total: remaining,
      morale: 77,
      groups: [{ troops: remaining, type: 1 }],
    }),
    createOriginalBattleSideTemp({ total: 0, groups: [] }),
  ]);
}

{
  const pool = new OriginalBattleObjectPool();
  const spatial = new OriginalBattleSpatialMemory();
  const temps = tempsWith(2);
  const registers = createOriginalBattleRegisters();
  const address = originalObjectAddress(0, 0, 1);
  pool.write8(address, ORIGINAL_OBJECT.ANCHOR_Y, 20);
  pool.write8(address, ORIGINAL_OBJECT.PREVIOUS_LEVEL, 9);
  pool.write8(address, ORIGINAL_OBJECT.CURRENT_COMMAND, 1);
  pool.write8(address, ORIGINAL_OBJECT.PENDING_COMMAND, 7);
  const result = reviveOriginalBattleObject(
    pool,
    temps,
    spatial,
    registers,
    address,
  );
  assert.equal(result.revived, true);
  assert.equal(temps.group(0, 0).remaining, 1);
  assert.equal(pool.read8(address, ORIGINAL_OBJECT.FLAGS) & 0x80, 0x80);
  assert.equal(pool.read8(address, ORIGINAL_OBJECT.HP), 77);
  assert.equal(pool.read8(address, ORIGINAL_OBJECT.CURRENT_COMMAND), 8);
  assert.equal(pool.read8(address, ORIGINAL_OBJECT.PENDING_COMMAND), 0);
  assert.equal(pool.read16(address, ORIGINAL_OBJECT.SPATIAL_0C), 20 * 0x40 + 1);
  assert.equal(pool.read8(address, ORIGINAL_OBJECT.PREVIOUS_LEVEL), 0);
}

{
  const pool = new OriginalBattleObjectPool();
  const spatial = new OriginalBattleSpatialMemory();
  const temps = tempsWith(1);
  const registers = createOriginalBattleRegisters();
  const address = originalObjectAddress(0, 0, 0);
  pool.write8(address, ORIGINAL_OBJECT.ANCHOR_Y, 20);
  assert.equal(
    reviveOriginalBattleObject(pool, temps, spatial, registers, address)
      .revived,
    true,
    "B413 can replenish the leader slot after it becomes inactive",
  );
}

{
  const pool = new OriginalBattleObjectPool();
  const spatial = new OriginalBattleSpatialMemory();
  const temps = tempsWith(1);
  const registers = { ...createOriginalBattleRegisters(), winnerState: 1 };
  const address = originalObjectAddress(0, 0, 1);
  assert.equal(
    reviveOriginalBattleObject(pool, temps, spatial, registers, address)
      .revived,
    false,
    "B413 does not replenish the side whose sideCode matches D349",
  );
  assert.equal(temps.group(0, 0).remaining, 1);
}

{
  const pool = new OriginalBattleObjectPool();
  const spatial = new OriginalBattleSpatialMemory();
  const temps = tempsWith(0);
  const address = originalObjectAddress(0, 0, 2);
  pool.write8(address, ORIGINAL_OBJECT.FLAGS, 1);
  pool.write8(address, ORIGINAL_OBJECT.KIND, 1);
  pool.write16(address, ORIGINAL_OBJECT.SPATIAL_0E, 0x123);
  spatial.write8(0x123, 0x82);
  spatial.write8(0x1123, 0x82);
  const result = updateOriginalInactiveObject(
    pool,
    temps,
    spatial,
    createOriginalBattleRegisters(),
    address,
  );
  assert.equal(result.finalized, true);
  assert.equal(pool.read8(address, ORIGINAL_OBJECT.FLAGS), 0);
  assert.equal(spatial.read8(0x123), 0x80);
  assert.equal(spatial.read8(0x1123), 0x80);
}

{
  const pool = new OriginalBattleObjectPool();
  const spatial = new OriginalBattleSpatialMemory();
  const temps = tempsWith(0);
  const address = originalObjectAddress(0, 0, 0);
  pool.write8(address, ORIGINAL_OBJECT.FLAGS, 0x80);
  pool.write16(address, ORIGINAL_OBJECT.SPATIAL_0E, 0x234);
  finalizeOriginalBattleObject(pool, temps, spatial, address, {
    creditSurvivor: true,
  });
  assert.equal(temps.group(0, 0).survivors, 1);
  assert.equal(pool.read8(address, ORIGINAL_OBJECT.FLAGS) & 0x80, 0);
}

process.stdout.write(
  "battle original object frame OK: B413 replenish + B4B8 exit accounting\n",
);
