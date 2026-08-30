// AI 逻辑 — 复刻 KI.EXE 三态机: 威胁感知(0x3FA9)→强弱判断(0x4057)→攻/逃/游走(0x4155/0x40C9)
import {
  isFriendly,
  isAtWar,
  declareWar,
  decreaseRelation,
} from "./diplomacy.js";
import { playerFaction } from "./commands.js";
import { findPath } from "./pathfind.js";
import {
  findRoadRoute,
  roadApproachesAt,
  roadGraphReady,
  roadNodeAt,
} from "./roadgraph.js";
import { engageSfx } from "../core/speaker.js";
import {
  applySiegeCityDamage,
  applyTacticalSiegeCityDamage,
  createCityGarrison,
  resolveStrategicBattle,
  selectPrimaryLegion,
  writeStrategicBattleResult,
} from "./autobattle.js";

const ENGAGE_COUNTDOWN = 12;
const ENGAGE_KIND_FIELD = "field";
const ENGAGE_KIND_SIEGE = "siege";

/** 未开战判定: 关系触底 (<0x80)=交戰(可通行攻击)；>=0x80=未开战第三方(堵路) */
function atWar(sc, a, b) {
  return isAtWar(sc, a, b);
}

/** 该格是否被「未开战的第三方势力」占据 (原版 0x48FD 归属检查：非己方/未交战=堵路)。
 *  中立城与交战国可通行(到达即攻击)；驻扎(非行军)军团同样堵路。 */
function blockedAt(sc, A, x, y) {
  const c = sc.cities.find((c) => c.x === x && c.y === y);
  if (
    c &&
    c.faction != null &&
    c.faction !== A.faction &&
    !atWar(sc, A.faction, c.faction)
  )
    return true;
  for (const B of sc.legions) {
    if (
      B === A ||
      B.dead ||
      B._active === false ||
      B.faction == null ||
      B.target
    )
      continue;
    if (
      B.x === x &&
      B.y === y &&
      B.faction !== A.faction &&
      !atWar(sc, A.faction, B.faction)
    )
      return true;
  }
  return false;
}

/** 按城数加权随机选势力(流散/投奔: 领土大吸引力大) */
function weightedPick(sc, candidates) {
  const tot = candidates.reduce((s, x) => s + sc.citiesOf(x.idx).length, 0);
  let r = Math.random() * tot;
  let pick = candidates[0];
  for (const x of candidates) {
    r -= sc.citiesOf(x.idx).length;
    if (r <= 0) {
      pick = x;
      break;
    }
  }
  return pick;
}
// SINARIO 文件内无军团坐标/派系/主将(实测32B单元表语义待逆向),从各势力首都合成演示军团
function nextRuntimeLegionId(sc) {
  sc._nextRuntimeLegionId = (sc._nextRuntimeLegionId ?? 0) + 1;
  return sc._nextRuntimeLegionId;
}

export function buildArmies(sc) {
  sc._nextRuntimeLegionId = 0;
  // ★优先用真实军团数据(0x21C0开局区/存档0x22C0区); 坐标异常时落首都
  if (sc.legions && sc.legions.length) {
    for (const L of sc.legions) {
      L.cooldown ??= 0;
      L.morale ??= 200;
      L._runtimeId = nextRuntimeLegionId(sc);
      L.status ??= 0x80;
      L._active = true;
      clearEngagement(L);
      // 读盘可保留目标据点对象；道路边与点列导航缓存始终重建。
      if (L.target && L.target.idx != null)
        L.target = sc.cities[L.target.idx] ?? null;
      else if (L.target) L.target = null;
      clearMarchNavigation(L);
      const f = sc.factions.find((f) => f.idx === L.faction);
      // 存档军团 leader=武将序号(或 null) → 解析为主将名字符串(渲染用)
      if (typeof L.leader === "number" || L.leader == null) {
        const gn = L.leader == null ? null : sc.generals[L.leader]?.name;
        L.leader = gn ?? f?.monarch ?? "？";
      }
      if (!L.x || !L.y || L.x > 380 || L.y > 256) {
        const cap = f && sc.cities[f.capital];
        if (cap) {
          L.x = cap.x;
          L.y = cap.y;
        }
      }
      L.prevX = L.x;
      L.prevY = L.y;
      L._markerFrame ??= 4;
    }
    sc.armies = sc.legions;
    return;
  }
  const armies = [];
  for (const f of sc.factions) {
    const cap = sc.cities[f.capital];
    if (!cap || f.monarch == null) continue;
    // 兵力与势力规模挂钩 (原版 [si+0x858] 为兵力)
    armies.push({
      _runtimeId: nextRuntimeLegionId(sc),
      leader: f.monarch,
      faction: f.idx,
      x: cap.x,
      y: cap.y,
      prevX: cap.x,
      prevY: cap.y,
      troops: 1 + f.n_cities,
      morale: 200,
      cooldown: 0,
      status: 0x80,
      _active: true,
      target: null,
      _markerFrame: 4,
    });
  }
  sc.legions = armies;
}

// 威胁感知: 只看4邻格 (复刻原版视野规则)
function scanThreat(A, sc) {
  let sum = 0,
    foe = null;
  for (const B of sc.legions) {
    if (B === A || B.dead || B._active === false || B.faction === A.faction)
      continue;
    if (isFriendly(sc, A.faction, B.faction)) continue; // 同盟军不算威胁
    const d = Math.abs(B.x - A.x) + Math.abs(B.y - A.y);
    if (d === 1) {
      sum += B.troops;
      foe = foe || B;
    }
  }
  return { sum, foe };
}

function clearMarchNavigation(A) {
  A._march = null;
  A._path = null;
  delete A._ptx;
  delete A._pty;
  delete A._feint;
}

function clearEngagement(A) {
  A._engagement = null;
}

