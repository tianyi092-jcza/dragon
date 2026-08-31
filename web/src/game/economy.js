// 财政与月度结算系统 — 完整逆向还原 KI.EXE 0x5358 / 0x53C6 / 0x54FC / 0x5538 / 0x5547 / 0x5695
//
// 逆向依据 (详见 docs/re-notes-kernel.md):
//   - 0x5358: 换月结算主函数。
//   - 0x53A6: 换月时将次月参数 (次月税率 CS:[0xD10]、次月征兵 CS:[0xD12..0xD17]) 复制到当月 (CS:[0xD08..0xD0F])。
//   - 0x54FC: 切比雪夫距离 → 距离衰减等级 (≤80: 2, ≤200: 3, >200: 4)。
//   - 0x5538: 城池生产力 ÷ 距离等级 累加得全势力原始收入基数。
//   - 0x548F: 玩家月收入 = 原始收入基数 × 税率(%) ÷ 100；并根据预备兵和武将数计算月支出。
//   - 0x5547: 城池征兵产出 base = (生产力 ÷ 距离等级) ÷ 32，按纬度 (北 y<80 骑多 / 中 80≤y<150 / 南 y≥150 弓步多) 计算三兵种征兵池。
//   - 0x54BF: 玩家设定征兵上限钳制实际征兵数，并入预备兵池 (reserve_cav, reserve_arc, reserve_inf)。
//   - 0x5695: 城池成长动力学。玩家税率与 30% 基准比较：税率<30% 增长，税率>30% 萎缩；更新生产力与上升率。
//   - 0x4194: 城池每日/月度城兵 (defense) 与防灾 (disaster) 恢复，内政官 (governor) 政治属性提供恢复加成。

export function saturatingAdd(cur, delta, max = 0xffff) {
  const v = (cur ?? 0) + delta;
  if (v < 0) return 0;
  return v > max ? max : v;
}

/** 0x54FC: 城池距首都切比雪夫距离 → 收益衰减除数 (2, 3, 4) */
export function distLevel(city, cap) {
  if (!cap) return 2;
  const dx = Math.abs(cap.x - city.x);
  const dy = Math.abs(cap.y - city.y);
  const d = Math.max(dx, dy) & 0xff;
  if (d <= 0x50) return 2;
  if (d <= 0xc8) return 3;
  return 4;
}

/** 0x5538: 计算某势力所有据点的原始收入总基数 (未乘税率) */
export function computeFactionRawIncome(scenario, factionIdx) {
  const f = scenario.factions[factionIdx];
  if (!f) return 0;
  const cap = f.capital == null ? null : scenario.cities[f.capital];
  let raw = 0;
  for (const c of scenario.citiesOf(factionIdx)) {
    const L = distLevel(c, cap);
    const prod = c.prod ?? 0;
    raw += Math.floor(prod / L);
  }
  return raw;
}

/** 0x5547: 计算某势力所有据点的三兵种征兵产出上限 (按南北地理区域划分) */
export function computeConscriptionYields(scenario, factionIdx) {
  const f = scenario.factions[factionIdx];
  if (!f) return { cav: 0, arc: 0, inf: 0 };
  const cap = f.capital == null ? null : scenario.cities[f.capital];

  let cavYield = 0;
  let arcYield = 0;
  let infYield = 0;

  for (const c of scenario.citiesOf(factionIdx)) {
    const L = distLevel(c, cap);
    const prod = c.prod ?? 0;
    const base = Math.floor(Math.floor(prod / L) / 32);
    if (base <= 0) continue;

    const y = c.y ?? 100;
    if (y < 80) {
      // 北方区域 (幽州/并州/凉州/冀州等): 盛产骑兵
      const dx = Math.floor(base / 4) + Math.floor(base / 16);
      const cx = Math.floor(dx / 4);
      const ax = Math.max(0, base - dx - cx);
      cavYield += ax;
      arcYield += cx;
      infYield += dx;
    } else if (y < 150) {
      // 中原/平原区域: 均衡，以步兵为主
      const dx = Math.floor(base / 8);
      const cx = Math.max(0, base - dx - Math.floor(dx / 2));
      const ax = Math.floor(base >> 3);
      const remDx = Math.max(0, base - ax - cx);
      cavYield += ax;
      arcYield += cx;
      infYield += remDx;
    } else {
      // 南方区域 (江东/荆南/蜀中): 水乡多弓箭与步兵，极少骑兵
      const ax = Math.floor(base / 32);
      const dx = Math.max(0, base - ax);
      const cx = dx;
      cavYield += ax;
      arcYield += cx;
      infYield += dx;
    }
  }

  return {
    cav: cavYield,
    arc: arcYield,
    inf: infYield,
  };
}

