// KI.EXE 原版战术对象内存模型。
// 双方各6组，每组0x100字节；每组8个0x20字节槽。规则层保留原始字节
// 布局和地址顺序，避免高级JS对象破坏字段重叠、u8溢出及确定性遍历。

export const ORIGINAL_SIDE_SIZE = 0x600;
export const ORIGINAL_UNIT_MEMORY_SIZE = 0xc00;
export const ORIGINAL_GROUP_SIZE = 0x100;
export const ORIGINAL_SLOT_SIZE = 0x20;
export const ORIGINAL_GROUP_COUNT = 6;
export const ORIGINAL_SLOTS_PER_GROUP = 8;
export const ORIGINAL_OBJECT_COUNT = 0x60;

export const ORIGINAL_OBJECT = Object.freeze({
  FLAGS: 0x00,
  KIND: 0x01,
  STATE: 0x02,
  HP: 0x03,
  CLASS: 0x04,
  DIRECTION: 0x05,
  ANCHOR_X: 0x06,
  PREVIOUS_X: 0x07,
  ANCHOR_Y: 0x08,
  PREVIOUS_Y: 0x09,
  LEVEL: 0x0a,
  PREVIOUS_LEVEL: 0x0b,
  POSITION_X: 0x10,
  POSITION_Y: 0x11,
  POSITION_LEVEL: 0x12,
  SPATIAL_0C: 0x0c,
  SPATIAL_0E: 0x0e,
  FIELD_13: 0x13,
  TARGET_X: 0x14,
  TARGET_Y: 0x15,
  TIMER: 0x16,
  PATH_OFFSET: 0x16,
  PATH_REMAINING: 0x17,
  POWER: 0x18,
  STATUS_TIME: 0x19,
  CURRENT_COMMAND: 0x1a,
  PENDING_COMMAND: 0x1b,
  TARGET_POINTER: 0x1c,
  HEIGHT: 0x1e,
  PREVIOUS_HEIGHT: 0x1f,
  FIRST_CHILD_CLASS: 0x24,
});

const u8 = (value) => value & 0xff;
const u16 = (value) => value & 0xffff;

export function originalObjectAddress(side, group, slot = 0) {
  if (side !== 0 && side !== 1)
    throw new RangeError("original battle side must be 0 or 1");
  if (group < 0 || group >= ORIGINAL_GROUP_COUNT)
    throw new RangeError("original battle group must be 0..5");
  if (slot < 0 || slot >= ORIGINAL_SLOTS_PER_GROUP)
    throw new RangeError("original battle slot must be 0..7");
  return (
    side * ORIGINAL_SIDE_SIZE +
    group * ORIGINAL_GROUP_SIZE +
    slot * ORIGINAL_SLOT_SIZE
  );
}

export function originalAddressParts(address) {
  const value = address | 0;
  if (
    value < 0 ||
    value >= ORIGINAL_UNIT_MEMORY_SIZE ||
    value % ORIGINAL_SLOT_SIZE !== 0
  )
    throw new RangeError("invalid original battle object address");
  const side = value >= ORIGINAL_SIDE_SIZE ? 1 : 0;
  const local = value - side * ORIGINAL_SIDE_SIZE;
  return {
    side,
    group: local >> 8,
    slot: (local & 0xff) >> 5,
  };
}

/** 原版A754/A785顺序：0侧全组（组长后7槽），再0x600侧同序。 */
export function originalTraversalOrder() {
  return Array.from({ length: ORIGINAL_OBJECT_COUNT }, (_, index) => {
    const side = index < 0x30 ? 0 : 1;
    const localIndex = index % 0x30;
    return originalObjectAddress(side, localIndex >> 3, localIndex & 7);
  });
}

export class OriginalBattleObjectPool {
  constructor(bytes = null) {
    this.bytes = new Uint8Array(ORIGINAL_UNIT_MEMORY_SIZE);
    if (bytes) this.restore(bytes);
  }

  clear() {
    this.bytes.fill(0);
    return this;
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
    return this.read8(address, ORIGINAL_OBJECT.FLAGS) >= 0x80;
  }

  groupLeader(side, group) {
    return originalObjectAddress(side, group, 0);
  }

  addresses(side = null) {
    const order = originalTraversalOrder();
    return side == null
      ? order
      : order.filter((address) => originalAddressParts(address).side === side);
  }

  snapshot() {
    return Array.from(this.bytes);
  }

  restore(snapshot) {
    if (!snapshot || snapshot.length !== ORIGINAL_UNIT_MEMORY_SIZE)
      throw new TypeError("invalid original battle object-pool snapshot");
    this.bytes.set(snapshot, 0);
    return this;
  }

  object(address) {
    const pool = this;
    const parts = originalAddressParts(address);
    return Object.freeze({
      address,
      ...parts,
      read8(offset) {
        return pool.read8(address, offset);
      },
      write8(offset, value) {
        pool.write8(address, offset, value);
        return this;
      },
      read16(offset) {
        return pool.read16(address, offset);
      },
      write16(offset, value) {
        pool.write16(address, offset, value);
        return this;
      },
      get active() {
        return pool.isActive(address);
      },
    });
  }

  #index(address, offset, width = 1) {
    originalAddressParts(address - (address % ORIGINAL_SLOT_SIZE));
    const index = (address | 0) + (offset | 0);
    if (index < 0 || index + width > this.bytes.length)
      throw new RangeError(
        "original battle field access outside object memory",
      );
    return index;
  }
}

/** 0x9A92..0x9AC9 中可直接确认的全局初始值。 */
export function createOriginalBattleRegisters() {
  return {
    selectedGroupMask: 0x00, // D310
    winnerState: 0x00, // D349
    endCountdown: 0x78, // D34A
    mapRedraw: 0x00, // D348，B824完成对象破坏后置1，下一A065入口消费并清零
    tacticalFrameCounter: 0x0000, // D318，A12A每个A065先自增
    side0MarkerAt: 0xffff, // D322，A12A视觉标识调度
    side1MarkerAt: 0xffff, // D324，A12A视觉标识调度
    wallMarkerAt: 0xffff, // D326，A12A城壁标识调度
    mode: 0x00, // D34B，之后由战场目录写入
    d31e: 0x00, // D31E，0/1/2三态；先保留原始名，避免过早解释
    siegeLeaderTick: 0x0a, // D321，mode0每10次ADC8令指定侧首对象HP--
    battleSideFlag: 0x00, // D35，bit6镜像、bit7选择玩家战场侧
    themeFlag: 0x00, // AB4F，BATTLE.MAP目录第二字节
    cameraColumn: 0x00, // D346，战场UI/相机列状态
    scriptCommandByte: 0x00, // D347，BATTLE.DAT op1
    side0Timed: 0x00, // D31A，ADC8逐帧重建：0侧+19非零活动对象数
    side1Timed: 0x00, // D31B，ADC8逐帧重建：1侧+19非零活动对象数
    side0Active: 0xff, // D31C，ADC8逐帧重建
    side1Active: 0xff, // D31D，ADC8逐帧重建
    side0FormationBase: 0x0000, // D33C/D33D，x低字节、y高字节
    side1FormationBase: 0x0000, // D33E/D33F，x低字节、y高字节
    side0FormationOffset: 0x0000, // D342，CCE4表的字节偏移
    side1FormationOffset: 0x0000, // D344，CCE4表的字节偏移
    scriptPc: 0x0000, // D311
    scriptWait: 0x0000, // D313
    startupComplete: false, // 0xA1C5是否已执行
  };
}
