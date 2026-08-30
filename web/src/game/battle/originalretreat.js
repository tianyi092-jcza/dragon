// KI.EXE 战术自动撤退与战后倒计时入口。
//
// 0xAE56 在每次 0xADC8 后处理开始时只检查双方 0 号对象（地址 0/0x600）
// 的 +3 HP：低于 0x32 即调用 0xA8F6。它不读取军团士气百分比、六队总兵
// 或随机数。0侧先检查；若双方同时低于门槛，0侧先令 D349=1，随后1侧的
// A8F6 因 D349!=0 失败。0xA6FA 从下一逻辑帧起递减 D34A，归零后 1 表示
// 1侧胜、2转换为0表示0侧胜。

import { startOriginalFormation } from "./originalcommands.js";
import { ORIGINAL_OBJECT, originalObjectAddress } from "./originalstate.js";

export const ORIGINAL_AUTO_RETREAT_HP = 0x32;
export const ORIGINAL_RETREAT_COUNTDOWN = 0x78;
export const ORIGINAL_SIEGE_ATTRITION_PERIOD = 0x0a;

/** 0xAE56：返回本帧真正开始撤退的一侧；无触发时返回 null。 */
export function checkOriginalAutomaticRetreat(pool, registers) {
  for (let side = 0; side < 2; side++) {
    const leader = originalObjectAddress(side, 0, 0);
    const hp = pool.read8(leader, ORIGINAL_OBJECT.HP);
    if (hp >= ORIGINAL_AUTO_RETREAT_HP) continue;
    if (!startOriginalFormation(pool, registers, side * 0x600)) continue;
    return {
      side,
      leader,
      hp,
      winnerState: registers.winnerState & 0xff,
      countdown: registers.endCountdown & 0xff,
    };
  }
  return null;
}

/**
 * 0xAE73..0xAEA8：仅攻城 mode=0 每10次ADC8令战场侧标志指定一方的
 * 首对象HP减1（最低0）。该减值发生在本帧AE56检查之后，因此从0x32降到
 * 0x31会在下一帧触发自动撤退。
 */
export function tickOriginalSiegeLeaderAttrition(pool, registers) {
  if ((registers.mode & 0xff) !== 0) return null;
  registers.siegeLeaderTick = ((registers.siegeLeaderTick ?? 0x0a) - 1) & 0xff;
  if (registers.siegeLeaderTick !== 0) return null;
  registers.siegeLeaderTick = ORIGINAL_SIEGE_ATTRITION_PERIOD;

  const side = (registers.battleSideFlag & 0xff) < 0x80 ? 0 : 1;
  const leader = originalObjectAddress(side, 0, 0);
  const hpBefore = pool.read8(leader, ORIGINAL_OBJECT.HP);
  if (hpBefore !== 0) pool.write8(leader, ORIGINAL_OBJECT.HP, hpBefore - 1);
  return {
    side,
    leader,
    hpBefore,
    hpAfter: pool.read8(leader, ORIGINAL_OBJECT.HP),
  };
}

/** 0xAE35..0xAE4C：由D31A/D31B按原版u8算术重建D31E三态。 */
export function updateOriginalBattleBalance(registers) {
  const side0Timed = registers.side0Timed & 0xff;
  const adjustedSide1 = ((registers.side1Timed & 0xff) + 7) & 0xff;
  let delta = (side0Timed - adjustedSide1) & 0xff;
  let state = 2;
  if (side0Timed < adjustedSide1) {
    state = 0;
    delta = -delta & 0xff;
  }
  if (delta <= 8) state = 1;
  registers.d31e = state;
  return { side0Timed, side1Timed: registers.side1Timed & 0xff, delta, state };
}
