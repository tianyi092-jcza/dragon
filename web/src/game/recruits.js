// 武将出场/登用 — 复刻 SINARIO 武将记录 appear_months/join_faction 语义
// 数据事实(parse_sinario.py):
//   - appear_months = 从剧本开始起算的月数, 到期该武将登场
//   - join_faction = 登场时加入的势力索引 (0=曹操 1=孙策 2=刘备 4=张鲁…与剧本 factions 对齐)
//     实测: 周倉45→劉備 / 關平44→劉備 / 諸葛亮130→劉備 / 徐庶128→劉備 /
//           滿寵104→曹操 / 龐德176→張魯(原属馬騰, 在野转投) — 与史实锚点吻合
//   - faction≠null 且 join≠faction = 在野武将到期改换门庭 (甘寧: 劉表→孫策)
//   - join=null (魏延等每剧本1人) = 不自动登场, 留作事件用 → Web 版暂不处理
/** 已登场判定: appear_months==0 的武将开局即在场上 */
function isOnMap(g) {
  return g.appear_months === 0;
}

/** 月末钩子 — main.js onMonthEnd 调用; app.clock 提供当前年月 */
export function monthlyAppear(app) {
  const sc = app.scenario;
  if (!sc || !app.clock) return;
  const elapsed =
    (app.clock.year - sc.start.year) * 12 + (app.clock.month - sc.start.month);
  // 本局已处理表(防重复登场); setScenario 换剧本后是新对象自然重置
  sc._appeared = sc._appeared ?? new Set();
  for (const g of sc.generals) {
    if (isOnMap(g) || g.join_faction == null) continue;
    if (sc._appeared.has(g.idx)) continue;
    if (elapsed < g.appear_months) continue;
    const f = sc.factions[g.join_faction];
    if (!f || f.dead) continue; // 目标势力已亡 → 继续等待(不强行塞给死人)
    if (g.status === 4) continue; // 在押者不改门庭
    g.faction = f.idx;
    g.status = 0;
    sc._appeared.add(g.idx);
    app.hud?.flashEvent?.(`${g.name} 出場、投奔 ${f.monarch}麾下`);
  }
}
