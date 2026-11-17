import {
  originalEventPump31AE,
  originalGenericTalk3496,
} from "./originalevents.js";
import {
  STRATEGIC_EVENT_RANKS,
  absolutePosition,
  attachPositionMeta,
  overflowTargetFor,
  recordOverflowEvent,
  strategicEventEpoch,
  takePositionMeta,
  takeScheduledEntries,
} from "./strategiceventschedule.js";

const missing = (label) => {
  throw new RangeError(`Web engineering Uncovered native event ${label}`);
};
const own = (record, field) => {
  if (!record || typeof record !== "object" || !Object.hasOwn(record, field))
    missing(field);
  return record[field];
};
const byte = (value, label) => {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) missing(label);
  return value;
};

/** 3496 native type10 payload decoder; message return remains an App boundary. */
export function decodeScenarioGenericTalkEvent(event) {
  return originalGenericTalk3496(event);
}

/** Shared 4-byte wheel IO for the native producers/consumers. `eventAt` is
 * limited to the current page for the pump, but the whole wheel for 301C,
 * which is why the address bound is a parameter. */
export function createScenarioEventWheelIO(sc, { pageOnly = false } = {}) {
  const limit = pageOnly ? 0x100 : 0x400;
  const eventAt = (offset) => {
    if (!Number.isInteger(offset) || offset < 0 || offset >= limit || offset % 4)
      missing(`slot address ${offset}`);
    const slots = own(sc, "strategicEventSlots");
    const index = offset >>> 2;
    if (!Array.isArray(slots) || !Object.hasOwn(slots, index))
      missing(`slot ${index}`);
    const event = slots[index];
    if (event !== null && (typeof event !== "object" || Array.isArray(event)))
      missing(`record ${index}`);
    return { slots, index, event };
  };
  return {
    readEventCursorWord() {
      const cursor = own(sc, "_strategicEventCursor");
      if (!Number.isInteger(cursor) || cursor < 0 || cursor > 0x3fff)
        missing("aligned D20 cursor");
      return cursor * 4;
    },
    readEventTypeByte(offset) {
      const { event } = eventAt(offset);
      return event === null ? 0 : byte(own(event, "type"), "event type");
    },
    writeEventWord(offset, value) {
      const { slots, index, event } = eventAt(offset & 0xfffc);
      if (offset % 4 === 0) {
        slots[index] = { type: value & 0xff, arg0: value >>> 8 };
      } else if (offset % 4 === 2) {
        if (event === null) missing("event first-word prefix");
        slots[index] = { ...event, arg1: value & 0xff, arg2: value >>> 8 };
      } else missing("unaligned event word");
    },
    queueOverflowRecord(record, meta) {
      return recordOverflowEvent(sc, overflowTargetFor(sc, meta), record);
    },
    noteEventPlacement({ offset, ax, dx }) {
      if ((ax & 0xff) !== 0x0b) return;
      attachPositionMeta(
        sc,
        absolutePosition(strategicEventEpoch(sc), offset >>> 2),
        { region: areaRegion(sc) },
      );
      void dx;
    },
  };
}

function areaRegion(sc) {
  const bounds = sc?._disasterBounds ?? sc?.weatherCloudBounds;
  if (!bounds || typeof bounds !== "object" || Array.isArray(bounds))
    throw new RangeError("Uncovered native weather bounds");
  const word = (value, label) => {
    if (!Number.isInteger(value) || value < -0x8000 || value > 0xffff)
      throw new RangeError(`Uncovered native weather bound ${label}`);
    return value;
  };
  return {
    minX: word(bounds.minX, "minX"),
    maxX: word(bounds.maxX, "maxX"),
    minY: word(bounds.minY, "minY"),
    maxY: word(bounds.maxY, "maxY"),
  };
}

/** Named raw event-wheel adapter; null alone denotes four known zero bytes. */
export function consumeScenarioStrategicEvent(sc) {
  const eventAt = (offset) => {
    if (
      !Number.isInteger(offset) ||
      offset < 0 ||
      offset >= 0x100 ||
      offset % 4
    )
      missing(`slot address ${offset}`);
    const slots = own(sc, "strategicEventSlots");
    const index = offset >>> 2;
    if (!Array.isArray(slots) || !Object.hasOwn(slots, index))
      missing(`slot ${index}`);
    const event = slots[index];
    if (event !== null && (typeof event !== "object" || Array.isArray(event)))
      missing(`record ${index}`);
    return event;
  };
  const step = originalEventPump31AE({
    readEventDividerByte: () =>
      byte(own(sc, "_strategicEventDivider"), "divider"),
    writeEventDividerByte(value) {
      sc._strategicEventDivider = byte(value, "divider write");
    },
    readEventCursorWord() {
      const cursor = own(sc, "_strategicEventCursor");
      if (!Number.isInteger(cursor) || cursor < 0 || cursor > 0x3fff)
        missing("aligned D20 cursor");
      return cursor * 4;
    },
    writeEventCursorWord(value) {
      if (!Number.isInteger(value) || value < 0 || value > 0xffff || value % 4)
        missing("D20 cursor write");
      sc._strategicEventCursor = value >>> 2;
    },
    readEventWord(offset) {
      const base = offset & 0xfffc;
      const event = eventAt(base);
      if (event === null) return 0;
      if (offset % 4 === 0)
        return (
          byte(own(event, "type"), "event type") |
          (byte(own(event, "arg0"), "event arg0") << 8)
        );
      if (offset % 4 === 2)
        return (
          byte(own(event, "arg1"), "event arg1") |
          (byte(own(event, "arg2"), "event arg2") << 8)
        );
      missing("unaligned event word");
    },
  });
  if (step.status === "divider" || step.status === "page-end") return step;
  // D4: one position may hold carry entries (D3), the wheel record itself and
  // scheduled overflow records (D1/D2). The cursor advanced exactly once above;
  // the batch is frozen here and dispatched serially by the caller.
  const position = absolutePosition(
    strategicEventEpoch(sc),
    step.cursor >>> 2,
  );
  const carry = takeScheduledEntries(
    sc,
    position,
    STRATEGIC_EVENT_RANKS.carry,
  );
  const overflow = takeScheduledEntries(
    sc,
    position,
    STRATEGIC_EVENT_RANKS.overflow,
  );
  const meta = takePositionMeta(sc, position);
  const wheel =
    step.event.type === 0
      ? null
      : meta
        ? { ...step.event, ...meta }
        : step.event;
  const batch = [...carry, ...(wheel ? [wheel] : []), ...overflow];
  if (batch.length === 0)
    return { status: "empty", cursor: step.cursor, event: step.event };
  const [first, ...rest] = batch;
  return {
    status: "dispatch",
    cursor: step.cursor,
    event: first,
    rest,
    position,
  };
}
