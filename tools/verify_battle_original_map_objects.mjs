import assert from "node:assert/strict";

const { encodeOriginalCollisionAddress } = await import(
  "../web/src/game/battle/originalcollision.js"
);
const {
  ORIGINAL_ATTRIBUTE_OBJECT_BASE,
  ORIGINAL_MAP_OBJECT,
  OriginalBattleMapObjectPool,
  initializeOriginalMapObjects,
  rewriteOriginalMapObjectRowB799,
  sweepOriginalWallObjectsB7CB,
} = await import("../web/src/game/battle/originalmapobjects.js");
const { OriginalBattleSession } = await import(
  "../web/src/game/battle/originalsession.js"
);
const { ORIGINAL_OBJECT, originalObjectAddress } = await import(
  "../web/src/game/battle/originalstate.js"
);
const { OriginalBattleSpatialMemory } = await import(
  "../web/src/game/battle/originalspatial.js"
);

{
  const mapObjects = new OriginalBattleMapObjectPool();
  const spatial = new OriginalBattleSpatialMemory();
  const tiles = new Uint8Array(0x1000);
  tiles[2 * 0x40 + 3] = 0xd0;
  tiles[3 * 0x40 + 3] = 0xd1;
  tiles[8 * 0x40 + 9] = 0xf2;
  spatial.write8(0x7000 + 2 * 0x40 + 3, 0x71);
  spatial.write8(0x7000 + 8 * 0x40 + 9, 0x42);
  const result = initializeOriginalMapObjects(mapObjects, spatial, tiles, {
    cityTroops: 20,
    mode: 0,
  });
  assert.equal(result.wallAndObstacleCount, 2);
  const wall = mapObjects.address(0);
  assert.equal(mapObjects.read16(wall, ORIGINAL_MAP_OBJECT.FLAGS), 0x0180);
  assert.equal(mapObjects.read8(wall, ORIGINAL_MAP_OBJECT.X), 3);
  assert.equal(mapObjects.read8(wall, ORIGINAL_MAP_OBJECT.Y), 2);
  assert.equal(mapObjects.read8(wall, ORIGINAL_MAP_OBJECT.SPAN), 2);
  assert.equal(mapObjects.read16(wall, ORIGINAL_MAP_OBJECT.METRIC), 700);
  assert.equal(spatial.read8(2 * 0x40 + 3) & 0x7f, 0x61);
  assert.equal(spatial.read8(0x9000 + 2 * 0x40 + 3), 0x64);

  const obstacle = mapObjects.address(1);
  assert.equal(mapObjects.read16(obstacle, ORIGINAL_MAP_OBJECT.FLAGS), 0x0280);
  assert.equal(mapObjects.read16(obstacle, ORIGINAL_MAP_OBJECT.METRIC), 0x50);
  assert.notEqual(spatial.read8(8 * 0x40 + 9 + 0x2000), 0);
  assert.equal(spatial.read8(0x9000 + 8 * 0x40 + 9), 0x32);
  assert.equal(spatial.read8(0x7000 + 2 * 0x40 + 3), 0x71);
  assert.equal(spatial.read8(0x7000 + 8 * 0x40 + 9), 0x42);
  rewriteOriginalMapObjectRowB799(mapObjects, spatial, wall);
  assert.equal(spatial.read8(0x9000 + 2 * 0x40 + 3), 0);
  assert.equal(spatial.read8(0x7000 + 2 * 0x40 + 3), 0x71, "B87F never clears D2FC");
}

