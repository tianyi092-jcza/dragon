import assert from "node:assert/strict";

const {
  ORIGINAL_OBJECT,
  ORIGINAL_OBJECT_COUNT,
  OriginalBattleObjectPool,
  createOriginalBattleRegisters,
  originalAddressParts,
  originalObjectAddress,
  originalTraversalOrder,
} = await import("../web/src/game/battle/originalstate.js");
const {
  OriginalBattleCommandQueue,
  applyOriginalPendingCommand,
  broadcastOriginalGroupCommand,
  issueOriginalScriptCommand,
  startOriginalFormation,
} = await import("../web/src/game/battle/originalcommands.js");
const { OriginalBattleSession } = await import(
  "../web/src/game/battle/originalsession.js"
);

assert.equal(originalObjectAddress(0, 0, 0), 0x000);
assert.equal(originalObjectAddress(0, 5, 7), 0x5e0);
assert.equal(originalObjectAddress(1, 0, 0), 0x600);
assert.equal(originalObjectAddress(1, 5, 7), 0xbe0);
assert.deepEqual(originalAddressParts(0x7a0), { side: 1, group: 1, slot: 5 });
const order = originalTraversalOrder();
assert.equal(order.length, ORIGINAL_OBJECT_COUNT);
assert.deepEqual(
  order.slice(0, 10),
  [0x000, 0x020, 0x040, 0x060, 0x080, 0x0a0, 0x0c0, 0x0e0, 0x100, 0x120],
);
assert.deepEqual(order.slice(46, 50), [0x5c0, 0x5e0, 0x600, 0x620]);
assert.equal(order.at(-1), 0xbe0);

const pool = new OriginalBattleObjectPool();
const leader = originalObjectAddress(1, 2, 0);
for (let slot = 1; slot < 8; slot++) {
  const address = leader + slot * 0x20;
  pool.write8(address, ORIGINAL_OBJECT.FLAGS, slot === 1 ? 0x80 : 0x00);
}
broadcastOriginalGroupCommand(pool, leader, 2);
for (let slot = 1; slot < 8; slot++) {
  const address = leader + slot * 0x20;
  assert.equal(pool.read8(address, ORIGINAL_OBJECT.FLAGS) & 8, 8);
  assert.equal(pool.read8(address, ORIGINAL_OBJECT.PENDING_COMMAND), 2);
}

const registers = createOriginalBattleRegisters();
assert.deepEqual(registers, {
  selectedGroupMask: 0,
  winnerState: 0,
  endCountdown: 0x78,
  mapRedraw: 0,
  mode: 0,
  d31e: 0,
  siegeLeaderTick: 0x0a,
  battleSideFlag: 0,
  side0Timed: 0,
  side1Timed: 0,
  side0Active: 0xff,
  side1Active: 0xff,
  side0FormationBase: 0,
  side1FormationBase: 0,
  side0FormationOffset: 0,
  side1FormationOffset: 0,
  scriptPc: 0,
  scriptWait: 0,
});
issueOriginalScriptCommand(pool, registers, {
  group: 7,
  command: 3,
  themeFlag: false,
});
for (let group = 0; group < 6; group++)
  assert.equal(
    pool.read8(
      originalObjectAddress(1, group),
      ORIGINAL_OBJECT.PENDING_COMMAND,
    ),
    1,
  );

assert.equal(startOriginalFormation(pool, registers, 0), true);
assert.equal(registers.winnerState, 1);
for (let group = 0; group < 6; group++)
  assert.equal(
    pool.read8(
      originalObjectAddress(0, group),
      ORIGINAL_OBJECT.PENDING_COMMAND,
    ),
    5,
  );
assert.equal(startOriginalFormation(pool, registers, 0x600), false);

const object = originalObjectAddress(0, 3, 0);
pool.write8(object, ORIGINAL_OBJECT.CURRENT_COMMAND, 1);
pool.write8(object, ORIGINAL_OBJECT.PENDING_COMMAND, 2);
pool.write16(object, ORIGINAL_OBJECT.TIMER, 0xabcd);
pool.write8(object, ORIGINAL_OBJECT.ANCHOR_X, 0x12);
pool.write8(object, ORIGINAL_OBJECT.ANCHOR_Y, 0x34);
pool.write8(object, ORIGINAL_OBJECT.LEVEL, 0x56);
pool.write8(object, ORIGINAL_OBJECT.POSITION_X, 0xaa);
pool.write8(object, ORIGINAL_OBJECT.POSITION_Y, 0xbb);
pool.write8(object, ORIGINAL_OBJECT.POSITION_LEVEL, 0xcc);
assert.deepEqual(applyOriginalPendingCommand(pool, object), {
  changed: true,
  dispatchCommand: 2,
});
assert.equal(pool.read8(object, ORIGINAL_OBJECT.CURRENT_COMMAND), 2);
assert.equal(pool.read16(object, ORIGINAL_OBJECT.TIMER), 0);
assert.equal(pool.read8(object, ORIGINAL_OBJECT.POSITION_X), 0x12);
assert.equal(pool.read8(object, ORIGINAL_OBJECT.POSITION_Y), 0x34);
assert.equal(pool.read8(object, ORIGINAL_OBJECT.POSITION_LEVEL), 0x56);

pool.write8(object, ORIGINAL_OBJECT.CURRENT_COMMAND, 5);
pool.write8(object, ORIGINAL_OBJECT.PENDING_COMMAND, 1);
assert.deepEqual(applyOriginalPendingCommand(pool, object), {
  changed: false,
  dispatchCommand: 5,
});

const queue = new OriginalBattleCommandQueue([
  { frame: 3, command: 1 },
  { frame: 1, command: 2 },
  { frame: 3, command: 4 },
]);
assert.deepEqual(queue.take(0), []);
assert.deepEqual(
  queue.take(1).map((item) => item.command),
  [2],
);
assert.deepEqual(
  queue.take(3).map((item) => item.command),
  [1, 4],
);
queue.enqueue({ frame: 4, command: 5 });
queue.enqueue({ frame: 4, command: 6 });
assert.deepEqual(
  queue.take(4).map((item) => item.command),
  [5, 6],
  "queue sequence must remain monotonic after earlier commands are consumed",
);

const session = new OriginalBattleSession({
  registers: { side0Active: 1, side1Active: 1 },
  commands: [{ frame: 1, command: 2 }],
});
session.pool.write8(
  originalObjectAddress(0, 0, 0),
  ORIGINAL_OBJECT.FLAGS,
  0x80,
);
session.pool.write8(
  originalObjectAddress(1, 0, 0),
  ORIGINAL_OBJECT.FLAGS,
  0x80,
);
const visits = [];
session.tick({ updateObject: (_session, address) => visits.push(address) });
assert.deepEqual(visits, order);
const frame1 = session.tick({
  applyCommand: (_session, command) => visits.push(`cmd${command.command}`),
  updateObject: () => {},
});
assert.equal(frame1.events[0].type, "command");
assert.ok(frame1.events.some((event) => event.type === "activity-counts"));
assert.equal(frame1.events.at(-1).type, "battle-balance");
assert.equal(visits.at(-1), "cmd2");
session.registers.side0Active = 0;
const ended = session.tick();
assert.equal(ended.finished, true);
assert.equal(ended.winner, 1);
assert.equal(ended.events[0].reason, "side0-empty");
assert.equal(session.snapshot().objectBytes.length, 0xc00);

process.stdout.write(
  "battle original state OK: 6x8 pool + broadcasts + pending switch + fixed frame queue\n",
);
