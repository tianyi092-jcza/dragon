// D2-EVENT-64 调度表（Web产品决定，非原版机制；用户 2026-11-17 确认 D0–D8
// 全部 (a)）。原版四页 256×4B 事件轮只能表达"相对当前游标的槽位"，满轮或
// 跨页请求会丢失；本模块用独立、可 JSON 化的调度表保存原轮放不下的记录，
// 位置按"月纪元×64槽"的绝对槽号表达，不猜造原版不存在的到期时间字段。
//
// 分工（与原轮不重复派发）：
//   原轮可写 → 仍写原轮（inserted 保持原 windows 真值，派发时读原槽）；
//   原轮写不下 → 记录在此表，带绝对位置、区域快照与城市灾害代次；
//   月移页 → 旧页未消费尾部与过期条目作为 carry 并入新纪元位置 0，旧先于新。
//
// 排队/carry/排序/派发均不消费 RNG。条目只保存四字节载荷与 Web 元数据，
// 不新增去重、合并、TTL、上限或自动重试。

export const SCHEDULE_VERSION = 1;
export const PAGE_SLOTS = 64;
export const WHEEL_SLOTS = 256;

const RANK_CARRY = 0;
const RANK_OVERFLOW = 1;

const isByte = (value) =>
  Number.isInteger(value) && value >= 0 && value <= 0xff;
const isPosition = (value) => Number.isInteger(value) && value >= 0;

const fail = (detail) => {
  throw new RangeError(`strategic event schedule corrupted: ${detail}`);
};

function byte(value, label) {
  if (!isByte(value)) fail(`${label} is not a byte`);
  return value;
}

function position(value, label = "position") {
  if (!isPosition(value)) fail(`${label} is not an absolute slot`);
  return value;
}

function signedWord(value, label) {
  if (!Number.isInteger(value) || value < -0x8000 || value > 0xffff)
    fail(`${label} is not a word`);
  return value;
}

function normalizeRegion(region) {
  if (region == null) return null;
  if (typeof region !== "object" || Array.isArray(region))
    fail("region is not an object");
  const out = {};
  for (const field of ["minX", "maxX", "minY", "maxY"])
    out[field] = signedWord(region[field], `region ${field}`);
  return out;
}

function normalizeEntry(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    fail("entry is not an object");
  const rank = raw.rank;
  if (rank !== RANK_CARRY && rank !== RANK_OVERFLOW) fail("entry rank");
  const order = raw.order;
  if (!Number.isInteger(order) || order < 0) fail("entry order");
  const entry = {
    position: position(raw.position),
    rank,
    order,
    type: byte(raw.type, "type"),
    arg0: byte(raw.arg0, "arg0"),
    arg1: byte(raw.arg1, "arg1"),
    arg2: byte(raw.arg2, "arg2"),
  };
  const region = normalizeRegion(raw.region);
  if (region) entry.region = region;
  if (raw.generation !== undefined) {
    if (!Number.isInteger(raw.generation) || raw.generation < 0)
      fail("generation");
    entry.generation = raw.generation;
  }
  return entry;
}

/** Create or validate the per-scenario schedule. Missing field is the only
 * lossless conversion path for pre-D2 snapshots: the original wheel alone is
 * the complete DOS state, so an empty schedule at epoch 0 loses nothing. */
export function ensureStrategicEventSchedule(sc) {
  if (!sc || typeof sc !== "object" || Array.isArray(sc))
    fail("needs a scenario object");
  if (sc.strategicEventSchedule === undefined) {
    sc.strategicEventSchedule = {
      version: SCHEDULE_VERSION,
      epoch: 0,
      entries: [],
      meta: [],
    };
  }
  const schedule = sc.strategicEventSchedule;
  if (!schedule || typeof schedule !== "object" || Array.isArray(schedule))
    fail("schedule is not an object");
  if (schedule.version !== SCHEDULE_VERSION) fail("unsupported version");
  if (!isPosition(schedule.epoch)) fail("epoch");
  if (!Array.isArray(schedule.entries)) fail("entries");
  schedule.entries = schedule.entries.map(normalizeEntry);
  if (schedule.meta === undefined) schedule.meta = [];
  if (!Array.isArray(schedule.meta)) fail("meta");
  schedule.meta = schedule.meta.map(normalizeMeta);
  return schedule;
}

function normalizeMeta(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail("meta");
  const meta = { position: position(raw.position) };
  if (raw.region !== undefined) meta.region = normalizeRegion(raw.region);
  if (raw.generation !== undefined) {
    if (!Number.isInteger(raw.generation) || raw.generation < 0)
      fail("meta generation");
    meta.generation = raw.generation;
  }
  if (meta.region === undefined && meta.generation === undefined)
    fail("empty meta");
  return meta;
}

/** Side metadata for a record that lives in the original wheel (D6 region
 * snapshot, D7 city disaster generation). Keyed by absolute slot so it follows
 * the record through month rotation. */
