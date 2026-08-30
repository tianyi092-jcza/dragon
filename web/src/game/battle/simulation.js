// 战斗系统 — 战术层 (Web 版实时战斗, 复用原版战场素材与编制语义)
//
// 逆向依据 (docs/re-notes-kernel.md):
//   - BATTLE.MAP 目录每项2B: 首字节=战场布局号(battle_map_{n}.png),
//     次字节=地形主题；城战使用0..213，野战由0x4B63选择0xC0..0xD5。
//   - 军团记录 +28+i×4 = 六个战斗单位，+1兵力、+2兵种(1骑/2步/3弓/4空)
//   - BATTLE.DAT 开场脚本块号 = 编制类型×4+攻守; VM 解释器见 battlescript.js，
//     battleview 开战时按军团 formation 字段回放。
//
// 设计: 1024×1024 战场(64 图块×16px)，单位实时寻敌接战；伤亡由
//   武力、兵力、士气、兵种、战场环境、武将对应专长及侧后/包围共同决定；
//   兵力<25%或士气崩溃→溃走。野外接敌使用独立军团防守方，0x4B63
//   按战略道路地形选择目录与镜像。兵种克制等逐帧系数属于Web战术映射。

import {
  WALL_ATTACK_RANGE,
  blockingWall,
  createWallRecords,
  nearestIntactWall,
  stopBeforeWall,
  strikeWallRecord,
  wallCenter,
} from "../battlewalls.js";
import { createCityGarrison, legionBattleUnits } from "../autobattle.js";

/** 战场世界尺寸 (px, 64图块 × 16px/块) */
export const FIELD = 1024;

const MELEE_RANGE = 26; // 接战距离
const AGGRO_RANGE = 260; // 主动索敌范围
const ARCHER_RANGE = 180; // Web实时战术映射；原版逐兵种射程仍待逆向闭合
const ARCHER_RETREAT_RANGE = 72;
const ALLY_AVOID_RADIUS = 30;
const SHOT_CORRIDOR = 15;
const FORMATION_ADVANCE_COUNT = 2;
const GUARD_ARC_COS = -0.15; // 约200°警戒扇面；贴身敌军不受方向限制
const CAVALRY_CHARGE_DISTANCE = 84;
const CAVALRY_CHARGE_MULTIPLIER = 1.42;
const NAVAL_TURN_RATE = 1.9; // rad/s，水战单位转向后再沿舰首推进
const ROUT_SHARE = 0.25; // 仅旧Web表现层；原版规则模拟器不得以此决定自动撤退
const ROLE = ["主將", "前鋒", "左翼", "右翼", "左備", "右備"];
const BATTLE_DIALOGUE_COOLDOWN = 4.5;

// 战略记录已实锤 type 1=骑兵、2=步兵、3=弓兵。以下速度、近战倍率、
// 克制、地形和侧后攻击系数均为 Web 实时战术层的可见映射，不宣称为
// 原版逐帧战术数值；原版已证的兵种编号和武将野战/水战/城塞专长仍直接沿用。
export const TACTICAL_UNIT_TYPES = Object.freeze({
  1: Object.freeze({ key: "cavalry", label: "騎", speed: 8, melee: 1.15 }),
  2: Object.freeze({ key: "infantry", label: "步", speed: 1, melee: 1 }),
  3: Object.freeze({ key: "archer", label: "弓", speed: -2, melee: 0.72 }),
});

const TACTICAL_TERRAINS = Object.freeze({
  siege: Object.freeze({
    key: "siege",
    label: "城塞戰",
    specialty: "siege",
    move: Object.freeze({ 1: 0.9, 2: 1, 3: 1 }),
    attack: Object.freeze({ 1: 0.95, 2: 1, 3: 1 }),
  }),
  land: Object.freeze({
    key: "land",
    label: "野戰",
    specialty: "field",
    move: Object.freeze({ 1: 1, 2: 1, 3: 1 }),
    attack: Object.freeze({ 1: 1, 2: 1, 3: 1 }),
  }),
  water: Object.freeze({
    key: "water",
    label: "水戰",
    specialty: "naval",
    move: Object.freeze({ 1: 0.72, 2: 0.88, 3: 0.94 }),
    attack: Object.freeze({ 1: 0.78, 2: 0.92, 3: 1.04 }),
  }),
});

/** fieldTerrain 8/9 来自0xCA与0xC0..0xC3水路类别；其余先统一为陆战。 */
export function tacticalTerrainProfile(kind, fieldTerrain = null) {
  if (kind === "siege") return TACTICAL_TERRAINS.siege;
  const terrainClass = fieldTerrain?.terrainClass ?? 0;
  return terrainClass >= 8 ? TACTICAL_TERRAINS.water : TACTICAL_TERRAINS.land;
}

/** Web实时层的循环克制：骑压弓、步制骑、弓射步。 */
export function tacticalTypeModifier(attackerType, defenderType) {
  const attacker = unitType(attackerType);
  const defender = unitType(defenderType);
  if (attacker === defender) return 1;
  if (
    (attacker === 1 && defender === 3) ||
    (attacker === 2 && defender === 1) ||
    (attacker === 3 && defender === 2)
  )
    return 1.18;
  return 0.86;
}

