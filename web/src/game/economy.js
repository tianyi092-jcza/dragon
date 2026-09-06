// 财政与月度结算系统 — 完整逆向还原 KI.EXE 0x5358 / 0x53C6 / 0x54FC / 0x5538 / 0x5547 / 0x5695
//
// 逆向依据 (详见 docs/re-notes-kernel.md):
//   - 0x5358: 换月结算主函数。
//   - 0x53A6: 换月时将次月参数 (次月税率 CS:[0xD10]、次月征兵 CS:[0xD12..0xD17]) 复制到当月 (CS:[0xD08..0xD0F])。
//   - 0x54FC: 切比雪夫距离 → 距离衰减等级 (≤80: 2, ≤200: 3, >200: 4)。
//   - 0x5538: 城池生产力 ÷ 距离等级 累加得全势力原始收入基数。
//   - 0x548F: 玩家月收入 = 原始收入基数 × 本月税率(%) ÷ 100；三类征兵量受本月设定钳制。
//   - 0x5547: 城池征兵产出 base = (生产力 ÷ 距离等级) ÷ 32，按纬度 (北 y<80 骑多 / 中 80≤y<150 / 南 y≥150 弓步多) 计算三兵种征兵池。
//   - 0x54BF: 玩家设定征兵上限钳制实际征兵数，并入预备兵池 (reserve_cav, reserve_arc, reserve_inf)。
//   - 0x5695: 城池成长动力学。玩家税率与 30% 基准比较：税率<30% 增长，税率>30% 萎缩；更新生产力与上升率。
//   - 0x4194: 逐城市槽治理；本文件的月结不得重复写上升率、防灾或城兵。

export const FACTION_FUNDS_MAX = 655000;
export const FACTION_FUNDS_MIN = -655000;

/**
 * KI.EXE 0x5609/0x563B：势力资金是有符号24位运行值，并在 ±655000 饱和。
 * Web 同时维护历史字段 money 与运行字段 gold，任何即时收支必须同步两者。
 */
export function applyFactionFundsDelta(faction, delta) {
  if (!faction) return 0;
  const current = Number(faction.gold ?? faction.money ?? 0);
  const next = Math.max(
    FACTION_FUNDS_MIN,
    Math.min(
      FACTION_FUNDS_MAX,
      Math.trunc(
        (Number.isFinite(current) ? current : 0) + (Number(delta) || 0),
      ),
    ),
  );
  faction.gold = next;
  faction.money = next;
  return next;
}

/**
 * KI.EXE 0x2609..0x262E：军团每日军费。troops 是 legion[+4] 的十人单位。
 * 0x562B 仅有这两个直接调用点，六队兵种字段不参与单日金额公式。
 */
export function legionDailyMaintenanceCost(legion, onRoadEdge) {
  const troops = Math.max(
    0,
    Math.min(0xffff, Math.trunc(Number(legion?.troops) || 0)),
  );
  return onRoadEdge
    ? Math.floor(troops / 2) + Math.floor(troops / 4)
    : Math.floor(troops / 32) + 1;
}

/** KI.EXE faction[+0x1D]：所属势力军团士气上限。旧快照缺字段时兼容原版常值200。 */
export function factionLegionMoraleCap(faction) {
  const raw = Number(faction?.legion_morale_cap);
  return Number.isFinite(raw) ? Math.max(0, Math.min(0xff, raw | 0)) : 200;
}

export function saturatingAdd(cur, delta, max = 0xffff) {
  const v = (cur ?? 0) + delta;
  if (v < 0) return 0;
  return v > max ? max : v;
}

/**
 * KI.EXE 0x3E11：当前势力槽的财政门控。
 * 原版以 signed word[faction+0x21] 比较；该未对齐字等于有符号24位资金
 * 算术右移8位。一般不足时清战略目标，严重不足时另置 faction attr bit6。
 */
export function factionFundsWordQ256(faction) {
  const funds = Math.trunc(Number(faction?.gold ?? faction?.money ?? 0));
  return (Number.isFinite(funds) ? funds : 0) >> 8;
}

