import assert from "node:assert/strict";

const {
  ORIGINAL_OBJECT,
  OriginalBattleObjectPool,
  originalObjectAddress,
} = await import("../web/src/game/battle/originalstate.js");
const {
  originalTargetScore,
  selectOriginalTarget,
} = await import("../web/src/game/battle/originaltargeting.js");

function activate(pool, address, x, y, options = {}) {
  pool.write8(address, ORIGINAL_OBJECT.FLAGS, options.flags ?? 0x80);
  pool.write8(address, ORIGINAL_OBJECT.ANCHOR_X, x);
  pool.write8(address, ORIGINAL_OBJECT.ANCHOR_Y, y);
  pool.write8(address, ORIGINAL_OBJECT.HEIGHT, options.height ?? 0);
  pool.write8(address, ORIGINAL_OBJECT.CLASS, options.classValue ?? 0x24);
}

const pool = new OriginalBattleObjectPool();
const source = originalObjectAddress(0, 0, 0);
activate(pool, source, 10, 10, { height: 0, classValue: 0x24 });
const first = originalObjectAddress(1, 0, 0);
const tiedLater = originalObjectAddress(1, 0, 1);
const farther = originalObjectAddress(1, 1, 0);
activate(pool, first, 13, 12);
activate(pool, tiedLater, 5, 8); // abs(dx)=5 + dy=2 ties south score 3+2+2.
activate(pool, farther, 20, 20);

assert.equal(originalTargetScore(pool, source, first), 7);
assert.equal(originalTargetScore(pool, source, tiedLater), 7);
const selected = selectOriginalTarget(pool, source);
assert.equal(selected.address, first, "同分必须保留地址顺序中首个候选");
assert.equal(selected.score, 7);
assert.equal(selected.changed, true);
assert.equal(pool.read16(source, ORIGINAL_OBJECT.TARGET_POINTER), first);
assert.equal(pool.read8(source, ORIGINAL_OBJECT.FLAGS) & 8, 8);
assert.equal(selectOriginalTarget(pool, source).changed, false);

// self高度更高、目标flags bit1置位时，A8A7追加0x40惩罚。
pool.write8(source, ORIGINAL_OBJECT.HEIGHT, 3);
pool.write8(first, ORIGINAL_OBJECT.HEIGHT, 1);
pool.write8(first, ORIGINAL_OBJECT.FLAGS, 0x82);
assert.equal(originalTargetScore(pool, source, first), 0x47);

// self class<=0x12 且目标高度非零，同样追加0x40。
pool.write8(source, ORIGINAL_OBJECT.HEIGHT, 0);
pool.write8(source, ORIGINAL_OBJECT.CLASS, 0x12);
pool.write8(tiedLater, ORIGINAL_OBJECT.HEIGHT, 1);
assert.equal(originalTargetScore(pool, source, tiedLater), 0x47);

// 反向从0x600侧扫描0x000侧，仍严格按48槽地址升序。
const reverse = originalObjectAddress(1, 2, 0);
activate(pool, reverse, 9, 10);
const reverseResult = selectOriginalTarget(pool, reverse);
assert.equal(reverseResult.address, source);

process.stdout.write(
  "battle original targeting OK: A85B opposite-side scan + u8 score + first-tie selection\n",
);
