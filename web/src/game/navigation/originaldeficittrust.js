// Strict KI.EXE 3507..3519 and 3DC9..3E10 type-13 consumer.
// The two TALK returns are explicit phases; writes before a later failure persist.
export class OriginalDeficitTrustBoundaryError extends Error {
  constructor(at, detail) {
    super(`Uncovered original deficit-trust boundary at ${at}: ${detail}`);
    this.name = "OriginalDeficitTrustBoundaryError";
    this.instruction = at;
  }
}
const stop = (at, detail) => {
  throw new OriginalDeficitTrustBoundaryError(at, detail);
};
const call = (io, method, args, at) => {
  if (typeof io?.[method] !== "function") stop(at, `missing ${method}`);
  return io[method](...args, at);
};
const byte = (value, at, label) => {
  if (!Number.isInteger(value) || value < 0 || value > 0xff)
    stop(at, `${label} is not u8`);
  return value;
};
const word = (value, at, label) => {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff)
    stop(at, `${label} is not u16`);
  return value;
};

/** 3507..350F: generic NPC TALK51, with DX preserved for the next phase. */
export function originalBeginDeficitTrust3507(event) {
  const arg0 = byte(event?.arg0, "3507", "event arg0");
  const selector =
    byte(event?.arg1, "3507", "event arg1") |
    (byte(event?.arg2, "3507", "event arg2") << 8);
  return { phase: "notice", talkIndex: 51, arg0, selector };
}

/** 3512→3DC9 after TALK51: subtract 50, then prepare the ruler rebuke. */
export function originalContinueDeficitTrust3DC9(io, state) {
  if (state?.phase !== "notice") stop("3DC9", "invalid notice continuation");
  const before = byte(
    call(io, "readTrustByte", [], "3DD2"),
    "3DD2",
    "D00 trust",
  );
  const borrowed = before < 50;
  const after = borrowed ? 0 : before - 50;
  call(io, "writeTrustByte", [after], "3DD2");
  const selector = borrowed
    ? 0x019e
    : word(state.selector, "3DE2", "event selector");
  if (selector === 0xffff) {
    call(io, "refreshStrategicDisplay", [2], "3E09");
    return { phase: "return", before, after, selector, gameOver: false };
  }
  const identity = call(io, "readPlayerMonarchIdentity", [], "87FF");
  const generalIndex = byte(identity?.generalIndex, "3DB4", "monarch index");
  const portrait = byte(identity?.portrait, "3DB8", "monarch portrait");
  const personality = byte(
    identity?.personality,
    "3DB4",
    "monarch personality",
  );
  return {
    phase: "rebuke",
    before,
    after,
    selector,
    generalIndex,
    portrait,
    personality,
  };
}

/** 3DFA..3E10 after the ruler TALK: only now can trust-zero enter 1CB1. */
export function originalFinishDeficitTrust3DFA(io, state) {
  if (state?.phase !== "rebuke") stop("3DFA", "invalid rebuke continuation");
  const trust = byte(
    call(io, "readTrustByte", [], "3DFA"),
    "3DFA",
    "D00 trust",
  );
  call(io, "refreshStrategicDisplay", [2], "3E09");
  return { phase: "return", trust, gameOver: trust === 0 };
}
