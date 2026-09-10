// AI 逻辑 — 复刻 KI.EXE 三态机: 威胁感知(0x3FA9)→强弱判断(0x4057)→攻/逃/游走(0x4155/0x40C9)
import {
  EMPTY_FACTION,
  isAtWar,
  relation,
  declareWar,
  makeCeasefire,
  decreaseRelation,
  factionStrategicPower,
  increaseRelation,
  runStrategicDiplomacy,
} from "./diplomacy.js";
import { isPlayerAdvisorGeneral, playerFaction } from "./commands.js";
import { findPath, terrainTile } from "./pathfind.js";
import {
  findRoadRoute,
  reverseRoadMarchContext,
  roadApproachesAt,
  roadEdgeById,
  roadGraphReady,
  roadNodeAt,
  roadNodeById,
  roadNodeIdFromRaw,
  roadNodeRawAddress,
  restoreRoadMarchContext,
} from "./roadgraph.js";
import { warnSfx } from "../core/speaker.js";
import {
  applyFactionFundsDelta,
  factionLegionMoraleCap,
  factionReserveUpkeepTick,
  legionDailyMaintenanceCost,
  updateFactionFiscalCrisis,
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
  ensureLegionSlot,
  ensureLegionUnits,
  generalForLegion,
  LEGION_RESERVE_FIELD_BY_TYPE,
} from "./legionunits.js";
import { personalityTalkIndex } from "./talk.js";
import {
  applyDisasterDamageToCity,
  normalizeDisasterMapObjectState,
  tickStrategicWeather,
} from "./weather.js";

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
      // 运行态统一使用road graph node id；原始SAVE的+0x14是node*8地址。
      // 目标城坐标是权威边界，可消除id恰为8的倍数时的歧义。
      const savedTargetCity =
        L.target ??
        (Number.isInteger(L.targetCity) ? sc.cities[L.targetCity] : null);
      const savedTargetNode = savedTargetCity
        ? savedTargetCity.idx
        : rawRoadNodeId(L.targetNode);
      if (savedTargetNode != null) L.targetNode = savedTargetNode;
      const savedCurrentNode = rawRoadNodeId(L.roadEdgeOrNode);
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
      const savedRetreatMarch = L._savedRetreatMarch;
      delete L._savedRetreatMarch;
      clearMarchNavigation(L);
      if (
        L._retreat &&
        savedRetreatMarch &&
        Array.isArray(savedRetreatMarch.points) &&
        savedRetreatMarch.points.length
      ) {
        const pointIndex = Math.max(
          0,
          Math.min(
            savedRetreatMarch.points.length,
            savedRetreatMarch.pointIndex ?? 0,
          ),
        );
        L._march = {
          targetX: savedRetreatMarch.targetX ?? L.target?.x,
          targetY: savedRetreatMarch.targetY ?? L.target?.y,
          targetNode: savedRetreatMarch.targetNode ?? L.targetNode ?? null,
          currentNode: null,
          edgeId: savedRetreatMarch.edgeId ?? null,
          stride: 0,
          toNode: savedRetreatMarch.toNode ?? null,
          points: savedRetreatMarch.points.map((point) => ({ ...point })),
          pointIndex,
        };
        L._path = L._march.points.slice(pointIndex);
      } else if (savedMarch) {
        L._march = savedMarch;
        L._path = savedMarch.points.slice(savedMarch.pointIndex);
      } else {
        // 道路图仍在异步加载时也能按E717固定node*8布局保住驻点+0x0E。
        markLegionAtRoadNode(L, savedCurrentNode);
      }
    }
    for (const L of sc.legions) {
      // SAVE军团 status bit5/+3只确认上一轮仍接触；不存在战型位。
      // 保留pending到+0B轮询到期，仿0x25CC→0x2662现场重检。
      if (L._engagement) {
        // 原始导入/新快照保留相位；兼容旧解析器已有的64B raw镜像。
        for (const [field, offset] of [
          ["moveDelay", 0x0b],
          ["movePeriod", 0x1e],
        ]) {
          if (Number.isInteger(L[field]) || typeof L.raw !== "string") continue;
          const value = Number.parseInt(
            L.raw.slice(offset * 2, offset * 2 + 2),
            16,
          );
          if (Number.isInteger(value)) L[field] = value;
        }
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
      // SAVE军团leader可能仍是武将序号；旧Web快照若只有显示名，必须
      // 在任何slot兼容处理之前按姓名恢复权威+2主将索引。
      const commander = generalForLegion(sc, L);
      if (commander) L.generalIdx = commander.idx;
      if (typeof L.leader === "number" || L.leader == null) {
        L.leader = commander?.name ?? f?.monarch ?? "？";
      }
      if (!L.x || !L.y || L.x > 380 || L.y > 256) {
        const cap = f && sc.cities[f.capital];
        if (cap) {
          L.x = cap.x;
          L.y = cap.y;
        }
      }
      if (!L._march) markLegionAtRoadNode(L, roadNodeAt(L.x, L.y)?.id);
      L.prevX = L.x;
      L.prevY = L.y;
      L._markerFrame ??= 4;
    }
    return;
  }
  sc.legions = [];
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

/**
 * 0x28F4给0x4325遗留DI=当前节点*4；状态5读取[DI+0x18]。
 * 该地址不是“目标城+0x18”通用字段，必须按实际线性别名解释。
 */
function factionRawByte(sc, faction, offset, fallback = 0) {
  if (offset === 0x18 && faction) {
    const advisor =
      faction.advisor_idx == null ? null : sc.generals?.[faction.advisor_idx];
    const advisorIncluded = advisor?.faction === faction.idx ? 1 : 0;
    return Math.max(
      0,
      Math.min(0xff, (faction.n_generals ?? 0) + advisorIncluded),
    );
  }
  if (typeof faction?.raw === "string") {
    const byte = Number.parseInt(
      faction.raw.slice(offset * 2, offset * 2 + 2),
      16,
    );
    if (Number.isFinite(byte)) return byte;
  }
  return fallback;
}

function state5AliasedByte(sc, targetCity) {
  // 0x28F4 leaves DI=targetCityIndex*0x20. State5 then reads [DI+0x18]
  // in the state segment, so the addressed byte walks faction records first,
  // then the diplomacy matrix, then city-record +0x18 values.
  const cityIndex = targetCity?.idx;
  if (!Number.isInteger(cityIndex)) return 0;
  const absolute = cityIndex * 0x20 + 0x18;
  if (absolute < 0x600) {
    const factionIndex = Math.floor(absolute / 0x40);
    const offset = absolute & 0x3f;
    const aliasedFaction = sc.factions.find(
      (candidate) => candidate?.idx === factionIndex,
    );
    return factionRawByte(sc, aliasedFaction, offset, 0xff);
  }
  if (absolute < 0x840) {
    const diplomacyOffset = absolute - 0x600;
    const row = Math.floor(diplomacyOffset / 24);
    const column = diplomacyOffset % 24;
    return sc.diplomacy?.[row]?.[column] ?? 0xff;
  }
  const aliasedCityIndex = Math.floor((absolute - 0x840) / 0x20);
  const offset = (absolute - 0x840) & 0x1f;
  if (offset !== 0x18) return 0xff;
  return cityLocalStrength(sc, sc.cities[aliasedCityIndex]);
}

function cityAttr(city) {
  // SINARIO raw[0]只有邻接方向低位；0x4028在每次据点轮询时把运行态
  // bit7/bit6重算为“存在交战邻城/存在战略目标候选”。运行态值必须优先。
  if (Number.isInteger(city?.attr)) return city.attr & 0xff;
  const raw = cityRawBytes(city);
  return raw?.[0] ?? 0;
}

function legionTargetCity(sc, legion) {
  if (legion?.target?.idx != null)
    return sc.cities.find((city) => city?.idx === legion.target.idx) ?? null;
  if (legion?.targetCity != null)
    return sc.cities.find((city) => city?.idx === legion.targetCity) ?? null;
  // 仅兼容缺少+0x20的旧Web快照；原版活动军团正常保留目标城字段。
  return (
    sc.cities.find((city) => city.x === legion?.x && city.y === legion?.y) ??
    null
  );
}

function legionFaction(sc, legion) {
  return sc.factions.find((faction) => faction?.idx === legion.faction) ?? null;
}

function legionAtTargetNode(sc, legion) {
  // 有实体目标时坐标是权威判据。道路边内的roadEdgeOrNode/currentNode
  // 仍可能保存某个端点；若目标坐标尚未抵达，不能仅因节点号相同就
  // 提前执行0x4325，否则战败撤退会在据点前清掉_retreat并永久停住。
  if (legion?.target) {
    return legion.target.x === legion.x && legion.target.y === legion.y;
  }
  if (!Number.isInteger(legion?.targetNode)) {
    return sc.cities.some((city) => city.x === legion.x && city.y === legion.y);
  }
  const currentNode =
    legion?._march?.currentNode ??
    legion?._currentNode ??
    roadNodeIdFromRaw(legion?.roadEdgeOrNode);
  return Number.isInteger(currentNode) && legion.targetNode === currentNode;
}

/**
 * KI.EXE 0x4325：只在军团到达命令目标节点时运行的12态命令机。
 * 返回 true 表示本轮已重写状态/目标，应由调用方继续按新目标处理。
 */
function legionCommandHandlerIndex(sc, legion, state = legion?.commandState) {
  if (!Number.isInteger(state)) return null;
  return state < 8 && legion.faction !== sc.player_faction ? state + 4 : state;
}

function settleArrivedLegionCommand(sc, legion, rng = null) {
  if (!legionAtTargetNode(sc, legion)) return false;
  const faction = legionFaction(sc, legion);
  if (!faction) return false;
  const fiscalCrisis = ((faction.attr ?? 0) & 0x40) !== 0;
  const targetCity = legionTargetCity(sc, legion);
  const targetAttr = cityAttr(targetCity);
  if (legion.commandState == null) return false;
  const state = legion.commandState;
  // 0x433D..0x434C：NPC 的0..7态均把表索引偏移4；玩家保留原索引。
  const handler = legionCommandHandlerIndex(sc, legion, state);

  switch (handler) {
    case 0:
    case 1:
    case 2:
    case 3: {
      // 0x4370：玩家状态0..3共用到达处理；不足600且到达首都转状态9。
      if ((legion.troops ?? 0) < 600 && targetCity?.idx === faction.capital) {
        legion.commandState = 9;
        return true;
      }
      legion.commandState = 0;
      return false;
    }
    case 4: {
      // 0x439D→0x43A5：NPC状态0只检查目标城运行态attr bit6；
      // 原版此处理器没有“低兵力到首都补员”分支。
      if ((targetAttr & 0x40) === 0) {
        legion.commandState = 1;
        return true;
      }
      return false;
    }
    case 5: {
      // 0x43AF：NPC状态1。兵力降到300及以下进入状态10；目标城
      // attr bit6置位时回0。其余按0x28F4遗留DI所指辅助byte+0x18门控。
      if ((legion.troops ?? 0) <= 300) {
        legion.commandState = 10;
        return true;
      }
      if ((targetAttr & 0x40) !== 0) {
        legion.commandState = 0;
        return true;
      }
      const aliased = state5AliasedByte(sc, targetCity);
      if (targetAttr < 0x80 || aliased > 2) {
        legion.cooldown = ((rng?.nextByte?.() ?? 0) & 7) + 1;
        legion.commandState = 2;
        return true;
      }
      // 0x43E8：别名<=2才继续检查低兵力首都补员；不满足则保持状态1。
      if ((legion.troops ?? 0) < 600 && targetCity?.idx === faction.capital) {
        legion.commandState = 9;
        return true;
      }
      return false;
    }
    case 6: {
      // 0x440F：目标城标记bit6、失活且仅余本军团时停止调动；否则从势力
      // +0x17/+0x16 两个一次性城市槽取新目标。严重财政不足跳过+0x17。
      const attr = targetAttr;
      if (
        (attr & 0x40) !== 0 ||
        (attr >= 0x80 && cityLocalStrength(sc, targetCity) <= 1)
      ) {
        legion.commandState = 1;
        return true;
      }
      let nextCityIdx = null;
      if (!fiscalCrisis && faction.strategic_city_secondary != null) {
        nextCityIdx = faction.strategic_city_secondary;
        faction.strategic_city_secondary = null;
      } else if (faction.strategic_city_primary != null) {
        nextCityIdx = faction.strategic_city_primary;
        faction.strategic_city_primary = null;
      }
      if (nextCityIdx != null) {
        const nextCity = sc.cities.find((city) => city?.idx === nextCityIdx);
        if (nextCity && nextCity.idx !== targetCity?.idx) {
          legion.target = nextCity;
          legion.targetCity = nextCity.idx;
          legion.targetNode = roadNodeAt(nextCity.x, nextCity.y)?.id ?? null;
          legion.status = (legion.status ?? 0x80) | 2;
        }
        legion.commandState = 0;
        return true;
      }
      if (attr < 0x80) {
        legion.commandState = 11;
        return true;
      }
      return false;
    }
    case 7:
      // 0x4466：任一队不足300人（原版byte<30）转状态11；六队均达标转8。
      legion.commandState = (legion.units ?? [])
        .slice(0, 6)
        .every(
          (unit) => Math.max(0, Math.floor((unit?.troops ?? 0) / 10)) >= 30,
        )
        ? 8
        : 11;
      return true;
    case 8:
      // 0x4483：状态8是士气休整，达到势力上限后回状态1。
      if ((legion.morale ?? 0) >= factionLegionMoraleCap(faction)) {
        legion.commandState = 1;
        return true;
      }
      return false;
    case 9:
      // 0x4499 的实际预备兵重编由 replenishLegionAtCapital 执行。
      return false;
    case 10: {
      // 0x44A9：状态10持续锁定首都；实际抵达后无兵力门槛转状态9。
      const capital = sc.cities[faction.capital];
      if (!capital) return false;
      if (legionTargetCity(sc, legion)?.idx !== capital.idx) {
        legion.target = capital;
        legion.targetCity = capital.idx;
        legion.targetNode = roadNodeAt(capital.x, capital.y)?.id ?? null;
        legion.commandState = 10;
        return true;
      }
      if (legionAtTargetNode(sc, legion)) {
        legion.commandState = 9;
        return true;
      }
      return false;
    }
    case 11: {
      // 0x44D6：状态11同样返回首都；到达后直接解散并把兵归还预备池。
      const capital = sc.cities[faction.capital];
      if (!capital) return false;
      if (legionTargetCity(sc, legion)?.idx !== capital.idx) {
        legion.target = capital;
        legion.targetCity = capital.idx;
        legion.targetNode = roadNodeAt(capital.x, capital.y)?.id ?? null;
        return true;
      }
      if (legionAtTargetNode(sc, legion)) {
        legion._disbandAtCapital = true;
        return true;
      }
      return false;
    }
    default:
      return false;
  }
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
    2: Math.max(0, faction.reserve_arc ?? 0),
    3: Math.max(0, faction.reserve_inf ?? 0),
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
      (general.status ?? 0) !== 0 ||
      isPlayerAdvisorGeneral(sc, general)
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
    // 0x6E8F increments faction[+0x14] for every successful formation;
    // 0x4575 may loop and form more than one legion in this same request.
    faction.n_legions =
      (Number.isInteger(faction.n_legions) ? faction.n_legions : current) + 1;
    legion.target = city;
    legion.targetCity = city.idx;
    legion.targetNode = roadNodeAt(city.x, city.y)?.id ?? null;
    formed++;
  }
  return formed;
}

