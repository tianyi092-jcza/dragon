// KI.EXE 0xC653/AED2/B00D 原版路径重建环形队列。
// BD46完整寻路可由注入builder承接；队列、预算和路径word消费均严格确定且0 RNG。

import { ORIGINAL_OBJECT } from "./originalstate.js";

export const ORIGINAL_PATH_QUEUE_BYTES = 0x100;
// B00D以DS:0x1800+(SI<<2)+u8 offset寻址。SI覆盖0..0xBE0，故窗口
// 实际跨越0x1800..0x47FF，共0x3000字节；原先0x1800 mask会让0/0x600别名。
export const ORIGINAL_PATH_MEMORY_SIZE = 0x3000;

const u8 = (value) => value & 0xff;

export class OriginalBattlePathState {
  constructor({
    queueBytes = null,
    pathBytes = null,
    head = 0,
    tail = 0,
  } = {}) {
    this.queue = new Uint8Array(ORIGINAL_PATH_QUEUE_BYTES);
    this.paths = new Uint8Array(ORIGINAL_PATH_MEMORY_SIZE);
    this.head = head & 0xff;
    this.tail = tail & 0xff;
    if (queueBytes) this.#restoreBytes(this.queue, queueBytes, "queue");
    if (pathBytes) this.#restoreBytes(this.paths, pathBytes, "path");
  }

  enqueue(pool, address) {
    if ((pool.read8(address, ORIGINAL_OBJECT.FLAGS) & 0x10) !== 0) return false;
    pool.write8(
      address,
      ORIGINAL_OBJECT.FLAGS,
      pool.read8(address, ORIGINAL_OBJECT.FLAGS) | 0x10,
    );
    this.queue[this.tail] = address & 0xff;
    this.queue[(this.tail + 1) & 0xff] = address >> 8;
    this.tail = (this.tail + 2) & 0xff;
    return true;
  }

  readQueued(offset = this.head) {
    const index = offset & 0xff;
    return this.queue[index] | (this.queue[(index + 1) & 0xff] << 8);
  }

  pathBase(address) {
    const base = address << 2;
    if (base < 0 || base >= ORIGINAL_PATH_MEMORY_SIZE)
      throw new RangeError("original path object address is outside memory");
    return base;
  }

  readPathWord(address, offset) {
    const index = this.pathBase(address) + (offset & 0xff);
    if (index + 1 >= this.paths.length)
      throw new RangeError("original path read is outside memory");
    return this.paths[index] | (this.paths[index + 1] << 8);
  }

  writePath(address, words) {
    if (!Array.isArray(words) || words.length > 0x40)
      throw new RangeError("original path must contain at most 64 words");
    let index = this.pathBase(address);
    if (index + words.length * 2 > this.paths.length)
      throw new RangeError("original path write is outside memory");
    for (const word of words) {
      this.paths[index] = word & 0xff;
      this.paths[index + 1] = (word >> 8) & 0xff;
      index += 2;
    }
    return words.length;
  }

  snapshot() {
    return {
      queueBytes: Array.from(this.queue),
      pathBytes: Array.from(this.paths),
      head: this.head,
      tail: this.tail,
    };
  }

  restore(snapshot = {}) {
    this.head = (snapshot.head ?? 0) & 0xff;
    this.tail = (snapshot.tail ?? 0) & 0xff;
    if (snapshot.queueBytes)
      this.#restoreBytes(this.queue, snapshot.queueBytes, "queue");
    else this.queue.fill(0);
    if (snapshot.pathBytes)
      this.#restoreBytes(this.paths, snapshot.pathBytes, "path");
    else this.paths.fill(0);
    return this;
  }

  #restoreBytes(target, source, label) {
    if (source.length !== target.length)
      throw new TypeError(`invalid original ${label} snapshot`);
    target.set(source, 0);
  }
}

