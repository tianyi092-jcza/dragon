// 月度结算 — 对应 KI.EXE 0x5358 换月处理
// ★真实公式 (逆向自 0x53C6/0x54FC/0x5538/0x5547, 见 docs/re-notes-kernel.md)
//
// 每势力遍历己方城池:
//   等级 = 距都城切比雪夫距离查表: ≤80→2, ≤200→3, 其余→4  (阈值表 CS:0x5532)
//   金 += 开发值 / 等级                        (0x5538, 带进位双字累计)
//   base = 开发值 / 等级 / 32                  (0x5547 >>5)
//   按 [di+0xA](民忠?) 分档扣减:
//     <80:  扣 base/4+base/16 + 其半   →粮
//     <150: 扣 base/8                  →兵
//     ≥150: 扣 base/32                 →兵
// 结果经饱和加法并入势力资源 (+4金/+6粮/+8兵)

export function saturatingAdd(cur, delta, max = 0xffff) {
  // 复刻 55EC
  const v = cur + delta;
  if (v < 0) return 0;
  return v > max ? max : v;
}

/** 复刻 0x54FC: 切比雪夫距离 → 衰减等级 */
function distLevel(c, cap) {
  const dx = Math.abs(cap.x - c.x),
    dy = Math.abs(cap.y - c.y);
  const d = Math.max(dx, dy) & 0xff;
  if (d <= 0x50) return 2;
  if (d <= 0xc8) return 3;
  return 4;
}

/** 月度结算主入口 — 结构复刻 0x53C6 */
export function monthlySettlement(scenario, _clock, taxRate = 25) {
  const report = [];
  for (const f of scenario.factions) {
    const cap = scenario.cities[f.capital]; // 都城 (0x54FC 取坐标基准)
    if (!cap) continue;
    let gold = 0,
      goldCarry = 0; // [bp]双字 (0x5538 adc 进位)
    let food = 0,
      troops = 0,
      nCity = 0;
    for (const c of scenario.citiesOf(f.idx)) {
      const L = distLevel(c, cap);
      // 0x5538: 金 += prod / L (余数进位)
      const g = Math.floor((c.prod ?? 0) / L);
      goldCarry += (c.prod ?? 0) % L >= L / 2 ? 1 : 0;
      gold += g;
      nCity++;
      // 0x5547: base = prod/L/32; 按 [di+0xA] 分档
      const base = Math.floor(g / 32);
      const m = c.growth ?? 100; // [di+0xA] (growth 字段)
      let a = base,
        cx = 0,
        dx = 0;
      if (m < 0x50) {
        // <80: 重税档
        dx = Math.floor(base / 4) + Math.floor(base / 16);
        cx = Math.floor(dx / 4);
        a -= dx + cx;
      } else if (m < 0x96) {
        // <150: 中档
        dx = Math.floor(base / 8);
        cx = a - dx - Math.floor(dx / 2);
        a = Math.floor(base >> 3); // 与反汇编对齐: ax>>3
        dx = base - a - cx;
      } else {
        // ≥150: 低档
        dx = base - Math.floor(base / 32);
        cx = dx;
        a = Math.floor(base / 32);
      }
      food += cx;
      troops += dx;
      void a;
    }
    // 饱和并入三资源 (0x55EC), 金用双字合计
    f.gold = saturatingAdd(f.gold ?? 0, gold + (goldCarry > 0xff ? 0xff : 0));
    f.food = saturatingAdd(f.food ?? 0, food);
    f.troops = saturatingAdd(f.troops ?? 0, troops);

    // ★财政连续负3月→未出征部队消失 (攻略实证; 对应调度器灭亡判定候选)
    if ((f.gold ?? 0) === 0) f.brokeMonths = (f.brokeMonths ?? 0) + 1;
    else f.brokeMonths = 0;

    // ★发展度: 税率≤30%稳定增长, >30%转负 (攻略实证; 发展度±200)
    for (const c of scenario.citiesOf(f.idx)) {
      const g = (c.development ?? 50) + (taxRate <= 30 ? 10 : -10);
      c.development = Math.max(-200, Math.min(200, g));
      if (c.development > 0)
        c.prod = Math.min(30000, (c.prod ?? 0) + Math.ceil(c.development / 40));
      else if (c.development < 0)
        c.prod = Math.max(100, (c.prod ?? 0) + Math.ceil(c.development / 20));
    }

    report.push({
      faction: f.idx,
      monarch: f.monarch,
      income: gold,
      food,
      troops,
      cities: nCity,
    });
  }
  return report;
}