function applyTacticalMorale(legion, oldTroops, won) {
  if (oldTroops <= 0 || (legion.morale ?? 0) < 100) {
    legion.morale = 0;
    return;
  }
  const base = won ? legion.morale : 100;
  legion.morale = Math.max(
    0,
    Math.min(255, Math.floor((base * legion.troops) / oldTroops)),
  );
}

function settleFieldLegion(legion, troops, unitSurvivors, won) {
  const oldTroops = Math.max(0, legion.troops ?? 0);
  if (Array.isArray(unitSurvivors) && Array.isArray(legion.units)) {
    legion.units = legion.units.slice(0, 6).map((unit, index) => ({
      ...unit,
      troops: Math.max(0, (unitSurvivors[index] ?? 0) * 10),
    }));
    legion.troops = unitSurvivors.reduce(
      (sum, unitTroops) => sum + Math.max(0, unitTroops | 0),
      0,
    );
  } else {
    legion.troops = Math.max(0, troops ?? legion.troops ?? 0);
  }
  applyTacticalMorale(legion, oldTroops, won);
  legion.prevX = legion.x;
  legion.prevY = legion.y;
  legion.target = null;
  legion.cooldown = 8;
  legion._markerFrame = 4;
  clearEngagement(legion);
  clearMarchNavigation(legion);
}

function generalForLegion(sc, legion) {
  return sc.generals.find(
    (general) =>
      general &&
      (general.idx === legion.slot || general.name === legion.leader),
  );
}

function factionIsActive(sc, factionIdx) {
  const faction = sc.factions.find((candidate) => candidate.idx === factionIdx);
  return Boolean(
    faction &&
      faction.active !== false &&
      !faction.dead &&
      faction.capital != null &&
      sc.cities[faction.capital]?.faction === factionIdx,
  );
}

function retreatRouteToFriendlyCity(sc, legion, allowCurrentNode = false) {
  if (!roadGraphReady()) return null;
  const faction = sc.factions.find(
    (candidate) => candidate.idx === legion.faction,
  );
  const capital = faction?.capital == null ? null : sc.cities[faction.capital];
  if (!capital || capital.faction !== legion.faction) return null;

  // 0x487B不是“最近己城”：它先以势力首都为最终搜索目标；军团位于道路
  // 边内时按edge+8端、edge+6端的原版顺序取第一个己方端点，再确认从该端
  // 仍能通往首都。roadApproachesAt按target(+8)、source(+6)排序以保留此优先级。
  for (const approach of roadApproachesAt(legion.x, legion.y)) {
    if (!allowCurrentNode && approach.distance === 0) continue;
    const city = sc.cities.find(
      (candidate) =>
        candidate.x === approach.node.x &&
        candidate.y === approach.node.y &&
        candidate.faction === legion.faction,
    );
    if (!city) continue;
    const onward = findRoadRoute(
      approach.node.x,
      approach.node.y,
      capital.x,
      capital.y,
      (node) => blockedRoadNode(sc, legion, node),
    );
    if (!onward) continue;
    return {
      city,
      node: approach.node,
      distance: approach.distance + onward.distance,
      points: approach.points,
    };
  }
  return null;
}

function assignRetreatRoute(sc, legion, retreat, captorFaction) {
  legion.status = (legion.status ?? 0x80) | 0x82;
  legion._active = true;
  legion.target = retreat.city;
  legion.targetNode = retreat.node?.id ?? null;
  legion.moveDelay = 1;
  legion._march = null;
  legion._path = retreat.points.map((point) => ({ ...point }));
  legion.commandState = 8;
  legion._retreat = {
    cityIdx: retreat.city.idx,
    nodeId: retreat.node?.id ?? null,
    captorFaction,
  };
  return true;
}

/** KI.EXE 0x474A：重算可战状态，败方尽量写入撤退路线。 */
export function continueLegionAfterBattle(sc, legion, won) {
  const units = Array.isArray(legion.units) ? legion.units : [];
  const firstUnit = Math.floor((units[0]?.troops ?? legion.troops * 10) / 10);
  if ((legion.morale ?? 0) === 0 || firstUnit === 0) return false;

  legion.status = (legion.status ?? 0x80) | 0x80;
  legion._active = true;
  if (won) {
    legion.commandState = 8;
    return true;
  }

  const currentCity = sc.cities.find(
    (city) => city.x === legion.x && city.y === legion.y,
  );
  if (currentCity?.faction === legion.faction) {
    legion.commandState = 8;
    return true;
  }

  const retreat = retreatRouteToFriendlyCity(sc, legion);
  if (!retreat) return false;
  assignRetreatRoute(sc, legion, retreat, null);
  const faction = sc.factions.find(
    (candidate) => candidate.idx === legion.faction,
  );
  legion.commandState =
    legion.troops <= 300 || retreat.city.idx === faction?.capital ? 10 : 8;
  return true;
}

function disbandLegionForReturn(sc, legion) {
  const general = generalForLegion(sc, legion);
  sc.delayedLegionReturns ??= [];
  sc.delayedLegionReturns.push({
    leader: legion.leader,
    generalIdx: general?.idx ?? null,
    faction: legion.faction,
    countdown: 0x30,
  });
  legion.status = 0;
  legion._active = false;
  legion.dead = true;
  legion.target = null;
  legion._retreat = null;
  legion.cooldown = 0;
  legion._markerFrame = 4;
  clearEngagement(legion);
  clearMarchNavigation(legion);
  if (general) general.status = 1;
  return "return";
}

function captureOrEliminateLegion(sc, legion, captorFaction) {
  const general = generalForLegion(sc, legion);
  const oldFaction = legion.faction;
  legion.status = 0;
  legion._active = false;
  legion.dead = true;
  legion.target = null;
  legion._retreat = null;
  clearEngagement(legion);
  clearMarchNavigation(legion);
  if (!general) return "captured";

  general.status = 4;
  general.origFaction = oldFaction;
  general.faction = captorFaction;
  if (!factionIsActive(sc, oldFaction) && general.attr & 0x10) {
    general.attr = 0;
    general.active = false;
    general.status = 0;
    general.faction = null;
    general.origFaction = null;
    return "eliminated";
  }
  if (general.attr & 0x40) {
    general.attr &= ~0x40;
    general.is_monarch = false;
    general.talk_idx = ((general.talk_idx ?? 0) + 3) & 0xff;
  }
  return "captured";
}

