// KI.EXE 战术结束回写 — 0x9EBD / 0x9F2C / 0x9F58。

import {
 ORIGINAL_GROUP_COUNT,
 ORIGINAL_OBJECT,
 ORIGINAL_SLOTS_PER_GROUP,
 originalObjectAddress,
} from "./originalstate.js";
import {
 ORIGINAL_TEMP_GROUP_BASE,
 ORIGINAL_TEMP_GROUP_SIZE,
 OriginalBattleTempRecords,
} from "./originalinit.js";

const BYTE_MAX = 0xff;
const GROUP_COUNT = ORIGINAL_GROUP_COUNT;

const clampByte = (value) => Math.max(0, Math.min(BYTE_MAX, value | 0));

/**
 * 0x9F2C：扫描一侧 0x30 个对象；活动对象按地址所在的 0x100 组累计。
 * @param {ArrayLike<{flags?: number}>} objects 必须按原版槽地址顺序提供48项。
 */
export function countActiveObjectsByGroup(objects) {
 const groups = Array(GROUP_COUNT).fill(0);
 for (let index = 0; index < 0x30; index++) {
  const flags = objects?.[index]?.flags ?? 0;
  if ((flags & 0xff) < 0x80) continue;
  groups[index >> 3] = clampByte(groups[index >> 3] + 1);
 }
 return groups;
}

/**
 * 0x9F58：每组结果为临时组记录 +3 与 +1 两个字节之和（u8）。
 */
export function tacticalGroupSurvivors(groupRecords) {
 return Array.from({ length: GROUP_COUNT }, (_, index) => {
  const record = groupRecords?.[index] ?? {};
  return (
   ((record.primary ?? record.hp ?? 0) + (record.active ?? record.count ?? 0)) &
   0xff
  );
 });
}

/** 0x9F2C：在B4B8已累计的退出幸存数上，追加仍活动的48对象。 */
export function countOriginalPoolSurvivors(pool, temps, side) {
 if (!(temps instanceof OriginalBattleTempRecords))
  throw new TypeError("original survivor count requires temporary records");
 const counts = Array(GROUP_COUNT).fill(0);
 for (let group = 0; group < GROUP_COUNT; group++) {
  const offset = ORIGINAL_TEMP_GROUP_BASE + group * ORIGINAL_TEMP_GROUP_SIZE;
  counts[group] = temps.read8(side, offset + 3);
  for (let slot = 0; slot < ORIGINAL_SLOTS_PER_GROUP; slot++) {
   const address = originalObjectAddress(side, group, slot);
   if (pool.read8(address, ORIGINAL_OBJECT.FLAGS) < 0x80) continue;
   counts[group] = clampByte(counts[group] + 1);
  }
  temps.write8(side, offset + 3, counts[group]);
 }
 return counts;
}

/** 临时记录+9的未展开兵数与+0x0B活动对象数相加，得到六队最终十人单位数。 */
export function originalTempGroupSurvivors(temps, side) {
 if (!(temps instanceof OriginalBattleTempRecords))
  throw new TypeError("original group result requires temporary records");
 return Array.from({ length: GROUP_COUNT }, (_, group) => {
  const record = temps.group(side, group);
  return (record.remaining + record.survivors) & 0xff;
 });
}

/**
 * 复刻 0x9EBD 败方基数处理及 0x9F58 士气缩放。
 * 注意原版先把军团总兵写为 newTotal，再以旧总兵为除数，因此：
 * newMorale = floor(baseMorale * newTotal / oldTotal)。
 */
export function originalTacticalMorale(oldMorale, oldTotal, newTotal, won) {
 const previousTotal = Math.max(0, oldTotal | 0);
 const survivors = Math.max(0, newTotal | 0);
 if (previousTotal === 0 || survivors === 0) return 0;

 const morale = clampByte(oldMorale);
 let base = morale;
 if (!won) base = morale > 0x63 ? 0x63 : 0;
 return clampByte(Math.floor((base * survivors) / previousTotal));
}

export function settleOriginalTacticalLegion({
 oldMorale,
 oldTotal,
 groupRecords,
 won,
}) {
 const units = tacticalGroupSurvivors(groupRecords);
 const troops = units.reduce((sum, value) => sum + value, 0);
 return {
  units,
  troops,
  morale: originalTacticalMorale(oldMorale, oldTotal, troops, won),
 };
}