function unitType(type) {
  const value = Math.max(1, Math.min(3, type | 0));
  return TACTICAL_UNIT_TYPES[value] ? value : 2;
}

function mkUnit(
  side,
  i,
  n,
  troops,
  type,
  genName,
  ability,
  morale,
  strategicIndex = null,
) {
  // 攻方列于西(x小) 守方列于东 — 对应原版脚本"对称布阵"
  const normalizedType = unitType(type);
  const profile = TACTICAL_UNIT_TYPES[normalizedType];
  const colX = side === "atk" ? 110 : FIELD - 110 - (i % 2) * 40;
  const rowY = FIELD / 2 + (i - (n - 1) / 2) * 150;
  return {
    side,
    idx: i,
    strategicIndex,
    type: normalizedType,
    typeKey: profile.key,
    typeLabel: profile.label,
    x: colX,
    y: rowY,
    hx: colX, // 编队槽位 (BATTLE.DAT 开场脚本列阵目标点)
    hy: rowY,
    troops,
    maxTroops: troops,
    gen: genName,
    label:
      (strategicIndex ?? i) === 0
        ? genName
        : (ROLE[strategicIndex ?? i] ?? `${i + 1}軍`),
    force: (ability?.force ?? 50) + ((strategicIndex ?? i) === 0 ? 10 : 0),
    specialties: {
      siege: Math.max(0, Math.min(15, ability?.siege ?? 0)),
      field: Math.max(0, Math.min(15, ability?.field ?? 0)),
      naval: Math.max(0, Math.min(15, ability?.naval ?? 0)),
    },
    morale: Math.max(0, Math.min(255, morale ?? (side === "atk" ? 100 : 85))),
    speed: 27 + profile.speed,
    routed: false,
    gone: false,
    order: null, // 玩家点选移动目标 {x,y}
    cd: 0, // 交战冷却(s)
    attackPulse: 0,
    facingX: side === "atk" ? 1 : -1,
    facingY: 0,
    chargeRun: 0,
    chargeTargetId: null,
  };
}

function applyBattleEnvironment(units, terrain) {
  for (const unit of units) {
    unit.moveModifier = terrain.move[unit.type] ?? 1;
    unit.attackModifier = terrain.attack[unit.type] ?? 1;
    unit.battleSpecialty = unit.specialties?.[terrain.specialty] ?? 0;
    unit.terrainKey = terrain.key;
  }
}

function playerSideOf(sc, attacker) {
  if (!Number.isInteger(sc?.player_faction)) return null;
  return attacker?.faction === sc.player_faction ? "atk" : "def";
}

/** 开场布阵阶段: 单位退到己方场边待命 (hx/hy 槽位不变, 由开场脚本列阵召回) */
export function placeStaging(s) {
  for (const u of s.units) {
    u.x = u.side === "atk" ? -40 - u.idx * 30 : FIELD + 40 + u.idx * 30;
    u.y = u.hy;
    u.order = null;
  }
}

/**
 * 创建攻城战斗状态。
 * 攻方为军团（主将名/势力/兵力），守方为城池及可选驻守军团。
 */
export function createBattle(sc, A, city, battleMaps, D = null) {
  const meta = battleMaps?.cities.find((m) => m.idx === city.idx);
  const layout = meta ? meta.layout : 0;
  const layoutTiles = battleMaps?.layouts?.[layout] ?? null;

  // 主将武力: 军团长 / 守方太守(无则君主)
  const genOf = (name) => sc.generals.find((g) => g.name === name);
  const atkGen = genOf(A.leader);
  const defGen = D ? genOf(D.leader) : null;
  const defCity = sc.factions[city.faction];
  const govIdx = city.raw
    ? parseInt(city.raw.slice(0x19 * 2, 0x19 * 2 + 2), 16)
    : 0xff;
  const defGeneral =
    (govIdx !== 0xff && sc.generals[govIdx]) ||
    (defCity && genOf(defCity.monarch)) ||
    null;

  const defTroops = Math.max(
    1,
    (city.sim ? city.sim.troops : city.troops) | 0 || 20,
  );
  const units = fieldUnits("atk", A, atkGen);
  if (D) units.push(...fieldUnits("def", D, defGen));
  else {
    const garrison = createCityGarrison(city, defGeneral?.name ?? null);
    units.push(...fieldUnits("def", garrison, defGeneral));
  }
  const terrain = tacticalTerrainProfile("siege");
  applyBattleEnvironment(units, terrain);

  return {
    kind: "siege",
    A,
    D,
    city,
    layout,
    // 0x9CB3→0x9CE2：从64×64布局的0xD0..0xDF图块构造前16条城壁对象。
    // metric及bit0受击迁移使用已闭合原版语义；战术攻击频率仍是Web实时映射。
    wallRecords: createWallRecords(layoutTiles, defTroops, 0),
    formation: A.formation ?? 1, // 军团编制类型 1..4 (原版军团记录 [si+0x2A], 0xCBE5 选块用)
    terrain,
    playerSide: playerSideOf(sc, A),
    speakers: { atk: atkGen ?? null, def: defGen ?? defGeneral ?? null },
    units,
    effects: [],
    dialogues: [],
    lastDialogueAt: { atk: -Infinity, def: -Infinity },
    nextDialogueSequence: 0,
    time: 0,
    over: null, // null | 'atk' | 'def'
    title: `${A.leader}軍 ⚔ ${city.name} (${D?.leader ?? defGeneral?.name ?? "守軍"})`,
  };
}

