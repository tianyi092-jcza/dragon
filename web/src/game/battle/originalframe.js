// KI.EXE A754/A785 原版每帧对象处理顺序。
// 本切片固化：两侧各6组，组长先选目标并按对应玩家/AI跳表执行，随后7个
// 活动子槽走A7FD；非活动组长走A83F。具体移动/攻击由回调注入。

import {
  ORIGINAL_GROUP_COUNT,
  ORIGINAL_OBJECT,
  ORIGINAL_SLOTS_PER_GROUP,
  originalObjectAddress,
} from "./originalstate.js";
import {
  executeOriginalChild,
  executeOriginalGroupLeader,
  parkOriginalInactiveGroup,
} from "./originalexecutor.js";

/** A754/A785：按组长→7子槽、组0→5的地址顺序处理一侧。 */
export function updateOriginalBattleSide(
  pool,
  side,
  {
    player = true,
    leaderHandlers = {},
    childHandlers = {},
    formation = null,
    attackContext = null,
    selectTarget = true,
  } = {},
) {
  const visits = [];
  for (let group = 0; group < ORIGINAL_GROUP_COUNT; group++) {
    const leader = originalObjectAddress(side, group, 0);
    if (pool.read8(leader, ORIGINAL_OBJECT.FLAGS) >= 0x80) {
      let target = null;
      let result;
      if (selectTarget) {
        result = executeOriginalGroupLeader(pool, leader, {
          player,
          handlers: leaderHandlers,
          formation,
          attackContext,
        });
        target = result.target;
        if (!player) leaderHandlers.ai?.(result);
      } else {
        target = null;
        // executeOriginalGroupLeader固定包含A85B；无目标选择模式仅供顺序测试。
        result = { action: "skipped", command: null };
      }
      visits.push({ address: leader, role: "leader", target, result });
    } else {
      parkOriginalInactiveGroup(pool, side, group);
      visits.push({ address: leader, role: "inactive-leader", result: null });
    }

    for (let slot = 1; slot < ORIGINAL_SLOTS_PER_GROUP; slot++) {
      const address = originalObjectAddress(side, group, slot);
      if (pool.read8(address, ORIGINAL_OBJECT.FLAGS) < 0x80) {
        visits.push({ address, role: "inactive-child", result: null });
        continue;
      }
      const result = selectTarget
        ? executeOriginalChild(pool, address, {
            handlers: childHandlers,
            formation,
            attackContext,
          })
        : { action: "skipped", command: null };
      visits.push({ address, role: "child", result });
    }
  }
  return visits;
}

/** A6FA尾部固定顺序：先A754的0侧，再A785的0x600侧。 */
export function updateOriginalBattleObjects(pool, handlers = {}) {
  const defaults = {
    player: handlers.player ?? true,
    leaderHandlers: handlers.leaderHandlers ?? {},
    childHandlers: handlers.childHandlers ?? {},
    formation: handlers.formation ?? null,
    attackContext: handlers.attackContext ?? null,
    selectTarget: handlers.selectTarget ?? true,
  };
  return [
    ...updateOriginalBattleSide(pool, 0, {
      ...defaults,
      ...handlers.side0,
    }),
    ...updateOriginalBattleSide(pool, 1, {
      ...defaults,
      ...handlers.side1,
    }),
  ];
}

/** ADC8/AEA9：每帧后处理重建D31A..D31D，而不是在击杀时递减持久计数。 */
export function recountOriginalBattleActivity(pool, registers) {
  let side0Active = 0;
  let side1Active = 0;
  let side0Timed = 0;
  let side1Timed = 0;

  for (let side = 0; side < 2; side++) {
    for (let group = 0; group < ORIGINAL_GROUP_COUNT; group++) {
      for (let slot = 0; slot < ORIGINAL_SLOTS_PER_GROUP; slot++) {
        const address = originalObjectAddress(side, group, slot);
        if (!pool.isActive(address)) continue;
        const timed = pool.read8(address, ORIGINAL_OBJECT.STATUS_TIME) !== 0;
        if (side === 0) {
          side0Active++;
          if (timed) side0Timed++;
        } else {
          side1Active++;
          if (timed) side1Timed++;
        }
      }
    }
  }

  registers.side0Active = side0Active & 0xff;
  registers.side1Active = side1Active & 0xff;
  registers.side0Timed = side0Timed & 0xff;
  registers.side1Timed = side1Timed & 0xff;
  return { side0Active, side1Active, side0Timed, side1Timed };
}
