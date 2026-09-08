// KI.EXE 原版四向格移动探针 — 0xB047/0xB069/0xB08B/0xB0AF。
// 固化平面四方向及B0D3/B116层移动的调用顺序和B533边界：探针成功才
// 提交格坐标/空间指针；探针失败且返回非零占用ID才调用碰撞分派。

import { ORIGINAL_OBJECT } from "./originalstate.js";

const DIRECTIONS = Object.freeze({
  west: Object.freeze({
    direction: 0,
    spatialDelta: -1,
    coordinate: "x",
    delta: -1,
  }),
  east: Object.freeze({
    direction: 2,
    spatialDelta: 1,
    coordinate: "x",
    delta: 1,
  }),
  north: Object.freeze({
    direction: 1,
    spatialDelta: -0x40,
    coordinate: "y",
    delta: -1,
  }),
  south: Object.freeze({
    direction: 3,
    spatialDelta: 0x40,
    coordinate: "y",
    delta: 1,
  }),
});

function checkedDirection(direction) {
  const value = DIRECTIONS[direction];
  if (!value) throw new RangeError("original movement direction is invalid");
  return value;
}

/** B240规则态：旧+0E清占用、新+0C双平面写ID、同步前坐标/层高与+0E。 */
export function commitOriginalSpatialOccupancy(pool, spatial, address) {
  if (!spatial)
    throw new TypeError("original occupancy commit requires spatial memory");
  const previous = pool.read16(address, ORIGINAL_OBJECT.SPATIAL_0E);
  spatial.write8(previous, spatial.read8(previous) & 0x80);
  spatial.write8(previous + 0x1000, spatial.read8(previous + 0x1000) & 0x80);
  // B2A8..B2AE: old overlay uses PREVIOUS_HEIGHT, independently of +0E's layer.
  spatial.writePathSurcharge(
    previous,
    pool.read8(address, ORIGINAL_OBJECT.PREVIOUS_HEIGHT),
    0,
  );

  const current = pool.read16(address, ORIGINAL_OBJECT.SPATIAL_0C);
  const id = (((address << 3) + 0x100) >> 8) & 0xff || 1;
  spatial.write8(current, spatial.read8(current) | id);
  spatial.write8(current + 0x1000, spatial.read8(current + 0x1000) | id);
  pool.write16(address, ORIGINAL_OBJECT.SPATIAL_0E, current);
  const height = pool.read8(address, ORIGINAL_OBJECT.HEIGHT);
  pool.write8(address, ORIGINAL_OBJECT.PREVIOUS_HEIGHT, height);
  spatial.writePathSurcharge(current, height, 8); // B2C2..B2CD

  // B2D3..B300: D2F6 tile, then D302 descriptor byte0; not D2FC navigation.
  const tile = spatial.tile(current);
  const attribute = spatial.tileAttributes?.[tile * 8] ?? 0;
  const flags = pool.read8(address, ORIGINAL_OBJECT.FLAGS);
  pool.write8(
    address,
    ORIGINAL_OBJECT.FLAGS,
    tile < 0xf0 && attribute >= 4 ? flags | 2 : flags & 0xfd,
  );

  // B31B..B32A：B240绘制提交后，旧坐标/层字段更新为本帧锚点/层高。
  pool.write8(
    address,
    ORIGINAL_OBJECT.PREVIOUS_X,
    pool.read8(address, ORIGINAL_OBJECT.ANCHOR_X),
  );
  pool.write8(
    address,
    ORIGINAL_OBJECT.PREVIOUS_Y,
    pool.read8(address, ORIGINAL_OBJECT.ANCHOR_Y),
  );
  pool.write8(
    address,
    ORIGINAL_OBJECT.PREVIOUS_LEVEL,
    pool.read8(address, ORIGINAL_OBJECT.LEVEL),
  );
  return { previous, current, id };
}

/**
 * probe({spatial,address,direction}) -> {clear:boolean, collisionId?:number}
 * collision(attackerAddress,collisionId) 必须返回B533等价的carry/blocked。
 */
