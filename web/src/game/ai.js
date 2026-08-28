// AI 逻辑 — 复刻 KI.EXE 三态机: 威胁感知(0x3FA9)→强弱判断(0x4057)→攻/逃/游走(0x4155/0x40C9)
import {
  isFriendly,
  isAtWar,
  declareWar,
  decreaseRelation,
} from "./diplomacy.js";
import { playerFaction } from "./commands.js";
import { findPath, passable, gateDirs } from "./pathfind.js";

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
    if (B === A || B.dead || B.faction == null || B.target) continue;
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
export function buildArmies(sc) {
  // ★优先用真实军团数据(0x21C0开局区/存档0x22C0区); 坐标异常时落首都
  if (sc.legions && sc.legions.length) {
    for (const L of sc.legions) {
      L.cooldown = 0;
      L.target = null;
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
      leader: f.monarch,
      faction: f.idx,
      x: cap.x,
      y: cap.y,
      prevX: cap.x,
      prevY: cap.y,
      troops: 1 + f.n_cities,
      cooldown: 0,
      target: null,
    });
  }
  sc.legions = armies;
}

// 威胁感知: 只看4邻格 (复刻原版视野规则)
function scanThreat(A, sc) {
  let sum = 0,
    foe = null;
  for (const B of sc.legions) {
    if (B === A || B.faction === A.faction) continue;
    if (isFriendly(sc, A.faction, B.faction)) continue; // 同盟军不算威胁
    const d = Math.abs(B.x - A.x) + Math.abs(B.y - A.y);
    if (d === 1) {
      sum += B.troops;
      foe = foe || B;
    }
  }
  return { sum, foe };
}

function stepTo(sc, A, tx, ty) {
  if (tx == null) return;
  // 佯动第二拍: 闪出后回到原据点, 放弃目标 (全路被未开战势力堵死时的行为)
  if (A._feint) {
    A.prevX = A.x;
    A.prevY = A.y;
    A.x = A._feint.x;
    A.y = A._feint.y;
    A._feint = null;
    A.target = null;
    A._path = null;
    return;
  }
  const blocked = (x, y) => blockedAt(sc, A, x, y);
  // A* 路网路径跟随: 目标变更/无缓存/前路被堵 时重算; 不可达→佯动兑底
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
  const nxt = A._path?.shift();
  if (nxt && !blocked(nxt.x, nxt.y)) {
    // 首步前记录出发据点 (败退回撤用)
    if (!A._bases) {
      A._bases = [];
      const c0 = sc.cities.find((c) => c.x === A.x && c.y === A.y);
      if (c0) A._bases.push(c0);
    }
    A.prevX = A.x;
    A.prevY = A.y;
    A.x = nxt.x;
    A.y = nxt.y;
    // 记录路过的据点 (最近者用于战败撤退)
    const c = sc.cities.find((c) => c.x === A.x && c.y === A.y);
    if (c && A._bases[A._bases.length - 1] !== c) {
      A._bases.push(c);
      if (A._bases.length > 24) A._bases.shift();
    }
    if (!A._path.length) A._path = null; // 到达, 释放缓存
  } else {
    A._path = null;
    // 无路可通(被未开战势力堵死): 向出城方向闪出一步, 下一拍回城
    // 出口方向遵守门规则 (城只走四门/关卡只走南北门), 目标方向优先
    const home = { x: A.x, y: A.y };
    const dx = Math.sign(tx - A.x),
      dy = Math.sign(ty - A.y);
    const tries = gateDirs(A.x, A.y)
      .slice()
      .sort(
        (a, b) =>
          Math.abs(a[0] - dx) +
          Math.abs(a[1] - dy) -
          (Math.abs(b[0] - dx) + Math.abs(b[1] - dy)),
      );
    for (const [mx, my] of tries) {
      if (!mx && !my) continue;
      const nx = A.x + mx,
        ny = A.y + my;
      if (passable(nx, ny) && !blocked(nx, ny)) {
        A.prevX = A.x;
        A.prevY = A.y;
        A.x = nx;
        A.y = ny;
        A._feint = home;
        break;
      }
    }
    if (!A._feint) {
      A.prevX = A.x;
      A.prevY = A.y;
      A.target = null; // 连闪出格都没有 → 直接放弃
    }
  }
}

// 军师政治 — 复刻 0x45C1(扫武将表取 status 空闲且政治最高者)
function strategistPower(sc, fac) {
  let best = 0;
  for (const g of sc.generals)
    if (g.faction === fac && g.status === 0 && g.ability.politics > best)
      best = g.ability.politics;
  return best;
}

// ★战斗判定 — 玩家参战→开战术层(实时战场); AI互斗→原版公式速算
// 原版公式 0x2920: rand&0x7F < 军师政治>>1 + 0x28
// 返回 true=已开入交互战斗(调用方应中止本轮后续处理)
function resolveBattle(app, A, city) {
  const sc = app.scenario;
  const pf = playerFaction(sc);
  if (
    pf &&
    (A.faction === pf.idx || city.faction === pf.idx) &&
    app.battleView &&
    !app.battleView.active
  ) {
    app.startBattle(A, city); // 暂停时钟+开覆盖层; 结算在 onFinish 回调
    return true;
  }
  const th = (strategistPower(sc, A.faction) >> 1) + 0x28;
  const win = ((Math.random() * 0x80) | 0) < th;
  applyBattleResult(app, A, city, win ? "atk" : "def", null);
  return false;
}

