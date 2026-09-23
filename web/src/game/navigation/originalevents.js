// Strict KI.EXE 31AE event-divider and current-page consumer prefix.
export class OriginalEventBoundaryError extends Error {
  constructor(at, detail) {
    super(`Uncovered original event boundary at ${at}: ${detail}`);
    this.name = "OriginalEventBoundaryError";
  }
}
const stop = (at, detail) => {
  throw new OriginalEventBoundaryError(at, detail);
};
const call = (io, method, args, at) => {
  if (typeof io?.[method] !== "function") stop(at, `missing ${method}`);
  return io[method](...args, at);
};
const unsigned = (value, max, at, label) => {
  if (!Number.isInteger(value) || value < 0 || value > max)
    stop(at, `${label} is out of range`);
  return value;
};

/** 31AE: DEC divider; when zero, consume one raw 4-byte slot before dispatch. */
export function originalEventPump31AE(io) {
  const divider = unsigned(
    call(io, "readEventDividerByte", [], "31AE"),
    0xff,
    "31AE",
    "event divider",
  );
  const nextDivider = (divider - 1) & 0xff;
  call(io, "writeEventDividerByte", [nextDivider], "31AE");
  if (nextDivider !== 0) return { status: "divider", divider: nextDivider };

  const cursor = unsigned(
    call(io, "readEventCursorWord", [], "31B5"),
    0xffff,
    "31B5",
    "D20 cursor word",
  );
  if (cursor >= 0x100) return { status: "page-end", cursor };
  call(io, "writeEventDividerByte", [10], "31BE");
  const first = unsigned(
    call(io, "readEventWord", [cursor], "31CB"),
    0xffff,
    "31CB",
    "event first word",
  );
  const second = unsigned(
    call(io, "readEventWord", [cursor + 2], "31CE"),
    0xffff,
    "31CE",
    "event second word",
  );
  call(io, "writeEventCursorWord", [(cursor + 4) & 0xffff], "31D5");
  const event = {
    type: first & 0xff,
    arg0: first >>> 8,
    arg1: second & 0xff,
    arg2: second >>> 8,
  };
  return event.type === 0
    ? { status: "empty", cursor, event }
    : { status: "dispatch", cursor, event };
}

/** 3496..34A5: generic NPC TALK, one stacked FF00|arg0 substitution word. */
export function originalGenericTalk3496(event) {
  const type = unsigned(event?.type, 0xff, "3496", "event type");
  if (type !== 10) stop("3496", `expected type 10, got ${type}`);
  const arg0 = unsigned(event?.arg0, 0xff, "3496", "event arg0");
  const talkIndex =
    unsigned(event?.arg1, 0xff, "3496", "event arg1") |
    (unsigned(event?.arg2, 0xff, "3496", "event arg2") << 8);
  return { arg0, argumentWord: 0xff00 | arg0, talkIndex };
}
