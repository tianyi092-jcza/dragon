// 玩家军师解析。进言提案/信赖/RNG规则由GameBar中的已逆向对话链负责；
// 本模块不再保留旧Web“诚实/劣质建议”随机替代系统。

/**
 * 玩家军师解析：①自定军师 ②确认的原军师 ③势力记录byte[2]
 * 未指定则空缺；不以君主或其他武将代任。
 */
export function getAdvisor(sc, faction) {
  const playerAdvisor = faction?.idx === sc.player_faction ? sc.player_advisor : null;
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
  if (faction?.advisor_idx != null) {
    const assigned = sc.generals[faction.advisor_idx];
    if (assigned?.active) return assigned;
  }
  return null;
}
