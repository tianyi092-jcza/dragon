import assert from "node:assert/strict";

const {
  ORIGINAL_OBJECT,
  OriginalBattleObjectPool,
  createOriginalBattleRegisters,
  originalObjectAddress,
} = await import("../web/src/game/battle/originalstate.js");
const {
  ORIGINAL_AUTO_RETREAT_HP,
  checkOriginalAutomaticRetreat,
  tickOriginalSiegeLeaderAttrition,
  updateOriginalBattleBalance,
} = await import("../web/src/game/battle/originalretreat.js");
const { OriginalBattleSession } = await import(
  "../web/src/game/battle/originalsession.js"
);

function activateLeader(pool, side, hp) {
  const address = originalObjectAddress(side, 0, 0);
  pool.write8(address, ORIGINAL_OBJECT.FLAGS, 0x80);
  pool.write8(address, ORIGINAL_OBJECT.HP, hp);
  pool.write8(address, ORIGINAL_OBJECT.CURRENT_COMMAND, 1);
  pool.write8(address, ORIGINAL_OBJECT.PENDING_COMMAND, 1);
  return address;
}

{
  const pool = new OriginalBattleObjectPool();
  const registers = createOriginalBattleRegisters();
  activateLeader(pool, 0, ORIGINAL_AUTO_RETREAT_HP);
  activateLeader(pool, 1, ORIGINAL_AUTO_RETREAT_HP);
  assert.equal(checkOriginalAutomaticRetreat(pool, registers), null);
  assert.equal(registers.winnerState, 0);

  pool.write8(0, ORIGINAL_OBJECT.HP, ORIGINAL_AUTO_RETREAT_HP - 1);
  const retreat = checkOriginalAutomaticRetreat(pool, registers);
  assert.deepEqual(retreat, {
    side: 0,
    leader: 0,
    hp: 0x31,
    winnerState: 1,
    countdown: 0x78,
  });
  assert.equal(registers.winnerState, 1);
  for (let group = 0; group < 6; group++)
    assert.equal(
      pool.read8(
        originalObjectAddress(0, group, 0),
        ORIGINAL_OBJECT.PENDING_COMMAND,
      ),
      5,
    );
}

{
  const pool = new OriginalBattleObjectPool();
  const registers = createOriginalBattleRegisters();
  activateLeader(pool, 0, 0x20);
  activateLeader(pool, 1, 0x20);
  const retreat = checkOriginalAutomaticRetreat(pool, registers);
  assert.equal(retreat.side, 0, "AE56 checks side0 first");
  assert.equal(registers.winnerState, 1);
  assert.equal(
    pool.read8(originalObjectAddress(1, 0, 0), ORIGINAL_OBJECT.PENDING_COMMAND),
    1,
    "side1 A8F6 is rejected once side0 established D349",
  );
}

{
  const pool = new OriginalBattleObjectPool();
  const registers = {
    ...createOriginalBattleRegisters(),
    mode: 0,
    siegeLeaderTick: 1,
    battleSideFlag: 0,
  };
  const side0 = activateLeader(pool, 0, 0x32);
  const side1 = activateLeader(pool, 1, 0x40);
  assert.deepEqual(tickOriginalSiegeLeaderAttrition(pool, registers), {
    side: 0,
    leader: side0,
    hpBefore: 0x32,
    hpAfter: 0x31,
  });
  assert.equal(registers.siegeLeaderTick, 0x0a);
  assert.equal(checkOriginalAutomaticRetreat(pool, registers).side, 0);

  registers.winnerState = 0;
  registers.battleSideFlag = 0x80;
  registers.siegeLeaderTick = 1;
  assert.equal(tickOriginalSiegeLeaderAttrition(pool, registers).side, 1);
  assert.equal(pool.read8(side1, ORIGINAL_OBJECT.HP), 0x3f);

  registers.mode = 1;
  registers.siegeLeaderTick = 1;
  assert.equal(tickOriginalSiegeLeaderAttrition(pool, registers), null);
  assert.equal(registers.siegeLeaderTick, 1);
}

{
  const registers = createOriginalBattleRegisters();
  registers.side0Timed = 22;
  registers.side1Timed = 5;
  assert.equal(updateOriginalBattleBalance(registers).state, 2);
  registers.side0Timed = 3;
  registers.side1Timed = 20;
  assert.equal(updateOriginalBattleBalance(registers).state, 0);
  registers.side0Timed = 16;
  registers.side1Timed = 4;
  assert.equal(updateOriginalBattleBalance(registers).state, 1);
}

{
  const session = new OriginalBattleSession({
    registers: {
      side0Active: 1,
      side1Active: 1,
      mode: 1,
    },
    objectsInitialized: true,
  });
  activateLeader(session.pool, 0, 0x31);
  activateLeader(session.pool, 1, 0x60);
  const frame = session.tick({ objectHandlers: { selectTarget: false } });
  assert.equal(frame.finished, false);
  assert.equal(session.registers.winnerState, 1);
  assert.ok(frame.events.some((event) => event.type === "automatic-retreat"));
  assert.ok(frame.events.some((event) => event.type === "battle-balance"));
  assert.equal(session.rng.calls, 0, "AE56/A8F6 consume no RNG");
  for (let count = 0; count < 0x78; count++) session.tick();
  assert.equal(session.finished, true);
  assert.equal(session.winner, 1);
}

process.stdout.write(
  "battle original retreat OK: leader HP<50 + A8F6 countdown + siege attrition\n",
);