function fieldUnits(side, legion, general) {
  const normalized = legionBattleUnits(legion);
  const rawUnits =
    Array.isArray(legion?.units) && legion.units.length === 6
      ? legion.units.map((unit, strategicIndex) => ({
          type: Math.max(1, Math.min(4, (unit?.type ?? 4) | 0)),
          troops: Math.max(0, Math.floor((unit?.troops ?? 0) / 10)),
          strategicIndex,
        }))
      : null;
  const rawTotal = rawUnits?.reduce((sum, unit) => sum + unit.troops, 0);
  const source =
    rawUnits && rawTotal === Math.max(0, legion?.troops | 0)
      ? rawUnits
      : normalized.map((unit, strategicIndex) => ({
          ...unit,
          strategicIndex,
        }));
  const parts = source.filter(
    (unit) => unit.type >= 1 && unit.type <= 3 && unit.troops > 0,
  );
  return parts.map((part, index) =>
    mkUnit(
      side,
      index,
      parts.length,
      part.troops,
      part.type,
      legion.leader,
      general?.ability ?? legion?._commanderProfile?.ability ?? null,
      legion.morale,
      part.strategicIndex,
    ),
  );
}

/** 野外军团战：防守方来自同一道路点的军团，不经过任何城市易主逻辑。 */
export function createFieldBattle(sc, A, D, battleMaps, fieldTerrain) {
  const genOf = (name) => sc.generals.find((g) => g.name === name);
  const atkGen = genOf(A.leader);
  const defGen = genOf(D.leader);
  const units = [
    ...fieldUnits("atk", A, atkGen),
    ...fieldUnits("def", D, defGen),
  ];
  const directory = battleMaps?.directory?.find(
    (entry) => entry.idx === fieldTerrain?.directoryIndex,
  );
  const terrain = tacticalTerrainProfile("field", fieldTerrain);
  applyBattleEnvironment(units, terrain);
  return {
    kind: "field",
    A,
    D,
    city: null,
    layout: directory?.layout ?? 0,
    theme: directory?.theme ?? 0,
    mirror: Boolean(fieldTerrain?.mirror),
    fieldTerrain,
    terrain,
    playerSide: playerSideOf(sc, A),
    formation: A.formation ?? 1,
    speakers: { atk: atkGen ?? null, def: defGen ?? null },
    units,
    effects: [],
    dialogues: [],
    lastDialogueAt: { atk: -Infinity, def: -Infinity },
    nextDialogueSequence: 0,
    time: 0,
    over: null,
    title: `${A.leader}軍 ⚔ ${D.leader}軍`,
  };
}

function alive(B, s) {
  return s.units.filter((u) => u.side === B && !u.routed && !u.gone);
}

function formationRank(unit) {
  const slot = unit.strategicIndex ?? unit.idx ?? 0;
  if (slot < FORMATION_ADVANCE_COUNT) return 0;
  if (slot < 4) return 1;
  return 2;
}

function setFacing(unit, x, y) {
  const length = Math.hypot(x, y);
  if (length <= 0.001) return;
  unit.facingX = x / length;
  unit.facingY = y / length;
}

const FORMATION_SLOTS = Object.freeze([
  Object.freeze({ forward: -18, right: 0 }),
  Object.freeze({ forward: 28, right: 0 }),
  Object.freeze({ forward: 0, right: -48 }),
  Object.freeze({ forward: 0, right: 48 }),
  Object.freeze({ forward: -46, right: -34 }),
  Object.freeze({ forward: -46, right: 34 }),
]);

/** 将所选部队围绕当前重心重新集结，完成后自动转为面向敌方的守阵。 */
export function regroupFormation(units) {
  const active = units.filter((unit) => !unit.routed && !unit.gone);
  if (!active.length) return;
  const centerX = active.reduce((sum, unit) => sum + unit.x, 0) / active.length;
  const centerY = active.reduce((sum, unit) => sum + unit.y, 0) / active.length;
  let forwardX = active.reduce(
    (sum, unit) => sum + (unit.facingX ?? (unit.side === "atk" ? 1 : -1)),
    0,
  );
  let forwardY = active.reduce((sum, unit) => sum + (unit.facingY ?? 0), 0);
  if (Math.hypot(forwardX, forwardY) <= 0.001) {
    forwardX = active[0].side === "atk" ? 1 : -1;
    forwardY = 0;
  }
  const length = Math.hypot(forwardX, forwardY) || 1;
  forwardX /= length;
  forwardY /= length;
  const rightX = -forwardY;
  const rightY = forwardX;
  for (const unit of active) {
    const slot =
      FORMATION_SLOTS[unit.strategicIndex ?? unit.idx ?? 0] ??
      FORMATION_SLOTS[0];
    const x = Math.max(
      20,
      Math.min(
        FIELD - 20,
        centerX + forwardX * slot.forward + rightX * slot.right,
      ),
    );
    const y = Math.max(
      20,
      Math.min(
        FIELD - 20,
        centerY + forwardY * slot.forward + rightY * slot.right,
      ),
    );
    unit.tacticalOrder = "formation";
    unit.formationFacing = { x: forwardX, y: forwardY };
    unit.order = { x, y };
  }
}

