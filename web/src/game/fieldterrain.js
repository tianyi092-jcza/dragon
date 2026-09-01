// 野战地形选择 — 逐指令转录 KI.EXE 0x4B63..0x4C71。
// 输出的 directoryIndex 是 BATTLE.MAP 目录索引（CS:[0xD34]）；
// mirror 对应 CS:[0xD35] bit6，实际地图布局/主题再由BATTLE.MAP目录读取。

import { terrainTile } from "./pathfind.js";

const TERRAIN_RANGES = [
  [1, 0xb8, 0xb9],
  [2, 0xba, 0xbf],
  [3, 0x70, 0xa7],
  [3, 0xa9, 0xaf],
  [4, 0x06, 0x06],
  [4, 0x1d, 0x1d],
  [4, 0xb0, 0xb0],
  [4, 0xb6, 0xb7],
  [5, 0xb1, 0xb3],
  [6, 0x0e, 0x0f],
  [6, 0x1e, 0x6f],
  [7, 0xa8, 0xa8],
  [8, 0xca, 0xca],
  [9, 0xc0, 0xc3],
];

// {layout - 0xC0, first terrain class, second terrain class} @ CS:0x97F0.
const TERRAIN_PAIRS = [
  [0, 3, 3],
  [1, 3, 0],
  [2, 3, 5],
  [3, 3, 6],
  [4, 3, 4],
  [5, 3, 7],
  [6, 0, 0],
  [6, 0, 4],
  [7, 0, 5],
  [8, 0, 6],
  [8, 5, 6],
  [9, 5, 5],
  [10, 5, 4],
  [11, 4, 4],
  [12, 4, 6],
  [13, 6, 6],
  [14, 7, 7],
  [6, 0, 7],
  [9, 5, 7],
  [14, 6, 7],
  [11, 4, 7],
];

/** KI.EXE 0x4C4C：把战略图块编号压缩为野战环境类别 0..9。 */
export function fieldTerrainClass(tile) {
  if (tile == null) return 0;
  for (const [kind, low, high] of TERRAIN_RANGES) {
    if (tile >= low && tile <= high) return kind;
  }
  return 0;
}

function sample(x, y) {
  return fieldTerrainClass(terrainTile(x, y));
}

function playerFacing(attacker, defender, playerFaction) {
  // 0x4B67 保留入口 AL；玩家在任一侧时才用该玩家军团的 legion[+8] 覆盖。
  if (attacker?.faction === playerFaction) return attacker._markerFrame ?? 0;
  if (defender?.faction === playerFaction) return defender._markerFrame ?? 0;
  return attacker?._markerFrame ?? 0;
}

/**
 * 复刻 0x4B63：在防守军团道路点读取左/右/上/下/中心五格并选择 BATTLE.MAP 目录。
 * _markerFrame 对应原版 legion[+8]：0西、1东、2北、3南。
 */
export function classifyFieldBattleTerrain(
  attacker,
  defender,
  playerFaction,
  rng,
) {
  const x = defender?.x;
  const y = defender?.y;
  if (!Number.isInteger(x) || !Number.isInteger(y)) {
    return { directoryIndex: 0xc6, mirror: false, terrainClass: 0 };
  }

  const west = sample(x - 1, y);
  const east = sample(x + 1, y);
  const north = sample(x, y - 1);
  const south = sample(x, y + 1);
  const center = sample(x, y);

  if (center) {
    if (center < 8) {
      return {
        directoryIndex: 0xce + center,
        mirror: false,
        terrainClass: center,
      };
    }
    if (center === 9) {
      const mirror =
        (terrainTile(attacker?.x, attacker?.y) === 0xca) !==
        (attacker?.faction === playerFaction);
      return { directoryIndex: 0xd5, mirror, terrainClass: center };
    }
    if (!rng?.nextByte)
      throw new TypeError(
        "field terrain class 8 requires canonical original RNG",
      );
    return {
      directoryIndex: 0xd1 + (rng.nextByte() & 3),
      mirror: false,
      terrainClass: center,
    };
  }

  const direction = playerFacing(attacker, defender, playerFaction);
  let first;
  let second;
  if (direction === 0) {
    first = south;
    second = north;
  } else if (direction === 1) {
    first = north;
    second = south;
  } else if (direction === 2) {
    first = west;
    second = east;
  } else {
    first = east;
    second = west;
  }

  for (const [offset, left, right] of TERRAIN_PAIRS) {
    if (first === left && second === right) {
      return {
        directoryIndex: 0xc0 + offset,
        mirror: false,
        terrainClass: center,
      };
    }
    if (first === right && second === left) {
      return {
        directoryIndex: 0xc0 + offset,
        mirror: true,
        terrainClass: center,
      };
    }
  }
  return { directoryIndex: 0xc6, mirror: false, terrainClass: center };
}
