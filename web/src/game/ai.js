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
} from "./legionunits.js";
import { personalityTalkIndex } from "./talk.js";

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
  const raw = cityRawBytes(city);
  return raw?.[0] ?? city?.attr ?? 0;
}

function legionTargetCity(sc, legion) {
  if (legion?.target?.idx != null)
    return sc.cities.find((city) => city?.idx === legion.target.idx) ?? null;
  if (legion?.targetCity != null)
    return sc.cities.find((city) => city?.idx === legion.targetCity) ?? null;
  return null;
}

function legionFaction(sc, legion) {
  return sc.factions.find((faction) => faction?.idx === legion.faction) ?? null;
}

function legionAtTargetNode(sc, legion) {
  if (
    legion?.target &&
    legion.target.x === legion.x &&
    legion.target.y === legion.y
  )
    return true;
  if (!legion?.target && !Number.isInteger(legion?.targetNode)) {
    return sc.cities.some((city) => city.x === legion.x && city.y === legion.y);
  }
  const currentNode = legion?._march?.currentNode ?? legion?.roadEdgeOrNode;
  return (
    Number.isInteger(legion?.targetNode) &&
    Number.isInteger(currentNode) &&
    legion.targetNode === currentNode
  );
}

/**
 * KI.EXE 0x4325：只在军团到达命令目标节点时运行的12态命令机。
 * 返回 true 表示本轮已重写状态/目标，应由调用方继续按新目标处理。
 */
