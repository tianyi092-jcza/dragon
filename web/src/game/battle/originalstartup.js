// KI.EXE 0xA1C5 战术主循环前启动序列。规则帧必须与随后A426→A065
// 使用同一对象池/RNG；C315同步产生原版消息，AX5远调用是鼠标按钮计数清空。

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
  // A370..A37C: byte SHL/ADD first, then saturate only SUB borrow.
  const tripleForce = byte(force * 3);
  const gate = (tripleForce < lead ? 0 : tripleForce - lead) >> 1;
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

class OriginalBattleStartupNonlocalExit extends Error {
  constructor(result) {
    super("0x9FDC nonlocal startup exit");
    this.result = result;
  }
}

/**
 * 0xA1C5 incremental interpreter. Every yielded value follows exactly one
 * A04B/A065 frame; C315 events between frames are therefore paintable without
 * adding a dialogue wait or changing RNG/frame order.
 */
function* originalBattleStartupFrames(
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
  let scriptWordSkip = 0;
  const tick = () => {
    if (session.finished)
      throw new Error("cannot resume a completed 0xA1C5 interpreter");
    const terminalFrameResult = tickFrame();
    frames++;
    if (session.finished || terminalFrameResult?.finished) {
      const result = {
        completed: false,
        ended: true,
        framesIncludingTerminal: frames,
        frames,
        scriptWordSkip,
        terminalFrameResult,
        events,
      };
      handle.originalStartup = result;
      throw new OriginalBattleStartupNonlocalExit(result);
    }
    return {
      advancedFrame: true,
      ended: false,
      displayCommitted: terminalFrameResult?.displayCommitted !== false,
      frame: session.frame,
      result: terminalFrameResult,
    };
  };
  function* runFrames(count) {
    for (let index = 0; index < count; index++) yield tick();
  }
  const flag = (address, originalId) => {
    session.emitTalk(sideOf(address), originalId, "A1C5");
    // Retain historical startup trace for lifecycle fixtures; not a flag sprite.
    const event = { type: "startup-flag", side: sideOf(address), originalId };
    events.push(event);
    session.events.push({ frame: session.frame, ...event });
  };

  // A1C5..A1CB：所有mode先固定执行50个A065。
  yield* runFrames(0x32);

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
      // A398：优势方发言、移至18/28,20、pending8并等待40帧。
      flag(first, 0x1b7);
      setLeaderPosition(
        session.pool,
        first,
        sideOf(first) === 0 ? 0x18 : 0x28,
        0x20,
        true,
      );
      session.pool.write8(first, ORIGINAL_OBJECT.PENDING_COMMAND, 8);
      yield* runFrames(0x28);
      scriptWordSkip = 3;

      const refused = secondScore < 0x12c0 || secondScore < firstScore >> 1;
      if (refused) {
        flag(second, 0x1b9);
        yield* runFrames(0x14);
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
        yield* runFrames(0x28);
      }

      // A33F→A34D STC→A1E0: refusal goes straight to A27A, never duel.
      if (!refused) {
        session.pool.write8(first, ORIGINAL_OBJECT.PENDING_COMMAND, 8);
        session.pool.write8(second, ORIGINAL_OBJECT.PENDING_COMMAND, 8);
        let round = 0;
        let duelEnded = false;
        let cx;
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
          yield* runFrames(0x0a);
          // A40B overwrites the exhausted ten-frame LOOP CX with selector Q.
          cx = flagId + 1;
          flag(second, cx);
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
            yield tick();
            if (
              session.pool.read8(first, ORIGINAL_OBJECT.HP) < 0x46 ||
              session.pool.read8(second, ORIGINAL_OBJECT.HP) < 0x46
            ) {
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
          for (cx = 0x14; cx !== 0; cx = word(cx - 1)) {
            yield tick();
            if (
              session.pool.read8(first, ORIGINAL_OBJECT.HP) < 0x46 ||
              session.pool.read8(second, ORIGINAL_OBJECT.HP) < 0x46
            ) {
              // A219 branches before LOOP, preserving CX=20..1.
              duelEnded = true;
              break;
            }
          }
          if (!duelEnded) round = Math.min(4, round + 1);
        }

        if (
          session.pool.read8(first, ORIGINAL_OBJECT.HP) <
          session.pool.read8(second, ORIGINAL_OBJECT.HP)
        )
          [first, second] = [second, first];

        if (session.pool.read8(second, ORIGINAL_OBJECT.CURRENT_COMMAND) !== 5) {
          flag(second, 0x1cc);
          session.pool.write8(second, ORIGINAL_OBJECT.PENDING_COMMAND, 0);
          cx = 0x14;
        }
        do {
          yield tick();
          cx = word(cx - 1);
        } while (cx !== 0);
        flag(first, 0x1cd);
        yield* runFrames(0x14);
      }
    }

    session.pool.write8(first, ORIGINAL_OBJECT.PENDING_COMMAND, 0);
    session.pool.write8(second, ORIGINAL_OBJECT.PENDING_COMMAND, 0);
    events.push({ type: "startup-input-drain", button: 0 });
    events.push({ type: "startup-input-drain", button: 1 });
  }

  session.registers.startupComplete = true;
  const result = { frames, scriptWordSkip, events };
  handle.originalStartup = result;
  return result;
}

export function createOriginalBattleStartupStepper(handle, options = {}) {
  const iterator = originalBattleStartupFrames(handle, options);
  let done = false;
  let result = null;
  return {
    step() {
      if (done) return { done: true, advancedFrame: false, result };
      let next;
      try {
        next = iterator.next();
      } catch (error) {
        if (!(error instanceof OriginalBattleStartupNonlocalExit)) throw error;
        done = true;
        result = error.result;
        return {
          done: true,
          advancedFrame: true,
          ended: true,
          displayCommitted: false,
          result,
        };
      }
      done = next.done;
      if (done) result = next.value;
      return done
        ? {
            done: true,
            advancedFrame: false,
            ended: Boolean(result?.ended),
            displayCommitted: false,
            result,
          }
        : { done: false, ...next.value };
    },
    get done() {
      return done;
    },
    get result() {
      return result;
    },
  };
}

/** Synchronous compatibility driver for rule fixtures; browser production uses
 * createOriginalBattleStartupStepper so each yielded A065 can be painted. */
export function runOriginalBattleStartup(handle, options = {}) {
  const stepper = createOriginalBattleStartupStepper(handle, options);
  while (!stepper.step().done) {}
  return stepper.result;
}
