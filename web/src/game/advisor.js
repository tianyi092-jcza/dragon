// 进言系统：军师(最高政治武将)按局势提议，采纳/驳回影响信赖度。
// 原版依据(KI.EXE)：采纳成功 +20 信赖 / 君主直接驳回或执行失败 -20 (0x38AD/0x389A, al=0x14)；
// 撤回进言(五项菜单 al=4)与“再考虑/再等等”话术分支(ah=2)不扣信赖；评估门控 rand > trust 时跳过优质选项 (0x39A1)。
import * as cmd from "./commands.js";

function rnd(n) {
  return Math.floor(Math.random() * n);
}

// 玩家军师解析: ①自定军师(玩家化身) ②确认的原军师NPC(is_player, 借名扮演)
// ③势力记录 byte[2] 指定军师 ④政治最高扫描回退(0x45C1)
export function getAdvisor(sc, f) {
  const pa = sc.player_advisor;
  if (pa) {
    if (pa.custom)
      return {
        name: pa.name,
        hao: pa.hao,
        portrait: pa.portrait,
        custom: true,
      };
    const pg = sc.generals[pa.general_idx];
    if (pg) return pg;
  }
  if (f.advisor_idx != null) {
    const g = sc.generals[f.advisor_idx];
    if (g && g.active) return g;
  }
  let best = null;
  for (const g of sc.generals) {
    if (g.faction !== f.idx || g.status !== 0 || !g.active || g.is_player)
      continue;
    if (!best || g.ability.politics > best.ability.politics) best = g;
  }
  return best;
}

function trustGate(sc) {
  const t = sc.trust ?? 50;
  return rnd(100) < t; // 通过=诚实建议；不通过=劣质建议
}

function troopsOf(c) {
  return c.sim ? c.sim.troops : (c.troops ?? 0);
}

// 曼哈顿距离 <= R 视为邻城(实测最近邻中位数13格)
const NEAR = 15;

/** 玩家上下文: {sc,f,mine} 或 null(无势力/无城) — honest/bad 建议共用 */
function playerContext(app) {
  const sc = app.scenario;
  const f = cmd.playerFaction(sc);
  if (!f) return null;
  const mine = sc.cities.filter((c) => c.faction === f.idx);
  if (!mine.length) return null;
  return { sc, f, mine };
}

function honestSuggestion(app) {
  const ctx = playerContext(app);
  if (!ctx) return null;
  const { sc, f, mine } = ctx;

  // 1) 有明显弱邻 → 出征
  let bestT = null;
  for (const c of mine) {
    for (const n of sc.cities) {
      if (n.faction == null || n.faction === f.idx) continue;
      const d = Math.abs(c.x - n.x) + Math.abs(c.y - n.y);
      if (d <= NEAR && troopsOf(c) > troopsOf(n) * 2) {
        const margin = troopsOf(c) - troopsOf(n);
        if (!bestT || margin > bestT.margin)
          bestT = { from: c, target: n, margin };
      }
    }
  }
  if (bestT) return { type: "dispatch", ...bestT };

  // 2) 金够而某城发展低 → 内政
  if ((f.gold ?? 0) >= cmd.COST_DEVELOP) {
    const poor = mine.reduce((a, b) =>
      (b.development ?? 50) < (a.development ?? 50) ? b : a,
    );
    if ((poor.development ?? 50) < 60) return { type: "develop", city: poor };
  }
  // 3) 兵少且有钱 → 征兵
  if ((f.gold ?? 0) >= cmd.COST_RECRUIT) {
    const weak = mine.reduce((a, b) => (troopsOf(b) < troopsOf(a) ? b : a));
    if (troopsOf(weak) < 300) return { type: "recruit", city: weak };
  }
  // 4) 税率偏低 → 提税
  if ((sc.tax ?? 25) < 30)
    return { type: "tax", value: Math.min(30, (sc.tax ?? 25) + 5) };
  return null;
}

function badSuggestion(app) {
  // 劣质建议：怂恿以弱攻强，或随机瞎指内政/征兵
  const ctx = playerContext(app);
  if (!ctx) return null;
  const { sc, f, mine } = ctx;
  if (rnd(3) === 0) {
    for (const c of mine) {
      for (const n of sc.cities) {
        if (n.faction == null || n.faction === f.idx) continue;
        const d = Math.abs(c.x - n.x) + Math.abs(c.y - n.y);
        if (d <= NEAR && troopsOf(n) > troopsOf(c))
          return { type: "dispatch", from: c, target: n, margin: -1 };
      }
    }
  }
  const x = mine[rnd(mine.length)];
  return { type: rnd(2) ? "develop" : "recruit", city: x };
}

export function makeSuggestion(app) {
  const good = trustGate(app.scenario);
  return (
    (good ? honestSuggestion(app) : badSuggestion(app)) || honestSuggestion(app)
  );
}

export function suggestionText(_sc, s) {
  if (!s) return "";
  switch (s.type) {
    case "develop":
      return `${s.city.name}的開發落後，宜撥金百兩內政。`;
    case "recruit":
      return `${s.city.name}兵力空虛，宜徵兵五百。`;
    case "dispatch":
      return s.margin > 0
        ? `可自${s.from.name}出兵攻取${s.target.name}，敵寡我眾。`
        : `${s.target.name}守備看似薄弱，可自${s.from.name}一試。`;
    case "tax":
      return `國用不足，宜將稅率提至${s.value}%。`;
  }
  return "";
}

// 采纳执行：成功 +20 信赖，失败 -20；君主直接驳回固定 -20
export function adopt(app, s) {
  const sc = app.scenario;
  const r = execSuggestion(sc, s);
  changeTrust(sc, r.ok ? 20 : -20);
  cmd.checkTrustGameOver(app); // 归零立即结束 (0x3DC9→0x1CB1)
  return r;
}

export function dismiss(app) {
  changeTrust(app.scenario, -20);
  cmd.checkTrustGameOver(app);
  return { ok: false, msg: "君主駁回了進言。（信賴度-20）" };
}

export function changeTrust(sc, d) {
  sc.trust = Math.max(0, Math.min(255, (sc.trust ?? 100) + d));
}

function execSuggestion(sc, s) {
  switch (s.type) {
    case "develop": {
      const r = cmd.develop(sc, s.city);
      return r?.ok
        ? { ok: true, msg: r.ok }
        : { ok: false, msg: r?.err ?? "內政失敗" };
    }
    case "recruit": {
      const r = cmd.recruit(sc, s.city);
      return r?.ok
        ? { ok: true, msg: r.ok }
        : { ok: false, msg: r?.err ?? "徵兵失敗" };
    }
    case "dispatch": {
      const r = cmd.dispatch(sc, s.from, s.target);
      return r?.ok
        ? { ok: true, msg: r.ok }
        : { ok: false, msg: r?.err ?? "出征失敗" };
    }
    case "tax": {
      const r = cmd.setTax(sc, s.value);
      return r?.ok
        ? { ok: true, msg: r.ok }
        : { ok: false, msg: r?.err ?? "改稅失敗" };
    }
  }
  return { ok: false, msg: "?" };
}
