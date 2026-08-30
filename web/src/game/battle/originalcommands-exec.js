// KI.EXE 原版战术命令执行器第一切片。
// 完整复刻已闭合的玩家组长命令0/1/2/4/5的状态写入；具体移动探针与
// ABD2/ABFF/AC55攻击行为由回调注入，避免在规则层猜测尚未闭合的路径。

import {
  ORIGINAL_GROUP_COUNT,
  ORIGINAL_OBJECT,
  originalAddressParts,
  originalObjectAddress,
} from "./originalstate.js";
import {
  applyOriginalPendingCommand,
  broadcastOriginalGroupCommand,
} from "./originalcommands.js";

function dispatchAttackByClass(pool, address, handlers, command) {
  const classValue = pool.read8(address, ORIGINAL_OBJECT.CLASS);
  let branch = "below";
  if (classValue === 0x24) branch = "equal";
  else if (classValue > 0x24) branch = "above";
  handlers.attack?.({ address, classValue, branch, command });
  return { action: "attack", branch, classValue };
}

function beginPlayerCommand(changed, pool, address, nextCommand, handlers) {
  if (!changed) return false;
  broadcastOriginalGroupCommand(pool, address, nextCommand);
  handlers.refresh?.({ address, command: nextCommand });
  return true;
}

function executePlayerCommand0(pool, address, handlers, changed) {
  beginPlayerCommand(changed, pool, address, 0, handlers);
  const target = pool.read16(address, ORIGINAL_OBJECT.TARGET_X);
  const anchor = pool.read16(address, ORIGINAL_OBJECT.ANCHOR_X);
  if (target === anchor) {
    pool.write8(address, ORIGINAL_OBJECT.PENDING_COMMAND, 7);
    pool.write8(address, ORIGINAL_OBJECT.CURRENT_COMMAND, 7);
  }
  handlers.move?.({ address, command: 0 });
  return { action: "move", command: 0 };
}

function executePlayerCommand1(pool, address, handlers, changed) {
  beginPlayerCommand(changed, pool, address, 1, handlers);
  if (pool.read8(address, ORIGINAL_OBJECT.CLASS) === 0) {
    handlers.move?.({ address, command: 1 });
    return { action: "move", command: 1 };
  }
  return dispatchAttackByClass(pool, address, handlers, 1);
}

function executePlayerCommand2(pool, address, handlers, changed) {
  beginPlayerCommand(changed, pool, address, 2, handlers);
  handlers.wallSweep?.({ address, command: 2 });
  if (pool.read8(address, ORIGINAL_OBJECT.STATUS_TIME) >= 0x28)
    pool.write8(address, ORIGINAL_OBJECT.STATUS_TIME, 0x28);
  return dispatchAttackByClass(pool, address, handlers, 2);
}

function executePlayerCommand4(pool, address, handlers, changed) {
  if (changed) handlers.refresh?.({ address, command: 4 });
  const targetAddress = pool.read16(address, ORIGINAL_OBJECT.TARGET_POINTER);
  const targetX = pool.read8(targetAddress, ORIGINAL_OBJECT.ANCHOR_X);
  const targetY = pool.read8(targetAddress, ORIGINAL_OBJECT.ANCHOR_Y);
  const sourceX = pool.read8(address, ORIGINAL_OBJECT.ANCHOR_X);
  const sourceY = pool.read8(address, ORIGINAL_OBJECT.ANCHOR_Y);
  const distance =
    Math.abs(targetX - sourceX) + Math.abs(targetY - sourceY);
  broadcastOriginalGroupCommand(pool, address, distance <= 0x10 ? 4 : 0);
  handlers.move?.({ address, command: 4, distance, targetAddress });
  return { action: "approach", command: 4, distance, targetAddress };
}

function executePlayerCommand5(pool, address, handlers, changed, pendingBefore) {
  if (changed) {
    for (let slot = 1; slot < 8; slot++) {
      const child = address + slot * 0x20;
      pool.write8(
        child,
        ORIGINAL_OBJECT.FLAGS,
        pool.read8(child, ORIGINAL_OBJECT.FLAGS) | 0x08,
      );
      if (pool.read8(child, ORIGINAL_OBJECT.CURRENT_COMMAND) !== pendingBefore)
        pool.write8(child, ORIGINAL_OBJECT.PENDING_COMMAND, pendingBefore);
    }
    pool.write8(address, ORIGINAL_OBJECT.CURRENT_COMMAND, 5);
    handlers.refresh?.({ address, command: 5 });
  }
  handlers.formationMove?.({ address, command: 5, pending: pendingBefore });
  return { action: "formation", command: 5, pending: pendingBefore };
}

/** A7B7：玩家组长每帧执行入口。 */
export function executeOriginalPlayerLeader(
  pool,
  address,
  handlers = {},
) {
  const parts = originalAddressParts(address);
  if (parts.slot !== 0)
    throw new RangeError("original player leader command requires group leader");
  const pendingBefore = pool.read8(address, ORIGINAL_OBJECT.PENDING_COMMAND);
  const { changed, dispatchCommand } = applyOriginalPendingCommand(pool, address);
  if (dispatchCommand === 0) return executePlayerCommand0(pool, address, handlers, changed);
  if (dispatchCommand === 1) return executePlayerCommand1(pool, address, handlers, changed);
  if (dispatchCommand === 2) return executePlayerCommand2(pool, address, handlers, changed);
  if (dispatchCommand === 4) return executePlayerCommand4(pool, address, handlers, changed);
  if (dispatchCommand === 5)
    return executePlayerCommand5(pool, address, handlers, changed, pendingBefore);
  if (dispatchCommand === 7 || dispatchCommand === 8)
    return { action: "idle", command: dispatchCommand };
  handlers.unresolved?.({ address, command: dispatchCommand });
  return { action: "unresolved", command: dispatchCommand };
}

/** A83F：非活动组长令7个子槽pending=5，current=5的槽保持不变。 */
export function prepareOriginalInactiveGroup(pool, leaderAddress) {
  const parts = originalAddressParts(leaderAddress);
  if (parts.slot !== 0)
    throw new RangeError("inactive-group preparation requires group leader");
  for (let slot = 1; slot < 8; slot++) {
    const address = leaderAddress + slot * 0x20;
    if (pool.read8(address, ORIGINAL_OBJECT.CURRENT_COMMAND) !== 5)
      pool.write8(address, ORIGINAL_OBJECT.PENDING_COMMAND, 5);
  }
}

/** 按原版每侧六个组长地址顺序执行，供固定帧session接线。 */
export function executeOriginalPlayerLeaders(pool, side, handlers = {}) {
  const results = [];
  for (let group = 0; group < ORIGINAL_GROUP_COUNT; group++) {
    const address = originalObjectAddress(side, group, 0);
    if (pool.read8(address, ORIGINAL_OBJECT.FLAGS) >= 0x80)
      results.push(executeOriginalPlayerLeader(pool, address, handlers));
    else prepareOriginalInactiveGroup(pool, address);
  }
  return results;
}