function guardAcceptsTarget(unit, target, distance) {
  if (unit.tacticalOrder !== "defend" || distance <= MELEE_RANGE * 1.2)
    return true;
  const direction = attackDirection(unit, target);
  const facingLength = Math.hypot(unit.facingX ?? 0, unit.facingY ?? 0) || 1;
  const facingX =
    (unit.facingX ?? (unit.side === "atk" ? 1 : -1)) / facingLength;
  const facingY = (unit.facingY ?? 0) / facingLength;
  return facingX * direction.x + facingY * direction.y >= GUARD_ARC_COS;
}

function assignedTarget(u, s) {
  const enemies = s.units.filter(
    (enemy) => enemy.side !== u.side && !enemy.routed && !enemy.gone,
  );
  if (!enemies.length) return { e: null, d: Infinity };
  const allies = s.units.filter(
    (ally) => ally.side === u.side && !ally.routed && !ally.gone,
  );
  const claims = new Map();
  for (const ally of allies) {
    if (ally === u || ally.targetId == null) continue;
    claims.set(ally.targetId, (claims.get(ally.targetId) ?? 0) + 1);
  }
  let best = null;
  let bestDistance = Infinity;
  let bestScore = Infinity;
  for (const enemy of enemies) {
    const distance = Math.hypot(enemy.x - u.x, enemy.y - u.y);
    if (!guardAcceptsTarget(u, enemy, distance)) continue;
    const claimCount = claims.get(unitId(enemy)) ?? 0;
    const typeOpportunity = tacticalTypeModifier(u.type, enemy.type);
    const weakTarget =
      1 - Math.max(0, enemy.troops) / Math.max(1, enemy.maxTroops);
    const score =
      distance +
      claimCount * 72 -
      (typeOpportunity - 1) * 120 -
      weakTarget * 34;
    if (score < bestScore) {
      best = enemy;
      bestDistance = distance;
      bestScore = score;
    }
  }
  u.targetId = best ? unitId(best) : null;
  return { e: best, d: bestDistance };
}

function unitId(unit) {
  return `${unit.side}:${unit.strategicIndex ?? unit.idx ?? 0}`;
}

/** 单位战力系数: 武力为主, 兵力损耗与士气削弱 */
function power(u) {
  const fill = u.troops / u.maxTroops;
  const specialty = 1 + Math.max(0, u.battleSpecialty ?? 0) / 32;
  return (0.55 + 0.9 * fill) * (0.5 + u.morale / 200) * u.force * specialty;
}

function damage(src, target, multiplier = 1) {
  const base = 1.6 + src.force * 0.055;
  const r = 0.7 + Math.random() * 0.6;
  const type = target ? tacticalTypeModifier(src.type, target.type) : 1;
  const terrain = src.attackModifier ?? 1;
  const specialty = 1 + Math.max(0, src.battleSpecialty ?? 0) / 24;
  return Math.max(
    1,
    Math.round(
      base *
        r *
        multiplier *
        type *
        terrain *
        specialty *
        (src.morale > 20 ? 1 : 0.5),
    ),
  );
}

function isArcher(unit) {
  return unit.type === 3;
}

function attackRange(unit) {
  return isArcher(unit) ? ARCHER_RANGE : MELEE_RANGE;
}

function addEffect(s, effect) {
  s.effects ??= [];
  s.effects.push({ age: 0, ...effect });
}

function addBattleDialogue(s, side, text, kind = "battle") {
  if (!text) return;
  s.dialogues ??= [];
  const now = s.time ?? 0;
  const last = s.lastDialogueAt?.[side] ?? -Infinity;
  if (now - last < BATTLE_DIALOGUE_COOLDOWN) return;
  s.lastDialogueAt ??= { atk: -Infinity, def: -Infinity };
  s.lastDialogueAt[side] = now;
  s.dialogues.push({
    sequence: s.nextDialogueSequence ?? 0,
    side,
    speaker:
      side === "atk"
        ? s.A?.leader
        : (s.D?.leader ?? s.speakers?.def?.name ?? s.city?.name),
    text,
    kind,
  });
  s.nextDialogueSequence = (s.nextDialogueSequence ?? 0) + 1;
}

function supportCount(target, units, radius = 82) {
  let count = 0;
  for (const unit of units) {
    if (
      unit === target ||
      unit.side !== target.side ||
      unit.routed ||
      unit.gone
    )
      continue;
    if (Math.hypot(unit.x - target.x, unit.y - target.y) <= radius) count++;
  }
  return count;
}

function attackDirection(src, target) {
  const dx = target.x - src.x;
  const dy = target.y - src.y;
  const length = Math.hypot(dx, dy) || 1;
  return { x: dx / length, y: dy / length };
}

