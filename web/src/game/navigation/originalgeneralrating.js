// KI.EXE 55A6..55EB: refresh the stored G+1F rating for active G0..G126.
// The original specialty bytes are shifted right four times; the strict Web
// adapter supplies those already-normalized high nibbles and preserves all
// byte additions modulo 256.
export class OriginalGeneralRatingBoundaryError extends Error {
  constructor(at, detail) {
    super(`Uncovered original general rating boundary at ${at}: ${detail}`);
    this.name = "OriginalGeneralRatingBoundaryError";
    this.instruction = at;
  }
}
const stop = (at, detail) => {
  throw new OriginalGeneralRatingBoundaryError(at, detail);
};
const call = (io, method, args, at) => {
  if (typeof io?.[method] !== "function") stop(at, `missing ${method}`);
  return io[method](...args, at);
};
const integer = (value, min, max, at, label) => {
  if (!Number.isInteger(value) || value < min || value > max)
    stop(at, `${label} is out of range`);
  return value;
};
const byte = (value, at, label) => integer(value, 0, 0xff, at, label);
const nibble = (value, at, label) => integer(value, 0, 0x0f, at, label);

export function originalRefreshGeneralRatings55A6(io) {
  const writes = [];
  for (let slot = 0; slot < 0x7f; slot++) {
    const attr = byte(
      call(io, "readGeneralAttr", [slot], "55B2"),
      "55B2",
      "general attr",
    );
    if (attr < 0x80) continue;
    let rating = 0;
    for (const field of ["siege", "field", "naval"])
      rating =
        (rating +
          nibble(
            call(io, "readGeneralSpecialty", [slot, field], "55C1"),
            "55C1",
            field,
          )) &
        0xff;
    for (const field of ["force", "lead"])
      rating =
        (rating +
          ((byte(
            call(io, "readGeneralAbility", [slot, field], "55D3"),
            "55D3",
            field,
          ) <<
            1) &
            0xff)) &
        0xff;
    call(io, "writeGeneralRating", [slot, rating], "55DC");
    writes.push({ slot, rating });
  }
  return writes;
}
