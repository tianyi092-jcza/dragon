// KI.EXE 原版战术命令写入/广播 — 0xA4BF、0xA8DE、0xA8F6及
// 0xA7B7/0xA7FD的current/pending切换公共部分。

import {
  ORIGINAL_GROUP_COUNT,
  ORIGINAL_OBJECT,
  ORIGINAL_SLOTS_PER_GROUP,
  originalObjectAddress,
} from "./originalstate.js";

const byte = (value) => value & 0xff;

/** A8DE：从组长后的第1槽开始，无条件写全部7个子槽，不检查活动标志。 */
export function broadcastOriginalGroupCommand(pool, leaderAddress, command) {
  for (let slot = 1; slot < ORIGINAL_SLOTS_PER_GROUP; slot++) {
    const address = leaderAddress + slot * 0x20;
    pool.write8(
      address,
      ORIGINAL_OBJECT.FLAGS,
      pool.read8(address, ORIGINAL_OBJECT.FLAGS) | 0x08,
    );
    pool.write8(address, ORIGINAL_OBJECT.PENDING_COMMAND, command);
  }
  return leaderAddress;
}

/** A4BF：写0x600侧六个组长；group=7表示全部6组，否则只写指定组。 */
export function issueOriginalScriptCommand(
  pool,
  registers,
  { group, command, themeFlag = true },
) {
  if (registers.winnerState === 2) return false;
  let value = byte(command);
  if (value === 5) return startOriginalFormation(pool, registers, 0x600);
  if (value === 3 && !themeFlag) value = 1;

  const first = group === 7 ? 0 : group;
  const count = group === 7 ? ORIGINAL_GROUP_COUNT : 1;
  if (first < 0 || first >= ORIGINAL_GROUP_COUNT)
    throw new RangeError("original command group must be 0..5 or 7");
  for (let offset = 0; offset < count; offset++) {
    const leader = originalObjectAddress(1, first + offset, 0);
    pool.write8(leader, ORIGINAL_OBJECT.PENDING_COMMAND, value);
  }
  return true;
}

/** A8F6：只在D349==0允许；把六组组长pending设5，并写结束/列阵态1或2。 */
export function startOriginalFormation(pool, registers, baseAddress = 0) {
  if (registers.winnerState !== 0) return false;
  const side = baseAddress >= 0x600 ? 1 : 0;
  registers.winnerState = baseAddress === 0 ? 1 : 2;
  for (let group = 0; group < ORIGINAL_GROUP_COUNT; group++) {
    pool.write8(
      originalObjectAddress(side, group, 0),
      ORIGINAL_OBJECT.PENDING_COMMAND,
      5,
    );
  }
  return true;
}

/** A60D：按首子槽CLASS(+0x24)==groupNumber*0x12匹配0x600侧六组。 */
export function issueOriginalCommandByGroupNumber(
  pool,
  { groupNumber, command, themeFlag = true },
) {
  let value = byte(command);
  if (value === 3 && !themeFlag) value = 1;
  const classValue = byte(byte(groupNumber) * 0x12);
  for (let group = 0; group < ORIGINAL_GROUP_COUNT; group++) {
    const leader = originalObjectAddress(1, group, 0);
    if (pool.read8(leader, ORIGINAL_OBJECT.FIRST_CHILD_CLASS) !== classValue)
      continue;
    if (group !== 0) {
      pool.write8(
        leader,
        ORIGINAL_OBJECT.FLAGS,
        pool.read8(leader, ORIGINAL_OBJECT.FLAGS) | 0x08,
      );
      pool.write8(leader, ORIGINAL_OBJECT.PENDING_COMMAND, value);
    }
    broadcastOriginalGroupCommand(pool, leader, value);
  }
}

/**
 * A7B7/A7FD公共前半段。current==5时不接受pending切换；否则切换时：
 * current=pending、timer清零、position(+10/+12)恢复anchor(+6/+8/+0A)。
 */
