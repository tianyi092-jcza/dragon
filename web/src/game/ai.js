// AI 逻辑 — 复刻 KI.EXE 三态机: 威胁感知(0x3FA9)→强弱判断(0x4057)→攻/逃/游走(0x4155/0x40C9)
import {
  isFriendly,
  isAtWar,
  relation,
  declareWar,
  decreaseRelation,
  increaseRelation,
  runStrategicDiplomacy,
} from "./diplomacy.js";
import { playerFaction } from "./commands.js";
import { findPath } from "./pathfind.js";
import {
  findRoadRoute,
  reverseRoadMarchContext,
  roadApproachesAt,
  roadGraphReady,
  roadNodeAt,
  roadNodeById,
  restoreRoadMarchContext,
} from "./roadgraph.js";
import { engageSfx, warnSfx } from "../core/speaker.js";
import {
  applyFactionFundsDelta,
  factionLegionMoraleCap,
  legionDailyMaintenanceCost,
} from "./economy.js";
import {
  applySiegeCityDamage,
  applyTacticalSiegeCityDamage,
  createCityGarrison,
  resolveStrategicBattle,
  selectPrimaryLegion,
} from "./autobattle.js";
import { originalTacticalMorale } from "./battle/originalresult.js";
import { isLegionDelegated } from "./legionmode.js";
import {
  createDefaultLegionUnits,
  ensureLegionSlot,
  ensureLegionUnits,
} from "./legionunits.js";

const ENGAGE_COUNTDOWN = 12;
const ENGAGE_STATUS_ACTIVE = 0x20;
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
// SINARIO 文件不包含运行时军团表；新游戏必须以空军团表开始。
// 这里只为真实 SAVE 军团和游玩期间新建军团分配 Web 运行时身份。
function nextRuntimeLegionId(sc) {
  sc._nextRuntimeLegionId = (sc._nextRuntimeLegionId ?? 0) + 1;
  return sc._nextRuntimeLegionId;
}

function attachRuntimeLegion(
  sc,
  legion,
  preferredSlot = null,
  legions = sc.legions,
) {
  ensureLegionSlot(legions, legion, preferredSlot);
  legion._runtimeId = nextRuntimeLegionId(sc);
  return legion;
}