function positionalAttackModifier(src, target, s) {
  const direction = attackDirection(src, target);
  const facingLength =
    Math.hypot(target.facingX ?? 0, target.facingY ?? 0) || 1;
  const facingX =
    (target.facingX ?? (target.side === "atk" ? 1 : -1)) / facingLength;
  const facingY = (target.facingY ?? 0) / facingLength;
  const incomingX = -direction.x;
  const incomingY = -direction.y;
  const dot = facingX * incomingX + facingY * incomingY;
  let kind = "front";
  let multiplier = 1;
  let moraleLoss = 0;
  if (dot < -0.45) {
    kind = "rear";
    multiplier = 1.32;
    moraleLoss = 4;
  } else if (dot < 0.35) {
    kind = "flank";
    multiplier = 1.16;
    moraleLoss = 2;
  }
  if (supportCount(target, s.units) === 0 && supportCount(src, s.units) > 0) {
    kind = kind === "front" ? "surround" : kind;
    multiplier *= 1.12;
    moraleLoss += 2;
  }
  return { kind, multiplier, moraleLoss };
}

function applyLoss(target, loss, moraleLoss = 0) {
  const amount = Math.max(1, loss | 0);
  target.troops = Math.max(0, target.troops - amount);
  target.morale = Math.max(0, target.morale - amount / 12 - moraleLoss);
  target.hitPulse = 0.22;
  return amount;
}

function volleyMembers(src, target, s) {
  if (!isArcher(src)) return [src];
  const members = [src];
  const direction = attackDirection(src, target);
  for (const ally of s.units) {
    if (
      ally === src ||
      ally.side !== src.side ||
      !isArcher(ally) ||
      ally.routed ||
      ally.gone ||
      ally.cd > 0
    )
      continue;
    if (Math.hypot(ally.x - src.x, ally.y - src.y) > 76) continue;
    const distance = Math.hypot(target.x - ally.x, target.y - ally.y);
    if (distance <= MELEE_RANGE || distance > ARCHER_RANGE) continue;
    const allyDirection = attackDirection(ally, target);
    if (direction.x * allyDirection.x + direction.y * allyDirection.y < 0.88)
      continue;
    if (friendlyShotBlocker(ally, target, s.units)) continue;
    members.push(ally);
    if (members.length >= 3) break;
  }
  return members;
}

function rangedAttack(src, target, s) {
  const profile = TACTICAL_UNIT_TYPES[src.type] ?? TACTICAL_UNIT_TYPES[2];
  const position = positionalAttackModifier(src, target, s);
  const shooters = volleyMembers(src, target, s);
  const loss = applyLoss(
    target,
    shooters.reduce(
      (total, shooter) =>
        total + damage(shooter, target, 0.82 * position.multiplier),
      0,
    ),
    position.moraleLoss + Math.max(0, shooters.length - 1),
  );
  for (const [index, shooter] of shooters.entries()) {
    shooter.cd = 1.15 + index * 0.04;
    shooter.attackPulse = 0.28;
    addEffect(s, {
      kind: "arrow",
      side: shooter.side,
      fromX: shooter.x,
      fromY: shooter.y,
      toX: target.x,
      toY: target.y,
      arc: 22 + index * 5,
      duration: 0.34 + index * 0.04,
    });
  }
  if (shooters.length > 1) {
    addEffect(s, {
      kind: "volley",
      x: target.x,
      y: target.y - 34,
      count: shooters.length,
      duration: 0.7,
    });
    addBattleDialogue(s, src.side, "弓隊，齊射！", "volley");
  }
  if (position.kind !== "front") {
    addEffect(s, {
      kind: "position",
      x: target.x,
      y: target.y - 28,
      label: position.kind,
      duration: 0.7,
    });
  }
  addEffect(s, {
    kind: "damage",
    x: target.x,
    y: target.y - 16,
    value: loss,
    color: profile.key === "archer" ? "#ffe37a" : "#ffffff",
    duration: 0.55,
  });
}

function consumeCharge(src, target, distance, s) {
  const targetId = unitId(target);
  const charged =
    src.type === 1 &&
    src.terrainKey !== "water" &&
    src.chargeTargetId === targetId &&
    (src.chargeRun ?? 0) >= CAVALRY_CHARGE_DISTANCE &&
    distance <= MELEE_RANGE;
  src.chargeRun = 0;
  src.chargeTargetId = null;
  if (!charged) return { multiplier: 1, moraleLoss: 0 };
  addEffect(s, {
    kind: "charge",
    x: target.x,
    y: target.y - 34,
    duration: 0.75,
  });
  addBattleDialogue(s, src.side, "乘勢衝破敵陣！", "charge");
  return { multiplier: CAVALRY_CHARGE_MULTIPLIER, moraleLoss: 6 };
}