export function attachPositionMeta(sc, target, patch) {
  const schedule = ensureStrategicEventSchedule(sc);
  position(target);
  const clean = {
    position: target,
    ...(patch?.region ? { region: normalizeRegion(patch.region) } : {}),
    ...(patch?.generation === undefined
      ? {}
      : { generation: patch.generation }),
  };
  if (!clean.region && clean.generation === undefined) fail("empty meta");
  const existing = schedule.meta.find((item) => item.position === target);
  if (existing) Object.assign(existing, clean);
  else schedule.meta.push(clean);
  return target;
}

export function takePositionMeta(sc, target) {
  const schedule = ensureStrategicEventSchedule(sc);
  const existing = schedule.meta.filter((item) => item.position === target);
  if (existing.length === 0) return null;
  schedule.meta = schedule.meta.filter((item) => item.position !== target);
  return Object.assign({}, ...existing);
}

export function strategicEventEpoch(sc) {
  return ensureStrategicEventSchedule(sc).epoch;
}

/** Absolute slot number = epoch*64 + slot. */
export function absolutePosition(epoch, slot) {
  position(epoch, "epoch");
  position(slot, "slot");
  return epoch * PAGE_SLOTS + slot;
}

export function positionEpoch(value) {
  position(value);
  return Math.floor(value / PAGE_SLOTS);
}

export function positionSlot(value) {
  position(value);
  return value % PAGE_SLOTS;
}

function nextOrder(sc) {
  if (sc._strategicEventSeq === undefined) sc._strategicEventSeq = 0;
  if (!Number.isInteger(sc._strategicEventSeq) || sc._strategicEventSeq < 0)
    fail("sequence counter");
  return sc._strategicEventSeq++;
}

function insert(sc, entry) {
  const schedule = ensureStrategicEventSchedule(sc);
  schedule.entries.push(entry);
  schedule.entries.sort(
    (a, b) => a.position - b.position || a.rank - b.rank || a.order - b.order,
  );
  return { position: entry.position, order: entry.order };
}

/** Record one event the original wheel could not hold. `target` is the
 * absolute slot the producer asked for (D1/D2: never earlier than requested). */
export function recordOverflowEvent(sc, target, record) {
  return insert(sc, {
    position: position(target),
    rank: RANK_OVERFLOW,
    order: nextOrder(sc),
    type: byte(record?.type, "type"),
    arg0: byte(record?.arg0, "arg0"),
    arg1: byte(record?.arg1, "arg1"),
    arg2: byte(record?.arg2, "arg2"),
    region: normalizeRegion(record?.region),
    ...(record?.generation === undefined
      ? {}
      : { generation: record.generation }),
  });
}

/** Append one carried record (old month tail) to a future epoch's slot 0. */
export function recordCarryEvent(sc, target, record, order) {
  if (!Number.isInteger(order) || order < 0) fail("carry order");
  return insert(sc, {
    position: position(target),
    rank: RANK_CARRY,
    order,
    type: byte(record?.type, "type"),
    arg0: byte(record?.arg0, "arg0"),
    arg1: byte(record?.arg1, "arg1"),
    arg2: byte(record?.arg2, "arg2"),
    region: normalizeRegion(record?.region),
  });
}

/** D1/D2 target for a refused 2FBF/301C call. Page-internal crowding targets
 * the next epoch's slot 0 (D1); a request past the current page keeps its
 * absolute slot (never earlier than requested). `offset` is the wheel byte
 * offset returned by the refused primitive. */
export function overflowTargetFor(sc, { offset, pageFull } = {}) {
  if (!Number.isInteger(offset) || offset < 0) fail("refused offset");
  const epoch = ensureStrategicEventSchedule(sc).epoch;
  if (pageFull) return (epoch + 1) * PAGE_SLOTS;
  return epoch * PAGE_SLOTS + (offset >>> 2);
}

/** Append one carried record with a fresh order (wheel-tail order first). */
export function appendCarryEvent(sc, target, record) {
  return recordCarryEvent(sc, target, record, nextOrder(sc));
}

/** Attach the production-time area snapshot to an already recorded entry.
 * Used after 22DB returns: the bounds are written by the same synchronous
 * call, so the adapter attaches them without reordering the original leaf. */
export function attachRegionToEntry(sc, order, region) {
  if (!Number.isInteger(order) || order < 0) fail("entry order");
  const schedule = ensureStrategicEventSchedule(sc);
  const entry = schedule.entries.find((item) => item.order === order);
  if (!entry) fail(`no entry ${order} for region snapshot`);
  entry.region = normalizeRegion(region);
  return entry;
}

/** Take (and remove) every entry at one absolute position for one rank,
 * preserving order. The caller freezes the returned batch. */
export function takeScheduledEntries(sc, target, rank) {
  const schedule = ensureStrategicEventSchedule(sc);
  position(target);
  if (rank !== RANK_CARRY && rank !== RANK_OVERFLOW) fail("rank");
  const taken = schedule.entries.filter(
    (entry) => entry.position === target && entry.rank === rank,
  );
  if (taken.length === 0) return [];
  schedule.entries = schedule.entries.filter(
    (entry) => !(entry.position === target && entry.rank === rank),
  );
  return taken.map((entry) => ({
    ...entry,
    region: entry.region ? { ...entry.region } : null,
  }));
}

