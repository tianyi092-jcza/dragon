import assert from "node:assert/strict";

const { ORIGINAL_OBJECT, OriginalBattleObjectPool, originalObjectAddress } =
  await import("../web/src/game/battle/originalstate.js");
const { commitOriginalSpatialOccupancy, stepOriginalCardinal } = await import(
  "../web/src/game/battle/originalmovement.js"
);
const { OriginalBattleSpatialMemory } = await import(
  "../web/src/game/battle/originalspatial.js"
);

const pool = new OriginalBattleObjectPool();
const object = originalObjectAddress(0, 0, 0);
pool.write8(object, ORIGINAL_OBJECT.ANCHOR_X, 20);
pool.write8(object, ORIGINAL_OBJECT.ANCHOR_Y, 30);
pool.write16(object, ORIGINAL_OBJECT.SPATIAL_0C, 0x1200);

const probes = [];
const west = stepOriginalCardinal(pool, object, "west", {
  probe(input) {
    probes.push(input);
    return { clear: true };
  },
});
assert.deepEqual(west, {
  moved: true,
  blocked: false,
  direction: "west",
  spatialBefore: 0x1200,
  spatialAfter: 0x11ff,
  collision: null,
});
assert.equal(pool.read8(object, ORIGINAL_OBJECT.ANCHOR_X), 19);
assert.equal(pool.read8(object, ORIGINAL_OBJECT.DIRECTION), 0);
assert.equal(probes[0].spatial, 0x11ff);

const north = stepOriginalCardinal(pool, object, "north", {
  probe: () => ({ clear: true }),
});
assert.equal(north.spatialAfter, 0x11bf);
assert.equal(pool.read8(object, ORIGINAL_OBJECT.ANCHOR_Y), 29);
assert.equal(pool.read8(object, ORIGINAL_OBJECT.DIRECTION), 1);

let collisions = 0;
const blocked = stepOriginalCardinal(pool, object, "east", {
  probe: () => ({ clear: false, collisionId: 0x31 }),
  collision(_address, collisionId) {
    collisions++;
    assert.equal(collisionId, 0x31);
    return { carry: true, category: "friendly-blocked" };
  },
});
assert.equal(blocked.moved, false);
assert.equal(blocked.blocked, true);
assert.equal(blocked.spatialAfter, blocked.spatialBefore);
assert.equal(pool.read8(object, ORIGINAL_OBJECT.ANCHOR_X), 19);
assert.equal(pool.read8(object, ORIGINAL_OBJECT.DIRECTION), 2);
assert.equal(collisions, 1);

const contact = stepOriginalCardinal(pool, object, "south", {
  probe: () => ({ clear: false, collisionId: 0x31 }),
  collision: () => ({ carry: false, category: "enemy-contact" }),
});
assert.equal(contact.moved, true);
assert.equal(contact.blocked, false);
assert.equal(
  pool.read8(object, ORIGINAL_OBJECT.ANCHOR_Y),
  29,
  "collision success does not itself commit cardinal coordinate",
);
assert.equal(pool.read8(object, ORIGINAL_OBJECT.DIRECTION), 3);

let noCollisionCall = true;
const empty = stepOriginalCardinal(pool, object, "east", {
  probe: () => ({ clear: false, collisionId: 0 }),
  collision: () => {
    noCollisionCall = false;
  },
});
assert.equal(empty.blocked, true);
assert.equal(noCollisionCall, true);

{
  const spatial = new OriginalBattleSpatialMemory();
  const address = originalObjectAddress(1, 0, 0);
  pool.write16(address, ORIGINAL_OBJECT.SPATIAL_0E, 0x20);
  pool.write16(address, ORIGINAL_OBJECT.SPATIAL_0C, 0x21);
  pool.write8(address, ORIGINAL_OBJECT.ANCHOR_X, 0x12);
  pool.write8(address, ORIGINAL_OBJECT.ANCHOR_Y, 0x23);
  pool.write8(address, ORIGINAL_OBJECT.LEVEL, 0x34);
  pool.write8(address, ORIGINAL_OBJECT.HEIGHT, 0x40);
  spatial.write8(0x20, 0xff);
  spatial.write8(0x1020, 0xfe);
  spatial.write8(0x21, 0x80);
  spatial.write8(0x1021, 0x80);
  const committed = commitOriginalSpatialOccupancy(pool, spatial, address);
  assert.equal(spatial.read8(0x20), 0x80);
  assert.equal(spatial.read8(0x1020), 0x80);
  assert.equal(spatial.read8(0x21), 0xb1);
  assert.equal(spatial.read8(0x1021), 0xb1);
  assert.equal(committed.id, 0x31);
  assert.equal(pool.read16(address, ORIGINAL_OBJECT.SPATIAL_0E), 0x21);
  assert.equal(pool.read8(address, ORIGINAL_OBJECT.PREVIOUS_X), 0x12);
  assert.equal(pool.read8(address, ORIGINAL_OBJECT.PREVIOUS_Y), 0x23);
  assert.equal(pool.read8(address, ORIGINAL_OBJECT.PREVIOUS_LEVEL), 0x34);
  assert.equal(pool.read8(address, ORIGINAL_OBJECT.PREVIOUS_HEIGHT), 0x40);
}

process.stdout.write(
  "battle original movement OK: cardinal probes + B240 occupancy commit\n",
);