/** KI.EXE 0x291A：无法继续行动军团的延迟回归/被俘分派。 */
export function dispatchLegionFate(
  sc,
  legion,
  captorFaction,
  random = Math.random,
) {
  if (legion.dead || legion._active === false) return "ignored";
  const general = generalForLegion(sc, legion);
  const faction = sc.factions.find(
    (candidate) => candidate.idx === legion.faction,
  );
  const threshold = ((general?.battle_rating ?? 0) >> 1) + 0x28;
  const delayedReturn =
    factionIsActive(sc, legion.faction) &&
    (general?.idx === faction?.monarch_idx ||
      captorFaction === legion.faction ||
      captorFaction === 0x18 ||
      (Math.floor(random() * 256) & 0x7f) <= threshold);
  return delayedReturn
    ? disbandLegionForReturn(sc, legion)
    : captureOrEliminateLegion(sc, legion, captorFaction);
}

function tickDelayedLegionReturns(sc) {
  const remaining = [];
  const completed = [];
  for (const item of sc.delayedLegionReturns ?? []) {
    item.countdown = Math.max(0, (item.countdown ?? 0) - 1);
    if (item.countdown > 0) {
      remaining.push(item);
      continue;
    }
    const general =
      sc.generals[item.generalIdx] ??
      sc.generals.find((candidate) => candidate?.name === item.leader);
    if (general) {
      general.status = 0;
      if (!factionIsActive(sc, item.faction)) general.faction = null;
    }
    completed.push(item);
  }
  sc.delayedLegionReturns = remaining;
  return completed;
}

function startEngagement(A, kind, target) {
  A.prevX = A.x;
  A.prevY = A.y;
  const nextPoint = A._march?.points?.[A._march.pointIndex];
  if (nextPoint) {
    A._markerFrame =
      Math.abs(nextPoint.x - A.x) >= Math.abs(nextPoint.y - A.y)
        ? nextPoint.x < A.x
          ? 0
          : 1
        : nextPoint.y < A.y
          ? 2
          : 3;
  }
  A._engagement = {
    kind,
    countdown: ENGAGE_COUNTDOWN - 1, // 0x264A 在首次接触同轮把12立即减为11。
    target,
  };
}

function engagementTarget(sc, engagement) {
  if (!engagement?.target) return null;
  if (engagement.kind === ENGAGE_KIND_FIELD) {
    const candidates = sc.legions.filter(
      (candidate) =>
        !candidate.dead &&
        candidate._active !== false &&
        candidate.faction === engagement.target.faction &&
        candidate.x === engagement.target.x &&
        candidate.y === engagement.target.y,
    );
    return selectPrimaryLegion(sc, candidates);
  }
  return sc.cities[engagement.target.cityIdx] ?? null;
}

function hostileLegionAt(sc, A, x, y) {
  return sc.legions.find(
    (B) =>
      B !== A &&
      !B.dead &&
      B._active !== false &&
      B.faction != null &&
      B.faction !== A.faction &&
      atWar(sc, A.faction, B.faction) &&
      B.x === x &&
      B.y === y,
  );
}

function hostileCityAt(sc, A, x, y) {
  const city = sc.cities.find(
    (candidate) => candidate.x === x && candidate.y === y,
  );
  if (
    !city ||
    city.faction == null ||
    city.faction === A.faction ||
    !atWar(sc, A.faction, city.faction)
  )
    return null;
  return city;
}

/** KI.EXE 0x2831/0x2880：先置倒计时12，之后>1时播放ID3并递减，1时开战。 */
function advanceEngagement(app, A) {
  const engagement = A._engagement;
  if (!engagement) return false;
  const target = engagementTarget(app.scenario, engagement);
  if (
    !target ||
    target.dead ||
    target.faction == null ||
    target.faction === A.faction ||
    !atWar(app.scenario, A.faction, target.faction)
  ) {
    clearEngagement(A);
    return false;
  }
  if (engagement.countdown > 1) {
    engageSfx();
    engagement.countdown--;
    return true;
  }

  clearEngagement(A);
  if (engagement.kind === ENGAGE_KIND_FIELD) {
    return resolveFieldBattle(app, A, target);
  }
  return resolveBattle(app, A, target);
}

function rememberMarchBase(sc, A) {
  const city = sc.cities.find(
    (candidate) => candidate.x === A.x && candidate.y === A.y,
  );
  if (!city) return;
  A._bases ??= [];
  if (A._bases[A._bases.length - 1] !== city) {
    A._bases.push(city);
    if (A._bases.length > 24) A._bases.shift();
  }
}

function blockedRoadNode(sc, A, node) {
  const city = sc.cities.find(
    (candidate) => candidate.x === node.x && candidate.y === node.y,
  );
  return Boolean(
    city &&
      city.faction != null &&
      city.faction !== A.faction &&
      !atWar(sc, A.faction, city.faction),
  );
}

function makeMarchNavigation(sc, A, tx, ty) {
  if (!roadGraphReady()) return null;
  const currentNode = roadNodeAt(A.x, A.y);
  const targetNode = roadNodeAt(tx, ty);
  if (!currentNode || !targetNode) return null;
  const route = findRoadRoute(A.x, A.y, tx, ty, (node) =>
    blockedRoadNode(sc, A, node),
  );
  if (!route) return null;
  const leg = route.legs[0] ?? null;
  return {
    targetX: tx,
    targetY: ty,
    targetNode: targetNode.id,
    currentNode: currentNode.id,
    edgeId: leg?.edgeId ?? null,
    stride: leg?.stride ?? 0,
    toNode: leg?.toNode ?? currentNode.id,
    points: leg?.points ?? [],
    pointIndex: 0,
  };
}

