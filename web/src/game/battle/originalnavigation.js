// KI.EXE 0xBB3C..0xBD43 战术地图可通行层、方向mask与路径代价。
// CAEB..CB43 以目录号读取 BATTLE.MAP 的独立 64×64 tile map；
// CB44..CB71 再按 layout 读取 BATTLE.MDL 0xF800 块，其中前 0x800
// 是 D302 的 256×8 字节 tile 描述。BATTLE.SCH 是战术对象图形，不是调度表。

export const ORIGINAL_MAP_WIDTH = 0x40;
export const ORIGINAL_MAP_CELLS = 0x1000;
export const ORIGINAL_NAV_PLANE_SIZE = 0x1000;
export const ORIGINAL_NAV_PLANES = 2;
export const ORIGINAL_NAV_COST_BASE = 0x2000;
export const ORIGINAL_NAV_COST_COUNT = 0x2000; // BC22..BC2E: 0x1000 zero words
export const ORIGINAL_TILE_ATTRIBUTE_SIZE = 0x800;
export const ORIGINAL_MDL_LAYOUT_SIZE = 0xf800;

function cellIndex(x, y) {
  const xx = x | 0;
  const yy = y | 0;
  if (xx < 0 || xx >= 0x40 || yy < 0 || yy >= 0x40)
    throw new RangeError("original tactical map coordinate outside 64x64");
  return yy * ORIGINAL_MAP_WIDTH + xx;
}

function checkBytes(source, expected, label) {
  if (!source || source.length < expected)
    throw new TypeError(`invalid original ${label} bytes`);
}

/** CAEB：从原始 BATTLE.MAP/MDL 提取当前目录地图与 layout 描述表。 */
export function loadOriginalBattleMapAssets(
  battleMapBytes,
  _battleScheduleBytes,
  directoryIndex,
  { mirror = false, modelBytes = null } = {},
) {
  checkBytes(battleMapBytes, 0x200, "BATTLE.MAP");
  const index = directoryIndex & 0xff;
  const layout = battleMapBytes[index * 2];
  let theme = battleMapBytes[index * 2 + 1];
  const tileOffset = 0x200 + index * ORIGINAL_MAP_CELLS;
  const attributeOffset = 0x1000 + layout * ORIGINAL_MDL_LAYOUT_SIZE;
  const battleModelBytes = modelBytes ?? battleMapBytes;
  checkBytes(
    battleMapBytes,
    tileOffset + ORIGINAL_MAP_CELLS,
    "BATTLE.MAP tile",
  );
  checkBytes(
    battleModelBytes,
    attributeOffset + ORIGINAL_TILE_ATTRIBUTE_SIZE,
    "BATTLE.MDL attribute",
  );
  let tiles = Uint8Array.from(
    battleMapBytes.subarray(tileOffset, tileOffset + ORIGINAL_MAP_CELLS),
  );
  if (mirror) {
    tiles = mirrorOriginalBattleTiles(tiles);
    if (theme !== 0) theme = 0x3f - theme;
  }
  return {
    directoryIndex: index,
    layout,
    theme,
    tiles,
    attributes: Uint8Array.from(
      battleModelBytes.subarray(
        attributeOffset,
        attributeOffset + ORIGINAL_TILE_ATTRIBUTE_SIZE,
      ),
    ),
  };
}

/** CB9B/CBBC：反转0x40..0xFBF的线性内部区，并转换方向tile编码。 */
export function mirrorOriginalBattleTiles(tileBytes) {
  checkBytes(tileBytes, ORIGINAL_MAP_CELLS, "battle tile");
  const result = Uint8Array.from(tileBytes.subarray(0, ORIGINAL_MAP_CELLS));
  const transform = (value) => {
    let tile = value & 0xff;
    if (tile >= 0x30 && tile < 0xf0) {
      if (tile < 0xd0) tile = ((tile - 0x30) ^ 0x10) + 0x30;
      else {
        const direction = tile & 3;
        if (direction === 0 || direction === 3) tile ^= 3;
      }
    } else if (tile >= 0xf0) tile ^= 1;
    return tile;
  };
  let low = 0x40;
  let high = 0x0fbf;
  for (let count = 0; count < 0x07c0; count++) {
    const oldLow = result[low];
    result[low++] = transform(result[high]);
    result[high--] = transform(oldLow);
  }
  return result;
}

function descriptorForTile(attributes, tile) {
  const base = (tile & 0xff) * 8 + 1;
  const sample = (offset) => {
    let cursor = base + offset;
    if (cursor >= 0x680 && cursor <= 0x700) cursor += 0x80;
    return attributes[cursor] ?? 0;
  };
  let low = 0x80;
  let high = 0x80;
  let level = 0;
  for (; level < 4; level++) {
    if (sample(level) >= 0x70) {
      low = level;
      break;
    }
  }
  if (low !== 0x80) {
    if (base >= 0x780) high = 8;
    else level++;
  }
  if (high === 0x80) {
    for (; level <= 6; level++) {
      if (sample(level) >= 0x70) {
        high = level;
        break;
      }
    }
  }
  return { low, high };
}

