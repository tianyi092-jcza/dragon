// KI.EXE 战略速算核心 — 0x4C72 / 0x5130 / 0x51B3 / 0x5285 / 0x52D7
//
// 本模块只实现已经由指令流闭合的数值部分：同地点主军选择、六单位战力、
// 逐单位伤亡与士气回写。0x474A 的战后撤退路径和 0x291A 的武将去向另行接入。
import {
  createDefaultLegionUnits,
  DEFAULT_LEGION_UNIT_TYPES,
  generalForLegion,
  LEGION_UNIT_TYPE,
} from "./legionunits.js";

const UNIT_COUNT = 6;
const EMPTY_TYPE = LEGION_UNIT_TYPE.EMPTY;
const DEFAULT_TYPES = DEFAULT_LEGION_UNIT_TYPES;
const CITY_GARRISON_TYPES = Array(6).fill(LEGION_UNIT_TYPE.INFANTRY);
// 0x52D7 用军团长索引直接寻址128×32B武将表。0x4F8A写入索引0x7F，
// 五库20章（含改版，官方为原版4章）的第127项均是固定占位记录：攻/野/水专长0，武/统/政8。
// 显式保留该档案，避免解析器是否显示占位姓名影响战力。
const CITY_GARRISON_COMMANDER = Object.freeze({
  ability: Object.freeze({ force: 8, lead: 8, siege: 0, field: 0, naval: 0 }),
});

/** CS:0x5120，行=战斗模式，列=兵种1..4。 */
export const TYPE_WEIGHT = Object.freeze([
  Object.freeze([2, 3, 3, 0]),
  Object.freeze([3, 2, 1, 0]),
  Object.freeze([1, 3, 2, 0]),
  Object.freeze([2, 1, 2, 0]),
]);

const clampByte = (value) => Math.max(0, Math.min(0xff, value | 0));

function nextByte(rng) {
  if (!rng || typeof rng.nextByte !== "function")
    throw new TypeError("strategic battle requires OriginalBattleRng.nextByte");
  return rng.nextByte() & 0xff;
}

function splitTotal(total) {
  const value = Math.max(0, total | 0);
  const base = Math.floor(value / UNIT_COUNT);
  const remainder = value % UNIT_COUNT;
  return Array.from(
    { length: UNIT_COUNT },
    (_, index) => base + (index < remainder ? 1 : 0),
  );
}

/** 0x4F8A：把城兵临时展开成六个步兵(type 3)单位，余数从第一队起分配。 */
export function createCityGarrison(city, leader = null) {
  const troops = Math.max(0, (city?.sim ? city.sim.troops : city?.troops) | 0);
  const faction = city?.faction ?? 0x18;
  return {
    leader,
    generalIdx: 0x7f,
    _commanderProfile: CITY_GARRISON_COMMANDER,
    faction,
    troops,
    morale: 0xff,
    units: splitTotal(troops).map((unitTroops, index) => ({
      type: CITY_GARRISON_TYPES[index],
      troops: unitTroops * 10,
    })),
  };
}

/**
 * 军团六单位规范化。
 * Web 编成面板的单位兵力以“人”为单位；战略军团以10人为一单位，故除以10。
 */
export function legionBattleUnits(legion) {
  const source = Array.isArray(legion?.units) ? legion.units : null;
  if (source?.length === UNIT_COUNT) {
    // KI.EXE 0x5285始终直接读取六队+0x29/+0x2A；+4总兵即使暂时
    // 不一致也不能反向重建、均分并改写兵种。0x6FD2会另行重算总兵。
    return source.map((unit, index) => ({
      type: Math.max(
        1,
        Math.min(EMPTY_TYPE, (unit.type ?? DEFAULT_TYPES[index]) | 0),
      ),
      troops: Math.max(0, Math.floor((unit.troops ?? 0) / 10)),
    }));
  }
  return createDefaultLegionUnits(legion?.troops ?? 0).map((unit) => ({
    type: unit.type,
    troops: Math.floor(unit.troops / 10),
  }));
}

function generalOf(sc, legion) {
  if (legion?._commanderProfile) return legion._commanderProfile;
  return generalForLegion(sc, legion);
}

function battleRating(general) {
  return general?.battle_rating ?? general?.raw_battle_rating ?? 0;
}