/** 原版道路边点列推进；返回 moved/arrived/blocked/unavailable。 */
function stepRoadGraph(sc, A, tx, ty) {
  if (!roadGraphReady()) return "unavailable";
  if (A.x === tx && A.y === ty) {
    clearMarchNavigation(A);
    A.prevX = A.x;
    A.prevY = A.y;
    A._markerFrame = 4;
    return "arrived";
  }
  if (!A._march || A._march.targetX !== tx || A._march.targetY !== ty) {
    clearMarchNavigation(A);
    rememberMarchBase(sc, A);
    A._march = makeMarchNavigation(sc, A, tx, ty);
    if (!A._march) return "blocked";
  }

  const nav = A._march;
  const next = nav.points[nav.pointIndex];
  if (!next) {
    clearMarchNavigation(A);
    return A.x === tx && A.y === ty ? "arrived" : "blocked";
  }

  const foe = hostileLegionAt(sc, A, next.x, next.y);
  if (foe) {
    startEngagement(A, ENGAGE_KIND_FIELD, {
      x: next.x,
      y: next.y,
      faction: foe.faction,
    });
    return "contact";
  }
  const city = hostileCityAt(sc, A, next.x, next.y);
  if (city) {
    startEngagement(A, ENGAGE_KIND_SIEGE, { cityIdx: city.idx });
    return "contact";
  }

  A.prevX = A.x;
  A.prevY = A.y;
  A._markerFrame =
    Math.abs(next.x - A.x) >= Math.abs(next.y - A.y)
      ? next.x < A.x
        ? 0
        : 1
      : next.y < A.y
        ? 2
        : 3;
  A.x = next.x;
  A.y = next.y;
  nav.pointIndex++;
  A._path = nav.points.slice(nav.pointIndex);

  if (A.x === tx && A.y === ty) {
    rememberMarchBase(sc, A);
    clearMarchNavigation(A);
    A.prevX = A.x;
    A.prevY = A.y;
    A._markerFrame = 4;
    return "arrived";
  }
  if (nav.pointIndex >= nav.points.length) {
    rememberMarchBase(sc, A);
    clearMarchNavigation(A); // 原版到节点当轮停止，下次更新重新搜索下一条边。
  }
  return "moved";
}

function stepLegacyPath(sc, A, tx, ty) {
  const blocked = (x, y) => blockedAt(sc, A, x, y);
  if (
    !A._path ||
    A._ptx !== tx ||
    A._pty !== ty ||
    (A._path.length && blocked(A._path[0].x, A._path[0].y))
  ) {
    A._ptx = tx;
    A._pty = ty;
    A._path = findPath(A.x, A.y, tx, ty, blocked);
  }
  const next = A._path?.shift();
  if (!next || blocked(next.x, next.y)) {
    clearMarchNavigation(A);
    return "blocked";
  }
  rememberMarchBase(sc, A);
  A.prevX = A.x;
  A.prevY = A.y;
  A.x = next.x;
  A.y = next.y;
  rememberMarchBase(sc, A);
  if (!A._path.length) A._path = null;
  return A.x === tx && A.y === ty ? "arrived" : "moved";
}

export function stepTo(sc, A, tx, ty) {
  if (tx == null) return "blocked";
  const targetIsCity = sc.cities.some((city) => city.x === tx && city.y === ty);
  if (targetIsCity && !roadGraphReady()) return "waiting";
  if (targetIsCity && roadNodeAt(tx, ty) != null) {
    return stepRoadGraph(sc, A, tx, ty);
  }
  return stepLegacyPath(sc, A, tx, ty);
}

// ★战斗判定 — 玩家参战→开战术层(实时战场); AI互斗→原版公式速算
// 原版公式 0x2920: rand&0x7F < 军师政治>>1 + 0x28
// 返回 true=已开入交互战斗(调用方应中止本轮后续处理)
function resolveBattle(app, A, city) {
  const sc = app.scenario;
  const defenders = sc.legions.filter(
    (legion) =>
      legion !== A &&
      !legion.dead &&
      legion._active !== false &&
      legion.faction === city.faction &&
      legion.x === city.x &&
      legion.y === city.y,
  );
  const primaryDefender = selectPrimaryLegion(sc, defenders);
  const pf = playerFaction(sc);
  if (
    pf &&
    (A.faction === pf.idx || city.faction === pf.idx) &&
    !(A.faction === pf.idx && A.delegated) &&
    app.battleView &&
    !app.battleView.active
  ) {
    app.startBattle(A, city, primaryDefender); // 暂停时钟+开覆盖层; 结算在 onFinish 回调
    return true;
  }
  const defender = primaryDefender ?? createCityGarrison(city);
  const result = resolveStrategicBattle(sc, A, defender, {
    mode: 0,
    cityDefence: city.sim?.troops ?? city.troops ?? 0,
    random: Math.random,
  });
  applySiegeCityDamage(city, result.ratio);
  writeStrategicBattleResult(A, result.attack);
  if (primaryDefender) writeStrategicBattleResult(primaryDefender, result.defence);
  applyBattleResult(
    app,
    A,
    city,
    result.winner,
    result.attack.troops,
    result.attack.units.map((unit) => unit.troops),
    null,
    null,
    primaryDefender,
    result.defence.troops,
    result.defence.units.map((unit) => unit.troops),
  );
  return false;
}

function resolveFieldBattle(app, A, D) {
  if (!D || D.dead) return false;
  const sc = app.scenario;
  const pf = playerFaction(sc);
  if (
    pf &&
    (A.faction === pf.idx || D.faction === pf.idx) &&
    !(A.faction === pf.idx && A.delegated) &&
    !(D.faction === pf.idx && D.delegated) &&
    app.battleView &&
    !app.battleView.active
  ) {
    app.startFieldBattle(A, D);
    return true;
  }
  const result = resolveStrategicBattle(sc, A, D, {
    mode: 1,
    random: Math.random,
  });
  writeStrategicBattleResult(A, result.attack);
  writeStrategicBattleResult(D, result.defence);
  applyFieldBattleResult(
    app,
    A,
    D,
    result.winner,
    result.attack.troops,
    result.defence.troops,
    result.attack.units.map((unit) => unit.troops),
    result.defence.units.map((unit) => unit.troops),
  );
  return false;
}

