// KI.EXE 原版战术命令执行器。
// 两侧组长均走A7B7组长跳表；只有组内其余7槽走A7FD子对象跳表。
// AA2C阵型目标与ABD2/ABFF/AC55攻击对象链由生产固定帧直接调用。

import {
  ORIGINAL_GROUP_COUNT,
  ORIGINAL_OBJECT,
  ORIGINAL_SIDE_SIZE,
  originalAddressParts,
  originalObjectAddress,
} from "./originalstate.js";
import {
  applyOriginalPendingCommand,
  broadcastOriginalGroupCommand,
} from "./originalcommands.js";
import { selectOriginalTarget } from "./originaltargeting.js";
import { applyOriginalFormationTarget } from "./originalformation.js";
import { executeOriginalAttackByClass } from "./originalattack.js";

export const ORIGINAL_LEADER_COMMAND_ENTRY = Object.freeze([
  0xa92e, 0xa953, 0xa96d, 0xa988, 0xa99c, 0xa9d0, 0xab39, 0xaa2c, 0xa7e6,
]);

export const ORIGINAL_CHILD_COMMAND_ENTRY = Object.freeze([
  0xaa2c, 0xab9c, 0xab7c, 0xab39, 0xabb2, 0xaaed, 0xab39, 0xa82c, 0xa82c,
]);

function setPending(pool, address, command) {
  pool.write8(address, ORIGINAL_OBJECT.PENDING_COMMAND, command);
}

function callOriginalRefreshHandler(pool, address, handler) {
  // A8CC只处理0侧；0x600侧直接返回。
  if (address >= ORIGINAL_SIDE_SIZE) return;
  handler?.({
    address,
    command: pool.read8(address, ORIGINAL_OBJECT.CURRENT_COMMAND),
  });
}

function dispatchAttackClass(pool, address) {
  const classValue = pool.read8(address, ORIGINAL_OBJECT.CLASS);
  if (classValue < 0x24) return "class-low";
  if (classValue === 0x24) return "class-equal";
  return "class-high";
}

function applySideFormationTarget(
  pool,
  address,
  formation,
  clearPositionLevel,
) {
  if (!formation) return null;
  return applyOriginalFormationTarget(pool, address, {
    ...formation,
    baseMode: "side-base",
    clearPositionLevel,
  });
}

function executeAttack(pool, address, command, attackContext, handlers) {
  const route = dispatchAttackClass(pool, address);
  const attack = attackContext
    ? executeOriginalAttackByClass(pool, address, attackContext)
    : { route };
  handlers.attack?.({ address, command, route, attack });
  return attack;
}

/** AB39：特殊高层目标立即转AB7C；普通切换帧只重设目标点。 */
function executeCommand3(
  pool,
  address,
  changed,
  command,
  attackContext,
  handlers,
) {
  const flags = pool.read8(address, ORIGINAL_OBJECT.FLAGS);
  if (
    (flags & 0x02) !== 0 &&
    pool.read8(address, ORIGINAL_OBJECT.HEIGHT) !== 0
  ) {
    setPending(pool, address, 6);
    // AB48 jumps through AB7C, including its timed clamp.
    if (pool.read8(address, ORIGINAL_OBJECT.STATUS_TIME) >= 0x28)
      pool.write8(address, ORIGINAL_OBJECT.STATUS_TIME, 0x28);
    return {
      ...executeAttack(pool, address, command, attackContext, handlers),
      pending: 6,
    };
  }
  if (changed) {
    const targetX = attackContext?.wallTargetX ?? 0x1f;
    const targetY = pool.read8(address, ORIGINAL_OBJECT.ANCHOR_Y);
    pool.write16(address, ORIGINAL_OBJECT.TIMER, 0);
    pool.write8(address, ORIGINAL_OBJECT.POSITION_X, targetX);
    pool.write8(address, ORIGINAL_OBJECT.POSITION_Y, targetY);
    pool.write8(address, ORIGINAL_OBJECT.TARGET_X, targetX);
    pool.write8(address, ORIGINAL_OBJECT.TARGET_Y, targetY);
    // AB5E..AB78: D2FC upper descriptor at wall X / anchor Y.
    pool.write8(
      address,
      ORIGINAL_OBJECT.POSITION_LEVEL,
      (attackContext?.heightDescriptor?.(0x1000 + targetY * 64 + targetX) ??
        0) & 7,
    );
  }
  handlers.move?.({ address, command });
  return { route: "move", pending: null };
}