/** 0x4C72：同坐标、同势力军团中选兵力×士气×武将修正最大的主军。 */
export function selectPrimaryLegion(sc, candidates) {
  let selected = null;
  let best = -1;
  // 0x4C72从军团表0x2240起按0x40槽序扫描；评分相等时JAe保留低槽。
  for (const legion of (candidates ?? []).toSorted(
    (left, right) =>
      (left?.slot ?? left?._runtimeId ?? 0x7fff) -
      (right?.slot ?? right?._runtimeId ?? 0x7fff),
  )) {
    if (
      !legion ||
      legion.dead ||
      legion._active === false ||
      legion.faction == null ||
      (legion.status ?? 0x80) < 0x80 ||
      (Number.isInteger(legion.slot) && (legion.slot < 0 || legion.slot >= 127))
    )
      continue;
    // 4CC3覆盖AH，随后MUL AH只读AL；4CD0按军团槽而非+2主将取+1F。
    const troops = ((legion.troops & 0xffff) >> 4) & 0xff;
    const morale = clampByte(legion.morale ?? 200) >> 4;
    const general = Number.isInteger(legion.slot)
      ? sc.generals?.[legion.slot]
      : generalOf(sc, legion); // 仅无槽旧Web夹具兼容
    const rating = ((battleRating(general) & 0xff) >> 4) + 1;
    const score = (troops * morale * rating) & 0xffff;
    if (score > best) {
      best = score;
      selected = legion;
    }
  }
  return selected;
}

/** 0x5285：六单位兵种权重×士气。mode: 0城防、1野战、2水战预留、3攻城。 */
export function baseArmyPower(legion, mode, cityDefence = 0) {
  const row = TYPE_WEIGHT[Math.max(0, Math.min(3, mode | 0))];
  let weighted = 0;
  for (const unit of legionBattleUnits(legion)) {
    weighted += unit.troops * row[(unit.type - 1) & 3];
  }
  if ((mode | 0) === 0) weighted += Math.max(0, cityDefence | 0);
  return ((clampByte(legion?.morale ?? 200) >> 3) * weighted) & 0xffff;
}

/** 0x52D7：武力、统率和对应战斗专长修正。 */
export function commanderPower(sc, legion, mode, basePower, rng) {
  const general = generalOf(sc, legion);
  const force = clampByte(general?.ability?.force ?? 0);
  const lead = clampByte(general?.ability?.lead ?? 0);
  let specialtyValue = general?.ability?.field ?? 0;
  // 0x52D7 的战型参数：mode 0 攻城与临时兵种权重行3分离；
  // 攻守双方武将均读取攻城专长，只有0x5285的攻方兵种行临时切到3。
  if (mode === 0 || mode === 3) specialtyValue = general?.ability?.siege ?? 0;
  else if (mode === 2) specialtyValue = general?.ability?.naval ?? 0;
  const specialty = Math.max(0, Math.min(15, specialtyValue));

  let command;
  if (force < lead) command = lead * 2 - (lead >> 2);
  else if ((nextByte(rng) & 3) === 0) command = force + lead - (force >> 2);
  else command = force * 2;

  // 52EB..5304的运算目标CH为byte，溢出不能带入后面的word除法。
  const modifier = Math.floor(((command & 0xff) << 4) / (16 - specialty));
  // 0x52D7: 16位 MUL 后把 DX:AX 的字节重排为乘积>>8，再做两次
  // SHR DX/RCR AX，恰好等于无符号32位乘积>>10，返回低16位DX。
  const product =
    Math.imul(Math.max(0, basePower | 0) & 0xffff, modifier & 0xffff) >>> 0;
  return (product >>> 10) & 0xffff;
}

function casualtyState(legion) {
  const beforeUnits = legionBattleUnits(legion);
  return {
    beforeUnits,
    units: beforeUnits.map((unit) => ({ ...unit })),
    // 5249/524C换出旧+4作为士气除数，不由六队重新推导旧总兵。
    oldTotal: Number.isFinite(legion?.troops)
      ? legion.troops & 0xffff
      : beforeUnits.reduce((sum, unit) => sum + unit.troops, 0),
  };
}

function applyUnitLoss(state, index, loss) {
  let troops = Math.max(0, state.units[index].troops - loss);
  if (index === 0 && troops === 0) troops = 1;
  state.units[index].troops = troops;
}

function finishCasualties(legion, state, weakSide) {
  const troops = state.units.reduce((sum, unit) => sum + unit.troops, 0);
  const oldMorale = clampByte(legion?.morale ?? 200);
  let morale = 0;
  if (state.oldTotal > 0 && oldMorale >= 100) {
    const moraleBase = weakSide ? 100 : oldMorale;
    morale = Math.floor((moraleBase * troops) / state.oldTotal) & 0xff;
  }
  return { ...state, troops, morale };
}

/**
 * v1兼容DTO速算；默认/规范化/批量提交不属于native权威路径。
 * native真实2873调用navigation/originalfieldbattle.js，只有TYPE_WEIGHT共用。
 * 返回 winner 与双方逐单位结果；调用方决定0x474A撤退和0x291A清退。
 */