/** 战果落盘: winner='atk' 攻克城池/守军被俘; 'def' 攻方溃散被俘 */
export function applyBattleResult(app, A, city, winner, troops) {
  const sc = app.scenario;
  if (winner === "atk") {
    const oldFaction = city.faction;
    for (const B of sc.legions)
      if (B !== A && B.faction === city.faction && B.x === A.x && B.y === A.y) {
        B.dead = true;
        imprison(sc, B); // ★守军被俘 (武将 status=4, +1D 原属势力)
      }
    city.faction = A.faction;
    if (city.sim) city.sim.troops = 0; // 城防清零(战后重建)
    A.troops = Math.max(1, troops ?? A.troops);
    A.x = city.x;
    A.y = city.y;
    if (oldFaction != null && oldFaction !== A.faction) {
      declareWar(sc, A.faction, oldFaction);
      decreaseRelation(sc, A.faction, oldFaction, 20);
    }
    app.hud?.flashEvent?.(`${A.leader} 攻破 ${city.name}（餘兵${A.troops}）`);
  } else {
    // 败退: 回到行军途中路过的最近己方/中立足点 (打不过则撤回, 不再直接打散)
    const base = [...(A._bases || [])]
      .reverse()
      .find((c) => c.faction === A.faction || c.faction == null);
    if (base) {
      A.x = base.x;
      A.y = base.y;
      A.prevX = base.x;
      A.prevY = base.y;
      A.target = null;
      A._path = null;
      A.cooldown = 12; // 收拢残部休整
      A.troops = Math.max(1, troops ?? A.troops);
      app.hud?.flashEvent?.(`${A.leader} 攻${city.name}失利, 败退${base.name}`);
    } else {
      A.dead = true;
      imprison(sc, A); // ★无据点可退→被俘/打散 (攻略: 月初回归, 非永久阵亡)
      if (troops != null && city.sim)
        city.sim.troops = Math.max(1, Math.min(city.sim.cap, troops));
      app.hud?.flashEvent?.(
        `${A.leader} 攻${city.name}${troops == null ? "失利被逐" : "戰敗"}`,
      );
    }
  }
}

// ★俘虏机制 — 数据驱动: 武将 status=4(被俘), +1D=原属势力; 每月脱逃/月初回归
function imprison(sc, A) {
  const g = sc.generals.find((x) => x.name === A.leader);
  if (g) {
    g.status = 4;
    g.origFaction = g.faction;
  } // 复刻 +17=4 / +1D
  // 去重: 同一武将月内不可重复入狱记录(坐牢期间军团不应存在)
  sc.prisoners = (sc.prisoners ?? []).filter((p) => p.leader !== A.leader);
  sc.prisoners.push({
    leader: A.leader,
    faction: g ? g.faction : A.faction, // 原属
    months: 1, // 下月初回归(攻略: 打散某个月初回来)
  });
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
        leader: p.leader,
        faction: p.faction,
        x: cap.x,
        y: cap.y,
        prevX: cap.x,
        prevY: cap.y,
        troops: 1 + sc.citiesOf(p.faction).length,
        cooldown: 6,
        target: null,
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
    let ch = cl > 15 ? cl - 15 : 1;

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
  for (const A of sc.legions) {
    if (A.dead || A.faction == null) continue;
    A.prevX = A.x;
    A.prevY = A.y;
  }
  let changed = false;
  for (const A of sc.legions) {
    if (A.dead || A.faction == null) continue;
    if (A.cooldown > 0) {
      A.cooldown--;
      continue;
    } // 复刻冷却[si+0x857]
    // ★玩家势力军团由玩家指挥 (編成/軍團菜单指派目标), AI 不自动决策攻城
    if (A.faction === sc.player_faction) {
      if (!A.target) continue;
      stepTo(sc, A, A.target.x, A.target.y);
      if (A.target && A.x === A.target.x && A.y === A.target.y) {
        if (!isFriendly(sc, A.faction, A.target.faction)) {
          if (resolveBattle(app, A, A.target)) return; // 交互战斗已开启
          changed = true;
        }
        A.target = null;
        A.cooldown = 6;
      }
      continue;
    }
    const { sum, foe } = scanThreat(A, sc);
    if (foe) {
      if (A.troops + 2 > sum) {
        // 强势→攻击 (0x4057 兵力+2判据)
        const T = sc.cities.find((c) => c.x === foe.x && c.y === foe.y);
        stepTo(sc, A, foe.x, foe.y);
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
        stepTo(sc, A, A.target.x, A.target.y);
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
  sc.legions = sc.legions.filter((A) => !A.dead); // 阵亡清场(0x2977/0x29C3)
  // 兵源补充(占位): 无军团的活跃势力从首都重新起兵(真实募兵/武将重现待逆向)
  // ★统帅必须是该势力未被俘的武将 — 否则坐牢君主会"分身"出幽灵军团被反复俘获
  for (const f of sc.factions) {
    if (f.idx === sc.player_faction) continue; // 玩家势力不自动起兵 (編成菜单指挥)
    if (!sc.legions.some((A) => A.faction === f.idx)) {
      const cap = sc.cities[f.capital];
      const mon = sc.generals.find(
        (g) => g.name === f.monarch && g.status !== 4 && g.faction === f.idx,
      );
      const alt =
        mon || sc.generals.find((g) => g.faction === f.idx && g.status !== 4);
      if (cap && cap.faction === f.idx && alt)
        sc.legions.push({
          leader: alt.name,
          faction: f.idx,
          x: cap.x,
          y: cap.y,
          prevX: cap.x,
          prevY: cap.y,
          troops: 1 + f.n_cities,
          cooldown: 12,
          target: null,
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
