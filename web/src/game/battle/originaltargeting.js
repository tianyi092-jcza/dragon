// KI.EXE 0xA85B 原版战术目标选择。
// 扫描对侧48对象，地址升序；评分为u8，严格小于才替换，因此同分保留
// 首个槽。目标改变时置自身flags bit3并写+1C目标指针。

import { ORIGINAL_OBJECT, ORIGINAL_SIDE_SIZE } from "./originalstate.js";

const absByteDelta = (left, right) => Math.abs((left & 0xff) - (right & 0xff));

export function originalTargetScore(pool, sourceAddress, candidateAddress) {
  let score =
    absByteDelta(
      pool.read8(sourceAddress, ORIGINAL_OBJECT.ANCHOR_X),
      pool.read8(candidateAddress, ORIGINAL_OBJECT.ANCHOR_X),
    ) +
    absByteDelta(
      pool.read8(sourceAddress, ORIGINAL_OBJECT.ANCHOR_Y),
      pool.read8(candidateAddress, ORIGINAL_OBJECT.ANCHOR_Y),
    );

  const sourceHeight = pool.read8(sourceAddress, ORIGINAL_OBJECT.HEIGHT);
  const targetHeight = pool.read8(candidateAddress, ORIGINAL_OBJECT.HEIGHT);
  if (sourceHeight > targetHeight) {
    if (pool.read8(candidateAddress, ORIGINAL_OBJECT.FLAGS) & 0x02)
      score += 0x40;
  } else if (
    pool.read8(sourceAddress, ORIGINAL_OBJECT.CLASS) <= 0x12 &&
    targetHeight !== 0
  ) {
    score += 0x40;
  }

  // A889 borrow path alone adds abs(dy) at A88D; A8A9 adds it again.
  const sourceY = pool.read8(sourceAddress, ORIGINAL_OBJECT.ANCHOR_Y);
  const candidateY = pool.read8(candidateAddress, ORIGINAL_OBJECT.ANCHOR_Y);
  if (sourceY < candidateY) score += candidateY - sourceY;
  return score & 0xff;
}

export function selectOriginalTarget(pool, sourceAddress) {
  const candidateSide = sourceAddress < ORIGINAL_SIDE_SIZE ? 1 : 0;
  const base = candidateSide * ORIGINAL_SIDE_SIZE;
  let selected = base;
  let bestScore = 0xff;
  for (let index = 0; index < 0x30; index++) {
    const candidate = base + index * 0x20;
    if (!pool.isActive(candidate)) continue;
    const score = originalTargetScore(pool, sourceAddress, candidate);
    if (score >= bestScore) continue;
    bestScore = score;
    selected = candidate;
  }

  const previous = pool.read16(sourceAddress, ORIGINAL_OBJECT.TARGET_POINTER);
  if (previous !== selected) {
    pool.write8(
      sourceAddress,
      ORIGINAL_OBJECT.FLAGS,
      pool.read8(sourceAddress, ORIGINAL_OBJECT.FLAGS) | 0x08,
    );
    pool.write16(sourceAddress, ORIGINAL_OBJECT.TARGET_POINTER, selected);
  }
  return {
    address: selected,
    score: bestScore,
    changed: previous !== selected,
  };
}
