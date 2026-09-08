import assert from "node:assert/strict";

const { OriginalBattleSession } = await import(
  "../web/src/game/battle/originalsession.js"
);
const { updateOriginalObjectMovement } = await import(
  "../web/src/game/battle/originalmoveframe.js"
);
const { ORIGINAL_OBJECT, originalObjectAddress } = await import(
  "../web/src/game/battle/originalstate.js"
);

{
  const session = new OriginalBattleSession();
  const address = originalObjectAddress(0, 0, 1);
  session.pool.write8(address, ORIGINAL_OBJECT.FLAGS, 0x80);
  session.pool.write8(address, ORIGINAL_OBJECT.ANCHOR_X, 10);
  session.pool.write8(address, ORIGINAL_OBJECT.ANCHOR_Y, 10);
  session.pool.write8(address, ORIGINAL_OBJECT.POSITION_X, 11);
  session.pool.write8(address, ORIGINAL_OBJECT.POSITION_Y, 10);
  session.pool.write8(address, ORIGINAL_OBJECT.LEVEL, 1);
  session.pool.write8(address, ORIGINAL_OBJECT.POSITION_LEVEL, 1);
  session.pool.write8(address, ORIGINAL_OBJECT.HEIGHT, 0);
  session.pool.write16(address, ORIGINAL_OBJECT.SPATIAL_0C, 0x128a);
  session.pool.write16(address, ORIGINAL_OBJECT.SPATIAL_0E, 0x128a);
  session.spatial.write8(0x128a, 0x82);
  session.spatial.write8(0x228a, 0x82);
  session.spatial.write8(0x128b, 0);
  session.spatial.write8(0x228b, 0);
  session.spatial.write8(0x728b, 1);
  const result = updateOriginalObjectMovement(session, address);
  assert.equal(result.moved, true);
  assert.equal(session.pool.read8(address, ORIGINAL_OBJECT.ANCHOR_X), 11);
  assert.equal(
    session.pool.read16(address, ORIGINAL_OBJECT.SPATIAL_0E),
    0x128b,
  );
  assert.equal(session.spatial.read8(0x128a), 0x80);
  assert.equal(session.spatial.read8(0x228a), 0x80);
  assert.equal(session.spatial.read8(0x128b) & 0x7f, 2);
}

{
  const session = new OriginalBattleSession();
  const address = originalObjectAddress(0, 0, 1);
  session.pool.write8(address, ORIGINAL_OBJECT.FLAGS, 0x80);
  session.pool.write8(address, ORIGINAL_OBJECT.CLASS, 0x12);
  session.pool.write8(address, ORIGINAL_OBJECT.ANCHOR_X, 10);
  session.pool.write8(address, ORIGINAL_OBJECT.ANCHOR_Y, 10);
  session.pool.write8(address, ORIGINAL_OBJECT.POSITION_X, 10);
  session.pool.write8(address, ORIGINAL_OBJECT.POSITION_Y, 10);
  session.pool.write8(address, ORIGINAL_OBJECT.TARGET_X, 20);
  session.pool.write8(address, ORIGINAL_OBJECT.TARGET_Y, 10);
  session.pool.write16(address, ORIGINAL_OBJECT.SPATIAL_0C, 0x028a);
  const result = updateOriginalObjectMovement(session, address);
  assert.equal(result.queued, false, "AFC3 exhausted path first copies own target to position");
  assert.equal(session.pool.read16(address, ORIGINAL_OBJECT.POSITION_X), 0x0a14);
  assert.equal(session.paths.head, session.paths.tail);
  const queued = updateOriginalObjectMovement(session, address);
  assert.equal(queued.queued, true, "AFD0 queues only after the next blocked probe (AH=0)");
  assert.equal(session.paths.readQueued(), address);
}

process.stdout.write(
  "battle original move frame OK: AF65 cardinal commit + C653 path request\n",
);
