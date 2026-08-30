import assert from "node:assert/strict";

const { ORIGINAL_OBJECT, OriginalBattleObjectPool, originalObjectAddress } =
  await import("../web/src/game/battle/originalstate.js");
const { OriginalBattleSpatialMemory } = await import(
  "../web/src/game/battle/originalspatial.js"
);
const {
  OriginalBattlePathState,
  consumeOriginalPathQueue,
  executeOriginalNextPathWord,
} = await import("../web/src/game/battle/originalpathqueue.js");

const pool = new OriginalBattleObjectPool();
const spatial = new OriginalBattleSpatialMemory();
const paths = new OriginalBattlePathState();
const addresses = [
  originalObjectAddress(0, 0, 1),
  originalObjectAddress(0, 0, 2),
  originalObjectAddress(0, 0, 3),
];
for (const [index, address] of addresses.entries()) {
  pool.write8(address, ORIGINAL_OBJECT.FLAGS, 0x80);
  pool.write8(address, ORIGINAL_OBJECT.CLASS, 1);
  pool.write8(address, ORIGINAL_OBJECT.CURRENT_COMMAND, 1);
  pool.write8(address, ORIGINAL_OBJECT.ANCHOR_X, 10 + index);
  pool.write8(address, ORIGINAL_OBJECT.ANCHOR_Y, 20);
  pool.write8(address, ORIGINAL_OBJECT.TARGET_X, 30);
  pool.write8(address, ORIGINAL_OBJECT.TARGET_Y, 20);
  assert.equal(paths.enqueue(pool, address), true);
  assert.equal(paths.enqueue(pool, address), false, "C653 deduplicates bit4");
}
assert.equal(paths.tail, 6);
let builds = 0;
const first = consumeOriginalPathQueue(pool, paths, spatial, {
  buildPath: ({ address }) => {
    builds++;
    return { carry: false, words: [0x140b, 0x140c, address] };
  },
});
assert.equal(
  first.length,
  2,
  "AED2 budget is exactly two queue items per frame",
);
assert.equal(builds, 2);
assert.equal(paths.head, 4);
assert.equal(pool.read16(addresses[0], ORIGINAL_OBJECT.POSITION_X), 0x140b);
assert.equal(pool.read8(addresses[0], ORIGINAL_OBJECT.TIMER), 2);
assert.equal(pool.read8(addresses[0], ORIGINAL_OBJECT.TIMER + 1), 2);
const next = executeOriginalNextPathWord(pool, paths, addresses[0]);
assert.equal(next.carry, false);
assert.equal(pool.read16(addresses[0], ORIGINAL_OBJECT.POSITION_X), 0x140c);
assert.equal(pool.read8(addresses[0], ORIGINAL_OBJECT.TIMER), 4);

const second = consumeOriginalPathQueue(pool, paths, spatial, {
  buildPath: () => ({ carry: true, words: [] }),
});
assert.equal(second.length, 1);
assert.equal(paths.head, paths.tail);
assert.equal(pool.read8(addresses[2], ORIGINAL_OBJECT.FLAGS) & 0x10, 0);

const side0Address = originalObjectAddress(0, 0, 0);
const side1Address = originalObjectAddress(1, 0, 0);
paths.writePath(side0Address, [0x1111, 0x2222]);
paths.writePath(side1Address, [0xaaaa, 0xbbbb]);
assert.equal(paths.pathBase(side0Address), 0);
assert.equal(paths.pathBase(side1Address), 0x1800);
assert.equal(paths.readPathWord(side0Address, 0), 0x1111);
assert.equal(paths.readPathWord(side1Address, 0), 0xaaaa);

const snapshot = paths.snapshot();
const restored = new OriginalBattlePathState(snapshot);
assert.deepEqual(restored.snapshot(), snapshot);

process.stdout.write(
  "battle original path queue OK: C653/AED2 budget + B00D paths without side alias\n",
);
