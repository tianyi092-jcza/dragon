import {
  originalEventPump31AE,
  originalGenericTalk3496,
} from "./originalevents.js";

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
  return originalEventPump31AE({
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
}