function rememberFactionStrategicCity(sc, factionIdx, field, cityIndex) {
  if (factionIdx == null || factionIdx === 0x18) return;
  const faction = sc.factions?.find(
    (candidate) => candidate?.idx === factionIdx,
  );
  if (!faction || faction.active === false || faction.dead) return;
  faction[field] = cityIndex;
}

/** KI.EXE 0x3EFD→0x3F74：每次仅轮询一个据点槽。 */
export function tickStrategicCity(app, cityIndex, onRequestComplete = null) {
  if (app?._strategicCityRequest) return false;
  const sc = app?.scenario;
  const city = sc?.cities?.[cityIndex];
  if (!city) return false;
  // 0x3F11..0x3F29：运行态上次所属与当前所属不同时，把该城索引
  // 记入旧势力+0x17。
  if (city._strategicLastFaction === undefined)
    city._strategicLastFaction = city.faction;
  else if (city._strategicLastFaction !== city.faction) {
    rememberFactionStrategicCity(
      sc,
      city._strategicLastFaction,
      "strategic_city_secondary",
      city.idx,
    );
    city._strategicLastFaction = city.faction;
  }
  if (city.faction == null) return false;
  if ((city._aiCooldown ?? 0) > 0) city._aiCooldown--;
  const faction = sc.factions?.find(
    (candidate) => candidate?.idx === city.faction,
  );
  if (!faction || faction.active === false || faction.dead) return false;
  const neighbours = cityNeighbours(sc, city).filter(
    (neighbour) =>
      neighbour.faction != null && neighbour.faction !== city.faction,
  );
  // 0x3FA9：正式交战的任一邻国都会写工作行首的0xFE威胁标记并
  // 累加CH；它不要求等于势力+0x19战略目标。玩家无守军边城的TALK38
  // 因而也不能被target_faction过滤掉。
  const hostileNeighbours = neighbours.filter((neighbour) =>
    isAtWar(sc, city.faction, neighbour.faction),
  );
  const localStrength = cityLocalStrength(sc, city);
  const threatTotal = hostileNeighbours.reduce(
    (sum, neighbour) => sum + cityLocalStrength(sc, neighbour) + 1,
    0,
  );
  const targetIdx = faction.target_faction;
  // 0x4028：先保留SINARIO邻接低6位，再按本次0x3FA9工作行重算高位。
  // FE威胁记录置bit7；实际战略目标候选再置bit6。不能读取静态raw高位。
  const candidates =
    targetIdx == null || targetIdx === 0xff
      ? []
      : neighbours.filter(
          (neighbour) =>
            neighbour.faction === targetIdx &&
            isAtWar(sc, city.faction, targetIdx),
        );
  let strategicAttr = 0;
  if (candidates.length) strategicAttr = 0xc0;
  else if (hostileNeighbours.length) strategicAttr = 0x80;
  city.attr = (cityAttr(city) & 0x3f) | strategicAttr;
  if (
    hostileNeighbours.length &&
    localStrength < 1 &&
    city.faction === sc.player_faction
  ) {
    if ((city._aiCooldown ?? 0) > 0) return false;
    const rng = app.originalRng ?? app.activeBattleRng;
    const request = { scenario: sc, clock: app.clock };
    app._strategicCityRequest = request;
    app.gamebar?.syncClock?.();
    let completed = false;
    const completeRequest = () => {
      if (completed) return;
      completed = true;
      if (
        app._strategicCityRequest !== request ||
        app.scenario !== sc ||
        app.clock !== request.clock
      ) return;
      app._strategicCityRequest = null;
      // 0x40C9 waits for TALK38 to return before consuming this byte and
      // 0x4028 then calls 0x40B3. Advancing either state at enqueue time
      // would shift the shared strategic RNG during the modal hold.
      const random = rng?.nextByte?.() ?? 0;
      city._aiCooldown = 0x18 + (random & 0x0f);
      rememberFactionStrategicCity(
        sc,
        city.faction,
        "strategic_city_primary",
        city.idx,
      );
      onRequestComplete?.();
      app.gamebar?.syncClock?.();
    };
    if (!app.gamebar?.enqueueTalkMessage) {
      completeRequest();
      return true;
    }
    app.gamebar.enqueueTalkMessage({
      gen: null,
      talkIndex: 38,
      cityName: city.name?.trim?.() || "",
      kind: "reinforcement-request",
      onClose: completeRequest,
    });
    return true;
  }

  // 0x4028：没有任何交战邻城时清+857后返回。反之，空城会在
  // 0x4057选择“战略目标候选”以前直接调用40C9；因此即使+0x19
  // 暂时没有目标，AI交战空边城仍可向本城编成一支援军。
  if (!hostileNeighbours.length) {
    city._aiCooldown = 0;
    return false;
  }
  const rememberFormationRequest = () =>
    rememberFactionStrategicCity(
      sc,
      city.faction,
      "strategic_city_primary",
      city.idx,
    );
  const applyFormationCooldown = () => {
    const capital = sc.cities[faction.capital];
    city._aiCooldown = Math.min(
      0x1e,
      Math.floor(
        (Math.abs(city.x - capital.x) + Math.abs(city.y - capital.y)) / 8,
      ),
    );
  };
  if (localStrength < 1 && city.faction !== sc.player_faction) {
    // 4028 AL=1 → 40C9; 40B3 executes even when +857 suppresses 4575 or
    // formation fails, so its one-shot faction city slot must still update.
    if ((city._aiCooldown ?? 0) > 0) {
      rememberFormationRequest();
      return false;
    }
    const formed = formAiReinforcements(app, faction, city, 1);
    rememberFormationRequest();
    if (formed > 0) applyFormationCooldown();
    return formed > 0;
  }
  // 4057's weak-city/multiple-formation branch only exists for a concrete
  // target candidate; the prior empty-city 4028 path deliberately did not.
  if (targetIdx == null || targetIdx === 0xff || !candidates.length)
    return false;
  if (localStrength <= 1 && city.faction !== sc.player_faction) {
    // 407A computes CH+2-local and passes it to 40C9/4575; 40B3 still runs
    // for cooldown/capacity failures.
    if ((city._aiCooldown ?? 0) > 0) {
      rememberFormationRequest();
      return false;
    }
    const requested = Math.max(0, threatTotal + 2 - localStrength);
    const formed = formAiReinforcements(app, faction, city, requested);
    rememberFormationRequest();
    if (formed > 0) applyFormationCooldown();
    return formed > 0;
  }
  const rng = app.originalRng ?? app.activeBattleRng;
  // 0x405D..0x4073：RNG低2位按候选记录循环递减，命中时AL恒为0；
  // 因此目标下标是(raw-1) mod 候选数，raw=0会按u8下溢为255。
  const rawChoice = (rng?.nextByte?.() ?? 0) & 3;
  const target = candidates[((rawChoice || 0x100) - 1) % candidates.length];
  // 0x4099..0x4155：AL=0会先改成1，故本轮只会写一军团目标。
  // 4155以DH=本城运行态兵力-1扫描128个槽。每个同节点活动槽在
  // DH尚非0时先消费RNG；低于40h便DH--并跳过该槽，甚至还没测试
  // 委任bit。不能把这个随机筛选误写成“多支派遣时才掷骰”。
  let remaining = 1;
  let precedingLocalSlots = Math.max(0, localStrength - remaining);
  for (const legion of sc.legions.toSorted(
    (left, right) => (left.slot ?? 0x7fff) - (right.slot ?? 0x7fff),
  )) {
    if (remaining <= 0) break;
    if (
      legion.dead ||
      legion._active === false ||
      (legion.status ?? 0) < 0x80 ||
      legion.x !== city.x ||
      legion.y !== city.y
    )
      continue;
    if (precedingLocalSlots > 0 && (rng?.nextByte?.() ?? 0) < 0x40) {
      precedingLocalSlots--;
      continue;
    }
    if (!isLegionDelegated(legion) || (legion.commandState ?? 0) >= 8) continue;
    legion.target = target;
    legion.targetCity = target.idx;
    legion.targetNode = roadNodeAt(target.x, target.y)?.id ?? null;
    legion._aiOrdered = true;
    legion.commandState = 0;
    remaining--;
  }
  // 0x4099→0x4155 normal sortie only clears this city's +857. It does not
  // call 0x40B3, so it must not overwrite the formation-request city slot.
  city._aiCooldown = 0;
  return true;
}

function clearMarchNavigation(A) {
  A._march = null;
  A._path = null;
  // SAVE 的 +0A/+0C/+0E 只用于恢复当前道路边；重建导航前先清旧值，
  // 真正抵达节点后再由markLegionAtRoadNode写回新的+0x0E节点地址。
  delete A.roadStride;
  delete A.roadPointAddress;
  delete A.roadEdgeOrNode;
  delete A._currentNode;
  delete A._ptx;
  delete A._pty;
  delete A._feint;
}

function rawRoadNodeId(rawAddress) {
  const decoded = roadNodeIdFromRaw(rawAddress);
  if (decoded != null) return decoded;
  return Number.isInteger(rawAddress) &&
    rawAddress >= 0 &&
    rawAddress < 0x0800 &&
    rawAddress % 8 === 0 &&
    rawAddress / 8 < 192
    ? rawAddress / 8
    : null;
}