{
  const mapObjects = new OriginalBattleMapObjectPool();
  const spatial = new OriginalBattleSpatialMemory();
  const tiles = new Uint8Array(0x1000);
  const attributes = new Uint8Array(0xf800);
  tiles[0x42] = 0x1f;
  const base = 0x1f * 8;
  attributes[base] = 0x20;
  const wrappedIndex = (base & 0xff00) | ((base + 0x20) & 0xff);
  attributes[wrappedIndex] = 0xbb;
  attributes[base + 0x20] = 0;
  let calls = 0;
  const rng = { nextByte: () => (calls++, 0xfe) };
  const result = initializeOriginalMapObjects(mapObjects, spatial, tiles, {
    mode: 1,
    attributes,
    rng,
  });
  assert.equal(result.attributeCount, 1);
  assert.equal(result.attributeStart, ORIGINAL_ATTRIBUTE_OBJECT_BASE);
  assert.equal(calls, 1, "9E10 consumes one RNG byte per accepted tile");
  const animated = ORIGINAL_ATTRIBUTE_OBJECT_BASE;
  assert.equal(mapObjects.read16(animated, ORIGINAL_MAP_OBJECT.FLAGS), 0x03c0);
  assert.equal(mapObjects.read8(animated, ORIGINAL_MAP_OBJECT.LEVEL), 0x20);
  assert.equal(mapObjects.read16(animated, ORIGINAL_MAP_OBJECT.AUX_1C), 0x0204);
  assert.equal(mapObjects.read8(animated, ORIGINAL_MAP_OBJECT.AUX_1B), 2);
}

{
  const mapObjects = new OriginalBattleMapObjectPool();
  const spatial = new OriginalBattleSpatialMemory();
  const tiles = new Uint8Array(0x1000);
  tiles[0x42] = 0xd0;
  spatial.tiles.set(tiles, 0);
  initializeOriginalMapObjects(mapObjects, spatial, tiles, {
    cityTroops: 20,
    mode: 0,
  });
  const wall = mapObjects.address(0);
  const registers = { mode: 0, battleSideFlag: 0, mapRedraw: 0 };
  const swept = sweepOriginalWallObjectsB7CB(
    mapObjects,
    spatial,
    originalObjectAddress(1, 0, 0),
    registers,
  );
  assert.equal(swept.executed, true);
  assert.equal(swept.destroyed.length, 1);
  assert.equal(mapObjects.read8(wall, ORIGINAL_MAP_OBJECT.FLAGS) & 1, 1);
  assert.equal(
    mapObjects.read8(wall, ORIGINAL_MAP_OBJECT.FLAGS) & 0x80,
    0x80,
    "B7CB calls B824 but does not clear map-object bit7",
  );
  assert.equal(spatial.tile(0x42), 0xe0);
  assert.equal(registers.mapRedraw, 1);

  const wrongSide = sweepOriginalWallObjectsB7CB(
    mapObjects,
    spatial,
    originalObjectAddress(0, 0, 0),
    registers,
  );
  assert.equal(wrongSide.executed, false);

  mapObjects.write8(wall, ORIGINAL_MAP_OBJECT.FLAGS, 0x80);
  spatial.writeTile(0x42, 0xd0);
  registers.battleSideFlag = 0x80;
  const playerDefenderSide = sweepOriginalWallObjectsB7CB(
    mapObjects,
    spatial,
    originalObjectAddress(0, 0, 0),
    registers,
  );
  assert.equal(playerDefenderSide.executed, true);
}

{
  const mapObjects = new OriginalBattleMapObjectPool();
  const spatial = new OriginalBattleSpatialMemory();
  for (const [address, x, source] of [
    [mapObjects.address(0), 2, 0x82],
    [mapObjects.address(1), 5, 0x85],
  ]) {
    mapObjects.write16(address, ORIGINAL_MAP_OBJECT.FLAGS, 0x0180);
    mapObjects.write8(address, ORIGINAL_MAP_OBJECT.X, x);
    mapObjects.write8(address, ORIGINAL_MAP_OBJECT.Y, 2);
    mapObjects.write16(address, ORIGINAL_MAP_OBJECT.SOURCE, source);
    mapObjects.write8(address, ORIGINAL_MAP_OBJECT.SPAN, 1);
    spatial.writeTile(source, 0xd0);
  }
  const row = rewriteOriginalMapObjectRowB799(
    mapObjects,
    spatial,
    mapObjects.address(0),
  );
  assert.equal(
    row.rewritten.length,
    2,
    "B799 rewrites every first-16 record with matching Y",
  );
  assert.deepEqual(
    row.tileChanges.map((change) => change.index),
    [0x82, 0x85],
  );
}

