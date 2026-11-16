// D2-C overflow side table (Web产品决定，非原版机制，用户B4批准；与原证
// 冲突时以原证为准，可能返工）。原生4字节事件记录无空位放sequence/overflow
// 标记，故未入轮的事件暂存此旁表，按sequence保序，2BD9移页清空页3后排空。
// 正常未拥挤路径、游标/分频/RNG消费一律不动；捕获与排空均不耗RNG。
const u8 = (value, label) => {
  if (!Number.isInteger(value) || value < 0 || value > 255)
    throw new RangeError(`overflow record ${label} must be a byte`);
  return value;
};

function table(sc) {
  if (!sc || typeof sc !== "object" || Array.isArray(sc))
    throw new RangeError("overflow table needs a scenario object");
  if (sc.strategicEventOverflow === undefined) sc.strategicEventOverflow = [];
  if (!Array.isArray(sc.strategicEventOverflow))
    throw new RangeError("overflow table corrupted");
  if (sc._strategicEventSeq === undefined) sc._strategicEventSeq = 0;
  if (!Number.isInteger(sc._strategicEventSeq) || sc._strategicEventSeq < 0)
    throw new RangeError("overflow sequence corrupted");
  return sc.strategicEventOverflow;
}

/** Capture one unplaceable 4-byte event. Returns its sequence number. */
export function captureStrategicOverflow(sc, record) {
  const list = table(sc);
  const entry = {
    type: u8(record?.type, "type"),
    arg0: u8(record?.arg0, "arg0"),
    arg1: u8(record?.arg1, "arg1"),
    arg2: u8(record?.arg2, "arg2"),
    sequence: sc._strategicEventSeq++,
  };
  list.push(entry);
  return entry.sequence;
}

/** Take up to max head records in sequence order (drain consumes them). */
export function takeStrategicOverflow(sc, max) {
  const list = table(sc);
  if (!Number.isInteger(max) || max < 0)
    throw new RangeError("overflow take bound invalid");
  return list.splice(0, Math.min(max, list.length));
}

/** Adapter hook for the D2-C overflow side table (Web产品决定). Adapters that
 * own a scenario implement `queueOverflowRecord({type,arg0,arg1,arg2})`;
 * detached fixtures without it keep the legacy drop. Consumes no RNG. */
export function queueOverflowRecord(io, ax, dx) {
  if (typeof io?.queueOverflowRecord !== "function") return -1;
  return io.queueOverflowRecord({
    type: ax & 0xff, arg0: (ax >> 8) & 0xff, arg1: dx & 0xff, arg2: (dx >> 8) & 0xff,
  });
}

/** Drain pending overflow head-first into the freshly cleared page 3
 * (offsets 0x300.., up to 64 records). Stops at the first non-empty slot
 * (defensive; the page was just cleared) and leaves the rest tabled in
 * order. Returns the placed count. Consumes no RNG. Zero footprint when
 * the table was never created (capture is the sole creator). */
export function drainStrategicOverflow(sc, readTypeByte, writeWord) {
  const table = sc?.strategicEventOverflow;
  if (!Array.isArray(table) || table.length === 0) return 0;
  const pending = table.slice(0, 64);
  let placed = 0;
  for (const record of pending) {
    if (placed >= 64) break;
    const offset = 0x300 + placed * 4;
    if (readTypeByte(offset) !== 0) break;
    writeWord(offset, record.type | (record.arg0 << 8));
    writeWord(offset + 2, record.arg1 | (record.arg2 << 8));
    placed++;
  }
  if (placed > 0) sc.strategicEventOverflow = table.slice(placed);
  return placed;
}

/** Pending count for diagnostics (never a rule input). */
export function pendingStrategicOverflow(sc) {
  if (!sc || typeof sc !== "object" || !Array.isArray(sc.strategicEventOverflow)) return 0;
  return sc.strategicEventOverflow.length;
}
