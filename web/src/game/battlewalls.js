// 战术攻城城壁对象 — KI.EXE 0x9CB3→0x9CE2 / 0xB533→0xB824
//
// 原版从 BATTLE.MAP 的 64×64 图块窗口按列扫描 0xD0..0xDF。每段垂直
// 连续图块生成一条 0x20 字节对象记录，退出时只扫描对象池 0xC00 起的
// 前 16 条。本模块保留 flags/kind/+0x18 metric 等原始语义；Web 实时
// 战术只用已确认的“接触时 metric--，归零后 bit0=1”状态迁移。

export const WALL_RECORD_COUNT = 16;
export const BATTLE_MAP_SIDE = 64;
export const BATTLE_TILE_SIZE = 16;
export const WALL_ATTACK_RANGE = 22;

function emptyWallRecord(index) {
  return {
    index,
    flags: 0,
    kind: 0,
    x: 0,
    y: 0,
    span: 0,
    sourceOffset: null,
    sourceTile: null,
    metric: 0,
    intact: false,
  };
}

function cityWallMetric(cityTroops, mode) {
  if (mode !== 0) return 0x12c;
  return (Math.max(0, cityTroops | 0) + 0x32) * 10;
}

/**
 * 复刻 0x9CE2 的前 16 条 kind=1 地图对象构造。
 *
 * BATTLE.MAP 是 row-major 64×64；原版扫描顺序为 x 外层、y 内层，因此
 * 同一列中每段连续的 0xD0..0xDF 只生成一条记录。
 */
export function createWallRecords(layoutTiles, cityTroops, mode = 0) {
  if (!Array.isArray(layoutTiles) || layoutTiles.length < 4096) return null;
  const records = [];
  const metric = cityWallMetric(cityTroops, mode);

  for (
    let x = 0;
    x < BATTLE_MAP_SIDE && records.length < WALL_RECORD_COUNT;
    x++
  ) {
    let current = null;
    for (
      let y = 0;
      y < BATTLE_MAP_SIDE && records.length < WALL_RECORD_COUNT;
      y++
    ) {
      const sourceOffset = y * BATTLE_MAP_SIDE + x;
      const tile = layoutTiles[sourceOffset] | 0;
      const isWall = tile >= 0xd0 && tile < 0xe0;
      if (isWall) {
        if (!current) {
          current = {
            index: records.length,
            flags: 0x80,
            kind: 1,
            x,
            y,
            span: 0,
            sourceOffset,
            sourceTile: tile,
            metric,
            intact: true,
          };
          records.push(current);
        }
        current.span += 1;
      } else {
        current = null;
      }
    }
  }

  while (records.length < WALL_RECORD_COUNT) {
    records.push(emptyWallRecord(records.length));
  }
  return records;
}

export function wallDestroyed(record) {
  if (!record || record.kind !== 1) return true;
  if (record.flags != null) return Boolean(record.flags & 1);
  return record.intact === false;
}

/** 复刻已闭合的城壁接触更新：word +0x18 递减；归零后 bit0=1、bit7=0。 */
export function strikeWallRecord(record, ticks = 1) {
  if (!record || record.kind !== 1 || wallDestroyed(record)) return 0;
  const applied = Math.max(0, Math.floor(ticks));
  if (!applied) return 0;
  const before = Math.max(0, record.metric | 0);
  record.metric = Math.max(0, before - applied);
  if (record.metric === 0) {
    record.flags = ((record.flags ?? 0x80) | 1) & 0x7f;
    record.intact = false;
  }
  return before - record.metric;
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

export function wallCenter(record) {
  const rect = wallRect(record);
  if (!rect) return null;
  return {
    x: (rect.left + rect.right) / 2,
    y: (rect.top + rect.bottom) / 2,
  };
}

export function nearestIntactWall(records, point) {
  if (!Array.isArray(records) || !point) return null;
  let best = null;
  let bestDistance = Infinity;
  for (const record of records) {
    if (wallDestroyed(record)) continue;
    const center = wallCenter(record);
    const distance = Math.hypot(center.x - point.x, center.y - point.y);
    if (distance < bestDistance) {
      best = record;
      bestDistance = distance;
    }
  }
  return best;
}

/** 返回从 start 到 end 直线穿过的首条未破坏城壁记录。 */
export function blockingWall(records, start, end) {
  if (!Array.isArray(records) || !start || !end || start.x === end.x)
    return null;
  let best = null;
  let bestT = Infinity;
  for (const record of records) {
    if (wallDestroyed(record)) continue;
    const rect = wallRect(record);
    const wallX = (rect.left + rect.right) / 2;
    const t = (wallX - start.x) / (end.x - start.x);
    if (t <= 0 || t > 1 || t >= bestT) continue;
    const crossY = start.y + (end.y - start.y) * t;
    if (crossY < rect.top || crossY > rect.bottom) continue;
    best = record;
    bestT = t;
  }
  return best;
}

/** 将移动终点限制在城壁外侧，避免未破坏城壁被普通移动穿透。 */
export function stopBeforeWall(record, start, end, padding = 10) {
  const center = wallCenter(record);
  if (!center) return end;
  const direction = Math.sign(end.x - start.x) || 1;
  return {
    x: center.x - direction * Math.max(1, padding),
    y: start.y,
  };
}