/** AAED：首次进入命令5时把进入前命令保存到pending，并移动到本侧边缘。 */
function executeFormation(pool, address, currentBefore) {
  if (currentBefore !== 5) {
    setPending(pool, address, currentBefore);
    pool.write8(address, ORIGINAL_OBJECT.CURRENT_COMMAND, 5);
    const edge = address < ORIGINAL_SIDE_SIZE ? 1 : 0x3e;
    const y = Math.max(
      0x10,
      Math.min(0x2f, pool.read8(address, ORIGINAL_OBJECT.ANCHOR_Y)),
    );
    pool.write8(address, ORIGINAL_OBJECT.TARGET_X, edge);
    pool.write8(address, ORIGINAL_OBJECT.TARGET_Y, y);
    pool.write8(address, ORIGINAL_OBJECT.POSITION_X, edge);
    pool.write8(address, ORIGINAL_OBJECT.POSITION_Y, y);
    pool.write8(address, ORIGINAL_OBJECT.POSITION_LEVEL, 0);
    pool.write16(address, ORIGINAL_OBJECT.TIMER, 0);
  }
  const edge = address < ORIGINAL_SIDE_SIZE ? 1 : 0x3e;
  return {
    edge,
    atEdge: pool.read8(address, ORIGINAL_OBJECT.ANCHOR_X) === edge,
  };
}