{
  const session = new OriginalBattleSession({
    objectBytes: new Uint8Array(0xc00),
    registers: { mode: 0, battleSideFlag: 0, side0Active: 1, side1Active: 1 },
  });
  const tiles = new Uint8Array(0x1000);
  tiles[0x42] = 0xd0;
  session.initializeMapObjects({ tileBytes: tiles, cityTroops: 100, mode: 0 });
  const target = session.mapObjects.address(0);
  const attacker = originalObjectAddress(0, 0, 0);
  session.pool.write8(attacker, ORIGINAL_OBJECT.FLAGS, 0x80);
  session.pool.write8(attacker, ORIGINAL_OBJECT.DIRECTION, 0);
  const result = session.collide(
    attacker,
    encodeOriginalCollisionAddress(target),
  );
  assert.equal(result.mapResult.metric, 0);
  assert.equal(
    result.mapResult.destroyed,
    true,
    "B5BF..B5D8: mode0 side0 with D35 bit7 clear and direction0 clears metric immediately",
  );
  assert.equal(session.rng.calls, 0);
}

{
  const session = new OriginalBattleSession({
    objectBytes: new Uint8Array(0xc00),
    registers: { mode: 1, side0Active: 1, side1Active: 1 },
  });
  const tiles = new Uint8Array(0x1000);
  tiles[0x82] = 0xd0;
  tiles[0xc2] = 0xef;
  session.spatial.tiles.set(tiles, 0);
  const attributes = new Uint8Array(0xf800);
  attributes[0xe0 * 8 + 1] = 1;
  attributes[0xff * 8 + 1] = 1;
  session.spatial.tileAttributes = attributes;
  session.initializeMapObjects({ tileBytes: tiles, cityTroops: 0, mode: 1 });
  const target = session.mapObjects.address(0);
  session.mapObjects.write8(target, ORIGINAL_MAP_OBJECT.SPAN, 2);
  session.mapObjects.write16(target, ORIGINAL_MAP_OBJECT.METRIC, 1);
  const attacker = originalObjectAddress(0, 0, 0);
  session.pool.write8(attacker, ORIGINAL_OBJECT.FLAGS, 0x80);
  const collisionId = encodeOriginalCollisionAddress(target);
  const result = session.collide(attacker, collisionId);
  assert.equal(result.mapResult.metric, 0);
  assert.equal(result.mapResult.destroyed, false);
  assert.equal(session.paths.tail, 2, "B613 requeues attacker through C653");
  const destroyed = session.collide(attacker, collisionId);
  assert.equal(destroyed.mapResult.destroyed, true);
  assert.equal(
    session.paths.tail,
    2,
    "C653 bit4 deduplicates repeated contact",
  );
  assert.equal(
    session.mapObjects.read8(target, ORIGINAL_MAP_OBJECT.FLAGS) & 1,
    1,
  );
  assert.deepEqual(destroyed.mapResult.tileChanges, [
    { index: 0x82, tileBefore: 0xd0, tileAfter: 0xe0, eventId: 4 },
    { index: 0xc2, tileBefore: 0xef, tileAfter: 0xff, eventId: 4 },
  ]);
  assert.equal(session.spatial.tile(0x82), 0xe0);
  assert.equal(session.spatial.tile(0xc2), 0xff);
  assert.equal(session.registers.mapRedraw, 1);
  assert.equal(session.rng.calls, 0);

  const restored = new OriginalBattleSession().restore(session.snapshot());
  assert.deepEqual(
    restored.mapObjects.snapshot(),
    session.mapObjects.snapshot(),
  );
  assert.deepEqual(
    Array.from(restored.spatial.tileAttributes),
    Array.from(session.spatial.tileAttributes),
  );
}

process.stdout.write(
  "battle original map objects OK: 9CE2/9DA1/9E10 + B5B7/B824\n",
);
