// Strict KI.EXE 53A6..53BD monthly policy copy and 5E80 display boundary.
// Evidence: fixed KI bytes and docs/re-notes-ai-fiscal.md §14.
export class OriginalMonthlyPolicyBoundaryError extends Error {
  constructor(at, detail) {
    super(`Uncovered original monthly policy boundary at ${at}: ${detail}`);
    this.name = "OriginalMonthlyPolicyBoundaryError";
    this.instruction = at;
  }
}
const stop = (at, detail) => {
  throw new OriginalMonthlyPolicyBoundaryError(at, detail);
};
const call = (io, method, args, at) => {
  if (typeof io?.[method] !== "function") stop(at, `missing ${method}`);
  return io[method](...args, at);
};
const word = (value, at, label) => {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff)
    stop(at, `${label} is not u16`);
  return value;
};

/** 53A6: copy four words D10..D17 forward to D08..D0F, then 5E80(AL=0E). */
export function originalActivateMonthlyPolicy53A6(io) {
  for (let index = 0; index < 4; index++) {
    const value = word(
      call(io, "readPolicyWord", [8 + index * 2], "53AF"),
      "53AF",
      `D${(0x10 + index * 2).toString(16)} word`,
    );
    call(io, "writePolicyWord", [index * 2, value], "53B2");
  }
  call(io, "refreshStrategicDisplay", [0x0e], "53BD");
  return { displayMask: 0x0e };
}