/** 0x3E65: 计算势力的常规月支出；外交费由type-5对话批准时一次性扣除。 */
export function computeFactionExpense(scenario, factionIdx) {
  const f = scenario.factions[factionIdx];
  if (!f) return 0;
  const totalRes =
    (f.reserve_cav ?? 0) + (f.reserve_arc ?? 0) + (f.reserve_inf ?? 0);
  // 预备兵每 32 兵每月消耗维护费 (以 10 兵为单位，折算约 24 周期)
  const troopUpkeep = Math.floor((totalRes / 32) * 24);

  // 麾下武将俸禄 (排除玩家化身军师，每位武将每月 20 金)
  const isPlayer = scenario.player_faction === factionIdx;
  const generalsCount = scenario.generals
    ? scenario.generals.filter(
        (g) =>
          g &&
          g.faction === factionIdx &&
          g.active !== false &&
          !(isPlayer && g.is_player),
      ).length
    : (f.n_generals ?? 1);
  const officerStipend = generalsCount * 20;

  // 内政官治理计划预算 (KI.EXE 0x5715 - 0x576B):
  // 针对该势力下所有委任内政官的据点，计算其 生产力/上升率、防灾、城兵离上限的差距之和 >> 1 * 50
  let governorBudget = 0;
  for (const c of scenario.citiesOf ? scenario.citiesOf(factionIdx) : []) {
    if (c && c.governor != null && scenario.generals?.[c.governor]) {
      const defGap = Math.max(0, 180 - (c.growth ?? 100));
      const disGap = Math.max(0, 180 - (c.disaster ?? 100));
      const maxTroops = c.troops_cap ?? 200;
      const curTroops = c.sim ? c.sim.troops : (c.troops ?? 0);
      const troopGap = Math.max(0, maxTroops - curTroops);
      const totalGap = (defGap + disGap + troopGap) >> 1;
      governorBudget += totalGap * 50;
    }
  }

  // 0x578F 只计算建议额并排type-5事件；不能在月结支出中预扣，否则对话批准会双扣。
  return Math.max(0, troopUpkeep + officerStipend + governorBudget);
}

/** 军师「財政」界面实时数据与预测模型 */
export function getProjectedFinance(scenario) {
  const pIdx = scenario.player_faction ?? 0;
  const f = scenario.factions[pIdx] || scenario.factions[0];
  if (!f) {
    return {
      treasury: 0,
      income: 0,
      expense: 0,
      curTax: 18,
      curCav: 0,
      curArc: 0,
      curInf: 0,
      nextTax: 18,
      nextCav: 0,
      nextArc: 0,
      nextInf: 0,
      yieldCav: 0,
      yieldArc: 0,
      yieldInf: 0,
    };
  }

  const rawIncome = computeFactionRawIncome(scenario, f.idx);
  const nextTax = scenario.next_tax ?? scenario.tax ?? 18;
  const projectedIncome = Math.floor((rawIncome * nextTax) / 100);
  const projectedExpense = computeFactionExpense(scenario, f.idx);
  const yields = computeConscriptionYields(scenario, f.idx);

  return {
    treasury: f.gold ?? f.money ?? 0,
    income: projectedIncome,
    expense: projectedExpense,
    curTax: scenario.tax ?? 18,
    curCav: scenario.conscription?.[0] ?? 0,
    curArc: scenario.conscription?.[1] ?? 0,
    curInf: scenario.conscription?.[2] ?? 0,
    nextTax: nextTax,
    nextCav: scenario.next_conscription?.[0] ?? 0,
    nextArc: scenario.next_conscription?.[1] ?? 0,
    nextInf: scenario.next_conscription?.[2] ?? 0,
    yieldCav: yields.cav,
    yieldArc: yields.arc,
    yieldInf: yields.inf,
  };
}