export function probeOriginalCardinalSpatial(
  pool,
  attackerAddress,
  candidate,
  { spatial, enqueue = null } = {},
) {
  if (!spatial)
    throw new TypeError("original cardinal probe requires spatial memory");
  pool.write8(
    attackerAddress,
    ORIGINAL_OBJECT.STATE,
    pool.read8(attackerAddress, ORIGINAL_OBJECT.STATE) & 0xf7,
  );
  if (candidate >= 0x7000) {
    enqueue?.(attackerAddress);
    return { clear: false, collisionId: 0, candidate, queued: true };
  }
  const first = spatial.read8(candidate);
  if ((first & 0x7f) !== 0)
    return { clear: false, collisionId: first & 0x7f, candidate };
  const second = spatial.read8(candidate + 0x1000);
  if ((second & 0x7f) !== 0)
    return { clear: false, collisionId: second & 0x7f, candidate };
  if (second !== 0) {
    enqueue?.(attackerAddress);
    return { clear: false, collisionId: 0, candidate, queued: true };
  }

  const base = candidate & 0x0fff;
  const descriptorIndex =
    base | (pool.read8(attackerAddress, ORIGINAL_OBJECT.HEIGHT) << 8);
  if (descriptorIndex >= 0x2000) {
    enqueue?.(attackerAddress);
    return { clear: false, collisionId: 0, candidate, queued: true };
  }
  const descriptor = spatial.heightDescriptor(descriptorIndex);
  if (descriptor === 0) {
    enqueue?.(attackerAddress);
    return { clear: false, collisionId: 0, candidate, queued: true };
  }
  const terrainLevel = descriptor & 7;
  let adjusted = candidate;
  if (descriptorIndex < 0x1000) {
    const objectLevel = pool.read8(attackerAddress, ORIGINAL_OBJECT.LEVEL);
    if (terrainLevel < objectLevel) {
      adjusted = (candidate - 0x1000) & 0xffff;
      pool.write8(attackerAddress, ORIGINAL_OBJECT.LEVEL, objectLevel - 1);
      pool.write8(
        attackerAddress,
        ORIGINAL_OBJECT.POSITION_LEVEL,
        pool.read8(attackerAddress, ORIGINAL_OBJECT.POSITION_LEVEL) - 1,
      );
    } else if (terrainLevel > objectLevel) {
      adjusted = (candidate + 0x1000) & 0xffff;
      pool.write8(attackerAddress, ORIGINAL_OBJECT.LEVEL, objectLevel + 1);
      pool.write8(
        attackerAddress,
        ORIGINAL_OBJECT.POSITION_LEVEL,
        pool.read8(attackerAddress, ORIGINAL_OBJECT.POSITION_LEVEL) + 1,
      );
    }
    return { clear: true, collisionId: 0, candidate: adjusted };
  }
  if (terrainLevel !== pool.read8(attackerAddress, ORIGINAL_OBJECT.LEVEL))
    return { clear: false, collisionId: 0, candidate };
  const tile = spatial.tile(descriptorIndex);
  const command = pool.read8(attackerAddress, ORIGINAL_OBJECT.CURRENT_COMMAND);
  const clear = tile < 0xf0 || (tile >= 0xf8 && command !== 6);
  return { clear, collisionId: 0, candidate: adjusted };
}

export function stepOriginalCardinal(
  pool,
  attackerAddress,
  direction,
  { probe, collision, spatial = null, commit = false } = {},
) {
  if (typeof probe !== "function")
    throw new TypeError("original cardinal movement requires occupancy probe");
  const rule = checkedDirection(direction);
  const spatialBefore = pool.read16(
    attackerAddress,
    ORIGINAL_OBJECT.SPATIAL_0C,
  );
  const spatialAfter = (spatialBefore + rule.spatialDelta) & 0xffff;
  pool.write8(attackerAddress, ORIGINAL_OBJECT.DIRECTION, rule.direction);

  const result = probe({
    attackerAddress,
    direction,
    spatial: spatialAfter,
  });
  if (result?.clear) {
    const committedSpatial = result.candidate ?? spatialAfter;
    const offset =
      rule.coordinate === "x"
        ? ORIGINAL_OBJECT.ANCHOR_X
        : ORIGINAL_OBJECT.ANCHOR_Y;
    pool.write8(
      attackerAddress,
      offset,
      pool.read8(attackerAddress, offset) + rule.delta,
    );
    pool.write16(attackerAddress, ORIGINAL_OBJECT.SPATIAL_0C, committedSpatial);
    const occupancy =
      commit && spatial
        ? commitOriginalSpatialOccupancy(pool, spatial, attackerAddress)
        : null;
    const movement = {
      moved: true,
      blocked: false,
      carry: false,
      direction,
      spatialBefore,
      spatialAfter: committedSpatial,
      collision: null,
    };
    if (occupancy) movement.occupancy = occupancy;
    return movement;
  }

  const collisionId = result?.collisionId ?? 0;
  let collisionResult = null;
  if (collisionId !== 0 && typeof collision === "function")
    collisionResult = collision(attackerAddress, collisionId);
  return {
    moved: Boolean(collisionResult && !collisionResult.carry),
    blocked: !collisionResult || collisionResult.carry,
    carry: !collisionResult || collisionResult.carry,
    direction,
    spatialBefore,
    spatialAfter: spatialBefore,
    collision: collisionResult,
  };
}