export function applyFieldBattleResult(
  app,
  A,
  D,
  winner,
  atkTroops,
  defTroops,
  atkUnits,
  defUnits,
) {
  const sc = app.scenario;
  settleFieldLegion(A, atkTroops, atkUnits, winner === "atk");
  settleFieldLegion(D, defTroops, defUnits, winner === "def");
  const attackContinues = continueLegionAfterBattle(sc, A, winner === "atk");
  const defenceContinues = continueLegionAfterBattle(sc, D, winner === "def");
  if (A._retreat) A._retreat.captorFaction = D.faction;
  if (D._retreat) D._retreat.captorFaction = A.faction;
  const attackFate = attackContinues
    ? "continue"
    : dispatchLegionFate(sc, A, D.faction);
  const defenceFate = defenceContinues
    ? "continue"
    : dispatchLegionFate(sc, D, A.faction);
  const loser = winner === "atk" ? D : A;
  const survivor = winner === "atk" ? A : D;
  if (loser._active !== false) loser.cooldown = 12;
  app.hud?.flashEvent?.(
    `${survivor.leader} 野戰擊退 ${loser.leader}（${A.troops}／${D.troops}；${attackFate}/${defenceFate}）`,
  );
}

function updateFactionAfterCityCapture(sc, factionIdx) {
  if (factionIdx == null) return null;
  const faction = sc.factions.find((candidate) => candidate.idx === factionIdx);
  if (!faction) return null;
  const cities = sc.citiesOf(factionIdx).toSorted(
    (left, right) => left.idx - right.idx,
  );
  faction.n_cities = cities.length;
  if (!cities.length) {
    faction.capital = null;
    faction.active = false;
    faction.dead = true;
    return null;
  }
  if (!cities.some((candidate) => candidate.idx === faction.capital)) {
    faction.capital = cities[0].idx;
  }
  faction.active = true;
  faction.dead = false;
  return sc.cities[faction.capital] ?? null;
}

function retreatCapturedGarrison(sc, city, oldFaction, captorFaction) {
  const defenders = sc.legions
    .filter(
      (legion) =>
        !legion.dead &&
        legion._active !== false &&
        legion.faction === oldFaction &&
        legion.x === city.x &&
        legion.y === city.y,
    )
    // 0x4C72按军团槽地址升序收集，0x4DA4固定以BP[0]为代表。
    .toSorted(
      (left, right) =>
        (left.slot ?? left._runtimeId ?? 0x7fff) -
        (right.slot ?? right._runtimeId ?? 0x7fff),
    );
  if (!defenders.length) return { retreat: 0, fates: [] };
  const retreat = retreatRouteToFriendlyCity(sc, defenders[0], true);
  if (retreat) {
    for (const legion of defenders) {
      // 原版只共享目标城/节点，不复制代表军团的当前边或stride缓存。
      assignRetreatRoute(sc, legion, { ...retreat, points: [] }, captorFaction);
      legion._path = null;
      legion.cooldown = 12;
    }
    return { retreat: defenders.length, fates: [] };
  }
  return {
    retreat: 0,
    fates: defenders.map((legion) =>
      dispatchLegionFate(sc, legion, captorFaction),
    ),
  };
}

/** 攻城战果：攻方走0x474A，破城后驻军组走0x4DA4；无路时逐军团0x291A。 */
export function applyBattleResult(
  app,
  A,
  city,
  winner,
  atkTroops,
  atkUnits,
  cityTroops = null,
  wallRecords = null,
  primaryDefender = null,
  defTroops = null,
  defUnits = null,
) {
  const sc = app.scenario;
  settleFieldLegion(A, atkTroops ?? A.troops, atkUnits, winner === "atk");
  if (primaryDefender) {
    settleFieldLegion(
      primaryDefender,
      defTroops ?? primaryDefender.troops,
      defUnits,
      winner === "def",
    );
  }
  if (wallRecords) applyTacticalSiegeCityDamage(city, wallRecords);
  const oldFaction = city.faction;
  if (winner === "atk") {
    // 0x4CF3 先交换据点所属，再由0x4DA4为原守方军团求共同撤退路线；
    // 否则刚失陷的城市仍会被误选为“己方最近据点”。
    city.faction = A.faction;
    updateFactionAfterCityCapture(sc, oldFaction);
    updateFactionAfterCityCapture(sc, A.faction);
    const garrison = retreatCapturedGarrison(sc, city, oldFaction, A.faction);
    if (city.sim) city.sim.troops = 0;
    city.troops = 0;
    A.x = city.x;
    A.y = city.y;
    A.prevX = city.x;
    A.prevY = city.y;
    continueLegionAfterBattle(sc, A, true);
    A.cooldown = 8;
    if (oldFaction != null && oldFaction !== A.faction) {
      declareWar(sc, A.faction, oldFaction);
      decreaseRelation(sc, A.faction, oldFaction, 20);
    }
    app.hud?.flashEvent?.(
      `${A.leader} 攻破 ${city.name}（餘兵${A.troops}；守軍撤退${garrison.retreat}）`,
    );
    return;
  }

  if (cityTroops != null) {
    const remaining = Math.max(0, cityTroops | 0);
    if (city.sim) city.sim.troops = Math.min(city.sim.cap ?? 0xff, remaining);
    city.troops = remaining;
  }
  const continues = continueLegionAfterBattle(sc, A, false);
  if (A._retreat) A._retreat.captorFaction = oldFaction ?? 0x18;
  const fate = continues
    ? "continue"
    : dispatchLegionFate(sc, A, oldFaction ?? 0x18);
  if (A._active !== false) A.cooldown = 12;
  app.hud?.flashEvent?.(
    `${A.leader} 攻${city.name}失利（餘兵${A.troops}；${fate}）`,
  );
}

