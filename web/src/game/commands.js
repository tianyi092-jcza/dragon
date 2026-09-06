// 玩家命令层 — 复刻 KI.EXE 0xCDE 命令流的 Web 版(选城下命令)
// 攻略依据(game-mechanics.md):
//   - 玩家=军师, 有信赖度红线; 赤字→信赖降, 归零 GAME OVER
//   - 征兵次月生效变预备兵; 税率<30% 据点稳定发展, >30% 停滞
//   - 征兵形成预备兵；军团在首都按兵种从预备池自动补员；出兵从城兵抽调
export const COST_DEVELOP = 100; // 内政一次花费(金)
export const COST_RECRUIT = 200; // 征兵一次花费(金) → 次月 +500 预备兵
const RECRUIT_N = 500;
export const TAX_MIN = 0,
  TAX_MAX = 40;
import { tickEnvoys } from "./diplomacy.js";
import { createDefaultLegionUnits, ensureLegionSlot } from "./legionunits.js";
import { applyFactionFundsDelta, factionLegionMoraleCap } from "./economy.js";

/** 初始化玩家槽位(原版剧本头 FF=未指定 → 默认势力0/信赖100); 在 setScenario 时调 */
export function initPlayer(sc) {
  if (sc.player_faction == null || sc.player_faction === 0xff)
    sc.player_faction = sc.factions[0]?.idx ?? 0;
  if (sc.trust == null || sc.trust === 0xff) sc.trust = 255;
  if (sc.tax == null || sc.tax === 0xff) sc.tax = 18;
  if (sc.next_tax == null || sc.next_tax === 0xff) sc.next_tax = sc.tax;
  if (!Array.isArray(sc.conscription) || sc.conscription.length !== 3) {
    if (Array.isArray(sc.conscription) && sc.conscription.length >= 6) {
      sc.conscription = [
        (sc.conscription[0] | (sc.conscription[1] << 8)) * 10,
        (sc.conscription[2] | (sc.conscription[3] << 8)) * 10,
        (sc.conscription[4] | (sc.conscription[5] << 8)) * 10,
      ];
    } else {
      sc.conscription = [0, 0, 0];
    }
  }
  if (
    !Array.isArray(sc.next_conscription) ||
    sc.next_conscription.length !== 3
  ) {
    if (
      Array.isArray(sc.next_conscription) &&
      sc.next_conscription.length >= 6
    ) {
      sc.next_conscription = [
        (sc.next_conscription[0] | (sc.next_conscription[1] << 8)) * 10,
        (sc.next_conscription[2] | (sc.next_conscription[3] << 8)) * 10,
        (sc.next_conscription[4] | (sc.next_conscription[5] << 8)) * 10,
      ];
    } else {
      sc.next_conscription = [0, 0, 0];
    }
  }
  // 玩家化身軍師: 確認原軍師後該 NPC 從武將列表移除 (僅進言, 玩家借名扮演)
  for (const g of sc.generals) g.is_player = false;
  let pa = sc.player_advisor;
  if (!pa) {
    const f =
      sc.factions.find((f) => f.idx === sc.player_faction) || sc.factions[0];
    if (f?.advisor_idx != null && f.advisor_idx !== 0xff) {
      const g = sc.generals[f.advisor_idx];
      if (g) {
        sc.player_advisor = {
          custom: false,
          general_idx: g.idx,
          name: g.name.trim(),
          hao: (g.hao ?? "").trim(),
          portrait: g.portrait,
        };
        pa = sc.player_advisor;
      }
    }
  }
  if (pa && !pa.custom && pa.general_idx != null) {
    const g = sc.generals[pa.general_idx];
    if (g) g.is_player = true;
  }
  // 势力资源字段统一: 月结前无 .gold 时从 data.json 播种 (24bit 资金 + 预备兵三兵种池)
  for (const f of sc.factions) {
    if (f.gold == null) f.gold = f.money ?? 0;
    f.money = f.gold;
    if (f.food == null) f.food = 0;
    // 总预备兵池 = (騎/弓/步 之和)×10, 存储单位=十人 (原版資源面板顯示×10)
    const resTotal =
      ((f.reserve_cav ?? 0) + (f.reserve_arc ?? 0) + (f.reserve_inf ?? 0)) * 10;
    if (f.troops == null) f.troops = resTotal;
  }
}

/** 玩家势力对象(null=无) */
export function playerFaction(sc) {
  return (
    sc.factions.find((f) => f.idx === (sc.player_faction ?? 0)) ??
    sc.factions[0] ??
    null
  );
}

/** 0x7663/0x76A0：内政官候选只要求活动、同势力、status=0且非君主。 */
export function domesticGovernorCandidates(sc, faction) {
  if (!faction) return [];
  return (sc.generals ?? []).filter(
    (general) =>
      general &&
      general.faction === faction.idx &&
      general.active !== false &&
      (general.status ?? 0) === 0 &&
      !general.is_monarch &&
      general.idx !== faction.monarch_idx,
  );
}

