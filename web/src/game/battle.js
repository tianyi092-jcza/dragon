// 战斗系统 — 战术层 (Web 版实时战斗, 复用原版战场素材与编制语义)
//
// 逆向依据 (docs/re-notes-kernel.md):
//   - BATTLE.MAP 目录 214 城 × 2B: 首字节=战场布局号(battle_map_{n}.png),
//     次字节=地形主题 → tools/parse_battle.py 已导出 web/battle_maps.json
//   - 军团记录 +20..+23 = 前/左/中/右/后五军编制 → 攻守双方最多各 5 单位
//   - BATTLE.DAT 开场脚本块号 = 编制类型×4+攻守; VM 解释器见 battlescript.js,
//     battleview 开战时回放 (编制类型以单位数-1 近似, 原版取自军团五军记录)
//
// 设计: 1024×1024 战场(64 图块×16px), 单位实时寻敌接战, 伤亡由
//   武力(force)+现存兵力+士气 共同决定; 兵力<25% 或士气崩溃 → 溃走

/** 战场世界尺寸 (px, 64图块 × 16px/块) */
export const FIELD = 1024;

const MELEE_RANGE = 26; // 接战距离
const AGGRO_RANGE = 260; // 主动索敌范围
const ROUT_SHARE = 0.25; // 兵力溃散阈值

/** 把总兵力拆成 n 个单位 (中军多拿余数, 对应五军编制) */
function splitTroops(total, n) {
  const base = Math.floor(total / n);
  const arr = Array(n).fill(base);
  arr[Math.floor(n / 2)] += total - base * n;
  return arr;
}

const ROLE = ["前", "左", "中", "右", "後"]; // 军团记录+20..+23 五军编制

