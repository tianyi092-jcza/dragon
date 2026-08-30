import assert from "node:assert/strict";

const {
  ORIGINAL_OBJECT,
  OriginalBattleObjectPool,
  originalObjectAddress,
} = await import("../web/src/game/battle/originalstate.js");
const {
  ORIGINAL_AI_COMMAND_ENTRY,
  ORIGINAL_PLAYER_COMMAND_ENTRY,
  executeOriginalGroupLeader,
  executeOriginalSide,
  parkOriginalInactiveGroup,
} = await import("../web/src/game/battle/originalexecutor.js");

assert.deepEqual(ORIGINAL_PLAYER_COMMAND_ENTRY, [
  0xa92e, 0xa953, 0xa96d, 0xa988, 0xa99c, 0xa9d0, 0xab39, 0xaa2c, 0xa7e6,
]);
assert.deepEqual(ORIGINAL_AI_COMMAND_ENTRY, [
  0xaa2c, 0xab9c, 0xab7c, 0xab39, 0xabb2, 0xaaed, 0xab39, 0xa82c, 0xa82c,
]);

function active(pool, address, x, y, options = {}) {
  pool.write8(address, ORIGINAL_OBJECT.FLAGS, options.flags ?? 0x80);
  pool.write8(address, ORIGINAL_OBJECT.CLASS, options.classValue ?? 0x13);
  pool.write8(address, ORIGINAL_OBJECT.ANCHOR_X, x);
  pool.write8(address, ORIGINAL_OBJECT.ANCHOR_Y, y);
  pool.write8(address, ORIGINAL_OBJECT.CURRENT_COMMAND, options.current ?? 1);
  pool.write8(address, ORIGINAL_OBJECT.PENDING_COMMAND, options.pending ?? 1);
  pool.write8(address, ORIGINAL_OBJECT.STATUS_TIME, options.statusTime ?? 0x80);
}

{
  const pool = new OriginalBattleObjectPool();
  const leader = originalObjectAddress(0, 0, 0);
  const target = originalObjectAddress(1, 0, 0);
  active(pool, leader, 10, 10, { current: 1, pending: 2 });
  active(pool, target, 13, 12);
  for (let slot = 1; slot < 8; slot++) {
    const child = originalObjectAddress(0, 0, slot);
    pool.write8(child, ORIGINAL_OBJECT.CURRENT_COMMAND, 1);
  }
  const result = executeOriginalGroupLeader(pool, leader, { player: true });
  assert.equal(result.command, 2);
  assert.equal(result.changed, true);
  assert.equal(result.route, "class-low");
  assert.equal(result.wallScan, true);
  assert.equal(pool.read8(leader, ORIGINAL_OBJECT.STATUS_TIME), 0x28);
  for (let slot = 1; slot < 8; slot++) {
    const child = originalObjectAddress(0, 0, slot);
    assert.equal(pool.read8(child, ORIGINAL_OBJECT.PENDING_COMMAND), 2);
    assert.equal(pool.read8(child, ORIGINAL_OBJECT.FLAGS) & 8, 8);
  }
}

{
  const pool = new OriginalBattleObjectPool();
  const leader = originalObjectAddress(0, 1, 0);
  const target = originalObjectAddress(1, 0, 0);
  active(pool, leader, 10, 10, { current: 1, pending: 4 });
  active(pool, target, 20, 10);
  pool.write16(leader, ORIGINAL_OBJECT.TARGET_POINTER, target);
  const result = executeOriginalGroupLeader(pool, leader, { player: true });
  assert.equal(result.command, 4);
  for (let slot = 1; slot < 8; slot++)
    assert.equal(
      pool.read8(originalObjectAddress(0, 1, slot), ORIGINAL_OBJECT.PENDING_COMMAND),
      4,
    );

  pool.write8(target, ORIGINAL_OBJECT.ANCHOR_X, 40);
  pool.write8(leader, ORIGINAL_OBJECT.CURRENT_COMMAND, 1);
  pool.write8(leader, ORIGINAL_OBJECT.PENDING_COMMAND, 4);
  executeOriginalGroupLeader(pool, leader, { player: true });
  for (let slot = 1; slot < 8; slot++)
    assert.equal(
      pool.read8(originalObjectAddress(0, 1, slot), ORIGINAL_OBJECT.PENDING_COMMAND),
      0,
    );
}

