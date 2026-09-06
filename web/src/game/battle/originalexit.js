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

/** A65D：扫描16条kind1记录；没有任何bit0置位时最小metric乘4。 */
export function calculateOriginalWallMetric(records) {
  let metric = 0xffff;
  let found = false;
  let anyBit0 = false;
  for (let index = 0; index < 16; index++) {
    const record = records?.[index];
    if (!record || (record.kind ?? record.type ?? 0) !== 1) continue;
    found = true;
    metric = Math.min(metric, u16(record.metric ?? 0xffff));
    if (((record.flags ?? 0) & 1) !== 0) anyBit0 = true;
  }
  return {
    found,
    anyBit0,
    metric: found && !anyBit0 ? u16(metric * 4) : metric,
  };
}

/** 9FF8：damage=(城兵+50-floor(metric/10))>>3，同步饱和扣三属性。 */
export function applyOriginalBattleCityDamage(city, wallMetric) {
  if (!city || !wallMetric?.found) return null;
  const troops = city.troops ?? city.soldiers ?? city.garrison ?? 0;
  const expression = u16(troops + 50 - Math.floor(wallMetric.metric / 10));
  const damage = expression >>> 3;
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
