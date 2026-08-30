// KI.EXE 0x9CB3..0x9E6F / 0xB5B7..0xB824 原版地图对象池。
// 9CE2/9DA1从0xC00连续分配；9E10固定从0xE00开始，扫描顺序与RNG调用顺序必须保留。

import { encodeOriginalCollisionAddress } from "./originalcollision.js";

export const ORIGINAL_MAP_OBJECT_BASE = 0xc00;
export const ORIGINAL_ATTRIBUTE_OBJECT_BASE = 0xe00;
export const ORIGINAL_MAP_OBJECT_LIMIT = 0x2000;
export const ORIGINAL_MAP_OBJECT_SIZE = 0x20;
export const ORIGINAL_MAP_OBJECT_MEMORY_SIZE =
  ORIGINAL_MAP_OBJECT_LIMIT - ORIGINAL_MAP_OBJECT_BASE;

export const ORIGINAL_MAP_OBJECT = Object.freeze({
  FLAGS: 0x00,
  KIND: 0x01,
  X: 0x06,
  Y: 0x08,
  LEVEL: 0x0a,
  SOURCE: 0x10,
  METRIC: 0x18,
  SPAN: 0x1a,
  AUX_1B: 0x1b,
  AUX_1C: 0x1c,
});

function checkedAddress(address, offset = 0, width = 1) {
  const index = address - ORIGINAL_MAP_OBJECT_BASE + offset;
  if (
    !Number.isInteger(address) ||
    (address & 0x1f) !== 0 ||
    index < 0 ||
    index + width > ORIGINAL_MAP_OBJECT_MEMORY_SIZE
  )
    throw new RangeError("invalid original map-object address");
  return index;
}

export class OriginalBattleMapObjectPool {
  constructor(bytes = null) {
    this.bytes = new Uint8Array(ORIGINAL_MAP_OBJECT_MEMORY_SIZE);
    if (bytes) this.restore(bytes);
  }

  address(index) {
    if (!Number.isInteger(index) || index < 0)
      throw new RangeError("original map-object index must be non-negative");
    const address = ORIGINAL_MAP_OBJECT_BASE + index * ORIGINAL_MAP_OBJECT_SIZE;
    checkedAddress(address);
    return address;
  }

  read8(address, offset = 0) {
    return this.bytes[checkedAddress(address, offset)];
  }

  write8(address, offset, value) {
    this.bytes[checkedAddress(address, offset)] = value & 0xff;
    return this;
  }

  read16(address, offset = 0) {
    const index = checkedAddress(address, offset, 2);
    return this.bytes[index] | (this.bytes[index + 1] << 8);
  }

  write16(address, offset, value) {
    const index = checkedAddress(address, offset, 2);
    this.bytes[index] = value & 0xff;
    this.bytes[index + 1] = (value >> 8) & 0xff;
    return this;
  }

  isActive(address) {
    return this.read8(address, ORIGINAL_MAP_OBJECT.FLAGS) >= 0x80;
  }

  addresses(start = ORIGINAL_MAP_OBJECT_BASE, end = ORIGINAL_MAP_OBJECT_LIMIT) {
    const result = [];
    for (
      let address = start;
      address < end;
      address += ORIGINAL_MAP_OBJECT_SIZE
    )
      result.push(address);
    return result;
  }

  snapshot() {
    return Array.from(this.bytes);
  }

  restore(snapshot) {
    if (!snapshot || snapshot.length !== ORIGINAL_MAP_OBJECT_MEMORY_SIZE)
      throw new TypeError("invalid original map-object snapshot");
    this.bytes.set(snapshot, 0);
    return this;
  }
}

function nextCollisionId(value) {
  const result = (value + 1) & 0x7f;
  return result === 0 ? 1 : result;
}

