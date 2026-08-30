// KI.EXE 原版战术命令执行器（当前闭合的高层状态部分）。
// 玩家跳表 A7E7 与AI跳表 A82D按原始命令编号分派；AA2C阵型目标和活动
// 子对象A7FD已接入。具体移动步进、ABD2/ABFF/AC55攻击对象生成和地图探针
// 尚未闭合，本文件只实现已经能逐指令确认的字段写入与分派。

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

export const ORIGINAL_PLAYER_COMMAND_ENTRY = Object.freeze([
  0xa92e, 0xa953, 0xa96d, 0xa988, 0xa99c, 0xa9d0, 0xab39, 0xaa2c, 0xa7e6,
]);

export const ORIGINAL_AI_COMMAND_ENTRY = Object.freeze([
  0xaa2c, 0xab9c, 0xab7c, 0xab39, 0xabb2, 0xaaed, 0xab39, 0xa82c, 0xa82c,
]);

function setPending(pool, address, command) {
  pool.write8(address, ORIGINAL_OBJECT.PENDING_COMMAND, command);
}

function setTargetToAnchor(pool, address) {
  pool.write8(
    address,
    ORIGINAL_OBJECT.TARGET_X,
    pool.read8(address, ORIGINAL_OBJECT.ANCHOR_X),
  );
  pool.write8(
    address,
    ORIGINAL_OBJECT.TARGET_Y,
    pool.read8(address, ORIGINAL_OBJECT.ANCHOR_Y),
  );
}

function dispatchAttackClass(pool, address) {
  const classValue = pool.read8(address, ORIGINAL_OBJECT.CLASS);
  if (classValue < 0x24) return "class-low";
  if (classValue === 0x24) return "class-equal";
  return "class-high";
}

/** A92E中可独立确认的到达状态；AI命令0的AA2C目标由originalformation计算。 */
function updateMoveArrival(pool, address, changed) {
  if (changed) pool.write8(address, ORIGINAL_OBJECT.POSITION_LEVEL, 0);
  const targetX = pool.read8(address, ORIGINAL_OBJECT.TARGET_X);
  const targetY = pool.read8(address, ORIGINAL_OBJECT.TARGET_Y);
  const anchorX = pool.read8(address, ORIGINAL_OBJECT.ANCHOR_X);
  const anchorY = pool.read8(address, ORIGINAL_OBJECT.ANCHOR_Y);
  const arrived = targetX === anchorX && targetY === anchorY;
  if (arrived) pool.write8(address, ORIGINAL_OBJECT.STATUS_TIME, 0x80);
  return { arrived };
}

function executeCommand3(pool, address, changed) {
  const flags = pool.read8(address, ORIGINAL_OBJECT.FLAGS);
  if (
    (flags & 0x02) !== 0 &&
    pool.read8(address, ORIGINAL_OBJECT.HEIGHT) !== 0
  ) {
    setPending(pool, address, 6);
    return { route: dispatchAttackClass(pool, address), pending: 6 };
  }
  if (changed) {
    const targetX = 0x1f;
    const targetY = pool.read8(address, ORIGINAL_OBJECT.ANCHOR_Y);
    pool.write16(address, ORIGINAL_OBJECT.TIMER, 0);
    pool.write8(address, ORIGINAL_OBJECT.POSITION_X, targetX);
    pool.write8(address, ORIGINAL_OBJECT.POSITION_Y, targetY);
    pool.write8(address, ORIGINAL_OBJECT.TARGET_X, targetX);
    pool.write8(address, ORIGINAL_OBJECT.TARGET_Y, targetY);
  }
  return { route: dispatchAttackClass(pool, address), pending: null };
}