/** 0x765A：任命只写city[+0x19]与general[+0x17]=2，不改旧预算。 */
export function appointDomesticGovernor(city, general) {
  city.governor = general.idx;
  general.status = 2;
}

/** 0x6B4F：手动解任清city[+0x19]、身份和general[+0x1A]预算。 */
export function dismissDomesticGovernor(city, general) {
  city.governor = null;
  general.status = 0;
  general.assignment_budget = 0;
}

/** 信赖归零立即 GAME OVER (KI.EXE 0x3DC9 减信赖后直转 0x1CB1) */
export function checkTrustGameOver(app) {
  const sc = app.scenario;
  if (!sc || sc.trust == null || sc.trust > 0) return false;
  if (sc.trust_game_over) return true;
  sc.trust_game_over = true;
  if (app.clock) app.clock.speed = 0;
  app.endView?.show({
    img: "grf/gameover.png",
    caption: "信賴度歸零，軍師之職不保…（點擊返回標題）",
  });
  return true;
}

function cityTroops(city) {
  return city.sim ? city.sim.troops : (city.troops ?? 0);
}
function cityCap(city) {
  return city.sim ? city.sim.cap : (city.troops_cap ?? 9999);
}

/** 通用前置: 是玩家城 + 势力金够 */
function precheck(sc, city, cost) {
  const f = playerFaction(sc);
  if (!f || city.faction !== f.idx) return { err: "非我方城池" };
  if ((f.gold ?? 0) < cost) return { err: "资金不足" };
  applyFactionFundsDelta(f, -cost);
  return { f };
}

/** 内政: 花金提升发展度(±200), 正发展→生产力涨 */
export function develop(sc, city) {
  const p = precheck(sc, city, COST_DEVELOP);
  if (p.err) return p;
  const dev = (city.development ?? 50) + 30;
  city.development = Math.max(-200, Math.min(200, dev));
  return { ok: `${city.name} 发展度→${city.development}` };
}

/** 征兵: 花金, 次月生效(预备兵入城, 不超上限) */
export function recruit(sc, city) {
  const p = precheck(sc, city, COST_RECRUIT);
  if (p.err) return p;
  sc.pendingRecruits = sc.pendingRecruits ?? [];
  sc.pendingRecruits.push({ city: city.idx, n: RECRUIT_N });
  return { ok: `${city.name} 徵兵${RECRUIT_N}·次月到達` };
}

/** 税率设定写入next_tax，0x53A6在下次月结末尾转正。 */
export function setTax(sc, n) {
  sc.next_tax = Math.max(TAX_MIN, Math.min(TAX_MAX, n | 0));
  return { ok: `次月稅率→${sc.next_tax}%` };
}

/**
 * 出征: 从玩家城抽调一半城兵组建军团, 指定目标城
 * 复刻 0x4155 给军团写方向/步数 的语义(Web 版直接给 target)
 */
export function dispatch(sc, fromCity, targetCity) {
  if (!targetCity || targetCity === fromCity) return { err: "選擇目標城池" };
  const f = playerFaction(sc);
  if (!f) return { err: "無玩家勢力" };
  const avail = Math.floor(cityTroops(fromCity) / 2);
  if (avail < 1) return { err: "城兵不足" };
  // 一將一軍(原版規則): 軍團長=未帶軍的武力最高在閑武將
  const busy = new Set(sc.legions.map((L) => L.leader));
  const gen = sc.generals
    .filter(
      (g) =>
        g.faction === f.idx && g.active && g.status === 0 && !busy.has(g.name),
    )
    .reduce(
      (a, b) => (b.ability.force > (a?.ability.force ?? -1) ? b : a),
      null,
    );
  if (!gen) return { err: "無可用大將" };
  if (fromCity.sim) fromCity.sim.troops -= avail;
  const legion = {
    leader: gen.name,
    generalIdx: gen.idx,
    faction: f.idx,
    x: fromCity.x,
    y: fromCity.y,
    prevX: fromCity.x,
    prevY: fromCity.y,
    troops: avail,
    units: createDefaultLegionUnits(avail),
    morale: factionLegionMoraleCap(f),
    cooldown: 2,
    target: targetCity,
    formation: 1, // Web编成UI字段；CBE5权威值是主将general[+0x16]
  };
  ensureLegionSlot(sc.legions, legion, gen.idx);
  sc.legions.push(legion);
  return { ok: `${f.monarch}軍自${fromCity.name}出征${targetCity.name}` };
}

/** 月末钩子: 征兵到达；天灾/暴动由type11/12事件轮处理。 */
export function monthEnd(app) {
  const sc = app.scenario;
  if (!sc) return;
  tickEnvoys(sc); // 外交官任期显示衰减；预算报告由 main 月结链另行生成
  for (const r of sc.pendingRecruits ?? []) {
    const c = sc.cities[r.city];
    if (!c) continue;
    if (c.sim) c.sim.troops = Math.min(cityCap(c), c.sim.troops + r.n);
    app.hud?.flashEvent?.(`${c.name} 徵兵${r.n}到達`);
  }
  sc.pendingRecruits = [];
  checkTrustGameOver(app);
}