// ★月度 AI: 俘虏脱逃回归 + 势力灭亡流散随机投奔(城数加权, 武将少者优先)
export function monthlyAI(app) {
  const sc = app.scenario;
  if (!sc) return;
  // 势力灭亡判定: 无城 → 军团解散, 君主/武将部分自杀(张任曹操类)其余流散
  for (const f of sc.factions) {
    if (f.dead || f.idx == null) continue;
    if (
      sc.citiesOf(f.idx).length === 0 &&
      sc.legions.some((A) => A.faction === f.idx)
    ) {
      f.dead = true;
      for (const A of sc.legions.filter((A) => A.faction === f.idx)) {
        A.dead = true;
        // 流散 → 随机投奔(按城数加权 = 领土大吸引力大)
        const alive = sc.factions.filter((x) => !x.dead && x.idx !== f.idx);
        if (alive.length) {
          const pick = weightedPick(sc, alive);
          const g = sc.generals.find((g2) => g2.name === A.leader);
          if (g) g.faction = pick.idx;
          sc.prisoners = sc.prisoners ?? [];
          sc.prisoners.push({ leader: A.leader, faction: pick.idx, months: 1 });
        }
      }
      app.hud?.flashEvent?.(`${f.monarch} 势力灭亡`);
      // ★D7OVER: 玩家势力灭亡 → GAMEOVER 画面
      if (f.idx === sc.player_faction)
        app.endView?.show({
          img: "grf/gameover.png",
          caption: `大業未成，${f.monarch}軍覆滅…（點擊返回標題）`,
        });
    }
  }
  // ★D7END: 玩家統一天下 → 通关结局画 (剧本1..12 各自专属图)
  {
    const pf = playerFaction(sc);
    if (pf && !pf.dead && sc.cities.every((c) => c.faction === pf.idx)) {
      const num = (app.scenarioIdx ?? 0) + 1;
      app.endView?.show({
        img: num <= 12 ? `grf/end_s${num}.png` : "grf/end_s12.png",
        caption: `天下統一！${pf.monarch}成就霸業（劇本${num}・點擊返回標題）`,
      });
    }
  }
  // 俘虏脱逃/月初回归: 回原属势力首都重起军团
  const out = [];
  for (const p of sc.prisoners ?? []) {
    if (--p.months > 0) {
      out.push(p);
      continue;
    }
    const f = sc.factions.find((f) => f.idx === p.faction);
    const cap = f && !f.dead && sc.cities[f.capital];
    const g0 = f && sc.generals.find((g2) => g2.name === p.leader);
    // 防御: 同名军团已存在(未清场的dead除外)则不重复重建
    const hasLive = sc.legions.some((A) => A.leader === p.leader && !A.dead);
    if (!hasLive && cap && cap.faction === p.faction) {
      const g = sc.generals.find((g2) => g2.name === p.leader);
      if (g) {
        g.status = 0;
        g.faction = p.faction;
      } // 回归: status=0 待命
      sc.legions.push({
        _runtimeId: nextRuntimeLegionId(sc),
        leader: p.leader,
        faction: p.faction,
        x: cap.x,
        y: cap.y,
        prevX: cap.x,
        prevY: cap.y,
        troops: 1 + sc.citiesOf(p.faction).length,
        cooldown: 6,
        target: null,
        _markerFrame: 4,
        formation: 1, // 编制类型 1..4 (0xCBE5 选块)
      });
      app.hud?.flashEvent?.(`${p.leader} 回归 ${f.monarch}麾下`);
    } else if (g0 && !g0.dead) {
      // ★流散随机再就业(攻略: 领土大/武将少势力优先) — 原属首都已失或势力亡
      const alive = sc.factions.filter(
        (x) => !x.dead && x.idx !== p.faction && sc.citiesOf(x.idx).length,
      );
      if (alive.length) {
        const pick = weightedPick(sc, alive);
        const g2 = sc.generals.find((g3) => g3.name === p.leader);
        if (g2) {
          g2.status = 0;
          g2.faction = pick.idx;
        } // 流散: 改换门庭, 不再回归原属
        app.hud?.flashEvent?.(`${p.leader} 流散改投 ${pick.monarch}麾下`);
      }
    }
    // 无处可投(全灭) → 彻底退场
  }
  sc.prisoners = out;
  sc.legions = sc.legions.filter((A) => !A.dead); // ★灭亡/战败军团立即清场(不等下次aiTick)
}

// 城池每日成长 — 复刻 KI.EXE 0x4194/0x4269 (内政官治理影响：上升率·防灾·城兵)
export function cityDaily(sc) {
  for (const c of sc.cities) {
    if (c.faction == null) continue;
    let pol = 0;
    let lead = 0;
    const govIdx = c.governor;
    if (govIdx != null && sc.generals?.[govIdx]) {
      const gen = sc.generals[govIdx];
      pol = gen.ability?.politics ?? 0;
      lead = gen.ability?.lead ?? 0;
    }

    // KI.EXE 0x4194 逐日动力学：
    // cl = 5 + (有内政官 ? politics : 0)
    // dl = (1 + (有内政官 ? lead : 0)) >> 1
    const isPlayer = c.faction === sc.player_faction;
    let cl = isPlayer ? 5 : 8;
    let dl = isPlayer ? 1 : 4;
    if (pol > 0 || lead > 0) {
      cl += pol;
      dl = (dl + lead) >> 1;
    }

    // ch 递增步长 = Math.max(1, cl - 15)
    const ch = cl > 15 ? cl - 15 : 1;

    // 1. 上升率 / 士气增长：随机门控 cl >= rand(16)
    if (cl >= Math.floor(Math.random() * 16)) {
      c.growth = Math.min(200, (c.growth ?? 100) + ch);
    }

    // 2. 防灾 / 储粮恢复：随机门控 cl >= rand(16)
    if (cl >= Math.floor(Math.random() * 16)) {
      const disInc = (ch >> 1) + 1;
      c.disaster = Math.min(200, (c.disaster ?? 100) + disInc);
      c.defence = c.disaster;
    }

    // 3. 城兵自然募补/恢复：城兵离上限差距时向城兵填充 dl
    const maxTroops = c.troops_cap ?? 200; // 内部标准单位 (×10 即为显示人数)
    let curTroops = c.troops ?? 0;
    if (curTroops < maxTroops && Math.floor(Math.random() * 24) === 0) {
      curTroops = Math.min(maxTroops, curTroops + dl);
      c.troops = curTroops;
    }
  }
}