/** 0x304E companion: a record is pending until it is actually dispatched, so
 * every remaining schedule entry participates in the read-only query. */
export function hasScheduledEvent(sc, { type, arg0 = null, arg1 = null } = {}) {
  if (!sc || typeof sc !== "object") return false;
  const entries = sc.strategicEventSchedule?.entries;
  if (!Array.isArray(entries)) return false;
  return entries.some((entry) => {
    if (entry.type !== type) return false;
    if (arg0 != null && entry.arg0 !== arg0) return false;
    if (arg1 != null && entry.arg1 !== arg1) return false;
    return true;
  });
}

export function pendingScheduledCount(sc) {
  if (!sc || typeof sc !== "object" || !sc.strategicEventSchedule) return 0;
  const entries = sc.strategicEventSchedule.entries;
  return Array.isArray(entries) ? entries.length : 0;
}

/** D3: on month rotation, everything still owed at or before the old epoch
 * moves to the new epoch's slot 0 as carry, keeping relative order. */
export function carryOverdueEntries(sc, nextEpoch) {
  position(nextEpoch, "epoch");
  const schedule = ensureStrategicEventSchedule(sc);
  const limit = nextEpoch * PAGE_SLOTS;
  const overdue = schedule.entries
    .filter((entry) => entry.position < limit)
    .sort((a, b) => a.position - b.position || a.order - b.order);
  if (overdue.length === 0) return 0;
  for (const entry of overdue) {
    entry.position = limit;
    entry.rank = RANK_CARRY;
    entry.order = nextOrder(sc);
  }
  schedule.entries.sort(
    (a, b) => a.position - b.position || a.rank - b.rank || a.order - b.order,
  );
  return overdue.length;
}

/** Move to a new month epoch (called by 2BD9 before the wheel shifts). */
export function advanceScheduleEpoch(sc) {
  const schedule = ensureStrategicEventSchedule(sc);
  schedule.epoch += 1;
  return schedule.epoch;
}

/** Decode one four-byte wheel slot into the scheduler's record shape. */
export function wheelEventToRecord(event) {
  return {
    type: byte(event?.type, "type"),
    arg0: byte(event?.arg0, "arg0"),
    arg1: byte(event?.arg1, "arg1"),
    arg2: byte(event?.arg2, "arg2"),
  };
}

/** Adapter hook for a refused 2FBF/301C record. `meta` carries the refused
 * wheel offset and whether the current page was full; adapters owning a
 * scenario return `{position, order}`, detached fixtures keep the legacy
 * drop (null). Consumes no RNG. */
export function queueOverflowRecord(io, ax, dx, meta = null) {
  if (typeof io?.queueOverflowRecord !== "function") return null;
  return io.queueOverflowRecord(
    {
      type: ax & 0xff,
      arg0: (ax >> 8) & 0xff,
      arg1: dx & 0xff,
      arg2: (dx >> 8) & 0xff,
    },
    meta,
  );
}

export const STRATEGIC_EVENT_RANKS = Object.freeze({
  carry: RANK_CARRY,
  overflow: RANK_OVERFLOW,
});

/** D3 rotation, shared by 2BD9 adapters. `readRecord(slot)` returns the wheel
 * record at an absolute slot (0..63 of the current page) or null; only slots
 * at/after the cursor are still unconsumed and must be carried.
 * Order of meta: wheel-tail order first, then overdue schedule entries. */
export function rotateStrategicEventSchedule(sc, { cursorSlot, readRecord }) {
  const schedule = ensureStrategicEventSchedule(sc);
  position(cursorSlot, "cursor");
  if (cursorSlot > PAGE_SLOTS) fail("cursor slot");
  const base = schedule.epoch * PAGE_SLOTS;
  let carried = 0;
  for (let slot = cursorSlot; slot < PAGE_SLOTS; slot++) {
    const record = readRecord(slot);
    if (!record) continue;
    const meta = takePositionMeta(sc, base + slot);
    appendCarryEvent(sc, base + PAGE_SLOTS, {
      ...record,
      ...(meta?.region ? { region: meta.region } : {}),
      ...(meta?.generation === undefined
        ? {}
        : { generation: meta.generation }),
    });
    carried++;
  }
  // Pages 1..3 shift down one page; page 3 is cleared by 2BD9.
  schedule.meta = schedule.meta
    .filter((item) => item.position < base + 3 * PAGE_SLOTS)
    .map((item) =>
      item.position < base + PAGE_SLOTS
        ? item
        : { ...item, position: item.position - PAGE_SLOTS },
    );
  const overdue = carryOverdueEntries(sc, schedule.epoch + 1);
  advanceScheduleEpoch(sc);
  return { carried, overdue, epoch: schedule.epoch };
}
