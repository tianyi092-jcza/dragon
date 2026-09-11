// 玩家身份只读查询；命令与外交共享，不依赖命令执行、UI或存储。
// 保留既有Web玩家化身约定（非原版候选筛选规则），不修改任何场景字段。

/** 已被玩家确认为化身的剧本军师不再是可操作武将。 */
export function isPlayerAdvisorGeneral(sc, general) {
  if (!general) return false;
  if (general.is_player) return true;
  const selected = sc?.player_advisor;
  return Boolean(
    selected && !selected.custom && selected.general_idx === general.idx,
  );
}

/** 玩家势力对象(null=无) */
export function playerFaction(sc) {
  return (
    sc.factions.find((f) => f.idx === (sc.player_faction ?? 0)) ??
    sc.factions[0] ??
    null
  );
}
