// KI.EXE 0xABD2/0xABFF/0xAC55 + 0xACA4/0xACD6 + 0xAD2D/0xAD7F。
// 这些入口只跟踪目标并生成固定附属攻击对象，不直接扣HP；伤害发生在后续碰撞链。

import { ORIGINAL_OBJECT } from "./originalstate.js";
import { spawnOriginalAttackEffect } from "./originaleffects.js";

const u8 = (value) => value & 0xff;
const u16 = (value) => value & 0xffff;
const s16 = (value) => {
  const word = u16(value);
  return (word & 0x8000) === 0 ? word : word - 0x10000;
};

function targetAddress(pool, address) {
  return pool.read16(address, ORIGINAL_OBJECT.TARGET_POINTER);
}

function packedAnchor(pool, address) {
  return (
    pool.read8(address, ORIGINAL_OBJECT.ANCHOR_X) |
    (pool.read8(address, ORIGINAL_OBJECT.ANCHOR_Y) << 8)
  );
}

function copyTargetAnchor(pool, address, target, includePosition) {
  const xy = packedAnchor(pool, target);
  pool.write16(address, ORIGINAL_OBJECT.TARGET_X, xy);
  if (!includePosition) return;
  pool.write16(address, ORIGINAL_OBJECT.POSITION_X, xy);
  pool.write8(
    address,
    ORIGINAL_OBJECT.POSITION_LEVEL,
    pool.read8(target, ORIGINAL_OBJECT.LEVEL),
  );
  pool.write16(address, ORIGINAL_OBJECT.TIMER, 0);
}

function consumeResetFlag(pool, address) {
  const flags = pool.read8(address, ORIGINAL_OBJECT.FLAGS);
  if ((flags & 0x08) === 0) return false;
  pool.write8(address, ORIGINAL_OBJECT.FLAGS, flags & 0xf7);
  return true;
}

function setTargetHeightFlag(pool, address, target) {
  const flags = pool.read8(address, ORIGINAL_OBJECT.FLAGS);
  pool.write8(
    address,
    ORIGINAL_OBJECT.FLAGS,
    pool.read8(target, ORIGINAL_OBJECT.HEIGHT) === 0
      ? flags | 0x04
      : flags & 0xfb,
  );
}

/** ACA4：Chebyshev距离、主轴方向和平局走X、signed层差。 */
export function calculateOriginalAttackGeometry(pool, address) {
  const target = targetAddress(pool, address);
  const ax = pool.read8(address, ORIGINAL_OBJECT.ANCHOR_X);
  const ay = pool.read8(address, ORIGINAL_OBJECT.ANCHOR_Y);
  const tx = pool.read8(target, ORIGINAL_OBJECT.ANCHOR_X);
  const ty = pool.read8(target, ORIGINAL_OBJECT.ANCHOR_Y);
  const dx = Math.abs(ax - tx);
  const dy = Math.abs(ay - ty);
  const useX = dx >= dy;
  let direction;
  if (useX) direction = ax >= tx ? 1 : 2;
  else direction = ay < ty ? 3 : 1;
  const rawLevelDelta = u8(
    pool.read8(target, ORIGINAL_OBJECT.LEVEL) -
      pool.read8(address, ORIGINAL_OBJECT.LEVEL),
  );
  return {
    target,
    distance: useX ? dx : dy,
    direction,
    levelDelta: rawLevelDelta < 0x80 ? rawLevelDelta : rawLevelDelta - 0x100,
  };
}

/** ACD6：按原版u8运算调整远程目标；初始边界门槛不等于最终clamp。 */
export function adjustOriginalProjectileTarget(
  pool,
  address,
  target,
  levelDelta,
  direction,
) {
  const step = levelDelta >= 0 ? 10 + u8(levelDelta) : 0;
  let x = pool.read8(target, ORIGINAL_OBJECT.ANCHOR_X);
  let y = pool.read8(target, ORIGINAL_OBJECT.ANCHOR_Y);
  if (direction === 1) {
    if (x <= 0x36) x = u8(x + step);
  } else if (direction === 2) {
    if (x >= 0x0a) x = u8(x - step);
  } else if (direction === 3) {
    if (y <= 0x36) y = u8(y + step);
  } else if (y >= 0x0a) y = u8(y - step);
  pool.write8(address, ORIGINAL_OBJECT.TARGET_X, x);
  pool.write8(address, ORIGINAL_OBJECT.TARGET_Y, y);
  return { x, y, step };
}

function markOriginalAttack(pool, address, cooldown) {
  pool.write8(
    address,
    ORIGINAL_OBJECT.FLAGS,
    pool.read8(address, ORIGINAL_OBJECT.FLAGS) | 0x40,
  );
  pool.write8(
    address,
    ORIGINAL_OBJECT.STATE,
    (pool.read8(address, ORIGINAL_OBJECT.STATE) & 1) | 8,
  );
  pool.write8(address, ORIGINAL_OBJECT.KIND, 2);
  pool.write8(address, ORIGINAL_OBJECT.FIELD_13, cooldown);
}

/** AD2D：冷却非零0 RNG；冷却为零先固定消费1 RNG，再检查B8AA槽。 */
export function spawnOriginalProjectile(
  pool,
  effects,
  rng,
  address,
  geometry,
  events = null,
) {
  const cooldown = pool.read8(address, ORIGINAL_OBJECT.FIELD_13);
  if (cooldown !== 0) {
    pool.write8(address, ORIGINAL_OBJECT.FIELD_13, cooldown - 1);
    return { blocked: true, spawned: false, rngCalls: 0 };
  }
  pool.write8(address, ORIGINAL_OBJECT.DIRECTION, geometry.direction);
  const base = s16((geometry.distance >> 1) + geometry.levelDelta);
  const roll = rng.nextByte();
  const parameter = u16((base + (roll & 3)) * 0x14);
  const spawn = spawnOriginalAttackEffect(pool, effects, address, {
    parameter,
    direction: geometry.direction,
    effectClass: 0x1c,
    code: 0x0210 + (geometry.direction & 1),
  });
  if (spawn.spawned) {
    markOriginalAttack(pool, address, 8);
    events?.push({
      type: "attack-effect",
      event: 0x0c,
      source: address,
      ...spawn,
    });
  }
  return { ...spawn, parameter, roll, rngCalls: 1 };
}

