// Web 军团兼容补全：原版 SAVE 军团记录固定有六队，但部分旧 Web
// synthetic/recreation 路径只保存总兵。这里不是新增 KI.EXE 编成规则；仅用项目
// 既有默认类型确定性展开，保证运行时与 SAVE 都有可表示的六队。
export const DEFAULT_LEGION_UNIT_TYPES = Object.freeze([1, 1, 3, 3, 2, 2]);
export const LEGION_SLOT_COUNT = 128;

const UNIT_COUNT = DEFAULT_LEGION_UNIT_TYPES.length;
const MAX_UNIT_TROOPS = 1000;
const SAVE_TROOP_SCALE = 10;
const MAX_LEGION_STRENGTH = (UNIT_COUNT * MAX_UNIT_TROOPS) / SAVE_TROOP_SCALE;

/**
 * 将 Web 战略总兵（十人为一单位）展开成六队 Web 人数。
 * 超过六队各1000人的部分无法由现有编成表示，故夹到600战略兵力；余数从主将队起分配。
 */
export function createDefaultLegionUnits(troops) {
  const strength = Math.max(
    0,
    Math.min(MAX_LEGION_STRENGTH, Math.floor(Number(troops) || 0)),
  );
  const base = Math.floor(strength / UNIT_COUNT);
  const remainder = strength % UNIT_COUNT;
  return DEFAULT_LEGION_UNIT_TYPES.map((type, index) => ({
    type,
    troops: (base + (index < remainder ? 1 : 0)) * SAVE_TROOP_SCALE,
  }));
}

/** 已有完整六队保持原样；只补全缺失/不完整的旧 Web 军团。 */
/** 按当前军团占用分配原版128槽；运行期新军团与SAVE claim使用同一最小空槽策略。 */
export function claimLegionSlot(legions, preferred = null, exclude = null) {
  const occupied = new Set(
    (legions ?? [])
      .filter((legion) => legion && legion !== exclude && !legion.dead)
      .map((legion) => legion.slot)
      .filter(
        (slot) =>
          Number.isInteger(slot) && slot >= 0 && slot < LEGION_SLOT_COUNT,
      ),
  );
  if (
    Number.isInteger(preferred) &&
    preferred >= 0 &&
    preferred < LEGION_SLOT_COUNT &&
    !occupied.has(preferred)
  )
    return preferred;
  for (let slot = 0; slot < LEGION_SLOT_COUNT; slot++)
    if (!occupied.has(slot)) return slot;
  return null;
}

/**
 * 军团主将权威关联。新Web军团以generalIdx保存武将索引；leader仅供显示。
 * 旧Web快照若只有显示名，必须先按去空白姓名恢复；军团slot不是主将索引。
 */
export function generalForLegion(scenario, legion) {
  if (!scenario || !legion) return null;
  const generals = scenario.generals ?? [];
  for (const index of [legion.generalIdx, legion.leader]) {
    if (Number.isInteger(index) && generals[index]) return generals[index];
  }
  const leaderName =
    typeof legion.leader === "string" ? legion.leader.trim() : "";
  if (!leaderName) return null;
  return (
    generals.find(
      (general) =>
        general &&
        typeof general.name === "string" &&
        general.name.trim() === leaderName,
    ) ?? null
  );
}

export function ensureLegionSlot(legions, legion, preferred = null) {
  if (
    Number.isInteger(legion?.slot) &&
    legion.slot >= 0 &&
    legion.slot < LEGION_SLOT_COUNT &&
    !(legions ?? []).some(
      (candidate) =>
        candidate !== legion &&
        !candidate.dead &&
        candidate.slot === legion.slot,
    )
  )
    return legion.slot;
  const slot = claimLegionSlot(legions, preferred, legion);
  if (legion && slot != null) legion.slot = slot;
  return slot;
}

export function ensureLegionUnits(legion) {
  if (!legion) return [];
  if (
    Array.isArray(legion.units) &&
    legion.units.length === UNIT_COUNT &&
    legion.units.every(
      (unit) =>
        unit != null &&
        Number.isFinite(Number(unit.troops)) &&
        Number(unit.troops) >= 0,
    )
  )
    return legion.units;
  legion.units = createDefaultLegionUnits(legion.troops);
  // fallback 可能因六队上限截断；总兵同步到实际可表示值。
  legion.troops = legion.units.reduce(
    (sum, unit) => sum + Math.floor(unit.troops / SAVE_TROOP_SCALE),
    0,
  );
  return legion.units;
}
