// Strict KI.EXE 3E14..3EFC faction-state leaf after the separate 31AE pump.
export class OriginalFactionTickBoundaryError extends Error {
  constructor(at, detail) {
    super(`Uncovered original faction tick boundary at ${at}: ${detail}`);
    this.name = "OriginalFactionTickBoundaryError";
  }
}
const stop = (at, detail) => {
  throw new OriginalFactionTickBoundaryError(at, detail);
};
const call = (io, method, args, at) => {
  if (typeof io?.[method] !== "function") stop(at, `missing ${method}`);
  return io[method](...args, at);
};
const integer = (value, min, max, at, field) => {
  if (!Number.isInteger(value) || value < min || value > max)
    stop(at, `${field} is out of range`);
  return value;
};
const byte = (value, at, field) => integer(value, 0, 255, at, field);
const word = (value, at, field) => integer(value, 0, 65535, at, field);

/** 5673: add a 16-bit maintenance increment to the stored 24-bit accumulator. */
export function originalAddReserveExpense5673(stored, increment) {
  stored = integer(stored, 0, 0xffffff, "5675", "stored expense");
  increment = word(increment, "5675", "maintenance increment");
  const lowSum = (stored & 0xffff) + increment;
  let low = lowSum & 0xffff;
  let high = ((stored >>> 16) + (lowSum > 0xffff ? 1 : 0)) & 0xff;
  const signedHigh = (high << 24) >> 24;
  if (signedHigh > 9 || (signedHigh === 9 && low >= 0xfe98)) {
    high = 9;
    low = 0xfe98;
  }
  return (high << 16) | low;
}

/** 3E65: carry-aware sum of three u16 reserve pools, then logical /32. */
export function originalReserveExpenseIncrement3E65(cav, arc, inf) {
  cav = word(cav, "3E67", "cavalry reserve");
  arc = word(arc, "3E6A", "archer reserve");
  inf = word(inf, "3E70", "infantry reserve");
  return Math.floor((cav + arc + inf) / 32);
}

const improveRelation3ED4 = (raw) => {
  raw = byte(raw, "3ED4", "diplomacy byte");
  const low = raw & 0x7f;
  return (raw & 0x80) | (low < 100 ? low + 1 : low);
};

/** 3E14..3EFC, including the bounded 3E8E diplomat-maintenance leaf. */
export function originalFactionTick3E14(io) {
  const slot = integer(
    call(io, "readFactionCursor", [], "3E14"),
    0,
    21,
    "3E14",
    "faction cursor",
  );
  let attr = byte(
    call(io, "readFactionByte", [slot, "attr"], "3E1D"),
    "3E1D",
    "attr",
  );
  if (attr >= 0x80) {
    attr &= 0xbf;
    call(io, "writeFactionByte", [slot, "attr", attr], "3E22");
    const cities = byte(
      call(io, "readFactionByte", [slot, "n_cities"], "3E25"),
      "3E25",
      "n_cities",
    );
    const threshold = (cities * 8 + 24) & 0xffff;
    const fundsQ256 = integer(
      call(io, "readFactionMoneyQ256Signed", [slot], "3E33"),
      -0x8000,
      0x7fff,
      "3E33",
      "signed money/256",
    );
    if ((threshold << 16) >> 16 >= fundsQ256) {
      call(io, "writeFactionByte", [slot, "target_faction", 0xff], "3E38");
      if (threshold >>> 1 >= fundsQ256) {
        attr |= 0x40;
        call(io, "writeFactionByte", [slot, "attr", attr], "3E43");
      }
    }
  }
  const cav = word(
    call(io, "readFactionWord", [slot, "reserve_cav"], "3E67"),
    "3E67",
    "reserve_cav",
  );
  const arc = word(
    call(io, "readFactionWord", [slot, "reserve_arc"], "3E6A"),
    "3E6A",
    "reserve_arc",
  );
  const inf = word(
    call(io, "readFactionWord", [slot, "reserve_inf"], "3E70"),
    "3E70",
    "reserve_inf",
  );
  const increment = originalReserveExpenseIncrement3E65(cav, arc, inf);
  const stored = integer(
    call(io, "readFactionExpense24", [slot], "5675"),
    0,
    0xffffff,
    "5675",
    "monthly reserve upkeep",
  );
  call(
    io,
    "writeFactionExpense24",
    [slot, originalAddReserveExpense5673(stored, increment)],
    "568C",
  );
  const diplomat = byte(
    call(io, "readFactionByte", [slot, "diplomat_idx"], "3E8E"),
    "3E8E",
    "diplomat_idx",
  );
  if (diplomat !== 0xff) {
    const gate = byte(
      call(io, "nextRandomByte", [], "3E96"),
      "3E96",
      "maintenance gate RNG",
    );
    if (gate < 0x20) {
      const budget = byte(
        call(io, "readGeneralByte", [diplomat, "assignment_budget"], "3EA5"),
        "3EA5",
        "assignment budget",
      );
      if (budget !== 0) {
        const politics = byte(
          call(io, "readGeneralByte", [diplomat, "politics"], "3EAC"),
          "3EAC",
          "politics",
        );
        const cost = (0x17 - politics) & 0xff;
        call(
          io,
          "writeGeneralByte",
          [diplomat, "assignment_budget", budget >= cost ? budget - cost : 0],
          "3EB4",
        );
        const relationGate =
          byte(call(io, "nextRandomByte", [], "3EBF"), "3EBF", "relation RNG") &
          0x0f;
        if (relationGate <= politics) {
          const player = byte(
            call(io, "readPlayerFactionSlot", [], "3ECA"),
            "3ECA",
            "player faction pointer",
          );
          const residentToPlayer = byte(
            call(io, "readDiplomacyByte", [slot, player], "3ED4"),
            "3ED4",
            "resident-to-player diplomacy",
          );
          const playerToResident = byte(
            call(io, "readDiplomacyByte", [player, slot], "3ED6"),
            "3ED6",
            "player-to-resident diplomacy",
          );
          const improvedResident = improveRelation3ED4(residentToPlayer);
          call(
            io,
            "writeDiplomacyByte",
            [slot, player, improvedResident],
            "3EE5",
          );
          if (improvedResident > playerToResident)
            call(
              io,
              "writeDiplomacyByte",
              [player, slot, improveRelation3ED4(playerToResident)],
              "3EFA",
            );
        }
      }
    }
  }
  const next = slot === 21 ? 0 : slot + 1;
  call(io, "writeFactionCursor", [next], "3E5B");
  if (typeof io.markFactionDisplayDirty === "function")
    io.markFactionDisplayDirty(4, "3E61");
  return { slot, next, increment };
}
