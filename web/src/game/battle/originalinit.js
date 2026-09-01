// KI.EXE 原版战术对象初始化 — 0x9E70/0x9E97、0x9AF4、0x9B40、
// 0x9B6D、0x9C13、0x9C45。
//
// 两条原军团记录先裁成各0x20字节的战斗临时记录；随后固定建立12组模板，
// 最后按对象地址升序调用96次RNG并激活每组最多8个对象。空组同样消费RNG。

import {
  ORIGINAL_GROUP_COUNT,
  ORIGINAL_OBJECT,
  ORIGINAL_SLOTS_PER_GROUP,
  OriginalBattleObjectPool,
  originalObjectAddress,
} from "./originalstate.js";

export const ORIGINAL_SIDE_TEMP_SIZE = 0x20;
export const ORIGINAL_TEMP_MEMORY_SIZE = 0x40;
export const ORIGINAL_TEMP_GROUP_BASE = 0x08;
export const ORIGINAL_TEMP_GROUP_SIZE = 0x04;

const TYPE_POWER_BONUS = Object.freeze([0x1e, 0x04, 0x0c, 0x00]);
const byte = (value) => value & 0xff;
const word = (value) => value & 0xffff;

function checkedSide(side) {
  if (side !== 0 && side !== 1)
    throw new RangeError("original battle side must be 0 or 1");
  return side;
}

function checkedGroup(group) {
  if (group < 0 || group >= ORIGINAL_GROUP_COUNT)
    throw new RangeError("original battle group must be 0..5");
  return group;
}

export function originalTempGroupOffset(side, group) {
  return (
    checkedSide(side) * ORIGINAL_SIDE_TEMP_SIZE +
    ORIGINAL_TEMP_GROUP_BASE +
    checkedGroup(group) * ORIGINAL_TEMP_GROUP_SIZE
  );
}

/**
 * 0x9E97：从一条原始0x40字节军团记录裁出战术层使用的0x20字节临时记录。
 */
export function copyOriginalBattleSideTemp(legionBytes, sourceOffset = 0) {
  if (!legionBytes || legionBytes.length < sourceOffset + 0x40)
    throw new TypeError("original legion record must provide 0x40 bytes");
  const temp = new Uint8Array(ORIGINAL_SIDE_TEMP_SIZE);
  temp.set(legionBytes.slice(sourceOffset + 1, sourceOffset + 8), 1);
  for (let group = 0; group < ORIGINAL_GROUP_COUNT; group++) {
    const source = sourceOffset + 0x28 + group * 4;
    const target = ORIGINAL_TEMP_GROUP_BASE + group * ORIGINAL_TEMP_GROUP_SIZE;
    temp.set(legionBytes.slice(source, source + 3), target);
  }
  return temp;
}

/** 由Web运行态字段建立与0x9E97输出同形的临时记录；兵力输入必须已是原版十人单位。 */
export function createOriginalBattleSideTemp({
  faction = 0,
  commanderIndex = 0,
  total = 0,
  morale = 0,
  groups = [],
} = {}) {
  const temp = new Uint8Array(ORIGINAL_SIDE_TEMP_SIZE);
  temp[1] = byte(faction);
  temp[2] = byte(commanderIndex);
  temp[4] = word(total) & 0xff;
  temp[5] = word(total) >> 8;
  temp[6] = byte(morale);
  for (let group = 0; group < ORIGINAL_GROUP_COUNT; group++) {
    const source = groups[group] ?? {};
    const offset = ORIGINAL_TEMP_GROUP_BASE + group * ORIGINAL_TEMP_GROUP_SIZE;
    temp[offset] = byte(source.raw0 ?? source.kind ?? 0);
    temp[offset + 1] = byte(source.troops ?? source.remaining ?? 0);
    temp[offset + 2] = byte(source.type ?? 4);
  }
  return temp;
}

export class OriginalBattleTempRecords {
  constructor(sideTemps = null) {
    this.bytes = new Uint8Array(ORIGINAL_TEMP_MEMORY_SIZE);
    if (sideTemps) this.restore(sideTemps);
  }

