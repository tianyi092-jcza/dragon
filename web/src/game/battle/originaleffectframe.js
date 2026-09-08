// KI.EXE 0xB941→B97E→BA2E→BAB7 攻击效果对象逐帧状态机。
// 效果命中独立于B533，固定0 RNG；Canvas表现回调不得修改规则状态。

import { ORIGINAL_OBJECT, ORIGINAL_SIDE_SIZE } from "./originalstate.js";
import {
  ORIGINAL_EFFECT,
  ORIGINAL_EFFECT_MEMORY_SIZE,
} from "./originaleffects.js";

const u8 = (value) => value & 0xff;
const u16 = (value) => value & 0xffff;
const s16 = (value) => {
  const word = u16(value);
  return (word & 0x8000) === 0 ? word : word - 0x10000;
};

function terminate(effects, address) {
  effects.write8(
    address,
    ORIGINAL_EFFECT.FLAGS,
    effects.read8(address, ORIGINAL_EFFECT.FLAGS) & 0xbf,
  );
}

function effectTarget(objects, effects, spatial, address) {
  const occupancy = spatial.read8(
    effects.read16(address, ORIGINAL_EFFECT.POSITION_X),
  );
  if (occupancy === 0 || (occupancy > 0x60 && occupancy < 0x80)) return null;
  if (occupancy >= 0x80) {
    terminate(effects, address);
    return { terminated: true, reason: "map-occupancy" };
  }
  const target = (occupancy - 1) << 5;
  const source = effects.read16(address, ORIGINAL_EFFECT.SOURCE_POINTER);
  const enemy = source < ORIGINAL_SIDE_SIZE !== target < ORIGINAL_SIDE_SIZE;
  if (!enemy || !objects.isActive(target)) return null;
  return { source, target };
}

/** B97E：当前格接触与确定性效果伤害，整条路径0 RNG。 */
export function contactOriginalAttackEffect(
  objects,
  effects,
  spatial,
  address,
  events = null,
) {
  const hit = effectTarget(objects, effects, spatial, address);
  if (!hit || hit.terminated) return hit ?? { terminated: false, hit: false };
  const { source, target } = hit;
  const targetClass = objects.read8(target, ORIGINAL_OBJECT.CLASS);
  if (
    targetClass !== 0 &&
    objects.read8(target, ORIGINAL_OBJECT.HP) < 0x64 &&
    objects.read8(target, ORIGINAL_OBJECT.CURRENT_COMMAND) !== 5 &&
    objects.read8(target, ORIGINAL_OBJECT.PENDING_COMMAND) !== 5
  ) {
    const current = objects.read8(target, ORIGINAL_OBJECT.CURRENT_COMMAND);
    const pending = objects.read8(target, ORIGINAL_OBJECT.PENDING_COMMAND);
    if (current !== pending)
      objects.write8(target, ORIGINAL_OBJECT.CURRENT_COMMAND, pending);
    objects.write8(target, ORIGINAL_OBJECT.PENDING_COMMAND, 5);
  }

  let damage = effects.read8(address, ORIGINAL_EFFECT.CLASS);
  if (
    targetClass === 0x36 ||
    (targetClass === 0 &&
      (objects.read8(target, ORIGINAL_OBJECT.STATE) & 1) !== 0)
  )
    damage >>= 2;
  else if (targetClass === 0) {
    terminate(effects, address);
    return { hit: true, damaged: false, source, target, damage: 0 };
  }

  objects.write8(target, ORIGINAL_OBJECT.KIND, 2);
  objects.write8(
    target,
    ORIGINAL_OBJECT.STATE,
    (objects.read8(target, ORIGINAL_OBJECT.STATE) & 1) | 0x10,
  );
  objects.write8(target, ORIGINAL_OBJECT.DIRECTION, 0);
  objects.write8(
    target,
    ORIGINAL_OBJECT.FLAGS,
    objects.read8(target, ORIGINAL_OBJECT.FLAGS) | 0x40,
  );
  const hp = objects.read8(target, ORIGINAL_OBJECT.HP);
  const lethal = hp <= damage; // BA0B JA: equality and borrow both clamp.
  const killed = lethal && targetClass !== 0;
  if (lethal) {
    objects.write8(target, ORIGINAL_OBJECT.HP, 1);
    if (targetClass !== 0) {
      objects.write8(
        target,
        ORIGINAL_OBJECT.FLAGS,
        (objects.read8(target, ORIGINAL_OBJECT.FLAGS) & 0x10) | 1,
      );
      objects.write8(target, ORIGINAL_OBJECT.KIND, 4);
      objects.write8(target, ORIGINAL_OBJECT.HP, 0);
    }
  } else objects.write8(target, ORIGINAL_OBJECT.HP, hp - damage);
  terminate(effects, address);
  const event = {
    type: "effect-hit",
    event: 0x0b,
    effect: address,
    source,
    target,
    damage,
    killed,
  };
  events?.push(event);
  return { hit: true, damaged: true, ...event };
}