export function buildArmies(sc) {
  sc._nextRuntimeLegionId = 0;
  // ★只归一化真实运行时军团数据（SAVE 槽文件 0x22C0 区）。
  // parse_sinario.py 明确输出 legions=[]；新游戏不得在首都合成占位军团。
  if (sc.legions && sc.legions.length) {
    for (const L of sc.legions) {
      L.cooldown ??= 0;
      const faction = sc.factions.find(
        (candidate) => candidate.idx === L.faction,
      );
      L.morale ??= factionLegionMoraleCap(faction);
      ensureLegionUnits(L);
      attachRuntimeLegion(sc, L, L.slot ?? L.idx);
      // 旧 Web snapshot 可能只有 delegated 布尔值；必须先迁移，再补默认 status。
      isLegionDelegated(L);
      L.status ??= 0x80;
      L._active = true;
      // 读盘目标先解析成scenario city。0x8CFF原样保存+0A/+0C/+0E；
      // 优先按E717地址布局恢复当前边，只有无效字段才退回目标重寻路。
      if (L.target && L.target.idx != null)
        L.target = sc.cities[L.target.idx] ?? null;
      else if (L.target) L.target = null;
      const savedMarch = restoreRoadMarchContext({
        x: L.x,
        y: L.y,
        targetX: L.target?.x ?? L.targetX,
        targetY: L.target?.y ?? L.targetY,
        targetNode: L.targetNode,
        stride: L.roadStride,
        pointAddress: L.roadPointAddress,
        edgeOrNode: L.roadEdgeOrNode,
      });
      clearMarchNavigation(L);
      if (savedMarch) {
        L._march = savedMarch;
        L._path = savedMarch.points.slice(savedMarch.pointIndex);
      }
    }
    for (const L of sc.legions) {
      // SAVE军团 status bit5/+3只确认上一轮仍接触；不存在战型位。
      // 保留pending到首次实际tick，仿0x25CC→0x2662现场重检。
      if (L._engagement) {
        L.status |= ENGAGE_STATUS_ACTIVE;
        L.engagementCountdown = Math.max(
          1,
          Math.min(ENGAGE_COUNTDOWN, L._engagement.countdown | 0),
        );
        L._engagement.countdown = L.engagementCountdown;
      } else {
        L.status &= ~ENGAGE_STATUS_ACTIVE;
        L.engagementCountdown = null;
      }
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
    return;
  }
  sc.legions = [];
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

const AI_FORMATION_TYPE_CANDIDATES = Object.freeze([
  Object.freeze([1, 3, 2]),
  Object.freeze([1, 3, 2]),
  Object.freeze([3, 1, 2]),
  Object.freeze([3, 1, 2]),
  Object.freeze([2, 3, 1]),
  Object.freeze([2, 3, 1]),
]);

function cityRawBytes(city) {
  if (typeof city?.raw !== "string") return null;
  const bytes = city.raw.match(/../g);
  return bytes?.length >= 0x20
    ? Uint8Array.from(bytes, (value) => Number.parseInt(value, 16))
    : null;
}

function cityNeighbours(sc, city) {
  const raw = cityRawBytes(city);
  if (!raw) return [];
  const neighbours = [];
  for (let direction = 0; direction < 4; direction++) {
    if ((raw[0] & (1 << direction)) === 0) continue;
    const neighbour = sc.cities?.[raw[0x1c + direction]];
    if (neighbour) neighbours.push(neighbour);
  }
  return neighbours;
}

function cityLocalStrength(sc, city) {
  return Math.min(
    0x7f,
    sc.legions.filter(
      (legion) =>
        !legion.dead &&
        legion._active !== false &&
        legion.faction === city.faction &&
        legion.x === city.x &&
        legion.y === city.y,
    ).length,
  );
}

function aiFormationLimit(faction) {
  const fundsWord = Math.max(
    0,
    Math.floor(Number(faction?.money ?? faction?.gold ?? 0) / 0x100),
  );
  return fundsWord <= 0xa0 ? 5 : Math.floor(fundsWord / 0x20);
}

function selectAiFormationTypes(faction) {
  const pools = {
    1: Math.max(0, faction.reserve_cav ?? 0),
    2: Math.max(0, faction.reserve_inf ?? 0),
    3: Math.max(0, faction.reserve_arc ?? 0),
  };
  const types = [];
  for (const candidates of AI_FORMATION_TYPE_CANDIDATES) {
    const type = candidates.find((candidate) => pools[candidate] >= 0x32);
    if (!type) return null;
    pools[type] -= 0x32;
    types.push(type);
  }
  return types;
}

function selectAiCommander(sc, factionIdx) {
  let selected = null;
  for (const general of sc.generals ?? []) {
    if (
      general?.faction !== factionIdx ||
      general.active === false ||
      (general.status ?? 0) !== 0
    )
      continue;
    const force = general.ability?.force ?? 0;
    if (!selected || force > (selected.ability?.force ?? 0)) selected = general;
  }
  return selected;
}

/** KI.EXE 0x4575→0x45C1→0x6E8F：AI按边境请求在首都真实编成。 */
function formAiReinforcements(app, faction, city, requested) {
  const sc = app.scenario;
  const capital = faction?.capital == null ? null : sc.cities[faction.capital];
  if (!capital || capital.faction !== faction.idx) return 0;
  const current = sc.legions.filter(
    (legion) =>
      !legion.dead &&
      legion._active !== false &&
      legion.faction === faction.idx,
  ).length;
  let remaining = Math.min(
    Math.max(0, requested | 0),
    Math.max(0, aiFormationLimit(faction) - current),
  );
  let formed = 0;
  while (remaining-- > 0) {
    const general = selectAiCommander(sc, faction.idx);
    const types = selectAiFormationTypes(faction);
    if (!general || !types) break;
    const legion = {
      leader: general.name,
      generalIdx: general.idx,
      faction: faction.idx,
      x: capital.x,
      y: capital.y,
      prevX: capital.x,
      prevY: capital.y,
      troops: 0,
      units: types.map((type) => ({ type, troops: 0 })),
      morale: factionLegionMoraleCap(faction),
      cooldown: 0,
      status: 0xc4,
      delegated: true,
      _active: true,
      target: null,
      _aiOrdered: true,
      _markerFrame: 4,
      formation: 1,
      commandState: 0,
    };
    attachRuntimeLegion(sc, legion, general.idx);
    sc.legions.push(legion);
    general.status = 1;
    replenishLegionAtCapital(sc, legion);
    if (legion.troops <= 0) {
      sc.legions.pop();
      general.status = 0;
      break;
    }
    faction.n_legions = (faction.n_legions ?? current) + 1;
    legion.target = city;
    formed++;
  }
  return formed;
}

/** KI.EXE 0x3EFD→0x3F74：每次仅轮询一个据点槽。 */
export function tickStrategicCity(app, cityIndex) {
  const sc = app?.scenario;
  const city = sc?.cities?.[cityIndex];
  if (!city || city.faction == null) return false;
  if ((city._aiCooldown ?? 0) > 0) city._aiCooldown--;
  const faction = sc.factions?.find(
    (candidate) => candidate?.idx === city.faction,
  );
  if (!faction || faction.active === false || faction.dead) return false;
  const targetIdx = faction.target_faction;
  if (targetIdx == null || targetIdx === 0xff) return false;
  const candidates = cityNeighbours(sc, city).filter(
    (neighbour) =>
      neighbour.faction === targetIdx && isAtWar(sc, city.faction, targetIdx),
  );
  if (!candidates.length) return false;
  const localStrength = cityLocalStrength(sc, city);
  // 0x4013..0x4019：候选邻城写入的是运行态强度+1，随后0x407A
  // 用全部候选之和计算弱城请求数。
  const threatTotal = candidates.reduce(
    (sum, neighbour) => sum + cityLocalStrength(sc, neighbour) + 1,
    0,
  );
  if (localStrength < 1) {
    if ((city._aiCooldown ?? 0) > 0) return false;
    if (city.faction === sc.player_faction) {
      const rng = app.originalRng ?? app.activeBattleRng;
      const random = rng?.nextByte?.() ?? 0;
      city._aiCooldown = 0x18 + (random & 0x0f);
      app.gamebar?.enqueueStrategicMessage?.({
        gen: null,
        text: `${city.name}　前來請求援軍。`,
        kind: "reinforcement-request",
      });
      return true;
    }
    const formed = formAiReinforcements(app, faction, city, 1);
    if (formed > 0) {
      const capital = sc.cities[faction.capital];
      city._aiCooldown = Math.min(
        0x1e,
        Math.floor(
          (Math.abs(city.x - capital.x) + Math.abs(city.y - capital.y)) / 8,
        ),
      );
    }
    return formed > 0;
  }
  if (localStrength <= 1 && city.faction !== sc.player_faction) {
    const requested = Math.max(0, threatTotal + 2 - localStrength);
    const formed = formAiReinforcements(app, faction, city, requested);
    if (formed > 0) {
      const capital = sc.cities[faction.capital];
      city._aiCooldown = Math.min(
        0x1e,
        Math.floor(
          (Math.abs(city.x - capital.x) + Math.abs(city.y - capital.y)) / 8,
        ),
      );
    }
    return formed > 0;
  }
  const rng = app.originalRng ?? app.activeBattleRng;
  const target = candidates[(rng?.nextByte?.() ?? 0) & 3] ?? candidates[0];
  let remaining = Math.max(1, cityLocalStrength(sc, target) + 1);
  for (const legion of sc.legions.toSorted(
    (left, right) => (left.slot ?? 0x7fff) - (right.slot ?? 0x7fff),
  )) {
    if (remaining <= 0) break;
    if (
      legion.dead ||
      legion._active === false ||
      legion.faction !== city.faction ||
      legion.x !== city.x ||
      legion.y !== city.y ||
      !isLegionDelegated(legion) ||
      (legion.commandState ?? 0) >= 8
    )
      continue;
    if (remaining > 1 && (rng?.nextByte?.() ?? 0xff) < 0x40) {
      remaining--;
      continue;
    }
    legion.target = target;
    legion._aiOrdered = true;
    legion.commandState = 0;
    remaining--;
  }
  city._aiCooldown = 0;
  return true;
}

function clearMarchNavigation(A) {
  A._march = null;
  A._path = null;
  // SAVE 的 +0A/+0C/+0E 只用于恢复当前道路边；离边或重建导航后不得继续
  // 让旧原始地址覆盖当前节点语义，否则次日军费会一直误走道路分支。
  delete A.roadStride;
  delete A.roadPointAddress;
  delete A.roadEdgeOrNode;
  delete A._ptx;
  delete A._pty;
  delete A._feint;
}

function clearEngagement(A) {
  A._engagement = null;
  A.status = (A.status ?? 0x80) & ~ENGAGE_STATUS_ACTIVE;
  A.engagementCountdown = null;
}

function numericUnitSurvivors(unitSurvivors) {
  if (!Array.isArray(unitSurvivors)) return null;
  return unitSurvivors.slice(0, 6).map((unit) => {
    const value = typeof unit === "number" ? unit : unit?.troops;
    return Number.isFinite(value) ? Math.max(0, value | 0) : 0;
  });
}

function applyTacticalMorale(legion, oldTroops, won) {
  legion.morale = originalTacticalMorale(
    legion.morale ?? 0,
    oldTroops,
    legion.troops,
    won,
  );
}

function settleFieldLegion(
  legion,
  troops,
  unitSurvivors,
  won,
  authoritativeMorale = null,
) {
  const oldTroops = Math.max(0, legion.troops ?? 0);
  const survivorRecords = Array.isArray(unitSurvivors)
    ? unitSurvivors.slice(0, 6)
    : null;
  const survivors = numericUnitSurvivors(survivorRecords);
  if (survivors?.length === 6) {
    const oldUnits = Array.isArray(legion.units) ? legion.units : [];
    legion.units = survivors.map((unitTroops, index) => ({
      ...oldUnits[index],
      type:
        typeof survivorRecords[index] === "object"
          ? (survivorRecords[index]?.type ?? oldUnits[index]?.type ?? 4)
          : (oldUnits[index]?.type ?? 4),
      troops: unitTroops * 10,
    }));
    legion.troops = survivors.reduce((sum, unitTroops) => sum + unitTroops, 0);
  } else {
    legion.troops = Math.max(0, troops ?? legion.troops ?? 0);
  }
  if (authoritativeMorale == null) applyTacticalMorale(legion, oldTroops, won);
  else legion.morale = Math.max(0, Math.min(0xff, authoritativeMorale | 0));
  legion.prevX = legion.x;
  legion.prevY = legion.y;
  // 0x474A/0x487B 必须读取战败瞬间的当前道路边与端点；先快照，
  // 再清普通攻击命令，避免边内战败被误判为无路而直接0x291A。
  legion._battleRoadContext = legion._march
    ? {
        edgeId: legion._march.edgeId,
        stride: legion._march.stride,
        pointIndex: legion._march.pointIndex,
        points: legion._march.points?.map((point) => ({ ...point })) ?? [],
      }
    : null;
  legion.target = null;
  legion._aiOrdered = false;
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

function strategicRngFor(app, originalExit) {
  return originalExit?.strategicRng ?? app.originalRng ?? app.activeBattleRng;
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
  const saved = legion._battleRoadContext;
  const savedApproaches = [];
  if (saved?.points?.length) {
    const currentIndex = Math.max(
      0,
      Math.min(saved.points.length - 1, saved.pointIndex - 1),
    );
    const current = saved.points[currentIndex] ?? { x: legion.x, y: legion.y };
    for (const index of [saved.points.length - 1, 0]) {
      const endpoint = saved.points[index];
      if (!endpoint) continue;
      const node = roadNodeAt(endpoint.x, endpoint.y);
      if (!node) continue;
      const from = Math.min(currentIndex, index);
      const to = Math.max(currentIndex, index);
      const section = saved.points.slice(from, to + 1);
      const points = index < currentIndex ? section.toReversed() : section;
      savedApproaches.push({
        node,
        distance: Math.abs(index - currentIndex),
        points,
        current,
      });
    }
  }
  const approaches = savedApproaches.length
    ? savedApproaches
    : roadApproachesAt(legion.x, legion.y);
  for (const approach of approaches) {
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
      (node) => {
        const routeCity = sc.cities.find(
          (candidate) => candidate.x === node.x && candidate.y === node.y,
        );
        // 0x487B/0x491B：战败撤退只可沿本势力据点链返回首都；
        // 与普通进军不同，交战中的敌城也必须阻断。
        return Boolean(routeCity && routeCity.faction !== legion.faction);
      },
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
  legion._battleRoadContext = null;
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
    slot: legion.slot ?? legion.idx ?? general?.idx ?? null,
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
export function dispatchLegionFate(sc, legion, captorFaction, rng = null) {
  if (legion.dead || legion._active === false) return "ignored";
  const general = generalForLegion(sc, legion);
  const faction = sc.factions.find(
    (candidate) => candidate.idx === legion.faction,
  );
  let delayedReturn = false;
  if (factionIsActive(sc, legion.faction)) {
    if (
      general?.idx === faction?.monarch_idx ||
      captorFaction === legion.faction ||
      captorFaction === 0x18
    )
      delayedReturn = true;
    else {
      if (!rng || typeof rng.nextByte !== "function")
        throw new TypeError("postbattle fate requires original byte RNG");
      const threshold = ((general?.battle_rating ?? 0) >> 1) + 0x28;
      delayedReturn = (rng.nextByte() & 0x7f) <= threshold;
    }
  }
  return delayedReturn
    ? disbandLegionForReturn(sc, legion)
    : captureOrEliminateLegion(sc, legion, captorFaction);
}

function tickDelayedLegionReturns(sc, processedSlots = null) {
  const remaining = [];
  const completed = [];
  for (const item of sc.delayedLegionReturns ?? []) {
    const slot = item.slot ?? item.generalIdx;
    if (processedSlots && !processedSlots.has(slot)) {
      remaining.push(item);
      continue;
    }
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

function markerFrameToward(fromX, fromY, toX, toY) {
  if (Math.abs(toX - fromX) >= Math.abs(toY - fromY))
    return toX < fromX ? 0 : 1;
  return toY < fromY ? 2 : 3;
}

function startEngagement(A, kind, target) {
  A.prevX = A.x;
  A.prevY = A.y;
  const nextPoint = A._march?.points?.[A._march.pointIndex];
  if (nextPoint)
    A._markerFrame = markerFrameToward(A.x, A.y, nextPoint.x, nextPoint.y);
  A.status = (A.status ?? 0x80) | ENGAGE_STATUS_ACTIVE;
  A.engagementCountdown = ENGAGE_COUNTDOWN - 1;
  A._engagement = {
    kind,
    countdown: A.engagementCountdown, // 0x264A 在首次接触同轮把12立即减为11。
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

/** 0x2831：军团表0..126槽序扫描；首个同坐标军团即停止，再比较势力。 */
function contactLegionAt(sc, A, x, y) {
  const occupant = sc.legions
    .filter(
      (B) =>
        B !== A &&
        !B.dead &&
        B._active !== false &&
        B.faction != null &&
        B.x === x &&
        B.y === y,
    )
    .toSorted((left, right) => left.slot - right.slot)[0];
  return occupant?.faction === A.faction ? null : occupant;
}

function hostileCityAt(sc, A, x, y) {
  const city = sc.cities.find(
    (candidate) => candidate.x === x && candidate.y === y,
  );
  if (!city || city.faction === A.faction) return null;
  // KI.EXE 0x2880：0x18中立城同样进入0x4ADE；外交阻断由更早的0x42AB处理。
  return city;
}

function reverseBlockedFinalEdge(sc, A) {
  const nav = A._march;
  if (!nav || nav.pointIndex >= nav.points.length) return false;
  // 0x42AB检查当前active edge的行进端，不是整条命令的最终target。
  const endpoint = roadNodeById(nav.toNode);
  const destination = endpoint
    ? sc.cities.find((city) => city.x === endpoint.x && city.y === endpoint.y)
    : null;
  if (
    !destination ||
    destination.faction == null ||
    destination.faction === A.faction ||
    atWar(sc, A.faction, destination.faction)
  )
    return false;
  const reversed = reverseRoadMarchContext(nav, A.x, A.y);
  if (!reversed) return false;
  A._march = reversed;
  A._path = reversed.points.slice(reversed.pointIndex);
  // 0x42AB只临时改当前道路端点；玩家/AI最终命令目标仍保留，回到端点后再寻路。
  A.status = (A.status ?? 0x80) | 0x02;
  return true;
}

/** 0x25CC→0x42AB→0x2831/0x2880：每轮实时重检，不锁存首次kind/target。 */
function currentEngagement(sc, A, countdown) {
  if (reverseBlockedFinalEdge(sc, A)) return null;
  const next = A._march?.points?.[A._march.pointIndex];
  if (!next) return null;
  const foe = contactLegionAt(sc, A, next.x, next.y);
  if (foe)
    return {
      kind: ENGAGE_KIND_FIELD,
      countdown,
      target: { x: next.x, y: next.y, faction: foe.faction },
    };
  const city = hostileCityAt(sc, A, next.x, next.y);
  return city
    ? { kind: ENGAGE_KIND_SIEGE, countdown, target: { cityIdx: city.idx } }
    : null;
}

/** KI.EXE 0x2831/0x2880：持续接触才递减；消失时同轮继续移动。 */
function advanceEngagement(app, A) {
  const previous = A._engagement;
  if (!previous) return false;
  const engagement = currentEngagement(
    app.scenario,
    A,
    Math.max(1, previous.countdown ?? A.engagementCountdown ?? 1),
  );
  if (!engagement) {
    clearEngagement(A);
    return false;
  }
  A._engagement = engagement;
  A.status = (A.status ?? 0x80) | ENGAGE_STATUS_ACTIVE;
  const target = engagementTarget(app.scenario, engagement);
  if (!target || target.dead) {
    clearEngagement(A);
    return false;
  }
  // 小地图同步闪烁接敌/攻城位置（大地图发生战斗时小地图同步闪动）
  const flashLoc =
    engagement.kind === ENGAGE_KIND_SIEGE
      ? target
      : { x: target.x ?? A.x, y: target.y ?? A.y };
  app.gamebar?.addMiniBattleFlash?.(flashLoc);
  if (engagement.countdown > 1) {
    engageSfx();
    engagement.countdown--;
    A.engagementCountdown = engagement.countdown;
    return true;
  }

  const resolve = () => {
    clearEngagement(A);
    if (engagement.kind === ENGAGE_KIND_FIELD)
      return resolveFieldBattle(app, A, target);
    return resolveBattle(app, A, target);
  };
  if (
    battleUsesDelegatedPlayer(app.scenario, A, target, engagement.kind) &&
    typeof app.playDelegatedEngage === "function"
  ) {
    // gate 失败时保留 _engagement，待现有过渡结束后下次 tick 再处理。
    return app.playDelegatedEngage(A, resolve);
  }
  return resolve();
}

function rememberMarchBase(sc, A) {
  const city = sc.cities.find(
    (candidate) => candidate.x === A.x && candidate.y === A.y,
  );
  if (!city) return;
  A._bases ??= [];
  if (A._bases.at(-1) !== city) {
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

  if (reverseBlockedFinalEdge(sc, A)) return "reversed";
  const nav = A._march;
  const next = nav.points[nav.pointIndex];
  if (!next) {
    clearMarchNavigation(A);
    return A.x === tx && A.y === ty ? "arrived" : "blocked";
  }

  const foe = contactLegionAt(sc, A, next.x, next.y);
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
  A._markerFrame = markerFrameToward(A.x, A.y, next.x, next.y);
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
function battleUsesDelegatedPlayer(sc, A, target, kind) {
  const pf = playerFaction(sc);
  if (!pf) return false;
  if (A.faction === pf.idx && isLegionDelegated(A)) return true;
  if (kind === ENGAGE_KIND_FIELD)
    return target?.faction === pf.idx && isLegionDelegated(target);
  if (target?.faction !== pf.idx) return false;
  const defenders = sc.legions.filter(
    (legion) =>
      legion !== A &&
      !legion.dead &&
      legion._active !== false &&
      legion.faction === target.faction &&
      legion.x === target.x &&
      legion.y === target.y,
  );
  const primary = selectPrimaryLegion(sc, defenders);
  return primary ? isLegionDelegated(primary) : false;
}

export function resolveBattle(app, A, city) {
  app.gamebar?.addMiniBattleFlash?.(city);
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
  const playerAttacker = pf && A.faction === pf.idx;
  const playerDefender = pf && city.faction === pf.idx;
  const playerControls =
    (playerAttacker && !isLegionDelegated(A) && primaryDefender) ||
    (playerDefender && primaryDefender && !isLegionDelegated(primaryDefender));
  if (playerControls && app.battleView && !app.battleView.active) {
    app.startBattle(A, city, primaryDefender); // 暂停时钟+开覆盖层; 结算在 onFinish 回调
    return true;
  }
  const defender = primaryDefender ?? createCityGarrison(city);
  const rng = strategicRngFor(app, null);
  const result = resolveStrategicBattle(sc, A, defender, {
    mode: 0,
    cityDefence: city.sim?.troops ?? city.troops ?? 0,
    rng,
  });
  applySiegeCityDamage(city, result.ratio);
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
    {
      strategicRng: rng,
      sides: [result.attack, result.defence],
    },
  );
  return false;
}

export function resolveFieldBattle(app, A, D) {
  if (!D || D.dead) return false;
  app.gamebar?.addMiniBattleFlash?.({ x: D.x, y: D.y });
  const sc = app.scenario;
  const pf = playerFaction(sc);
  if (
    pf &&
    (A.faction === pf.idx || D.faction === pf.idx) &&
    !(A.faction === pf.idx && isLegionDelegated(A)) &&
    !(D.faction === pf.idx && isLegionDelegated(D)) &&
    app.battleView &&
    !app.battleView.active
  ) {
    app.startFieldBattle(A, D);
    return true;
  }
  const rng = strategicRngFor(app, null);
  const result = resolveStrategicBattle(sc, A, D, { mode: 1, rng });
  applyFieldBattleResult(
    app,
    A,
    D,
    result.winner,
    result.attack.troops,
    result.defence.troops,
    result.attack.units.map((unit) => unit.troops),
    result.defence.units.map((unit) => unit.troops),
    {
      strategicRng: rng,
      sides: [result.attack, result.defence],
    },
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
  originalExit = null,
) {
  const sc = app.scenario;
  const strategicRng = strategicRngFor(app, originalExit);
  const atkResult = originalExit?.sides?.[0];
  const defResult = originalExit?.sides?.[1];
  settleFieldLegion(
    A,
    atkResult?.troops ?? atkTroops,
    atkResult?.units ?? atkUnits,
    winner === "atk",
    atkResult?.morale,
  );
  settleFieldLegion(
    D,
    defResult?.troops ?? defTroops,
    defResult?.units ?? defUnits,
    winner === "def",
    defResult?.morale,
  );
  const attackContinues = continueLegionAfterBattle(sc, A, winner === "atk");
  const defenceContinues = continueLegionAfterBattle(sc, D, winner === "def");
  if (A._retreat) A._retreat.captorFaction = D.faction;
  if (D._retreat) D._retreat.captorFaction = A.faction;
  const attackFate = attackContinues
    ? "continue"
    : dispatchLegionFate(sc, A, D.faction, strategicRng);
  const defenceFate = defenceContinues
    ? "continue"
    : dispatchLegionFate(sc, D, A.faction, strategicRng);
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
  const cities = sc
    .citiesOf(factionIdx)
    .toSorted((left, right) => left.idx - right.idx);
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

/** KI.EXE 0x4FCE：最后据点失陷同轮处理灭亡并显示TALK36。 */
function finalizeFactionExtinction(app, factionIdx) {
  const sc = app.scenario;
  const faction = sc.factions.find(
    (candidate) => candidate?.idx === factionIdx,
  );
  if (!faction || !faction.dead || faction._extinctionHandled) return false;
  faction._extinctionHandled = true;
  // 0x4FCE 内武将自尽、俘获、流散的完整分支仍未闭合。此处只落实
  // 已实锤的即时灭亡、TALK36和其它势力目标清理，不臆造武将去向。
  app.gamebar?.enqueueStrategicMessage?.({
    gen: null,
    text: `${faction.monarch}的勢力滅亡了。`,
    kind: "faction-extinction",
  });
  for (const other of sc.factions) {
    if (other?.active === false || other?.dead) continue;
    if (other.target_faction === factionIdx) other.target_faction = null;
  }
  if (factionIdx === sc.player_faction) {
    app.endView?.show({
      img: "grf/gameover.png",
      caption: `大業未成，${faction.monarch}軍覆滅…（點擊返回標題）`,
    });
  }
  return true;
}

function retreatCapturedGarrison(
  sc,
  city,
  oldFaction,
  captorFaction,
  rng = null,
) {
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
      dispatchLegionFate(sc, legion, captorFaction, rng),
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
  originalExit = null,
) {
  const sc = app.scenario;
  const strategicRng = strategicRngFor(app, originalExit);
  const atkResult = originalExit?.sides?.[0];
  const defResult = originalExit?.sides?.[1];
  settleFieldLegion(
    A,
    atkResult?.troops ?? atkTroops ?? A.troops,
    atkResult?.units ?? atkUnits,
    winner === "atk",
    atkResult?.morale,
  );
  if (primaryDefender) {
    settleFieldLegion(
      primaryDefender,
      defResult?.troops ?? defTroops ?? primaryDefender.troops,
      defResult?.units ?? defUnits,
      winner === "def",
      defResult?.morale,
    );
  }
  if (originalExit?.cityDamage) {
    city.growth = originalExit.cityDamage.growth;
    city.disaster = originalExit.cityDamage.disaster;
    city.defence = originalExit.cityDamage.defence;
    city.troops = originalExit.cityDamage.troops;
    if (city.sim) city.sim.troops = originalExit.cityDamage.troops;
  } else if (wallRecords) applyTacticalSiegeCityDamage(city, wallRecords);
  const oldFaction = city.faction;
  if (winner === "atk") {
    // 0x4CF3 先交换据点所属，再由0x4DA4为原守方军团求共同撤退路线；
    // 否则刚失陷的城市仍会被误选为“己方最近据点”。
    city.faction = A.faction;
    updateFactionAfterCityCapture(sc, oldFaction);
    updateFactionAfterCityCapture(sc, A.faction);
    const garrison = retreatCapturedGarrison(
      sc,
      city,
      oldFaction,
      A.faction,
      strategicRng,
    );
    // 原版先走0x4DA4处理破城守军组，随后才在无新首都时进入0x4FCE。
    if (oldFaction != null && oldFaction !== A.faction) {
      finalizeFactionExtinction(app, oldFaction);
    }
    if (oldFaction === sc.player_faction && oldFaction !== A.faction) {
      // KI.EXE 0x4F71：玩家据点实际易主时播放 0xCE7 警告音。
      warnSfx();
      // 无驻军据点失守时另给通用底部提示；有守军时战报已含撤退/去向。
      if (garrison.retreat === 0 && garrison.fates.length === 0) {
        app.gamebar?.enqueueStrategicMessage?.({
          text: `${city.name} 被 ${A.leader} 占領`,
        });
      }
    }
    // 0x51B3→0x4CF3：破城只交换归属，保留已扣损的+0x13城兵。
    A.x = city.x;
    A.y = city.y;
    A.prevX = city.x;
    A.prevY = city.y;
    continueLegionAfterBattle(sc, A, true);
    A.cooldown = 8;
    if (oldFaction != null && oldFaction !== A.faction) {
      declareWar(sc, A.faction, oldFaction);
      // 0x30F0 为单向关系修改；破城后双方各自降低。
      decreaseRelation(sc, A.faction, oldFaction, 20);
      decreaseRelation(sc, oldFaction, A.faction, 20);
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
    : dispatchLegionFate(sc, A, oldFaction ?? 0x18, strategicRng);
  if (A._active !== false) A.cooldown = 12;
  app.hud?.flashEvent?.(
    `${A.leader} 攻${city.name}失利（餘兵${A.troops}；${fate}）`,
  );
}

const WAR_TALKS_AI = [
  "無法再與貴國維持外交了。要擊潰貴國！",
  "與你不共戴天！好好覺悟吧。",
  "很遺憾，只有滅了貴國了．．．好好迎戰吧。",
];

const WAR_TALKS_PLAYER = [
  "斷絕與{target}的外交，將軍團派往國境！",
  "就將{target}擊潰吧。{advisor}啊，立即進兵侵攻！",
  "已經不能再與{target}共存了．．立即固守國境。",
];

function warTalkStyle(sc, faction) {
  const monarch = sc.generals?.[faction?.monarch_idx];
  return Math.max(0, Math.min(2, monarch?.talk_idx ?? 0));
}

/** KI.EXE 0x3526：宣战消息按发起者与君主说话类型分池。 */
export function processStrategicWarEvent(app, event) {
  const sc = app.scenario;
  const aggressor = sc.factions?.find((f) => f?.idx === event.aggressor);
  const defender = sc.factions?.find((f) => f?.idx === event.defender);
  if (!aggressor || !defender || isAtWar(sc, event.aggressor, event.defender))
    return false;
  const commit = () => {
    if (isAtWar(sc, aggressor.idx, defender.idx)) return;
    aggressor.target_faction = defender.idx;
    declareWar(sc, aggressor.idx, defender.idx);
  };
  const monarch = sc.generals?.[aggressor.monarch_idx] ?? null;
  if (defender.idx === sc.player_faction) {
    // AI→玩家：0xCE7 后先 AL=0x93/TALK63 通用报告，再由发起君主
    // 显示 CX=415→TALK 478+general[+0x1E]；第二条关闭后才提交敌对状态。
    warnSfx();
    app.gamebar?.enqueueStrategicMessage?.({
      gen: null,
      text: `${aggressor.monarch?.trim?.() || "敵方"}對我發出宣戰佈告了。`,
      kind: "war-declaration-report",
    });
    app.gamebar?.enqueueStrategicMessage?.({
      gen: monarch,
      text: WAR_TALKS_AI[warTalkStyle(sc, aggressor)],
      kind: "war-declaration",
      onClose: commit,
    });
  } else {
    commit();
  }
  return true;
}

/** 玩家主动宣战成功后的0x645D→0x3526第二阶段。 */
export function completePlayerWarDeclaration(app, targetFaction) {
  const sc = app?.scenario;
  const aggressor = sc?.factions?.find((f) => f?.idx === sc.player_faction);
  const defender =
    typeof targetFaction === "object"
      ? targetFaction
      : sc?.factions?.find((f) => f?.idx === targetFaction);
  if (!aggressor || !defender || isAtWar(sc, aggressor.idx, defender.idx))
    return false;
  const style = warTalkStyle(sc, aggressor);
  const advisorName =
    sc.player_advisor?.name?.trim?.() ||
    sc.generals?.[aggressor.advisor_idx]?.name?.trim?.() ||
    "軍師";
  const targetName = defender.monarch?.trim?.() || "敵方";
  const text = WAR_TALKS_PLAYER[style]
    .replace("{target}", targetName)
    .replace("{advisor}", advisorName);
  const commit = () => {
    if (isAtWar(sc, aggressor.idx, defender.idx)) return;
    aggressor.target_faction = defender.idx;
    declareWar(sc, aggressor.idx, defender.idx);
  };
  if (app.gamebar?.enqueueStrategicMessage) {
    app.gamebar.enqueueStrategicMessage({
      gen: sc.generals?.[aggressor.monarch_idx] ?? null,
      text,
      kind: "war-declaration",
      onClose: commit,
    });
  } else {
    commit();
  }
  return true;
}

function enqueueStrategicWarEvents(sc, events, delay = 7) {
  sc.pendingStrategicEvents = sc.pendingStrategicEvents ?? [];
  for (const event of events) {
    const duplicate = sc.pendingStrategicEvents.some(
      (queued) =>
        queued.type === event.type &&
        queued.aggressor === event.aggressor &&
        queued.defender === event.defender,
    );
    if (!duplicate) sc.pendingStrategicEvents.push({ ...event, delay });
  }
  return events;
}

/** 新游戏 0x1B29→0x2BD9：立即改变关系，并以 0x31AD=7 延迟调度事件。 */
export function initializeStrategicDiplomacy(app) {
  const events = runStrategicDiplomacy(app?.scenario);
  return enqueueStrategicWarEvents(app.scenario, events);
}

/** 月结 0x5358→0x5394→0x2BD9：更新关系并排入 type-1 宣战事件。 */
export function monthlyDiplomacyAI(app) {
  const events = runStrategicDiplomacy(app?.scenario);
  return enqueueStrategicWarEvents(app.scenario, events);
}

export function tickStrategicWarEvents(app) {
  const sc = app.scenario;
  const remainingBudgetReports = [];
  for (const report of sc.pendingEnvoyBudgetReports ?? []) {
    report.delay = Math.max(0, (report.delay ?? 0) - 1);
    if (report.delay > 0) remainingBudgetReports.push(report);
    else app.gamebar?.enqueueEnvoyBudgetReport?.(report);
  }
  sc.pendingEnvoyBudgetReports = remainingBudgetReports;

  const remaining = [];
  let changed = false;
  for (const event of sc.pendingStrategicEvents ?? []) {
    event.delay = Math.max(0, (event.delay ?? 0) - 1);
    if (event.delay > 0) {
      remaining.push(event);
      continue;
    }
    changed = processStrategicWarEvent(app, event) || changed;
  }
  sc.pendingStrategicEvents = remaining;
  return changed;
}

/** 0x3E11→0x3E8E：每战略调度只轮转一个势力的外交官常态关系。 */
export function tickEnvoyDiplomacy(app) {
  const sc = app?.scenario;
  const rng = app?.originalRng ?? app?.activeBattleRng;
  if (!sc?.envoys || !rng?.nextByte) return false;
  const factions = (sc.factions ?? []).filter((f) => f?.idx != null);
  if (!factions.length) return false;
  const cursor = Math.max(0, sc._envoyDiplomacyCursor | 0) % factions.length;
  sc._envoyDiplomacyCursor = (cursor + 1) % factions.length;
  const current = factions[cursor];
  const envoy = sc.envoys[current.idx];
  if (!envoy || (envoy.budget ?? 0) <= 0 || rng.nextByte() >= 0x20)
    return false;
  const general =
    (envoy.gen_idx != null && sc.generals?.[envoy.gen_idx]) ||
    sc.generals?.find((g) => g?.name?.trim?.() === envoy.name?.trim?.());
  const politics = Math.max(0, Math.min(15, general?.ability?.politics ?? 0));
  const spend = Math.max(0, 23 - politics);
  envoy.budget = Math.max(0, (envoy.budget ?? 0) - spend);
  if (general) general.assignment_budget = envoy.budget;
  if ((rng.nextByte() & 0x0f) > politics) return false;
  const playerIdx = sc.player_faction;
  increaseRelation(sc, current.idx, playerIdx, 1);
  if (
    relation(sc, current.idx, playerIdx) > relation(sc, playerIdx, current.idx)
  )
    increaseRelation(sc, playerIdx, current.idx, 1);
  return true;
}

// ★月度 AI: 俘虏脱逃回归 + 势力灭亡流散随机投奔(城数加权, 武将少者优先)
export function monthlyAI(app) {
  const sc = app.scenario;
  if (!sc) return;
  // 势力灭亡由最后据点易主的0x4CF3→0x4FCE同轮处理；月结不得补扫或
  // 随机改投，否则会改变TALK36、武将去向和其它势力目标清理的顺序。
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
      const returningLegion = {
        leader: p.leader,
        faction: p.faction,
        x: cap.x,
        y: cap.y,
        prevX: cap.x,
        prevY: cap.y,
        troops: 1 + sc.citiesOf(p.faction).length,
        units: createDefaultLegionUnits(1 + sc.citiesOf(p.faction).length),
        morale: factionLegionMoraleCap(f),
        cooldown: 6,
        target: null,
        _markerFrame: 4,
        formation: 1, // 编制类型 1..4 (0xCBE5 选块)
      };
      attachRuntimeLegion(sc, returningLegion, p.slot ?? p.generalIdx);
      sc.legions.push(returningLegion);
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

// 单城成长 — KI.EXE 0x3EFD 每次处理一个城槽后立即调用0x4194/0x4269。
function tickStrategicCityDaily(sc, cityIndex) {
  const c = sc.cities?.[cityIndex];
  if (!c || c.faction == null) return;
  let pol = 0;
  let lead = 0;
  const govIdx = c.governor;
  if (govIdx != null && sc.generals?.[govIdx]) {
    const gen = sc.generals[govIdx];
    pol = gen.ability?.politics ?? 0;
    lead = gen.ability?.lead ?? 0;
  }

  // KI.EXE 0x4194 逐城轮询动力学：
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

/** 兼容测试/工具的全城批处理入口；产品主循环使用单城tick。 */
export function cityDaily(sc) {
  for (let cityIndex = 0; cityIndex < sc.cities.length; cityIndex++) {
    tickStrategicCityDaily(sc, cityIndex);
  }
}

function legionOnRoadEdge(legion) {
  // KI.EXE 0x2609 只比较 legion[+0x0E] 是否 >=0x0800。
  // Web 运行态优先读取已恢复/已建立的 edgeId；旧快照保留原始地址时直接比较。
  if (legion?._march?.edgeId != null) return true;
  const raw = Number(legion?.roadEdgeOrNode);
  return Number.isFinite(raw) && raw >= 0x0800;
}

const LEGION_RESERVE_FIELD_BY_TYPE = Object.freeze({
  1: "reserve_cav",
  2: "reserve_inf",
  3: "reserve_arc",
});

/**
 * KI.EXE 0x4370..0x4398→状态9→0x4499→0x461D/0x4717/0x4698→0x6FD2：
 * 军团在本势力首都且总兵<600时，按六队兵种从三预备兵池补到每队最多100。
 * 原版先把各队当前兵并回对应池，再按同兵种队数平均重分；等价于同兵种池内重编。
 */
export function replenishLegionAtCapital(sc, legion) {
  if (
    !sc?.factions ||
    !sc?.cities ||
    !legion ||
    legion.dead ||
    legion._active === false ||
    legion.faction == null ||
    (legion.target &&
      (legion.target.x !== legion.x || legion.target.y !== legion.y)) ||
    (legion.troops ?? 0) >= 600
  )
    return false;
  const faction = sc.factions.find(
    (candidate) => candidate?.idx === legion.faction,
  );
  const capital = faction?.capital == null ? null : sc.cities[faction.capital];
  if (
    !capital ||
    capital.faction !== legion.faction ||
    capital.x !== legion.x ||
    capital.y !== legion.y
  )
    return false;

  const units = ensureLegionUnits(legion);
  const counts = { 1: 0, 2: 0, 3: 0 };
  for (const unit of units) {
    const type = unit?.type | 0;
    if (counts[type] != null) counts[type]++;
  }

  let changed = false;
  for (const type of [1, 2, 3]) {
    const unitCount = counts[type];
    if (!unitCount) continue;
    const reserveField = LEGION_RESERVE_FIELD_BY_TYPE[type];
    const sameTypeUnits = units.filter((unit) => (unit?.type | 0) === type);
    const current = sameTypeUnits.reduce(
      (sum, unit) => sum + Math.max(0, Math.floor((unit.troops ?? 0) / 10)),
      0,
    );
    const pool = Math.max(0, Math.trunc(Number(faction[reserveField]) || 0));
    // 0x4717 逐队经0x55EC并回预备池，word上限0xFFDC=65500。
    let available = Math.min(0xffdc, pool + current);
    for (let index = 0; index < sameTypeUnits.length; index++) {
      const slotsLeft = unitCount - index;
      const assigned = Math.min(
        100,
        Math.floor(available / slotsLeft) + (available % slotsLeft),
      );
      if (sameTypeUnits[index].troops !== assigned * 10) changed = true;
      sameTypeUnits[index].troops = assigned * 10;
      available -= assigned;
    }
    if (faction[reserveField] !== available) changed = true;
    faction[reserveField] = available;
  }
  const total = units.reduce(
    (sum, unit) => sum + Math.max(0, Math.floor((unit.troops ?? 0) / 10)),
    0,
  );
  if (legion.troops !== total) changed = true;
  legion.troops = total;
  faction.troops =
    ((faction.reserve_cav ?? 0) +
      (faction.reserve_arc ?? 0) +
      (faction.reserve_inf ?? 0)) *
    10;
  return changed;
}

/** KI.EXE 0x2600..0x2649：军团每日军费与节点士气恢复。 */
export function settleLegionDaily(sc, processedSlots = null) {
  if (!sc?.legions) return;
  for (const legion of sc.legions) {
    const slot = legion.slot ?? legion._runtimeId;
    if (
      (processedSlots && !processedSlots.has(slot)) ||
      legion.dead ||
      legion._active === false ||
      legion.faction == null
    )
      continue;
    const faction = sc.factions?.find(
      (candidate) => candidate?.idx === legion.faction,
    );
    if (!faction) continue;
    const onRoadEdge = legionOnRoadEdge(legion);
    applyFactionFundsDelta(
      faction,
      -legionDailyMaintenanceCost(legion, onRoadEdge),
    );
    if (!onRoadEdge) {
      legion.morale = Math.min(
        factionLegionMoraleCap(faction),
        Math.max(0, Number(legion.morale) || 0) + 10,
      );
    }
  }
}

/** 战术层/委任过渡异步返回后，补做被暂停战略日的0x2600结算。 */
export function finishDeferredLegionDaily(app) {
  if (!app?._legionDailySettlementDeferred) return false;
  app._legionDailySettlementDeferred = false;
  const processedSlots = app._legionDailySettlementSlots ?? null;
  app._legionDailySettlementSlots = null;
  settleLegionDaily(app.scenario, processedSlots);
  return true;
}

export function aiTick(app, options = {}) {
  // 战术场景或委任四相过渡接管期间，不能推进城池每日状态或处理第二场战斗。
  if (app.battleView?.active || app.engageTransition?.active) return;
  const sc = app.scenario;
  if (!sc || !sc.legions) return;
  // 0x25CC→0x2662 的首都状态9先于同槽 0x2600；军团表按固定槽地址升序处理。
  // 排序仅复制引用数组，不能复制军团对象，否则同首都多军团争用预备池的结果会偏离原版。
  const batchStart = Number.isInteger(options.legionBatchStart)
    ? Math.max(0, Math.min(112, options.legionBatchStart))
    : null;
  const processedSlots =
    batchStart == null
      ? null
      : new Set(Array.from({ length: 16 }, (_, index) => batchStart + index));
  const shouldProcessLegion = (legion) =>
    !processedSlots || processedSlots.has(legion.slot ?? legion._runtimeId);
  const shouldSettleDaily =
    options.settleDaily ?? (batchStart == null || options.hour === 1);
  // 0x1D0B 固定顺序：0x3EFD 单城槽（含该城0x4194/0x4269），再0x25A3
  // 十六军团槽。先让边城请求编成，不能让同批首都军团抢先消耗预备兵池。
  if (Number.isInteger(options.cityIndex)) {
    tickStrategicCity(app, options.cityIndex);
    tickStrategicCityDaily(sc, options.cityIndex);
  } else if (options.runCityDaily !== false) {
    cityDaily(sc);
  }
  let replenished = false;
  const legionsInSlotOrder = sc.legions
    .filter(shouldProcessLegion)
    .toSorted(
      (left, right) =>
        (left.slot ?? left._runtimeId ?? 0x7fff) -
        (right.slot ?? right._runtimeId ?? 0x7fff),
    );
  for (const legion of legionsInSlotOrder) {
    if (replenishLegionAtCapital(sc, legion)) replenished = true;
  }
  // 0x3E11 在0x1D8E时刻进位时由主调度器调用，不属于每次0x1D0B主更新。
  // 无显式分批的旧工具调用仍可通过runFactionTick:true请求一次。
  if (options.runFactionTick === true) tickEnvoyDiplomacy(app);
  let changed =
    replenished ||
    (options.runFactionTick === true && tickStrategicWarEvents(app));
  for (const item of tickDelayedLegionReturns(sc, processedSlots)) {
    changed = true;
    app.hud?.flashEvent?.(`${item.leader} 收攏殘部後返回待命`);
  }
  for (const A of sc.legions) {
    if (!shouldProcessLegion(A) || A.dead || A.faction == null) continue;
    if (A.prevX === A.x && A.prevY === A.y) continue;
    A.prevX = A.x;
    A.prevY = A.y;
  }
  for (const A of sc.legions) {
    if (
      !shouldProcessLegion(A) ||
      A.dead ||
      A._active === false ||
      A.faction == null
    )
      continue;
    if (A._retreat && A.target) {
      if (A.cooldown > 0) {
        A.cooldown--;
        continue;
      }
      const retreatResult = stepTo(sc, A, A.target.x, A.target.y);
      if (retreatResult === "blocked") {
        const fallbackRng = app.originalRng ?? app.activeBattleRng;
        dispatchLegionFate(
          sc,
          A,
          A._retreat.captorFaction ?? A.faction,
          fallbackRng,
        );
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
      if (
        battleOpened &&
        (app.battleView?.active || app.engageTransition?.active)
      ) {
        // 0x25A3 单槽先0x2662、后0x2600；只有CF3==1的批次需要异步补日结。
        app._legionDailySettlementDeferred = shouldSettleDaily;
        app._legionDailySettlementSlots = shouldSettleDaily
          ? new Set(
              processedSlots ??
                legionsInSlotOrder.map(
                  (legion) => legion.slot ?? legion._runtimeId,
                ),
            )
          : null;
        return;
      }
      if (A._engagement || A.dead) continue;
      // 0x264A：本轮未重新接触会清+3；0x2708随后可在同轮继续移动。
      if (A.target) {
        const resumed = stepTo(sc, A, A.target.x, A.target.y);
        if (
          resumed === "moved" ||
          resumed === "arrived" ||
          resumed === "reversed"
        )
          changed = true;
        continue;
      }
    }
    // 0x42AB属于军团实际道路更新；反向后本轮停止，但保留最终命令目标。
    if (A._march && reverseBlockedFinalEdge(sc, A)) {
      changed = true;
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
      if (marchResult === "reversed") {
        changed = true;
        continue;
      }
      if (marchResult === "blocked") {
        A.target = null;
        continue;
      }
      if (A.x === orderedTarget.x && A.y === orderedTarget.y) {
        if (
          orderedTarget.faction !== A.faction &&
          (orderedTarget.faction == null ||
            !isFriendly(sc, A.faction, orderedTarget.faction))
        ) {
          if (resolveBattle(app, A, orderedTarget)) {
            app._legionDailySettlementDeferred = shouldSettleDaily;
            app._legionDailySettlementSlots = shouldSettleDaily
              ? new Set(
                  processedSlots ??
                    legionsInSlotOrder.map(
                      (legion) => legion.slot ?? legion._runtimeId,
                    ),
                )
              : null;
            return;
          }
          changed = true;
        }
        A.target = null;
        A.cooldown = 6;
      }
      continue;
    }
    // 非委任的玩家军团没有明确命令时原地待命；委任军团才进入自主决策。
    if (A.faction === sc.player_faction && !isLegionDelegated(A)) continue;
    const { sum, foe } = scanThreat(A, sc);
    if (foe) {
      if (A.troops + 2 > sum) {
        // 强势→攻击 (0x4057 兵力+2判据)
        const T = sc.cities.find((c) => c.x === foe.x && c.y === foe.y);
        const marchResult = stepTo(sc, A, foe.x, foe.y);
        if (marchResult === "contact") continue;
        if (A.x === foe.x && A.y === foe.y) {
          if (T && T.faction != null && T.faction !== A.faction) {
            if (resolveBattle(app, A, T)) {
              app._legionDailySettlementDeferred = shouldSettleDaily;
              app._legionDailySettlementSlots = shouldSettleDaily
                ? new Set(
                    processedSlots ??
                      legionsInSlotOrder.map(
                        (legion) => legion.slot ?? legion._runtimeId,
                      ),
                  )
                : null;
              return; // ★交互战斗已开启, 结算延至战果回写后
            }
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
      // 0x3EFD城池AI负责为AI军团写入边境增援/出击目标；没有命令时驻守。
      // 禁止以“最近敌城”替代尚未闭合的0x4325状态机，避免破城后连续攻击。
      if (A.target) {
        const marchResult = stepTo(sc, A, A.target.x, A.target.y);
        if (marchResult === "contact") continue;
        if (marchResult === "reversed") {
          changed = true;
          continue;
        }
        if (marchResult === "blocked") {
          A.target = null;
          continue;
        }
        if (A.target && A.x === A.target.x && A.y === A.target.y) {
          // 中途易主变友方(如同盟成立)则不攻
          if (!isFriendly(sc, A.faction, A.target.faction)) {
            if (resolveBattle(app, A, A.target)) {
              app._legionDailySettlementDeferred = shouldSettleDaily;
              app._legionDailySettlementSlots = shouldSettleDaily
                ? new Set(
                    processedSlots ??
                      legionsInSlotOrder.map(
                        (legion) => legion.slot ?? legion._runtimeId,
                      ),
                  )
                : null;
              return; // ★交互战斗已开启, 结算延至战果回写后
            }
            changed = true;
          }
          A.target = null;
          A.cooldown = 6;
        }
      }
    }
  }
  // 0x25A3 单槽顺序为0x2662→0x2600：按本轮移动、到达和同步战果后的状态结算。
  if (shouldSettleDaily) settleLegionDaily(sc, processedSlots);
  sc.legions = sc.legions.filter((A) => !A.dead);
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
