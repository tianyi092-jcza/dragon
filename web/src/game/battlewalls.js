// Canvas城壁投影辅助。权威城壁记录由OriginalBattleSession地图对象池产生；
// 本模块只把记录转换为屏幕矩形，不推进metric、碰撞或破坏规则。

export const BATTLE_TILE_SIZE = 16;

export function wallDestroyed(record) {
  if (!record || record.kind !== 1) return true;
  return Boolean(record.flags & 1);
}

export function wallRect(record) {
  if (!record || record.kind !== 1) return null;
  return {
    left: record.x * BATTLE_TILE_SIZE,
    right: (record.x + 1) * BATTLE_TILE_SIZE,
    top: record.y * BATTLE_TILE_SIZE,
    bottom: (record.y + Math.max(1, record.span | 0)) * BATTLE_TILE_SIZE,
  };
}