function settleArrivedLegionCommand(sc, legion, rng = null) {
  if (!legionAtTargetNode(sc, legion)) return false;
  const faction = legionFaction(sc, legion);
  if (!faction) return false;
  const fiscalCrisis = ((faction.attr ?? 0) & 0x40) !== 0;
  const targetCity = legionTargetCity(sc, legion);
  const targetAttr = cityAttr(targetCity);
  if (legion.commandState == null) return false;
  const state = legion.commandState;
  // 0x433D..0x434C：NPC 的0..3态偏移到处理器4..7；玩家保留0..3。
  const handler =
    state < 4 && legion.faction !== sc.player_faction ? state + 4 : state;

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
      // 0x439D→0x43A5：NPC状态0。到达首都先检查补员；否则目标城
      // attr bit6清零时转1，置位时保持0。这里不是势力财政bit6。
      if ((legion.troops ?? 0) < 600 && targetCity?.idx === faction.capital) {
        legion.commandState = 9;
        return true;
      }
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
      if (targetAttr < 0x80 || state5AliasedByte(sc, targetCity) <= 2) {
        legion.cooldown = ((rng?.nextByte?.() ?? 0) & 7) + 1;
        legion.commandState = 2;
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
      // 0x44A9：状态10持续锁定首都；到达首都且兵力不足时转状态9。
      const capital = sc.cities[faction.capital];
      if (!capital) return false;
      if (legionTargetCity(sc, legion)?.idx !== capital.idx) {
        legion.target = capital;
        legion.targetNode = roadNodeAt(capital.x, capital.y)?.id ?? null;
        legion.commandState = 10;
        return true;
      }
      if (legionAtTargetNode(sc, legion) && (legion.troops ?? 0) < 600) {
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
export function tickStrategicCity(app, cityIndex) {
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
  if (
    hostileNeighbours.length &&
    localStrength < 1 &&
    city.faction === sc.player_faction
  ) {
    if ((city._aiCooldown ?? 0) > 0) return false;
    const rng = app.originalRng ?? app.activeBattleRng;
    const random = rng?.nextByte?.() ?? 0;
    city._aiCooldown = 0x18 + (random & 0x0f);
    rememberFactionStrategicCity(
      sc,
      city.faction,
      "strategic_city_primary",
      city.idx,
    );
    app.gamebar?.enqueueTalkMessage?.({
      gen: null,
      talkIndex: 38,
      cityName: city.name?.trim?.() || "",
      kind: "reinforcement-request",
    });
    return true;
  }

  const targetIdx = faction.target_faction;
  if (targetIdx == null || targetIdx === 0xff) return false;
  // 0x4003另行把“邻城所属==战略目标”的项目写入候选记录；正常宣战
  // 路径已令两国交战，额外保留战争门防止陈旧目标驱动和平攻击。
  const candidates = neighbours.filter(
    (neighbour) =>
      neighbour.faction === targetIdx && isAtWar(sc, city.faction, targetIdx),
  );
  if (!candidates.length) return false;
  if (localStrength < 1 && city.faction !== sc.player_faction) {
    if ((city._aiCooldown ?? 0) > 0) return false;
    const formed = formAiReinforcements(app, faction, city, 1);
    if (formed > 0) {
      rememberFactionStrategicCity(
        sc,
        city.faction,
        "strategic_city_primary",
        city.idx,
      );
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
    if ((city._aiCooldown ?? 0) > 0) return false;
    const requested = Math.max(0, threatTotal + 2 - localStrength);
    const formed = formAiReinforcements(app, faction, city, requested);
    if (formed > 0) {
      rememberFactionStrategicCity(
        sc,
        city.faction,
        "strategic_city_primary",
        city.idx,
      );
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
  // 0x405D..0x4073：RNG低2位按候选记录循环递减，命中时AL恒为0；
  // 因此目标下标是(raw-1) mod 候选数，raw=0会按u8下溢为255。
  const rawChoice = (rng?.nextByte?.() ?? 0) & 3;
  const target = candidates[((rawChoice || 0x100) - 1) % candidates.length];
  // 0x4099..0x40AA：命中目标后AL为0，随后明确改成1并以DL传给
  // 0x4155；敌城驻军强度只参与前面的派遣门，不是出击军团数量。
  let remaining = 1;
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
    legion.targetNode = roadNodeAt(target.x, target.y)?.id ?? null;
    legion._aiOrdered = true;
    legion.commandState = 0;
    remaining--;
  }
  rememberFactionStrategicCity(
    sc,
    city.faction,
    "strategic_city_primary",
    city.idx,
  );
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
  // 同道路拓扑移动：防止下一战略tick的插值从上一格倒跳。
  A._renderMoveSerial = sc._strategicTickSerial ?? null;
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
  if (loser._active !== false) loser.cooldown = 12;
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
  }
  if (originalExit?.cityDamage) {
    city.growth = originalExit.cityDamage.growth;
    city.disaster = originalExit.cityDamage.disaster;
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
  if (A._active !== false) A.cooldown = 12;
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

  if (rng.nextByte() & 1) {
    const selector = rng.nextByte();
    if (selector < 0xc0) {
      const city = sc.cities?.[selector >> 3];
      if (city) {
        let allowed = true;
        const raw = cityRawBytes(city);
        const xLow = raw ? raw[8] : (city.x ?? 0) & 0xff;
        if (xLow < 0xc0) allowed = Boolean(rng.nextByte() & 1);
        if (allowed) {
          const delay = (rng.nextByte() & 7) + 8;
          const event = { type: 11, arg0: 0, arg1: 0, arg2: 0 };
          if (enqueueCurrentStrategicEvent(app, event, delay)) {
            sc._disasterBounds = {
              minX: city.x >= 10 ? city.x - 5 : city.x,
              maxX: city.x >= 10 ? city.x + 5 : city.x + 10,
              minY: city.y >= 10 ? city.y - 5 : city.y,
              maxY: city.y >= 10 ? city.y + 5 : city.y + 10,
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
      (candidate.slot ?? candidate.generalIdx) === monarch.idx &&
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
  const oldNode = oldCapital << 3;
  const newNode = newCapital << 3;
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
    if (legion.targetNode === newNode) legion.targetNode = oldNode;
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
  sc.disasterMapObjects ??= [];
  if (kind === 0) {
    city.disaster_event = 0;
    sc.disasterMapObjects = sc.disasterMapObjects.filter(
      (item) => item.x !== city.x || item.y !== city.y,
    );
    return true;
  }
  if (sc.disasterMapObjects.length >= 32) return false;
  sc.disasterMapObjects.push({ kind, x: city.x, y: city.y });
  if (city.faction === sc.player_faction) {
    app.gamebar?.enqueueTalkMessage?.({
      gen: null,
      talkIndex: kind === 1 ? 71 : 72,
      cityName: city.name?.trim?.() || "",
      kind: "disaster-object",
    });
  }
  const rng = app.originalRng ?? app.activeBattleRng;
  if (!rng || typeof rng.nextByte !== "function") return true;
  city.disaster_event = (rng.nextByte() & 7) + 4;
  enqueueDelayedStrategicEvent(
    app,
    { type: 12, arg0: 0, cityPointer: cityEventPointer(city) },
    (rng.nextByte() & 7) + 6,
  );
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
  if (!sc?.envoys || !rng?.nextByte) return false;
  if (!current) {
    const factions = (sc.factions ?? []).filter((f) => f?.idx != null);
    if (!factions.length) return false;
    const cursor = Math.max(0, sc._envoyDiplomacyCursor | 0) % factions.length;
    sc._envoyDiplomacyCursor = (cursor + 1) % factions.length;
    current = factions[cursor];
  }
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

// 月结AI只保留结局检查；俘虏/流散去向由0x29C3/0x4FCE/0x585F事件链处理。
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
  sc.legions = sc.legions.filter((legion) => !legion.dead);
}

// 单城成长 — KI.EXE 0x3EFD 每次处理一个城槽后立即调用0x4194/0x4269。
function tickStrategicCityDaily(sc, cityIndex, rng) {
  if (!rng?.nextByte)
    throw new TypeError("strategic city tick requires canonical original RNG");
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
  if (cl >= (rng.nextByte() & 0x0f)) {
    c.growth = Math.min(200, (c.growth ?? 100) + ch);
  }

  // 2. 防灾 / 储粮恢复：随机门控 cl >= rand(16)
  if (cl >= (rng.nextByte() & 0x0f)) {
    const disInc = (ch >> 1) + 1;
    c.disaster = Math.min(200, (c.disaster ?? 100) + disInc);
    c.defence = c.disaster;
  }

  // 3. 城兵自然募补/恢复：城兵离上限差距时向城兵填充 dl
  const maxTroops = c.troops_cap ?? 200; // 内部标准单位 (×10 即为显示人数)
  let curTroops = c.troops ?? 0;
  if (curTroops < maxTroops && rng.nextByte() < 0x18) {
    curTroops = Math.min(maxTroops, curTroops + dl);
    c.troops = curTroops;
  }
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
    if (
      !legion.dead &&
      legion._active !== false &&
      legion.commandState != null &&
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
    if (
      (legion.commandState === 9 ||
        (legion.commandState == null && atCapital)) &&
      replenishLegionAtCapital(sc, legion)
    ) {
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
  for (const A of sc.legions) {
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
            return;
          }
          changed = true;
        }
        // 状态11必须保留首都目标，供下次槽调度的0x44D6到达处理解散；
        // 不能在外地选择「解體」时直接删除军团。
        if (A.commandState !== 11) A.target = null;
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
      // 中途易主或停战后不攻；只有正式交战目标才能进入战斗。
      if (
        A.target.faction == null ||
        isAtWar(sc, A.faction, A.target.faction)
      ) {
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
  // 0x25A3 单槽顺序为0x2662→0x2600：按本轮移动、到达和同步战果后的状态结算。
  if (shouldSettleDaily) settleLegionDaily(sc, processedSlots);
  sc.legions = sc.legions.filter((A) => !A.dead);
  if (changed) {
    app.hud?.buildLegend?.();
    app.view?.draw(); // 只在版图变化时重绘 (主循环不逐帧画)
  }
}