function executeLeaderCommand(
  pool,
  address,
  command,
  { currentBefore, pending, changed, handlers, formation, attackContext },
) {
  switch (command) {
    case 0: {
      if (changed) {
        broadcastOriginalGroupCommand(pool, address, 0);
        callOriginalRefreshHandler(pool, address, handlers.refresh);
      }
      const arrivedBefore =
        pool.read8(address, ORIGINAL_OBJECT.TARGET_X) ===
          pool.read8(address, ORIGINAL_OBJECT.ANCHOR_X) &&
        pool.read8(address, ORIGINAL_OBJECT.TARGET_Y) ===
          pool.read8(address, ORIGINAL_OBJECT.ANCHOR_Y);
      if (arrivedBefore) {
        pool.write8(address, ORIGINAL_OBJECT.PENDING_COMMAND, 7);
        pool.write8(address, ORIGINAL_OBJECT.CURRENT_COMMAND, 7);
      }
      // A92E在进入AA2C前把AX改为target word；targetX!=targetY时清+0x12。
      const formationTarget = applySideFormationTarget(
        pool,
        address,
        formation,
        pool.read8(address, ORIGINAL_OBJECT.TARGET_X) !==
          pool.read8(address, ORIGINAL_OBJECT.TARGET_Y),
      );
      handlers.move?.({ address, command: 0, formationTarget });
      return { route: "move", formationTarget, arrivedBefore };
    }
    case 1: {
      if (changed) {
        broadcastOriginalGroupCommand(pool, address, 1);
        callOriginalRefreshHandler(pool, address, handlers.refresh);
      }
      if (pool.read8(address, ORIGINAL_OBJECT.CLASS) !== 0)
        return executeAttack(pool, address, 1, attackContext, handlers);
      const formationTarget = applySideFormationTarget(
        pool,
        address,
        formation,
        false,
      );
      handlers.move?.({ address, command: 1, formationTarget });
      return { route: "move", formationTarget };
    }
    case 2: {
      if (changed) {
        broadcastOriginalGroupCommand(pool, address, 2);
        callOriginalRefreshHandler(pool, address, handlers.refresh);
        handlers.wallSweep?.({ address, command: 2 });
      }
      if (pool.read8(address, ORIGINAL_OBJECT.STATUS_TIME) >= 0x28)
        pool.write8(address, ORIGINAL_OBJECT.STATUS_TIME, 0x28);
      return {
        ...executeAttack(pool, address, 2, attackContext, handlers),
        wallScan: true,
      };
    }
    case 3:
    case 6:
      if (command === 3 && changed) {
        broadcastOriginalGroupCommand(pool, address, 3);
        callOriginalRefreshHandler(pool, address, handlers.refresh);
      }
      return executeCommand3(
        pool,
        address,
        changed,
        command,
        attackContext,
        handlers,
      );
    case 4: {
      if (changed) callOriginalRefreshHandler(pool, address, handlers.refresh);
      const targetAddress = pool.read16(
        address,
        ORIGINAL_OBJECT.TARGET_POINTER,
      );
      const dx = Math.abs(
        pool.read8(targetAddress, ORIGINAL_OBJECT.ANCHOR_X) -
          pool.read8(address, ORIGINAL_OBJECT.ANCHOR_X),
      );
      const dy = Math.abs(
        pool.read8(targetAddress, ORIGINAL_OBJECT.ANCHOR_Y) -
          pool.read8(address, ORIGINAL_OBJECT.ANCHOR_Y),
      );
      const distance = dx + dy;
      broadcastOriginalGroupCommand(pool, address, distance <= 0x10 ? 4 : 0);
      const formationTarget = applySideFormationTarget(
        pool,
        address,
        formation,
        changed,
      );
      handlers.move?.({ address, command: 4, distance, formationTarget });
      return { route: "move", distance, formationTarget };
    }
    case 5:
      if (currentBefore !== 5) {
        for (let slot = 1; slot < 8; slot++) {
          const child = address + slot * 0x20;
          pool.write8(
            child,
            ORIGINAL_OBJECT.FLAGS,
            pool.read8(child, ORIGINAL_OBJECT.FLAGS) | 0x08,
          );
          if (pool.read8(child, ORIGINAL_OBJECT.CURRENT_COMMAND) !== pending)
            setPending(pool, child, pending);
        }
        callOriginalRefreshHandler(pool, address, handlers.refresh);
      }
      handlers.formationMove?.({ address, command: 5, pending });
      {
        const formationResult = executeFormation(pool, address, currentBefore);
        if (formationResult.atEdge)
          handlers.formationExit?.({
            address,
            command: 5,
            ...formationResult,
          });
        return { route: "formation", ...formationResult };
      }
    case 7: {
      const formationTarget = applySideFormationTarget(
        pool,
        address,
        formation,
        changed,
      );
      handlers.move?.({ address, command: 7, formationTarget });
      return { route: "move", formationTarget };
    }
    case 8:
      return { route: "idle" };
    default:
      throw new RangeError("original leader command must be 0..8");
  }
}

