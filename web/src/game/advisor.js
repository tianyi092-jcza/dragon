// 玩家军师解析。进言提案/信赖/RNG规则由GameBar中的已逆向对话链负责；
// 本模块不再保留旧Web“诚实/劣质建议”随机替代系统。

/**
 * 玩家军师解析：①自定军师 ②确认的原军师 ③势力记录byte[2]
 * ④政治最高的可用武将回退（0x45C1同值保持低索引）。
 */
export function getAdvisor(sc, faction) {
  const playerAdvisor = sc.player_advisor;
  if (playerAdvisor) {
    if (playerAdvisor.custom)
      return {
        name: playerAdvisor.name,
        hao: playerAdvisor.hao,
        portrait: playerAdvisor.portrait,
        custom: true,
      };
    const selected = sc.generals[playerAdvisor.general_idx];
    if (selected) return selected;
  }
  if (faction.advisor_idx != null) {
    const assigned = sc.generals[faction.advisor_idx];
    if (assigned?.active) return assigned;
  }
  let best = null;
  for (const general of sc.generals) {
    if (
      general.faction !== faction.idx ||
      general.status !== 0 ||
      !general.active ||
      general.is_player
    )
      continue;
    if (!best || general.ability.politics > best.ability.politics)
      best = general;
  }
  return best;
}