export function applyOriginalPendingCommand(pool, address) {
  const current = pool.read8(address, ORIGINAL_OBJECT.CURRENT_COMMAND);
  const pending = pool.read8(address, ORIGINAL_OBJECT.PENDING_COMMAND);
  if (current === 5 || current === pending)
    return { changed: false, dispatchCommand: current };

  pool.write8(address, ORIGINAL_OBJECT.CURRENT_COMMAND, pending);
  pool.write16(address, ORIGINAL_OBJECT.TIMER, 0);
  pool.write8(
    address,
    ORIGINAL_OBJECT.POSITION_X,
    pool.read8(address, ORIGINAL_OBJECT.ANCHOR_X),
  );
  pool.write8(
    address,
    ORIGINAL_OBJECT.POSITION_Y,
    pool.read8(address, ORIGINAL_OBJECT.ANCHOR_Y),
  );
  pool.write8(
    address,
    ORIGINAL_OBJECT.POSITION_LEVEL,
    pool.read8(address, ORIGINAL_OBJECT.LEVEL),
  );
  return { changed: true, dispatchCommand: pending };
}

/** C11A/C165/C181/C19D/C27D..C30C/C1B9/C21A/C234 input-stage state.
 * Returns the accepted leader write, or null. No object writes/RNG here, so the
 * UI may replay queued inputs on a copy for immediate selection highlighting.
 */
export function applyOriginalPanelInput(registers, input, onTalk = null) {
  switch (input.type) {
    case "formation-select":
      registers.selectedFormation = input.index;
      registers.side0FormationOffset = input.index * 0x60;
      return null;
    case "deployment-select":
      registers.side0FormationBase =
        (registers.side0FormationBase & 0xff00) | input.baseX;
      return null;
    case "group-toggle":
      registers.selectedGroupMask ^= 1 << input.group;
      return null;
    case "battlefield-display-toggle":
      registers.battlefieldHidden = !registers.battlefieldHidden;
      if (!registers.battlefieldHidden) registers.mapRedraw = 1;
      return null;
    case "tactical-command": {
      const command = input.commandNumber;
      if (command === 5) {
        // C21A/A8F6: side-wide, rejected once either side is retreating.
        if (registers.winnerState !== 0) return null;
        registers.winnerState = 1;
        registers.selectedGroupMask = 0;
        onTalk?.(0x1af); // C221/A926, only accepted retreat
        return { command, groups: [0, 1, 2, 3, 4, 5] };
      }
      if (registers.winnerState === 1) return null;
      // Explicit groups are the programmatic equivalent of a D310 selection.
      const mask =
        input.groups == null
          ? registers.selectedGroupMask
          : input.groups.reduce((value, group) => value | (1 << group), 0);
      registers.selectedGroupMask = 0; // C1CE xchg precedes the AB4F gate.
      if (command === 3 && (registers.themeFlag & 0xff) === 0) {
        onTalk?.(0x1ac); // C211 rejection still speaks, after mask clear
        return null;
      }
      onTalk?.(
        command === 3 && (registers.battleSideFlag & 0x80) !== 0
          ? 0x1b6
          : 0x1b1 + command,
      );
      return {
        command,
        groups: [0, 1, 2, 3, 4, 5].filter(
          (group) => ((mask || 0xff) & (1 << group)) !== 0,
        ),
      };
    }
    default:
      return null;
  }
}

export class OriginalBattleCommandQueue {
  constructor(commands = []) {
    this.commands = [];
    this.nextSequence = 0;
    for (const command of commands) this.enqueue(command);
  }

  enqueue(command) {
    const suppliedSequence = Number.isInteger(command.sequence)
      ? Math.max(0, command.sequence)
      : null;
    const sequence = suppliedSequence ?? this.nextSequence;
    const item = {
      ...command,
      ...(command.groups == null ? {} : { groups: [...command.groups] }),
      frame: Math.max(0, command.frame | 0),
      sequence,
    };
    this.nextSequence = Math.max(this.nextSequence, sequence + 1);
    this.commands.push(item);
    this.commands.sort(
      (left, right) =>
        left.frame - right.frame || left.sequence - right.sequence,
    );
    return item;
  }

  take(frame) {
    const ready = [];
    while (this.commands.length && this.commands[0].frame <= frame)
      ready.push(this.commands.shift());
    return ready;
  }

  snapshot() {
    return this.commands.map((command) => ({
      ...command,
      ...(command.groups == null ? {} : { groups: [...command.groups] }),
    }));
  }
}