function initializeWalls9CE2(
  mapObjects,
  spatial,
  tileBytes,
  { cityTroops, mode },
) {
  let address = ORIGINAL_MAP_OBJECT_BASE;
  let collisionId = 0x61;
  for (let x = 0; x < 0x40; x++) {
    let span = 0;
    let current = null;
    for (let y = 0; y < 0x40; y++) {
      const source = y * 0x40 + x;
      const tile = tileBytes[source] ?? 0;
      const isWall = tile >= 0xd0 && tile < 0xe0;
      if (isWall && span === 0) {
        checkedAddress(address);
        current = address;
        address += 0x20;
        span = 1;
        mapObjects.write16(current, ORIGINAL_MAP_OBJECT.FLAGS, 0x0180);
        mapObjects.write8(current, ORIGINAL_MAP_OBJECT.X, x);
        mapObjects.write8(current, ORIGINAL_MAP_OBJECT.Y, y);
        mapObjects.write8(current, ORIGINAL_MAP_OBJECT.LEVEL, 0);
        mapObjects.write16(current, ORIGINAL_MAP_OBJECT.SOURCE, source);
        mapObjects.write16(
          current,
          ORIGINAL_MAP_OBJECT.METRIC,
          mode === 0 ? (Math.max(0, cityTroops | 0) + 0x32) * 10 : 0x12c,
        );
      } else if (isWall) span++;
      if (current != null && isWall) {
        const marker = collisionId | 0x80;
        for (const plane of [0, 0x1000, 0x2000, 0x3000])
          spatial.write8(source + plane, marker);
        spatial.write8(0x7000 + source, 0x64);
      }
      if (!isWall && current != null) {
        mapObjects.write8(current, ORIGINAL_MAP_OBJECT.SPAN, span);
        current = null;
        span = 0;
        collisionId = nextCollisionId(collisionId);
      }
    }
    if (current != null) {
      mapObjects.write8(current, ORIGINAL_MAP_OBJECT.SPAN, span);
      collisionId = nextCollisionId(collisionId);
    }
  }
  return { nextAddress: address, nextCollisionId: collisionId };
}

function initializeF0Objects9DA1(
  mapObjects,
  spatial,
  tileBytes,
  { nextAddress, nextCollisionId: firstCollisionId },
) {
  let address = nextAddress;
  let collisionId = firstCollisionId;
  for (let x = 0; x < 0x40; x++) {
    for (let y = 0; y < 0x40; y++) {
      const source = y * 0x40 + x;
      const tile = tileBytes[source] ?? 0;
      if (tile < 0xf0 || tile >= 0xf8) continue;
      checkedAddress(address);
      mapObjects.write16(address, ORIGINAL_MAP_OBJECT.FLAGS, 0x0280);
      mapObjects.write8(address, ORIGINAL_MAP_OBJECT.X, x);
      mapObjects.write8(address, ORIGINAL_MAP_OBJECT.Y, y);
      mapObjects.write8(address, ORIGINAL_MAP_OBJECT.LEVEL, 0);
      mapObjects.write16(address, ORIGINAL_MAP_OBJECT.SOURCE, source + 0x2000);
      mapObjects.write16(address, ORIGINAL_MAP_OBJECT.METRIC, 0x50);
      mapObjects.write8(address, ORIGINAL_MAP_OBJECT.SPAN, 1);
      spatial.write8(source + 0x2000, collisionId);
      spatial.write8(source + 0x5000, collisionId);
      spatial.write8(source + 0x7000, 0x32);
      address += 0x20;
      collisionId = nextCollisionId(collisionId);
    }
  }
  return { nextAddress: address, nextCollisionId: collisionId };
}

function attributeLookup(attributes, tile) {
  const base = (tile & 0xff) * 8;
  const offset = attributes[base] ?? 0;
  const index = (base & 0xff00) | ((base + offset) & 0xff);
  return { offset, subtype: ((attributes[index] ?? 0) - 0xba) & 0xff };
}