export function resolveStrategicBattle(
  sc,
  attacker,
  defender,
  { mode = 1, cityDefence = 0, rng } = {},
) {
  const atkBase = baseArmyPower(attacker, mode === 0 ? 3 : mode, 0);
  const defBase = baseArmyPower(defender, mode, cityDefence);
  // 0x5130只在攻城时把攻方第一次0x5285兵种权重行临时改为3；
  // 随后0x52D7仍以原始战型0调用，攻守双方均读取攻城专长。
  const atkScore =
    (commanderPower(sc, attacker, mode, atkBase, rng) + 8) & 0xffff;
  const defScore =
    (commanderPower(sc, defender, mode, defBase, rng) + 8) & 0xffff;
  const winner = atkScore >= defScore ? "atk" : "def";
  const strong = Math.max(atkScore, defScore);
  const weak = Math.max(1, Math.min(atkScore, defScore));
  const ratio = Math.min(100, Math.floor((strong * 8) / weak));

  // 0x5130内的伤亡段（0x51F9起）：SI固定胜方、DI固定败方，交错消费12字节。
  const attackState = casualtyState(attacker);
  const defenceState = casualtyState(defender);
  const winnerState = winner === "atk" ? attackState : defenceState;
  const loserState = winner === "atk" ? defenceState : attackState;
  for (let index = 0; index < UNIT_COUNT; index++) {
    applyUnitLoss(winnerState, index, (nextByte(rng) & 7) + 2);
    // 51F5仅初始化一次CH；521D在循环内INC CH，除数依次ratio+1..+6。
    applyUnitLoss(loserState, index, (nextByte(rng) % (ratio + index + 1)) + 8);
  }
  const attack = finishCasualties(attacker, attackState, winner !== "atk");
  const defence = finishCasualties(defender, defenceState, winner !== "def");
  return { winner, ratio, atkScore, defScore, attack, defence };
}

/** 0x51B3：每场城战在六队伤亡循环前扣一次城兵、上升率和防灾。 */
export function applySiegeCityDamage(city, ratio) {
  // 16位代码在byte AH中相减后做逻辑右移；ratio>0x3F时按u8回绕。
  const damage = ((0x3f - (ratio | 0)) & 0xff) >> 2;
  const read = (simKey, cityKey) =>
    city?.sim
      ? (city.sim[simKey] ?? city?.[cityKey] ?? 0)
      : (city?.[cityKey] ?? 0);
  const write = (simKey, cityKey, value) => {
    if (city?.sim) city.sim[simKey] = value;
    city[cityKey] = value;
  };
  write("troops", "troops", Math.max(0, read("troops", "troops") - damage));
  write("morale", "growth", Math.max(0, read("morale", "growth") - damage));
  write("food", "defence", Math.max(0, read("food", "defence") - damage));
  return damage;
}

/**
 * 战术攻城退出链 0xA65D→0x9FF8（非原生路径fallback，就地写回并返回DL）。
 *  A65D返回原始最小metric（×4只进D315）；无kind1时AX=FFFF仍进9FF8计算；
 *  9FF8按damageWord=u16(城兵+50-floor(metric/10))>>3取DL低字节饱和扣三属性。
 *  正式纯函数路径见 battle/originalexit.js；VM op15的D315×4查询是另一输出，保持不动。
 */
export function applyTacticalSiegeCityDamage(city, wallRecords) {
  const u16 = (value) => value & 0xffff;
  let metric = 0xffff;
  for (const record of (wallRecords ?? []).slice(0, 16)) {
    if (!record || (record?.kind ?? record?.type ?? 0) !== 1) continue;
    metric = Math.min(metric, u16(record.metric ?? 0xffff));
  }
  // 注：A65D的AH/bit0分支只决定D315（VM op15另行实现），不影响返回AX与城损，
  // 故本fallback不复刻该分支，只取原始最小metric。
  const troops = city?.sim
    ? (city.sim.troops ?? city?.troops ?? 0)
    : (city?.troops ?? 0);
  const damage = (u16(troops + 0x32 - Math.floor(metric / 10)) >>> 3) & 0xff;
  const subtract = (value) => Math.max(0, (value ?? 0) - damage);
  city.troops = subtract(city.troops);
  city.growth = subtract(city.growth);
  city.defence = subtract(city.defence);
  if (city.sim) {
    city.sim.troops = city.troops;
    if ("morale" in city.sim) city.sim.morale = city.growth;
    if ("food" in city.sim) city.sim.food = city.defence;
  }
  return damage;
}

/** 将速算单位结果写回 Web 军团字段，保持战略总兵力与编成兵力一致。 */
export function writeStrategicBattleResult(legion, result) {
  legion.troops = Math.max(0, result.troops | 0);
  legion.morale = clampByte(result.morale);
  legion.units = result.units.map((unit, index) => ({
    name: legion.units?.[index]?.name,
    type: unit.type,
    troops: unit.troops * 10,
  }));
}