function meleeAttack(src, target, s, distance = MELEE_RANGE) {
  const srcProfile = TACTICAL_UNIT_TYPES[src.type] ?? TACTICAL_UNIT_TYPES[2];
  const targetProfile =
    TACTICAL_UNIT_TYPES[target.type] ?? TACTICAL_UNIT_TYPES[2];
  const pa = power(src),
    pb = power(target);
  const srcPosition = positionalAttackModifier(src, target, s);
  const targetPosition = positionalAttackModifier(target, src, s);
  const charge = consumeCharge(src, target, distance, s);
  const srcDamage = damage(
    src,
    target,
    srcProfile.melee * srcPosition.multiplier * charge.multiplier,
  );
  const targetDamage = damage(
    target,
    src,
    targetProfile.melee * targetPosition.multiplier,
  );
  const srcShare = pa / (pa + pb);
  const targetShare = pb / (pa + pb);
  const loseSrc = applyLoss(
    src,
    Math.max(1, Math.round(targetDamage * targetShare * 2)),
    targetPosition.moraleLoss,
  );
  const loseTarget = applyLoss(
    target,
    Math.max(1, Math.round(srcDamage * srcShare * 2)),
    srcPosition.moraleLoss + charge.moraleLoss,
  );
  src.cd = 0.8;
  target.cd = Math.max(target.cd, 0.4);
  src.attackPulse = 0.2;
  target.attackPulse = Math.max(target.attackPulse ?? 0, 0.12);
  const boarding = src.terrainKey === "water" || target.terrainKey === "water";
  addEffect(s, {
    kind: boarding ? "boarding" : "melee",
    x: (src.x + target.x) / 2,
    y: (src.y + target.y) / 2,
    duration: boarding ? 0.38 : 0.24,
  });
  if (srcPosition.kind !== "front") {
    addEffect(s, {
      kind: "position",
      x: target.x,
      y: target.y - 28,
      label: srcPosition.kind,
      duration: 0.7,
    });
  }
  if (targetPosition.kind !== "front") {
    addEffect(s, {
      kind: "position",
      x: src.x,
      y: src.y - 28,
      label: targetPosition.kind,
      duration: 0.7,
    });
  }
  addEffect(s, {
    kind: "damage",
    x: src.x,
    y: src.y - 16,
    value: loseSrc,
    color: "#ff9a78",
    duration: 0.55,
  });
  addEffect(s, {
    kind: "damage",
    x: target.x,
    y: target.y - 16,
    value: loseTarget,
    color: "#ff9a78",
    duration: 0.55,
  });
}

function updateEffects(s, dt) {
  for (const effect of s.effects ?? []) effect.age += dt;
  s.effects = (s.effects ?? []).filter(
    (effect) => effect.age < (effect.duration ?? 0),
  );
}

function segmentDistance(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq <= 0.001)
    return Math.hypot(point.x - start.x, point.y - start.y);
  const projection = Math.max(
    0,
    Math.min(
      1,
      ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSq,
    ),
  );
  return Math.hypot(
    point.x - (start.x + dx * projection),
    point.y - (start.y + dy * projection),
  );
}

function friendlyShotBlocker(src, target, units) {
  const start = { x: src.x, y: src.y };
  const end = { x: target.x, y: target.y };
  for (const ally of units) {
    if (ally === src || ally.side !== src.side || ally.routed || ally.gone)
      continue;
    const fromSource = Math.hypot(ally.x - src.x, ally.y - src.y);
    const toTarget = Math.hypot(ally.x - target.x, ally.y - target.y);
    if (
      fromSource > 12 &&
      toTarget > 12 &&
      segmentDistance(ally, start, end) < SHOT_CORRIDOR
    )
      return ally;
  }
  return null;
}

function movementTarget(u, tx, ty, units) {
  const dx = tx - u.x;
  const dy = ty - u.y;
  const distance = Math.hypot(dx, dy) || 1;
  if (distance < 18) return { x: tx, y: ty };
  const dirX = dx / distance;
  const dirY = dy / distance;
  let avoidX = 0;
  let avoidY = 0;
  for (const ally of units ?? []) {
    if (ally === u || ally.side !== u.side || ally.routed || ally.gone)
      continue;
    const adx = u.x - ally.x;
    const ady = u.y - ally.y;
    const allyDistance = Math.hypot(adx, ady);
    if (allyDistance >= ALLY_AVOID_RADIUS) continue;
    const ahead = (ally.x - u.x) * dirX + (ally.y - u.y) * dirY;
    if (ahead < -8) continue;
    const strength = (ALLY_AVOID_RADIUS - allyDistance) / ALLY_AVOID_RADIUS;
    if (allyDistance <= 0.001) {
      const separation = (u.idx ?? 0) <= (ally.idx ?? 0) ? -1 : 1;
      avoidY += separation * strength;
    } else {
      avoidX += (adx / allyDistance) * strength;
      avoidY += (ady / allyDistance) * strength;
    }
  }
  const avoidLength = Math.hypot(avoidX, avoidY);
  if (avoidLength <= 0.01) return { x: tx, y: ty };
  return {
    x: tx + (avoidX / avoidLength) * 34,
    y: ty + (avoidY / avoidLength) * 34,
  };
}

function stepToward(u, tx, ty, dt, units = null) {
  const adjusted = movementTarget(u, tx, ty, units);
  const dx = adjusted.x - u.x,
    dy = adjusted.y - u.y;
  const d = Math.hypot(dx, dy) || 1;
  const desiredX = dx / d;
  const desiredY = dy / d;
  let moveX = desiredX;
  let moveY = desiredY;
  let alignment = 1;
  if (u.terrainKey === "water") {
    const currentAngle = Math.atan2(u.facingY ?? 0, u.facingX ?? desiredX);
    const desiredAngle = Math.atan2(desiredY, desiredX);
    let delta = desiredAngle - currentAngle;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    const turn = Math.max(
      -NAVAL_TURN_RATE * dt,
      Math.min(NAVAL_TURN_RATE * dt, delta),
    );
    const nextAngle = currentAngle + turn;
    moveX = Math.cos(nextAngle);
    moveY = Math.sin(nextAngle);
    setFacing(u, moveX, moveY);
    alignment = Math.max(0.35, Math.cos(delta));
    u.turnPulse = Math.min(1, Math.abs(delta) / Math.PI);
  } else {
    setFacing(u, desiredX, desiredY);
    u.turnPulse = 0;
  }
  const step = Math.min(d, u.speed * (u.moveModifier ?? 1) * alignment * dt);
  u.x = Math.max(-80, Math.min(FIELD + 80, u.x + moveX * step));
  u.y = Math.max(20, Math.min(FIELD - 20, u.y + moveY * step));
  return step;
}