function initializeAttributeObjects9E10(
  mapObjects,
  tileBytes,
  attributes,
  rng,
) {
  if (!rng || typeof rng.nextByte !== "function")
    throw new TypeError("9E10 map objects require original RNG");
  let address = ORIGINAL_ATTRIBUTE_OBJECT_BASE;
  let count = 0;
  for (let y = 0; y < 0x40; y++) {
    for (let x = 0; x < 0x40; x++) {
      const source = y * 0x40 + x;
      const { offset, subtype } = attributeLookup(
        attributes,
        tileBytes[source] ?? 0,
      );
      if (subtype >= 6) continue;
      checkedAddress(address);
      mapObjects.write16(address, ORIGINAL_MAP_OBJECT.FLAGS, 0x03c0);
      mapObjects.write8(address, ORIGINAL_MAP_OBJECT.X, x);
      mapObjects.write8(address, ORIGINAL_MAP_OBJECT.Y, y);
      mapObjects.write8(address, ORIGINAL_MAP_OBJECT.LEVEL, offset);
      mapObjects.write16(
        address,
        ORIGINAL_MAP_OBJECT.AUX_1C,
        (subtype & 1) === 0 ? 0x0150 : 0x0204,
      );
      mapObjects.write8(
        address,
        ORIGINAL_MAP_OBJECT.AUX_1B,
        rng.nextByte() & 3,
      );
      address += 0x20;
      count++;
    }
  }
  return {
    startAddress: ORIGINAL_ATTRIBUTE_OBJECT_BASE,
    endAddress: address,
    count,
  };
}

/** 9CB3：三次构造pass，只有9E10按接受tile数消费RNG。 */
export function initializeOriginalMapObjects(
  mapObjects,
  spatial,
  tileBytes,
  { cityTroops = 0, mode = 0, attributes = null, rng = null } = {},
) {
  mapObjects.bytes.fill(0);
  const walls = initializeWalls9CE2(mapObjects, spatial, tileBytes, {
    cityTroops,
    mode,
  });
  const obstacles = initializeF0Objects9DA1(
    mapObjects,
    spatial,
    tileBytes,
    walls,
  );
  const attributesResult = attributes
    ? initializeAttributeObjects9E10(mapObjects, tileBytes, attributes, rng)
    : {
        startAddress: ORIGINAL_ATTRIBUTE_OBJECT_BASE,
        endAddress: ORIGINAL_ATTRIBUTE_OBJECT_BASE,
        count: 0,
      };
  if (obstacles.nextAddress > ORIGINAL_ATTRIBUTE_OBJECT_BASE)
    throw new RangeError("9CE2/9DA1 map objects overlap fixed 9E10 base");
  return {
    wallAndObstacleCount:
      (obstacles.nextAddress - ORIGINAL_MAP_OBJECT_BASE) /
      ORIGINAL_MAP_OBJECT_SIZE,
    nextAddress: obstacles.nextAddress,
    nextCollisionId: obstacles.nextCollisionId,
    attributeCount: attributesResult.count,
    attributeStart: attributesResult.startAddress,
    attributeEnd: attributesResult.endAddress,
  };
}

function refreshOriginalTilePassability(spatial, index, tile) {
  const attributes = spatial.tileAttributes;
  if (!attributes) return;
  const base = tile * 8;
  for (let level = 0; level < 7; level++) {
    const value = base === 0 ? 0 : (attributes[base + level + 1] ?? 0);
    const address = index + level * 0x1000;
    const current = spatial.read8(address);
    spatial.write8(
      address,
      value === 0 || value >= 0x70 ? current & 0x7f : current | 0x80,
    );
  }
}

/** B824：对象span个tile逐项改写、事件4/5、BB6D bit7刷新、六平面清ID。 */
export function rewriteOriginalMapObjectTilesB824(
  mapObjects,
  spatial,
  address,
) {
  mapObjects.write8(
    address,
    ORIGINAL_MAP_OBJECT.FLAGS,
    mapObjects.read8(address, ORIGINAL_MAP_OBJECT.FLAGS) | 1,
  );
  const source =
    mapObjects.read16(address, ORIGINAL_MAP_OBJECT.SOURCE) & 0x0fff;
  const span = mapObjects.read8(address, ORIGINAL_MAP_OBJECT.SPAN);
  const tileChanges = [];
  const events = [];
  for (let step = 0; step < span; step++) {
    const index = source + step * 0x40;
    const tileBefore = spatial.tile(index);
    const eventId = tileBefore < 0xf0 ? 4 : 5;
    const tileAfter = (tileBefore + (tileBefore < 0xf0 ? 0x10 : 0x08)) & 0xff;
    spatial.writeTile(index, tileAfter);
    refreshOriginalTilePassability(spatial, index, tileAfter);
    for (const plane of [0, 0x1000, 0x2000, 0x3000, 0x4000, 0x5000])
      spatial.write8(index + plane, spatial.read8(index + plane) & 0x80);
    spatial.write8(0x7000 + index, 0);
    tileChanges.push({ index, tileBefore, tileAfter, eventId });
    events.push({
      type: "map-tile-changed",
      originalId: eventId,
      index,
      tileBefore,
      tileAfter,
    });
  }
  return { tileChanges, events, redraw: true };
}

