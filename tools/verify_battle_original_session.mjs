import assert from "node:assert/strict";

const { OriginalBattleSession } = await import(
  "../web/src/game/battle/originalsession.js"
);
const { ORIGINAL_OBJECT, originalObjectAddress } = await import(
  "../web/src/game/battle/originalstate.js"
);
const { encodeOriginalCollisionAddress } = await import(
  "../web/src/game/battle/originalcollision.js"
);

{
  const entry = new OriginalBattleSession({
    registers: {
      mapRedraw: 1,
      tacticalFrameCounter: 0xffff,
      side0MarkerAt: 0,
      side1MarkerAt: 0,
      wallMarkerAt: 0,
      side0Active: 1,
      side1Active: 1,
    },
  });
  const frame = entry.tick();
  assert.equal(entry.registers.mapRedraw, 0);
  assert.equal(entry.registers.tacticalFrameCounter, 0);
  assert.deepEqual(frame.events.slice(0, 4), [
    { type: "map-redraw" },
    { type: "side-marker", side: 0 },
    { type: "side-marker", side: 1 },
    { type: "wall-marker" },
  ]);
}

const countdown = new OriginalBattleSession({
  registers: {
    winnerState: 2,
    endCountdown: 2,
    side0Active: 1,
    side1Active: 1,
  },
});
const first = countdown.tick();
assert.equal(first.finished, false);
assert.equal(countdown.registers.endCountdown, 1);
const second = countdown.tick();
assert.equal(second.finished, true);
assert.equal(second.winner, 0);
assert.equal(second.events[0].reason, "countdown");

const side1 = new OriginalBattleSession({
  registers: { side0Active: 1, side1Active: 0 },
});
const result = side1.tick();
assert.equal(result.winner, 0);
assert.equal(result.events[0].reason, "side1-empty");

const replay = new OriginalBattleSession({
  rngClock: { ch: 0x12, cl: 0x34, dh: 0x56 },
  commands: [
    { frame: 2, command: 1 },
    { frame: 2, command: 2 },
  ],
});
const frames = [];
for (let index = 0; index < 4; index++) {
  frames.push(
    replay.tick({
      applyCommand(session, command) {
        session.rng.nextByte();
        command.applied = true;
      },
    }),
  );
}
assert.deepEqual(
  frames.map((frame) => frame.events.length),
  [0, 0, 2, 0],
);
assert.equal(replay.rng.calls, 2);
const snapshot = replay.snapshot();
assert.equal(snapshot.frame, 4);
assert.equal(snapshot.rng.calls, 2);
assert.deepEqual(snapshot.commands, []);
assert.equal(snapshot.events.length, 2);

const pendingReplay = new OriginalBattleSession({
  rngClock: { ch: 0x23, cl: 0x59, dh: 0x59 },
  commands: [
    { frame: 6, command: 1 },
    { frame: 6, command: 2 },
  ],
});
pendingReplay.tick();
pendingReplay.rng.nextByte();
const pendingSnapshot = pendingReplay.snapshot();
const expectedRandom = Array.from({ length: 5 }, () =>
  pendingReplay.rng.nextByte(),
);
const restored = new OriginalBattleSession().restore(pendingSnapshot);
assert.equal(restored.frame, 1);
assert.deepEqual(
  Array.from({ length: 5 }, () => restored.rng.nextByte()),
  expectedRandom,
);
const restoredCommands = [];
while (restored.frame <= 6)
  restored.tick({
    applyCommand(_session, command) {
      restoredCommands.push(command.command);
    },
  });
assert.deepEqual(
  restoredCommands,
  [1, 2],
  "snapshot restore must preserve same-frame command order",
);

