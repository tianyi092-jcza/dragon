// KI.EXE 战术/战略共用随机源 — 初始化 0xEC82，取值 0xECE0。
//
// 原版初始化先把表填为 0..255，再用 DOS int 1Ah 返回的 CH/CL/DH
// 洗牌。Web 不依赖系统时钟：调用方须传入同样的三个字节，差分回放时
// 才能保证每一次随机调用与原版完全一致。

const BYTE_COUNT = 0x100;

const byte = (value) => value & 0xff;

export class OriginalBattleRng {
  constructor(clock = {}) {
    this.table = new Uint8Array(BYTE_COUNT + 1);
    this.addend = 0;
    this.index = 0;
    this.calls = 0;
    this.seed(clock);
  }

  /** 复刻 0xEC82。clock 对应 DOS int 1Ah/AH=2 的 CH、CL、DH。 */
  seed({ ch = 0, cl = 0, dh = 0 } = {}) {
    for (let index = 0; index < BYTE_COUNT; index++) this.table[index] = index;
    this.table[BYTE_COUNT] = 0;

    const al = byte(dh + cl + (byte(ch) << 2));
    let bl = byte(dh);
    let ah = 0;
    do {
      // 原版在 bl==0xFF 时令 dx=0x0100，因此会与表尾的额外字节交换。
      const next = bl === 0xff ? BYTE_COUNT : bl + 1;
      const value = this.table[bl];
      this.table[bl] = this.table[next];
      this.table[next] = value;
      bl = byte(bl + 0x4f);
      ah = byte(ah - 1);
    } while (ah !== 0);

    this.addend = al;
    this.index = byte(al ^ bl);
    this.calls = 0;
    return this;
  }

  /** 复刻 0xECE0，返回 AL (0..255)。 */
  nextByte() {
    const value = byte(this.table[this.index] + this.addend);
    this.addend = byte(this.addend + 0x89);
    this.index = value;
    this.calls++;
    return value;
  }

  snapshot() {
    return {
      table: Array.from(this.table),
      addend: this.addend,
      index: this.index,
      calls: this.calls,
    };
  }

  restore(snapshot) {
    if (
      !snapshot ||
      !Array.isArray(snapshot.table) ||
      snapshot.table.length !== 257
    )
      throw new TypeError("invalid original battle RNG snapshot");
    this.table.set(snapshot.table.map(byte));
    this.addend = byte(snapshot.addend ?? 0);
    this.index = byte(snapshot.index ?? 0);
    this.calls = Math.max(0, snapshot.calls | 0);
    return this;
  }
}

export function createOriginalBattleRng(clock) {
  return new OriginalBattleRng(clock);
}