/** BA2E：平面一格移动、signed 8.8高度积分、重力与空间阻挡。 */
export function moveOriginalAttackEffect(effects, spatial, address) {
  const direction = effects.read8(address, ORIGINAL_EFFECT.DIRECTION);
  let position = effects.read16(address, ORIGINAL_EFFECT.POSITION_X);
  if (direction < 0x80) {
    if ((direction & 1) === 0) {
      const delta = direction === 0 ? -1 : 1;
      position = u16(position + delta);
      effects.write8(
        address,
        ORIGINAL_EFFECT.ANCHOR_X + 1,
        effects.read8(address, ORIGINAL_EFFECT.ANCHOR_X + 1) + delta,
      );
    } else {
      const delta = direction === 1 ? -1 : 1;
      position = u16(position + delta * 0x40);
      effects.write8(
        address,
        ORIGINAL_EFFECT.ANCHOR_Y + 1,
        effects.read8(address, ORIGINAL_EFFECT.ANCHOR_Y + 1) + delta,
      );
    }
    effects.write16(address, ORIGINAL_EFFECT.POSITION_X, position);
  }

  let velocity = s16(effects.read16(address, ORIGINAL_EFFECT.PARAMETER));
  const step = Math.max(-0x100, Math.min(0x100, velocity));
  const height = s16(effects.read16(address, ORIGINAL_EFFECT.LEVEL) + step);
  effects.write16(address, ORIGINAL_EFFECT.LEVEL, height);
  if (height < 0) {
    terminate(effects, address);
    return { active: false, reason: "below-ground" };
  }
  velocity = s16(velocity - 0x14);
  effects.write16(address, ORIGINAL_EFFECT.PARAMETER, velocity);
  const level = Math.min((height >>> 8) & 0xff, 5);
  effects.write8(address, ORIGINAL_EFFECT.LEVEL + 1, level);
  const candidate =
    (effects.read16(address, ORIGINAL_EFFECT.POSITION_X) & 0x0fff) |
    (level << 12);
  if (spatial.read8(candidate) >= 0x80) {
    terminate(effects, address);
    return { active: false, reason: "spatial-blocked", candidate };
  }
  effects.write16(address, ORIGINAL_EFFECT.POSITION_X, candidate);
  return { active: true, candidate, level, velocity };
}

/** BAB7：规则层只提交整数位置/强度并清首字节；绘制擦除/提交交给只读回调。 */
export function commitOriginalAttackEffect(
  effects,
  address,
  { erase = null, draw = null } = {},
) {
  erase?.({
    address,
    x: effects.read8(address, ORIGINAL_EFFECT.SPATIAL_0C),
    y: effects.read8(address, ORIGINAL_EFFECT.SPATIAL_0C + 1),
    level: effects.read8(address, ORIGINAL_EFFECT.SPATIAL_0E),
  });
  if (effects.read8(address, ORIGINAL_EFFECT.FLAGS) < 0xc0) {
    effects.clear(address);
    return { active: false, freed: true };
  }
  const x = effects.read8(address, ORIGINAL_EFFECT.ANCHOR_X + 1);
  const y = effects.read8(address, ORIGINAL_EFFECT.ANCHOR_Y + 1);
  const level = effects.read8(address, ORIGINAL_EFFECT.LEVEL + 1);
  const previousLevel = effects.read8(address, ORIGINAL_EFFECT.SPATIAL_0E);
  effects.write8(address, ORIGINAL_EFFECT.SPATIAL_0C, x);
  effects.write8(address, ORIGINAL_EFFECT.SPATIAL_0C + 1, y);
  effects.write8(address, ORIGINAL_EFFECT.SPATIAL_0E, level);
  const quarter = effects.read8(address, ORIGINAL_EFFECT.CLASS) >> 2;
  if (level > previousLevel)
    effects.write8(
      address,
      ORIGINAL_EFFECT.CLASS,
      effects.read8(address, ORIGINAL_EFFECT.CLASS) - quarter,
    );
  else if (level < previousLevel)
    effects.write8(
      address,
      ORIGINAL_EFFECT.CLASS,
      effects.read8(address, ORIGINAL_EFFECT.CLASS) + quarter + 1,
    );
  draw?.({
    address,
    x,
    y,
    level,
    code: effects.read16(address, ORIGINAL_EFFECT.CODE),
  });
  effects.write16(
    address,
    ORIGINAL_EFFECT.PREVIOUS_SPATIAL,
    effects.read16(address, ORIGINAL_EFFECT.POSITION_X),
  );
  return { active: true, freed: false, x, y, level };
}

/** B941：固定按0x1400..0x17E0（本池0..0x3E0）升序遍历。 */
export function updateOriginalAttackEffects(
  objects,
  effects,
  spatial,
  { events = null, render = {} } = {},
) {
  const results = [];
  for (
    let address = 0;
    address < ORIGINAL_EFFECT_MEMORY_SIZE;
    address += 0x20
  ) {
    if (effects.read8(address, ORIGINAL_EFFECT.FLAGS) < 0xc0) continue;
    const contact = contactOriginalAttackEffect(
      objects,
      effects,
      spatial,
      address,
      events,
    );
    const movement = moveOriginalAttackEffect(effects, spatial, address);
    const commit = commitOriginalAttackEffect(effects, address, render);
    results.push({ address, contact, movement, commit });
  }
  return results;
}
