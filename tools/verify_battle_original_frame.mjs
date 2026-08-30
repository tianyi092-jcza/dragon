import assert from "node:assert/strict";

const { ORIGINAL_OBJECT, OriginalBattleObjectPool, originalObjectAddress } =
  await import("../web/src/game/battle/originalstate.js");
const {
  recountOriginalBattleActivity,
  updateOriginalBattleObjects,
  updateOriginalBattleSide,
} = await import("../web/src/game/battle/originalframe.js");

function activate(pool, side, group, slot, command = 7) {
  const address = originalObjectAddress(side, group, slot);
  pool.write8(address, ORIGINAL_OBJECT.FLAGS, 0x80);
  pool.write8(address, ORIGINAL_OBJECT.CURRENT_COMMAND, command);
  pool.write8(address, ORIGINAL_OBJECT.PENDING_COMMAND, command);
  pool.write8(address, ORIGINAL_OBJECT.ANCHOR_X, 10 + group);
  pool.write8(address, ORIGINAL_OBJECT.ANCHOR_Y, 20 + slot);
  return address;
}

const pool = new OriginalBattleObjectPool();
const side0Leader = activate(pool, 0, 0, 0, 1);
const side0Child = activate(pool, 0, 0, 1, 2);
const side1Leader = activate(pool, 1, 0, 0, 7);
const side1Child = activate(pool, 1, 0, 1, 4);
activate(pool, 1, 1, 0, 7);
const inactiveLeader = originalObjectAddress(0, 1, 0);
pool.write8(inactiveLeader + 0x20, ORIGINAL_OBJECT.CURRENT_COMMAND, 1);

const callbacks = [];
const visits = updateOriginalBattleObjects(pool, {
  leaderHandlers: {
    move: ({ address, command }) =>
      callbacks.push(["leader", address, command]),
    attack: ({ address, command }) =>
      callbacks.push(["leader-attack", address, command]),
  },
  childHandlers: {
    attack: ({ address, command }) =>
      callbacks.push(["child", address, command]),
    move: ({ address, command }) => callbacks.push(["child", address, command]),
  },
});
assert.equal(visits.length, 96);
assert.deepEqual(
  visits.slice(0, 10).map((visit) => [visit.address, visit.role]),
  [
    [0x000, "leader"],
    [0x020, "child"],
    [0x040, "inactive-child"],
    [0x060, "inactive-child"],
    [0x080, "inactive-child"],
    [0x0a0, "inactive-child"],
    [0x0c0, "inactive-child"],
    [0x0e0, "inactive-child"],
    [0x100, "inactive-leader"],
    [0x120, "inactive-child"],
  ],
);
assert.deepEqual(
  visits.slice(48, 50).map((visit) => visit.address),
  [0x600, 0x620],
);
assert.equal(
  pool.read8(inactiveLeader + 0x20, ORIGINAL_OBJECT.PENDING_COMMAND),
  5,
);
assert.ok(
  pool.read16(side0Leader, ORIGINAL_OBJECT.TARGET_POINTER) >= 0x600,
  "side0 leader target selection must happen before command execution",
);
assert.ok(pool.read16(side1Leader, ORIGINAL_OBJECT.TARGET_POINTER) < 0x600);
assert.ok(callbacks.some((entry) => entry[1] === side0Child && entry[2] === 2));
assert.ok(callbacks.some((entry) => entry[1] === side1Child && entry[2] === 4));

const oneSide = updateOriginalBattleSide(pool, 0, { selectTarget: false });
assert.equal(oneSide.length, 48);
assert.equal(oneSide[0].address, side0Leader);
assert.equal(oneSide.at(-1).address, originalObjectAddress(0, 5, 7));

pool.write8(side0Leader, ORIGINAL_OBJECT.STATUS_TIME, 0x20);
pool.write8(side0Child, ORIGINAL_OBJECT.STATUS_TIME, 0);
pool.write8(side1Leader, ORIGINAL_OBJECT.STATUS_TIME, 0x10);
pool.write8(side1Child, ORIGINAL_OBJECT.FLAGS, 1);
const registers = {};
assert.deepEqual(recountOriginalBattleActivity(pool, registers), {
  side0Active: 2,
  side1Active: 2,
  side0Timed: 1,
  side1Timed: 1,
});
assert.deepEqual(registers, {
  side0Active: 2,
  side1Active: 2,
  side0Timed: 1,
  side1Timed: 1,
});

const aiPool = new OriginalBattleObjectPool();
const aiLeader = activate(aiPool, 1, 0, 0, 4);
activate(aiPool, 0, 0, 0, 7);
aiPool.write8(aiLeader, ORIGINAL_OBJECT.STATUS_TIME, 0x0f);
updateOriginalBattleSide(aiPool, 1, { player: false });
assert.equal(
  aiPool.read8(aiLeader, ORIGINAL_OBJECT.PENDING_COMMAND),
  0,
  "AI side must use A82D command4 behavior instead of the player jump table",
);

process.stdout.write(
  "battle original frame OK: A754/A785 leader-first 96-slot order + target/command dispatch\n",
);