/** B00D：消费一个路径word。 */
export function executeOriginalNextPathWord(pool, paths, address) {
  const remaining = u8(pool.read8(address, ORIGINAL_OBJECT.PATH_REMAINING) - 1);
  pool.write8(address, ORIGINAL_OBJECT.PATH_REMAINING, remaining);
  if ((remaining & 0x80) !== 0) {
    pool.write8(address, ORIGINAL_OBJECT.PATH_REMAINING, 0);
    pool.write8(
      address,
      ORIGINAL_OBJECT.STATE,
      pool.read8(address, ORIGINAL_OBJECT.STATE) & 0xf7,
    );
    return { carry: true, exhausted: true };
  }
  const offset = pool.read8(address, ORIGINAL_OBJECT.PATH_OFFSET);
  pool.write8(address, ORIGINAL_OBJECT.PATH_OFFSET, offset + 2);
  const word = paths.readPathWord(address, offset);
  const low = word & 0xff;
  const high = word >> 8;
  if (low < 0x80) pool.write16(address, ORIGINAL_OBJECT.POSITION_X, word);
  else
    pool.write8(
      address,
      ORIGINAL_OBJECT.POSITION_LEVEL,
      (high & 0x80) === 0 ? high : 0,
    );
  return { carry: false, exhausted: false, word };
}

/** AED2：每帧最多消费2项；builder失败也出队且不自动重试。 */
export function consumeOriginalPathQueue(
  pool,
  paths,
  spatial,
  { buildPath = null } = {},
) {
  const results = [];
  let head = paths.head;
  for (let budget = 0; budget < 2 && head !== paths.tail; budget++) {
    const address = paths.readQueued(head);
    pool.write8(
      address,
      ORIGINAL_OBJECT.FLAGS,
      pool.read8(address, ORIGINAL_OBJECT.FLAGS) & 0xef,
    );
    pool.write16(address, ORIGINAL_OBJECT.PATH_OFFSET, 0);
    pool.write8(
      address,
      ORIGINAL_OBJECT.POSITION_LEVEL,
      pool.read8(address, ORIGINAL_OBJECT.LEVEL),
    );
    pool.write8(
      address,
      ORIGINAL_OBJECT.POSITION_X,
      pool.read8(address, ORIGINAL_OBJECT.ANCHOR_X),
    );
    pool.write8(
      address,
      ORIGINAL_OBJECT.POSITION_Y,
      pool.read8(address, ORIGINAL_OBJECT.ANCHOR_Y),
    );
    if (pool.read8(address, ORIGINAL_OBJECT.HEIGHT) !== 0) {
      const mapIndex =
        (pool.read16(address, ORIGINAL_OBJECT.SPATIAL_0C) & 0x0fff) + 0x1000;
      pool.write8(
        address,
        ORIGINAL_OBJECT.POSITION_LEVEL,
        spatial.heightDescriptor(mapIndex) & 7, // D2FC, not D2FA occupancy.
      );
    }
    const classValue = pool.read8(address, ORIGINAL_OBJECT.CLASS);
    const command = pool.read8(address, ORIGINAL_OBJECT.CURRENT_COMMAND);
    const request = {
      address,
      // AEF6/AEF9 pack nonadjacent +6/+8, never +6/+7.
      current:
        pool.read8(address, ORIGINAL_OBJECT.ANCHOR_X) |
        (pool.read8(address, ORIGINAL_OBJECT.ANCHOR_Y) << 8),
      target: pool.read16(address, ORIGINAL_OBJECT.TARGET_X),
      layer: pool.read8(address, ORIGINAL_OBJECT.HEIGHT),
      mask: classValue > 0x12 ? 0x74 : 0xeb,
      endpointPolicy: classValue <= 0x12 || command === 5 ? 1 : 0,
    };
    pool.write8(
      address,
      ORIGINAL_OBJECT.FLAGS,
      pool.read8(address, ORIGINAL_OBJECT.FLAGS) & 0xfb,
    );
    const built = buildPath?.(request) ?? { carry: true, words: [] };
    let first = null;
    if (!built.carry) {
      const count = paths.writePath(address, built.words ?? []);
      pool.write8(address, ORIGINAL_OBJECT.PATH_REMAINING, count);
      first = executeOriginalNextPathWord(pool, paths, address);
    }
    results.push({ address, request, built, first });
    head = (head + 2) & 0xff;
  }
  paths.head = head;
  return results;
}
