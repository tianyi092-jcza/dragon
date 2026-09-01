// KI.EXE 0xA1C5 战术主循环前启动序列。规则帧必须与随后A426→A065
// 使用同一对象池/RNG；C315与远调用音效只记录为呈现事件。

import { ORIGINAL_OBJECT, originalObjectAddress } from "./originalstate.js";

const word = (value) => value & 0xffff;
const byte = (value) => value & 0xff;

function commanderFields(commander, mode) {
  let specialty = commander?.ability?.naval ?? 0;
  if (mode === 0) specialty = commander?.ability?.siege ?? 0;
  else if (mode === 1) specialty = commander?.ability?.field ?? 0;
  return {
    force: byte(commander?.ability?.force ?? commander?.force ?? 0),
    lead: byte(commander?.ability?.lead ?? commander?.lead ?? 0),
    specialty: byte(specialty),
  };
}

function leaderScore(session, address, commander, mode) {
  const { force, lead } = commanderFields(commander, mode);
  const power = session.pool.read8(address, ORIGINAL_OBJECT.POWER);
  const hp = session.pool.read8(address, ORIGINAL_OBJECT.HP);
  let gate = byte(force * 3 - lead);
  gate >>= 1;
  let base = word(power * hp);
  const gateRoll = (session.rng.nextByte() & 7) + 8;
  if (gateRoll > gate) base = 0;
  const variance = (session.rng.nextByte() & 7) << 8;
  return word(base + variance);
}

function setLeaderPosition(pool, address, x, y, resetLevel = false) {
  pool.write8(address, ORIGINAL_OBJECT.POSITION_X, x);
  pool.write8(address, ORIGINAL_OBJECT.POSITION_Y, y);
  if (resetLevel) pool.write8(address, ORIGINAL_OBJECT.POSITION_LEVEL, 0);
  pool.write8(address, ORIGINAL_OBJECT.TARGET_X, x);
  pool.write8(address, ORIGINAL_OBJECT.TARGET_Y, y);
}

function sideOf(address) {
  return address >= 0x600 ? 1 : 0;
}

/**
 * 0xA1C5。tickFrame 必须严格执行一个A065规则帧。
 * 返回的scriptWordSkip对应A2E8对D311增加6字节（3个脚本word）。
 */
