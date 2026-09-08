// KI.EXE 0xB8AA/B941 固定附属攻击/效果对象槽。
// 原地址0x1400..0x17E0共32槽；source&0x1E0导致相隔0x200的来源别名。

import {
  ORIGINAL_SIDE_SIZE,
  ORIGINAL_SLOT_SIZE,
  ORIGINAL_UNIT_MEMORY_SIZE,
  ORIGINAL_OBJECT,
  originalAddressParts,
} from "./originalstate.js";

export const ORIGINAL_EFFECT_SIDE_SIZE = 0x200;
export const ORIGINAL_EFFECT_MEMORY_SIZE = 0x400;
export const ORIGINAL_EFFECT = Object.freeze({
  FLAGS: 0x00,
  SOURCE_POINTER: 0x02,
  CLASS: 0x04,
  DIRECTION: 0x05,
  ANCHOR_X: 0x06,
  ANCHOR_Y: 0x08,
  LEVEL: 0x0a,
  SPATIAL_0C: 0x0c,
  SPATIAL_0E: 0x0e,
  POSITION_X: 0x10,
  POSITION_Y: 0x11,
  POSITION_LEVEL: 0x12,
  PREVIOUS_SPATIAL: 0x12,
  PARAMETER: 0x14,
  CODE: 0x1c,
});

const u8 = (value) => value & 0xff;
const u16 = (value) => value & 0xffff;

export function originalEffectAddress(sourceAddress) {
  const { side } = originalAddressParts(sourceAddress);
  const local = sourceAddress - side * ORIGINAL_SIDE_SIZE;
  return side * ORIGINAL_EFFECT_SIDE_SIZE + (local & 0x01e0);
}

export class OriginalBattleEffectPool {
  constructor(bytes = null) {
    this.bytes = new Uint8Array(ORIGINAL_EFFECT_MEMORY_SIZE);
    if (bytes) this.restore(bytes);
  }

  read8(address, offset = 0) {
    return this.bytes[this.#index(address, offset)];
  }

  write8(address, offset, value) {
    this.bytes[this.#index(address, offset)] = u8(value);
    return this;
  }

  read16(address, offset = 0) {
    const index = this.#index(address, offset, 2);
    return this.bytes[index] | (this.bytes[index + 1] << 8);
  }

  write16(address, offset, value) {
    const index = this.#index(address, offset, 2);
    const word = u16(value);
    this.bytes[index] = word & 0xff;
    this.bytes[index + 1] = word >> 8;
    return this;
  }

  isActive(address) {
    return this.read8(address, ORIGINAL_EFFECT.FLAGS) !== 0;
  }

  clear(address) {
    this.write8(address, ORIGINAL_EFFECT.FLAGS, 0);
    return this;
  }

  snapshot() {
    return Array.from(this.bytes);
  }

  restore(snapshot) {
    if (!snapshot || snapshot.length !== ORIGINAL_EFFECT_MEMORY_SIZE)
      throw new TypeError("invalid original battle effect-pool snapshot");
    this.bytes.set(snapshot, 0);
    return this;
  }

  #index(address, offset, width = 1) {
    const index = (address | 0) + (offset | 0);
    if (
      address < 0 ||
      address % ORIGINAL_SLOT_SIZE !== 0 ||
      index < 0 ||
      index + width > this.bytes.length
    )
      throw new RangeError("original battle effect access outside memory");
    return index;
  }
}

/** B8AA：只检查来源对象对应的唯一固定槽，绝不搜索其它空槽。 */
export function spawnOriginalAttackEffect(
  objects,
  effects,
  sourceAddress,
  { parameter, direction, effectClass, code },
) {
  if (sourceAddress < 0 || sourceAddress >= ORIGINAL_UNIT_MEMORY_SIZE)
    throw new RangeError("invalid original attack-effect source");
  const address = originalEffectAddress(sourceAddress);
  if (effects.isActive(address)) return { spawned: false, address };

  effects.write16(address, ORIGINAL_EFFECT.PARAMETER, parameter);
  effects.write8(address, ORIGINAL_EFFECT.DIRECTION, direction);
  effects.write16(address, ORIGINAL_EFFECT.CODE, code);
  effects.write8(address, ORIGINAL_EFFECT.CLASS, effectClass);
  effects.write16(address, ORIGINAL_EFFECT.SOURCE_POINTER, sourceAddress);
  let x = objects.read8(sourceAddress, ORIGINAL_OBJECT.ANCHOR_X);
  let y = objects.read8(sourceAddress, ORIGINAL_OBJECT.ANCHOR_Y);
  const level = u8(objects.read8(sourceAddress, ORIGINAL_OBJECT.LEVEL) + 1);
  if ((direction & 0x80) !== 0) {
    const delta = (direction & 0x02) === 0 ? -1 : 1;
    if ((direction & 1) === 0) x = u8(x + delta);
    else y = u8(y + delta);
  }
  // B8DA..B922 offsets precede both fixed-point anchors and erase coordinates.
  effects.write16(address, ORIGINAL_EFFECT.ANCHOR_X, x << 8);
  effects.write16(address, ORIGINAL_EFFECT.ANCHOR_Y, y << 8);
  effects.write16(address, ORIGINAL_EFFECT.LEVEL, level << 8);
  // B925..B935: AH=byte(level<<4), AX += y*64, with AL=adjusted X.
  const spatial = u16((u8(level << 4) << 8) + x + y * 0x40);
  effects.write8(address, ORIGINAL_EFFECT.SPATIAL_0C, x);
  effects.write8(address, ORIGINAL_EFFECT.SPATIAL_0C + 1, y);
  effects.write8(address, ORIGINAL_EFFECT.SPATIAL_0E, level);
  effects.write16(address, ORIGINAL_EFFECT.POSITION_X, spatial);
  effects.write16(address, ORIGINAL_EFFECT.PREVIOUS_SPATIAL, spatial);
  effects.write8(address, ORIGINAL_EFFECT.FLAGS, 0xc0);
  return { spawned: true, address };
}