const collisionSession = new OriginalBattleSession({
  rngClock: { ch: 0, cl: 0, dh: 0 },
  registers: { side0Active: 1, side1Active: 1, d31e: 1 },
  objectsInitialized: true,
});
const attacker = originalObjectAddress(0, 0, 0);
const target = originalObjectAddress(1, 0, 0);
collisionSession.pool.write8(attacker, ORIGINAL_OBJECT.FLAGS, 0x80);
collisionSession.pool.write8(attacker, ORIGINAL_OBJECT.CLASS, 1);
collisionSession.pool.write8(attacker, ORIGINAL_OBJECT.POWER, 100);
collisionSession.pool.write8(target, ORIGINAL_OBJECT.FLAGS, 0x80);
collisionSession.pool.write8(target, ORIGINAL_OBJECT.CLASS, 1);
collisionSession.pool.write8(target, ORIGINAL_OBJECT.HP, 10);
const collision = collisionSession.collide(
  attacker,
  encodeOriginalCollisionAddress(target),
);
assert.equal(collision.hit, true);
assert.equal(collision.killed, true);
assert.equal(collisionSession.rng.calls, 1);
assert.equal(collisionSession.pool.read8(target, ORIGINAL_OBJECT.HP), 0);
const recountFrame = collisionSession.tick({ updateObject: () => {} });
assert.equal(recountFrame.finished, false);
assert.deepEqual(
  recountFrame.events.find((event) => event.type === "activity-counts"),
  {
    type: "activity-counts",
    side0Active: 1,
    side1Active: 0,
    side0Timed: 0,
    side1Timed: 0,
  },
);
assert.equal(recountFrame.events.at(-1).type, "battle-balance");
assert.equal(collisionSession.registers.side1Active, 0);
const movementGate = new OriginalBattleSession({
  registers: { side0Active: 1, side1Active: 1 },
  objectsInitialized: true,
});
const moving = originalObjectAddress(0, 0, 0);
const effectLocked = originalObjectAddress(0, 0, 1);
for (const address of [moving, effectLocked]) {
  movementGate.pool.write8(address, ORIGINAL_OBJECT.FLAGS, 0x80);
  movementGate.pool.write8(address, ORIGINAL_OBJECT.CURRENT_COMMAND, 7);
  movementGate.pool.write8(address, ORIGINAL_OBJECT.PENDING_COMMAND, 7);
}
movementGate.pool.write8(effectLocked, ORIGINAL_OBJECT.FLAGS, 0xc0);
const movedAddresses = [];
movementGate.tick({
  updateObject: () => {},
  updateMovement: (_session, address) => movedAddresses.push(address),
});
assert.deepEqual(
  movedAddresses,
  [moving],
  "ADC8 must skip AF69 movement when object flags bit6 is set",
);

function activateFrameObject(session, address) {
  session.pool.write8(address, ORIGINAL_OBJECT.FLAGS, 0x80);
  session.pool.write8(address, ORIGINAL_OBJECT.HP, 0x60);
  session.pool.write8(address, ORIGINAL_OBJECT.CURRENT_COMMAND, 7);
  session.pool.write8(address, ORIGINAL_OBJECT.PENDING_COMMAND, 7);
}

const frameOrder = new OriginalBattleSession({
  registers: { side0Active: 1, side1Active: 1, mode: 1 },
  objectsInitialized: true,
});
activateFrameObject(frameOrder, originalObjectAddress(0, 0, 0));
activateFrameObject(frameOrder, originalObjectAddress(1, 0, 0));
frameOrder.pool.write8(0, ORIGINAL_OBJECT.HP, 0x32);
frameOrder.pool.write8(0, ORIGINAL_OBJECT.CLASS, 1);
frameOrder.effects.write8(0, 0x00, 0xc0);
frameOrder.effects.write8(0, 0x01, 2);
frameOrder.effects.write16(0, 0x02, 0x600);
frameOrder.effects.write8(0, 0x04, 1);
frameOrder.effects.write8(0, 0x05, 0x80);
frameOrder.effects.write16(0, 0x10, 0x0010);
frameOrder.effects.write16(0, 0x14, 0);
frameOrder.spatial.write8(0x0010, 1);
frameOrder.tick({
  updateObject: () => {},
  objectHandlers: { effectRender: {} },
});
assert.equal(
  frameOrder.registers.winnerState,
  1,
  "A082 B941 damage must be visible to later ADC8 AE56 in the same frame",
);

const observedNextFrame = collisionSession.tick();
assert.equal(observedNextFrame.finished, true);
assert.equal(observedNextFrame.winner, 0);
assert.equal(observedNextFrame.events[0].reason, "side1-empty");

const sideDispatch = new OriginalBattleSession({
  registers: { side0Active: 1, side1Active: 1 },
  objectsInitialized: true,
});
for (const [address, command] of [
  [originalObjectAddress(0, 0, 0), 4],
  [originalObjectAddress(1, 0, 0), 4],
]) {
  sideDispatch.pool.write8(address, ORIGINAL_OBJECT.FLAGS, 0x80);
  sideDispatch.pool.write8(address, ORIGINAL_OBJECT.CURRENT_COMMAND, command);
  sideDispatch.pool.write8(address, ORIGINAL_OBJECT.PENDING_COMMAND, command);
  sideDispatch.pool.write8(
    address,
    ORIGINAL_OBJECT.ANCHOR_X,
    address ? 30 : 10,
  );
  sideDispatch.pool.write8(address, ORIGINAL_OBJECT.ANCHOR_Y, 10);
  sideDispatch.pool.write8(address, ORIGINAL_OBJECT.STATUS_TIME, 0x0f);
}
sideDispatch.tick();
assert.equal(
  sideDispatch.pool.read8(
    originalObjectAddress(1, 0, 0),
    ORIGINAL_OBJECT.PENDING_COMMAND,
  ),
  4,
  "both sides' leaders execute A7B7; only child slots use A7FD",
);
for (let slot = 1; slot < 8; slot++)
  assert.equal(
    sideDispatch.pool.read8(
      originalObjectAddress(1, 0, slot),
      ORIGINAL_OBJECT.PENDING_COMMAND,
    ),
    0,
  );

process.stdout.write(
  "battle original session OK: A6FA end order + deterministic command/RNG frames\n",
);
