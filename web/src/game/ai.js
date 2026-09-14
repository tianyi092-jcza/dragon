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
import { isPlayerAdvisorGeneral, playerFaction } from "./playerqueries.js";
import { cityRawBytes, factionRawByte } from "./legacyrecords.js";
import { countLegionActivation, countLegionRemoval } from "./legioncounts.js";
import { findPath, terrainTile } from "./pathfind.js";
import {
  findRoadRoute,
  reverseRoadMarchContext,
  roadApproachesAt,
  roadEdgeById,
  roadEdgeRawAddress,
  roadPointRawAddress,
  roadGraphReady,
  roadNodeAt,
  roadNodeById,
  roadNodeIdFromRaw,
  roadNodeRawAddress,
  restoreRoadMarchContext,
  serializeRoadMarchContext,
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
import { LegionSlotBatch } from "./legionscheduler.js";
import { captureLegionContinuation } from "./legioncontinuation.js";
import { holdFailedStrategicUpdate } from "./strategicfailure.js";
import {
  bindLegionSlotCounter,
  bindLegionReturnCounter,
  projectEngagementCounter,
  legionSlotCounter,
  resetLegionActionPhase,
  finishLegionSlotTail,
} from "./legionphase.js";
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

// 已核五库20章 SINARIO 含全零军团表；新游戏没有初始活动军团（全链P24）。
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
  bindLegionSlotCounter(sc, legion);
  legion._runtimeId = nextRuntimeLegionId(sc);
  return legion;
}

