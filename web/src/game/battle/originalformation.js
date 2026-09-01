// KI.EXE 0xAA2C/0xAA7E 原版阵型目标计算。
// 向量表由 tools/export_battle_rules.py 从 CS:0xCCE4 导出；D342/D344是
// 字节偏移，必须在word读取前相加，不能当作向量序号或对48项取模。

import {
  ORIGINAL_OBJECT,
  originalAddressParts,
  originalObjectAddress,
} from "./originalstate.js";

const signedByte = (value) => {
  const byte = value & 0xff;
  return (byte & 0x80) === 0 ? byte : byte - 0x100;
};
const clampCoordinate = (value) => Math.max(1, Math.min(0x3e, value));

function formationByteIndex(address, sideOffsets) {
  const { side, group, slot } = originalAddressParts(address);
  const localByteIndex = group * 0x10 + slot * 2;
  const offset = (sideOffsets?.[side] ?? 0) & 0xffff;
  const byteIndex = localByteIndex + offset;
  if ((byteIndex & 1) !== 0)
    throw new RangeError(
      "original formation selector must preserve word alignment",
    );
  return { side, group, slot, byteIndex, vectorIndex: byteIndex >> 1 };
}

function checkedVector(vectors, index) {
  const vector = vectors?.[index];
  if (!Array.isArray(vector) || vector.length < 2)
    throw new RangeError("original formation vector is outside exported table");
  return [signedByte(vector[0]), signedByte(vector[1])];
}

/** AA2C: baseMode=side-base；AA7E: baseMode=leader-target。两路径均0次RNG。 */
export function applyOriginalFormationTarget(
  pool,
  address,
  {
    vectors,
    sideOffsets = [0, 0],
    sideBases = [0, 0],
    baseMode = "side-base",
    clearPositionLevel = false,
  } = {},
) {
  const index = formationByteIndex(address, sideOffsets);
  let [dx, dy] = checkedVector(vectors, index.vectorIndex);
  if (index.side === 1) dx = -dx;

  let baseX;
  let baseY;
  let baseAddress = null;
  if (baseMode === "leader-target") {
    baseAddress = originalObjectAddress(index.side, index.group, 0);
    baseX = pool.read8(baseAddress, ORIGINAL_OBJECT.TARGET_X);
    baseY = pool.read8(baseAddress, ORIGINAL_OBJECT.TARGET_Y);
  } else if (baseMode === "side-base") {
    const base = sideBases[index.side] ?? 0;
    baseX = base & 0xff;
    baseY = (base >> 8) & 0xff;
  } else {
    throw new RangeError("invalid original formation base mode");
  }

  if (clearPositionLevel)
    pool.write8(address, ORIGINAL_OBJECT.POSITION_LEVEL, 0);
  const targetX = clampCoordinate(baseX + dx);
  const targetY = clampCoordinate(baseY + dy);
  pool.write8(address, ORIGINAL_OBJECT.TARGET_X, targetX);
  pool.write8(address, ORIGINAL_OBJECT.TARGET_Y, targetY);

  const arrived =
    targetX === pool.read8(address, ORIGINAL_OBJECT.ANCHOR_X) &&
    targetY === pool.read8(address, ORIGINAL_OBJECT.ANCHOR_Y);
  if (arrived) pool.write8(address, ORIGINAL_OBJECT.STATUS_TIME, 0x80);

  return {
    address,
    side: index.side,
    group: index.group,
    slot: index.slot,
    byteIndex: index.byteIndex,
    vectorIndex: index.vectorIndex,
    baseMode,
    baseAddress,
    baseX,
    baseY,
    dx,
    dy,
    targetX,
    targetY,
    arrived,
  };
}