function retreatFrom(u, enemy, dt) {
  const dx = u.x - enemy.x;
  const dy = u.y - enemy.y;
  const distance = Math.hypot(dx, dy) || 1;
  const tx = Math.max(20, Math.min(FIELD - 20, u.x + (dx / distance) * 90));
  const ty = Math.max(20, Math.min(FIELD - 20, u.y + (dy / distance) * 90));
  stepToward(u, tx, ty, dt);
}

function wallStrikeTicks(u) {
  // 原版接触路径每次让metric--。Web一轮攻击映射为武力、兵种环境和
  // 城塞专长驱动的离散接触次数，不改变metric和破坏bit的已确认语义。
  const specialty = 1 + Math.max(0, u.battleSpecialty ?? 0) / 24;
  const terrain = u.attackModifier ?? 1;
  return Math.max(
    1,
    Math.floor(((Math.max(1, u.force | 0) + 9) / 10) * specialty * terrain),
  );
}

function stepWithWalls(u, tx, ty, dt, s) {
  const start = { x: u.x, y: u.y };
  const end = { x: tx, y: ty };
  const wall = blockingWall(s.wallRecords, start, end);
  if (!wall) {
    stepToward(u, tx, ty, dt, s.units);
    return false;
  }
  const stop = stopBeforeWall(wall, start, end);
  stepToward(u, stop.x, stop.y, dt, s.units);
  const center = wallCenter(wall);
  const reached =
    center && Math.hypot(center.x - u.x, center.y - u.y) <= WALL_ATTACK_RANGE;
  if (
    reached &&
    u.side === "atk" &&
    ["siege", "wall"].includes(u.tacticalOrder)
  ) {
    if (u.cd <= 0) {
      const destroyedBefore = Boolean(wall.flags & 1);
      const strikeCount = wallStrikeTicks(u);
      strikeWallRecord(wall, strikeCount);
      u.cd = u.tacticalOrder === "wall" ? 0.45 : 0.75;
      u.attackPulse = 0.24;
      u.wallTarget = wall.index;
      addEffect(s, {
        kind: "wall",
        x: center.x,
        y: center.y,
        duration: 0.3,
      });
      if (!destroyedBefore && wall.flags & 1) {
        s.wallRevision = (s.wallRevision ?? 0) + 1;
        u.order = null;
        addBattleDialogue(s, u.side, "城壁已破，向缺口突入！", "wall-breach");
      }
    }
  }
  return true;
}

function issueWallApproach(u, s) {
  const wall = nearestIntactWall(s.wallRecords, u);
  if (!wall) return false;
  const center = wallCenter(wall);
  if (!center) return false;
  u.wallTarget = wall.index;
  u.order = { x: center.x, y: center.y };
  return true;
}

function rout(u) {
  u.routed = true;
  u.order = null;
  u.chargeRun = 0;
  u.chargeTargetId = null;
}

function updateChargeRun(unit, target, moved) {
  if (
    unit.type !== 1 ||
    unit.terrainKey === "water" ||
    unit.tacticalOrder === "defend"
  ) {
    unit.chargeRun = 0;
    unit.chargeTargetId = null;
    return;
  }
  const targetId = unitId(target);
  if (unit.chargeTargetId !== targetId) {
    unit.chargeTargetId = targetId;
    unit.chargeRun = 0;
  }
  unit.chargeRun = (unit.chargeRun ?? 0) + Math.max(0, moved);
}

function finishFormationMove(unit) {
  if (unit.tacticalOrder !== "formation") return;
  const facing = unit.formationFacing;
  if (facing) setFacing(unit, facing.x, facing.y);
  unit.formationFacing = null;
  unit.tacticalOrder = "defend";
  unit.guard = { x: unit.x, y: unit.y };
}