function connectDirection(current, neighbor, bit) {
  let neighborHigh = neighbor.high;
  if (neighborHigh === 8 && current.high <= 6) neighborHigh = current.high;
  let low = false;
  if (neighbor.low !== 0x80 && current.low !== 0x80) {
    const upper = current.low + 1;
    low = upper >= neighbor.low && upper - 2 <= neighbor.low;
  }
  const high =
    neighborHigh !== 0x80 &&
    current.high !== 0x80 &&
    (current.high === 8 || current.high === neighborHigh);
  return {
    low: low ? bit : 0,
    high: high ? bit : 0,
    neighborHigh,
  };
}

/** BB3C/BBA6：构造双方向mask平面及目标层高度描述；全链0 RNG。 */
export function buildOriginalBattleNavigation(tileBytes, attributeBytes) {
  checkBytes(tileBytes, ORIGINAL_MAP_CELLS, "battle tile");
  checkBytes(attributeBytes, ORIGINAL_TILE_ATTRIBUTE_SIZE, "battle attribute");
  const descriptors = Array.from({ length: ORIGINAL_MAP_CELLS }, (_, index) =>
    descriptorForTile(attributeBytes, tileBytes[index]),
  );
  const navigation = new Uint8Array(
    ORIGINAL_NAV_COST_BASE + ORIGINAL_NAV_COST_COUNT,
  );
  const directions = [
    { bit: 0x10, dx: -1, dy: 0 },
    { bit: 0x20, dx: 1, dy: 0 },
    { bit: 0x40, dx: 0, dy: -1 },
    { bit: 0x80, dx: 0, dy: 1 },
  ];
  for (let y = 0; y < 0x40; y++) {
    for (let x = 0; x < 0x40; x++) {
      const index = cellIndex(x, y);
      const current = descriptors[index];
      let low = 0;
      let high = 0;
      if (current.high === 8) {
        low |= 8;
        high |= 8;
      }
      for (const direction of directions) {
        const nx = x + direction.dx;
        const ny = y + direction.dy;
        if (nx < 0 || nx >= 0x40 || ny < 0 || ny >= 0x40) continue;
        const linked = connectDirection(
          current,
          descriptors[cellIndex(nx, ny)],
          direction.bit,
        );
        low |= linked.low;
        high |= linked.high;
      }
      navigation[index] = low | (current.low & 7);
      navigation[index + ORIGINAL_NAV_PLANE_SIZE] = high | (current.high & 7);
    }
  }

  let lowRamps = 0;
  let highRamps = 0;
  for (let index = 0; index < ORIGINAL_MAP_CELLS; index++) {
    const value = navigation[index + ORIGINAL_NAV_PLANE_SIZE];
    if ((value & 8) === 0) continue;
    if ((value & 7) <= 4) lowRamps++;
    else highRamps++;
  }
  const canonicalRamp = highRamps > lowRamps ? 5 : 4;
  for (let index = 0; index < ORIGINAL_MAP_CELLS; index++) {
    const value = navigation[index + ORIGINAL_NAV_PLANE_SIZE];
    const level = value & 7;
    const flags = value & 0xf8;
    navigation[index + ORIGINAL_NAV_PLANE_SIZE] =
      level === canonicalRamp
        ? canonicalRamp | flags
        : (flags & 8) === 0
          ? level
          : canonicalRamp | flags;
  }
  return { navigation, descriptors, canonicalRamp };
}

export function createOriginalNavigationFromAssets(assets) {
  const built = buildOriginalBattleNavigation(assets.tiles, assets.attributes);
  return { ...assets, ...built };
}

/** Web导出资产：目录号选择地图，layout 只选择 MDL 描述表。 */
export function navigationAssetsForLayout(
  resource,
  layout,
  { directoryIndex = layout, mirror = false } = {},
) {
  const source = resource?.layouts?.[String(layout)];
  if (!source)
    throw new RangeError("missing original battle navigation layout");
  const mapSource = resource?.maps?.[String(directoryIndex)];
  // 兼容旧的最小测试夹具；生产资源必须提供按目录号索引的 maps。
  let tiles = Uint8Array.from(mapSource ?? source.tiles ?? []);
  checkBytes(tiles, ORIGINAL_MAP_CELLS, "battle tile");
  if (mirror) tiles = mirrorOriginalBattleTiles(tiles);
  return {
    directoryIndex: directoryIndex | 0,
    layout: layout | 0,
    tiles,
    attributes: Uint8Array.from(source.attributes ?? []),
  };
}
