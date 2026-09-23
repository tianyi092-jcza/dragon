// KI.EXE 0x9FDC 战术层退出聚合。只处理战术胜方、双方六队/总兵/士气和mode0城损；
// 据点易主、0x474A撤退/继续、俘虏及SAVE序列化属于外层战略结算。

import {
  countOriginalPoolSurvivors,
  originalTempGroupSurvivors,
  originalTacticalMorale,
} from "./originalresult.js";

const u16 = (value) => value & 0xffff;
const saturatingSub = (value, amount) =>
  Math.max(0, (value | 0) - Math.max(0, amount | 0));

/** A65D：扫描16槽kind1记录，返回原始最小metric（DX），附D315输出值。
 *  P49现刷窗A65D..A69E：DX初值FFFF、AH初值1；kind(+1)==1才参选，无符号word取最小+18；
 *  任一该类记录flags bit0置位即AH=0。AH!=0才走AX=DX×4（A68E..A692，16位回绕），
 *  A694写CS:D315=AH，A699无条件AX=DX还原。故返回AX恒为原始DX，×4只进D315；
 *  无kind1时AX=FFFF、D315=FF，不得用found=false跳过原城损。 */
export function calculateOriginalWallMetric(records) {
  let metric = 0xffff;
  let anyBit0 = false;
  for (let index = 0; index < 16; index++) {
    const record = records?.[index];
    if (!record || (record.kind ?? record.type ?? 0) !== 1) continue;
    metric = Math.min(metric, u16(record.metric ?? 0xffff));
    if (((record.flags ?? 0) & 1) !== 0) anyBit0 = true;
  }
  return {
    anyBit0,
    metric,
    d315: anyBit0 ? 0 : u16(metric * 4) >>> 8,
  };
}

/** 9FF8：damageWord=u16(base+50-floor(metric/10))>>3，只取DL低字节饱和扣三属性。
 *  P49现刷窗9FF8..A036：call A65D取原始AX→除10（余数弃）；DS=[D52]、BX=[D32]，
 *  DX=u8(city+0x13)+50-AX后三次shr（16位回绕，中间下溢不钳0）；三次SUB byte,DL
 *  分别扣+0x10/+0x11/+0x13，JAE保留、借位则钳0。Web城池字段为战略尺度，base取原值
 *  （推断：与原战术记录字节的尺度映射未证）；回绕/移位/取DL/饱和扣按指令原样实现。 */
export function applyOriginalBattleCityDamage(city, wallMetric) {
  if (!city || !wallMetric) return null;
  const troops = city.troops ?? city.soldiers ?? city.garrison ?? 0;
  const expression = u16(troops + 50 - Math.floor(wallMetric.metric / 10));
  const damage = (expression >>> 3) & 0xff;
  const growth = saturatingSub(city.growth ?? 0, damage);
  const disaster = saturatingSub(city.defence ?? 0, damage);
  const remainingTroops = saturatingSub(troops, damage);
  return {
    damage,
    growth,
    disaster,
    defence: disaster,
    troops: remainingTroops,
    metric: wallMetric.metric,
    anyBit0: wallMetric.anyBit0,
  };
}

function settleSide(pool, temps, side, legion, winner) {
  countOriginalPoolSurvivors(pool, temps, side);
  const units = originalTempGroupSurvivors(temps, side);
  const troops = units.reduce((sum, value) => sum + value, 0);
  const oldUnits = Array.isArray(legion?.units)
    ? legion.units.reduce(
        (sum, unit) => sum + Math.floor(Math.max(0, unit?.troops ?? 0) / 10),
        0,
      )
    : Math.max(0, legion?.troops ?? 0);
  return {
    side,
    won: side === winner,
    units,
    troops,
    morale: originalTacticalMorale(
      legion?.morale ?? 0,
      oldUnits,
      troops,
      side === winner,
    ),
  };
}

/** 完整9FDC规则输出；函数不消费RNG，也不修改战略军团/城池对象。 */
export function settleOriginalBattleExit({
  pool,
  temps,
  registers,
  legions = [],
  wallRecords = [],
  city = null,
} = {}) {
  const winner = registers?.winnerState & 1;
  const sides = [
    settleSide(pool, temps, 0, legions[0], winner),
    settleSide(pool, temps, 1, legions[1], winner),
  ];
  const wallMetric =
    (registers?.mode ?? 0) === 0
      ? calculateOriginalWallMetric(wallRecords)
      : null;
  const cityDamage = wallMetric
    ? applyOriginalBattleCityDamage(city, wallMetric)
    : null;
  return {
    winner,
    sides,
    wallMetric,
    cityDamage,
    rngCalls: 0,
  };
}