/** AD7F：近层攻击不消费RNG，固定槽忙时不写攻击态和冷却。 */
export function spawnOriginalCloseAttack(
  pool,
  effects,
  address,
  direction,
  events = null,
) {
  const cooldown = pool.read8(address, ORIGINAL_OBJECT.FIELD_13);
  if (cooldown !== 0) {
    pool.write8(address, ORIGINAL_OBJECT.FIELD_13, cooldown - 1);
    return { blocked: true, spawned: false, rngCalls: 0 };
  }
  pool.write8(address, ORIGINAL_OBJECT.DIRECTION, direction);
  const spawn = spawnOriginalAttackEffect(pool, effects, address, {
    parameter: 0xff00,
    direction: direction | 0x80,
    effectClass: 0x20,
    code: 0x0214 + (pool.read8(address, ORIGINAL_OBJECT.STATE) & 1),
  });
  if (spawn.spawned) {
    markOriginalAttack(pool, address, 6);
    events?.push({
      type: "attack-effect",
      event: 0x0a,
      source: address,
      ...spawn,
    });
  }
  return { ...spawn, rngCalls: 0 };
}

/** ABD2：CLASS<0x24，仅目标跟踪/重置，零RNG零生成。 */
export function executeOriginalLowClassAttack(pool, address) {
  const target = targetAddress(pool, address);
  const reset = consumeResetFlag(pool, address);
  copyTargetAnchor(pool, address, target, reset);
  return { route: "class-low", target, reset, spawned: false, rngCalls: 0 };
}

/** ABFF：CLASS==0x24。 */
export function executeOriginalEqualClassAttack(
  pool,
  effects,
  rng,
  address,
  events = null,
) {
  const target = targetAddress(pool, address);
  setTargetHeightFlag(pool, address, target);
  const reset = consumeResetFlag(pool, address);
  if (reset) {
    const own = packedAnchor(pool, address);
    pool.write16(address, ORIGINAL_OBJECT.TARGET_X, own);
    pool.write16(address, ORIGINAL_OBJECT.POSITION_X, own);
    pool.write8(
      address,
      ORIGINAL_OBJECT.POSITION_LEVEL,
      pool.read8(address, ORIGINAL_OBJECT.LEVEL),
    );
    pool.write16(address, ORIGINAL_OBJECT.TIMER, 0);
  } else copyTargetAnchor(pool, address, target, false);

  const geometry = calculateOriginalAttackGeometry(pool, address);
  if (
    pool.read8(address, ORIGINAL_OBJECT.LEVEL) >
    pool.read8(target, ORIGINAL_OBJECT.LEVEL)
  ) {
    const result =
      geometry.distance <= 1
        ? spawnOriginalCloseAttack(
            pool,
            effects,
            address,
            geometry.direction,
            events,
          )
        : spawnOriginalProjectile(
            pool,
            effects,
            rng,
            address,
            geometry,
            events,
          );
    return { route: "class-equal", target, reset, geometry, ...result };
  }
  const adjustedTarget = adjustOriginalProjectileTarget(
    pool,
    address,
    target,
    geometry.levelDelta,
    geometry.direction,
  );
  const result = spawnOriginalProjectile(
    pool,
    effects,
    rng,
    address,
    geometry,
    events,
  );
  return {
    route: "class-equal",
    target,
    reset,
    geometry,
    adjustedTarget,
    ...result,
  };
}

/** AC55：CLASS>0x24，仅严格HEIGHT优势且距离<=2生成近层对象。 */
export function executeOriginalHighClassAttack(
  pool,
  effects,
  address,
  events = null,
) {
  const target = targetAddress(pool, address);
  setTargetHeightFlag(pool, address, target);
  const reset = consumeResetFlag(pool, address);
  copyTargetAnchor(pool, address, target, reset);
  if (
    pool.read8(address, ORIGINAL_OBJECT.HEIGHT) <=
    pool.read8(target, ORIGINAL_OBJECT.HEIGHT)
  )
    return { route: "class-high", target, reset, spawned: false, rngCalls: 0 };
  const geometry = calculateOriginalAttackGeometry(pool, address);
  if (geometry.distance > 2)
    return {
      route: "class-high",
      target,
      reset,
      geometry,
      spawned: false,
      rngCalls: 0,
    };
  return {
    route: "class-high",
    target,
    reset,
    geometry,
    ...spawnOriginalCloseAttack(
      pool,
      effects,
      address,
      geometry.direction,
      events,
    ),
  };
}

export function executeOriginalAttackByClass(
  pool,
  address,
  { effects, rng, events = null },
) {
  const classValue = pool.read8(address, ORIGINAL_OBJECT.CLASS);
  if (classValue < 0x24) return executeOriginalLowClassAttack(pool, address);
  if (!effects) throw new TypeError("original attack effect pool is required");
  if (classValue === 0x24) {
    if (!rng) throw new TypeError("original battle RNG is required");
    return executeOriginalEqualClassAttack(pool, effects, rng, address, events);
  }
  return executeOriginalHighClassAttack(pool, effects, address, events);
}