/** B5B7：metric已为0才调用B824；随后caller清对象bit7。碰撞全链0 RNG。 */
export function resolveOriginalMapObjectCollision(
  mapObjects,
  spatial,
  attackerPool,
  attackerAddress,
  targetAddress,
  registers,
) {
  if (
    targetAddress < ORIGINAL_MAP_OBJECT_BASE ||
    targetAddress >= ORIGINAL_MAP_OBJECT_LIMIT
  )
    return { handled: false, events: [] };
  if (!mapObjects.isActive(targetAddress))
    return { handled: true, active: false, events: [] };

  let metric = mapObjects.read16(targetAddress, ORIGINAL_MAP_OBJECT.METRIC);
  if ((registers?.mode ?? 0) === 0) {
    const sideFlag = (registers?.battleSideFlag ?? 0) & 0x80;
    const attackerSide = attackerAddress >= 0x600 ? 0x80 : 0;
    const direction = attackerPool.read8(attackerAddress, 0x05);
    if (
      (sideFlag === 0 && attackerSide === 0 && direction === 0) ||
      (sideFlag !== 0 && attackerSide !== 0 && direction === 2)
    )
      metric = 0;
  }

  let destroyed = false;
  let rewrite = { tileChanges: [], events: [], redraw: false };
  if (metric === 0) {
    destroyed = true;
    rewrite = rewriteOriginalMapObjectTilesB824(
      mapObjects,
      spatial,
      targetAddress,
    );
    mapObjects.write8(
      targetAddress,
      ORIGINAL_MAP_OBJECT.FLAGS,
      mapObjects.read8(targetAddress, ORIGINAL_MAP_OBJECT.FLAGS) & 0x7f,
    );
    if (registers) registers.mapRedraw = 1;
  } else {
    metric--;
    mapObjects.write16(targetAddress, ORIGINAL_MAP_OBJECT.METRIC, metric);
  }
  return {
    handled: true,
    active: true,
    metric,
    destroyed,
    ...rewrite,
    collisionId: encodeOriginalCollisionAddress(targetAddress),
    events: [
      ...rewrite.events,
      {
        type: destroyed ? "map-object-destroyed" : "map-object-hit",
        attackerAddress,
        targetAddress,
        metric,
        tileChanges: rewrite.tileChanges,
      },
    ],
  };
}

export function originalWallRecords(mapObjects) {
  return mapObjects
    .addresses(ORIGINAL_MAP_OBJECT_BASE, ORIGINAL_ATTRIBUTE_OBJECT_BASE)
    .map((address, index) => {
      const flags = mapObjects.read8(address, ORIGINAL_MAP_OBJECT.FLAGS);
      return {
        index,
        address,
        flags,
        kind: mapObjects.read8(address, ORIGINAL_MAP_OBJECT.KIND),
        x: mapObjects.read8(address, ORIGINAL_MAP_OBJECT.X),
        y: mapObjects.read8(address, ORIGINAL_MAP_OBJECT.Y),
        span: mapObjects.read8(address, ORIGINAL_MAP_OBJECT.SPAN),
        sourceOffset: mapObjects.read16(address, ORIGINAL_MAP_OBJECT.SOURCE),
        metric: mapObjects.read16(address, ORIGINAL_MAP_OBJECT.METRIC),
        intact: flags >= 0x80 && (flags & 1) === 0,
      };
    });
}
