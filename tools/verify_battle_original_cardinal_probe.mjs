import assert from "node:assert/strict";

const { ORIGINAL_OBJECT, OriginalBattleObjectPool, originalObjectAddress } =
  await import("../web/src/game/battle/originalstate.js");
const { OriginalBattleSpatialMemory } = await import(
  "../web/src/game/battle/originalspatial.js"
);
const { probeOriginalCardinalSpatial, stepOriginalCardinal } = await import(
  "../web/src/game/battle/originalmovement.js"
);

const pool = new OriginalBattleObjectPool();
const spatial = new OriginalBattleSpatialMemory();
const address = originalObjectAddress(0, 0, 1);
pool.write8(address, ORIGINAL_OBJECT.ANCHOR_X, 10);
pool.write8(address, ORIGINAL_OBJECT.ANCHOR_Y, 10);
pool.write8(address, ORIGINAL_OBJECT.LEVEL, 1);
pool.write8(address, ORIGINAL_OBJECT.POSITION_LEVEL, 1);
pool.write16(address, ORIGINAL_OBJECT.SPATIAL_0C, 0x128a);

spatial.write8(0x128b, 0);
spatial.write8(0x228b, 0);
spatial.write8(0x728b, 1);
const result = stepOriginalCardinal(pool, address, "east", {
  probe: ({ spatial: candidate }) =>
    probeOriginalCardinalSpatial(pool, address, candidate, { spatial }),
});
assert.equal(result.moved, true);
assert.equal(pool.read8(address, ORIGINAL_OBJECT.ANCHOR_X), 11);
assert.equal(pool.read16(address, ORIGINAL_OBJECT.SPATIAL_0C), 0x128b);

pool.write16(address, ORIGINAL_OBJECT.SPATIAL_0C, 0x028b);
pool.write8(address, ORIGINAL_OBJECT.HEIGHT, 0);
pool.write8(address, ORIGINAL_OBJECT.LEVEL, 1);
pool.write8(address, ORIGINAL_OBJECT.POSITION_LEVEL, 1);
spatial.write8(0x028c, 0);
spatial.write8(0x128c, 0);
spatial.write8(0x728c, 2);
const transition = probeOriginalCardinalSpatial(pool, address, 0x028c, {
  spatial,
});
assert.equal(transition.clear, true);
assert.equal(transition.candidate, 0x128c);
assert.equal(pool.read8(address, ORIGINAL_OBJECT.LEVEL), 2);
assert.equal(pool.read8(address, ORIGINAL_OBJECT.POSITION_LEVEL), 2);

let queued = 0;
spatial.write8(0x128d, 0x80);
const blocked = probeOriginalCardinalSpatial(pool, address, 0x028d, {
  spatial,
  enqueue: () => queued++,
});
assert.equal(blocked.clear, false);
assert.equal(blocked.collisionId, 0);
assert.equal(queued, 1);

process.stdout.write(
  "battle original cardinal probe OK: B1B1 planes + height transition + queue gate\n",
);
