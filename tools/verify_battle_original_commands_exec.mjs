import assert from "node:assert/strict";

const {
  ORIGINAL_OBJECT,
  OriginalBattleObjectPool,
  originalObjectAddress,
} = await import("../web/src/game/battle/originalstate.js");
const {
  executeOriginalPlayerLeader,
  executeOriginalPlayerLeaders,
  prepareOriginalInactiveGroup,
} = await import("../web/src/game/battle/originalcommands-exec.js");

function leader(pool, side = 0, group = 0, command = 0) {
  const address = originalObjectAddress(side, group, 0);
  pool.write8(address, ORIGINAL_OBJECT.FLAGS, 0x80);
  pool.write8(address, ORIGINAL_OBJECT.CURRENT_COMMAND, command);
  pool.write8(address, ORIGINAL_OBJECT.PENDING_COMMAND, command);
  return address;
}

{
  const pool = new OriginalBattleObjectPool();
  const address = leader(pool, 0, 0, 0);
  pool.write16(address, ORIGINAL_OBJECT.ANCHOR_X, 0x2211);
  pool.write16(address, ORIGINAL_OBJECT.TARGET_X, 0x2211);
  const moves = [];
  const result = executeOriginalPlayerLeader(pool, address, {
    move: (event) => moves.push(event),
  });
  assert.equal(result.action, "move");
  assert.equal(pool.read8(address, ORIGINAL_OBJECT.CURRENT_COMMAND), 7);
  assert.equal(pool.read8(address, ORIGINAL_OBJECT.PENDING_COMMAND), 7);
  assert.equal(moves.length, 1);
}

{
  const pool = new OriginalBattleObjectPool();
  const address = leader(pool, 0, 1, 0);
  pool.write8(address, ORIGINAL_OBJECT.PENDING_COMMAND, 1);
  pool.write8(address, ORIGINAL_OBJECT.CLASS, 0);
  const events = [];
  const result = executeOriginalPlayerLeader(pool, address, {
    move: (event) => events.push(event),
  });
  assert.equal(result.action, "move");
  assert.equal(result.command, 1);
  assert.equal(pool.read8(address, ORIGINAL_OBJECT.CURRENT_COMMAND), 1);
  assert.equal(events.length, 1);
  for (let slot = 1; slot < 8; slot++) {
    const child = address + slot * 0x20;
    assert.equal(pool.read8(child, ORIGINAL_OBJECT.PENDING_COMMAND), 1);
    assert.equal(pool.read8(child, ORIGINAL_OBJECT.FLAGS) & 8, 8);
  }
}

{
  const pool = new OriginalBattleObjectPool();
  const address = leader(pool, 0, 2, 1);
  pool.write8(address, ORIGINAL_OBJECT.CLASS, 0x24);
  const attacks = [];
  const result = executeOriginalPlayerLeader(pool, address, {
    attack: (event) => attacks.push(event),
  });
  assert.equal(result.action, "attack");
  assert.equal(result.branch, "equal");
  assert.deepEqual(attacks.map((event) => event.branch), ["equal"]);
}

{
  const pool = new OriginalBattleObjectPool();
  const address = leader(pool, 0, 3, 1);
  pool.write8(address, ORIGINAL_OBJECT.PENDING_COMMAND, 2);
  pool.write8(address, ORIGINAL_OBJECT.CLASS, 0x30);
  pool.write8(address, ORIGINAL_OBJECT.STATUS_TIME, 0x80);
  const wall = [];
  const result = executeOriginalPlayerLeader(pool, address, {
    wallSweep: (event) => wall.push(event),
  });
  assert.equal(result.action, "attack");
  assert.equal(result.branch, "above");
  assert.equal(pool.read8(address, ORIGINAL_OBJECT.STATUS_TIME), 0x28);
  assert.equal(wall.length, 1);
}

