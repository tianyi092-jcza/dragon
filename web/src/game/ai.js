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
  prepareEnvoyBudgetReports,
  runStrategicDiplomacy,
} from "./diplomacy.js";
import { isPlayerAdvisorGeneral, playerFaction } from "./playerqueries.js";
import { cityRawBytes, factionRawByte } from "./legacyrecords.js";
import { countLegionActivation, countLegionRemoval } from "./legioncounts.js";
import { hasNativeFactionSlots } from "./nativefactions.js";
import { hasNativeStrategicEventWheel } from "./nativeevents.js";
import {
  countNativeAliveFactions,
  NATIVE_UNIFICATION_MONARCH_SELECTOR,
  NATIVE_UNIFICATION_TALK_INDEX,
  resolveNativeVictoryMonarch,
} from "./navigation/originalvictorygate.js";
import { terrainTile } from "./pathfind.js";
import {
  reverseRoadMarchContext,
  roadGraphReady,
  roadNodeAt,
  roadNodeById,
  roadNodeIdFromRaw,
  roadNodeRawAddress,
  restoreRoadMarchContext,
  serializeRoadMarchContext,
} from "./roadgraph.js";
import { clickSfx, doubleClickSfx, warnSfx } from "../core/speaker.js";
import {
  hasNativeLegionSlots,
  nativeLegionAt,
  rebindNativeLegionViews,
} from "./nativelegions.js";
import { formationByte } from "./navigation/originalformation.js";
import { scenarioNativeRoadContext } from "./scenarioassembly.js";
import { performOriginalRoadAction } from "./navigation/originalroadmovement.js";
import {
  performScenarioLegionFate,
  performScenarioExtinction4FCE,
  performScenarioExtinctionAfterTalk36,
  performScenarioExtinctionPlayerGate,
  performScenarioGeneralFateEvent,
  performScenarioMonthlyGeneralFatesDeferred,
  commitScenarioRecruitJoinOwnerWrite,
  commitScenarioCaptivePendingFactionWrite,
} from "./navigation/scenariolegionfate.js";
import { refreshOriginalCityCache } from "./navigation/originalroadarrival.js";
import { captureOriginalCity } from "./navigation/originalcitycapture.js";
import { createBattle, createFieldBattle } from "./tacticalbattle.js";
import {
  runOriginalCityMilitary,
  governOriginalCity,
  damageOriginalCity,
  completePlayerReinforcementRequest,
} from "./navigation/originalcity.js";
import { tickOriginalStrategicWeather } from "./weather.js";
import {
  beginScenarioDisasterAreaEvent,
  beginScenarioDisasterObjectEvent,
  continueScenarioDisasterAreaEvent,
  continueScenarioDisasterObjectEvent,
  performScenarioMonthlyWeatherEvents,
} from "./navigation/scenarioweather.js";
import {
  consumeScenarioStrategicEvent,
  decodeScenarioGenericTalkEvent,
} from "./navigation/scenarioevents.js";
import { performScenarioFactionTick } from "./navigation/scenariofactiontick.js";
import { performScenarioGeneralRatingRefresh } from "./navigation/scenariogeneralrating.js";
import { performScenarioMonthlyDiplomacy } from "./navigation/scenariomonthlydiplomacy.js";
import {
  performScenarioDeficitTrustEvent,
  performScenarioMonthlyBudgetProducers,
} from "./navigation/scenariomonthlybudgets.js";
import { performScenarioMonthlyPolicyActivation } from "./navigation/scenariomonthlypolicy.js";
import { performScenarioCapitalRelocation } from "./navigation/scenariocapitalrelocation.js";
import {
  beginScenarioWarEvent,
  commitScenarioWarEvent,
  continueScenarioWarEvent,
} from "./navigation/scenariowarconsumer.js";
import {
  applyScenarioPlayerTrustPenalty,
  beginScenarioAssistanceEnvoyResult,
  beginScenarioAssistanceEvent,
  beginScenarioDomesticBudgetEvent,
  beginScenarioEnvoyBudgetEvent,
  beginScenarioTruceEnvoyResult,
  beginScenarioTruceEvent,
  commitScenarioAssistanceEnvoyResult,
  commitScenarioBudgetEvent,
  commitScenarioTruceEnvoyResult,
  commitScenarioTruceEvent,
  describeEnvoyResultMessageState,
  readScenarioPlayerMonarchPersonality,
  readScenarioPlayerTrust,
  scenarioAssistanceEnvoyOutcome,
  scenarioTruceEnvoyOutcome,
  settleScenarioAssistanceEvent,
} from "./navigation/scenarionegotiation.js";
import {
  resolveOriginalPlayerDecision,
  resolveOriginalPlayerDecisionChoice,
} from "./navigation/originalplayerdecision.js";
import {
  beginScenarioDeficitTrustEvent,
  continueScenarioDeficitTrustEvent,
  finishScenarioDeficitTrustEvent,
} from "./navigation/scenariodeficittrust.js";
import {
  originalRetreatRoute,
  retreatOriginalGarrison,
  continueOriginalLegionAfterBattle,
} from "./navigation/originalroadretreat.js";
import {
  applyFactionFundsDelta,
  factionLegionMoraleCap,
  factionReserveUpkeepTick,
  legionDailyMaintenanceCost,
  monthlySettlement,
  activateNextMonthPolicy,
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
  if (hasNativeLegionSlots(sc)) {
    rebindNativeLegionViews(sc);
    for (const record of sc.legions) {
      record._runtimeId = nextRuntimeLegionId(sc);
      record.prevX = record.x;
      record.prevY = record.y;
    }
    return;
  }
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
      clearMarchNavigation(L);
      // P79 G6-closed: the pre-P66 saved-points branch is deleted with the
      // retreatMarch compat-read (no writer, no test). Mid-retreat restore
      // rides native savedMarch or the node mark below (P74-B proof).
      if (savedMarch) {
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
  const native = scenarioNativeRoadContext(sc);
  if (native) {
    refreshOriginalCityCache(sc, native, city);
    const rng = app.originalRng ?? app.activeBattleRng;
    const result = runOriginalCityMilitary(sc, native, city, rng);
    if (result !== "player-request") return result;
    // 40DD..40FD：玩家空边城求援——CDE 蜂鸣 + 8810 TALK38「\2前來請求援軍。」
    // P32 审计实锤 8810 全树零规则写入、零 RNG；40F6 RNG、414F 冷却与
    // 40B3 登记必须在消息真实关闭后执行（模态期间 _strategicCityRequest
    // 阻止后续城槽tick，共享RNG不会交错）。与 v1 同一合同。
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
      completePlayerReinforcementRequest(sc, native, city, rng);
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
  const native = scenarioNativeRoadContext(sc);
  if (native) return originalRetreatRoute(sc, legion, native);
  // P62 G1 (entire-v2-replacement gate): v1 approximation arm deleted.
  // Fixed endpoint priority + Dijkstra costs with the 0x80a6 non-friendly
  // penalty were NOT 487B (see removed comment below in git history).
  // Non-native scenarios now get null (no retreat route); both callers
  // (continueLegionAfterBattle, retreatCapturedGarrison) already fail
  // closed on null. See journal P62.
  return null;
}

function assignRetreatRoute(legion, retreat, captorFaction) {
  // P65 (entire-v2-replacement gate): the P62 G1 leftover non-native arm
  // is deleted. retreatRouteToFriendlyCity returns null (both callers fail
  // closed before reaching here) or originalRetreatRoute's {native:true}.
  // 4780,4789,478C; targetNode is the Web id projection of raw BX>>2.
  legion.targetNode = retreat.node.id;
  legion.targetCity = retreat.city.idx;
  legion.status |= 0x02;
  legion.target = retreat.city;
  // 474E→6FD2 already wrote +0B=1. 4780/4789/478C change only the
  // destination and bit1: preserve the CURRENT +0A/+0C/+0E, not a new
  // stride=0 retreat path. The next due 26A5→47BB chooses direction.
  // In particular, this battle's 2600 and snapshot still read the old edge.
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
  // Native 474E must precede legacy normalization and preserve late failures.
  const native = scenarioNativeRoadContext(sc);
  if (native) return continueOriginalLegionAfterBattle(sc, legion, won, native);
  ensureLegionUnits(legion);
  resetLegionActionPhase(legion);
  const firstUnit = Math.floor(
    (legion.units[0]?.troops ?? legion.troops * 10) / 10,
  );
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
  // 去向§4.1字节实锤：仅TALK34后接19Ah第二段；TALK33返回后直接退出，
  // 不带selector（旧“所有captured都附19Ah”概括已撤销）。
  if (talkIndex === 34) message.personalitySelector = 0x19a;
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
  if (hasNativeLegionSlots(sc)) rebindNativeLegionViews(sc);
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
  const status = hasNativeLegionSlots(sc)
    ? formationByte(legion.status, "L00 at 29D4")
    : legion.status;
  if (status >= 0x80) countLegionRemoval(sc, legion);
  legion.status = 0;
  legion._active = false;
  legion.dead = true;
  legion.target = null;
  legion._retreat = null;
  clearEngagement(legion);
  sc.delayedLegionReturns = (sc.delayedLegionReturns ?? []).filter(
    (record) => record.slot !== legion.slot,
  );
  if (hasNativeLegionSlots(sc)) rebindNativeLegionViews(sc);
}

function captureOrEliminateLegion(sc, legion, captorFaction, app = null) {
  const general = generalForLegion(sc, legion);
  const oldFaction = legion.faction;
  clearCapturedLegionRecord(sc, legion);
  if (!general) return "captured";
  return settleCapturedGeneral(app, sc, general, oldFaction, captorFaction);
}

// Unclosed general-owner writers must not drift the explicit native F18.
function rejectNativeGeneralLifecycle(sc, app, at) {
  if (!scenarioNativeRoadContext(sc) && !hasNativeLegionSlots(sc)) return;
  const error = new RangeError(
    `Web engineering Uncovered native general lifecycle at ${at}`,
  );
  if (app) holdFailedStrategicUpdate(app, error);
  throw error;
}

/** KI.EXE 0x291A：无法继续行动军团的延迟回归/被俘分派。 */
export function dispatchLegionFate(
  sc,
  legion,
  captorFaction,
  rng = null,
  app = null,
) {
  const native = scenarioNativeRoadContext(sc);
  if (native || hasNativeLegionSlots(sc)) {
    try {
      return performScenarioLegionFate(
        sc,
        legion,
        native,
        "291A",
        captorFaction,
        rng,
      );
    } catch (error) {
      if (app) holdFailedStrategicUpdate(app, error);
      throw error;
    }
  }
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

export function stepTo(sc, A, tx, ty, blocks) {
  const native = scenarioNativeRoadContext(sc);
  if (native) return performOriginalRoadAction(sc, A, native, undefined, blocks);
  // G2: v1 arms (stepRoadGraph/stepLegacyPath) deleted with their oracles
  // (Dijkstra findRoadRoute, pixel findPath). No movement oracle remains for
  // non-native scenarios, so fail closed. Both performLegionSlotAction
  // callers already handle "blocked" (retreat fate dispatch / target clear).
  return "blocked";
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
    // 4F10守方TALK27只经4F58内一次0CDE；4F36攻方TALK28经4F36+4F58内两次0CDE。
    if (playerDefender) clickSfx();
    else doubleClickSfx();
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
    // 4E82攻方支只经4EB9内一次0CDE；4E9F守方支经4EA1+4EB9内两次0CDE。
    if (A.faction === pf.idx) clickSfx();
    else doubleClickSfx();
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
  // This legacy recomputation is not the stored F23 DEC/INC instruction chain.
  rejectNativeGeneralLifecycle(sc, null, "4CF3/F23 legacy recomputation");
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
  // The Web helper is also called for surviving factions; only its extinction
  // body represents4FCE. Stop before its first mutation, not every city capture.
  rejectNativeGeneralLifecycle(sc, app, "4FCE");
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
    const capturedRecord = hasNativeLegionSlots(sc)
      ? nativeLegionAt(sc, general.idx, "29D4")
      : (sc.legions.find((record) => record.slot === general.idx) ??
        sc.delayedLegionReturns?.find((record) => record.slot === general.idx));
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

export function retreatCapturedGarrison(
  app,
  sc,
  defenders,
  captorFaction,
  rng,
) {
  // These are the ORIGINAL 4C72 BP references, not a post-fate active scan.
  if (!defenders.length) return { retreat: 0, fates: [] };
  const native = scenarioNativeRoadContext(sc);
  if (native)
    return retreatOriginalGarrison(sc, defenders, native, (legion) =>
      dispatchLegionFate(sc, legion, captorFaction, rng, app),
    );
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
  // 5180/5189 -> 51B3 commits BOTH sides' units, totals and morale
  // before 5192 -> attacker 474A can fail or leave this boundary.
  if (primaryDefender) {
    settleFieldLegion(
      primaryDefender,
      defResult?.troops ?? defTroops ?? primaryDefender.troops,
      defResult?.units ?? defUnits,
      winner === "def",
      defResult?.morale,
    );
  }
  // Keep phase/continuation order: 5192 attacker, then 51A1 defender.
  // 4B23 consumes defender failure only when attacker won.
  const attackContinues = continueLegionAfterBattle(sc, A, winner === "atk");
  if (primaryDefender) {
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
  if (
    winner === "atk" &&
    (scenarioNativeRoadContext(sc) || hasNativeLegionSlots(sc))
  ) {
    try {
      return captureOriginalCity(
        sc,
        city,
        A.faction,
        () =>
          retreatCapturedGarrison(
            app,
            sc,
            defenders,
            city.faction === null ? EMPTY_FACTION : city.faction,
            strategicRng,
          ),
        (deadOwner, captor, hooks) => {
          // 4FD9..4FDC player gate first (F00 committed even on the exit path).
          if (
            performScenarioExtinctionPlayerGate(
              sc,
              deadOwner,
              scenarioNativeRoadContext(sc),
            )
          ) {
            triggerNativePlayerDefeat(app, sc, deadOwner);
            return "player-defeated";
          }
          return performScenarioExtinction4FCE(
            sc,
            deadOwner,
            captor,
            scenarioNativeRoadContext(sc),
            (suspendedOwner, diplomat, diplomatTail) =>
              suspendNativeDiplomatReport(
                app,
                sc,
                suspendedOwner,
                captor,
                scenarioNativeRoadContext(sc),
                diplomat,
                diplomatTail,
                hooks?.captureTail,
              ),
          );
        },
        (deadOwner, captor, captureTail) =>
          suspendNativeExtinctionTalk36(
            app,
            sc,
            deadOwner,
            captor,
            scenarioNativeRoadContext(sc),
            captureTail,
          ),
        {
          onGovernorBlock: (governorCtx, governorTail) =>
            suspendNativeGovernorReport(app, sc, governorCtx, governorTail),
        },
      );
    } catch (error) {
      holdFailedStrategicUpdate(app, error);
      throw error;
    }
  }
  const oldFaction = originalExit?.oldFaction ?? city.faction;
  const oldCapital =
    oldFaction == null
      ? null
      : sc.factions.find((faction) => faction.idx === oldFaction)?.capital;
  if (winner === "atk") {
    // Legacy only: its governor/count order is not an original-rule oracle.
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
  // P58 default v2 already owns the strict 256-slot native wheel. 304E is a
  // read-only query over that same table; it must not pass through the legacy
  // migration helper (which correctly remains forbidden for enqueue/shift).
  const slots = hasNativeStrategicEventWheel(sc)
    ? sc.strategicEventSlots
    : ensureStrategicEventSlots(sc);
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
  const slots = ensureStrategicEventSlots(sc, app);
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

function ensureStrategicEventSlots(sc, app = null) {
  // All legacy query/enqueue/page-shift callers pass here. They cannot invent
  // native empty slots or clamp the word cursor; strict301C has its own IO.
  rejectNativeGeneralLifecycle(sc, app, "legacy event wheel");
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
function beginStrategicEventMonth(sc, app) {
  const slots = ensureStrategicEventSlots(sc, app);
  sc.strategicEventSlots = slots
    .slice(STRATEGIC_EVENT_PAGE_SLOTS)
    .concat(Array(STRATEGIC_EVENT_PAGE_SLOTS).fill(null));
  sc._strategicEventCursor = 0;
  sc._strategicEventDivider = 7;
}

/** 0x2FBF：从当前消费游标加随机0..31槽开始，向后寻找当前页空槽。 */
function enqueueCurrentStrategicEvent(app, event, fixedOffset = null) {
  const sc = app.scenario;
  const slots = ensureStrategicEventSlots(sc, app);
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

function performStrategicDiplomacyMonth(app) {
  const sc = app?.scenario;
  if (sc && hasNativeFactionSlots(sc)) {
    const rng = app?.originalRng ?? app?.activeBattleRng;
    try {
      return performScenarioMonthlyDiplomacy(sc, rng);
    } catch (error) {
      holdFailedStrategicUpdate(app, error);
      throw error;
    }
  }
  beginStrategicEventMonth(sc, app);
  const capitalEvents = enqueueStrategicCapitalEvents(app);
  const warEvents = runStrategicDiplomacy(sc);
  return [...capitalEvents, ...enqueueStrategicWarEvents(app, warEvents)];
}

/** 新游戏 0x1B29→0x2BD9：立即改变关系，并按事件时间轮排入提案。 */
export function initializeStrategicDiplomacy(app) {
  return performStrategicDiplomacyMonth(app);
}

/** 月结 0x5358→0x5394→0x2BD9：滚动事件页、更新关系并排入提案。 */
export function monthlyDiplomacyAI(app) {
  return performStrategicDiplomacyMonth(app);
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

/** 5358..538B native fiscal/growth prefix with the shared strategic failure owner. */
export function processMonthlyFiscalSettlement(app, clock = null) {
  const sc = app?.scenario;
  const rng = app?.originalRng ?? app?.activeBattleRng;
  try {
    return monthlySettlement(sc, clock, rng);
  } catch (error) {
    if (sc && hasNativeFactionSlots(sc)) holdFailedStrategicUpdate(app, error);
    throw error;
  }
}

/** 5391→55A6 stored G1F refresh; native fixed 0..126 only. */
export function processMonthlyGeneralRatings(app) {
  const sc = app?.scenario;
  if (!sc || (!scenarioNativeRoadContext(sc) && !hasNativeLegionSlots(sc)))
    return [];
  try {
    return performScenarioGeneralRatingRefresh(sc);
  } catch (error) {
    holdFailedStrategicUpdate(app, error);
    throw error;
  }
}

/** Bounded native585F/5899/5940/301C; docs/re-notes-legion-fate.md §9–10.
 * The legacy approximation below is not an original-rule oracle.
 */
/** 5924/599C玩家消息挂起：deferred期原扫暂停，消息返回后commit续扫。 */
/** 4FCE→5042 TALK36挂起：扫描前缀（5074/4236/127分派）已提交，消息返回后跑504D..5073 resume，再跑4D2A尾。 */
function suspendNativeExtinctionTalk36(
  app,
  sc,
  deadOwner,
  captor,
  context,
  captureTail,
) {
  const stale = app._nativeExtinctionContinuation;
  // 同批在途重复挂起必须fail-closed精确错，不能静默覆盖continuation丢尾
  // （首尾的captureTail/F23与ticket认领只够一单；排队属后续设计）。
  if (stale && stale.scenario === sc)
    throw new RangeError("native extinction continuation already pending");
  if (typeof app.gamebar?.enqueueTalkMessage !== "function")
    throw new RangeError("native extinction TALK36 has no UI");
  const faction = sc.factions?.find((candidate) => candidate?.idx === deadOwner);
  // 批内挂起：batch/ticket在resume时认领，续跑尾段后批处理从游标继续，
  // 与原版“消息关闭才继续本轮更新”同序。批外（月结等）则无ticket。
  const batch = app._legionSlotBatch ?? null;
  app._nativeExtinctionContinuation = {
    scenario: sc,
    deadOwner,
    captor,
    context,
    captureTail: typeof captureTail === "function" ? captureTail : null,
    batch,
    ticket: batch?.ticket ?? null,
  };
  app.gamebar.enqueueTalkMessage({
    gen: null,
    talkIndex: 36,
    targetName: faction?.monarch?.trim?.() || "",
    kind: "faction-extinction",
    onClose: () => resumeNativeExtinction(app),
  });
}

/** 504D消息返回：先跑F19续扫，再跑延后的4D2A尾（5073 ret→4D1E+3）。
 * 批内挂起时续跑完认领ticket，批处理从游标继续；批外（月结）无ticket。 */
export function resumeNativeExtinction(app) {
  const continuation = app?._nativeExtinctionContinuation;
  if (!continuation) return false;
  const sc = app?.scenario;
  if (!sc || continuation.scenario !== sc)
    throw new RangeError("native extinction continuation scenario mismatch");
  try {
    performScenarioExtinctionAfterTalk36(
      sc,
      continuation.deadOwner,
      continuation.context,
    );
    app._nativeExtinctionContinuation = null;
    continuation.captureTail?.();
    if (continuation.batch && continuation.ticket)
      finishDeferredLegionDaily(app, continuation.batch, continuation.ticket);
    return true;
  } catch (error) {
    holdFailedStrategicUpdate(app, error);
    throw error;
  }
}
/**
 * KI 0x4F06→0x4F71：AI破玩家城守备队、快战胜后，先警告/TALK26
 * （CX=1Ah即TALK索引，无个性段；4F7C→0CE7警告音），关闭后才续跑
 * 4B3A清临时军与4B41易主（消息审计§3.1）。挂起通道见
 * buildNativeSiegeBlocks.onSiegeWarning26。
 */
export function suspendNativeSiegeWarning26(app, sc, { attacker, cityIndex, resumeTail }) {
  const stale = app._nativeSiegeWarningContinuation;
  if (stale && stale.scenario === sc)
    throw new RangeError("native siege warning continuation already pending");
  if (typeof resumeTail !== "function")
    throw new RangeError("native siege warning has no resume tail");
  if (typeof app.gamebar?.enqueueTalkMessage !== "function")
    throw new RangeError("native siege warning TALK26 has no UI");
  const general =
    attacker?.generalIdx == null
      ? null
      : (sc.generals?.[attacker.generalIdx] ?? null);
  const city = sc.cities?.[cityIndex] ?? null;
  const batch = app._legionSlotBatch ?? null;
  app._nativeSiegeWarningContinuation = {
    scenario: sc,
    cityIndex,
    resumeTail,
    batch,
    ticket: batch?.ticket ?? null,
  };
  warnSfx(); // 4F7C CALL 0CE7（PC喇叭警告）。
  app.gamebar.enqueueTalkMessage({
    gen: general,
    talkIndex: 26,
    generalName:
      attacker?.leader?.trim?.() || general?.name?.trim?.() || "",
    cityName: city?.name?.trim?.() || "",
    kind: "siege-warning-26",
    onComplete: () => resumeNativeSiegeWarning26(app),
  });
}
/** 4F71消息返回：续跑易主尾段；尾段链入更深挂起时由其认领ticket。 */
export function resumeNativeSiegeWarning26(app) {
  const continuation = app?._nativeSiegeWarningContinuation;
  if (!continuation) return false;
  const sc = app?.scenario;
  if (!sc || continuation.scenario !== sc)
    throw new RangeError("native siege warning continuation scenario mismatch");
  app._nativeSiegeWarningContinuation = null;
  try {
    const result = continuation.resumeTail();
    if (isRoadSuspended(result)) return true;
    if (continuation.batch && continuation.ticket)
      finishDeferredLegionDaily(app, continuation.batch, continuation.ticket);
    return true;
  } catch (error) {
    holdFailedStrategicUpdate(app, error);
    throw error;
  }
}
/** 4FE5 player-dead exit (P55-C09-2c): DOS 1CB1 resets the stack and exits
 * with code 2 — no scan, no 4D2A tail. The Web equivalent is the existing
 * defeat endview (same product path the legacy extinction uses for a dead
 * player faction). The 4FD9 F00 clear is already committed by the gate. */
export function triggerNativePlayerDefeat(app, sc, deadOwner) {
  const faction = sc.factions?.find(
    (candidate) => candidate?.idx === deadOwner,
  );
  if (typeof app.endView?.show !== "function")
    throw new RangeError("native player defeat has no UI");
  app.endView.show({
    img: "grf/gameover.png",
    caption: `大業未成，${faction?.monarch?.trim?.() || ""}軍覆滅…（點擊返回標題）`,
  });
  return "player-defeated";
}
/** 509E diplomat suspend (P55-C09-2b): 5074 carries no CDE/beep prefix
 * (P55 fresh window) — the TALK69 + 1A7 personality sequence pumps as one
 * gamebar sequence, and onComplete resumes the diplomat tail (4236 +
 * 127-dispatch, ending at the 5042 gate, which chains the TALK36 suspend). */
function suspendNativeDiplomatReport(
  app,
  sc,
  deadOwner,
  captor,
  context,
  diplomat,
  diplomatTail,
  captureTail,
) {
  const stale = app._nativeDiplomatContinuation;
  if (stale && stale.scenario === sc)
    throw new RangeError("native diplomat continuation already pending");
  if (typeof diplomatTail !== "function")
    throw new RangeError("native diplomat report has no resume tail");
  if (typeof captureTail !== "function")
    throw new RangeError("native diplomat report has no capture tail");
  if (typeof app.gamebar?.enqueueTalkMessage !== "function")
    throw new RangeError("native diplomat TALK69 has no UI");
  const faction = sc.factions?.find((candidate) => candidate?.idx === deadOwner);
  // The leaf already XCHG-cleared F+2A to FF: use the captured index, never
  // re-read diplomat_idx here.
  const diplomatGeneral =
    diplomat == null ? null : (sc.generals?.[diplomat] ?? null);
  const batch = app._legionSlotBatch ?? null;
  app._nativeDiplomatContinuation = {
    scenario: sc,
    deadOwner,
    captor,
    context,
    diplomatTail,
    captureTail,
    batch,
    ticket: batch?.ticket ?? null,
  };
  app.gamebar.enqueueTalkMessage({
    gen: diplomatGeneral,
    talkIndex: 69,
    targetName: faction?.monarch?.trim?.() || "",
    generalName: diplomatGeneral?.name?.trim?.() || "",
    personalitySelector: 0x1a7,
    kind: "extinction-diplomat-report",
    onComplete: () => resumeNativeDiplomatReport(app),
  });
}
/** 509E message return: run the diplomat tail; its 5042 stop chains the
 * TALK36 suspend (monthly-fate chaining pattern). Any other stop holds. */
export function resumeNativeDiplomatReport(app) {
  const continuation = app?._nativeDiplomatContinuation;
  if (!continuation) return false;
  const sc = app?.scenario;
  if (!sc || continuation.scenario !== sc)
    throw new RangeError("native diplomat continuation scenario mismatch");
  app._nativeDiplomatContinuation = null;
  try {
    continuation.diplomatTail();
  } catch (error) {
    if (error?.instruction === "5042") {
      suspendNativeExtinctionTalk36(
        app,
        sc,
        continuation.deadOwner,
        continuation.captor,
        continuation.context,
        continuation.captureTail,
      );
      return true;
    }
    holdFailedStrategicUpdate(app, error);
    throw error;
  }
  holdFailedStrategicUpdate(
    app,
    new RangeError("native diplomat tail returned without 5042"),
  );
  throw new RangeError("native diplomat tail returned without 5042");
}
/** 4D86 governor suspend (P55-C09-2a): 4D86 CALL CE7 is the double beep
 * (P50 pin), then TALK68 + 1A6 personality pump as one gamebar sequence;
 * onComplete resumes the governor tail (4D0A DEC onward, including any
 * inner diplomat/extinction suspends, which fire their own handlers). */
function suspendNativeGovernorReport(app, sc, governorCtx, governorTail) {
  const stale = app._nativeGovernorContinuation;
  if (stale && stale.scenario === sc)
    throw new RangeError("native governor continuation already pending");
  if (typeof governorTail !== "function")
    throw new RangeError("native governor report has no resume tail");
  if (typeof app.gamebar?.enqueueTalkMessage !== "function")
    throw new RangeError("native governor TALK68 has no UI");
  const governor =
    governorCtx?.governor == null
      ? null
      : (sc.generals?.[governorCtx.governor] ?? null);
  const city = sc.cities?.[governorCtx?.cityIdx] ?? null;
  const batch = app._legionSlotBatch ?? null;
  app._nativeGovernorContinuation = {
    scenario: sc,
    governor: governorCtx?.governor ?? null,
    cityIdx: governorCtx?.cityIdx ?? null,
    governorTail,
    batch,
    ticket: batch?.ticket ?? null,
  };
  doubleClickSfx(); // 4D86 CALL CE7 double beep.
  app.gamebar.enqueueTalkMessage({
    gen: governor,
    talkIndex: 68,
    cityName: city?.name?.trim?.() || "",
    generalName: governor?.name?.trim?.() || "",
    personalitySelector: 0x1a6,
    kind: "extinction-governor-report",
    onComplete: () => resumeNativeGovernorReport(app),
  });
}
/** 4D86 message return: run the governor tail to completion-or-suspend.
 * Inner diplomat/extinction gates suspend through their own continuations
 * during the run; only genuine failures hold here. */
export function resumeNativeGovernorReport(app) {
  const continuation = app?._nativeGovernorContinuation;
  if (!continuation) return false;
  const sc = app?.scenario;
  if (!sc || continuation.scenario !== sc)
    throw new RangeError("native governor continuation scenario mismatch");
  try {
    const result = continuation.governorTail();
    app._nativeGovernorContinuation = null;
    // 内层链入更深挂起（外交官/灭亡）时由其continuation认领ticket，此处
    // 不认领；干净跑完才认领，批处理从游标继续。
    if (isRoadSuspended(result)) return true;
    if (continuation.batch && continuation.ticket)
      finishDeferredLegionDaily(app, continuation.batch, continuation.ticket);
    return result;
  } catch (error) {
    holdFailedStrategicUpdate(app, error);
    throw error;
  }
}
/** 2977/29C3玩家去向消息挂起（去向§4现刷关闭）：31/32/33/34/67皆单8810，
 * 无CDE（故不配clickSfx）；仅34后接19A第二段（AH=G1E、AL=G01，由talk
 * 系统按gen字段展开，传personalitySelector=0x19A；33明确无第二段）。
 * 规则前缀已在消息前提交、关闭后原版直接返回，故无尾写、无continuation：
 * 完成即认领batch/ticket（TALK35形状），批处理从游标继续。 */
export function suspendNativeBattleFateMessage(app, sc, { talk, slot }) {
  if (typeof app.gamebar?.enqueueTalkMessage !== "function")
    throw new RangeError(`native battle fate TALK${talk} has no UI`);
  const batch = app._legionSlotBatch ?? null;
  const ticket = batch?.ticket ?? null;
  const general = sc.generals?.[slot];
  const message = {
    gen: general,
    talkIndex: talk,
    generalName: general?.name?.trim?.() ?? "",
    kind: "postbattle-fate",
    onComplete: () => finishDeferredLegionDaily(app, batch, ticket),
  };
  if (talk === 34) message.personalitySelector = 0x19a;
  app.gamebar.enqueueTalkMessage(message);
  return "fate-suspended";
}
/** 原生战术入口挂起（4F36/4F13/4E82/4EA1）：v1开场消息形状（TALK27/28/29＋
 * P50分支单/双0CDE）→ v1战术引擎（createBattle/createFieldBattle＋battleView
 * 的OriginalBattleSession）→ 退出写回原生六队/士气/城损＋双方474A →
 * resumeTail续跑dispatch尾段（去向/易主）。Session从本批同一canonical流快照
 * 初始化，退出后把前进状态restore回同一对象（不替换引用），保证尾段去向与
 * 后续速算共享同一RNG流。同tick多场玩家战斗按挂起顺序排队逐场结算。任何
 * 环节失败一律大声holdFailedStrategicUpdate，不认领ticket。 */
export function suspendNativeTacticalBattle(app, sc, request) {
  const kinds = ["siege-attack", "siege-defence", "field-attack", "field-defence"];
  try {
    if (!request || !kinds.includes(request.kind))
      throw new RangeError(
        `native tactical suspension shape at ${request?.at ?? "4E82"}`,
      );
    const talkByKind = { "siege-attack": 28, "siege-defence": 27 };
    if ((talkByKind[request.kind] ?? 29) !== request.talk)
      throw new RangeError(`native tactical talk mismatch at ${request.at}`);
    if (typeof request.resumeTail !== "function")
      throw new RangeError(`native tactical ${request.at} has no resume tail`);
    const { attacker, defender, city } = request.sides ?? {};
    if (!attacker || !defender || (request.kind.startsWith("siege") && !city))
      throw new RangeError(`native tactical ${request.at} sides shape`);
    const stream = app.originalRng ?? app.activeBattleRng;
    if (
      !stream ||
      typeof stream.snapshot !== "function" ||
      typeof stream.restore !== "function"
    )
      throw new RangeError(
        `native tactical ${request.at} has no canonical RNG stream`,
      );
    if (
      !app.battleView ||
      typeof app.battleView.open !== "function" ||
      !app.battleMaps
    )
      throw new RangeError(
        `native tactical ${request.at} has no battle view/assets`,
      );
    if (typeof app.gamebar?.enqueueTalkMessage !== "function")
      throw new RangeError(
        `native tactical TALK${request.talk} has no UI`,
      );
    const batch = app._legionSlotBatch ?? null;
    const record = {
      scenario: sc,
      batch,
      ticket: batch?.ticket ?? null,
      request,
    };
    const queue = (app._nativeTacticalQueue ??= []);
    queue.push(record);
    // 首场立即显示开场TALK；同tick后续场次排队等前一场结算后再显示。
    if (queue.length === 1) showNativeTacticalOpening(app, record);
  } catch (error) {
    holdFailedStrategicUpdate(app, error);
    throw error;
  }
  return "tactical-suspended";
}
/** v1开场形状复用：攻城TALK27/28带攻方名＋城名，野战TALK29带双方名；
 * P50分支音——攻城攻方TALK28（4F36＋4F58）与野战守方TALK29（4EA1＋4EB9）
 * 双0CDE，其余（攻城守方TALK27、野战攻方TALK29）单0CDE。关闭后开战场。 */
function showNativeTacticalOpening(app, record) {
  const { request } = record;
  const { attacker, defender, city } = request.sides;
  if (request.kind === "siege-attack" || request.kind === "field-defence")
    doubleClickSfx();
  else clickSfx();
  const attackerName = attacker.leader?.trim?.() || "";
  const message = {
    gen: null,
    talkIndex: request.talk,
    onClose: () => openNativeTacticalBattle(app, record),
  };
  if (request.kind.startsWith("siege")) {
    message.generalName = attackerName;
    message.cityName = city.name?.trim?.() || "";
    message.kind =
      request.kind === "siege-defence"
        ? "siege-defence-opening"
        : "siege-attack-opening";
  } else {
    message.generalName = [attackerName, defender.leader?.trim?.() || ""];
    message.kind = "field-battle-opening";
  }
  app.gamebar.enqueueTalkMessage(message);
}
/** 开战：原生记录直进v1 handle构造（六队/士气/slot均原生字段，CBE5按slot
 * 取对手武将+0x16；目录/d35镜像/水战类走原生4B63前缀）。battleView接管时钟
 * 跑A1C5＋9FA0主循环，结束后finishNativeTacticalBattle结算。 */
async function openNativeTacticalBattle(app, record) {
  try {
    const sc = app.scenario;
    if (!record || sc !== record.scenario)
      throw new RangeError("native tactical continuation stale");
    if (app._nativeTacticalQueue?.[0] !== record)
      throw new RangeError("native tactical queue order");
    if (!app.battleView || app.battleView.active)
      throw new RangeError("native tactical battle view busy");
    const stream = app.originalRng ?? app.activeBattleRng;
    if (!stream || typeof stream.snapshot !== "function")
      throw new RangeError("native tactical battle has no RNG stream");
    const { attacker, defender, city } = record.request.sides;
    const handle = record.request.kind.startsWith("siege")
      ? createBattle(
          sc,
          attacker,
          city,
          app.battleMaps,
          defender,
          stream.snapshot(),
        )
      : createFieldBattle(
          sc,
          attacker,
          defender,
          app.battleMaps,
          {
            directoryIndex: record.request.directory,
            mirror: Boolean((record.request.sideFlag ?? 0) & 0x40),
            terrainClass: record.request.terrainClass ?? 0,
          },
          stream.snapshot(),
        );
    await app.battleView.open(handle, (exit) =>
      finishNativeTacticalBattle(app, record, stream, exit),
    );
  } catch (error) {
    holdFailedStrategicUpdate(app, error);
  }
}
/** 退出结算：RNG前进状态写回同一canonical对象→双方六队/士气/城损写回原生
 * 记录→双方474A续行合成ax→resumeTail续跑dispatch尾段。尾段链入更深挂起
 * （去向/灭亡/警告）时由其认领ticket；干净跑完才认领并泵排队下一场。 */
function finishNativeTacticalBattle(app, record, stream, exit) {
  try {
    const queue = app._nativeTacticalQueue ?? [];
    if (queue[0] === record) queue.shift();
    const verdict = applyNativeTacticalExit(app.scenario, record.request, stream, exit);
    // 只补空引用、不替换live对象：dispatch闭包仍持有stream同一引用。
    if (app.originalRng == null) app.originalRng = stream;
    if (app.activeBattleRng == null) app.activeBattleRng = stream;
    const outcome = record.request.resumeTail(verdict);
    if (isRoadSuspended(outcome)) return;
    if (record.batch && record.ticket)
      finishDeferredLegionDaily(app, record.batch, record.ticket);
    pumpNativeTacticalQueue(app);
  } catch (error) {
    holdFailedStrategicUpdate(app, error);
  }
}
function pumpNativeTacticalQueue(app) {
  const next = app._nativeTacticalQueue?.[0];
  if (!next) return;
  try {
    if (app.scenario !== next.scenario)
      throw new RangeError("native tactical continuation stale");
    showNativeTacticalOpening(app, next);
  } catch (error) {
    holdFailedStrategicUpdate(app, error);
  }
}
/** 9FDC退出聚合的原生写回：settleVisualBattle sides统一为[attacker,
 * defender]攻守帧（P48）；双方六队/总兵/士气→原生记录，mode0城损→城池，
 * 再双方474A续行（攻方bit0、守方bit1）合成ax交尾段。纯规则写回，不碰UI。 */
export function applyNativeTacticalExit(sc, request, stream, exit) {
  const atkSide = exit?.sides?.[0];
  const defSide = exit?.sides?.[1];
  if (
    !atkSide ||
    !defSide ||
    (exit.winnerName !== "atk" && exit.winnerName !== "def") ||
    !Array.isArray(atkSide.units) ||
    !Array.isArray(defSide.units)
  )
    throw new RangeError(`native tactical exit shape at ${request.at}`);
  if (!exit.strategicRng || typeof exit.strategicRng.snapshot !== "function")
    throw new RangeError(`native tactical exit RNG at ${request.at}`);
  // Session从快照副本推进：把前进状态restore回canonical同一对象，dispatch
  // 闭包与后续速算继续同一流；不替换引用。
  stream.restore(exit.strategicRng.snapshot());
  const won = exit.winnerName;
  const { attacker, defender, city } = request.sides;
  settleFieldLegion(
    attacker,
    atkSide.troops,
    atkSide.units,
    won === "atk",
    atkSide.morale,
  );
  settleFieldLegion(
    defender,
    defSide.troops,
    defSide.units,
    won === "def",
    defSide.morale,
  );
  if (exit.cityDamage && city) {
    city.growth = exit.cityDamage.growth;
    city.defence = exit.cityDamage.defence;
    city.troops = exit.cityDamage.troops;
    if (city.sim) city.sim.troops = exit.cityDamage.troops;
  }
  let failed = continueLegionAfterBattle(sc, attacker, won === "atk") ? 0 : 1;
  if (!continueLegionAfterBattle(sc, defender, won === "def")) failed |= 2;
  return { ax: (failed << 8) | (won === "atk" ? 0 : 1) };
}
function suspendNativeMonthlyFateMessage(app, sc, result, deferredTail) {
  const stale = app._nativeMonthlyFateContinuation;
  if (stale && stale.scenario === sc)
    throw new RangeError("native monthly fate continuation already pending");
  const { deferred, slot } = result;
  if (typeof app.gamebar?.enqueueTalkMessage !== "function")
    throw new RangeError(`native monthly fate ${deferred.kind} has no UI`);
  app._nativeMonthlyFateContinuation = {
    scenario: sc,
    kind: deferred.kind,
    slot: deferred.slot,
    owner: deferred.owner,
    talkIndex: deferred.talkIndex,
    deferredTail: typeof deferredTail === "function" ? deferredTail : null,
  };
  app._strategicEventPostMessageRngPending = true;
  const general = sc.generals?.[slot];
  app.gamebar.enqueueTalkMessage({
    talkIndex: deferred.talkIndex,
    gen: general,
    generalName: general?.name ?? "",
    onClose: () => resumeNativeMonthlyFate(app),
  });
}

/** 5921/5999消息返回：先commit尾写，再从slot+1续扫585F，最后跑月结尾。 */
export function resumeNativeMonthlyFate(app) {
  const continuation = app?._nativeMonthlyFateContinuation;
  if (!continuation) return false;
  const sc = app?.scenario;
  if (!sc || continuation.scenario !== sc)
    throw new RangeError("native monthly fate continuation scenario mismatch");
  try {
    if (continuation.kind === "recruit-join") {
      commitScenarioRecruitJoinOwnerWrite(
        sc,
        continuation.slot,
        continuation.owner,
      );
    } else if (continuation.kind === "captive-pending") {
      commitScenarioCaptivePendingFactionWrite(sc, continuation.slot);
    } else if (continuation.kind !== "captive-joined") {
      throw new RangeError(
        `unknown monthly fate continuation ${continuation.kind}`,
      );
    }
    const result = performScenarioMonthlyGeneralFatesDeferred(
      sc,
      app.originalRng ?? app.activeBattleRng,
      continuation.slot + 1,
    );
    if (result?.deferred) {
      app._nativeMonthlyFateContinuation = null;
      suspendNativeMonthlyFateMessage(
        app,
        sc,
        result,
        continuation.deferredTail,
      );
      return true;
    }
    app._nativeMonthlyFateContinuation = null;
    app._strategicEventPostMessageRngPending = false;
    continuation.deferredTail?.();
    return true;
  } catch (error) {
    holdFailedStrategicUpdate(app, error);
    throw error;
  }
}

export function processMonthlyGeneralFates(app, deferredTail) {
  const sc = app?.scenario;
  const rng = app?.originalRng ?? app?.activeBattleRng;
  if (sc && (scenarioNativeRoadContext(sc) || hasNativeLegionSlots(sc))) {
    try {
      if (app._nativeMonthlyFateContinuation?.scenario === sc)
        throw new RangeError(
          "native monthly fate continuation already pending",
        );
      const result = performScenarioMonthlyGeneralFatesDeferred(sc, rng, 0);
      if (result?.deferred) {
        suspendNativeMonthlyFateMessage(app, sc, result, deferredTail);
        return "suspended";
      }
      return result;
    } catch (error) {
      holdFailedStrategicUpdate(app, error);
      throw error;
    }
  }
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

/** 5397→5715 then 539A→578F, sharing the post-2BD9 current page. */
export function processMonthlyBudgetProducers(app) {
  const sc = app?.scenario;
  if (sc && hasNativeFactionSlots(sc)) {
    const rng = app?.originalRng ?? app?.activeBattleRng;
    try {
      return performScenarioMonthlyBudgetProducers(sc, rng);
    } catch (error) {
      holdFailedStrategicUpdate(app, error);
      throw error;
    }
  }
  const domestic = enqueueDomesticBudgetEvents(app);
  const reports = prepareEnvoyBudgetReports(sc);
  const envoy = enqueueEnvoyBudgetEvents(app, reports);
  return { domestic, envoy };
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
  if (!sc) return [];
  if (scenarioNativeRoadContext(sc))
    return performScenarioMonthlyWeatherEvents(sc, rng).queued;
  if (!rng || typeof rng.nextByte !== "function") return [];
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

/** 53A6..53BD: exact four-word policy copy, then bounded 5E80 display return. */
export function processMonthlyPolicyActivation(app) {
  const sc = app?.scenario;
  if (sc && hasNativeFactionSlots(sc)) {
    try {
      return performScenarioMonthlyPolicyActivation(sc);
    } catch (error) {
      holdFailedStrategicUpdate(app, error);
      throw error;
    }
  }
  activateNextMonthPolicy(sc);
  return { displayMask: null };
}

/** 0x53A3→0x57FE：玩家负资金达到门槛时，按好战度排type13信赖处罚。 */
export function enqueueDeficitTrustEvent(app) {
  const sc = app?.scenario;
  const rng = app?.originalRng ?? app?.activeBattleRng;
  if (sc && hasNativeFactionSlots(sc)) {
    try {
      return performScenarioDeficitTrustEvent(sc, rng).queued;
    } catch (error) {
      holdFailedStrategicUpdate(app, error);
      throw error;
    }
  }
  const faction = playerFaction(sc);
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
  if (scenarioNativeRoadContext(sc) || hasNativeLegionSlots(sc)) {
    try {
      const step = consumeScenarioStrategicEvent(sc);
      return step.status === "dispatch"
        ? dispatchStrategicEvent(app, step.event)
        : false;
    } catch (error) {
      holdFailedStrategicUpdate(app, error);
      throw error;
    }
  }
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
  rejectNativeGeneralLifecycle(sc, app, "35ED negotiation settlement");
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

// Bounded3485 handler; the enclosing native1D8E event pump remains stopped.
export function dispatchGeneralFateEvent(app, event) {
  const sc = app.scenario;
  if (scenarioNativeRoadContext(sc) || hasNativeLegionSlots(sc)) {
    try {
      performScenarioGeneralFateEvent(sc, event);
      return true; // Web handled marker, not original CF/AX.
    } catch (error) {
      holdFailedStrategicUpdate(app, error);
      throw error;
    }
  }
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

function finishDeferredFactionTick(app) {
  if (!app._factionTickDeferred) return;
  app._factionTickDeferred = false;
  tickFactionStrategicState(app);
  app.hud?.refreshInfo?.();
}

function resumeNativeDisasterAreaEvent(app) {
  const active = app._nativeDisasterAreaContinuation;
  if (!active || active.scenario !== app.scenario)
    throw new RangeError("Uncovered native disaster-area continuation owner");
  const result = continueScenarioDisasterAreaEvent(
    active.scenario,
    active.state,
  );
  if (result.status === "return") {
    delete app._nativeDisasterAreaContinuation;
    app._strategicEventPostMessageRngPending = false;
    finishDeferredFactionTick(app);
    return result.changed;
  }
  const enqueue = app.gamebar?.enqueueTalkMessage;
  if (typeof enqueue !== "function")
    throw new RangeError("Uncovered native TALK70 message return");
  app._strategicEventPostMessageRngPending = true;
  enqueue.call(app.gamebar, {
    gen: null,
    talkIndex: 70,
    cityName: active.scenario.cities[result.index]?.name?.trim?.() || "",
    kind: "disaster-area",
    sound: "warn",
    onClose: () => {
      try {
        resumeNativeDisasterAreaEvent(app);
      } catch (error) {
        holdFailedStrategicUpdate(app, error);
        throw error;
      }
    },
  });
  return true;
}

function dispatchNativeDisasterAreaEvent(app) {
  if (app._nativeDisasterAreaContinuation)
    throw new RangeError("Uncovered overlapping native disaster-area event");
  const sc = app.scenario;
  const state = beginScenarioDisasterAreaEvent(
    sc,
    app.originalRng ?? app.activeBattleRng,
  );
  app._nativeDisasterAreaContinuation = { scenario: sc, state };
  return resumeNativeDisasterAreaEvent(app);
}

function finishNativeDisasterObjectEvent(app) {
  const active = app._nativeDisasterObjectContinuation;
  if (!active || active.scenario !== app.scenario)
    throw new RangeError("Uncovered native disaster-object continuation owner");
  const result = continueScenarioDisasterObjectEvent(
    active.scenario,
    active.state,
    app.originalRng ?? app.activeBattleRng,
  );
  delete app._nativeDisasterObjectContinuation;
  app._strategicEventPostMessageRngPending = false;
  finishDeferredFactionTick(app);
  return result.changed;
}

function dispatchNativeDisasterObjectEvent(app, event) {
  if (app._nativeDisasterObjectContinuation)
    throw new RangeError("Uncovered overlapping native disaster-object event");
  const sc = app.scenario;
  const state = beginScenarioDisasterObjectEvent(sc, event);
  if (state.status === "return") return state.changed;
  if (state.status === "continue") {
    app._nativeDisasterObjectContinuation = { scenario: sc, state };
    return finishNativeDisasterObjectEvent(app);
  }
  const enqueue = app.gamebar?.enqueueTalkMessage;
  if (typeof enqueue !== "function")
    throw new RangeError("Uncovered native TALK71/72 message return");
  app._nativeDisasterObjectContinuation = { scenario: sc, state };
  app._strategicEventPostMessageRngPending = true;
  const cityIndex = (state.cityPointer - 0x0840) >>> 5;
  enqueue.call(app.gamebar, {
    gen: null,
    talkIndex: 70 + state.subtype,
    cityName: sc.cities[cityIndex]?.name?.trim?.() || "",
    kind: "disaster-object",
    sound: "warn",
    onClose: () => {
      try {
        finishNativeDisasterObjectEvent(app);
      } catch (error) {
        holdFailedStrategicUpdate(app, error);
        throw error;
      }
    },
  });
  return true;
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
      finishDeferredFactionTick(app);
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

function finishNativeCapitalRelocation(app, continuation) {
  if (
    app._nativeCapitalRelocationContinuation !== continuation ||
    continuation.scenario !== app.scenario
  )
    throw new RangeError("Uncovered native capital continuation owner");
  app._nativeCapitalRelocationContinuation = null;
  app._strategicEventPostMessageRngPending = false;
  finishDeferredFactionTick(app);
}

function continueNativeCapitalRelocation(app, continuation) {
  try {
    if (
      app._nativeCapitalRelocationContinuation !== continuation ||
      continuation.scenario !== app.scenario ||
      continuation.stage !== "report"
    )
      throw new RangeError("Uncovered native capital report continuation");
    continuation.stage = "reply";
    const { selector, talkStyle, ...reply } = continuation.result.reply;
    const talkIndex = personalityTalkIndex(selector, {
      ...continuation.result.diplomatRecord,
      talk_idx: talkStyle,
    });
    if (!Number.isInteger(talkIndex))
      throw new RangeError("Uncovered native capital reply selector");
    app.gamebar.enqueueTalkMessage({
      gen: continuation.result.diplomatRecord,
      ...reply,
      talkIndex,
      kind: "native-capital-relocation-reply",
      onClose: () => {
        try {
          finishNativeCapitalRelocation(app, continuation);
        } catch (error) {
          holdFailedStrategicUpdate(app, error);
          throw error;
        }
      },
    });
  } catch (error) {
    holdFailedStrategicUpdate(app, error);
    throw error;
  }
}

function dispatchNativeCapitalRelocation(app, event) {
  if (app._nativeCapitalRelocationContinuation)
    throw new RangeError("Uncovered overlapping native capital event");
  const result = performScenarioCapitalRelocation(app.scenario, event);
  if (result.status === "player-message") {
    // 3421..3448: the CFD-word player path shows exactly one monarch
    // personality line (selector 0x1A4 = TALK[518+talk_idx]); the trailing
    // 3445 CALL 5E60 is the 98A6-bit1 UI-field refresh gate — display-only,
    // no rule writes, no RNG — so it is a rule no-op here.
    if (typeof app.gamebar?.enqueueTalkMessage !== "function")
      throw new RangeError("Uncovered native capital TALK return");
    const continuation = {
      scenario: app.scenario,
      result,
      stage: "player",
    };
    app._nativeCapitalRelocationContinuation = continuation;
    app._strategicEventPostMessageRngPending = true;
    const { selector, talkStyle, ...reply } = result.reply;
    const talkIndex = personalityTalkIndex(selector, {
      ...result.monarchRecord,
      talk_idx: talkStyle,
    });
    if (!Number.isInteger(talkIndex))
      throw new RangeError("Uncovered native capital monarch selector");
    app.gamebar.enqueueTalkMessage({
      gen: result.monarchRecord,
      ...reply,
      talkIndex,
      kind: "native-capital-relocation-player",
      onClose: () => {
        try {
          finishNativeCapitalRelocation(app, continuation);
        } catch (error) {
          holdFailedStrategicUpdate(app, error);
          throw error;
        }
      },
    });
    return true;
  }
  if (result.status !== "message") return true;
  if (typeof app.gamebar?.enqueueTalkMessage !== "function")
    throw new RangeError("Uncovered native capital TALK return");
  const continuation = {
    scenario: app.scenario,
    result,
    stage: "report",
  };
  app._nativeCapitalRelocationContinuation = continuation;
  app._strategicEventPostMessageRngPending = true;
  app.gamebar.enqueueTalkMessage({
    gen: null,
    ...result.report,
    kind: "native-capital-relocation-report",
    onClose: () => continueNativeCapitalRelocation(app, continuation),
  });
  return true;
}

function dispatchNativeGenericTalkEvent(app, event) {
  if (app._nativeGenericTalkContinuation)
    throw new RangeError("Uncovered overlapping native generic TALK event");
  if (typeof app.gamebar?.enqueueGenericTalkEvent !== "function")
    throw new RangeError("Uncovered native generic TALK return");
  const payload = decodeScenarioGenericTalkEvent(event);
  if (payload.talkIndex >= 1023)
    throw new RangeError("Uncovered native generic TALK index");
  app._nativeGenericTalkContinuation = { scenario: app.scenario };
  app._strategicEventPostMessageRngPending = true;
  app.gamebar.enqueueGenericTalkEvent({
    talkIndex: payload.talkIndex,
    arg0: payload.arg0,
    argumentWord: payload.argumentWord,
    kind: "native-generic-talk",
    onClose: () => {
      const continuation = app._nativeGenericTalkContinuation;
      if (!continuation || continuation.scenario !== app.scenario) {
        const error = new RangeError(
          "Uncovered native generic TALK continuation owner",
        );
        holdFailedStrategicUpdate(app, error);
        throw error;
      }
      try {
        app._nativeGenericTalkContinuation = null;
        app._strategicEventPostMessageRngPending = false;
        finishDeferredFactionTick(app);
      } catch (error) {
        holdFailedStrategicUpdate(app, error);
        throw error;
      }
    },
  });
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

function finishNativeDeficitTrustEvent(app) {
  const continuation = app._nativeDeficitTrustContinuation;
  if (!continuation || continuation.scenario !== app.scenario)
    throw new RangeError("Uncovered native deficit-trust continuation owner");
  try {
    const result = finishScenarioDeficitTrustEvent(
      app.scenario,
      continuation.state,
    );
    if (result.gameOver) {
      if (typeof app.checkTrustGameOver !== "function")
        throw new RangeError("Uncovered native deficit-trust game-over return");
      app.checkTrustGameOver();
    }
    app._nativeDeficitTrustContinuation = null;
    app._strategicEventPostMessageRngPending = false;
    finishDeferredFactionTick(app);
    return true;
  } catch (error) {
    holdFailedStrategicUpdate(app, error);
    throw error;
  }
}

function continueNativeDeficitTrustEvent(app) {
  const continuation = app._nativeDeficitTrustContinuation;
  if (!continuation || continuation.scenario !== app.scenario)
    throw new RangeError("Uncovered native deficit-trust continuation owner");
  try {
    const state = continueScenarioDeficitTrustEvent(
      app.scenario,
      continuation.state,
    );
    continuation.state = state;
    if (state.phase === "return") {
      app._nativeDeficitTrustContinuation = null;
      app._strategicEventPostMessageRngPending = false;
      finishDeferredFactionTick(app);
      return true;
    }
    const source = app.scenario.generals?.[state.generalIndex];
    if (!source || typeof app.gamebar?.enqueueTalkMessage !== "function")
      throw new RangeError("Uncovered native deficit-trust ruler TALK return");
    const gen = {
      ...source,
      portrait: state.portrait,
      talk_idx: state.personality,
    };
    const talkIndex =
      personalityTalkIndex(state.selector, gen) ?? state.selector;
    app.gamebar.enqueueTalkMessage({
      gen,
      talkIndex,
      kind: "deficit-trust-ruler-rebuke",
      onClose: () => finishNativeDeficitTrustEvent(app),
    });
    return true;
  } catch (error) {
    holdFailedStrategicUpdate(app, error);
    throw error;
  }
}

function dispatchNativeDeficitTrustEvent(app, event) {
  if (app._nativeDeficitTrustContinuation)
    throw new RangeError("Uncovered overlapping native deficit-trust event");
  if (typeof app.gamebar?.enqueueTalkMessage !== "function")
    throw new RangeError("Uncovered native deficit-trust TALK51 return");
  const state = beginScenarioDeficitTrustEvent(event);
  app._nativeDeficitTrustContinuation = { scenario: app.scenario, state };
  // 3E11 cannot continue its faction leaf until both 3507/3DC9 TALK calls return.
  app._strategicEventPostMessageRngPending = true;
  app.gamebar.enqueueTalkMessage({
    gen: null,
    talkIndex: state.talkIndex,
    kind: "deficit-trust-notice",
    onClose: () => continueNativeDeficitTrustEvent(app),
  });
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

function resumeNativeWarEvent(app, continuation) {
  if (
    app._nativeWarEventContinuation !== continuation ||
    continuation.scenario !== app.scenario
  )
    throw new RangeError("Uncovered native type1 continuation owner");
  const state = continuation.state;
  const enqueue = app.gamebar?.enqueueTalkMessage;
  if (typeof enqueue !== "function")
    throw new RangeError("Uncovered native type1 TALK return");
  app._strategicEventPostMessageRngPending = true;
  const finish = () => {
    try {
      if (
        app._nativeWarEventContinuation !== continuation ||
        continuation.scenario !== app.scenario
      )
        throw new RangeError("Uncovered native type1 continuation owner");
      commitScenarioWarEvent(app.scenario, continuation.state);
      app._nativeWarEventContinuation = null;
      app._strategicEventPostMessageRngPending = false;
      finishDeferredFactionTick(app);
    } catch (error) {
      holdFailedStrategicUpdate(app, error);
      throw error;
    }
  };
  // 356E：TALK63 真实关闭后才进入同一8810的第二段君主对白。
  const advance = () => {
    try {
      if (
        app._nativeWarEventContinuation !== continuation ||
        continuation.scenario !== app.scenario
      )
        throw new RangeError("Uncovered native type1 continuation owner");
      continuation.state = continueScenarioWarEvent(
        app.scenario,
        continuation.state,
      );
      resumeNativeWarEvent(app, continuation);
    } catch (error) {
      holdFailedStrategicUpdate(app, error);
      throw error;
    }
  };
  if (state.phase === "aggressor-message") {
    // 3550 CDE → 3570 8810：玩家君主亲自下令，selector CX=0x1A0。
    enqueue.call(app.gamebar, {
      gen: state.monarch,
      talkIndex: personalityTalkIndex(0x1a0, state.monarch),
      targetName: state.targetName,
      advisorName: state.advisorName,
      kind: "native-war-declaration",
      sound: "warn",
      onClose: finish,
    });
    return true;
  }
  if (state.phase === "defender-report") {
    // 3563 CE7 → 356B 8810：TALK63 通用宣战报告，\3 为发起方君主。
    enqueue.call(app.gamebar, {
      gen: null,
      talkIndex: 63,
      targetName: state.aggressorName,
      kind: "native-war-declaration-report",
      sound: "warn",
      onClose: advance,
    });
    return true;
  }
  if (state.phase === "defender-message") {
    // 3570 8810：发起方君主对白，selector CX=0x19F，关闭后才进入358C提交。
    const talkIndex = personalityTalkIndex(0x19f, state.monarch);
    if (!Number.isInteger(talkIndex))
      throw new RangeError("Uncovered native type1 defender selector");
    enqueue.call(app.gamebar, {
      gen: state.monarch,
      talkIndex,
      kind: "native-war-declaration",
      onClose: finish,
    });
    return true;
  }
  throw new RangeError(`Uncovered native type1 phase ${String(state.phase)}`);
}

function dispatchNativeWarEvent(app, event) {
  if (app._nativeWarEventContinuation)
    throw new RangeError("Uncovered overlapping native type1 event");
  const state = beginScenarioWarEvent(app.scenario, event);
  if (state.phase === "return") return true;
  if (state.phase === "commit") {
    commitScenarioWarEvent(app.scenario, state);
    return true;
  }
  const continuation = { scenario: app.scenario, state };
  app._nativeWarEventContinuation = continuation;
  return resumeNativeWarEvent(app, continuation);
}

/** 3258 之后直连的 3526 战争尾段（type1 玩家防守方消息合同复用）。 */
function runNativeAssistanceWarTail(app, warState) {
  const sc = app.scenario;
  if (warState.phase === "return") return true;
  if (warState.phase === "commit") {
    commitScenarioWarEvent(sc, warState);
    return true;
  }
  if (app._nativeWarEventContinuation)
    throw new RangeError("Uncovered overlapping native type2 war tail");
  const continuation = { scenario: sc, state: warState };
  app._nativeWarEventContinuation = continuation;
  return resumeNativeWarEvent(app, continuation);
}

/**
 * 38C7(type3)/38E6(type2) 玩家决定流（实锤，re-notes-ai-diplomacy §36）。
 * 窗口开关(2078/20D6)、三选项(3B7E)与数字键盘(7C6E，上限 0x7530)由
 * gamebar 入站外交模态承担；本函数建立 continuation 并入队模态。
 * 3902 结果门在 resumeNativePlayerDecision 内执行（恰好 1 字节 RNG）。
 */
function enqueueNativePlayerDecision(app, kind, state) {
  const sc = app.scenario;
  if (app._nativePlayerDecisionContinuation)
    throw new RangeError("Uncovered overlapping native player decision");
  if (typeof app.gamebar?.enqueueIncomingDiplomacyRequest !== "function")
    throw new RangeError(`Uncovered native ${kind} player decision UI`);
  const requesterIdx = kind === "assistance" ? state.payer : state.proposer;
  const requesterFaction = factionByIndex(sc, requesterIdx);
  const targetFaction =
    kind === "assistance" ? factionByIndex(sc, state.target) : null;
  if (!requesterFaction || (kind === "assistance" && !targetFaction))
    throw new RangeError(`Uncovered native ${kind} decision factions`);
  // 入站模态显示前置（镜像 gamebar._showIncomingDiplomacyRequest 的同步门）：
  // continuation 不变量为 set ⟺ 可显示；任一缺失必须在 set 之前精确抛出，
  // 否则残留 continuation 会把下一次玩家决定误报为 overlapping（P91 用户报障）。
  const decidingFaction = playerFaction(sc);
  const decidingMonarch =
    decidingFaction && typeof sc.monarchOf === "function"
      ? sc.monarchOf(decidingFaction)
      : null;
  if (!decidingFaction || !decidingMonarch)
    throw new RangeError(`Uncovered native ${kind} decision monarch`);
  // 38C7/38E6 包装：38C7 BX=0xFFFF；38E6 BX=A 攻击目标，供 TALK 占位替换。
  // 先完整构造 payload（含 3C99 个性 strict 读），再 set continuation：
  // 构造期抛错不得残留，否则同上误报 overlapping。
  const continuation = { scenario: sc, kind, state };
  const payload = {
    type: kind === "assistance" ? "incoming-assistance" : "incoming-truce",
    requesterFaction,
    targetFaction,
    result: { outcome: state.outcome, goldRequired: state.fee },
    nativeDecision: {
      kind,
      // 3C99：提问行 = TALK 基(360/373) + 君主个性变体(v>=3 减 3)。
      personality: readScenarioPlayerMonarchPersonality(sc),
      // 7C6E 数字键盘默认输入 0（非 v1 的算法 fee）。
      keypadDefault: 0,
      resolveChoice: (choice, amount) =>
        resumeNativePlayerDecision(app, continuation, choice, amount),
    },
    onResolve: (outcome, fee) =>
      commitNativePlayerDecision(app, continuation, outcome, fee),
  };
  app._nativePlayerDecisionContinuation = continuation;
  app.gamebar.enqueueIncomingDiplomacyRequest(payload);
  return true;
}

/**
 * 3902 决定门 + 3C3D/3DC9 罚则（模态确认时同步执行，RNG 恰好 1 字节）：
 * RNG > 信赖 → 保持 NPC 算法 AL/DX；RNG <= 信赖 → 玩家选择生效，
 * 输入额 > 算法 fee → AL=3（索价过高破裂）→ 3DC9 信赖-30 借位夹 0，
 * 归零 → 1CB1（checkTrustGameOver）。返回 UI 显示所需 TALK 索引。
 */
function resumeNativePlayerDecision(app, continuation, choice, amount) {
  try {
    if (
      app._nativePlayerDecisionContinuation !== continuation ||
      continuation.scenario !== app.scenario
    )
      throw new RangeError("Uncovered native player decision owner");
    const sc = app.scenario;
    const rng = app.originalRng ?? app.activeBattleRng;
    if (typeof rng?.nextByte !== "function")
      throw new RangeError("Uncovered native player decision RNG");
    const code = resolveOriginalPlayerDecisionChoice(choice, amount);
    const resolved = resolveOriginalPlayerDecision({
      kind: continuation.kind,
      algorithmOutcome: continuation.state.outcome,
      algorithmFee: continuation.state.fee,
      choice: code,
      amount,
      rngByte: rng.nextByte(),
      trust: readScenarioPlayerTrust(sc),
    });
    const penalty = applyScenarioPlayerTrustPenalty(sc, resolved.outcome);
    if (penalty.gameOver) app.checkTrustGameOver?.();
    const personality =
      continuation.nativePersonality ??
      (continuation.nativePersonality =
        readScenarioPlayerMonarchPersonality(sc));
    // 3C99 变体：v>=3 减 3（一次）；075B 选择器展开不折叠（直接 talk_idx）。
    const variant = personality >= 3 ? personality - 3 : personality;
    const base = continuation.kind === "assistance" ? 373 : 360;
    // 3C3D 通知行：CX=0x2B(type3)/0x2F(type2)，TALK[CX+min(al,2)]（al=3 映为 2）。
    const notifyBase = continuation.kind === "assistance" ? 0x2f : 0x2b;
    return {
      outcome: resolved.outcome,
      fee: resolved.fee,
      responseTalk: resolved.responseTalk + variant,
      advisorTalk: base + 4 + code,
      notifyTalk: notifyBase + Math.min(resolved.outcome, 2),
      // 3DC9 借位 → CX=0x19E，075B 展开为 470+talk_idx 解任台词（信赖归零）。
      praiseTalk:
        penalty.selector === 0x19e
          ? personalityTalkIndex(0x19e, { talk_idx: personality })
          : null,
    };
  } catch (error) {
    holdFailedStrategicUpdate(app, error);
    throw error;
  }
}

/**
 * 3290/324B：AL>=2 拒绝返回（outcome 3 罚则已在 resume 完成）；AL<2 进
 * 3297(type3)/3258(type2) 提交。type2 接受后直连 3526 战争尾段。
 */
function commitNativePlayerDecision(app, continuation, outcome, fee) {
  try {
    if (
      app._nativePlayerDecisionContinuation !== continuation ||
      continuation.scenario !== app.scenario
    )
      throw new RangeError("Uncovered native player decision owner");
    app._nativePlayerDecisionContinuation = null;
    if (outcome >= 2) return;
    const sc = app.scenario;
    const rng = app.originalRng ?? app.activeBattleRng;
    if (continuation.kind === "truce") {
      commitScenarioTruceEvent(
        sc,
        { ...continuation.state, phase: "commit", outcome, fee },
        rng,
      );
      return;
    }
    const warState = settleScenarioAssistanceEvent(
      sc,
      { ...continuation.state, phase: "settle", outcome, fee },
      rng,
    );
    runNativeAssistanceWarTail(app, warState);
  } catch (error) {
    holdFailedStrategicUpdate(app, error);
    throw error;
  }
}

/**
 * Web 生命周期卫生（P91 用户报障）：UI 绑定的 native continuation 只属于
 * 当前剧本。resetScenarioUi 丢弃战略消息 FIFO 时已明示抛弃旧闭包；
 * 此处把同类的三枚 app 级 continuation 一并废除，供剧本卸载/装配调用。
 * resume/commit 的 owner 门本就预期 abandonment，此为其补全。
 * 纯 Web 工程，不涉及 KI 机制。
 */
export function clearNativeUiContinuations(app) {
  if (!app) return;
  app._nativePlayerDecisionContinuation = null;
  app._nativeWarEventContinuation = null;
  app._nativeEnvoyResultContinuation = null;
  // 预算接见 continuation 同为 UI 绑定：剧本卸载/装配时不断开，下一次
  // 预算事件即抛 overlapping（其 commit 的 owner 门只认同 scenario）。
  app._nativeBudgetContinuation = null;
}

/** 剧本提交/回标题同时废除旧规则挂起continuation：挂起中的消息模态属于
 * 旧剧本，其resume带有旧scenario/ticket，load后触发只会抛
 * scenario-mismatch冻新局；load本身整体替换剧本，丢尾与收批同理。 */
export function clearNativeSuspendContinuations(app) {
  if (!app) return;
  app._nativeExtinctionContinuation = null;
  app._nativeDiplomatContinuation = null;
  app._nativeGovernorContinuation = null;
  app._nativeSiegeWarningContinuation = null;
}

/** 3262 type3 truce：NPC 直接提交；接收方为玩家时进入 38C7 决定流。 */
function dispatchNativeTruceEvent(app, event) {
  const sc = app.scenario;
  const rng = app.originalRng ?? app.activeBattleRng;
  const state = beginScenarioTruceEvent(sc, event, rng);
  if (state.phase === "return") return true;
  if (state.phase === "player-decision")
    return enqueueNativePlayerDecision(app, "truce", state);
  commitScenarioTruceEvent(sc, state, rng);
  return true;
}

/**
 * 3220 type2 cooperation：NPC 直接 3258 结账；受邀方为玩家时进入 38E6
 * 决定流。接受的 NPC 事件先支付，再直连 3526 战争尾段；和平玩家防守方
 * 复用 type1 8810 continuation 合同。
 */
function dispatchNativeAssistanceEvent(app, event) {
  const sc = app.scenario;
  const rng = app.originalRng ?? app.activeBattleRng;
  const state = beginScenarioAssistanceEvent(sc, event, rng);
  if (state.phase === "return") return true;
  if (state.phase === "player-decision")
    return enqueueNativePlayerDecision(app, "assistance", state);
  const warState = settleScenarioAssistanceEvent(sc, state, rng);
  return runNativeAssistanceWarTail(app, warState);
}

/**
 * 32A9 type4 内政官月度预算：32B6 门（[city+19]==FF 静默消费）后把
 * 39E8 对话交给 gamebar 预算接见流；提交在 commitNativeBudgetEvent
 * （3AD9..3AF5 实锤顺序：先写武将+1A，再 563B 扣款）。39E8 全程 0 RNG。
 */
function dispatchNativeDomesticBudgetEvent(app, event) {
  const sc = app.scenario;
  const state = beginScenarioDomesticBudgetEvent(sc, event);
  if (state.phase === "return") return true;
  return enqueueNativeBudgetAudience(app, state);
}

/** 32E9 type5 外交官月度维持费：32F4 门（[faction+2A]==FF 静默消费）。 */
function dispatchNativeEnvoyBudgetEvent(app, event) {
  const sc = app.scenario;
  const state = beginScenarioEnvoyBudgetEvent(sc, event);
  if (state.phase === "return") return true;
  return enqueueNativeBudgetAudience(app, state);
}

function enqueueNativeBudgetAudience(app, state) {
  const sc = app.scenario;
  if (app._nativeBudgetContinuation)
    throw new RangeError("Uncovered overlapping native budget audience");
  const domestic = state.kind === "domestic";
  const enqueue = domestic
    ? app.gamebar?.enqueueDomesticBudgetReport
    : app.gamebar?.enqueueEnvoyBudgetReport;
  if (typeof enqueue !== "function")
    throw new RangeError(
      `Uncovered native type${domestic ? 4 : 5} audience UI`,
    );
  const general = sc.generals?.[state.general];
  if (!general) throw new RangeError("Uncovered native budget general");
  const continuation = { scenario: sc, state };
  app._nativeBudgetContinuation = continuation;
  // 7C6E 键盘默认值实锤为 0（7CA2 xor si,si），非 v1 的建议额。
  const nativeBudget = {
    kind: state.kind,
    keypadDefault: 0,
    commit: (grant, outcome) =>
      commitNativeBudgetEvent(app, continuation, grant, outcome),
  };
  if (domestic)
    enqueue.call(app.gamebar, {
      cityIdx: state.city,
      requested: state.suggested,
      nativeGeneral: state.general,
      nativeBudget,
    });
  else
    enqueue.call(app.gamebar, {
      targetIdx: state.faction,
      requested: state.suggested,
      nativeGeneral: state.general,
      nativeBudget,
    });
  return true;
}

/**
 * 39E8 提交边界：outcome==2（拒绝/键盘 0）无任何写入；建议额 0 的
 * 3A31 零请求路径在原版不初始化结果槽（栈垃圾），正常域内无可见规则
 * 差异（推断，§37），Web 取不提交。其余先写 +1A 再 563B 扣款。
 */
function commitNativeBudgetEvent(app, continuation, grant, outcome) {
  try {
    if (
      app._nativeBudgetContinuation !== continuation ||
      continuation.scenario !== app.scenario
    )
      throw new RangeError("Uncovered native budget continuation owner");
    if (continuation.state.suggested === 0 || outcome === 2) {
      app._nativeBudgetContinuation = null;
      return;
    }
    commitScenarioBudgetEvent(app.scenario, {
      phase: "commit",
      general: continuation.state.general,
      outcome,
      grant,
    });
    app._nativeBudgetContinuation = null;
  } catch (error) {
    holdFailedStrategicUpdate(app, error);
    throw error;
  }
}

/**
 * 3327 type6 玩家停战使者结果：入口门后 TALK57（8810）真实关闭才执行
 * 36C4（此点消费 3771 RNG）；CF → TALK58 后返回；否则 3C3D(CX=2Bh)
 * TALK[43+min(AL,2)] 关闭后 AL<2 才提交 3371 链（35ED→45F8→4236→3669）。
 */
function dispatchNativeTruceEnvoyResult(app, event) {
  if (app._nativeEnvoyResultContinuation)
    throw new RangeError("Uncovered overlapping native envoy result");
  const state = beginScenarioTruceEnvoyResult(app.scenario, event);
  if (state.phase === "return") return true;
  const continuation = {
    scenario: app.scenario,
    state: describeEnvoyResultMessageState(app.scenario, state),
  };
  app._nativeEnvoyResultContinuation = continuation;
  return resumeNativeEnvoyResult(app, continuation);
}

/** 3388 type7 玩家请援使者结果（同一消息合同，3C3D CX=2Fh）。 */
function dispatchNativeAssistanceEnvoyResult(app, event) {
  if (app._nativeEnvoyResultContinuation)
    throw new RangeError("Uncovered overlapping native envoy result");
  const state = beginScenarioAssistanceEnvoyResult(app.scenario, event);
  if (state.phase === "return") return true;
  const continuation = {
    scenario: app.scenario,
    state: describeEnvoyResultMessageState(app.scenario, state),
  };
  app._nativeEnvoyResultContinuation = continuation;
  return resumeNativeEnvoyResult(app, continuation);
}

function resumeNativeEnvoyResult(app, continuation) {
  const sc = app.scenario;
  const enqueue = app.gamebar?.enqueueTalkMessage;
  if (typeof enqueue !== "function")
    throw new RangeError("Uncovered native envoy result TALK return");
  const state = continuation.state;
  const diplomat = state.diplomatGeneral;
  if (!diplomat) throw new RangeError("Uncovered native envoy diplomat");
  const factionName = state.factionName ?? "";
  app._strategicEventPostMessageRngPending = true;
  const checkOwner = () => {
    if (
      app._nativeEnvoyResultContinuation !== continuation ||
      continuation.scenario !== app.scenario
    )
      throw new RangeError("Uncovered native envoy result owner");
  };
  // 消息链中段（TALK57→36C4/3712→后续）：只校验所有权，不清 RNG 挂起。
  const advance = (fn) => () => {
    try {
      checkOwner();
      fn();
    } catch (error) {
      holdFailedStrategicUpdate(app, error);
      throw error;
    }
  };
  // 终止消息（TALK58 / 拒绝 / type6 提交）关闭后才清挂起并补拍。
  const finish = (fn) => () => {
    try {
      checkOwner();
      fn();
      app._strategicEventPostMessageRngPending = false;
      finishDeferredFactionTick(app);
    } catch (error) {
      holdFailedStrategicUpdate(app, error);
      throw error;
    }
  };
  if (state.phase === "report") {
    // 3339/33A5：CDE 蜂鸣 + 8810 TALK57，\1=外交官名、\3=派驻势力君主名。
    enqueue.call(app.gamebar, {
      gen: null,
      talkIndex: 57,
      generalName: diplomat.name?.trim?.() ?? "",
      targetName: factionName,
      kind: `native-${state.kind}-envoy-report`,
      onClose: advance(() => {
        const rng = app.originalRng ?? app.activeBattleRng;
        continuation.state = describeEnvoyResultMessageState(
          sc,
          state.kind === "truce"
            ? scenarioTruceEnvoyOutcome(sc, state, rng)
            : scenarioAssistanceEnvoyOutcome(sc, state, rng),
        );
        resumeNativeEnvoyResult(app, continuation);
      }),
    });
    return true;
  }
  if (state.phase === "report-failed") {
    // 3362/33CE：8810 TALK58「敵方的君主已不在了。」，AL=[外交官+1]君主号。
    enqueue.call(app.gamebar, {
      gen: diplomat,
      talkIndex: state.talkIndex,
      generalName: diplomat.name?.trim?.() ?? "",
      targetName: factionName,
      kind: `native-${state.kind}-envoy-failed`,
      onClose: finish(() => {
        app._nativeEnvoyResultContinuation = null;
      }),
    });
    return true;
  }
  if (state.phase === "notify") {
    // 3C3D：TALK[CX+min(AL,2)]；AL>=2 拒绝返回，AL<2 关闭后提交。
    const talkIndex = state.notifyTalkBase + Math.min(state.outcome, 2);
    enqueue.call(app.gamebar, {
      gen: null,
      talkIndex,
      targetName: factionName,
      kind: `native-${state.kind}-envoy-notify`,
      onClose: () => {
        try {
          checkOwner();
          if (state.outcome >= 2 || state.kind === "truce") {
            if (state.outcome < 2)
              commitScenarioTruceEnvoyResult(sc, {
                phase: "commit",
                target: state.target,
                proposer: state.proposer,
                outcome: state.outcome,
                fee: state.fee,
              });
            app._nativeEnvoyResultContinuation = null;
            app._strategicEventPostMessageRngPending = false;
            finishDeferredFactionTick(app);
            return;
          }
          const warState = commitScenarioAssistanceEnvoyResult(sc, {
            phase: "commit",
            ally: state.ally,
            target: state.target,
            payer: state.payer,
            outcome: state.outcome,
            fee: state.fee,
          });
          app._nativeEnvoyResultContinuation = null;
          // 先交出 RNG 挂起，战争尾段若需消息会自行重新挂起并在其
          // finish 中补拍；无消息（return/commit 直落）时在此补拍。
          app._strategicEventPostMessageRngPending = false;
          runNativeAssistanceWarTail(app, warState);
          if (!app._nativeWarEventContinuation) finishDeferredFactionTick(app);
        } catch (error) {
          holdFailedStrategicUpdate(app, error);
          throw error;
        }
      },
    });
    return true;
  }
  throw new RangeError(
    `Uncovered native envoy result phase ${String(state.phase)}`,
  );
}

function dispatchStrategicEvent(app, event) {
  const sc = app.scenario;
  if (scenarioNativeRoadContext(sc) || hasNativeLegionSlots(sc)) {
    if (event?.type === 1) return dispatchNativeWarEvent(app, event);
    if (event?.type === 2) return dispatchNativeAssistanceEvent(app, event);
    if (event?.type === 3) return dispatchNativeTruceEvent(app, event);
    if (event?.type === 4) return dispatchNativeDomesticBudgetEvent(app, event);
    if (event?.type === 5) return dispatchNativeEnvoyBudgetEvent(app, event);
    if (event?.type === 6) return dispatchNativeTruceEnvoyResult(app, event);
    if (event?.type === 7)
      return dispatchNativeAssistanceEnvoyResult(app, event);
    if (event?.type === 8) return dispatchNativeCapitalRelocation(app, event);
    if (event?.type === 9) return dispatchGeneralFateEvent(app, event);
    if (event?.type === 10) return dispatchNativeGenericTalkEvent(app, event);
    if (event?.type === 11) return dispatchNativeDisasterAreaEvent(app);
    if (event?.type === 12)
      return dispatchNativeDisasterObjectEvent(app, event);
    if (event?.type === 13) return dispatchNativeDeficitTrustEvent(app, event);
    throw new RangeError(
      `Uncovered native strategic event type ${String(event?.type)}`,
    );
  }
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
  if (scenarioNativeRoadContext(sc) || hasNativeFactionSlots(sc)) {
    try {
      performScenarioFactionTick(sc, app.originalRng ?? app.activeBattleRng);
      return true;
    } catch (error) {
      holdFailedStrategicUpdate(app, error);
      throw error;
    }
  }
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

// Native daily/tail consumers must not use legacy numeric defaults. KI source
// 2600..2661 / 562B..5662 and the named funds/byte21 bridge: march §3.13.
function originalDailyUnsigned(value, maximum, instruction) {
  if (!Number.isInteger(value) || value < 0 || value > maximum)
    throw new RangeError(
      `Uncovered native legion settlement at ${instruction}`,
    );
  return value;
}

function settleOriginalEnteredLegionDaily(sc, legion) {
  const troops = originalDailyUnsigned(legion.troops, 0xffff, "2609 L04");
  const current = originalDailyUnsigned(
    legion.roadEdgeOrNode,
    0xffff,
    "260C L0E",
  );
  const edge = current >= 0x800;
  const cost = edge ? (troops >>> 1) + (troops >>> 2) : (troops >>> 5) + 1;
  const factionAt = (instruction) => {
    const owner = originalDailyUnsigned(legion.faction, 255, instruction);
    const faction =
      owner < 24 && sc.factions.find((item) => item.idx === owner);
    if (!faction)
      throw new RangeError(
        `Uncovered native faction address at ${instruction}`,
      );
    return faction;
  };
  const faction = factionAt(edge ? "261D L01" : "262B L01");
  // Existing Web funds alias: explicit gold owns the value, otherwise money.
  // 563D/5640 subtract in 24 bits; 5649..5657 impose only the signed lower cap.
  const funds = Object.hasOwn(faction, "gold") ? faction.gold : faction.money;
  if (!Number.isInteger(funds) || funds < -0x800000 || funds > 0x7fffff)
    throw new RangeError("Uncovered native signed24 funds at 563D");
  let next = (funds - cost) & 0xffffff;
  if (next & 0x800000) next -= 0x1000000;
  next = Math.max(-655000, next);
  faction.gold = next;
  faction.money = next;
  if (edge) return; // 2623: never read F1D/L06 on this branch.
  const moraleFaction = factionAt("2631 L01");
  const cap = originalDailyUnsigned(
    moraleFaction.legion_morale_cap,
    255,
    "263A F1D",
  );
  const morale = originalDailyUnsigned(legion.morale, 255, "263D L06");
  legion.morale = (morale + 10) & 255;
  if (originalDailyUnsigned(legion.morale, 255, "2641 L06") >= cap)
    legion.morale = cap;
}

function finishOriginalLegionSlotTail(record) {
  const status = originalDailyUnsigned(record.status, 255, "264A L00");
  if (status & 0x20) {
    record.engagementCountdown = (legionSlotCounter(record) - 1) & 255;
    if (record.engagementCountdown === 0) record.engagementCountdown = 1;
  } else {
    record.engagementCountdown = 0; // 264F, before the separate 2653 write.
    record.contactAnimationByte21 = 0;
  }
}

function settleEnteredLegionDaily(sc, legion) {
  if (scenarioNativeRoadContext(sc))
    return settleOriginalEnteredLegionDaily(sc, legion);
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

/**
 * 1D0B 首指令统一胜利门（native 场景，v1 不动）：D2A≡活跃势力数==1 时
 * 进入 1D20 胜利分支——CDE beep、TALK[75] 宣告、君主个性行
 * （选择器 0x197→TALK[414+talk_idx]），关闭后 AL=2→1CB1→D7END
 * 结局（END_S1..12 循环）。一次性（nativeUnificationShown 持久护栏），
 * 0 RNG；缺消息/结局基础设施 fail-closed。
 */
export function dispatchNativeUnificationGate(app) {
  const sc = app.scenario;
  if (!hasNativeFactionSlots(sc)) return false;
  if (sc.nativeUnificationShown) return false;
  if (countNativeAliveFactions(sc) !== 1) return false;
  if (typeof app.gamebar?.enqueueTalkMessage !== "function")
    throw new RangeError("Uncovered native unification TALK return");
  if (typeof app.endView?.show !== "function")
    throw new RangeError("Uncovered native unification D7END return");
  sc.nativeUnificationShown = true;
  warnSfx(); // 1D20: CALL 0CDE（PC 喇叭 beep）
  const monarch = resolveNativeVictoryMonarch(sc);
  app.gamebar.enqueueTalkMessage({
    gen: null,
    talkIndex: NATIVE_UNIFICATION_TALK_INDEX,
    kind: "native-unification",
  });
  app.gamebar.enqueueTalkMessage({
    gen: monarch,
    talkIndex: personalityTalkIndex(
      NATIVE_UNIFICATION_MONARCH_SELECTOR,
      monarch,
    ),
    kind: "native-unification-monarch",
    onClose: () => {
      try {
        // 1CB1 AL=2 → YNVSHELL→D7END.EXE：END_S1..12 循环播放至点击退出。
        app.endView.show({
          sequence: Array.from(
            { length: 12 },
            (_, i) => `grf/end_s${i + 1}.png`,
          ),
        });
      } catch (error) {
        holdFailedStrategicUpdate(app, error);
        throw error;
      }
    },
  });
  return true;
}

export function aiTick(app, options = {}) {
  if (
    app._strategicCityRequest ||
    app._legionSlotBatch ||
    app._strategicBattleFailure
  ) {
    if (!scenarioNativeRoadContext(app.scenario)) return undefined;
    return app._strategicBattleFailure ? "failed" : "pending";
  }
  if (app.battleView?.active || app.engageTransition?.active)
    return scenarioNativeRoadContext(app.scenario) ? "pending" : undefined;
  if (!app.scenario?.legions) return;
  if (scenarioNativeRoadContext(app.scenario)) {
    const scenario = app.scenario,
      clock = app.clock;
    try {
      if (dispatchNativeUnificationGate(app)) return "pending";
      if (Number.isInteger(options.cityIndex)) {
        if (
          options.cityIndex < 0 ||
          options.cityIndex >= 192 ||
          scenario.cities?.[options.cityIndex]?.idx !== options.cityIndex
        )
          throw new RangeError("Uncovered city cursor at 3EFD");
        tickStrategicCity(app, options.cityIndex);
      } else if (options.runCityDaily !== false) {
        throw new RangeError(
          "Uncovered native update requires explicit cityIndex",
        );
      }
      finishStrategicCityUpdate(app, options);
      if (app._strategicBattleFailure) return "failed";
      return app._legionSlotBatch ? "pending" : "returned";
    } catch (error) {
      if (app.scenario === scenario && app.clock === clock)
        holdFailedStrategicUpdate(app, error);
      return "failed";
    }
  }
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
  const native = scenarioNativeRoadContext(sc);
  if (Number.isInteger(options.cityIndex)) {
    if (native) {
      const city = sc.cities[options.cityIndex];
      governOriginalCity(
        sc,
        native,
        city,
        app.originalRng ?? app.activeBattleRng,
      );
      damageOriginalCity(city);
      sc._cityTickCursor = (options.cityIndex + 1) % 192; // 3F6F, once after 4269 RET.
    } else
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
    if (native)
      throw new RangeError("Uncovered native legacy faction-tick tool hook");
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
    const record = scenarioNativeRoadContext(sc)
      ? nativeLegionAt(sc, slot, "L00 at 25B6")
      : (sc.legions.find((item) => item.slot === slot) ??
        sc.delayedLegionReturns?.find((item) => item.slot === slot));
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
        // 25FF commits before 2459; a weather failure retains this cursor.
        if (scenarioNativeRoadContext(sc)) {
          sc._legionBatchCursor = batch.cursor.endSlot % 128;
          // Read the same current RNG at the weather boundary, after all slots.
          batch.changed =
            tickOriginalStrategicWeather(
              sc,
              app.originalRng ?? app.activeBattleRng,
            ) || batch.changed;
        } else {
          // Fetch canonical RNG NOW: tactical return can replace its object.
          batch.changed =
            tickStrategicWeather(sc, app.originalRng ?? app.activeBattleRng) ||
            batch.changed;
        }
        if (hasNativeLegionSlots(sc)) rebindNativeLegionViews(sc);
        else sc.legions = sc.legions.filter((record) => !record.dead);
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
        if (scenarioNativeRoadContext(sc))
          finishOriginalLegionSlotTail(op.record);
        else finishLegionSlotTail(op.record);
        if (!(op.record.status & ENGAGE_STATUS_ACTIVE))
          clearEngagement(op.record);
      } else {
        // Publish the ticket BEFORE calling code that may synchronously
        // invoke a test callback. The cursor is already at the continuation.
        const ticket = { completed: false };
        batch.ticket = ticket;
        let outcome;
        if (op.kind === "inactive" && scenarioNativeRoadContext(sc)) {
          outcome = performScenarioLegionFate(
            sc,
            op.record,
            scenarioNativeRoadContext(sc),
            "2A7E",
            undefined,
            undefined,
            {
              onPlayerDelayedReturn: () => {
                const general = sc.generals?.[op.record.generalIdx];
                app.gamebar?.clickSfx?.(); // 2AB2 CDE before TALK35.
                if (!app.gamebar?.enqueueTalkMessage)
                  throw new RangeError(
                    "Web engineering Uncovered native TALK35 queue",
                  );
                app.gamebar.enqueueTalkMessage({
                  gen: general,
                  talkIndex: 35,
                  generalName:
                    general?.name?.trim?.() || op.record.leader || "",
                  personalitySelector: 0x198,
                  kind: "postbattle-general-return",
                  onComplete: () =>
                    finishDeferredLegionDaily(app, batch, ticket),
                });
                return "suspended";
              },
            },
          );
        } else {
          outcome =
            op.kind === "inactive"
              ? tickDelayedLegionReturn(app, op.record)
              : performLegionSlotAction(app, op.record);
        }
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

/** Detached-chain message blocks (P55-C09-2d): app-threading for captures
 * reached through road-movement sieges. Each closure suspends through the
 * same continuations as the attached-battle branch; absent gamebar or a
 * mismatched scenario fails closed at suspend time, never at build time. */
function buildNativeSiegeBlocks(app, sc, A, context) {
  if (!context) return undefined;
  const captor = A?.faction;
  return {
    onDiplomatBlock: (deadOwner, diplomat, diplomatTail, captureTail) =>
      suspendNativeDiplomatReport(
        app,
        sc,
        deadOwner,
        captor,
        context,
        diplomat,
        diplomatTail,
        captureTail,
      ),
    onGovernorBlock: (governorCtx, governorTail) =>
      suspendNativeGovernorReport(app, sc, governorCtx, governorTail),
    onPlayerDead: (deadOwner) => triggerNativePlayerDefeat(app, sc, deadOwner),
    // 去向挂起通道：2977/29C3玩家消息（TALK31/32/33/34/67，去向§4现刷）
    // 挂起显示并让出批处理；关闭后无尾写，直接认领ticket续跑。
    // 缺失时内核保持历史stop（裸叶合同）。
    onPlayerFateMessage: ({ talk, slot }) =>
      suspendNativeBattleFateMessage(app, sc, { talk, slot }),
    // 灭亡挂起通道：行军攻城破城致他势力灭亡时，5042 TALK36 挂起并延后
    // 4D2A 尾（去向§19.7），不再沿历史hold冻时钟。
    onExtinctionBlock: (deadOwner, extinctCaptor, captureTail) =>
      suspendNativeExtinctionTalk36(
        app,
        sc,
        deadOwner,
        extinctCaptor,
        context,
        captureTail,
      ),
    // 4F06裁决通道：AI破玩家城守备队快战胜后，先挂起警告/TALK26
    // （消息审计§3.1：4F06→4F71），关闭后才续跑易主。
    onSiegeWarning26: ({ attacker, cityIndex, resumeTail }) =>
      suspendNativeSiegeWarning26(app, sc, { attacker, cityIndex, resumeTail }),
    // 战术挂起通道：原生4F36/4F13/4E82/4EA1玩家战术入口——开场TALK27/28/29
    // 后进v1战术引擎，退出写回原生记录并续跑dispatch尾段。通道缺失则入口层
    // 历史stop（裸叶合同，单测锁定）。
    onTacticalBattle: (request) =>
      suspendNativeTacticalBattle(app, sc, request),
  };
}
/** 行军驱动挂起归一化：各 "*-suspended"（总督/外交官/灭亡/4F06警告）
 * 一律让出批处理；其余道路返回（moved/contact/siege-battle/fate/
 * arrived/blocked/reversed/waiting/player-defeated）沿历史形状处理。 */
function isRoadSuspended(outcome) {
  return typeof outcome === "string" && outcome.endsWith("-suspended");
}
function performLegionSlotAction(app, A) {
  const sc = app.scenario;
  const native = scenarioNativeRoadContext(sc);
  if (native) {
    // Web _retreat lifecycle mirror of the arrival branch below: the marker
    // lives only until the slot acts while positioned at the retreat
    // destination node. DOS has no such marker (2662→28F4→4325 just
    // processes arrival); without this mirror every native retreat keeps a
    // permanent stale marker after walking home (P74 debug: arrived with
    // cs 8→1→0 while _retreat stayed set). The v1 body clears it at
    // legionAtTargetNode; native arrival runs inside
    // performOriginalRoadAction, so clear here. Destination-only: passing
    // through other nodes never matches _retreat.nodeId.
    if (
      A._retreat &&
      Number.isInteger(A._retreat.nodeId) &&
      rawRoadNodeId(A.roadEdgeOrNode) === A._retreat.nodeId
    )
      A._retreat = null;
    // 行军驱动挂起（总督/外交官/灭亡/4F06警告）必须让出批处理，由消息
    // 关闭时的 resume 续跑尾段并认领 ticket；其余道路返回沿历史形状记
    // "complete"，泵行为不变。"player-defeated" 不在此列：终局模态自带
    // hold，循环顶的 endView 检查负责收批。
    // Web表现层进给（v1分支A.prevX=A.x镜像）：原生泵每动作提交一整道路点
    // 且从不维护prevX/prevY（b2）；地图lerp（getLegionRenderPos）按天周期在
    // prev→current间插值。没有每动作原点，图标每天跳回出征/战败起点再滑出
    // （战败撤退即用户所见“在路上和进攻据点之间反复跳”）。只补prev不补serial
    // 会在每次动作边界产生±hop跳变（抖动）：必须同时写_renderMoveSerial，
    // lerp按 (elapsed+t)/(8*movePeriod) 收敛，覆盖两/三轮槽访问而非仅一轮；
    // 动作边界两端都是旧current。规则层永不读prev/serial（仅渲染消费）。
    A.prevX = A.x;
    A.prevY = A.y;
    A._renderMoveSerial = app.clock?.strategicTickSerial;
    const outcome = performOriginalRoadAction(
      sc,
      A,
      native,
      app.originalRng ?? app.activeBattleRng,
      buildNativeSiegeBlocks(app, sc, A, native),
    );
    return isRoadSuspended(outcome) ? "suspended" : "complete";
  }
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
    const blocks = buildNativeSiegeBlocks(
      app,
      sc,
      A,
      scenarioNativeRoadContext(sc),
    );
    const result = stepTo(sc, A, A.target.x, A.target.y, blocks);
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
  const result = stepTo(
    sc,
    A,
    target.x,
    target.y,
    buildNativeSiegeBlocks(app, sc, A, scenarioNativeRoadContext(sc)),
  );
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