export function updateFactionFiscalCrisis(faction) {
  if (!faction || faction.active === false || (faction.attr ?? 0) < 0x80)
    return false;
  faction.attr &= 0xbf;
  const fundsQ256 = factionFundsWordQ256(faction);
  const threshold = Math.max(0, Math.trunc(faction.n_cities ?? 0)) * 8 + 24;
  let changed = false;
  if (threshold >= fundsQ256) {
    if (faction.target_faction != null && faction.target_faction !== 0xff) {
      faction.target_faction = null;
      changed = true;
    }
    if (threshold >> 1 >= fundsQ256) faction.attr |= 0x40;
  }
  return changed;
}

/**
 * KI.EXE 0x3E65→0x5673：每次该势力槽被0x3E11轮询时，将三类预备兵
 * 合计/32累加到本月支出。这里按Web金单位直接返回本次增量，由月结扣除。
 */
export function factionReserveUpkeepTick(faction) {
  if (!faction) return 0;
  const total =
    Math.max(0, Math.trunc(faction.reserve_cav ?? 0)) +
    Math.max(0, Math.trunc(faction.reserve_arc ?? 0)) +
    Math.max(0, Math.trunc(faction.reserve_inf ?? 0));
  return Math.floor(total / 32);
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
      // 0x5568..0x557C：北方为骑19/32、弓1/32、步3/8（逐次移位取整）。
      let inf = base >> 2;
      let arc = inf >> 1;
      inf += arc;
      arc >>= 2;
      const cav = Math.max(0, base - inf - arc);
      cavYield += cav;
      arcYield += arc;
      infYield += inf;
    } else if (y < 150) {
      // 0x557E..0x558C：中部骑1/8、弓1/8、步为余数。
      const cav = base >> 3;
      const arc = cav;
      const inf = Math.max(0, base - cav - arc);
      cavYield += cav;
      arcYield += arc;
      infYield += inf;
    } else {
      // 0x558E..0x5598：南方骑1/32、弓1/2、步=(1/2-1/32)。
      const cav = base >> 5;
      const arc = base >> 1;
      const inf = Math.max(0, arc - cav);
      cavYield += cav;
      arcYield += arc;
      infYield += inf;
    }
  }

  return {
    cav: cavYield,
    arc: arcYield,
    inf: infYield,
  };
}