/** 推进一帧 (dt 秒)。返回当前战况 over 字段 */
export function tickBattle(s, dt) {
  if (s.over) return s.over;
  s.time += dt;
  updateEffects(s, dt);
  for (const u of s.units) {
    if (u.gone) continue;
    if (u.routed) {
      // 溃兵逃向己方场边, 出场即移除
      const ex = u.side === "atk" ? -60 : FIELD + 60;
      stepToward(u, ex, u.y, dt * 1.4);
      if (u.x < -40 || u.x > FIELD + 40) u.gone = true;
      continue;
    }
    u.cd = Math.max(0, u.cd - dt);
    u.attackPulse = Math.max(0, (u.attackPulse ?? 0) - dt);
    u.hitPulse = Math.max(0, (u.hitPulse ?? 0) - dt);
    // 玩家手动指令优先；守阵不离位，但弓兵仍可射击进入射程的敌军。
    const { e, d } = assignedTarget(u, s);
    const unitRange = attackRange(u);
    const aggroRange = u.tacticalOrder === "defend" ? unitRange : AGGRO_RANGE;
    const aiControlled = s.playerSide == null || u.side !== s.playerSide;
    const shouldSkirmish =
      aiControlled &&
      isArcher(u) &&
      e &&
      d <= ARCHER_RETREAT_RANGE &&
      d > MELEE_RANGE &&
      u.tacticalOrder !== "defend";
    const attacksWall =
      u.side === "atk" && ["siege", "wall"].includes(u.tacticalOrder);
    if (
      !e ||
      u.tacticalOrder === "defend" ||
      isArcher(u) ||
      attacksWall ||
      u.order
    ) {
      u.chargeRun = 0;
      u.chargeTargetId = null;
    }
    if (attacksWall && !u.order) {
      if (!issueWallApproach(u, s)) {
        u.wallTarget = null;
        // 攻城在打出缺口后继续突入；单独的城壁命令则转为守住缺口。
        u.tacticalOrder = u.tacticalOrder === "siege" ? "assault" : "defend";
      }
    }
    if (shouldSkirmish) {
      u.chargeRun = 0;
      u.chargeTargetId = null;
      retreatFrom(u, e, dt * 0.85);
    } else if (u.order && (attacksWall || !e || d > unitRange)) {
      const blocked = stepWithWalls(u, u.order.x, u.order.y, dt, s);
      if (!blocked && Math.hypot(u.order.x - u.x, u.order.y - u.y) < 12) {
        u.order = null;
        finishFormationMove(u);
      }
    } else if (e && (d <= aggroRange || u.tacticalOrder === "assault")) {
      if (isArcher(u) && d <= ARCHER_RANGE && d > MELEE_RANGE) {
        const shotBlocker = friendlyShotBlocker(u, e, s.units);
        if (shotBlocker) {
          if (u.tacticalOrder !== "defend") {
            const sideStep = (u.idx ?? 0) % 2 === 0 ? -44 : 44;
            stepWithWalls(
              u,
              u.x,
              Math.max(20, Math.min(FIELD - 20, u.y + sideStep)),
              dt,
              s,
            );
          }
        } else if (u.cd <= 0) rangedAttack(u, e, s);
      } else if (d > MELEE_RANGE) {
        const rankDelay = aiControlled ? formationRank(u) * 0.12 : 0;
        if (s.time >= rankDelay) {
          const beforeX = u.x;
          const beforeY = u.y;
          stepWithWalls(u, e.x, e.y, dt, s);
          updateChargeRun(u, e, Math.hypot(u.x - beforeX, u.y - beforeY));
        }
      } else if (u.cd <= 0) {
        meleeAttack(u, e, s, d);
      }
    } else if (u.order) {
      stepToward(u, u.order.x, u.order.y, dt, s.units);
      if (Math.hypot(u.order.x - u.x, u.order.y - u.y) < 12) {
        u.order = null;
        finishFormationMove(u);
      }
    }
    // 兼容原版规则的自动撤退由originalretreat.js按首对象HP<0x32决定。
    // 本实时层只保留旧Web溃走动画，启用originalRules时不得以25%/士气12改写结果。
    if (
      !s.originalRules &&
      (u.troops < u.maxTroops * ROUT_SHARE || u.morale < 12)
    ) {
      if (!u.routed)
        addBattleDialogue(s, u.side, "已經無法再戰了，全軍撤退！", "rout");
      rout(u);
    }
  }
  const na = alive("atk", s).length,
    nd = alive("def", s).length;
  if (nd === 0 && na === 0) s.over = Math.random() < 0.5 ? "atk" : "def";
  else if (nd === 0) s.over = "atk";
  else if (na === 0) s.over = "def";
  else if (s.time > 240)
    // 超时: 存活总兵力多者胜 (围城粮尽近似)
    s.over =
      alive("atk", s).reduce((a, u) => a + u.troops, 0) >=
      alive("def", s).reduce((a, u) => a + u.troops, 0)
        ? "atk"
        : "def";
  return s.over;
}

/** 幸存总兵力 (胜方战果/败方残部) */
export function survivors(s, side) {
  return Math.max(
    0,
    s.units
      .filter((u) => u.side === side)
      .reduce((a, u) => a + Math.max(0, u.troops | 0), 0),
  );
}

/** 快进: 自动决战的瞬时结算 (兵力×战术环境×武将修正, 保留随机性) */
export function autoResolve(s) {
  const strength = (side) =>
    s.units
      .filter((unit) => unit.side === side)
      .reduce(
        (total, unit) =>
          total +
          unit.troops *
            (1 + unit.force / 100) *
            (unit.attackModifier ?? 1) *
            (1 + Math.max(0, unit.battleSpecialty ?? 0) / 24),
        0,
      );
  const attackerStrength = strength("atk");
  const defenderStrength = strength("def");
  s.over =
    attackerStrength * (0.85 + Math.random() * 0.3) >= defenderStrength
      ? "atk"
      : "def";
  return s.over;
}