/** 换月结算主入口 — 完整复刻 KI.EXE 0x5358 / 0x53C6 / 0x5695 */
export function monthlySettlement(scenario, _clock) {
  const pIdx = scenario.player_faction ?? 0;
  const report = [];

  // 1. 0x53A6: 将次月税率与征兵设定转移为当月
  scenario.tax = scenario.next_tax ?? scenario.tax ?? 18;
  if (scenario.next_conscription) {
    scenario.conscription = [...scenario.next_conscription];
  } else {
    scenario.conscription = [0, 0, 0];
  }

  // 2. 0x5695: 据点生产力与上升率动力学 (192 城池全量刷新)
  for (const c of scenario.cities ?? []) {
    if (!c) continue;
    const growthBase = c.growth ?? 100;
    let growthDiff = growthBase - 100;

    // 玩家据点受玩家税率影响 (以 30% 为平衡基准)
    if (c.faction === pIdx) {
      growthDiff -= scenario.tax - 30;
    }

    let scale = 1;
    if (c.type === 0) scale = 3;
    else if (c.type === 1) scale = 2;
    const delta = scale * growthDiff;

    if (delta >= 0) {
      const inc = Math.floor(delta / 2);
      c.prod = Math.min(c.max_prod ?? 30000, (c.prod ?? 0) + inc);
      c.growth_rate = inc;
    } else {
      const dec = Math.abs(delta);
      c.prod = Math.max(0, (c.prod ?? 0) - dec);
      c.growth_rate = -dec;
    }

    // 随机扰动并重设 base (0..200)
    const randPerturb = Math.floor(Math.random() * 16);
    c.growth = Math.max(0, Math.min(200, growthDiff - randPerturb + 100));

    // 3. 0x4194: 城兵与防灾月度恢复 (内政官加成)
    let pol = 0;
    if (c.governor != null && scenario.generals?.[c.governor]) {
      pol = scenario.generals[c.governor].ability?.politics ?? 0;
    }
    let maxDef = 1500;
    if (c.troops_cap != null) maxDef = c.troops_cap;
    else if (c.type === 0) maxDef = 5000;
    else if (c.type === 1) maxDef = 3000;
    else if (c.type === 3) maxDef = 2000;
    c.defence = Math.min(maxDef, (c.defence ?? 0) + 10 + pol * 2);
    c.disaster = Math.min(200, (c.disaster ?? 100) + (pol > 0 ? 2 : 1));
  }

  // 4. 外交官常态关系改善不在月结执行。KI.EXE 0x3E11→0x3E8E
  // 每战略调度轮转一个势力，并经过两次随机门控后单向 +1；见 diplomacy.js。

  // 5. 0x53C6: 各势力财务与征兵结算
  for (const f of scenario.factions ?? []) {
    if (!f) continue;
    const rawIncome = computeFactionRawIncome(scenario, f.idx);
    const yields = computeConscriptionYields(scenario, f.idx);
    const expense = computeFactionExpense(scenario, f.idx);

    let actualIncome = 0;
    let conscriptedCav = 0;
    let conscriptedArc = 0;
    let conscriptedInf = 0;

    if (f.idx === pIdx) {
      // 玩家势力: 按设定税率征税，按设定征兵数补充预备兵
      actualIncome = Math.floor((rawIncome * scenario.tax) / 100);
      conscriptedCav = Math.min(scenario.conscription[0], yields.cav);
      conscriptedArc = Math.min(scenario.conscription[1], yields.arc);
      conscriptedInf = Math.min(scenario.conscription[2], yields.inf);
    } else {
      // AI 势力: 标准 25% 税率，征募全部可用兵额
      actualIncome = Math.floor(rawIncome * 0.25);
      conscriptedCav = yields.cav;
      conscriptedArc = yields.arc;
      conscriptedInf = yields.inf;
    }

    // 资金增减
    f.gold = Math.max(0, (f.gold ?? f.money ?? 0) + actualIncome - expense);
    f.money = f.gold;

    // 预备兵并入
    f.reserve_cav = saturatingAdd(f.reserve_cav ?? 0, conscriptedCav);
    f.reserve_arc = saturatingAdd(f.reserve_arc ?? 0, conscriptedArc);
    f.reserve_inf = saturatingAdd(f.reserve_inf ?? 0, conscriptedInf);
    f.troops =
      ((f.reserve_cav ?? 0) + (f.reserve_arc ?? 0) + (f.reserve_inf ?? 0)) * 10;

    // 赤字与信赖度处理 (连续赤字惩罚)
    if (f.idx === pIdx) {
      if (f.gold === 0) {
        f.brokeMonths = (f.brokeMonths ?? 0) + 1;
        if (f.brokeMonths >= 2 && !f.deficitScolded) {
          f.deficitScolded = true;
          // 连续赤字严词训斥: KI.EXE 0x3516 信赖度 -50 (al=0x32)
          scenario.trust = Math.max(0, (scenario.trust ?? 255) - 50);
        }
      } else {
        f.brokeMonths = 0;
        f.deficitScolded = false;
      }
    }

    report.push({
      faction: f.idx,
      monarch: f.monarch,
      income: actualIncome,
      expense,
      cav: conscriptedCav,
      arc: conscriptedArc,
      inf: conscriptedInf,
      gold: f.gold,
    });
  }

  return report;
}