function mkUnit(side, i, n, troops, genName, force) {
  // 攻方列于西(x小) 守方列于东 — 对应原版脚本"对称布阵"
  const mid = Math.floor(n / 2);
  const colX = side === "atk" ? 110 : FIELD - 110 - (i % 2) * 40;
  const rowY = FIELD / 2 + (i - (n - 1) / 2) * 150;
  return {
    side,
    idx: i,
    x: colX,
    y: rowY,
    hx: colX, // 编队槽位 (BATTLE.DAT 开场脚本列阵目标点)
    hy: rowY,
    troops,
    maxTroops: troops,
    gen: genName,
    // 中军=主将本队(显示主将名, 武力+10); 其余按五军编制标 role
    label: i === mid ? genName : `${ROLE[i] ?? i + 1}軍`,
    force: force + (i === mid ? 10 : 0),
    morale: side === "atk" ? 100 : 85,
    speed: 26 + (i % 3) * 7,
    routed: false,
    gone: false,
    order: null, // 玩家点选移动目标 {x,y}
    cd: 0, // 交战冷却(s)
  };
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
 * 创建战斗状态
 * @param p {attackerLegion, city, scenario, battleMaps}
 *   攻方: 军团(主将名/势力/兵力); 守方: 城池(兵力/士气/太守或君主武力)
 */
export function createBattle(sc, A, city, battleMaps) {
  const meta = battleMaps?.cities.find((m) => m.idx === city.idx);
  const layout = meta ? meta.layout : 0;

  // 主将武力: 军团长 / 守方太守(无则君主)
  const genOf = (name) => sc.generals.find((g) => g.name === name);
  const atkGen = genOf(A.leader);
  const defCity = sc.factions[city.faction];
  const govIdx = city.raw
    ? parseInt(city.raw.slice(0x19 * 2, 0x19 * 2 + 2), 16)
    : 0xff;
  const defGeneral =
    (govIdx !== 0xff && sc.generals[govIdx]) ||
    (defCity && genOf(defCity.monarch)) ||
    null;

  const atkTroops = Math.max(1, A.troops | 0);
  const defTroops = Math.max(
    1,
    (city.sim ? city.sim.troops : city.troops) | 0 || 20,
  );
  const nAtk = Math.min(5, Math.max(1, Math.round(atkTroops / 400)));
  const nDef = Math.min(5, Math.max(1, Math.round(defTroops / 400)));

  const units = [];
  splitTroops(atkTroops, nAtk).forEach((t, i) =>
    units.push(
      mkUnit("atk", i, nAtk, t, A.leader, atkGen?.ability.force ?? 50),
    ),
  );
  splitTroops(defTroops, nDef).forEach((t, i) =>
    units.push(
      mkUnit(
        "def",
        i,
        nDef,
        t,
        defGeneral?.name ?? `${city.name}守軍`,
        defGeneral?.ability.force ?? 45,
      ),
    ),
  );

  return {
    A,
    city,
    layout,
    formation: A.formation ?? 1, // 军团编制类型 1..4 (原版军团记录 [si+0x2A], 0xCBE5 选块用)
    units,
    time: 0,
    over: null, // null | 'atk' | 'def'
    title: `${A.leader}軍 ⚔ ${city.name} (${defGeneral?.name ?? "守軍"})`,
  };
}

function alive(B, s) {
  return s.units.filter((u) => u.side === B && !u.routed && !u.gone);
}

function nearestEnemy(u, s) {
  let best = null,
    bd = Infinity;
  for (const e of s.units) {
    if (e.side === u.side || e.routed || e.gone) continue;
    const d = (e.x - u.x) ** 2 + (e.y - u.y) ** 2;
    if (d < bd) {
      bd = d;
      best = e;
    }
  }
  return { e: best, d: Math.sqrt(bd) };
}

/** 单位战力系数: 武力为主, 兵力损耗与士气削弱 */
function power(u) {
  const fill = u.troops / u.maxTroops;
  return (0.55 + 0.9 * fill) * (0.5 + u.morale / 200) * u.force;
}

function damage(src) {
  const base = 1.6 + src.force * 0.055;
  const r = 0.7 + Math.random() * 0.6;
  return Math.max(1, Math.round(base * r * (src.morale > 20 ? 1 : 0.5)));
}

function stepToward(u, tx, ty, dt) {
  const dx = tx - u.x,
    dy = ty - u.y;
  const d = Math.hypot(dx, dy) || 1;
  const step = Math.min(d, u.speed * dt);
  u.x += (dx / d) * step;
  u.y += (dy / d) * step;
}

function rout(u) {
  u.routed = true;
  u.order = null;
}

/** 推进一帧 (dt 秒)。返回当前战况 over 字段 */
export function tickBattle(s, dt) {
  if (s.over) return s.over;
  s.time += dt;
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
    // 玩家手动指令优先 (无近敌时执行)
    const { e, d } = nearestEnemy(u, s);
    if (u.order && (!e || d > MELEE_RANGE)) {
      stepToward(u, u.order.x, u.order.y, dt);
      if (Math.hypot(u.order.x - u.x, u.order.y - u.y) < 12) u.order = null;
    } else if (e && d <= AGGRO_RANGE) {
      if (d > MELEE_RANGE) stepToward(u, e.x, e.y, dt);
      else if (u.cd <= 0) {
        // 互殴: 双方按各自 power 比例承受伤害
        const pa = power(u),
          pb = power(e);
        const du = damage(e, u),
          dv = damage(u, e);
        const kU = pb / (pa + pb),
          kV = pa / (pa + pb);
        const loseU = Math.max(1, Math.round(du * kU * 2)),
          loseV = Math.max(1, Math.round(dv * kV * 2));
        u.troops -= loseU;
        e.troops -= loseV;
        u.morale = Math.max(0, u.morale - loseU / 12);
        e.morale = Math.max(0, e.morale - loseV / 12);
        u.cd = 0.8;
        e.cd = Math.max(e.cd, 0.4);
      }
    } else if (u.order) {
      stepToward(u, u.order.x, u.order.y, dt);
      if (Math.hypot(u.order.x - u.x, u.order.y - u.y) < 12) u.order = null;
    }
    if (u.troops < u.maxTroops * ROUT_SHARE || u.morale < 12) rout(u);
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

/** 快进: 自动决战的瞬时结算 (兵力×武力加权比较, 保留随机性) */
export function autoResolve(s) {
  const sa = s.units.filter((u) => u.side === "atk").length
    ? s.units
        .filter((u) => u.side === "atk")
        .reduce((a, u) => a + u.troops * (1 + u.force / 100), 0)
    : 0;
  const sd = s.units
    .filter((u) => u.side === "def")
    .reduce((a, u) => a + u.troops * (1 + u.force / 100), 0);
  s.over = sa * (0.85 + Math.random() * 0.3) >= sd ? "atk" : "def";
  return s.over;
}
