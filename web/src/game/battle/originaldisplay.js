// KI DA1C/DAAA, DB34/DB9B, DC03, DD22 display-cell memory.
// This is presentation state only. The expanded grid is a Web viewport policy;
// native geometry remains available for bounded clipping/compositor fixtures.
// 99F3 gives DC9D raw (x0,y0)=(36,14); DC9D stores the transformed
// display origin C=x0+y0=50, R=SAR(y0-x0,1)+32=21 in E160/E162.
export const NATIVE_DISPLAY = Object.freeze({
  columns: 32,
  rows: 30,
  clipRows: 24,
  column: 50,
  row: 21,
});
export const SCENE_DISPLAY = Object.freeze({
  columns: 132,
  rows: 80,
  clipRows: 74,
  column: -2,
  row: -6,
});

export class OriginalBattleDisplay {
  constructor(geometry = NATIVE_DISPLAY) {
    this.geometry = { ...geometry };
    const { columns, rows, clipRows, column, row } = this.geometry;
    if (
      ![columns, rows, clipRows, column, row].every(Number.isInteger) ||
      columns < 4 ||
      columns > 132 ||
      columns & 1 ||
      rows < 7 ||
      rows > 80 ||
      clipRows < 1 ||
      clipRows > rows - 6 ||
      column & 1
    )
      throw new TypeError("invalid battle display geometry");
    this.bytes = new Uint8Array(columns * rows * 32);
    this.revision = 0;
  }
  word(at) {
    return this.bytes[at] | (this.bytes[at + 1] << 8);
  }
  setWord(at, value) {
    this.bytes[at] = value;
    this.bytes[at + 1] = value >>> 8;
  }
  cell({ x, y, level }) {
    const g = this.geometry;
    const column = x + y - g.column;
    const row = ((y - x) >> 1) + 32 - level - g.row;
    if (column < 0 || column >= g.columns - 1 || row < 0 || row >= g.clipRows)
      return -1;
    return (row * g.columns + column) * 32;
  }
  // DD22 traverses base cells frontward, depositing each higher terrain slot
  // one row above, preserving the two channels and original floor/max bytes.
  terrain(tiles, attributes) {
    const g = this.geometry,
      stride = g.columns * 32;
    for (let row = 0; row < g.rows; row++)
      for (let column = 0; column < g.columns - 1; column++) {
        const c = column + g.column,
          r = row + g.row;
        const difference = 2 * (r - 32) + (c & 1);
        const x = (c - difference) / 2,
          y = (c + difference) / 2;
        const tile =
          x >= 0 && x < 64 && y >= 0 && y < 64 ? tiles[y * 64 + x] : 0;
        let cell = (row * g.columns + column) * 32;
        this.setWord(cell + 1, 0);
        for (let level = 0; level < 7 && cell >= 0; level++, cell -= stride) {
          const at = cell + 4 + level * 4,
            sprite = attributes[tile * 8 + level + 1];
          const changed = this.word(at) !== sprite;
          if (changed) {
            this.setWord(at, sprite);
            this.bytes[cell] |= 0x80;
          }
          if (sprite) {
            if (sprite < 0x20) {
              if (!changed) this.bytes[cell] &= 0x7f;
              this.bytes[cell + 2] = level * 2;
            }
            this.bytes[cell + 1] = this.bytes[cell + 3] = level * 2;
          }
          if (this.word(at + 2)) {
            this.bytes[cell] |= 0x80;
            this.setWord(at + 2, 0);
          }
        }
      }
    this.revision++;
  }
  insert(cell, levelCode, channel, code, overwrite) {
    const at = cell + 2 + levelCode * 2 + channel;
    if ((!overwrite && this.word(at)) || levelCode < this.bytes[cell + 2])
      return;
    this.setWord(at, code);
    this.bytes[cell] |= 0x80;
    this.bytes[cell + 1] = Math.max(this.bytes[cell + 1], levelCode);
  }
  draw({ x, y, level, code, pair = false, attribute = false }) {
    let cell = this.cell({ x, y, level });
    if (cell < 0) return;
    const channel = pair && !attribute ? 2 : 0;
    const height = 2 * level + 1;
    this.insert(cell, height, channel, code + Number(pair), attribute);
    cell -= this.geometry.columns * 32;
    if (pair && cell >= 0)
      this.insert(cell, height + 2, channel, code, attribute);
    this.revision++;
  }
  erase({ x, y, level, pair = false }) {
    let cell = this.cell({ x, y, level });
    if (cell < 0) return;
    for (
      let half = 0;
      half < (pair ? 2 : 1) && cell >= 0;
      half++, cell -= this.geometry.columns * 32
    ) {
      const height = 2 * (level + half) + 1;
      const at = cell + 2 + height * 2 + (pair ? 2 : 0);
      const code = this.word(at);
      if (pair ? code !== 0 : code >= 0xc0) {
        if (height >= this.bytes[cell + 1])
          this.bytes[cell + 1] = this.bytes[cell + 3];
        this.setWord(at, 0);
        this.bytes[cell] |= 0x80;
      }
    }
    this.revision++;
  }
  snapshot() {
    return {
      geometry: { ...this.geometry },
      bytes: Array.from(this.bytes),
      revision: this.revision,
    };
  }
  static fromSnapshot(snapshot) {
    if (
      !snapshot ||
      !Number.isSafeInteger(snapshot.revision) ||
      snapshot.revision < 0
    )
      throw new TypeError("invalid battle display snapshot");
    const display = new OriginalBattleDisplay(snapshot.geometry);
    if (
      !Array.isArray(snapshot.bytes) ||
      snapshot.bytes.length !== display.bytes.length ||
      !snapshot.bytes.every((v) => Number.isInteger(v) && v >= 0 && v <= 255)
    )
      throw new TypeError("invalid battle display bytes");
    display.bytes.set(snapshot.bytes);
    display.revision = snapshot.revision;
    return display;
  }
}

/** BB10 captures DC03 input before INC +1B. No draw/restore operation calls it. */
export function updateOriginalAttributeDisplays(mapObjects, display = null) {
  const captures = [];
  for (const address of mapObjects.addresses(0xe00, 0x1400)) {
    if (mapObjects.read8(address, 0) < 0xc0) continue;
    const level = mapObjects.read8(address, 0xa),
      phase = mapObjects.read8(address, 0x1b);
    const capture = {
      address,
      x: mapObjects.read16(address, 6),
      y: mapObjects.read16(address, 8),
      level,
      phase,
      code:
        (mapObjects.read16(address, 0x1c) +
          (level === 6 ? 8 + phase : 2 * phase)) &
        0xffff,
      pair: level !== 6,
      attribute: true,
    };
    display?.draw(capture);
    captures.push(capture);
    mapObjects.write8(address, 0x1b, (phase + 1) & 3);
  }
  return captures;
}