export function aiTick(app) {
  cityDaily(app.scenario);
  const sc = app.scenario;
  if (!sc || !sc.legions) return;
  let changed = false;
  for (const item of tickDelayedLegionReturns(sc)) {
    changed = true;
    app.hud?.flashEvent?.(`${item.leader} 收攏殘部後返回待命`);
  }
  for (const A of sc.legions) {
    if (A.dead || A.faction == null) continue;
    if (A.prevX === A.x && A.prevY === A.y) continue;
    A.prevX = A.x;
    A.prevY = A.y;
  }
  for (const A of sc.legions) {
    if (A.dead || A._active === false || A.faction == null) continue;
    if (A._retreat && A.target) {
      if (A.cooldown > 0) {
        A.cooldown--;
        continue;
      }
      const retreatResult = stepTo(sc, A, A.target.x, A.target.y);
      if (retreatResult === "blocked") {
        dispatchLegionFate(sc, A, A._retreat.captorFaction ?? A.faction);
        changed = true;
      } else if (retreatResult === "arrived") {
        A.target = null;
        A._retreat = null;
        A.commandState = 8;
        A.cooldown = 6;
      }
      continue;
    }
    if (A._engagement) {
      const battleOpened = advanceEngagement(app, A);
      if (battleOpened && app.battleView?.active) return;
      // 等待、自动结算或目标消失后，本轮都停在原地。
      continue;
    }
    if (A.cooldown > 0) {
      A.cooldown--;
      continue;
    } // 复刻冷却[si+0x857]
    // 玩家从「行軍指示」指定的目标优先于委任 AI。委任只改变后续战斗控制，
    // 不能把玩家刚选择的己方调动目标立即替换成 AI 的最近敌城。
    if (A.faction === sc.player_faction && A.target) {
      const orderedTarget = A.target;
      const marchResult = stepTo(sc, A, orderedTarget.x, orderedTarget.y);
      if (marchResult === "moved") changed = true;
      if (marchResult === "contact" || marchResult === "waiting") continue;
      if (marchResult === "blocked") {
        A.target = null;
        continue;
      }
      if (A.x === orderedTarget.x && A.y === orderedTarget.y) {
        if (
          orderedTarget.faction != null &&
          orderedTarget.faction !== A.faction &&
          !isFriendly(sc, A.faction, orderedTarget.faction)
        ) {
          if (resolveBattle(app, A, orderedTarget)) return;
          changed = true;
        }
        A.target = null;
        A.cooldown = 6;
      }
      continue;
    }
    // 非委任的玩家军团没有明确命令时原地待命；委任军团才进入自主决策。
    if (A.faction === sc.player_faction && !A.delegated) continue;
    const { sum, foe } = scanThreat(A, sc);
    if (foe) {
      if (A.troops + 2 > sum) {
        // 强势→攻击 (0x4057 兵力+2判据)
        const T = sc.cities.find((c) => c.x === foe.x && c.y === foe.y);
        const marchResult = stepTo(sc, A, foe.x, foe.y);
        if (marchResult === "contact") continue;
        if (A.x === foe.x && A.y === foe.y) {
          if (T && T.faction != null && T.faction !== A.faction) {
            if (resolveBattle(app, A, T)) return; // ★交互战斗已开启, 本轮终止
            changed = true;
          }
          A.cooldown = 8; // 战后休整
        }
      } else {
        // 弱势→撤退 (远离威胁源)
        stepTo(sc, A, A.x * 2 - foe.x, A.y * 2 - foe.y);
        A.cooldown = 3;
      }
    } else {
      // 游走: 缓慢逼近最近敌城 (原版 rand 目标+寻路 0x4575 的简化)
      if (
        !A.target ||
        A.target.faction == null ||
        A.target.faction === A.faction
      ) {
        let best = null,
          bd = Infinity;
        for (const c of sc.cities) {
          if (c.faction == null || c.faction === A.faction) continue;
          if (isFriendly(sc, A.faction, c.faction)) continue; // 同盟默契: 友好势力不攻
          const d = (c.x - A.x) ** 2 + (c.y - A.y) ** 2;
          if (d < bd) {
            bd = d;
            best = c;
          }
        }
        A.target = best;
      }
      if (A.target) {
        const marchResult = stepTo(sc, A, A.target.x, A.target.y);
        if (marchResult === "contact") continue;
        if (marchResult === "blocked") {
          A.target = null;
          continue;
        }
        if (A.target && A.x === A.target.x && A.y === A.target.y) {
          // 中途易主变友方(如同盟成立)则不攻
          if (!isFriendly(sc, A.faction, A.target.faction)) {
            if (resolveBattle(app, A, A.target)) return; // ★交互战斗已开启
            changed = true;
          }
          A.target = null;
          A.cooldown = 6;
        }
      }
    }
  }
  sc.legions = sc.legions.filter((A) => !A.dead);
  // 兵源补充(占位): 无军团的活跃势力从首都重新起兵(真实募兵/武将重现待逆向)
  // ★统帅必须是该势力未被俘的武将 — 否则坐牢君主会"分身"出幽灵军团被反复俘获
  for (const f of sc.factions) {
    if (f.idx === sc.player_faction) continue; // 玩家势力不自动起兵 (編成菜单指挥)
    const hasFieldedLegion = sc.legions.some(
      (A) => !A.dead && A._active !== false && A.faction === f.idx,
    );
    const hasReturningGeneral = (sc.delayedLegionReturns ?? []).some(
      (item) => item.countdown > 0 && item.faction === f.idx,
    );
    if (!hasFieldedLegion && !hasReturningGeneral) {
      const cap = sc.cities[f.capital];
      const mon = sc.generals.find(
        (g) => g.name === f.monarch && g.status !== 4 && g.faction === f.idx,
      );
      const alt =
        mon || sc.generals.find((g) => g.faction === f.idx && g.status !== 4);
      if (cap && cap.faction === f.idx && alt)
        sc.legions.push({
          _runtimeId: nextRuntimeLegionId(sc),
          leader: alt.name,
          faction: f.idx,
          x: cap.x,
          y: cap.y,
          prevX: cap.x,
          prevY: cap.y,
          troops: 1 + f.n_cities,
          morale: 200,
          cooldown: 12,
          status: 0x80,
          _active: true,
          target: null,
          _markerFrame: 4,
          formation: 1, // 编制类型 1..4 (0xCBE5 选块)
        });
    }
  }
  if (changed) {
    app.hud?.buildLegend?.();
    app.view?.draw(); // 只在版图变化时重绘 (主循环不逐帧画)
  }

  // 停战交涉日程推进与汇报 (复刻 KI.EXE 0x300E 队列事件 6 / 0x3327 处理器)
  if (sc.pendingTruceNegotiations && sc.pendingTruceNegotiations.length > 0) {
    const readyItems = [];
    const remainingItems = [];
    for (const item of sc.pendingTruceNegotiations) {
      item.daysLeft--;
      if (item.daysLeft <= 0) {
        readyItems.push(item);
      } else {
        remainingItems.push(item);
      }
    }
    sc.pendingTruceNegotiations = remainingItems;

    for (const item of readyItems) {
      const me = playerFaction(sc);
      const targetFaction = sc.factions.find(
        (f) => f && f.idx === item.targetFactionIdx,
      );
      if (!me || !targetFaction) continue;

      const envoyGen = sc.generals.find((g) => g && g.name === item.envoyName);
      const enemyMonarch = sc.generals[targetFaction.monarch_idx];

      const ourPol = Math.floor((envoyGen?.ability?.politics ?? 60) / 10);
      const enemyPol = Math.floor((enemyMonarch?.ability?.politics ?? 60) / 10);

      // KI.EXE 0x3771 计算基础分
      let dl = ourPol;
      if (enemyPol > ourPol) {
        dl = ourPol * 2;
      } else if (ourPol > enemyPol) {
        dl = Math.max(0, (16 - ourPol) * 2);
      }

      // KI.EXE 0x36C4 计算停战赔款/金钱与结果
      const rel = relation(sc, me.idx, targetFaction.idx) & 0x7f;
      const monarchPers = (targetFaction.bellicosity ?? 10) + 2;
      const excess = Math.max(0, rel - monarchPers);
      const ah = 30 - excess;
      dl = Math.max(0, dl + ah);
      dl = dl >> 1;
      const goldRequired = dl * 1000;

      let outcome = 0;
      if (goldRequired > 0) {
        if ((me.gold ?? 0) >= goldRequired) {
          outcome = 1; // 支付金钱停战
        } else {
          outcome = 2; // 资金不足，谈判破裂
        }
      }

      // 如果对方目前处于极度优势且对我方攻击中，可能加重条件或破裂
      if (targetFaction.target_faction === me.idx && Math.random() < 0.2) {
        outcome = 2; // 20% 概率谈判破裂
      }

      app.gamebar?.showTruceNegotiationResult?.({
        targetFaction,
        envoyName: item.envoyName,
        outcome,
        goldRequired,
      });
    }
  }

  // 协助交涉日程推进与汇报 (复刻 KI.EXE 0x301C 队列事件 7 / 0x3712 处理器)
  if (
    sc.pendingAssistanceNegotiations &&
    sc.pendingAssistanceNegotiations.length > 0
  ) {
    const readyItems = [];
    const remainingItems = [];
    for (const item of sc.pendingAssistanceNegotiations) {
      item.daysLeft--;
      if (item.daysLeft <= 0) {
        readyItems.push(item);
      } else {
        remainingItems.push(item);
      }
    }
    sc.pendingAssistanceNegotiations = remainingItems;

    for (const item of readyItems) {
      const me = playerFaction(sc);
      const allyFaction = sc.factions.find(
        (f) => f && f.idx === item.allyFactionIdx,
      );
      const targetFaction = sc.factions.find(
        (f) => f && f.idx === item.targetFactionIdx,
      );
      if (!me || !allyFaction || !targetFaction) continue;

      const envoyGen = sc.generals.find((g) => g && g.name === item.envoyName);
      const allyMonarch = sc.generals[allyFaction.monarch_idx];

      const ourPol = Math.floor((envoyGen?.ability?.politics ?? 60) / 10);
      const allyPol = Math.floor((allyMonarch?.ability?.politics ?? 60) / 10);

      // KI.EXE 0x3771 政治力与外交关系计算
      const rel = relation(sc, me.idx, allyFaction.idx) & 0x7f;
      let outcome = 0; // 0: 无条件达成 (Talk 47), 1: 支付金钱达成 (Talk 48), 2: 谈判破裂 (Talk 49)
      let goldRequired = 0;

      if (ourPol >= allyPol && rel >= 80) {
        outcome = 0; // 亲密且使节得力 -> 无条件成立
      } else if (rel >= 45) {
        outcome = 1; // 需支付金钱
        goldRequired = Math.max(500, Math.min(3000, (90 - rel) * 50));
        if ((me.gold ?? 0) < goldRequired) {
          outcome = 2; // 资金不足破裂
        }
      } else {
        outcome = 2; // 谈判破裂
      }

      app.gamebar?.showAssistanceNegotiationResult?.({
        allyFaction,
        targetFaction,
        envoyName: item.envoyName,
        outcome,
        goldRequired,
      });
    }
  }
}