  setSide(side, bytes) {
    checkedSide(side);
    if (!bytes || bytes.length !== ORIGINAL_SIDE_TEMP_SIZE)
      throw new TypeError("original battle side temp must contain 0x20 bytes");
    this.bytes.set(bytes, side * ORIGINAL_SIDE_TEMP_SIZE);
    return this;
  }

  read8(side, offset) {
    return this.bytes[this.#index(side, offset)];
  }

  write8(side, offset, value) {
    this.bytes[this.#index(side, offset)] = byte(value);
    return this;
  }

  read16(side, offset) {
    const index = this.#index(side, offset, 2);
    return this.bytes[index] | (this.bytes[index + 1] << 8);
  }

  write16(side, offset, value) {
    const index = this.#index(side, offset, 2);
    const next = word(value);
    this.bytes[index] = next & 0xff;
    this.bytes[index + 1] = next >> 8;
    return this;
  }

  snapshot() {
    return Array.from(this.bytes);
  }

  restore(snapshot) {
    if (Array.isArray(snapshot) || snapshot instanceof Uint8Array) {
      if (snapshot.length === ORIGINAL_TEMP_MEMORY_SIZE) {
        this.bytes.set(snapshot);
        return this;
      }
      if (
        snapshot.length === 2 &&
        snapshot[0]?.length === ORIGINAL_SIDE_TEMP_SIZE &&
        snapshot[1]?.length === ORIGINAL_SIDE_TEMP_SIZE
      ) {
        this.setSide(0, snapshot[0]);
        this.setSide(1, snapshot[1]);
        return this;
      }
    }
    throw new TypeError("invalid original battle temporary-record snapshot");
  }

  group(side, group) {
    const base = originalTempGroupOffset(side, group);
    return {
      raw0: this.bytes[base],
      remaining: this.bytes[base + 1],
      type: this.bytes[base + 2],
      survivors: this.bytes[base + 3],
    };
  }

  #index(side, offset, width = 1) {
    const index = checkedSide(side) * ORIGINAL_SIDE_TEMP_SIZE + (offset | 0);
    if (
      offset < 0 ||
      index < 0 ||
      index + width > (side + 1) * ORIGINAL_SIDE_TEMP_SIZE
    )
      throw new RangeError(
        "original battle temporary-record access out of range",
      );
    return index;
  }
}

function commanderFields(commander, mode) {
  const specialties = commander?.specialties ?? commander?.modeNibbles ?? [];
  let specialtyKey = "naval";
  if (mode === 0) specialtyKey = "siege";
  else if (mode === 1) specialtyKey = "field";
  return {
    attribute11: byte(
      commander?.attribute11 ??
        commander?.force ??
        commander?.ability?.force ??
        0,
    ),
    attribute12: byte(
      commander?.attribute12 ??
        commander?.lead ??
        commander?.ability?.lead ??
        0,
    ),
    modeNibble: byte(
      specialties[mode] ?? commander?.ability?.[specialtyKey] ?? 0,
    ),
  };
}

/** 0x9B6D/0x9C13 的u8公式；字段名保持机器层，避免扩大解释。 */
export function originalGroupTemplateValues(type, commander, mode = 0) {
  const normalizedType = byte(type);
  const { attribute12, modeNibble } = commanderFields(commander, mode);
  const adjusted = byte(attribute12 + modeNibble);
  let power = byte(
    byte(adjusted * 3) + (TYPE_POWER_BONUS[normalizedType - 1] ?? 0),
  );
  power >>= 2;
  const classByte = byte(normalizedType * 0x12);
  if (classByte === 1) {
    if (mode === 1) power = byte(power << 1);
    else if (mode >= 2) power = (power >> 3) + 1;
  }
  return { type: normalizedType, classByte, power };
}

function writeGroupTemplate(pool, temps, side, group, commander, mode) {
  const tempGroup = temps.group(side, group);
  const values = originalGroupTemplateValues(tempGroup.type, commander, mode);
  const hp = temps.read8(side, 6);
  for (let slot = 0; slot < ORIGINAL_SLOTS_PER_GROUP; slot++) {
    const address = originalObjectAddress(side, group, slot);
    pool.write8(address, ORIGINAL_OBJECT.HP, hp);
    pool.write8(address, ORIGINAL_OBJECT.CLASS, values.classByte);
    pool.write8(address, ORIGINAL_OBJECT.POWER, values.power);
    pool.write8(address, ORIGINAL_OBJECT.STATUS_TIME, 0x80);
    pool.write16(address, ORIGINAL_OBJECT.CURRENT_COMMAND, 1);
  }
}

/** 0x9B40：双方0号槽改为CLASS=0，并覆盖POWER/HP。 */
function specializeLeaderSlot(pool, temps, side, commander, mode) {
  const address = originalObjectAddress(side, 0, 0);
  const { attribute11, modeNibble } = commanderFields(commander, mode);
  const power = byte(byte(attribute11 * 2) + modeNibble);
  pool.write8(address, ORIGINAL_OBJECT.POWER, byte(power * 2));
  pool.write8(address, ORIGINAL_OBJECT.CLASS, 0);

  const oldHp = pool.read8(address, ORIGINAL_OBJECT.HP);
  const hpFactor = byte(byte(attribute11 * 4) + 0x32);
  const hp = Math.max(0x46, Math.floor((hpFactor * oldHp) / 100));
  pool.write8(address, ORIGINAL_OBJECT.HP, hp);
}

function activateSlot(pool, temps, rng, side, group, slot) {
  const address = originalObjectAddress(side, group, slot);
  const random = rng.nextByte();
  const lane = (random & 0x1f) + 0x10;
  pool.write16(address, ORIGINAL_OBJECT.ANCHOR_Y, lane | (lane << 8));
  pool.write8(address, ORIGINAL_OBJECT.POSITION_Y, lane);

  const anchor = side === 0 ? 0x01 : 0x3e;
  pool.write16(address, ORIGINAL_OBJECT.ANCHOR_X, anchor | (anchor << 8));
  pool.write8(address, ORIGINAL_OBJECT.POSITION_X, anchor);

  const groupOffset =
    ORIGINAL_TEMP_GROUP_BASE + group * ORIGINAL_TEMP_GROUP_SIZE;
  const remaining = temps.read8(side, groupOffset + 1);
  if (remaining === 0) {
    pool.write8(address, ORIGINAL_OBJECT.FLAGS, 0);
    return { address, active: false, random, lane };
  }

  temps.write16(side, 4, temps.read16(side, 4) - 1);
  temps.write8(side, groupOffset + 1, remaining - 1);
  pool.write8(address, ORIGINAL_OBJECT.FLAGS, 0x80);
  // 9C98..9CA6：AX=(Y<<8)>>2 + X，即64×64地图线性索引y*0x40+x。
  const spatial = word(lane * 0x40 + anchor);
  pool.write16(address, ORIGINAL_OBJECT.SPATIAL_0C, spatial);
  pool.write16(address, ORIGINAL_OBJECT.SPATIAL_0E, spatial);
  return { address, active: true, random, lane, spatial };
}

/**
 * 完整执行0x9ACE→0x9AF4→0x9C45。每次调用固定消费96个RNG字节。
 */
export function initializeOriginalBattleObjects({
  pool = new OriginalBattleObjectPool(),
  temps,
  commanders = [],
  mode = 0,
  rng,
} = {}) {
  if (!(temps instanceof OriginalBattleTempRecords))
    throw new TypeError("original battle initialization requires temp records");
  if (!rng || typeof rng.nextByte !== "function")
    throw new TypeError("original battle initialization requires original RNG");

  pool.clear();
  for (let side = 0; side < 2; side++) {
    for (let group = 0; group < ORIGINAL_GROUP_COUNT; group++)
      writeGroupTemplate(pool, temps, side, group, commanders[side], mode);
  }
  specializeLeaderSlot(pool, temps, 0, commanders[0], mode);
  specializeLeaderSlot(pool, temps, 1, commanders[1], mode);

  const slots = [];
  for (let side = 0; side < 2; side++) {
    for (let group = 0; group < ORIGINAL_GROUP_COUNT; group++) {
      for (let slot = 0; slot < ORIGINAL_SLOTS_PER_GROUP; slot++)
        slots.push(activateSlot(pool, temps, rng, side, group, slot));
    }
  }
  return {
    pool,
    temps,
    slots,
    activeBySide: [
      slots.filter((slot) => slot.active && slot.address < 0x600).length,
      slots.filter((slot) => slot.active && slot.address >= 0x600).length,
    ],
  };
}