{
  const pool = new OriginalBattleObjectPool();
  const address = leader(pool, 0, 4, 4);
  const target = originalObjectAddress(1, 4, 0);
  pool.write8(address, ORIGINAL_OBJECT.TARGET_POINTER, target & 0xff);
  pool.write8(address, ORIGINAL_OBJECT.TARGET_POINTER + 1, target >> 8);
  pool.write8(address, ORIGINAL_OBJECT.ANCHOR_X, 10);
  pool.write8(address, ORIGINAL_OBJECT.ANCHOR_Y, 10);
  pool.write8(target, ORIGINAL_OBJECT.ANCHOR_X, 18);
  pool.write8(target, ORIGINAL_OBJECT.ANCHOR_Y, 17);
  const result = executeOriginalPlayerLeader(pool, address);
  assert.equal(result.action, "approach");
  assert.equal(result.distance, 15);
  for (let slot = 1; slot < 8; slot++)
    assert.equal(
      pool.read8(address + slot * 0x20, ORIGINAL_OBJECT.PENDING_COMMAND),
      4,
    );
  pool.write8(target, ORIGINAL_OBJECT.ANCHOR_X, 30);
  executeOriginalPlayerLeader(pool, address);
  for (let slot = 1; slot < 8; slot++)
    assert.equal(
      pool.read8(address + slot * 0x20, ORIGINAL_OBJECT.PENDING_COMMAND),
      0,
    );
}

{
  const pool = new OriginalBattleObjectPool();
  const address = leader(pool, 1, 0, 1);
  pool.write8(address, ORIGINAL_OBJECT.PENDING_COMMAND, 5);
  for (let slot = 1; slot < 8; slot++) {
    const child = address + slot * 0x20;
    pool.write8(child, ORIGINAL_OBJECT.CURRENT_COMMAND, slot === 1 ? 5 : 1);
    pool.write8(child, ORIGINAL_OBJECT.PENDING_COMMAND, 3);
  }
  const calls = [];
  const result = executeOriginalPlayerLeader(pool, address, {
    formationMove: (event) => calls.push(event),
  });
  assert.equal(result.action, "formation");
  assert.equal(pool.read8(address, ORIGINAL_OBJECT.CURRENT_COMMAND), 5);
  assert.equal(
    pool.read8(address + 0x20, ORIGINAL_OBJECT.PENDING_COMMAND),
    3,
    "child already in command5 keeps pending value",
  );
  for (let slot = 2; slot < 8; slot++)
    assert.equal(
      pool.read8(address + slot * 0x20, ORIGINAL_OBJECT.PENDING_COMMAND),
      5,
    );
  assert.equal(calls.length, 1);
}

{
  const pool = new OriginalBattleObjectPool();
  const address = originalObjectAddress(0, 5, 0);
  for (let slot = 1; slot < 8; slot++) {
    const child = address + slot * 0x20;
    pool.write8(child, ORIGINAL_OBJECT.CURRENT_COMMAND, slot === 2 ? 5 : 1);
    pool.write8(child, ORIGINAL_OBJECT.PENDING_COMMAND, 2);
  }
  prepareOriginalInactiveGroup(pool, address);
  assert.equal(pool.read8(address + 2 * 0x20, ORIGINAL_OBJECT.PENDING_COMMAND), 2);
  for (const slot of [1, 3, 4, 5, 6, 7])
    assert.equal(
      pool.read8(address + slot * 0x20, ORIGINAL_OBJECT.PENDING_COMMAND),
      5,
    );
}

{
  const pool = new OriginalBattleObjectPool();
  leader(pool, 0, 0, 7);
  const visits = executeOriginalPlayerLeaders(pool, 0);
  assert.equal(visits.length, 1);
  assert.deepEqual(visits[0], { action: "idle", command: 7 });
}

process.stdout.write(
  "battle original commands exec OK: A92E/A953/A96D/A99C/A9D0 state branches\n",
);