/** 计算势力的月支出；外交费由type-5对话批准时一次性扣除。 */
export function computeFactionExpense(scenario, factionIdx) {
  const f = scenario.factions[factionIdx];
  if (!f) return 0;
  // 0x3E65 已在该势力每次0x3E11轮询时累计，不能在月结按固定24周期重算。
  const troopUpkeep = Math.max(0, Math.trunc(f.monthly_reserve_upkeep ?? 0));

  // 0x5715/0x578F只排预算事件，批准额随后即时扣除；0x5358这里只扣
  // faction[+0x1A..+0x1C]已累计支出。原版没有“每名武将20金”月俸。
  return troopUpkeep;
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

/** 0x53A6..0x53B9：月结全部事件生产完毕后，次月政策才转为当前政策。 */
export function activateNextMonthPolicy(scenario) {
  scenario.tax = scenario.next_tax ?? scenario.tax ?? 18;
  if (Array.isArray(scenario.next_conscription)) {
    scenario.conscription = [...scenario.next_conscription];
  } else if (!Array.isArray(scenario.conscription)) {
    scenario.conscription = [0, 0, 0];
  }
}

/** 换月结算主入口 — 完整复刻 KI.EXE 0x5358 / 0x53C6 / 0x5695 */
export function monthlySettlement(scenario, _clock, rng) {
  if (!rng?.nextByte)
    throw new TypeError("monthly settlement requires canonical original RNG");
  const pIdx = scenario.player_faction ?? 0;
  const report = [];

  // 0x5358先用本月设定结算；0x53A6在全部月结事件之后才把次月设定转正。
  const currentTax = scenario.tax ?? 18;
  const currentConscription = Array.isArray(scenario.conscription)
    ? scenario.conscription
    : [0, 0, 0];
  // 0x5358先逐势力调用0x53C6，0x5695在财务结算完成后才改生产力。
  const financeInputs = new Map(
    (scenario.factions ?? [])
      .filter((faction) => faction && faction.active !== false)
      .map((faction) => [
        faction.idx,
        {
          rawIncome: computeFactionRawIncome(scenario, faction.idx),
          yields: computeConscriptionYields(scenario, faction.idx),
          expense: computeFactionExpense(scenario, faction.idx),
        },
      ]),
  );

  // 0x5695: 据点生产力与上升率动力学 (192 城池全量刷新)
  for (const c of scenario.cities ?? []) {
    if (!c) continue;
    const growthBase = c.growth ?? 100;
    let growthDiff = growthBase - 100;

    // 玩家据点受玩家税率影响 (以 30% 为平衡基准)
    if (c.faction === pIdx) {
      growthDiff -= currentTax - 30;
    }

    // 0x56BD..0x56C8直接读取当前生产力word的高字节；为0时按1。
    const scale = Math.max(1, ((c.prod ?? 0) >>> 8) & 0xff);
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
    const randPerturb = rng.nextByte() & 0x0f;
    c.growth = Math.max(0, Math.min(200, growthDiff - randPerturb + 100));
  }

  // 4. 外交官常态关系改善不在月结执行。KI.EXE 0x3E11→0x3E8E
  // 每战略调度轮转一个势力，并经过两次随机门控后单向 +1；见 diplomacy.js。

  // 5. 0x53C6: 各势力财务与征兵结算
  for (const f of scenario.factions ?? []) {
    if (!f || f.active === false) continue;
    const { rawIncome, yields, expense } = financeInputs.get(f.idx) ?? {
      rawIncome: 0,
      yields: { cav: 0, arc: 0, inf: 0 },
      expense: 0,
    };

    let actualIncome = 0;
    let conscriptedCav = 0;
    let conscriptedArc = 0;
    let conscriptedInf = 0;

    if (f.idx === pIdx) {
      // 玩家势力: 按设定税率征税，按设定征兵数补充预备兵
      actualIncome = Math.floor((rawIncome * currentTax) / 100);
      conscriptedCav = Math.min(currentConscription[0] ?? 0, yields.cav);
      conscriptedArc = Math.min(currentConscription[1] ?? 0, yields.arc);
      conscriptedInf = Math.min(currentConscription[2] ?? 0, yields.inf);
    } else {
      // 0x5456：AI收入为原始收入24位值右移1；兵源并入另受财政门控。
      actualIncome = Math.floor(rawIncome / 2);
      const legionTroops = (scenario.legions ?? [])
        .filter((legion) => legion && legion.faction === f.idx && !legion.dead)
        .reduce(
          (sum, legion) => (sum + Math.max(0, legion.troops ?? 0)) & 0xffff,
          0,
        );
      const burdenQ256 =
        (((legionTroops >>> 8) + ((expense >>> 8) & 0xffff)) << 1) & 0xffff;
      const canConscript = burdenQ256 < ((actualIncome >>> 8) & 0xffff);
      if (canConscript) {
        conscriptedCav = yields.cav;
        conscriptedArc = yields.arc;
        conscriptedInf = yields.inf;
      }
    }

    // 资金增减：0x5609/0x563B 允许赤字，统一在 ±655000 饱和，不能截到0。
    applyFactionFundsDelta(f, actualIncome - expense);
    f.monthly_reserve_upkeep = 0;

    // 预备兵并入
    f.reserve_cav = saturatingAdd(f.reserve_cav ?? 0, conscriptedCav);
    f.reserve_arc = saturatingAdd(f.reserve_arc ?? 0, conscriptedArc);
    f.reserve_inf = saturatingAdd(f.reserve_inf ?? 0, conscriptedInf);
    f.troops =
      ((f.reserve_cav ?? 0) + (f.reserve_arc ?? 0) + (f.reserve_inf ?? 0)) * 10;

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