export function runOriginalBattleStartup(
  handle,
  { commanders = [], tickFrame } = {},
) {
  if (!handle?.session || typeof tickFrame !== "function")
    throw new TypeError(
      "original battle startup requires session frame driver",
    );
  const session = handle.session;
  if (session.registers.startupComplete)
    return (
      handle.originalStartup ?? { frames: 0, scriptWordSkip: 0, events: [] }
    );

  const events = [];
  let frames = 0;
  const tick = () => {
    if (session.finished)
      throw new Error("original battle ended unexpectedly during 0xA1C5");
    const result = tickFrame();
    frames++;
    return result;
  };
  const runFrames = (count, after = null) => {
    for (let index = 0; index < count; index++) {
      tick();
      if (after?.() === false) return false;
    }
    return true;
  };
  const flag = (address, originalId) => {
    const event = {
      type: "startup-flag",
      side: sideOf(address),
      originalId,
    };
    events.push(event);
    session.events.push({ frame: session.frame, ...event });
  };

  // A1C5..A1CB：所有mode先固定执行50个A065。
  runFrames(0x32);
  let scriptWordSkip = 0;

  if ((session.registers.mode & 0xff) === 1) {
    let first = originalObjectAddress(0, 0, 0);
    let second = originalObjectAddress(1, 0, 0);
    let firstScore = leaderScore(session, first, commanders[0], 1);
    let secondScore = leaderScore(session, second, commanders[1], 1);
    if (firstScore < secondScore) {
      [first, second] = [second, first];
      [firstScore, secondScore] = [secondScore, firstScore];
    }

    if (firstScore >= 0x12c0) {
      // A398：优势方亮旗、移至18/28,20、pending8并等待40帧。
      flag(first, 0x1b7);
      setLeaderPosition(
        session.pool,
        first,
        sideOf(first) === 0 ? 0x18 : 0x28,
        0x20,
        true,
      );
      session.pool.write8(first, ORIGINAL_OBJECT.PENDING_COMMAND, 8);
      runFrames(0x28);
      scriptWordSkip = 3;

      if (secondScore < 0x12c0 || secondScore < firstScore >> 1) {
        flag(second, 0x1b9);
        runFrames(0x14);
        flag(first, 0x1cc);
      } else {
        flag(second, 0x1b8);
        setLeaderPosition(
          session.pool,
          second,
          sideOf(second) === 0 ? 0x18 : 0x28,
          0x20,
          true,
        );
        session.pool.write8(second, ORIGINAL_OBJECT.PENDING_COMMAND, 8);
        runFrames(0x28);
      }

      // A1E3：A2E8的两个成功分支都进入同一单挑循环。
      session.pool.write8(first, ORIGINAL_OBJECT.PENDING_COMMAND, 8);
      session.pool.write8(second, ORIGINAL_OBJECT.PENDING_COMMAND, 8);
      let round = 0;
      let duelEnded = false;
      let carryLoopCount = 0;
      while (!duelEnded) {
        let flagId = 0x1ba;
        if (round !== 0) {
          let firstHp = session.pool.read8(first, ORIGINAL_OBJECT.HP);
          let secondHp = session.pool.read8(second, ORIGINAL_OBJECT.HP);
          if (firstHp < secondHp) {
            [first, second] = [second, first];
            [firstHp, secondHp] = [secondHp, firstHp];
          }
          const difference = firstHp - secondHp;
          flagId = 0x1bc + (round - 1) * 4 + (difference < 0x14 ? 2 : 0);
        }
        flag(first, flagId);
        runFrames(0x0a);
        flag(second, flagId + 1);
        setLeaderPosition(session.pool, first, 0x20, 0x20);
        setLeaderPosition(session.pool, second, 0x20, 0x20);

        // A298：80帧；后47帧按固定门控随机重定位双方。
        for (let counter = 0x50; counter > 0; counter--) {
          if (counter < 0x30) {
            const gate = session.rng.nextByte();
            if (gate < 0x20) {
              const y = (gate & 7) + 0x1c;
              const x = (session.rng.nextByte() & 0x0f) + 0x18;
              setLeaderPosition(session.pool, first, x, y);
              setLeaderPosition(session.pool, second, x, y);
            }
          }
          tick();
          if (
            session.pool.read8(first, ORIGINAL_OBJECT.HP) < 0x46 ||
            session.pool.read8(second, ORIGINAL_OBJECT.HP) < 0x46
          ) {
            // A298不改CX；A3C3的10帧LOOP结束后CX为0。
            carryLoopCount = 0;
            duelEnded = true;
            break;
          }
        }
        if (duelEnded) break;

        setLeaderPosition(
          session.pool,
          first,
          sideOf(first) === 0 ? 0x18 : 0x28,
          0x20,
        );
        setLeaderPosition(
          session.pool,
          second,
          sideOf(second) === 0 ? 0x18 : 0x28,
          0x20,
        );
        for (let count = 0; count < 0x14; count++) {
          tick();
          if (
            session.pool.read8(first, ORIGINAL_OBJECT.HP) < 0x46 ||
            session.pool.read8(second, ORIGINAL_OBJECT.HP) < 0x46
          ) {
            // A219在LOOP执行前短路，CX仍为20-count。
            carryLoopCount = 0x14 - count;
            duelEnded = true;
            break;
          }
        }
        round = Math.min(4, round + 1);
      }

      // A23F：HP较低者退回命令0，胜方亮旗。
      if (
        session.pool.read8(first, ORIGINAL_OBJECT.HP) <
        session.pool.read8(second, ORIGINAL_OBJECT.HP)
      )
        [first, second] = [second, first];
      let loserWait = 0x14;
      if (session.pool.read8(second, ORIGINAL_OBJECT.CURRENT_COMMAND) !== 5) {
        flag(second, 0x1cc);
        session.pool.write8(second, ORIGINAL_OBJECT.PENDING_COMMAND, 0);
      } else {
        // A251直接跳A264，沿用携带路径的CX；CX=0时LOOP回绕为65536次。
        loserWait = carryLoopCount || 0x10000;
      }
      runFrames(loserWait);
      flag(first, 0x1cd);
      runFrames(0x14);
    }

    session.pool.write8(first, ORIGINAL_OBJECT.PENDING_COMMAND, 0);
    session.pool.write8(second, ORIGINAL_OBJECT.PENDING_COMMAND, 0);
    events.push({ type: "startup-sound", side: 0, originalId: 5 });
    events.push({ type: "startup-sound", side: 1, originalId: 5 });
  }

  session.registers.startupComplete = true;
  const result = { frames, scriptWordSkip, events };
  handle.originalStartup = result;
  return result;
}