function executeChildCommand(
  pool,
  address,
  command,
  { currentBefore, changed, handlers, formation, attackContext },
) {
  switch (command) {
    case 0: {
      const formationTarget = applySideFormationTarget(
        pool,
        address,
        formation,
        changed,
      );
      handlers.move?.({ address, command: 0, formationTarget });
      return { route: "move", formationTarget };
    }
    case 1:
      return executeAttack(pool, address, command, attackContext, handlers);
    case 2:
      if (pool.read8(address, ORIGINAL_OBJECT.STATUS_TIME) >= 0x28)
        pool.write8(address, ORIGINAL_OBJECT.STATUS_TIME, 0x28);
      return executeAttack(pool, address, command, attackContext, handlers);
    case 3:
    case 6:
      return executeCommand3(
        pool,
        address,
        changed,
        command,
        attackContext,
        handlers,
      );
    case 4:
      if (pool.read8(address, ORIGINAL_OBJECT.STATUS_TIME) < 0x10)
        setPending(pool, address, 0);
      return executeAttack(pool, address, 4, attackContext, handlers);
    case 5:
      handlers.formationMove?.({ address, command: 5 });
      {
        const formationResult = executeFormation(pool, address, currentBefore);
        if (formationResult.atEdge)
          handlers.formationExit?.({
            address,
            command: 5,
            ...formationResult,
          });
        return { route: "formation", ...formationResult };
      }
    case 7:
    case 8:
      return { route: "idle" };
    default:
      throw new RangeError("original child command must be 0..8");
  }
}

/** A7B7：两侧活动组长都走同一组长命令跳表。 */
export function executeOriginalGroupLeader(
  pool,
  address,
  { handlers = {}, formation = null, attackContext = null } = {},
) {
  const parts = originalAddressParts(address);
  if (parts.slot !== 0)
    throw new RangeError("original group executor requires a group leader");
  const target = selectOriginalTarget(pool, address);
  const currentBefore = pool.read8(address, ORIGINAL_OBJECT.CURRENT_COMMAND);
  const pending = pool.read8(address, ORIGINAL_OBJECT.PENDING_COMMAND);
  const transition = applyOriginalPendingCommand(pool, address);
  const action = executeLeaderCommand(
    pool,
    address,
    transition.dispatchCommand,
    {
      currentBefore,
      pending,
      changed: transition.changed,
      handlers,
      formation,
      attackContext,
    },
  );
  return {
    address,
    side: parts.side,
    group: parts.group,
    command: transition.dispatchCommand,
    changed: transition.changed,
    target,
    ...action,
  };
}

/** A7FD：活动子对象走独立子对象命令跳表。 */
export function executeOriginalChild(
  pool,
  address,
  { handlers = {}, formation = null, attackContext = null } = {},
) {
  const parts = originalAddressParts(address);
  if (parts.slot === 0)
    throw new RangeError("original child executor requires a child slot");
  const target = selectOriginalTarget(pool, address);
  const currentBefore = pool.read8(address, ORIGINAL_OBJECT.CURRENT_COMMAND);
  const transition = applyOriginalPendingCommand(pool, address);
  const action = executeChildCommand(
    pool,
    address,
    transition.dispatchCommand,
    {
      currentBefore,
      changed: transition.changed,
      handlers,
      formation,
      attackContext,
    },
  );
  return {
    address,
    side: parts.side,
    group: parts.group,
    slot: parts.slot,
    command: transition.dispatchCommand,
    changed: transition.changed,
    target,
    ...action,
  };
}

/** A83F：非活动组长强制其余7子槽pending=5（已是current5者不写）。 */
export function parkOriginalInactiveGroup(pool, side, group) {
  for (let slot = 1; slot < 8; slot++) {
    const address = originalObjectAddress(side, group, slot);
    if (pool.read8(address, ORIGINAL_OBJECT.CURRENT_COMMAND) !== 5)
      setPending(pool, address, 5);
  }
}

/** A754/A785的组级骨架；正式固定帧遍历位于originalframe.js。 */
export function executeOriginalSide(pool, side, { updateChild = null } = {}) {
  const results = [];
  for (let group = 0; group < ORIGINAL_GROUP_COUNT; group++) {
    const leader = originalObjectAddress(side, group, 0);
    if (pool.isActive(leader))
      results.push(executeOriginalGroupLeader(pool, leader));
    else parkOriginalInactiveGroup(pool, side, group);
    for (let slot = 1; slot < 8; slot++) {
      const address = originalObjectAddress(side, group, slot);
      if (pool.isActive(address)) updateChild?.(address, results);
    }
  }
  return results;
}
