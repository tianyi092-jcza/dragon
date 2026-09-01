// KI.EXE ADC8 单对象分支：ADE7..AE2C、B413/B4B8。
// active对象执行动画/AF69/B240并在本槽立刻计数；inactive对象可从临时组记录
// 补入下一名士兵，但该新对象要到下一帧才进入AEA9计数。

import { ORIGINAL_OBJECT, originalAddressParts } from "./originalstate.js";
import { commitOriginalSpatialOccupancy } from "./originalmovement.js";
import {
  ORIGINAL_TEMP_GROUP_BASE,
  ORIGINAL_TEMP_GROUP_SIZE,
} from "./originalinit.js";

function tempGroupOffset(group) {
  return ORIGINAL_TEMP_GROUP_BASE + group * ORIGINAL_TEMP_GROUP_SIZE;
}

/** B4B8→B3B2：退出对象并清旧双平面占用；AH=0时累计该队幸存槽。 */
export function finalizeOriginalBattleObject(
  pool,
  temps,
  spatial,
  address,
  { creditSurvivor = false } = {},
) {
  const { side, group } = originalAddressParts(address);
  if (creditSurvivor) {
    const offset = tempGroupOffset(group) + 3;
    temps.write8(side, offset, temps.read8(side, offset) + 1);
  }
  const previous = pool.read16(address, ORIGINAL_OBJECT.SPATIAL_0E);
  spatial.write8(previous, spatial.read8(previous) & 0x80);
  spatial.write8(previous + 0x1000, spatial.read8(previous + 0x1000) & 0x80);
  pool.write8(
    address,
    ORIGINAL_OBJECT.FLAGS,
    pool.read8(address, ORIGINAL_OBJECT.FLAGS) & 0x10,
  );
  return { address, side, group, creditSurvivor, finalized: true };
}

/** B413/B4EA：非撤退侧从临时记录+9补入一个对象。 */
export function reviveOriginalBattleObject(
  pool,
  temps,
  spatial,
  registers,
  address,
) {
  const { side, group, slot } = originalAddressParts(address);
  const offset = tempGroupOffset(group);
  const remaining = temps.read8(side, offset + 1);
  const sideCode = side + 1;
  if (remaining === 0 || sideCode === (registers.winnerState & 0xff))
    return { address, revived: false, reason: "empty-or-retreating", slot };

  const y = Math.max(
    0x10,
    Math.min(0x2f, pool.read8(address, ORIGINAL_OBJECT.ANCHOR_Y)),
  );
  const x = side === 0 ? 1 : 0x3e;
  const mapIndex = y * 0x40 + x;
  pool.write8(address, ORIGINAL_OBJECT.ANCHOR_X, x);
  pool.write8(address, ORIGINAL_OBJECT.ANCHOR_X + 1, x);
  pool.write8(address, ORIGINAL_OBJECT.ANCHOR_Y, y);
  pool.write8(address, ORIGINAL_OBJECT.ANCHOR_Y + 1, y);
  pool.write16(address, ORIGINAL_OBJECT.SPATIAL_0C, mapIndex);
  pool.write16(address, ORIGINAL_OBJECT.SPATIAL_0E, mapIndex);
  pool.write8(address, ORIGINAL_OBJECT.HEIGHT, 0);
  pool.write8(address, ORIGINAL_OBJECT.LEVEL, 0);
  pool.write8(address, ORIGINAL_OBJECT.PREVIOUS_LEVEL, 0);

  if (
    (spatial.read8(mapIndex) & 0x7f) !== 0 ||
    (spatial.read8(mapIndex + 0x1000) & 0x7f) !== 0
  )
    return { address, revived: false, reason: "occupied", slot, mapIndex };

  temps.write8(side, offset + 1, remaining - 1);
  temps.write16(side, 4, temps.read16(side, 4) - 1);
  pool.write8(address, ORIGINAL_OBJECT.HP, temps.read8(side, 6));
  pool.write8(
    address,
    ORIGINAL_OBJECT.FLAGS,
    (pool.read8(address, ORIGINAL_OBJECT.FLAGS) | 0x88) & 0xfe,
  );
  pool.write8(address, ORIGINAL_OBJECT.KIND, 0);
  pool.write8(address, ORIGINAL_OBJECT.STATE, 0);

  let pending = pool.read8(address, ORIGINAL_OBJECT.PENDING_COMMAND);
  const current = pool.read8(address, ORIGINAL_OBJECT.CURRENT_COMMAND);
  if (pending === 5) pending = current;
  else if (pending === 6) pending = 3;
  else if (pending === 7) pending = 0;
  pool.write8(address, ORIGINAL_OBJECT.CURRENT_COMMAND, 8);
  pool.write8(address, ORIGINAL_OBJECT.PENDING_COMMAND, pending);
  const occupancy = commitOriginalSpatialOccupancy(pool, spatial, address);
  return {
    address,
    side,
    group,
    slot,
    revived: true,
    mapIndex,
    pending,
    occupancy,
  };
}

/** AE00..AE18：inactive动画倒计时或B413补员。 */
export function updateOriginalInactiveObject(
  pool,
  temps,
  spatial,
  registers,
  address,
) {
  const flags = pool.read8(address, ORIGINAL_OBJECT.FLAGS);
  if ((flags & 1) === 0)
    return reviveOriginalBattleObject(pool, temps, spatial, registers, address);
  const kind = (pool.read8(address, ORIGINAL_OBJECT.KIND) - 1) & 0xff;
  pool.write8(address, ORIGINAL_OBJECT.KIND, kind);
  if (kind !== 0) return { address, revived: false, animation: true, kind };
  return finalizeOriginalBattleObject(pool, temps, spatial, address, {
    creditSurvivor: false,
  });
}

/** ADF1..AE29：active动画/AF69，随后固定B240。 */
export function updateOriginalActiveObject(
  session,
  address,
  updateMovement = null,
) {
  const pool = session.pool;
  const flags = pool.read8(address, ORIGINAL_OBJECT.FLAGS);
  let movement = null;
  if ((flags & 0x40) === 0) {
    const kind = pool.read8(address, ORIGINAL_OBJECT.KIND);
    if (kind === 0) {
      movement = updateMovement?.(session, address) ?? null;
      const status = pool.read8(address, ORIGINAL_OBJECT.STATUS_TIME);
      if (status !== 0)
        pool.write8(address, ORIGINAL_OBJECT.STATUS_TIME, status - 1);
    } else {
      const nextKind = (kind - 1) & 0xff;
      pool.write8(address, ORIGINAL_OBJECT.KIND, nextKind);
      if (nextKind === 0)
        pool.write8(
          address,
          ORIGINAL_OBJECT.STATE,
          pool.read8(address, ORIGINAL_OBJECT.STATE) & 1,
        );
    }
  }
  const occupancy = commitOriginalSpatialOccupancy(
    pool,
    session.spatial,
    address,
  );
  return { address, movement, occupancy };
}