function markLegionAtRoadNode(legion, nodeId) {
  if (!Number.isInteger(nodeId) || nodeId < 0 || nodeId >= 192) return;
  const rawAddress = roadNodeRawAddress(nodeId) ?? nodeId * 8;
  legion._currentNode = nodeId;
  legion.roadEdgeOrNode = rawAddress;
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
  const activeMarch = legion._march
    ? {
        ...legion._march,
        points: legion._march.points?.map((point) => ({ ...point })) ?? [],
      }
    : null;
  // 0x474A/0x487B 必须读取战败瞬间的当前道路边与端点；先快照，
  // 再清普通攻击命令，避免边内战败被误判为无路而直接0x291A。
  legion._battleRoadContext = activeMarch
    ? {
        edgeId: activeMarch.edgeId,
        stride: activeMarch.stride,
        pointIndex: activeMarch.pointIndex,
        points: activeMarch.points.map((point) => ({ ...point })),
      }
    : null;
  // 0x4A7B野战胜方仍保留原+0x14/+0x20进攻目标，之后继续清除据点
  // 中剩余守军并在无军团占位时进入0x4ADE攻城。败方由0x474A覆盖
  // 撤退目标，无法继续时由0x291A清退；不能在统一战果回写中先清目标。
  if (!won) legion.target = null;
  legion._aiOrdered = false;
  // 0x474A入口先调用0x6FD2，后者在0x701D把+0x0B写为1；下一次
  // 0x25C1由1减至0后会在同一军团槽立即执行0x2662。Web在动作前
  // 检查cooldown，因此等价值必须是0，不能写8而凭空停顿多个槽。
  legion.cooldown = 0;
  legion._markerFrame = 4;
  clearEngagement(legion);
  clearMarchNavigation(legion);
  if (won && activeMarch) {
    // 0x4A7B胜方仍在原边上继续其据点命令；保留目标却丢掉当前边同样
    // 会令非节点坐标下一轮无法寻路。败方则由0x474A另写撤退导航。
    legion._march = activeMarch;
    legion._path = activeMarch.points
      .slice(activeMarch.pointIndex ?? 0)
      .map((point) => ({ ...point }));
  }
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

function retreatRouteToFriendlyCity(sc, legion) {
  if (!roadGraphReady()) return null;
  const faction = sc.factions.find(
    (candidate) => candidate.idx === legion.faction,
  );
  const capital = faction?.capital == null ? null : sc.cities[faction.capital];
  if (!capital || capital.faction !== legion.faction) return null;

  // 0x487B不是“最近己城”：它先以势力首都为最终搜索目标；军团位于道路
  // 边内时按edge+8端、edge+6端的原版顺序取第一个己方端点。0x491B对
  // 非己城市加约0x80A6巨额代价但仍展开；0x487B最终只要求即时第一跳属己。
  // roadApproachesAt按target(+8)、source(+6)排序以保留端点优先级。
  const saved = legion._battleRoadContext;
  const savedApproaches = [];
  const savedEdge = roadEdgeById(saved?.edgeId);
  if (savedEdge?.points?.length) {
    // 0x487B对结构端点固定先检查edge+8(target)，再检查edge+6(source)。
    // 战前_march.points是按行军方向排列的有向副本；stride=-4时其首尾
    // 与结构端点相反，不能再用有向数组的[last,0]猜+8/+6，否则会把
    // 城前败军的第一撤退步错误配到整条边另一端并产生几十格瞬移。
    const currentIndex = savedEdge.points.findIndex(
      (point) => point.x === legion.x && point.y === legion.y,
    );
    if (currentIndex >= 0) {
      const targetNode = roadNodeById(savedEdge.target);
      const sourceNode = roadNodeById(savedEdge.source);
      savedApproaches.push(
        {
          edgeId: savedEdge.id,
          node: targetNode,
          distance: savedEdge.points.length - currentIndex,
          points: savedEdge.points.slice(currentIndex),
          current: { x: legion.x, y: legion.y },
        },
        {
          edgeId: savedEdge.id,
          node: sourceNode,
          distance: currentIndex + 1,
          points: savedEdge.points.slice(0, currentIndex + 1).toReversed(),
          current: { x: legion.x, y: legion.y },
        },
      );
    }
  }
  const approaches = savedApproaches.length
    ? savedApproaches
    : roadApproachesAt(legion.x, legion.y);
  for (const approach of approaches) {
    const onward = findRoadRoute(
      capital.x,
      capital.y,
      approach.node.x,
      approach.node.y,
      null,
      (node) => {
        const routeCity = sc.cities.find(
          (candidate) => candidate.x === node.x && candidate.y === node.y,
        );
        return routeCity && routeCity.faction !== legion.faction ? 0x80a6 : 0;
      },
    );
    if (!onward) continue;
    const firstNodeId = onward.nodes.at(-2);
    const firstNode = roadNodeById(firstNodeId);
    const firstCity = firstNode
      ? sc.cities.find(
          (candidate) =>
            candidate.x === firstNode.x && candidate.y === firstNode.y,
        )
      : null;

    if (approach.distance === 0) {
      // 0x48E5→0x48F1：当前+0x0E是据点节点时，0x491B从首都
      // 反向搜索并返回第一条边；调用者沿该边取“当前节点的下一跳”。
      // 失陷据点已经易主，不能把当前节点本身当作己方撤退目标。
      if (!firstCity || firstCity.faction !== legion.faction) continue;
      const immediate = findRoadRoute(
        approach.node.x,
        approach.node.y,
        firstNode.x,
        firstNode.y,
      );
      if (!immediate || immediate.nodes.length !== 2) continue;
      return {
        city: firstCity,
        node: firstNode,
        edgeId: immediate.edges[0] ?? null,
        distance: immediate.distance,
        points: immediate.points,
      };
    }

    const city = sc.cities.find(
      (candidate) =>
        candidate.x === approach.node.x &&
        candidate.y === approach.node.y &&
        candidate.faction === legion.faction,
    );
    if (!city) continue;
    // 0x491B目标就是当前候选端时走0x490C特殊成功出口；否则
    // 0x48F1..0x4901要求反向搜索所得即时第一跳仍属败方势力。
    if (onward.nodes.length > 1 && firstCity?.faction !== legion.faction)
      continue;
    return {
      city,
      node: approach.node,
      edgeId: approach.edgeId ?? null,
      distance: approach.distance + onward.distance,
      points: approach.points,
    };
  }
  return null;
}

function assignRetreatRoute(legion, retreat, captorFaction) {
  legion.status = (legion.status ?? 0x80) | 0x82;
  legion._active = true;
  legion.target = retreat.city;
  legion.targetCity = retreat.city.idx;
  legion.targetNode = retreat.node?.id ?? null;
  legion.moveDelay = 1;
  // 边内战败时当前位置不是道路节点，stepRoadGraph无法从坐标重新寻路。
  // 0x487B已经给出沿当前边退到己方端点的点列，必须直接恢复为活动
  // _march；此前只写_path却把_march置空，下一tick会立即blocked并进入
  // 0x291A，或被清目标后卡成据点前不可点击的驻止标识。
  const points = (retreat.points ?? []).map((point) => ({ ...point }));
  while (points.length && points[0].x === legion.x && points[0].y === legion.y)
    points.shift();
  // 0x487B只改+0x14/+0x20/status/+0x23，不改+0x10/+0x12；败军仍由
  // 后续0x25A3→0x2662→0x2708逐个边点移动。端点节点必须由stepRoadGraph
  // 的0x27A2对应分支在下一槽切换，不能把节点中心塞进points造成整段瞬移。
  while (
    retreat.node &&
    points.length &&
    points.at(-1).x === retreat.node.x &&
    points.at(-1).y === retreat.node.y
  )
    points.pop();
  legion._march = points.length
    ? {
        targetX: retreat.city.x,
        targetY: retreat.city.y,
        targetNode: retreat.node?.id ?? null,
        currentNode: null,
        edgeId: retreat.edgeId ?? null,
        stride: 0,
        toNode: retreat.node?.id ?? null,
        points,
        pointIndex: 0,
      }
    : null;
  legion._path = points.map((point) => ({ ...point }));
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
  assignRetreatRoute(legion, retreat, null);
  const faction = sc.factions.find(
    (candidate) => candidate.idx === legion.faction,
  );
  // 0x478F：总兵<=300（3000人）必须继续退回首都补员；兵力较多时
  // 只有即时撤退据点就是首都才写10，否则写8在该据点恢复士气。
  legion.commandState =
    legion.troops <= 300 || retreat.city.idx === faction?.capital ? 10 : 8;
  return true;
}

function enqueuePostbattleFateTalk(
  app,
  general,
  oldFaction,
  captorFaction,
  outcome,
) {
  const playerFaction = app?.scenario?.player_faction;
  let talkIndex = null;
  if (outcome === "return") {
    if (oldFaction === playerFaction) talkIndex = 31;
    else if (captorFaction === playerFaction) talkIndex = 32;
  } else if (outcome === "captured") {
    if (oldFaction === playerFaction) talkIndex = 33;
    else if (captorFaction === playerFaction) talkIndex = 34;
  } else if (outcome === "eliminated" && captorFaction === playerFaction) {
    talkIndex = 67;
  }
  if (talkIndex == null) return;
  const message = {
    gen: general,
    talkIndex,
    generalName: general?.name?.trim?.() || "",
    kind: `postbattle-${outcome}`,
  };
  if (outcome === "captured") message.personalitySelector = 0x19a;
  app.gamebar?.enqueueTalkMessage?.(message);
}

function disbandLegionForReturn(sc, legion, captorFaction, app = null) {
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
  enqueuePostbattleFateTalk(
    app,
    general,
    legion.faction,
    captorFaction,
    "return",
  );
  return "return";
}

function settleCapturedGeneral(app, sc, general, oldFaction, captorFaction) {
  general.status = 4;
  general.origFaction = oldFaction;
  general.faction = captorFaction;
  if (!factionIsActive(sc, oldFaction) && general.attr & 0x10) {
    general.attr = 0;
    general.active = false;
    general.status = 0;
    general.faction = null;
    general.origFaction = null;
    enqueuePostbattleFateTalk(
      app,
      general,
      oldFaction,
      captorFaction,
      "eliminated",
    );
    return "eliminated";
  }
  if (general.attr & 0x40) {
    general.attr &= ~0x40;
    general.is_monarch = false;
    general.talk_idx = ((general.talk_idx ?? 0) + 3) & 0xff;
  }
  enqueuePostbattleFateTalk(
    app,
    general,
    oldFaction,
    captorFaction,
    "captured",
  );
  return "captured";
}

function captureOrEliminateLegion(sc, legion, captorFaction, app = null) {
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
  return settleCapturedGeneral(app, sc, general, oldFaction, captorFaction);
}

/** KI.EXE 0x291A：无法继续行动军团的延迟回归/被俘分派。 */
export function dispatchLegionFate(
  sc,
  legion,
  captorFaction,
  rng = null,
  app = null,
) {
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
    ? disbandLegionForReturn(sc, legion, captorFaction, app)
    : captureOrEliminateLegion(sc, legion, captorFaction, app);
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

/** 0x6FD2：逐读六队type字节（零兵队也参与），有效军团地址下周期为2/3。 */
function engagementRoadPeriod(legion) {
  return ensureLegionUnits(legion).every((unit) => unit.type === 1) ? 2 : 3;
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
  // 首次接触来自道路轮询，+0B已重装+1E；本槽只写12并减11，不发ID3。
  // 此处补齐接战区域的轮询相位，不把普通道路移动调度冒称已完整复刻。
  A.movePeriod = engagementRoadPeriod(A);
  A.moveDelay = A.movePeriod;
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

/**
 * 0x2708..0x275E：走过起点侧首个边点后，候选格若是0xCE..0xDD
 * 据点边界tile，先以当前edge终点调用0x2880；敌城时军团留在前一
 * 道路点建立攻城接触，不把这格写入+0x10/+0x12。
 */
function siegeApproachCity(sc, A, nav, next) {
  if (!nav || !next || (nav.pointIndex ?? 0) <= 0) return null;
  const tile = terrainTile(next.x, next.y);
  if (tile == null || tile < 0xce || tile > 0xdd) return null;
  const endpoint = roadNodeById(nav.toNode);
  return endpoint ? hostileCityAt(sc, A, endpoint.x, endpoint.y) : null;
}

function reverseBlockedFinalEdge(sc, A) {
  const nav = A._march;
  if (!nav || nav.pointIndex > nav.points.length) return false;
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
  const nav = A._march;
  const next = nav?.points?.[nav.pointIndex];
  if (next) {
    // 0x2708先查候选格军团，再查该格是否为据点边界；驻城军团位于
    // 节点中心，不会抢先成为道路野战目标。
    const foe = contactLegionAt(sc, A, next.x, next.y);
    if (foe)
      return {
        kind: ENGAGE_KIND_FIELD,
        countdown,
        target: { x: next.x, y: next.y, faction: foe.faction },
      };
    const city = siegeApproachCity(sc, A, nav, next);
    return city
      ? { kind: ENGAGE_KIND_SIEGE, countdown, target: { cityIdx: city.idx } }
      : null;
  }
  // 兼容旧Web快照中已经错误消费据点边界tile的状态；规范新状态会在
  // 候选边界格写回前由上方0x2708/0x2880分支建立接触。
  const endpoint = roadNodeById(nav?.toNode);
  const city = endpoint ? hostileCityAt(sc, A, endpoint.x, endpoint.y) : null;
  return city
    ? { kind: ENGAGE_KIND_SIEGE, countdown, target: { cityIdx: city.idx } }
    : null;
}

/** 25C1/264A：每槽倒数，只在+0B到期时重检或结算；Web音画由独立表现时钟驱动。 */
function advanceEngagement(app, A) {
  const previous = A._engagement;
  if (!previous) return false;
  // 没有raw/相位字段的旧Web快照只能沿用“下一槽重检”的兼容行为；
  // 不将该迁移入口宣称为可恢复的原版相位。新接触和原始导入均有字段。
  A.moveDelay = ((A.moveDelay ?? 1) - 1) & 0xff;
  if (A.moveDelay !== 0) {
    previous.countdown = Math.max(1, previous.countdown - 1);
    A.engagementCountdown = previous.countdown;
    return true;
  }
  A.moveDelay = A.movePeriod ?? engagementRoadPeriod(A);
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
  if (engagement.countdown > 1) {
    // 原286C/28B4会请求ID3；用户批准的Web独立音画不在规则轮询中发声。
    engagement.countdown--;
    A.engagementCountdown = engagement.countdown;
    return true;
  }

  const resolve = () => {
    // settleFieldLegion必须在clearMarchNavigation之前快照当前道路边；
    // 若先清接敌（会连同_march清空），边内败军就会在0x487B找不到
    // 即时己方端点，错误进入0x291A并显示“遭歼灭/被擒”。战果函数
    // 已负责清双方接敌/导航；这里不能再清一次，以免擦掉新撤退路线。
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
    markLegionAtRoadNode(A, roadNodeAt(A.x, A.y)?.id);
    A.prevX = A.x;
    A.prevY = A.y;
    A._markerFrame = 4;
    return "arrived";
  }
  if (!A._march) {
    clearMarchNavigation(A);
    rememberMarchBase(sc, A);
    A._march = makeMarchNavigation(sc, A, tx, ty);
    if (!A._march) return "blocked";
  } else if (A._march.targetX !== tx || A._march.targetY !== ty) {
    const targetNode = roadNodeAt(tx, ty);
    if (!targetNode) return "blocked";
    // 0x7FB7置status bit1后，0x26A0→0x47BB在当前edge上改向，但保留
    // +0x0C道路点地址：目标是edge+6端点时stride=-4，其余目标从+8
    // 端点重寻下一边并令stride=+4。不能清掉edge后从道路点跑节点寻路。
    const edge = roadEdgeById(A._march.edgeId);
    const desiredStride = edge?.source === targetNode.id ? -4 : 4;
    if (
      edge &&
      (A._march.stride === 4 || A._march.stride === -4) &&
      A._march.stride !== desiredStride
    ) {
      const reversed = reverseRoadMarchContext(A._march, A.x, A.y);
      if (!reversed) return "blocked";
      A._march = reversed;
    }
    A._march.targetX = tx;
    A._march.targetY = ty;
    A._march.targetNode = targetNode.id;
    A.targetNode = targetNode.id;
  }

  // 战败撤退可从道路边内直接恢复0x487B给出的剩余点列；该临时导航
  // 没有currentNode，但仍是同一条有效边，不能按普通节点寻路判blocked。
  const retreatEdgeTraversal = Boolean(
    A._retreat && A._march && A._march.currentNode == null,
  );
  if (!retreatEdgeTraversal && reverseBlockedFinalEdge(sc, A))
    return "reversed";
  const nav = A._march;
  const next = nav.points[nav.pointIndex];
  if (!next) {
    const endpoint = roadNodeById(nav.toNode);
    if (!endpoint) {
      clearMarchNavigation(A);
      return A.x === tx && A.y === ty ? "arrived" : "blocked";
    }
    // 0x27A2：边内点走完后切换到edge +6/+8端点节点；据点攻击由
    // 0x2880独立检测，不把节点中心伪装成下一道路点交给0x2831。
    const city = sc.cities.find(
      (candidate) => candidate.x === endpoint.x && candidate.y === endpoint.y,
    );
    if (
      city &&
      city.faction != null &&
      city.faction !== A.faction &&
      !atWar(sc, A.faction, city.faction)
    ) {
      return "reversed";
    }
    if (city && city.faction !== A.faction) {
      startEngagement(A, ENGAGE_KIND_SIEGE, { cityIdx: city.idx });
      return "contact";
    }
    A.prevX = A.x;
    A.prevY = A.y;
    A._renderMoveSerial = sc._strategicTickSerial ?? null;
    A._markerFrame = markerFrameToward(A.x, A.y, endpoint.x, endpoint.y);
    A.x = endpoint.x;
    A.y = endpoint.y;
    rememberMarchBase(sc, A);
    clearMarchNavigation(A);
    markLegionAtRoadNode(A, endpoint.id);
    if (A.x === tx && A.y === ty) {
      A.prevX = A.x;
      A.prevY = A.y;
      A._markerFrame = 4;
      return "arrived";
    }
    return "moved";
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
  const approachCity = siegeApproachCity(sc, A, nav, next);
  if (approachCity) {
    startEngagement(A, ENGAGE_KIND_SIEGE, { cityIdx: approachCity.idx });
    return "contact";
  }
  const city = hostileCityAt(sc, A, next.x, next.y);
  if (city) {
    startEngagement(A, ENGAGE_KIND_SIEGE, { cityIdx: city.idx });
    return "contact";
  }

  A.prevX = A.x;
  A.prevY = A.y;
  // 仅供Canvas插值判断这次道路单步所属的战略tick；不参与规则或存档。
  A._renderMoveSerial = sc._strategicTickSerial ?? null;
  A._markerFrame = markerFrameToward(A.x, A.y, next.x, next.y);
  A.x = next.x;
  A.y = next.y;
  nav.pointIndex++;
  A._path = nav.points.slice(nav.pointIndex);

  if (A.x === tx && A.y === ty) {
    rememberMarchBase(sc, A);
    clearMarchNavigation(A);
    markLegionAtRoadNode(A, roadNodeAt(A.x, A.y)?.id);
    A.prevX = A.x;
    A.prevY = A.y;
    A._markerFrame = 4;
    return "arrived";
  }
  // 最后一条边内点走完后仍保留edge上下文；下一次军团槽由上方
  // 0x27A2对应分支切换到+6/+8端点，并在敌城端进入0x2880。
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
  // 同道路拓扑移动：防止下一战略tick的插值从上一格倒跳。
  A._renderMoveSerial = sc._strategicTickSerial ?? null;
  A.x = next.x;
  A.y = next.y;
  rememberMarchBase(sc, A);
  if (!A._path.length) A._path = null;
  if (A.x === tx && A.y === ty) {
    clearMarchNavigation(A);
    markLegionAtRoadNode(A, roadNodeAt(A.x, A.y)?.id);
    return "arrived";
  }
  return "moved";
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
  const sc = app.scenario;
  const oldFaction = city.faction;
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
    // 0x4ED7：攻城战术层开启前先显示TALK27/28；关闭后才进入战场。
    const talkIndex = playerDefender ? 27 : 28;
    const start = () => app.startBattle(A, city, primaryDefender);
    if (app.gamebar?.enqueueTalkMessage) {
      app.gamebar.enqueueTalkMessage({
        gen: null,
        talkIndex,
        generalName: A.leader?.trim?.() || "",
        cityName: city.name?.trim?.() || "",
        onClose: start,
        kind: playerDefender ? "siege-defence-opening" : "siege-attack-opening",
      });
    } else start();
    return true;
  }
  // 0x4ED7的非战术路径没有TALK27/28；委任/AI速算直接结算。
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
      oldFaction,
    },
  );
  return false;
}

export function resolveFieldBattle(app, A, D) {
  if (!D || D.dead) return false;
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
    // 0x4E5C→0x4EB9：玩家参与的非委任野战先显示TALK29，关闭后开战场。
    const start = () => app.startFieldBattle(A, D);
    if (app.gamebar?.enqueueTalkMessage) {
      app.gamebar.enqueueTalkMessage({
        gen: null,
        talkIndex: 29,
        generalName: [A.leader?.trim?.() || "", D.leader?.trim?.() || ""],
        onClose: start,
        kind: "field-battle-opening",
      });
    } else start();
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
  if (!attackContinues) dispatchLegionFate(sc, A, D.faction, strategicRng, app);
  if (!defenceContinues)
    dispatchLegionFate(sc, D, A.faction, strategicRng, app);
  const loser = winner === "atk" ? D : A;
  // 0x6FD2在0x474A入口写+0x0B=1；成功建立撤退后，下次该军团槽
  // 即可进入0x47BB/0x2708逐点退却，不存在额外12槽停顿。
  if (loser._active !== false && loser._retreat) loser.cooldown = 0;
}

export function updateFactionAfterCityCapture(sc, factionIdx) {
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
    // 0x4DF0→0x6A3D：失陷首都不能简单换成最低城市索引；必须按
    // 据点属性/类型/生产力选择战略首都，否则0x4DA4可能沿错误方向
    // 搜索并把本有退路的同城守军送入0x291A。
    faction.capital =
      selectStrategicCapital(sc, factionIdx)?.idx ?? cities[0].idx;
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
  const captorFaction = sc._lastCapturingFaction ?? 0x18;
  // 0x4FCE→0x5074：灭亡势力的外交官立即结束任职并恢复待命。
  if (faction.diplomat_idx != null) {
    const diplomat = sc.generals?.[faction.diplomat_idx];
    if (diplomat) {
      diplomat.status = 0;
      app.gamebar?.enqueueTalkMessage?.({
        gen: diplomat,
        talkIndex: 69,
        targetName: faction.monarch?.trim?.() || "",
        generalName: diplomat.name?.trim?.() || "",
        personalitySelector: 0x1a7,
        kind: "extinction-diplomat-return",
      });
    }
    faction.diplomat_idx = null;
  }
  // 0x5000..0x5033：按武将索引固定扫描并严格按+1D/君主/+17分三路。
  for (const general of sc.generals ?? []) {
    if (!general?.active || general.faction !== factionIdx) continue;
    if (general.origFaction != null || general.captive_flag !== 0xff) {
      const origin = general.origFaction ?? general.captive_flag;
      const originFaction = sc.factions.find(
        (candidate) => candidate?.idx === origin,
      );
      general.status = 0;
      general.faction = originFaction && !originFaction.dead ? origin : null;
      general.origFaction = null;
      general.captive_flag = 0xff;
      if (general.faction === sc.player_faction) {
        app.gamebar?.enqueueTalkMessage?.({
          gen: general,
          talkIndex: 37,
          generalName: general.name?.trim?.() || "",
          personalitySelector: 0x199,
          kind: "extinction-general-return",
        });
      }
      continue;
    }
    if (general.idx !== faction.monarch_idx && (general.status ?? 0) !== 0) {
      const legion = sc.legions.find(
        (candidate) =>
          !candidate.dead &&
          (candidate.generalIdx === general.idx ||
            candidate.slot === general.idx ||
            candidate.leader === general.name),
      );
      if (legion) {
        legion.status = 0;
        legion._active = false;
        legion.dead = true;
        legion.target = null;
        clearEngagement(legion);
        clearMarchNavigation(legion);
      }
      general.status = 0;
      general.faction = null;
      continue;
    }
    // 其余走0x29C3等价的被俘/退场状态；不额外消费RNG。
    settleCapturedGeneral(app, sc, general, factionIdx, captorFaction);
    general.captive_flag = general.origFaction ?? 0xff;
  }
  app.gamebar?.enqueueTalkMessage?.({
    gen: null,
    talkIndex: 36,
    targetName: faction.monarch?.trim?.() || "",
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
  app,
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
  const retreat = retreatRouteToFriendlyCity(sc, defenders[0]);
  if (retreat) {
    const currentNode = roadNodeAt(city.x, city.y)?.id;
    for (const legion of defenders) {
      // 0x4DA4只共享目标城/节点、写+0x0B=1并置status bit1；不得复用
      // 0x474A的单败军逻辑覆盖各军团+0x23，也没有人为12槽停顿。
      clearMarchNavigation(legion);
      markLegionAtRoadNode(legion, currentNode);
      legion.status = (legion.status ?? 0x80) | 0x82;
      legion.target = retreat.city;
      legion.targetCity = retreat.city.idx;
      legion.targetNode = retreat.node?.id ?? null;
      legion.moveDelay = 1;
      legion.cooldown = 1;
      legion._battleRoadContext = null;
      legion._retreat = null;
    }
    return { retreat: defenders.length, fates: [] };
  }
  return {
    retreat: 0,
    fates: defenders.map((legion) =>
      dispatchLegionFate(sc, legion, captorFaction, rng, app),
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
    // 0x4ED7返回后攻守两个实际参战对象都各调用一次0x474A。
    // 城内主守军无论胜负都会先写状态8；只有真正破城后才由0x4DA4
    // 给战前同城组共享撤退目标，且该组函数不覆盖其余军团命令态。
    if (!continueLegionAfterBattle(sc, primaryDefender, winner === "def")) {
      dispatchLegionFate(sc, primaryDefender, A.faction, strategicRng, app);
    }
  }
  if (originalExit?.cityDamage) {
    city.growth = originalExit.cityDamage.growth;
    city.defence = originalExit.cityDamage.defence;
    city.troops = originalExit.cityDamage.troops;
    if (city.sim) city.sim.troops = originalExit.cityDamage.troops;
  } else if (wallRecords) applyTacticalSiegeCityDamage(city, wallRecords);
  const oldFaction = originalExit?.oldFaction ?? city.faction;
  const oldCapital =
    oldFaction == null
      ? null
      : sc.factions.find((faction) => faction.idx === oldFaction)?.capital;
  if (winner === "atk") {
    // 0x4CF3→0x4D63：据点内政官先结束任职并报告，再处理首都/守军/灭亡链。
    if (city.governor != null) {
      const governor = sc.generals?.[city.governor];
      if (governor) {
        governor.status = 0;
        app.gamebar?.enqueueTalkMessage?.({
          gen: governor,
          talkIndex: 68,
          cityName: city.name?.trim?.() || "",
          generalName: governor.name?.trim?.() || "",
          personalitySelector: 0x1a6,
          kind: "extinction-governor-return",
        });
      }
      city.governor = null;
    }
    // 0x4CF3 先交换据点所属，再由0x4DA4为原守方军团求共同撤退路线；
    // 否则刚失陷的城市仍会被误选为“己方最近据点”。
    city.faction = A.faction;
    const replacementCapital = updateFactionAfterCityCapture(sc, oldFaction);
    updateFactionAfterCityCapture(sc, A.faction);
    // 0x4DF0：玩家首都失陷但势力尚存时，先以TALK30报告新首都。
    if (
      oldFaction === sc.player_faction &&
      oldCapital === city.idx &&
      replacementCapital
    ) {
      app.gamebar?.enqueueTalkMessage?.({
        gen: null,
        talkIndex: 30,
        cityName: replacementCapital.name?.trim?.() || "",
        kind: "player-capital-relocated",
      });
    }
    retreatCapturedGarrison(app, sc, city, oldFaction, A.faction, strategicRng);
    // 原版先走0x4DA4处理破城守军组，随后才在无新首都时进入0x4FCE。
    if (oldFaction != null && oldFaction !== A.faction) {
      sc._lastCapturingFaction = A.faction;
      finalizeFactionExtinction(app, oldFaction);
      delete sc._lastCapturingFaction;
    }
    if (oldFaction === sc.player_faction && oldFaction !== A.faction) {
      // KI.EXE 0x4F71：玩家据点实际易主时播放0xCE7警告音并显示TALK26。
      warnSfx();
      app.gamebar?.enqueueTalkMessage?.({
        gen: generalForLegion(sc, A),
        talkIndex: 26,
        generalName: A.leader?.trim?.() || "",
        cityName: city.name?.trim?.() || "",
        kind: "player-city-fallen",
      });
    }
    // 0x51B3→0x4CF3：破城只交换归属，保留已扣损的+0x13城兵。
    A.x = city.x;
    A.y = city.y;
    A.prevX = city.x;
    A.prevY = city.y;
    clearMarchNavigation(A);
    markLegionAtRoadNode(A, roadNodeAt(city.x, city.y)?.id);
    A.target = city;
    A.targetCity = city.idx;
    A.targetNode = roadNodeAt(city.x, city.y)?.id ?? null;
    continueLegionAfterBattle(sc, A, true);
    A.cooldown = 8;
    if (oldFaction != null && oldFaction !== A.faction) {
      declareWar(sc, A.faction, oldFaction);
      // 0x30F0 为单向关系修改；破城后双方各自降低。
      decreaseRelation(sc, A.faction, oldFaction, 20);
      decreaseRelation(sc, oldFaction, A.faction, 20);
    }
    return;
  }

  if (cityTroops != null) {
    const remaining = Math.max(0, cityTroops | 0);
    if (city.sim) city.sim.troops = Math.min(city.sim.cap ?? 0xff, remaining);
    city.troops = remaining;
  }
  const continues = continueLegionAfterBattle(sc, A, false);
  if (A._retreat) A._retreat.captorFaction = oldFaction ?? 0x18;
  if (!continues)
    dispatchLegionFate(sc, A, oldFaction ?? 0x18, strategicRng, app);
  if (A._active !== false && A._retreat) A.cooldown = 0;
}

function warTalkStyle(sc, faction) {
  const monarch = sc.generals?.[faction?.monarch_idx];
  return Math.max(0, Math.min(7, monarch?.talk_idx ?? 0));
}

/** KI.EXE 0x3526：宣战消息按发起者与君主说话类型分池。 */
export function processStrategicWarEvent(app, event) {
  const sc = app.scenario;
  const aggressor = sc.factions?.find((f) => f?.idx === event.aggressor);
  if (!aggressor) return false;
  // 0x2F71→0x3526：目标0x18是空城扩张命令。非玩家势力只写战略目标，
  // 不显示宣战对白，也不修改外交矩阵；玩家事件同原版分支不写目标。
  if (event.defender === EMPTY_FACTION) {
    if (aggressor.idx !== sc.player_faction)
      aggressor.target_faction = EMPTY_FACTION;
    return true;
  }
  const defender = sc.factions?.find((f) => f?.idx === event.defender);
  if (!defender || isAtWar(sc, event.aggressor, event.defender)) return false;
  const commit = () => {
    if (isAtWar(sc, aggressor.idx, defender.idx)) return;
    // 0x3526：AI发起者写战略目标；玩家分支跳过该写入，但仍正式宣战。
    if (aggressor.idx !== sc.player_faction)
      aggressor.target_faction = defender.idx;
    // 0x35AB..0x35E8：玩家防守方不写AI目标。AI防守方在目标字节
    // >=0x24（通常FF）时直接反指发起者；已有0..0x23目标时，仅当自身
    // 战略实力低于发起者才改指。这一步发生在0x3644正式置交战之前。
    if (defender.idx !== sc.player_faction) {
      const targetByte =
        defender.target_faction == null ? 0xff : defender.target_faction & 0xff;
      if (
        targetByte >= 0x24 ||
        factionStrategicPower(defender) < factionStrategicPower(aggressor)
      )
        defender.target_faction = aggressor.idx;
    }
    declareWar(sc, aggressor.idx, defender.idx);
  };
  const monarch = sc.generals?.[aggressor.monarch_idx] ?? null;
  if (aggressor.idx === sc.player_faction) {
    // 0x2BD9→0x2EFB可以为玩家势力生成type-1。0x3526命中玩家发起者时
    // 使用CX=416（TALK486..488），与军师进言成功后的君主命令同一话池。
    const advisorName =
      sc.player_advisor?.name?.trim?.() ||
      sc.generals?.[aggressor.advisor_idx]?.name?.trim?.() ||
      "軍師";
    const targetName = defender.monarch?.trim?.() || "敵方";
    if (app.gamebar?.enqueueTalkMessage) {
      app.gamebar.enqueueTalkMessage({
        gen: monarch,
        talkIndex: 486 + warTalkStyle(sc, aggressor),
        targetName,
        advisorName,
        kind: "war-declaration",
        onClose: commit,
      });
    } else {
      commit();
    }
  } else if (defender.idx === sc.player_faction) {
    // AI→玩家：0xCE7 后先 AL=0x93/TALK63 通用报告，再由发起君主
    // 显示 CX=415→TALK 478+general[+0x1E]；第二条关闭后才提交敌对状态。
    warnSfx();
    app.gamebar?.enqueueTalkMessage?.({
      gen: null,
      talkIndex: 63,
      targetName: aggressor.monarch?.trim?.() || "敵方",
      kind: "war-declaration-report",
    });
    app.gamebar?.enqueueTalkMessage?.({
      gen: monarch,
      talkIndex: personalityTalkIndex(0x19f, monarch),
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
  const commit = () => {
    if (isAtWar(sc, aggressor.idx, defender.idx)) return;
    // 0x3526 的玩家发起分支不写 AI 专用 faction[+0x19] 战略目标。
    declareWar(sc, aggressor.idx, defender.idx);
  };
  if (app.gamebar?.enqueueTalkMessage) {
    app.gamebar.enqueueTalkMessage({
      gen: sc.generals?.[aggressor.monarch_idx] ?? null,
      talkIndex: 486 + style,
      targetName,
      advisorName,
      kind: "war-declaration",
      onClose: commit,
    });
  } else {
    commit();
  }
  return true;
}

const STRATEGIC_EVENT_PAGE_SLOTS = 64;
const STRATEGIC_EVENT_TOTAL_SLOTS = 256;

function factionByIndex(sc, factionIdx) {
  return sc.factions?.find((faction) => faction?.idx === factionIdx) ?? null;
}

function strategicEventFactionIndex(event, field) {
  const value = Number(event?.[field]);
  return Number.isInteger(value) && 0 <= value && value < 0x18 ? value : null;
}

function strategicEventGeneralIndex(event) {
  const value = Number(event?.arg0);
  return Number.isInteger(value) && 0 <= value && value < 0x7f ? value : null;
}

/** 原版事件查询0x304E：只查尚未消费的当前位置至第四页末。 */
export function hasPendingStrategicEvent(
  sc,
  type,
  { arg0 = null, arg1 = null } = {},
) {
  const slots = ensureStrategicEventSlots(sc);
  const cursor = Math.max(
    0,
    Math.min(STRATEGIC_EVENT_TOTAL_SLOTS, sc._strategicEventCursor | 0),
  );
  return slots.slice(cursor).some((event) => {
    if (event?.type !== type) return false;
    if (arg0 != null && event.arg0 !== arg0) return false;
    if (arg1 != null && event.arg1 !== arg1) return false;
    return true;
  });
}

/**
 * 0x301C：从指定延迟槽开始向四页末尾顺序寻找空4B槽。
 * type6/7生产者的BL固定0x14，因此正好排到20个事件槽后；不是20天。
 */
export function enqueueDelayedStrategicEvent(app, event, delaySlots) {
  const sc = app?.scenario;
  if (!sc) return false;
  const slots = ensureStrategicEventSlots(sc);
  const cursor = Math.max(
    0,
    Math.min(STRATEGIC_EVENT_TOTAL_SLOTS, sc._strategicEventCursor | 0),
  );
  let index = cursor + Math.max(0, Math.trunc(delaySlots) || 0);
  while (index < STRATEGIC_EVENT_TOTAL_SLOTS && slots[index]) index++;
  if (index >= STRATEGIC_EVENT_TOTAL_SLOTS) return false;
  slots[index] = structuredClone(event);
  return true;
}

function legacyStrategicEvents(sc) {
  return [
    ...(sc.pendingStrategicEvents ?? []),
    ...(sc.pendingEnvoyBudgetReports ?? []).map((report) => ({
      type: 5,
      report,
    })),
    ...(sc.pendingTruceNegotiations ?? []).map((item) => ({
      type: 6,
      arg0: item.targetFactionIdx,
    })),
    ...(sc.pendingAssistanceNegotiations ?? []).map((item) => ({
      type: 7,
      arg0: item.allyFactionIdx,
      arg1: item.targetFactionIdx,
    })),
  ];
}

function ensureStrategicEventSlots(sc) {
  if (!Array.isArray(sc.strategicEventSlots)) {
    sc.strategicEventSlots = Array(STRATEGIC_EVENT_TOTAL_SLOTS).fill(null);
    // 兼容旧Web存档：旧队列没有原版槽位地址，只能保序装入当前页。
    for (const [index, event] of legacyStrategicEvents(sc).entries()) {
      if (index >= STRATEGIC_EVENT_PAGE_SLOTS) break;
      sc.strategicEventSlots[index] = event;
    }
  }
  delete sc.pendingStrategicEvents;
  delete sc.pendingEnvoyBudgetReports;
  delete sc.pendingTruceNegotiations;
  delete sc.pendingAssistanceNegotiations;
  if (sc.strategicEventSlots.length < STRATEGIC_EVENT_TOTAL_SLOTS) {
    sc.strategicEventSlots.push(
      ...Array(
        STRATEGIC_EVENT_TOTAL_SLOTS - sc.strategicEventSlots.length,
      ).fill(null),
    );
  }
  return sc.strategicEventSlots;
}

/** 0x2BD9：事件时间轮前移一页，并把首个消费分频重设为7。 */
function beginStrategicEventMonth(sc) {
  const slots = ensureStrategicEventSlots(sc);
  sc.strategicEventSlots = slots
    .slice(STRATEGIC_EVENT_PAGE_SLOTS)
    .concat(Array(STRATEGIC_EVENT_PAGE_SLOTS).fill(null));
  sc._strategicEventCursor = 0;
  sc._strategicEventDivider = 7;
}

/** 0x2FBF：从当前消费游标加随机0..31槽开始，向后寻找当前页空槽。 */
function enqueueCurrentStrategicEvent(app, event, fixedOffset = null) {
  const sc = app.scenario;
  const slots = ensureStrategicEventSlots(sc);
  const cursor = Math.max(0, Math.min(64, sc._strategicEventCursor | 0));
  const rng = app.originalRng ?? app.activeBattleRng;
  let randomOffset = Math.max(0, Math.trunc(fixedOffset ?? 0));
  if (fixedOffset == null && rng?.nextByte)
    randomOffset = (rng.nextByte() & 0x7c) >> 2;
  let index = cursor + randomOffset;
  while (index < STRATEGIC_EVENT_PAGE_SLOTS && slots[index]) index++;
  if (index >= STRATEGIC_EVENT_PAGE_SLOTS) return false;
  slots[index] = structuredClone(event);
  return true;
}

function enqueueStrategicWarEvents(app, events) {
  const queued = [];
  for (const event of events) {
    // 0x2FB1/0x2FBF没有去重查询；相同事件可在四页时间轮中并存。
    // 即使当前页没有可用槽，随机槽字节也已在enqueueCurrent中消费。
    if (enqueueCurrentStrategicEvent(app, event)) queued.push(event);
  }
  return queued;
}

/** 新游戏 0x1B29→0x2BD9：立即改变关系，并按事件时间轮排入type-1。 */
export function initializeStrategicDiplomacy(app) {
  beginStrategicEventMonth(app.scenario);
  const capitalEvents = enqueueStrategicCapitalEvents(app);
  const warEvents = runStrategicDiplomacy(app?.scenario);
  return [...capitalEvents, ...enqueueStrategicWarEvents(app, warEvents)];
}

/** 月结 0x5358→0x5394→0x2BD9：滚动事件页、更新关系并排入type-1。 */
export function monthlyDiplomacyAI(app) {
  beginStrategicEventMonth(app.scenario);
  const capitalEvents = enqueueStrategicCapitalEvents(app);
  const warEvents = runStrategicDiplomacy(app?.scenario);
  return [...capitalEvents, ...enqueueStrategicWarEvents(app, warEvents)];
}

/** 0x2BD9→0x2D3A→0x2FB1：无战略目标势力以RNG<0x40排type8。 */
export function enqueueStrategicCapitalEvents(app) {
  const sc = app?.scenario;
  const rng = app?.originalRng ?? app?.activeBattleRng;
  if (!sc || !rng || typeof rng.nextByte !== "function") return [];
  const queued = [];
  for (const faction of (sc.factions ?? []).slice(0, 0x16)) {
    // 0x2D3A只检查原始+0x19是否为0xFF；Web的null是该值的规范化表示。
    if (!factionIsActive(sc, faction.idx) || faction.target_faction != null)
      continue;
    if (rng.nextByte() >= 0x40) continue;
    const event = { type: 8, arg0: faction.idx, arg1: 0xff, arg2: 0xff };
    // 通过门控后0x2FB1再固定消费一次RNG选择随机槽；入队失败也已消费。
    if (!enqueueCurrentStrategicEvent(app, event)) continue;
    queued.push(event);
  }
  return queued;
}

/** 0x5715→0x2FBF：月结扫描玩家据点并排入type-4内政预算。 */
/**
 * KI.EXE 0x585F→0x5940：月结扫描仍有原属(+1D)的武将并处理回归。
 * 同一个随机字节决定无动作、立即回归或延后8..23槽；延后条目是
 * `{type=9,generalIndex,0xFF,0xFF}`，并把当前所属暂置0x18。
 */
export function processMonthlyGeneralFates(app) {
  const sc = app?.scenario;
  const rng = app?.originalRng ?? app?.activeBattleRng;
  if (!sc || !rng || typeof rng.nextByte !== "function") return [];
  const queued = [];
  for (const general of (sc.generals ?? []).slice(0, 0x7f)) {
    if (!general?.active) continue;
    const origin =
      general.origFaction ??
      (general.captive_flag === 0xff ? null : general.captive_flag);
    if (origin == null) continue;

    const random = rng.nextByte();
    if (random >= 0x40) continue;
    if (random >= 0x20 && general.faction === general.join_faction) {
      general.origFaction = null;
      general.captive_flag = 0xff;
      general.status = 0;
      if (general.faction === sc.player_faction) {
        app.gamebar?.enqueueTalkMessage?.({
          gen: general,
          talkIndex: 66,
          generalName: general.name?.trim?.() || "",
          kind: "general-joined",
        });
      }
      continue;
    }

    const event = { type: 9, arg0: general.idx, arg1: 0xff, arg2: 0xff };
    if (!enqueueDelayedStrategicEvent(app, event, (random & 0x0f) + 8))
      continue;
    queued.push(event);
    if (general.faction === sc.player_faction) {
      app.gamebar?.enqueueTalkMessage?.({
        gen: general,
        talkIndex: 65,
        generalName: general.name?.trim?.() || "",
        kind: "general-fate-pending",
      });
    }
    general.faction = 0x18;
  }
  return queued;
}

export function enqueueDomesticBudgetEvents(app) {
  const sc = app?.scenario;
  if (!sc) return [];
  const queued = [];
  for (const city of sc.cities ?? []) {
    if (city?.faction !== sc.player_faction || city.governor == null) continue;
    const governor = sc.generals?.[city.governor];
    if (!governor || (governor.assignment_budget ?? 0) !== 0) continue;
    const requested =
      ((Math.max(0, 180 - (city.growth ?? 0)) +
        Math.max(0, 180 - (city.defence ?? 0)) +
        Math.max(0, (city.troops_cap ?? 0) - (city.troops ?? 0))) >>
        1) *
      50;
    const event = { type: 4, arg0: city.idx, amount: requested };
    if (enqueueCurrentStrategicEvent(app, event)) queued.push(event);
  }
  return queued;
}

/** 0x578F→0x2FBF：type-5外交预算与其它战略事件共用当前页。 */
export function enqueueEnvoyBudgetEvents(app, reports) {
  return reports.filter((report) =>
    enqueueCurrentStrategicEvent(app, { type: 5, report }),
  );
}

/** 0x53A3→0x57FE：玩家负资金达到门槛时，按好战度排type13信赖处罚。 */
function cityEventPointer(city) {
  return 0x840 + Math.max(0, Math.trunc(city?.idx ?? 0)) * 0x20;
}

function eventPointerCity(sc, event) {
  const pointer = Math.trunc(Number(event?.cityPointer));
  if (!Number.isInteger(pointer) || pointer < 0x840) return null;
  const index = (pointer - 0x840) >> 5;
  return sc.cities?.[index] ?? null;
}

/** 0x22DB/0x2286：月结只生成type11/12；效果由事件轮延后执行。 */
export function enqueueMonthlyDisasterEvents(app) {
  const sc = app?.scenario;
  const rng = app?.originalRng ?? app?.activeBattleRng;
  if (!sc || !rng || typeof rng.nextByte !== "function") return [];
  const queued = [];

  // 0x22E3..0x2305：新一轮尝试前先清旧暴雨区域的+0x15，再让
  // 16朵雨云恢复全图随机游走。强度0不会显示TALK70。
  if (sc._disasterBounds) {
    applyDisasterArea(app, 0);
    sc._disasterBounds = null;
  }

  if (rng.nextByte() & 1) {
    const selector = rng.nextByte();
    if (selector < 0xc0) {
      // 0x231A..0x2324：BH=selector、BL=0后右移三次，得到
      // selector*0x20 的城记录偏移；selector本身就是城市索引。
      const city = sc.cities?.[selector];
      if (city) {
        let allowed = true;
        const raw = cityRawBytes(city);
        const xLow = raw ? raw[8] : (city.x ?? 0) & 0xff;
        if (xLow < 0xc0) allowed = Boolean(rng.nextByte() & 1);
        if (allowed) {
          // 0x2336..0x2346先乘4，0x2FBF又把BL乘4换成事件
          // 字节地址；以4B槽计，固定起点是32,36,...,60。
          const delay = ((rng.nextByte() & 7) + 8) << 2;
          const event = { type: 11, arg0: 0, arg1: 0, arg2: 0 };
          if (enqueueCurrentStrategicEvent(app, event, delay)) {
            const minX = city.x >= 10 ? city.x - 5 : city.x;
            const minY = city.y >= 10 ? city.y - 5 : city.y;
            sc._disasterBounds = {
              minX,
              maxX: minX + 10,
              minY,
              maxY: minY + 10,
            };
            queued.push(event);
          }
        }
      }
    }
  }

  for (const city of (sc.cities ?? []).slice(0, 0xc0)) {
    const firstGate = rng.nextByte();
    if (firstGate < 0x18 && (rng.nextByte() & 0x3f) >= (city.defence ?? 0)) {
      const event = {
        type: 12,
        arg0: 1,
        cityPointer: cityEventPointer(city),
      };
      if (enqueueCurrentStrategicEvent(app, event)) queued.push(event);
      continue;
    }
    const secondGate = rng.nextByte();
    if (secondGate < 0x18 && (rng.nextByte() & 0x3f) >= (city.growth ?? 0)) {
      const event = {
        type: 12,
        arg0: 2,
        cityPointer: cityEventPointer(city),
      };
      if (enqueueCurrentStrategicEvent(app, event)) queued.push(event);
    }
  }
  return queued;
}

/** 0x53A3→0x57FE：玩家负资金达到门槛时，按好战度排type13信赖处罚。 */
export function enqueueDeficitTrustEvent(app) {
  const sc = app?.scenario;
  const faction = playerFaction(sc);
  const rng = app?.originalRng ?? app?.activeBattleRng;
  if (!sc || !faction || !rng || typeof rng.nextByte !== "function")
    return false;
  const funds = Math.trunc(Number(faction.gold ?? faction.money ?? 0));
  if (!Number.isFinite(funds) || funds >= 0) return false;
  const word = funds & 0xffff;
  if ((-word & 0xffff) < 0x27) return false;
  if ((rng.nextByte() & 0x0f) >= (faction.bellicosity ?? 0)) return false;
  return enqueueCurrentStrategicEvent(app, {
    type: 13,
    arg0: 0,
    talkIndex: 0x196,
  });
}

export function tickStrategicWarEvents(app) {
  const sc = app.scenario;
  const slots = ensureStrategicEventSlots(sc);
  const divisor = Math.trunc(sc._strategicEventDivider ?? 7) & 0xff;
  sc._strategicEventDivider = (divisor - 1) & 0xff;
  if (sc._strategicEventDivider !== 0) return false;

  const cursor = Math.max(0, sc._strategicEventCursor | 0);
  if (cursor >= STRATEGIC_EVENT_PAGE_SLOTS) return false;
  sc._strategicEventDivider = 10;
  sc._strategicEventCursor = cursor + 1;
  const event = slots[cursor];
  return event ? dispatchStrategicEvent(app, event) : false;
}

function highestPoliticsIdleGeneral(sc, factionIdx) {
  let selected = null;
  for (const general of (sc.generals ?? []).slice(0, 0x7f)) {
    if (
      !general?.active ||
      general.faction !== factionIdx ||
      (general.status ?? 0) !== 0
    )
      continue;
    if (
      !selected ||
      (general.ability?.politics ?? 0) > (selected.ability?.politics ?? 0)
    )
      selected = general;
  }
  return selected;
}

function negotiationRepresentative(sc, recipientFaction, requesterFaction) {
  const runtimeEnvoy = sc.envoys?.[recipientFaction.idx];
  const runtimeGeneral =
    runtimeEnvoy?.gen_idx == null ? null : sc.generals?.[runtimeEnvoy.gen_idx];
  if (runtimeGeneral && runtimeGeneral.active !== false) return runtimeGeneral;
  const assignedIdx =
    recipientFaction.diplomat_idx ??
    factionRawByte(sc, recipientFaction, 0x2a, 0xff);
  if (assignedIdx !== 0xff) {
    const assigned = sc.generals?.[assignedIdx];
    if (assigned && assigned.active !== false) return assigned;
  }
  return (
    highestPoliticsIdleGeneral(sc, requesterFaction.idx) ??
    sc.generals?.[requesterFaction.monarch_idx] ??
    null
  );
}

function negotiationRecipientGeneral(sc, recipientFaction) {
  const monarch = sc.generals?.[recipientFaction.monarch_idx];
  if (!monarch || monarch.active === false) return null;
  if ((monarch.status ?? 0) === 0)
    return highestPoliticsIdleGeneral(sc, recipientFaction.idx) ?? monarch;
  const legion = (sc.legions ?? []).find(
    (candidate) =>
      !candidate?.dead &&
      candidate?._active !== false &&
      candidate?.faction === recipientFaction.idx &&
      generalForLegion(sc, candidate)?.idx === monarch.idx &&
      (candidate.status ?? 0) >= 0x80,
  );
  return legion ? monarch : null;
}

/** 0x3771 + 0x36C4/0x3712：任意两势力的停战/协同谈判结果。 */
export function resolveFactionNegotiation(
  app,
  recipientFaction,
  requesterFaction,
  targetFaction = null,
  assistance = targetFaction != null,
) {
  const sc = app?.scenario;
  if (!sc || !recipientFaction || !requesterFaction) return null;
  const representative = negotiationRepresentative(
    sc,
    recipientFaction,
    requesterFaction,
  );
  const recipientGeneral = negotiationRecipientGeneral(sc, recipientFaction);
  if (!representative || !recipientGeneral) return null;

  const requesterPolitics = Math.max(
    0,
    Math.min(15, representative.ability?.politics ?? 0),
  );
  const recipientPolitics = Math.max(
    0,
    Math.min(15, recipientGeneral.ability?.politics ?? 0),
  );
  let base;
  if (recipientPolitics > requesterPolitics) base = recipientPolitics * 2;
  else if (recipientPolitics < requesterPolitics)
    base = Math.max(0, 16 - requesterPolitics) * 2;
  else {
    const rng = app.originalRng ?? app.activeBattleRng;
    base =
      ((rng?.nextByte?.() ?? 0) & 1) === 0
        ? recipientPolitics * 2
        : Math.max(0, 16 - requesterPolitics) * 2;
  }

  let outcome = 1;
  if (assistance) {
    // 0x3712：比较受邀方→请求方与受邀方→进攻目标的两格关系。
    const requesterRelation = relation(
      sc,
      recipientFaction.idx,
      requesterFaction.idx,
    );
    const targetRelation = targetFaction
      ? relation(sc, recipientFaction.idx, targetFaction.idx)
      : requesterRelation;
    if (requesterRelation < targetRelation) outcome = 2;
    const value = requesterRelation < 0x80 ? 0 : requesterRelation & 0x7f;
    if (value < (recipientFaction.bellicosity ?? 0) * 2 + 0x28) outcome = 2;
    base += Math.max(0, Math.min(60, 90 - value)) >> 1;
  } else {
    // 0x36C4：受邀方正以请求方为战略目标时必为拒绝结果。
    if (recipientFaction.target_faction === requesterFaction.idx) outcome = 2;
    const value =
      relation(sc, recipientFaction.idx, requesterFaction.idx) & 0x7f;
    const excess = Math.max(
      0,
      value - ((recipientFaction.bellicosity ?? 0) + 2),
    );
    base = Math.max(0, base + 30 - excess) >> 1;
  }
  const goldRequired = Math.max(0, base) * 1000;
  if (goldRequired === 0 && outcome < 2) outcome = 0;
  return { outcome, goldRequired };
}

/** 玩家派使者的type6/type7兼容入口。 */
export function resolveStrategicNegotiation(
  app,
  otherFaction,
  assistance,
  targetFaction = null,
) {
  const me = playerFaction(app?.scenario);
  if (!me || !otherFaction) return null;
  return resolveFactionNegotiation(
    app,
    otherFaction,
    me,
    assistance ? targetFaction : null,
    assistance,
  );
}

function releaseNegotiationPrisoners(sc, firstFactionIdx, secondFactionIdx) {
  for (const general of (sc.generals ?? []).slice(0, 0x7f)) {
    const origin =
      general?.origFaction ??
      (general?.captive_flag === 0xff ? null : general?.captive_flag);
    if (
      !general?.active ||
      !(
        (general.faction === firstFactionIdx && origin === secondFactionIdx) ||
        (general.faction === secondFactionIdx && origin === firstFactionIdx)
      )
    )
      continue;
    general.status = 0;
    general.origFaction = null;
    general.captive_flag = 0xff;
    general.faction = factionIsActive(sc, origin) ? origin : null;
  }
}

/** 0x3902：玩家选择仅在RNG<=信赖时覆盖算法结果；超额报价转结果3。 */
export function resolveIncomingDiplomacyChoice(
  app,
  result,
  choice,
  amount = 0,
) {
  const sc = app?.scenario;
  if (!sc || !result) return null;
  let selected = 0;
  if (choice === "refuse") selected = 2;
  else if (choice === "pay") selected = 1;
  const entered = Math.max(0, Math.min(30000, amount | 0));
  if (selected === 1 && entered === 0) selected = 0;
  let outcome = result.outcome;
  let goldRequired = result.goldRequired;
  const rng = app.originalRng ?? app.activeBattleRng;
  if ((rng?.nextByte?.() ?? 0xff) <= (sc.trust ?? 0)) {
    outcome = selected;
    goldRequired = entered;
    if (entered > result.goldRequired) outcome = 3;
  }
  return { outcome, goldRequired };
}

/** 0x35ED + 0x3526或0x45F8/0x4236/0x3669：提交谈判结果。 */
export function settleFactionNegotiation(
  app,
  {
    recipientFaction,
    requesterFaction,
    targetFaction = null,
    outcome,
    goldRequired = 0,
  },
) {
  const sc = app?.scenario;
  if (!sc || !recipientFaction || !requesterFaction) return false;
  if (outcome >= 2) {
    if (outcome === 3) {
      sc.trust = Math.max(0, (sc.trust ?? 0) - 30);
      app.checkTrustGameOver?.();
    }
    return false;
  }
  if (outcome === 1) {
    applyFactionFundsDelta(requesterFaction, -Math.max(0, goldRequired | 0));
    applyFactionFundsDelta(recipientFaction, Math.max(0, goldRequired | 0));
  }
  releaseNegotiationPrisoners(sc, recipientFaction.idx, requesterFaction.idx);
  if (targetFaction) {
    recipientFaction.target_faction = targetFaction.idx;
    declareWar(sc, recipientFaction.idx, targetFaction.idx);
  } else {
    if (recipientFaction.target_faction === requesterFaction.idx)
      recipientFaction.target_faction = null;
    if (requesterFaction.target_faction === recipientFaction.idx)
      requesterFaction.target_faction = null;
    for (const city of (sc.cities ?? []).slice(0, 0xc0)) {
      if (
        city.faction === recipientFaction.idx ||
        city.faction === requesterFaction.idx ||
        city.strategic_affiliation === recipientFaction.idx ||
        city.strategic_affiliation === requesterFaction.idx
      )
        city.strategic_affiliation = city.faction;
    }
    makeCeasefire(sc, recipientFaction.idx, requesterFaction.idx);
  }
  return true;
}

function dispatchIncomingAssistanceEvent(app, event) {
  const sc = app?.scenario;
  const recipientFaction = factionByIndex(
    sc,
    strategicEventFactionIndex(event, "arg0"),
  );
  const targetFaction = factionByIndex(
    sc,
    strategicEventFactionIndex(event, "arg1"),
  );
  const requesterFaction = factionByIndex(
    sc,
    strategicEventFactionIndex(event, "arg2"),
  );
  if (!recipientFaction || !targetFaction || !requesterFaction) return false;
  const result = resolveFactionNegotiation(
    app,
    recipientFaction,
    requesterFaction,
    targetFaction,
  );
  if (!result) return false;
  const settle = (choice = result.outcome, amount = result.goldRequired) =>
    settleFactionNegotiation(app, {
      recipientFaction,
      requesterFaction,
      targetFaction,
      outcome: choice,
      goldRequired: amount,
    });
  if (
    recipientFaction.idx === sc.player_faction &&
    app.gamebar?.enqueueIncomingDiplomacyRequest
  ) {
    app.gamebar.enqueueIncomingDiplomacyRequest({
      type: "incoming-assistance",
      requesterFaction,
      targetFaction,
      result,
      onResolve: settle,
    });
    return true;
  }
  if (result.outcome < 2) settle();
  return true;
}

function dispatchIncomingTruceEvent(app, event) {
  const sc = app?.scenario;
  const requesterFaction = factionByIndex(
    sc,
    strategicEventFactionIndex(event, "arg0"),
  );
  const recipientFaction = factionByIndex(
    sc,
    strategicEventFactionIndex(event, "arg1"),
  );
  if (!recipientFaction || !requesterFaction) return false;
  const result = resolveFactionNegotiation(
    app,
    recipientFaction,
    requesterFaction,
  );
  if (!result) return false;
  const settle = (choice = result.outcome, amount = result.goldRequired) =>
    settleFactionNegotiation(app, {
      recipientFaction,
      requesterFaction,
      outcome: choice,
      goldRequired: amount,
    });
  if (
    recipientFaction.idx === sc.player_faction &&
    app.gamebar?.enqueueIncomingDiplomacyRequest
  ) {
    app.gamebar.enqueueIncomingDiplomacyRequest({
      type: "incoming-truce",
      requesterFaction,
      result,
      onResolve: settle,
    });
    return true;
  }
  if (result.outcome < 2) settle();
  return true;
}

function dispatchTruceNegotiationEvent(app, event) {
  const sc = app?.scenario;
  const targetFaction = factionByIndex(
    sc,
    strategicEventFactionIndex(event, "arg0"),
  );
  const envoy = targetFaction ? sc.envoys?.[targetFaction.idx] : null;
  const envoyGeneral =
    (envoy?.gen_idx != null && sc.generals?.[envoy.gen_idx]) ||
    sc.generals?.find((general) => general?.name?.trim?.() === envoy?.name);
  if (!targetFaction || !envoy || !envoyGeneral) return false;
  app.gamebar?.showTruceNegotiationResult?.({
    targetFaction,
    envoyName: envoyGeneral.name?.trim?.() || envoy.name || "外交官",
  });
  return true;
}

function dispatchAssistanceNegotiationEvent(app, event) {
  const sc = app?.scenario;
  const allyFaction = factionByIndex(
    sc,
    strategicEventFactionIndex(event, "arg0"),
  );
  const targetFaction = factionByIndex(
    sc,
    strategicEventFactionIndex(event, "arg1"),
  );
  const envoy = allyFaction ? sc.envoys?.[allyFaction.idx] : null;
  const envoyGeneral =
    (envoy?.gen_idx != null && sc.generals?.[envoy.gen_idx]) ||
    sc.generals?.find((general) => general?.name?.trim?.() === envoy?.name);
  if (!allyFaction || !targetFaction || !envoy || !envoyGeneral) return false;
  app.gamebar?.showAssistanceNegotiationResult?.({
    allyFaction,
    targetFaction,
    envoyName: envoyGeneral.name?.trim?.() || envoy.name || "外交官",
  });
  return true;
}

function selectStrategicCapital(sc, factionIdx) {
  let selected = null;
  let preferred = false;
  for (const city of (sc.cities ?? []).slice(0, 0xc0)) {
    if (city?.faction !== factionIdx) continue;
    const raw = cityRawBytes(city);
    const cityPreferred = Boolean(raw && (raw[0] & 0x1f) === 0);
    const type = raw ? raw[0x16] & 0x0f : (city.type ?? 0) & 0x0f;
    const production = raw
      ? raw[0x0e] | (raw[0x0f] << 8)
      : Math.max(0, Number(city.prod) || 0);
    if (
      !selected ||
      (type <= selected.type &&
        production >= selected.production &&
        (!preferred || cityPreferred))
    ) {
      selected = { city, type, production };
      if (cityPreferred) preferred = true;
    }
  }
  return selected?.city ?? null;
}

function retargetLegionsFromCapital(sc, factionIdx, oldCapital, newCapital) {
  // Web运行态targetNode统一为road graph id；节点表与192城槽同序。
  // 原版0x4502比较的是cityIndex*8，只在SAVE边界换算原始地址。
  const oldNode = oldCapital;
  const newNode = newCapital;
  for (const legion of sc.legions ?? []) {
    if (
      legion?.dead ||
      legion?._active === false ||
      legion?.faction !== factionIdx
    )
      continue;
    const targetsOldCapital =
      legion.target?.idx === oldCapital || legion.targetCity === oldCapital;
    if (!targetsOldCapital) continue;
    legion.target = sc.cities[newCapital] ?? null;
    legion.targetCity = newCapital;
    // 0x452E..0x4538原样：+20由旧城改新城后，+14若等于新城节点则写旧城节点。
    // 指令流方向看似反直觉，但字段/比较次序已有地址证据，不能擅自倒置。
    if (newNode != null && legion.targetNode === newNode)
      legion.targetNode = oldNode;
    legion.status = (legion.status ?? 0) | 2;
    clearMarchNavigation(legion);
  }
}

function dispatchStrategicCapitalEvent(app, event) {
  const sc = app.scenario;
  const factionIdx = strategicEventFactionIndex(event, "arg0");
  if (factionIdx == null || factionIdx === sc.player_faction) return false;
  const faction = factionByIndex(sc, factionIdx);
  if (!factionIsActive(sc, factionIdx)) return false;
  const city = selectStrategicCapital(sc, factionIdx);
  if (!city || city.idx === faction.capital) return false;
  const oldCapital = faction.capital;
  faction.capital = city.idx;
  retargetLegionsFromCapital(sc, factionIdx, oldCapital, city.idx);
  if (faction.diplomat_idx != null) {
    const diplomat = sc.generals?.[faction.diplomat_idx] ?? null;
    app.gamebar?.enqueueTalkMessage?.({
      gen: diplomat,
      talkIndex: 57,
      targetName: faction.monarch?.trim?.() || "",
      generalName: diplomat?.name?.trim?.() || "",
      cityName: city.name?.trim?.() || "",
      personalitySelector: 0x1a4,
      kind: "capital-relocation",
    });
  }
  return true;
}

function dispatchGeneralFateEvent(app, event) {
  const sc = app.scenario;
  const generalIdx = strategicEventGeneralIndex(event);
  if (generalIdx == null) return false;
  const general = sc.generals?.[generalIdx];
  if (!general?.active) return false;

  // 0x3485→0x50D7：清+17，将+1D原属交换为FF；原属势力仍活跃才恢复。
  const origin =
    general.origFaction ??
    (general.captive_flag === 0xff ? null : general.captive_flag);
  general.status = 0;
  general.origFaction = null;
  general.captive_flag = 0xff;
  general.faction =
    origin != null && factionIsActive(sc, origin) ? origin : null;
  if (general.faction === sc.player_faction) {
    app.gamebar?.enqueueTalkMessage?.({
      gen: general,
      talkIndex: 37,
      generalName: general.name?.trim?.() || "",
      personalitySelector: 0x199,
      kind: "general-returned",
    });
  }
  return true;
}

function applyDisasterArea(app, baseStrength) {
  const sc = app.scenario;
  const bounds = sc._disasterBounds;
  if (!bounds) return false;
  let changed = false;
  for (const city of (sc.cities ?? []).slice(0, 0xc0)) {
    const centerX = bounds.minX + ((bounds.maxX - bounds.minX) >> 1);
    const centerY = bounds.minY + ((bounds.maxY - bounds.minY) >> 1);
    const distance = Math.max(
      Math.abs(city.x - centerX),
      Math.abs(city.y - centerY),
    );
    if (distance > 0x14) continue;
    const damage = Math.max(0, baseStrength - (distance >> 1));
    city.disaster_event = damage;
    if (damage > 0) changed = true;
    if (damage > 0 && city.faction === sc.player_faction) {
      app.gamebar?.enqueueTalkMessage?.({
        gen: null,
        talkIndex: 70,
        cityName: city.name?.trim?.() || "",
        kind: "disaster-area",
        sound: "warn",
      });
    }
  }
  return changed;
}

function dispatchDisasterAreaEvent(app) {
  const rng = app.originalRng ?? app.activeBattleRng;
  if (!rng || typeof rng.nextByte !== "function") return false;
  return applyDisasterArea(app, (rng.nextByte() & 0x0f) + 0x18);
}

function dispatchDisasterObjectEvent(app, event) {
  const sc = app.scenario;
  const city = eventPointerCity(sc, event);
  if (!city) return false;
  const kind = Math.max(0, Math.trunc(Number(event.arg0) || 0));
  const objectSlots = normalizeDisasterMapObjectState(sc);
  if (kind === 0) {
    city.disaster_event = 0;
    // 0x2438逐槽清flags，不压缩其余对象；同坐标的火灾/暴动全部清除。
    for (let slot = 0; slot < objectSlots.length; slot++) {
      const object = objectSlots[slot];
      if (object?.x === city.x && object?.y === city.y)
        objectSlots[slot] = null;
    }
    return true;
  }

  // 0x23FF只找DS:0x2040..0x213F的首个空槽；池满立即返回，
  // 不显示消息，也不消费伤害/移除事件的两个RNG字节。
  const freeSlot = objectSlots.findIndex((object) => !object);
  if (freeSlot < 0) return false;
  objectSlots[freeSlot] = {
    active: true,
    kind,
    group: kind,
    x: city.x,
    y: city.y,
    raw6: 1,
    raw7: 1,
    timer: 1,
    interval: 0x10,
    frame: 1,
  };

  let finalized = false;
  const finalizeDisaster = () => {
    if (finalized) return;
    finalized = true;
    try {
      const rng = app.originalRng ?? app.activeBattleRng;
      if (!rng || typeof rng.nextByte !== "function") return;
      // 0x34E5..0x3501：玩家消息返回后才依次消费伤害与移除延迟。
      city.disaster_event = (rng.nextByte() & 7) + 4;
      enqueueDelayedStrategicEvent(
        app,
        { type: 12, arg0: 0, cityPointer: cityEventPointer(city) },
        (rng.nextByte() & 7) + 6,
      );
    } finally {
      app._strategicEventPostMessageRngPending = false;
      // 0x3E11要等0x34B1完整返回后才继续本时刻势力槽，不能让其RNG
      // 越过玩家TALK71/72之后的两个灾害字节。
      if (app._factionTickDeferred) {
        app._factionTickDeferred = false;
        tickFactionStrategicState(app);
        app.hud?.refreshInfo?.();
      }
    }
  };

  if (city.faction === sc.player_faction && app.gamebar?.enqueueTalkMessage) {
    app._strategicEventPostMessageRngPending = true;
    app.gamebar.enqueueTalkMessage({
      gen: null,
      talkIndex: kind === 1 ? 71 : 72,
      cityName: city.name?.trim?.() || "",
      kind: "disaster-object",
      disasterKind: kind === 1 ? "fire" : "riot",
      sound: "warn",
      onClose: finalizeDisaster,
    });
  } else {
    finalizeDisaster();
  }
  return true;
}

function dispatchGenericTalkEvent(app, event) {
  const talkIndex = Math.trunc(Number(event?.talkIndex));
  const arg0 = Math.trunc(Number(event?.arg0));
  if (!Number.isInteger(talkIndex) || talkIndex < 0 || talkIndex >= 1023)
    return false;
  app.gamebar?.enqueueGenericTalkEvent?.({ talkIndex, arg0 });
  return true;
}

function dispatchDeficitTrustEvent(app, event) {
  const sc = app.scenario;
  const talkIndex = Math.max(0, Math.trunc(Number(event?.talkIndex) || 0));
  const commit = () => {
    sc.trust = Math.max(0, (sc.trust ?? 0) - 50);
    app.checkTrustGameOver?.();
  };
  if (app.gamebar?.enqueueStrategicMessage) {
    app.gamebar.enqueueStrategicMessage({
      gen: null,
      text: "主公前來了，看來正在盛怒之中啊！！（信賴度-50）",
      kind: "deficit-trust-penalty",
      talkIndex,
      onClose: commit,
    });
  } else {
    commit();
  }
  return true;
}

function dispatchStrategicEvent(app, event) {
  if (event?.type === 1) return processStrategicWarEvent(app, event);
  if (event?.type === 2) return dispatchIncomingAssistanceEvent(app, event);
  if (event?.type === 3) return dispatchIncomingTruceEvent(app, event);
  if (event?.type === 4) {
    const cityIdx = Number(event.arg0);
    if (!Number.isInteger(cityIdx) || !app.scenario?.cities?.[cityIdx])
      return false;
    const city = app.scenario.cities[cityIdx];
    if (city.governor == null) return false;
    app.gamebar?.enqueueDomesticBudgetReport?.({
      cityIdx,
      requested: Math.max(0, Number(event.amount) || 0),
    });
    return true;
  }
  if (event?.type === 5) {
    app.gamebar?.enqueueEnvoyBudgetReport?.(event.report);
    return true;
  }
  if (event?.type === 6) return dispatchTruceNegotiationEvent(app, event);
  if (event?.type === 7) return dispatchAssistanceNegotiationEvent(app, event);
  if (event?.type === 8) return dispatchStrategicCapitalEvent(app, event);
  if (event?.type === 9) return dispatchGeneralFateEvent(app, event);
  if (event?.type === 10) return dispatchGenericTalkEvent(app, event);
  if (event?.type === 11) return dispatchDisasterAreaEvent(app, event);
  if (event?.type === 12) return dispatchDisasterObjectEvent(app, event);
  if (event?.type === 13) return dispatchDeficitTrustEvent(app, event);
  // 其余类型的处理器地址已定位，但参数与产品回调未全部闭合。
  // 事件槽仍按原版时间轮消费，不能用错误的Web替代逻辑重复执行。
  return false;
}

/**
 * KI.EXE 0x3E11：每游戏时刻固定轮转一个势力槽。
 * 顺序为财政危机门控→0x3E65预备兵维护费累计→0x3E8E外交官维护；
 * 目标选择不在这里，而在0x2BD9月度/开局候选和随后type-1事件。
 */
export function tickFactionStrategicState(app) {
  if (app?._strategicEventPostMessageRngPending) {
    app._factionTickDeferred = true;
    return false;
  }
  const sc = app?.scenario;
  if (!sc) return false;
  const factions = sc.factions ?? [];
  const cursor = Math.max(0, sc._factionTickCursor | 0) % 22;
  sc._factionTickCursor = (cursor + 1) % 22;
  const current = factions.find((faction) => faction?.idx === cursor);
  if (!current) return false;
  const changed = updateFactionFiscalCrisis(current);
  current.monthly_reserve_upkeep = Math.min(
    655000,
    Math.max(0, Math.trunc(current.monthly_reserve_upkeep ?? 0)) +
      factionReserveUpkeepTick(current),
  );
  return tickEnvoyDiplomacy(app, current) || changed;
}

/** 0x3E8E：处理已经由0x3E11选定的一个势力槽。 */
export function tickEnvoyDiplomacy(app, current = null) {
  const sc = app?.scenario;
  const rng = app?.originalRng ?? app?.activeBattleRng;
  if (!sc || !rng?.nextByte) return false;
  if (!current) {
    const cursor = Math.max(0, sc._envoyDiplomacyCursor | 0) % 22;
    sc._envoyDiplomacyCursor = (cursor + 1) % 22;
    current = (sc.factions ?? []).find((faction) => faction?.idx === cursor);
    if (!current) return false;
  }
  const envoy = sc.envoys?.[current.idx];
  const generalIdx = current.diplomat_idx ?? envoy?.gen_idx;
  if (generalIdx == null) return false;
  // 0x3E96..0x3EAA：有外交官时先消费第一次RNG，再检查武将+0x1A预算。
  // 预算为0也不能把这次随机消费提前短路掉，否则后续全局随机流会错位。
  if (rng.nextByte() >= 0x20) return false;
  const general =
    sc.generals?.[generalIdx] ||
    sc.generals?.find((g) => g?.name?.trim?.() === envoy?.name?.trim?.());
  if (!general) return false;
  const budget = general.assignment_budget ?? envoy?.budget ?? 0;
  if (budget <= 0) return false;
  const politics = Math.max(0, Math.min(15, general.ability?.politics ?? 0));
  const spend = Math.max(0, 23 - politics);
  const remaining = Math.max(0, budget - spend);
  general.assignment_budget = remaining;
  if (envoy) envoy.budget = remaining;
  if ((rng.nextByte() & 0x0f) > politics) return false;
  const playerIdx = sc.player_faction;
  increaseRelation(sc, current.idx, playerIdx, 1);
  if (
    relation(sc, current.idx, playerIdx) > relation(sc, playerIdx, current.idx)
  )
    increaseRelation(sc, playerIdx, current.idx, 1);
  return true;
}

// 月结AI只清理已退场军团；俘虏/流散去向由0x29C3/0x4FCE/0x585F事件链处理。
export function monthlyAI(app) {
  const sc = app.scenario;
  if (!sc) return;
  // 势力灭亡由最后据点易主的0x4CF3→0x4FCE同轮处理；月结不得补扫或
  // 随机改投，否则会改变TALK36、武将去向和其它势力目标清理的顺序。
  // 产品决定：玩家统一天下后继续停留在战略地图，不触发D7END通关过场。
  sc.legions = sc.legions.filter((legion) => !legion.dead);
}

// 单城成长 — KI.EXE 0x3EFD 每次处理一个城槽后立即调用0x4194/0x4269。
function tickStrategicCityDaily(sc, cityIndex, rng) {
  if (!rng?.nextByte)
    throw new TypeError("strategic city tick requires canonical original RNG");
  const c = sc.cities?.[cityIndex];
  if (!c) return;

  // KI.EXE 0x4194：AI与中立城固定8/4；只有玩家城会读取内政官。
  // 玩家内政官的+0x1A预算非零时先扣1，本轮仍按政治与武术获得加成。
  const isPlayer = c.faction === sc.player_faction;
  let cl = isPlayer ? 5 : 8;
  let dl = isPlayer ? 1 : 4;
  if (isPlayer && c.governor != null) {
    const gen = sc.generals?.[c.governor];
    if (gen && (gen.assignment_budget ?? 0) > 0) {
      gen.assignment_budget = Math.max(0, (gen.assignment_budget | 0) - 1);
      cl += gen.ability?.politics ?? 0;
      // 0x41C6读取general[+0x11]武术，不是+0x12统率。
      dl = (1 + (gen.ability?.force ?? 0)) >> 1;
    }
  }

  const ch = cl > 15 ? cl - 15 : 1;

  // 0x41D5..0x4207：无论数值是否已满，前两次RNG固定消费。
  if ((rng.nextByte() & 0x0f) <= cl) {
    c.growth = Math.min(200, (c.growth ?? 100) + ch);
  }
  if ((rng.nextByte() & 0x0f) <= cl) {
    const disInc = (ch >> 1) + 1;
    c.defence = Math.min(200, (c.defence ?? 100) + disInc);
  }

  // 仅城兵未满时消费第三次RNG；成功补兵同时按dl扣减上升率。
  const maxTroops = c.troops_cap ?? 200;
  const curTroops = c.troops ?? 0;
  if (curTroops < maxTroops && rng.nextByte() < 0x18) {
    c.growth = Math.max(0, (c.growth ?? 0) - dl);
    c.troops = Math.min(maxTroops, Math.min(0xff, curTroops + dl));
  }

  // 0x3F5A先治理，0x3F5D再无条件调用0x4269；+0x15在下月清除前
  // 每次轮到该城都会重复消耗防灾，并在防灾不足时同步破坏其它字段。
  applyDisasterDamageToCity(c);
}

/** 兼容测试/工具的全城批处理入口；产品主循环使用单城tick。 */
export function cityDaily(sc, rng) {
  for (let cityIndex = 0; cityIndex < sc.cities.length; cityIndex++) {
    tickStrategicCityDaily(sc, cityIndex, rng);
  }
}

function legionOnRoadEdge(legion) {
  // KI.EXE 0x2609 只比较 legion[+0x0E] 是否 >=0x0800。
  // Web 运行态优先读取已恢复/已建立的 edgeId；旧快照保留原始地址时直接比较。
  if (legion?._march?.edgeId != null) return true;
  const raw = Number(legion?.roadEdgeOrNode);
  return Number.isFinite(raw) && raw >= 0x0800;
}

/**
 * KI.EXE 0x4370..0x4398→状态9→0x4499→0x461D/0x4717/0x4698→0x6FD2：
 * 军团在本势力首都且总兵<600时，按六队兵种从三预备兵池补到每队最多100。
 * 原版先把各队当前兵并回对应池，再按同兵种队数平均重分；等价于同兵种池内重编。
 */
export function replenishLegionAtCapital(sc, legion, force = false) {
  if (
    !sc?.factions ||
    !sc?.cities ||
    !legion ||
    legion.dead ||
    legion._active === false ||
    legion.faction == null ||
    (legion.target &&
      (legion.target.x !== legion.x || legion.target.y !== legion.y)) ||
    (!force && (legion.troops ?? 0) >= 600)
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

/**
 * 战术层/委任过渡异步返回后，按0x1D0B原顺序补做被暂停的0x2600与0x2459。
 * 战术与战略雨云共用canonical RNG，所以雨云必须等战术回写新RNG后再推进。
 */
export function finishDeferredLegionDaily(app) {
  if (!app) return false;
  let changed = false;
  if (app._legionDailySettlementDeferred) {
    app._legionDailySettlementDeferred = false;
    const processedSlots = app._legionDailySettlementSlots ?? null;
    app._legionDailySettlementSlots = null;
    settleLegionDaily(app.scenario, processedSlots);
    changed = true;
  }
  if (app._strategicWeatherTickDeferred) {
    app._strategicWeatherTickDeferred = false;
    changed =
      tickStrategicWeather(
        app.scenario,
        app.originalRng ?? app.activeBattleRng,
      ) || changed;
  }
  return changed;
}

export function aiTick(app, options = {}) {
  if (app._strategicCityRequest) return;
  if (app.battleView?.active || app.engageTransition?.active) return;
  if (!app.scenario?.legions) return;
  // KI 3F57 returns from military/TALK38 before 3F5A governance. Preserve
  // this update's options; never rerun its city phase or advance cursors twice.
  const update = { ...options };
  let resumed = false;
  const resume = () => {
    if (resumed) return;
    resumed = true;
    finishStrategicCityUpdate(app, update);
  };
  if (Number.isInteger(update.cityIndex)) {
    tickStrategicCity(app, update.cityIndex, resume);
    if (app._strategicCityRequest) return;
  }
  resume();
}

function finishStrategicCityUpdate(app, options) {
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
    tickStrategicCityDaily(
      sc,
      options.cityIndex,
      app.originalRng ?? app.activeBattleRng,
    );
  } else if (options.runCityDaily !== false) {
    cityDaily(sc, app.originalRng ?? app.activeBattleRng);
  }
  let replenished = false;
  const legionsInSlotOrder = sc.legions
    .filter(shouldProcessLegion)
    .toSorted(
      (left, right) =>
        (left.slot ?? left._runtimeId ?? 0x7fff) -
        (right.slot ?? right._runtimeId ?? 0x7fff),
    );
  const stateRng = app.originalRng ?? app.activeBattleRng;
  const settledCommandLegions = new Set();
  for (const legion of legionsInSlotOrder) {
    // Web运行态的_retreat只标记强制道路行进；抵达0x474A指定的即时
    // 据点后清除此包装，但保留原版+0x20目标与+0x23状态给0x4325处理。
    if (legion._retreat && legion.target && legionAtTargetNode(sc, legion)) {
      legion._retreat = null;
    }
    const commandStateAtDispatch = legion.commandState;
    const commandHandlerAtDispatch = legionCommandHandlerIndex(
      sc,
      legion,
      commandStateAtDispatch,
    );
    if (
      !legion.dead &&
      legion._active !== false &&
      commandStateAtDispatch != null &&
      legionAtTargetNode(sc, legion)
    ) {
      settleArrivedLegionCommand(sc, legion, stateRng);
      // 0x2662在调用0x4325后无条件ret；即使状态处理器只观察而未改写，
      // 该槽本轮也不会继续进入普通道路移动。
      settledCommandLegions.add(legion);
    }
    if (legion._disbandAtCapital) {
      legion._disbandAtCapital = false;
      const faction = legionFaction(sc, legion);
      if (faction) {
        const units = ensureLegionUnits(legion);
        for (const unit of units) {
          const field = LEGION_RESERVE_FIELD_BY_TYPE[unit?.type | 0];
          if (!field) continue;
          faction[field] = Math.min(
            0xffdc,
            Math.max(0, Math.trunc(Number(faction[field]) || 0)) +
              Math.max(0, Math.floor((unit.troops ?? 0) / 10)),
          );
        }
        faction.n_legions = Math.max(0, (faction.n_legions ?? 1) - 1);
      }
      const general = generalForLegion(sc, legion);
      if (general) general.status = 0;
      legion.status = 0;
      legion._active = false;
      legion.dead = true;
      legion.target = null;
      clearEngagement(legion);
      clearMarchNavigation(legion);
      replenished = true;
      continue;
    }
    const targetCity = legionTargetCity(sc, legion);
    const atCapital =
      legionAtTargetNode(sc, legion) &&
      (targetCity?.idx ??
        sc.cities.find((city) => city.x === legion.x && city.y === legion.y)
          ?.idx) === legionFaction(sc, legion)?.capital;
    if (commandHandlerAtDispatch === 9 && settledCommandLegions.has(legion)) {
      // 0x4499被0x4325分派后无条件执行重编并转状态3；它本身不另查首都。
      // 即使预备池不足、兵数未变化也不能停留；状态10新转9要等下一槽。
      replenished = replenishLegionAtCapital(sc, legion, true) || replenished;
      legion.commandState = 3;
      legion.cooldown = 8;
    } else if (
      commandStateAtDispatch == null &&
      atCapital &&
      replenishLegionAtCapital(sc, legion)
    ) {
      // 兼容无命令态旧快照；原版活动军团应有明确的+0x23状态。
      legion.commandState = 3;
      legion.cooldown = 8;
      replenished = true;
    }
  }
  // 0x3E11 在0x1D8E时刻进位时由主调度器调用，不属于每次0x1D0B主更新。
  // 无显式分批的旧工具调用仍可通过runFactionTick:true请求一次。
  if (options.runFactionTick === true) tickEnvoyDiplomacy(app);
  let changed =
    replenished ||
    (options.runFactionTick === true && tickStrategicWarEvents(app));
  for (const item of tickDelayedLegionReturns(sc, processedSlots)) {
    changed = true;
    if (item.faction === sc.player_faction) {
      const general = sc.generals?.[item.generalIdx] ?? null;
      app.gamebar?.enqueueTalkMessage?.({
        gen: general,
        talkIndex: 35,
        generalName: general?.name?.trim?.() || item.leader || "",
        personalitySelector: 0x198,
        kind: "postbattle-general-return",
      });
    }
  }
  for (const A of sc.legions) {
    if (!shouldProcessLegion(A) || A.dead || A.faction == null) continue;
    if (A.prevX === A.x && A.prevY === A.y) continue;
    A.prevX = A.x;
    A.prevY = A.y;
  }
  for (const A of legionsInSlotOrder) {
    if (
      !shouldProcessLegion(A) ||
      A.dead ||
      A._active === false ||
      A.faction == null
    )
      continue;
    // 0x25CC→0x2662：到达节点的0x4325命令处理就是该槽本轮动作；
    // 新写入的等待计时、状态或目标不得在同一Web循环再次递减/移动。
    if (settledCommandLegions.has(A)) continue;
    if (A._retreat && A.target) {
      if (A.cooldown > 0) {
        A.cooldown--;
        continue;
      }
      const retreatResult = stepTo(sc, A, A.target.x, A.target.y);
      if (retreatResult === "blocked") {
        const fateRng = app.originalRng ?? app.activeBattleRng;
        dispatchLegionFate(
          sc,
          A,
          A._retreat.captorFaction ?? A.faction,
          fateRng,
          app,
        );
        changed = true;
      } else if (retreatResult === "arrived") {
        // 0x474A已写好的目标城与状态8/10必须保留：状态8在即时据点
        // 休整；状态10下一次0x4325会继续锁定首都。清目标会令少兵败军
        // 永久停成无目标圆点，并绕过首都补员/状态11解散链。
        A._retreat = null;
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
        app._strategicWeatherTickDeferred = true;
        return;
      }
      if (A._engagement || A.dead) continue;
      // 接敌若在本轮完成战果，0x2831/0x4A7B返回后该军团槽立即结束；
      // 胜方虽保留原据点目标，也必须等下一次槽调度再清守军或攻城。
      if (battleOpened) {
        changed = true;
        continue;
      }
      // 0x264A：仅接触对象消失、没有发生战果时，才可同轮继续移动。
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
            isAtWar(sc, A.faction, orderedTarget.faction))
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
            app._strategicWeatherTickDeferred = true;
            return;
          }
          changed = true;
        }
        // 同步速算可能已由0x474A写入撤退目标；不得再用旧攻击目标清掉。
        if (A.target !== orderedTarget) {
          A.cooldown = Math.max(A.cooldown ?? 0, 6);
          continue;
        }
        // 0x2662抵达后保留+0x14/+0x20；显式命令态要在下一槽交给
        // 0x4325处理（尤其状态10补员、状态11解散）。仅兼容无状态旧快照。
        if (A.commandState == null) A.target = null;
        A.cooldown = 6;
      }
      continue;
    }
    // 没有目标命令时必须驻止。原版0x2662只沿+0x14目标推进；新目标只由
    // 0x3EFD据点AI→0x4155或0x4325状态机写入。此前通用scanThreat会令
    // 委任驻军主动走出据点迎击相邻敌军，导致0x4C72攻城时找不到真实守军。
    if (!A.target) continue;
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
      const orderedTarget = A.target;
      // 中途易主或停战后不攻；只有正式交战目标才能进入战斗。
      if (
        orderedTarget.faction == null ||
        isAtWar(sc, A.faction, orderedTarget.faction)
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
          app._strategicWeatherTickDeferred = true;
          return; // ★交互战斗已开启, 结算延至战果回写后
        }
        changed = true;
      }
      // 原版抵达保留+0x14/+0x20，下一槽才执行0x4325。同步战果若已
      // 换成撤退目标更不能清；这里只兼容没有+0x23的旧Web快照。
      if (A.target === orderedTarget && A.commandState == null) A.target = null;
      A.cooldown = Math.max(A.cooldown ?? 0, 6);
    }
  }
  // 0x25A3 单槽顺序为0x2662→0x2600：按本轮移动、到达和同步战果后的状态结算。
  if (shouldSettleDaily) settleLegionDaily(sc, processedSlots);
  // 0x1D19→0x2459严格在军团槽之后；雨云移动在每16次战略更新消费RNG。
  changed = tickStrategicWeather(sc, stateRng) || changed;
  sc.legions = sc.legions.filter((A) => !A.dead);
  if (changed) {
    app.hud?.buildLegend?.();
    app.view?.draw(); // 只在版图变化时重绘 (主循环不逐帧画)
  }
}
