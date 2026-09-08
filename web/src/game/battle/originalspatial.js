// CC31..CC47: D2FA occupancy +0000..6FFF; D2FC descriptors +7000..8FFF;
// D2FE two-plane path surcharges +9000..AFFF. D300 workspace starts at B000.
// Tile bytes/MDL attributes belong to D2F6/D302, not these planes.

export const ORIGINAL_SPATIAL_MEMORY_SIZE = 0xb000;
export const ORIGINAL_PATH_SURCHARGE_BASE = 0x9000;
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

  /** B2A8/B2CB: low twelve pointer bits OR the object's +1E/+1F byte. */
  writePathSurcharge(pointer, height, value) {
    const node = (pointer & 0x0fff) | ((height & 0xff) << 8);
    return this.write8(ORIGINAL_PATH_SURCHARGE_BASE + node, value);
  }

  /** Live D2FC view, including both D2FE surcharge planes. */
  navigationBytes() {
    return this.bytes.subarray(ORIGINAL_HEIGHT_DESCRIPTOR_BASE);
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
      if (
        spatialBytes.length !== ORIGINAL_SPATIAL_MEMORY_SIZE &&
        spatialBytes.length !== 0xa000
      )
        throw new TypeError("invalid original battle spatial snapshot");
      // Legacy Web snapshots never represented the upper surcharge plane.
      // Zero-extend that absent state, not a claim to recover original history.
      this.bytes.fill(0);
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