{
  const pool = new OriginalBattleObjectPool();
  const leader = originalObjectAddress(1, 2, 0);
  const target = originalObjectAddress(0, 0, 0);
  active(pool, leader, 30, 8, { current: 3, pending: 3, flags: 0x82 });
  pool.write8(leader, ORIGINAL_OBJECT.HEIGHT, 1);
  active(pool, target, 10, 8);
  const result = executeOriginalGroupLeader(pool, leader, { player: false });
  assert.equal(result.command, 3);
  assert.equal(result.pending, 6);
  assert.equal(pool.read8(leader, ORIGINAL_OBJECT.PENDING_COMMAND), 6);
}

{
  const pool = new OriginalBattleObjectPool();
  const leader = originalObjectAddress(1, 3, 0);
  const target = originalObjectAddress(0, 0, 0);
  active(pool, leader, 30, 8, {
    current: 4,
    pending: 4,
    statusTime: 0x0f,
  });
  active(pool, target, 10, 8);
  executeOriginalGroupLeader(pool, leader, { player: false });
  assert.equal(pool.read8(leader, ORIGINAL_OBJECT.PENDING_COMMAND), 0);
}

{
  const pool = new OriginalBattleObjectPool();
  const leader = originalObjectAddress(1, 4, 0);
  const target = originalObjectAddress(0, 0, 0);
  active(pool, leader, 30, 4, { current: 1, pending: 5 });
  active(pool, target, 10, 8);
  for (let slot = 1; slot < 8; slot++) {
    const child = originalObjectAddress(1, 4, slot);
    pool.write8(child, ORIGINAL_OBJECT.CURRENT_COMMAND, slot === 1 ? 5 : 1);
  }
  const result = executeOriginalGroupLeader(pool, leader, { player: true });
  assert.equal(result.command, 5);
  assert.equal(result.route, "formation");
  assert.equal(result.edge, 0x3e);
  assert.equal(pool.read8(leader, ORIGINAL_OBJECT.CURRENT_COMMAND), 5);
  assert.equal(pool.read8(leader, ORIGINAL_OBJECT.TARGET_X), 0x3e);
  assert.equal(pool.read8(leader, ORIGINAL_OBJECT.TARGET_Y), 0x10);
  assert.equal(pool.read8(originalObjectAddress(1, 4, 1), ORIGINAL_OBJECT.PENDING_COMMAND), 0);
  assert.equal(pool.read8(originalObjectAddress(1, 4, 2), ORIGINAL_OBJECT.PENDING_COMMAND), 5);
}

{
  const pool = new OriginalBattleObjectPool();
  parkOriginalInactiveGroup(pool, 0, 5);
  for (let slot = 1; slot < 8; slot++)
    assert.equal(
      pool.read8(originalObjectAddress(0, 5, slot), ORIGINAL_OBJECT.PENDING_COMMAND),
      5,
    );
}

{
  const pool = new OriginalBattleObjectPool();
  const leader0 = originalObjectAddress(0, 0, 0);
  const target = originalObjectAddress(1, 0, 0);
  active(pool, leader0, 10, 10, { current: 1, pending: 1 });
  active(pool, target, 15, 10);
  const child = originalObjectAddress(0, 0, 1);
  active(pool, child, 11, 10);
  let childVisits = 0;
  const results = executeOriginalSide(pool, 0, {
    player: true,
    updateChild() {
      childVisits++;
    },
  });
  assert.equal(results.length, 1);
  assert.equal(childVisits, 1);
  for (let group = 1; group < 6; group++)
    for (let slot = 1; slot < 8; slot++)
      assert.equal(
        pool.read8(originalObjectAddress(0, group, slot), ORIGINAL_OBJECT.PENDING_COMMAND),
        5,
      );
}

process.stdout.write(
  "battle original executor OK: player/AI command fields + formation + side traversal skeleton\n",
);
