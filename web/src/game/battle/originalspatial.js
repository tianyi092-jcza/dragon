// KI.EXE 战术ES空间内存的已闭合区域：双占用平面和ES:+0x7000高度描述。
// tile图属于CS:[D2F6]，单独保存。普通移动的占用提交队列仍需继续逆向。

export const ORIGINAL_SPATIAL_MEMORY_SIZE = 0xa000;
export const ORIGINAL_TILE_MEMORY_SIZE = 0x1000;
export const ORIGINAL_HEIGHT_DESCRIPTOR_BASE = 0x7000;

const u16 = (value) => value & 0xffff;

export class OriginalBattleSpatialMemory {
  constructor({ spatialBytes = null, tileBytes = null } = {}) {
    this.bytes = new Uint8Array(ORIGINAL_SPATIAL_MEMORY_SIZE);
    this.tiles = new Uint8Array(ORIGINAL_TILE_MEMORY_SIZE);
    this.tileAttributes = null;
    if (spatialBytes || tileBytes) this.restore({ spatialBytes, tileBytes });
  }

  read8(address) {
    return this.bytes[this.#index(address)];
  }

  write8(address, value) {
    this.bytes[this.#index(address)] = value & 0xff;
    return this;
  }

  tile(spatial) {
    return this.tiles[u16(spatial) & 0x0fff];
  }

  writeTile(index, value) {
    const offset = index | 0;
    if (offset < 0 || offset >= ORIGINAL_TILE_MEMORY_SIZE)
      throw new RangeError("original battle tile access outside memory");
    this.tiles[offset] = value & 0xff;
    return this;
  }

  heightDescriptor(index) {
    const descriptorIndex = index & 0x1fff;
    return this.read8(ORIGINAL_HEIGHT_DESCRIPTOR_BASE + descriptorIndex);
  }

  snapshot() {
    return {
      spatialBytes: Array.from(this.bytes),
      tileBytes: Array.from(this.tiles),
      tileAttributeBytes: this.tileAttributes
        ? Array.from(this.tileAttributes)
        : null,
    };
  }

  restore({
    spatialBytes = null,
    tileBytes = null,
    tileAttributeBytes = null,
  } = {}) {
    if (spatialBytes) {
      if (spatialBytes.length !== ORIGINAL_SPATIAL_MEMORY_SIZE)
        throw new TypeError("invalid original battle spatial snapshot");
      this.bytes.set(spatialBytes, 0);
    } else this.bytes.fill(0);
    if (tileBytes) {
      if (tileBytes.length !== ORIGINAL_TILE_MEMORY_SIZE)
        throw new TypeError("invalid original battle tile snapshot");
      this.tiles.set(tileBytes, 0);
    } else this.tiles.fill(0);
    this.tileAttributes = tileAttributeBytes
      ? Uint8Array.from(tileAttributeBytes)
      : null;
    return this;
  }

  #index(address) {
    const index = address | 0;
    if (index < 0 || index >= this.bytes.length)
      throw new RangeError("original battle spatial access outside memory");
    return index;
  }
}