function executeFormation(pool, address, currentBefore, pending) {
  if (currentBefore !== 5) {
    setPending(pool, address, pending);
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

function executeOriginalCommand(
  pool,
  address,
  command,
  {
    currentBefore,
    pending,
    changed,
    player,
    handlers,
    formation,
    attackContext,
  },
) {
  switch (command) {
    case 0: {
      if (player && changed) {
        broadcastOriginalGroupCommand(pool, address, 0);
        handlers.refresh?.({ address, command: 0 });
      }
      let formationTarget = null;
      if (player) {
        if (changed) setTargetToAnchor(pool, address);
      } else {
        formationTarget = applyOriginalFormationTarget(pool, address, {
          ...(formation ?? {}),
          commandChanged: changed,
        });
      }
      const arrived =
        pool.read8(address, ORIGINAL_OBJECT.TARGET_X) ===
          pool.read8(address, ORIGINAL_OBJECT.ANCHOR_X) &&
        pool.read8(address, ORIGINAL_OBJECT.TARGET_Y) ===
          pool.read8(address, ORIGINAL_OBJECT.ANCHOR_Y);
      if (player && arrived) {
        pool.write8(address, ORIGINAL_OBJECT.PENDING_COMMAND, 7);
        pool.write8(address, ORIGINAL_OBJECT.CURRENT_COMMAND, 7);
      }
      handlers.move?.({ address, command: 0, formationTarget });
      return {
        route: "move",
        formationTarget,
        ...updateMoveArrival(pool, address, changed),
      };
    }
    case 1: {
      if (player && changed) {
        broadcastOriginalGroupCommand(pool, address, 1);
        handlers.refresh?.({ address, command: 1 });
      }
      const route =
        pool.read8(address, ORIGINAL_OBJECT.CLASS) === 0
          ? "move"
          : dispatchAttackClass(pool, address);
      if (route === "move") {
        handlers.move?.({ address, command: 1 });
        return { route };
      }
      const attack = attackContext
        ? executeOriginalAttackByClass(pool, address, attackContext)
        : { route };
      handlers.attack?.({ address, command: 1, route, attack });
      return attack;
    }
    case 2: {
      if (player && changed) {
        broadcastOriginalGroupCommand(pool, address, 2);
        handlers.refresh?.({ address, command: 2 });
      }
      if (player) handlers.wallSweep?.({ address, command: 2 });
      if (pool.read8(address, ORIGINAL_OBJECT.STATUS_TIME) >= 0x28)
        pool.write8(address, ORIGINAL_OBJECT.STATUS_TIME, 0x28);
      const route = dispatchAttackClass(pool, address);
      const attack = attackContext
        ? executeOriginalAttackByClass(pool, address, attackContext)
        : { route };
      handlers.attack?.({ address, command: 2, route, attack });
      return { ...attack, wallScan: player };
    }
    case 3:
    case 6:
      if (player && changed) broadcastOriginalGroupCommand(pool, address, 3);
      return executeCommand3(pool, address, changed);
    case 4: {
      let distance = null;
      if (player) {
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
        distance = dx + dy;
        broadcastOriginalGroupCommand(pool, address, distance <= 0x10 ? 4 : 0);
      } else if (pool.read8(address, ORIGINAL_OBJECT.STATUS_TIME) < 0x10) {
        setPending(pool, address, 0);
      }
      handlers.move?.({ address, command: 4, distance });
      const route = dispatchAttackClass(pool, address);
      const attack = attackContext
        ? executeOriginalAttackByClass(pool, address, attackContext)
        : { route };
      handlers.attack?.({ address, command: 4, route, attack });
      return { ...attack, distance };
    }
    case 5:
      if (player) {
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
      }
      handlers.formationMove?.({ address, command: 5, pending });
      return {
        route: "formation",
        ...executeFormation(pool, address, currentBefore, pending),
      };
    case 7:
    case 8:
      return { route: "idle" };
    default:
      return { route: "unsupported" };
  }
}

/** A7B7：组长选择目标、切换命令并按玩家/AI跳表分派。 */
export function executeOriginalGroupLeader(
  pool,
  address,
  {
    player = false,
    handlers = {},
    formation = null,
    attackContext = null,
  } = {},
) {
  const parts = originalAddressParts(address);
  if (parts.slot !== 0)
    throw new RangeError("original group executor requires a group leader");
  const target = selectOriginalTarget(pool, address);
  const currentBefore = pool.read8(address, ORIGINAL_OBJECT.CURRENT_COMMAND);
  const pending = pool.read8(address, ORIGINAL_OBJECT.PENDING_COMMAND);
  const transition = applyOriginalPendingCommand(pool, address);
  const action = executeOriginalCommand(
    pool,
    address,
    transition.dispatchCommand,
    {
      currentBefore,
      pending,
      changed: transition.changed,
      player,
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

/** A7FD：活动子对象选择目标、切换命令并只走AI跳表。 */
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
  const pending = pool.read8(address, ORIGINAL_OBJECT.PENDING_COMMAND);
  const transition = applyOriginalPendingCommand(pool, address);
  const action = executeOriginalCommand(
    pool,
    address,
    transition.dispatchCommand,
    {
      currentBefore,
      pending,
      changed: transition.changed,
      player: false,
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

/**
 * A754/A785的组级骨架：按组序处理组长和7子槽。保留给旧调用者；正式固定帧
 * 遍历位于originalframe.js并直接调用executeOriginalChild。
 */
export function executeOriginalSide(
  pool,
  side,
  { player = false, updateChild = null } = {},
) {
  const results = [];
  for (let group = 0; group < ORIGINAL_GROUP_COUNT; group++) {
    const leader = originalObjectAddress(side, group, 0);
    if (pool.isActive(leader))
      results.push(executeOriginalGroupLeader(pool, leader, { player }));
    else parkOriginalInactiveGroup(pool, side, group);
    for (let slot = 1; slot < 8; slot++) {
      const address = originalObjectAddress(side, group, slot);
      if (pool.isActive(address)) updateChild?.(address, results);
    }
  }
  return results;
}