function verticalCollision(
  pool,
  attackerAddress,
  spatialBefore,
  spatialAfter,
  collisionId,
  collision,
) {
  if (collisionId === 0)
    return {
      moved: false,
      committed: false,
      collided: false,
      blocked: true,
      carry: true,
      spatialBefore,
      spatialAfter,
    };
  const result = collision?.(attackerAddress, collisionId) ?? { carry: true };
  const moved = result.carry === false;
  // B112/B159 only return CLC; any collision position writes belong to B533/B732.
  return {
    moved,
    committed: false,
    collided: true,
    blocked: !moved,
    carry: result.carry,
    spatialBefore,
    spatialAfter: moved ? spatialAfter : spatialBefore,
    collision: result,
  };
}

/** B0D3/B186：上行先验当前连接tile，再探candidate+0x1000占用。 */
export function stepOriginalUp(
  pool,
  attackerAddress,
  { spatial, collision } = {},
) {
  if (!spatial)
    throw new TypeError("original vertical movement requires spatial memory");
  const spatialBefore = pool.read16(
    attackerAddress,
    ORIGINAL_OBJECT.SPATIAL_0C,
  );
  const connector = spatial.tile(spatialBefore);
  if (connector < 0xf0)
    return {
      moved: false,
      committed: false,
      collided: false,
      blocked: true,
      carry: true,
    };
  pool.write8(
    attackerAddress,
    ORIGINAL_OBJECT.DIRECTION,
    ((connector & 1) ^ 1) << 1,
  );
  const spatialAfter = (spatialBefore + 0x1000) & 0xffff;
  pool.write8(
    attackerAddress,
    ORIGINAL_OBJECT.STATE,
    pool.read8(attackerAddress, ORIGINAL_OBJECT.STATE) & 0xf7,
  );
  const collisionId = spatial.read8(spatialAfter + 0x1000) & 0x7f;
  if (collisionId !== 0)
    return verticalCollision(
      pool,
      attackerAddress,
      spatialBefore,
      spatialAfter,
      collisionId,
      collision,
    );
  if (spatial.tile(spatialAfter) < 0xf8)
    return {
      moved: false,
      committed: false,
      collided: false,
      blocked: true,
      carry: true,
    };
  pool.write8(
    attackerAddress,
    ORIGINAL_OBJECT.LEVEL,
    pool.read8(attackerAddress, ORIGINAL_OBJECT.LEVEL) + 1,
  );
  pool.write16(attackerAddress, ORIGINAL_OBJECT.SPATIAL_0C, spatialAfter);
  pool.write8(attackerAddress, ORIGINAL_OBJECT.HEIGHT, 0x10);
  return {
    moved: true,
    committed: true,
    collided: false,
    blocked: false,
    carry: false,
    spatialBefore,
    spatialAfter,
  };
}

/** B116/B15D：下行先验当前连接tile，再探candidate占用。 */
export function stepOriginalDown(
  pool,
  attackerAddress,
  { spatial, collision } = {},
) {
  if (!spatial)
    throw new TypeError("original vertical movement requires spatial memory");
  const spatialBefore = pool.read16(
    attackerAddress,
    ORIGINAL_OBJECT.SPATIAL_0C,
  );
  const connector = spatial.tile(spatialBefore);
  if (connector < 0xf0)
    return {
      moved: false,
      committed: false,
      collided: false,
      blocked: true,
      carry: true,
    };
  pool.write8(attackerAddress, ORIGINAL_OBJECT.DIRECTION, (connector & 1) << 1);
  const spatialAfter = (spatialBefore - 0x1000) & 0xffff;
  pool.write8(
    attackerAddress,
    ORIGINAL_OBJECT.STATE,
    pool.read8(attackerAddress, ORIGINAL_OBJECT.STATE) & 0xf7,
  );
  const collisionId = spatial.read8(spatialAfter) & 0x7f;
  if (collisionId !== 0)
    return verticalCollision(
      pool,
      attackerAddress,
      spatialBefore,
      spatialAfter,
      collisionId,
      collision,
    );
  if (spatial.tile(spatialAfter) < 0xf8)
    return {
      moved: false,
      committed: false,
      collided: false,
      blocked: true,
      carry: true,
    };
  pool.write8(
    attackerAddress,
    ORIGINAL_OBJECT.LEVEL,
    pool.read8(attackerAddress, ORIGINAL_OBJECT.LEVEL) - 1,
  );
  pool.write16(attackerAddress, ORIGINAL_OBJECT.SPATIAL_0C, spatialAfter);
  if (spatialAfter < 0x1000)
    pool.write8(attackerAddress, ORIGINAL_OBJECT.HEIGHT, 0);
  return {
    moved: true,
    committed: true,
    collided: false,
    blocked: false,
    carry: false,
    spatialBefore,
    spatialAfter,
  };
}