export function buildArmies(sc) {
  sc._nextRuntimeLegionId = 0;
  for (const record of sc.delayedLegionReturns ?? []) {
    bindLegionReturnCounter(sc, record);
  }
  // ★只归一化真实运行时军团数据（SAVE 槽文件 0x22C0 区）。
  // parse_sinario.py 明确输出 legions=[]；新游戏不得在首都合成占位军团。
  if (sc.legions && sc.legions.length) {
    for (const L of sc.legions) {
      const faction = sc.factions.find(
        (candidate) => candidate.idx === L.faction,
      );
      L.morale ??= factionLegionMoraleCap(faction);
      ensureLegionUnits(L);
      attachRuntimeLegion(sc, L, L.slot ?? L.idx);
      // 旧 Web snapshot 可能只有 delegated 布尔值；必须先迁移，再补默认 status。
      isLegionDelegated(L);
      L._active = L.status >= 0x80;
      // Rebind the Web entity reference without recreating original fields.
      // Explicit road fields are retained; invalid ones are not a new route.
      if (L.target && L.target.idx != null)
        L.target = sc.cities[L.target.idx] ?? null;
      else if (L.target) L.target = null;
      // Runtime targetNode is a graph id. Do not reinterpret multiples of 8
      // as DOS addresses, or overwrite independent 14 from targetCity (20).
      // 4502..4547 can leave 14 != 20; preserve the known value, including 0.
      // Missing fields / legacy DOS conversion require their own input contract.
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
      // Fixed-slot +03 and named +0B/+1E are already restored. Neither
      // stale raw input nor a presentation object may reset those bytes.
      if (L._engagement) projectEngagementCounter(L);
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
      // An explicit 0E survives reconstruction, including node zero. A
      // coordinate-derived cache must not overwrite a saved edge or node.
      if (L.roadEdgeOrNode == null)
        markLegionAtRoadNode(L, roadNodeAt(L.x, L.y)?.id);
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
  // 2662 cannot enter the node command branch while authoritative 0E is an edge.
  if (
    Number.isInteger(legion?.roadEdgeOrNode) &&
    legion.roadEdgeOrNode >= 0x800
  )
    return false;
  // Remaining Web target binding: an entity target still uses coordinates.
  // This is NOT the complete original 0E==14 contract; reconciling 14/20
  // and its callers remains pending (march notes §5.5).
  if (legion?.target) {
    return legion.target.x === legion.x && legion.target.y === legion.y;
  }
  if (!Number.isInteger(legion?.targetNode)) {
    return sc.cities.some((city) => city.x === legion.x && city.y === legion.y);
  }
  const currentNode =
    rawRoadNodeId(legion?.roadEdgeOrNode) ??
    legion?._currentNode ??
    legion?._march?.currentNode;
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

export function settleArrivedLegionCommand(sc, legion, rng = null) {
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
        if (!rng?.nextByte)
          throw new TypeError("legion command requires canonical RNG");
        legion.moveDelay = (rng.nextByte() & 7) + 1;
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
    countLegionActivation(sc, legion); // 6EB6→6F26, before 461D/6FD2.
    sc.legions.push(legion);
    general.status = 1;
    replenishLegionAtCapital(sc, legion);
    resetLegionActionPhase(legion); // 6EBC→6FD2, including no-change output.
    // 6EC4 returns success: there is no post-6FD2 zero-total rollback.
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
  // 3FFF只累加非中立敌邻城的+18；候选记录另存的+1不进入CH。
  // cityLocalStrength的即时计数仍是待移植的占格缓存寿命差异，见AI逆向笔记。
  const threatTotal = hostileNeighbours.reduce(
    (sum, neighbour) =>
      neighbour.faction === 0x18
        ? sum
        : (sum + cityLocalStrength(sc, neighbour)) & 0xff,
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
      )
        return;
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
        // 4137实指令第二项也减首都X，不可按直觉改为Y。
        (Math.abs(city.x - capital.x) + Math.abs(city.y - capital.x)) / 8,
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
  const rng = app.originalRng ?? app.activeBattleRng;
  // 405D先消费候选选择RNG；4073之后才判断弱城、冷却和玩家分支。
  const rawChoice = (rng?.nextByte?.() ?? 0) & 3;
  // 此取模只认证1..3候选/明确哨兵；四候选填满的原始栈边界仍未知。
  // 完整差异及来源：docs/re-notes-npc-strategy.md §6，不能视作全AI等价。
  const target = candidates[((rawChoice || 0x100) - 1) % candidates.length];
  if (localStrength <= 1) {
    // 407A byte ADD后SUB/JBE；408F令玩家弱城直接返回，不落入出击。
    const requested = ((threatTotal + 2) & 0xff) - localStrength;
    if (requested <= 0 || city.faction === sc.player_faction) return false;
    // 40B3仍在40C9冷却/编成失败后执行。
    if ((city._aiCooldown ?? 0) > 0) {
      rememberFormationRequest();
      return false;
    }
    const formed = formAiReinforcements(app, faction, city, requested);
    rememberFormationRequest();
    if (formed > 0) applyFormationCooldown();
    return formed > 0;
  }
  // 0x4099..0x4155：AL=0会先改成1，本轮只有一次机会（未必写目标）。
  // 4155以DH=本城占格缓存-1按40h扫描，无显式槽上界。每个同节点活动槽在
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
    if (isLegionDelegated(legion) && (legion.commandState ?? 0) < 8) {
      legion.target = target;
      legion.targetCity = target.idx;
      legion.targetNode = roadNodeAt(target.x, target.y)?.id ?? null;
      legion._aiOrdered = true;
      legion.commandState = 0;
    }
    // 418A：非随机跳过的匹配槽即使资格不符，也消耗唯一DL机会。
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
  // Invalidate projections, NOT original fields. 27B5 writes the new 0E
  // without clearing 0A/0C; capture/extinction also must retain known residue.
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
  legion._markerFrame = 4;
  clearEngagement(legion);
  // Do not erase +0E here: a failed continuation still reaches this
  // entered slot's 2600 with the original road/node and surviving troops.
  if (won && activeMarch) {
    // 0x4A7B胜方仍在原边上继续其据点命令；保留目标却丢掉当前边同样
    // 会令非节点坐标下一轮无法寻路。败方也保留当前边，仅改即时退点。
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
  legion.status |= 0x02;
  legion.target = retreat.city;
  legion.targetCity = retreat.city.idx;
  legion.targetNode = retreat.node?.id ?? null;
  // 474E→6FD2 already wrote +0B=1. 4780/4789/478C change only the
  // destination and bit1: preserve the CURRENT +0A/+0C/+0E, not a new
  // stride=0 retreat path. The next due 26A5→47BB chooses direction.
  // In particular, this battle's 2600 and snapshot still read the old edge.
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
  // 474E→6FD2 writes the action phase BEFORE either failure gate.
  ensureLegionUnits(legion);
  resetLegionActionPhase(legion);
  const units = legion.units;
  const firstUnit = Math.floor((units[0]?.troops ?? legion.troops * 10) / 10);
  if ((legion.morale ?? 0) === 0 || firstUnit === 0) return false;

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
  bindLegionReturnCounter(sc, legion);
  sc.delayedLegionReturns = (sc.delayedLegionReturns ?? []).filter(
    (record) => record.slot !== legion.slot,
  );
  sc.delayedLegionReturns.push(legion);
  // 2990/2993 only write status=08 and +03=48. Keep this SAME record
  // for a current active slot tail and for the original captured BP list.
  legion.status = 8;
  legion.engagementCountdown = 0x30;
  countLegionRemoval(sc, legion); // 2997→4689, after the status/03 writes.
  legion._active = false;
  legion.dead = true;
  legion._retreat = null;
  legion._markerFrame = 4;
  clearEngagement(legion);
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

// 29D4/29E2: only an active old slot decrements F14; 29ED clears
// status unconditionally. Preserve +03 and road data for any current tail.
function clearCapturedLegionRecord(sc, legion) {
  if (legion.status >= 0x80) countLegionRemoval(sc, legion);
  legion.status = 0;
  legion._active = false;
  legion.dead = true;
  legion.target = null;
  legion._retreat = null;
  clearEngagement(legion);
  sc.delayedLegionReturns = (sc.delayedLegionReturns ?? []).filter(
    (record) => record.slot !== legion.slot,
  );
}

function captureOrEliminateLegion(sc, legion, captorFaction, app = null) {
  const general = generalForLegion(sc, legion);
  const oldFaction = legion.faction;
  clearCapturedLegionRecord(sc, legion);
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
  // 291A/291F: an inactive BP-list member returns before any RNG/write.
  // Keep this raw status gate; dead/_active are only Web projections.
  if (legion.status < 0x80) return null;
  bindLegionSlotCounter(sc, legion);
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

function tickDelayedLegionReturn(app, record) {
  const sc = app.scenario;
  record.engagementCountdown = (legionSlotCounter(record) - 1) & 0xff;
  if (record.engagementCountdown !== 0) return "complete";
  record.status = 0;
  sc.delayedLegionReturns = sc.delayedLegionReturns.filter(
    (item) => item !== record,
  );
  const general = sc.generals[record.generalIdx];
  if (general) {
    general.status = 0;
    if (!factionIsActive(sc, record.faction)) general.faction = null;
  }
  if (record.faction === sc.player_faction && app.gamebar?.enqueueTalkMessage) {
    const batch = app._legionSlotBatch;
    const ticket = batch?.ticket;
    app.gamebar.enqueueTalkMessage({
      gen: general,
      talkIndex: 35,
      generalName: general?.name?.trim?.() || record.leader || "",
      personalitySelector: 0x198,
      kind: "postbattle-general-return",
      onComplete: () => finishDeferredLegionDaily(app, batch, ticket),
    });
    return "suspended";
  }
  return "complete";
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
  // 2831/2880 compare stored +03 BEFORE the active tail. Reused slots
  // can have nonzero residuals; only zero starts a new 12-count wait.
  if (legionSlotCounter(A) === 0) A.engagementCountdown = ENGAGE_COUNTDOWN;
  A._engagement = { kind, target };
  projectEngagementCounter(A);
  // The caller already reloaded +0B before 2662; only 264A decrements +03.
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
  A.roadStride = reversed.stride;
  A._path = reversed.points.slice(reversed.pointIndex);
  // 0x42AB只临时改当前道路端点；玩家/AI最终命令目标仍保留，回到端点后再寻路。
  A.status = (A.status ?? 0x80) | 0x02;
  return true;
}

/** 0x25CC→0x42AB→0x2831/0x2880：每轮实时重检，不锁存首次kind/target。 */
function currentEngagement(sc, A, countdown) {
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

/** Action only: 25A3 owns +0B, and 264A alone owns the slot tail. */
function advanceEngagement(app, A) {
  const engagement = currentEngagement(app.scenario, A, legionSlotCounter(A));
  if (!engagement) {
    clearEngagement(A);
    return "clear";
  }
  startEngagement(A, engagement.kind, engagement.target);
  return resolveEngagementAction(app, A);
}

function resolveEngagementAction(app, A) {
  const engagement = A._engagement;
  const target = engagementTarget(app.scenario, engagement);
  if (!target || target.dead) {
    clearEngagement(A);
    return "clear";
  }
  if (legionSlotCounter(A) > 1) return "waiting";
  const resolve = () =>
    engagement.kind === ENGAGE_KIND_FIELD
      ? resolveFieldBattle(app, A, target)
      : resolveBattle(app, A, target);
  if (
    battleUsesDelegatedPlayer(app.scenario, A, target, engagement.kind) &&
    typeof app.playDelegatedEngage === "function"
  ) {
    if (!app.playDelegatedEngage(A, resolve)) {
      throw new Error("Delegated battle gate rejected an idle legion batch");
    }
    return "suspended";
  }
  // true includes TALK queued before the tactical view becomes active.
  return resolve() ? "suspended" : "complete";
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

/** Reconcile a view cache before ANY action consumer, without writing 0A/0C/0E. */
function prepareRoadMarchProjection(A, tx, ty) {
  if (!roadGraphReady()) return;
  if (A.roadEdgeOrNode != null && A._march) {
    // Read-only cache check. Never copy this computed tuple into the record.
    const projected = serializeRoadMarchContext(A._march);
    if (
      projected?.edgeOrNode !== A.roadEdgeOrNode ||
      projected?.pointAddress !== A.roadPointAddress ||
      projected?.stride !== A.roadStride
    )
      clearMarchNavigation(A);
  }
  // A target/scene cache invalidation can leave a valid current edge. Restore
  // its projection instead of starting node search from a non-node coordinate.
  if (
    !A._march &&
    Number.isInteger(A.roadEdgeOrNode) &&
    A.roadEdgeOrNode >= 0x800
  ) {
    A._march = restoreRoadMarchContext({
      x: A.x,
      y: A.y,
      targetX: tx,
      targetY: ty,
      targetNode: A.targetNode,
      stride: A.roadStride,
      pointAddress: A.roadPointAddress,
      edgeOrNode: A.roadEdgeOrNode,
    });
    if (!A._march)
      throw new TypeError("Cannot project explicit legion road fields");
  }
}

/** 原版道路边点列推进；返回 moved/arrived/blocked/unavailable。 */
function stepRoadGraph(sc, A, tx, ty) {
  if (!roadGraphReady()) return "unavailable";
  prepareRoadMarchProjection(A, tx, ty);
  if (A.x === tx && A.y === ty && !legionOnRoadEdge(A)) {
    clearMarchNavigation(A);
    markLegionAtRoadNode(A, roadNodeAt(A.x, A.y)?.id);
    A.prevX = A.x;
    A.prevY = A.y;
    A._markerFrame = 4;
    return "arrived";
  }
  if (!A._march) {
    // Node entry: 26A5 consumes bit1 BEFORE 47BB, including a failed
    // query. Only a successful node→edge selection reaches 4869's bit0
    // clear; first-point 2708 must still bypass the departure city tile.
    A.status &= 0xfd;
    clearMarchNavigation(A);
    rememberMarchBase(sc, A);
    A._march = makeMarchNavigation(sc, A, tx, ty);
    if (!A._march) return "blocked";
    const selectedEdge = roadEdgeById(A._march.edgeId);
    // 4863/4866/4869/486C: record selection immediately, before the first
    // candidate contact/commit and before this slot's 2600 daily settlement.
    A.roadPointAddress = roadPointRawAddress(
      selectedEdge.id,
      A._march.stride === 4 ? 0 : selectedEdge.points.length - 1,
    );
    A.roadEdgeOrNode = roadEdgeRawAddress(selectedEdge.id);
    A.status &= 0xfe;
    A.roadStride = A._march.stride;
  } else if (
    A.status & 2 ||
    A._march.targetX !== tx ||
    A._march.targetY !== ty
  ) {
    A.status &= 0xfd; // 26A5 consumes a reselect request even if projection is fresh.
    const targetNode = roadNodeAt(tx, ty);
    if (!targetNode) return "blocked";
    // Known divergence (march notes §5.4): 47EA searches BOTH endpoints
    // for a non-endpoint target. The shortcut
    // below is not its full contract; 0C must also be preserved by address.
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
      A.roadStride = reversed.stride; // No 0C/0E write on an in-edge turn.
    }
    A.status |= 1; // 4823/482A (and 4816): an in-edge direction selection.
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
  const edge = roadEdgeById(nav.edgeId);
  const committedIndex =
    nav.stride === 4 ? nav.pointIndex : edge.points.length - 1 - nav.pointIndex;
  const committedAddress = roadPointRawAddress(nav.edgeId, committedIndex);
  if (committedAddress == null)
    throw new TypeError("Invalid road point commit");
  A.roadPointAddress = committedAddress; // 276A precedes coordinate writeback.
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
  // 4AEC/4AEF precede selection and the opening message. Siege clears
  // only the attacker; unlike 4AA5..4AAF it does not clear the defender.
  bindLegionSlotCounter(sc, A);
  clearEngagement(A);
  A.engagementCountdown = 0;
  // 4C72's BP list survives the battle and any primary-defender fate.
  const defenders = sc.legions
    .filter(
      (legion) =>
        legion.slot >= 0 &&
        legion.slot < 127 &&
        legion.status >= 0x80 &&
        legion.faction === city.faction &&
        legion.x === city.x &&
        legion.y === city.y,
    )
    .toSorted((left, right) => left.slot - right.slot);
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
    const continuation = captureLegionContinuation(app);
    const start = () => {
      if (continuation.claim())
        app.startBattle(A, city, primaryDefender, defenders);
    };
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
      defenders,
    },
  );
  return false;
}

export function resolveFieldBattle(app, A, D) {
  if (!D || D.dead) return false;
  const sc = app.scenario;
  // 4AA5..4AAF: clear the two actual combatants before 4E5C/TALK29.
  for (const legion of [A, D]) {
    bindLegionSlotCounter(sc, legion);
    clearEngagement(legion);
    legion.engagementCountdown = 0;
  }
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
    const continuation = captureLegionContinuation(app);
    const start = () => {
      if (continuation.claim()) app.startFieldBattle(A, D);
    };
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
  // 4AB6..4AD1: AH=1 or 3 selects attacker fate; only AH=2 selects
  // defender fate. Two failed continuations do NOT dispatch two fates.
  else if (!defenceContinues)
    dispatchLegionFate(sc, D, A.faction, strategicRng, app);
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
    // 5030 directly calls 29C3, NOT the 291A fate/RNG dispatcher.
    // 29C8..29D0 derives the slot from the general pointer, even when
    // that slot is inactive or already retired by the original BP group.
    const capturedRecord =
      sc.legions.find((record) => record.slot === general.idx) ??
      sc.delayedLegionReturns?.find((record) => record.slot === general.idx);
    if (capturedRecord) clearCapturedLegionRecord(sc, capturedRecord);
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

function retreatCapturedGarrison(app, sc, defenders, captorFaction, rng) {
  // These are the ORIGINAL 4C72 BP references, not a post-fate active scan.
  if (!defenders.length) return { retreat: 0, fates: [] };
  const retreat = retreatRouteToFriendlyCity(sc, defenders[0]);
  if (retreat) {
    for (const legion of defenders) {
      // 4DC9..4DD3 writes only +20/+14/+0B and OR2: no position,
      // +03/+1E/+23 or active-bit write, even for a retired BP member.
      legion.status |= 2;
      legion.target = retreat.city;
      legion.targetCity = retreat.city.idx;
      legion.targetNode = retreat.node?.id ?? null;
      legion.moveDelay = 1;
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
  const defenders = originalExit?.defenders;
  if (!Array.isArray(defenders))
    throw new TypeError("Missing pre-battle defender list");
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
  // 5192 precedes 51A1 and both precede 4B1F/city capture. 4B23 only
  // consumes defender failure when attacker won; it ignores winner failure.
  const attackContinues = continueLegionAfterBattle(sc, A, winner === "atk");
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
    const defenceContinues = continueLegionAfterBattle(
      sc,
      primaryDefender,
      winner === "def",
    );
    if (winner === "atk" && !defenceContinues) {
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
    retreatCapturedGarrison(app, sc, defenders, A.faction, strategicRng);
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
    // 4CF3 changes ownership, not attacker coordinates/+0E/target.
    // Its current slot still owes road upkeep before its next movement.
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
  if (A._retreat) A._retreat.captorFaction = oldFaction ?? 0x18;
  if (!attackContinues)
    dispatchLegionFate(sc, A, oldFaction ?? 0x18, strategicRng, app);
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
export function tickEnvoyDiplomacy(app, selectedFaction = null) {
  let current = selectedFaction;
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
  // Known 0E is authoritative, especially node 0 with a stale edge cache.
  if (legion?.roadEdgeOrNode != null) {
    const raw = Number(legion.roadEdgeOrNode);
    return Number.isFinite(raw) && raw >= 0x0800;
  }
  // Retained pre-existing Web in-memory compatibility, not an original field
  // reconstruction or permission to migrate missing original road state.
  return legion?._march?.edgeId != null;
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
  return repartitionLegionReserves(sc, legion);
}

// 4499/461D body: capital/active/strength gates belong to producers of
// command 9, not to this dispatcher. In particular 449C runs even unchanged.
function repartitionLegionReserves(sc, legion) {
  const faction = sc.factions.find((item) => item.idx === legion.faction);
  if (!faction) throw new TypeError("Repartition requires a faction record");
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
    settleEnteredLegionDaily(sc, legion);
  }
}

function settleEnteredLegionDaily(sc, legion) {
  // Entry qualification belongs to 25B6, not to post-action active/dead flags.
  const faction = sc.factions.find((item) => item.idx === legion.faction);
  if (!faction) throw new TypeError("Entered legion has no faction record");
  const onRoadEdge = legionOnRoadEdge(legion);
  applyFactionFundsDelta(
    faction,
    -legionDailyMaintenanceCost(legion, onRoadEdge),
  );
  if (!onRoadEdge) {
    legion.morale = Math.min(
      factionLegionMoraleCap(faction),
      (legion.morale + 10) & 255,
    );
  }
}

/** Resume the current tail AND remaining slots after a normal return.
 * Callers capture batch/ticket before yielding; an earlier battle cannot
 * acknowledge a later battle's ticket, even inside the same batch.
 */
export function finishDeferredLegionDaily(
  app,
  batch = app?._legionSlotBatch,
  ticket = batch?.ticket,
) {
  if (
    !batch ||
    app._legionSlotBatch !== batch ||
    batch.ticket !== ticket ||
    !ticket ||
    ticket.completed ||
    batch.scenario !== app.scenario ||
    batch.clock !== app.clock
  )
    return false;
  if (app.endView?.active) {
    cancelLegionSlotBatch(app);
    return false;
  }
  ticket.completed = true;
  if (batch.running) return false;
  batch.ticket = null;
  return runLegionSlotBatch(app, batch);
}

export function cancelLegionSlotBatch(app) {
  const batch = app?._legionSlotBatch;
  if (!batch) return false;
  batch.cursor.cancel();
  batch.ticket = null;
  app._legionSlotBatch = null;
  return true;
}

export function aiTick(app, options = {}) {
  if (
    app._strategicCityRequest ||
    app._legionSlotBatch ||
    app._strategicBattleFailure
  )
    return;
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
  if (
    app._legionSlotBatch ||
    app._strategicBattleFailure ||
    app.battleView?.active ||
    app.engageTransition?.active
  )
    return;
  const sc = app.scenario;
  if (!sc?.legions) return;
  // 1D0B: city military/request already returned, then governance, then
  // 25A3. Newly formed armies compete for reserves BEFORE these slots.
  if (Number.isInteger(options.cityIndex)) {
    tickStrategicCityDaily(
      sc,
      options.cityIndex,
      app.originalRng ?? app.activeBattleRng,
    );
  } else if (options.runCityDaily !== false) {
    cityDaily(sc, app.originalRng ?? app.activeBattleRng);
  }
  // Explicit legacy tool hook, not the production 1D8E clock boundary.
  if (options.runFactionTick === true) {
    tickEnvoyDiplomacy(app);
    tickStrategicWarEvents(app);
  }
  const firstSlot = options.legionBatchStart ?? 0;
  const endSlot = options.legionBatchStart == null ? 128 : firstSlot + 16;
  const batch = {
    scenario: sc,
    clock: app.clock,
    cursor: new LegionSlotBatch({
      firstSlot,
      endSlot,
      settleDaily:
        options.settleDaily ??
        (options.legionBatchStart == null || options.hour === 1),
    }),
    ticket: null,
    running: false,
    changed: false,
  };
  app._legionSlotBatch = batch;
  return runLegionSlotBatch(app, batch);
}

function runLegionSlotBatch(app, batch) {
  if (
    batch.running ||
    app._legionSlotBatch !== batch ||
    app.scenario !== batch.scenario ||
    app.clock !== batch.clock
  )
    return false;
  const sc = batch.scenario;
  const lookup = (slot) => {
    const record =
      sc.legions.find((item) => item.slot === slot) ??
      sc.delayedLegionReturns?.find((item) => item.slot === slot);
    if (record) bindLegionSlotCounter(sc, record);
    return record;
  };
  batch.running = true;
  try {
    for (;;) {
      if (app._legionSlotBatch !== batch) return false;
      if (app.endView?.active) {
        cancelLegionSlotBatch(app);
        return false;
      }
      const op = batch.cursor.next(lookup);
      if (op.kind === "cancelled") return false;
      if (op.kind === "done") {
        // Fetch canonical RNG NOW: tactical return can replace its object.
        batch.changed =
          tickStrategicWeather(sc, app.originalRng ?? app.activeBattleRng) ||
          batch.changed;
        sc.legions = sc.legions.filter((record) => !record.dead);
        app._legionSlotBatch = null;
        app.gamebar?.syncClock?.();
        if (batch.changed) {
          app.hud?.buildLegend?.();
          app.view?.draw?.();
        }
        return batch.changed;
      }
      if (op.kind === "daily") {
        settleEnteredLegionDaily(sc, op.record);
      } else if (op.kind === "tail") {
        finishLegionSlotTail(op.record);
        if (!(op.record.status & ENGAGE_STATUS_ACTIVE))
          clearEngagement(op.record);
      } else {
        // Publish the ticket BEFORE calling code that may synchronously
        // invoke a test callback. The cursor is already at the continuation.
        const ticket = { completed: false };
        batch.ticket = ticket;
        const outcome =
          op.kind === "inactive"
            ? tickDelayedLegionReturn(app, op.record)
            : performLegionSlotAction(app, op.record);
        batch.changed = true;
        if (app._legionSlotBatch !== batch) return false;
        if (outcome === "suspended" && !ticket.completed) {
          app.gamebar?.syncClock?.();
          return false;
        }
        batch.ticket = null;
      }
    }
  } catch (error) {
    // This pump owns remaining slots after the battle ticket is consumed.
    // A previous battle callback cannot handle failures at this boundary.
    if (
      app._legionSlotBatch === batch &&
      app.scenario === batch.scenario &&
      app.clock === batch.clock
    ) {
      cancelLegionSlotBatch(app);
      holdFailedStrategicUpdate(app, error);
    }
    return false;
  } finally {
    batch.running = false;
  }
}

function disbandLegionAtCapital(sc, legion) {
  legion._disbandAtCapital = false;
  const faction = legionFaction(sc, legion);
  if (faction) {
    for (const unit of ensureLegionUnits(legion)) {
      const field = LEGION_RESERVE_FIELD_BY_TYPE[unit.type];
      if (!field) continue;
      faction[field] = Math.min(
        0xffdc,
        Math.max(0, Math.trunc(Number(faction[field]) || 0)) +
          Math.max(0, Math.floor((unit.troops ?? 0) / 10)),
      );
    }
    countLegionRemoval(sc, legion); // 4658→4689: byte DEC, not saturation.
  }
  const general = generalForLegion(sc, legion);
  if (general) general.status = 0;
  legion.status = 0;
  legion._active = false;
  legion.dead = true;
  // 4651 does not erase +03/+04/+0E. The entered slot still gets its tail.
  clearEngagement(legion);
}

function performLegionSlotAction(app, A) {
  const sc = app.scenario;
  A.prevX = A.x;
  A.prevY = A.y;
  // The outer 42AB and engagement paths run BEFORE stepTo. They must not
  // consume a stale edge cache or write its stride into a known node record.
  prepareRoadMarchProjection(A, A.target?.x, A.target?.y);
  if (legionAtTargetNode(sc, A)) {
    if (A._retreat) A._retreat = null;
    const handler = legionCommandHandlerIndex(sc, A);
    settleArrivedLegionCommand(sc, A, app.originalRng ?? app.activeBattleRng);
    if (A._disbandAtCapital) disbandLegionAtCapital(sc, A);
    else if (handler === 9) {
      repartitionLegionReserves(sc, A);
      resetLegionActionPhase(A);
      A.commandState = 3;
    }
    // 2662 RET: a newly selected command/target never moves in this action.
    return "complete";
  }
  if (A._retreat && A.target) {
    const result = stepTo(sc, A, A.target.x, A.target.y);
    if (result === "blocked") {
      dispatchLegionFate(
        sc,
        A,
        A._retreat.captorFaction ?? A.faction,
        app.originalRng ?? app.activeBattleRng,
        app,
      );
    } else if (result === "arrived") A._retreat = null;
    if (result === "contact") return resolveEngagementAction(app, A);
    return "complete";
  }
  if (A._march && reverseBlockedFinalEdge(sc, A)) {
    clearEngagement(A);
    return "complete";
  }
  if (A._engagement) {
    const outcome = advanceEngagement(app, A);
    if (outcome !== "clear") return outcome;
    // Only lost contact (not completed battle) continues moving this action.
  }
  if (!A.target) return "complete";
  const target = A.target;
  const result = stepTo(sc, A, target.x, target.y);
  if (result === "contact") return resolveEngagementAction(app, A);
  if (result === "blocked") {
    A.target = null;
    return "complete";
  }
  if (result === "reversed" || result === "waiting") return "complete";
  if (
    A.x === target.x &&
    A.y === target.y &&
    target.faction !== A.faction &&
    (target.faction == null || isAtWar(sc, A.faction, target.faction))
  ) {
    return resolveBattle(app, A, target) ? "suspended" : "complete";
  }
  // Arrival preserves the target until the NEXT due command action.
  return "complete";
}
